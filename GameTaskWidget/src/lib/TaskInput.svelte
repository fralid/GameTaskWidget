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
    padding: 1rem;
  }

  .task-input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(168, 85, 247, 0.3);
    border-radius: 8px;
    color: #fff;
    font-size: 0.95rem;
    font-family: 'Rajdhani', 'Orbitron', 'Exo 2', sans-serif;
    outline: none;
    transition: all 0.2s ease;
  }

  .task-input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .task-input:focus {
    border-color: #a855f7;
    box-shadow: 0 0 10px rgba(168, 85, 247, 0.3);
    background: rgba(255, 255, 255, 0.08);
  }
</style>
