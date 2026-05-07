<div align="center">

# mTerminal

**A modern, multi-tab terminal emulator for Linux, Windows, and macOS.**

Built with [Electron](https://www.electronjs.org), [electron-vite](https://electron-vite.org), [React 19](https://react.dev), and TypeScript. Real PTY sessions via [`node-pty`](https://github.com/microsoft/node-pty), ANSI rendering by [xterm.js](https://xtermjs.org), and an encrypted vault for credentials.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/electron-42-47848F.svg)](https://www.electronjs.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6.svg)](https://www.typescriptlang.org)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-lightgrey.svg)](#install)

</div>

> **Status:** alpha. Tested on Linux (X11 + Wayland), Windows 10/11, and macOS 14+.

---

## Highlights

- **Multi-tab PTY** — independent shell per tab. Login shell from `/etc/passwd` on Linux/macOS; `pwsh.exe` → `powershell.exe` → `cmd.exe` fallback on Windows (ConPTY).
- **Tab groups** — collapsible, drag-and-drop reordering, inline rename, 10-color accent palette.
- **Live tab labels** — auto-updated from process `cwd` and the running command (`vim`, `htop`, …).
- **Encrypted credential vault** — XChaCha20-Poly1305 + Argon2id (m=64 MiB, t=3, p=4). Master password never leaves the device.
- **AI integration** — Anthropic, OpenAI, and Ollama providers. Inline command palette, side panel chat, explain-selection popover, one-shot Claude Code tab.
- **Embedded MCP server** — JSON-RPC over Unix domain socket (Linux/macOS) exposing `list_tabs`, `get_output`, `send_keys` to local agents.
- **Extension system** — first-party extensions for SSH/SFTP, file browser, git panel/status, error linkifier, and extra themes. Custom URL scheme (`mt-ext://`) and a typed `@mterminal/extension-api`.
- **Themes** — 6 built-in (mTerminal, Tokyo Night, Catppuccin Mocha, Solarized Dark, Gruvbox Dark, mTerminal Light) plus a theme-pack extension.
- **Persistent workspace** — tabs, groups, names, and accent colors survive restarts.
- **Native window chrome** — frameless on Linux/Windows with rounded corners; `hiddenInset` traffic lights on macOS.

---

## Keyboard shortcuts

`Ctrl` on Linux/Windows, `Cmd` on macOS.

| Shortcut | Action |
|---|---|
| `Ctrl+T` | New tab in current group |
| `Ctrl+W` | Close active tab |
| `Ctrl+1` … `Ctrl+9` | Switch to tab N |
| `Ctrl+Shift+G` | New group |
| `Ctrl+Shift+P` | AI command palette |
| `Ctrl+Shift+A` | AI side panel |
| `Ctrl+Shift+L` | New Claude Code tab |
| `Ctrl+,` | Open settings |
| `Ctrl+B` | Toggle sidebar |
| Double-click | Rename tab or group |
| Right-click | Context menu (rename, move, accent, delete) |

---

## Install

### Linux — quick install

```bash
git clone https://github.com/arthurr0/mTerminal.git
cd mTerminal
./install.sh                # ~/.local/bin + .desktop entry
./install.sh --system       # /usr/local (sudo)
./install.sh --uninstall    # remove
```

### Linux — release artifacts

From the [Releases page](https://github.com/arthurr0/mTerminal/releases):

| Artifact | Use case |
|---|---|
| `mTerminal_<version>_amd64.AppImage` | Portable. `chmod +x` and run. Needs `fuse2`; otherwise run with `--appimage-extract-and-run`. |
| `mterminal_<version>_amd64.deb` | Debian / Ubuntu / Mint: `sudo dpkg -i mterminal_*.deb` |

### Arch / CachyOS (AUR)

```bash
yay -S mterminal-bin
```

Or build locally from the cloned repo with `makepkg -si`.

### Windows

```powershell
git clone https://github.com/arthurr0/mTerminal.git
cd mTerminal
pwsh -File .\install.ps1                # per-user (no admin)
pwsh -File .\install.ps1 -Mode System   # system-wide (UAC)
pwsh -File .\install.ps1 -SkipBuild     # reuse existing installer
pwsh -File .\install.ps1 -Uninstall
```

Or grab `mTerminal-<version>-setup.exe` (NSIS, per-user, no admin) from Releases. Bundled Electron ships its own Chromium — no WebView2 install needed.

### macOS

Download the universal DMG from the Releases page (built on `macos-14`, contains both arm64 and x64).

Builds are **unsigned** (no Apple Developer certificate). On first run Gatekeeper will block the app:

- right-click the `.app` → **Open** → **Open** in the dialog, or
- clear the quarantine flag: `xattr -cr /Applications/mTerminal.app`

---

## Build from source

### Requirements

- **Node.js** 20+ and **pnpm** 9+
- Platform packages:

  | OS | Packages |
  |---|---|
  | Arch / CachyOS | `nodejs pnpm base-devel python` |
  | Debian / Ubuntu | `nodejs build-essential python3` (and `pnpm` via Corepack) |
  | Fedora | `nodejs @"C Development Tools and Libraries" python3` |
  | macOS | Xcode Command Line Tools (`xcode-select --install`) |
  | Windows | MSVC C++ Build Tools (or VS with the "Desktop development with C++" workload) — required to compile `node-pty` |

### All platforms

```bash
pnpm install
pnpm exec electron-rebuild -f -w node-pty   # rebuild node-pty against Electron's ABI
pnpm dev                                    # electron-vite dev (HMR)
```

### Package

```bash
pnpm package:linux    # AppImage + deb       → release/
pnpm package:win      # NSIS installer       → release/
pnpm package:mac      # universal DMG        → release/
```

### Notes

- `pnpm rebuild` (the npm built-in) targets the host Node ABI. Always use `pnpm exec electron-rebuild` for `node-pty` after `pnpm install` or after upgrading Electron.
- Wayland: works out of the box on most compositors. If you hit GPU/compositor issues, launch with `--ozone-platform=wayland` or `--disable-gpu`.

### Tests

```bash
pnpm test            # vitest run
pnpm test:watch      # watch mode
pnpm typecheck       # tsc -b (strict)
```

---

## Configuration

### Shell selection

| Platform | Resolution order |
|---|---|
| Linux / macOS | `/etc/passwd` field 7 → `$SHELL` → `/bin/bash` |
| Windows | `MTERMINAL_SHELL` → `pwsh.exe` → `powershell.exe` → `%COMSPEC%` → `cmd.exe` |

`$SHELL` is intentionally **not** the primary source on Linux/macOS — it can be inherited from a parent process and lie about the user's actual login shell.

### Environment

Spawned shells receive:

- `cwd` set to `$HOME` / `%USERPROFILE%`
- `TERM=xterm-256color`
- `COLORTERM=truecolor`
- `MTERMINAL=1` — detect mTerminal in your shell rc:

  ```sh
  if [ -n "$MTERMINAL" ]; then
      # mTerminal-specific setup
  fi
  ```

### State and storage

| Data | Linux | Windows | macOS |
|---|---|---|---|
| Workspace, settings | `localStorage` | `localStorage` | `localStorage` |
| Hosts (no secrets) | `$XDG_CONFIG_HOME/mterminal/hosts.json` | `%APPDATA%\mterminal\hosts.json` | `~/Library/Application Support/mterminal/hosts.json` |
| Encrypted vault | `$XDG_CONFIG_HOME/mterminal/vault.bin` | `%APPDATA%\mterminal\vault.bin` | `~/Library/Application Support/mterminal/vault.bin` |
| MCP socket | `$XDG_RUNTIME_DIR/mterminal-mcp-$USER.sock` | *(not supported)* | `~/Library/Caches/mterminal/mcp-<user>.sock` |

The vault is encrypted with XChaCha20-Poly1305 using a key derived from your master password via Argon2id. The plaintext password and decrypted secrets stay in memory only while the vault is unlocked.

---

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│      Renderer (React)       │         │       Main (Node.js)         │
│  ─────────────────────────  │   IPC   │  ──────────────────────────  │
│   xterm.js · workspace      │ ◀─────▶ │   node-pty · MCP · vault     │
│   settings · extension UI   │ events  │   AI providers · extensions  │
└─────────────────────────────┘         └──────────────────────────────┘
```

- **`electron/main/pty.ts`** — owns the PTY session table (`node-pty`); spawns shells, streams output via `pty:event:<id>` IPC, walks the process tree to surface the running command.
- **`electron/main/vault.ts`** — Argon2id-derived key, XChaCha20-Poly1305 sealed payload (`@noble/ciphers` + `@noble/hashes`).
- **`electron/main/ai/`** — provider-agnostic streaming completion (Anthropic, OpenAI, Ollama).
- **`electron/main/mcp.ts`** — embedded JSON-RPC MCP server on a Unix domain socket.
- **`electron/main/extensions/`** — extension host: manifest loader, IPC bridge, `mt-ext://` protocol, typed API surface.
- **`electron/preload/index.ts`** — `contextBridge` exposes the typed `window.mt` API to the renderer.
- **`packages/extension-api/`** — public types (`MtApi`, manifest schema) consumed by extensions.
- **`extensions/*`** — first-party extensions (`remote-ssh`, `file-browser`, `git-panel`, `git-status-mini`, `error-linkifier`, `theme-pack-extra`).
- **`src/hooks/useWorkspace.ts`** — single source of truth for tabs/groups/active selection.
- **`src/components/TerminalTab.tsx`** — xterm.js wrapper; one Terminal instance per tab, font/theme changes applied in place to avoid killing the shell.

See [`CLAUDE.md`](CLAUDE.md) for deeper architecture notes.

---

## Contributing

Issues and PRs welcome at <https://github.com/arthurr0/mTerminal>. Run `pnpm test && pnpm typecheck` before opening a PR; both must pass.

### Commit style

[Conventional Commits](https://www.conventionalcommits.org/), so release notes can be generated automatically. Use one of: `feat`, `fix`, `perf`, `refactor`, `style`, `docs`, `test`, `build`, `ci`, `chore`. Add `!` after the type for breaking changes (e.g. `feat!: drop legacy vault format`) or include a `BREAKING CHANGE:` footer.

---

## Releasing

Tags drive everything. Pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds Linux + Windows + macOS artifacts, generates release notes from commits with [`git-cliff`](https://git-cliff.org/), and publishes a GitHub Release with the binaries attached. There is **no `CHANGELOG.md`** — release notes live only on the GitHub Releases page and are regenerated each tag.

```bash
pnpm release patch         # bump patch component
pnpm release minor         # bump minor, reset patch
pnpm release major         # bump major, reset minor and patch
pnpm release 0.5.0         # explicit version
```

The script (`scripts/release.mjs`) refuses to proceed unless:

- you are on `master` (or `main`) with a clean working tree
- local `HEAD` matches `origin/<branch>`
- the computed tag does not already exist locally or on `origin`
- there is at least one commit since the previous tag

It then creates an annotated tag `v<x.y.z>` and pushes it to `origin`. CI takes over from there. The `package.json` version is overwritten from the tag at build time, so you do **not** bump it by hand.

### Preview release notes locally

Optional — install [`git-cliff`](https://git-cliff.org/docs/installation) and run:

```bash
git-cliff --config cliff.toml --unreleased   # what the next release will contain
git-cliff --config cliff.toml --latest       # what the most recent tag contained
```

---

## License

[MIT](LICENSE).

## Credits

- [Electron](https://www.electronjs.org) + [electron-vite](https://electron-vite.org) — desktop runtime and dev tooling
- [xterm.js](https://xtermjs.org) — terminal rendering
- [node-pty](https://github.com/microsoft/node-pty) — cross-platform PTY bindings
- [@noble/ciphers](https://github.com/paulmillr/noble-ciphers) + [@noble/hashes](https://github.com/paulmillr/noble-hashes) — vault crypto (XChaCha20-Poly1305 + Argon2id)
