import { parentPort, workerData } from 'node:worker_threads'
import { argon2id } from '@noble/hashes/argon2'

interface KdfRequest {
  password: Uint8Array
  salt: Uint8Array
  m: number
  t: number
  p: number
  dkLen: number
  version: number
}

const req = workerData as KdfRequest
const out = argon2id(req.password, req.salt, {
  m: req.m,
  t: req.t,
  p: req.p,
  dkLen: req.dkLen,
  version: req.version,
})
parentPort?.postMessage(out)
