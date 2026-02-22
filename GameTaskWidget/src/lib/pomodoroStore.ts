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
/** Target end time (ms) to avoid setInterval drift */
let endTimeMs: number = 0;

function notify() {
  listeners.forEach((cb) => cb());
}

function startPhase(p: PomodoroPhase) {
  phase = p;
  const w = Math.max(1, Math.min(120, workMinutes));
  const b = Math.max(1, Math.min(60, breakMinutes));
  remainingSeconds = p === "work" ? w * 60 : b * 60;
  endTimeMs = Date.now() + remainingSeconds * 1000;
  notify();
}

function tick() {
  if (isRunning && endTimeMs > 0) {
    const left = Math.ceil((endTimeMs - Date.now()) / 1000);
    remainingSeconds = Math.max(0, left);
  }
  if (remainingSeconds <= 0) {
    startPhase(phase === "work" ? "break" : "work");
    return;
  }
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
      endTimeMs = Date.now() + remainingSeconds * 1000;
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
