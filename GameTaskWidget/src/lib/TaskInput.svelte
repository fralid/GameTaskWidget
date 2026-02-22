<script lang="ts">
  import { taskStore } from './store';

  let inputValue = $state('');

  async function handleSubmit() {
    const text = inputValue.trim();
    if (text) {
      await taskStore.addTask(text);
      inputValue = '';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }
</script>

<div class="task-input-container">
  <input
    type="text"
    class="task-input"
    placeholder="Добавить задачу..."
    bind:value={inputValue}
    onkeydown={handleKeydown}
    autocomplete="off"
  />
</div>

<style>
  .task-input-container {
    padding: 0.75rem var(--content-padding-h, 1rem);
  }

  .task-input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 0.95rem;
    font-family: 'Rajdhani', 'Orbitron', 'Exo 2', sans-serif;
    outline: none;
    transition: all 0.2s ease;
  }

  .task-input::placeholder {
    color: var(--text-secondary);
  }

  .task-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 10px var(--accent);
    background: var(--bg-secondary);
  }
</style>
