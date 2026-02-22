<script lang="ts">
  import { onMount, tick } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { PhysicalSize, LogicalSize } from "@tauri-apps/api/dpi";
  import TaskItem from "./TaskItem.svelte";
  import { taskStore, type Task, type TaskGroup } from "./store";
  import { getGroupIconUrl } from "./groupIcons";
  import * as debug from "./debug";

  const FALLBACK_GROUP_ICONS = ["Day/adjustments.ico"];

  interface Props {
    compact?: boolean;
  }

  let { compact = false }: Props = $props();
  let tasks = $state<Task[]>([]);
  let groups = $state<TaskGroup[]>([]);
  let collapsedIds = $state<Set<string>>(new Set());
  let activeTaskId = $state<string | null>(null);
  let isKanban = $state(false);
  let showAddGroup = $state(false);
  let newGroupName = $state("");
  let addGroupInputEl = $state<HTMLInputElement | null>(null);
  let focusedIndex = $state(-1);
  let editingGroupId = $state<string | null>(null);
  let editGroupTitle = $state("");
  let showIconPicker = $state<string | null>(null);
  let draggingGroupId = $state<string | null>(null);
  let dropGroupIndex = $state<number>(-1);
  let deleteConfirm = $state<{ taskId: string; text: string } | null>(null);

  function requestDeleteTask(task: Task) {
    deleteConfirm = { taskId: task.id, text: task.text };
  }

  async function confirmDeleteTask() {
    if (!deleteConfirm) return;
    await taskStore.deleteTask(deleteConfirm.taskId);
    deleteConfirm = null;
  }

  /** Список иконок из public/ico (генерируется в manifest.json при старте Vite) */
  let groupIconsList = $state<string[]>([]);

  /** В пикере иконок: открытая папка (null = показ папок) */
  let iconPickerExpandedFolder = $state<string | null>(null);

  /** Группировка иконок по папке: { "Day": ["Day/a.ico", ...], "": ["root.ico"] } */
  let groupIconsByFolder = $derived.by(() => {
    const list = groupIconsList.length ? groupIconsList : FALLBACK_GROUP_ICONS;
    const byFolder: Record<string, string[]> = {};
    for (const path of list) {
      const i = path.indexOf("/");
      const folder = i >= 0 ? path.slice(0, i) : "";
      if (!byFolder[folder]) byFolder[folder] = [];
      byFolder[folder].push(path);
    }
    return byFolder;
  });

  let savedListSize: { width: number; height: number } | null = null;

  async function toggleKanban() {
    const nextKanban = !isKanban;
    debug.log("[kanban] toggleKanban", { from: isKanban, to: nextKanban });
    isKanban = nextKanban;
    try {
      const win = getCurrentWindow();
      const dpr = window.devicePixelRatio || 1;
      if (nextKanban) {
        const cur = await win.innerSize();
        savedListSize = { width: cur.width, height: cur.height };
        debug.log("[kanban] switching to kanban", { savedSize: savedListSize });
        await win.setMinSize(new LogicalSize(600, 400));
        await win.setSize(
          new PhysicalSize(Math.ceil(1200 * dpr), Math.ceil(700 * dpr)),
        );
        debug.log("[kanban] setSize done (1200x700 logical)");
      } else {
        debug.log("[kanban] switching to list", { savedListSize });
        await win.setMinSize(new LogicalSize(380, 400));
        if (savedListSize) {
          await win.setSize(
            new PhysicalSize(savedListSize.width, savedListSize.height),
          );
          savedListSize = null;
        } else {
          await win.setSize(
            new PhysicalSize(Math.ceil(480 * dpr), Math.ceil(600 * dpr)),
          );
        }
        debug.log("[kanban] setSize done (list)");
      }
    } catch (e) {
      debug.error("[kanban] resize failed, reverting", e);
      isKanban = !nextKanban;
      console.error("Kanban toggle resize failed:", e);
    }
  }

  function startEditGroup(groupId: string, currentTitle: string) {
    editingGroupId = groupId;
    editGroupTitle = currentTitle;
    showEmojiPicker = null;
    showIconPicker = null;
  }

  function getGroupIconFromTitle(title: string): string {
    if (!title?.length) return "•";
    const leading = title.match(/^[^\p{L}\p{N}]+/u)?.[0]?.trim();
    if (leading) return leading;
    return [...title][0] ?? "•";
  }

  function getGroupTitleWithoutEmoji(title: string): string {
    if (!title?.length) return "";
    return title.replace(/^[^\p{L}\p{N}]+/u, "").trim() || title;
  }

  async function handleIconPick(groupId: string, icon: string) {
    await taskStore.setGroupIcon(groupId, icon);
    showIconPicker = null;
  }

  async function saveEditGroup() {
    if (editingGroupId && editGroupTitle.trim()) {
      await taskStore.renameGroup(editingGroupId, editGroupTitle.trim());
    }
    editingGroupId = null;
    editGroupTitle = "";
  }

  async function handleDeleteGroup(groupId: string) {
    await taskStore.deleteGroup(groupId);
  }

  // Compute activeTask only once via $derived
  let currentActiveTask = $derived<Task | null>(
    activeTaskId ? (tasks.find((t) => t.id === activeTaskId) ?? null) : null,
  );

  $effect(() => {
    if (showAddGroup) {
      tick().then(() => addGroupInputEl?.focus());
    }
  });

  function startGroupDrag(e: MouseEvent, groupId: string) {
    if (compact) return;
    e.preventDefault();
    e.stopPropagation();
    draggingGroupId = groupId;
    dropGroupIndex = -1;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    function onMouseMove(ev: MouseEvent) {
      const groupEls = document.querySelectorAll<HTMLElement>(
        ".group[data-group-id]",
      );
      let idx = 0;
      for (const el of groupEls) {
        if (el.dataset.groupId === "active") continue;
        const rect = el.getBoundingClientRect();
        if (ev.clientY < rect.top + rect.height / 2) {
          dropGroupIndex = idx;
          return;
        }
        idx++;
      }
      dropGroupIndex = idx;
    }

    async function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const fromIndex = groups.findIndex((g) => g.id === draggingGroupId);
      if (
        fromIndex >= 0 &&
        dropGroupIndex >= 0 &&
        dropGroupIndex <= groups.length
      ) {
        await taskStore.reorderGroups(fromIndex, dropGroupIndex);
      }
      draggingGroupId = null;
      dropGroupIndex = -1;
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  const DEFAULT_GROUP_ID = "";

  function tasksForGroup(gid: string, excludeActive = false): Task[] {
    const id = gid || DEFAULT_GROUP_ID;
    let list = tasks.filter((t) => (t.groupId ?? DEFAULT_GROUP_ID) === id);
    if (excludeActive && activeTaskId)
      list = list.filter((t) => t.id !== activeTaskId);
    return list;
  }

  function openAddGroup() {
    showAddGroup = true;
    newGroupName = "";
  }

  function cancelAddGroup() {
    showAddGroup = false;
    newGroupName = "";
  }

  async function submitAddGroup() {
    const title = newGroupName.trim();
    if (title) {
      await taskStore.addGroup(title);
      showAddGroup = false;
      newGroupName = "";
    }
  }

  async function handleToggleGroup(groupId: string) {
    await taskStore.toggleGroupCollapsed(groupId);
  }

  async function handleToggleAll() {
    const state = taskStore.getTriState();
    const checked = state !== "checked";
    await taskStore.toggleAll(checked);
  }

  function getTriStateIcon(): string {
    const state = taskStore.getTriState();
    if (state === "checked") return "☑";
    if (state === "mixed") return "⊞";
    return "☐";
  }

  function handleKeyboardNav(e: KeyboardEvent) {
    if (compact || tasks.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, tasks.length - 1);
      focusTask(focusedIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      focusTask(focusedIndex);
    } else if (
      e.key === "Delete" &&
      focusedIndex >= 0 &&
      focusedIndex < tasks.length
    ) {
      e.preventDefault();
      const task = tasks[focusedIndex];
      if (task) requestDeleteTask(task);
    }
  }

  function focusTask(index: number) {
    const items = document.querySelectorAll<HTMLElement>(".task-item");
    items[index]?.focus();
  }

  // === Pointer-based drag-and-drop ===
  let draggingTaskId = $state<string | null>(null);
  let dragOverGroupId = $state<string | null>(null);
  let dragOverIndex = $state<number>(-1);

  $effect(() => {
    if (!deleteConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") deleteConfirm = null;
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  onMount(() => {
    fetch(getGroupIconUrl("manifest.json"))
      .then((r) => r.ok ? r.json() : null)
      .then((paths: string[] | null) => {
        if (Array.isArray(paths) && paths.length > 0) groupIconsList = paths;
      })
      .catch(() => {});

    function sync() {
      tasks = taskStore.getTasks();
      groups = taskStore.getGroups();
      collapsedIds = taskStore.getCollapsedGroupIds();
      activeTaskId = taskStore.getActiveTaskId();
    }
    sync();
    const unsubscribe = taskStore.subscribe(sync);

    function onDragStart(e: Event) {
      const ce = e as CustomEvent<{ taskId: string }>;
      draggingTaskId = ce.detail.taskId;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }

    function onMouseMove(e: MouseEvent) {
      if (!draggingTaskId) return;
      // Find which group-tasks container we're over
      const groupTaskContainers = document.querySelectorAll<HTMLElement>(
        ".group-tasks[data-group-id]",
      );
      let foundGroup = false;
      for (const container of groupTaskContainers) {
        const rect = container.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top - 30 &&
          e.clientY <= rect.bottom + 10
        ) {
          const gid = container.dataset.groupId ?? "";
          dragOverGroupId = gid;
          foundGroup = true;
          // Calculate drop index
          const taskEls = container.querySelectorAll<HTMLElement>(".task-item");
          let idx = 0;
          for (let i = 0; i < taskEls.length; i++) {
            const r = taskEls[i].getBoundingClientRect();
            if (e.clientY > r.top + r.height / 2) idx = i + 1;
          }
          dragOverIndex = idx;
          break;
        }
      }
      // Check group headers for collapsed groups
      if (!foundGroup) {
        const headers = document.querySelectorAll<HTMLElement>(".group-header");
        for (const h of headers) {
          const rect = h.getBoundingClientRect();
          if (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
          ) {
            const groupDiv = h.closest(".group") as HTMLElement;
            if (groupDiv) {
              dragOverGroupId = groupDiv.dataset.groupId ?? "";
              dragOverIndex = -1;
              foundGroup = true;
            }
            break;
          }
        }
      }
      if (!foundGroup) {
        dragOverGroupId = null;
        dragOverIndex = -1;
      }
    }

    async function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (draggingTaskId && dragOverGroupId !== null) {
        const idx =
          dragOverIndex >= 0
            ? dragOverIndex
            : tasksForGroup(dragOverGroupId).length;
        await taskStore.reorderTask(draggingTaskId, dragOverGroupId, idx);
      }
      draggingTaskId = null;
      dragOverGroupId = null;
      dragOverIndex = -1;
    }

    const container = document.querySelector(".task-list-container");
    container?.addEventListener(
      "task-drag-start",
      onDragStart as EventListener,
    );
    return () => {
      unsubscribe();
      container?.removeEventListener(
        "task-drag-start",
        onDragStart as EventListener,
      );
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="task-list-container"
  class:compact
  class:kanban={isKanban && !compact}
  role="list"
  onkeydown={handleKeyboardNav}
>
  {#if compact}
    {#if currentActiveTask}
      <div class="compact-task">
        <label class="compact-check">
          <input
            type="checkbox"
            checked={currentActiveTask.done}
            onchange={() => taskStore.toggleTask(currentActiveTask!.id)}
          />
          <span class="compact-checkmark"></span>
        </label>
        <span class="compact-text" class:done={currentActiveTask.done}
          >{currentActiveTask.text}</span
        >
      </div>
    {:else}
      <div class="empty-state compact-empty">
        <p>Выберите задачу (☆)</p>
      </div>
    {/if}
  {:else if tasks.length > 0}
    <div class="task-list-header">
      <button
        class="toggle-all-btn"
        onclick={handleToggleAll}
        title="Выделить все"
      >
        {getTriStateIcon()}
      </button>
      <span class="task-count">{tasks.length} задач</span>

      <button
        class="kanban-toggle-btn"
        class:active={isKanban}
        onclick={toggleKanban}
        title={isKanban ? "Режим списка" : "Режим доски (Канбан)"}
      >
        {isKanban ? "◫" : "☰"}
      </button>

      {#if showAddGroup}
        <div class="add-group-inline">
          <input
            type="text"
            class="add-group-input"
            placeholder="Название группы"
            bind:value={newGroupName}
            bind:this={addGroupInputEl}
            onkeydown={(e) => {
              if (e.key === "Enter") submitAddGroup();
              if (e.key === "Escape") cancelAddGroup();
            }}
          />
          <button
            type="button"
            class="add-group-submit"
            onclick={submitAddGroup}
            disabled={!newGroupName.trim()}
          >
            Создать
          </button>
          <button
            type="button"
            class="add-group-cancel"
            onclick={cancelAddGroup}>Отмена</button
          >
        </div>
      {:else}
        <button
          type="button"
          class="add-group-btn"
          onclick={openAddGroup}
          title="Добавить группу"
        >
          + Группа
        </button>
      {/if}
    </div>
    <div class="task-list">
      {#if currentActiveTask}
        <div class="group group-active" data-group-id="active">
          <button
            type="button"
            class="group-header"
            onclick={() => taskStore.toggleGroupCollapsed("__active__")}
            title={collapsedIds.has("__active__") ? "Развернуть" : "Свернуть"}
          >
            <span
              class="group-chevron"
              class:collapsed={collapsedIds.has("__active__")}>▸</span
            >
            <span class="group-title">Активная задача</span>
          </button>
          {#if !collapsedIds.has("__active__")}
            <div class="group-tasks">
              <TaskItem task={currentActiveTask} active={true} {groups} onDeleteRequest={requestDeleteTask} />
            </div>
          {/if}
        </div>
      {/if}
      {#each groups as group, groupIndex (group.id)}
        {@const groupTasks = tasksForGroup(group.id, true)}
        {#if draggingGroupId && dropGroupIndex === groupIndex}
          <div class="group-drop-line" aria-hidden="true"></div>
        {/if}
        <div class="group" data-group-id={group.id}>
          {#if editingGroupId === group.id}
            <div class="group-header-edit">
              <!-- svelte-ignore a11y_autofocus -->
              <input
                type="text"
                class="group-rename-input"
                bind:value={editGroupTitle}
                autofocus
                onkeydown={(e) => {
                  if (e.key === "Enter") saveEditGroup();
                  if (e.key === "Escape") {
                    editingGroupId = null;
                  }
                }}
                onblur={saveEditGroup}
              />
            </div>
          {:else}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="group-header"
              class:dragging={draggingGroupId === group.id}
              role="button"
              tabindex="0"
              onclick={() => handleToggleGroup(group.id)}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  handleToggleGroup(group.id);
              }}
              title={collapsedIds.has(group.id) ? "Развернуть" : "Свернуть"}
            >
              {#if !compact}
                <span
                  class="group-drag-handle"
                  role="presentation"
                  title="Перетащить группу"
                  onmousedown={(e) => startGroupDrag(e, group.id)}>⋮⋮</span
                >
              {/if}
              <span
                class="group-chevron"
                class:collapsed={collapsedIds.has(group.id)}>▸</span
              >
              {#if group.icon}
                <img class="group-icon-img" src={getGroupIconUrl(group.icon)} alt="" aria-hidden="true" />
              {:else}
                <span class="group-icon-emoji" aria-hidden="true">{getGroupIconFromTitle(group.title)}</span>
              {/if}
              <span class="group-title">{getGroupTitleWithoutEmoji(group.title)}</span>
              <span class="group-count">{groupTasks.length}</span>
              <span class="group-actions">
                <button
                  type="button"
                  class="group-action-btn"
                  onclick={(e) => {
                    e.stopPropagation();
                    const open = showIconPicker === group.id ? null : group.id;
                    showIconPicker = open;
                    iconPickerExpandedFolder = null;
                  }}
                  title="Иконка">🖼</button
                >
                <button
                  type="button"
                  class="group-action-btn"
                  onclick={(e) => {
                    e.stopPropagation();
                    startEditGroup(group.id, group.title);
                  }}
                  title="Переименовать">✎</button
                >
                {#if groupTasks.length === 0}
                  <button
                    type="button"
                    class="group-action-btn group-delete-btn"
                    onclick={(e) => {
                      e.stopPropagation();
                      handleDeleteGroup(group.id);
                    }}
                    title="Удалить">×</button
                  >
                {/if}
              </span>
            </div>
            {#if showIconPicker === group.id}
              <div class="icon-picker">
                <button
                  type="button"
                  class="icon-picker-clear"
                  onclick={() => handleIconPick(group.id, null)}>Убрать иконку</button
                >
                {#if iconPickerExpandedFolder !== null}
                  <div class="icon-picker-folder-bar">
                    <button
                      type="button"
                      class="icon-picker-back"
                      onclick={() => (iconPickerExpandedFolder = null)}>← Назад</button
                    >
                    <span class="icon-picker-folder-name">{iconPickerExpandedFolder || "Иконки"}</span>
                  </div>
                  <div class="icon-picker-grid">
                    {#each (groupIconsByFolder[iconPickerExpandedFolder] ?? []) as iconPath}
                      <button
                        type="button"
                        class="icon-picker-btn"
                        class:active={group.icon === iconPath}
                        onclick={() => handleIconPick(group.id, iconPath)}
                        title={iconPath}>
                        <img src={getGroupIconUrl(iconPath)} alt="" />
                      </button>
                    {/each}
                  </div>
                {:else}
                  <div class="icon-picker-folders">
                    {#each Object.entries(groupIconsByFolder) as [folderName, paths]}
                      {@const firstPath = paths[0]}
                      <button
                        type="button"
                        class="icon-picker-folder-btn"
                        onclick={() => (iconPickerExpandedFolder = folderName)}
                        title={folderName || "Корень"}>
                        <img src={getGroupIconUrl(firstPath)} alt="" />
                        <span class="icon-picker-folder-label">{folderName || "Прочее"}</span>
                        <span class="icon-picker-folder-count">{paths.length}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          {/if}
          {#if !collapsedIds.has(group.id)}
            <div class="group-tasks" data-group-id={group.id}>
              {#if groupTasks.length === 0}
                {#if draggingTaskId && dragOverGroupId === group.id}
                  <div class="drop-line"></div>
                {/if}
              {:else}
                {#each groupTasks as task, i (task.id)}
                  {#if draggingTaskId && dragOverGroupId === group.id && dragOverIndex === i}
                    <div class="drop-line"></div>
                  {/if}
                  <TaskItem {task} active={activeTaskId === task.id} {groups} onDeleteRequest={requestDeleteTask} />
                {/each}
                {#if draggingTaskId && dragOverGroupId === group.id && dragOverIndex >= groupTasks.length}
                  <div class="drop-line"></div>
                {/if}
              {/if}
            </div>
          {/if}
        </div>
        {#if draggingGroupId && dropGroupIndex === groups.length && groupIndex === groups.length - 1}
          <div class="group-drop-line" aria-hidden="true"></div>
        {/if}
      {/each}
    </div>
  {:else}
    <div class="empty-state">
      <p>Добавь первую задачу</p>
    </div>
  {/if}

  {#if deleteConfirm}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
      class="delete-confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      tabindex="-1"
      onclick={() => (deleteConfirm = null)}
      onkeydown={(e) => e.key === 'Escape' && (deleteConfirm = null)}>
      <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
      <div class="delete-confirm-box" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
        <p id="delete-confirm-title">Удалить задачу «{deleteConfirm.text}»?</p>
        <div class="delete-confirm-actions">
          <button type="button" onclick={() => (deleteConfirm = null)}>Отмена</button>
          <button type="button" class="delete-confirm-do" onclick={() => confirmDeleteTask()}>Удалить</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .task-list-container {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--content-padding-h, 1rem);
    padding-top: 0;
    min-height: 0;
    position: relative;
  }

  .delete-confirm-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .delete-confirm-box {
    background: var(--bg-secondary, #1a1a1a);
    border: 1px solid var(--border-color, #333);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    min-width: 280px;
  }

  .delete-confirm-box p {
    margin: 0 0 1rem 0;
    font-size: 0.95rem;
  }

  .delete-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .delete-confirm-actions button {
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    border: 1px solid var(--border-color, #333);
    background: var(--bg-tertiary, #252525);
    color: var(--text-color, #eee);
    cursor: pointer;
  }

  .delete-confirm-do {
    background: var(--accent-danger, #c33) !important;
    border-color: var(--accent-danger, #c33) !important;
  }

  .task-list-container.kanban {
    display: flex;
    flex-direction: column;
    padding-bottom: 0;
  }

  .task-list-container.kanban .task-list-header {
    flex-shrink: 0;
  }

  /* Compact mode styles */
  .compact-task {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.5rem 0.75rem;
  }

  .compact-check {
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .compact-check input {
    position: absolute;
    opacity: 0;
    cursor: pointer;
  }

  .compact-checkmark {
    display: block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--border-color);
    border-radius: 0;
    background: transparent;
    transition: all 0.2s ease;
  }

  .compact-check input:checked ~ .compact-checkmark {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 0 6px var(--accent);
  }

  .compact-text {
    flex: 1;
    min-width: 0;
    color: var(--text-primary);
    font-size: 0.85rem;
    line-height: 1.3;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .compact-text.done {
    text-decoration: line-through;
    opacity: 0.5;
  }

  .compact-empty {
    padding: 0.75rem 1rem;
  }

  .task-list-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--group-border);
    margin-bottom: 0.5rem;
    margin-top: 0;
  }

  .add-group-btn {
    margin-left: auto;
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
    background: var(--group-bg);
    border: 1px solid var(--group-border);
    border-radius: 6px;
    color: var(--text-secondary);
    cursor: pointer;
    font-family: inherit;
  }

  .add-group-btn:hover {
    background: var(--group-bg);
    color: var(--accent);
  }

  .kanban-toggle-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    margin-left: 0.5rem;
    transition: all 0.2s ease;
  }

  .kanban-toggle-btn:hover,
  .kanban-toggle-btn.active {
    background: var(--group-bg);
    color: var(--accent);
  }

  .add-group-inline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    flex-wrap: wrap;
  }

  .add-group-input {
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
    min-width: 140px;
    max-width: 200px;
    background: var(--bg-secondary);
    border: 1px solid var(--group-border);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: inherit;
  }

  .add-group-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .add-group-submit,
  .add-group-cancel {
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    border: none;
  }

  .add-group-submit {
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
  }

  .add-group-submit:hover:not(:disabled) {
    background: var(--group-bg);
  }

  .add-group-submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .add-group-cancel {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--group-border);
  }

  .add-group-cancel:hover {
    background: var(--group-bg);
  }

  .group-actions {
    display: inline-flex;
    align-items: center;
    margin-left: auto;
    gap: 0.15rem;
  }

  .group-action-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.1rem 0.3rem;
    font-size: 0.75rem;
    border-radius: 3px;
    transition: all 0.15s ease;
    opacity: 0.5;
  }

  .group-action-btn:hover {
    color: var(--accent);
    opacity: 1;
  }

  .group-delete-btn:hover {
    color: #f87171;
    background: rgba(248, 113, 113, 0.1);
  }

  .group-header-edit {
    display: flex;
    padding: 0.35rem;
  }

  .group-rename-input {
    flex: 1;
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    background: var(--bg-secondary);
    border: 1px solid var(--accent);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: inherit;
    outline: none;
  }

  .icon-picker {
    padding: 0.4rem;
    background: var(--group-bg);
    border: 1px solid var(--group-border);
    border-top: none;
    border-radius: 0 0 6px 6px;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-height: 220px;
    overflow-y: auto;
  }

  .icon-picker-clear {
    font-size: 0.75rem;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.2rem 0;
    text-align: left;
  }

  .icon-picker-clear:hover {
    color: var(--accent);
  }

  .icon-picker-folder-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0 0.25rem;
  }

  .icon-picker-back {
    font-size: 0.8rem;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.2rem 0;
  }

  .icon-picker-back:hover {
    color: var(--accent);
  }

  .icon-picker-folder-name {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .icon-picker-folders {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .icon-picker-folder-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--group-border);
    border-radius: 6px;
    background: var(--bg-secondary);
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--text-primary);
    transition: border-color 0.15s, background 0.15s;
  }

  .icon-picker-folder-btn img {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }

  .icon-picker-folder-btn:hover {
    border-color: var(--accent);
    background: var(--group-bg);
  }

  .icon-picker-folder-label {
    font-weight: 500;
  }

  .icon-picker-folder-count {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .icon-picker-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .icon-picker-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--group-border);
    border-radius: 4px;
    background: var(--bg-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s, background 0.15s;
  }

  .icon-picker-btn img {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }

  .icon-picker-btn:hover,
  .icon-picker-btn.active {
    border-color: var(--accent);
    background: var(--group-bg);
  }

  .group-active .group-header {
    border-color: var(--accent);
    background: var(--group-bg);
    padding-left: var(--spacing-from-controls);
    padding-right: var(--spacing-from-controls);
  }

  .toggle-all-btn {
    background: transparent;
    border: none;
    color: var(--accent);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .toggle-all-btn:hover {
    background: var(--group-bg);
    color: var(--accent);
  }

  .task-count {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .task-list {
    padding-bottom: var(--content-pg-bottom, 1rem);
  }

  .group {
    margin-bottom: 0.75rem;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-from-controls);
    width: 100%;
    padding: 0.5rem 0;
    background: var(--group-bg);
    border: 1px solid var(--group-border);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .group-header:hover {
    background: var(--group-bg);
    border-color: var(--accent);
  }

  .group-chevron {
    display: inline-block;
    width: 1rem;
    transition: transform 0.2s ease;
    color: var(--accent);
    transform: rotate(90deg);
  }

  .group-chevron.collapsed {
    transform: rotate(0);
  }

  .group-icon-img {
    width: 20px;
    height: 20px;
    min-width: 20px;
    min-height: 20px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .group-icon-emoji {
    font-size: 1em;
    line-height: 1;
    flex-shrink: 0;
  }

  .group-title {
    flex: 1;
  }

  .group-count {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--text-secondary);
  }

  .group-tasks {
    margin-top: 0.35rem;
    padding-left: 0.25rem;
    min-height: 8px;
  }

  .drop-line {
    height: 2px;
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    border-radius: 1px;
    margin: 2px 0;
    animation: drop-pulse 0.6s ease-in-out infinite alternate;
  }

  .group-drag-handle {
    cursor: grab;
    color: var(--text-secondary);
    padding: 0.2rem 0.25rem;
    margin: 0;
    border-radius: 4px;
    font-size: 0.85rem;
    user-select: none;
    flex-shrink: 0;
  }

  .group-drag-handle:hover {
    color: var(--accent);
    background: rgba(255, 255, 255, 0.06);
  }

  .group-drag-handle:active {
    cursor: grabbing;
  }

  .group-header.dragging {
    opacity: 0.7;
  }

  .group-drop-line {
    height: 3px;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
    border-radius: 2px;
    margin: 4px 0;
    animation: drop-pulse 0.6s ease-in-out infinite alternate;
  }

  @keyframes drop-pulse {
    0% {
      opacity: 0.6;
    }
    100% {
      opacity: 1;
    }
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    color: var(--text-secondary);
    font-size: 0.95rem;
  }

  /* Kanban Mode Styles */
  .task-list-container.kanban .task-list {
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    gap: 1rem;
    align-items: flex-start;
    padding-bottom: 0.5rem;
    flex: 1;
    min-height: 0;
  }

  .task-list-container.kanban .group {
    flex: 0 0 320px;
    min-width: 320px;
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    max-height: 100%;
    margin-bottom: 0;
  }

  .task-list-container.kanban .group-header {
    margin-bottom: 0.5rem;
  }

  .task-list-container.kanban .group-tasks {
    overflow-y: auto;
    flex: 1;
    padding-right: 0.2rem;
  }

  .task-list-container.kanban :global(.task-item) {
    padding: 0.5rem 0.6rem;
    gap: 0.5rem;
  }

  .task-list-container.kanban :global(.task-text) {
    min-width: 0;
  }

  .task-list-container.kanban :global(.move-select) {
    display: none;
  }
</style>
