/**
 * Fallback rendered if the seeded built-in registry hasn't booted yet (or in
 * tests where it's intentionally skipped). After cofnięcie SDK-as-extension
 * the three first-party providers (Anthropic / Codex / Ollama) are always
 * present, so in practice this only flashes during initial mount.
 */
export function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="aip-hero">
        <div className="aip-hero-art" aria-hidden>
          <span className="aip-cap">An</span>
          <span className="aip-cap">Cx</span>
          <span className="aip-cap">Ol</span>
        </div>
        <div className="aip-hero-title">Loading providers…</div>
        <div className="aip-hero-sub">
          Anthropic, OpenAI Codex, and Ollama are bundled with mTerminal and
          should appear in a moment. Add an API key to start using one.
        </div>
      </div>
    </div>
  );
}
