import { load, type Store } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type Priority = 'none' | 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  text: string;
  done: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  groupId?: string;
  priority?: Priority;
}

export interface TaskData {
  version: string;
  tasks: Task[];
  groupOrder?: string[];
  groupTitles?: Record<string, string>;
}

export type ThemeId = 'neon' | 'mono' | 'cyber' | 'matrix';

export interface SettingsData {
  brainsMdPath: string | null;
  activeTaskId?: string | null;
  collapsedGroupIds?: string[];
  theme?: ThemeId;
  debugMode?: boolean;
}

export interface TaskGroup {
  id: string;
  title: string;
}

const DATA_VERSION = '1.0.0';
const STORE_PATH = 'tasks.json';
const DEFAULT_GROUP_ID = '';
const DEFAULT_GROUP_TITLE = 'Задачи';
const DEBOUNCE_MS = 300;
const VALID_THEMES: ThemeId[] = ['neon', 'mono', 'cyber', 'matrix'];

const CHECKLIST_LINE = /^\s*-\s+\[([ x])\]\s*(.*)$/;
// Заголовки #, ## или ### в начале строки (как в Obsidian и обычном Markdown)
const GROUP_HEADER = /^\s*#{1,3}\s*(.+)$/;

function toSlug(s: string): string {
  const t = s.trim();
  if (!t) return DEFAULT_GROUP_ID;
  return t
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .toLowerCase() || DEFAULT_GROUP_ID;
}

/** Simple hash for generating stable task IDs from content */
function stableId(text: string, groupId: string, index: number): string {
  let hash = 0;
  const str = `${groupId}::${text}`;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  // Add index to disambiguate identical tasks in the same group
  return `md-${(hash >>> 0).toString(36)}-${index}`;
}

/**
 * Represents a line in the original MD file.
 * We preserve ALL lines to avoid data loss.
 */
interface MdLine {
  type: 'task' | 'header' | 'other';
  raw: string;
  taskIndex?: number; // index into parsed tasks array
  groupId?: string;
}

function parseMd(
  content: string
): { tasks: Task[]; groupOrder: string[]; groupTitles: Record<string, string>; lines: MdLine[] } {
  const now = new Date().toISOString();
  const normalized = content.replace(/^\uFEFF/, ''); // BOM
  const rawLines = normalized.split(/\r?\n/);
  const tasks: Task[] = [];
  const groupOrder: string[] = [DEFAULT_GROUP_ID];
  const groupTitles: Record<string, string> = { [DEFAULT_GROUP_ID]: DEFAULT_GROUP_TITLE };
  const lines: MdLine[] = [];
  let currentGroupId = DEFAULT_GROUP_ID;
  let order = 0;

  rawLines.forEach((line) => {
    const groupMatch = line.match(GROUP_HEADER);
    if (groupMatch) {
      const title = groupMatch[1].trim();
      if (!title) {
        lines.push({ type: 'other', raw: line });
        return;
      }
      const id = toSlug(title) || DEFAULT_GROUP_ID;
      currentGroupId = id;
      if (!groupOrder.includes(id)) groupOrder.push(id);
      groupTitles[id] = title;
      lines.push({ type: 'header', raw: line, groupId: id });
      return;
    }
    const m = line.match(CHECKLIST_LINE);
    if (m) {
      const done = m[1].toLowerCase() === 'x';
      const text = m[2].trim() || '(без текста)';
      const taskId = stableId(text, currentGroupId, order);
      tasks.push({
        id: taskId,
        text,
        done,
        order: order,
        createdAt: now,
        updatedAt: now,
        groupId: currentGroupId,
      });
      lines.push({ type: 'task', raw: line, taskIndex: order, groupId: currentGroupId });
      order++;
    } else {
      lines.push({ type: 'other', raw: line });
    }
  });

  return { tasks, groupOrder, groupTitles, lines };
}

/**
 * Serialize tasks back to MD, preserving non-checklist content.
 * If we have the original lines structure, we update in-place.
 * Otherwise, we generate a clean output.
 */
