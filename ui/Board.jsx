import React, { useState, useEffect, useMemo } from "react";
import { ranking, me, awardList, ApiError } from "./apiClient.js";
import { ArtImage, AwardImage } from "./badgeArt.jsx";
import { Avatar } from "./avatarArt.jsx";
import { openingLang, pickLang, showLang } from "./language.js";
import { THEME_CSS } from "./theme.jsx";
import { PLATFORM_MARKS, platformMark } from "./marks.js";

/* ---------------------------------------------------------------------------
   The ranking, and how the campus looks as a whole.

   The list holds only people who switched it on and whose profile an
   administrator has approved. Each appears by username, never by name, with
   the role, the unit, the short biography, the badge and the points they chose
   to show. The summary beside it counts everyone active, listed or not, for the
   campus or for one role, never for a unit. The server holds it back whenever
   it could give away the result of someone who chose not to appear.
   --------------------------------------------------------------------------- */

const PAPER = "var(--paper)", CARD = "var(--card)", LINE = "var(--line)";
const TEXT = "var(--text)", MUTED = "var(--muted)", ACCENT = "var(--accent)";
const WARN = "var(--warn-text)";
const DISPLAY = "'Archivo', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

// The server lists this many, and the person's own row when it falls below.
const LIST_LIMIT = 100;

const AREAS = ["verification", "privacy", "prompt_design", "integrity",
               "manipulation", "op_security", "boundaries"];

