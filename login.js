/* ------------------------------------------------------------------------
   login.js — animated county-index chart + sign-in / sign-up form behavior
   No backend is wired up. Swap the TODO in handleSubmit() for a real call.
   ------------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- sample series (illustrative, not live data) ---------------- */
const SERIES = [
  { name: "Providence", color: "#BE4A2D", points: [52, 55, 58, 61, 64, 68] },
  { name: "Washington", color: "#207388", points: [60, 62, 65, 66, 70, 74] },
  { name: "Bristol",    color: "#B4842A", points: [48, 50, 49, 53, 57, 60] },
];

const STAT_CHIPS = [
  { value: "5", label: "RI counties covered" },
  { value: "$74k", label: "Median household income, Washington Co." },
  { value: "31", label: "Chambers & SBA counselors in our directory" },
  { value: "Live", label: "Census ACS + BLS LAUS, fetched on load" },
];

const TICKER_ITEMS = [
  "PROVIDENCE COUNTY", "WASHINGTON COUNTY", "BRISTOL COUNTY", "KENT COUNTY", "NEWPORT COUNTY",
  "ACS 5-YEAR ESTIMATES", "BLS LAUS", "COUNTY BUSINESS PATTERNS",
];

/* ---------------- ticker ---------------- */
function initTicker() {
  const ticker = $("#visual-ticker");
  if (!ticker) return;
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  ticker.innerHTML = items.map((t) => `<span>${t}</span>`).join("");
}

/* ---------------- stat chips ---------------- */
function initStatChips() {
  const row = $("#stat-chips");
  if (!row) return;
  row.innerHTML = STAT_CHIPS.map(
    (s, i) => `
    <div class="stat-chip" style="animation-delay:${reduceMotion ? 0 : 0.15 * i + 0.3}s;">
      <div class="chip-value">${s.value}</div>
      <div class="chip-label">${s.label}</div>
    </div>`
  ).join("");
}

/* ---------------- legend ---------------- */
function initLegend() {
  const legend = $("#pulse-legend");
  if (!legend) return;
  legend.innerHTML = SERIES.map(
    (s) => `<span class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${s.name}</span>`
  ).join("");
}

/* ---------------- animated line chart (hand-written canvas, matches app style) ---------------- */
function initPulseChart() {
  const canvas = $("#pulse-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  function size() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  const allValues = SERIES.flatMap((s) => s.points);
  const min = Math.min(...allValues) - 6;
  const max = Math.max(...allValues) + 6;

  function xy(i, count, val, w, h, pad) {
    const x = pad + (i / (count - 1)) * (w - pad * 2);
    const y = h - pad - ((val - min) / (max - min)) * (h - pad * 2);
    return [x, y];
  }

  function draw(progress) {
    const { w, h } = size();
    const pad = 8;
    ctx.clearRect(0, 0, w, h);

    // gridlines
    ctx.strokeStyle = "rgba(248,246,241,0.08)";
    ctx.lineWidth = 1;
    for (let g = 0; g < 4; g++) {
      const y = pad + (g / 3) * (h - pad * 2);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    }

    SERIES.forEach((s) => {
      const count = s.points.length;
      const visibleCount = Math.max(2, progress * (count - 1) + 1);
      const fullPoints = Math.floor(visibleCount);
      const partial = visibleCount - fullPoints;

      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      let lastX, lastY;
      for (let i = 0; i < fullPoints; i++) {
        const [x, y] = xy(i, count, s.points[i], w, h, pad);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        lastX = x;
        lastY = y;
      }
      // partial segment into the next point
      if (fullPoints < count && partial > 0) {
        const [x0, y0] = xy(fullPoints - 1, count, s.points[fullPoints - 1], w, h, pad);
        const [x1, y1] = xy(fullPoints, count, s.points[fullPoints], w, h, pad);
        const x = x0 + (x1 - x0) * partial;
        const y = y0 + (y1 - y0) * partial;
        ctx.lineTo(x, y);
        lastX = x;
        lastY = y;
      }
      ctx.stroke();

      // glow dot at the growing tip
      if (lastX !== undefined) {
        ctx.beginPath();
        ctx.fillStyle = s.color;
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = s.color + "33";
        ctx.arc(lastX, lastY, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  if (reduceMotion) {
    draw(1);
    window.addEventListener("resize", () => draw(1));
    return;
  }

  const duration = 1400;
  let start = null;
  function frame(ts) {
    if (start === null) start = ts;
    const t = Math.min(1, (ts - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    draw(eased);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener("resize", () => draw(1));
}

/* ---------------- form: tabs, show/hide password, submit ---------------- */
function initForm() {
  const tabs = document.querySelectorAll(".login-tab");
  const title = $("#login-title");
  const sub = $("#login-sub");
  const nameField = $("#field-name");
  const nameInput = $("#name-input");
  const submitBtn = $("#submit-btn");
  const signinExtras = $("#signin-extras");
  const note = $("#form-note");
  const form = $("#login-form");
  const pwInput = $("#password-input");
  const pwToggle = $("#pw-toggle");

  let mode = "signin";

  function setMode(next) {
    mode = next;
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
    if (mode === "signin") {
      title.textContent = "Welcome back.";
      sub.textContent = "Sign in to save counties, plans and scores as you compare them.";
      nameField.style.display = "none";
      nameInput.required = false;
      signinExtras.style.display = "flex";
      submitBtn.textContent = "Sign in →";
      pwInput.autocomplete = "current-password";
    } else {
      title.textContent = "Create your account.";
      sub.textContent = "Save your plan across sessions and get notified when county data refreshes.";
      nameField.style.display = "block";
      nameInput.required = true;
      signinExtras.style.display = "none";
      submitBtn.textContent = "Create account →";
      pwInput.autocomplete = "new-password";
    }
    note.textContent = "";
    note.className = "form-note";
  }

  tabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));

  pwToggle.addEventListener("click", () => {
    const isHidden = pwInput.type === "password";
    pwInput.type = isHidden ? "text" : "password";
    pwToggle.textContent = isHidden ? "Hide" : "Show";
  });

  $("#forgot-btn").addEventListener("click", () => {
    note.textContent = "Password reset isn't wired up yet — check back once accounts are live.";
    note.className = "form-note error";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("#email-input").value.trim();
    const password = pwInput.value;
    const name = nameInput.value.trim();

    if (!email || !password || (mode === "signup" && !name)) {
      note.textContent = "Fill in every field to continue.";
      note.className = "form-note error";
      return;
    }

    const result = mode === "signup" ? authSignUp(name, email, password) : authSignIn(email, password);

    if (!result.ok) {
      note.textContent = result.error;
      note.className = "form-note error";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === "signin" ? "Signing in…" : "Creating account…";
    window.location.href = "index.html";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Already signed in? Skip the login page entirely.
  if (authGetSession()) {
    window.location.href = "index.html";
    return;
  }
  initTicker();
  initLegend();
  initStatChips();
  initPulseChart();
  initForm();
});
