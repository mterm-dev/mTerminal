use std::sync::atomic::AtomicBool;

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompleteRequest {
    pub messages: Vec<Message>,
    pub system: Option<String>,
    pub model: String,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub in_tokens: u32,
    pub out_tokens: u32,
    pub cost_usd: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "value")]
pub enum AiEvent {
    Delta(String),
    Done(Usage),
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
}

pub type EventSink<'a> = &'a (dyn Fn(AiEvent) + Send + Sync);

pub trait AiProvider: Send + Sync {
    fn stream_complete(
        &self,
        req: &CompleteRequest,
        sink: EventSink,
        cancel: &AtomicBool,
    ) -> Result<()>;

    fn list_models(&self) -> Result<Vec<ModelInfo>>;
}

pub fn estimate_cost(provider: &str, model: &str, in_tokens: u32, out_tokens: u32) -> f64 {
    // Prices per 1M tokens (input, output) — rough table, May 2026 snapshot.
    let (in_per_m, out_per_m) = match (provider, model) {
        ("anthropic", m) if m.contains("opus-4") => (15.0, 75.0),
        ("anthropic", m) if m.contains("sonnet") => (3.0, 15.0),
        ("anthropic", m) if m.contains("haiku") => (0.80, 4.0),
        ("anthropic", _) => (3.0, 15.0),
        ("openai", m) if m.contains("gpt-5") || m.contains("o1") => (15.0, 60.0),
        ("openai", m) if m.contains("gpt-4") => (5.0, 15.0),
        ("openai", m) if m.contains("mini") => (0.15, 0.60),
        ("openai", _) => (5.0, 15.0),
        _ => return 0.0,
    };
    (in_tokens as f64 / 1_000_000.0) * in_per_m + (out_tokens as f64 / 1_000_000.0) * out_per_m
}