function serializeMdWithContext(
  tasks: Task[],
  groupOrder: string[],
  groupTitles: Record<string, string>,
  originalLines: MdLine[] | null
): string {
  if (originalLines && originalLines.length > 0) {
    // Reconstruct from original structure, updating only task lines
    const tasksByOrigIndex = new Map<number, Task>();
    // Build a map of original task indices to current task states
    let taskIdx = 0;
    for (const line of originalLines) {
      if (line.type === 'task' && line.taskIndex !== undefined) {
        // Find the matching task by order (taskIndex corresponds to parse order)
        const t = tasks.find((t) => t.order === line.taskIndex);
        if (t) {
          tasksByOrigIndex.set(line.taskIndex, t);
        }
        taskIdx++;
      }
    }

    const result: string[] = [];
    for (const line of originalLines) {
      if (line.type === 'task' && line.taskIndex !== undefined) {
        const t = tasksByOrigIndex.get(line.taskIndex);
        if (t) {
          result.push(`- [${t.done ? 'x' : ' '}] ${t.text}`);
        }
        // If task was deleted, skip the line
      } else {
        result.push(line.raw);
      }
    }

    // Append any newly added tasks (tasks without an original taskIndex match)
    const existingOrders = new Set(
      originalLines.filter((l) => l.type === 'task').map((l) => l.taskIndex)
    );
    const newTasks = tasks.filter((t) => !existingOrders.has(t.order));
    if (newTasks.length > 0) {
      // Group new tasks by groupId
      for (const gid of groupOrder) {
        const gTasks = newTasks.filter((t) => (t.groupId ?? DEFAULT_GROUP_ID) === gid);
        for (const t of gTasks) {
          result.push(`- [${t.done ? 'x' : ' '}] ${t.text}`);
        }
      }
    }

    return result.join('\n');
  }

  // Fallback: generate clean output (store mode or no original lines)
  const out: string[] = [];
  for (const gid of groupOrder) {
    const groupTasks = tasks.filter((t) => (t.groupId ?? DEFAULT_GROUP_ID) === gid);
    if (groupTasks.length === 0) continue;
    const title = groupTitles[gid] ?? gid;
    if (gid !== DEFAULT_GROUP_ID) out.push(`## ${title}`);
    for (const t of groupTasks) {
      out.push(`- [${t.done ? 'x' : ' '}] ${t.text}`);
    }
    out.push('');
  }
  return out.join('\n');
}

class TaskStore {
  private store: Store | null = null;
  private tasks: Task[] = [];
  private listeners: Set<() => void> = new Set();
  private taskSource: 'store' | 'md' = 'store';
  private mdPath: string | null = null;
  private groupOrder: string[] = [DEFAULT_GROUP_ID];
  private groupTitles: Record<string, string> = { [DEFAULT_GROUP_ID]: DEFAULT_GROUP_TITLE };
  private activeTaskId: string | null = null;
  private collapsedGroupIds: Set<string> = new Set();
  private theme: ThemeId = 'neon';
  private debugMode = false;

  // Cached arrays to avoid unnecessary re-renders
  private cachedTasks: Task[] = [];
  private cachedGroups: TaskGroup[] = [];
  private cacheValid = false;

  // Debounce timer for persist
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPersist = false;

  // Original MD lines for preserving non-checklist content
  private originalMdLines: MdLine[] | null = null;

  // File watcher unlisten
  private fileWatcherUnlisten: (() => void) | null = null;

  async init() {
    try {
      this.store = await load(STORE_PATH, { autoSave: false });
      await this.loadSettings();
      await this.load();
      if (this.mdPath) {
        try {
          await this.loadFromMd(this.mdPath);
        } catch (e) {
          console.error('Failed to load tasks from MD:', e);
        }
      }
    } catch (error) {
      console.error('Failed to initialize store:', error);
      this.tasks = [];
    }
  }

  private async loadSettings(): Promise<void> {
    if (!this.store) return;
    try {
      const settings = await this.store.get<SettingsData>('settings');
      if (settings && typeof settings.brainsMdPath === 'string') {
        this.mdPath = settings.brainsMdPath;
        this.taskSource = 'md';
      } else if (settings && settings.brainsMdPath === null) {
        this.mdPath = null;
        this.taskSource = 'store';
      }
      if (settings && 'activeTaskId' in settings) {
        this.activeTaskId = settings.activeTaskId ?? null;
      }
      if (settings && Array.isArray(settings.collapsedGroupIds)) {
        this.collapsedGroupIds = new Set(settings.collapsedGroupIds);
      }
      if (settings?.theme && VALID_THEMES.includes(settings.theme)) {
        this.theme = settings.theme;
      }
      if (settings && typeof settings.debugMode === 'boolean') {
        this.debugMode = settings.debugMode;
      }
    } catch {
      this.mdPath = null;
      this.taskSource = 'store';
    }
  }

