/* ==========================================================================
   SmallBizBoost RI — script.js
   Plain vanilla JavaScript. No frameworks, no external libraries.
   Sections below, in load order:
     1. Static/curated data (counties, resources directory, business types)
     2. Live data fetching (Census ACS, Census CBP, BLS LAUS) + fallback
     3. Chart rendering (hand-written Canvas 2D — no charting library)
     4. App state, rendering, and event wiring
   ========================================================================== */

/* ------------------------------------------------------------------------
   data.js
   Static / curated data: county metadata, the resources directory, business
   types, and a FALLBACK economic dataset used only if the live Census/BLS
   fetch fails (offline, rate-limited, CORS issue, etc). Everything under
   FALLBACK_ECONOMIC_DATA is clearly labeled as such in the UI when it's
   the data actually being shown.
   ------------------------------------------------------------------------ */

const STATE_FIPS = "44"; // Rhode Island

// County id -> 3-digit county FIPS code (used to build Census/BLS queries)
const COUNTY_FIPS = {
  bristol: "001",
  kent: "003",
  newport: "005",
  providence: "007",
  washington: "009",
};

const COUNTIES_META = [
  { id: "bristol", name: "Bristol County", note: "Smallest footprint in the state — tight-knit Main Street trade with limited backup capital nearby." },
  { id: "kent", name: "Kent County", note: "Middle-of-the-pack income with the cheapest commercial footprint on the list." },
  { id: "newport", name: "Newport County", note: "Fast-growing income and a high self-employed share, but seasonal and competitive." },
  { id: "providence", name: "Providence County", note: "Deepest labor market and the densest institutional support in the state, with the most direct competition." },
  { id: "washington", name: "Washington County", note: "Highest household income and lowest unemployment — the calmest labor market on the map." },
];

// Used only when a live fetch fails. Roughly representative, NOT live.
const FALLBACK_ECONOMIC_DATA = {
  bristol: { income: 88100, priorIncome: 82400, population: 48500, establishments: 1840, selfEmployed: 10.5, wage: 1160, unemployment: 3.8 },
  kent: { income: 85200, priorIncome: 79100, population: 166000, establishments: 5230, selfEmployed: 9.1, wage: 1190, unemployment: 3.6 },
  newport: { income: 96700, priorIncome: 86800, population: 82900, establishments: 3010, selfEmployed: 14.2, wage: 1148, unemployment: 3.9 },
  providence: { income: 74700, priorIncome: 68400, population: 660700, establishments: 12450, selfEmployed: 8.4, wage: 1287, unemployment: 4.1 },
  washington: { income: 105400, priorIncome: 97100, population: 129800, establishments: 4560, selfEmployed: 12.7, wage: 1105, unemployment: 3.2 },
};

const BUSINESS_TYPES = [
  { id: "food", name: "Food & beverage", multiplier: 1.0 },
  { id: "retail", name: "Retail", multiplier: 0.9 },
  { id: "prof", name: "Professional services", multiplier: 1.2 },
  { id: "personal", name: "Personal care", multiplier: 0.85 },
  { id: "construction", name: "Construction & trades", multiplier: 1.3 },
  { id: "health", name: "Health & wellness", multiplier: 1.1 },
];

// Metrics available on the County Snapshot page. `key` must match a field
// produced by api.js (see buildCountyRecord).
const METRICS = [
  { id: "income", label: "Median household income", fmt: (v) => `$${Math.round(v).toLocaleString()}` },
  { id: "growth", label: "5-year income growth (%)", fmt: (v) => `${v.toFixed(1)}%` },
  { id: "wage", label: "Est. average weekly wage ($)", fmt: (v) => `$${Math.round(v).toLocaleString()}` },
  { id: "unemployment", label: "Unemployment rate (%)", fmt: (v) => `${v.toFixed(1)}%`, lowerIsBetter: true },
  { id: "establishments", label: "Business establishments", fmt: (v) => Math.round(v).toLocaleString() },
  { id: "selfEmployed", label: "Self-employed share (%)", fmt: (v) => `${v.toFixed(1)}%` },
  { id: "population", label: "Population", fmt: (v) => Math.round(v).toLocaleString() },
];

