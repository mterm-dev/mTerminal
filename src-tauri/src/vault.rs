// Vault — Argon2id KDF + XChaCha20-Poly1305 encrypted secrets store.
// File: $XDG_CONFIG_HOME/mterminal/vault.bin (or $HOME/.config/mterminal/vault.bin)

use std::collections::HashMap;
use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

const AAD: &[u8] = b"mterminal-vault-v1";
const KDF_M_KIB: u32 = 64 * 1024; // 64 MiB
const KDF_T: u32 = 3;
const KDF_P: u32 = 4;
const KEY_LEN: usize = 32;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 24;

#[derive(Serialize, Deserialize)]
struct VaultFile {
    version: u32,
    kdf_salt: String,
    nonce: String,
    ciphertext: String,
}

#[derive(Default, Serialize, Deserialize)]
pub struct VaultPayload {
    #[serde(default)]
    pub passwords: HashMap<String, String>,
}

struct VaultState {
    key: Zeroizing<Vec<u8>>,
    salt: [u8; SALT_LEN],
}

static STATE: Lazy<Mutex<Option<VaultState>>> = Lazy::new(|| Mutex::new(None));

pub fn config_dir() -> Result<PathBuf> {
    let base = std::env::var("XDG_CONFIG_HOME")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var("HOME")
                .ok()
                .map(|h| PathBuf::from(h).join(".config"))
        })
        .ok_or_else(|| anyhow!("cannot resolve config dir (no $XDG_CONFIG_HOME or $HOME)"))?;
    let dir = base.join("mterminal");
    std::fs::create_dir_all(&dir).with_context(|| format!("create {:?}", dir))?;
    Ok(dir)
}

fn vault_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("vault.bin"))
}

fn derive_key(password: &str, salt: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    let params = Params::new(KDF_M_KIB, KDF_T, KDF_P, Some(KEY_LEN))
        .map_err(|e| anyhow!("argon2 params: {e}"))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new(vec![0u8; KEY_LEN]);
    argon
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| anyhow!("argon2 derive: {e}"))?;
    Ok(key)
}

fn read_vault_file() -> Result<Option<VaultFile>> {
    let path = vault_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read(&path).with_context(|| format!("read {:?}", path))?;
    let v: VaultFile = serde_json::from_slice(&raw).context("parse vault.bin")?;
    Ok(Some(v))
}

fn write_vault_file(file: &VaultFile) -> Result<()> {
    let path = vault_path()?;
    let tmp = path.with_extension("bin.tmp");
    let bytes = serde_json::to_vec(file)?;
    std::fs::write(&tmp, &bytes).with_context(|| format!("write {:?}", tmp))?;
    std::fs::rename(&tmp, &path).with_context(|| format!("rename {:?}", path))?;
    Ok(())
}

fn encrypt_payload(key: &[u8], payload: &VaultPayload) -> Result<(Vec<u8>, Vec<u8>)> {
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let cipher = XChaCha20Poly1305::new(key.into());
    let plaintext = serde_json::to_vec(payload)?;
    let ct = cipher
        .encrypt(
            XNonce::from_slice(&nonce_bytes),
            Payload {
                msg: &plaintext,
                aad: AAD,
            },
        )
        .map_err(|e| anyhow!("encrypt: {e}"))?;
    Ok((nonce_bytes.to_vec(), ct))
}

fn decrypt_payload(key: &[u8], nonce: &[u8], ct: &[u8]) -> Result<VaultPayload> {
    let cipher = XChaCha20Poly1305::new(key.into());
    let pt = cipher
        .decrypt(XNonce::from_slice(nonce), Payload { msg: ct, aad: AAD })
        .map_err(|_| anyhow!("decrypt failed — wrong master password or corrupted vault"))?;
    let payload: VaultPayload = serde_json::from_slice(&pt).context("parse vault payload")?;
    Ok(payload)
}

pub fn read_payload() -> Result<VaultPayload> {
    let st = STATE.lock();
    let st = st.as_ref().ok_or_else(|| anyhow!("vault is locked"))?;
    let file = read_vault_file()?.ok_or_else(|| anyhow!("vault not initialized"))?;
    let nonce = B64.decode(&file.nonce).context("decode nonce")?;
    let ct = B64.decode(&file.ciphertext).context("decode ciphertext")?;
    decrypt_payload(&st.key, &nonce, &ct)
}

