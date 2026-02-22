<script lang="ts">
  import { taskStore, type Task, type TaskGroup, type Priority } from "./store";

  interface Props {
    task: Task;
    active?: boolean;
    groups?: TaskGroup[];
  }

  let props: Props = $props();
  let isEditing = $state(false);
  let editText = $state("");
  let isDeleting = $state(false);

  $effect(() => {
    editText = props.task.text;
  });

  async function handleToggle() {
    await taskStore.toggleTask(props.task.id);
  }

  async function handleDelete() {
    // Confirm before deleting
    if (!confirm(`Удалить задачу «${props.task.text}»?`)) return;
    isDeleting = true;
    // Wait for CSS animation
    setTimeout(async () => {
      await taskStore.deleteTask(props.task.id);
    }, 200);
  }

  async function handleSetActive(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const current = taskStore.getActiveTaskId();
    await taskStore.setActiveTaskId(
      current === props.task.id ? null : props.task.id,
    );
  }

  function startEdit() {
    isEditing = true;
    editText = props.task.text;
  }

  async function saveEdit() {
    if (editText.trim()) {
      await taskStore.updateTask(props.task.id, editText.trim());
    }
    isEditing = false;
  }

  function cancelEdit() {
    editText = props.task.text;
    isEditing = false;
  }

  const PRIORITY_ORDER: Priority[] = ["none", "low", "medium", "high"];
  const PRIORITY_COLORS: Record<Priority, string> = {
    none: "rgba(255,255,255,0.15)",
    low: "#22c55e",
    medium: "#eab308",
    high: "#ef4444",
  };

  function cyclePriority(e: MouseEvent) {
    e.stopPropagation();
    const cur = props.task.priority ?? "none";
    const idx = PRIORITY_ORDER.indexOf(cur);
    const next = PRIORITY_ORDER[(idx + 1) % PRIORITY_ORDER.length];
    taskStore.setPriority(props.task.id, next);
  }

  function handleDragStart(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = (e.target as HTMLElement).closest(".task-item");
    if (el) {
      el.dispatchEvent(
        new CustomEvent("task-drag-start", {
          bubbles: true,
          detail: { taskId: props.task.id },
        }),
      );
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (isEditing) {
      if (e.key === "Enter") {
        e.preventDefault();
        saveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
    } else if (e.key === " " || e.key === "Space") {
      // Space to toggle checkbox
      e.preventDefault();
      handleToggle();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="task-item"
  class:done={props.task.done}
  class:active={props.active}
  class:deleting={isDeleting}
  tabindex="0"
  onkeydown={handleKeydown}
  role="listitem"
  data-task-id={props.task.id}
>
  <button
    type="button"
    class="drag-handle"
    onmousedown={handleDragStart}
    title="Перетащить">⠿</button
  >
  <button
    type="button"
    class="active-btn"
    onclick={handleSetActive}
    title={props.active
      ? "Снять отметку актуальной"
      : "Сделать актуальной задачей"}
    aria-pressed={props.active}
  >
    {props.active ? "★" : "☆"}
  </button>
  <label class="checkbox-container">
    <input
      type="checkbox"
      checked={props.task.done}
      onchange={handleToggle}
      class="checkbox"
    />
    <span class="checkmark"></span>
  </label>
  <button
    class="priority-btn"
    type="button"
    onclick={cyclePriority}
    title="Срочность: {props.task.priority ?? 'none'}"
    style="color: {PRIORITY_COLORS[props.task.priority ?? 'none']}"
  >
    ●
  </button>

  {#if isEditing}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="text"
      class="task-edit-input"
      bind:value={editText}
      onblur={saveEdit}
      onkeydown={handleKeydown}
      autofocus
    />
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
      class="task-text"
      class:strikethrough={props.task.done}
      ondblclick={startEdit}
      role="button"
      tabindex="-1"
    >
      {props.task.text}
    </span>
  {/if}

  <button class="delete-btn" onclick={handleDelete} aria-label="Удалить задачу">
    ×
  </button>
</div>

<style>
  .task-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--group-border);
    border-radius: 6px;
    margin-bottom: 0.5rem;
    transition: all 0.2s ease;
    outline: none;
    animation: task-appear 0.25s ease-out;
  }

  @keyframes task-appear {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .task-item.deleting {
    animation: task-remove 0.2s ease-in forwards;
  }

  @keyframes task-remove {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(30px);
    }
  }

  .task-item:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--group-border);
  }

  .task-item:hover {
    background: var(--group-bg);
    border-color: var(--border-color);
  }

  .task-item.done {
    opacity: 0.6;
  }

  .task-item.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
    animation: breathe 3s ease-in-out infinite alternate;
  }

  @keyframes breathe {
    0% {
      box-shadow:
        0 0 0 1px var(--accent),
        0 0 4px var(--accent);
    }
    100% {
      box-shadow:
        0 0 0 1px var(--accent),
        0 0 16px var(--accent);
    }
  }

  .task-item.active .active-btn {
    color: #fbbf24;
  }

  .active-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0.2rem;
    line-height: 1;
    border-radius: 4px;
    flex-shrink: 0;
    transition: color 0.2s ease;
  }

  .active-btn:hover {
    color: rgba(251, 191, 36, 0.9);
  }

  .checkbox-container {
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
  }

  .checkbox {
    position: absolute;
    opacity: 0;
    cursor: pointer;
  }

  .checkmark {
    display: block;
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-color);
    border-radius: 4px;
    background: transparent;
    transition: all 0.2s ease;
  }

  .checkbox:checked ~ .checkmark {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 0 10px var(--accent);
  }

  .checkbox:checked ~ .checkmark::after {
    content: "✓";
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    color: #fff;
    font-size: 14px;
    font-weight: bold;
  }

  .task-text {
    flex: 1;
    min-width: 0;
    color: var(--text-primary);
    font-size: 0.9rem;
    cursor: text;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .task-text.strikethrough {
    text-decoration: line-through;
    color: var(--text-secondary);
  }

  .task-edit-input {
    flex: 1;
    padding: 0.25rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--accent);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.9rem;
    outline: none;
  }

  .delete-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .delete-btn:hover {
    color: #ff4444;
    background: rgba(255, 68, 68, 0.1);
  }

  .priority-btn {
    background: none;
    border: none;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 0.15rem;
    line-height: 1;
    border-radius: 50%;
    flex-shrink: 0;
    transition:
      transform 0.15s ease,
      filter 0.15s ease;
  }

  .priority-btn:hover {
    transform: scale(1.3);
    filter: brightness(1.3);
  }

  .drag-handle {
    background: none;
    border: none;
    color: var(--text-secondary);
    opacity: 0.4;
    cursor: grab;
    padding: 0.25rem 0.2rem;
    font-size: 1.1rem;
    line-height: 1;
    flex-shrink: 0;
    transition: opacity 0.15s ease;
    user-select: none;
  }

  .drag-handle:hover {
    opacity: 1;
    color: var(--accent);
  }

  .drag-handle:active {
    cursor: grabbing;
  }
</style>
