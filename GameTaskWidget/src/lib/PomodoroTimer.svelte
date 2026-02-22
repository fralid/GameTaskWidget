<script lang="ts">
  import { onMount } from "svelte";
  import { pomodoroStore } from "./pomodoroStore";

  interface Props {
    workMinutes: number;
    breakMinutes: number;
    compact?: boolean;
  }

  let { workMinutes, breakMinutes, compact = false }: Props = $props();

  let phase = $state(pomodoroStore.getPhase());
  let remainingSeconds = $state(pomodoroStore.getRemainingSeconds());
  let isRunning = $state(pomodoroStore.getIsRunning());

  let displayTime = $derived(
    `${Math.floor(remainingSeconds / 60).toString().padStart(2, "0")}:${(remainingSeconds % 60).toString().padStart(2, "0")}`,
  );

  function sync() {
    phase = pomodoroStore.getPhase();
    remainingSeconds = pomodoroStore.getRemainingSeconds();
    isRunning = pomodoroStore.getIsRunning();
  }

  function startPause() {
    pomodoroStore.startPause();
  }

  function reset() {
    pomodoroStore.reset();
  }

  onMount(() => {
    pomodoroStore.setDurations(workMinutes, breakMinutes);
    sync();
    const unsub = pomodoroStore.subscribe(sync);
    return unsub;
  });

  $effect(() => {
    workMinutes;
    breakMinutes;
    pomodoroStore.setDurations(workMinutes, breakMinutes);
  });
</script>

<div class="pomodoro" class:compact role="timer" aria-label="Помидор таймер">
  <span class="pomodoro-phase">{phase === "work" ? "Работа" : "Перерыв"}</span>
  <span class="pomodoro-time">{displayTime}</span>
  <div class="pomodoro-actions">
    <button
      type="button"
      class="pomodoro-btn"
      onclick={startPause}
      title={isRunning ? "Пауза" : "Старт"}
    >
      {isRunning ? "⏸" : "▶"}
    </button>
    <button
      type="button"
      class="pomodoro-btn"
      onclick={reset}
      title="Сброс"
    >
      ↺
    </button>
  </div>
</div>

<style>
  .pomodoro {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem var(--content-padding-h, 1rem);
    background: var(--group-bg);
    border-bottom: 1px solid var(--group-border);
    font-family: "Orbitron", "Rajdhani", sans-serif;
  }

  .pomodoro-phase {
    font-size: 0.7rem;
    color: var(--text-secondary);
    min-width: 4rem;
  }

  .pomodoro-time {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: 0.05em;
    min-width: 3rem;
  }

  .pomodoro-actions {
    display: flex;
    gap: 0.2rem;
    margin-left: auto;
  }

  .pomodoro-btn {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    transition: border-color 0.2s, background 0.2s;
  }

  .pomodoro-btn:hover {
    background: var(--bg-secondary);
    border-color: var(--accent);
    color: var(--accent);
  }

  .pomodoro.compact {
    padding: 0.25rem 0.4rem;
    gap: 0.4rem;
    border-bottom: none;
    background: transparent;
  }

  .pomodoro.compact .pomodoro-phase {
    min-width: 3.5rem;
    font-size: 0.75rem;
  }

  .pomodoro.compact .pomodoro-time {
    font-size: 0.95rem;
    min-width: 3rem;
  }

  .pomodoro.compact .pomodoro-btn {
    width: 24px;
    height: 24px;
    font-size: 0.8rem;
  }
</style>
