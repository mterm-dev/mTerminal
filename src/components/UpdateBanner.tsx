import { useEffect, useRef, useState } from "react";

type Phase =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

interface UpdaterState {
  phase: Phase;
  isFullUpdate: boolean;
  version?: string;
  releaseNotes?: string;
  progress?: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  };
  error?: string;
  releaseUrl?: string;
}

interface UpdaterApi {
  check: () => Promise<unknown>;
  download: () => Promise<unknown>;
  install: () => Promise<unknown>;
  getState: () => Promise<unknown>;
  setBetaChannel: (enabled: boolean) => Promise<boolean>;
  onState: (cb: (state: unknown) => void) => () => void;
}

function getUpdaterApi(): UpdaterApi | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { mt?: { updater?: UpdaterApi } }).mt?.updater ?? null
  );
}

function getShellApi(): { openExternal: (url: string) => Promise<boolean> } | null {
  if (typeof window === "undefined") return null;
  return (
    (
      window as unknown as {
        mt?: { shell?: { openExternal: (url: string) => Promise<boolean> } };
      }
    ).mt?.shell ?? null
  );
}

export function UpdateBanner() {
  const [state, setState] = useState<UpdaterState>({
    phase: "idle",
    isFullUpdate: false,
  });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const apiRef = useRef<UpdaterApi | null>(null);

  useEffect(() => {
    const api = getUpdaterApi();
    apiRef.current = api;
    if (!api) return;
    let cancelled = false;
    void api
      .getState()
      .then((s) => {
        if (!cancelled && s) setState(s as UpdaterState);
      })
      .catch(() => {});
    const off = api.onState((s) => setState(s as UpdaterState));
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const api = apiRef.current;
  if (!api) return null;

  const isDismissed =
    state.version != null && dismissedVersion === state.version;

  if (
    state.phase === "idle" ||
    state.phase === "checking" ||
    state.phase === "not-available"
  ) {
    return null;
  }

  if (
    (state.phase === "available" || state.phase === "downloaded") &&
    isDismissed
  ) {
    return null;
  }

  const onDownload = (): void => {
    void api.download().catch(() => {});
  };
  const onInstall = (): void => {
    void api.install().catch(() => {});
  };
  const onRetry = (): void => {
    void api.check().catch(() => {});
  };
  const onDismiss = (): void => {
    if (state.version) setDismissedVersion(state.version);
  };
  const onOpenRelease = (): void => {
    if (!state.releaseUrl) return;
    const shellApi = getShellApi();
    if (shellApi) void shellApi.openExternal(state.releaseUrl).catch(() => {});
  };

  const bannerCls =
    state.phase === "error"
      ? "mt-update-banner mt-update-banner--error"
      : "mt-update-banner";

  let title = "";
  let sub = "";
  let actions: React.ReactNode = null;

  if (state.phase === "available") {
    title = `mTerminal v${state.version ?? ""} is available`;
    if (state.isFullUpdate) {
      sub = "Download and install when you're ready.";
      actions = (
        <>
          {state.releaseNotes ? (
            <button
              type="button"
              className="mt-update-banner__btn"
              onClick={() => setShowNotes((v) => !v)}
            >
              {showNotes ? "Hide notes" : "What's new"}
            </button>
          ) : null}
          <button
            type="button"
            className="mt-update-banner__btn mt-update-banner__btn--primary"
            onClick={onDownload}
          >
            Download
          </button>
          <button
            type="button"
            className="mt-update-banner__btn"
            onClick={onDismiss}
          >
            Skip
          </button>
        </>
      );
    } else {
      sub = "Auto-install isn't supported on this build. Open the release page to download manually.";
      actions = (
        <>
          <button
            type="button"
            className="mt-update-banner__btn mt-update-banner__btn--primary"
            onClick={onOpenRelease}
          >
            Open release page
          </button>
          <button
            type="button"
            className="mt-update-banner__btn"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </>
      );
    }
  } else if (state.phase === "downloading") {
    const percent = Math.max(
      0,
      Math.min(100, Math.round(state.progress?.percent ?? 0)),
    );
    title = `Downloading v${state.version ?? ""}… ${percent}%`;
    sub = "";
  } else if (state.phase === "downloaded") {
    title = `v${state.version ?? ""} downloaded`;
    sub = "Restart mTerminal to install.";
    actions = (
      <>
        <button
          type="button"
          className="mt-update-banner__btn mt-update-banner__btn--primary"
          onClick={onInstall}
        >
          Restart now
        </button>
        <button
          type="button"
          className="mt-update-banner__btn"
          onClick={onDismiss}
        >
          Later
        </button>
      </>
    );
  } else if (state.phase === "error") {
    title = "Update check failed";
    sub = state.error ?? "Unknown error";
    actions = (
      <button
        type="button"
        className="mt-update-banner__btn"
        onClick={onRetry}
      >
        Retry
      </button>
    );
  }

  return (
    <div className={bannerCls} role="status">
      <div className="mt-update-banner__body">
        <div className="mt-update-banner__title">{title}</div>
        {sub ? <div className="mt-update-banner__sub">{sub}</div> : null}
        {state.phase === "downloading" ? (
          <div className="mt-update-banner__progress" aria-hidden="true">
            <div
              className="mt-update-banner__progress-fill"
              style={{
                width: `${Math.max(0, Math.min(100, Math.round(state.progress?.percent ?? 0)))}%`,
              }}
            />
          </div>
        ) : null}
        {state.phase === "available" && showNotes && state.releaseNotes ? (
          <pre
            style={{
              margin: "6px 0 0",
              padding: "6px 8px",
              background: "var(--bg-muted, rgba(0,0,0,0.25))",
              borderRadius: 4,
              fontSize: 11,
              lineHeight: 1.4,
              maxHeight: 200,
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {state.releaseNotes}
          </pre>
        ) : null}
      </div>
      {actions ? (
        <div className="mt-update-banner__actions">{actions}</div>
      ) : null}
    </div>
  );
}
