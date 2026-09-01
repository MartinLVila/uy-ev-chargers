(function () {
  try {
    var chosen = localStorage.getItem("theme");
    if (chosen === "light" || chosen === "dark") {
      document.documentElement.dataset.theme = chosen;
    }
  } catch (error) {
    console.warn("No se pudo leer la preferencia de tema", error);
  }
})();
