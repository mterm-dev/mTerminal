// Minimal MCP (Model Context Protocol) server exposing mTerminal sessions
// to external agents (Claude Code, Codex, etc).
//
// Transport: Unix domain socket. Connect with e.g.
//   claude mcp add mterminal --transport stdio "socat - UNIX-CONNECT:/run/user/$UID/mterminal-mcp.sock"
//
// Protocol: JSON-RPC 2.0 (one request per line).
// Implements: initialize, tools/list, tools/call.
//
// Tools exposed:
//   - list_tabs()           → all active PTY sessions w/ pid, cwd, cmd
//   - get_output(tab_id, max_bytes?) → recent terminal output
//   - send_keys(tab_id, text, run?)  → write to PTY (run=true appends \n)

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use anyhow::{anyhow, Context, Result};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde_json::{json, Value};

use crate::pty;

struct ServerState {
    running: Arc<AtomicBool>,
    socket_path: PathBuf,
}

static SERVER: Lazy<Mutex<Option<ServerState>>> = Lazy::new(|| Mutex::new(None));

#[cfg(unix)]
fn socket_path() -> Result<PathBuf> {
    let base = std::env::var("XDG_RUNTIME_DIR")
        .ok()
        .map(PathBuf::from)
        .or_else(|| std::env::var("TMPDIR").ok().map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    Ok(base.join(format!(
        "mterminal-mcp-{}.sock",
        std::env::var("USER").unwrap_or_else(|_| "user".into())
    )))
}

#[cfg(windows)]
fn socket_path() -> Result<PathBuf> {
    Err(anyhow!("MCP server on Windows is not yet supported"))
}

#[cfg(unix)]
fn start_listener(socket_path: PathBuf, running: Arc<AtomicBool>) -> Result<()> {
    use std::os::unix::net::UnixListener;
    let _ = std::fs::remove_file(&socket_path);
    let listener = UnixListener::bind(&socket_path)
        .with_context(|| format!("bind {:?}", socket_path))?;
    listener
        .set_nonblocking(true)
        .context("set_nonblocking")?;
    eprintln!("[mcp] listening on {:?}", socket_path);

    thread::spawn(move || {
        loop {
            if !running.load(Ordering::SeqCst) {
                break;
            }
            match listener.accept() {
                Ok((stream, _addr)) => {
                    let _ = stream.set_nonblocking(false);
                    thread::spawn(move || handle_client(stream));
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(std::time::Duration::from_millis(150));
                }
                Err(e) => {
                    eprintln!("[mcp] accept error: {}", e);
                    break;
                }
            }
        }
        let _ = std::fs::remove_file(&socket_path);
        eprintln!("[mcp] listener stopped");
    });
    Ok(())
}

#[cfg(windows)]
fn start_listener(_: PathBuf, _: Arc<AtomicBool>) -> Result<()> {
    Err(anyhow!("MCP server on Windows is not yet supported"))
}

#[cfg(unix)]
fn handle_client(stream: std::os::unix::net::UnixStream) {
    let read = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };
    let mut writer = stream;
    let mut reader = BufReader::new(read);
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {}
            Err(_) => break,
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let resp = handle_message(trimmed);
        if let Some(s) = resp {
            if writeln!(writer, "{}", s).is_err() {
                break;
            }
            let _ = writer.flush();
        }
    }
}

fn handle_message(raw: &str) -> Option<String> {
    let req: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(e) => {
            return Some(error_response(Value::Null, -32700, &format!("parse error: {}", e)));
        }
    };
    let id = req.get("id").cloned().unwrap_or(Value::Null);
    let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("");
    let params = req.get("params").cloned().unwrap_or(Value::Null);

    // Notifications carry no id and should not get a response.
    let is_notification = req.get("id").is_none();

    let result = dispatch(method, params);
    if is_notification {
        return None;
    }
    match result {
        Ok(value) => Some(success_response(id, value)),
        Err((code, msg)) => Some(error_response(id, code, &msg)),
    }
}

fn dispatch(method: &str, params: Value) -> std::result::Result<Value, (i64, String)> {
    match method {
        "initialize" => Ok(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "mterminal", "version": env!("CARGO_PKG_VERSION") }
        })),
        "notifications/initialized" => Ok(Value::Null),
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => {
            let name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or(json!({}));
            let text = call_tool(name, args).map_err(|e| (-32000, e.to_string()))?;
            Ok(json!({
                "content": [{ "type": "text", "text": text }],
                "isError": false
            }))
        }
        "ping" => Ok(json!({})),
        other => Err((-32601, format!("method not found: {}", other))),
    }
}

