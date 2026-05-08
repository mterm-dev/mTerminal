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
  installed: "● installed",
  missing: "○ not installed",
  mismatch: "⚠ outdated",
};

const STATUS_COLOR: Record<HooksStatus["claude"], string> = {
  installed: "var(--c-green)",
  missing: "color-mix(in oklch, currentColor 50%, transparent)",
  mismatch: "var(--c-orange)",
};

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

  const run = async (
    target: "claude" | "codex",
    op: "install" | "uninstall",
  ): Promise<void> => {
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
  };

  if (!status) {
    return (
      <div className="aip-section-h">
        <h3>Agent integrations</h3>
        <span className="aip-sub">loading…</span>
      </div>
    );
  }

  const Row = ({
    target,
    name,
    sub,
    state,
  }: {
    target: "claude" | "codex";
    name: string;
    sub: string;
    state: HooksStatus["claude"];
  }) => (
    <div className="aip-card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{name}</div>
        <div className="aip-sub" style={{ fontSize: 12 }}>
          {sub}
        </div>
        <div style={{ fontSize: 11, color: STATUS_COLOR[state], marginTop: 4 }}>
          {STATUS_LABEL[state]}
          {state !== "missing" && ` (v${status.version})`}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {state !== "installed" && (
          <button
            type="button"
            className="ghost-btn"
            disabled={busy !== null}
            onClick={() => void run(target, "install")}
          >
            {busy === `${target}-install`
              ? "installing…"
              : state === "mismatch"
                ? "reinstall"
                : "install"}
          </button>
        )}
        {state !== "missing" && (
          <button
            type="button"
            className="ghost-btn"
            disabled={busy !== null}
            onClick={() => void run(target, "uninstall")}
          >
            {busy === `${target}-uninstall` ? "removing…" : "uninstall"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="aip-section-h">
        <h3>Agent integrations</h3>
        <span className="aip-sub">
          detect agent activity via push events, not output polling
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Row
          target="claude"
          name="Claude Code hooks"
          sub="~/.claude/settings.json — PreToolUse, Stop, Notification, …"
          state={status.claude}
        />
        <Row
          target="codex"
          name="OpenAI Codex MCP server"
          sub="~/.codex/config.toml — [mcp_servers.mterminal]"
          state={status.codex}
        />

        {status.bridgeSocket && (
          <div className="settings-note" style={{ fontSize: 11 }}>
            bridge socket: <code>{status.bridgeSocket}</code>
          </div>
        )}

        {err && (
          <div className="settings-note" style={{ color: "var(--c-orange)" }}>
            {err}
          </div>
        )}
      </div>
    </>
  );
}
