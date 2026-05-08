import { useEffect, useRef, useState } from "react";
import { useAI } from "../hooks/useAI";
import { useHasAiProviders } from "../lib/ai-availability";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { CodeBlock } from "./CodeBlock";

import type { AiUsage } from "../hooks/useAI";

interface Props {
  defaultProvider: string;
  defaultModel: string;
  baseUrl?: string;
  cwd?: string;
  recentOutput?: string;
  onClose: () => void;
  onPaste: (text: string, run: boolean) => void;
  onUsage?: (u: AiUsage) => void;
}

const SYSTEM = (cwd?: string) =>
  `You are a shell command generator. ${
    cwd ? `Current working directory: ${cwd}.` : ""
  } The user runs bash/zsh/fish on Linux/macOS or PowerShell/cmd on Windows.

Reply with EXACTLY this format, two lines, nothing else:
CMD: <single-line shell command>
EXPLAIN: <one short sentence>

No code blocks, no markdown, no preamble. Pick the most likely safe command. If destructive (rm -rf, drop, force-push, etc.) prefer a dry-run or safer variant.`;

function parse(raw: string): { cmd: string; explain: string } {
  const cmdMatch = raw.match(/CMD:\s*(.+?)(?:\n|$)/);
  const exMatch = raw.match(/EXPLAIN:\s*(.+?)(?:\n|$)/);
  return {
    cmd: cmdMatch?.[1]?.trim() ?? "",
    explain: exMatch?.[1]?.trim() ?? "",
  };
}

export function AICommandPalette({
  defaultProvider,
  defaultModel,
  baseUrl,
  cwd,
  recentOutput,
  onClose,
  onPaste,
  onUsage,
}: Props) {
  const { complete } = useAI();
  const hasProviders = useHasAiProviders();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState("");
  const cancelRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    return () => {
      cancelRef.current?.().catch(() => {});
    };
  }, []);

  useEscapeKey(onClose);

  const submit = async () => {
    const q = prompt.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setRaw("");
    try {
      const ctx = recentOutput
        ? `\n\nRecent terminal output (for context, do not echo):\n\`\`\`\n${recentOutput.slice(-1500)}\n\`\`\``
        : "";
      const handle = await complete({
        provider: defaultProvider,
        model: defaultModel,
        baseUrl,
        system: SYSTEM(cwd) + ctx,
        messages: [{ role: "user", content: q }],
        maxTokens: 256,
        onDelta: (text) => setRaw((r) => r + text),
        onDone: (usage) => {
          setBusy(false);
          onUsage?.(usage);
        },
        onError: (err) => {
          setBusy(false);
          setError(err);
        },
      });
      cancelRef.current = handle.cancel;
    } catch (e) {
      setBusy(false);
      setError(String(e));
    }
  };

  const parsed = parse(raw);
  const ready = !!parsed.cmd && !busy;

  return (
    <div
      className="settings-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ai-palette" role="dialog" aria-label="AI command palette">
        <div className="ai-palette-h">
          <span>ai command</span>
          <span className="ai-palette-meta">
            {hasProviders ? `${defaultProvider} · ${defaultModel}` : "no provider installed"}
          </span>
        </div>
        {!hasProviders && (
          <div className="ai-palette-error">
            Install an AI provider extension in Settings → AI to use the
            command palette.
          </div>
        )}
        <input
          autoFocus
          type="text"
          value={prompt}
          placeholder={
            hasProviders
              ? "describe what you want — eg. find all files larger than 100MB"
              : "install an AI provider first"
          }
          disabled={!hasProviders}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!hasProviders) return;
              if (ready) {
                onPaste(parsed.cmd, e.ctrlKey);
                onClose();
              } else {
                submit();
              }
            }
          }}
          className="ai-palette-input"
        />
        {error && <div className="ai-palette-error">{error}</div>}
        {(parsed.cmd || busy) && (
          <div className="ai-palette-out">
            {parsed.cmd ? (
              <CodeBlock code={parsed.cmd} lang="bash" className="ai-palette-cmd" />
            ) : (
              <pre className="ai-palette-cmd">{busy ? "…" : ""}</pre>
            )}
            {parsed.explain && (
              <div className="ai-palette-explain">{parsed.explain}</div>
            )}
          </div>
        )}
        <div className="ai-palette-actions">
          <button
            className="ghost-btn"
            disabled={!ready}
            onClick={() => {
              onPaste(parsed.cmd, false);
              onClose();
            }}
          >
            paste (↵)
          </button>
          <button
            className="ghost-btn"
            disabled={!ready}
            onClick={() => {
              onPaste(parsed.cmd, true);
              onClose();
            }}
          >
            run (ctrl+↵)
          </button>
          <button
            className="ghost-btn"
            disabled={busy}
            onClick={submit}
          >
            {busy ? "…" : "regenerate"}
          </button>
          <span style={{ flex: 1 }} />
          <button className="ghost-btn" onClick={onClose}>
            cancel (esc)
          </button>
        </div>
      </div>
    </div>
  );
}
