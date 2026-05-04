# Changelog

All notable changes to mTerminal will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Migrated runtime from Tauri 2 / Rust to Electron + electron-vite + TypeScript.** All backend logic ported to the Node main process under `electron/main/`; `src-tauri/` removed.
  - PTY: `portable-pty` (Rust) → `node-pty`. Rebuild via `pnpm exec electron-rebuild -f -w node-pty`.
  - Vault: file format unchanged (XChaCha20-Poly1305 + Argon2id) — existing `vault.bin` unlocks against the new build. Crypto via `@noble/ciphers` + `@noble/hashes`.
  - IPC: Tauri `invoke` / `Channel` → Electron `ipcMain.handle` / `webContents.send`. Preload exposes a typed `window.mt` namespace; renderer uses a `tauri-shim` compatibility layer so existing components work unchanged.
  - Bundling: `tauri build` → `electron-builder`. Linux outputs AppImage + deb under `release/`; Windows outputs an NSIS installer. WebView2 is no longer needed — Electron ships its own Chromium.
- Build commands changed: `pnpm tauri:dev` → `pnpm dev`, `pnpm tauri:build` → `pnpm package` (or `package:linux` / `package:win`).

## [0.2.0] - 2026-05-04

### Added
- Settings modal (`Ctrl+,`) with live-applied options: theme, font family/size, line height, cursor style and blink, scrollback, UI font size, window opacity, shell override + args, copy-on-select, confirm-close, sidebar collapse + width
- Six built-in themes: mTerminal, Tokyo Night, Catppuccin, Solarized Dark, Gruvbox, Light mTerminal — applied to both UI (CSS vars on `:root`) and xterm.js
- Clipboard integration via `tauri-plugin-clipboard-manager`: copy-on-select option and explicit copy/paste paths
- Grid view for tab groups: selecting a group renders all its tabs side-by-side in an auto-sized grid (`Math.ceil(sqrt(n))` cols)
- Drag-and-drop tab reordering within and across groups (`reorderTab` in `useWorkspace`)
- Sidebar collapse toggle (`Ctrl+B`) and resizable sidebar width
- Quit confirmation dialog when closing the window with multiple tabs open (`onCloseRequested` intercept)
- "Move to → ungrouped" entry in tab context menu
- Custom shell binary + args per spawn (`pty_spawn` accepts optional `shell` and `args`)
- SSH host manager: stored in `hosts.json`, optional groups with collapsible sections and accent colors, key / password / agent auth, agent-forwarding compatible (`IdentityAgent=$SSH_AUTH_SOCK`)
- Encrypted vault for SSH passwords: Argon2id KDF (64 MiB / t=3 / p=4) + XChaCha20-Poly1305 AEAD, file at `$XDG_CONFIG_HOME/mterminal/vault.bin`, master-password unlock modal
- Remote workspace UI with separate "remote sessions" section in sidebar, host list, group management, and connection banner injected into the terminal stream
- SSH key picker and tool-availability check (ssh, sshpass) via `list_ssh_keys` / `tool_availability` commands
- App icons in multiple sizes (32, 128, 128@2x, 512, 1024) plus `.ico` for cross-platform bundling
- GitHub Actions release workflow + AUR `PKGBUILD-bin` packaging
- `core:window:allow-destroy` capability so the confirm-quit dialog can force-close after user confirmation

### Changed
- PTY data/exit events migrated from named global events (`pty://data/<id>`, `pty://exit/<id>`) to per-spawn `tauri::ipc::Channel<PtyEvent>` — fewer listeners, no string event names, structured payload
- `useWorkspace` storage key bumped from `mterminal:workspace:v1` to `:v2`; legacy key auto-migrated and removed on first load
- `Tab` model gained `kind: "local" | "remote"` and `remoteHostId` to support SSH sessions alongside local PTYs
- Tab/group context menus restructured: move-to entries grouped together, group deletion no longer hidden when only one group remains
- Bumped Tauri (2.1 → 2.11), portable-pty (0.8 → 0.9), tauri-plugin-os (2.0 → 2.3), once_cell (1.20 → 1.21)
- Removed prototype mockup files (`terminal/project/*.{html,jsx}`, `terminal/README.md`) — superseded by the implemented UI

### Fixed
- Resize / safe-area calculation: `--safe-bottom` CSS var now tracks `outerHeight - screen.availHeight` so the terminal isn't clipped behind compositor decorations on certain Wayland setups
- Settings effect split from PTY-mount effect in `TerminalTab` — font/theme/cursor changes now mutate `term.options` in place instead of remounting and killing the running shell



Initial release.

### Added
- Multi-tab terminal emulator with real PTY sessions (`portable-pty`)
- Tab groups with collapsible sections, drag-and-drop tab moves, 10 accent colors
- Inline rename for tabs and groups (double-click or context menu)
- Right-click context menu on tabs and groups (rename / move / accent / close / delete)
- Live label updates from process cwd and running command
- Persistent workspace state (tabs, groups, accents) via `localStorage`
- Custom macOS-style titlebar with traffic lights, drag region
- Rounded corners when not maximized (transparent window)
- Status bar with active tab label, cwd, command, counts, clock
- Keyboard shortcuts: `Ctrl+T` / `Ctrl+W` / `Ctrl+1-9` / `Ctrl+Shift+G`
- Login shell detection from `/etc/passwd` (avoids inherited `$SHELL` env)
- xterm.js theme aligned with mTerminal palette

[Unreleased]: https://github.com/arthurr0/mTerminal/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/arthurr0/mTerminal/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/arthurr0/mTerminal/releases/tag/v0.1.0
