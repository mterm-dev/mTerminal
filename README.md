# mTerminal

A custom terminal emulator for Linux and Windows. Built with Tauri 2 + React + Rust.

Warm, neutral dark UI inspired by [entire.io](https://entire.io). Multi-tab with **per-group accent colors**, drag-and-drop tab moves, inline rename, and persistent workspace state. Real PTY sessions via [`portable-pty`](https://crates.io/crates/portable-pty) (Linux PTY / Windows ConPTY), ANSI rendering by [xterm.js](https://xtermjs.org).

> Status: alpha. Linux (X11 + Wayland) tested on KDE Plasma / CachyOS. Windows 10/11 build via NSIS installer.

---

## Features

- **Multi-tab PTY** — each tab is an independent shell process (login shell from `/etc/passwd` on Linux, `pwsh.exe` → `powershell.exe` → `cmd.exe` fallback chain on Windows)
- **Tab groups** — collapsible, with rename, drag-and-drop, and 10 accent colors (orange / blue / violet / cyan / emerald / purple / sky / amber / pink / red)
- **Live tab labels** — auto-update from process `cwd` / running command (`vim`, `htop`, etc.)
- **Inline rename** — double-click tab or group name
- **Right-click context menu** — rename, move to group, change accent, delete
- **Persistent workspace** — tabs, groups, names, accents saved to `localStorage`
- **Custom titlebar** — macOS-style traffic lights, drag region, rounded corners (when not maximized)
- **Status bar** — active tab, cwd, command, tab/group counts, clock
- **Keyboard shortcuts**

  | Key | Action |
  |---|---|
  | `Ctrl+T` | New tab in current group |
  | `Ctrl+W` | Close active tab |
  | `Ctrl+1` … `Ctrl+9` | Switch to tab N |
  | `Ctrl+Shift+G` | New group |
  | `Double-click` | Rename tab / group |
  | `Right-click` | Context menu |

---

## Install

### Quick install (any Linux)

```bash
git clone https://github.com/arthurr0/mTerminal.git
cd mTerminal
./install.sh
```

The script builds a release binary, installs it to `~/.local/bin/mterminal`, and registers a `.desktop` entry so the app appears in your application menu.

### From release artifacts

Download the latest release from the [Releases page](https://github.com/arthurr0/mTerminal/releases):

- **`mTerminal-x86_64.AppImage`** — portable Linux, no install needed. `chmod +x` and run.
- **`mterminal_<version>_amd64.deb`** — Debian / Ubuntu / Mint. `sudo dpkg -i mterminal_*.deb`.
- **`mTerminal_<version>_x64-setup.exe`** — Windows NSIS installer (per-user, no admin required). Double-click to install; uninstall via Settings → Apps.
- **`mTerminal-x86_64-windows.exe`** — portable Windows binary (no installer). Run directly. WebView2 runtime required (preinstalled on Windows 11; on Windows 10 the installer's bootstrapper fetches it automatically).

### Windows (build & install)

```powershell
git clone https://github.com/arthurr0/mTerminal.git
cd mTerminal
pwsh -File .\install.ps1            # per-user install via NSIS
pwsh -File .\install.ps1 -Mode System   # system-wide (UAC prompt)
pwsh -File .\install.ps1 -Uninstall     # remove
```

Requires Rust (stable), Node 20+, pnpm 9+, and the **Microsoft Visual Studio C++ Build Tools** (or full Visual Studio with the "Desktop development with C++" workload). WebView2 runtime ships with Windows 11 and recent Windows 10.

### Arch / CachyOS (AUR)

```bash
# from a clone of this repo
makepkg -si
```

Or once published to AUR:

```bash
paru -S mterminal-bin    # binary release
# or
paru -S mterminal-git    # build from source
```

---

## Build from source

### Requirements

- **Rust** stable (`rustup default stable`)
- **Node.js** 20+ and **pnpm** 9+
- System packages:
  - **Arch / CachyOS**: `webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg`
  - **Debian / Ubuntu**: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  - **Fedora**: `webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel @"C Development Tools and Libraries"`

### Steps

```bash
pnpm install
pnpm tauri:dev          # Linux dev with hot reload
pnpm tauri:build        # Linux release bundle (AppImage + deb in src-tauri/target/release/bundle/)
```

Windows (PowerShell):

```powershell
pnpm install
pnpm tauri:dev:win      # dev with hot reload
pnpm tauri:build:win    # NSIS installer in src-tauri\target\release\bundle\nsis\
```

### Wayland note

If the window crashes on launch under Wayland, the dev/build scripts already export `WEBKIT_DISABLE_DMABUF_RENDERER=1` to work around a webkit2gtk DMABUF bug. Native transparency requires a compositor that supports ARGB visuals (KDE Plasma, GNOME Mutter, Hyprland — all OK).

---

## Configuration

mTerminal launches your **login shell**:

- **Linux**: from `/etc/passwd` field 7 (not `$SHELL`, which can be inherited from a parent process).
- **Windows**: `pwsh.exe` if installed, else `powershell.exe`, else `%COMSPEC%` / `cmd.exe`. Override with the `MTERMINAL_SHELL` env var.

The shell is started with:

- `cwd` set to `$HOME` / `%USERPROFILE%`
- `TERM=xterm-256color`
- `COLORTERM=truecolor`
- `MTERMINAL=1` (detect in shell rc: `if [ -n "$MTERMINAL" ]; ...`)

Workspace state (tabs, groups, accents) is kept in browser `localStorage` under key `mterminal:workspace:v1`.

---

## License

MIT. See [LICENSE](LICENSE).

## Credits

- [Tauri 2](https://tauri.app)
- [xterm.js](https://xtermjs.org)
- [portable-pty](https://github.com/wez/wezterm/tree/main/pty) (Wezterm)
- Visual language inspired by [entire.io](https://entire.io)
- Initial design mockup: Anthropic Design (Claude AI)
