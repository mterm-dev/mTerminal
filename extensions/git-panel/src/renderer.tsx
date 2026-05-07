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
 * Plugin keeps the original GitPanel.tsx component shape (props-based) — the
 * wrapper here adapts ctx → props so the panel itself doesn't have to be
 * rewritten field-by-field. AI credentials flow through `ctx.secrets`
 * (separate from regular settings).
 */

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

function readSettings(ctx: ExtCtx): GitPanelSettings {
  const get = <K extends keyof GitPanelSettings>(key: K): GitPanelSettings[K] => {
    const v = ctx.settings.get<GitPanelSettings[K]>(key);
    return v !== undefined ? v : DEFAULT_GIT_PANEL_SETTINGS[key];
  };
  return {
    commitProvider: get("commitProvider"),
    anthropicModel: get("anthropicModel"),
    openaiModel: get("openaiModel"),
    openaiBaseUrl: get("openaiBaseUrl"),
    ollamaModel: get("ollamaModel"),
    ollamaBaseUrl: get("ollamaBaseUrl"),
    commitSystemPrompt: get("commitSystemPrompt"),
    pullStrategy: get("pullStrategy"),
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

  useEffect(() => {
    const offCwd = ctx.events.on("app:cwd:changed", () => {
      setCwd(ctx.workspace.cwd() ?? undefined);
    });
    const offSettings = ctx.settings.onChange(() => {
      setSettings(readSettings(ctx));
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
