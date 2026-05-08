import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import type { VoiceEngineId } from "../useSettings";
import { invoke, open as openDialog } from "../../lib/ipc";
import { formatHotkey, specFromKeyboardEvent } from "../../lib/hotkey";
import { Field, Toggle, type VaultSectionProps } from "./_shared";

const VOICE_KEY_PROVIDER = "voice-openai";

export function VoicePanel({
  settings,
  update,
  vaultUnlocked,
  vaultExists,
  onRequestVault,
}: VaultSectionProps) {
  const [hasVoiceKey, setHasVoiceKey] = useState(false);
  const [keyDraftActive, setKeyDraftActive] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");

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

  const submitKey = async () => {
    const v = keyDraft.trim();
    if (!v) return;
    await invoke("ai_vault_key_set", { provider: VOICE_KEY_PROVIDER, key: v });
    setKeyDraft("");
    setKeyDraftActive(false);
    await refreshKey();
  };

  const clearKey = async () => {
    await invoke("ai_vault_key_clear", { provider: VOICE_KEY_PROVIDER });
    await refreshKey();
  };

  const pickFile = async (
    key: "voiceWhisperCppBinPath" | "voiceWhisperCppModelPath",
    title: string,
  ) => {
    try {
      const picked = await openDialog({ title });
      if (typeof picked === "string" && picked.length > 0) {
        update(key, picked);
      }
    } catch {}
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
      <Field label="Enable voice to text" hint="Master switch for dictation">
        <Toggle
          checked={settings.voiceEnabled}
          onChange={(b) => update("voiceEnabled", b)}
        />
      </Field>

      {settings.voiceEnabled && (
        <>
          <Field label="Engine" hint="Local whisper.cpp or OpenAI Whisper API">
            <div className="seg-control">
              {(["whisper-cpp", "openai"] as VoiceEngineId[]).map((p) => (
                <button
                  key={p}
                  className={settings.voiceEngine === p ? "active" : ""}
                  onClick={() => update("voiceEngine", p)}
                >
                  {p === "whisper-cpp" ? "whisper.cpp (local)" : "OpenAI Whisper"}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="Language"
            hint='ISO code (e.g. "pl", "en") or "auto" to detect'
          >
            <input
              type="text"
              value={settings.voiceLanguage}
              onChange={(e) => update("voiceLanguage", e.target.value)}
              placeholder="auto"
            />
          </Field>

          <Field
            label="Hotkey"
            hint="Press a key combo to set, Backspace clears"
          >
            <input
              type="text"
              value={settings.voiceHotkey}
              onKeyDown={onHotkeyKey}
              onChange={() => {}}
              placeholder="Ctrl+Shift+M"
              readOnly
              style={{ caretColor: "transparent" }}
            />
          </Field>

          <Field label="Show microphone in status bar">
            <Toggle
              checked={settings.voiceShowMicButton}
              onChange={(b) => update("voiceShowMicButton", b)}
            />
          </Field>

          <Field
            label="Auto-insert space"
            hint="Adds a space before/after dictation when needed"
          >
            <Toggle
              checked={settings.voiceAutoSpace}
              onChange={(b) => update("voiceAutoSpace", b)}
            />
          </Field>

          {showWhisper && (
            <>
              <div className="settings-note">
                whisper.cpp runs fully offline. Build it from{" "}
                <a
                  href="https://github.com/ggml-org/whisper.cpp"
                  target="_blank"
                  rel="noreferrer"
                >
                  github.com/ggml-org/whisper.cpp
                </a>{" "}
                and download a model (<code>ggml-base.bin</code> works well for many
                languages including Polish).
              </div>

              <Field
                label="whisper.cpp binary"
                hint="Path to whisper-cli (or main) executable"
              >
                <div style={{ display: "flex", gap: 8, flex: 1 }}>
                  <input
                    type="text"
                    value={settings.voiceWhisperCppBinPath}
                    onChange={(e) =>
                      update("voiceWhisperCppBinPath", e.target.value)
                    }
                    placeholder="/path/to/whisper.cpp/build/bin/whisper-cli"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="ghost-btn"
                    onClick={() =>
                      pickFile("voiceWhisperCppBinPath", "select whisper-cli binary")
                    }
                  >
                    pick…
                  </button>
                </div>
              </Field>

              <Field
                label="whisper.cpp model"
                hint="Path to ggml-*.bin model file"
              >
                <div style={{ display: "flex", gap: 8, flex: 1 }}>
                  <input
                    type="text"
                    value={settings.voiceWhisperCppModelPath}
                    onChange={(e) =>
                      update("voiceWhisperCppModelPath", e.target.value)
                    }
                    placeholder="/path/to/whisper.cpp/models/ggml-base.bin"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="ghost-btn"
                    onClick={() =>
                      pickFile(
                        "voiceWhisperCppModelPath",
                        "select whisper.cpp model file",
                      )
                    }
                  >
                    pick…
                  </button>
                </div>
              </Field>
            </>
          )}

          {showOpenAi && (
            <>
              {!vaultExists && (
                <div
                  className="settings-note"
                  style={{ cursor: "pointer" }}
                  onClick={onRequestVault}
                >
                  vault not initialised — click to create. The voice key is stored
                  encrypted in the vault, separate from the AI panel key.
                </div>
              )}
              {vaultExists && !vaultUnlocked && (
                <div
                  className="settings-note"
                  style={{ cursor: "pointer" }}
                  onClick={onRequestVault}
                >
                  vault locked — click to unlock so the voice key can be used.
                </div>
              )}

              <Field
                label="OpenAI API key"
                hint="Stored encrypted in the vault, separate from the AI panel key"
              >
                <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
                  {!keyDraftActive && (
                    <>
                      <span
                        className="settings-field-hint"
                        style={{ alignSelf: "center" }}
                      >
                        {hasVoiceKey
                          ? "key saved ✓"
                          : vaultUnlocked
                            ? "no key"
                            : "vault locked"}
                      </span>
                      <button
                        className="ghost-btn"
                        onClick={() => {
                          if (!vaultUnlocked) {
                            onRequestVault();
                            return;
                          }
                          setKeyDraft("");
                          setKeyDraftActive(true);
                        }}
                      >
                        {!vaultUnlocked
                          ? "unlock vault to set key"
                          : hasVoiceKey
                            ? "replace key"
                            : "set key"}
                      </button>
                      {hasVoiceKey && vaultUnlocked && (
                        <button className="ghost-btn" onClick={clearKey}>
                          remove key
                        </button>
                      )}
                    </>
                  )}
                  {keyDraftActive && (
                    <>
                      <input
                        type="password"
                        value={keyDraft}
                        onChange={(e) => setKeyDraft(e.target.value)}
                        placeholder="paste OpenAI API key"
                        autoFocus
                        style={{ flex: 1, minWidth: 180 }}
                      />
                      <button className="ghost-btn" onClick={submitKey}>
                        save
                      </button>
                      <button
                        className="ghost-btn"
                        onClick={() => {
                          setKeyDraft("");
                          setKeyDraftActive(false);
                        }}
                      >
                        cancel
                      </button>
                    </>
                  )}
                </div>
              </Field>

              <Field label="Whisper model" hint="Default: whisper-1">
                <input
                  type="text"
                  value={settings.voiceOpenaiModel}
                  onChange={(e) => update("voiceOpenaiModel", e.target.value)}
                  placeholder="whisper-1"
                />
              </Field>

              <Field label="OpenAI base URL">
                <input
                  type="text"
                  value={settings.voiceOpenaiBaseUrl}
                  onChange={(e) => update("voiceOpenaiBaseUrl", e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </Field>
            </>
          )}

          <div className="settings-note">
            click the microphone in the status bar (or press the hotkey) to start
            recording, click again to stop. text goes to the focused input/textarea,
            or to the active terminal if no input is focused.
          </div>
        </>
      )}
    </>
  );
}