  private async saveSettings(): Promise<void> {
    if (!this.store) return;
    try {
      const settings: SettingsData = {
        brainsMdPath: this.mdPath,
        activeTaskId: this.activeTaskId,
        collapsedGroupIds: [...this.collapsedGroupIds],
        theme: this.theme,
        debugMode: this.debugMode,
      };
      await this.store.set('settings', settings);
      await this.store.save();
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  async load(): Promise<void> {
    if (!this.store) return;
    if (this.taskSource === 'md') return;

    try {
      const data = await this.store.get<TaskData>('data');
      if (data && data.version === DATA_VERSION && Array.isArray(data.tasks)) {
        this.tasks = data.tasks;
        if (Array.isArray(data.groupOrder)) this.groupOrder = data.groupOrder;
        if (data.groupTitles && typeof data.groupTitles === 'object') this.groupTitles = { ...this.groupTitles, ...data.groupTitles };
      } else {
        this.tasks = [];
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
      this.tasks = [];
    }
    this.invalidateCache();
    this.notify();
  }

  async save(): Promise<void> {
    if (!this.store || this.taskSource === 'md') return;
    try {
      const data: TaskData = {
        version: DATA_VERSION,
        tasks: this.tasks,
        groupOrder: this.groupOrder,
        groupTitles: this.groupTitles,
      };
      await this.store.set('data', data);
      await this.store.save();
    } catch (error) {
      console.error('Failed to save tasks:', error);
      throw error;
    }
  }

  getMdPath(): string | null {
    return this.mdPath;
  }

  getTaskSource(): 'store' | 'md' {
    return this.taskSource;
  }

  async setMdPath(path: string | null): Promise<void> {
    this.mdPath = path;
    this.taskSource = path ? 'md' : 'store';
    await this.saveSettings();
    if (path) {
      try {
        await this.loadFromMd(path);
        await this.startWatching(path);
      } catch (e) {
        console.error('Failed to load from MD:', e);
        this.tasks = [];
        this.invalidateCache();
        this.notify();
        throw e;
      }
    } else {
      await this.stopWatching();
      this.originalMdLines = null;
      await this.load();
    }
    this.invalidateCache();
    this.notify();
  }

  private async startWatching(path: string): Promise<void> {
    await this.stopWatching();
    try {
      await invoke('watch_md_file', { path });
      const unlisten = await listen<string>('md-file-changed', async () => {
        // Debounce file change events (editors may fire multiple)
        if (this.mdPath) {
          try {
            await this.loadFromMd(this.mdPath);
          } catch (e) {
            console.error('Auto-reload from MD failed:', e);
          }
        }
      });
      this.fileWatcherUnlisten = unlisten;
    } catch (e) {
      console.error('Failed to start file watcher:', e);
    }
  }

  private async stopWatching(): Promise<void> {
    if (this.fileWatcherUnlisten) {
      this.fileWatcherUnlisten();
      this.fileWatcherUnlisten = null;
    }
    try {
      await invoke('unwatch_md_file');
    } catch {
      // Ignore errors when stopping
    }
  }

  async loadFromMd(path: string): Promise<void> {
    const content = await invoke<string>('read_md_tasks', { path });
    const parsed = parseMd(content);

    // Try to preserve activeTaskId by matching text
    const oldActiveTask = this.activeTaskId
      ? this.tasks.find((t) => t.id === this.activeTaskId)
      : null;

    this.tasks = parsed.tasks;
    this.groupOrder = parsed.groupOrder;
    this.groupTitles = { ...parsed.groupTitles };
    this.originalMdLines = parsed.lines;
    this.taskSource = 'md';
    this.mdPath = path;

    // Re-bind activeTaskId by text content if the old ID no longer exists
    if (oldActiveTask && !this.tasks.find((t) => t.id === this.activeTaskId)) {
      const match = this.tasks.find(
        (t) => t.text === oldActiveTask.text && (t.groupId ?? '') === (oldActiveTask.groupId ?? '')
      );
      if (match) {
        this.activeTaskId = match.id;
        await this.saveSettings();
      }
    }

    this.invalidateCache();
    this.notify();
  }

  async saveToMd(): Promise<void> {
    if (this.taskSource !== 'md' || !this.mdPath) return;
    const content = serializeMdWithContext(
      this.tasks,
      this.groupOrder,
      this.groupTitles,
      this.originalMdLines
    );
    await invoke('write_md_tasks', { path: this.mdPath, content });
  }

  async reloadFromMd(): Promise<void> {
    if (this.mdPath) await this.loadFromMd(this.mdPath);
  }

  getTasks(): Task[] {
    if (!this.cacheValid) {
      this.cachedTasks = [...this.tasks];
      this.rebuildGroupCache();
      this.cacheValid = true;
    }
    return this.cachedTasks;
  }

  getGroups(): TaskGroup[] {
    if (!this.cacheValid) {
      this.cachedTasks = [...this.tasks];
      this.rebuildGroupCache();
      this.cacheValid = true;
    }
    return this.cachedGroups;
  }

  private rebuildGroupCache(): void {
    // Merge stored groupOrder with any groups derived from tasks
    const derived = this.deriveGroupOrder();
    const seen = new Set<string>(this.groupOrder);
    let order = [...this.groupOrder];
    for (const id of derived) {
      if (!seen.has(id)) {
        seen.add(id);
        order.push(id);
      }
    }
    if (this.taskSource !== 'md' && order.length > 1 && order[0] !== DEFAULT_GROUP_ID) {
      order = [DEFAULT_GROUP_ID, ...order.filter((id) => id !== DEFAULT_GROUP_ID)];
    }
    this.cachedGroups = order.map((id) => ({
      id,
      title: this.groupTitles[id] ?? (id || DEFAULT_GROUP_TITLE),
    }));
  }

  private invalidateCache(): void {
    this.cacheValid = false;
  }

  private deriveGroupOrder(): string[] {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const t of this.tasks) {
      const gid = t.groupId ?? DEFAULT_GROUP_ID;
      if (!seen.has(gid)) {
        seen.add(gid);
        order.push(gid);
      }
    }
    if (order.length === 0) order.push(DEFAULT_GROUP_ID);
    return order;
  }

  getActiveTaskId(): string | null {
    return this.activeTaskId;
  }

  async setActiveTaskId(id: string | null): Promise<void> {
    this.activeTaskId = id;
    await this.saveSettings();
    this.invalidateCache();
    this.notify();
  }

  getCollapsedGroupIds(): Set<string> {
    return new Set(this.collapsedGroupIds);
  }

  async toggleGroupCollapsed(groupId: string): Promise<void> {
    if (this.collapsedGroupIds.has(groupId)) {
      this.collapsedGroupIds.delete(groupId);
    } else {
      this.collapsedGroupIds.add(groupId);
    }
    await this.saveSettings();
    this.notify();
  }

  getTheme(): ThemeId {
    return this.theme;
  }

  async setTheme(theme: ThemeId): Promise<void> {
    this.theme = theme;
    await this.saveSettings();
    this.notify();
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }

  async setDebugMode(value: boolean): Promise<void> {
    this.debugMode = value;
    await this.saveSettings();
    this.notify();
  }

  async addGroup(title: string): Promise<string> {
    const t = title.trim();
    if (!t) return DEFAULT_GROUP_ID;
    const id = toSlug(t) || `group-${Date.now()}`;
    if (this.groupOrder.includes(id)) return id;
    this.groupOrder.push(id);
    this.groupTitles[id] = t;
    await this.persistDebounced();
    this.invalidateCache();
    this.notify();
    return id;
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    // Only delete empty groups
    const hasTasks = this.tasks.some((t) => (t.groupId ?? DEFAULT_GROUP_ID) === groupId);
    if (hasTasks || !groupId) return false;
    this.groupOrder = this.groupOrder.filter((id) => id !== groupId);
    delete this.groupTitles[groupId];
    await this.persistDebounced();
    this.invalidateCache();
    this.notify();
    return true;
  }

  async renameGroup(groupId: string, newTitle: string): Promise<void> {
    const t = newTitle.trim();
    if (!t || !groupId) return;
    this.groupTitles[groupId] = t;
    await this.persistDebounced();
    this.invalidateCache();
    this.notify();
  }

  async setGroupEmoji(groupId: string, emoji: string): Promise<void> {
    const title = this.groupTitles[groupId] ?? (groupId || DEFAULT_GROUP_TITLE);
    // Strip existing leading emoji (if any)
    const stripped = title.replace(/^\p{Emoji_Presentation}\s*/u, '');
    this.groupTitles[groupId] = emoji ? `${emoji} ${stripped}` : stripped;
    await this.persistDebounced();
    this.invalidateCache();
    this.notify();
  }

  async moveTaskToGroup(taskId: string, groupId: string): Promise<void> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.groupId = groupId || DEFAULT_GROUP_ID;
      task.updatedAt = new Date().toISOString();
      if (!this.groupOrder.includes(task.groupId)) {
        this.groupOrder.push(task.groupId);
        this.groupTitles[task.groupId] = task.groupId;
      }
      await this.persistDebounced();
      this.invalidateCache();
      this.notify();
    }
  }

