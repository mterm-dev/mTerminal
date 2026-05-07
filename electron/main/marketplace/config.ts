export const PROD_ENDPOINT = 'https://marketplace.mterminal.app'
export const DEV_ENDPOINT = 'http://127.0.0.1:8787'

export function resolveEndpoint(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MARKETPLACE_ENDPOINT && env.MARKETPLACE_ENDPOINT.length > 0) {
    return env.MARKETPLACE_ENDPOINT.replace(/\/+$/, '')
  }
  return env.NODE_ENV === 'development' ? DEV_ENDPOINT : PROD_ENDPOINT
}
