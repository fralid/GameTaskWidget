/**
 * Debug state and helpers — no Tauri/plugin imports, safe to load first.
 */
export type DebugEntry = { time: string; type: 'error' | 'rejection' | 'info'; message: string; stack?: string };

const log: DebugEntry[] = [];
const MAX_ENTRIES = 50;

function formatErr(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) return { message: e.message, stack: e.stack };
  if (typeof e === 'object' && e !== null && 'message' in e) return { message: String((e as { message: unknown }).message), stack: (e as { stack?: string }).stack };
  return { message: String(e) };
}

function showErrorUI(message: string, stack?: string) {
  const box = document.getElementById('error-box');
  if (!box) return;
  const msgEl = document.getElementById('error-msg');
  const stackEl = document.getElementById('error-stack');
  if (msgEl) msgEl.textContent = message;
  if (stackEl) {
    stackEl.textContent = stack || '';
    stackEl.style.display = stack ? 'block' : 'none';
  }
  box.style.display = 'block';
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('Clipboard not available'));
}

export function addEntry(type: DebugEntry['type'], message: string, stack?: string) {
  const entry: DebugEntry = { time: new Date().toISOString(), type, message, stack };
  log.push(entry);
  if (log.length > MAX_ENTRIES) log.shift();
  return entry;
}

export function showError(e: unknown) {
  const { message, stack } = formatErr(e);
  addEntry('error', message, stack);
  showErrorUI(message, stack);
}

export function getDebugInfo(extra: Record<string, string> = {}): string {
  const lines: string[] = [
    '--- Game Task Widget Debug ---',
    `time: ${new Date().toISOString()}`,
    `url: ${typeof location !== 'undefined' ? location.href : 'unknown'}`,
    `userAgent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    '',
    '--- Last errors / rejections ---',
    ...log.slice(-15).map((e) => `[${e.time}] ${e.type}: ${e.message}${e.stack ? '\n' + e.stack : ''}`),
  ];
  return lines.join('\n');
}

export function copyDebugInfo(extra: Record<string, string> = {}): Promise<void> {
  return copyText(getDebugInfo(extra));
}

export function initGlobalHandlers() {
  window.onerror = (message, source, lineno, colno, error) => {
    const msg = [message, source, lineno, colno].filter(Boolean).join(' ');
    const stack = error?.stack;
    addEntry('error', msg, stack);
    showErrorUI(msg, stack);
    return false;
  };
  window.addEventListener('unhandledrejection', (event) => {
    const { message, stack } = formatErr(event.reason);
    addEntry('rejection', message, stack);
    showErrorUI(`Unhandled rejection: ${message}`, stack);
  });
}

export { log as debugLog };
