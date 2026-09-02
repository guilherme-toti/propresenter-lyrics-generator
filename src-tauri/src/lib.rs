use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::path::BaseDirectory;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Holds the bundled Next.js server's child process so it can be killed when
/// the window closes. Only ever populated in release builds — dev builds
/// point straight at `next dev` (started by the Tauri CLI's beforeDevCommand)
/// and never spawn a sidecar.
struct ServerProcess(Mutex<Option<CommandChild>>);

const LOOPBACK: &str = "127.0.0.1";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let url = if cfg!(debug_assertions) {
                // `next dev` is already running by the time Tauri's devUrl check
                // passes control here — see build.devUrl/beforeDevCommand.
                format!("http://{LOOPBACK}:3000")
            } else {
                let port = pick_free_port();
                spawn_bundled_server(app.handle(), port)?;
                wait_for_server(port, Duration::from_secs(20));
                format!("http://{LOOPBACK}:{port}")
            };

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse().unwrap()))
                .title("PMA Lyrics Studio")
                .inner_size(1280.0, 840.0)
                .min_inner_size(960.0, 600.0)
                .build()?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                if let Some(child) = window.state::<ServerProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Asks the OS for an ephemeral loopback port. There is a tiny race between
/// dropping this listener and the sidecar binding the same port, but it's
/// the same trade-off every "let the OS pick a free port" tool makes.
fn pick_free_port() -> u16 {
    TcpListener::bind((LOOPBACK, 0))
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(3000)
}

/// Spawns the bundled Node runtime (`binaries/node-<target-triple>`, declared
/// as a Tauri sidecar in `tauri.conf.json`) against the standalone Next.js
/// server assembled into `resources/server` by `npm run tauri:prebuild`.
fn spawn_bundled_server(
    app: &tauri::AppHandle,
    port: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    let server_dir = app.path().resolve("server", BaseDirectory::Resource)?;
    let server_entry = server_dir.join("server.js");

    let mut env: Vec<(String, String)> = vec![
        ("PORT".into(), port.to_string()),
        ("HOSTNAME".into(), LOOPBACK.into()),
        ("NODE_ENV".into(), "production".into()),
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
