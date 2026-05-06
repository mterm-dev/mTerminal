import { app, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { getAiKey, isUnlocked } from '../vault'

const execFileAsync = promisify(execFile)

interface TranscribeArgs {
  engine: 'whisper-cpp' | 'openai'
  wav: Uint8Array | ArrayBuffer | Buffer
  language?: string
  openaiModel?: string
  openaiBaseUrl?: string
  whisperBinPath?: string
  whisperModelPath?: string
}

function toBuffer(input: Uint8Array | ArrayBuffer | Buffer | undefined): Buffer {
  if (!input) return Buffer.alloc(0)
  if (Buffer.isBuffer(input)) return input
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  if (input instanceof ArrayBuffer) return Buffer.from(input)
  return Buffer.from(input as Uint8Array)
}

async function writeTempWav(buf: Buffer): Promise<string> {
  const dir = app.getPath('temp')
  const name = `mterminal-voice-${Date.now()}-${Math.floor(Math.random() * 1e6)}.wav`
  const p = path.join(dir, name)
  await fsp.writeFile(p, buf)
  return p
}

async function safeUnlink(p: string): Promise<void> {
  try {
    await fsp.unlink(p)
  } catch {}
}

interface ExecError extends Error {
  stderr?: string | Buffer
  stdout?: string | Buffer
  code?: number | string
}

function stderrText(e: unknown): string {
  const err = e as ExecError
  const raw = err?.stderr
  if (!raw) return ''
  return typeof raw === 'string' ? raw : raw.toString('utf8')
}

const GPU_OOM_PATTERNS = [
  /out\s*of\s*(device\s*)?memory/i,
  /ErrorOutOfDeviceMemory/i,
  /failed to allocate (Vulkan|CUDA|Metal|GPU)/i,
  /cudaMalloc.*failed/i,
  /CUDA error.*out of memory/i,
  /ggml_vulkan:.*allocat/i,
]

function isGpuOom(stderr: string): boolean {
  return GPU_OOM_PATTERNS.some((re) => re.test(stderr))
}

function summarizeWhisperError(e: unknown): string {
  const stderr = stderrText(e)
  if (stderr) {
    if (isGpuOom(stderr)) {
      return 'whisper.cpp ran out of GPU/system memory loading the model. Close other GPU apps or use a smaller model.'
    }
    const lines = stderr
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('whisper_') && !l.startsWith('ggml_'))
    const last = lines[lines.length - 1]
    if (last) return last.slice(0, 240)
  }
  const msg = e instanceof Error ? e.message : String(e)
  const firstLine = msg.split(/\r?\n/)[0] || msg
  return firstLine.slice(0, 240)
}

async function transcribeWhisperCpp(args: TranscribeArgs, wavPath: string): Promise<string> {
  const bin = (args.whisperBinPath || '').trim()
  const model = (args.whisperModelPath || '').trim()
  if (!bin) throw new Error('whisper.cpp binary path not set in settings')
  if (!model) throw new Error('whisper.cpp model path not set in settings')

  const lang = (args.language || 'auto').trim() || 'auto'
  const threads = Math.max(1, Math.min(16, os.cpus().length))
  const baseArgs = [
    '-m', model,
    '-l', lang,
    '-f', wavPath,
    '-t', String(threads),
    '-bs', '1',
    '-bo', '1',
    '--no-fallback',
    '-otxt',
    '-nt',
  ]

  const run = async (extra: string[]) => {
    await execFileAsync(bin, [...baseArgs, ...extra], {
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    })
  }

  try {
    await run([])
  } catch (e) {
    if (isGpuOom(stderrText(e))) {
      console.warn('[voice] whisper.cpp GPU OOM — retrying on CPU')
      try {
        await run(['-ng'])
      } catch (e2) {
        throw new Error(`whisper.cpp failed: ${summarizeWhisperError(e2)}`)
      }
    } else {
      throw new Error(`whisper.cpp failed: ${summarizeWhisperError(e)}`)
    }
  }

  const txtPath = `${wavPath}.txt`
  let text = ''
  try {
    text = await fsp.readFile(txtPath, 'utf8')
  } finally {
    await safeUnlink(txtPath)
  }
  return text.trim()
}

async function transcribeOpenAi(args: TranscribeArgs, wavBuf: Buffer): Promise<string> {
  if (!isUnlocked()) throw new Error('vault locked — unlock to use OpenAI Whisper')
  const key = getAiKey('openai')
  if (!key) throw new Error('OpenAI API key not configured')

  const baseUrl = (args.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = (args.openaiModel || 'whisper-1').trim() || 'whisper-1'
  const language = (args.language || '').trim()

  const form = new FormData()
  const blob = new Blob([wavBuf], { type: 'audio/wav' })
  form.append('file', blob, 'recording.wav')
  form.append('model', model)
  if (language && language.toLowerCase() !== 'auto') {
    form.append('language', language)
  }
  form.append('response_format', 'json')

  const resp = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
    },
    body: form,
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`OpenAI Whisper ${resp.status}: ${body || resp.statusText}`)
  }
  const json = (await resp.json().catch(() => null)) as { text?: string } | null
  return (json?.text ?? '').trim()
}

export function registerVoiceHandlers(): void {
  ipcMain.handle('voice:transcribe', async (_e, args: TranscribeArgs) => {
    if (!args || (args.engine !== 'whisper-cpp' && args.engine !== 'openai')) {
      throw new Error('invalid voice engine')
    }
    const buf = toBuffer(args.wav)
    if (buf.length === 0) return { text: '' }

    if (args.engine === 'openai') {
      const text = await transcribeOpenAi(args, buf)
      return { text }
    }

    const wavPath = await writeTempWav(buf)
    try {
      const text = await transcribeWhisperCpp(args, wavPath)
      return { text }
    } finally {
      await safeUnlink(wavPath)
    }
  })
}
