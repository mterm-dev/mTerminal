export interface Theme {
  id: string;
  name: string;
  cssVars: Record<string, string>;
  xterm: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selectionBackground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

const mterminal: Theme = {
  id: "mterminal",
  name: "mTerminal (default)",
  cssVars: {
    "--n-50": "#0c0c0c",
    "--n-100": "#121212",
    "--n-150": "#181818",
    "--n-700": "#aeaeae",
    "--n-900": "#ebebeb",
    "--bg-base": "#0c0c0c",
    "--bg-muted": "#121212",
    "--bg-raised": "#181818",
    "--fg": "#ebebeb",
    "--fg-muted": "#aeaeae",
    "--fg-dim": "#717171",
    "--border": "#fafafa1a",
    "--border-subtle": "#fafafa14",
    "--accent": "oklch(0.78 0.12 85)",
  },
  xterm: {
    background: "#0c0c0c",
    foreground: "#ebebeb",
    cursor: "#f5b056",
    cursorAccent: "#0c0c0c",
    selectionBackground: "rgba(245, 176, 86, 0.30)",
    black: "#181818",
    red: "#e8847a",
    green: "#6dd5a4",
    yellow: "#f5b056",
    blue: "#7eb1ee",
    magenta: "#c79cf2",
    cyan: "#7ed7d3",
    white: "#cecece",
    brightBlack: "#717171",
    brightRed: "#f0a097",
    brightGreen: "#90e0bb",
    brightYellow: "#fbc77a",
    brightBlue: "#9bc4f5",
    brightMagenta: "#d4b3f7",
    brightCyan: "#9ee2de",
    brightWhite: "#f5f5f5",
  },
};

const tokyoNight: Theme = {
  id: "tokyo-night",
  name: "Tokyo Night",
  cssVars: {
    "--bg-base": "#1a1b26",
    "--bg-muted": "#16161e",
    "--bg-raised": "#22232f",
    "--fg": "#c0caf5",
    "--fg-muted": "#9aa5ce",
    "--fg-dim": "#565f89",
    "--border": "#3b4261",
    "--border-subtle": "#2a2e44",
    "--accent": "#7aa2f7",
  },
  xterm: {
    background: "#1a1b26",
    foreground: "#c0caf5",
    cursor: "#7aa2f7",
    cursorAccent: "#1a1b26",
    selectionBackground: "rgba(122, 162, 247, 0.30)",
    black: "#15161e",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    white: "#a9b1d6",
    brightBlack: "#414868",
    brightRed: "#f7768e",
    brightGreen: "#9ece6a",
    brightYellow: "#e0af68",
    brightBlue: "#7aa2f7",
    brightMagenta: "#bb9af7",
    brightCyan: "#7dcfff",
    brightWhite: "#c0caf5",
  },
};

const catppuccin: Theme = {
  id: "catppuccin-mocha",
  name: "Catppuccin Mocha",
  cssVars: {
    "--bg-base": "#1e1e2e",
    "--bg-muted": "#181825",
    "--bg-raised": "#313244",
    "--fg": "#cdd6f4",
    "--fg-muted": "#a6adc8",
    "--fg-dim": "#6c7086",
    "--border": "#45475a",
    "--border-subtle": "#313244",
    "--accent": "#f5c2e7",
  },
  xterm: {
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    cursor: "#f5e0dc",
    cursorAccent: "#1e1e2e",
    selectionBackground: "rgba(245, 194, 231, 0.30)",
    black: "#45475a",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#f5c2e7",
    cyan: "#94e2d5",
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f38ba8",
    brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7",
    brightCyan: "#94e2d5",
    brightWhite: "#a6adc8",
  },
};

const solarizedDark: Theme = {
  id: "solarized-dark",
  name: "Solarized Dark",
  cssVars: {
    "--bg-base": "#002b36",
    "--bg-muted": "#073642",
    "--bg-raised": "#0a4a5a",
    "--fg": "#eee8d5",
    "--fg-muted": "#93a1a1",
    "--fg-dim": "#586e75",
    "--border": "#073642",
    "--border-subtle": "#073642",
    "--accent": "#b58900",
  },
  xterm: {
    background: "#002b36",
    foreground: "#eee8d5",
    cursor: "#b58900",
    cursorAccent: "#002b36",
    selectionBackground: "rgba(181, 137, 0, 0.30)",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#586e75",
    brightRed: "#cb4b16",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
  },
};

const gruvbox: Theme = {
  id: "gruvbox-dark",
  name: "Gruvbox Dark",
  cssVars: {
    "--bg-base": "#282828",
    "--bg-muted": "#1d2021",
    "--bg-raised": "#3c3836",
    "--fg": "#ebdbb2",
    "--fg-muted": "#bdae93",
    "--fg-dim": "#7c6f64",
    "--border": "#504945",
    "--border-subtle": "#3c3836",
    "--accent": "#fabd2f",
  },
  xterm: {
    background: "#282828",
    foreground: "#ebdbb2",
    cursor: "#fabd2f",
    cursorAccent: "#282828",
    selectionBackground: "rgba(250, 189, 47, 0.30)",
    black: "#282828",
    red: "#cc241d",
    green: "#98971a",
    yellow: "#d79921",
    blue: "#458588",
    magenta: "#b16286",
    cyan: "#689d6a",
    white: "#a89984",
    brightBlack: "#928374",
    brightRed: "#fb4934",
    brightGreen: "#b8bb26",
    brightYellow: "#fabd2f",
    brightBlue: "#83a598",
    brightMagenta: "#d3869b",
    brightCyan: "#8ec07c",
    brightWhite: "#ebdbb2",
  },
};

const lightMTerminal: Theme = {
  id: "mterminal-light",
  name: "mTerminal Light",
  cssVars: {
    "--bg-base": "#fafafa",
    "--bg-muted": "#f5f5f5",
    "--bg-raised": "#ffffff",
    "--fg": "#161616",
    "--fg-muted": "#5d5d5d",
    "--fg-dim": "#8f8f8f",
    "--border": "#0a0a0a1f",
    "--border-subtle": "#0a0a0a14",
    "--accent": "oklch(0.66 0.18 58)",
  },
  xterm: {
    background: "#fafafa",
    foreground: "#161616",
    cursor: "#c8612a",
    cursorAccent: "#fafafa",
    selectionBackground: "rgba(200, 97, 42, 0.25)",
    black: "#222222",
    red: "#c33d2f",
    green: "#3a8533",
    yellow: "#c4750c",
    blue: "#3168a8",
    magenta: "#9849ad",
    cyan: "#1a8278",
    white: "#dedede",
    brightBlack: "#5d5d5d",
    brightRed: "#e8584a",
    brightGreen: "#5aa852",
    brightYellow: "#e89320",
    brightBlue: "#4a82c4",
    brightMagenta: "#b566c8",
    brightCyan: "#3aa399",
    brightWhite: "#161616",
  },
};

export const THEMES: Theme[] = [
  mterminal,
  tokyoNight,
  catppuccin,
  solarizedDark,
  gruvbox,
  lightMTerminal,
];

export function findTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? mterminal;
}
