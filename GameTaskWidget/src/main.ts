import './app.css';
import { initGlobalHandlers, showError, copyDebugInfo } from './debug';
import { mount } from 'svelte';
import App from './App.svelte';

initGlobalHandlers();

const loading = document.getElementById('loading');
const root = document.getElementById('app')!;
const errorBox = document.getElementById('error-box');
const errorCopy = document.getElementById('error-copy');
const errorClose = document.getElementById('error-close');
const debugBar = document.getElementById('debug-bar');
const debugCopy = document.getElementById('debug-copy');

function hideLoading() {
  if (loading) loading.remove();
}

function wireErrorUI() {
  errorCopy?.addEventListener('click', () => {
    copyDebugInfo().then(() => {
      if (errorCopy instanceof HTMLButtonElement) errorCopy.textContent = 'Скопировано';
      setTimeout(() => { if (errorCopy instanceof HTMLButtonElement) errorCopy.textContent = 'Скопировать отладку'; }, 1500);
    }).catch(() => {});
  });
  errorClose?.addEventListener('click', () => {
    if (errorBox) errorBox.style.display = 'none';
  });
}

function wireDebugBar() {
  debugCopy?.addEventListener('click', () => {
    copyDebugInfo().then(() => {
      if (debugCopy instanceof HTMLButtonElement) debugCopy.textContent = 'Скопировано';
      setTimeout(() => { if (debugCopy instanceof HTMLButtonElement) debugCopy.textContent = 'Скопировать отладку'; }, 1500);
    }).catch(() => {});
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      if (debugBar) debugBar.style.display = debugBar.style.display === 'none' ? 'flex' : 'none';
    }
  });
}

wireErrorUI();
wireDebugBar();

const LOAD_TIMEOUT_MS = 8000;

function bootstrap() {
  const timeoutId = setTimeout(() => {
    const mounted = root.querySelector('.app');
    if (!mounted) {
      hideLoading();
      showError(new Error('Таймаут загрузки приложения (8 с). Скопируйте отладку и отправьте разработчику.'));
      if (debugBar) debugBar.style.display = 'flex';
    }
  }, LOAD_TIMEOUT_MS);

  try {
    mount(App, { target: root });
    clearTimeout(timeoutId);
    hideLoading();
  } catch (e) {
    clearTimeout(timeoutId);
    hideLoading();
    showError(e);
    if (debugBar) debugBar.style.display = 'flex';
  }
}

bootstrap();

export default {};
