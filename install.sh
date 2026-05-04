#!/usr/bin/env bash
# mTerminal install script — builds Electron AppImage and installs for current user.
# Usage:
#   ./install.sh                  # install to ~/.local
#   ./install.sh --system         # install to /usr/local (requires sudo)
#   ./install.sh --uninstall      # remove

set -euo pipefail

APP_NAME="mterminal"
APP_DISPLAY="mTerminal"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODE="user"
ACTION="install"

for arg in "$@"; do
  case "$arg" in
    --system) MODE="system" ;;
    --uninstall) ACTION="uninstall" ;;
    -h|--help)
      grep '^# ' "$0" | sed 's/^# //'
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

if [[ "$MODE" == "system" ]]; then
  PREFIX="/usr/local"
  SUDO="sudo"
else
  PREFIX="$HOME/.local"
  SUDO=""
fi

BIN_DIR="$PREFIX/bin"
APP_DIR="$PREFIX/share/applications"
ICON_ROOT="$PREFIX/share/icons/hicolor"
LICENSE_DIR="$PREFIX/share/licenses/$APP_NAME"
ICON_SIZES=(512)

if [[ "$ACTION" == "uninstall" ]]; then
  echo "→ removing $APP_DISPLAY from $PREFIX"
  $SUDO rm -f "$BIN_DIR/$APP_NAME"
  $SUDO rm -f "$APP_DIR/$APP_NAME.desktop"
  for s in "${ICON_SIZES[@]}"; do
    $SUDO rm -f "$ICON_ROOT/${s}x${s}/apps/$APP_NAME.png"
  done
  $SUDO rm -f "$ICON_ROOT/scalable/apps/$APP_NAME.svg"
  $SUDO rm -rf "$LICENSE_DIR"
  if command -v update-desktop-database >/dev/null 2>&1; then
    $SUDO update-desktop-database "$APP_DIR" 2>/dev/null || true
  fi
  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    $SUDO gtk-update-icon-cache -q "$ICON_ROOT" 2>/dev/null || true
  fi
  echo "✓ uninstalled"
  exit 0
fi

# ── prerequisites ────────────────────────────────────────────────
need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }
}
need pnpm
need node

cd "$REPO_ROOT"

# ── build ────────────────────────────────────────────────────────
echo "→ installing JS deps"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "→ rebuilding native modules (node-pty against Electron ABI)"
pnpm exec electron-rebuild -f -w node-pty

echo "→ building AppImage (this can take a few minutes)"
pnpm package:linux

# Locate produced AppImage. electron-builder writes to release/.
APPIMAGE_SRC="$(find "$REPO_ROOT/release" -maxdepth 2 -type f -name '*.AppImage' -print -quit 2>/dev/null || true)"
if [[ -z "${APPIMAGE_SRC:-}" || ! -f "$APPIMAGE_SRC" ]]; then
  echo "build failed: no AppImage found under $REPO_ROOT/release" >&2
  exit 1
fi

ICON_DIR_SRC="$REPO_ROOT/build"
DESKTOP_SRC="$REPO_ROOT/packaging/$APP_NAME.desktop"

# ── install ──────────────────────────────────────────────────────
echo "→ installing to $PREFIX"
$SUDO install -Dm755 "$APPIMAGE_SRC" "$BIN_DIR/$APP_NAME"

if [[ -f "$DESKTOP_SRC" ]]; then
  $SUDO install -Dm644 "$DESKTOP_SRC" "$APP_DIR/$APP_NAME.desktop"
fi

if [[ -d "$ICON_DIR_SRC" ]]; then
  [[ -f "$ICON_DIR_SRC/icon.png" ]] && $SUDO install -Dm644 "$ICON_DIR_SRC/icon.png" "$ICON_ROOT/512x512/apps/$APP_NAME.png" || true
  [[ -f "$ICON_DIR_SRC/icon.svg" ]] && $SUDO install -Dm644 "$ICON_DIR_SRC/icon.svg" "$ICON_ROOT/scalable/apps/$APP_NAME.svg" || true
fi
$SUDO install -Dm644 "$REPO_ROOT/LICENSE" "$LICENSE_DIR/LICENSE"

if command -v update-desktop-database >/dev/null 2>&1; then
  $SUDO update-desktop-database "$APP_DIR" 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  $SUDO gtk-update-icon-cache -q "$ICON_ROOT" 2>/dev/null || true
fi

echo
echo "✓ installed $APP_DISPLAY to $BIN_DIR/$APP_NAME"
echo "  desktop entry: $APP_DIR/$APP_NAME.desktop"
if [[ "$MODE" == "user" ]]; then
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "  ⚠  $BIN_DIR is not in your PATH. Add this to your shell rc:"
       echo "       export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
  esac
fi
echo "  launch: $APP_NAME    or open from your application menu"
