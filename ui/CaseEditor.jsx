import React, { useState, useMemo, useEffect } from "react";
import { langHeaders, openingLang, showLang } from "./language.js";
import { THEME_CSS } from "./theme.jsx";
import { CREDITS } from "./credits.js";

/* ---------------------------------------------------------------------------
   Case editor.

   Part-time students write cases here, so the case bank is reachable from the
   product. Three rules keep the bank safe:

     * The validator's checks run on every keystroke, and the list of problems
       is always on screen.
     * A draft with problems can be saved and returned to, but cannot be
       submitted, so reviewers only see drafts that pass the checks.
     * Nothing reaches a student without a second person approving it, and the
       author cannot be that person.

   The screen opens on the drafts: the writer's own, those waiting for review
   and those approved. A case written here is edited in the form. A case that
   came from a file, or a new version of a live case, can hold fields the form
   does not know, so it is edited field by field or as YAML instead, and never
   passes through the form, which would drop what it cannot show.
   --------------------------------------------------------------------------- */

/* The interface language. CaseEditor sets it at the start of every render, so
   the helpers outside the components word themselves in the language on
   screen. The tables below hold their labels as [Turkish, English] pairs and
   are read through sayPair at render time. What an author writes is the
   case's own content and is shown as written. */
let LANG = "tr";
const say = (tr, en) => (LANG === "en" ? en : tr);
const sayPair = (pair) => (Array.isArray(pair) ? say(pair[0], pair[1]) : pair);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/* A number as it is written in the interface language: 0,6 or 0.6. */
const dec = (text) => (LANG === "en" ? String(text) : String(text).replace(".", ","));

/* ---------------------------------------------------------------------------
   The editor's connection to the server.

   The checks that run on every keystroke below are a convenience: they tell the
   writer what is wrong while they are still typing. The list the server returns
   on save is the one that decides whether a draft can be submitted, and it is
   produced by the same validator the repository uses. If the two ever disagree,
   the server is right.
   --------------------------------------------------------------------------- */

/* Where this application is served from.
 *
 * With its own domain it is "/". Behind a path — http://SERVER_IP/yzokuryazarlik/
 * — it is "/yzokuryazarlik/", and every request has to carry that prefix or it
 * lands on whatever else is at the root of that host.
 *
 * The base is read from the page, so the same built bundle works wherever it
 * is mounted.
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

const BASE = `${API}/authoring`;

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function call(path, { method = "GET", body, form } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method, credentials: "include",
      headers: body ? { "Content-Type": "application/json", ...langHeaders() } : langHeaders(),
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, say("Sunucuya ulaşılamadı.", "The server could not be reached."));
  }
  if (res.status === 204) return null;
  let payload = null;
  try { payload = await res.json(); } catch { payload = null; }
  if (!res.ok) throw new ApiError(res.status, detailText(payload?.detail, res.statusText));
  return payload;
}

/* The server's reason for a refusal as one line: FastAPI sends a string or a
   list of field errors. */
function detailText(detail, fallback) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return fallback;
}

/* The places on the campus map a case can be set in, named in the language on
   screen. Without a server the list is empty and the case simply has none. */
function usePlaces() {
  const [places, setPlaces] = useState([]);
  useEffect(() => {
    let stop = false;
    fetch(`${API}/map/places`, { credentials: "include", headers: langHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!stop && d?.places) setPlaces(d.places); })
      .catch(() => {});
    return () => { stop = true; };
  }, []);
  return places;
}

const drafts = {
  list: (mine) => call(`/drafts?mine=${mine ? "true" : "false"}`),
  read: (id) => call(`/drafts/${id}`),
  create: (case_key, locale, body) =>
    call("/drafts", { method: "POST", body: { case_key, locale, body } }),
  save: (id, body) => call(`/drafts/${id}`, { method: "PUT", body }),
  yaml: (id) => call(`/drafts/${id}/yaml`),
  saveYaml: (id, text) => call(`/drafts/${id}/yaml`, { method: "PUT", body: { text } }),
  discard: (id) => call(`/drafts/${id}/discard`, { method: "POST" }),
  revise: (key) => call(`/cases/${encodeURIComponent(key)}/revise`, { method: "POST" }),
  submit: (id) => call(`/drafts/${id}/submit`, { method: "POST" }),
  review: (id, approve, note) =>
    call(`/drafts/${id}/review`, { method: "POST", body: { approve, note } }),
  publish: (id) => call(`/drafts/${id}/publish`, { method: "POST" }),
  upload: (id, file, meta) => {
    const fd = new FormData();
    fd.append("upload", file);
    fd.append("title", meta.title);
    fd.append("release_at", meta.release_at ?? "with_case");
    if (meta.step_key) fd.append("step_key", meta.step_key);
    if (meta.caption) fd.append("caption", meta.caption);
    return call(`/drafts/${id}/files`, { method: "POST", form: fd });
  },
};

/* The case as the editor holds it, turned into what the server stores. The
   editor's own shape is convenient for forms; this is the case schema. */
function toBody(c) {
  return {
    schema_version: 1,
    id: c.key,
    title: c.title,
    type: c.type,
    status: "draft",
    faculty_scope: ["all"],
    estimated_minutes: c.minutes,
    language: c.language ?? "tr",
    author: c.author ?? "",
    reviewed_by: "",
    ...(c.type === "weekly"
      ? { publish_at: c.publish_at, close_at: c.close_at } : {}),
    // A building is stored as its number, as in the case files.
    ...(c.place ? { place: /^\d+$/.test(c.place) ? Number(c.place) : c.place } : {}),
    context: c.context,
    variants: c.variants,
    steps: c.steps.map((s) => ({
      id: s.id, kind: s.kind, dimension: s.dimension,
      points: s.points, confidence: s.kind === "branching" ? false : s.confidence,
      prompt: s.prompt,
      payload: payloadOf(s),
      answer: answerOf(s),
      feedback: { correct: s.feedbackOk, incorrect: s.feedbackNo },
    })),
    debrief: {
      summary: c.debrief.summary,
      per_step: Object.fromEntries(c.steps.map((s) => [s.id, s.feedbackOk || "—"])),
      takeaway: c.debrief.takeaway,
      sources: (c.debrief.sources || []).filter((x) => x.trim()),
    },
  };
}

function payloadOf(s) {
  switch (s.kind) {
    case "span_select":
      return { text: s.text, min_selections: 1, max_selections: 6 };
    case "source_verify":
      return { items: (s.items || []).map((i) => ({ id: i.id, citation: i.citation })) };
    case "pattern_check":
      return { seed_text: s.seed, max_chars: 600 };
    case "reasoned_choice":
      return { options: (s.options || []).map((o) => ({ id: o.id, text: o.text })),
               reasons: (s.reasons || []).map((r) => ({ id: r.id, text: r.text })) };
    case "branching":
      return { start: (s.nodes?.[0] || {}).id,
               nodes: (s.nodes || []).map((n) => n.terminal
                 ? { id: n.id, terminal: true, text: n.text }
                 : { id: n.id, text: n.text,
                     options: (n.options || []).map((o) => ({
                       id: o.id, text: o.text, next: o.next, outcome: o.outcome })) }) };
    default: return {};
  }
}

/* The reverse of toBody, for a draft that was written in this form. */
function fromBody(b) {
  return {
    key: b.id ?? "", title: b.title ?? "", type: b.type ?? "open",
    language: b.language ?? "tr",
    minutes: b.estimated_minutes ?? 13, author: b.author ?? "",
    publish_at: b.publish_at, close_at: b.close_at,
    place: b.place != null ? String(b.place) : "",
    context: b.context ?? "",
    variants: (b.variants ?? []).map((v) => ({ key: v.key, values: { ...(v.values ?? {}) } })),
    steps: (b.steps ?? []).map(stepFromBody),
    debrief: {
      summary: b.debrief?.summary ?? "", takeaway: b.debrief?.takeaway ?? "",
      sources: b.debrief?.sources?.length ? [...b.debrief.sources] : [""],
    },
  };
}

function stepFromBody(s) {
  const p = s.payload ?? {}, a = s.answer ?? {};
  const base = {
    ...BLANK_STEP(s.kind, 1), id: s.id, kind: s.kind, dimension: s.dimension,
    points: s.points, confidence: s.kind === "branching" ? false : !!s.confidence,
    prompt: s.prompt ?? "",
    feedbackOk: s.feedback?.correct ?? "", feedbackNo: s.feedback?.incorrect ?? "",
  };
  switch (s.kind) {
    case "span_select":
      return { ...base, text: p.text ?? "" };
    case "source_verify":
      return { ...base, items: (p.items ?? []).map((i) => ({
        id: i.id, citation: i.citation ?? "", exists: !!a.truth?.[i.id]?.exists,
        evidence: a.truth?.[i.id]?.evidence ?? "" })) };
    case "pattern_check":
      return { ...base, seed: p.seed_text ?? "",
        forbidden: (a.forbidden ?? []).map((r) => ({ pattern: r.pattern, label: r.label,
                                                      hard: !!r.hard_fail })),
        required: (a.required ?? []).map((r) => ({ pattern: r.pattern, label: r.label })) };
    case "reasoned_choice":
      return { ...base, correct: a.correct_option ?? "",
        options: (p.options ?? []).map((o) => ({ id: o.id, text: o.text })),
        reasons: (p.reasons ?? []).map((r) => ({ id: r.id, text: r.text,
                                                 weight: a.reason_weights?.[r.id] ?? 0 })) };
    case "branching":
      return { ...base, scoring: a.scoring ?? "path_min",
        nodes: (p.nodes ?? []).map((n) => (n.terminal
          ? { id: n.id, text: n.text ?? "", terminal: true, options: [] }
          : { id: n.id, text: n.text ?? "", terminal: false,
              options: (n.options ?? []).map((o) => ({ id: o.id, text: o.text ?? "",
                                                       next: o.next ?? "", outcome: o.outcome ?? 0 })) })) };
    default:
      return base;
  }
}

/* The same value written with its keys in one order, so two bodies can be
   compared whatever order their keys arrived in. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/* Whether the form can hold this body without losing anything. Only then is a
   draft opened in the form. */
function fitsTheForm(body) {
  try { return stable(toBody(fromBody(body))) === stable(body); }
  catch { return false; }
}

/* Everything a browser must never receive. It is assembled only on the way out
   to the server, and the server strips it again before any client sees a step. */
function answerOf(s) {
  switch (s.kind) {
    case "span_select":
      return { scoring: "f1", partial_credit: true, tolerance_chars: 3 };
    case "source_verify":
      return { scoring: "balanced_accuracy",
               truth: Object.fromEntries((s.items || []).map((i) =>
                 [i.id, { exists: !!i.exists, evidence: i.evidence || "" }])) };
    case "pattern_check":
      return { scoring: "all_or_partial",
               forbidden: (s.forbidden || []).map((r) => ({
                 pattern: r.pattern, label: r.label, ...(r.hard ? { hard_fail: true } : {}) })),
               required: (s.required || []).map((r) => ({ pattern: r.pattern, label: r.label })) };
    case "reasoned_choice":
      return { correct_option: s.correct, option_weight: 0.5,
               reason_weights: Object.fromEntries(
                 (s.reasons || []).map((r) => [r.id, Number(r.weight)])) };
    case "branching":
      return { scoring: s.scoring || "path_min" };
    default: return {};
  }
}

/* The icon set.
 *
 * Colour emoji, set at a fixed size with an explicit emoji font stack so a
 * Linux desktop, a Mac and an Android phone all draw the same colour glyph.
 *
 * The badge keeps its own drawn marks as an earned crest. Everywhere else
 * (case cards, tabs, step kinds, the sign-in fields) these are what a student
 * recognises without reading. */
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",' +
                   '"Twemoji Mozilla","EmojiOne Color",sans-serif';

const ICONS = {
  weekly: "📅", core: "📘", play: "▶️", file: "📎", flag: "🚩",
  spark: "✨", check: "✅", trophy: "🏆", scales: "⚖️", target: "🎯",
  clock: "⏱️", steps: "🧩", mail: "✉️", key: "🔑", person: "👤",
  unit: "🏛️", publish: "📣", chart: "📊", brief: "✍️", lock: "🛡️",
  lens: "🔍",
  // the seven areas
  verification: "🔍", privacy: "🔒", prompt_design: "✍️",
  integrity: "🔗", manipulation: "🎭", op_security: "🛡️", boundaries: "🚧",
};

function Icon({ name, size = 18, style }) {
  const glyph = ICONS[name];
  if (!glyph) return null;
  return (
    <span aria-hidden="true" style={{
      fontFamily: EMOJI_FONT,
      fontSize: size,
      lineHeight: 1,
      display: "inline-block",
      verticalAlign: "-.16em",
      flexShrink: 0,
      fontStyle: "normal",
      ...style,
    }}>{glyph}</span>
  );
}



const DIMENSIONS = [
  ["op_security", "Kurumsal Bilgi Güvenliği", "Institutional Information Security"],
  ["manipulation", "Manipülasyon Direnci", "Manipulation Resistance"],
  ["verification", "Doğrulama ve Halüsinasyon Tespiti", "Verification and Hallucination Detection"],
  ["privacy", "Veri Mahremiyeti", "Data Privacy"],
  ["prompt_design", "Görev ve İstem Tasarımı", "Task and Prompt Design"],
  ["integrity", "Atıf ve Akademik Dürüstlük", "Citation and Academic Integrity"],
  ["boundaries", "Sınır ve Yanlılık Bilinci", "Limits and Bias Awareness"],
];

const KINDS = [
  ["span_select", ["Metinde işaretleme", "Marking a text"],
   ["Kişi metin içinde ilgili yerleri seçer.", "The person selects the relevant places in a text."]],
  ["source_verify", ["Kaynak doğrulama", "Source verification"],
   ["Kişi künyelerin gerçek olup olmadığına karar verir.",
    "The person decides whether references are real."]],
  ["pattern_check", ["Metin yeniden yazma", "Rewriting a text"],
   ["Kişi bir metni kurallara uyacak şekilde yeniden yazar.",
    "The person rewrites a text so that it follows the rules."]],
  ["reasoned_choice", ["Gerekçeli seçim", "Reasoned choice"],
   ["Kişi bir seçenek ve bir gerekçe işaretler.", "The person marks an option and a reason."]],
  ["branching", ["Dallanan karar", "Branching decision"],
   ["Kişi birbirini izleyen kararlar verir.", "The person makes decisions one after another."]],
];

/* ---------------------------------------------------------------------------
   Institutional marks.

   Embedded, so every screen ships as one file that can be dropped into any
   host and the logos load with it. Both are quantised to a few kilobytes; as
   two-ink marks they need only a small palette.

   The wordmark has a transparent background so it sits directly on the page.
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

const KIND_ICON = {
  span_select: "target", source_verify: "check", pattern_check: "brief",
  reasoned_choice: "scales", branching: "steps",
};

const STATES = {
  draft: [["Taslak", "Draft"], "var(--muted)"],
  in_review: [["İncelemede", "In review"], "var(--warn)"],
  changes_requested: [["Düzeltme istendi", "Changes requested"], "var(--accent)"],
  approved: [["Onaylandı", "Approved"], "var(--good)"],
  published: [["Yayında", "Published"], "var(--good)"],
  retired: [["Kaldırıldı", "Set aside"], "var(--muted)"],
};

const ORIGIN = { editor: ["Yeni vaka", "New case"], import: ["Dosyadan", "From a file"],
                 revision: ["Yeni sürüm", "New version"],
                 translation: ["Yeni dil sürümü", "New language version"] };

const TYPE_LABEL = { open: ["Serbest", "Open"], weekly: ["Haftalık", "Weekly"],
                     core: ["Temel", "Core"] };
const ROLE_LABEL = { student: ["Öğrenci", "Students"], academic: ["Akademik", "Academic"],
                     admin_staff: ["İdari", "Admin staff"] };

const REPORT_KINDS = {
  answer_key: ["Cevap anahtarı yanlış", "The answer key is wrong"],
  source: ["Kaynak ya da künye hatalı", "A source or reference is wrong"],
  wording: ["Metin anlaşılmıyor", "The text is unclear"],
  technical: ["Teknik sorun", "A technical problem"],
  other: ["Diğer", "Other"],
};

/* The languages a case can be written in, by name, in the interface's words. */
const LANGUAGE_NAMES = { tr: ["Türkçe", "Turkish"], en: ["İngilizce", "English"] };
/* The heading of the other version's text under a field. */
const IN_LANGUAGE = { tr: ["Türkçesi", "In Turkish"], en: ["İngilizcesi", "In English"] };

/* The language a case is written in, as a short mark. */
function LangChip({ locale }) {
  if (locale !== "tr" && locale !== "en") return null;
  const name = locale === "en" ? say("İngilizce vaka", "Case in English")
                               : say("Türkçe vaka", "Case in Turkish");
  return (
    <span style={S.langChip} title={name} aria-label={name} data-case-lang={locale}>
      {locale.toUpperCase()}
    </span>
  );
}

/* --------------------------------------------------------------------------
   Validation. The same rules the server applies, run here so the writer sees
   them immediately; the server runs them again and its result decides.
   -------------------------------------------------------------------------- */

