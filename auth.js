/* ------------------------------------------------------------------------
   auth.js — lightweight client-side accounts + score storage.

   IMPORTANT: this is a front-end-only demo. Accounts and passwords are
   stored in the browser's localStorage, in plain text, with no server
   involved. Anyone using the same browser/profile can read them via
   devtools. This is fine for prototyping the flow, but swap it for a
   real backend (hashed passwords, a server-side session or token) before
   this handles real users.
   ------------------------------------------------------------------------ */

const AUTH_USERS_KEY = "sbri_users";
const AUTH_SESSION_KEY = "sbri_session";
const SCORES_PREFIX = "sbri_scores:";
const SCORE_HISTORY_LIMIT = 10;

function authGetUsers() {
  try { return JSON.parse(localStorage.getItem(AUTH_USERS_KEY)) || {}; }
  catch (e) { return {}; }
}
function authSaveUsers(users) {
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}

/** Create an account and sign in. Returns { ok, error? }. */
function authSignUp(name, email, password) {
  const users = authGetUsers();
  const key = email.trim().toLowerCase();
  if (!key || !password) return { ok: false, error: "Enter an email and password." };
  if (users[key]) return { ok: false, error: "An account with that email already exists — try signing in instead." };
  users[key] = { name: name.trim(), password };
  authSaveUsers(users);
  authSetSession(key);
  return { ok: true };
}

/** Check credentials and sign in. Returns { ok, error? }. */
function authSignIn(email, password) {
  const users = authGetUsers();
  const key = email.trim().toLowerCase();
  const user = users[key];
  if (!user || user.password !== password) {
    return { ok: false, error: "Email or password is incorrect." };
  }
  authSetSession(key);
  return { ok: true };
}

function authSetSession(email) { localStorage.setItem(AUTH_SESSION_KEY, email); }
function authGetSession() { return localStorage.getItem(AUTH_SESSION_KEY); }
function authSignOut() { localStorage.removeItem(AUTH_SESSION_KEY); }

function authCurrentUser() {
  const email = authGetSession();
  if (!email) return null;
  const users = authGetUsers();
  return users[email] ? { email, name: users[email].name } : null;
}

/** Call as early as possible on any page that requires sign-in.
 *  Redirects to login.html and returns false if nobody is signed in. */
function authRequire() {
  if (!authGetSession()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

/* ---------------- per-user score storage ---------------- */

function scoresStorageKey() {
  const email = authGetSession();
  return email ? SCORES_PREFIX + email : null;
}

function readScoreData() {
  const key = scoresStorageKey();
  if (!key) return { latest: null, history: [] };
  try { return JSON.parse(localStorage.getItem(key)) || { latest: null, history: [] }; }
  catch (e) { return { latest: null, history: [] }; }
}

function writeScoreData(data) {
  const key = scoresStorageKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(data));
}

/** Overwrite the "current" score snapshot for the signed-in user. */
function saveLatestScore(snapshot) {
  if (!scoresStorageKey()) return;
  const data = readScoreData();
  data.latest = { ...snapshot, savedAt: new Date().toISOString() };
  writeScoreData(data);
}

/** Append a snapshot to the signed-in user's score history (most recent first, capped). */
function pushScoreHistory(snapshot) {
  if (!scoresStorageKey()) return;
  const data = readScoreData();
  data.history.unshift({ ...snapshot, savedAt: new Date().toISOString() });
  data.history = data.history.slice(0, SCORE_HISTORY_LIMIT);
  writeScoreData(data);
}

function getScoreData() { return readScoreData(); }
