import React, { useState, useMemo } from "react";
import { ArtImage } from "./badgeArt.jsx";
import { openingLang, pickLang, showLang } from "./language.js";
import { THEME_CSS } from "./theme.jsx";
import { CREDITS } from "./credits.js";
import { PLATFORM_MARKS } from "./marks.js";

/* ---------------------------------------------------------------------------
   Institutional marks.

   Embedded, so each screen ships as one file that can be dropped into any
   host. Both are quantised to a few kilobytes; they are two-ink marks, so the
   small palette costs nothing visible.

   The wordmark has a transparent background, so it sits directly on the page.
   --------------------------------------------------------------------------- */

const LOGO_AIARC = "data:image/png;base64,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";

const LOGO_SDU = "data:image/png;base64,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";

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

/* ---------------------------------------------------------------------------
   The badge.

   Every part reads how well someone performed:

     * A crest for the level.
     * An emblem for each of the seven areas, at one of four area levels. An
       area level needs a θ the twin has reached and enough attempts for that
       θ to mean anything; the attempt count is a floor under the evidence.
     * Six rare marks, each tied to a behaviour that repetition cannot
       produce. Administrators may add marks and medals of their own.

   4^7 area level arrangements × 2^6 marks, before the level.
   --------------------------------------------------------------------------- */

const INK = "var(--text)";
const PAPER = "var(--paper)";
const CARD = "var(--card)";
const LINE = "var(--line)";
const TEXT = "var(--text)";
const MUTED = "var(--muted)";
// The seal red: this is a crest, and a crest should carry the brighter mark.
const ACCENT = "var(--brand)";
const GOOD = "var(--good)";
const DISPLAY = "'Archivo', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* Tier label colours: ink, then a deeper cut, then colour. Colour is kept for
   the top tier, so it stays visibly rare. */
const TIER_INK = ["var(--line-strong)", "var(--text-2)", "var(--text-2)", ACCENT];

export const DIMS = [
  { key: "verification",  tr: "Doğrulama",        en: "Verification",   glyph: "lens" },
  { key: "privacy",       tr: "Mahremiyet",       en: "Privacy",        glyph: "keyhole" },
  { key: "prompt_design", tr: "İstem Tasarımı",   en: "Prompt Design",  glyph: "brief" },
  { key: "integrity",     tr: "Atıf",             en: "Citation",       glyph: "cite" },
  { key: "manipulation",  tr: "Manipülasyon",     en: "Manipulation",   glyph: "level" },
  { key: "op_security",   tr: "Kurumsal Güvenlik",en: "Institutional",  glyph: "lock" },
  { key: "boundaries",    tr: "Sınırlar",         en: "Limits",         glyph: "edge" },
];

/* A tier is a claim about ability, so it needs both a θ and enough attempts for
   that θ to be more than noise. At roughly one step per dimension per week the
   top tier is about a year away. */
export const TIERS = [
  { tier: 1, theta: 1.2, attempts: 10, tr: "Temel",  en: "Basic" },
  { tier: 2, theta: 1.8, attempts: 25, tr: "Sağlam", en: "Solid" },
  { tier: 3, theta: 2.4, attempts: 50, tr: "Usta",   en: "Expert" },
];

export function tierFor(theta, attempts) {
  let t = 0;
  for (const r of TIERS) if (theta >= r.theta && attempts >= r.attempts) t = r.tier;
  return t;
}

export const LEVELS = [
  { level: 1, tr: "Başlangıç",  en: "Newcomer",  dims: 1, theta: -0.5, cases: 0 },
  { level: 2, tr: "Uygulayıcı", en: "Practised", dims: 3, theta: 0.0,  cases: 12 },
  { level: 3, tr: "Denetleyen", en: "Reviewer",  dims: 5, theta: 0.5,  cases: 30, brier: 0.20 },
  { level: 4, tr: "Yetkin",     en: "Capable",   dims: 6, theta: 1.0,  cases: 60, brier: 0.15 },
  { level: 5, tr: "Rehber",     en: "Guide",     dims: 7, theta: 1.5,  cases: 100, brier: 0.12 },
];

/* Rare marks that come with the platform. Each is a shape of performance, and
   none of them arrives by doing more of the same. */
export const MARKS = PLATFORM_MARKS;

