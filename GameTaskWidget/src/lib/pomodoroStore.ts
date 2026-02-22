/**
 * Shared Pomodoro timer state so compact and full view stay in sync.
 */

export type PomodoroPhase = "work" | "break";

type Listener = () => void;
const listeners = new Set<Listener>();

let phase: PomodoroPhase = "work";
let remainingSeconds = 25 * 60;
let isRunning = false;
let workMinutes = 25;
let breakMinutes = 5;
let intervalId: ReturnType<typeof setInterval> | null = null;

function notify() {
  listeners.forEach((cb) => cb());
}

function startPhase(p: PomodoroPhase) {
  phase = p;
  const w = Math.max(1, Math.min(120, workMinutes));
  const b = Math.max(1, Math.min(60, breakMinutes));
  remainingSeconds = p === "work" ? w * 60 : b * 60;
  notify();
}

function tick() {
  if (remainingSeconds <= 0) {
    startPhase(phase === "work" ? "break" : "work");
    return;
  }
  remainingSeconds -= 1;
  notify();
}

export const pomodoroStore = {
  subscribe(callback: Listener): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },

  getPhase(): PomodoroPhase {
    return phase;
  },

  getRemainingSeconds(): number {
    return remainingSeconds;
  },

  getIsRunning(): boolean {
    return isRunning;
  },

  getWorkMinutes(): number {
    return workMinutes;
  },

  getBreakMinutes(): number {
    return breakMinutes;
  },

  setDurations(work: number, break_: number): void {
    workMinutes = Math.max(1, Math.min(120, Math.round(work)));
    breakMinutes = Math.max(1, Math.min(60, Math.round(break_)));
    notify();
  },

  startPause(): void {
    if (isRunning) {
      isRunning = false;
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    } else {
      isRunning = true;
      intervalId = setInterval(tick, 1000);
    }
    notify();
  },

  reset(): void {
    isRunning = false;
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    startPhase("work");
  },
};
