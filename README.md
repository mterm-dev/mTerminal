<div align="center">

# mTerminal

**A modern, multi-tab terminal emulator for Linux and Windows.**

Built with [Tauri 2](https://tauri.app), [React 19](https://react.dev), and Rust. Real PTY sessions via [`portable-pty`](https://crates.io/crates/portable-pty), ANSI rendering by [xterm.js](https://xtermjs.org), and an encrypted vault for SSH credentials.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/tauri-2-24C8DB.svg)](https://tauri.app)
[![Rust](https://img.shields.io/badge/rust-stable-orange.svg)](https://www.rust-lang.org)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-lightgrey.svg)](#install)

</div>

> **Status:** alpha. Tested on Linux (X11 + Wayland, KDE Plasma / CachyOS) and Windows 10/11.

---

## Highlights

- **Multi-tab PTY** — each tab is an independent shell. Login shell from `/etc/passwd` on Linux; `pwsh.exe` → `powershell.exe` → `cmd.exe` fallback on Windows.
- **Tab groups** — collapsible, drag-and-drop reordering, inline rename, 10-color accent palette.
- **Live tab labels** — auto-update from process `cwd` and the running command (`vim`, `htop`, etc.).
- **SSH host manager** — saved hosts, optional grouping, key-based or password auth, last-used tracking.
- **Encrypted credential vault** — SSH passwords stored locally, encrypted with ChaCha20-Poly1305 + Argon2id key derivation. Master password never leaves the device.
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
| `Ctrl+,` | Open settings |
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
| `mTerminal-x86_64.AppImage` | Portable. `chmod +x` and run. |
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
| `mTerminal_<version>_x64-setup.exe` | NSIS installer, per-user, no admin. |
| `mTerminal-x86_64-windows.exe` | Portable executable, no installer. |

WebView2 ships with Windows 11 and recent Windows 10. The installer's bootstrapper fetches it silently when missing.

---

## Build from source

### Requirements

- **Rust** stable — `rustup default stable`
- **Node.js** 20+ and **pnpm** 9+
- Platform packages:

  | OS | Packages |
  |---|---|
  | Arch / CachyOS | `webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg` |
  | Debian / Ubuntu | `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` |
  | Fedora | `webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel @"C Development Tools and Libraries"` |
  | Windows | MSVC C++ Build Tools (or VS with "Desktop development with C++" workload) + WebView2 runtime |

### Linux

```bash
pnpm install
pnpm tauri:dev          # hot-reload dev build
pnpm tauri:build        # release bundle → src-tauri/target/release/bundle/
```

### Windows

```powershell
pnpm install
pnpm tauri:dev:win
pnpm tauri:build:win    # NSIS installer → src-tauri\target\release\bundle\nsis\
```

### Wayland note

webkit2gtk's DMABUF renderer crashes on some Wayland compositors. The dev/build scripts export `WEBKIT_DISABLE_DMABUF_RENDERER=1` as a workaround. Native transparency works on KDE Plasma, GNOME Mutter, and Hyprland.

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
| Encrypted vault (SSH passwords) | `$XDG_CONFIG_HOME/mterminal/vault.bin` · `%APPDATA%\mterminal\vault.bin` |

The vault is encrypted with ChaCha20-Poly1305 using a key derived from your master password via Argon2id. The plaintext master password and decrypted secrets are kept in memory only while the vault is unlocked.

---

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│       Frontend (React)      │         │        Backend (Rust)        │
│  ─────────────────────────  │ invoke  │  ──────────────────────────  │
│   xterm.js · workspace      │ ◀─────▶ │   portable-pty · sysinfo     │
│   settings · SSH host UI    │  events │   ssh · vault (ChaCha20)     │
└─────────────────────────────┘         └──────────────────────────────┘
```

- **`src-tauri/src/pty.rs`** — owns the PTY session table; spawns shells, streams output via `pty://data/<id>` events, walks the process tree to surface the running command.
- **`src-tauri/src/ssh.rs`** — `ssh_spawn` wraps a saved host into a PTY-attached `ssh` invocation.
- **`src-tauri/src/vault.rs`** — Argon2id-derived key, ChaCha20-Poly1305 sealed payload.
- **`src-tauri/src/hosts.rs`** — host metadata persistence (clear-text, no secrets).
- **`src/hooks/useWorkspace.ts`** — single source of truth for tabs/groups/active selection.
- **`src/components/TerminalTab.tsx`** — xterm.js wrapper; one Terminal instance per tab, font/theme changes applied in place to avoid killing the shell.

See [`CLAUDE.md`](CLAUDE.md) for deeper architecture notes.

---

## Contributing

Issues and PRs welcome at <https://github.com/arthurr0/mTerminal>. There is no test suite yet; please verify changes manually with `pnpm tauri:dev` on at least one of Linux / Windows before opening a PR.

## License

[MIT](LICENSE).

## Credits

- [Tauri 2](https://tauri.app) — webview shell and IPC
- [xterm.js](https://xtermjs.org) — terminal rendering
- [portable-pty](https://github.com/wez/wezterm/tree/main/pty) — cross-platform PTY (from Wezterm)
- [argon2](https://crates.io/crates/argon2) + [chacha20poly1305](https://crates.io/crates/chacha20poly1305) — vault crypto
- Visual language inspired by [entire.io](https://entire.io)
- Original design mockup: Anthropic Design (Claude AI)
