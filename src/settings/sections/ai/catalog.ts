/**
 * First-party SDK provider extension catalog.
 *
 * The Settings → AI panel uses this to render install cards for SDK
 * extensions the user has not yet installed, and to attach branded logos
 * to the corresponding live providers once they activate.
 *
 * `marketplaceId` matches the manifest id (what `marketplace.install(id)`
 * accepts), not the npm package name. The npm publish names live in the
 * mTerminal-extensions monorepo as `@mterminal/ext-provider-<id>`.
 */

export interface SdkCatalogEntry {
  marketplaceId: string;
  providerId: string;
  label: string;
  /** Two-letter mark used inside the rounded logo bubble. */
  initials: string;
  /** One-line description shown on the install card. */
  description: string;
  /** Optional doc / homepage link for "learn more". */
  link?: string;
  /** Whether the provider needs an API key in the vault. */
  requiresVault: boolean;
  /** Default model id (used as input placeholder). */
  defaultModel: string;
}

export const SDK_CATALOG: SdkCatalogEntry[] = [
  {
    marketplaceId: "provider-anthropic",
    providerId: "anthropic",
    label: "Anthropic",
    initials: "An",
    description:
      "Claude (Opus, Sonnet, Haiku) via the official @anthropic-ai/sdk package. Supports streaming chat plus the full Messages API for advanced tool use.",
    link: "https://docs.anthropic.com",
    requiresVault: true,
    defaultModel: "claude-opus-4-7",
  },
  {
    marketplaceId: "provider-openai-codex",
    providerId: "openai-codex",
    label: "OpenAI Codex",
    initials: "Cx",
    description:
      "OpenAI Codex SDK (@openai/codex-sdk). Agentic coding flows — tool use, multi-step reasoning, and streaming via Codex threads.",
    link: "https://developers.openai.com/codex/sdk",
    requiresVault: true,
    defaultModel: "gpt-5-codex",
  },
  {
    marketplaceId: "provider-ollama",
    providerId: "ollama",
    label: "Ollama",
    initials: "Ol",
    description:
      "Local LLMs via the official ollama-js package. No API key needed — point it at any reachable Ollama server.",
    link: "https://ollama.com",
    requiresVault: false,
    defaultModel: "llama3.2",
  },
];

export function findCatalogEntry(providerId: string): SdkCatalogEntry | undefined {
  return SDK_CATALOG.find((e) => e.providerId === providerId);
}
