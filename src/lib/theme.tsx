// 主题系统：深/浅双 Token，偏好持久化并联动原生标题栏
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "dark" | "light";
const THEME_KEY = "dc.theme";

function initialTheme(): ThemeMode {
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

const ThemeCtx = createContext<{ theme: ThemeMode; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    window.dachuan.setTheme?.(theme).catch(() => {});
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
