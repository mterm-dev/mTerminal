import { promises as fsp } from 'node:fs'
import { makeError } from './error-map'
import type { HostMeta, SftpAuthBundle } from '../shared/types'

export interface SecretReader {
  get(key: string): Promise<string | null>
}

export function secretKeyForHost(hostId: string): string {
  return `host:${hostId}`
}

export async function buildAuthBundle(
  host: HostMeta,
  secrets: SecretReader,
): Promise<SftpAuthBundle> {
  const bundle: SftpAuthBundle = {
    hostId: host.id,
    host: host.host,
    port: host.port,
    user: host.user,
    auth: host.auth,
  }
  if (host.auth === 'key') {
    if (!host.identityPath) {
      throw makeError('EHOSTAUTH', `host ${host.id}: identityPath required for key auth`)
    }
    bundle.identityPath = host.identityPath
  } else if (host.auth === 'password') {
    if (!host.savePassword) {
      throw makeError(
        'EVAULTLOCKED',
        `host ${host.id}: password auth requires savePassword=true`,
      )
    }
    const pwd = await secrets.get(secretKeyForHost(host.id))
    if (!pwd) {
      throw makeError('EVAULTLOCKED', `host ${host.id}: no saved password`)
    }
    bundle.password = pwd
  }
  return bundle
}

export async function readPrivateKey(p: string): Promise<Buffer> {
  try {
    return await fsp.readFile(p)
  } catch (err) {
    throw makeError('EHOSTAUTH', `cannot read identity ${p}: ${(err as Error).message}`)
  }
}
