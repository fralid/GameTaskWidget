<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { PhysicalSize, LogicalSize } from "@tauri-apps/api/dpi";
  import TaskInput from "./lib/TaskInput.svelte";
  import TaskList from "./lib/TaskList.svelte";
  import SettingsModal from "./lib/SettingsModal.svelte";
  import { taskStore, type Task } from "./lib/store";

  let isLocked = $state(false);
  let settingsOpen = $state(false);
  let isCompact = $state(false);
  let savedSize = $state<{ width: number; height: number } | null>(null);
  let activeTaskId = $state<string | null>(null);
  let tasks = $state<Task[]>([]);
  let progress = $derived(
    tasks.length === 0
      ? 0
      : (tasks.filter((t) => t.done).length / tasks.length) * 100,
  );
  let doneCount = $derived(tasks.filter((t) => t.done).length);
  let totalCount = $derived(tasks.length);

  $effect(() => {
    activeTaskId = taskStore.getActiveTaskId();
    tasks = taskStore.getTasks();
  });

  onMount(() => {
    taskStore.init().catch(() => {});
    document.documentElement.dataset.theme = taskStore.getTheme();
    const unsubStore = taskStore.subscribe(() => {
      document.documentElement.dataset.theme = taskStore.getTheme();
      activeTaskId = taskStore.getActiveTaskId();
      tasks = taskStore.getTasks();
    });
    activeTaskId = taskStore.getActiveTaskId();
    tasks = taskStore.getTasks();
    let unlisten: (() => void) | undefined;
    listen<{ locked: boolean }>("lock-state-changed", (e) => {
      // Single source of truth: only update isLocked from backend events
      const locked = e.payload?.locked ?? (e.payload as unknown as boolean);
      if (typeof locked === "boolean") {
        isLocked = locked;
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      unsubStore();
      unlisten?.();
    };
  });

  async function handleDragStart(e: MouseEvent) {
    if (e.button !== 0) return; // Only left mouse button
    try {
      await invoke("start_dragging");
    } catch (error) {
      console.error("Failed to start dragging:", error);
    }
  }

  async function closeApp() {
    try {
      // Flush any pending saves before closing
      await taskStore.flush();
      await getCurrentWindow().close();
    } catch (e) {
      console.error("Close failed:", e);
    }
  }

  async function toggleCompact() {
    try {
      const win = getCurrentWindow();
      if (isCompact) {
        // Restore min size constraint (logical pixels)
        await win.setMinSize(new LogicalSize(380, 400));
        if (savedSize) {
          await win.setSize(
            new PhysicalSize(savedSize.width, savedSize.height),
          );
          savedSize = null;
        }
        isCompact = false;
      } else {
        const size = await win.innerSize();
        savedSize = { width: size.width, height: size.height };
        // Remove min size constraint for compact strip (logical pixels)
        await win.setMinSize(new LogicalSize(100, 30));
        isCompact = true;
        // Wait a tick for the DOM to render compact mode
        await new Promise((r) => setTimeout(r, 100));
        await fitCompactWindow();
      }
    } catch (e) {
      console.error("toggleCompact failed:", e);
    }
  }

  async function fitCompactWindow() {
    try {
      const win = getCurrentWindow();
      const dpr = window.devicePixelRatio || 1;
      const strip = document.querySelector(".compact-strip");
      let totalH = strip ? strip.getBoundingClientRect().height : 50;
      // Add border (2px) and small buffer
      totalH += 4;
      const physWidth = Math.ceil(400 * dpr);
      const physHeight = Math.ceil(Math.max(totalH, 40) * dpr);
      await win.setSize(new PhysicalSize(physWidth, physHeight));
    } catch (e) {
      console.error("fitCompactWindow failed:", e);
    }
  }

  async function handleToggleLock() {
    const next = !isLocked;
    try {
      // Let backend be the source of truth — don't update isLocked optimistically
      const actualState = await invoke<boolean>("toggle_lock_mode", {
        locked: next,
      });
      isLocked = actualState;
    } catch (error) {
      console.error("Failed to toggle lock mode:", error);
      // Don't change isLocked on error
    }
  }
</script>

<div
  class="app"
  class:locked={isLocked}
  class:compact-mode={isCompact}
  role="application"
>
  {#if isCompact}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="compact-strip" role="banner" onmousedown={handleDragStart}>
      <TaskList compact={true} />
      <button
        class="compact-expand-btn"
        type="button"
        onmousedown={(e) => e.stopPropagation()}
        onclick={toggleCompact}
        title="Развернуть окно">◱</button
      >
    </div>
  {:else}
    {#if isLocked}
      <div class="unlock-hint" role="status" aria-live="polite">
        Разблокировка: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd>
      </div>
    {/if}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="drag-header"
      role="banner"
      onmousedown={handleDragStart}
      title="Перетащите окно"
    >
      <span class="app-title">Game Task Widget</span>
      <button
        class="icon-btn"
        type="button"
        onmousedown={(e) => e.stopPropagation()}
        onclick={handleToggleLock}
        title={isLocked
          ? "Разблокировать (Ctrl+Shift+Space)"
          : "Заблокировать (Ctrl+Shift+Space)"}
      >
        {isLocked ? "▣" : "▢"}
      </button>
      <button
        class="icon-btn"
        type="button"
        onmousedown={(e) => e.stopPropagation()}
        onclick={() => (settingsOpen = true)}
        title="Настройки"
      >
        ⚙
      </button>
      <button
        class="icon-btn"
        type="button"
        onmousedown={(e) => e.stopPropagation()}
        onclick={toggleCompact}
        title="Свернуть до активной задачи"
        disabled={!activeTaskId}
      >
        ▲
      </button>
      <button
        class="icon-btn close-btn"
        type="button"
        onmousedown={(e) => e.stopPropagation()}
        onclick={closeApp}
        title="Закрыть программу"
        aria-label="Закрыть"
      >
        ×
      </button>
    </div>

    <div
      class="xp-bar"
      aria-label="Прогресс"
      title="Прогресс: {Math.round(progress)}%"
    >
      <div class="xp-fill" style="width: {progress}%"></div>
      <span class="xp-label">{doneCount}/{totalCount}</span>
    </div>

    <div class="content">
      <TaskInput />
      <TaskList compact={false} />
    </div>
  {/if}
  <SettingsModal open={settingsOpen} onclose={() => (settingsOpen = false)} />
</div>

<style>
  .app {
    width: 100%;
    min-width: 320px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: rgba(10, 10, 15, 0.72);
    backdrop-filter: blur(24px) saturate(140%);
    -webkit-backdrop-filter: blur(24px) saturate(140%);
    border: 1px solid var(--border-color);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    font-family: "Rajdhani", "Orbitron", "Exo 2", sans-serif;
    isolation: isolate;
  }

  .drag-header {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    background: var(--header-bg);
    border-bottom: 1px solid var(--header-border);
    cursor: move;
    user-select: none;
    -webkit-user-select: none;
  }

  .app-title {
    flex: 1;
    color: var(--text-primary);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .icon-btn,
  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.9rem;
    cursor: pointer;
    padding: 0.2rem 0.35rem;
    border-radius: 4px;
    transition: all 0.2s ease;
    line-height: 1;
  }

  .icon-btn:hover,
  .close-btn:hover {
    background: var(--group-bg);
    color: var(--accent);
  }

  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .unlock-hint {
    padding: 0.35rem 1rem;
    background: var(--unlock-bg);
    border-bottom: 1px solid var(--unlock-border);
    color: #fff;
    font-size: 0.8rem;
    text-align: center;
    pointer-events: none;
  }

  .unlock-hint kbd {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    font-size: 0.8em;
  }

  .close-btn:hover {
    color: #f87171;
    background: rgba(248, 113, 113, 0.15);
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .compact-strip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    background: rgba(10, 10, 15, 0.85);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    cursor: move;
    user-select: none;
    -webkit-user-select: none;
  }

  .compact-strip :global(.task-list-container) {
    flex: 1;
    min-width: 0;
    padding: 0;
    overflow: visible;
  }

  .compact-expand-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 1rem;
    cursor: pointer;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .compact-expand-btn:hover {
    background: var(--group-bg);
    color: var(--accent);
  }

  .xp-bar {
    height: 16px;
    background: rgba(0, 0, 0, 0.4);
    position: relative;
    overflow: hidden;
    z-index: 10;
    display: flex;
    align-items: center;
  }

  .xp-fill {
    height: 100%;
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent);
    transition: width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    position: absolute;
    left: 0;
    top: 0;
  }

  .xp-label {
    position: relative;
    z-index: 1;
    width: 100%;
    text-align: center;
    font-size: 0.65rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    letter-spacing: 1px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
