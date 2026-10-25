/* ---------------------------------------------------------------------------
   The student screen's one connection to the server.

   Every scoring decision happens on the far side of this file. The client sends
   an answer and receives an outcome; it never computes points, never decides
   whether a step was correct, and never learns the target spans of a step it
   has not yet answered, so the browser can neither choose its score nor read
   the answers.

   The screen also runs without a server: with `useMock(true)` the same
   functions resolve from local sample data, so the interface can be worked on
   and demonstrated offline. The mock, separated below, is the only place in
   the client where an outcome is computed.
   --------------------------------------------------------------------------- */

/* Where this application is served from.
 *
 * With its own domain it is "/". Behind a path — http://SERVER_IP/yzokuryazarlik/
 * — it is "/yzokuryazarlik/", and every request has to carry that prefix or it
 * lands on whatever else is at the root of that host.
 *
 * Read from the page, so the same built bundle works wherever it is mounted.
 */
function appBase() {
  // <base href> when the deployment sets one, otherwise the directory the
  // page itself was served from.
  const tag = document.querySelector("base[href]");
  const from = tag ? tag.getAttribute("href") : window.location.pathname;
  const dir = from.endsWith("/") ? from : from.replace(/[^/]*$/, "");
  return dir === "/" ? "" : dir.replace(/\/$/, "");
}

const API = `${appBase()}/api`;

const BASE = API;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* The language on screen is the page's lang attribute; the server answers
   in it. */
function screenLang() {
  const lang = document.documentElement.lang;
  return lang === "tr" || lang === "en" ? { "X-Yazem-Lang": lang } : {};
}

async function call(path, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: "include",             // the session cookie is HttpOnly
      headers: { ...screenLang(), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(0, "offline", "network unreachable");
  }

  if (res.status === 204) return null;

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    // The error keeps the server's own code and wording, so the reason for a
    // failure, such as a rate limit, is preserved. A detail that is an object
    // (the solving limits, the report cap) travels whole on the error.
    // A request the server could not read at all comes back as a list of
    // problems; the first one stands for the rest.
    const raw = payload?.detail;
    const detail = Array.isArray(raw) ? (raw[0]?.msg ?? res.statusText) : raw;
    const structured = detail && typeof detail === "object";
    const err = new ApiError(res.status,
                             structured ? (detail.code ?? "error") : (payload?.code ?? "error"),
                             structured ? (detail.message ?? detail.code ?? res.statusText)
                                        : (detail ?? payload?.message ?? res.statusText));
    if (structured) err.detail = detail;
    throw err;
  }
  return payload;
}

/* ------------------------------------------------------------------ session */

export const auth = {
  requestCode: (email, locale) =>
    call("/auth/request-code", { method: "POST", body: { email, locale } }),

  /* Returns the person, or a signal that registration has to be completed. */
  verify: (email, code, profile) =>
    call("/auth/verify", { method: "POST", body: { email, code, ...profile } }),

  signOut: () => call("/auth/sign-out", { method: "POST" }),
};

export const me = {
  get: () => call("/me"),
  /* chosen: the person picked it. false: the interface guessed it, and the
     server keeps a pick made earlier. */
  setLocale: (locale, chosen = true) =>
    call("/me/locale", { method: "PUT", body: { locale, chosen } }),
  /* The languages to be offered cases in; null follows the interface again. */
  setCaseLocales: (locales) =>
    call("/me/case-locales", { method: "PUT", body: { locales } }),
  /* Read on a return visit so the fields come back filled in; written both
     on first registration and whenever somebody corrects something. A change
     to an approved profile waits for approval. */
  profile: () => call("/me/profile"),
  declare: (fields) => call("/me/profile", { method: "PUT", body: fields }),
  withdraw: () => call("/me/profile/pending", { method: "DELETE" }),
  /* Neither waits for approval: the avatar comes from a fixed set, and
     appearing on the board is the person's own choice. */
  setAvatar: (avatar) => call("/me/avatar", { method: "PUT", body: { avatar } }),
  setBoard: (opt_in) => call("/me/board", { method: "PUT", body: { opt_in } }),
  /* Whether the person may also be seen on the ranking from outside the
     platform, once the administrators open it to visitors. */
  setBoardPublic: (on) => call("/me/board", { method: "PUT", body: { opt_in: true, public: on } }),
  /* Every graded step, oldest first: the twin's evidence. */
  history: () => call("/me/twin/history"),
  /* Whether a new case may begin now, and what is left of the session and week. */
  limits: () => call("/me/limits"),
  /* The person's own problem reports and what became of them. */
  reports: () => call("/me/reports"),
};

export const units = {
  list: () => call("/units"),
};

/* Rare marks and medals: what there is to earn in each group and, signed in,
   what this person holds. */
export const awardList = {
  mine: () => call("/awards"),
  /* For someone who has not signed in; nobody's awards are in it. */
  visitor: () => call("/public/awards"),
};

