// Prevents console window on Windows (app closes = process exits, no leftover console)
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager, Window};
use tauri_plugin_global_shortcut::ShortcutState;

// Отключено: на Windows даёт видимую рамку слева/справа/снизу (сверху нет)
// #[cfg(target_os = "windows")]
// use window_vibrancy::apply_blur;

static LOCK_STATE: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
struct LockState {
    locked: bool,
}

// Validate that a path is a markdown file and doesn't contain traversal
fn validate_md_path(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if path.contains("..") {
        return Err("Path traversal not allowed".into());
    }
    match p.extension().and_then(|e| e.to_str()) {
        Some("md") | Some("markdown") => Ok(p),
        _ => Err("Only .md / .markdown files are allowed".into()),
    }
}

#[tauri::command]
fn toggle_lock_mode(window: Window, locked: bool) -> Result<bool, String> {
    LOCK_STATE.store(locked, Ordering::SeqCst);
    window
        .set_ignore_cursor_events(locked)
        .map_err(|e| e.to_string())?;
    // Return the actual state so frontend can sync
    Ok(LOCK_STATE.load(Ordering::SeqCst))
}

#[tauri::command]
fn start_dragging(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn read_md_tasks(path: String) -> Result<String, String> {
    let p = validate_md_path(&path)?;
    tokio::fs::read_to_string(&p)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_md_tasks(path: String, content: String) -> Result<(), String> {
    let p = validate_md_path(&path)?;
    tokio::fs::write(&p, content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn select_md_file() -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown"])
        .pick_file();
    Ok(path.map(|p| p.display().to_string()))
}

// File watcher state stored globally
struct WatcherState {
    watcher: Option<RecommendedWatcher>,
}

#[tauri::command]
fn watch_md_file(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = validate_md_path(&path)?;
    let state = app_handle.state::<Mutex<WatcherState>>();
    let mut guard = state.lock().map_err(|e| e.to_string())?;

    // Drop old watcher
    guard.watcher = None;

    let handle = app_handle.clone();
    let watched_path = p.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(event) = res {
            let dominated = event.kind.is_modify() || event.kind.is_create();
            if dominated {
                let _ = handle.emit_to("main", "md-file-changed", watched_path.display().to_string());
            }
        }
    })
    .map_err(|e| e.to_string())?;

    // Watch the parent directory (some editors create tmp files)
    let watch_dir = p.parent().unwrap_or(&p);
    watcher
        .watch(watch_dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    guard.watcher = Some(watcher);
    Ok(())
}

#[tauri::command]
fn unwatch_md_file(app_handle: tauri::AppHandle) -> Result<(), String> {
    let state = app_handle.state::<Mutex<WatcherState>>();
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    guard.watcher = None;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
                let _ = w.show();
                let _ = w.unminimize();
            }
        }))
        .manage(Mutex::new(WatcherState { watcher: None }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .skip_initial_state("main")
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["Control+Shift+Space"])
                .expect("shortcut parse")
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let current = LOCK_STATE.load(Ordering::SeqCst);
                        let new_state = !current;
                        LOCK_STATE.store(new_state, Ordering::SeqCst);
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.set_ignore_cursor_events(new_state);
                            let payload = LockState { locked: new_state };
                            let _ = app.emit_to("main", "lock-state-changed", payload);
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            toggle_lock_mode,
            start_dragging,
            read_md_tasks,
            write_md_tasks,
            select_md_file,
            watch_md_file,
            unwatch_md_file,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(true);
                let _ = window.set_ignore_cursor_events(false);
                // #[cfg(target_os = "windows")]
                // let _ = apply_blur(&window, Some((18, 18, 24, 200)));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
