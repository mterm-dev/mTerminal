import { useEffect } from "react";
import type { Theme } from "../settings/themes";
import type { Settings } from "../settings/useSettings";

export function useThemeVars(theme: Theme, settings: Settings) {
  useEffect(() => {
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(theme.cssVars)) {
      root.setProperty(k, v);
    }
    const x = theme.xterm;
    root.setProperty("--xt-bg", x.background);
    root.setProperty("--xt-fg", x.foreground);
    root.setProperty("--xt-red", x.red);
    root.setProperty("--xt-green", x.green);
    root.setProperty("--xt-yellow", x.yellow);
    root.setProperty("--xt-blue", x.blue);
    root.setProperty("--xt-magenta", x.magenta);
    root.setProperty("--xt-cyan", x.cyan);
    root.setProperty("--xt-bright-red", x.brightRed);
    root.setProperty("--xt-bright-green", x.brightGreen);
    root.setProperty("--xt-bright-yellow", x.brightYellow);
    root.setProperty("--xt-bright-blue", x.brightBlue);
    root.setProperty("--xt-bright-magenta", x.brightMagenta);
    root.setProperty("--xt-bright-cyan", x.brightCyan);
    root.setProperty("--ui-font-size", `${settings.uiFontSize}px`);
    document.body.style.fontSize = `${settings.uiFontSize}px`;
  }, [theme, settings.uiFontSize]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--window-opacity",
      String(settings.windowOpacity),
    );
  }, [settings.windowOpacity]);

  useEffect(() => {
    const w = Math.max(200, Math.min(600, settings.sidebarWidth || 300));
    document.documentElement.style.setProperty("--side-w", `${w}px`);
  }, [settings.sidebarWidth]);

  useEffect(() => {
    const apply = () => {
      const overflow = Math.max(
        0,
        window.outerHeight - window.screen.availHeight,
      );
      document.documentElement.style.setProperty(
        "--safe-bottom",
        `${overflow}px`,
      );
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
}