fn tool_definitions() -> Value {
    json!([
        {
            "name": "list_tabs",
            "description": "List all open terminal sessions in mTerminal with their cwd and current command.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "get_output",
            "description": "Read recent stdout/stderr output from a given tab's PTY (up to 64KB ring buffer).",
            "inputSchema": {
                "type": "object",
                "required": ["tab_id"],
                "properties": {
                    "tab_id": { "type": "integer", "description": "Session id from list_tabs" },
                    "max_bytes": { "type": "integer", "description": "Max bytes to return, default 4096" }
                }
            }
        },
        {
            "name": "send_keys",
            "description": "Write text to a tab's PTY. Set run=true to append a newline (execute the line).",
            "inputSchema": {
                "type": "object",
                "required": ["tab_id", "text"],
                "properties": {
                    "tab_id": { "type": "integer" },
                    "text": { "type": "string" },
                    "run": { "type": "boolean", "default": false }
                }
            }
        }
    ])
}

fn call_tool(name: &str, args: Value) -> Result<String> {
    match name {
        "list_tabs" => {
            use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};
            let mut sys = System::new_with_specifics(
                RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
            );
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

            let mut tabs = Vec::new();
            for sid in pty::list_session_ids() {
                let pid = pty::session_pid(sid);
                let mut cwd: Option<String> = None;
                let mut cmd: Option<String> = None;
                if let Some(p) = pid {
                    if let Some(proc_) = sys.process(Pid::from_u32(p)) {
                        cwd = proc_.cwd().map(|p| p.to_string_lossy().to_string());
                        cmd = Some(proc_.name().to_string_lossy().to_string());
                    }
                }
                tabs.push(json!({
                    "tab_id": sid,
                    "pid": pid,
                    "cwd": cwd,
                    "cmd": cmd,
                }));
            }
            Ok(serde_json::to_string_pretty(&json!({ "tabs": tabs }))?)
        }
        "get_output" => {
            let tab_id = args
                .get("tab_id")
                .and_then(|v| v.as_u64())
                .ok_or_else(|| anyhow!("tab_id required"))? as u32;
            let max_bytes = args
                .get("max_bytes")
                .and_then(|v| v.as_u64())
                .unwrap_or(4096) as usize;
            let out = pty::session_output(tab_id, max_bytes)
                .ok_or_else(|| anyhow!("no such tab: {}", tab_id))?;
            Ok(out)
        }
        "send_keys" => {
            let tab_id = args
                .get("tab_id")
                .and_then(|v| v.as_u64())
                .ok_or_else(|| anyhow!("tab_id required"))? as u32;
            let text = args
                .get("text")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("text required"))?
                .to_string();
            let run = args.get("run").and_then(|v| v.as_bool()).unwrap_or(false);
            let payload = if run { format!("{}\n", text) } else { text };
            pty::session_write(tab_id, payload.as_bytes())?;
            Ok(format!("ok ({} bytes)", payload.len()))
        }
        other => Err(anyhow!("unknown tool: {}", other)),
    }
}

fn success_response(id: Value, result: Value) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string()
}

fn error_response(id: Value, code: i64, msg: &str) -> String {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": msg }
    })
    .to_string()
}

#[derive(serde::Serialize)]
pub struct McpStatus {
    pub running: bool,
    pub socket_path: Option<String>,
}

#[tauri::command]
pub fn mcp_server_status() -> McpStatus {
    let st = SERVER.lock();
    match st.as_ref() {
        Some(s) => McpStatus {
            running: s.running.load(Ordering::SeqCst),
            socket_path: Some(s.socket_path.to_string_lossy().to_string()),
        },
        None => McpStatus {
            running: false,
            socket_path: None,
        },
    }
}

#[tauri::command]
pub fn mcp_server_start() -> Result<McpStatus, String> {
    let mut st = SERVER.lock();
    if st.is_some() {
        return Ok(McpStatus {
            running: true,
            socket_path: st
                .as_ref()
                .map(|s| s.socket_path.to_string_lossy().to_string()),
        });
    }
    let path = socket_path().map_err(|e| e.to_string())?;
    let running = Arc::new(AtomicBool::new(true));
    start_listener(path.clone(), running.clone()).map_err(|e| e.to_string())?;
    *st = Some(ServerState {
        running,
        socket_path: path.clone(),
    });
    Ok(McpStatus {
        running: true,
        socket_path: Some(path.to_string_lossy().to_string()),
    })
}

#[tauri::command]
pub fn mcp_server_stop() -> Result<McpStatus, String> {
    let mut st = SERVER.lock();
    if let Some(s) = st.take() {
        s.running.store(false, Ordering::SeqCst);
        let _ = std::fs::remove_file(&s.socket_path);
    }
    Ok(McpStatus {
        running: false,
        socket_path: None,
    })
}