// Curated resources directory — no open public API exists for this, so it
// stays hand-maintained. Every entry below was checked against the org's
// own site/contact page. (Two entries that couldn't be verified —
// Community Investment Corporation and East Bay Community Loan Fund —
// were removed rather than shipped unconfirmed.)
const RESOURCES = [
  { tag: "SBA Counseling", name: "Rhode Island Small Business Development Center (RISBDC)", desc: "Free one-on-one business counseling, formation guidance and financial projection review.", addr: "URI Providence Campus, 80 Washington St, Providence", phone: "(401) 874-7232", county: "providence", website: "https://web.uri.edu/risbdc/" },
  { tag: "SBA Counseling", name: "SBA Rhode Island District Office", desc: "Loan program guidance (7(a), 504, microloan) and lender matchmaking.", addr: "380 Westminster St, Providence", phone: "(401) 528-4561", county: "providence", website: "https://www.sba.gov/district/rhode-island" },
  { tag: "Mentoring", name: "SCORE Rhode Island", desc: "Volunteer mentors, most retired operators, matched by industry at no cost.", addr: "Statewide, virtual and in-person", phone: "(401) 226-0077", county: "all", website: "https://www.score.org/ri/" },
  { tag: "State Agency", name: "Rhode Island Commerce Corporation", desc: "Small Business Assistance Program, Innovation Vouchers and site selection help.", addr: "315 Iron Horse Way, Providence", phone: "(401) 278-9100", county: "providence", website: "https://commerceri.com/" },
  { tag: "Mentoring", name: "Center for Women & Enterprise RI", desc: "Coaching, capital access and a peer cohort for women-owned businesses.", addr: "10 Davol Sq, Providence", phone: "(401) 277-0800", county: "providence", website: "https://cweonline.org/our-centers/cwe-rhode-island" },
  { tag: "Chamber", name: "Greater Providence Chamber of Commerce", desc: "Largest business network in the state, plus advocacy and B2B introductions.", addr: "30 Exchange Terrace, Providence", phone: "(401) 521-5000", county: "providence", website: "https://providencechamber.com/" },
  { tag: "Chamber", name: "Central RI Chamber of Commerce", desc: "Serves Warwick, West Warwick, Coventry and East Greenwich businesses.", addr: "3288 Post Rd, Warwick", phone: "(401) 732-1100", county: "kent", website: "https://www.centralrichamber.com/" },
  { tag: "Chamber", name: "Newport County Chamber of Commerce", desc: "Tourism-season marketing co-ops and hospitality workforce referrals.", addr: "35 Valley Rd, Middletown", phone: "(401) 847-1608", county: "newport", website: "https://www.newportchamber.com/" },
  { tag: "Mentoring", name: "Aquidneck Island SCORE Chapter", desc: "Local chapter pairing seasonal and hospitality founders with retired mentors.", addr: "24 Mill St, Newport", phone: "(401) 226-0077", county: "newport", website: "https://www.score.org/ri/" },
  // Corrected: "Bristol County Chamber of Commerce" was renamed/merged into
  // "East Bay Chamber of Commerce" in 1998; real address is Warren, RI.
  { tag: "Chamber", name: "East Bay Chamber of Commerce", desc: "Local networking, Main Street promotion and municipal permitting contacts for Bristol, Warren and Barrington.", addr: "16 Cutler St, Warren", phone: "(401) 245-0750", county: "bristol", website: "https://www.eastbaychamberri.org/" },
  { tag: "Chamber", name: "South County Chamber of Commerce", desc: "Seasonal-business planning and shared marketing for the South County coast.", addr: "4808 Tower Hill Rd, Wakefield", phone: "(401) 783-2801", county: "washington", website: "https://www.srichamber.com/" },
];

const TYPES_OF_HELP = ["Every type", "SBA Counseling", "Mentoring", "State Agency", "CDFI Lending", "Chamber"];

function resourceCountForCounty(countyId) {
  return RESOURCES.filter((r) => r.county === "all" || r.county === countyId).length;
}


/* ------------------------------------------------------------------------
   api.js
   Fetches real public data at page load:
     - Median household income + population  -> Census ACS 5-Year API
     - 5-year income growth                   -> Census ACS 5-Year API (prior vintage)
     - Self-employed share                    -> Census ACS 5-Year Data Profile
     - Median earnings (-> est. weekly wage)  -> Census ACS 5-Year API
     - Business establishments                -> Census County Business Patterns API
     - Unemployment rate                      -> BLS LAUS API

   *** CENSUS_API_KEY IS REQUIRED, NOT OPTIONAL ***
   In practice, Census now appears to redirect (302) unauthenticated data
   queries rather than serve them directly, and that redirect response
   doesn't carry CORS headers — so the browser reports it as a blocked
   cross-origin request. Get a free key (instant, just an email address)
   at https://api.census.gov/data/key_signup.html and paste it into
   CENSUS_API_KEY below. Without it, every Census call here will fail and
   the site will run entirely on the cached fallback snapshot in data.js.

   BLS's LAUS API does not require a key for this volume of requests.

   If ANY individual call fails (offline, CORS, rate limit, changed vintage
   year, etc.) that specific metric silently falls back to the static
   snapshot in data.js and gets flagged so the UI can show "cached data".
   ------------------------------------------------------------------------ */