const STRINGS = {
  tr: {
    lang: "tr", numberLocale: "tr-TR",
    title: "Sıralama",
    lede: "Sıralamada yalnızca görünmeyi seçenler, kullanıcı adlarıyla yer alır. Gerçek adlar hiçbir yerde görünmez. Puan yalnızca doğru cevaptan değil, ne kadar emin olduğunu doğru tartmaktan da gelir.",
    visitorLede: "Burada, platformu kullananlardan üniversite dışından da görünmeyi kabul edenler kullanıcı adlarıyla yer alır. Gerçek adlar hiçbir yerde görünmez. Puan yalnızca doğru cevaptan değil, ne kadar emin olduğunu doğru tartmaktan da gelir.",
    visitorEmpty: "Bu grupta dışarıdan görünmeyi kabul eden kimse yok.",
    publicSeen: "Sıralama şu anda üniversite dışına da açık ve dışarıdan bakanlar seni de görüyor.",
    publicUnseen: "Sıralama şu anda üniversite dışına da açık. Dışarıdan bakanlar yalnızca buna ayrıca izin verenleri görür, seni görmüyor. İzni profilinden verebilirsin.",
    tabs: { all: "Tümü", student: "Öğrenci", academic: "Akademik", admin_staff: "İdari" },
    allUnits: "Bütün birimler", allDepts: "Bütün bölümler",
    youVisible: "Sıralamada görünüyorsun.", youRank: "Bu grupta {n}. sıradasın.",
    youOut: "Seçtiğin grubun dışındasın.",
    youWaiting: "Sıralamaya katıldın. Profilin onaylanınca burada görüneceksin.",
    youHidden: "Sıralamada görünmüyorsun. Sonuçların yalnızca toplamlarda sayılıyor.",
    youExcluded: "Vaka yazarları ve yöneticiler cevap anahtarlarını görebildiği için sıralamada yer almaz. Vakaları çözebilir, ikizini izleyebilirsin.",
    join: "Sıralamada görün", leave: "Sıralamadan çık", editProfile: "Profilini düzenle",
    summary: "Seçili grubun özeti",
    people: "kişi", participants: "vaka bitiren", finished: "bitirilen vaka",
    levels: "Seviyeler", areas: "Alan seviyesi en az Temel olanlar", evenHand: "Denge işareti",
    evenHandN: "{n} kişide",
    tooFew: "Özet, bu grupta en az {n} kişi vaka bitirince gösterilir. Böylece kimsenin sonucu tek başına okunamaz.",
    noUnit: "Birim seçiliyken özet gösterilmez. Küçük bir grubun toplamlarından kişilerin tek tek sonuçları çıkarılabilir.",
    withheld: "Özet şu an gösterilmiyor. Gösterilseydi sıralamada görünmek istemeyen birkaç kişinin sonuçları toplamlardan çıkarılabilirdi.",
    listHead: "Sıralama listesi", listCount: "{n} kişi",
    firstN: "İlk {n} kişi gösteriliyor.",
    empty: "Bu grupta sıralamada görünen kimse yok.",
    you: "sen", points: "puan", level: "Seviye",
    loading: "Yükleniyor…", failed: "Sıralama yüklenemedi. Sayfayı yenilemeyi dene.",
    offline: "Sunucuya ulaşılamadı. Gördüğün sıralama örnektir.",
    levelNames: ["Başlangıç", "Uygulayıcı", "Denetleyen", "Yetkin", "Rehber"],
    tiers: ["", "Temel", "Sağlam", "Usta"],
    areaNames: { verification: "Doğrulama", privacy: "Mahremiyet", prompt_design: "İstem",
                 integrity: "Atıf", manipulation: "Manipülasyon", op_security: "Güvenlik",
                 boundaries: "Sınırlar" },
    roles: { student: "Öğrenci", academic: "Akademik", admin_staff: "İdari" },
  },
  en: {
    lang: "en", numberLocale: "en-GB",
    title: "Ranking",
    lede: "Everyone who chose to appear on the ranking is here, by username. Points come not only from right answers but also from judging how sure you are. Real names are never shown.",
    visitorLede: "Here are the people using the platform who agreed to be seen from outside the university as well, by username. Real names are never shown. Points come not only from right answers but also from judging how sure you are.",
    visitorEmpty: "Nobody in this selection agreed to be seen from outside.",
    publicSeen: "The ranking is open to people outside the university right now, and they can see you on it.",
    publicUnseen: "The ranking is open to people outside the university right now. Visitors see only those who agreed to it separately, so they do not see you. You can agree from your profile.",
    tabs: { all: "All", student: "Students", academic: "Academic", admin_staff: "Administrative" },
    allUnits: "All units", allDepts: "All departments",
    youVisible: "You are on the ranking.", youRank: "You are number {n} in this selection.",
    youOut: "You are outside this selection.",
    youWaiting: "You joined the ranking. You will appear once your profile is approved.",
    youHidden: "You are not on the ranking. Your results count only in the totals.",
    youExcluded: "Case authors and administrators can read the answer keys, so they are not on the ranking. You can still solve cases and follow your twin.",
    join: "Show me on the ranking", leave: "Leave the ranking", editProfile: "Edit your profile",
    summary: "This selection as a whole",
    people: "people", participants: "finished a case", finished: "cases finished",
    levels: "Levels", areas: "Area level at least Basic", evenHand: "Even Hand mark",
    evenHandN: "{n} people", evenHandNOne: "{n} person",
    tooFew: "The summary appears once at least {n} people in this selection have finished a case, so no one's result can be read on its own.",
    noUnit: "No summary is shown while a unit is selected. In a small group the totals could give away individual results.",
    withheld: "The summary is not shown right now. If it were, the results of a few people who chose not to appear could be worked out from the totals.",
    listHead: "The list", listCount: "{n} people", listCountOne: "{n} person",
    firstN: "Showing the first {n}.",
    empty: "Nobody in this selection is on the ranking.",
    you: "you", points: "points", level: "Level",
    loading: "Loading…", failed: "The ranking could not be loaded. Try reloading the page.",
    offline: "No connection. The ranking you see is a sample.",
    levelNames: ["Newcomer", "Practised", "Reviewer", "Capable", "Guide"],
    tiers: ["", "Basic", "Solid", "Expert"],
    areaNames: { verification: "Verification", privacy: "Privacy", prompt_design: "Prompting",
                 integrity: "Citation", manipulation: "Manipulation", op_security: "Security",
                 boundaries: "Limits" },
    roles: { student: "Student", academic: "Academic", admin_staff: "Administrative" },
  },
};

