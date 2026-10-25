import React, { useState, useEffect } from "react";

import StudentApp, { ProfileScreen, SuspendedNotice } from "./StudentApp.jsx";
import CampusPlan from "./CampusPlan.jsx";
import AdminPanel from "./AdminPanel.jsx";
import CaseEditor from "./CaseEditor.jsx";
import Board from "./Board.jsx";
import About from "./About.jsx";
import { Avatar } from "./avatarArt.jsx";
import { langHeaders, openingLang, pickLang, showLang } from "./language.js";
import { THEME_CSS, ThemeSwitch, THEME_PREFS } from "./theme.jsx";
import { darkness, sunPosition } from "./campusSky.js";
import { CREDITS } from "./credits.js";

/* ---------------------------------------------------------------------------
   The application.

   The shell that joins the screens into one system: a single URL, one
   session, and a bar that shows a person only what their role lets them open.

   Each screen is self-contained and handles its own data, so the shell decides
   which one is on screen and who is allowed to ask for it.
   --------------------------------------------------------------------------- */

/* Colours taken from the institution's own marks.
 *
 *   #E10613  the university seal's red, sampled from the crest
 *   #C00000  the centre's red, sampled from the AIARC wordmark
 *
 * The darker of the two is used for text, borders and filled buttons because
 * it clears 4.5:1 contrast on both the card and the page background. The seal
 * red is kept for the brighter accents: the badge, small highlights and the
 * crest itself. */
const PAPER = "var(--paper)", CARD = "var(--card)", LINE = "var(--line)";
const TEXT = "var(--text)", MUTED = "var(--muted)", ACCENT = "var(--accent)", BRAND = "var(--brand)";
const DISPLAY = "'Archivo', system-ui, sans-serif";
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/* The marks, embedded so the shell is one file like every screen. */
const LOGO_AIARC = "data:image/png;base64,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";

const LOGO_SDU = "data:image/png;base64,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";

const TITLE = {
  tr: "SDÜ Yapay Zeka Okuryazarlığı - Kampüs İkizi Platformu",
  en: "SDÜ AI Literacy - Campus Twin Platform",
};

/* On a phone the bar carries one short line; the marks on either side say
   whose it is. */
const SHORT_TITLE = {
  tr: "Yapay Zeka Okuryazarlığı",
  en: "SDÜ AI Literacy",
};

const SUBTITLE = {
  tr: "Yapay Zeka Uygulama ve Araştırma Merkezi",
  en: "Artificial Intelligence Application and Research Centre",
};

const ORG = {
  tr: {
    university: "Süleyman Demirel Üniversitesi",
    centre: "Yapay Zeka Uygulama ve Araştırma Merkezi",
    credits: CREDITS.tr.heading,
    people: CREDITS.tr.people,
  },
  en: {
    university: "Süleyman Demirel University",
    centre: "Artificial Intelligence Application and Research Centre",
    credits: CREDITS.en.heading,
    people: CREDITS.en.people,
  },
};

/* The marks and the system's name above the bar. */
function Brand({ lang }) {
  return (
    <header style={S.brand}>
      <div style={S.brandInner} className="brand-inner">
        <img src={LOGO_AIARC} alt="SDÜ AIARC" style={S.brandWide} className="brand-logo" />
        <div style={S.brandText}>
          <div style={S.brandTitle}>
            <span className="brand-long">{TITLE[lang] ?? TITLE.tr}</span>
            <span className="brand-short">{SHORT_TITLE[lang] ?? SHORT_TITLE.tr}</span>
          </div>
          <div style={S.brandSub} className="brand-sub">{SUBTITLE[lang] ?? SUBTITLE.tr}</div>
        </div>
        <img src={LOGO_SDU} alt={(ORG[lang] ?? ORG.tr).university}
          style={S.brandSeal} className="brand-logo" />
      </div>
    </header>
  );
}

