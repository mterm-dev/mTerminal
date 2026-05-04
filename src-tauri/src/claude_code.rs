// Claude Code session detection — process tree walk + activity heuristic.

use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};

use crate::pty;

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum CcState {
    None,
    Idle,
    Thinking,
    AwaitingInput,
}

#[derive(Serialize, Debug)]
pub struct CcStatus {
    pub state: CcState,
    pub running: bool,
    pub binary: Option<String>,
    pub last_activity_ms: Option<u128>,
}

fn find_claude(sys: &System, root_pid: u32) -> Option<String> {
    let mut stack: Vec<(u32, u8)> = vec![(root_pid, 0)];
    while let Some((current, depth)) = stack.pop() {
        if depth > 16 {
            continue;
        }
        for (pid, proc_) in sys.processes() {
            let parent = match proc_.parent() {
                Some(p) => p.as_u32(),
                None => continue,
            };
            if parent != current {
                continue;
            }
            let name_os = proc_.name().to_string_lossy().to_string();
            let n = name_os.trim_end_matches(".exe").to_lowercase();
            if n == "claude" || n == "claude-code" || n.starts_with("claude-") {
                return Some(name_os);
            }
            stack.push((pid.as_u32(), depth + 1));
        }
    }
    None
}

fn classify(buffer_tail: &str) -> Option<CcState> {
    // Strip ANSI escapes for marker matching.
    let stripped = strip_ansi(buffer_tail);
    let lower = stripped.to_lowercase();
    if lower.contains("do you want")
        || lower.contains("press enter")
        || lower.contains("(y/n)")
        || lower.contains("❯ 1.")
        || lower.contains("waiting for your input")
    {
        return Some(CcState::AwaitingInput);
    }
    if lower.contains("esc to interrupt")
        || lower.contains("thinking")
        || lower.contains("(↑↓ to navigate")
    {
        return Some(CcState::Thinking);
    }
    None
}

fn strip_ansi(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == 0x1b && i + 1 < bytes.len() {
            let next = bytes[i + 1];
            if next == b'[' {
                // CSI: skip until letter
                i += 2;
                while i < bytes.len() && !(bytes[i].is_ascii_alphabetic()) {
                    i += 1;
                }
                if i < bytes.len() {
                    i += 1;
                }
                continue;
            } else if next == b']' {
                // OSC: skip until BEL or ST
                i += 2;
                while i < bytes.len() && bytes[i] != 0x07 {
                    if bytes[i] == 0x1b && i + 1 < bytes.len() && bytes[i + 1] == b'\\' {
                        i += 2;
                        break;
                    }
                    i += 1;
                }
                if i < bytes.len() && bytes[i] == 0x07 {
                    i += 1;
                }
                continue;
            } else {
                i += 2;
                continue;
            }
        }
        out.push(b as char);
        i += 1;
    }
    out
}

pub fn status_for(session_id: u32) -> CcStatus {
    let pid = match pty::session_pid(session_id) {
        Some(p) => p,
        None => {
            return CcStatus {
                state: CcState::None,
                running: false,
                binary: None,
                last_activity_ms: None,
            }
        }
    };
    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    );
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let _ = sys.process(Pid::from_u32(pid));
    let claude_bin = find_claude(&sys, pid);
    if claude_bin.is_none() {
        return CcStatus {
            state: CcState::None,
            running: false,
            binary: None,
            last_activity_ms: pty::session_last_activity_ms(session_id),
        };
    }

    let last_ms = pty::session_last_activity_ms(session_id);
    let buffer = pty::session_output(session_id, 4096).unwrap_or_default();
    let parsed = classify(&buffer);

    let state = match parsed {
        Some(s) => s,
        None => match last_ms {
            Some(ms) if ms < 600 => CcState::Thinking,
            _ => CcState::Idle,
        },
    };

    CcStatus {
        state,
        running: true,
        binary: claude_bin,
        last_activity_ms: last_ms,
    }
}

#[tauri::command]
pub fn claude_code_status(tab_id: u32) -> Result<CcStatus, String> {
    Ok(status_for(tab_id))
}
