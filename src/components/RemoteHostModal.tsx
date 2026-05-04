import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "../lib/tauri-shim";
import {
  type HostMeta,
  type SshKey,
  type ToolAvailability,
  getToolAvailability,
  listSshKeys,
} from "../hooks/useRemoteHosts";

interface Props {
  initial?: HostMeta | null;
  vaultUnlocked: boolean;
  onClose: () => void;
  onSubmit: (host: HostMeta, password?: string) => Promise<void>;
  onRequestUnlock: () => void;
}

const empty: HostMeta = {
  id: "",
  name: "",
  host: "",
  port: 22,
  user: "",
  auth: "key",
  identityPath: "",
  savePassword: true,
};

export function RemoteHostModal({
  initial,
  vaultUnlocked,
  onClose,
  onSubmit,
  onRequestUnlock,
}: Props) {
  const [form, setForm] = useState<HostMeta>(initial ?? empty);
  const [password, setPassword] = useState("");
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [tools, setTools] = useState<ToolAvailability>({ sshpass: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSshKeys().then(setKeys);
    getToolAvailability().then(setTools);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const isEdit = !!initial?.id;

  const update = <K extends keyof HostMeta>(key: K, value: HostMeta[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const browseKey = async () => {
    try {
      const home = (window as unknown as { __MT_HOME?: string }).__MT_HOME ?? "";
      const path = await openDialog({
        multiple: false,
        directory: false,
        defaultPath: home ? `${home}/.ssh` : undefined,
        title: "select ssh private key",
      });
      if (typeof path === "string") update("identityPath", path);
    } catch {}
  };

  const passwordWillBeSaved = useMemo(
    () => form.auth === "password" && form.savePassword,
    [form.auth, form.savePassword],
  );

  const submit = async () => {
    setError(null);
    if (!form.host.trim()) return setError("host is required");
    if (!form.user.trim()) return setError("user is required");
    if (form.port < 1 || form.port > 65535)
      return setError("port must be between 1 and 65535");
    if (form.auth === "key" && !form.identityPath?.trim())
      return setError("pick an identity file (or switch to agent auth)");
    if (passwordWillBeSaved && !vaultUnlocked) {
      onRequestUnlock();
      return;
    }
    if (passwordWillBeSaved && !isEdit && !password) {
      return setError("enter the password to save, or uncheck 'save password'");
    }

    setBusy(true);
    try {
      const meta: HostMeta = {
        ...form,
        name: form.name.trim() || `${form.user}@${form.host}`,
        identityPath: form.auth === "key" ? form.identityPath : undefined,
        savePassword: form.auth === "password" ? form.savePassword : false,
      };
      const pw = passwordWillBeSaved && password ? password : undefined;
      await onSubmit(meta, pw);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="settings-dialog host-dialog">
        <div className="settings-body-h">
          <span className="settings-title">
            {isEdit ? "edit ssh host" : "new ssh host"}
          </span>
          <button className="settings-close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="settings-scroll host-body">
          <div className="settings-field">
            <label className="settings-field-label">name</label>
            <span className="settings-field-hint">label shown in sidebar</span>
            <div className="settings-field-control">
              <input
                className="settings-input"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder={`${form.user || "user"}@${form.host || "host"}`}
                autoFocus
              />
            </div>
          </div>

          <div className="settings-field-row">
            <div className="settings-field">
              <label className="settings-field-label">host</label>
              <div className="settings-field-control">
                <input
                  className="settings-input"
                  value={form.host}
                  onChange={(e) => update("host", e.target.value)}
                  placeholder="vps.example.com"
                />
              </div>
            </div>
            <div className="settings-field" style={{ maxWidth: 110 }}>
              <label className="settings-field-label">port</label>
              <div className="settings-field-control">
                <input
                  type="number"
                  className="settings-input"
                  value={form.port}
                  min={1}
                  max={65535}
                  onChange={(e) => update("port", Number(e.target.value) || 22)}
                />
              </div>
            </div>
          </div>

          <div className="settings-field">
            <label className="settings-field-label">user</label>
            <div className="settings-field-control">
              <input
                className="settings-input"
                value={form.user}
                onChange={(e) => update("user", e.target.value)}
                placeholder="root"
              />
            </div>
          </div>

          <div className="settings-field">
            <label className="settings-field-label">authentication</label>
            <div className="settings-field-control auth-radio">
              {(["key", "agent", "password"] as const).map((a) => (
                <label key={a} className={`auth-opt ${form.auth === a ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="auth"
                    checked={form.auth === a}
                    onChange={() => update("auth", a)}
                  />
                  <span>{a}</span>
                </label>
              ))}
            </div>
          </div>

          {form.auth === "key" && (
            <div className="settings-field">
              <label className="settings-field-label">identity file</label>
              <span className="settings-field-hint">
                detected keys in ~/.ssh/ — or browse to pick another
              </span>
              <div className="settings-field-control key-picker">
                <select
                  className="settings-input"
                  value={form.identityPath ?? ""}
                  onChange={(e) => update("identityPath", e.target.value)}
                >
                  <option value="">— select —</option>
                  {keys.map((k) => (
                    <option key={k.path} value={k.path}>
                      {k.name} ({k.keyType})
                    </option>
                  ))}
                  {form.identityPath &&
                    !keys.some((k) => k.path === form.identityPath) && (
                      <option value={form.identityPath}>
                        {form.identityPath}
                      </option>
                    )}
                </select>
                <button className="confirm-btn" onClick={browseKey}>
                  browse...
                </button>
              </div>
            </div>
          )}

          {form.auth === "agent" && (
            <p className="settings-note">
              uses your running ssh-agent ($SSH_AUTH_SOCK). add keys with
              <code> ssh-add</code> outside mTerminal.
            </p>
          )}

          {form.auth === "password" && (
            <>
              {!tools.sshpass && (
                <div className="vault-error">
                  sshpass not found on PATH. install it (e.g.
                  <code> sudo pacman -S sshpass</code>) to use password auth.
                </div>
              )}
              <div className="settings-field">
                <label className="settings-field-toggle">
                  <input
                    type="checkbox"
                    checked={form.savePassword}
                    onChange={(e) => update("savePassword", e.target.checked)}
                  />
                  <span>save password (encrypted with master password)</span>
                </label>
              </div>
              {form.savePassword && (
                <div className="settings-field">
                  <label className="settings-field-label">
                    password {isEdit && "(leave blank to keep current)"}
                  </label>
                  <div className="settings-field-control">
                    <input
                      type="password"
                      className="settings-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {error && <div className="vault-error">{error}</div>}

          <div className="vault-actions">
            <button className="confirm-btn" onClick={onClose} disabled={busy}>
              cancel
            </button>
            <button
              className="confirm-btn confirm-btn-primary"
              onClick={submit}
              disabled={busy}
            >
              {busy ? "..." : isEdit ? "save" : "add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