function calibrationBand(brier) {
  if (brier == null) return { key: "unknown", dash: "2 4", rings: 1 };
  if (brier <= 0.10) return { key: "sharp",  dash: null,  rings: 2 };
  if (brier <= 0.18) return { key: "steady", dash: null,  rings: 1 };
  if (brier <= 0.26) return { key: "loose",  dash: "7 4", rings: 1 };
  return { key: "broken", dash: "2 4", rings: 1 };
}

const CAL_LABEL = {
  tr: { unknown: "ölçülmedi", sharp: "çok iyi", steady: "iyi", loose: "zayıf", broken: "çok zayıf" },
  en: { unknown: "not measured", sharp: "sharp", steady: "steady", loose: "loose", broken: "broken" },
};

/* --------------------------------------------------------------------------
   Bench. Seven θ sliders and an attempt count: everything else is derived, so
   the screen shows how what a person did shapes their badge.
   -------------------------------------------------------------------------- */

const START = Object.fromEntries(DIMS.map((d) => [d.key, { theta: 0.4, n: 12 }]));

export default function BadgeBench() {
  const [lang, setOwnLang] = useState(() => openingLang(null));
  showLang(lang);
  const setLang = (next) => { pickLang(next); setOwnLang(next); };
  const [twin, setTwin] = useState(START);
  const [brier, setBrier] = useState(0.16);
  const [marks, setMarks] = useState(["blind_spot"]);

  const derived = useMemo(() => {
    const tiers = Object.fromEntries(
      DIMS.map((d) => [d.key, tierFor(twin[d.key].theta, twin[d.key].n)]));
    const values = DIMS.map((d) => twin[d.key].theta);
    const cases = Math.round(DIMS.reduce((a, d) => a + twin[d.key].n, 0) / 3);
    const meets = (r) =>
      values.filter((v) => v >= r.theta).length >= r.dims && cases >= r.cases
      && (r.brier == null || brier <= r.brier);
    const level = (LEVELS.filter(meets).pop() ?? LEVELS[0]).level;
    const spread = Math.max(...values) - Math.min(...values);
    return { tiers, level, cases, spread,
             set: Object.values(tiers).filter((t) => t === 3).length,
             touched: Object.values(tiers).filter((t) => t > 0).length };
  }, [twin, brier]);

  const rule = LEVELS.find((l) => l.level === derived.level);
  const cal = calibrationBand(brier);

  const setDim = (key, patch) =>
    setTwin((t) => ({ ...t, [key]: { ...t[key], ...patch } }));
  const toggleMark = (code) =>
    setMarks((m) => (m.includes(code) ? m.filter((x) => x !== code) : [...m, code]));

  const combos = Math.pow(4, 7) * Math.pow(2, MARKS.length);

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      <header style={S.header}>
        <div>
          <div style={S.eyebrow}>YAZEM · TASARIM</div>
          <h1 style={S.h1}>Rozet</h1>
        </div>
        <div style={S.seg}>
          {["tr", "en"].map((l) => (
            <button key={l} onClick={() => setLang(l)}
              style={{ ...S.segBtn, ...(lang === l ? S.segOn : null) }}>{l.toUpperCase()}</button>
          ))}
        </div>
      </header>

      <p style={S.lede}>
        {lang === "tr"
          ? "Rozetin üç ana parçası var: Seviyeni gösteren arma, her alanın seviyesini gösteren amblem ve nadir işaretler. Bir alanda ilerledikçe o alanın amblemi açılır ve alan seviyesi yükselir. Nadir işaretleri kazanmak kolay değil. Yönetimin eklediği madalyalar da rozette yer alır."
          : "Your badge has three main parts: a crest for your level, an emblem showing each area's level and the rare marks. As you get better in an area, its emblem opens and its area level rises. The rare marks do not come easily. Medals the administrators add appear on the badge too."}
      </p>

      <div style={S.split}>
        <section style={{ ...S.card, textAlign: "center" }}>
          <div style={S.stage}>
            <ArtImage kind="level" k={derived.level} size={200}
              alt={`${lang === "tr" ? "Seviye" : "Level"} ${derived.level}, ${rule[lang]}`} />
          </div>
          <div style={S.strip} data-panel="area-strip">
            {DIMS.map((d) => (
              <ArtImage key={d.key} kind="dim" k={d.key} size={40}
                locked={!derived.tiers[d.key]} alt={d[lang]} />
            ))}
          </div>
          {marks.length > 0 && (
            <div style={S.strip} data-panel="mark-strip">
              {MARKS.filter((m) => marks.includes(m.code)).map((m) => (
                <ArtImage key={m.code} kind="mark" k={m.code} size={40} alt={m[lang]} />
              ))}
            </div>
          )}
          <div style={S.readout}>
            <div>
              <div style={S.readNum}>{derived.level}</div>
              <div style={S.readCap}>{rule[lang]}</div>
            </div>
            <div style={S.readSplit} />
            <div>
              <div style={S.readNum}>{derived.touched}<span style={S.readOf}>/7</span></div>
              <div style={S.readCap}>{lang === "tr" ? "alanda amblem kazanıldı" : "areas with an emblem"}</div>
            </div>
            <div style={S.readSplit} />
            <div>
              <div style={{ ...S.readNum, color: derived.set ? ACCENT : MUTED }}>
                {derived.set}<span style={S.readOf}>/7</span>
              </div>
              <div style={S.readCap}>{lang === "tr" ? "usta" : "expert"}</div>
            </div>
          </div>
          <div style={S.calLine}>
            {lang === "tr" ? "kendini tanıma" : "self-knowledge"}{" "}
            <b style={{ color: cal.key === "sharp" ? GOOD : cal.key === "broken" ? ACCENT : TEXT }}>
              {CAL_LABEL[lang][cal.key]}
            </b>
            {" · "}{derived.cases}{" "}
            {lang === "tr" ? "vaka" : "cases"}
          </div>
        </section>

        <section style={S.card}>
          <div style={S.cardHead}>{lang === "tr" ? "Alanlar" : "Areas"}</div>
          <p style={S.hint}>
            {lang === "tr"
              ? "Bir alandaki düzeyi ve çözülen adım sayısını değiştir. Alan seviyesi, seviye ve arma buna göre değişir."
              : "Change how you stand in an area and how many steps you have answered. The area level, the level and the crest follow."}
          </p>
          {DIMS.map((d) => {
            const cur = twin[d.key];
            const tier = derived.tiers[d.key];
            const next = TIERS.find((r) => r.tier === tier + 1);
            return (
              <div key={d.key} style={S.dimRow}>
                <div style={S.dimTop}>
                  <ArtImage kind="dim" k={d.key} size={34} locked={!tier} alt="" />
                  <span style={S.dimName}>{d[lang]}</span>
                  <span style={{ ...S.tierChip,
                                 color: tier ? TIER_INK[tier] : MUTED,
                                 borderColor: tier ? TIER_INK[tier] : LINE }}>
                    {tier ? TIERS[tier - 1][lang] : (lang === "tr" ? "henüz yok" : "not yet")}
                  </span>
                </div>
                <div style={S.dimControls}>
                  <input type="range" min="-1.5" max="3" step="0.1" value={cur.theta}
                    onChange={(e) => setDim(d.key, { theta: Number(e.target.value) })}
                    style={S.range} />
                  <span style={S.mono}>
                    {(lang === "tr" ? ["çok iyi", "iyi", "orta", "yeni"] : ["very good", "good", "fair", "new"])[
                      cur.theta >= 2.4 ? 0 : cur.theta >= 1.8 ? 1 : cur.theta >= 1.2 ? 2 : 3]}
                  </span>
                  <input type="range" min="0" max="70" step="1" value={cur.n}
                    onChange={(e) => setDim(d.key, { n: Number(e.target.value) })}
                    style={S.range} />
                  <span style={S.mono}>{cur.n} {lang === "tr" ? "adım" : "steps"}</span>
                </div>
                {next && (
                  <div style={S.nextTier}>
                    {lang === "tr"
                      ? `${next.tr} seviyesi için: ${
                          next.theta >= 2.4 ? "çok iyi" : next.theta >= 1.8 ? "iyi" : "orta"
                        } düzey · ${next.attempts} adım`
                      : `to reach ${next.en}: ${
                          next.theta >= 2.4 ? "very good" : next.theta >= 1.8 ? "good" : "fair"
                        } · ${next.attempts} steps`}
                  </div>
                )}
              </div>
            );
          })}

          <div style={S.cardHead}>{lang === "tr" ? "Kendini tanıma" : "Self-knowledge"}</div>
          <input type="range" min="0.02" max="0.40" step="0.01" value={brier}
            onChange={(e) => setBrier(Number(e.target.value))} style={S.range} />
          <div style={S.mono}>{CAL_LABEL[lang][cal.key]}</div>
        </section>
      </div>

      <section style={S.card}>
        <div style={S.cardHead}>{lang === "tr" ? "Nadir işaretler" : "Rare marks"}</div>
        <p style={S.hint}>
          {lang === "tr"
            ? "Bu işaretler çok vaka çözmekle kazanılmıyor. Her biri belirli bir çalışma biçiminin karşılığıdır."
            : "They do not come from solving more. Each one answers a way of working."}
        </p>
        <div style={S.markGrid}>
          {MARKS.map((m) => {
            const on = marks.includes(m.code);
            return (
              <button key={m.code} onClick={() => toggleMark(m.code)}
                style={{ ...S.markBtn, ...(on ? S.markOn : null) }}>
                <ArtImage kind="mark" k={m.code} size={44} locked={!on} alt="" />
                <span>
                  <span style={S.markName}>{m[lang]}</span>
                  <span style={S.markWhat}>{lang === "tr" ? m.trWhat : m.enWhat}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section style={S.card}>
        <div style={S.cardHead}>{lang === "tr" ? "Kaç farklı rozet" : "How many different badges"}</div>
        <div style={S.countRow}>
          <div>
            <div style={S.countNum}>{combos.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB")}</div>
            <div style={S.readCap}>
              {lang === "tr" ? "farklı rozet" : "different badges"}
            </div>
          </div>
          <p style={S.countNote}>
            {lang === "tr"
              ? "Yedi alanın her birinde dört durum (henüz yok, Temel, Sağlam, Usta) ve altı nadir işaret, bu kadar farklı rozet demek. İki kişinin rozetinin aynı olması neredeyse imkânsız."
              : "Seven areas with four states each (not yet, Basic, Solid, Expert), plus six rare marks. Two people ending up with the same badge is close to impossible."}
          </p>
        </div>
        <div style={S.gallery}>
          {[
            { level: 2, t: [1, 0, 1, 0, 0, 1, 0], m: [], b: 0.24 },
            { level: 3, t: [2, 1, 1, 2, 0, 1, 1], m: ["blind_spot"], b: 0.17 },
            { level: 4, t: [2, 3, 1, 2, 2, 2, 1], m: ["even_hand", "first_sight"], b: 0.13 },
            { level: 4, t: [1, 1, 3, 1, 3, 1, 2], m: ["honest_doubt"], b: 0.11 },
            { level: 5, t: [3, 2, 2, 3, 2, 3, 2], m: ["unshaken", "held_line", "even_hand"], b: 0.08 },
          ].map((g, i) => (
            <div key={i} style={S.galleryItem} data-gallery={i}>
              <ArtImage kind="level" k={g.level} size={92} alt="" />
              <div style={S.miniStrip}>
                {DIMS.map((d, k) => (
                  <ArtImage key={d.key} kind="dim" k={d.key} size={22} locked={!g.t[k]} alt="" />
                ))}
              </div>
              {g.m.length > 0 && (
                <div style={S.miniStrip}>
                  {g.m.map((c) => <ArtImage key={c} kind="mark" k={c} size={22} alt="" />)}
                </div>
              )}
            </div>
          ))}
        </div>
        <p style={S.hint}>
          {lang === "tr"
            ? "Beş kişi, beş ayrı yol."
            : "Five people, five different paths."}
        </p>
      </section>

      <p style={S.foot}>
        {lang === "tr"
          ? "Rozetin kazandığın işaretleri gösterir. Kötü geçen bir hafta, kazandığın bir işareti geri almaz."
          : "Your badge shows what you earned; a bad week does not take a mark back."}
      </p>

      <Colophon lang={lang} compact />
    </div>
  );
}

const CSS = `${THEME_CSS}
* { box-sizing: border-box; }
button, input { font-family: inherit; }
button:focus-visible, input:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }

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
  creditsCap: { fontFamily: MONO, fontSize: 9, letterSpacing: ".14em",
                textTransform: "uppercase", color: MUTED, marginBottom: 2 },
  creditRow: { display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap",
               alignItems: "baseline" },
  creditName: { fontSize: 11, fontWeight: 600, color: MUTED },
  creditRole: { fontSize: 10.5, color: MUTED },
  root: { maxWidth: 1080, margin: "0 auto", padding: "0 18px 40px", background: PAPER,
          minHeight: "100vh", color: TEXT, fontFamily: DISPLAY },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, padding: "22px 2px 10px" },
  eyebrow: { fontFamily: MONO, fontSize: 10, letterSpacing: ".18em", color: MUTED },
  h1: { margin: "5px 0 0", fontSize: 28, fontWeight: 700, letterSpacing: "-.03em" },
  seg: { display: "flex", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden",
         background: CARD },
  segBtn: { padding: "8px 12px", minHeight: 38, background: "none", border: "none",
            color: MUTED, fontFamily: MONO, fontSize: 12, cursor: "pointer" },
  segOn: { background: "var(--fill)", color: TEXT },
  lede: { maxWidth: "66ch", color: MUTED, fontSize: 15.5, lineHeight: 1.6, margin: "8px 2px 20px" },

  split: { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))",
           alignItems: "start" },
  card: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 20,
          marginBottom: 14 },
  cardHead: { fontFamily: MONO, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase",
              color: MUTED, margin: "18px 0 8px" },
  hint: { fontSize: 13, color: MUTED, lineHeight: 1.55, margin: "0 0 12px" },
  mono: { fontFamily: MONO, fontSize: 11.5, color: MUTED },

  stage: { display: "flex", justifyContent: "center", padding: "16px 0 10px" },
  strip: { display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  miniStrip: { display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap", maxWidth: 170,
               marginTop: 6 },
  readout: { display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
             paddingTop: 12, borderTop: `1px solid ${LINE}` },
  readSplit: { width: 1, height: 30, background: LINE },
  readNum: { fontFamily: MONO, fontSize: 25, fontWeight: 500, lineHeight: 1 },
  readOf: { fontSize: 14, color: MUTED },
  readCap: { fontFamily: MONO, fontSize: 10, color: MUTED, marginTop: 4, letterSpacing: ".05em" },
  calLine: { fontSize: 12.5, color: MUTED, marginTop: 12 },

  dimRow: { padding: "10px 0", borderBottom: `1px solid ${LINE}` },
  dimTop: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  dimName: { flex: 1, fontSize: 13.5, fontWeight: 600 },
  tierChip: { fontFamily: MONO, fontSize: 10, border: "1px solid", borderRadius: 99,
              padding: "1px 8px" },
  dimControls: { display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 8,
                 alignItems: "center" },
  nextTier: { fontFamily: MONO, fontSize: 10, color: MUTED, marginTop: 4 },
  // Muted, so the sliders read as controls.
  range: { width: "100%", accentColor: MUTED, minWidth: 60 },

  markGrid: { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" },
  markBtn: { display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 13px",
             borderRadius: 10, border: `1px solid ${LINE}`, borderColor: LINE,
             background: "var(--soft)", cursor: "pointer", color: TEXT, textAlign: "left" },
  markOn: { borderColor: INK, background: "var(--fill)" },
  markName: { display: "block", fontSize: 13.5, fontWeight: 700 },
  markWhat: { display: "block", fontSize: 12, color: MUTED, lineHeight: 1.45, marginTop: 2 },

  countRow: { display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap",
              marginBottom: 16 },
  countNum: { fontFamily: MONO, fontSize: 30, fontWeight: 500, color: ACCENT,
              letterSpacing: "-.02em" },
  countNote: { flex: 1, minWidth: 240, fontSize: 13, color: MUTED, lineHeight: 1.55, margin: 0 },
  gallery: { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
             justifyItems: "center", marginBottom: 12 },
  galleryItem: { padding: "6px 0", display: "flex", flexDirection: "column", alignItems: "center" },

  foot: { fontSize: 12.5, color: MUTED, lineHeight: 1.6, textAlign: "center",
          maxWidth: "72ch", margin: "8px auto 0" },
};