  private async persist(): Promise<void> {
    if (this.taskSource === 'md') {
      await this.saveToMd();
    } else {
      await this.save();
    }
  }

  /** Debounced persist: immediate UI update, delayed disk write */
  private async persistDebounced(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.pendingPersist = true;
    this.persistTimer = setTimeout(async () => {
      this.persistTimer = null;
      if (this.pendingPersist) {
        this.pendingPersist = false;
        try {
          await this.persist();
        } catch (e) {
          console.error('Debounced persist failed:', e);
        }
      }
    }, DEBOUNCE_MS);
  }

  /** Flush any pending debounced persist immediately */
  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.pendingPersist) {
      this.pendingPersist = false;
      await this.persist();
    }
  }

  async addTask(text: string): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      text: text.trim(),
      done: false,
      order: this.tasks.length,
      createdAt: now,
      updatedAt: now,
      priority: 'none',
    };
    this.tasks.push(task);
    await this.persistDebounced();
    this.invalidateCache();
    this.notify();
    return task;
  }

  async setPriority(id: string, priority: Priority): Promise<void> {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.priority = priority;
      task.updatedAt = new Date().toISOString();
      await this.persistDebounced();
      this.invalidateCache();
      this.notify();
    }
  }

  async reorderTask(taskId: string, targetGroupId: string, targetIndex: number): Promise<void> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    // Remove from old position
    this.tasks = this.tasks.filter((t) => t.id !== taskId);
    // Set new group
    task.groupId = targetGroupId || '';
    task.updatedAt = new Date().toISOString();
    // Get tasks in target group to find insert position
    const groupTasks = this.tasks.filter((t) => (t.groupId ?? '') === (targetGroupId || ''));
    if (targetIndex >= groupTasks.length) {
      // Insert after last task in group
      const lastTask = groupTasks[groupTasks.length - 1];
      const insertIdx = lastTask ? this.tasks.indexOf(lastTask) + 1 : this.tasks.length;
      this.tasks.splice(insertIdx, 0, task);
    } else {
      // Insert before targetIndex-th task in group
      const refTask = groupTasks[targetIndex];
      const insertIdx = refTask ? this.tasks.indexOf(refTask) : this.tasks.length;
      this.tasks.splice(insertIdx, 0, task);
    }
    // Recalculate order
    this.tasks.forEach((t, i) => { t.order = i; });
    // Add group if new
    if (!this.groupOrder.includes(targetGroupId || '')) {
      this.groupOrder.push(targetGroupId || '');
    }
    await this.persistDebounced();
    this.invalidateCache();
    this.notify();
  }

  async toggleTask(id: string): Promise<void> {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.done = !task.done;
      task.updatedAt = new Date().toISOString();
      await this.persistDebounced();
      this.invalidateCache();
      this.notify();
    }
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.tasks.forEach((task, index) => {
      task.order = index;
    });
    if (this.activeTaskId === id) {
      this.activeTaskId = null;
    }
    await this.persistDebounced();
    this.invalidateCache();
    this.notify();
  }

  async updateTask(id: string, text: string): Promise<void> {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.text = text.trim();
      task.updatedAt = new Date().toISOString();
      await this.persistDebounced();
      this.invalidateCache();
      this.notify();
    }
  }

  async toggleAll(checked: boolean): Promise<void> {
    this.tasks.forEach((task) => {
      task.done = checked;
      task.updatedAt = new Date().toISOString();
    });
    await this.persistDebounced();
    this.invalidateCache();
    this.notify();
  }

  getTriState(): 'checked' | 'unchecked' | 'mixed' {
    if (this.tasks.length === 0) return 'unchecked';
    const doneCount = this.tasks.filter((t) => t.done).length;
    if (doneCount === 0) return 'unchecked';
    if (doneCount === this.tasks.length) return 'checked';
    return 'mixed';
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    this.listeners.forEach((callback) => callback());
  }
}

export const taskStore = new TaskStore();
