/* App shell logic — mock auth + page routing + theming. All client-side, no
 * backend (premium static skeleton). Swap the mock auth for a real API when the
 * app needs one; everything else (layout, nav, theme) stays the same. */

const THEMES = ["midnight", "ocean", "forest", "sunset", "grape", "paper"];
const store = {
  get auth() { try { return JSON.parse(localStorage.getItem("app.user") || "null"); } catch { return null; } },
  set auth(u) { localStorage.setItem("app.user", JSON.stringify(u)); },
  clear() { localStorage.removeItem("app.user"); },
  get theme() { return localStorage.getItem("app.theme") || document.documentElement.dataset.theme || "midnight"; },
  set theme(t) { localStorage.setItem("app.theme", t); document.documentElement.dataset.theme = t; },
};

const $ = (s) => document.querySelector(s);
const show = (el, on) => el.classList.toggle("hidden", !on);

/* ── auth (mock) ─────────────────────────────────────────────────────────── */
let signupMode = false;
function renderAuthMode() {
  show($("#name-field"), signupMode);
  $("#auth-title").textContent = signupMode ? "Create your account" : "Welcome back";
  $("#auth-sub").textContent = signupMode ? "It takes a few seconds." : "Sign in to continue.";
  $("#auth-submit").textContent = signupMode ? "Create account" : "Sign in";
  $("#auth-switch-text").textContent = signupMode ? "Already have an account?" : "New here?";
  $("#auth-switch").textContent = signupMode ? "Sign in" : "Create an account";
}
function login(user) {
  store.auth = user;
  enterApp();
}
function enterApp() {
  const u = store.auth || { name: "Guest", email: "guest@demo.app" };
  show($("#view-auth"), false);
  show($("#view-app"), true);
  $("#view-app").classList.add("lg:grid");
  const initials = (u.name || u.email || "U").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  $("#avatar").textContent = initials || "U";
  $("#set-name").value = u.name || "";
  $("#set-email").value = u.email || "";
  route("dashboard");
  renderIcons();
  renderChart();
  if (window.AOS) window.AOS.refreshHard();
}

/* ── page routing ────────────────────────────────────────────────────────── */
function route(page) {
  document.querySelectorAll("[data-page]").forEach((s) => show(s, s.dataset.page === page));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.nav === page));
  $("#page-title").textContent = page.charAt(0).toUpperCase() + page.slice(1);
}

/* ── theme ───────────────────────────────────────────────────────────────── */
function initThemes() {
  const sel = $("#theme-select");
  sel.innerHTML = THEMES.map((t) => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join("");
  store.theme = store.theme; // apply persisted/default
  sel.value = store.theme;
  sel.addEventListener("change", () => {
    store.theme = sel.value;
    renderChart(); // recolor the chart to the new palette
  });
}

/* ── libraries (lucide icons + Chart.js, both themed by the palette) ──────── */
function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}

let dashChart = null;
function renderChart() {
  const canvas = $("#dash-chart");
  if (!canvas || !window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const brand = tok("--brand"), muted = tok("--muted"), line = tok("--line");
  if (dashChart) dashChart.destroy();
  dashChart = new window.Chart(canvas, {
    type: "line",
    data: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      // AI: replace with the app's real series.
      datasets: [{ label: "Visits", data: [12, 19, 14, 22, 18, 25, 21], borderColor: brand, backgroundColor: brand + "33", tension: 0.35, fill: true, pointRadius: 3 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: muted } } },
      scales: { x: { ticks: { color: muted }, grid: { color: line } }, y: { ticks: { color: muted }, grid: { color: line } } },
    },
  });
}

/* ── wire up ─────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  initThemes();
  renderAuthMode();
  renderIcons();
  if (window.AOS) window.AOS.init({ duration: 500, once: true });

  $("#auth-switch").addEventListener("click", () => { signupMode = !signupMode; renderAuthMode(); });
  $("#guest-link").addEventListener("click", () => login({ name: "Guest", email: "guest@demo.app" }));
  $("#auth-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    login({ name: f.get("name") || (f.get("email") || "").split("@")[0], email: f.get("email") });
  });
  $("#logout").addEventListener("click", () => { store.clear(); show($("#view-app"), false); show($("#view-auth"), true); });
  document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => route(b.dataset.nav)));
  $("#settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    store.auth = { name: f.get("name"), email: f.get("email") };
    enterApp();
    route("settings");
    const note = $("#saved-note"); show(note, true); setTimeout(() => show(note, false), 1500);
  });

  // Open straight to the app — no forced login. (The #view-auth screen stays in
  // the markup as an optional feature; it's hidden until something shows it.)
  enterApp();
});
