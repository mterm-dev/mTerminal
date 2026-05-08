import { useCallback, useEffect, useState } from "react";

interface HooksStatus {
  claude: "installed" | "missing" | "mismatch";
  codex: "installed" | "missing" | "mismatch";
  bridgeSocket: string | null;
  version: string;
}

interface AgentApi {
  hooks: {
    status(): Promise<HooksStatus>;
    install(target: "claude" | "codex"): Promise<void>;
    uninstall(target: "claude" | "codex"): Promise<void>;
  };
}

function agent(): AgentApi | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { mt?: { agent?: AgentApi } };
  return w.mt?.agent ?? null;
}

const STATUS_LABEL: Record<HooksStatus["claude"], string> = {
  installed: "installed",
  missing: "not installed",
  mismatch: "outdated",
};

interface RowProps {
  target: "claude" | "codex";
  name: string;
  initials: string;
  configPath: string;
  state: HooksStatus["claude"];
  version: string;
  busy: string | null;
  onAction(target: "claude" | "codex", op: "install" | "uninstall"): void;
}

function IntegrationRow({
  target,
  name,
  initials,
  configPath,
  state,
  version,
  busy,
  onAction,
}: RowProps) {
  const installBusy = busy === `${target}-install`;
  const uninstallBusy = busy === `${target}-uninstall`;
  const installLabel = installBusy
    ? "installing…"
    : state === "mismatch"
      ? "reinstall"
      : "install";

  return (
    <div className="aip-int-row">
      <span className={`aip-int-row-icon aip-int-${target}`}>{initials}</span>
      <div className="aip-int-row-body">
        <div className="aip-int-row-name">
          {name}
          <span className={`aip-int-status ${state}`}>
            {STATUS_LABEL[state]}
            {state === "installed" && ` · v${version}`}
          </span>
        </div>
        <div className="aip-int-row-sub" title={configPath}>
          {configPath}
        </div>
      </div>
      <div className="aip-int-row-actions">
        {state !== "installed" && (
          <button
            type="button"
            className="ghost-btn"
            disabled={busy !== null}
            onClick={() => onAction(target, "install")}
          >
            {installLabel}
          </button>
        )}
        {state !== "missing" && (
          <button
            type="button"
            className="ghost-btn"
            disabled={busy !== null}
            onClick={() => onAction(target, "uninstall")}
          >
            {uninstallBusy ? "removing…" : "uninstall"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Settings → AI → Agent integrations.
 *
 * Wires Claude Code lifecycle hooks (`~/.claude/settings.json`) and the
 * Codex MCP server (`~/.codex/config.toml`) so mTerminal can detect agent
 * state changes via push events instead of polling terminal output.
 */
export function AgentIntegrations() {
  const [status, setStatus] = useState<HooksStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const api = agent();
    if (!api) return;
    try {
      const s = await api.hooks.status();
      setStatus(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAction = useCallback(
    async (target: "claude" | "codex", op: "install" | "uninstall") => {
      const api = agent();
      if (!api) return;
      setBusy(`${target}-${op}`);
      setErr(null);
      try {
        await api.hooks[op](target);
        await refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  return (
    <>
      <div className="aip-section-h">
        <h3>Agent integrations</h3>
        <span className="aip-sub">
          {status
            ? "detect activity via push events instead of polling output"
            : "loading…"}
        </span>
      </div>

      {status && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <IntegrationRow
            target="claude"
            name="Claude Code hooks"
            initials="cc"
            configPath="~/.claude/settings.json"
            state={status.claude}
            version={status.version}
            busy={busy}
            onAction={onAction}
          />
          <IntegrationRow
            target="codex"
            name="OpenAI Codex hooks + MCP"
            initials="cx"
            configPath="~/.codex/config.toml"
            state={status.codex}
            version={status.version}
            busy={busy}
            onAction={onAction}
          />

          {status.codex !== "missing" && (
            <div
              className="settings-note"
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                padding: "10px 12px",
                background:
                  "color-mix(in oklch, var(--c-orange) 12%, transparent)",
                border:
                  "1px solid color-mix(in oklch, var(--c-orange) 35%, transparent)",
                borderRadius: 6,
              }}
            >
              <strong>One-time setup:</strong> open a fresh{" "}
              <code>codex</code> session, type <code>/hooks</code>, and
              approve the 6 <code>mterminal_*</code> entries. Until then
              Codex blocks the lifecycle hooks and the dot stays yellow
              after every turn.
            </div>
          )}

          {status.bridgeSocket && (
            <div className="aip-int-bridge">
              bridge: {status.bridgeSocket}
            </div>
          )}

          {err && (
            <div className="settings-note" style={{ color: "var(--c-orange)" }}>
              {err}
            </div>
          )}
        </div>
      )}
    </>
  );
}
