/**
 * Scoped styles for the AI Settings panel. Injected once on first mount via
 * <style> in the document head — same pattern hotbinds uses for its modal.
 *
 * All classnames are prefixed `aip-` (AI Panel) to avoid collisions with the
 * shared `.settings-*` primitives.
 */

export const STYLE_ID = "aip-styles";

export const CSS = `
.aip-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  container-type: inline-size;
  container-name: aip-root;
}

.aip-section-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}
.aip-section-h h3 {
  margin: 0;
  font-size: var(--t-md);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--fg);
}
.aip-section-h .aip-sub {
  font-size: var(--t-xs);
  color: var(--fg-dim);
}

/* ─── empty state hero ─────────────────────────────────────────────── */
.aip-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 28px 20px 24px;
  gap: 12px;
  background: var(--bg-raised, var(--bg-base));
  border: 1px solid var(--border);
  border-radius: 12px;
}
.aip-hero-art {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  opacity: 0.6;
  margin-bottom: 4px;
}
.aip-hero-art .aip-cap {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-muted);
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-bottom-width: 3px;
  border-radius: 10px;
}
.aip-hero-title {
  font-size: var(--t-md);
  font-weight: 600;
  color: var(--fg);
}
.aip-hero-sub {
  color: var(--fg-dim);
  font-size: var(--t-sm);
  max-width: 460px;
  line-height: 1.5;
}

/* ─── install grid ─────────────────────────────────────────────────── */
.aip-install-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
@container aip-root (max-width: 620px) {
  .aip-install-grid { grid-template-columns: 1fr; }
}

.aip-install-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 14px 12px;
  background: var(--bg-raised, var(--bg-base));
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: border-color 120ms ease, transform 120ms ease;
}
.aip-install-card:hover {
  border-color: var(--border-strong);
}
.aip-install-card-h {
  display: flex;
  align-items: center;
  gap: 10px;
}
.aip-install-card-name {
  font-weight: 600;
  font-size: var(--t-sm);
  color: var(--fg);
}
.aip-install-card-desc {
  color: var(--fg-dim);
  font-size: var(--t-xs);
  line-height: 1.45;
  flex: 1;
}
.aip-install-card-foot {
  margin-top: 4px;
  display: flex;
  gap: 6px;
}

/* ─── provider logo bubble ─────────────────────────────────────────── */
.aip-logo {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 12px;
  color: var(--fg);
  background: var(--bg-active);
  border: 1px solid var(--border);
  flex-shrink: 0;
  letter-spacing: -0.5px;
}
.aip-logo.aip-logo-anthropic { background: oklch(74.6% .160 232.661 / 0.18); color: oklch(78.9% .154 211.530); border-color: oklch(74.6% .160 232.661 / 0.45); }
.aip-logo.aip-logo-openai-codex { background: oklch(76.5% .177 163.223 / 0.16); color: oklch(76.5% .177 163.223); border-color: oklch(76.5% .177 163.223 / 0.4); }
.aip-logo.aip-logo-ollama { background: oklch(70.2% .183 293.541 / 0.18); color: oklch(70.2% .183 293.541); border-color: oklch(70.2% .183 293.541 / 0.4); }

/* ─── provider card (installed) ────────────────────────────────────── */
.aip-card {
  display: flex;
  flex-direction: column;
  background: var(--bg-raised, var(--bg-base));
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  container-type: inline-size;
  container-name: aip-card;
}
.aip-card.aip-card-default {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 1px var(--border);
}
.aip-card-h {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.aip-card-name {
  font-weight: 600;
  font-size: var(--t-sm);
  color: var(--fg);
}
.aip-card-meta {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.aip-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-active);
  color: var(--fg-muted);
  text-transform: uppercase;
}
.aip-pill-ok { color: oklch(76.5% .177 163.223); border-color: oklch(76.5% .177 163.223 / 0.4); background: oklch(76.5% .177 163.223 / 0.12); }
.aip-pill-warn { color: oklch(82.8% .189 84.429); border-color: oklch(82.8% .189 84.429 / 0.4); background: oklch(82.8% .189 84.429 / 0.12); }
.aip-pill-default { color: oklch(74.6% .160 232.661); border-color: oklch(74.6% .160 232.661 / 0.45); background: oklch(74.6% .160 232.661 / 0.12); }

.aip-card-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.aip-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.aip-row-label {
  font-size: 10.5px;
  color: var(--fg-dim);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 500;
}
.aip-row-control {
  display: flex;
  gap: 6px;
  align-items: stretch;
}
.aip-row-control input[type="text"],
.aip-row-control input[type="password"] {
  flex: 1;
  min-width: 0;
  background: var(--bg-muted, var(--bg-base));
  border: 1px solid var(--border);
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  padding: 7px 10px;
  border-radius: var(--r-sm, 6px);
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s, background 0.12s;
}
.aip-row-control input[type="text"]::placeholder,
.aip-row-control input[type="password"]::placeholder {
  color: color-mix(in oklch, var(--fg-muted) 60%, transparent);
}
.aip-row-control input[type="text"]:focus,
.aip-row-control input[type="password"]:focus {
  border-color: var(--border-strong);
  background: color-mix(in oklch, var(--bg-muted, var(--bg-base)) 60%, var(--bg-raised) 40%);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--border-strong) 35%, transparent);
}
.aip-row-control input[type="password"] {
  letter-spacing: 0.08em;
}
.aip-row-control .ghost-btn {
  flex-shrink: 0;
}
.aip-row-status {
  align-items: center;
  padding: 6px 10px;
  background: var(--bg-muted, var(--bg-base));
  border: 1px dashed var(--border);
  border-radius: var(--r-sm, 6px);
}
.aip-row-status .aip-spacer { flex: 1; }
.aip-row-label .aip-row-link {
  margin-left: 8px;
  font-size: 10px;
  color: var(--c-blue);
  text-transform: none;
  letter-spacing: 0;
  text-decoration: none;
}
.aip-row-label .aip-row-link:hover { text-decoration: underline; }
.aip-key-status {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--fg-dim);
}
.aip-key-status.ok { color: oklch(76.5% .177 163.223); }
.aip-key-status.empty { color: var(--fg-dim); }

.aip-models {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.aip-models .aip-model-pill {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bg-active);
  border: 1px solid var(--border);
  color: var(--fg-muted);
  cursor: pointer;
  font-family: var(--font-mono);
}
.aip-models .aip-model-pill:hover { color: var(--fg); border-color: var(--border-strong); }
.aip-models .aip-model-pill.aip-model-active { color: var(--fg); border-color: var(--border-strong); background: var(--bg-selected); }

.aip-card-foot {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-base);
  justify-content: flex-end;
}
.aip-card-foot .aip-spacer { flex: 1; }

/* ─── default provider segmented ───────────────────────────────────── */
.aip-default-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.aip-default-label {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ─── ai binding card (Settings → Extensions → <ext>) ─────────────── */
.aip-binding-desc {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  line-height: 1.5;
  margin: -2px 0 4px;
}

.aip-source-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
@container aip-card (max-width: 480px) {
  .aip-source-toggle { grid-template-columns: 1fr; }
}
.aip-source-opt {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  background: var(--bg-muted, var(--bg-base));
  border: 1px solid var(--border);
  border-radius: var(--r-sm, 6px);
  cursor: pointer;
  font-family: inherit;
  color: var(--fg-dim);
  transition: border-color 0.12s, background 0.12s, color 0.12s;
}
.aip-source-opt:hover {
  border-color: var(--border-strong);
  color: var(--fg-muted);
}
.aip-source-opt.active {
  border-color: var(--border-strong);
  background: color-mix(in oklch, var(--bg-muted, var(--bg-base)) 50%, var(--bg-raised) 50%);
  color: var(--fg);
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--border-strong) 25%, transparent);
}
.aip-source-opt-title {
  font-weight: 600;
  font-size: var(--t-sm);
}
.aip-source-opt-desc {
  font-size: 11px;
  color: var(--fg-dim);
  line-height: 1.4;
}

.aip-pill-muted {
  color: var(--fg-dim);
  border-color: var(--border);
  background: var(--bg-active);
}

/* ─── misc ─────────────────────────────────────────────────────────── */
.aip-toggles {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.aip-link {
  background: none;
  border: none;
  color: var(--c-blue);
  cursor: pointer;
  font-size: var(--t-xs);
  padding: 0;
}
.aip-link:hover { text-decoration: underline; }
`;

export function ensureStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
