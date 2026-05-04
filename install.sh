#!/usr/bin/env bash
# mTerminal install script — builds Electron app and installs for current user.
# Installs the unpacked Electron tree (no FUSE / AppImage needed at runtime).
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
LIB_DIR="$PREFIX/lib/$APP_NAME"
APP_DIR="$PREFIX/share/applications"
ICON_ROOT="$PREFIX/share/icons/hicolor"
LICENSE_DIR="$PREFIX/share/licenses/$APP_NAME"
ICON_SIZES=(512)

if [[ "$ACTION" == "uninstall" ]]; then
  echo "→ removing $APP_DISPLAY from $PREFIX"
  $SUDO rm -f "$BIN_DIR/$APP_NAME"
  $SUDO rm -rf "$LIB_DIR"
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

echo "→ building Electron app"
pnpm package:linux

UNPACKED_SRC="$REPO_ROOT/release/linux-unpacked"
if [[ ! -d "$UNPACKED_SRC" ]]; then
  echo "build failed: $UNPACKED_SRC not found" >&2
  exit 1
fi

ICON_DIR_SRC="$REPO_ROOT/build"
DESKTOP_SRC="$REPO_ROOT/packaging/$APP_NAME.desktop"

# ── install ──────────────────────────────────────────────────────
echo "→ installing to $PREFIX"
$SUDO install -dm755 "$LIB_DIR"
$SUDO cp -a "$UNPACKED_SRC"/. "$LIB_DIR/"

# Wrapper script in PATH.
WRAPPER="$BIN_DIR/$APP_NAME"
$SUDO install -dm755 "$BIN_DIR"
if [[ "$MODE" == "system" ]]; then
  # Chromium sandbox helper requires SUID root for system install.
  $SUDO chown root:root "$LIB_DIR/chrome-sandbox" || true
  $SUDO chmod 4755 "$LIB_DIR/chrome-sandbox" || true
  WRAPPER_BODY="#!/bin/sh
exec \"$LIB_DIR/$APP_NAME\" \"\$@\"
"
else
  # User install can't SUID without sudo. Disable sandbox in that case
  # (Electron requires either SUID chrome-sandbox or --no-sandbox).
  WRAPPER_BODY="#!/bin/sh
exec \"$LIB_DIR/$APP_NAME\" --no-sandbox \"\$@\"
"
fi
echo "$WRAPPER_BODY" | $SUDO tee "$WRAPPER" >/dev/null
$SUDO chmod 755 "$WRAPPER"

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
echo "✓ installed $APP_DISPLAY"
echo "  binary tree: $LIB_DIR"
echo "  launcher:    $WRAPPER"
echo "  desktop:     $APP_DIR/$APP_NAME.desktop"
if [[ "$MODE" == "user" ]]; then
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "  ⚠  $BIN_DIR is not in your PATH. Add this to your shell rc:"
       echo "       export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
  esac
fi
echo "  launch: $APP_NAME    or open from your application menu"
