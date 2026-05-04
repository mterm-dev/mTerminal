use anyhow::Result;

use crate::vault;

pub fn ai_key_get(provider: &str) -> Result<Option<String>> {
    let payload = vault::read_payload()?;
    Ok(payload.ai_keys.get(provider).cloned())
}

pub fn ai_key_set(provider: &str, key: &str) -> Result<()> {
    let mut payload = vault::read_payload()?;
    payload.ai_keys.insert(provider.to_string(), key.to_string());
    vault::write_payload(&payload)
}

pub fn ai_key_clear(provider: &str) -> Result<()> {
    let mut payload = vault::read_payload()?;
    payload.ai_keys.remove(provider);
    vault::write_payload(&payload)
}
