import { useEffect, useRef, useState } from "react";
import { useAI, type AiUsage } from "../hooks/useAI";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { CodeBlock } from "./CodeBlock";
import { MarkdownLite } from "../lib/markdown-lite";

interface Props {
  selection: string;
  context?: string;
  cwd?: string;
  defaultProvider: string;
  defaultModel: string;
  baseUrl?: string;
  onClose: () => void;
  onUsage?: (u: AiUsage) => void;
}

const SYSTEM = (cwd?: string) =>
  `You explain terminal output and shell errors concisely. ${
    cwd ? `cwd: ${cwd}.` : ""
  }
Given a snippet from the user's terminal, identify what happened, the likely root cause, and one short suggested action. Use plain prose, no markdown headings, max 6 sentences. If it is not an error, just explain what the output represents.`;

export function ExplainPopover({
  selection,
  context,
  cwd,
  defaultProvider,
  defaultModel,
  baseUrl,
  onClose,
  onUsage,
}: Props) {
  const { complete } = useAI();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        const userMsg = `Explain this terminal output:\n\n\`\`\`\n${selection}\n\`\`\`${
          context ? `\n\nSurrounding context:\n\`\`\`\n${context}\n\`\`\`` : ""
        }`;
        const handle = await complete({
          provider: defaultProvider,
          model: defaultModel,
          baseUrl,
          system: SYSTEM(cwd),
          messages: [{ role: "user", content: userMsg }],
          maxTokens: 600,
          onDelta: (t) => {
            if (active) setText((r) => r + t);
          },
          onDone: (usage) => {
            if (active) {
              setBusy(false);
              onUsage?.(usage);
            }
          },
          onError: (err) => {
            if (active) {
              setError(err);
              setBusy(false);
            }
          },
        });
        cancelRef.current = handle.cancel;
      } catch (e) {
        setError(String(e));
        setBusy(false);
      }
    };
    start();
    return () => {
      active = false;
      cancelRef.current?.().catch(() => {});
    };
  }, [selection]);

  useEscapeKey(onClose);

  return (
    <div className="ai-explain" role="dialog" aria-label="AI explain">
      <div className="ai-explain-h">
        <span>ai explain</span>
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
      <div className="ai-explain-snippet">
        <CodeBlock
          code={selection.length > 800 ? selection.slice(0, 800) + "…" : selection}
        />
      </div>
      <div className="ai-explain-body">
        {error && <div className="ai-palette-error">{error}</div>}
        <div className="ai-explain-text">
          <MarkdownLite text={text} />
          {busy && <span className="ai-cursor">▍</span>}
        </div>
      </div>
    </div>
  );
}