function LangSwitch({ lang, onLang, className = "nav-lang" }) {
  return (
    <div style={S.seg} className={className}>
      {["tr", "en"].map((l) => (
        <button key={l} onClick={() => onLang(l)} aria-pressed={lang === l}
          data-lang={l}
          style={{ ...S.segBtn, ...(lang === l ? S.segOn : null) }}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/* The strip that carries the institution's name. Shown at the door and at the
   foot of every screen, so nobody has to wonder whose system this is. */
function Colophon({ lang, compact }) {
  const o = ORG[lang] ?? ORG.tr;
  return (
    <footer style={compact ? S.colophonCompact : S.colophon}>
      <div style={S.colophonMarks}>
        <img src={LOGO_AIARC} alt="SDÜ AIARC" style={S.markWide} />
        <img src={LOGO_SDU} alt={o.university} style={S.markSeal} />
      </div>
      <div style={S.colophonName}>
        {o.university}
        <span style={S.colophonSep}> · </span>
        {o.centre}
      </div>
      {!compact && (
        <div style={S.credits}>
          <div style={S.creditsCap}>{o.credits}</div>
          {o.people.map(([who, role]) => (
            <div key={who} style={S.creditRow}>
              <span style={S.creditName}>{who}</span>
              <span style={S.creditRole}>{role}</span>
            </div>
          ))}
        </div>
      )}
    </footer>
  );
}

/* `needs` is which permission the screen wants; `hash` is the address that
   reaches it.
 *
 * The management screen is unlisted in the bar and reached by typing #yonetim,
 * which keeps it out of the way of people who do not need it.
 *
 * This is presentation only: every /admin endpoint checks the caller
 * server-side and answers 403 regardless of what the interface shows. */
const NAV = [
  // The person's own twin opens first; the cases are one tab along.
  { key: "twin", icon: "🌹", tr: "İkizim", en: "My twin", needs: null,
    hash: "" },
  { key: "cases", icon: "📅", tr: "Vakalar", en: "Cases", needs: null,
    hash: "vakalar" },
  { key: "map", icon: "🗺️", tr: "Kampüs", en: "Campus", needs: null,
    hash: "kampus" },
  { key: "board", icon: "🏅", tr: "Sıralama", en: "Ranking", needs: null,
    hash: "siralama" },
  { key: "write", icon: "✍️", tr: "Vaka Yaz", en: "Write", needs: "author",
    hash: "vaka-yaz" },
  // Open before signing in as well, from the sign-in page.
  { key: "about", icon: "🔬", tr: "Hakkında", en: "About", needs: null,
    hash: "hakkinda" },
  { key: "admin", icon: "🎛️", tr: "Yönetim", en: "Admin", needs: "admin",
    hash: "yonetim", unlisted: true },
  // Reached from the avatar at the right of the bar.
  { key: "profile", icon: "👤", tr: "Profilim", en: "Profile", needs: null,
    hash: "profil", unlisted: true },
];

/* A screen may carry more after its name: #vaka-yaz/12 opens draft 12 in the
   editor, so the panel can send a person straight to it, and #vaka/<case>
   opens a case on the cases screen, from the campus map or the twin. */
function screenForHash() {
  const h = (window.location.hash || "").replace(/^#/, "").toLowerCase().split("/")[0];
  if (h === "vaka") return "cases";
  return NAV.find((n) => n.hash && n.hash === h)?.key ?? null;
}

const FIRST = NAV[0].key;

const T = {
  tr: { signOut: "Çıkış yap", loading: "Yükleniyor…",
        offline: "Sunucuya ulaşılamadı. Ekranlarda gezinebilirsin, ancak gördüğün veriler örnektir.",
        profile: "Profilin", waiting: "Onay bekleyen değişikliğin var",
        guide: "Kullanım rehberi",
        signIn: "Giriş yap", signInShort: "Giriş" },
  en: { signOut: "Sign out", loading: "Loading…",
        offline: "No connection. You can look around, but the data is sample.",
        profile: "Your profile", waiting: "A change is waiting for approval",
        guide: "User guide",
        signIn: "Sign in", signInShort: "Sign in" },
};

/* What someone who has not signed in may look at, as /public/campus says it.
   Nothing until the server has said so. */
const CLOSED = { campus: false, twin: false, units: false, board: false };
/* The screens a visitor can open, each while its part is open; how the
   platform works can always be read. */
const VISITOR_TABS = { map: "campus", board: "board", about: null };

/* The demo's own words: its door and the strip across every screen in it. */
const D = {
  tr: {
    title: "Demo",
    lede: "Bu demo, platformun bir süredir kullanılan hâlini gösteriyor. Kişiler, sayılar ve cevaplar örnek olarak üretildi, hiçbiri gerçek bir kişiye ait değil.",
    since: "Açılış: {date}", people: "Kayıtlı kişi: {n}",
    password: "Demo parolası", passwordHint: "Parolayı platformun yöneticilerinden alabilirsin.",
    who: "Kimin gözünden bakmak istersin?",
    roles: { student: "Öğrenci", academic: "Akademisyen", admin_staff: "İdari personel",
             admin: "Yönetici" },
    about: { student: "Vakaları çözen ve dijital ikizi gelişen bir öğrenci.",
             academic: "Vakaları çözen ve sıralamada görünen bir akademisyen.",
             admin_staff: "Personele yönelik vakaları çözen bir çalışan.",
             admin: "Yönetim panelini ve Vaka Yaz ekranını kullanan bir yönetici." },
    enter: "Demoya gir", entering: "Açılıyor…",
    wrong: "Parola yanlış.", tooMany: "Çok fazla deneme yapıldı. Bir saat sonra yeniden dene.",
    notReady: "Demo hazırlanıyor. Birkaç dakika sonra yeniden dene.",
    off: "Bu sunucuda demo açık değil.", back: "Platforma dön",
    strip: "Demo: Buradaki kişiler ve sayılar örnektir. Yaptığın değişiklikler gerçek platforma yansımaz.",
    switchRole: "Rol değiştir", leave: "Demodan çık",
  },
  en: {
    title: "Demo",
    lede: "This copy shows the platform after a stretch of use. The people, figures and answers are made up, and none of them belongs to a real person.",
    since: "Opened: {date}", people: "People registered: {n}",
    password: "Demo password", passwordHint: "The platform's administrators can give you the password.",
    who: "Whose eyes would you like to look through?",
    roles: { student: "Student", academic: "Academic", admin_staff: "Administrative staff",
             admin: "Administrator" },
    about: { student: "A student who solves cases and whose twin is growing.",
             academic: "An academic who solves cases and appears on the ranking.",
             admin_staff: "A member of staff who solves the cases meant for staff.",
             admin: "An administrator who uses the management panel and the case editor." },
    enter: "Enter the demo", entering: "Opening…",
    wrong: "Wrong password.", tooMany: "Too many tries. Try again in an hour.",
    notReady: "The demo is being prepared. Try again in a few minutes.",
    off: "The demo is not open on this server.", back: "Back to the platform",
    strip: "Demo: The people and figures here are made up. What you change does not reach the real platform.",
    switchRole: "Switch role", leave: "Leave the demo",
  },
};

/* Light or dark. Otomatik follows the sun over Isparta, so the page turns dark
   at the moment the campus map does; Açık and Koyu hold it. The choice is this
   browser's, not the account's, since a person may want different ones on a
   phone and a laptop. */
const THEME_KEY = "yazem.theme";

function storedTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEME_PREFS.includes(v) ? v : "auto";
  } catch { return "auto"; }
}

function themeFor(pref, at = new Date()) {
  if (pref !== "auto") return pref;
  try { return darkness(sunPosition(at).altitude) > 0.5 ? "dark" : "light"; }
  catch { return "light"; }
}

/* The page and, on a phone, the browser's own bar around it. */
function paint(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#121417" : "#F3F4EF");
}

function useTheme() {
  const [pref, setPref] = useState(() => {
    const p = storedTheme();
    // Set before the first paint, so the page does not flash light at night.
    paint(themeFor(p));
    return p;
  });
  useEffect(() => {
    const apply = () => paint(themeFor(pref));
    apply();
    if (pref !== "auto") return undefined;
    const id = setInterval(apply, 60000);
    return () => clearInterval(id);
  }, [pref]);
  const choose = (next) => {
    try { localStorage.setItem(THEME_KEY, next); } catch { /* kept for this visit */ }
    setPref(next);
  };
  return [pref, choose];
}

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

async function get(path) {
  const res = await fetch(`${API}${path}`, { credentials: "include", headers: langHeaders() });
  if (!res.ok) {
    let detail = null;
    try { detail = (await res.json())?.detail ?? null; } catch { /* no body */ }
    throw Object.assign(new Error(res.statusText), { status: res.status, detail });
  }
  return res.json();
}

/* Tells the account which language is on screen: a pick, or the browser's
   guess, which never replaces a pick. */
function tellLocale(locale, chosen) {
  fetch(`${API}/me/locale`, {
    method: "PUT", credentials: "include",
    headers: { ...langHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ locale, chosen }),
  }).catch(() => { /* the next visit tells it again */ });
}

/* The demo's door. The password opens the demo for this browser as one of
   four made-up people; nothing here touches the real platform. */
function DemoDoor({ lang, status }) {
  const d = D[lang] ?? D.tr;
  const [password, setPassword] = useState("");
  const [persona, setPersona] = useState("student");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ready = status.available && status.ready;
  const enter = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API}/demo/enter`, {
        method: "POST", credentials: "include",
        headers: { ...langHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ password, persona }),
      });
      if (res.ok) { window.location.reload(); return; }
      setError(res.status === 401 ? d.wrong : res.status === 429 ? d.tooMany
        : res.status === 503 ? d.notReady : d.off);
    } catch {
      setError(d.notReady);
    }
    setBusy(false);
  };
  const people = status.people != null
    ? status.people.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB") : null;
  const opened = status.launch
    ? new Date(`${status.launch}T12:00:00+03:00`).toLocaleDateString(
      lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
  return (
    <section style={S.demoDoor} data-screen="demo-door">
      <h1 style={S.demoTitle}>{d.title}</h1>
      <p style={S.demoLede}>{d.lede}</p>
      {ready && (opened || people) && (
        <p style={S.demoFacts}>
          {opened && <span>{d.since.replace("{date}", opened)}</span>}
          {people && <span>{d.people.replace("{n}", people)}</span>}
        </p>
      )}
      {!status.available && <div style={S.demoNote} role="alert">{d.off}</div>}
      {status.available && !status.ready && <div style={S.demoNote} role="alert">{d.notReady}</div>}
      {ready && (
        <form onSubmit={(e) => { e.preventDefault(); if (!busy && password) enter(); }}>
          <div style={S.demoLabel}>{d.who}</div>
          <div style={S.demoPeople} role="radiogroup" aria-label={d.who}>
            {status.personas.map((p) => {
              const on = persona === p.key;
              const title = p.title ? `${p.title[lang] ?? p.title.tr} ` : "";
              return (
                <button key={p.key} type="button" role="radio" aria-checked={on}
                  data-persona={p.key} onClick={() => setPersona(p.key)}
                  style={{ ...S.demoPerson, ...(on ? S.demoPersonOn : null) }}>
                  <Avatar code={p.avatar} label={`${p.given_name} ${p.family_name}`} size={40} />
                  <span style={S.demoPersonText}>
                    <span style={S.demoRole}>{d.roles[p.key]}</span>
                    <span style={S.demoName}>{title}{p.given_name} {p.family_name}</span>
                    <span style={S.demoUnit}>{p.unit?.[lang] ?? p.unit?.tr}</span>
                    <span style={S.demoAbout}>{d.about[p.key]}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <label style={S.demoLabel} htmlFor="demo-password">{d.password}</label>
          <input id="demo-password" type="password" value={password} autoComplete="off"
            onChange={(e) => setPassword(e.target.value)} style={S.demoInput} />
          <p style={S.demoHint}>{d.passwordHint}</p>
          {error && <div style={S.demoError} role="alert">{error}</div>}
          <button type="submit" disabled={busy || !password}
            style={{ ...S.demoEnter, ...(busy || !password ? S.demoEnterOff : null) }}>
            {busy ? d.entering : d.enter}
          </button>
        </form>
      )}
      <p style={S.demoBack}><a href="../" style={S.demoBackLink}>{d.back}</a></p>
    </section>
  );
}

export default function App() {
  const [themePref, setThemePref] = useTheme();
  const [lang, setLang] = useState(() => openingLang(null));
  const [tab, setTab] = useState(() => screenForHash() ?? FIRST);
  const [who, setWho] = useState(undefined);   // undefined = still asking
  const [offline, setOffline] = useState(false);
  const [suspended, setSuspended] = useState(null);
  // Set when this copy is the demo (served under /demo/): what /demo/status says.
  const [demo, setDemo] = useState(null);
  // For someone who has not signed in: which parts of the campus are open.
  const [visitors, setVisitors] = useState(CLOSED);
  const t = T[lang];
  // Before any screen below asks the server for anything.
  showLang(lang);

  useEffect(() => { document.title = TITLE[lang] ?? TITLE.tr; }, [lang]);

  /* A language picked with the switch is the person's: this browser keeps it,
     and so does the account. */
  const chooseLang = (next) => {
    pickLang(next);
    setLang(next);
    if (who) tellLocale(next, true);
  };

  /* The bar shows the person's avatar and whether a change is waiting, so it
     is read again after the profile screen changes something. */
  const refreshMe = async () => {
    try {
      const fresh = await get("/me");
      setWho((w) => (w ? { ...w, ...fresh } : w));
    } catch { /* the bar keeps what it had */ }
  };

  /* One probe answers three questions at once: is there a server, is this
     person signed in, and what may they open. Everything downstream reads the
     result. */
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const status = await get("/demo/status");
        if (!stop && status?.demo) setDemo(status);
      } catch { /* an older server, or none: not the demo */ }
      try {
        const me = await get("/me");
        if (stop) return;
        let roles = { author: false, admin: false };
        try {
          // Two probes that are allowed to fail: a student gets 403 from both
          // and simply does not see those tabs.
          await get("/authoring/drafts?mine=true");
          roles.author = true;
        } catch { /* not an author */ }
        try {
          await get("/admin/units/tree");
          roles.admin = true;
        } catch { /* not an administrator */ }
        // The account's pick wins; without one the browser decides, and the
        // account follows it.
        const shown = openingLang(me);
        setLang(shown);
        if (!me.locale_chosen && me.account_locale !== shown) tellLocale(shown, false);
        setWho({ ...me, ...roles });
      } catch (err) {
        if (stop) return;
        if (err.status === 403 && err.detail?.code === "suspended") {
          setSuspended(err.detail); setWho(null);
        } else if (err.status === 401) {
          // Signed out: what the campus shows to visitors, before the first
          // screen is drawn.
          try {
            const open = await get("/public/campus");
            if (!stop) setVisitors({ ...CLOSED, ...open });
          } catch { /* everything stays closed */ }
          if (!stop) setWho(null);
        } else { setOffline(true); setWho(null); }
      }
    })();
    return () => { stop = true; };
  }, []);

  /* A visitor's screen heard that a part closed: ask again what is open. */
  useEffect(() => {
    if (who !== null || demo) return undefined;
    const ask = () => get("/public/campus")
      .then((open) => setVisitors({ ...CLOSED, ...open }))
      .catch(() => setVisitors(CLOSED));
    window.addEventListener("yazem:visitors", ask);
    return () => window.removeEventListener("yazem:visitors", ask);
  }, [who, demo]);

  /* Typing an address, or using the back button after having done so. */
  useEffect(() => {
    const onHash = () => setTab(screenForHash() ?? FIRST);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (key) => {
    const entry = NAV.find((n) => n.key === key);
    // Keep the address in step, so a screen reached by typing can be
    // bookmarked and the back button behaves. Choosing a screen from the bar
    // opens it at its start, so the address loses anything after the name and
    // the screen hears about it.
    const next = entry?.hash ? `#${entry.hash}` : "";
    if ((window.location.hash || "") !== next) {
      if (next && key === tab) window.location.hash = entry.hash;
      else window.history.replaceState(null, "", next || window.location.pathname);
    }
    // Another screen opens at its top, not where the last one was left.
    if (key !== tab) window.scrollTo(0, 0);
    // A visitor moving between screens asks again what is open. The browser
    // may keep the campus's answers for a minute or two, so a part closed
    // meanwhile would otherwise go on showing from what it kept.
    if (who === null && !demo) window.dispatchEvent(new Event("yazem:visitors"));
    setTab(key);
  };

  const signOut = async () => {
    try { await fetch(`${API}/auth/sign-out`, { method: "POST", credentials: "include" }); }
    catch { /* going anyway */ }
    window.location.reload();
  };
  /* Leaving the demo ends this browser's visit and goes back to the platform. */
  const leaveDemo = async () => {
    try { await fetch(`${API}/auth/sign-out`, { method: "POST", credentials: "include" }); }
    catch { /* going anyway */ }
    window.location.href = "../";
  };

  if (who === undefined) {
    return <div style={S.splash}><span style={S.splashText}>{t.loading}</span></div>;
  }

  if (suspended) {
    return (
      <>
        <style>{CSS}</style>
        <SuspendedNotice lang={lang} info={suspended} onSignOut={signOut} />
      </>
    );
  }

  // The demo's door: its password and the made-up person to be.
  if (who === null && demo) {
    return (
      <div style={S.root}>
        <style>{CSS}</style>
        <Brand lang={lang} />
        <div style={S.doorBar}>
          <ThemeSwitch pref={themePref} onPref={setThemePref} lang={lang} />
          <LangSwitch lang={lang} onLang={chooseLang} className="door-lang" />
        </div>
        <main style={S.main}><DemoDoor lang={lang} status={demo} /></main>
        <div style={S.footWrap}><Colophon lang={lang} /></div>
      </div>
    );
  }

  // Signed out, or no server. The campus, and the ranking while it is open,
  // can be looked at without signing in, as far as the administrators leave
  // them open, and how the platform works can always be read. Everything else
  // starts at the door, which the student screen owns.
  if (who === null) {
    const seen = Object.entries(VISITOR_TABS)
      .filter(([, part]) => part === null || visitors[part]).map(([key]) => key);
    if (seen.includes(tab)) {
      const tabs = NAV.filter((n) => seen.includes(n.key));
      return (
        <div style={S.root}>
          <style>{CSS}</style>
          {offline && <div style={S.offline}>{t.offline}</div>}
          <Brand lang={lang} />
          <nav style={S.bar} data-panel="visitor-bar">
            <div style={S.barInner} className="bar-inner">
              <div style={S.tabs} className="nav-tabs">
                {tabs.map((n) => (
                  <button key={n.key} onClick={() => go(n.key)} className="nav-tab"
                    data-tab={n.key}
                    style={{ ...S.tab, ...(tab === n.key ? S.tabOn : null) }}>
                    <span style={S.tabIcon}>{n.icon}</span>
                    <span style={S.tabLabel} className="nav-label">{n[lang]}</span>
                  </button>
                ))}
                {/* On a phone the way in is a tab of its own. */}
                <button onClick={() => go(FIRST)} className="nav-tab nav-signin-tab"
                  data-action="visitor-sign-in-tab" style={S.tab}>
                  <span style={S.tabIcon}>🔑</span>
                  <span style={S.tabLabel} className="nav-label">{t.signInShort}</span>
                </button>
              </div>
              <div style={S.barRight}>
                <ThemeSwitch pref={themePref} onPref={setThemePref} lang={lang}
                  className="nav-theme" />
                <LangSwitch lang={lang} onLang={chooseLang} />
                <button onClick={() => go(FIRST)} style={S.signIn} className="nav-signin"
                  data-action="visitor-sign-in">{t.signIn}</button>
              </div>
            </div>
          </nav>
          <div style={S.visitorTools} className="visitor-tools">
            <ThemeSwitch pref={themePref} onPref={setThemePref} lang={lang} />
            <LangSwitch lang={lang} onLang={chooseLang} className="door-lang" />
          </div>
          <main style={S.main}>
            {tab === "map" && (
              <CampusPlan key={lang} lang={lang} onLang={chooseLang} embedded
                themePref={themePref} visitor={visitors} />
            )}
            {tab === "board" && (
              <Board key={lang} lang={lang} onLang={chooseLang} embedded visitor />
            )}
            {tab === "about" && <About key={lang} lang={lang} standalone />}
          </main>
          <div style={S.footWrap}><Colophon lang={lang} /></div>
        </div>
      );
    }
    return (
      <>
        <style>{CSS}</style>
        {offline && <div style={S.offline}>{t.offline}</div>}
        <StudentApp lang={lang} onLang={chooseLang} themePref={themePref} onTheme={setThemePref} />
      </>
    );
  }

  const allowed = NAV.filter((n) => !n.needs || who[n.needs]);
  const current = allowed.some((n) => n.key === tab) ? tab : FIRST;
  /* An unlisted screen appears in the bar while it is open, so a person who
     typed its address can see where they are and find their way back. */
  const visible = allowed.filter((n) => !n.unlisted || n.key === current
    || (demo && n.key === "admin"));

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {demo && (
        <div style={S.demoStrip} data-panel="demo-strip" role="note">
          <span style={S.demoText}>{(D[lang] ?? D.tr).strip}</span>
          <span style={S.demoActions}>
            <button onClick={signOut} style={S.demoBtn} data-action="demo-switch">
              {(D[lang] ?? D.tr).switchRole}</button>
            <button onClick={leaveDemo} style={S.demoBtn} data-action="demo-leave">
              {(D[lang] ?? D.tr).leave}</button>
          </span>
        </div>
      )}

      {/* The brand header sits above the tab row, so the tabs keep their full
          width on a phone. */}
      <Brand lang={lang} />

      <nav style={S.bar}>
        <div style={S.barInner} className="bar-inner">
          <div style={S.tabs} className="nav-tabs">
            {visible.map((n) => (
              <button key={n.key} onClick={() => go(n.key)} className="nav-tab"
                style={{ ...S.tab, ...(current === n.key ? S.tabOn : null) }}>
                <span style={S.tabIcon}>{n.icon}</span>
                <span style={S.tabLabel} className="nav-label">{n[lang]}</span>
              </button>
            ))}
          </div>
          <div style={S.barRight}>
            <button onClick={() => go("profile")} style={S.me} data-action="profile"
              title={t.profile} aria-label={t.profile}>
              <Avatar code={who.profile?.avatar}
                label={[who.profile?.given_name, who.profile?.family_name].filter(Boolean).join(" ")
                       || who.profile?.username || "?"} size={30} />
              {who.profile?.waiting && <span style={S.meDot} title={t.waiting} />}
            </button>
            <a href="#hakkinda/rehber" style={S.help} className="nav-help" data-action="guide"
              title={t.guide} aria-label={t.guide}>?</a>
            <ThemeSwitch pref={themePref} onPref={setThemePref} lang={lang} className="nav-theme" />
            <LangSwitch lang={lang} onLang={chooseLang} />
            <button onClick={signOut} style={S.signOut} className="nav-signout">{t.signOut}</button>
          </div>
        </div>
      </nav>

      <main style={S.main}>
        {/* Each screen mounts only while selected and loads its own data on
            mount, so returning to a screen shows fresh numbers. */}
        {current === "twin" && (
          <StudentApp lang={lang} onLang={chooseLang} embedded section="twin" />
        )}
        {current === "cases" && (
          <StudentApp lang={lang} onLang={chooseLang} embedded section="cases" />
        )}
        {/* The map and the board name places and units in the language on
            screen, so they are read again when it changes. */}
        {current === "map" && (
          <CampusPlan key={lang} lang={lang} onLang={chooseLang} embedded themePref={themePref} />
        )}
        {current === "board" && <Board key={lang} lang={lang} onLang={chooseLang} embedded />}
        {current === "profile" && (
          <ProfileScreen lang={lang} onLang={chooseLang} onChanged={refreshMe} onSignOut={signOut}
            themePref={themePref} onTheme={setThemePref} />
        )}
        {current === "write" && <CaseEditor lang={lang} embedded />}
        {current === "about" && <About key={lang} lang={lang} />}
        {current === "admin" && <AdminPanel lang={lang} onLang={chooseLang} embedded />}
      </main>

      {/* Carried once, by the shell, for every screen. */}
      <div style={S.footWrap}><Colophon lang={lang} /></div>
    </div>
  );
}

