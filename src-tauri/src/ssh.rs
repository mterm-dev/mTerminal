// SSH connection spawning. Wraps portable-pty CommandBuilder to launch ssh
// (optionally via sshpass) using the shared PTY plumbing in pty.rs.

use anyhow::{anyhow, Result};
use portable_pty::CommandBuilder;
use tauri::ipc::Channel;

use crate::hosts;
use crate::pty::{spawn_with_command, PtyEvent};

fn ssh_args(host: &hosts::HostMeta) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-t".into(),
        "-o".into(),
        "ServerAliveInterval=30".into(),
        "-p".into(),
        host.port.to_string(),
    ];
    match host.auth.as_str() {
        "key" => {
            if let Some(path) = host.identity_path.as_ref().filter(|s| !s.is_empty()) {
                args.push("-i".into());
                args.push(path.clone());
                args.push("-o".into());
                args.push("IdentitiesOnly=yes".into());
            }
            args.push("-o".into());
            args.push("PreferredAuthentications=publickey".into());
        }
        "password" => {
            // sshpass feeds "password:" prompt — must skip pubkey auth or ssh
            // hangs on "Enter passphrase for key" prompt that sshpass doesn't match.
            args.push("-o".into());
            args.push("PubkeyAuthentication=no".into());
            args.push("-o".into());
            args.push("PreferredAuthentications=password".into());
        }
        "agent" => {
            args.push("-o".into());
            args.push("PreferredAuthentications=publickey".into());
            args.push("-o".into());
            args.push("IdentityAgent=$SSH_AUTH_SOCK".into());
        }
        _ => {}
    }
    args.push(format!("{}@{}", host.user, host.host));
    args
}

fn build_command(
    host: &hosts::HostMeta,
    password: Option<&str>,
    debug: &mut String,
) -> Result<CommandBuilder> {
    let args = ssh_args(host);
    let mut cmd;
    let mut display: Vec<String> = Vec::new();
    match host.auth.as_str() {
        "password" => {
            let pw = password.ok_or_else(|| anyhow!("password required but missing"))?;
            cmd = CommandBuilder::new("sshpass");
            cmd.arg("-p");
            cmd.arg(pw);
            cmd.arg("ssh");
            display.push("sshpass".into());
            display.push("-p".into());
            display.push("***".into());
            display.push("ssh".into());
            for a in &args {
                cmd.arg(a);
                display.push(a.clone());
            }
        }
        _ => {
            cmd = CommandBuilder::new("ssh");
            display.push("ssh".into());
            for a in &args {
                cmd.arg(a);
                display.push(a.clone());
            }
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", &home);
        cmd.cwd(home);
    }
    if let Ok(v) = std::env::var("PATH") {
        cmd.env("PATH", v);
    }
    if let Ok(v) = std::env::var("USER") {
        cmd.env("USER", v);
    }
    if let Ok(v) = std::env::var("LOGNAME") {
        cmd.env("LOGNAME", v);
    }
    if let Ok(v) = std::env::var("SSH_AUTH_SOCK") {
        cmd.env("SSH_AUTH_SOCK", v);
    }
    if let Ok(v) = std::env::var("LANG") {
        cmd.env("LANG", v);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("MTERMINAL", "1");

    *debug = display.join(" ");
    Ok(cmd)
}

#[tauri::command]
pub fn ssh_spawn(
    events: Channel<PtyEvent>,
    rows: u16,
    cols: u16,
    host_id: String,
) -> Result<u32, String> {
    let host = hosts::get_host(&host_id).map_err(|e| e.to_string())?;

    let password = if host.auth == "password" {
        if host.save_password {
            let pw = hosts::host_get_password(host.id.clone())?;
            Some(pw.ok_or_else(|| {
                "no saved password for this host — edit host or unlock vault".to_string()
            })?)
        } else {
            return Err(
                "password auth without saved password is not supported — save the password or use key auth".into(),
            );
        }
    } else {
        None
    };

    let mut debug = String::new();
    let cmd = build_command(&host, password.as_deref(), &mut debug).map_err(|e| e.to_string())?;

    let banner = format!("\x1b[2m[exec] {}\x1b[0m\r\n", debug);
    let _ = events.send(PtyEvent::Data(banner));

    let id = spawn_with_command(events, rows, cols, cmd).map_err(|e| e.to_string())?;
    let _ = hosts::touch_last_used(&host_id);
    Ok(id)
}
