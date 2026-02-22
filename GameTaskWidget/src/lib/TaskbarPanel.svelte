<script lang="ts">
  import { onMount } from "svelte";
  import { taskStore, type Task, type TaskGroup } from "./store";
  import { pomodoroStore } from "./pomodoroStore";
  import { getGroupIconUrl } from "./groupIcons";

  interface Props {
    pomodoroWork: number;
    pomodoroBreak: number;
    onSettings: () => void;
    onSwitchMode: (mode: "full" | "compact" | "taskbar") => void;
    onClose: () => void;
    onDropdownOpen?: (open: boolean) => void;
  }

  let {
    pomodoroWork,
    pomodoroBreak,
    onSettings,
    onSwitchMode,
    onClose,
    onDropdownOpen,
  }: Props = $props();

  let tasks = $state<Task[]>([]);
  let groups = $state<TaskGroup[]>([]);
  let activeTaskId = $state<string | null>(null);
  let openGroupId = $state<string | null>(null);
  let dropdownAnchorRect = $state<{
    top: number;
    left: number;
    bottom: number;
  } | null>(null);
  let quickAddText = $state("");

  /** Drag-and-drop в выпадающем списке задач */
  let ddDraggingTaskId = $state<string | null>(null);
  let ddDragOverIndex = $state<number>(-1);

  function startDdDrag(taskId: string) {
    if (openGroupId === null) return;
    ddDraggingTaskId = taskId;
    ddDragOverIndex = -1;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    function onMouseMove(e: MouseEvent) {
      const container = document.querySelector(".taskbar-dropdown .dd-tasks");
      if (!container) {
        ddDragOverIndex = -1;
        return;
      }
      const rect = container.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        ddDragOverIndex = -1;
        return;
      }
      const taskEls = container.querySelectorAll<HTMLElement>(".dd-task");
      let idx = 0;
      for (let i = 0; i < taskEls.length; i++) {
        const r = taskEls[i].getBoundingClientRect();
        if (e.clientY > r.top + r.height / 2) idx = i + 1;
      }
      ddDragOverIndex = idx;
    }

    async function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const tid = ddDraggingTaskId;
      const gid = openGroupId;
      const idx = ddDragOverIndex >= 0 ? ddDragOverIndex : (gid !== null ? tasksForGroup(gid).length : 0);
      ddDraggingTaskId = null;
      ddDragOverIndex = -1;
      if (tid && gid !== null) {
        await taskStore.reorderTask(tid, gid, idx);
      }
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  let pomodoroPhase = $state(pomodoroStore.getPhase());
  let pomodoroSeconds = $state(pomodoroStore.getRemainingSeconds());
  let pomodoroRunning = $state(pomodoroStore.getIsRunning());

  let pomodoroTime = $derived(
    `${Math.floor(pomodoroSeconds / 60)
      .toString()
      .padStart(2, "0")}:${(pomodoroSeconds % 60).toString().padStart(2, "0")}`,
  );

  let activeTask = $derived<Task | null>(
    activeTaskId ? (tasks.find((t) => t.id === activeTaskId) ?? null) : null,
  );

  let doneCount = $derived(tasks.filter((t) => t.done).length);
  let totalCount = $derived(tasks.length);
  let progress = $derived(
    totalCount === 0 ? 0 : (doneCount / totalCount) * 100,
  );

  const DEFAULT_GROUP_ID = "";

  /** Вытаскивает эмодзи из начала названия (как в setGroupEmoji: "💡 Текст" → "💡"). */
  function getGroupIcon(title: string): string {
    if (!title || !title.length) return "•";
    const leading = title.match(/^[^\p{L}\p{N}]+/u)?.[0]?.trim();
    if (leading) return leading;
    return [...title][0] ?? "•";
  }

  /** Название без ведущего эмодзи ("💡 Идеи" → "Идеи"). */
  function getGroupTitleWithoutEmoji(title: string): string {
    if (!title || !title.length) return "";
    const trimmed = title.replace(/^[^\p{L}\p{N}]+/u, "").trim();
    return trimmed || title;
  }

  function tasksForGroup(gid: string): Task[] {
    const id = gid || DEFAULT_GROUP_ID;
    return tasks.filter((t) => (t.groupId ?? DEFAULT_GROUP_ID) === id);
  }

  function toggleGroup(e: MouseEvent, gid: string) {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const anchorRect = { top: rect.top, left: rect.left, bottom: rect.bottom };
    if (openGroupId === gid) {
      openGroupId = null;
      dropdownAnchorRect = null;
      quickAddText = "";
    } else {
      dropdownAnchorRect = anchorRect;
      onDropdownOpen?.(true);
      // Removed 120ms timeout here to make the UI feel instantly responsive
      openGroupId = gid;
      quickAddText = "";
    }
  }

  function requestExpandForDropdown() {
    onDropdownOpen?.(true);
  }

  function closeDropdown() {
    openGroupId = null;
    dropdownAnchorRect = null;
    quickAddText = "";
  }

  async function handleToggleTask(id: string) {
    await taskStore.toggleTask(id);
  }

  async function handleSetActive(id: string) {
    const newId = activeTaskId === id ? null : id;
    await taskStore.setActiveTaskId(newId);
  }

  async function handleQuickAdd() {
    const text = quickAddText.trim();
    if (!text || openGroupId === null) return;
    const task = await taskStore.addTask(text);
    if (openGroupId !== DEFAULT_GROUP_ID) {
      await taskStore.moveTaskToGroup(task.id, openGroupId);
    }
    quickAddText = "";
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (
      !target.closest(".taskbar-group-wrapper") &&
      !target.closest(".taskbar-dropdown")
    ) {
      closeDropdown();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") closeDropdown();
  }

  onMount(() => {
    function syncStore() {
      tasks = taskStore.getTasks();
      groups = taskStore.getGroups();
      activeTaskId = taskStore.getActiveTaskId();
    }
    function syncPomodoro() {
      pomodoroPhase = pomodoroStore.getPhase();
      pomodoroSeconds = pomodoroStore.getRemainingSeconds();
      pomodoroRunning = pomodoroStore.getIsRunning();
    }
    syncStore();
    syncPomodoro();
    pomodoroStore.setDurations(pomodoroWork, pomodoroBreak);
    const unsub1 = taskStore.subscribe(syncStore);
    const unsub2 = pomodoroStore.subscribe(syncPomodoro);
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      unsub1();
      unsub2();
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleKeydown);
    };
  });

  let prevDropdownOpen = false;
  $effect(() => {
    const open = openGroupId !== null;
    if (!open) dropdownAnchorRect = null;
    if (open !== prevDropdownOpen) {
      prevDropdownOpen = open;
      onDropdownOpen?.(open);
    }
  });

  /** Пока выпадающий список открыт — подстраиваем позицию каждый кадр (без задержки при раскрытии соседней группы слева). */
  $effect(() => {
    const gid = openGroupId;
    if (gid === null) return;
    let rafId = 0;
    let cancelled = false;
    function syncDropdownPosition() {
      if (cancelled) return;
      const wrapper = document.querySelector<HTMLElement>(
        `.taskbar-group-wrapper[data-group-id="${CSS.escape(gid)}"]`,
      );
      const btn = wrapper?.querySelector<HTMLElement>(".taskbar-group-btn");
      const el = btn ?? wrapper;
      if (el) {
        const rect = el.getBoundingClientRect();
        dropdownAnchorRect = { top: rect.top, left: rect.left, bottom: rect.bottom };
      }
      rafId = requestAnimationFrame(syncDropdownPosition);
    }
    rafId = requestAnimationFrame(syncDropdownPosition);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  });
