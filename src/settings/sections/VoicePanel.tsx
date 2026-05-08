import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import type { VoiceEngineId } from "../useSettings";
import { invoke } from "../../lib/ipc";
import { formatHotkey, specFromKeyboardEvent } from "../../lib/hotkey";
import { Field, Group, SectionLabel, type VaultSectionProps } from "./_shared";
import { ApiKeyRow, FilePickerRow, SegmentedRow, TextRow, ToggleRow } from "./_rows";

const VOICE_KEY_PROVIDER = "voice-openai";

const ENGINE_OPTIONS: { label: string; value: VoiceEngineId; icon: string }[] = [
  { label: "whisper.cpp (local)", value: "whisper-cpp", icon: "◎" },
  { label: "openai whisper", value: "openai", icon: "☁" },
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
      <SectionLabel>master switch</SectionLabel>
      <Group>
        <ToggleRow
          label="enable voice to text"
          desc="turn on dictation; pick an engine below to choose where transcription runs"
          checked={settings.voiceEnabled}
          onChange={(b) => update("voiceEnabled", b)}
        />
      </Group>

      {settings.voiceEnabled && (
        <>
          <SectionLabel>engine</SectionLabel>
          <Group>
            <SegmentedRow
              label="transcription engine"
              desc="local runs offline via whisper.cpp; openai uses the hosted whisper api"
              value={settings.voiceEngine}
              options={ENGINE_OPTIONS}
              onChange={(v) => update("voiceEngine", v)}
            />
            <TextRow
              label="language"
              desc='iso 639-1 code (e.g. "pl", "en") or "auto" to detect per-utterance'
              value={settings.voiceLanguage}
              placeholder="auto"
              onChange={(v) => update("voiceLanguage", v)}
            />
          </Group>

          <SectionLabel>controls</SectionLabel>
          <Group>
            <Field
              label="hotkey"
              desc="press a combination to bind it; backspace clears"
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
              label="microphone in status bar"
              desc="show the click-to-dictate button next to the clock"
              checked={settings.voiceShowMicButton}
              onChange={(b) => update("voiceShowMicButton", b)}
            />
            <ToggleRow
              label="auto-insert space"
              desc="add a space before/after dictated text when needed for readability"
              checked={settings.voiceAutoSpace}
              onChange={(b) => update("voiceAutoSpace", b)}
            />
          </Group>

          {showWhisper && (
            <>
              <SectionLabel>whisper.cpp</SectionLabel>
              <Group>
                <FilePickerRow
                  label="binary"
                  desc="path to the whisper-cli (or main) executable"
                  value={settings.voiceWhisperCppBinPath}
                  placeholder="/path/to/whisper-cli"
                  onChange={(v) => update("voiceWhisperCppBinPath", v)}
                />
                <FilePickerRow
                  label="model file"
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
              <SectionLabel>openai whisper</SectionLabel>
              <Group>
                <ApiKeyRow
                  label="api key"
                  desc="stored encrypted in the vault, separate from the chat ai key"
                  hasKey={hasVoiceKey}
                  vaultUnlocked={vaultUnlocked}
                  onSet={setKey}
                  onClear={clearKey}
                />
                {!vaultExists && (
                  <Field
                    label="vault not initialized"
                    desc="set up the vault first so the api key can be stored encrypted"
                  >
                    <button type="button" className="st-btn primary" onClick={onRequestVault}>
                      set up
                    </button>
                  </Field>
                )}
                {vaultExists && !vaultUnlocked && (
                  <Field
                    label="vault locked"
                    desc="unlock the vault to read or update the api key"
                  >
                    <button type="button" className="st-btn" onClick={onRequestVault}>
                      unlock
                    </button>
                  </Field>
                )}
                <TextRow
                  label="model"
                  desc="whisper api model id"
                  value={settings.voiceOpenaiModel}
                  placeholder="whisper-1"
                  onChange={(v) => update("voiceOpenaiModel", v)}
                />
                <TextRow
                  label="base url"
                  desc="override for openai-compatible endpoints (e.g. groq, azure proxy)"
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
