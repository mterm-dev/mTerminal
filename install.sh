#!/usr/bin/env bash
# mTerminal install script — builds release binary and installs system-wide for current user.
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
ICON_DIR="$PREFIX/share/icons/hicolor/512x512/apps"
LICENSE_DIR="$PREFIX/share/licenses/$APP_NAME"

if [[ "$ACTION" == "uninstall" ]]; then
  echo "→ removing $APP_DISPLAY from $PREFIX"
  $SUDO rm -f "$BIN_DIR/$APP_NAME"
  $SUDO rm -f "$APP_DIR/$APP_NAME.desktop"
  $SUDO rm -f "$ICON_DIR/$APP_NAME.png"
  $SUDO rm -rf "$LICENSE_DIR"
  if command -v update-desktop-database >/dev/null 2>&1; then
    $SUDO update-desktop-database "$APP_DIR" 2>/dev/null || true
  fi
  echo "✓ uninstalled"
  exit 0
fi

# ── prerequisites ────────────────────────────────────────────────
need() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }
}
need cargo
need pnpm
need rustc

cd "$REPO_ROOT"

# ── build ────────────────────────────────────────────────────────
echo "→ installing JS deps"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "→ building release bundle (this can take a few minutes)"
WEBKIT_DISABLE_DMABUF_RENDERER=1 pnpm tauri build --no-bundle

BIN_SRC="$REPO_ROOT/src-tauri/target/release/$APP_NAME"
if [[ ! -x "$BIN_SRC" ]]; then
  echo "build failed: $BIN_SRC not found" >&2
  exit 1
fi

ICON_SRC="$REPO_ROOT/src-tauri/icons/icon.png"
DESKTOP_SRC="$REPO_ROOT/packaging/$APP_NAME.desktop"

# ── install ──────────────────────────────────────────────────────
echo "→ installing to $PREFIX"
$SUDO install -Dm755 "$BIN_SRC"     "$BIN_DIR/$APP_NAME"
$SUDO install -Dm644 "$DESKTOP_SRC" "$APP_DIR/$APP_NAME.desktop"
$SUDO install -Dm644 "$ICON_SRC"    "$ICON_DIR/$APP_NAME.png"
$SUDO install -Dm644 "$REPO_ROOT/LICENSE" "$LICENSE_DIR/LICENSE"

if command -v update-desktop-database >/dev/null 2>&1; then
  $SUDO update-desktop-database "$APP_DIR" 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  $SUDO gtk-update-icon-cache -q "$PREFIX/share/icons/hicolor" 2>/dev/null || true
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