</script>

<div class="taskbar" role="banner">
  <div class="taskbar-identity" title="Game Task Widget">
    <span class="taskbar-icon" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    </span>
    <span class="taskbar-title">GTW</span>
  </div>

  <div class="taskbar-divider"></div>

  <div class="taskbar-groups">
    {#each groups as group (group.id)}
      {@const gt = tasksForGroup(group.id)}
      <div class="taskbar-group-wrapper" data-group-id={group.id}>
        <button
          type="button"
          class="taskbar-group-btn"
          class:active={openGroupId === group.id}
          onmousedown={(e) => {
            e.stopPropagation();
            if (openGroupId !== group.id) requestExpandForDropdown();
          }}
          onclick={(e) => toggleGroup(e, group.id)}
        >
          {#if group.icon}
            <img class="tg-icon tg-icon-img" src={getGroupIconUrl(group.icon)} alt="" aria-hidden="true" />
          {:else}
            <span class="tg-icon" aria-hidden="true">{getGroupIcon(group.title)}</span>
          {/if}
          <span class="tg-expand">
            <span class="tg-name">{getGroupTitleWithoutEmoji(group.title)}</span>
            <span class="tg-count">{gt.length}</span>
          </span>
        </button>
      </div>
    {/each}
  </div>

  {#if openGroupId && dropdownAnchorRect}
    <div
      class="taskbar-dropdown-clickcatcher"
      role="button"
      tabindex="-1"
      aria-label="Закрыть меню"
      onclick={closeDropdown}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && closeDropdown()}
      onmousedown={(e) => e.preventDefault()}
    ></div>
    {@const group = groups.find((g) => g.id === openGroupId)}
    {@const gt = group ? tasksForGroup(group.id) : []}
    <div
      class="taskbar-dropdown taskbar-dropdown-fixed"
      style="top: {dropdownAnchorRect.bottom +
        4}px; left: {dropdownAnchorRect.left}px;"
      onmousedown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Список задач группы"
      tabindex="-1"
    >
      <div class="dd-tasks">
        {#if gt.length === 0}
          <div class="dd-empty">Нет задач</div>
        {:else}
          {#if ddDraggingTaskId && ddDragOverIndex === 0}
            <div class="dd-drop-line" aria-hidden="true"></div>
          {/if}
          {#each gt as task, i (task.id)}
            {#if ddDraggingTaskId && ddDragOverIndex === i + 1}
              <div class="dd-drop-line" aria-hidden="true"></div>
            {/if}
            <div
              class="dd-task"
              class:done={task.done}
              class:dd-dragging={ddDraggingTaskId === task.id}
              data-task-id={task.id}
            >
              <button
                type="button"
                class="dd-drag-handle"
                onmousedown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  startDdDrag(task.id);
                }}
                title="Перетащить">⠿</button
              >
              <label class="dd-check">
                <input
                  type="checkbox"
                  checked={task.done}
                  onchange={() => handleToggleTask(task.id)}
                />
                <span class="dd-checkmark"></span>
              </label>
              <span class="dd-text">{task.text}</span>
              <button
                type="button"
                class="dd-star"
                class:active={activeTaskId === task.id}
                onclick={() => handleSetActive(task.id)}
                title={activeTaskId === task.id
                  ? "Снять активную"
                  : "Сделать активной"}
              >
                {activeTaskId === task.id ? "★" : "☆"}
              </button>
            </div>
          {/each}
          {#if ddDraggingTaskId && ddDragOverIndex >= gt.length}
            <div class="dd-drop-line" aria-hidden="true"></div>
          {/if}
        {/if}
      </div>
      <div class="dd-add">
        <input
          type="text"
          class="dd-add-input"
          placeholder="+ задача..."
          bind:value={quickAddText}
          onkeydown={(e) => {
            if (e.key === "Enter") handleQuickAdd();
          }}
        />
      </div>
    </div>
  {/if}

  <div class="taskbar-divider"></div>

  {#if activeTask}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="taskbar-active" role="group" aria-label="Активная задача" onmousedown={(e) => e.stopPropagation()}>
      <label class="dd-check small">
        <input
          type="checkbox"
          checked={activeTask.done}
          onchange={() => handleToggleTask(activeTask!.id)}
        />
        <span class="dd-checkmark"></span>
      </label>
      <span class="taskbar-active-text" class:done={activeTask.done}>
        {activeTask.text}
      </span>
    </div>
    <div class="taskbar-divider"></div>
  {/if}

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="taskbar-timer" role="group" aria-label="Таймер" onmousedown={(e) => e.stopPropagation()}>
    <span class="tt-phase"
      >{pomodoroPhase === "work" ? "Работа" : "Перерыв"}</span
    >
    <span class="tt-time">{pomodoroTime}</span>
    <button
      type="button"
      class="tt-btn"
      onclick={() => pomodoroStore.startPause()}
      title={pomodoroRunning ? "Пауза" : "Старт"}
      >{pomodoroRunning ? "⏸" : "▶"}</button
    >
    <button
      type="button"
      class="tt-btn"
      onclick={() => pomodoroStore.reset()}
      title="Сброс">↺</button
    >
  </div>

  <div class="taskbar-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} title="Прогресс: {Math.round(progress)}%">
    <div class="tp-bar">
      <div class="tp-fill" style="width: {progress}%"></div>
    </div>
    <span class="tp-label">{doneCount}/{totalCount}</span>
  </div>

  <div class="taskbar-divider"></div>

  <div class="taskbar-actions" role="toolbar" aria-label="Действия" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
    <div class="taskbar-actions-group">
      <button type="button" class="ta-btn" onclick={onSettings} title="Настройки">⚙</button>
      <button type="button" class="ta-btn" onclick={() => onSwitchMode("full")} title="Полный режим">▼</button>
    </div>
    <span class="taskbar-actions-sep" aria-hidden="true"></span>
    <button type="button" class="ta-btn ta-close" onclick={onClose} title="Закрыть" aria-label="Закрыть">×</button>
  </div>
</div>

<style>
  .taskbar {
    display: flex;
    align-items: stretch;
    gap: 0;
    width: 100%;
    height: 40px;
    padding: 0 0.75rem;
    background: var(--bg-primary);
    border: none;
    border-bottom: none;
    box-shadow: none;
    outline: none;
    font-family: "Rajdhani", "Orbitron", "Exo 2", sans-serif;
    cursor: default;
    user-select: none;
    -webkit-user-select: none;
    overflow: visible;
    position: relative;
  }

  .taskbar-identity {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
    padding: 0 0.25rem 0 0;
  }

  .taskbar-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    opacity: 0.9;
  }

  .taskbar-icon :global(svg) {
    display: block;
  }

  .taskbar-title {
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 1px;
    flex-shrink: 0;
  }

  .taskbar-divider {
    width: 1px;
    height: 20px;
    background: var(--border-color);
    margin: 0 0.35rem;
    flex-shrink: 0;
  }

  .taskbar-groups {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    overflow-x: auto;
    overflow-y: visible;
    flex: 1;
    min-width: 0;
    scrollbar-width: none;
  }
  .taskbar-groups::-webkit-scrollbar {
    display: none;
  }

  .taskbar-group-wrapper {
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
  }

  .taskbar-group-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0 0.35rem;
    background: transparent;
    border: none;
    border-radius: 0;
    color: var(--text-primary);
    font-size: 0.9375rem;
    line-height: 1;
    font-family: inherit;
    cursor: pointer;
    overflow: hidden;
    max-width: 2rem;
    height: 100%;
    min-height: 0;
    transition: max-width 0.28s ease, background 0.2s ease;
  }
  .taskbar-group-btn:hover,
  .taskbar-group-btn:focus-visible,
  .taskbar-group-btn.active {
    max-width: 320px;
    background: var(--group-bg);
  }

  .tg-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    min-width: 20px;
    min-height: 20px;
    font-size: 1em;
    line-height: 1;
    align-self: center;
    font-family: "Segoe UI Emoji", "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", sans-serif;
  }
  .tg-icon-img {
    width: 100%;
    height: 100%;
    max-width: 20px;
    max-height: 20px;
    object-fit: contain;
  }

  .tg-expand {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    overflow: hidden;
  }

  .tg-name {
    font-size: 1em;
    line-height: 1;
    align-self: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .tg-count {
    font-size: 0.65rem;
    color: var(--text-secondary);
    background: transparent;
    padding: 0 0.15rem;
    min-width: 1rem;
    text-align: center;
    flex-shrink: 0;
  }

  /* Dropdown - fixed so it's not clipped by overflow on taskbar-groups */
  .taskbar-dropdown {
    min-width: 260px;
    max-width: 360px;
    max-height: 400px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 9999;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    cursor: default;
  }

  .taskbar-dropdown-fixed {
    position: fixed;
  }

  .taskbar-dropdown-clickcatcher {
    position: fixed;
    top: 40px;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9998;
    cursor: default;
    background: transparent;
  }

  .dd-tasks {
    overflow-y: auto;
    max-height: 300px;
    padding: 0.35rem 0 0.25rem;
  }

  .dd-empty {
    padding: 0.5rem 0.6rem;
    color: var(--text-secondary);
    font-size: 0.78rem;
    font-style: italic;
  }

  .dd-drop-line {
    height: 2px;
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    border-radius: 1px;
    margin: 2px 0;
    flex-shrink: 0;
  }

  .dd-task {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.6rem;
    transition: background 0.1s;
  }
  .dd-task:hover {
    background: var(--bg-secondary);
  }
  .dd-task.done {
    opacity: 0.5;
  }
  .dd-task.dd-dragging {
    opacity: 0.5;
  }
  .dd-drag-handle {
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: grab;
    padding: 0.1rem;
    color: var(--text-secondary);
    font-size: 0.75rem;
    line-height: 1;
  }
  .dd-drag-handle:active {
    cursor: grabbing;
  }
  .dd-drag-handle:hover {
    color: var(--accent);
  }

  .dd-check {
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
  }
  .dd-check input {
    position: absolute;
    opacity: 0;
    cursor: pointer;
  }
  .dd-checkmark {
    display: block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-color);
    border-radius: 0;
    background: transparent;
    transition: all 0.15s ease;
  }
  .dd-check input:checked ~ .dd-checkmark {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 0 4px var(--accent);
  }
  .dd-check.small .dd-checkmark {
    width: 12px;
    height: 12px;
    border-width: 1.5px;
  }

  .dd-text {
    flex: 1;
    min-width: 0;
    font-size: 0.78rem;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dd-task.done .dd-text {
    text-decoration: line-through;
  }

  .dd-star {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-secondary);
    padding: 0.1rem;
    flex-shrink: 0;
    transition: color 0.15s;
  }
  .dd-star.active {
    color: var(--accent);
  }
  .dd-star:hover {
    color: var(--accent);
  }

  .dd-add {
    border-top: 1px solid var(--group-border);
    padding: 0.35rem 0.5rem;
  }
  .dd-add-input {
    width: 100%;
    padding: 0.3rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--group-border);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.75rem;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }
  .dd-add-input:focus {
    border-color: var(--accent);
  }
  .dd-add-input::placeholder {
    color: var(--text-secondary);
  }

  /* Active task */
  .taskbar-active {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.3rem;
    max-width: 220px;
    cursor: default;
    flex-shrink: 1;
    min-width: 0;
  }
  .taskbar-active-text {
    font-size: 0.75rem;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .taskbar-active-text.done {
    text-decoration: line-through;
    opacity: 0.5;
  }

  /* Timer */
  .taskbar-timer {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.3rem;
    flex-shrink: 0;
    cursor: default;
  }
  .tt-phase {
    font-size: 0.65rem;
    color: var(--text-secondary);
  }
  .tt-time {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--accent);
    font-family: "Orbitron", monospace;
    letter-spacing: 0.03em;
  }
  .tt-btn {
    background: transparent;
    border: none;
    color: var(--text-primary);
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0;
    cursor: pointer;
    font-size: 0.7rem;
    transition: background 0.15s, color 0.15s;
  }
  .tt-btn:hover {
    background: var(--group-bg);
    color: var(--accent);
  }

  /* Progress */
  .taskbar-progress {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.3rem;
    flex-shrink: 0;
    cursor: default;
  }
  .tp-bar {
    width: 50px;
    height: 6px;
    background: var(--xp-bar-bg, rgba(255, 255, 255, 0.1));
    border-radius: 3px;
    overflow: hidden;
  }
  .tp-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .tp-label {
    font-size: 0.65rem;
    color: var(--text-secondary);
    min-width: 2rem;
  }

  /* Actions: группа действий + разделитель + закрыть */
  .taskbar-actions {
    display: flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
    cursor: default;
  }
  .taskbar-actions-group {
    display: flex;
    align-items: center;
    gap: 0.1rem;
  }
  .taskbar-actions-sep {
    width: 1px;
    height: 14px;
    margin: 0 0.25rem;
    background: var(--border-color);
    flex-shrink: 0;
  }
  .ta-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0.15rem 0.25rem;
    border-radius: 0;
    transition: all 0.15s ease;
    line-height: 1;
  }
  .ta-btn:hover {
    background: var(--group-bg);
    color: var(--accent);
  }
  .ta-btn.ta-close:hover {
    color: #f87171;
    background: rgba(248, 113, 113, 0.15);
  }
</style>
