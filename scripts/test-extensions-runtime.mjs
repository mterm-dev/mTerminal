#!/usr/bin/env node
/**
 * Runtime smoke test for the extension host.
 *
 * Run AFTER `pnpm dev` (or installed app) is up:
 *
 *   node scripts/test-extensions-runtime.mjs
 *
 * Walks the user/built-in extension dirs, reads each manifest, and prints
 * a status line per extension. Fails (exit 1) if any manifest is invalid.
 *
 * This is a minimal sanity check that doesn't require a GUI — it validates
 * the same code paths as `host.scanAndSync()` (manifest reading + validation)
 * without spinning up Electron.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

async function listExtDirs(rootDir) {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  } catch {
    return []
  }
}

async function readManifest(dir) {
  const file = path.join(dir, 'package.json')
  const raw = await fs.readFile(file, 'utf-8')
  const pkg = JSON.parse(raw)
  if (!pkg.mterminal) {
    throw new Error(`missing "mterminal" block in ${file}`)
  }
  if (!pkg.name || !pkg.version) {
    throw new Error(`missing name/version in ${file}`)
  }
  // Allow declarative-only plugins (e.g. theme packs).
  const declarative = pkg.mterminal?.contributes?.themes?.length > 0
  if (!pkg.main && !pkg.renderer && !declarative) {
    throw new Error(`neither "main"/"renderer" entry nor declarative contributions in ${file}`)
  }
  return pkg
}

async function main() {
  const builtInRoot = path.join(repoRoot, 'extensions')
  const userRoot = path.join(process.env.HOME || '/tmp', '.mterminal', 'extensions')

  let failed = 0
  for (const [label, root] of [
    ['built-in', builtInRoot],
    ['user', userRoot],
  ]) {
    console.log(`\n— ${label} (${root}) —`)
    const dirs = await listExtDirs(root)
    if (dirs.length === 0) {
      console.log('  (no extensions)')
      continue
    }
    for (const dir of dirs) {
      const extPath = path.join(root, dir.name)
      try {
        const m = await readManifest(extPath)
        const id = m.mterminal.id ?? dir.name.replace(/^mterminal-plugin-/, '')
        const events = m.mterminal.activationEvents?.length ?? 0
        const contributes = Object.keys(m.mterminal.contributes ?? {}).length
        const renderer = m.renderer ? 'renderer ✓' : 'renderer ·'
        const main = m.main ? 'main ✓' : 'main ·'
        console.log(`  ✓ ${id.padEnd(24)} v${m.version}  ${main}  ${renderer}  events:${events} contributes:${contributes}`)

        // If renderer entry exists, sanity-check that the file is on disk so
        // the mt-ext:// protocol handler can serve it.
        if (m.renderer) {
          const rendererFile = path.resolve(extPath, m.renderer)
          try {
            await fs.access(rendererFile)
          } catch {
            console.log(`     ⚠ renderer entry missing on disk: ${rendererFile}`)
            failed++
          }
        }
      } catch (err) {
        console.log(`  ✗ ${dir.name}: ${err.message}`)
        failed++
      }
    }
  }

  console.log()
  if (failed > 0) {
    console.error(`${failed} extension(s) failed validation`)
    process.exit(1)
  }
  console.log('all extensions validated ✓')
  console.log('\nNext steps for runtime verification:')
  console.log('  1. pnpm dev')
  console.log('  2. Press Ctrl+Shift+X in the running app to open the Plugin Manager')
  console.log('  3. For each user extension, click "Trust & activate"')
  console.log('  4. For ESM-renderer plugins (e.g. error-linkifier, git-status-mini),')
  console.log('     open DevTools (View → Toggle Developer Tools) and look for')
  console.log('     the [ext:<id>] activated log line. Network tab should show')
  console.log('     `mt-ext://<id>/...` requests with status 200.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

void pathToFileURL // keep the import live for future use
