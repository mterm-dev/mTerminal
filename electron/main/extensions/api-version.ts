/**
 * The runtime version of `@mterminal/extension-api` that this host implements.
 *
 * Bump rules:
 *   - patch: bug fix only, no API change
 *   - minor: additive API (new methods, new optional fields)
 *   - major: breaking change to existing API
 *
 * The host also publishes a global `__MT_API_VERSION` constant (renderer-side)
 * for runtime introspection.
 */
export const HOST_API_VERSION = '1.0.0-alpha.0'
