import React, { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GitPanel } from "./panel/GitPanel";
import {
  DEFAULT_GIT_PANEL_SETTINGS,
  type GitPanelSettings,
} from "./types";

/**
 * Renderer entry for the git-panel extension.
 *
 * The panel stays props-shaped. The wrapper here adapts ctx → props so the
 * panel itself doesn't have to be rewritten field-by-field. AI provider
 * config flows through the `ai.binding.commit` settings entry, populated by
 * the host's auto-rendered AI binding card. Custom-mode keys come from
 * `ctx.secrets`. Core-mode requests go through `window.mt.ai`.
 */

export type AiProviderId = "anthropic" | "openai" | "ollama";

export interface AiBindingConfig {
  source: "core" | "custom";
  provider: AiProviderId;
  model: string;
  baseUrl?: string;
}

export interface SecretsApiLite {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  onChange(cb: (key: string, present: boolean) => void): { dispose: () => void };
}

interface ExtCtx {
  id: string;
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
  panels: {
    register(p: {
      id: string;
      title: string;
      location: string;
      render: (host: HTMLElement) => void | (() => void);
    }): { dispose: () => void };
  };
  commands: {
    register(c: { id: string; title?: string; run: () => unknown }): {
      dispose: () => void;
    };
  };
  settings: {
    get<T = unknown>(key: string): T | undefined;
    set(key: string, value: unknown): void | Promise<void>;
    onChange(cb: (key: string, value: unknown) => void): { dispose: () => void };
  };
  events: {
    emit(event: string, payload?: unknown): void;
    on(event: string, cb: (payload: unknown) => void): { dispose: () => void };
  };
  workspace: { cwd(): string | null };
  secrets: SecretsApiLite;
  ui: {
    toast(opts: { kind?: "info" | "success" | "warn" | "error"; message: string }): void;
  };
  subscribe(d: { dispose: () => void } | (() => void)): void;
}

const DEFAULT_AI_BINDING: AiBindingConfig = {
  source: "core",
  provider: "anthropic",
  model: "claude-sonnet-4-5",
};

function readSettings(ctx: ExtCtx): GitPanelSettings {
  const get = <K extends keyof GitPanelSettings>(key: K): GitPanelSettings[K] => {
    const v = ctx.settings.get<GitPanelSettings[K]>(key);
    return v !== undefined ? v : DEFAULT_GIT_PANEL_SETTINGS[key];
  };
  return {
    commitSystemPrompt: get("commitSystemPrompt"),
    pullStrategy: get("pullStrategy"),
  };
}

function readBinding(ctx: ExtCtx): AiBindingConfig {
  const cfg = ctx.settings.get<AiBindingConfig>("ai.binding.commit");
  if (!cfg || typeof cfg !== "object") return DEFAULT_AI_BINDING;
  return {
    source: cfg.source === "custom" ? "custom" : "core",
    provider: cfg.provider ?? DEFAULT_AI_BINDING.provider,
    model: cfg.model || DEFAULT_AI_BINDING.model,
    baseUrl: cfg.baseUrl,
  };
}

function GitPanelMount({ ctx }: { ctx: ExtCtx }) {
  const [cwd, setCwd] = useState<string | undefined>(() => ctx.workspace.cwd() ?? undefined);
  const [collapsed, setCollapsed] = useState<boolean>(
    () => (ctx.settings.get<boolean>("collapsed") ?? false),
  );
  const [treeView, setTreeView] = useState<boolean>(
    () => (ctx.settings.get<boolean>("treeView") ?? true),
  );
  const [height, setHeight] = useState<number>(
    () => (ctx.settings.get<number>("panelHeight") ?? 240),
  );
  const [msgHeight, setMsgHeight] = useState<number>(
    () => (ctx.settings.get<number>("messageHeight") ?? 60),
  );
  const [settings, setSettings] = useState<GitPanelSettings>(() => readSettings(ctx));
  const [binding, setBinding] = useState<AiBindingConfig>(() => readBinding(ctx));

  useEffect(() => {
    const offCwd = ctx.events.on("app:cwd:changed", () => {
      setCwd(ctx.workspace.cwd() ?? undefined);
    });
    const offSettings = ctx.settings.onChange(() => {
      setSettings(readSettings(ctx));
      setBinding(readBinding(ctx));
      setCollapsed(ctx.settings.get<boolean>("collapsed") ?? false);
      setTreeView(ctx.settings.get<boolean>("treeView") ?? true);
      setHeight(ctx.settings.get<number>("panelHeight") ?? 240);
      setMsgHeight(ctx.settings.get<number>("messageHeight") ?? 60);
    });
    return () => {
      offCwd.dispose();
      offSettings.dispose();
    };
  }, [ctx]);

  return (
    <GitPanel
      cwd={cwd}
      collapsed={collapsed}
      onToggleCollapsed={(b) => {
        setCollapsed(b);
        void ctx.settings.set("collapsed", b);
      }}
      treeView={treeView}
      onToggleTreeView={(b) => {
        setTreeView(b);
        void ctx.settings.set("treeView", b);
      }}
      settings={settings}
      binding={binding}
      secrets={ctx.secrets}
      height={height}
      onResizeHeight={(h) => {
        setHeight(h);
        void ctx.settings.set("panelHeight", h);
      }}
      msgHeight={msgHeight}
      onResizeMsgHeight={(h) => {
        setMsgHeight(h);
        void ctx.settings.set("messageHeight", h);
      }}
      onUpdatePullStrategy={(s) => {
        void ctx.settings.set("pullStrategy", s);
        setSettings((p) => ({ ...p, pullStrategy: s }));
      }}
    />
  );
}

export function activate(ctx: ExtCtx): void {
  ctx.logger.info("git-panel activated");

  let root: Root | null = null;

  const panel = ctx.panels.register({
    id: "git-panel",
    title: "Git",
    location: "sidebar.bottom",
    render: (host) => {
      root = createRoot(host);
      root.render(<GitPanelMount ctx={ctx} />);
      return () => {
        root?.unmount();
        root = null;
      };
    },
  });
  ctx.subscribe(panel);

  const refresh = ctx.commands.register({
    id: "gitPanel.refresh",
    title: "Git: Refresh status",
    run: () => {
      ctx.events.emit("refresh-requested");
    },
  });
  ctx.subscribe(refresh);
}

export function deactivate(): void {
  /* ctx.subscribe handlers run automatically */
}