export const ranking = {
  /* role: all, student, academic or admin_staff. A unit includes everything
     under it. A visitor sees only the people who agreed to be seen from
     outside the platform, while the ranking is open to visitors. */
  list: (role, unitId, visitor = false) =>
    call(`${visitor ? "/public" : ""}/board?role=${encodeURIComponent(role || "all")}`
         + (unitId ? `&unit_id=${encodeURIComponent(unitId)}` : "")),
};

/* -------------------------------------------------------------------- cases */

export const cases = {
  /* Everything available, not just the recommendation. */
  open: () => call("/cases/open"),
  /* The case to do next, in one area or where the twin knows least. */
  next: (dimension) => call(dimension
    ? `/cases/next?dimension=${encodeURIComponent(dimension)}` : "/cases/next"),

  /* The correct answers of a finished case once the case is open, otherwise
     how far it is from opening. */
  solution: (caseKey) => call(`/cases/${encodeURIComponent(caseKey)}/solution`),

  /* The case's picture. The version is part of the address, so the browser
     keeps a picture until it changes. */
  imageUrl: (caseKey, version) =>
    `${BASE}/cases/${encodeURIComponent(caseKey)}/image?v=${encodeURIComponent(version)}`,

  /* A case's opening in one of its languages, to choose the version to solve. */
  intro: (caseKey, locale) =>
    call(`/cases/${encodeURIComponent(caseKey)}/intro?locale=${encodeURIComponent(locale)}`),

  /* Starts an attempt and returns only the first step. A case that comes in
     two languages starts in the one chosen; one already begun keeps its own. */
  start: (caseKey, locale) => call(`/cases/${encodeURIComponent(caseKey)}/start`,
                                   { method: "POST", body: locale ? { locale } : undefined }),

  /* One step per request, in both directions.

     The response carries the outcome of the step just answered and the next
     step to render. Nothing about a later step is in the payload before it is
     reached, so the network tab cannot be used to read ahead. */
  /* Field names per step kind, matching grading.SUBMISSION_FIELDS:
       span_select     { spans: [[start, end], ...] }
       source_verify   { answers: { s1: true, s2: false } }
       pattern_check   { text: "..." }
       reasoned_choice { option: "o2", reason: "r1" }
       branching       { option_ids: ["o1", "p2"] }, the path walked so far
     The server rejects anything else. */
  submit: (attemptId, stepKey, submission, confidence, nodeId) =>
    call(`/attempts/${attemptId}/submit`, {
      method: "POST",
      // A submission is what the person did. Field names match
      // StepSubmission in api.py exactly.
      body: { step_key: stepKey, submission, confidence,
              ...(nodeId ? { node_id: nodeId } : {}) },
    }),
};

export const news = {
  /* Before signing in: the announcements meant for everyone. */
  landing: () => call("/landing"),
  /* Signed in: the ones meant for this person. */
  mine: () => call("/announcements"),
};

export const reports = {
  /* A problem in a case, on one step or on the case as a whole. */
  send: (caseKey, stepKey, kind, body) =>
    call(`/cases/${encodeURIComponent(caseKey)}/report`, {
      method: "POST", body: { step_key: stepKey ?? null, kind, body } }),
};

export const files = {
  /* What this person may see right now. The server applies the release rule; the
     client only draws what comes back, so a file that has not been released is
     never in the payload at all. */
  forCase: (caseKey) => call(`/cases/${encodeURIComponent(caseKey)}/files`),
  url: (id) => `${BASE}/files/${id}`,
};

export const map = {
  activity: () => call("/map/activity"),
};

export const i18n = {
  catalog: (locale) => call(`/i18n/${locale}`),
};

/* --------------------------------------------------------------------------
   Offline mode.

   Used when the screen is opened without a server behind it. It computes
   outcomes locally, which the deployed client must never do, so it is kept
   here behind one flag.
   -------------------------------------------------------------------------- */

let MOCK = false;
export const useMock = (on = true) => { MOCK = on; };
export const isMock = () => MOCK;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function withMock(realModule, mockModule) {
  return new Proxy(realModule, {
    get(target, prop) {
      if (MOCK && prop in mockModule) return mockModule[prop];
      return target[prop];
    },
  });
}

/* Points and the Elo step, ported from scoring.py so the offline screen shows
   the same numbers the server would return. */
export function mockScore(base, outcome, confidence) {
  if (confidence == null) return base * outcome;
  const success = outcome >= 0.8 ? 1 : 0;      // scoring.SUCCESS_THRESHOLD
  return base * (1 - 4 * Math.pow(confidence - success, 2));
}

export function mockElo(theta, difficulty, outcome, attempts, expected = null) {
  const z = theta - difficulty;
  const p = expected ?? (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
  const k = attempts < 10 ? 0.4 : 0.15;
  return { p, before: theta, after: theta + k * (outcome - p) };
}

export async function mockDelay() {
  // Simulated latency, so the interface is built against realistic timing.
  await wait(140 + Math.random() * 220);
}