const CSS = `${THEME_CSS}
* { box-sizing: border-box; }
html, body { margin: 0; background: ${PAPER}; font-family: ${DISPLAY}; color: ${TEXT}; }
button { font-family: inherit; }
button:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
.brand-short { display: none; }
/* The way in for visitors: a button at the right of the bar, or on a phone a
   tab of its own, with the switches in a row under the bar. */
.nav-signin-tab, .visitor-tools { display: none !important; }
/* On a phone the bar carries a single short line, the tabs share the width
   with the label under the icon, and the language and signing out move to the
   profile screen, so every tab fits beside the avatar. */
@media (max-width: 720px) {
  .brand-inner { padding: 8px 12px !important; gap: 10px !important; }
  .brand-logo { height: 24px !important; }
  .brand-long, .brand-sub { display: none; }
  .brand-short { display: block; white-space: nowrap; overflow: hidden;
                 text-overflow: ellipsis; font-size: 15px; }
  .bar-inner { padding: 0 8px !important; gap: 6px !important; }
  .nav-tabs { flex: 1; min-width: 0; }
  .nav-tab { flex: 1 1 0; min-width: 0; flex-direction: column; gap: 3px !important;
             padding: 7px 3px 6px !important; min-height: 54px !important; }
  .nav-label { font-size: 11px; white-space: nowrap; }
  .nav-lang, .nav-signout, .nav-theme, .nav-signin, .nav-help { display: none !important; }
  .nav-signin-tab { display: flex !important; }
  .visitor-tools { display: flex !important; }
}
`;

