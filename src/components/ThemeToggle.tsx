"use client";

type Theme = "light" | "dark";

function themeInUse(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function chooseTheme(next: Theme): void {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch (error) {
    console.warn("No se pudo guardar la preferencia de tema", error);
  }
}

export function ThemeToggle() {
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => chooseTheme(themeInUse() === "dark" ? "light" : "dark")}
    >
      <span className="theme-toggle-on-light">
        <span aria-hidden>☾</span>
        <span className="visually-hidden">Cambiar al tema oscuro</span>
      </span>
      <span className="theme-toggle-on-dark">
        <span aria-hidden>☀</span>
        <span className="visually-hidden">Cambiar al tema claro</span>
      </span>
    </button>
  );
}
