import { useEffect } from "react";
import type { Theme } from "../settings/themes";
import type { Settings } from "../settings/useSettings";

export function useThemeVars(theme: Theme, settings: Settings) {
  useEffect(() => {
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(theme.cssVars)) {
      root.setProperty(k, v);
    }
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
