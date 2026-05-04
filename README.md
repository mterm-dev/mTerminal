<div align="center">

# mTerminal

**A modern, multi-tab terminal emulator for Linux and Windows.**

Built with [Electron](https://www.electronjs.org), [electron-vite](https://electron-vite.org), [React 19](https://react.dev), and TypeScript. Real PTY sessions via [`node-pty`](https://github.com/microsoft/node-pty), ANSI rendering by [xterm.js](https://xtermjs.org), and an encrypted vault for SSH credentials.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/electron-latest-47848F.svg)](https://www.electronjs.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6.svg)](https://www.typescriptlang.org)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-lightgrey.svg)](#install)

</div>

> **Status:** alpha. Tested on Linux (X11 + Wayland, KDE Plasma / CachyOS) and Windows 10/11.

---

## Highlights

- **Multi-tab PTY** — each tab is an independent shell. Login shell from `/etc/passwd` on Linux; `pwsh.exe` → `powershell.exe` → `cmd.exe` fallback on Windows (ConPTY).
- **Tab groups** — collapsible, drag-and-drop reordering, inline rename, 10-color accent palette.
- **Live tab labels** — auto-update from process `cwd` and the running command (`vim`, `htop`, etc.).
- **SSH host manager** — saved hosts, optional grouping, key-based or password auth, last-used tracking.
- **Encrypted credential vault** — SSH passwords stored locally, encrypted with XChaCha20-Poly1305 + Argon2id key derivation. Master password never leaves the device. Vault file format byte-compatible with the previous Tauri build.
- **AI integration** — Anthropic, OpenAI, and Ollama providers. Inline command palette (Ctrl+Shift+P), side panel chat (Ctrl+Shift+A), explain-selection popover, one-shot Claude Code tab (Ctrl+Shift+L).
- **Embedded MCP server** — JSON-RPC over Unix domain socket (Linux/macOS) exposes `list_tabs`, `get_output`, `send_keys` to local agents.
- **Themes** — 6 built-ins: mTerminal, Tokyo Night, Catppuccin Mocha, Solarized Dark, Gruvbox Dark, mTerminal Light.
- **Custom titlebar** — macOS-style traffic lights, drag region, rounded corners when windowed.
- **Persistent workspace** — tabs, groups, names, and accent colors survive restarts.
- **Status bar** — active tab, cwd, running command, tab/group counts, clock.

## Screenshots

<div align="center">
  <em>Add screenshots to <code>docs/screenshots/</code> and reference them here.</em>
</div>

## Keyboard shortcuts

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
| `Double-click` | Rename tab or group |
| `Right-click` | Context menu (rename, move, accent, delete) |

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

Grab the latest from the [Releases page](https://github.com/arthurr0/mTerminal/releases):

| Artifact | Use case |
|---|---|
| `mTerminal_<version>_amd64.AppImage` | Portable. `chmod +x` and run. Needs `fuse2` installed (`sudo pacman -S fuse2` on Arch); otherwise run with `--appimage-extract-and-run`. |
| `mterminal_<version>_amd64.deb` | Debian / Ubuntu / Mint. `sudo dpkg -i mterminal_*.deb` |

### Arch / CachyOS (AUR)

```bash
paru -S mterminal-bin       # binary release
paru -S mterminal-git       # build from source
```

Or build locally from the cloned repo with `makepkg -si`.

### Windows

```powershell
git clone https://github.com/arthurr0/mTerminal.git
cd mTerminal
pwsh -File .\install.ps1                    # per-user (no admin)
pwsh -File .\install.ps1 -Mode System       # system-wide (UAC)
pwsh -File .\install.ps1 -SkipBuild         # reuse existing installer
pwsh -File .\install.ps1 -Uninstall
```

Or download from Releases:

| Artifact | Use case |
|---|---|
| `mTerminal-<version>-setup.exe` | NSIS installer, per-user, no admin. |

Bundled Electron ships its own Chromium runtime — no WebView2 install needed.

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
  | Windows | MSVC C++ Build Tools (or VS with "Desktop development with C++" workload) — required to compile `node-pty` |

### Linux

```bash
pnpm install
pnpm exec electron-rebuild -f -w node-pty   # rebuild node-pty against Electron's ABI
pnpm dev                                    # electron-vite dev (HMR)
pnpm package:linux                          # AppImage + deb → release/
```

### Windows

```powershell
pnpm install
pnpm exec electron-rebuild -f -w node-pty
pnpm dev
pnpm package:win                            # NSIS installer → release/
```

### Notes

- `pnpm rebuild` (the npm built-in) targets the host Node ABI. Always use `pnpm exec electron-rebuild` for `node-pty` after install or after upgrading Electron.
- Wayland: works out of the box on most compositors. If GPU/compositor issues, launch with `--ozone-platform=wayland` or `--disable-gpu`.

---

## Configuration

### Shell selection

| Platform | Resolution order |
|---|---|
| Linux | `/etc/passwd` field 7 → `$SHELL` → `/bin/bash` |
| Windows | `MTERMINAL_SHELL` → `pwsh.exe` → `powershell.exe` → `%COMSPEC%` → `cmd.exe` |

`$SHELL` is intentionally **not** the primary source on Linux — it can be inherited from a parent process and lie about the user's actual login shell.

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

| Data | Location |
|---|---|
| Workspace (tabs, groups, accents) | `localStorage` key `mterminal:workspace:v1` |
| Settings (theme, font) | `localStorage` key `mterminal:settings:v1` |
| SSH hosts (no secrets) | `$XDG_CONFIG_HOME/mterminal/hosts.json` · `%APPDATA%\mterminal\hosts.json` |
| Encrypted vault (SSH + AI keys) | `$XDG_CONFIG_HOME/mterminal/vault.bin` · `%APPDATA%\mterminal\vault.bin` |
| MCP socket (Linux/macOS) | `$XDG_RUNTIME_DIR/mterminal-mcp-$USER.sock` |

The vault is encrypted with XChaCha20-Poly1305 using a key derived from your master password via Argon2id (m=64 MiB, t=3, p=4). The plaintext master password and decrypted secrets are kept in memory only while the vault is unlocked.

---

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│      Renderer (React)       │         │       Main (Node.js)         │
│  ─────────────────────────  │   IPC   │  ──────────────────────────  │
│   xterm.js · workspace      │ ◀─────▶ │   node-pty · ssh · MCP       │
│   settings · SSH host UI    │ events  │   AI providers · vault       │
└─────────────────────────────┘         └──────────────────────────────┘
```

- **`electron/main/pty.ts`** — owns the PTY session table (`node-pty`); spawns shells, streams output via `pty:event:<id>` IPC, walks the process tree to surface the running command.
- **`electron/main/ssh.ts`** — `ssh:spawn` wraps a saved host into a PTY-attached `ssh` invocation.
- **`electron/main/vault.ts`** — Argon2id-derived key, XChaCha20-Poly1305 sealed payload (`@noble/ciphers` + `@noble/hashes`).
- **`electron/main/hosts.ts`** — host metadata persistence (clear-text, no secrets) + SSH key scanner.
- **`electron/main/ai/`** — provider-agnostic streaming completion (Anthropic, OpenAI, Ollama).
- **`electron/main/mcp.ts`** — embedded JSON-RPC MCP server on a Unix domain socket.
- **`electron/preload/index.ts`** — `contextBridge` exposes the typed `window.mt` API to the renderer.
- **`src/hooks/useWorkspace.ts`** — single source of truth for tabs/groups/active selection.
- **`src/components/TerminalTab.tsx`** — xterm.js wrapper; one Terminal instance per tab, font/theme changes applied in place to avoid killing the shell.

See [`CLAUDE.md`](CLAUDE.md) for deeper architecture notes.

---

## Contributing

Issues and PRs welcome at <https://github.com/arthurr0/mTerminal>. There is no test suite yet; please verify changes manually with `pnpm dev` on at least one of Linux / Windows before opening a PR.

## License

[MIT](LICENSE).

## Credits

- [Electron](https://www.electronjs.org) + [electron-vite](https://electron-vite.org) — desktop runtime and dev tooling
- [xterm.js](https://xtermjs.org) — terminal rendering
- [node-pty](https://github.com/microsoft/node-pty) — cross-platform PTY bindings
- [@noble/ciphers](https://github.com/paulmillr/noble-ciphers) + [@noble/hashes](https://github.com/paulmillr/noble-hashes) — vault crypto (XChaCha20-Poly1305 + Argon2id)
- Visual language inspired by [entire.io](https://entire.io)
- Original design mockup: Anthropic Design (Claude AI)
