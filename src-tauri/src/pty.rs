use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::thread;

use anyhow::Result;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, Runtime};

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    pid: Option<u32>,
}

static SESSIONS: Lazy<Mutex<HashMap<u32, PtySession>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static NEXT_ID: AtomicU32 = AtomicU32::new(1);

fn login_shell() -> String {
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .ok();
    if let Some(user) = user {
        if let Ok(passwd) = std::fs::read_to_string("/etc/passwd") {
            for line in passwd.lines() {
                let mut fields = line.split(':');
                if fields.next() == Some(&user) {
                    let shell = fields.nth(5).unwrap_or("");
                    if !shell.is_empty() && std::path::Path::new(shell).exists() {
                        return shell.to_string();
                    }
                }
            }
        }
    }
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

fn shell_command() -> CommandBuilder {
    let shell = login_shell();
    let mut cmd = CommandBuilder::new(&shell);

    if let Ok(home) = std::env::var("HOME") {
        cmd.cwd(home);
    }
    cmd.env("SHELL", &shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("MTERMINAL", "1");
    cmd
}

#[tauri::command]
pub fn pty_spawn<R: Runtime>(app: AppHandle<R>, rows: u16, cols: u16) -> Result<u32, String> {
    spawn_internal(app, rows, cols).map_err(|e| e.to_string())
}

fn spawn_internal<R: Runtime>(app: AppHandle<R>, rows: u16, cols: u16) -> Result<u32> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let cmd = shell_command();
    let child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);

    let pid = child.process_id();
    let writer = pair.master.take_writer()?;
    let mut reader = pair.master.try_clone_reader()?;

    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);

    SESSIONS.lock().insert(
        id,
        PtySession {
            master: pair.master,
            writer,
            child,
            pid,
        },
    );

    let event_name = format!("pty://data/{}", id);
    let app_clone = app.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    if app_clone.emit(&event_name, chunk).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = app_clone.emit(&format!("pty://exit/{}", id), ());
        SESSIONS.lock().remove(&id);
    });

    Ok(id)
}

#[tauri::command]
pub fn pty_write(id: u32, data: String) -> Result<(), String> {
    let mut sessions = SESSIONS.lock();
    let s = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("no pty session {}", id))?;
    s.writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(id: u32, rows: u16, cols: u16) -> Result<(), String> {
    let sessions = SESSIONS.lock();
    let s = sessions
        .get(&id)
        .ok_or_else(|| format!("no pty session {}", id))?;
    s.master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(id: u32) -> Result<(), String> {
    if let Some(mut s) = SESSIONS.lock().remove(&id) {
        let _ = s.child.kill();
        let _ = s.child.wait();
    }
    Ok(())
}

fn descendant_leaf(root_pid: u32) -> u32 {
    let mut current = root_pid;
    let mut depth = 0;
    loop {
        if depth > 16 {
            return current;
        }
        let mut newest_child: Option<(u32, u64)> = None;
        let read_dir = match std::fs::read_dir("/proc") {
            Ok(d) => d,
            Err(_) => return current,
        };
        for entry in read_dir.flatten() {
            let name = entry.file_name();
            let pid_str = match name.to_str() {
                Some(s) => s,
                None => continue,
            };
            let pid: u32 = match pid_str.parse() {
                Ok(p) => p,
                Err(_) => continue,
            };
            let stat = match std::fs::read_to_string(format!("/proc/{}/stat", pid)) {
                Ok(s) => s,
                Err(_) => continue,
            };
            let after_paren = match stat.rfind(") ") {
                Some(i) => &stat[i + 2..],
                None => continue,
            };
            let mut fields = after_paren.split_whitespace();
            fields.next();
            let ppid: u32 = match fields.next().and_then(|s| s.parse().ok()) {
                Some(p) => p,
                None => continue,
            };
            if ppid != current {
                continue;
            }
            let starttime: u64 = fields.nth(16).and_then(|s| s.parse().ok()).unwrap_or(0);
            match newest_child {
                None => newest_child = Some((pid, starttime)),
                Some((_, prev)) if starttime >= prev => newest_child = Some((pid, starttime)),
                _ => {}
            }
        }
        match newest_child {
            Some((p, _)) => {
                current = p;
                depth += 1;
            }
            None => return current,
        }
    }
}

#[derive(serde::Serialize)]
pub struct TabInfo {
    pub cwd: Option<String>,
    pub cmd: Option<String>,
    pub pid: u32,
}

#[tauri::command]
pub fn pty_info(id: u32) -> Result<TabInfo, String> {
    let pid = {
        let sessions = SESSIONS.lock();
        let s = sessions
            .get(&id)
            .ok_or_else(|| format!("no pty session {}", id))?;
        s.pid.ok_or_else(|| "no pid".to_string())?
    };
    let leaf = descendant_leaf(pid);
    let cwd = std::fs::read_link(format!("/proc/{}/cwd", leaf))
        .ok()
        .map(|p| p.to_string_lossy().to_string());
    let cmd = std::fs::read_to_string(format!("/proc/{}/comm", leaf))
        .ok()
        .map(|s| s.trim().to_string());
    Ok(TabInfo {
        cwd,
        cmd,
        pid: leaf,
    })
}

#[derive(serde::Serialize)]
pub struct SystemInfo {
    pub user: String,
    pub host: String,
}

#[tauri::command]
pub fn system_info() -> SystemInfo {
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .unwrap_or_else(|_| "user".to_string());
    let host = std::fs::read_to_string("/etc/hostname")
        .ok()
        .map(|s| s.trim().to_string())
        .or_else(|| std::env::var("HOSTNAME").ok())
        .unwrap_or_else(|| "host".to_string());
    SystemInfo { user, host }
}