const CENSUS_API_KEY = "47d157768272a26f195d448b5913630c15f1531f"; // REQUIRED — paste your free key from https://api.census.gov/data/key_signup.html

const ACS_YEAR = 2022; // ACS 5-year vintage (2018-2022 estimates) — confirmed reachable
const ACS_PRIOR_YEAR = ACS_YEAR - 5; // for 5-year growth comparison
const CBP_YEAR = 2021; // County Business Patterns vintage — confirmed reachable

const FETCH_TIMEOUT_MS = 9000;

if (!CENSUS_API_KEY) {
  console.warn(
    "[SmallBizBoost RI] No CENSUS_API_KEY set — Census requests will likely fail. " +
    "Get a free key at https://api.census.gov/data/key_signup.html and paste it " +
    "into the CENSUS_API_KEY constant near the top of script.js."
  );
}

function withKey(url) {
  return CENSUS_API_KEY ? `${url}&key=${CENSUS_API_KEY}` : url;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Census API responses are arrays-of-arrays: [ [headers...], [row...], ... ]
// This turns them into { countyFips: value }
function indexByCountyFips(rows, valueColIndex) {
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const countyFips = row[row.length - 1]; // "county" column is always last
    out[countyFips] = Number(row[valueColIndex]);
  }
  return out;
}

async function fetchIncomeAndPopulation(year) {
  const url = withKey(
    `https://api.census.gov/data/${year}/acs/acs5?get=B19013_001E,B01003_001E&for=county:*&in=state:${STATE_FIPS}`
  );
  const rows = await fetchJson(url);
  return {
    income: indexByCountyFips(rows, 0),
    population: indexByCountyFips(rows, 1),
  };
}

async function fetchPriorIncome(year) {
  const url = withKey(
    `https://api.census.gov/data/${year}/acs/acs5?get=B19013_001E&for=county:*&in=state:${STATE_FIPS}`
  );
  const rows = await fetchJson(url);
  return indexByCountyFips(rows, 0);
}

async function fetchSelfEmployedShare(year) {
  // DP03_0026PE: percent of civilian employed pop. 16+ that is self-employed
  // in their own not-incorporated business, ACS Data Profile table.
  const url = withKey(
    `https://api.census.gov/data/${year}/acs/acs5/profile?get=DP03_0026PE&for=county:*&in=state:${STATE_FIPS}`
  );
  const rows = await fetchJson(url);
  return indexByCountyFips(rows, 0);
}

async function fetchMedianEarnings(year) {
  // B20002_001E: median earnings in the past 12 months for workers 16+ with earnings.
  // We divide by 52 as a rough proxy for average weekly wage (NOT the same
  // methodology as BLS QCEW, which needs a registered key + industry series).
  const url = withKey(
    `https://api.census.gov/data/${year}/acs/acs5?get=B20002_001E&for=county:*&in=state:${STATE_FIPS}`
  );
  const rows = await fetchJson(url);
  return indexByCountyFips(rows, 0);
}

async function fetchEstablishments(year) {
  const url = withKey(
    `https://api.census.gov/data/${year}/cbp?get=ESTAB&for=county:*&in=state:${STATE_FIPS}`
  );
  const rows = await fetchJson(url);
  return indexByCountyFips(rows, 0);
}

// BLS LAUS county unemployment rate, latest available month.
// Series ID format: LAUCN + state FIPS(2) + county FIPS(3) + "0000000003"
// NOTE: the "?latest=true" query parameter is only reliably honored for
// registered/keyed v2 requests. Unregistered GET requests should hit the
// bare endpoint instead — BLS returns periods in reverse chronological
// order, so data[0] is the most recent value.
async function fetchUnemploymentRate(countyFips) {
  const seriesId = `LAUCN${STATE_FIPS}${countyFips}0000000003`;
  const url = `https://api.bls.gov/publicAPI/v2/timeseries/data/${seriesId}`;
  const json = await fetchJson(url);
  const series = json?.Results?.series?.[0]?.data?.[0];
  if (!series) throw new Error(`No BLS data for ${seriesId} (status: ${json?.status}, message: ${json?.message?.join?.("; ")})`);
  return Number(series.value);
}

/**
 * Fetches everything and returns:
 *   { records: { [countyId]: {income, priorIncome, growth, population,
 *                              establishments, selfEmployed, wage, unemployment} },
 *     sources: { [countyId]: { [field]: 'live' | 'fallback' } },
 *     allLive: boolean }
 */
