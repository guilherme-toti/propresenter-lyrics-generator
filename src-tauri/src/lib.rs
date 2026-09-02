use std::net::TcpStream;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Holds the bundled Next.js server's child process so it can be killed when
/// the window closes. Only ever populated in release builds — dev builds
/// point straight at `next dev` (started by the Tauri CLI's beforeDevCommand)
/// and never spawn a sidecar.
struct ServerProcess(Mutex<Option<CommandChild>>);

/// The main window's URL, minus the path — computed once in setup() (dev vs.
/// bundled-sidecar) and reused whenever the quick-add window is (re)created.
struct BaseUrl(String);

const LOOPBACK: &str = "127.0.0.1";
/// Fixed (not OS-assigned) so capabilities/default.json can name an exact
/// `remote.urls` origin for the bundled server's window — Tauri's ACL scopes
/// permissions (dialog, shell sidecar spawn, …) to specific window URLs, and
/// an ephemeral port can't be listed in advance. Distinct from `next dev`'s
/// 3000 so a leftover dev server never collides with the packaged app.
const PROD_PORT: u16 = 17872;

const QUICK_ADD_SHORTCUT: &str = "CmdOrCtrl+Alt+Shift+N";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin({
            let target: Shortcut = QUICK_ADD_SHORTCUT
                .parse()
                .expect("QUICK_ADD_SHORTCUT must be a valid accelerator string");
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &target && event.state() == ShortcutState::Pressed {
                        show_quick_add(app);
                    }
                })
                .build()
        })
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // A crashed/aborted process gives the user nothing but a system crash
            // reporter — a native dialog explaining what actually went wrong (and
            // then a clean exit) is a much better failure mode than letting `?`
            // propagate a setup error out of this closure. Tauri's own handling
            // of *that* case aborts the whole process.
            if let Err(err) = create_main_window(app.handle()) {
                log::error!("failed to start: {err}");
                // blocking_show() must not run on the main thread (it would freeze
                // the app instead of showing anything) — off-thread, then exit once
                // the user has dismissed it.
                let handle = app.handle().clone();
                let message = format!("Falha ao iniciar o app:\n\n{err}");
                std::thread::spawn(move || {
                    handle
                        .dialog()
                        .message(message)
                        .title("PMA Lyrics Studio — Erro ao iniciar")
                        .kind(MessageDialogKind::Error)
                        .blocking_show();
                    handle.exit(1);
                });
                return Ok(());
            }

            // Best-effort: the app is fully usable without the quick-add hotkey (the
            // "Nova música" button covers the same flow), so a registration failure
            // — the combo already taken by another app, a permission the OS denied,
            // whatever — must not take the whole app down with it.
            if let Err(err) = app.global_shortcut().register(QUICK_ADD_SHORTCUT) {
                log::error!("failed to register quick-add global shortcut: {err}");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                if let Some(child) = window.state::<ServerProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Computes the app's base URL (dev: `next dev`, already running; release:
/// spawns the bundled sidecar server first) and opens the main window on it.
fn create_main_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let base_url = if cfg!(debug_assertions) {
        // `next dev` is already running by the time Tauri's devUrl check
        // passes control here — see build.devUrl/beforeDevCommand.
        format!("http://{LOOPBACK}:3000")
    } else {
        spawn_bundled_server(app, PROD_PORT)?;
        wait_for_server(PROD_PORT, Duration::from_secs(20));
        format!("http://{LOOPBACK}:{PROD_PORT}")
    };
    app.manage(BaseUrl(base_url.clone()));

    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(base_url.parse()?))
        .title("PMA Lyrics Studio")
        .inner_size(1280.0, 840.0)
        .min_inner_size(960.0, 600.0)
        .build()?;

    Ok(())
}

/// Shows the "quick add a song" popup (global hotkey target), creating it on
/// first use and just re-showing/focusing it afterwards — recreating the
/// webview every time would add a visible reload delay to what's meant to be
/// an instant, spotlight-style popup.
fn show_quick_add(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("quick-add") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("quick-add-shown", ());
        return;
    }

    let base_url = app.state::<BaseUrl>().0.clone();
    let url = format!("{base_url}/quick-add");
    let Ok(parsed) = url.parse() else { return };

    // A background app (this hotkey typically fires while some other app, e.g.
    // ProPresenter, is focused) doesn't automatically get OS-level keyboard
    // focus for a window it just created — an explicit set_focus() request is
    // needed, or the input inside never actually becomes focusable until the
    // user clicks it once themselves.
    if let Ok(window) = WebviewWindowBuilder::new(app, "quick-add", WebviewUrl::External(parsed))
        .title("Nova música")
        .inner_size(560.0, 100.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .center()
        .skip_taskbar(true)
        .build()
    {
        let _ = window.set_focus();
    }
}

/// Spawns the bundled Node runtime (`binaries/node-<target-triple>`, declared
/// as a Tauri sidecar in `tauri.conf.json`) against the standalone Next.js
/// server assembled into `resources/server` by `npm run tauri:prebuild`.
fn spawn_bundled_server(
    app: &tauri::AppHandle,
    port: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    // The bundler preserves the full glob path from tauri.conf.json's
    // `bundle.resources` ("resources/server/**/*") under the resource root —
    // confirmed against the actual .deb layout — so this must match, not
    // just "server".
    let server_dir = app.path().resolve("resources/server", BaseDirectory::Resource)?;
    let server_entry = server_dir.join("server.js");

    let mut env: Vec<(String, String)> = vec![
        ("PORT".into(), port.to_string()),
        ("HOSTNAME".into(), LOOPBACK.into()),
        ("NODE_ENV".into(), "production".into()),
        // Lets server-side API routes (e.g. /api/settings/api-key, which writes
        // to this same .env file) confirm they're running inside the desktop
        // sidecar before acting — that route must 404 on a plain web deploy,
        // where it would otherwise let any visitor overwrite the shared
        // deployment's env vars.
        ("PMA_DESKTOP_APP".into(), "1".into()),
    ];
    env.extend(load_user_env(app));

    let command = app
        .shell()
        .sidecar("node")?
        .args([server_entry.to_string_lossy().to_string()])
        .current_dir(server_dir)
        .envs(env);

    let (mut events, child) = command.spawn()?;

    app.state::<ServerProcess>().0.lock().unwrap().replace(child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    log::info!("[server] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    log::error!("[server] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(err) => log::error!("[server] {err}"),
                _ => {}
            }
        }
    });

    Ok(())
}

/// Reads `OPENROUTER_API_KEY` (and any other server env vars) from a
/// user-editable `.env` file in the app's config directory — the packaged
/// equivalent of the `.env.local` file used in development. Missing file is
/// not an error: the AI flow just reports itself unconfigured, same as dev.
fn load_user_env(app: &tauri::AppHandle) -> Vec<(String, String)> {
    let Ok(config_dir) = app.path().app_config_dir() else {
        return Vec::new();
    };
    let env_path = config_dir.join(".env");
    match dotenvy::from_path_iter(&env_path) {
        Ok(iter) => iter.filter_map(Result::ok).collect(),
        Err(_) => Vec::new(),
    }
}

/// Blocks setup until the bundled server accepts TCP connections, or the
/// timeout elapses (the window opens against whatever happened last either
/// way — a slow-starting server just shows a connection error briefly).
fn wait_for_server(port: u16, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if TcpStream::connect((LOOPBACK, port)).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}
