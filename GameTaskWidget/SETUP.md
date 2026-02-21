# Инструкция по установке и запуску

## Требования

1. **Node.js** 18+ - [скачать](https://nodejs.org/)
2. **Rust** - установить через [rustup](https://rustup.rs/):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
   Или на Windows через установщик с сайта.

3. **WebView2** - обычно уже установлен в Windows 10/11. Если нет, скачать с [официального сайта Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

## Установка зависимостей

```bash
cd GameTaskWidget
npm install
```

## Создание иконки (обязательно перед первым запуском)

Для сборки под Windows нужен файл `src-tauri/icons/icon.ico`. Создайте его командой:

```bash
npm run create-icon
```

(Скрипт создаёт минимальную иконку 16x16. Если команда уже выполнялась — можно не повторять.)

## Запуск в режиме разработки

```bash
npm run tauri:dev
```

Это запустит:
- Vite dev server на `http://localhost:1420`
- Tauri приложение с hot-reload

## Сборка приложения

```bash
npm run tauri:build
```

Собранные файлы будут в `src-tauri/target/release/`:
- `.exe` файл для Windows
- `.msi` установщик (если настроен)

## Устранение ошибок

**Ошибка:** `Failed to resolve import "@tauri-apps/plugin-dialog"`  
**Причина:** пакет не установлен в `node_modules`.  
**Решение:** в папке проекта выполните:
```bash
cd GameTaskWidget
npm install
```
Убедитесь, что появилась папка `node_modules/@tauri-apps/plugin-dialog`. После этого перезапустите dev-сервер (`npm run tauri:dev` или `npm run dev`).

## Примечания

- При первом запуске Rust может скачивать зависимости - это нормально
- Если возникают проблемы с иконками, создайте временные PNG файлы в `src-tauri/icons/`
- Для работы hotkey (Ctrl+Shift+Space) может потребоваться разрешение на глобальные горячие клавиши в настройках Windows