/* Each finding is written in both languages, the way the server sends its own:
   where and msg in Turkish, where_en and msg_en in English. The list on screen
   picks the language at render time, and two findings are the same finding
   when their Turkish text is the same. */
function checkCase(c) {
  const P = [];
  const add = (level) => ([where, whereEn], [msg, msgEn]) =>
    P.push({ level, where, msg, where_en: whereEn, msg_en: msgEn });
  const err = add("error");
  const warn = add("warn");

  if (!c.title?.trim()) err(["Başlık", "Title"], ["Başlık boş.", "The title is empty."]);
  if (!/^[a-z0-9][A-Za-z0-9-]{4,60}$/.test(c.key || ""))
    err(["Kimlik", "Key"],
        ["Kimlik küçük harf ya da rakamla başlamalı. Harf, rakam ve tire "
         + "kullanılabilir, boşluk kullanılamaz.",
         "The key must start with a lowercase letter or a digit. Letters, digits and "
         + "hyphens can be used, spaces cannot."]);
  if (c.type === "core" && !/^core-\d{2}-[a-z0-9-]+$/.test(c.key || ""))
    err(["Kimlik", "Key"], ["Temel vakanın kimliği core-NN-ad biçiminde olmalı.",
                            "A core case's key must take the form core-NN-name."]);
  if ((c.context || "").trim().length < 40)
    err(["Bağlam", "Context"],
        ["Bağlam en az birkaç cümle olmalı. Vaka bu metinle başlar.",
         "The context must be at least a few sentences. This is where the person enters the case."]);
  if (!c.steps.length)
    err(["Adımlar", "Steps"], ["En az bir adım gerekli.", "At least one step is needed."]);
  if (c.steps.length > 5)
    warn(["Adımlar", "Steps"], ["Beşten fazla adım on üç dakikaya sığmaz.",
                                "More than five steps do not fit into thirteen minutes."]);

  const ids = new Set();
  const dims = new Set();
  c.steps.forEach((s, i) => {
    const at = [`Adım ${i + 1}`, `Step ${i + 1}`];
    if (ids.has(s.id))
      err(at, [`Adım kimliği yinelenmiş: ${s.id}`, `Duplicate step id: ${s.id}`]);
    ids.add(s.id);
    dims.add(s.dimension);
    if (!s.prompt?.trim()) err(at, ["Yönerge boş.", "The prompt is empty."]);
    if (!(s.points >= 1 && s.points <= 10))
      err(at, ["Puan 1 ile 10 arasında olmalı.", "Points must be between 1 and 10."]);

    if (s.kind === "span_select") {
      const marks = (s.text || "").match(/\[\[.+?\]\]/gs) || [];
      if (!marks.length)
        err(at, ["İşaretlenecek yer yok. Doğru cevabı [[ ]] arasına al.",
                 "There is nothing to mark. Put the correct answer between [[ ]]."]);
      if (marks.length > 6)
        warn(at, ["Altıdan fazla hedef, adımı bulmacaya çevirir.",
                  "More than six targets turn the step into a puzzle."]);
      if ((s.text || "").trim().length < 30)
        err(at, ["Metin çok kısa.", "The text is too short."]);
    }
    if (s.kind === "source_verify") {
      const items = s.items || [];
      if (items.length < 3)
        err(at, ["En az üç künye gerekli.", "At least three references are needed."]);
      const real = items.filter((x) => x.exists).length;
      if (real === 0 || real === items.length)
        err(at, ["Künyelerin hepsi gerçek ya da hepsi uydurma olamaz. " +
                 "Öyle olursa her künyeye aynı cevabı veren tam puan alır.",
                 "The references cannot all be real or all be fabricated. " +
                 "If they are, giving every reference the same answer earns full points."]);
      items.forEach((x, k) => {
        if (!x.citation?.trim())
          err(at, [`${k + 1}. künye boş.`, `Reference ${k + 1} is empty.`]);
        if (!x.evidence?.trim())
          warn(at, [`${k + 1}. künye için açıklama yazılmamış, çözüm notunda bu künye açıklamasız kalır.`,
                    `Reference ${k + 1} has no explanation written, so the solution note shows none.`]);
      });
    }
    if (s.kind === "pattern_check") {
      if (!(s.forbidden || []).length && !(s.required || []).length)
        err(at, ["En az bir kural gerekli.", "At least one rule is needed."]);
      [...(s.forbidden || []), ...(s.required || [])].forEach((r) => {
        if (!r.label?.trim())
          err(at, ["Kural için etiket yazılmamış.", "A rule has no label."]);
        try { new RegExp(r.pattern); }
        catch {
          err(at, [`Kalıp okunamadı: ${r.pattern}`, `A pattern could not be read: ${r.pattern}`]);
        }
      });
      if (!(s.seed || "").trim())
        err(at, ["Başlangıç metni boş.", "The starting text is empty."]);
    }
    if (s.kind === "reasoned_choice") {
      if ((s.options || []).length < 3)
        err(at, ["En az üç seçenek gerekli.", "At least three options are needed."]);
      if ((s.reasons || []).length < 3)
        err(at, ["En az üç gerekçe gerekli.", "At least three reasons are needed."]);
      if (!s.correct)
        err(at, ["Doğru seçenek işaretlenmemiş.", "The correct option is not marked."]);
      const full = (s.reasons || []).filter((r) => Number(r.weight) === 1).length;
      if (full !== 1)
        err(at, ["Ağırlığı 1,0 olan tek bir gerekçe olmalı, şu an " + full + " tane var.",
                 "Exactly one reason must carry full weight. Reasons with full weight now: "
                 + full + "."]);
      const partial = (s.reasons || []).filter((r) => {
        const w = Number(r.weight);
        return w > 0 && w < 1;
      }).length;
      if (!partial)
        warn(at, ["Kısmi puanlı gerekçe yok. Makul ama yüzeysel bir gerekçe " +
                  "sıfır alırsa adım çoktan seçmeli bir teste döner.",
                  "No reason earns partial points. If a reasonable but shallow reason " +
                  "scores zero, the step becomes a multiple-choice test."]);
    }
    if (s.kind === "branching") {
      const nodes = s.nodes || [];
      if (nodes.length < 2)
        err(at, ["En az iki düğüm gerekli.", "At least two nodes are needed."]);
      const known = new Set(nodes.map((n) => n.id));
      nodes.forEach((n) => {
        if (n.terminal) return;
        if (!(n.options || []).length)
          err(at, [`${n.id} düğümünde seçenek yok.`, `Node ${n.id} has no options.`]);
        (n.options || []).forEach((o) => {
          if (!known.has(o.next))
            err(at, [`${n.id} düğümünden tanımsız bir düğüme gidiliyor: ${o.next}`,
                     `Node ${n.id} leads to a node that does not exist: ${o.next}`]);
        });
      });
      if (!nodes.some((n) => n.terminal))
        err(at, ["Bitiş düğümü yok.", "There is no end node."]);
    }
  });

  const debrief = ["Çözüm notu", "Solution note"];
  if (!(c.debrief?.summary || "").trim())
    err(debrief, ["Özet boş.", "The summary is empty."]);
  if (!(c.debrief?.takeaway || "").trim())
    err(debrief, ["Akılda kalacak kural boş.", "The takeaway is empty."]);
  if (!(c.debrief?.sources || []).some((s) => /https?:\/\//.test(s)))
    warn(debrief, ["Bağlantı verilen bir kaynak yok.", "No source has a link."]);

  // Variants matter most where everyone meets the same case in the same week.
  // An open case is met at all sorts of times, so a single variant only warns.
  const variants = ["Varyantlar", "Variants"];
  if (c.type === "open" && (c.variants || []).length < 2)
    warn(variants, ["Tek varyantlı bir vakada herkes aynı metni görür ve "
                    + "cevap kolayca paylaşılır.",
                    "In a case with a single variant everyone sees the same text, "
                    + "and the answer is easily shared."]);
  if (c.type === "weekly" && (c.variants || []).length < 3)
    err(variants, ["Haftalık vakada en az üç varyant gerekir. Aynı vaka herkese " +
                   "aynı gelirse cevap kolayca paylaşılır.",
                   "A weekly case needs at least three variants. If everyone gets the " +
                   "same case, the answer is easily shared."]);
  {
    const keys = (c.variants || []).map((v) => Object.keys(v.values || {}).sort().join("|"));
    if (keys.length > 1 && new Set(keys).size > 1)
      err(variants, ["Her varyant aynı alanları tanımlamalı.",
                     "Every variant must define the same fields."]);
    const used = new Set();
    for (const m of JSON.stringify(c).matchAll(/\{\{(\w+)\}\}/g)) used.add(m[1]);
    const defined = new Set((c.variants || []).flatMap((v) => Object.keys(v.values || {})));
    for (const u of used) {
      if (!defined.has(u)) err(variants, [`{{${u}}} tanımlı değil.`, `{{${u}}} is not defined.`]);
    }
    for (const d of defined) {
      if (!used.has(d)) warn(variants, [`{{${d}}} hiç kullanılmıyor.`, `{{${d}}} is never used.`]);
    }
  }

  return { problems: P, dims: [...dims] };
}

/* --------------------------------- sample --------------------------------- */

const BLANK_STEP = (kind, n) => ({
  id: `st${n}`, kind, dimension: "op_security", points: 6,
  confidence: kind !== "branching",
  prompt: "", text: "", items: [], forbidden: [], required: [], seed: "",
  options: [], reasons: [], correct: "", nodes: [], scoring: "path_min",
  feedbackOk: "", feedbackNo: "",
});

const SAMPLE = {
  key: "2026-W38-qr-poster",
  title: "Koridordaki Afiş",
  type: "weekly",
  minutes: 13,
  state: "draft",
  language: "tr",
  context:
    "Bölümde {{yer}} yeni bir afiş asılmış: Kurumsal logo, düzgün tasarım, " +
    "altında bir kare kod ve {{konu}} yazısı. Kimin astığını bilmiyorsun.",
  variants: [
    { key: "A", values: { yer: "koridorda", konu: "burs başvurusu" } },
    { key: "B", values: { yer: "yemekhane girişinde", konu: "yurt başvurusu" } },
    { key: "C", values: { yer: "kütüphane panosunda", konu: "staj duyurusu" } },
  ],
  steps: [
    {
      ...BLANK_STEP("reasoned_choice", 1),
      dimension: "op_security",
      prompt: "Kodu okuttun ve açılan sayfa kurumsal giriş ekranına benziyor. Ne yaparsın, neden?",
      options: [
        { id: "o1", text: "Sayfa kurumsal göründüğü için giriş yaparım." },
        { id: "o2", text: "Sayfayı kapatır, başvuruyu kurumun kendi sitesinden ararım." },
        { id: "o3", text: "Adres çubuğuna bakar, tanıdık geliyorsa giriş yaparım." },
      ],
      reasons: [
        { id: "r1", text: "Bir sayfanın görünüşü kime ait olduğunu söylemez.", weight: 1 },
        { id: "r2", text: "Kare kod nereye gittiğini taramadan önce göstermez.", weight: 0.6 },
        { id: "r3", text: "Kurumsal tasarım kullanan bir sayfa güvenlidir.", weight: 0 },
      ],
      correct: "o2",
      feedbackOk: "Doğrulama her zaman senin bildiğin adresten başlar.",
      feedbackNo: "Adres çubuğuna bakmak iyi bir alışkanlık ama yetmez. Benzer görünen alan adları tam da bu kontrolü atlatmak için alınır.",
    },
  ],
  debrief: {
    summary: "",
    takeaway: "",
    sources: [""],
  },
};

/* The same sample written in English, for a case written in English. */
const SAMPLE_EN = {
  key: "2026-W38-qr-poster",
  title: "The Poster in the Corridor",
  type: "weekly",
  minutes: 13,
  state: "draft",
  language: "en",
  context:
    "A new poster has gone up {{place}} in your department: the institution's logo, a neat " +
    "design, and at the bottom a QR code with the words “{{topic}}”. You do not know who put it up.",
  variants: [
    { key: "A", values: { place: "in the corridor", topic: "Scholarship applications" } },
    { key: "B", values: { place: "at the canteen entrance", topic: "Dormitory applications" } },
    { key: "C", values: { place: "on the library noticeboard", topic: "Internship notice" } },
  ],
  steps: [
    {
      ...BLANK_STEP("reasoned_choice", 1),
      dimension: "op_security",
      prompt: "You scan the code, and the page that opens looks like the institution's sign-in " +
              "screen. What do you do, and why?",
      options: [
        { id: "o1", text: "I sign in, because the page looks like the institution's." },
        { id: "o2", text: "I close the page and look for the application on the institution's own website." },
        { id: "o3", text: "I check the address bar and sign in if it looks familiar." },
      ],
      reasons: [
        { id: "r1", text: "How a page looks does not tell you who it belongs to.", weight: 1 },
        { id: "r2", text: "A QR code does not show where it leads before you scan it.", weight: 0.6 },
        { id: "r3", text: "A page that uses the institution's design is safe.", weight: 0 },
      ],
      correct: "o2",
      feedbackOk: "Checking always starts from an address you know yourself.",
      feedbackNo: "Looking at the address bar is a good habit, but it is not enough. Lookalike domain names are registered precisely to get past this check.",
    },
  ],
  debrief: {
    summary: "",
    takeaway: "",
    sources: [""],
  },
};

/* A case started from nothing: one variant, no steps yet. */
const BLANK_CASE = {
  key: "", title: "", type: "open", minutes: 13, state: "draft", language: "tr", context: "",
  variants: [{ key: "A", values: {} }],
  steps: [],
  debrief: { summary: "", takeaway: "", sources: [""] },
};

/* Where a new case starts, in the language it is going to be written in. */
function newCase(sample, language) {
  const start = !sample ? BLANK_CASE : language === "en" ? SAMPLE_EN : SAMPLE;
  return { ...start, language };
}

/* -------------------------------------------------------------------------- */

/* Colours sampled from the institution's own marks.
 *
 *   #E10613  the university seal's red, sampled from the crest
 *   #C00000  the centre's red, sampled from the AIARC wordmark
 *
 * The darker red carries text, borders and filled buttons because it clears
 * 4.5:1 on both the card and the page background. The seal red is used where
 * the brighter mark belongs: the badge, small highlights, the crest itself. */
const PAPER = "var(--paper)", CARD = "var(--card)", LINE = "var(--line)";
const TEXT = "var(--text)", MUTED = "var(--muted)", ACCENT = "var(--accent)", BRAND = "var(--brand)";
/* The amber for marks and borders; words take the deeper one. */
const GOOD = "var(--good)", WARN = "var(--warn)", WARN_TEXT = "var(--warn-text)";
const DISPLAY = "'Archivo', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* ------------------------------- the screens ------------------------------- */

/* Which screen the address asks for. The shell reaches this one at #vaka-yaz,
   and a draft has its own address so the panel can send a person straight to
   it. */
function routeFromHash() {
  const h = (window.location.hash || "").replace(/^#/, "");
  const m = h.match(/^vaka-yaz\/(\d+)$/);
  if (m) return { view: "draft", id: Number(m[1]) };
  if (h === "vaka-yaz/yeni") return { view: "new", sample: false };
  if (h === "vaka-yaz/ornek") return { view: "new", sample: true };
  return { view: "list" };
}

function goTo(path) {
  if ((window.location.hash || "") !== `#${path}`) window.location.hash = path;
}

function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(LANG === "en" ? "en-GB" : "tr-TR",
                          { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

export default function CaseEditor({ embedded, lang: hostLang }) {
  // Inside the app the shell says which language is on screen. Standing
  // alone, the editor opens in the language this browser picked or would be
  // given, and puts it on the page itself.
  const [standaloneLang] = useState(() => openingLang(null));
  const lang = hostLang ?? standaloneLang;
  LANG = lang === "en" ? "en" : "tr";
  if (!hostLang) showLang(lang);

  const [route, setRoute] = useState(routeFromHash);
  const [rows, setRows] = useState(null);
  const [offline, setOffline] = useState(null);       // null while asking
  const [listError, setListError] = useState(null);
  // A message carried from one screen to the next, such as "Taslak kaldırıldı."
  // Messages the editor words itself are [Turkish, English] pairs, read
  // through sayPair when shown; a server's message arrives as one string.
  const [carried, setCarried] = useState(null);

  useEffect(() => {
    const on = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  /* The list is also the probe for a server: without one the editor still
     works as a place to write, and says that nothing is saved. */
  const loadList = React.useCallback(async () => {
    try {
      setRows(await drafts.list(false));
      setOffline(false);
      setListError(null);
    } catch (e) {
      if (e.status === 0) setOffline(true);
      else { setOffline(false); setRows([]); setListError(e.message); }
    }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const open = (id, note) => { setCarried(note ?? null); goTo(`vaka-yaz/${id}`); };
  const back = (note) => { setCarried(note ?? null); loadList(); goTo("vaka-yaz"); };

  // A new case is written in the language on screen when it is opened; the
  // writer can choose another before it is first saved.
  let screen;
  if (offline === null) {
    screen = <p style={S.loading}>{say("Yükleniyor…", "Loading…")}</p>;
  } else if (offline) {
    screen = <FormEditor key="offline" initial={newCase(true, LANG)} offline />;
  } else if (route.view === "draft") {
    screen = <DraftScreen key={route.id} id={route.id} carried={carried}
               onBack={back} onOpen={open} />;
  } else if (route.view === "new") {
    screen = <FormEditor key={route.sample ? "sample" : "blank"}
               initial={newCase(route.sample, LANG)} onBack={back}
               onCreated={(id) => window.history.replaceState(null, "", `#vaka-yaz/${id}`)} />;
  } else {
    screen = <DraftList rows={rows ?? []} error={listError} carried={carried} onOpen={open} />;
  }

  return (
    <div style={S.root}>
      <style>{CSS}</style>
      {screen}
      {!embedded && <Colophon lang={LANG} compact />}
      <p style={S.foot}>
        {say("Taslaklar veritabanında saklanır. Buradaki denetim yazarken yol gösterir. "
             + "Taslağın gönderilip gönderilemeyeceğine ise sunucudaki denetim karar verir.",
             "Drafts are kept in the database. The checks here guide you as you write; "
             + "the checks on the server decide whether a draft can be submitted.")}
      </p>
    </div>
  );
}

/* ------------------------------- the drafts -------------------------------- */

function DraftList({ rows, error, carried, onOpen }) {
  const groups = [
    { key: "mine", title: say("Üzerinde çalıştığın taslaklar", "Drafts you are working on"),
      empty: say("Açık bir taslağın yok.", "You have no open drafts."),
      rows: rows.filter((r) => r.mine && ["draft", "changes_requested"].includes(r.state)) },
    { key: "review", title: say("İnceleme bekleyenler", "Waiting for review"),
      empty: say("İncelemede taslak yok.", "No drafts are in review."),
      note: say("Bir taslağı yazarından başka bir yazar inceler. İnceleme yetkin varsa taslağı "
        + "açıp onaylayabilir ya da düzeltme isteyebilirsin.",
        "A draft is reviewed by an author other than the one who wrote it. If you can "
        + "review, you can open the draft and approve it or request changes."),
      rows: rows.filter((r) => r.state === "in_review") },
    { key: "approved", title: say("Onaylananlar", "Approved"),
      empty: say("Yayımlanmayı bekleyen taslak yok.", "No drafts are waiting to be published."),
      note: say("Onaylanan taslakları yönetim panelinden bir yönetici yayımlar.",
                "An administrator publishes approved drafts from the admin panel."),
      rows: rows.filter((r) => r.state === "approved") },
  ];
  return (
    <>
      <header style={S.header}>
        <div>
          <div style={S.eyebrow}>{say("YAZEM · VAKA YAZIMI", "YAZEM · CASE WRITING")}</div>
          <h1 style={S.h1}>{say("Vaka yazımı", "Case writing")}</h1>
          <p style={S.lead}>
            {say("Yeni bir vaka yaz, taslaklarına devam et ya da başka yazarların taslaklarını incele.",
                 "Write a new case, carry on with your drafts or review other authors' drafts.")}
          </p>
        </div>
        <div style={S.headActions}>
          <button onClick={() => goTo("vaka-yaz/ornek")} style={S.ghost}
            data-action="new-from-sample">{say("Örnek vakayla başla", "Start from the sample case")}</button>
          <button onClick={() => goTo("vaka-yaz/yeni")} style={S.primary}
            data-action="new-case">{say("Yeni vaka yaz", "Write a new case")}</button>
        </div>
      </header>
      {carried && <div style={S.flash} role="status">{sayPair(carried)}</div>}
      {error && <div style={S.offline}>{error}</div>}
      {groups.map((g) => (
        <section key={g.key} style={S.card} data-group={g.key}>
          <div style={S.cardHead}>
            {g.title}
            {g.rows.length > 0 && <span style={S.count}>{g.rows.length}</span>}
          </div>
          {g.note && <p style={S.hint}>{g.note}</p>}
          {g.rows.length === 0 && <p style={S.emptyLine}>{g.empty}</p>}
          <div style={S.rows}>
            {g.rows.map((r) => <DraftRow key={r.id} r={r} onOpen={onOpen} />)}
          </div>
        </section>
      ))}
    </>
  );
}

function DraftRow({ r, onOpen }) {
  const meta = [
    r.case_key,
    r.origin !== "editor" || r.version > 1 ? say(`sürüm ${r.version}`, `version ${r.version}`) : null,
    ORIGIN[r.origin] && sayPair(ORIGIN[r.origin]),
    !r.mine && r.author_name ? say(`Yazan: ${r.author_name}`, `By ${r.author_name}`) : null,
    when(r.updated_at),
  ].filter(Boolean).join(" · ");
  const open = say("Aç", "Open");
  const action = r.state === "in_review"
    ? (r.can_review ? say("İncele", "Review") : open)
    : r.mine && ["draft", "changes_requested"].includes(r.state) ? say("Devam et", "Continue") : open;
  return (
    <button onClick={() => onOpen(r.id)} style={S.draftRow} data-draft={r.id} data-state={r.state}>
      <span style={S.draftMain}>
        <span style={S.draftTitle} lang={r.title && r.locale ? r.locale : undefined}>
          {r.title || r.case_key}
        </span>
        <span style={S.draftMeta}>{meta}</span>
        {r.state === "changes_requested" && r.review_note && (
          <span style={S.draftNote}>{say("İnceleyenin notu: ", "Reviewer's note: ")}{r.review_note}</span>
        )}
        {r.state === "draft" && !r.valid && (
          <span style={S.draftNote}>
            {say("Düzeltilecek hatalar var, henüz gönderilemez.",
                 "There are errors to fix, so it cannot be submitted yet.")}
          </span>
        )}
      </span>
      <LangChip locale={r.locale} />
      <Pill state={r.state} />
      <span style={S.draftGo}>{action}</span>
    </button>
  );
}

/* One draft, opened in whichever editor can hold it. */
function DraftScreen({ id, carried, onBack, onOpen }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(carried);
  const load = React.useCallback(async () => {
    try { setD(await drafts.read(id)); setError(null); }
    catch (e) {
      setError(e.status === 0
        ? ["Sunucuya ulaşılamadı.", "The server could not be reached."] : e.message);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const reload = async (message) => { setNote(message ?? null); await load(); };

  if (error) {
    return (
      <>
        <BackLink onBack={() => onBack()} />
        <div style={S.offline}>{sayPair(error)}</div>
      </>
    );
  }
  if (!d) return <p style={S.loading}>{say("Taslak açılıyor…", "Opening the draft…")}</p>;
  const editable = d.mine && ["draft", "changes_requested"].includes(d.state);
  if (editable && d.origin === "editor" && fitsTheForm(d.body)) {
    return <FormEditor key={`form-${d.id}`} initial={{ ...fromBody(d.body), state: d.state }}
             draft={d} carried={note} onBack={onBack} />;
  }
  return <BodyEditor key={`body-${d.id}-${d.state}`} draft={d} editable={editable}
           carried={note} onBack={onBack} reload={reload} onOpen={onOpen} />;
}

function BackLink({ onBack }) {
  return (
    <button onClick={onBack} style={S.backBtn} data-action="back">
      {say("← Taslaklara dön", "← Back to drafts")}
    </button>
  );
}

/* What the reviewer asked for, and what people reported about the case: the
   two things a writer correcting a draft needs in view. */
function ReviewNote({ d, state }) {
  if (!d?.review_note || !["changes_requested", "draft"].includes(state)) return null;
  return (
    <div style={S.noteBox} data-panel="review-note">
      <div style={S.noteHead}>
        {say("İnceleyenin notu", "Reviewer's note")}{d.reviewer_name ? ` · ${d.reviewer_name}` : ""}
      </div>
      <p style={S.noteText}>{d.review_note}</p>
    </div>
  );
}

function CaseReportsBox({ reports, body }) {
  if (!reports?.length) return null;
  const ids = (body?.steps ?? []).map((s) => s.id);
  return (
    <div style={S.sideCard} data-panel="case-reports">
      <div style={S.sideHead}>
        {say("Açık bildirimler", "Open reports")}
        <span style={{ ...S.badge, background: WARN }}>{reports.length}</span>
      </div>
      <p style={S.sideText}>
        {say("Bu vakayla ilgili bildirilen sorunlar. Bildirimleri yönetim panelinden bir yönetici kapatır.",
             "Problems people reported about this case. An administrator closes them from the admin panel.")}
      </p>
      {reports.map((r) => (
        <div key={r.id} style={S.reportItem}>
          <div style={S.problemWhere}>
            {[REPORT_KINDS[r.kind] ? sayPair(REPORT_KINDS[r.kind]) : r.kind,
              r.step_key
                ? (ids.includes(r.step_key)
                  ? say(`Adım ${ids.indexOf(r.step_key) + 1}`, `Step ${ids.indexOf(r.step_key) + 1}`)
                  : r.step_key)
                : say("Vakanın geneli", "The case as a whole"),
              r.variant_key ? say(`${r.variant_key} varyantı`, `Variant ${r.variant_key}`) : null,
            ].filter(Boolean).join(" · ")}
          </div>
          <div style={S.problemMsg}>{r.body}</div>
        </div>
      ))}
    </div>
  );
}

function ProblemList({ problems, readOnly }) {
  const errors = problems.filter((p) => p.level === "error");
  const warns = problems.filter((p) => p.level === "warn");
  return (
    <div style={S.sideCard} data-panel="problems">
      <div style={S.sideHead}>
        {say("Denetim", "Checks")}
        <span style={{ ...S.badge, background: errors.length ? ACCENT : warns.length ? WARN : GOOD }}>
          {errors.length
            ? say(`${errors.length} hata`, plural(errors.length, "error", "errors"))
            : warns.length
              ? say(`${warns.length} uyarı`, plural(warns.length, "warning", "warnings"))
              : say("sorun yok", "clean")}
        </span>
      </div>
      {problems.length === 0 && (
        <p style={S.clean}>
          {readOnly ? say("Denetimde sorun çıkmadı.", "The checks found no problems.")
                    : say("Gönderilmeye hazır.", "Ready to submit.")}
        </p>
      )}
      {/* Findings stored before the server wrote them in English have only
          the Turkish text. */}
      {problems.map((p, i) => (
        <div key={i} style={{ ...S.problem, borderLeftColor: p.level === "error" ? ACCENT : WARN }}>
          <div style={S.problemWhere}>{say(p.where, p.where_en ?? p.where)}</div>
          <div style={S.problemMsg}>{say(p.msg, p.msg_en ?? p.msg)}</div>
        </div>
      ))}
      {!readOnly && (
        <p style={S.sideNote}>
          {say("Hata varken gönderilemez. Uyarılar engellemez ama incelemede sorulur.",
               "A draft with errors cannot be submitted. Warnings do not stop it, but the "
               + "reviewer will ask about them.")}
        </p>
      )}
    </div>
  );
}

/* ------------------------------ the form editor ----------------------------- */

const LOCKED = ["in_review", "approved", "published", "retired"];

/* What the editors say after an action. */
const NOT_SAVED = ["Bağlantı yok, kaydedilmedi", "No connection, not saved"];
const SAVED = ["Kaydedildi", "Saved"];
const SAVED_WITH_PROBLEMS = ["Kaydedildi. Düzeltilecek yerler var.",
                             "Saved. There are things to fix."];
const UNREACHABLE = ["Sunucuya ulaşılamadı", "The server could not be reached"];
const FIX_FIRST = ["Önce hataları düzelt", "Fix the errors first"];
const SENT = ["İncelemeye gönderildi. Başka bir yazar onaylayınca bir yönetici yayımlayabilir.",
              "Sent for review. Once another author approves it, an administrator can publish it."];
const SET_ASIDE = ["Taslak kaldırıldı.", "Draft set aside."];
const SET_ASIDE_ASK = ["Bu taslak kaldırılacak. Kaldırılan bir taslak listede görünmez ve geri "
                       + "getirilemez.",
                       "This draft will be set aside. A draft set aside no longer appears in the "
                       + "list and cannot be brought back."];

function FormEditor({ initial, draft, offline, carried, onBack, onCreated }) {
  const [c, setC] = useState(initial);
  const [tab, setTab] = useState("build");
  const [narrow, setNarrow] = useState(false);
  const [flash, setFlash] = useState(carried ?? null);
  const [draftId, setDraftId] = useState(draft?.id ?? null);
  const [serverProblems, setServerProblems] = useState(draft?.problems ?? null);
  // The body as it stood when the server last spoke. Once it changes, the
  // server's list is out of date and the live checks take over again.
  const [checkedBody, setCheckedBody] = useState(
    () => (draft ? JSON.stringify(toBody(initial)) : null));
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const locked = LOCKED.includes(c.state);
  const places = usePlaces();

  const saveNow = async () => {
    const body = toBody(c);
    const res = draftId ? await drafts.save(draftId, body)
                        : await drafts.create(c.key, body.language, body);
    const id = draftId ?? res.id;
    if (!draftId && id) { setDraftId(id); onCreated?.(id); }
    setServerProblems(res?.problems ?? []);
    setCheckedBody(JSON.stringify(body));
    return { id, valid: !!res?.valid };
  };

  const save = async () => {
    if (offline) { setFlash(NOT_SAVED); return; }
    setBusy(true);
    try {
      const { valid } = await saveNow();
      setFlash(valid ? SAVED : SAVED_WITH_PROBLEMS);
    } catch (e) {
      setFlash(e.status === 0 ? UNREACHABLE : e.message);
    } finally { setBusy(false); }
  };

  const send = async () => {
    if (offline) { setFlash(NOT_SAVED); return; }
    setBusy(true);
    try {
      const { id, valid } = await saveNow();
      if (!valid) { setFlash(FIX_FIRST); return; }
      await drafts.submit(id);
      setC((x) => ({ ...x, state: "in_review" }));
      setFlash(SENT);
    } catch (e) {
      setFlash(e.status === 0 ? UNREACHABLE : e.message);
    } finally { setBusy(false); }
  };

  const discard = async () => {
    setBusy(true);
    try { await drafts.discard(draftId); onBack?.(SET_ASIDE); }
    catch (e) { setFlash(e.message); setAsking(false); }
    finally { setBusy(false); }
  };

  /* The language of a case is chosen before it is first saved; the draft
     keeps it from then on. A sample nobody has changed yet follows the
     choice, so the sample is always in the language being written. */
  const chooseLanguage = (language) => setC((x) => {
    const untouched = stable(x) === stable(newCase(true, x.language));
    return untouched ? newCase(true, language) : { ...x, language };
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 960px)");
    const on = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const { problems: local, dims } = useMemo(() => checkCase(c), [c]);
  // The server's list is authoritative once it has spoken; before that the
  // local checks stand in so the writer sees problems while typing.
  const fresh = serverProblems !== null
    && checkedBody === JSON.stringify(toBody(c));
  const problems = fresh
    ? [...local, ...serverProblems.filter((sp) => !local.some((lp) => lp.msg === sp.msg))]
    : local;
  const errors = problems.filter((p) => p.level === "error");
  const canSubmit = errors.length === 0 && !locked;

  const set = (patch) => setC((x) => ({ ...x, ...patch }));
  const setStep = (i, patch) =>
    setC((x) => ({ ...x, steps: x.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const addStep = (kind) =>
    setC((x) => ({ ...x, steps: [...x.steps, BLANK_STEP(kind, x.steps.length + 1)] }));
  const dropStep = (i) =>
    setC((x) => ({ ...x, steps: x.steps.filter((_, k) => k !== i) }));

  return (
    <>
      {onBack && <BackLink onBack={() => onBack()} />}
      <header style={S.header}>
        <div>
          <div style={S.eyebrow}>{say("YAZEM · VAKA YAZIMI", "YAZEM · CASE WRITING")}</div>
          <h1 style={S.h1} lang={c.title ? c.language : undefined}>
            {c.title || say("Adsız vaka", "Untitled case")}
          </h1>
          <div style={S.subline}>
            <Pill state={c.state} />
            {draftId && <LangChip locale={draft?.locale ?? c.language} />}
            <span style={S.mono}>{c.key}</span>
            <span style={S.mono}>
              {say(`${c.steps.length} adım`, plural(c.steps.length, "step", "steps"))}
            </span>
            {dims.length > 0 && (
              <span style={S.mono}>{dims.map(dimLabel).join(" · ")}</span>
            )}
          </div>
        </div>
        <div style={S.headActions}>
          {draftId && !locked && !asking && (
            <button onClick={() => setAsking(true)} style={S.quiet} data-action="discard">
              {say("Taslağı kaldır", "Set the draft aside")}
            </button>
          )}
          <button onClick={save} disabled={busy || locked}
            style={{ ...S.ghost, ...(locked ? S.disabled : null) }}>
            {busy ? "…" : say("Kaydet", "Save")}
          </button>
          <button onClick={send} disabled={!canSubmit || busy}
            style={{ ...S.primary, ...(canSubmit && !busy ? null : S.disabled) }}>
            {say("İncelemeye gönder", "Send for review")}
          </button>
        </div>
      </header>

      {asking && (
        <div style={S.confirmBox} role="alert">
          <span>{sayPair(SET_ASIDE_ASK)}</span>
          <button onClick={discard} disabled={busy} style={S.primary}
            data-action="discard-confirm">{say("Kaldır", "Set aside")}</button>
          <button onClick={() => setAsking(false)} style={S.ghost}>{say("Vazgeç", "Cancel")}</button>
        </div>
      )}
      {flash && <div style={S.flash} role="status">{sayPair(flash)}</div>}
      {offline && (
        <div style={S.offline}>
          {say("Sunucuya ulaşılamadı. Yazmaya devam edebilirsin ama yazdıkların kaydedilmez.",
               "The server could not be reached. You can keep writing, but nothing is saved.")}
        </div>
      )}
      <ReviewNote d={draft} state={c.state} />

      <nav style={S.tabs}>
        {[["build", say("Vaka", "Case")], ["debrief", say("Çözüm notu", "Solution note")],
          ["preview", say("Önizleme", "Preview")]]
          .map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ ...S.tab, ...(tab === k ? S.tabOn : null) }}>{label}</button>
          ))}
      </nav>

      <div style={{ ...S.body, gridTemplateColumns: narrow ? "1fr" : "1fr 320px" }}>
        <main style={{ minWidth: 0 }}>
          <fieldset disabled={locked} style={S.fieldset}>
            {tab === "build" && (
              <>
                <section style={S.card}>
                  <div style={S.cardHead}>{say("Genel bilgiler", "Details")}</div>
                  <Field label={say("Başlık", "Title")}
                    hint={say("Vakayı çözenlerin göreceği ad.", "The name people solving it will see.")}>
                    <input value={c.title} onChange={(e) => set({ title: e.target.value })}
                      style={S.input} />
                  </Field>
                  <div style={S.row2}>
                    <Field label={say("Kimlik", "Key")}
                      hint={say("Kısa ve kalıcı bir ad seç, örneğin kare-kod-afisi. Haftaya bağlı bir vaka için 2026-W38-kisa-ad gibi bir ad da olur.",
                                "A short, permanent name: qr-code-poster. For a case tied to a week, 2026-W38-short-name works too.")}>
                      <input value={c.key} onChange={(e) => set({ key: e.target.value })}
                        readOnly={!!draftId} style={{ ...S.input, fontFamily: MONO }} />
                    </Field>
                    <Field label={say("Tür", "Type")}>
                      <select value={c.type} onChange={(e) => set({ type: e.target.value })}
                        style={S.input}>
                        <option value="open">{say("Serbest", "Open")}</option>
                        <option value="weekly">{say("Haftalık", "Weekly")}</option>
                        <option value="core">{say("Temel", "Core")}</option>
                      </select>
                    </Field>
                    <Field label={say("Vaka dili", "Case language")}>
                      <select value={c.language} disabled={!!draftId} data-field="case-language"
                        onChange={(e) => chooseLanguage(e.target.value)} style={S.input}>
                        <option value="tr">{say("Türkçe", "Turkish")}</option>
                        <option value="en">{say("İngilizce", "English")}</option>
                      </select>
                    </Field>
                  </div>
                  <Field label={say("Bağlam", "Context")}
                    hint={say("Vaka bu metinle başlar. İki ile dört cümle yeter.",
                              "This is where the person enters the case. Two to four sentences are enough.")}>
                    <textarea value={c.context} onChange={(e) => set({ context: e.target.value })}
                      rows={3} style={S.input} />
                  </Field>
                  <Field label={say("Vakanın geçtiği yer", "Where the case is set")}
                    hint={say("Kampüs haritasında bu yere dokunan kişi vakayı orada görür. Vaka kampüs dışında geçiyorsa boş bırak.",
                              "Someone who taps this place on the campus map finds the case there. Leave it empty for a case set off the campus.")}>
                    <select value={c.place ?? ""} onChange={(e) => set({ place: e.target.value })}
                      style={S.input} data-field="case-place">
                      <option value="">{say("Kampüs dışında ya da belirtilmemiş", "Off the campus, or not given")}</option>
                      {c.place && !places.some((p) => p.place === c.place) && (
                        <option value={c.place}>{c.place}</option>
                      )}
                      {places.map((p) => (
                        <option key={p.place} value={p.place}>
                          {/^\d+$/.test(p.place) ? `${p.place}. ${p.name}` : p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </section>

                <VariantEditor c={c} set={set} />

                {c.steps.map((s, i) => (
                  <StepCard key={i} i={i} s={s} setStep={setStep} drop={() => dropStep(i)} />
                ))}

                <section style={S.card}>
                  <div style={S.cardHead}>{say("Adım ekle", "Add a step")}</div>
                  <div style={S.kindGrid}>
                    {KINDS.map(([k, name, what]) => (
                      <button key={k} onClick={() => addStep(k)} style={S.kindBtn}>
                        <span style={S.kindTop}>
                          <span style={S.kindIcon}>
                            <Icon name={KIND_ICON[k]} size={18} />
                          </span>
                          <span style={S.kindName}>{sayPair(name)}</span>
                        </span>
                        <span style={S.kindWhat}>{sayPair(what)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}

            {tab === "debrief" && (
              <section style={S.card}>
                <div style={S.cardHead}>{say("Çözüm notu", "Solution note")}</div>
                <p style={S.hint}>
                  {say("Vaka bittiğinde gösterilir. Amacı, cevabı tekrarlamadan vakanın "
                       + "neyi ölçtüğünü anlatmaktır.",
                       "Shown when the case ends. It is there to say what the case measures, "
                       + "not to repeat the answer.")}
                </p>
                <Field label={say("Özet", "Summary")}
                  hint={say("Vaka aslında neyi ölçüyordu?", "What was the case really measuring?")}>
                  <textarea rows={3} value={c.debrief.summary} style={S.input}
                    onChange={(e) => set({ debrief: { ...c.debrief, summary: e.target.value } })} />
                </Field>
                <Field label={say("Akılda kalacak kural", "Takeaway")}
                  hint={say("Başka vakalarda da geçerli olacak tek bir cümle.",
                            "One sentence that holds for other cases too.")}>
                  <textarea rows={2} value={c.debrief.takeaway} style={S.input}
                    onChange={(e) => set({ debrief: { ...c.debrief, takeaway: e.target.value } })} />
                </Field>
                <Field label={say("Kaynaklar", "Sources")}
                  hint={say("Her satıra bir kaynak yaz. En az birinde bağlantı olsun.",
                            "Write one source per line. At least one should have a link.")}>
                  <textarea rows={3} value={(c.debrief.sources || []).join("\n")} style={S.input}
                    onChange={(e) => set({
                      debrief: { ...c.debrief, sources: e.target.value.split("\n") },
                    })} />
                </Field>
              </section>
            )}
          </fieldset>

          {tab === "preview" && <BodyPreview body={toBody(c)} caseLang={c.language} />}
        </main>

        {/* The problem list is always visible; it keeps a form from producing
            a broken case. */}
        <aside style={S.side}>
          <ProblemList problems={problems} />
          <CaseReportsBox reports={draft?.reports} body={draft?.body} />
          <div style={S.sideCard}>
            <div style={S.sideHead}>{say("Süreç", "Workflow")}</div>
            <ol style={S.flow}>
              {[[say("Yazıyorsun", "You write it"), say("taslak sana ait", "the draft is yours")],
                [say("İncelemeye gönderiyorsun", "You send it for review"),
                 say("hatasız olması gerekir", "it must have no errors")],
                [say("Başka bir yazar inceliyor", "Someone else reads it"),
                 say("kendi vakanı onaylayamazsın", "you cannot approve your own case")],
                [say("Yayımlanıyor", "It is published"),
                 say("hedef kitleyi yönetici belirliyor", "an administrator sets the audience")]].map(([a, b], i) => (
                <li key={a} style={S.flowItem}>
                  <span style={S.flowNum}>{i + 1}</span>
                  <span>
                    <b style={S.flowA}>{a}</b>
                    <span style={S.flowB}>{b}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </>
  );
}

/* --------------------- drafts the form cannot hold faithfully --------------------- */

/* A case from a file, or a new version of a live case, edited as it is
   stored: every text and answer field in place, or the whole case as YAML.
   The same screen shows a draft to someone who may only read it, and gives a
   reviewer the means to approve it or send it back. */
function BodyEditor({ draft, editable, carried, onBack, reload, onOpen }) {
  const [body, setBody] = useState(draft.body);
  const [saved, setSaved] = useState(() => JSON.stringify(draft.body));
  const [problems, setProblems] = useState(draft.problems ?? []);
  const [valid, setValid] = useState(!!draft.valid);
  const live = draft.live;
  const [tab, setTab] = useState(
    editable ? "texts" : draft.can_review && live ? "diff" : "preview");
  const [yaml, setYaml] = useState(null);
  const [yamlSaved, setYamlSaved] = useState(null);
  const [yamlError, setYamlError] = useState(null);
  const [flash, setFlash] = useState(carried ?? null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [narrow, setNarrow] = useState(false);

  const dirty = JSON.stringify(body) !== saved;
  const yamlDirty = yaml !== null && yaml !== yamlSaved;
  const changes = useMemo(() => (live ? diffBodies(live, body) : []), [live, body]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 960px)");
    const on = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Leaving the page with unsaved work asks first.
  useEffect(() => {
    if (!dirty && !yamlDirty) return undefined;
    const stop = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", stop);
    return () => window.removeEventListener("beforeunload", stop);
  }, [dirty, yamlDirty]);

  const answered = (r) => {
    setProblems(r.problems ?? []);
    setValid(!!r.valid);
    setFlash(r.valid ? SAVED : SAVED_WITH_PROBLEMS);
  };

  const saveBody = async () => {
    setBusy(true); setFlash(null);
    try {
      const r = await drafts.save(draft.id, body);
      setSaved(JSON.stringify(body));
      answered(r);
      return { ok: true, valid: !!r.valid };
    } catch (e) { setFlash(e.message); return { ok: false }; }
    finally { setBusy(false); }
  };

  const saveYaml = async () => {
    setBusy(true); setFlash(null); setYamlError(null);
    try {
      const r = await drafts.saveYaml(draft.id, yaml);
      setYamlSaved(yaml);
      // The body the YAML became, so the other views show what was saved.
      const fresh = await drafts.read(draft.id);
      setBody(fresh.body);
      setSaved(JSON.stringify(fresh.body));
      answered(r);
      return { ok: true, valid: !!r.valid };
    } catch (e) {
      if (e.status === 400) setYamlError(e.message); else setFlash(e.message);
      return { ok: false };
    } finally { setBusy(false); }
  };

  const loadYaml = async () => {
    try {
      const r = await drafts.yaml(draft.id);
      setYaml(r.text); setYamlSaved(r.text); setYamlError(null);
    } catch (e) { setFlash(e.message); }
  };

  /* Each view saves what it changed before another one opens, so the two
     editors never hold different versions of the case. */
  const switchTab = async (next) => {
    if (next === tab || busy) return;
    if (tab === "yaml" && yamlDirty && !(await saveYaml()).ok) return;
    if (next === "yaml") {
      if (editable && dirty && !(await saveBody()).ok) return;
      await loadYaml();
    }
    setTab(next);
  };

  const save = async () => (tab === "yaml" ? saveYaml() : saveBody());

  const submit = async () => {
    let ok = valid;
    if (tab === "yaml" && yamlDirty) {
      const r = await saveYaml(); if (!r.ok) return; ok = r.valid;
    } else if (dirty) {
      const r = await saveBody(); if (!r.ok) return; ok = r.valid;
    }
    if (!ok) { setFlash(FIX_FIRST); return; }
    setBusy(true);
    try {
      await drafts.submit(draft.id);
      await reload(SENT);
    } catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };

  const review = async (approve) => {
    if (!approve && !note.trim()) {
      setFlash(["Düzeltme isterken neyin düzeltileceğini not olarak yaz.",
                "When you request changes, write what needs changing as a note."]);
      return;
    }
    setBusy(true); setFlash(null);
    try {
      await drafts.review(draft.id, approve, note.trim() || null);
      await reload(approve
        ? ["Onaylandı. Vakayı yönetim panelinden bir yönetici yayımlar.",
           "Approved. An administrator publishes it from the admin panel."]
        : ["Düzeltme istendi. Taslak, notunla birlikte yazarına döndü.",
           "Changes requested. The draft has gone back to its author with your note."]);
    } catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };

  const discard = async () => {
    setBusy(true);
    try { await drafts.discard(draft.id); onBack(SET_ASIDE); }
    catch (e) { setFlash(e.message); setAsking(false); }
    finally { setBusy(false); }
  };

  const newVersion = async () => {
    setBusy(true); setFlash(null);
    try {
      const r = await drafts.revise(draft.case_key);
      if (r.existing && !r.mine) {
        setFlash([`Bu vakanın yeni bir sürümünü ${r.author ?? "başka bir yazar"} hazırlıyor. `
          + "Aynı anda yalnızca bir sürüm açık olabilir.",
          `${r.author ?? "Another author"} is preparing a new version of this case. `
          + "Only one version can be open at a time."]);
      } else onOpen(r.id);
    } catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };

  const status = statusLine(draft, editable);
  const tabs = [["texts", say("Metinler", "Texts")], ["yaml", "YAML"],
                ["preview", say("Önizleme", "Preview")],
                ...(live ? [["diff", say(`Değişiklikler (${changes.length})`,
                                         `Changes (${changes.length})`)]] : [])];
  const canDiscard = editable;

  return (
    <>
      <BackLink onBack={() => onBack()} />
      <header style={S.header}>
        <div>
          <div style={S.eyebrow}>{say("YAZEM · VAKA YAZIMI", "YAZEM · CASE WRITING")}</div>
          <h1 style={S.h1} lang={body.title ? draft.locale ?? body.language : undefined}>
            {body.title || draft.case_key}
          </h1>
          <div style={S.subline}>
            <Pill state={draft.state} />
            <LangChip locale={draft.locale} />
            <span style={S.mono}>{draft.case_key}</span>
            <span style={S.mono}>{say(`sürüm ${draft.version}`, `version ${draft.version}`)}</span>
            <span style={S.mono}>{ORIGIN[draft.origin] ? sayPair(ORIGIN[draft.origin]) : draft.origin}</span>
            {!draft.mine && draft.author_name && (
              <span style={S.mono}>
                {say(`Yazan: ${draft.author_name}`, `By ${draft.author_name}`)}
              </span>
            )}
          </div>
        </div>
        <div style={S.headActions}>
          {canDiscard && !asking && (
            <button onClick={() => setAsking(true)} style={S.quiet} data-action="discard">
              {say("Taslağı kaldır", "Set the draft aside")}
            </button>
          )}
          {editable && (
            <>
              <button onClick={save} disabled={busy} style={S.ghost} data-action="save">
                {busy ? "…" : say("Kaydet", "Save")}
              </button>
              <button onClick={submit} disabled={busy} data-action="submit"
                style={{ ...S.primary, ...(busy ? S.disabled : null) }}>
                {say("İncelemeye gönder", "Send for review")}
              </button>
            </>
          )}
          {draft.state === "published" && (
            <button onClick={newVersion} disabled={busy} style={S.primary} data-action="revise">
              {say("Bu vakayı düzenle", "Edit this case")}
            </button>
          )}
        </div>
      </header>

      {asking && (
        <div style={S.confirmBox} role="alert">
          <span>{sayPair(SET_ASIDE_ASK)}</span>
          <button onClick={discard} disabled={busy} style={S.primary}
            data-action="discard-confirm">{say("Kaldır", "Set aside")}</button>
          <button onClick={() => setAsking(false)} style={S.ghost}>{say("Vazgeç", "Cancel")}</button>
        </div>
      )}
      {flash && <div style={S.flash} role="status">{sayPair(flash)}</div>}
      {status && <div style={S.statusLine} data-status>{status}</div>}
      {draft.counterpart && editable && (
        <div style={S.statusLine} data-version-note>{versionLine(draft)}</div>
      )}
      <ReviewNote d={draft} state={draft.state} />
      {(dirty || yamlDirty) && editable && (
        <div style={S.unsaved}>{say("Kaydedilmemiş değişiklikler var.", "There are unsaved changes.")}</div>
      )}

      <nav style={S.tabs}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => switchTab(k)} data-tab={k}
            style={{ ...S.tab, ...(tab === k ? S.tabOn : null) }}>{label}</button>
        ))}
      </nav>

      <div style={{ ...S.body, gridTemplateColumns: narrow ? "1fr" : "1fr 320px" }}>
        <main style={{ minWidth: 0 }}>
          {tab === "texts" && (
            <TextFields body={body} setBody={setBody} readOnly={!editable}
              other={draft.counterpart} />
          )}
          {tab === "yaml" && (
            <section style={S.card}>
              <div style={S.cardHead}>YAML</div>
              <p style={S.hint}>
                {say("Vakanın dosyadaki hâli. Adım ya da seçenek eklemek gibi yapıyı değiştiren "
                     + "düzeltmeler burada yapılır. ",
                     "The case as it is stored in its file. Changes to its structure, such as "
                     + "adding a step or an option, are made here. ")}
                {live
                  ? say("Yayındaki bir vakanın adımları, adım türleri ve varyant anahtarları değiştirilemez.",
                        "The steps, step kinds and variant keys of a live case cannot be changed.")
                  : ""}
              </p>
              {yamlError && <div style={S.yamlError} role="alert">{yamlError}</div>}
              <textarea value={yaml ?? ""} readOnly={!editable} spellCheck={false}
                onChange={(e) => setYaml(e.target.value)} data-field="yaml"
                style={S.yamlArea} rows={28} />
            </section>
          )}
          {tab === "preview" && (
            <BodyPreview body={body} caseLang={draft.locale ?? body.language} />
          )}
          {tab === "diff" && <DiffView changes={changes} body={body} live={live} />}
        </main>

        <aside style={S.side}>
          {draft.can_review && (
            <div style={S.sideCard} data-panel="review">
              <div style={S.sideHead}>{say("İnceleme", "Review")}</div>
              <p style={S.sideText}>
                {say("Vakayı çözecek kişinin gözüyle oku, cevap anahtarını ve kaynakları kontrol et. "
                     + "Onaylarsan bir yönetici yayımlayabilir. Düzeltme istersen taslak, notunla "
                     + "birlikte yazarına döner.",
                     "Read the case as a student would, and check the answer key and the sources. "
                     + "If you approve it, an administrator can publish it. If you request "
                     + "changes, the draft goes back to its author with your note.")}
              </p>
              <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={say("Not (düzeltme isterken gerekli)",
                                 "Note (needed when you request changes)")}
                style={S.input} data-field="review-note" />
              <div style={{ ...S.inlineRow, marginTop: 10 }}>
                <button onClick={() => review(true)} disabled={busy} style={S.primary}
                  data-action="approve">{say("Onayla", "Approve")}</button>
                <button onClick={() => review(false)} disabled={busy} style={S.ghost}
                  data-action="request-changes">{say("Düzeltme iste", "Request changes")}</button>
              </div>
            </div>
          )}
          <ProblemList problems={problems} readOnly={!editable} />
          <CaseReportsBox reports={draft.reports} body={body} />
        </aside>
      </div>
    </>
  );
}

/* What a draft of a case in two languages is, and what that asks of its author. */
function versionLine(d) {
  const name = (l) => sayPair(LANGUAGE_NAMES[l] ?? [l, l]);
  if (d.translation) {
    return say(
      `Bu, vakanın ${name(d.locale)} sürümü. ${name(d.counterpart.locale)} sürümün kopyası olarak `
      + `açıldı. Her metni ${name(d.locale)} yaz. ${name(d.counterpart.locale)} metin her alanın `
      + "altında görünür. İki sürüm tek vaka sayıldığı için adımlar, cevaplar ve sayılar aynı kalır. "
      + "Kişi hangisini çözerse çözsün aynı vakayı çözmüş olur.",
      `This is the ${name(d.locale)} version of the case. It opened as a copy of the `
      + `${name(d.counterpart.locale)} version. Write each text in ${name(d.locale)}; the `
      + `${name(d.counterpart.locale)} text appears under each field. Steps, answers and numbers `
      + "stay the same, because the two versions count as one case: Whoever solves either one "
      + "has solved the same case.");
  }
  return say(
    `Bu vakanın ${name(d.counterpart.locale)} sürümü de var ve o sürümdeki metin her alanın `
    + "altında görünür. Cevap anahtarında yaptığın her değişikliği öbür sürümde de yap. İki "
    + "sürüm tek vaka sayılır.",
    `This case also has a ${name(d.counterpart.locale)} version, and its text appears under each `
    + "field. Make any change to the answer key in the other version too, because the two "
    + "versions count as one case.");
}

function statusLine(d, editable) {
  if (editable) {
    return d.state === "changes_requested"
      ? say("İnceleyen düzeltme istedi. Düzeltip yeniden incelemeye gönderebilirsin.",
            "The reviewer requested changes. Make them and send the draft for review again.")
      : null;
  }
  switch (d.state) {
    case "in_review":
      return d.mine
        ? say("İncelemede. Başka bir yazar inceleyip onaylayacak.",
              "In review. Another author will review and approve it.")
        : d.can_review
          ? say("Bu taslak incelemeni bekliyor.", "This draft is waiting for your review.")
          : say("İncelemede. İnceleme yetkisi olan bir yazar onaylayacak.",
                "In review. An author who can review drafts will approve it.");
    case "approved":
      return say("Onaylandı. Vakayı yönetim panelinden bir yönetici yayımlar.",
                 "Approved. An administrator publishes it from the admin panel.");
    case "published":
      return say("Yayında. Değiştirmek için vakanın yeni bir sürümünü açabilirsin.",
                 "Published. To change it, you can open a new version of the case.");
    case "retired":
      return say("Bu sürüm artık kullanılmıyor.", "This version is no longer in use.");
    default:
      return say(
        `Bu taslağı ${d.author_name ?? "başka bir yazar"} yazıyor. Yalnızca yazarı değiştirebilir.`,
        `${d.author_name ?? "Another author"} is writing this draft. Only its author can change it.`);
  }
}

/* -------------------------- every field in its place -------------------------- */

/* Fields that are structure rather than content. They change only through the
   YAML, where the whole shape of the case is in view. */
const STRUCTURE = new Set(["id", "kind", "dimension", "subtopics", "next", "start", "scoring",
  "partial_credit", "tolerance_chars", "min_selections", "max_selections", "max_chars", "flags",
  "require_reason", "allow_unknown", "terminal", "option_weight"]);

function leavesOf(obj) {
  const out = [];
  const visit = (v, path) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { v.forEach((x, i) => visit(x, [...path, i])); return; }
    if (typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (STRUCTURE.has(k)) continue;
        // A few older files repeat the correct option in the payload; the one
        // in the answer is the one that counts.
        if (path.length === 1 && path[0] === "payload" && k === "correct_option") continue;
        visit(x, [...path, k]);
      }
      return;
    }
    if (["string", "number", "boolean"].includes(typeof v)) out.push({ path, value: v });
  };
  visit(obj, []);
  return out;
}

function setIn(obj, path, value) {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  copy[k] = setIn(obj?.[k], rest, value);
  return copy;
}

function kindLabel(kind) {
  const found = KINDS.find(([k]) => k === kind);
  return found ? sayPair(found[1]) : kind;
}

function dimLabel(dim) {
  const found = DIMENSIONS.find(([k]) => k === dim);
  return found ? say(found[1], found[2]) : dim;
}

/* What a field inside a step is, in the editor's words. */
function stepLabel(s, path) {
  const [a, b, c, d, e, f] = path;
  const p = s?.payload ?? {};
  if (a === "prompt") return say("Yönerge", "Prompt");
  if (a === "points") return say("Puan", "Points");
  if (a === "confidence") return say("Güven düzeyi sorulsun mu", "Ask for confidence");
  if (a === "payload") {
    if (b === "text") return say("Metin (doğru cevaplar [[ ]] arasında)",
                                 "Text (correct answers between [[ ]])");
    if (b === "seed_text") return say("Başlangıç metni", "Starting text");
    if (b === "hint") return say("Kişiye gösterilen ipucu", "Hint shown to the person solving it");
    if (b === "items") {
      const id = p.items?.[c]?.id ?? c + 1;
      return say(`Künye ${id}`, `Reference ${id}`);
    }
    if (b === "options") {
      const id = p.options?.[c]?.id ?? c + 1;
      return say(`Seçenek ${id}`, `Option ${id}`);
    }
    if (b === "reasons") {
      const id = p.reasons?.[c]?.id ?? c + 1;
      return say(`Gerekçe ${id}`, `Reason ${id}`);
    }
    if (b === "nodes") {
      const n = p.nodes?.[c];
      const node = n?.id ?? c + 1;
      if (d === "text") {
        return say(`Düğüm ${node}${n?.terminal ? " (bitiş)" : ""}`,
                   `Node ${node}${n?.terminal ? " (end)" : ""}`);
      }
      if (d === "options") {
        const o = n?.options?.[e];
        const name = say(`Düğüm ${node}, seçenek ${o?.id ?? e + 1}`,
                         `Node ${node}, option ${o?.id ?? e + 1}`);
        if (f === "outcome") {
          return say(`${name}: sonuç değeri (0 ile 1 arası)`,
                     `${name}: outcome value (between 0 and 1)`);
        }
        return o?.next ? say(`${name} (${o.next} düğümüne gider)`, `${name} (leads to node ${o.next})`)
                       : name;
      }
    }
  }
  if (a === "answer") {
    if (b === "correct_option") return say("Doğru seçenek", "Correct option");
    if (b === "reason_weights") {
      return say(`Gerekçe ${c} ağırlığı (0 ile 1 arası)`, `Weight of reason ${c} (between 0 and 1)`);
    }
    if (b === "truth") {
      return d === "exists" ? say(`Künye ${c} gerçek mi`, `Is reference ${c} real`)
                            : say(`Künye ${c} için açıklama`, `Explanation for reference ${c}`);
    }
    if (b === "forbidden" || b === "required") {
      const g = b === "forbidden" ? say("Kalmamalı", "Must not remain") : say("Kalmalı", "Must remain");
      if (d === "label") return say(`${g} ${c + 1}: ne olduğu`, `${g} ${c + 1}: what it is`);
      if (d === "pattern") return say(`${g} ${c + 1}: aranan kalıp`, `${g} ${c + 1}: pattern searched for`);
      if (d === "hard_fail") {
        return say(`${g} ${c + 1}: kalırsa adım sıfır alır`,
                   `${g} ${c + 1}: if it remains, the step scores zero`);
      }
    }
    if (b === "model_answer") {
      return say("Örnek cevap (kuralları sınamak için)", "Model answer (to test the rules)");
    }
  }
  if (a === "feedback") {
    const named = { correct: ["Doğru cevaba dönüt", "Feedback on a correct answer"],
                    incorrect: ["Yanlış cevaba dönüt", "Feedback on a wrong answer"],
                    partial: ["Kısmen doğru cevaba dönüt", "Feedback on a partly correct answer"] }[b];
    return named ? sayPair(named) : say(`Dönüt: ${b}`, `Feedback: ${b}`);
  }
  return path.join(" › ");
}

const TOP_LABEL = { title: ["Başlık", "Title"], context: ["Bağlam", "Context"],
                    place: ["Vakanın geçtiği yer", "Where the case is set"],
                    estimated_minutes: ["Tahmini süre (dakika)", "Estimated time (minutes)"],
                    publish_at: ["Açılış", "Opens"], close_at: ["Kapanış", "Closes"],
                    author: ["Yazar", "Author"], type: ["Tür", "Type"],
                    audience: ["Hedef kitle", "Audience"], reviewed_by: ["İnceleyen", "Reviewer"],
                    status: ["Durum", "Status"] };

function debriefLabel(body, path) {
  const [a, b] = path;
  if (a === "summary") return say("Özet", "Summary");
  if (a === "takeaway") return say("Akılda kalacak kural", "Takeaway");
  if (a === "per_step") {
    const i = (body.steps ?? []).findIndex((s) => s.id === b);
    return i >= 0 ? say(`${i + 1}. adımın açıklaması`, `Explanation for step ${i + 1}`)
                  : say(`${b} adımının açıklaması`, `Explanation for step ${b}`);
  }
  if (a === "sources") return say(`Kaynak ${b + 1}`, `Source ${b + 1}`);
  return path.join(" › ");
}

/* Where a field sits in the case and what it is, for the list of changes. */
function placeOf(body, path) {
  const [a, b, c, d] = path;
  if (a === "steps") {
    return [say(`Adım ${b + 1}`, `Step ${b + 1}`), stepLabel(body.steps?.[b], path.slice(2))];
  }
  if (a === "variants") {
    const key = body.variants?.[b]?.key ?? b + 1;
    return [say("Varyantlar", "Variants"),
            c === "values" ? say(`${key} varyantı: ${d}`, `Variant ${key}: ${d}`)
                           : say(`${key} varyantı`, `Variant ${key}`)];
  }
  if (a === "debrief") return [say("Çözüm notu", "Solution note"), debriefLabel(body, path.slice(1))];
  return [say("Genel bilgiler", "Details"), TOP_LABEL[a] ? sayPair(TOP_LABEL[a]) : path.join(" › ")];
}

/* The same field in the case's other language, under the field, so one
   version is written beside the other and both keep saying the same thing. */
function getIn(obj, path) {
  return path.reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

function OtherText({ other, path }) {
  if (!other) return null;
  const v = getIn(other.body, path);
  if (typeof v !== "string" || !v.trim()) return null;
  return (
    <span style={S.otherText} data-other={other.locale}>
      <span style={S.otherLabel}>{sayPair(IN_LANGUAGE[other.locale] ?? [other.locale, other.locale])}</span>
      <span lang={other.locale} style={S.otherBody}>{v}</span>
    </span>
  );
}

function TextFields({ body, setBody, readOnly, other = null }) {
  const set = (path, value) => setBody((b) => setIn(b, path, value));
  const steps = body.steps ?? [];
  // A step of the other version is found by its id.
  const otherStep = (s) => {
    const found = (other?.body?.steps ?? []).find((x) => x.id === s.id);
    return found ? { locale: other.locale, body: found } : null;
  };
  const groups = [[say("Kişinin gördüğü", "What people see"), ["prompt", "payload"]],
                  [say("Cevap anahtarı", "Answer key"), ["answer"]],
                  [say("Dönütler", "Feedback"), ["feedback"]],
                  [say("Puan ve güven", "Points and confidence"), ["points", "confidence"]]];
  return (
    <div data-panel="texts">
      <section style={S.card}>
        <div style={S.cardHead}>{say("Genel bilgiler", "Details")}</div>
        <div style={S.facts}>
          <Fact label={say("Kimlik", "Key")} value={body.id} mono />
          <Fact label={say("Tür", "Type")}
            value={TYPE_LABEL[body.type] ? sayPair(TYPE_LABEL[body.type]) : body.type} />
          {Array.isArray(body.audience) && (
            <Fact label={say("Hedef kitle", "Audience")}
              value={body.audience.map((r) => (ROLE_LABEL[r] ? sayPair(ROLE_LABEL[r]) : r)).join(", ")} />
          )}
        </div>
        {["title", "context", "estimated_minutes", "publish_at", "close_at"]
          .filter((k) => body[k] !== undefined && body[k] !== null)
          .map((k) => (
            <Leaf key={k} label={sayPair(TOP_LABEL[k])} value={body[k]} readOnly={readOnly}
              onChange={(v) => set([k], v)} below={<OtherText other={other} path={[k]} />} />
          ))}
      </section>

      <VariantTable body={body} set={set} readOnly={readOnly} other={other} />

      {steps.map((s, i) => {
        const leaves = leavesOf(s);
        const options = (s.payload?.options ?? []).map((o) =>
          [o.id, `${o.id}: ${(o.text ?? "").slice(0, 70)}`]);
        const theirs = otherStep(s);
        return (
          <section key={i} style={S.card} data-step={s.id}>
            <div style={S.stepHead}>
              <span style={S.stepNo}>{say(`Adım ${i + 1}`, `Step ${i + 1}`)}</span>
              <span style={S.stepKind}>
                {kindLabel(s.kind)} · {dimLabel(s.dimension)}
              </span>
              <span style={S.mono}>{s.id}</span>
            </div>
            {groups.map(([title, roots]) => {
              const mine = leaves.filter((l) => roots.includes(l.path[0]));
              if (!mine.length) return null;
              const answer = roots[0] === "answer";
              return (
                <div key={title} style={answer ? S.answerBlock : S.leafGroup}>
                  <div style={S.subHead}>{title}</div>
                  {mine.map(({ path, value }) => (
                    <Leaf key={path.join(".")} label={stepLabel(s, path)} value={value}
                      readOnly={readOnly}
                      mono={path[path.length - 1] === "pattern" || path[1] === "text"}
                      options={path[1] === "correct_option" ? options : null}
                      onChange={(v) => set(["steps", i, ...path], v)}
                      below={<OtherText other={theirs} path={path} />} />
                  ))}
                </div>
              );
            })}
          </section>
        );
      })}

      {body.debrief && (
        <section style={S.card}>
          <div style={S.cardHead}>{say("Çözüm notu", "Solution note")}</div>
          {leavesOf(body.debrief).map(({ path, value }) => (
            <Leaf key={path.join(".")} label={debriefLabel(body, path)} value={value}
              readOnly={readOnly} onChange={(v) => set(["debrief", ...path], v)}
              below={<OtherText other={other} path={["debrief", ...path]} />} />
          ))}
        </section>
      )}
    </div>
  );
}

function Fact({ label, value, mono }) {
  return (
    <div style={S.fact}>
      <span style={S.factLabel}>{label}</span>
      <span style={{ ...S.factValue, ...(mono ? { fontFamily: MONO, fontSize: 12.5 } : null) }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function VariantTable({ body, set, readOnly, other = null }) {
  const variants = body.variants ?? [];
  // A variant of the other version is found by its key.
  const otherValue = (v, k) => (other?.body?.variants ?? []).find((x) => x.key === v.key)
    ?.values?.[k];
  const keys = [...new Set(variants.flatMap((v) => Object.keys(v.values ?? {})))];
  if (!variants.length) return null;
  return (
    <section style={S.card}>
      <div style={S.cardHead}>{say("Varyantlar", "Variants")}</div>
      <p style={S.hint}>
        {say("Metinlerdeki ", "The values that go in place of ")}
        <code style={S.code}>{say("{{alan}}", "{{field}}")}</code>
        {say(" yerlerine gelen değerler. Alan ya da varyant eklemek YAML'dan yapılır.",
             " in the texts. Fields and variants are added in the YAML.")}
      </p>
      {keys.length === 0 ? (
        <p style={S.hint}>{say("Bu vakada varyant alanı yok.", "This case has no variant fields.")}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={S.vTable}>
            <thead>
              <tr>
                <th style={S.vHead}>{say("Varyant", "Variant")}</th>
                {keys.map((k) => <th key={k} style={S.vHead}><span style={S.vKey}>{`{{${k}}}`}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {variants.map((v, vi) => (
                <tr key={v.key ?? vi}>
                  <td style={S.vCell}><span style={S.vLetter}>{v.key}</span></td>
                  {keys.map((k) => (
                    <td key={k} style={S.vCell}>
                      <input value={v.values?.[k] ?? ""} readOnly={readOnly}
                        style={{ ...S.input, minWidth: 140 }}
                        aria-label={say(`${v.key} varyantı: ${k}`, `Variant ${v.key}: ${k}`)}
                        onChange={(e) => set(["variants", vi, "values", k], e.target.value)} />
                      {typeof otherValue(v, k) === "string" && (
                        <span style={S.otherCell} lang={other.locale} data-other={other.locale}>
                          {otherValue(v, k)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* One field. Text grows into a text area when it is long; numbers keep what is
   being typed until it reads as a number, so "0," can become "0,8". */
function Leaf({ label, value, onChange, readOnly, mono, options, below = null }) {
  if (typeof value === "boolean") {
    return (
      <div style={S.leaf}>
        <span style={S.leafLabel}>{label}</span>
        <div style={S.miniSeg} role="group" aria-label={label}>
          {[[say("Evet", "Yes"), true], [say("Hayır", "No"), false]].map(([text, v]) => (
            <button key={text} type="button" disabled={readOnly} aria-pressed={value === v}
              onClick={() => onChange(v)}
              style={{ ...S.miniBtn, ...(value === v ? (v ? S.miniGood : S.miniBad) : null) }}>
              {text}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (typeof value === "number") {
    return <NumberLeaf label={label} value={value} onChange={onChange} readOnly={readOnly} />;
  }
  if (options) {
    return (
      <label style={S.leaf}>
        <span style={S.leafLabel}>{label}</span>
        <select value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)}
          style={S.input}>
          {!options.some(([v]) => v === value) && <option value={value}>{value}</option>}
          {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
        </select>
      </label>
    );
  }
  const long = value.length > 70 || value.includes("\n");
  const style = { ...S.input, ...(mono ? { fontFamily: MONO, fontSize: 13 } : null) };
  const lines = value.split("\n").length;
  const rows = Math.min(14, Math.max(2, lines, Math.ceil(value.length / 90)));
  return (
    <label style={S.leaf}>
      <span style={S.leafLabel}>{label}</span>
      {long
        ? <textarea value={value} readOnly={readOnly} rows={rows} style={style}
            onChange={(e) => onChange(e.target.value)} />
        : <input value={value} readOnly={readOnly} style={style}
            onChange={(e) => onChange(e.target.value)} />}
      {below}
    </label>
  );
}

function NumberLeaf({ label, value, onChange, readOnly }) {
  const lang = LANG;
  const [text, setText] = useState(dec(value));
  useEffect(() => {
    if (Number(text.replace(",", ".")) !== value) setText(dec(value));
  }, [value]);   // eslint-disable-line react-hooks/exhaustive-deps
  // A number is written again in the language on screen when that changes.
  useEffect(() => {
    setText((t) => (Number(t.replace(",", ".")) === value ? dec(value) : t));
  }, [lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label style={S.leaf}>
      <span style={S.leafLabel}>{label}</span>
      <input value={text} readOnly={readOnly} inputMode="decimal"
        style={{ ...S.input, maxWidth: 160, fontFamily: MONO }}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const n = Number(t.replace(",", "."));
          if (t.trim() !== "" && Number.isFinite(n) && !/[.,]$/.test(t)) onChange(n);
        }} />
    </label>
  );
}

/* ------------------------------ what changed ------------------------------ */

function flattenAll(obj) {
  const out = new Map();
  const visit = (v, path) => {
    if (Array.isArray(v)) {
      if (!v.length) out.set(JSON.stringify(path), []);
      v.forEach((x, i) => visit(x, [...path, i]));
      return;
    }
    if (v && typeof v === "object") {
      const keys = Object.keys(v);
      if (!keys.length) out.set(JSON.stringify(path), {});
      keys.forEach((k) => visit(v[k], [...path, k]));
      return;
    }
    out.set(JSON.stringify(path), v);
  };
  visit(obj, []);
  return out;
}

/* Every field whose value differs between the live case and the draft. */
function diffBodies(before, after) {
  const A = flattenAll(before), B = flattenAll(after);
  const keys = [...B.keys(), ...[...A.keys()].filter((k) => !B.has(k))];
  return keys
    .filter((k) => JSON.stringify(A.get(k)) !== JSON.stringify(B.get(k)))
    .map((k) => ({ path: JSON.parse(k), before: A.get(k), after: B.get(k) }));
}

/* Word by word, so a corrected number or a fixed typo inside a paragraph is
   easy to find. Very long texts are shown whole instead. */
function wordDiff(a, b) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  const n = A.length, m = B.length;
  if (n * m > 250000) return null;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  const push = (type, text) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text; else out.push({ type, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push("same", A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", A[i]); i++; }
    else { push("ins", B[j]); j++; }
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("ins", B[j++]);
  return out;
}

function shown(v) {
  if (v === undefined) return say("yok", "none");
  if (v === true) return say("Evet", "Yes");
  if (v === false) return say("Hayır", "No");
  if (typeof v === "number") return dec(v);
  if (Array.isArray(v) && !v.length) return say("boş liste", "empty list");
  if (v && typeof v === "object") return say("boş", "empty");
  return String(v);
}

function DiffView({ changes, body, live }) {
  if (!changes.length) {
    return (
      <section style={S.card} data-panel="diff">
        <div style={S.cardHead}>{say("Değişiklikler", "Changes")}</div>
        <p style={S.hint}>
          {say("Bu sürüm yayındaki sürümle aynı. Henüz bir şey değiştirilmedi.",
               "This version is the same as the live one. Nothing has been changed yet.")}
        </p>
      </section>
    );
  }
  const rows = changes.map((ch) => {
    const [where, what] = placeOf(ch.after === undefined ? live : body, ch.path);
    return { ...ch, where, what };
  });
  const sections = [...new Set(rows.map((r) => r.where))];
  return (
    <section style={S.card} data-panel="diff">
      <div style={S.cardHead}>{say("Yayındaki sürümden farkı", "Changes from the live version")}</div>
      <p style={S.hint}>
        {say("Silinenler kırmızı ve üstü çizili, eklenenler yeşil. Yalnızca değişen alanlar listelenir.",
             "Deletions are red and struck through, additions are green. Only the fields that "
             + "changed are listed.")}
      </p>
      {sections.map((sec) => (
        <div key={sec} style={S.diffSection}>
          <div style={S.subHead}>{sec}</div>
          {rows.filter((r) => r.where === sec).map((r) => {
            const words = typeof r.before === "string" && typeof r.after === "string"
              ? wordDiff(r.before, r.after) : null;
            return (
              <div key={JSON.stringify(r.path)} style={S.diffRow} data-diff={r.path.join(".")}>
                <div style={S.leafLabel}>{r.what}</div>
                {words ? (
                  <p style={S.diffText}>
                    {words.map((w, k) => (w.type === "same" ? <span key={k}>{w.text}</span>
                      : w.type === "del" ? <del key={k} style={S.del}>{w.text}</del>
                      : <ins key={k} style={S.ins}>{w.text}</ins>))}
                  </p>
                ) : (
                  <div style={S.diffPair}>
                    <span style={S.diffBefore}><del style={S.del}>{shown(r.before)}</del></span>
                    <span style={S.diffArrow}>→</span>
                    <span style={S.diffAfter}><ins style={S.ins}>{shown(r.after)}</ins></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Pill({ state }) {
  const [label, colour] = STATES[state] ?? ["—", MUTED];
  return <span style={{ ...S.pill, color: colour, borderColor: colour }}>{sayPair(label)}</span>;
}

function Field({ label, hint, children }) {
  return (
    <label style={S.field}>
      <span style={S.fieldLabel}>{label}</span>
      {hint && <span style={S.fieldHint}>{hint}</span>}
      {children}
    </label>
  );
}


/* Variants are what stop one answer circulating: the same case reaches three
   people with different names and numbers in it. They change surface content
   only — never which answer is right — so every variant defines the same keys. */
function VariantEditor({ c, set }) {
  const keys = [...new Set((c.variants || []).flatMap((v) => Object.keys(v.values || {})))];

  const setValue = (vi, key, value) =>
    set({ variants: c.variants.map((v, i) =>
      i === vi ? { ...v, values: { ...v.values, [key]: value } } : v) });

  const addKey = () => {
    const name = (prompt(say("Alan adı (ör. yer, tutar, isim)",
                             "Field name (e.g. place, amount, name)")) || "").trim();
    if (!name || keys.includes(name)) return;
    set({ variants: c.variants.map((v) => ({ ...v, values: { ...v.values, [name]: "" } })) });
  };

  const dropKey = (key) =>
    set({ variants: c.variants.map((v) => {
      const { [key]: _drop, ...rest } = v.values || {};
      return { ...v, values: rest };
    }) });

  const addVariant = () => {
    const letter = String.fromCharCode(65 + (c.variants?.length ?? 0));
    set({ variants: [...(c.variants || []),
                     { key: letter, values: Object.fromEntries(keys.map((k) => [k, ""])) }] });
  };

  return (
    <section style={S.card}>
      <div style={S.cardHead}>{say("Varyantlar", "Variants")}</div>
      <p style={S.hint}>
        {say("Aynı vaka farklı kişilere farklı ayrıntılarla gider. Metnin içine ",
             "The same case reaches different people with different details. You write ")}
        <code style={S.code}>{say("{{alan}}", "{{field}}")}</code>
        {say(" yazarsın, karşılığı buradan gelir. Haftalık vakalarda en az üç varyant olmalı.",
             " in the text, and its value comes from here. A weekly case needs at least three.")}
      </p>

      {keys.length === 0 && (
        <p style={S.hint}>{say("Henüz alan yok. Önce bir alan ekle.", "No fields yet. Add a field first.")}</p>
      )}

      {keys.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={S.vTable}>
            <thead>
              <tr>
                <th style={S.vHead}>{say("Varyant", "Variant")}</th>
                {keys.map((k) => (
                  <th key={k} style={S.vHead}>
                    <span style={S.vKey}>{`{{${k}}}`}</span>
                    <button onClick={() => dropKey(k)} style={S.dropBtn}
                      aria-label={say(`${k} alanını sil`, `Delete the field ${k}`)}>✕</button>
                  </th>
                ))}
                <th style={S.vHead} />
              </tr>
            </thead>
            <tbody>
              {(c.variants || []).map((v, vi) => (
                <tr key={v.key}>
                  <td style={S.vCell}>
                    <span style={S.vLetter}>{v.key}</span>
                  </td>
                  {keys.map((k) => (
                    <td key={k} style={S.vCell}>
                      <input value={v.values?.[k] ?? ""} style={{ ...S.input, minWidth: 150 }}
                        onChange={(e) => setValue(vi, k, e.target.value)} />
                    </td>
                  ))}
                  <td style={S.vCell}>
                    {c.variants.length > 1 && (
                      <button style={S.dropBtn} aria-label={say("varyantı sil", "Delete the variant")}
                        onClick={() => set({
                          variants: c.variants.filter((_, i) => i !== vi) })}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={S.inlineRow}>
        <button onClick={addKey} style={S.addBtn}>{say("+ alan ekle", "+ add a field")}</button>
        <button onClick={addVariant} style={S.addBtn}
          disabled={keys.length === 0}>{say("+ varyant ekle", "+ add a variant")}</button>
      </div>
    </section>
  );
}

function StepCard({ i, s, setStep, drop }) {
  return (
    <section style={S.card}>
      <div style={S.stepHead}>
        <span style={S.stepNo}>{say(`Adım ${i + 1}`, `Step ${i + 1}`)}</span>
        <span style={S.stepKind}>{kindLabel(s.kind)}</span>
        <button onClick={drop} style={S.dropBtn} aria-label={say("adımı sil", "Delete the step")}>✕</button>
      </div>

      <div style={S.row3}>
        <Field label={say("Yetkinlik alanı", "Area")}>
          <select value={s.dimension} onChange={(e) => setStep(i, { dimension: e.target.value })}
            style={S.input}>
            {DIMENSIONS.map(([k, tr, en]) => <option key={k} value={k}>{say(tr, en)}</option>)}
          </select>
        </Field>
        <Field label={say("Puan", "Points")}>
          <input type="number" min="1" max="10" value={s.points} style={S.input}
            onChange={(e) => setStep(i, { points: Number(e.target.value) })} />
        </Field>
        <Field label={say("Güven düzeyi sorulsun mu", "Ask for confidence")}>
          {s.kind === "branching" ? (
            <select value="0" disabled style={S.input}>
              <option value="0">
                {say("Hayır (dallanan adımda sorulmaz)", "No (not asked in a branching step)")}
              </option>
            </select>
          ) : (
            <select value={s.confidence ? "1" : "0"} style={S.input}
              onChange={(e) => setStep(i, { confidence: e.target.value === "1" })}>
              <option value="1">{say("Evet", "Yes")}</option>
              <option value="0">{say("Hayır", "No")}</option>
            </select>
          )}
        </Field>
      </div>

      <Field label={say("Yönerge", "Prompt")}
        hint={say("Vakayı çözen kişiden ne istediğini yaz.", "What the person is asked to do.")}>
        <textarea rows={2} value={s.prompt} style={S.input}
          onChange={(e) => setStep(i, { prompt: e.target.value })} />
      </Field>

      {s.kind === "span_select" && (
        <Field label={say("Metin", "Text")}
          hint={say("Doğru cevabı [[ çift köşeli parantez ]] arasına al. Vakayı çözen kişi parantezleri görmez.",
                    "Put the correct answer between [[ double square brackets ]]. The person solving the case does not see the brackets.")}>
          <textarea rows={6} value={s.text} style={{ ...S.input, fontFamily: MONO, fontSize: 13 }}
            onChange={(e) => setStep(i, { text: e.target.value })} />
        </Field>
      )}

      {s.kind === "source_verify" && (
        <ListEditor
          label={say("Künyeler", "References")}
          hint={say("Hem gerçek hem uydurma künye olmalı. Hepsi aynı olursa her künyeye aynı cevabı veren tam puan alır.",
                    "There should be both real and fabricated references. If they are all the same, giving every reference the same answer earns full points.")}
          rows={s.items}
          onChange={(items) => setStep(i, { items })}
          blank={{ id: `s${(s.items?.length ?? 0) + 1}`, citation: "", exists: false, evidence: "" }}
          render={(it, upd) => (
            <>
              <textarea rows={2} value={it.citation} placeholder={say("Künye", "Reference")}
                style={{ ...S.input, fontSize: 13 }}
                onChange={(e) => upd({ citation: e.target.value })} />
              <div style={S.inlineRow}>
                <div style={S.miniSeg}>
                  {[[say("Gerçek", "Real"), true], [say("Uydurma", "Fabricated"), false]].map(([lab, v]) => (
                    <button key={lab} onClick={() => upd({ exists: v })}
                      style={{
                        ...S.miniBtn,
                        ...(it.exists === v
                          ? (v ? S.miniGood : S.miniBad) : null),
                      }}>{lab}</button>
                  ))}
                </div>
                <input value={it.evidence}
                  placeholder={say("Açıklama (çözüm notunda görünür)", "Explanation (shown in the solution note)")}
                  style={{ ...S.input, fontSize: 13 }}
                  onChange={(e) => upd({ evidence: e.target.value })} />
              </div>
            </>
          )} />
      )}

      {s.kind === "pattern_check" && (
        <>
          <Field label={say("Başlangıç metni", "Starting text")}
            hint={say("Kişi bunu düzeltecek.", "The person will correct this.")}>
            <textarea rows={3} value={s.seed} style={S.input}
              onChange={(e) => setStep(i, { seed: e.target.value })} />
          </Field>
          <RuleEditor label={say("Kalmamalı", "Must not remain")} colour={ACCENT} rows={s.forbidden}
            onChange={(forbidden) => setStep(i, { forbidden })} hard />
          <RuleEditor label={say("Kalmalı", "Must remain")} colour={GOOD} rows={s.required}
            onChange={(required) => setStep(i, { required })} />
        </>
      )}

      {s.kind === "reasoned_choice" && (
        <>
          <ListEditor
            label={say("Seçenekler", "Options")} hint={say("Doğru olanı işaretle.", "Mark the correct one.")}
            rows={s.options} onChange={(options) => setStep(i, { options })}
            blank={{ id: `o${(s.options?.length ?? 0) + 1}`, text: "" }}
            render={(it, upd) => (
              <div style={S.inlineRow}>
                <button onClick={() => setStep(i, { correct: it.id })}
                  style={{ ...S.markBtn, ...(s.correct === it.id ? S.markOn : null) }}>
                  {s.correct === it.id ? say("doğru", "correct") : say("işaretle", "mark")}
                </button>
                <input value={it.text} placeholder={say("Seçenek", "Option")} style={S.input}
                  onChange={(e) => upd({ text: e.target.value })} />
              </div>
            )} />
          <ListEditor
            label={say("Gerekçeler", "Reasons")}
            hint={say("Biri tam puan (1,0) almalı. Makul ama yüzeysel gerekçeye kısmi puan ver. Sıfır verirsen adım çoktan seçmeli bir teste döner.",
                      "One must earn full points (1.0). Give a reasonable but shallow reason partial points. If you give it zero, the step becomes a multiple-choice test.")}
            rows={s.reasons} onChange={(reasons) => setStep(i, { reasons })}
            blank={{ id: `r${(s.reasons?.length ?? 0) + 1}`, text: "", weight: 0 }}
            render={(it, upd) => (
              <div style={S.inlineRow}>
                <select value={String(it.weight)} style={{ ...S.input, maxWidth: 96 }}
                  onChange={(e) => upd({ weight: Number(e.target.value) })}>
                  {[1, 0.8, 0.6, 0.4, 0.2, 0].map((w) => (
                    <option key={w} value={w}>{dec(w.toFixed(1))}</option>
                  ))}
                </select>
                <input value={it.text} placeholder={say("Gerekçe", "Reason")} style={S.input}
                  onChange={(e) => upd({ text: e.target.value })} />
              </div>
            )} />
        </>
      )}

      {s.kind === "branching" && (
        <BranchEditor s={s} onChange={(patch) => setStep(i, patch)} />
      )}

      <div style={S.row2}>
        <Field label={say("Doğru cevaba dönüt", "Feedback on a correct answer")}>
          <textarea rows={2} value={s.feedbackOk} style={S.input}
            onChange={(e) => setStep(i, { feedbackOk: e.target.value })} />
        </Field>
        <Field label={say("Yanlış cevaba dönüt", "Feedback on a wrong answer")}
          hint={say("Neden yanlış olduğunu söyle.", "Say why it is wrong.")}>
          <textarea rows={2} value={s.feedbackNo} style={S.input}
            onChange={(e) => setStep(i, { feedbackNo: e.target.value })} />
        </Field>
      </div>
    </section>
  );
}

function ListEditor({ label, hint, rows = [], onChange, blank, render }) {
  const upd = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div style={S.field}>
      <span style={S.fieldLabel}>{label}</span>
      {hint && <span style={S.fieldHint}>{hint}</span>}
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} style={S.listRow}>
            <div style={{ flex: 1, display: "grid", gap: 6 }}>{render(r, (p) => upd(i, p))}</div>
            <button onClick={() => onChange(rows.filter((_, k) => k !== i))}
              style={S.dropBtn} aria-label={say("sil", "Delete")}>✕</button>
          </div>
        ))}
        <button onClick={() => onChange([...rows, { ...blank }])} style={S.addBtn}>
          {say("+ ekle", "+ add")}
        </button>
      </div>
    </div>
  );
}

function RuleEditor({ label, colour, rows = [], onChange, hard }) {
  return (
    <div style={S.field}>
      <span style={{ ...S.fieldLabel, color: colour }}>{label}</span>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} style={S.listRow}>
            <input value={r.label} placeholder={say("Ne olduğu, ör. kimlik numarası", "What it is, e.g. ID number")}
              style={S.input}
              onChange={(e) => onChange(rows.map((x, k) => k === i ? { ...x, label: e.target.value } : x))} />
            <input value={r.pattern} placeholder={say("Aranacak kalıp", "Pattern to search for")}
              style={{ ...S.input, fontFamily: MONO, fontSize: 12.5 }}
              onChange={(e) => onChange(rows.map((x, k) => k === i ? { ...x, pattern: e.target.value } : x))} />
            {hard && (
              <button
                onClick={() => onChange(rows.map((x, k) => k === i ? { ...x, hard: !x.hard } : x))}
                style={{ ...S.markBtn, ...(r.hard ? S.markOn : null) }}
                title={say("Bu kalıp kalırsa adım sıfır alır",
                           "If this pattern remains, the step scores zero")}>
                {r.hard ? say("puanı sıfırlar", "zeroes the score") : say("puanı düşürür", "lowers the score")}
              </button>
            )}
            <button onClick={() => onChange(rows.filter((_, k) => k !== i))}
              style={S.dropBtn} aria-label={say("sil", "Delete")}>✕</button>
          </div>
        ))}
        <button onClick={() => onChange([...rows, { label: "", pattern: "", hard: false }])}
          style={S.addBtn}>{say("+ kural ekle", "+ add a rule")}</button>
      </div>
    </div>
  );
}

function BranchEditor({ s, onChange }) {
  const nodes = s.nodes || [];
  const upd = (i, patch) =>
    onChange({ nodes: nodes.map((n, k) => (k === i ? { ...n, ...patch } : n)) });
  const addNode = (terminal) =>
    onChange({ nodes: [...nodes, { id: `n${nodes.length + 1}`, text: "", terminal, options: [] }] });

  return (
    <div style={S.field}>
      <span style={S.fieldLabel}>{say("Karar ağacı", "Decision tree")}</span>
      <span style={S.fieldHint}>
        {say('Her seçenek bir sonuç değeri taşır ve bir düğüme gider. Geri alınamayan '
             + 'durumlarda puanlamada "En kötü karar sayılır" seçeneğini seç.',
             "Each option carries an outcome value and leads to a node. Where a situation "
             + 'cannot be undone, choose "The worst decision counts" for the scoring.')}
      </span>
      <div style={S.inlineRow}>
        <select value={s.scoring} style={{ ...S.input, maxWidth: 220 }}
          onChange={(e) => onChange({ scoring: e.target.value })}>
          <option value="path_min">{say("En kötü karar sayılır", "The worst decision counts")}</option>
          <option value="path_mean">{say("Kararların ortalaması", "The average of the decisions")}</option>
        </select>
      </div>
      <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
        {nodes.map((n, i) => (
          <div key={i} style={S.node}>
            <div style={S.inlineRow}>
              <input value={n.id} style={{ ...S.input, maxWidth: 90, fontFamily: MONO }}
                onChange={(e) => upd(i, { id: e.target.value })} />
              <span style={S.nodeKind}>{n.terminal ? say("bitiş", "end") : say("karar", "decision")}</span>
              <button onClick={() => onChange({ nodes: nodes.filter((_, k) => k !== i) })}
                style={S.dropBtn} aria-label={say("sil", "Delete")}>✕</button>
            </div>
            <textarea rows={2} value={n.text} placeholder={say("Durum metni", "Situation text")}
              style={S.input} onChange={(e) => upd(i, { text: e.target.value })} />
            {!n.terminal && (
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                {(n.options || []).map((o, k) => (
                  <div key={k} style={S.inlineRow}>
                    <select value={String(o.outcome ?? 0)} style={{ ...S.input, maxWidth: 90 }}
                      onChange={(e) => upd(i, {
                        options: n.options.map((x, j) =>
                          j === k ? { ...x, outcome: Number(e.target.value) } : x),
                      })}>
                      {[1, 0.7, 0.4, 0.1, 0].map((w) => (
                        <option key={w} value={w}>{dec(w.toFixed(1))}</option>
                      ))}
                    </select>
                    <input value={o.text} placeholder={say("Seçenek", "Option")} style={S.input}
                      onChange={(e) => upd(i, {
                        options: n.options.map((x, j) =>
                          j === k ? { ...x, text: e.target.value } : x),
                      })} />
                    <select value={o.next || ""} style={{ ...S.input, maxWidth: 110 }}
                      onChange={(e) => upd(i, {
                        options: n.options.map((x, j) =>
                          j === k ? { ...x, next: e.target.value } : x),
                      })}>
                      <option value="">{say("→ nereye", "→ where to")}</option>
                      {nodes.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                    </select>
                  </div>
                ))}
                <button style={S.addBtn}
                  onClick={() => upd(i, {
                    options: [...(n.options || []),
                              { id: `o${(n.options?.length ?? 0) + 1}`, text: "", outcome: 0, next: "" }],
                  })}>{say("+ seçenek", "+ option")}</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={S.inlineRow}>
        <button onClick={() => addNode(false)} style={S.addBtn}>
          {say("+ karar düğümü", "+ decision node")}
        </button>
        <button onClick={() => addNode(true)} style={S.addBtn}>
          {say("+ bitiş düğümü", "+ end node")}
        </button>
      </div>
    </div>
  );
}

/* The case as a person meets it, in any of its variants. With the answers
   shown it becomes the reviewer's view: the marked passages, which sources are
   real, the right option and the weight of every reason, where each decision
   leads. A browser never receives a case in this form; the editor builds it
   from the draft the author or reviewer is already allowed to read. */
function BodyPreview({ body, caseLang }) {
  const variants = body.variants ?? [];
  const [vk, setVk] = useState(variants[0]?.key ?? null);
  const [answers, setAnswers] = useState(false);
  const values = variants.find((v) => v.key === vk)?.values ?? {};
  const sub = (t) => String(t ?? "").replace(/\{\{(\w+)\}\}/g, (m, k) => values[k] ?? m);
  const steps = body.steps ?? [];
  // The case's own text is marked with the language it is written in, which
  // can differ from the interface around it.
  const cl = caseLang ?? body.language;
  const kindTitle = { weekly: say("HAFTANIN VAKASI", "CASE OF THE WEEK"),
                      core: say("TEMEL VAKA", "CORE CASE") }[body.type] ?? say("VAKA", "CASE");
  const title = sub(body.title);
  return (
    <section style={S.card} data-panel="preview">
      <div style={S.headRow}>
        <div style={{ ...S.cardHead, marginBottom: 0 }}>{say("Önizleme", "Preview")}</div>
        <div style={S.inlineRow}>
          {variants.length > 1 && (
            <div style={S.miniSeg} role="group" aria-label={say("Varyant", "Variant")}>
              {variants.map((v) => (
                <button key={v.key} type="button" onClick={() => setVk(v.key)}
                  aria-pressed={vk === v.key} data-variant={v.key}
                  style={{ ...S.miniBtn, ...(vk === v.key ? S.miniOn : null) }}>{v.key}</button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setAnswers((x) => !x)} aria-pressed={answers}
            data-action="show-answers"
            style={{ ...S.markBtn, ...(answers ? S.markOn : null) }}>
            {answers ? say("Cevapları gizle", "Hide the answers")
                     : say("Cevapları göster", "Show the answers")}
          </button>
        </div>
      </div>
      <p style={S.hint}>
        {answers
          ? say("Cevaplar yalnızca bu görünümde. Kişi doğru cevabı ancak adımı bitirince görür.",
                "The answers are shown only in this view. People see the right answer only after "
                + "finishing the step.")
          : say("Vakayı çözen kişinin gördüğü hâli. Cevap anahtarı ve dönütler bu görünümde yok.",
                "The case as the person solving it sees it. The answer key and feedback are not in this view.")}
      </p>
      <div style={S.previewBox}>
        <div style={S.pvKind}>{kindTitle}</div>
        <h2 style={S.pvTitle} lang={title ? cl : undefined}>
          {title || say("Adsız vaka", "Untitled case")}
        </h2>
        <p style={S.pvBody} lang={cl}>{sub(body.context)}</p>
        {steps.map((s, i) => (
          <PreviewStep key={s.id ?? i} s={s} i={i} n={steps.length} sub={sub} answers={answers}
            cl={cl} />
        ))}
        {answers && body.debrief && (
          <div style={S.pvStep}>
            <div style={S.pvStepNo}>{say("Çözüm notu", "Solution note")}</div>
            <p style={S.pvBody} lang={cl}>{sub(body.debrief.summary)}</p>
            {body.debrief.takeaway && (
              <p style={S.pvText} lang={cl}><b>{sub(body.debrief.takeaway)}</b></p>
            )}
            {(body.debrief.sources ?? []).filter(Boolean).map((src, k) => (
              <div key={k} style={S.pvMeta} lang={cl}>{sub(src)}</div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PreviewStep({ s, i, n, sub, answers, cl }) {
  const p = s.payload ?? {}, a = s.answer ?? {};
  return (
    <div style={S.pvStep} data-preview-step={s.id}>
      <div style={S.pvStepNo}>
        {say(`Adım ${i + 1} / ${n}`, `Step ${i + 1} / ${n}`)}
        {answers
          ? ` · ${kindLabel(s.kind)} · ${say(`${s.points} puan`, plural(s.points, "point", "points"))}`
          : ""}
      </div>
      <p style={S.pvPrompt} lang={cl}>{sub(s.prompt) || "—"}</p>

      {s.kind === "span_select" && (
        <p style={S.pvText} lang={cl}>
          {sub(p.text).split(/\[\[(.+?)\]\]/s).map((part, k) => (
            k % 2 && answers ? <mark key={k} style={S.target}>{part}</mark>
              : <span key={k}>{part}</span>))}
        </p>
      )}

      {s.kind === "source_verify" && (p.items ?? []).map((it) => {
        const truth = a.truth?.[it.id];
        return (
          <div key={it.id} style={{ ...S.pvItem, ...(answers && truth
            ? (truth.exists ? S.pvRight : S.pvWrong) : null) }}>
            <span lang={cl}>{sub(it.citation) || "—"}</span>
            {answers && truth && (
              <div style={S.pvMeta}>
                <b>{truth.exists ? say("Gerçek", "Real") : say("Uydurma", "Fabricated")}.</b>{" "}
                <span lang={cl}>{sub(truth.evidence)}</span>
              </div>
            )}
          </div>
        );
      })}

      {s.kind === "pattern_check" && (
        <>
          <p style={S.pvText} lang={cl}>{sub(p.seed_text)}</p>
          {p.hint && (
            <div style={S.pvMeta}>
              {say("İpucu: ", "Hint: ")}<span lang={cl}>{sub(p.hint)}</span>
            </div>
          )}
          {answers && (
            <div style={S.pvRules}>
              {(a.forbidden ?? []).map((r, k) => (
                <div key={`f${k}`} style={S.pvMeta}>
                  {say("Kalmamalı: ", "Must not remain: ")}<span lang={cl}>{r.label}</span>
                  {r.hard_fail
                    ? say(" (kalırsa adım sıfır alır)", " (if it remains, the step scores zero)")
                    : ""}
                </div>
              ))}
              {(a.required ?? []).map((r, k) => (
                <div key={`r${k}`} style={S.pvMeta}>
                  {say("Kalmalı: ", "Must remain: ")}<span lang={cl}>{r.label}</span>
                </div>
              ))}
              {a.model_answer && (
                <p style={S.pvText}>
                  {say("Örnek cevap: ", "Model answer: ")}<span lang={cl}>{sub(a.model_answer)}</span>
                </p>
              )}
            </div>
          )}
        </>
      )}

      {s.kind === "reasoned_choice" && (
        <>
          {(p.options ?? []).map((o) => (
            <div key={o.id} style={{ ...S.pvItem, ...(answers && o.id === a.correct_option
              ? S.pvRight : null) }}>
              <span lang={cl}>{sub(o.text) || "—"}</span>
              {answers && o.id === a.correct_option && (
                <span style={S.pvTag}>{say("doğru seçenek", "correct option")}</span>
              )}
            </div>
          ))}
          {(p.reasons ?? []).length > 0 && (
            <div style={S.pvStepNo}>{say("Gerekçeler", "Reasons")}</div>
          )}
          {(p.reasons ?? []).map((r) => (
            <div key={r.id} style={S.pvItem}>
              <span lang={cl}>{sub(r.text) || "—"}</span>
              {answers && (
                <span style={S.pvTag}>
                  {say("ağırlık ", "weight ")}{dec(a.reason_weights?.[r.id] ?? 0)}
                </span>
              )}
            </div>
          ))}
        </>
      )}

      {s.kind === "branching" && (
        answers ? (p.nodes ?? []).map((node) => (
          <div key={node.id} style={S.pvNode}>
            <div style={S.pvStepNo}>{node.id}{node.terminal ? say(" · bitiş", " · end") : ""}</div>
            <p style={S.pvText} lang={cl}>{sub(node.text)}</p>
            {(node.options ?? []).map((o) => (
              <div key={o.id} style={S.pvItem}>
                <span lang={cl}>{sub(o.text) || "—"}</span>
                <span style={S.pvTag}>
                  {say(`sonuç ${dec(o.outcome)} · ${o.next} düğümüne`,
                       `outcome ${dec(o.outcome)} · to node ${o.next}`)}
                </span>
              </div>
            ))}
          </div>
        )) : (p.nodes ?? []).filter((node) => node.id === (p.start ?? p.nodes?.[0]?.id))
          .map((node) => (
            <div key={node.id}>
              <p style={S.pvText} lang={cl}>{sub(node.text)}</p>
              {(node.options ?? []).map((o) => (
                <div key={o.id} style={S.pvItem} lang={cl}>{sub(o.text) || "—"}</div>
              ))}
            </div>
          ))
      )}

      {s.confidence && s.kind !== "branching" && (
        <div style={S.pvConf}>{say("Bu cevaptan ne kadar eminsin?", "How confident are you?")}</div>
      )}
      {answers && s.feedback && (
        <div style={S.pvFeedback}>
          {s.feedback.correct && (
            <div>
              <b>{say("Doğru cevaba dönüt:", "Feedback on a correct answer:")}</b>{" "}
              <span lang={cl}>{sub(s.feedback.correct)}</span>
            </div>
          )}
          {s.feedback.incorrect && (
            <div>
              <b>{say("Yanlış cevaba dönüt:", "Feedback on a wrong answer:")}</b>{" "}
              <span lang={cl}>{sub(s.feedback.incorrect)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- styles --------------------------------- */

const CSS = `${THEME_CSS}
* { box-sizing: border-box; }
input, textarea, select, button { font-family: inherit; }
textarea { resize: vertical; }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: 2px solid ${ACCENT}; outline-offset: 2px;
}
`;

const S = {
  root: { background: PAPER, color: TEXT, fontFamily: DISPLAY,
          maxWidth: 1180, margin: "0 auto", padding: "0 18px 40px" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 16, flexWrap: "wrap", padding: "22px 2px 14px" },
  eyebrow: { fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", color: MUTED },
  h1: { margin: "5px 0 8px", fontSize: 27, fontWeight: 700, letterSpacing: "-.025em" },
  subline: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  mono: { fontFamily: MONO, fontSize: 11.5, color: MUTED },
  headActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  pill: { fontFamily: MONO, fontSize: 10.5, border: "1px solid", borderRadius: 99,
          padding: "2px 9px" },
  langChip: { fontFamily: MONO, fontSize: 10, letterSpacing: ".06em", color: MUTED,
              border: `1px solid ${LINE}`, borderRadius: 4, padding: "1px 5px",
              background: CARD, whiteSpace: "nowrap" },
  /* Quiet on purpose. The marks identify the system and stay in the
     background. */
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
  offline: { fontSize: 13, lineHeight: 1.5, color: WARN_TEXT, background: "var(--warn-soft)",
             border: `1px solid ${WARN}`, borderRadius: 8, padding: "9px 12px",
             margin: "0 2px 12px" },
  flash: { fontFamily: MONO, fontSize: 12, color: GOOD, background: "rgba(78,124,89,.09)",
           border: `1px solid ${GOOD}`, borderRadius: 8, padding: "8px 12px",
           margin: "0 2px 12px" },

  tabs: { display: "flex", gap: 4, borderBottom: `1px solid ${LINE}`, marginBottom: 14,
          overflowX: "auto", scrollbarWidth: "thin" },
  tab: { padding: "11px 16px", minHeight: 44, background: "none", border: "none",
         // Repeated as a longhand so that leaving the "on" style resets it.
         borderBottom: "2px solid transparent", borderBottomColor: "transparent",
         whiteSpace: "nowrap", flexShrink: 0, color: MUTED, fontSize: 14.5,
         cursor: "pointer" },
  tabOn: { color: TEXT, borderBottomColor: ACCENT, fontWeight: 600 },

  body: { display: "grid", gap: 14, alignItems: "start" },
  card: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 12,
          padding: 18, marginBottom: 12 },
  cardHead: { fontSize: 15, fontWeight: 700, marginBottom: 12 },
  hint: { fontSize: 13, color: MUTED, margin: "-6px 0 12px", lineHeight: 1.5 },

  field: { display: "block", marginBottom: 14 },
  fieldLabel: { display: "block", fontFamily: MONO, fontSize: 10.5, letterSpacing: ".08em",
                textTransform: "uppercase", color: MUTED, marginBottom: 4 },
  fieldHint: { display: "block", fontSize: 12.5, color: MUTED, marginBottom: 6,
               lineHeight: 1.45 },
  input: { width: "100%", minHeight: 40, padding: "9px 11px", borderRadius: 8,
           border: `1px solid ${LINE}`, background: "var(--soft)", color: TEXT,
           fontSize: 14, lineHeight: 1.5 },
  row2: { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" },
  row3: { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" },
  inlineRow: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },

  stepHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
              paddingBottom: 10, borderBottom: `1px solid ${LINE}` },
  stepNo: { fontFamily: MONO, fontSize: 11, color: ACCENT, letterSpacing: ".08em" },
  stepKind: { display: "flex", alignItems: "center", gap: 8, flex: 1,
              fontSize: 14.5, fontWeight: 600 },
  dropBtn: { background: "none", border: "none", color: MUTED, fontSize: 14,
             cursor: "pointer", padding: 6, minHeight: 34 },

  code: { fontFamily: MONO, fontSize: 12, background: "var(--fill)",
          border: `1px solid ${LINE}`, borderRadius: 3, padding: "1px 5px" },
  vTable: { borderCollapse: "collapse", width: "100%", marginBottom: 12 },
  vHead: { textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${LINE}`,
           fontFamily: MONO, fontSize: 11, color: MUTED, whiteSpace: "nowrap" },
  vKey: { color: ACCENT },
  vCell: { padding: "6px 8px", borderBottom: `1px solid ${LINE}`, verticalAlign: "middle" },
  vLetter: { fontFamily: MONO, fontSize: 14, fontWeight: 600 },
  kindGrid: { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" },
  kindBtn: { display: "grid", gap: 3, textAlign: "left", padding: "12px 14px",
             borderRadius: 9, border: `1px solid ${LINE}`, background: "var(--soft)",
             cursor: "pointer", color: TEXT },
  kindTop: { display: "flex", alignItems: "center", gap: 8 },
  kindIcon: { display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, borderRadius: 9, background: "var(--fill)",
              color: ACCENT, flexShrink: 0 },
  kindName: { fontSize: 14, fontWeight: 600 },
  kindWhat: { fontSize: 12.5, color: MUTED, lineHeight: 1.4 },

  listRow: { display: "flex", gap: 8, alignItems: "flex-start",
             padding: "10px 11px", border: `1px solid ${LINE}`, borderRadius: 9 },
  addBtn: { padding: "8px 13px", minHeight: 38, borderRadius: 8,
            border: `1px dashed ${LINE}`, background: "transparent", color: MUTED,
            fontSize: 13, cursor: "pointer" },
  markBtn: { padding: "7px 12px", minHeight: 36, borderRadius: 8, whiteSpace: "nowrap",
             border: `1px solid ${LINE}`, borderColor: LINE, background: CARD, color: MUTED,
             fontFamily: MONO, fontSize: 11.5, cursor: "pointer" },
  markOn: { background: ACCENT, borderColor: ACCENT, color: "var(--on-accent)" },
  miniSeg: { display: "flex", border: `1px solid ${LINE}`, borderRadius: 7, overflow: "hidden" },
  miniBtn: { padding: "7px 12px", minHeight: 36, background: CARD, border: "none",
             color: MUTED, fontSize: 12.5, cursor: "pointer" },
  miniGood: { background: GOOD, color: "var(--on-accent)", fontWeight: 600 },
  miniBad: { background: ACCENT, color: "var(--on-accent)", fontWeight: 600 },

  node: { border: `1px solid ${LINE}`, borderRadius: 9, padding: 11 },
  nodeKind: { flex: 1, fontFamily: MONO, fontSize: 11, color: MUTED },

  side: { display: "grid", gap: 12, position: "sticky", top: 12 },
  sideCard: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 },
  sideHead: { display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 8, fontSize: 14.5, fontWeight: 700, marginBottom: 10 },
  badge: { fontFamily: MONO, fontSize: 10.5, color: "var(--on-accent)", borderRadius: 99,
           padding: "2px 9px" },
  clean: { fontSize: 13, color: GOOD, margin: 0 },
  problem: { borderLeft: "2px solid", paddingLeft: 10, marginBottom: 10 },
  problemWhere: { fontFamily: MONO, fontSize: 10.5, color: MUTED },
  problemMsg: { fontSize: 13, lineHeight: 1.45 },
  sideNote: { fontSize: 12, color: MUTED, lineHeight: 1.5, marginTop: 12,
              paddingTop: 10, borderTop: `1px solid ${LINE}` },

  flow: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 },
  flowItem: { display: "flex", gap: 10, alignItems: "flex-start" },
  flowNum: { fontFamily: MONO, fontSize: 10.5, color: ACCENT, paddingTop: 2 },
  flowA: { display: "block", fontSize: 13.5, fontWeight: 600 },
  flowB: { display: "block", fontSize: 12, color: MUTED, lineHeight: 1.4 },

  previewBox: { border: `1px solid ${LINE}`, borderRadius: 10, padding: 16,
                background: "var(--soft)" },
  pvKind: { fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: ACCENT },
  pvTitle: { fontSize: 20, fontWeight: 700, margin: "6px 0 10px", letterSpacing: "-.02em" },
  pvBody: { fontSize: 14.5, lineHeight: 1.6, margin: "0 0 16px" },
  pvStep: { borderTop: `1px solid ${LINE}`, paddingTop: 12, marginTop: 12 },
  pvStepNo: { fontFamily: MONO, fontSize: 10.5, color: MUTED },
  pvPrompt: { fontSize: 15, fontWeight: 600, lineHeight: 1.45, margin: "6px 0 10px" },
  pvText: { fontSize: 14, lineHeight: 1.75, background: CARD, border: `1px solid ${LINE}`,
            borderRadius: 8, padding: "10px 12px", margin: "0 0 8px" },
  pvItem: { fontSize: 13.5, lineHeight: 1.45, background: CARD, border: `1px solid ${LINE}`,
            borderRadius: 8, padding: "9px 11px", marginBottom: 6 },
  pvConf: { fontFamily: MONO, fontSize: 11.5, color: MUTED, marginTop: 8 },

  primary: { minHeight: 42, padding: "0 18px", borderRadius: 9, border: "none",
             background: ACCENT, color: "var(--on-accent)", fontSize: 14, fontWeight: 600,
             cursor: "pointer" },
  quiet: { minHeight: 42, padding: "0 12px", borderRadius: 9, border: "none",
           background: "none", color: MUTED, fontSize: 13.5, cursor: "pointer",
           textDecoration: "underline", textUnderlineOffset: 3 },
  ghost: { minHeight: 42, padding: "0 16px", borderRadius: 9, border: `1px solid ${LINE}`,
           background: CARD, color: TEXT, fontSize: 14, cursor: "pointer" },
  disabled: { background: "var(--line)", color: "var(--faint)", cursor: "not-allowed" },
  foot: { fontSize: 11.5, color: MUTED, textAlign: "center", marginTop: 20, lineHeight: 1.6 },

  loading: { fontSize: 13.5, color: MUTED, padding: "40px 2px" },
  lead: { fontSize: 14, color: MUTED, margin: 0, maxWidth: "62ch", lineHeight: 1.5 },
  count: { fontFamily: MONO, fontSize: 11, color: MUTED, marginLeft: 8, fontWeight: 400 },
  emptyLine: { fontSize: 13.5, color: MUTED, margin: 0 },
  rows: { display: "grid", gap: 6 },
  draftRow: { display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
              padding: "11px 12px", borderRadius: 10, border: `1px solid ${LINE}`,
              background: "var(--soft)", color: TEXT, cursor: "pointer", flexWrap: "wrap" },
  draftMain: { display: "grid", gap: 2, flex: 1, minWidth: 220 },
  draftTitle: { fontSize: 14.5, fontWeight: 600 },
  draftMeta: { fontFamily: MONO, fontSize: 11, color: MUTED, overflowWrap: "anywhere" },
  draftNote: { fontSize: 12.5, color: ACCENT, lineHeight: 1.4 },
  draftGo: { fontSize: 13, fontWeight: 600, color: ACCENT, whiteSpace: "nowrap" },
  backBtn: { background: "none", border: "none", padding: "16px 0 0", color: MUTED,
             fontSize: 13.5, cursor: "pointer" },
  fieldset: { border: 0, padding: 0, margin: 0, minWidth: 0 },
  confirmBox: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "10px 12px", margin: "0 2px 12px", borderRadius: 9,
                border: `1px solid ${ACCENT}`, background: "rgba(192,0,0,.05)", fontSize: 13.5 },
  statusLine: { fontSize: 13.5, color: TEXT, background: "var(--fill)", border: `1px solid ${LINE}`,
                borderRadius: 8, padding: "9px 12px", margin: "0 2px 12px", lineHeight: 1.5 },
  unsaved: { fontSize: 12.5, color: WARN_TEXT, margin: "0 2px 10px" },
  noteBox: { border: `1px solid ${ACCENT}`, borderRadius: 10, background: "rgba(192,0,0,.04)",
             padding: "10px 12px", margin: "0 2px 12px" },
  noteHead: { fontSize: 12.5, fontWeight: 700, color: ACCENT, marginBottom: 4 },
  noteText: { fontSize: 14, lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" },
  sideText: { fontSize: 12.5, color: MUTED, lineHeight: 1.5, margin: "0 0 10px" },
  reportItem: { borderLeft: `2px solid ${WARN}`, paddingLeft: 10, marginBottom: 10 },

  facts: { display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 },
  fact: { display: "grid", gap: 2 },
  factLabel: { fontSize: 11.5, color: MUTED },
  factValue: { fontSize: 13.5, fontWeight: 600 },
  leaf: { display: "grid", gap: 4, marginBottom: 12 },
  otherText: { display: "grid", gap: 2, padding: "6px 10px", borderLeft: `3px solid ${LINE}`,
               background: "var(--soft)", borderRadius: "0 6px 6px 0" },
  otherLabel: { fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: MUTED,
                textTransform: "uppercase" },
  otherBody: { fontSize: 12.5, lineHeight: 1.5, color: MUTED, whiteSpace: "pre-wrap",
               overflowWrap: "anywhere" },
  otherCell: { display: "block", fontSize: 11.5, color: MUTED, marginTop: 3, lineHeight: 1.35 },
  leafLabel: { fontSize: 12.5, fontWeight: 600, color: TEXT },
  leafGroup: { marginTop: 4 },
  answerBlock: { marginTop: 4, padding: "10px 12px 2px", borderLeft: `3px solid ${ACCENT}`,
                 background: "rgba(192,0,0,.03)", borderRadius: "0 8px 8px 0", marginBottom: 12 },
  subHead: { fontSize: 12, fontWeight: 700, color: MUTED, margin: "6px 0 8px" },
  miniOn: { background: TEXT, color: "var(--card)", fontWeight: 600 },
  headRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
             flexWrap: "wrap", marginBottom: 12 },
  yamlArea: { width: "100%", minHeight: 420, padding: "12px 14px", borderRadius: 8,
              border: `1px solid ${LINE}`, background: "var(--soft)", color: TEXT,
              fontFamily: MONO, fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre",
              overflowWrap: "normal", overflowX: "auto" },
  yamlError: { fontSize: 13, color: ACCENT, background: "rgba(192,0,0,.06)",
               border: `1px solid ${ACCENT}`, borderRadius: 8, padding: "8px 11px",
               marginBottom: 10 },

  diffSection: { marginBottom: 10 },
  diffRow: { padding: "8px 0 10px", borderTop: `1px solid ${LINE}` },
  diffText: { fontSize: 14, lineHeight: 1.65, margin: "4px 0 0", whiteSpace: "pre-wrap" },
  del: { background: "rgba(192,0,0,.12)", color: "var(--accent-strong)", textDecorationThickness: 1 },
  ins: { background: "rgba(78,124,89,.16)", color: "var(--good-text)", textDecoration: "none" },
  diffPair: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginTop: 4,
              fontSize: 14 },
  diffBefore: {}, diffAfter: {},
  diffArrow: { color: MUTED },

  target: { background: "rgba(192,0,0,.14)", color: TEXT, borderRadius: 3, padding: "0 2px" },
  pvRight: { borderColor: GOOD, background: "rgba(78,124,89,.07)" },
  pvWrong: { borderColor: ACCENT, background: "rgba(192,0,0,.05)" },
  pvMeta: { fontSize: 12.5, color: MUTED, lineHeight: 1.5, marginTop: 4 },
  pvTag: { display: "inline-block", marginLeft: 8, fontFamily: MONO, fontSize: 11, color: MUTED },
  pvRules: { marginTop: 6 },
  pvNode: { borderLeft: `2px solid ${LINE}`, paddingLeft: 10, marginBottom: 8 },
  pvFeedback: { fontSize: 13, lineHeight: 1.5, marginTop: 10, padding: "8px 10px",
                background: CARD, border: `1px dashed ${LINE}`, borderRadius: 8 },
};
