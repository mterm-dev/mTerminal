# Changelog

All notable changes to mTerminal will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-03

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

[Unreleased]: https://github.com/arthurr0/mTerminal/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/arthurr0/mTerminal/releases/tag/v0.1.0
