use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

use anyhow::Result;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::ipc::Channel;

const RING_CAPACITY: usize = 65536;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "value")]
pub enum PtyEvent {
    Data(String),
    Exit,
}

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    pid: Option<u32>,
    output_buffer: Arc<Mutex<VecDeque<u8>>>,
    last_activity: Arc<Mutex<Instant>>,
}

static SESSIONS: Lazy<Mutex<HashMap<u32, PtySession>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static NEXT_ID: AtomicU32 = AtomicU32::new(1);

#[cfg(unix)]
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

#[cfg(windows)]
fn login_shell() -> String {
    use std::path::Path;
    let candidates = [
        std::env::var("MTERMINAL_SHELL").ok(),
        which_path("pwsh.exe"),
        which_path("powershell.exe"),
        std::env::var("COMSPEC").ok(),
        Some("cmd.exe".to_string()),
    ];
    for c in candidates.into_iter().flatten() {
        if !c.is_empty() && (Path::new(&c).exists() || which_path(&c).is_some()) {
            return c;
        }
    }
    "cmd.exe".to_string()
}

#[cfg(windows)]
fn which_path(prog: &str) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(prog);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

fn shell_command(
    shell_override: Option<&str>,
    args: &[String],
    extra_env: &HashMap<String, String>,
) -> CommandBuilder {
    let shell = shell_override
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(login_shell);

    let mut cmd = CommandBuilder::new(&shell);
    for a in args {
        if !a.is_empty() {
            cmd.arg(a);
        }
    }

    let home = std::env::var("HOME")
        .ok()
        .or_else(|| std::env::var("USERPROFILE").ok());
    if let Some(home) = home {
        cmd.cwd(home);
    }
    cmd.env("SHELL", &shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("MTERMINAL", "1");
    for (k, v) in extra_env {
        cmd.env(k, v);
    }
    cmd
}

#[tauri::command]
pub fn pty_spawn(
    events: Channel<PtyEvent>,
    rows: u16,
    cols: u16,
    shell: Option<String>,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
) -> Result<u32, String> {
    let cmd = shell_command(
        shell.as_deref(),
        &args.unwrap_or_default(),
        &env.unwrap_or_default(),
    );
    spawn_with_command(events, rows, cols, cmd).map_err(|e| e.to_string())
}

pub fn spawn_with_command(
    events: Channel<PtyEvent>,
    rows: u16,
    cols: u16,
    cmd: CommandBuilder,
) -> Result<u32> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);

    let pid = child.process_id();
    let writer = pair.master.take_writer()?;
    let mut reader = pair.master.try_clone_reader()?;

    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);

    let output_buffer = Arc::new(Mutex::new(VecDeque::with_capacity(RING_CAPACITY)));
    let last_activity = Arc::new(Mutex::new(Instant::now()));

    SESSIONS.lock().insert(
        id,
        PtySession {
            master: pair.master,
            writer,
            child,
            pid,
            output_buffer: output_buffer.clone(),
            last_activity: last_activity.clone(),
        },
    );

    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    {
                        let mut rb = output_buffer.lock();
                        for &b in &buf[..n] {
                            if rb.len() == RING_CAPACITY {
                                rb.pop_front();
                            }
                            rb.push_back(b);
                        }
                    }
                    *last_activity.lock() = Instant::now();
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    if events.send(PtyEvent::Data(chunk)).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = events.send(PtyEvent::Exit);
        SESSIONS.lock().remove(&id);
    });

    Ok(id)
}

pub fn session_pid(id: u32) -> Option<u32> {
    SESSIONS.lock().get(&id).and_then(|s| s.pid)
}

pub fn list_session_ids() -> Vec<u32> {
    let mut ids: Vec<u32> = SESSIONS.lock().keys().copied().collect();
    ids.sort();
    ids
}

pub fn session_write(id: u32, data: &[u8]) -> std::io::Result<()> {
    let mut sessions = SESSIONS.lock();
    let s = sessions.get_mut(&id).ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::NotFound, "no pty session")
    })?;
    s.writer.write_all(data)?;
    s.writer.flush()?;
    Ok(())
}

pub fn session_output(id: u32, max_bytes: usize) -> Option<String> {
    let sessions = SESSIONS.lock();
    let s = sessions.get(&id)?;
    let rb = s.output_buffer.lock();
    let take = max_bytes.min(rb.len());
    let start = rb.len() - take;
    let bytes: Vec<u8> = rb.iter().skip(start).copied().collect();
    Some(String::from_utf8_lossy(&bytes).to_string())
}

pub fn session_last_activity_ms(id: u32) -> Option<u128> {
    let sessions = SESSIONS.lock();
    let s = sessions.get(&id)?;
    let ms = s.last_activity.lock().elapsed().as_millis();
    Some(ms)
}

#[tauri::command]
pub fn pty_recent_output(id: u32, max_bytes: Option<usize>) -> Result<String, String> {
    let sessions = SESSIONS.lock();
    let s = sessions
        .get(&id)
        .ok_or_else(|| format!("no pty session {}", id))?;
    let rb = s.output_buffer.lock();
    let max = max_bytes.unwrap_or(rb.len()).min(rb.len());
    let start = rb.len() - max;
    let bytes: Vec<u8> = rb.iter().skip(start).copied().collect();
    Ok(String::from_utf8_lossy(&bytes).to_string())
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

fn descendant_leaf(sys: &sysinfo::System, root_pid: u32) -> u32 {
    let mut current = root_pid;
    let mut depth = 0;
    loop {
        if depth > 16 {
            return current;
        }
        let mut newest_child: Option<(u32, u64)> = None;
        for (pid, proc_) in sys.processes() {
            let parent = match proc_.parent() {
                Some(p) => p.as_u32(),
                None => continue,
            };
            if parent != current {
                continue;
            }
            let pid_u32 = pid.as_u32();
            if pid_u32 == current {
                continue;
            }
            let starttime = proc_.start_time();
            match newest_child {
                None => newest_child = Some((pid_u32, starttime)),
                Some((_, prev)) if starttime >= prev => newest_child = Some((pid_u32, starttime)),
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
    use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};
    let pid = {
        let sessions = SESSIONS.lock();
        let s = sessions
            .get(&id)
            .ok_or_else(|| format!("no pty session {}", id))?;
        s.pid.ok_or_else(|| "no pid".to_string())?
    };
    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    );
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let leaf = descendant_leaf(&sys, pid);
    let proc_ = sys.process(Pid::from_u32(leaf));
    let cwd = proc_
        .and_then(|p| p.cwd())
        .map(|p| p.to_string_lossy().to_string());
    let cmd = proc_.map(|p| {
        let name = p.name().to_string_lossy().to_string();
        #[cfg(windows)]
        {
            name.trim_end_matches(".exe").to_string()
        }
        #[cfg(not(windows))]
        {
            name
        }
    });
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
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "user".to_string());
    let host = hostname::get()
        .ok()
        .map(|h| h.to_string_lossy().to_string())
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .or_else(|| std::env::var("HOSTNAME").ok())
        .unwrap_or_else(|| "host".to_string());
    SystemInfo { user, host }
}
