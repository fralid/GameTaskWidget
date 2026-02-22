<script lang="ts">
  import { onMount } from "svelte";
  import { taskStore, type Task, type TaskGroup } from "./store";
  import { pomodoroStore } from "./pomodoroStore";

  interface Props {
    pomodoroWork: number;
    pomodoroBreak: number;
    onSettings: () => void;
    onSwitchMode: (mode: 'full' | 'compact' | 'taskbar') => void;
    onClose: () => void;
    onDragStart: (e: MouseEvent) => void;
  }

  let {
    pomodoroWork,
    pomodoroBreak,
    onSettings,
    onSwitchMode,
    onClose,
    onDragStart,
  }: Props = $props();

  let tasks = $state<Task[]>([]);
  let groups = $state<TaskGroup[]>([]);
  let activeTaskId = $state<string | null>(null);
  let openGroupId = $state<string | null>(null);
  let quickAddText = $state("");

  let pomodoroPhase = $state(pomodoroStore.getPhase());
  let pomodoroSeconds = $state(pomodoroStore.getRemainingSeconds());
  let pomodoroRunning = $state(pomodoroStore.getIsRunning());

  let pomodoroTime = $derived(
    `${Math.floor(pomodoroSeconds / 60).toString().padStart(2, "0")}:${(pomodoroSeconds % 60).toString().padStart(2, "0")}`,
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

  function tasksForGroup(gid: string): Task[] {
    const id = gid || DEFAULT_GROUP_ID;
    return tasks.filter((t) => (t.groupId ?? DEFAULT_GROUP_ID) === id);
  }

  function toggleGroup(gid: string) {
    openGroupId = openGroupId === gid ? null : gid;
    quickAddText = "";
  }

  function closeDropdown() {
    openGroupId = null;
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
    if (!target.closest(".taskbar-group-wrapper")) {
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

  $effect(() => {
    pomodoroWork;
    pomodoroBreak;
    pomodoroStore.setDurations(pomodoroWork, pomodoroBreak);
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="taskbar" role="banner" onmousedown={onDragStart}>
  <span class="taskbar-title" title="Game Task Widget">GTW</span>

  <div class="taskbar-divider"></div>

  <div class="taskbar-groups">
    {#each groups as group (group.id)}
      {@const gt = tasksForGroup(group.id)}
      <div class="taskbar-group-wrapper">
        <button
          type="button"
          class="taskbar-group-btn"
          class:active={openGroupId === group.id}
          onmousedown={(e) => e.stopPropagation()}
          onclick={() => toggleGroup(group.id)}
          title={group.title}
        >
          <span class="tg-name">{group.title}</span>
          <span class="tg-count">{gt.length}</span>
        </button>

        {#if openGroupId === group.id}
          <div
            class="taskbar-dropdown"
            onmousedown={(e) => e.stopPropagation()}
          >
            <div class="dd-header">{group.title}</div>
            <div class="dd-tasks">
              {#if gt.length === 0}
                <div class="dd-empty">Нет задач</div>
              {:else}
                {#each gt as task (task.id)}
                  <div class="dd-task" class:done={task.done}>
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
                      title={activeTaskId === task.id ? "Снять активную" : "Сделать активной"}
                    >
                      {activeTaskId === task.id ? "★" : "☆"}
                    </button>
                  </div>
                {/each}
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
      </div>
    {/each}
  </div>

  <div class="taskbar-divider"></div>

  {#if activeTask}
    <div class="taskbar-active" onmousedown={(e) => e.stopPropagation()}>
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

  <div class="taskbar-timer" onmousedown={(e) => e.stopPropagation()}>
    <span class="tt-phase">{pomodoroPhase === "work" ? "Работа" : "Перерыв"}</span>
    <span class="tt-time">{pomodoroTime}</span>
    <button
      type="button"
      class="tt-btn"
      onclick={() => pomodoroStore.startPause()}
      title={pomodoroRunning ? "Пауза" : "Старт"}
    >{pomodoroRunning ? "⏸" : "▶"}</button>
    <button
      type="button"
      class="tt-btn"
      onclick={() => pomodoroStore.reset()}
      title="Сброс"
    >↺</button>
  </div>

  <div class="taskbar-progress" title="Прогресс: {Math.round(progress)}%">
    <div class="tp-bar">
      <div class="tp-fill" style="width: {progress}%"></div>
    </div>
    <span class="tp-label">{doneCount}/{totalCount}</span>
  </div>

  <div class="taskbar-divider"></div>

  <div class="taskbar-actions" onmousedown={(e) => e.stopPropagation()}>
    <button type="button" class="ta-btn" onclick={onSettings} title="Настройки">⚙</button>
    <button type="button" class="ta-btn" onclick={() => onSwitchMode('full')} title="Полный режим">▼</button>
    <button type="button" class="ta-btn close" onclick={onClose} title="Закрыть">×</button>
  </div>
</div>

<style>
  .taskbar {
    display: flex;
    align-items: center;
    gap: 0;
    height: 40px;
    padding: 0 0.5rem;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-color);
    font-family: "Rajdhani", "Orbitron", "Exo 2", sans-serif;
    cursor: move;
    user-select: none;
    -webkit-user-select: none;
    overflow: visible;
    position: relative;
  }

  .taskbar-title {
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 0 0.4rem;
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
    align-items: center;
    gap: 0.2rem;
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
  }

  .taskbar-group-btn {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--group-border);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.72rem;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
    line-height: 1.2;
  }
  .taskbar-group-btn:hover,
  .taskbar-group-btn.active {
    border-color: var(--accent);
    background: var(--group-bg);
  }

  .tg-name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tg-count {
    font-size: 0.65rem;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 0 0.3rem;
    border-radius: 3px;
    min-width: 1rem;
    text-align: center;
  }

  /* Dropdown */
  .taskbar-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 260px;
    max-width: 360px;
    max-height: 400px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 200;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    cursor: default;
  }

  .dd-header {
    padding: 0.4rem 0.6rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--accent);
    border-bottom: 1px solid var(--group-border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dd-tasks {
    overflow-y: auto;
    max-height: 300px;
    padding: 0.25rem 0;
  }

  .dd-empty {
    padding: 0.5rem 0.6rem;
    color: var(--text-secondary);
    font-size: 0.78rem;
    font-style: italic;
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
    gap: 0.35rem;
    padding: 0 0.4rem;
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
    gap: 0.3rem;
    padding: 0 0.4rem;
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
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.7rem;
    transition: border-color 0.15s, background 0.15s;
  }
  .tt-btn:hover {
    background: var(--bg-secondary);
    border-color: var(--accent);
    color: var(--accent);
  }

  /* Progress */
  .taskbar-progress {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0 0.4rem;
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

  /* Actions */
  .taskbar-actions {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-shrink: 0;
    cursor: default;
  }
  .ta-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0.15rem 0.3rem;
    border-radius: 3px;
    transition: all 0.15s ease;
    line-height: 1;
  }
  .ta-btn:hover {
    background: var(--group-bg);
    color: var(--accent);
  }
  .ta-btn.close:hover {
    color: #f87171;
    background: rgba(248, 113, 113, 0.15);
  }
</style>
