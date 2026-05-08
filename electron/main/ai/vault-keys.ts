/**
 * Thin re-exports so providers can read their API key without reaching across
 * the entire main module graph. The actual storage lives in `../vault.ts`
 * (Argon2id + XChaCha20-Poly1305).
 */

export { getAiKey, setAiKey, clearAiKey } from '../vault'
