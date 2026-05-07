import React, { useEffect, useMemo, useState } from 'react'
import type { HostMeta, SshAuthMode, SshKey } from '../shared/types'

interface UiHelpers {
  toast(opts: { kind?: 'info' | 'success' | 'warn' | 'error'; message: string }): void
}

interface SecretsApi {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

interface Props {
  initial: HostMeta | null
  onClose(): void
  onSave(host: HostMeta): Promise<void>
  listSshKeys(): Promise<SshKey[]>
  secrets: SecretsApi
  ui: UiHelpers
}

const empty: HostMeta = {
  id: '',
  name: '',
  host: '',
  port: 22,
  user: '',
  auth: 'key',
  identityPath: undefined,
  savePassword: false,
  groupId: null,
}

export function HostEditorModal({
  initial,
  onClose,
  onSave,
  listSshKeys,
  secrets,
  ui,
}: Props) {
  const [form, setForm] = useState<HostMeta>(initial ?? empty)
  const [password, setPassword] = useState('')
  const [keys, setKeys] = useState<SshKey[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void listSshKeys().then(setKeys).catch(() => setKeys([]))
  }, [listSshKeys])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const isEdit = Boolean(initial?.id)
  const passwordWillBeSaved = useMemo(
    () => form.auth === 'password' && form.savePassword,
    [form.auth, form.savePassword],
  )

  function update<K extends keyof HostMeta>(key: K, value: HostMeta[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(): Promise<void> {
    setError(null)
    if (!form.host.trim()) return setError('host is required')
    if (!form.user.trim()) return setError('user is required')
    if (form.port < 1 || form.port > 65535) return setError('port must be between 1 and 65535')
    if (form.auth === 'key' && !form.identityPath?.trim()) {
      return setError('pick an identity file (or switch to agent auth)')
    }
    if (passwordWillBeSaved && !isEdit && !password) {
      return setError("enter the password to save, or uncheck 'save password'")
    }
    setBusy(true)
    try {
      const meta: HostMeta = {
        ...form,
        name: form.name.trim() || `${form.user}@${form.host}`,
        identityPath: form.auth === 'key' ? form.identityPath : undefined,
        savePassword: form.auth === 'password' ? Boolean(form.savePassword) : false,
      }
      await onSave(meta)
      const secretKey = `host:${meta.id || (initial?.id ?? '')}`
      if (passwordWillBeSaved && password && meta.id) {
        await secrets.set(`host:${meta.id}`, password).catch((e) => {
          ui.toast({ kind: 'warn', message: `could not save password: ${(e as Error).message}` })
        })
      } else if (!passwordWillBeSaved && meta.id) {
        await secrets.delete(`host:${meta.id}`).catch(() => {})
      }
      void secretKey
      onClose()
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="rs-modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="rs-modal">
        <div className="rs-modal-header">
          <span className="rs-modal-title">{isEdit ? 'edit ssh host' : 'new ssh host'}</span>
          <button className="rs-icon-btn" onClick={onClose} disabled={busy} aria-label="close">
            ×
          </button>
        </div>
        <div className="rs-modal-body">
          <Field label="name" hint="label shown in sidebar">
            <input
              className="rs-input"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder={`${form.user || 'user'}@${form.host || 'host'}`}
              autoFocus
            />
          </Field>
          <div className="rs-field-row">
            <Field label="host">
              <input
                className="rs-input"
                value={form.host}
                onChange={(e) => update('host', e.target.value)}
                placeholder="vps.example.com"
              />
            </Field>
            <Field label="port" widthClass="rs-field-narrow">
              <input
                type="number"
                className="rs-input"
                value={form.port}
                min={1}
                max={65535}
                onChange={(e) => update('port', Number(e.target.value) || 22)}
              />
            </Field>
          </div>
          <Field label="user">
            <input
              className="rs-input"
              value={form.user}
              onChange={(e) => update('user', e.target.value)}
              placeholder="root"
            />
          </Field>
          <Field label="authentication">
            <div className="rs-radio-row">
              {(['key', 'agent', 'password'] as SshAuthMode[]).map((a) => (
                <label key={a} className={`rs-radio ${form.auth === a ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="auth"
                    checked={form.auth === a}
                    onChange={() => update('auth', a)}
                  />
                  <span>{a}</span>
                </label>
              ))}
            </div>
          </Field>
          {form.auth === 'key' && (
            <Field label="identity file" hint="detected keys in ~/.ssh/">
              <select
                className="rs-input"
                value={form.identityPath ?? ''}
                onChange={(e) => update('identityPath', e.target.value || undefined)}
              >
                <option value="">— select —</option>
                {keys.map((k) => (
                  <option key={k.path} value={k.path}>
                    {k.name} ({k.keyType})
                  </option>
                ))}
                {form.identityPath && !keys.some((k) => k.path === form.identityPath) && (
                  <option value={form.identityPath}>{form.identityPath}</option>
                )}
              </select>
            </Field>
          )}
          {form.auth === 'agent' && (
            <p className="rs-note">
              uses your running ssh-agent ($SSH_AUTH_SOCK). add keys with <code>ssh-add</code> outside mTerminal.
            </p>
          )}
          {form.auth === 'password' && (
            <>
              <div className="rs-field rs-field-toggle">
                <div className="rs-field-toggle-text">
                  <span>save password</span>
                  <span className="rs-field-hint">
                    stored encrypted in the secrets store
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.savePassword}
                  className={`rs-toggle ${form.savePassword ? 'on' : ''}`}
                  onClick={() => update('savePassword', !form.savePassword)}
                >
                  <span className="rs-toggle-knob" />
                </button>
              </div>
              {form.savePassword && (
                <Field label={isEdit ? 'password (leave blank to keep current)' : 'password'}>
                  <input
                    type="password"
                    className="rs-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
              )}
            </>
          )}
          {error && <div className="rs-error">{error}</div>}
          <div className="rs-actions">
            <button className="rs-btn" onClick={onClose} disabled={busy}>
              cancel
            </button>
            <button className="rs-btn rs-btn-primary" onClick={submit} disabled={busy}>
              {busy ? '...' : isEdit ? 'save' : 'add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
  widthClass,
}: {
  label?: string
  hint?: string
  children: React.ReactNode
  widthClass?: string
}): React.JSX.Element {
  return (
    <div className={`rs-field ${widthClass ?? ''}`}>
      {label && <label className="rs-field-label">{label}</label>}
      {hint && <span className="rs-field-hint">{hint}</span>}
      <div className="rs-field-control">{children}</div>
    </div>
  )
}
