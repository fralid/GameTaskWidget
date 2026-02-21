<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { taskStore, type ThemeId } from "./store";

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open: isOpen, onclose }: Props = $props();
  let mdPath = $state(taskStore.getMdPath() ?? "");
  let theme = $state<ThemeId>(taskStore.getTheme());
  let error = $state("");
  let loading = $state(false);

  const themes: { id: ThemeId; name: string; desc: string }[] = [
    { id: "neon", name: "Neon", desc: "фиолетовая" },
    { id: "mono", name: "Чёрно-белая", desc: "без цветов" },
    { id: "cyber", name: "Cyberpunk", desc: "голубой + розовый" },
    { id: "matrix", name: "Matrix", desc: "зелёный терминал" },
  ];

  $effect(() => {
    if (isOpen) {
      mdPath = taskStore.getMdPath() ?? "";
      theme = taskStore.getTheme();
      error = "";
    }
  });

  async function handleThemeSelect(v: ThemeId) {
    theme = v;
    await taskStore.setTheme(v);
  }

  $effect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onclose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  async function handleSelectFile() {
    loading = true;
    error = "";
    try {
      const selected = await invoke<string | null>("select_md_file");
      if (selected) {
        await taskStore.setMdPath(selected);
        mdPath = selected;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function handleClear() {
    loading = true;
    error = "";
    try {
      await taskStore.setMdPath(null);
      mdPath = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function handleReload() {
    if (!taskStore.getMdPath()) return;
    loading = true;
    error = "";
    try {
      await taskStore.reloadFromMd();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  let devtoolsOpen = $state(false);

  async function toggleDevtools() {
    try {
      // Tauri v2 internal_toggle_devtools
      await invoke("plugin:webview|internal_toggle_devtools");
      devtoolsOpen = !devtoolsOpen;
    } catch (e) {
      console.error("Failed to toggle devtools:", e);
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="backdrop"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Настройки"
    onclick={(e) => e.target === e.currentTarget && onclose()}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2 class="modal-title">Настройки</h2>
        <button
          type="button"
          class="close-btn"
          onclick={onclose}
          title="Закрыть">×</button
        >
      </div>
      <div class="modal-body">
        <span class="label">Тема</span>
        <div class="theme-options" role="group" aria-label="Выбор темы">
          {#each themes as t (t.id)}
            <button
              type="button"
              class="theme-option"
              class:selected={theme === t.id}
              onclick={() => handleThemeSelect(t.id)}
            >
              <span class="theme-name">{t.name}</span>
              <span class="theme-desc">{t.desc}</span>
            </button>
          {/each}
        </div>

        <span class="label">Файл задач (MD)</span>
        <div class="path-row">
          <span class="path-value" title={mdPath}>{mdPath || "Не выбран"}</span>
        </div>
        <div class="actions">
          <button
            type="button"
            class="btn btn-primary"
            onclick={handleSelectFile}
            disabled={loading}
          >
            {loading ? "…" : "Выбрать файл"}
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            onclick={handleClear}
            disabled={loading || !mdPath}
          >
            Очистить
          </button>
          {#if mdPath}
            <button
              type="button"
              class="btn btn-secondary"
              onclick={handleReload}
              disabled={loading}
            >
              Обновить из файла
            </button>
          {/if}
        </div>
        {#if error}
          <p class="error">{error}</p>
        {/if}

        <div class="shortcuts-section">
          <span class="label">Горячие клавиши</span>
          <div class="shortcut-list">
            <div class="shortcut-row">
              <kbd>Ctrl+Shift+Space</kbd> <span>Блокировка/разблокировка</span>
            </div>
            <div class="shortcut-row">
              <kbd>↑</kbd> <kbd>↓</kbd> <span>Навигация по задачам</span>
            </div>
            <div class="shortcut-row">
              <kbd>Space</kbd> <span>Отметить задачу</span>
            </div>
            <div class="shortcut-row">
              <kbd>Delete</kbd> <span>Удалить задачу</span>
            </div>
            <div class="shortcut-row">
              <kbd>Dblclick</kbd> <span>Редактировать текст</span>
            </div>
          </div>
        </div>

        <div class="debug-section">
          <span class="label">Отладка</span>
          <button type="button" class="btn btn-debug" onclick={toggleDevtools}>
            {devtoolsOpen ? "🔧 Скрыть консоль" : "🔧 Показать консоль"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    width: 90vw;
    max-width: 520px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    max-height: 85vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--header-border);
  }

  .modal-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 0.25rem;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: var(--group-bg);
    color: var(--accent);
  }

  .modal-body {
    padding: 1.25rem;
  }

  .label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .theme-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }

  .theme-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.6rem 0.75rem;
    background: var(--group-bg);
    border: 2px solid var(--group-border);
    border-radius: 8px;
    color: var(--text-primary);
    font-family: inherit;
    cursor: pointer;
    transition:
      border-color 0.2s,
      background 0.2s;
  }

  .theme-option:hover {
    background: var(--bg-secondary);
    border-color: var(--accent);
  }

  .theme-option.selected {
    border-color: var(--accent);
    background: var(--bg-secondary);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .theme-name {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .theme-desc {
    font-size: 0.7rem;
    color: var(--text-secondary);
    margin-top: 0.15rem;
  }

  .path-row {
    margin-bottom: 1rem;
  }

  .path-value {
    font-size: 0.85rem;
    color: var(--text-primary);
    word-break: break-all;
    display: block;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
    font-family: inherit;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary {
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
  }

  .btn-primary:hover:not(:disabled) {
    background: rgba(168, 85, 247, 0.15);
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--group-bg);
  }

  .error {
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
    color: #f87171;
  }

  .shortcuts-section {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--group-border);
  }

  .shortcut-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .shortcut-row kbd {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    background: var(--group-bg);
    border: 1px solid var(--group-border);
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--text-primary);
    font-family: inherit;
  }

  .debug-section {
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid var(--group-border);
  }

  .btn-debug {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--group-border);
    width: 100%;
    text-align: center;
  }

  .btn-debug:hover {
    background: var(--group-bg);
    color: var(--text-primary);
    border-color: var(--accent);
  }
</style>