/* Shown when the screen is opened without a server, so it can be looked at. */
const SAMPLE = (() => {
  const tiers = (n) => Object.fromEntries(AREAS.map((a, i) => [a, i < n ? 1 + (i % 2) : 0]));
  const row = (rank, username, avatar, role, faculty, department, bio, points, level, nTiers,
               marks = [], mine = false) => ({
    rank, username, avatar, role, faculty, department, bio, points, level,
    tiers: tiers(nTiers), marks, me: mine });
  return {
    role: "all", unit_id: null, total: 6,
    people: [
      row(1, "ece.kara", "av-12", "student", "Mühendislik ve Doğa Bilimleri Fakültesi",
          "Bilgisayar Mühendisliği", "Veri bilimi ve yapay zekâ ile ilgileniyorum.", 412, 4, 6,
          ["even_hand"]),
      row(2, "m.yildiz", null, "academic", "Tıp Fakültesi", null,
          "Klinik karar destek sistemleri üzerine çalışıyorum.", 365, 3, 4),
      row(3, "deniz.y", "av-03", "student", "İktisadi ve İdari Bilimler Fakültesi", null,
          "", 298, 3, 3, [], true),
      row(4, "ayse.d", "av-21", "admin_staff", "Bilgi İşlem Daire Başkanlığı", null,
          "Kurumsal bilgi güvenliği.", 251, 2, 2),
      row(5, "kerem_s", null, "student", "Hukuk Fakültesi", null, "", 176, 2, 1),
      row(6, "lale.su", "av-30", "student", "Eğitim Fakültesi", null,
          "Öğretmen adayı, ölçme ve değerlendirme meraklısı.", 98, 1, 0),
    ],
    me: { opted_in: true, approved: true, waiting: false, visible: true, rank: 3 },
    summary: { enough: true, threshold: 10, people: 1840, participants: 612,
               cases_finished: 2905,
               levels: { 1: 301, 2: 188, 3: 92, 4: 26, 5: 5 },
               areas: { verification: 141, privacy: 120, prompt_design: 98, integrity: 133,
                        manipulation: 77, op_security: 64, boundaries: 59 },
               even_hand: 4 },
    units: [
      { id: 2, name: "Mühendislik ve Doğa Bilimleri Fakültesi", selectable: false,
        children: [{ id: 30, name: "Bilgisayar Mühendisliği" },
                   { id: 31, name: "Elektrik-Elektronik Mühendisliği" }] },
      { id: 9, name: "Tıp Fakültesi", selectable: true, children: [] },
      { id: 7, name: "İktisadi ve İdari Bilimler Fakültesi", selectable: true, children: [] },
    ],
  };
})();

/* English says "1 person" but "2 people"; Turkish needs no second form, so
   only the English table carries the singular, under the same key with "One". */
const plural = (t, key, n) => (n === 1 && t[`${key}One`]) || t[key];

/* `visitor`: someone who has not signed in, while the ranking is open to
   visitors. They see only the people who agreed to be seen from outside. */
