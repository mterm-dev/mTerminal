import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAI, type AiMessage, type AiUsage } from "../hooks/useAI";

interface Props {
  defaultProvider: string;
  defaultModel: string;
  baseUrl?: string;
  attachContext: boolean;
  activeTabId: number | null;
  activePtyId: number | null;
  cwd?: string;
  onClose: () => void;
  onUsage?: (u: AiUsage) => void;
}

const SYSTEM = (cwd?: string) =>
  `You are a developer assistant embedded in a terminal emulator. Be concise. Prefer code blocks for commands. ${
    cwd ? `Active terminal cwd: ${cwd}.` : ""
  }`;

export function AIPanel({
  defaultProvider,
  defaultModel,
  baseUrl,
  attachContext,
  activeTabId,
  activePtyId,
  cwd,
  onClose,
  onUsage,
}: Props) {
  const { complete } = useAI();
  const [historyByTab, setHistoryByTab] = useState<Map<number | null, AiMessage[]>>(new Map());
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => Promise<void>) | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const key = activeTabId;
  const history = historyByTab.get(key) ?? [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history.length, streamBuf]);

  useEffect(() => {
    return () => {
      cancelRef.current?.().catch(() => {});
    };
  }, []);

  const send = async () => {
    const q = draft.trim();
    if (!q || busy) return;

    let context = "";
    if (attachContext && activePtyId != null) {
      try {
        const out = await invoke<string>("pty_recent_output", {
          id: activePtyId,
          maxBytes: 3000,
        });
        if (out) context = `\n\n(terminal context):\n\`\`\`\n${out.slice(-2500)}\n\`\`\``;
      } catch {}
    }

    const userMsg: AiMessage = { role: "user", content: q + context };
    const newHistory = [...history, userMsg];
    setHistoryByTab((m) => {
      const n = new Map(m);
      n.set(key, newHistory);
      return n;
    });
    setDraft("");
    setBusy(true);
    setStreamBuf("");
    setError(null);

    try {
      const handle = await complete({
        provider: defaultProvider,
        model: defaultModel,
        baseUrl,
        system: SYSTEM(cwd),
        messages: newHistory,
        maxTokens: 2048,
        onDelta: (t) => setStreamBuf((b) => b + t),
        onDone: (usage) => {
          setBusy(false);
          onUsage?.(usage);
          setStreamBuf((finalText) => {
            setHistoryByTab((m) => {
              const n = new Map(m);
              const cur = n.get(key) ?? [];
              n.set(key, [...cur, { role: "assistant", content: finalText }]);
              return n;
            });
            return "";
          });
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

  const clear = () => {
    setHistoryByTab((m) => {
      const n = new Map(m);
      n.delete(key);
      return n;
    });
    setStreamBuf("");
    setError(null);
  };

  return (
    <div className="ai-panel" role="complementary" aria-label="AI panel">
      <div className="ai-panel-h">
        <span>ai chat — {defaultProvider}</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="ghost-btn" onClick={clear} title="clear conversation">
            clear
          </button>
          <button className="winctl-btn" onClick={onClose} aria-label="close">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="ai-panel-msgs" ref={scrollRef}>
        {history.length === 0 && !streamBuf && (
          <div className="ai-panel-empty">
            ask anything about the active terminal. {attachContext ? "context attached." : ""}
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            <div className="ai-msg-role">{m.role}</div>
            <div className="ai-msg-content">{m.content}</div>
          </div>
        ))}
        {streamBuf && (
          <div className="ai-msg ai-msg-assistant">
            <div className="ai-msg-role">assistant</div>
            <div className="ai-msg-content">
              {streamBuf}
              <span className="ai-cursor">▍</span>
            </div>
          </div>
        )}
        {error && <div className="ai-palette-error">{error}</div>}
      </div>
      <div className="ai-panel-input">
        <textarea
          value={draft}
          placeholder="message..."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
        />
        <button className="ghost-btn" onClick={send} disabled={busy || !draft.trim()}>
          {busy ? "…" : "send"}
        </button>
      </div>
    </div>
  );
}
