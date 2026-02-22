<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { PhysicalSize, PhysicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
  import TaskInput from "./lib/TaskInput.svelte";
  import TaskList from "./lib/TaskList.svelte";
  import SettingsModal from "./lib/SettingsModal.svelte";
  import PomodoroTimer from "./lib/PomodoroTimer.svelte";
  import TaskbarPanel from "./lib/TaskbarPanel.svelte";
  import { taskStore, type Task, type ViewMode } from "./lib/store";
  import { pomodoroStore } from "./lib/pomodoroStore";
  import * as debug from "./lib/debug";

  let isLocked = $state(false);
  let settingsOpen = $state(false);
  let viewMode = $state<ViewMode>('full');
  let savedSize = $state<{ width: number; height: number } | null>(null);
  let activeTaskId = $state<string | null>(null);
  let tasks = $state<Task[]>([]);
  let debugMode = $state(false);
  let debugLogs = $state<debug.DebugEntry[]>([]);
  let debugLogsKey = $state(0);
  let pomodoroWork = $state(25);
  let pomodoroBreak = $state(5);
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
    viewMode = taskStore.getViewMode();
    const unsubStore = taskStore.subscribe(() => {
      document.documentElement.dataset.theme = taskStore.getTheme();
      activeTaskId = taskStore.getActiveTaskId();
      tasks = taskStore.getTasks();
      debugMode = taskStore.getDebugMode();
      pomodoroWork = taskStore.getPomodoroWorkMinutes();
      pomodoroBreak = taskStore.getPomodoroBreakMinutes();
      viewMode = taskStore.getViewMode();
    });
    debugMode = taskStore.getDebugMode();
    pomodoroWork = taskStore.getPomodoroWorkMinutes();
    pomodoroBreak = taskStore.getPomodoroBreakMinutes();
    pomodoroStore.setDurations(pomodoroWork, pomodoroBreak);
    pomodoroStore.reset();
    const unsubDebug = debug.subscribe(() => {
      debugLogs = debug.getLogs();
      debugLogsKey += 1;
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
      unsubDebug?.();
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

  async function switchViewMode(target: ViewMode) {
    debug.log("[viewMode] switchViewMode", { from: viewMode, to: target });
    try {
      const win = getCurrentWindow();
      const dpr = window.devicePixelRatio || 1;

      if (viewMode !== 'full' && viewMode !== 'taskbar') {
        // nothing special to undo from compact beyond size restore
      }

      if (target === viewMode) return;

      // Save current size if leaving full mode
      if (viewMode === 'full' && !savedSize) {
        const size = await win.innerSize();
        savedSize = { width: size.width, height: size.height };
        debug.log("[viewMode] saved full size", savedSize);
      }

      // Save position if leaving taskbar
      if (viewMode === 'taskbar') {
        try {
          await win.setAlwaysOnTop(false);
        } catch { /* may not be supported */ }
      }

      viewMode = target;
      await taskStore.setViewMode(target);

      if (target === 'full') {
        await win.setMinSize(new LogicalSize(380, 400));
        if (savedSize) {
          await win.setSize(new PhysicalSize(savedSize.width, savedSize.height));
          savedSize = null;
        }
        debug.log("[viewMode] restored full");
      } else if (target === 'compact') {
        await win.setMinSize(new LogicalSize(100, 30));
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 50));
          if (document.querySelector(".compact-strip")) break;
        }
        await new Promise<void>((r) => {
          requestAnimationFrame(() => requestAnimationFrame(() => r()));
        });
        await fitCompactWindow();
        debug.log("[viewMode] compact");
      } else if (target === 'taskbar') {
        const screenW = screen.availWidth;
        const taskbarH = 42;
        await win.setMinSize(new LogicalSize(400, taskbarH));
        await win.setSize(new PhysicalSize(Math.ceil(screenW * dpr), Math.ceil(taskbarH * dpr)));
        try {
          await win.setPosition(new PhysicalPosition(0, 0));
        } catch (e) {
          debug.warn("[viewMode] setPosition failed", e);
        }
        try {
          await win.setAlwaysOnTop(true);
        } catch (e) {
          debug.warn("[viewMode] setAlwaysOnTop failed", e);
        }
        debug.log("[viewMode] taskbar mode set", { screenW, taskbarH });
      }
    } catch (e) {
      debug.error("[viewMode] switchViewMode failed", e);
      console.error("switchViewMode failed:", e);
    }
  }

  async function fitCompactWindow() {
    try {
      const win = getCurrentWindow();
      const dpr = window.devicePixelRatio || 1;
      const strip = document.querySelector(".compact-strip");
      const rect = strip?.getBoundingClientRect();
      let totalH = rect ? rect.height : 80;
      totalH += 8;
      const minCompactWidth = 520;
      const minCompactHeight = 130;
      const logicalW = Math.max(minCompactWidth, 400);
      const logicalH = Math.max(minCompactHeight, Math.ceil(totalH));
      const physWidth = Math.ceil(logicalW * dpr);
      const physHeight = Math.ceil(logicalH * dpr);
      debug.log("[compact] fitCompactWindow", { totalH, logicalW, logicalH, stripFound: !!strip });
      await win.setSize(new PhysicalSize(physWidth, physHeight));
      await win.setMinSize(new LogicalSize(logicalW, logicalH));
      debug.log("[compact] setSize and minSize done");
    } catch (e) {
      debug.error("[compact] fitCompactWindow failed", e);
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
  class:compact-mode={viewMode === 'compact'}
  class:taskbar-mode={viewMode === 'taskbar'}
  role="application"
>
  {#if viewMode === 'taskbar'}
    <TaskbarPanel
      {pomodoroWork}
      {pomodoroBreak}
      onSettings={() => (settingsOpen = true)}
      onSwitchMode={switchViewMode}
      onClose={closeApp}
      onDragStart={handleDragStart}
    />
  {:else if viewMode === 'compact'}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="compact-strip" role="banner" onmousedown={handleDragStart}>
      <div class="compact-strip-top">
        <TaskList compact={true} />
        <button
          class="compact-expand-btn"
          type="button"
          onmousedown={(e) => e.stopPropagation()}
          onclick={() => switchViewMode('full')}
          title="Развернуть окно">◱</button
        >
      </div>
      <div class="compact-strip-pomodoro">
        <PomodoroTimer workMinutes={pomodoroWork} breakMinutes={pomodoroBreak} compact={true} />
      </div>
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
        onclick={() => switchViewMode('taskbar')}
        title="Режим панели"
      >
        ▬
      </button>
      <button
        class="icon-btn"
        type="button"
        onmousedown={(e) => e.stopPropagation()}
        onclick={() => switchViewMode('compact')}
        title="Свернуть до активной задачи"
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

    <PomodoroTimer workMinutes={pomodoroWork} breakMinutes={pomodoroBreak} />

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
  {#if debugMode}
    <div class="debug-overlay" role="log" aria-label="Журнал отладки">
      <div class="debug-header">
        <span class="debug-title">Отладка</span>
        <button
          type="button"
          class="debug-clear"
          onclick={() => { debug.clearLogs(); debugLogs = []; debugLogsKey += 1; }}
        >
          Очистить
        </button>
      </div>
      <div class="debug-list" key={debugLogsKey}>
        {#each debugLogs as entry, i (entry.time + String(i) + entry.msg)}
          <div class="debug-line" class:debug-warn={entry.level === 'warn'} class:debug-error={entry.level === 'error'}>
            <span class="debug-time">{entry.time}</span>
            <span class="debug-msg">{entry.msg}</span>
            {#if entry.data !== undefined && entry.data !== null}
              <pre class="debug-data">{typeof entry.data === 'object' ? JSON.stringify(entry.data, null, 0) : String(entry.data)}</pre>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .app {
    width: 100%;
    min-width: 320px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    backdrop-filter: blur(24px) saturate(140%);
    -webkit-backdrop-filter: blur(24px) saturate(140%);
    border: 1px solid var(--border-color);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    font-family: "Rajdhani", "Orbitron", "Exo 2", sans-serif;
    isolation: isolate;
  }

  .app.taskbar-mode {
    min-width: unset;
    height: auto;
    min-height: 40px;
    border-radius: 0;
    border: none;
    border-bottom: 1px solid var(--border-color);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    overflow: visible;
  }

  .drag-header {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem var(--content-padding-h, 1rem);
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
    color: var(--text-primary);
    font-size: 0.8rem;
    text-align: center;
    pointer-events: none;
  }

  .unlock-hint kbd {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    background: var(--group-bg);
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
    padding-top: 0.75rem;
  }

  .compact-strip {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0.35rem 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 0;
    cursor: move;
    user-select: none;
    -webkit-user-select: none;
  }

  .compact-strip-top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .compact-strip-top :global(.task-list-container) {
    flex: 1;
    min-width: 0;
    padding: 0;
    overflow: visible;
  }

  .compact-strip-pomodoro {
    width: 100%;
    margin-top: 0.35rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--group-border);
  }

  .compact-expand-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 1rem;
    cursor: pointer;
    padding: 0.15rem 0.4rem;
    border-radius: 0;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .compact-expand-btn:hover {
    background: var(--group-bg);
    color: var(--accent);
  }

  .xp-bar {
    height: 16px;
    background: var(--xp-bar-bg);
    position: relative;
    overflow: hidden;
    z-index: 10;
    display: flex;
    align-items: center;
    padding: 0 var(--content-padding-h, 1rem);
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
    color: var(--text-primary);
    letter-spacing: 1px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  .debug-overlay {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 220px;
    background: var(--bg-primary);
    border-top: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    z-index: 9999;
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
  }
  .debug-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--group-border);
  }
  .debug-title {
    color: var(--text-secondary);
    font-weight: 600;
  }
  .debug-clear {
    background: var(--group-bg);
    border: 1px solid var(--group-border);
    color: var(--text-primary);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.7rem;
  }
  .debug-clear:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .debug-list {
    overflow-y: auto;
    padding: 0.25rem;
    flex: 1;
    min-height: 0;
  }
  .debug-line {
    color: var(--text-primary);
    padding: 0.15rem 0;
    border-bottom: 1px solid var(--group-border);
    word-break: break-word;
  }
  .debug-line.debug-warn .debug-msg { color: #fbbf24; }
  .debug-line.debug-error .debug-msg { color: #f87171; }
  .debug-time {
    color: var(--text-secondary);
    margin-right: 0.5rem;
  }
  .debug-data {
    margin: 0.15rem 0 0 1rem;
    font-size: 0.65rem;
    color: var(--text-secondary);
    white-space: pre-wrap;
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
