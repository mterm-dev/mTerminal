/**
 * First-party AI provider catalog.
 *
 * After cofnięcie SDK-as-extension every entry below is a built-in shipped
 * inside the app — there is no marketplace install path. The catalog still
 * powers branded logos, descriptions, and the "where do I get an API key?"
 * link surfaced inside Settings → AI and inside extension binding cards.
 */

export interface SdkCatalogEntry {
  providerId: string;
  label: string;
  /** Two-letter mark used inside the rounded logo bubble. */
  initials: string;
  /** One-line description shown on the provider card. */
  description: string;
  /** Optional doc / homepage link for "learn more". */
  link?: string;
  /** Optional direct link to where the user can obtain an API key. */
  keyHelpUrl?: string;
  /** Whether the provider needs an API key in the vault. */
  requiresVault: boolean;
  /** Default model id (used as input placeholder). */
  defaultModel: string;
}

export const SDK_CATALOG: SdkCatalogEntry[] = [
  {
    providerId: "anthropic",
    label: "Anthropic",
    initials: "An",
    description:
      "Claude (Opus, Sonnet, Haiku) via the official @anthropic-ai/sdk package. Supports streaming chat plus the full Messages API for advanced tool use.",
    link: "https://docs.anthropic.com",
    keyHelpUrl: "https://console.anthropic.com/settings/keys",
    requiresVault: true,
    defaultModel: "claude-opus-4-7",
  },
  {
    providerId: "openai-codex",
    label: "OpenAI Codex",
    initials: "Cx",
    description:
      "OpenAI Codex SDK (@openai/codex-sdk). Agentic coding flows — tool use, multi-step reasoning, and streaming via Codex threads.",
    link: "https://developers.openai.com/codex/sdk",
    keyHelpUrl: "https://platform.openai.com/api-keys",
    requiresVault: true,
    defaultModel: "gpt-5-codex",
  },
  {
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