async function fetchAllEconomicData() {
  const countyIds = Object.keys(COUNTY_FIPS);
  const records = {};
  const sources = {};
  countyIds.forEach((id) => {
    records[id] = { ...FALLBACK_ECONOMIC_DATA[id] };
    sources[id] = {
      income: "fallback", priorIncome: "fallback", growth: "fallback",
      population: "fallback", establishments: "fallback",
      selfEmployed: "fallback", wage: "fallback", unemployment: "fallback",
    };
  });

  const results = await Promise.allSettled([
    fetchIncomeAndPopulation(ACS_YEAR),
    fetchPriorIncome(ACS_PRIOR_YEAR),
    fetchSelfEmployedShare(ACS_YEAR),
    fetchMedianEarnings(ACS_YEAR),
    fetchEstablishments(CBP_YEAR),
    ...countyIds.map((id) => fetchUnemploymentRate(COUNTY_FIPS[id])),
  ]);

  const [incomePopRes, priorIncomeRes, selfEmpRes, earningsRes, estabRes, ...unemploymentRes] = results;

  if (incomePopRes.status === "fulfilled") {
    countyIds.forEach((id) => {
      const fips = COUNTY_FIPS[id];
      const income = incomePopRes.value.income[fips];
      const population = incomePopRes.value.population[fips];
      if (Number.isFinite(income)) { records[id].income = income; sources[id].income = "live"; }
      if (Number.isFinite(population)) { records[id].population = population; sources[id].population = "live"; }
    });
  } else {
    console.warn("Census income/population fetch failed:", incomePopRes.reason);
  }

  if (priorIncomeRes.status === "fulfilled") {
    countyIds.forEach((id) => {
      const v = priorIncomeRes.value[COUNTY_FIPS[id]];
      if (Number.isFinite(v)) { records[id].priorIncome = v; sources[id].priorIncome = "live"; }
    });
  } else {
    console.warn("Census prior-income fetch failed:", priorIncomeRes.reason);
  }

  if (selfEmpRes.status === "fulfilled") {
    countyIds.forEach((id) => {
      const v = selfEmpRes.value[COUNTY_FIPS[id]];
      if (Number.isFinite(v)) { records[id].selfEmployed = v; sources[id].selfEmployed = "live"; }
    });
  } else {
    console.warn("Census self-employed fetch failed:", selfEmpRes.reason);
  }

  if (earningsRes.status === "fulfilled") {
    countyIds.forEach((id) => {
      const v = earningsRes.value[COUNTY_FIPS[id]];
      if (Number.isFinite(v)) { records[id].wage = v / 52; sources[id].wage = "live"; }
    });
  } else {
    console.warn("Census earnings fetch failed:", earningsRes.reason);
  }

  if (estabRes.status === "fulfilled") {
    countyIds.forEach((id) => {
      const v = estabRes.value[COUNTY_FIPS[id]];
      if (Number.isFinite(v)) { records[id].establishments = v; sources[id].establishments = "live"; }
    });
  } else {
    console.warn("Census CBP establishments fetch failed:", estabRes.reason);
  }

  unemploymentRes.forEach((r, i) => {
    const id = countyIds[i];
    if (r.status === "fulfilled" && Number.isFinite(r.value)) {
      records[id].unemployment = r.value;
      sources[id].unemployment = "live";
    } else {
      console.warn(`BLS unemployment fetch failed for ${id}:`, r.reason);
    }
  });

  // Growth is always derived locally from income + priorIncome
  countyIds.forEach((id) => {
    const { income, priorIncome } = records[id];
    records[id].growth = priorIncome ? ((income - priorIncome) / priorIncome) * 100 : 0;
    sources[id].growth = sources[id].income === "live" && sources[id].priorIncome === "live" ? "live" : "fallback";
  });

  const allLive = countyIds.every((id) =>
    Object.values(sources[id]).every((s) => s === "live")
  );

  return { records, sources, allLive };
}


/* ------------------------------------------------------------------------
   Chart rendering — pure vanilla JS using the Canvas 2D API.
   No external charting library. Two charts: a county comparison bar chart
   and a 5-axis radar chart for the score breakdown.
   ------------------------------------------------------------------------ */

const CHART_COLORS = {
  teal: "#207388",
  green: "#2F6A50",
  line: "rgba(17,33,44,0.14)",
  muted: "#5B6670",
  navy: "#11212C",
};

