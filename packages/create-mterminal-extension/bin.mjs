#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * Scaffold a new mTerminal plugin.
 *
 *   npx create-mterminal-extension my-plugin
 *
 * Asks: template, TypeScript on/off, package manager. Copies a template
 * folder, replaces a few placeholders, and prints next steps.
 *
 * Templates:
 *   minimal   — one command, registers a toast
 *   panel     — sidebar panel with a tiny React tree (vanilla DOM in JS)
 *   tab-type  — registers a custom tab type
 *   theme     — declarative themes only, no code
 *   decorator — terminal output linkifier
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TEMPLATES = ['minimal', 'panel', 'tab-type', 'theme', 'decorator']

async function main() {
  // Parse CLI flags. Recognized: positional name, --template <t>, --no-typescript, --typescript
  const args = process.argv.slice(2)
  let argName
  let argTemplate
  let argTs
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--template' || a === '-t') argTemplate = args[++i]
    else if (a === '--no-typescript' || a === '--js') argTs = false
    else if (a === '--typescript' || a === '--ts') argTs = true
    else if (!argName && !a.startsWith('-')) argName = a
  }

  // Fall back to defaults when stdin is not a TTY (e.g. piped) so the tool
  // works in CI / scripted runs without prompting.
  const interactive = input.isTTY === true
  const rl = interactive ? readline.createInterface({ input, output }) : null
  const ask = async (prompt, fallback) =>
    rl ? (await rl.question(prompt)).trim() : fallback

  const name = argName?.trim() || (await ask('Plugin name (npm-friendly): ', '')).trim()
  if (!name) {
    console.error('A name is required (pass as first arg or run interactively).')
    rl?.close()
    process.exit(1)
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    console.error('Name must be lowercase, dash-separated, and start with a letter or digit.')
    rl?.close()
    process.exit(1)
  }

  const targetDir = path.resolve(process.cwd(), name)
  if (await exists(targetDir)) {
    console.error(`Directory already exists: ${targetDir}`)
    rl?.close()
    process.exit(1)
  }

  const templateAns =
    argTemplate ?? (await ask(`Template? [${TEMPLATES.join(' | ')}] (minimal): `, 'minimal'))
  const template = TEMPLATES.includes(templateAns) ? templateAns : 'minimal'

  let useTs
  if (argTs !== undefined) useTs = argTs
  else {
    const ans = (await ask('Use TypeScript? (Y/n): ', 'y')).trim().toLowerCase()
    useTs = ans !== 'n' && ans !== 'no'
  }

  rl?.close()

  const id = name.replace(/^mterminal-plugin-/, '')
  const packageName = name.startsWith('mterminal-plugin-') ? name : `mterminal-plugin-${id}`

  console.log(`\nScaffolding ${packageName} (template: ${template}) in ./${name}\n`)

  await copyTemplate(template, targetDir, { id, packageName, useTs })

  console.log(`✓ created ./${name}`)
  console.log('\nNext:')
  console.log(`  cd ${name}`)
  console.log('  npm install')
  console.log('  npm run build')
  console.log('  ln -s "$(pwd)" ~/.mterminal/extensions/' + id)
  console.log('  # in mTerminal: Ctrl+Shift+X → Reload all → Trust & activate')
}

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function copyTemplate(template, targetDir, ctx) {
  const sourceDir = path.join(__dirname, 'templates', template)
  await fs.mkdir(targetDir, { recursive: true })
  await walk(sourceDir, targetDir, ctx)
}

async function walk(srcDir, dstDir, ctx) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    const dstName = entry.name
      .replace('__id__', ctx.id)
      .replace('.ts.tmpl', ctx.useTs ? '.ts' : '.js')
      .replace('.tsx.tmpl', ctx.useTs ? '.tsx' : '.jsx')
    const dstPath = path.join(dstDir, dstName)

    if (entry.isDirectory()) {
      await fs.mkdir(dstPath, { recursive: true })
      await walk(srcPath, dstPath, ctx)
      continue
    }

    let contents = await fs.readFile(srcPath, 'utf-8')
    contents = contents
      .replace(/__ID__/g, ctx.id)
      .replace(/__PACKAGE_NAME__/g, ctx.packageName)
      .replace(/__DISPLAY_NAME__/g, displayCase(ctx.id))

    if (entry.name === 'package.json.tmpl' || entry.name === 'package.json') {
      const pkg = JSON.parse(contents)
      // Remove TypeScript bits when not needed.
      if (!ctx.useTs) {
        delete pkg.devDependencies?.typescript
        delete pkg.devDependencies?.['@types/node']
        delete pkg.scripts?.typecheck
      }
      contents = JSON.stringify(pkg, null, 2) + '\n'
      await fs.writeFile(path.join(dstDir, 'package.json'), contents)
      continue
    }

    if (entry.name === 'tsconfig.json' && !ctx.useTs) continue
    if (entry.name === 'tsup.config.ts' && !ctx.useTs) continue

    await fs.writeFile(dstPath, contents)
  }
}

function displayCase(id) {
  return id
    .split('-')
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