const S = {
  /* Quiet on purpose: the marks identify the system and stay in the
     background of every screen they sit on. */
  colophon: { display: "grid", gap: 7, justifyItems: "center", textAlign: "center",
              marginTop: 24, paddingTop: 16, borderTop: `1px solid ${LINE}`,
              opacity: 0.78 },
  colophonCompact: { display: "grid", gap: 6, justifyItems: "center",
                     textAlign: "center", marginTop: 16, paddingTop: 12,
                     borderTop: `1px solid ${LINE}`, opacity: 0.7 },
  colophonMarks: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                   justifyContent: "center" },
  markWide: { height: 22, width: "auto" },
  markSeal: { height: 22, width: "auto" },
  colophonName: { fontSize: 10.5, color: MUTED, lineHeight: 1.45, maxWidth: "52ch" },
  colophonSep: { color: LINE },
  credits: { display: "grid", gap: 1, marginTop: 2 },
  creditsCap: { fontSize: 11, fontWeight: 600, color: MUTED, marginBottom: 2 },
  creditRow: { display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap",
               alignItems: "baseline" },
  creditName: { fontSize: 11, fontWeight: 600, color: MUTED },
  creditRole: { fontSize: 10.5, color: MUTED },
  root: { minHeight: "100vh", background: PAPER },
  splash: { minHeight: "100vh", display: "grid", placeItems: "center",
            background: PAPER, fontFamily: DISPLAY, color: MUTED, fontSize: 13 },
  splashText: { opacity: 0.8 },
  offline: { fontFamily: DISPLAY, fontSize: 13, color: "var(--warn-text)", background: "var(--warn-soft)",
             borderBottom: "1px solid var(--warn)", padding: "10px 18px", textAlign: "center" },

  brand: { background: CARD, borderBottom: `1px solid ${LINE}` },
  brandInner: { maxWidth: 1180, margin: "0 auto", padding: "12px 14px",
                display: "flex", alignItems: "center", gap: 14 },
  brandWide: { height: 30, width: "auto", flexShrink: 0 },
  brandText: { flex: 1, minWidth: 0 },
  brandTitle: { fontSize: 16, fontWeight: 700, letterSpacing: "-.01em",
                color: TEXT, lineHeight: 1.2 },
  brandSub: { fontSize: 11.5, color: MUTED, lineHeight: 1.35, marginTop: 1 },
  brandSeal: { height: 30, width: "auto", flexShrink: 0 },

  bar: { position: "sticky", top: 0, zIndex: 20, background: CARD,
         borderBottom: `1px solid ${LINE}` },
  barInner: { maxWidth: 1180, margin: "0 auto", padding: "0 14px", display: "flex",
              alignItems: "center", justifyContent: "space-between", gap: 12 },
  tabs: { display: "flex", gap: 2, overflowX: "auto" },
  tab: { display: "flex", alignItems: "center", gap: 7, padding: "13px 14px",
         minHeight: 50, background: "none", border: "none",
         borderBottom: "2px solid transparent", color: MUTED, fontSize: 14,
         // Repeated as a longhand so that leaving the "on" style resets it.
         borderBottomColor: "transparent",
         cursor: "pointer", whiteSpace: "nowrap", fontFamily: DISPLAY },
  tabOn: { color: TEXT, borderBottomColor: ACCENT, fontWeight: 600 },
  tabIcon: { fontFamily: EMOJI, fontSize: 16, lineHeight: 1 },
  tabLabel: {},
  barRight: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  seg: { display: "flex", border: `1px solid ${LINE}`, borderRadius: 7, overflow: "hidden" },
  segBtn: { padding: "6px 10px", minHeight: 34, background: "none", border: "none",
            color: MUTED, fontFamily: DISPLAY, fontSize: 12, fontWeight: 600, cursor: "pointer" },
  segOn: { background: "var(--fill)", color: TEXT },
  me: { position: "relative", display: "inline-flex", alignItems: "center", padding: 2,
        minHeight: 34, border: "none", background: "none", borderRadius: 99, cursor: "pointer" },
  meDot: { position: "absolute", top: 1, right: 0, width: 9, height: 9, borderRadius: 99,
           background: "var(--amber)", border: `2px solid ${CARD}` },
  help: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32,
          height: 32, borderRadius: 99, border: `1px solid ${LINE}`, color: TEXT,
          fontSize: 15, fontWeight: 700, textDecoration: "none", flexShrink: 0 },
  signOut: { padding: "7px 12px", minHeight: 34, borderRadius: 7,
             border: `1px solid ${LINE}`, background: CARD, color: MUTED,
             fontSize: 12.5, cursor: "pointer", fontFamily: DISPLAY },

  main: { minHeight: "calc(100vh - 51px)" },

  demoStrip: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
               flexWrap: "wrap", padding: "8px 14px", background: "var(--strip)", color: "var(--on-strip)",
               fontFamily: DISPLAY, fontSize: 13 },
  demoText: { lineHeight: 1.45, textAlign: "center" },
  demoActions: { display: "inline-flex", gap: 8, flexWrap: "wrap" },
  demoBtn: { padding: "5px 11px", minHeight: 30, borderRadius: 6, border: "1px solid #FFFFFF66",
             background: "transparent", color: "#FFFFFF", fontSize: 12.5, cursor: "pointer",
             fontFamily: DISPLAY },
  demoDoor: { maxWidth: 760, margin: "0 auto", padding: "18px 16px 8px", fontFamily: DISPLAY },
  demoTitle: { fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", margin: "6px 0 8px",
               color: TEXT },
  demoLede: { fontSize: 15.5, lineHeight: 1.55, color: TEXT, margin: "0 0 10px", maxWidth: "62ch" },
  demoFacts: { display: "flex", gap: "4px 18px", flexWrap: "wrap", fontSize: 13, color: MUTED,
               margin: "0 0 18px" },
  demoNote: { padding: "12px 14px", borderRadius: 8, background: "var(--warn-soft)",
              border: "1px solid var(--warn)", color: "var(--warn-text)", fontSize: 14, margin: "10px 0" },
  demoLabel: { display: "block", fontSize: 13.5, fontWeight: 600, color: TEXT, margin: "16px 0 8px" },
  demoPeople: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 },
  demoPerson: { display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left", padding: 12,
                borderRadius: 10, border: `1px solid ${LINE}`, background: CARD, cursor: "pointer",
                fontFamily: DISPLAY, color: TEXT },
  demoPersonOn: { borderColor: ACCENT, boxShadow: `0 0 0 2px color-mix(in srgb, ${ACCENT} 20%, transparent)` },
  demoPersonText: { display: "grid", gap: 2, minWidth: 0 },
  demoRole: { fontSize: 11.5, fontWeight: 700, color: ACCENT, textTransform: "uppercase",
              letterSpacing: ".04em" },
  demoName: { fontSize: 15, fontWeight: 700 },
  demoUnit: { fontSize: 12.5, color: MUTED },
  demoAbout: { fontSize: 12.5, color: TEXT, lineHeight: 1.45, marginTop: 4 },
  demoInput: { width: "100%", maxWidth: 360, padding: "11px 12px", fontSize: 16, borderRadius: 8,
               border: `1px solid ${LINE}`, background: CARD, fontFamily: DISPLAY },
  demoHint: { fontSize: 12.5, color: MUTED, margin: "6px 0 10px" },
  demoError: { padding: "10px 12px", borderRadius: 8, background: "var(--accent-soft)",
               border: `1px solid ${ACCENT}`, color: ACCENT, fontSize: 13.5, margin: "6px 0 10px",
               maxWidth: 360 },
  demoEnter: { padding: "12px 22px", minHeight: 46, borderRadius: 8, border: "none",
               background: ACCENT, color: "var(--on-accent)", fontSize: 15, fontWeight: 700,
               cursor: "pointer", fontFamily: DISPLAY },
  demoEnterOff: { opacity: 0.45, cursor: "default" },
  demoBack: { margin: "22px 0 0", fontSize: 13.5 },
  demoBackLink: { color: ACCENT },
  doorBar: { maxWidth: 820, margin: "0 auto", padding: "12px 16px 0", display: "flex",
             justifyContent: "flex-end", gap: 8 },
  signIn: { padding: "7px 14px", minHeight: 34, borderRadius: 7, border: "none",
            background: ACCENT, color: "var(--on-accent)", fontSize: 13, fontWeight: 700,
            cursor: "pointer", fontFamily: DISPLAY, whiteSpace: "nowrap" },
  /* On a phone the bar has room for the tabs only; the switches sit below it. */
  visitorTools: { maxWidth: 1180, margin: "0 auto", padding: "10px 12px 0",
                  justifyContent: "flex-end", gap: 8 },
  footWrap: { maxWidth: 1180, margin: "0 auto", padding: "0 14px 28px" },
};