export default function Board({ lang: hostLang, onLang, embedded, visitor = false }) {
  const [ownLang, setOwnLang] = useState(() => openingLang(null));
  const lang = hostLang ?? ownLang;
  if (!hostLang) showLang(ownLang);
  const setLang = onLang ?? ((next) => { pickLang(next); setOwnLang(next); });
  const t = STRINGS[lang] ?? STRINGS.tr;

  const [role, setRole] = useState("all");
  const [faculty, setFaculty] = useState("");
  const [dept, setDept] = useState("");
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  const unitId = dept || faculty || null;

  /* The names and pictures of the marks and medals on the rows. Without them
     a row shows the platform's own marks only. */
  const [book, setBook] = useState(null);
  useEffect(() => {
    let off = false;
    (visitor ? awardList.visitor() : awardList.mine())
      .then((b) => { if (!off) setBook(b); })
      .catch(() => { if (!off) setBook(null); });
    return () => { off = true; };
  }, [visitor, lang]);

  useEffect(() => {
    let off = false;
    setFailed(false);
    ranking.list(role, unitId, visitor)
      .then((d) => { if (!off) { setData(d); setOffline(false); } })
      .catch((e) => {
        if (off) return;
        if (e instanceof ApiError && e.status === 0) { setOffline(true); setData(SAMPLE); }
        else setFailed(true);
        // Closed to visitors meanwhile: the shell asks again what is open.
        if (visitor && e instanceof ApiError && e.status === 404) {
          window.dispatchEvent(new Event("yazem:visitors"));
        }
      });
    return () => { off = true; };
  }, [role, unitId, visitor]);

  const units = useMemo(() => {
    const byName = (a, b) => a.name.localeCompare(b.name, "tr");
    return [...(data?.units ?? [])].map((u) => ({ ...u, children: [...(u.children ?? [])].sort(byName) }))
                                   .sort(byName);
  }, [data?.units]);
  const facultyRow = units.find((u) => String(u.id) === faculty) ?? null;

  const toggle = async () => {
    if (!data || offline) return;
    setBusy(true);
    try {
      await me.setBoard(!data.me.opted_in);
      setData(await ranking.list(role, unitId));
    } catch { /* the state on screen stays as it was */ }
    finally { setBusy(false); }
  };

  return (
    <div lang={lang} style={S.root} data-screen="board">
      <style>{CSS}</style>
      <div className="bd">
        <header style={S.header}>
          <div>
            <h1 style={S.h1}>{t.title}</h1>
            <p style={S.lede}>{visitor ? t.visitorLede : t.lede}</p>
          </div>
          {!embedded && (
            <div style={S.seg}>
              {["tr", "en"].map((l) => (
                <button key={l} onClick={() => setLang(l)}
                  style={{ ...S.segBtn, ...(lang === l ? S.segOn : null) }}>{l.toUpperCase()}</button>
              ))}
            </div>
          )}
        </header>

        {offline && <div style={S.offline}>{t.offline}</div>}
        {failed && <div style={S.error} role="alert">{t.failed}</div>}

        {data?.me && (
          <Standing t={t} you={data.me} busy={busy || offline} onToggle={toggle}
            publicOpen={data.public_open === true} />
        )}

        <div style={S.filters}>
          <div style={S.tabs} role="tablist" aria-label={t.title}>
            {Object.entries(t.tabs).map(([key, text]) => (
              <button key={key} role="tab" aria-selected={role === key} data-tab={key}
                onClick={() => setRole(key)}
                style={{ ...S.chip, ...(role === key ? S.chipOn : null) }}>{text}</button>
            ))}
          </div>
          <div style={S.unitPick}>
            <select value={faculty} style={S.select} data-unit="faculty"
              onChange={(e) => { setFaculty(e.target.value); setDept(""); }}>
              <option value="">{t.allUnits}</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            {facultyRow && facultyRow.children.length > 0 && (
              <select value={dept} onChange={(e) => setDept(e.target.value)} style={S.select}
                data-unit="department">
                <option value="">{t.allDepts}</option>
                {facultyRow.children.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {!data && !failed && <p style={S.quiet}>{t.loading}</p>}
        {data && (
          <div className="bd-grid">
            <Summary t={t} summary={data.summary} />
            <section style={S.card} className="bd-card" aria-label={t.listHead}>
              <div style={S.cardHead}>
                <h2 style={S.h2}>{t.listHead}</h2>
                <span style={S.count}>{plural(t, "listCount", data.total).replace("{n}", data.total)}</span>
              </div>
              {data.people.length === 0 && <p style={S.quiet}>{visitor ? t.visitorEmpty : t.empty}</p>}
              <ol style={S.list}>
                {data.people.map((p) => (
                  <Row key={p.username} t={t} p={p} book={book} visitor={visitor} />))}
              </ol>
              {data.total > LIST_LIMIT && (
                <p style={S.quiet}>{t.firstN.replace("{n}", LIST_LIMIT)}</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/* Where the person stands: on the list, waiting for approval, or not on it,
   with the switch that changes it. */
function Standing({ t, you, busy, onToggle, publicOpen }) {
  if (you.excluded) {
    return (
      <section style={S.standing} data-standing="excluded">
        <p style={S.standingText}>{t.youExcluded}</p>
      </section>
    );
  }
  let text;
  if (you.visible) {
    text = <>{t.youVisible} {you.rank ? t.youRank.replace("{n}", you.rank) : t.youOut}</>;
  } else if (you.opted_in) {
    text = t.youWaiting;
  } else {
    text = t.youHidden;
  }
  return (
    <section style={{ ...S.standing, ...(you.visible ? S.standingOn : null) }}
      data-standing={you.visible ? "visible" : you.opted_in ? "waiting" : "hidden"}>
      <p style={S.standingText}>{text}</p>
      {publicOpen && you.visible && (
        <p style={S.standingNote} data-public={you.public ? "seen" : "unseen"}>
          {you.public ? t.publicSeen : t.publicUnseen}
        </p>
      )}
      <div style={S.standingActions}>
        <button onClick={onToggle} disabled={busy} data-action="board-toggle"
          style={{ ...S.button, ...(you.opted_in ? S.buttonQuiet : null) }}>
          {you.opted_in ? t.leave : t.join}
        </button>
        <a href="#profil" style={S.link}>{t.editProfile}</a>
      </div>
    </section>
  );
}

function Summary({ t, summary }) {
  if (!summary?.enough) {
    const why = summary?.reason === "unit" ? t.noUnit
      : summary?.reason === "small" ? t.withheld
      : t.tooFew.replace("{n}", summary?.threshold ?? 10);
    return (
      <section style={S.card} data-summary="withheld" data-reason={summary?.reason ?? "few"}>
        <h2 style={S.h2}>{t.summary}</h2>
        <p style={S.quiet}>{why}</p>
      </section>
    );
  }
  const levels = [1, 2, 3, 4, 5].map((l) => summary.levels?.[l] ?? 0);
  const top = Math.max(1, ...levels);
  return (
    <section style={S.card} data-summary="shown">
      <h2 style={S.h2}>{t.summary}</h2>
      <div style={S.figures}>
        {[[summary.people, t.people], [summary.participants, t.participants],
          [summary.cases_finished, t.finished]].map(([n, cap]) => (
          <div key={cap}>
            <div style={S.figure}>{Number(n).toLocaleString(t.numberLocale)}</div>
            <div style={S.figureCap}>{cap}</div>
          </div>
        ))}
      </div>

      <h3 style={S.h3}>{t.levels}</h3>
      <div style={S.levelRows}>
        {levels.map((n, i) => (
          <div key={i} style={S.levelRow} data-level={i + 1}>
            <ArtImage kind="level" k={i + 1} size={30} alt="" />
            <span style={S.levelName}>{t.levelNames[i]}</span>
            <span style={S.levelBar}>
              <span style={{ ...S.levelFill, width: `${(100 * n) / top}%` }} />
            </span>
            <span style={S.levelN}>{n.toLocaleString(t.numberLocale)}</span>
          </div>
        ))}
      </div>

      <h3 style={S.h3}>{t.areas}</h3>
      <div style={S.areaGrid}>
        {AREAS.map((a) => (
          <div key={a} style={S.areaCell} data-area={a}>
            <ArtImage kind="dim" k={a} size={40} alt="" locked={!(summary.areas?.[a] > 0)} />
            <span style={S.areaName}>{t.areaNames[a]}</span>
            <span style={S.areaN}>{(summary.areas?.[a] ?? 0).toLocaleString(t.numberLocale)}</span>
          </div>
        ))}
      </div>

      <div style={S.markLine}>
        <ArtImage kind="mark" k="even_hand" size={28} alt="" locked={!summary.even_hand} />
        <span>{t.evenHand}: {plural(t, "evenHandN", summary.even_hand ?? 0).replace("{n}", summary.even_hand ?? 0)}</span>
      </div>
    </section>
  );
}

/* A mark or medal on a row, named from the list of what there is to earn. A
   platform mark is drawn even before the list arrives. */
function awardOf(book, code, lang) {
  const found = book?.awards?.find((a) => a.code === code);
  if (found) return found;
  const mark = PLATFORM_MARKS.find((m) => m.code === code);
  return mark ? platformMark(mark, lang) : null;
}

function Row({ t, p, book, visitor }) {
  const earned = AREAS.filter((a) => (p.tiers?.[a] ?? 0) > 0);
  const honours = [...(p.marks ?? []), ...(p.medals ?? [])]
    .map((code) => awardOf(book, code, t.lang)).filter(Boolean);
  const unit = [p.faculty, p.department].filter(Boolean).join(" · ");
  return (
    <li style={{ ...S.row, ...(p.me ? S.rowMine : null) }} className="bd-row" data-row={p.username}
      data-mine={p.me ? "1" : undefined}>
      <span style={S.rank}>{p.rank}</span>
      <Avatar code={p.avatar} label={p.username} size={42} />
      <div style={S.who}>
        <div style={S.handleLine}>
          <span style={S.handle} data-user-content>{p.username}</span>
          {p.me && <span style={S.youTag}>{t.you}</span>}
          <span style={S.roleTag}>{t.roles[p.role] ?? p.role}</span>
        </div>
        {unit && <div style={S.unit}>{unit}</div>}
        {/* The person's own words, in whatever language they wrote them. */}
        {p.bio && <div style={S.bio} data-user-content>{p.bio}</div>}
        <div style={S.badgeLine}>
          <span style={S.levelChip} title={`${t.level} ${p.level}`}>
            <ArtImage kind="level" k={p.level} size={24} alt="" />
            {t.level} {p.level} · {t.levelNames[p.level - 1]}
          </span>
          {earned.map((a) => (
            <span key={a} title={`${t.areaNames[a]} · ${t.tiers[p.tiers[a]]}`} data-earned={a}
              className="bd-emb">
              <ArtImage kind="dim" k={a} size={24} alt={`${t.areaNames[a]} · ${t.tiers[p.tiers[a]]}`} />
            </span>
          ))}
          {honours.map((a) => (
            <span key={a.code} title={a.name} className="bd-emb" data-honour={a.code}>
              <AwardImage award={a} size={24} alt={a.name} visitor={visitor} />
            </span>
          ))}
        </div>
      </div>
      <div style={S.points}>
        <span style={S.pointsN}>{Math.round(p.points).toLocaleString(t.numberLocale)}</span>
        <span style={S.pointsCap}>{t.points}</span>
      </div>
    </li>
  );
}

const CSS = `${THEME_CSS}
.bd { max-width: 1120px; margin: 0 auto; font-variant-numeric: tabular-nums; }
.bd-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
@media (min-width: 960px) { .bd-grid { grid-template-columns: minmax(0, 340px) minmax(0, 1fr); } }
@media (max-width: 520px) {
  .bd-card { padding: 12px 10px 14px !important; }
  .bd-row { gap: 8px !important; padding: 9px 9px !important; }
  .bd-emb img { width: 21px !important; height: 21px !important; }
}
[data-screen="board"] button:focus-visible, [data-screen="board"] select:focus-visible,
[data-screen="board"] a:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
`;

const S = {
  root: { padding: "0 16px 44px", background: PAPER, color: TEXT, fontFamily: DISPLAY },
  header: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12,
            padding: "22px 2px 14px" },
  h1: { margin: 0, fontSize: 27, fontWeight: 700, letterSpacing: "-.02em", fontStretch: "112%",
        lineHeight: 1.1 },
  lede: { margin: "6px 0 0", fontSize: 14, lineHeight: 1.5, color: MUTED, maxWidth: "64ch" },
  seg: { display: "flex", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden",
         background: CARD, flexShrink: 0 },
  segBtn: { padding: "6px 10px", minHeight: 34, background: "none", border: "none", color: MUTED,
            fontFamily: DISPLAY, fontSize: 12, fontWeight: 600, cursor: "pointer" },
  segOn: { background: "var(--fill)", color: TEXT },
  offline: { fontSize: 12.5, lineHeight: 1.55, color: WARN, background: "var(--warn-soft)",
             border: "1px solid var(--warn-line)", borderRadius: 10, padding: "11px 13px", margin: "0 0 12px" },
  error: { fontSize: 13, lineHeight: 1.5, color: ACCENT, background: "rgba(192,0,0,.07)",
           border: `1px solid ${ACCENT}`, borderRadius: 9, padding: "10px 12px", margin: "0 0 12px" },

  standing: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              flexWrap: "wrap", background: CARD, border: `1px solid ${LINE}`, borderRadius: 14,
              padding: "12px 14px", marginBottom: 12 },
  standingOn: { borderColor: "var(--accent-line)", background: "linear-gradient(180deg, var(--accent-soft), var(--card) 80%)" },
  standingText: { margin: 0, fontSize: 14, lineHeight: 1.5, flex: "1 1 260px" },
  standingNote: { margin: 0, fontSize: 13, lineHeight: 1.5, color: MUTED, flex: "1 1 100%",
                  order: 3 },
  standingActions: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  button: { minHeight: 40, padding: "0 16px", borderRadius: 10, border: "none", background: ACCENT,
            color: "var(--on-accent)", fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  buttonQuiet: { background: "none", border: `1px solid ${LINE}`, color: TEXT },
  link: { color: ACCENT, fontSize: 13.5, fontWeight: 600 },

  filters: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
             flexWrap: "wrap", margin: "4px 0 14px" },
  tabs: { display: "flex", gap: 6, flexWrap: "wrap" },
  chip: { minHeight: 36, padding: "0 14px", borderRadius: 99, border: `1px solid ${LINE}`,
          borderColor: LINE, background: CARD, color: TEXT, fontFamily: DISPLAY, fontSize: 13,
          cursor: "pointer" },
  chipOn: { background: TEXT, borderColor: TEXT, color: "var(--card)", fontWeight: 600 },
  unitPick: { display: "flex", gap: 6, flexWrap: "wrap", maxWidth: "100%" },
  select: { minHeight: 36, borderRadius: 99, border: `1px solid ${LINE}`, background: CARD,
            color: TEXT, fontFamily: DISPLAY, fontSize: 13, padding: "0 12px", maxWidth: "100%" },

  card: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: "16px 16px 18px",
          minWidth: 0 },
  cardHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  h2: { margin: "0 0 10px", fontSize: 18, fontWeight: 700, letterSpacing: "-.015em",
        fontStretch: "106%" },
  h3: { margin: "16px 0 8px", fontSize: 13, fontWeight: 600, color: TEXT },
  count: { fontSize: 13, color: MUTED },
  quiet: { fontSize: 13.5, lineHeight: 1.55, color: MUTED, margin: "6px 0 0" },

  figures: { display: "flex", gap: 22, flexWrap: "wrap", paddingBottom: 12,
             borderBottom: `1px solid ${LINE}` },
  figure: { fontSize: 24, fontWeight: 700, letterSpacing: "-.02em", fontStretch: "110%",
            lineHeight: 1.1 },
  figureCap: { fontSize: 12, color: MUTED, marginTop: 3 },
  levelRows: { display: "grid", gap: 6 },
  levelRow: { display: "grid", gridTemplateColumns: "30px 88px minmax(0, 1fr) 44px",
              alignItems: "center", gap: 8 },
  levelName: { fontSize: 12.5, fontWeight: 600 },
  levelBar: { height: 8, borderRadius: 99, background: "var(--fill)", overflow: "hidden" },
  levelFill: { display: "block", height: "100%", borderRadius: 99, background: ACCENT },
  levelN: { fontSize: 12.5, textAlign: "right", color: MUTED },
  areaGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
              gap: "10px 4px" },
  areaCell: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              textAlign: "center", minWidth: 0 },
  areaName: { fontSize: 11, fontWeight: 600, fontStretch: "90%", whiteSpace: "nowrap" },
  areaN: { fontSize: 12, color: MUTED },
  markLine: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 14,
              paddingTop: 12, borderTop: `1px solid ${LINE}` },

  list: { listStyle: "none", margin: "4px 0 0", padding: 0, display: "grid", gap: 8 },
  row: { display: "grid", gridTemplateColumns: "26px 42px minmax(0, 1fr) auto", gap: 10,
         alignItems: "start", border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px",
         background: CARD },
  rowMine: { borderColor: ACCENT, background: "var(--accent-soft)" },
  rank: { fontSize: 15, fontWeight: 700, color: MUTED, textAlign: "right", paddingTop: 11 },
  who: { minWidth: 0, display: "grid", gap: 3 },
  handleLine: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  handle: { fontFamily: MONO, fontSize: 14.5, fontWeight: 500, overflowWrap: "anywhere" },
  youTag: { fontSize: 11.5, fontWeight: 700, color: "var(--on-accent)", background: ACCENT, borderRadius: 99,
            padding: "1px 8px" },
  roleTag: { fontSize: 11.5, color: MUTED },
  unit: { fontSize: 12.5, color: MUTED, lineHeight: 1.4 },
  bio: { fontSize: 13.5, lineHeight: 1.45, overflowWrap: "anywhere" },
  badgeLine: { display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 3 },
  levelChip: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
               color: TEXT, marginRight: 6 },
  points: { display: "grid", justifyItems: "end", paddingTop: 6 },
  pointsN: { fontSize: 19, fontWeight: 700, letterSpacing: "-.02em", fontStretch: "110%" },
  pointsCap: { fontSize: 11.5, color: MUTED },
};
