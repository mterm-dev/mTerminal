// AI module — provider abstraction + Tauri commands for streaming completions.

pub mod anthropic;
pub mod keys;
pub mod openai;
pub mod provider;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;

use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use tauri::ipc::Channel;

pub use provider::{AiEvent, AiProvider, CompleteRequest, Message, ModelInfo};

static AI_TASKS: Lazy<Mutex<HashMap<u32, Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static NEXT_AI_TASK: AtomicU32 = AtomicU32::new(1);

fn build_provider(name: &str, base_url: Option<String>) -> Result<Box<dyn AiProvider>> {
    match name {
        "anthropic" => {
            let key = keys::ai_key_get("anthropic")?
                .ok_or_else(|| anyhow!("anthropic api key not set — open settings → ai"))?;
            Ok(Box::new(anthropic::AnthropicProvider::new(key)))
        }
        "openai" => {
            let key = keys::ai_key_get("openai")?
                .ok_or_else(|| anyhow!("openai api key not set — open settings → ai"))?;
            let url = base_url.unwrap_or_else(|| "https://api.openai.com/v1".to_string());
            Ok(Box::new(openai::OpenAiProvider::new(Some(key), url, "openai")))
        }
        "ollama" => {
            let url = base_url.unwrap_or_else(|| "http://localhost:11434/v1".to_string());
            Ok(Box::new(openai::OpenAiProvider::new(None, url, "ollama")))
        }
        other => Err(anyhow!("unknown provider: {}", other)),
    }
}

#[tauri::command]
pub fn ai_stream_complete(
    events: Channel<AiEvent>,
    provider: String,
    model: String,
    messages: Vec<Message>,
    system: Option<String>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    base_url: Option<String>,
) -> Result<u32, String> {
    let prov = build_provider(&provider, base_url).map_err(|e| e.to_string())?;
    let req = CompleteRequest {
        messages,
        system,
        model,
        max_tokens,
        temperature,
    };

    let task_id = NEXT_AI_TASK.fetch_add(1, Ordering::SeqCst);
    let cancel = Arc::new(AtomicBool::new(false));
    AI_TASKS.lock().insert(task_id, cancel.clone());

    thread::spawn(move || {
        let sink = move |evt: AiEvent| {
            let _ = events.send(evt);
        };
        if let Err(e) = prov.stream_complete(&req, &sink, &cancel) {
            sink(AiEvent::Error(e.to_string()));
        }
        AI_TASKS.lock().remove(&task_id);
    });

    Ok(task_id)
}

#[tauri::command]
pub fn ai_cancel(task_id: u32) -> Result<(), String> {
    if let Some(flag) = AI_TASKS.lock().get(&task_id) {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
pub fn ai_list_models(provider: String, base_url: Option<String>) -> Result<Vec<ModelInfo>, String> {
    let prov = build_provider(&provider, base_url).map_err(|e| e.to_string())?;
    prov.list_models().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_set_key(provider: String, key: String) -> Result<(), String> {
    keys::ai_key_set(&provider, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_clear_key(provider: String) -> Result<(), String> {
    keys::ai_key_clear(&provider).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_has_key(provider: String) -> Result<bool, String> {
    Ok(keys::ai_key_get(&provider)
        .map_err(|e| e.to_string())?
        .is_some())
}
