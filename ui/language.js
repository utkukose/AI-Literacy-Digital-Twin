/* ---------------------------------------------------------------------------
   The interface language.

   A person who picks a language keeps it: the pick is stored with their
   account, so it follows them to any device, and in this browser, so the
   sign-in page opens in it too. Until somebody picks, the interface follows
   the browser it is opened in. It opens in Turkish only when the browser's
   language and its time zone are both Turkish; a browser set to another
   language, or a computer set to a time zone outside Turkey, gets English.

   The language on screen is the page's own lang attribute. Every request
   carries it, so whatever the server words itself arrives in that language,
   even in the moment before the account has heard about a change.
   --------------------------------------------------------------------------- */

const LANG_KEY = "yazem.lang";
const LANGS = ["tr", "en"];
const TURKISH_ZONES = ["Europe/Istanbul", "Asia/Istanbul", "Turkey"];

let pickedNow = false;

/* The guess for somebody who has not picked. Whatever cannot be read counts
   as Turkish. */
export function guessLang() {
  let first = "";
  let zone = "";
  try {
    first = String((navigator.languages && navigator.languages[0]) || navigator.language || "");
  } catch { /* no navigator */ }
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch { /* no time zone support */ }
  const turkishBrowser = first === "" || first.toLowerCase().startsWith("tr");
  const inTurkey = zone === "" || TURKISH_ZONES.includes(zone);
  return turkishBrowser && inTurkey ? "tr" : "en";
}

/* A language picked earlier in this browser. */
export function pickedLang() {
  try {
    const stored = window.localStorage.getItem(LANG_KEY);
    return LANGS.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

/* A pick made now, on this page. The sign-in sends it with the code, so a
   pick made before signing in is kept with the account. */
export function pickLang(lang) {
  pickedNow = true;
  try { window.localStorage.setItem(LANG_KEY, lang); } catch { /* storage refused */ }
}

export function pickedThisVisit() {
  return pickedNow;
}

/* The language to open in: the account's pick, then this browser's, then the
   guess. `me` is the answer of /me, or null before signing in. */
export function openingLang(me) {
  if (me && me.locale_chosen && LANGS.includes(me.account_locale)) return me.account_locale;
  return pickedLang() ?? guessLang();
}

/* Puts a language on screen. Called while rendering, so the requests a screen
   sends as it mounts already carry it. */
export function showLang(lang) {
  if (LANGS.includes(lang) && document.documentElement.lang !== lang) {
    document.documentElement.lang = lang;
  }
}

/* The header that tells the server which language is on screen. */
export function langHeaders() {
  const lang = document.documentElement.lang;
  return LANGS.includes(lang) ? { "X-Yazem-Lang": lang } : {};
}
