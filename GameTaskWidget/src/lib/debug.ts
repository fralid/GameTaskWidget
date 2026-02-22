/**
 * Live debug log for testing. Enable "Режим отладки" in settings to show the overlay.
 */

export type DebugLevel = 'log' | 'warn' | 'error';

export interface DebugEntry {
  time: string;
  level: DebugLevel;
  msg: string;
  data?: unknown;
}

const MAX_ENTRIES = 200;
const entries: DebugEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

function addEntry(level: DebugLevel, msg: string, data?: unknown) {
  let time: string;
  try {
    time = new Date().toLocaleTimeString('ru-RU', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  } catch {
    time = new Date().toLocaleTimeString('ru-RU', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  entries.push({ time, level, msg, data });
  if (entries.length > MAX_ENTRIES) entries.shift();
  console[level === 'log' ? 'log' : level](msg, data ?? '');
  emit();
}

export function log(msg: string, data?: unknown) {
  addEntry('log', msg, data);
}

export function warn(msg: string, data?: unknown) {
  addEntry('warn', msg, data);
}

export function error(msg: string, data?: unknown) {
  addEntry('error', msg, data);
}

export function getLogs(): DebugEntry[] {
  return [...entries];
}

export function clearLogs() {
  entries.length = 0;
  emit();
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