pub fn write_payload(payload: &VaultPayload) -> Result<()> {
    let st = STATE.lock();
    let st = st.as_ref().ok_or_else(|| anyhow!("vault is locked"))?;
    let (nonce, ct) = encrypt_payload(&st.key, payload)?;
    let file = VaultFile {
        version: 1,
        kdf_salt: B64.encode(st.salt),
        nonce: B64.encode(&nonce),
        ciphertext: B64.encode(&ct),
    };
    write_vault_file(&file)
}

pub fn is_unlocked() -> bool {
    STATE.lock().is_some()
}

#[derive(Serialize)]
pub struct VaultStatus {
    pub exists: bool,
    pub unlocked: bool,
}

#[tauri::command]
pub fn vault_status() -> Result<VaultStatus, String> {
    let exists = vault_path().map_err(|e| e.to_string())?.exists();
    Ok(VaultStatus {
        exists,
        unlocked: is_unlocked(),
    })
}

#[tauri::command]
pub fn vault_init(master_password: String) -> Result<(), String> {
    if master_password.is_empty() {
        return Err("master password cannot be empty".into());
    }
    if vault_path().map_err(|e| e.to_string())?.exists() {
        return Err("vault already exists — use unlock or change_password".into());
    }
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    let key = derive_key(&master_password, &salt).map_err(|e| e.to_string())?;
    let (nonce, ct) = encrypt_payload(&key, &VaultPayload::default()).map_err(|e| e.to_string())?;
    let file = VaultFile {
        version: 1,
        kdf_salt: B64.encode(salt),
        nonce: B64.encode(&nonce),
        ciphertext: B64.encode(&ct),
    };
    write_vault_file(&file).map_err(|e| e.to_string())?;
    *STATE.lock() = Some(VaultState { key, salt });
    Ok(())
}

#[tauri::command]
pub fn vault_unlock(master_password: String) -> Result<(), String> {
    let file = read_vault_file()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "vault not initialized".to_string())?;
    let salt_vec = B64.decode(&file.kdf_salt).map_err(|e| e.to_string())?;
    if salt_vec.len() != SALT_LEN {
        return Err("invalid salt length".into());
    }
    let mut salt = [0u8; SALT_LEN];
    salt.copy_from_slice(&salt_vec);
    let key = derive_key(&master_password, &salt).map_err(|e| e.to_string())?;
    let nonce = B64.decode(&file.nonce).map_err(|e| e.to_string())?;
    let ct = B64.decode(&file.ciphertext).map_err(|e| e.to_string())?;
    decrypt_payload(&key, &nonce, &ct).map_err(|e| e.to_string())?;
    *STATE.lock() = Some(VaultState { key, salt });
    Ok(())
}

#[tauri::command]
pub fn vault_lock() -> Result<(), String> {
    *STATE.lock() = None;
    Ok(())
}

#[tauri::command]
pub fn vault_change_password(old_password: String, new_password: String) -> Result<(), String> {
    if new_password.is_empty() {
        return Err("new master password cannot be empty".into());
    }
    let file = read_vault_file()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "vault not initialized".to_string())?;
    let salt_vec = B64.decode(&file.kdf_salt).map_err(|e| e.to_string())?;
    if salt_vec.len() != SALT_LEN {
        return Err("invalid salt length".into());
    }
    let mut old_salt = [0u8; SALT_LEN];
    old_salt.copy_from_slice(&salt_vec);
    let old_key = derive_key(&old_password, &old_salt).map_err(|e| e.to_string())?;
    let nonce = B64.decode(&file.nonce).map_err(|e| e.to_string())?;
    let ct = B64.decode(&file.ciphertext).map_err(|e| e.to_string())?;
    let payload = decrypt_payload(&old_key, &nonce, &ct).map_err(|e| e.to_string())?;

    let mut new_salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut new_salt);
    let new_key = derive_key(&new_password, &new_salt).map_err(|e| e.to_string())?;
    let (new_nonce, new_ct) = encrypt_payload(&new_key, &payload).map_err(|e| e.to_string())?;
    let new_file = VaultFile {
        version: 1,
        kdf_salt: B64.encode(new_salt),
        nonce: B64.encode(&new_nonce),
        ciphertext: B64.encode(&new_ct),
    };
    write_vault_file(&new_file).map_err(|e| e.to_string())?;
    *STATE.lock() = Some(VaultState {
        key: new_key,
        salt: new_salt,
    });
    Ok(())
}
