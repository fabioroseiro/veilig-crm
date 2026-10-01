"use client";

import { useEffect, useState } from "react";

// Alterna entre claro e escuro. Guarda a escolha em localStorage.
// Sem escolha salva, o sistema segue a preferência do SO (via CSS).
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("veilig-theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    } else {
      // sem escolha: reflete o que o sistema está mostrando
      const prefereDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      setTheme(prefereDark ? "dark" : "light");
    }
  }, []);

  const aplicar = (t: "light" | "dark") => {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("veilig-theme", t);
    setTheme(t);
  };

  const alternar = () => aplicar(theme === "dark" ? "light" : "dark");

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={alternar}
      aria-label="Alternar tema claro/escuro"
      title="Alternar tema claro/escuro"
    >
      {theme === "dark" ? "☀ Modo claro" : "☾ Modo escuro"}
    </button>
  );
}
