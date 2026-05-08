import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import type { VoiceEngineId } from "../useSettings";
import { invoke } from "../../lib/ipc";
import { formatHotkey, specFromKeyboardEvent } from "../../lib/hotkey";
import { Field, Group, SectionLabel, type VaultSectionProps } from "./_shared";
import { ApiKeyRow, FilePickerRow, SegmentedRow, TextRow, ToggleRow } from "./_rows";

const VOICE_KEY_PROVIDER = "voice-openai";

const ENGINE_OPTIONS: { label: string; value: VoiceEngineId; icon: string }[] = [
  { label: "whisper.cpp (local)", value: "whisper-cpp", icon: "◎" },
  { label: "OpenAI Whisper", value: "openai", icon: "☁" },
];

export function VoicePanel({
  settings,
  update,
  vaultUnlocked,
  vaultExists,
  onRequestVault,
}: VaultSectionProps) {
  const [hasVoiceKey, setHasVoiceKey] = useState(false);

  const refreshKey = useCallback(async () => {
    if (!vaultUnlocked) {
      setHasVoiceKey(false);
      return;
    }
    try {
      const ok = await invoke<boolean>("ai_vault_key_has", { provider: VOICE_KEY_PROVIDER });
      setHasVoiceKey(!!ok);
    } catch {
      setHasVoiceKey(false);
    }
  }, [vaultUnlocked]);

  useEffect(() => {
    refreshKey();
  }, [refreshKey]);

  const setKey = async (key: string) => {
    await invoke("ai_vault_key_set", { provider: VOICE_KEY_PROVIDER, key });
    await refreshKey();
  };

  const clearKey = async () => {
    await invoke("ai_vault_key_clear", { provider: VOICE_KEY_PROVIDER });
    await refreshKey();
  };

  const onHotkeyKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      update("voiceHotkey", "");
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") return;
    e.preventDefault();
    e.stopPropagation();
    const spec = specFromKeyboardEvent(e.nativeEvent);
    if (!spec) return;
    update("voiceHotkey", formatHotkey(spec));
  };

  const showOpenAi = settings.voiceEngine === "openai";
  const showWhisper = settings.voiceEngine === "whisper-cpp";

  return (
    <>
      <SectionLabel>Master switch</SectionLabel>
      <Group>
        <ToggleRow
          label="Enable voice to text"
          desc="Turn on dictation; pick an engine below to choose where transcription runs"
          checked={settings.voiceEnabled}
          onChange={(b) => update("voiceEnabled", b)}
        />
      </Group>

      {settings.voiceEnabled && (
        <>
          <SectionLabel>Engine</SectionLabel>
          <Group>
            <SegmentedRow
              label="Transcription engine"
              desc="Local runs offline via whisper.cpp; OpenAI uses the hosted Whisper API"
              value={settings.voiceEngine}
              options={ENGINE_OPTIONS}
              onChange={(v) => update("voiceEngine", v)}
            />
            <TextRow
              label="Language"
              desc='ISO 639-1 code (e.g. "pl", "en") or "auto" to detect per-utterance'
              value={settings.voiceLanguage}
              placeholder="auto"
              onChange={(v) => update("voiceLanguage", v)}
            />
          </Group>

          <SectionLabel>Controls</SectionLabel>
          <Group>
            <Field
              label="Hotkey"
              desc="Press a combination to bind it; Backspace clears"
            >
              <input
                type="text"
                className="st-input text"
                value={settings.voiceHotkey}
                onKeyDown={onHotkeyKey}
                onChange={() => {}}
                placeholder="Ctrl+Shift+M"
                readOnly
                style={{ caretColor: "transparent", fontFamily: "var(--font-mono)" }}
              />
            </Field>
            <ToggleRow
              label="Microphone in status bar"
              desc="Show the click-to-dictate button next to the clock"
              checked={settings.voiceShowMicButton}
              onChange={(b) => update("voiceShowMicButton", b)}
            />
            <ToggleRow
              label="Auto-insert space"
              desc="Add a space before/after dictated text when needed for readability"
              checked={settings.voiceAutoSpace}
              onChange={(b) => update("voiceAutoSpace", b)}
            />
          </Group>

          {showWhisper && (
            <>
              <SectionLabel>whisper.cpp</SectionLabel>
              <Group>
                <FilePickerRow
                  label="Binary"
                  desc="Path to the whisper-cli (or main) executable"
                  value={settings.voiceWhisperCppBinPath}
                  placeholder="/path/to/whisper-cli"
                  onChange={(v) => update("voiceWhisperCppBinPath", v)}
                />
                <FilePickerRow
                  label="Model file"
                  desc="ggml-*.bin model used for transcription"
                  value={settings.voiceWhisperCppModelPath}
                  placeholder="/path/to/ggml-base.bin"
                  onChange={(v) => update("voiceWhisperCppModelPath", v)}
                />
              </Group>
            </>
          )}

          {showOpenAi && (
            <>
              <SectionLabel>OpenAI Whisper</SectionLabel>
              <Group>
                <ApiKeyRow
                  label="API key"
                  desc="Stored encrypted in the vault, separate from the chat AI key"
                  hasKey={hasVoiceKey}
                  vaultUnlocked={vaultUnlocked}
                  onSet={setKey}
                  onClear={clearKey}
                />
                {!vaultExists && (
                  <Field
                    label="Vault not initialized"
                    desc="Set up the vault first so the API key can be stored encrypted"
                  >
                    <button type="button" className="st-btn primary" onClick={onRequestVault}>
                      Set up
                    </button>
                  </Field>
                )}
                {vaultExists && !vaultUnlocked && (
                  <Field
                    label="Vault locked"
                    desc="Unlock the vault to read or update the API key"
                  >
                    <button type="button" className="st-btn" onClick={onRequestVault}>
                      Unlock
                    </button>
                  </Field>
                )}
                <TextRow
                  label="Model"
                  desc="Whisper API model id"
                  value={settings.voiceOpenaiModel}
                  placeholder="whisper-1"
                  onChange={(v) => update("voiceOpenaiModel", v)}
                />
                <TextRow
                  label="Base URL"
                  desc="Override for OpenAI-compatible endpoints (e.g. Groq, Azure proxy)"
                  value={settings.voiceOpenaiBaseUrl}
                  placeholder="https://api.openai.com/v1"
                  onChange={(v) => update("voiceOpenaiBaseUrl", v)}
                  grow
                />
              </Group>
            </>
          )}
        </>
      )}
    </>
  );
}
