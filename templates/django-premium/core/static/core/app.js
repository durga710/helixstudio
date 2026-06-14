// Theme picker — populates the <select> and applies + persists the palette.
(function () {
  var THEMES = ["midnight", "ocean", "forest", "sunset", "grape", "paper"];
  var sel = document.getElementById("theme-select");
  if (sel) {
    THEMES.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    });
    sel.value = document.documentElement.dataset.theme || "midnight";
  }
  window.setTheme = function (t) {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("theme", t);
    } catch (e) {
      /* ignore */
    }
  };
})();
