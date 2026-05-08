/**
 * Typed shapes for the live SDK clients published by the three first-party
 * AI provider extensions. Consumers grab the live client via:
 *
 *   - `ctx.services['ai.sdk.<id>']` (declared in `consumedServices` for proper
 *     lifecycle + onAvailable callbacks), or
 *   - `ctx.ai.getSdk<AnthropicSdkService>('anthropic')` (escape hatch).
 *
 * The SDK packages are listed as peer dependencies on the consumer side so
 * the type imports compile without forcing every consumer to install them.
 */

// These are type-only references; the implementations live inside the
// provider extensions and are surfaced via the service registry at runtime.
import type Anthropic from '@anthropic-ai/sdk'
import type { Codex } from '@openai/codex-sdk'
import type { Ollama } from 'ollama'

export interface AnthropicSdkService {
  readonly client: Anthropic
  factory(overrides?: ConstructorParameters<typeof Anthropic>[0]): Anthropic
}

export interface OpenAiCodexSdkService {
  readonly client: Codex
  factory(overrides?: ConstructorParameters<typeof Codex>[0]): Codex
}

export interface OllamaSdkService {
  readonly client: Ollama
  factory(overrides?: ConstructorParameters<typeof Ollama>[0]): Ollama
}

export interface SdkServiceMap {
  'ai.sdk.anthropic': AnthropicSdkService
  'ai.sdk.openai-codex': OpenAiCodexSdkService
  'ai.sdk.ollama': OllamaSdkService
}
