<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { PhysicalSize, LogicalSize } from "@tauri-apps/api/dpi";
  import TaskItem from "./TaskItem.svelte";
  import { taskStore, type Task, type TaskGroup } from "./store";
  import * as debug from "./debug";

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
  let showEmojiPicker = $state<string | null>(null);

  const EMOJIS = [
    "📋",
    "🎯",
    "🔥",
    "💼",
    "📚",
    "🎨",
    "🎮",
    "💡",
    "⚡",
    "🚀",
    "🏠",
    "👥",
    "📹",
    "🎵",
    "💰",
    "🧠",
    "⭐",
    "❤️",
    "🌟",
    "🔧",
    "📌",
    "🏆",
    "🎬",
    "🗂️",
    "💻",
    "📊",
    "🎧",
    "✅",
    "🔔",
    "💎",
    "🌈",
    "🛠️",
  ];

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

  async function handleEmojiPick(groupId: string, emoji: string) {
    await taskStore.setGroupEmoji(groupId, emoji);
    showEmojiPicker = null;
  }

  // Compute activeTask only once via $derived
  let currentActiveTask = $derived<Task | null>(
    activeTaskId ? (tasks.find((t) => t.id === activeTaskId) ?? null) : null,
  );

  $effect(() => {
    if (showAddGroup) setTimeout(() => addGroupInputEl?.focus(), 50);
  });

  // Use onMount for subscription — runs once, no leak
  onMount(() => {
    function sync() {
      tasks = taskStore.getTasks();
      groups = taskStore.getGroups();
      collapsedIds = taskStore.getCollapsedGroupIds();
      activeTaskId = taskStore.getActiveTaskId();
    }
    sync();
    const unsubscribe = taskStore.subscribe(sync);
    return () => unsubscribe();
  });

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
      if (task && confirm(`Удалить задачу «${task.text}»?`)) {
        taskStore.deleteTask(task.id);
      }
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

  onMount(() => {
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
            <span class="group-count">1</span>
          </button>
          {#if !collapsedIds.has("__active__")}
            <div class="group-tasks">
              <TaskItem task={currentActiveTask} active={true} {groups} />
            </div>
          {/if}
        </div>
      {/if}
      {#each groups as group (group.id)}
        {@const groupTasks = tasksForGroup(group.id, true)}
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
              role="button"
              tabindex="0"
              onclick={() => handleToggleGroup(group.id)}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  handleToggleGroup(group.id);
              }}
              title={collapsedIds.has(group.id) ? "Развернуть" : "Свернуть"}
            >
              <span
                class="group-chevron"
                class:collapsed={collapsedIds.has(group.id)}>▸</span
              >
              <span class="group-title">{group.title}</span>
              <span class="group-count">{groupTasks.length}</span>
              <span class="group-actions">
                <button
                  type="button"
                  class="group-action-btn"
                  onclick={(e) => {
                    e.stopPropagation();
                    showEmojiPicker =
                      showEmojiPicker === group.id ? null : group.id;
                  }}
                  title="Смайлик">🎭</button
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
            {#if showEmojiPicker === group.id}
              <div class="emoji-picker">
                {#each EMOJIS as em}
                  <button
                    type="button"
                    class="emoji-btn"
                    onclick={() => handleEmojiPick(group.id, em)}>{em}</button
                  >
                {/each}
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
                  <TaskItem {task} active={activeTaskId === task.id} {groups} />
                {/each}
                {#if draggingTaskId && dragOverGroupId === group.id && dragOverIndex >= groupTasks.length}
                  <div class="drop-line"></div>
                {/if}
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty-state">
      <p>Добавь первую задачу</p>
    </div>
  {/if}
</div>

<style>
  .task-list-container {
    flex: 1;
    overflow-y: auto;
    padding: 0 1rem;
    min-height: 0;
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
    border-bottom: 1px solid var(--group-border, rgba(168, 85, 247, 0.2));
    margin-bottom: 0.5rem;
  }

  .add-group-btn {
    margin-left: auto;
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
    background: var(--group-bg, rgba(168, 85, 247, 0.08));
    border: 1px solid var(--group-border, rgba(168, 85, 247, 0.2));
    border-radius: 6px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
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
    background: var(--bg-secondary, rgba(255, 255, 255, 0.05));
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
    background: rgba(168, 85, 247, 0.15);
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
    background: var(--bg-secondary, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--accent);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: inherit;
    outline: none;
  }

  .emoji-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    padding: 0.4rem;
    background: var(--group-bg);
    border: 1px solid var(--group-border);
    border-top: none;
    border-radius: 0 0 6px 6px;
  }

  .emoji-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.2rem;
    border-radius: 4px;
    transition: background 0.1s;
  }

  .emoji-btn:hover {
    background: rgba(168, 85, 247, 0.15);
  }

  .group-active .group-header {
    border-color: var(--accent);
    background: var(--group-bg);
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
    padding-bottom: 1rem;
  }

  .group {
    margin-bottom: 0.75rem;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
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
    background: var(--bg-secondary, rgba(255, 255, 255, 0.02));
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
