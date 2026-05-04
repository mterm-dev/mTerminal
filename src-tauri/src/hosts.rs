// Host metadata + SSH key scanner.
// File: $XDG_CONFIG_HOME/mterminal/hosts.json (clear-text, no secrets).

use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::vault;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostMeta {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub auth: String, // "key" | "password" | "agent"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity_path: Option<String>,
    #[serde(default)]
    pub save_password: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_used: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostGroup {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub collapsed: bool,
    #[serde(default = "default_accent")]
    pub accent: String,
}

fn default_accent() -> String {
    "blue".into()
}

#[derive(Default, Serialize, Deserialize)]
struct HostsFile {
    #[serde(default = "default_version")]
    version: u32,
    #[serde(default)]
    hosts: Vec<HostMeta>,
    #[serde(default)]
    groups: Vec<HostGroup>,
}

fn default_version() -> u32 {
    1
}

static IO_LOCK: Mutex<()> = Mutex::new(());

fn hosts_path() -> Result<PathBuf> {
    Ok(vault::config_dir()?.join("hosts.json"))
}

fn read_file() -> Result<HostsFile> {
    let path = hosts_path()?;
    if !path.exists() {
        return Ok(HostsFile {
            version: 1,
            hosts: vec![],
            groups: vec![],
        });
    }
    let raw = std::fs::read(&path).with_context(|| format!("read {:?}", path))?;
    if raw.is_empty() {
        return Ok(HostsFile {
            version: 1,
            hosts: vec![],
            groups: vec![],
        });
    }
    let f: HostsFile = serde_json::from_slice(&raw).context("parse hosts.json")?;
    Ok(f)
}

fn write_file(file: &HostsFile) -> Result<()> {
    let path = hosts_path()?;
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(file)?;
    std::fs::write(&tmp, &bytes).with_context(|| format!("write {:?}", tmp))?;
    std::fs::rename(&tmp, &path).with_context(|| format!("rename {:?}", path))?;
    Ok(())
}

fn new_id() -> String {
    let mut buf = [0u8; 8];
    rand::thread_rng().fill_bytes(&mut buf);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!(
        "h_{:x}_{:02x}{:02x}{:02x}{:02x}",
        now, buf[0], buf[1], buf[2], buf[3]
    )
}

pub fn get_host(id: &str) -> Result<HostMeta> {
    let _g = IO_LOCK.lock();
    let file = read_file()?;
    file.hosts
        .into_iter()
        .find(|h| h.id == id)
        .ok_or_else(|| anyhow!("host not found"))
}

pub fn touch_last_used(id: &str) -> Result<()> {
    let _g = IO_LOCK.lock();
    let mut file = read_file()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let mut changed = false;
    for h in file.hosts.iter_mut() {
        if h.id == id {
            h.last_used = Some(now);
            changed = true;
            break;
        }
    }
    if changed {
        write_file(&file)?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostListResult {
    pub hosts: Vec<HostMeta>,
    pub groups: Vec<HostGroup>,
}

#[tauri::command]
pub fn host_list() -> Result<HostListResult, String> {
    let _g = IO_LOCK.lock();
    let file = read_file().map_err(|e| e.to_string())?;
    let group_ids: std::collections::HashSet<String> =
        file.groups.iter().map(|g| g.id.clone()).collect();
    let hosts = file
        .hosts
        .into_iter()
        .map(|mut h| {
            if let Some(gid) = &h.group_id {
                if !group_ids.contains(gid) {
                    h.group_id = None;
                }
            }
            h
        })
        .collect();
    Ok(HostListResult {
        hosts,
        groups: file.groups,
    })
}

#[tauri::command]
pub fn host_group_save(group: HostGroup) -> Result<String, String> {
    if group.name.trim().is_empty() {
        return Err("group name cannot be empty".into());
    }
    let _g = IO_LOCK.lock();
    let mut file = read_file().map_err(|e| e.to_string())?;
    let mut g = group;
    if g.id.is_empty() {
        let mut buf = [0u8; 4];
        rand::thread_rng().fill_bytes(&mut buf);
        g.id = format!(
            "g_{:x}{:x}{:x}{:x}",
            buf[0], buf[1], buf[2], buf[3]
        );
    }
    let id = g.id.clone();
    if let Some(idx) = file.groups.iter().position(|x| x.id == id) {
        file.groups[idx] = g;
    } else {
        file.groups.push(g);
    }
    write_file(&file).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn host_group_delete(id: String) -> Result<(), String> {
    let _g = IO_LOCK.lock();
    let mut file = read_file().map_err(|e| e.to_string())?;
    let before = file.groups.len();
    file.groups.retain(|g| g.id != id);
    if file.groups.len() == before {
        return Ok(());
    }
    for h in file.hosts.iter_mut() {
        if h.group_id.as_deref() == Some(&id) {
            h.group_id = None;
        }
    }
    write_file(&file).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn host_set_group(host_id: String, group_id: Option<String>) -> Result<(), String> {
    let _g = IO_LOCK.lock();
    let mut file = read_file().map_err(|e| e.to_string())?;
    let valid = match &group_id {
        None => true,
        Some(gid) => file.groups.iter().any(|x| x.id == *gid),
    };
    if !valid {
        return Err("group not found".into());
    }
    let mut changed = false;
    for h in file.hosts.iter_mut() {
        if h.id == host_id {
            h.group_id = group_id.clone();
            changed = true;
            break;
        }
    }
    if changed {
        write_file(&file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn host_save(mut host: HostMeta, password: Option<String>) -> Result<String, String> {
    if host.host.trim().is_empty() {
        return Err("host cannot be empty".into());
    }
    if host.user.trim().is_empty() {
        return Err("user cannot be empty".into());
    }
    if !["key", "password", "agent"].contains(&host.auth.as_str()) {
        return Err(format!("invalid auth: {}", host.auth));
    }
    if host.port == 0 {
        host.port = 22;
    }

    let _g = IO_LOCK.lock();
    let mut file = read_file().map_err(|e| e.to_string())?;

    if host.id.is_empty() {
        host.id = new_id();
    }

    // Upsert metadata
    let id = host.id.clone();
    let auth = host.auth.clone();
    let save_pw = host.save_password;
    if let Some(idx) = file.hosts.iter().position(|h| h.id == id) {
        file.hosts[idx] = host;
    } else {
        file.hosts.push(host);
    }
    write_file(&file).map_err(|e| e.to_string())?;

    // Vault password handling — only for password auth with savePassword.
    if auth == "password" && save_pw {
        if !vault::is_unlocked() {
            return Err("vault is locked — unlock to save password".into());
        }
        let mut payload = vault::read_payload().map_err(|e| e.to_string())?;
        if let Some(pw) = password {
            payload.passwords.insert(id.clone(), pw);
        }
        vault::write_payload(&payload).map_err(|e| e.to_string())?;
    } else {
        // Drop any stored secret if user switched away from saved password.
        if vault::is_unlocked() {
            let mut payload = vault::read_payload().map_err(|e| e.to_string())?;
            if payload.passwords.remove(&id).is_some() {
                vault::write_payload(&payload).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(id)
}

#[tauri::command]
pub fn host_delete(id: String) -> Result<(), String> {
    let _g = IO_LOCK.lock();
    let mut file = read_file().map_err(|e| e.to_string())?;
    let before = file.hosts.len();
    file.hosts.retain(|h| h.id != id);
    if file.hosts.len() != before {
        write_file(&file).map_err(|e| e.to_string())?;
    }
    if vault::is_unlocked() {
        let mut payload = vault::read_payload().map_err(|e| e.to_string())?;
        if payload.passwords.remove(&id).is_some() {
            vault::write_payload(&payload).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn host_get_password(id: String) -> Result<Option<String>, String> {
    if !vault::is_unlocked() {
        return Err("vault is locked".into());
    }
    let payload = vault::read_payload().map_err(|e| e.to_string())?;
    Ok(payload.passwords.get(&id).cloned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKey {
    pub path: String,
    pub name: String,
    pub key_type: String,
}

#[tauri::command]
pub fn list_ssh_keys() -> Result<Vec<SshKey>, String> {
    let home = std::env::var("HOME").map_err(|_| "no $HOME".to_string())?;
    let dir = PathBuf::from(home).join(".ssh");
    if !dir.exists() {
        return Ok(vec![]);
    }
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut keys = vec![];
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let fname = match path.file_name().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        if fname.ends_with(".pub") {
            continue;
        }
        if !fname.starts_with("id_") {
            continue;
        }
        let key_type = fname.strip_prefix("id_").unwrap_or("").to_string();
        keys.push(SshKey {
            path: path.to_string_lossy().to_string(),
            name: fname,
            key_type,
        });
    }
    keys.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(keys)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolAvailability {
    pub sshpass: bool,
}

#[tauri::command]
pub fn tool_availability() -> ToolAvailability {
    ToolAvailability {
        sshpass: which("sshpass"),
    }
}

fn which(prog: &str) -> bool {
    let path = match std::env::var_os("PATH") {
        Some(p) => p,
        None => return false,
    };
    for dir in std::env::split_paths(&path) {
        if dir.join(prog).is_file() {
            return true;
        }
    }
    false
}