// Sets up a canvas's backing resolution to match its CSS size * devicePixelRatio,
// so drawing stays crisp on high-DPI screens. Returns the CSS-pixel {width,height}
// to draw with (the context is pre-scaled, so drawing code just uses CSS pixels).
function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function formatShortNumber(v) {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`;
  return `${Math.round(v)}`;
}

function drawRoundedTopRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

/**
 * Draws a simple vertical bar chart onto `canvas`.
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} labels
 * @param {number[]} values
 * @param {string} leaderLabel - label to highlight in green
 */
function renderCountyBarChart(canvas, labels, values, leaderLabel) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return; // not visible yet, skip

  const { ctx, width, height } = prepareCanvas(canvas);
  const padding = { top: 16, right: 12, bottom: 28, left: 52 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...values, 1) * 1.15;

  ctx.font = "12px Inter, sans-serif";
  ctx.strokeStyle = CHART_COLORS.line;
  ctx.fillStyle = CHART_COLORS.muted;
  ctx.lineWidth = 1;

  // gridlines + y-axis labels
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = (maxVal / ticks) * i;
    const y = padding.top + chartH - (v / maxVal) * chartH;
    ctx.beginPath();
    ctx.moveTo(padding.left, y + 0.5);
    ctx.lineTo(padding.left + chartW, y + 0.5);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(formatShortNumber(v), padding.left - 10, y);
  }

  // bars
  const gap = 20;
  const barWidth = (chartW - gap * (values.length - 1)) / values.length;
  values.forEach((v, i) => {
    const x = padding.left + i * (barWidth + gap);
    const barH = (v / maxVal) * chartH;
    const y = padding.top + chartH - barH;
    ctx.fillStyle = labels[i] === leaderLabel ? CHART_COLORS.green : CHART_COLORS.teal;
    drawRoundedTopRect(ctx, x, y, barWidth, barH, 4);
    ctx.fill();

    ctx.fillStyle = CHART_COLORS.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(labels[i], x + barWidth / 2, padding.top + chartH + 8);
  });
}

/**
 * Draws a 5-axis radar/spider chart of the score breakdown onto `canvas`.
 * @param {HTMLCanvasElement} canvas
 * @param {{household:number, labor:number, market:number, institutional:number, stability:number}} score
 */
function renderScoreRadarChart(canvas, score) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return; // not visible yet, skip

  const { ctx, width, height } = prepareCanvas(canvas);
  const cx = width / 2;
  const cy = height / 2 + 4;
  const radius = Math.max(Math.min(width, height) / 2 - 34, 10);

  const axes = [
    { label: "Household", value: score.household },
    { label: "Labor cost", value: score.labor },
    { label: "Market", value: score.market },
    { label: "Institutional", value: score.institutional },
    { label: "Stability", value: score.stability },
  ];
  const n = axes.length;
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2;
  const angleFor = (i) => startAngle + i * angleStep;

  // grid rings
  ctx.strokeStyle = CHART_COLORS.line;
  ctx.lineWidth = 1;
  const rings = 4;
  for (let r = 1; r <= rings; r++) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = angleFor(i % n);
      const rr = radius * (r / rings);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // spokes + labels
  ctx.font = "11px Inter, sans-serif";
  ctx.fillStyle = CHART_COLORS.muted;
  axes.forEach((ax, i) => {
    const a = angleFor(i);
    const x2 = cx + Math.cos(a) * radius;
    const y2 = cy + Math.sin(a) * radius;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const lx = cx + Math.cos(a) * (radius + 14);
    const ly = cy + Math.sin(a) * (radius + 14);
    ctx.textAlign = Math.abs(Math.cos(a)) < 0.3 ? "center" : Math.cos(a) > 0 ? "left" : "right";
    ctx.textBaseline = Math.abs(Math.sin(a)) < 0.3 ? "middle" : Math.sin(a) > 0 ? "top" : "bottom";
    ctx.fillText(ax.label, lx, ly);
  });

  // data polygon
  ctx.beginPath();
  axes.forEach((ax, i) => {
    const a = angleFor(i);
    const rr = radius * (Math.min(Math.max(ax.value, 0), 100) / 100);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(32,115,136,0.35)";
  ctx.strokeStyle = CHART_COLORS.teal;
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  // data points
  ctx.fillStyle = CHART_COLORS.teal;
  axes.forEach((ax, i) => {
    const a = angleFor(i);
    const rr = radius * (Math.min(Math.max(ax.value, 0), 100) / 100);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}


/* ------------------------------------------------------------------------
   app.js — application state, rendering, and event wiring.
   No framework, no build step: plain DOM APIs.
   ------------------------------------------------------------------------ */

const state = {
  page: "home",
  countyId: "providence",
  businessId: "food",
  rent: 3000,
  employees: 2,
  metric: "income",
  filterCounty: "all",
  filterType: "Every type",
  economicData: null, // filled after fetchAllEconomicData() resolves
  dataSources: null,
  dataStatus: "loading", // 'loading' | 'live' | 'partial' | 'fallback'
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function getCounty(id) {
  const meta = COUNTIES_META.find((c) => c.id === id);
  const econ = state.economicData[id];
  return { ...meta, ...econ };
}

function computeScore(county, businessType, employees, rent, annualRent, annualPayroll) {
  const household = clamp(((county.income - 65000) / 55000) * 70 + (county.growth / 15) * 30, 0, 100);

  // Labor cost headroom blends two things:
  //  (1) marketFit — the county/business-type wage environment (unchanged by your plan)
  //  (2) planFit — how efficiently YOUR staffing + rent plan uses that environment,
  //      via rent-per-employee and headcount relative to a lean 2-person baseline.
  // Blending them means the score always visibly responds to the plan inputs,
  // instead of being swamped by the market component.
  const wagePressure = (county.wage - 1000) / 3.2;
  const businessTypePressure = (businessType.multiplier - 1) * 55;
  const marketFit = clamp(100 - wagePressure - businessTypePressure, 0, 100);

  const effectiveHeadcount = Math.max(employees, 1);
  const rentPerHead = annualRent / effectiveHeadcount;
  const occupancyPressure = clamp((rentPerHead - 9000) / 300, -20, 60);
  const staffingPressure = clamp((employees - 2) * 4, -8, 32);
  const planFit = clamp(100 - occupancyPressure - staffingPressure, 0, 100);

  const labor = Math.round(marketFit * 0.55 + planFit * 0.45);

  const market = clamp((county.establishments / 13000) * 100, 0, 100);
  const resources = resourceCountForCounty(county.id);
  const institutional = clamp((resources / 8) * 100, 0, 100);
  const stability = clamp(100 - county.unemployment * 15, 0, 100);
  const weights = { household: 0.28, labor: 0.22, market: 0.18, institutional: 0.2, stability: 0.12 };
  const overall = Math.round(
    household * weights.household + labor * weights.labor + market * weights.market +
    institutional * weights.institutional + stability * weights.stability
  );
  return {
    household: Math.round(household), labor: clamp(labor, 0, 100), market: Math.round(market),
    institutional: Math.round(institutional), stability: Math.round(stability), overall, resources,
  };
}

function verdict(score) {
  if (score < 40) return { label: "Proceed carefully", cls: "badge-rust", note: "Costs or demand are working against you here. Compare a neighbouring county before committing." };
  if (score < 70) return { label: "Workable, with tradeoffs", cls: "badge-gold", note: "The fundamentals are mixed. Lean on local resources to help close the gap." };
  return { label: "Strong formation climate", cls: "badge-green", note: "Demand, labor cost and institutional support are aligned in your favor." };
}

/* ---------------------------- rendering ------------------------------- */

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function renderNav() {
  $all(".nav-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === state.page);
  });
  $all("main > section").forEach((sec) => {
    sec.classList.toggle("hidden", sec.id !== `page-${state.page}`);
  });
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function renderDataStatusBadge() {
  const el = $("#data-status");
  if (!el) return;
  const map = {
    loading: { text: "Loading live Census & BLS data…", cls: "status-loading" },
    live: { text: "Live Census & BLS data", cls: "status-live" },
    partial: { text: "Some figures are cached — live fetch partially unavailable", cls: "status-partial" },
    fallback: { text: "Showing cached data — live fetch unavailable", cls: "status-fallback" },
  };
  const s = map[state.dataStatus];
  el.textContent = s.text;
  el.className = `data-status ${s.cls}`;
}

function fillSelect(selectEl, options, value) {
  selectEl.innerHTML = options.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
  selectEl.value = value;
}

function renderHome() {
  const county = getCounty(state.countyId);
  const bt = BUSINESS_TYPES.find((b) => b.id === state.businessId);
  const annualPayroll = Math.round(county.wage * state.employees * 52 * bt.multiplier);
  const annualRent = state.rent * 12;
  const costFloor = annualPayroll + annualRent + 18000;
  const score = computeScore(county, bt, state.employees, state.rent, annualRent, annualPayroll);
  const v = verdict(score.overall);

  $("#county-select").value = state.countyId;
  $("#business-select").value = state.businessId;
  $("#rent-slider").value = state.rent;
  $("#rent-value").textContent = `$${state.rent.toLocaleString()}`;
  $("#employees-slider").value = state.employees;
  $("#employees-value").textContent = state.employees;

  $("#row-payroll").textContent = `$${annualPayroll.toLocaleString()}`;
  $("#row-rent").textContent = `$${annualRent.toLocaleString()}`;
  $("#row-costfloor").textContent = `$${costFloor.toLocaleString()}`;
  $("#payroll-note").textContent =
    `Payroll uses an ACS-derived average weekly wage ($${Math.round(county.wage).toLocaleString()}/week) adjusted for the labor intensity of your business type. The cost floor adds $18,000 for licensing, insurance and utilities.`;

  $("#score-eyebrow").textContent = `FORMATION CLIMATE SCORE · ${county.name.toUpperCase()}`;
  $("#score-number").textContent = score.overall;
  const badge = $("#score-badge");
  badge.textContent = v.label;
  badge.className = `badge ${v.cls}`;
  $("#score-note").textContent = v.note;
  $("#county-note").textContent = county.note;

  $("#bar-household").style.width = `${score.household}%`;
  $("#bar-labor").style.width = `${score.labor}%`;
  $("#bar-market").style.width = `${score.market}%`;
  $("#bar-institutional").style.width = `${score.institutional}%`;
  $("#bar-stability").style.width = `${score.stability}%`;
  $("#val-household").textContent = `${score.household} × 28%`;
  $("#val-labor").textContent = `${score.labor} × 22%`;
  $("#val-market").textContent = `${score.market} × 18%`;
  $("#val-institutional").textContent = `${score.institutional} × 20%`;
  $("#val-stability").textContent = `${score.stability} × 12%`;

  $("#resources-cta").textContent = `${score.resources} local resources`;

  renderScoreRadarChart($("#radar-chart"), score);

  saveLatestScore({
    county: county.name,
    businessType: bt.name,
    employees: state.employees,
    rent: state.rent,
    overall: score.overall,
    verdict: v.label,
  });
}

function renderCounties() {
  const metric = METRICS.find((m) => m.id === state.metric);
  const countyIds = Object.keys(COUNTY_FIPS);
  const rows = countyIds.map((id) => {
    const c = getCounty(id);
    return { id, name: c.name.replace(" County", ""), value: c[state.metric] };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const leader = [...rows].sort((a, b) => (metric.lowerIsBetter ? a.value - b.value : b.value - a.value))[0];

  $("#metric-title").textContent = metric.label;
  $("#metric-leader").innerHTML = `Leading: <strong>${leader.name} County</strong> at ${metric.fmt(leader.value)}`;

  $all(".metric-pill").forEach((btn) => btn.classList.toggle("active", btn.dataset.metric === state.metric));

  renderCountyBarChart($("#bar-chart"), rows.map((r) => r.name), rows.map((r) => r.value), leader.name);
}

function formatSavedSnapshot(s) {
  const when = new Date(s.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `
    <div class="saved-row">
      <div class="saved-row-main">
        <strong>${s.county}</strong> · ${s.businessType}
        <div class="saved-row-meta">${s.employees} employee${s.employees === 1 ? "" : "s"} · $${s.rent.toLocaleString()}/mo rent · saved ${when}</div>
      </div>
      <div class="saved-row-score">${s.overall} <span class="small muted">${s.verdict}</span></div>
    </div>`;
}

function renderSaved() {
  const data = getScoreData();
  const latestEl = $("#saved-latest");
  const historyEl = $("#saved-history");
  if (!latestEl || !historyEl) return;

  latestEl.innerHTML = data.latest
    ? formatSavedSnapshot(data.latest)
    : `<p class="saved-empty">Nothing saved yet — run the estimator and click "Save this score".</p>`;

  historyEl.innerHTML = data.history.length
    ? data.history.map(formatSavedSnapshot).join("")
    : `<p class="saved-empty">No saved history yet.</p>`;
}

function renderResources() {
  const filtered = RESOURCES.filter((r) => {
    const countyOk = state.filterCounty === "all" || r.county === "all" || r.county === state.filterCounty;
    const typeOk = state.filterType === "Every type" || r.tag === state.filterType;
    return countyOk && typeOk;
  });

  $("#resources-count").textContent = `${filtered.length} ORGANIZATION${filtered.length === 1 ? "" : "S"} FOUND`;

  const grid = $("#resources-grid");
  const empty = $("#resources-empty");
  if (filtered.length === 0) {
    grid.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  grid.classList.remove("hidden");
  empty.classList.add("hidden");

  grid.innerHTML = filtered.map((r) => {
    const countyLabel = r.county === "all" ? "Statewide" : COUNTIES_META.find((c) => c.id === r.county)?.name;
    return `
      <div class="card resource-card">
        <span class="tag">${r.tag.toUpperCase()}</span>
        <h3>${r.name}</h3>
        <p class="muted">${r.desc}</p>
        <div class="resource-meta">
          <div>📍 ${r.addr}</div>
          <div>📞 ${r.phone}</div>
        </div>
        <div class="resource-footer">
          <span class="muted small">${countyLabel}</span>
          ${
            r.website
              ? `<a class="btn btn-dark btn-sm" href="${r.website}" target="_blank" rel="noopener noreferrer">Visit website ↗</a>`
              : `<span class="muted small">Website unverified</span>`
          }
        </div>
      </div>`;
  }).join("");
}

function renderAll() {
  renderNav();
  renderDataStatusBadge();
  if (!state.economicData) return; // still loading
  renderHome();
  renderCounties();
  renderResources();
  renderSaved();
}

/* ----------------------------- wiring ----------------------------------*/

function setPage(page) {
  state.page = page;
  renderNav();
  // Canvas charts can only measure/draw correctly once their section is
  // visible (display !== none), so re-render whichever chart just became
  // visible now that its container has real dimensions.
  if (state.economicData) {
    if (page === "home") renderHome();
    if (page === "counties") renderCounties();
    if (page === "saved") renderSaved();
  }
}

function initStaticUi() {
  fillSelect($("#county-select"), COUNTIES_META.map((c) => ({ value: c.id, label: c.name })), state.countyId);
  fillSelect($("#business-select"), BUSINESS_TYPES.map((b) => ({ value: b.id, label: b.name })), state.businessId);
  fillSelect(
    $("#filter-county"),
    [{ value: "all", label: "All of Rhode Island" }, ...COUNTIES_META.map((c) => ({ value: c.id, label: c.name }))],
    state.filterCounty
  );
  fillSelect($("#filter-type"), TYPES_OF_HELP.map((t) => ({ value: t, label: t })), state.filterType);

  $("#metric-pills").innerHTML = METRICS.map(
    (m) => `<button class="metric-pill" type="button" data-metric="${m.id}">${m.label}</button>`
  ).join("");

  $all(".nav-pill").forEach((btn) => btn.addEventListener("click", () => setPage(btn.dataset.page)));
  $("#logo-link").addEventListener("click", () => setPage("home"));
  $("#run-estimator-link").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("plan-card").scrollIntoView({ behavior: "smooth" });
  });
  $("#compare-counties-btn").addEventListener("click", () => setPage("counties"));
  $("#resources-cta").addEventListener("click", () => {
    state.filterCounty = state.countyId;
    setPage("resources");
    renderAll();
  });
  $("#compare-counties-btn-2").addEventListener("click", () => setPage("counties"));

  $("#county-select").addEventListener("change", (e) => { state.countyId = e.target.value; renderHome(); });
  $("#business-select").addEventListener("change", (e) => { state.businessId = e.target.value; renderHome(); });
  $("#rent-slider").addEventListener("input", (e) => { state.rent = Number(e.target.value); renderHome(); });
  $("#employees-slider").addEventListener("input", (e) => { state.employees = Number(e.target.value); renderHome(); });

  $("#metric-pills").addEventListener("click", (e) => {
    const btn = e.target.closest(".metric-pill");
    if (!btn) return;
    state.metric = btn.dataset.metric;
    renderCounties();
  });

  $("#filter-county").addEventListener("change", (e) => { state.filterCounty = e.target.value; renderResources(); });
  $("#filter-type").addEventListener("change", (e) => { state.filterType = e.target.value; renderResources(); });

  const mobileToggle = $("#mobile-menu-toggle");
  const mobileMenu = $("#mobile-menu");
  mobileToggle.addEventListener("click", () => mobileMenu.classList.toggle("hidden"));
  $all("#mobile-menu .nav-pill").forEach((btn) =>
    btn.addEventListener("click", () => mobileMenu.classList.add("hidden"))
  );

  const doSignOut = () => {
    authSignOut();
    window.location.href = "login.html";
  };
  $("#auth-link")?.addEventListener("click", doSignOut);
  $("#auth-link-mobile")?.addEventListener("click", doSignOut);

  $("#save-score-btn").addEventListener("click", () => {
    const data = getScoreData();
    if (!data.latest) return;
    pushScoreHistory(data.latest);
    const note = $("#save-score-note");
    note.textContent = "Saved ✓";
    renderSaved();
    setTimeout(() => { if (note.textContent === "Saved ✓") note.textContent = ""; }, 2500);
  });

  $("#clear-saved-btn").addEventListener("click", () => {
    if (!confirm("Clear all saved scores? This can't be undone.")) return;
    writeScoreData({ latest: getScoreData().latest, history: [] });
    renderSaved();
  });
}

async function init() {
  if (!authRequire()) return;
  initStaticUi();
  renderNav();
  renderDataStatusBadge();

  try {
    const { records, sources, allLive } = await fetchAllEconomicData();
    state.economicData = records;
    state.dataSources = sources;
    if (allLive) {
      state.dataStatus = "live";
    } else {
      const anyLive = Object.values(sources).some((fields) => Object.values(fields).some((s) => s === "live"));
      state.dataStatus = anyLive ? "partial" : "fallback";
    }
  } catch (err) {
    console.error("Live data fetch failed entirely, using fallback dataset:", err);
    state.economicData = FALLBACK_ECONOMIC_DATA;
    state.dataStatus = "fallback";
  }

  renderAll();
}

document.addEventListener("DOMContentLoaded", init);

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!state.economicData) return;
    if (state.page === "home") renderHome();
    if (state.page === "counties") renderCounties();
  }, 150);
});