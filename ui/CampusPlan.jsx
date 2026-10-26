import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CAMPUS } from "./campusGeometry";
import { langHeaders, openingLang, pickLang, showLang } from "./language.js";
import { autumnTurn, darkness, mixHex, mixSkin, moonPhase, moonPosition, moonWord, pineCandles,
         roseStage, seasonOf, skyColours, sunPosition, sunTimes } from "./campusSky.js";
import { sha256Hex } from "./sha256.js";
import { CREDITS } from "./credits.js";

/* ---------------------------------------------------------------------------
   SDÜ campus participation map, drawn as an architectural site plan.

   Footprints come from the printed campus map's own geometry. Mass comes from
   an extrusion, with a wall below and a roof above.

   Participation only. No unit ever carries a competence figure here.
   --------------------------------------------------------------------------- */

const L = {
  tr: {
    eyebrow: "YAZEM, Yapay Zeka Okuryazarlığı",
    title: "Kampüs Nabzı",
    registered: "kayıtlı", active: "son 7 günde vaka bitiren",
    west: "Batı Yerleşkesi", east: "Doğu Yerleşkesi", districts: "İlçe Birimleri",
    all: "Tümü", busy: "Hareketli", quiet: "Sessiz",
    sizeReg: "Kayıtlı kişi sayısına göre", sizeAct: "Katılıma göre",
    campusTotal: "Yerleşke toplamı", nothing: "Bu hafta katılım yok",
    note: "Harita, katılımı ve alanlara göre farkındalığı gösterir. Birimler puanla sıralanmaz.",
    awareness: "Farkındalık",
    awLede: "Kampüsün en zayıf olduğu alan: {area}. Bu bilgi {people} kişinin cevaplarına dayanıyor.",
    strongestArea: "En güçlü", weakestArea: "En zayıf",
    tooFew: "Bu birimde katılım {n} kişinin altında olduğu için farkındalık gösterilmiyor.",
    bandNote: "{n} kişinin cevaplarına dayanıyor. Alanlar kampüs ortalamasıyla karşılaştırılır, sayısal puan gösterilmez.",
    mapOffline: "Sunucuya ulaşılamadı. Gördüğün sayılar örnektir.",
    hint: "Bir birim seç", overpass: "Üst geçit",
    highway: "Isparta-Afyon yolu", of: "birim",
    buildings: "binada", blocks: "blok", shared: "Aynı binada", andMore: "ve {n} birim daha", day: "Gündüz", night: "Gece", auto: "Otomatik",
    zoomIn: "Yakınlaştır", zoomOut: "Uzaklaştır", reset: "Haritanın tamamını göster",
    zoomOff: "Haritada gez", zoomOn: "Gezmeyi bitir",
    wheelHint: "Fare tekerleğiyle yakınlaştırmak için önce “Haritada gez” düğmesine bas. + ve − düğmeleri her zaman çalışır.",
    share: "Yerleşke katılımındaki payı", rank: "sıra", week: "Son 7 gün",
    tickerTag: "Kampüste şimdi",
    pulseHour: "Son bir saatte {n} cevap",
    pulseToday: "Bugün {p} kişiden {n} cevap",
    pulseWeek: "Bu hafta {n} kişi en az bir vaka bitirdi",
    pulseCase: "{title}: Son 24 saatte {d}, bu hafta {w} kişi bitirdi",
    pulseQuiet: "Bugün henüz cevap yok. İlk cevabı sen verebilirsin.",
    hourAnswers: "son bir saatte {n} cevap",
    liveBuild: "Son bir saatte en az iki kişinin cevap verdiği bina",
    // the time bar
    time: "Zaman", timePlay: "Zamanı oynat", timePause: "Durdur", timeNow: "Şimdi",
    timeSpeed: "Hız", timeSpeeds: { day: "Gün", week: "Hafta", month: "Ay" },
    timeSpeedHelp: { day: "Bir gün dört saniyede geçer. Gece ile gündüz görünür.",
                     week: "Bir hafta dört saniyede geçer. Saat öğlende sabit kalır.",
                     month: "Bir ay dört saniyede geçer. Saat öğlende sabit kalır." },
    activeAt: "{date} itibarıyla son 7 günde vaka bitiren",
    tickerPast: "O gün", pastDay: "{date} günü {p} kişiden {n} cevap",
    pastQuiet: "{date} günü cevap yok.",
    timeNote: "Geçmiş bir an seçildiğinde harita o güne kadar kaydolanları ve o güne kadarki yedi günde vaka bitirenleri gösterir.",
    daysHidden: "Günlük dağılım, kayıtlı kişi sayısı eşiği geçen birimlerde gösteriliyor.",
    weekTrend: "Son 8 hafta: Her hafta vaka bitiren kişi sayısı",
    campusTwin: "Kampüs ikizi", campusFill: "Kampüs", you: "Sen",
    campusThen: "Seçilen gün", campusNow: "Bugün",
    twinLede: "Her yaprak, kampüste o alanda orta zorlukta bir adımın doğru çözülme olasılığını gösteriyor. Çizgi senin ikizin.",
    twinLedeAlone: "Her yaprak, kampüste o alanda orta zorlukta bir adımın doğru çözülme olasılığını gösteriyor.",
    twinLedePast: "Her yaprak, seçilen günün sonunda kampüste o alanda orta zorlukta bir adımın doğru çözülme olasılığını gösteriyor. Kesik çizgi bugünkü durum.",
    budNote: "Bir alan, en az {n} kişi cevap verince ölçülmeye başlar.",
    confOver: "fazla emin", confUnder: "az emin", confFine: "dengeli",
    confNote: "Sağdaki sözcük, o alanda verilen güvenin isabetle ne kadar uyuştuğunu gösteriyor.",
    twinAcc: "Kampüsteki ikizler {n} adımın sonucunu önceden tahmin etti. Bu tahminlerin Brier puanı {b}. Sıfır kusursuz tahmin demek, 0,25 ise her adım için %50 demekle aynı.",
    // the sky and the weather
    skyRise: "Gün doğumu", skySet: "Gün batımı", skyMoon: "Ay",
    roseWord: { bare: "Gül dalları çıplak", pruned: "Gül bahçelerinde budama zamanı",
                leafing: "Güller yapraklanıyor", buds: "Güller tomurcuklandı",
                bloom: "Isparta'da gül hasadı", green: "Gül hasadı bitti",
                turning: "Gül yaprakları sararıyor", falling: "Güller yaprak döküyor" },
    skyLabel: "Kampüsün üstündeki gökyüzü: Güneş, Ay ve hava şu anki hâliyle. Davraz'ın karı, çamlar ve gül bahçeleri mevsime göre değişir.",
    skyLabelPast: "Kampüsün üstündeki gökyüzü, seçilen gün ve saatteki hâliyle. Davraz'ın karı, çamlar ve gül bahçeleri mevsime göre değişir.",
    weatherNow: "Isparta'da şu an",
    weatherWord: { clear: "açık", partly: "parçalı bulutlu", overcast: "kapalı", fog: "sisli",
                   drizzle: "çiseliyor", rain: "yağmurlu", snow: "karlı", storm: "fırtınalı" },
    // places on the map
    pinCase: "Vakaların geçtiği yer, içindeki sayı orada geçen vaka sayısı", pinWeekly: "Haftanın vakası", pinEvent: "Etkinlik",
    pinTap: "Bir işarete tıklayınca oradaki vakalar ve etkinlikler açılır.",
    pinCases: "{n} vaka", pinEvents: "{n} etkinlik", backToMap: "Haritaya dön",
    pinLight: "Biriminde yanan ışığın (yalnızca sen görürsün)",
    lightTitle: "Bugün {n} adım cevapladın, biriminde ışığın yanıyor. Bunu yalnızca sen görüyorsun.",
    hereCases: "Burada geçen vakalar", hereEvents: "Buradaki etkinlikler",
    caseGo: "Vakaya git", caseGoVisitor: "Giriş yapıp çöz", caseWeekly: "Haftanın vakası",
    caseState: { new: "Yeni", half: "Yarım", done: "Bitti", revealed: "Cevaplar açıklandı",
                 voided: "Geçersiz sayıldı" },
    eventLink: "Ayrıntı",
    spotSub: "Haritada işaretli yer",
    // the campus today
    todayHead: "Kampüste bugün",
    todayHeadAt: "{date} günü kampüste",
    asOf: "{date} gününün sonundaki durum",
    unitToday: "Birimin konumu bugünkü duruma göredir.",
    fcPast: "{date} için tahmin {f}, gerçekleşen {a}.",
    fcNone: "{date} için mühürlenmiş bir tahmin yok.",
    fcHead: "Kampüs ikizinin tahmini",
    fcToday: "İkiz, bugün kampüste kaç cevap verileceğini tahmin etti ve sayıyı mühürledi.",
    fcSeal: "Mühür", fcSoFar: "Şu ana kadar {n} cevap.", fcOpens: "Tahmin gün bitince açıklanır.",
    fcYesterday: "Dün: Tahmin {f}, gerçekleşen {a}.", fcOff: "Sapma %{p}.", fcExact: "Tam isabet.",
    fcVerified: "Mühür bu tarayıcıda doğrulandı.", fcBroken: "Mühür doğrulanamadı.",
    fcMean: "Son {n} günde ortalama sapma %{p}.", fcFirst: "Geçmiş günlerin tahminleri, ilk gün bittiğinde burada görünecek.",
    fcHow: "Tahmin yalnızca önceki günlerin sayılarından yapılır.",
    fcBars: "Son günler: Tahmin ve gerçekleşen",
    fcKeyForecast: "tahmin", fcKeyActual: "gerçekleşen",
    ccHead: "Güven ve isabet",
    ccArea: "Alan", ccConf: "Güven", ccHit: "İsabet", ccState: "Durum",
    ccOver: "{area} alanında kampüs bildiğinden fazla emin.",
    ccUnder: "{area} alanında kampüs bildiğinden az emin.",
    ccFine: "Kampüsün güveni her alanda isabetiyle uyumlu.",
    ccKey: "Güven, cevaplarla birlikte bildirilen ortalama güvendir. İsabet, doğru çözülen adımların oranıdır. İkisi arasındaki fark 8 puanı geçerse alan fazla emin ya da az emin sayılır. %50 “bilmiyorum” demek olduğundan, fazla emin olup olmadığına %50'nin üzerinde bildirilen güvenlerden bakılır.",
    ccWait: "Bir alanın burada görünmesi için o alanda en az {n} kişinin güven bildirmesi gerekiyor.",
    trHead: "Haftanın tuzağı", trHeadMonth: "Ayın tuzağı",
    trLede: "{title}, {step}. adım: Kampüste bu adımı doğru çözemeyenlerin oranı %{p}.",
    trArea: "Alan", trNote: "Bu adımın açıklaması", trTry: "Sen de dene",
    trNone: "Cevapları açıklanmış vakalarda henüz yeterli cevap yok.",
    trWhy: "Yalnızca cevapları açıklanmış vakalar ve en az {n} kişinin cevapladığı adımlar sayılır.",
  },
  en: {
    eyebrow: "YAZEM, AI Literacy",
    title: "Campus Pulse",
    registered: "registered", active: "last 7 days",
    west: "West Campus", east: "East Campus", districts: "District Units",
    all: "All", busy: "Busy", quiet: "Quiet",
    sizeReg: "By people registered", sizeAct: "By activity",
    campusTotal: "Campus total", nothing: "No activity this week",
    note: "The map shows participation and awareness by area; units are not ranked by score.",
    awareness: "Awareness",
    awLede: "The campus is weakest at {area}. Based on {people} people.",
    strongestArea: "Strongest", weakestArea: "Weakest",
    tooFew: "Fewer than {n} people here; awareness is not shown.",
    bandNote: "From {n} people. Areas are against the campus average; no numeric score.",
    mapOffline: "No connection; the numbers are sample.",
    hint: "Tap a unit", overpass: "Overpass",
    highway: "Isparta – Afyon road", of: "units",
    buildings: "buildings", blocks: "blocks", shared: "Shares a building with", andMore: "and {n} more", day: "Day", night: "Night", auto: "Auto",
    zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Show the whole map",
    zoomOff: "Explore the map", zoomOn: "Done exploring",
    wheelHint: "To zoom with the mouse wheel, press Explore the map first. The + and − buttons always work.",
    share: "Share of campus activity", rank: "rank", week: "Last 7 days",
    tickerTag: "On campus now",
    pulseHour: "{n} answers in the last hour", pulseHourOne: "{n} answer in the last hour",
    pulseToday: "{n} answers from {p} people today",
    pulseTodayOne: "{n} answer from {p} person today",
    pulseWeek: "{n} people finished a case this week",
    pulseWeekOne: "{n} person finished a case this week",
    pulseCase: "{title}: {d} finished in the last 24 hours, {w} this week",
    pulseQuiet: "No answers yet today. The first case of the day could be yours.",
    hourAnswers: "{n} answers in the last hour", hourAnswersOne: "{n} answer in the last hour",
    liveBuild: "Buildings where at least two people answered in the last hour",
    // the time bar
    time: "Time", timePlay: "Play time", timePause: "Pause", timeNow: "Now",
    timeSpeed: "Speed", timeSpeeds: { day: "Day", week: "Week", month: "Month" },
    timeSpeedHelp: { day: "A day passes in four seconds, night and day included.",
                     week: "A week passes in four seconds, with the clock held at noon.",
                     month: "A month passes in four seconds, with the clock held at noon." },
    activeAt: "last 7 days to {date}",
    tickerPast: "That day", pastDay: "On {date}, {n} answers from {p} people",
    pastDayOne: "On {date}, {n} answer from {p} person",
    pastQuiet: "No answers on {date}.",
    timeNote: "At a moment in the past the map shows the people registered by that day and those who finished a case in the seven days up to it.",
    daysHidden: "Daily figures are shown for units above the registration threshold.",
    weekTrend: "The last 8 weeks, people finishing each week",
    campusTwin: "The campus twin", campusFill: "Campus", you: "You",
    campusThen: "Chosen day", campusNow: "Today",
    twinLede: "Each petal is the campus's chance of solving a step of average difficulty in that area. The line is your own twin.",
    twinLedeAlone: "Each petal is the campus's chance of solving a step of average difficulty in that area.",
    twinLedePast: "Each petal is the campus's chance, at the end of the chosen day, of solving a step of average difficulty in that area. The dashed line is today.",
    budNote: "An area answered by fewer than {n} people is not measured yet.",
    confOver: "overconfident", confUnder: "underconfident", confFine: "balanced",
    confNote: "The word on the right shows how well the confidence given in that area matches the accuracy.",
    twinAcc: "The twins on campus predicted the outcome of {n} steps in advance, with a Brier score of {b}. Zero is a perfect forecast, and 0.25 is the same as saying 50% for every step.",
    skyRise: "Sunrise", skySet: "Sunset", skyMoon: "Moon",
    roseWord: { bare: "Rose bushes bare", pruned: "Pruning time in the rose gardens",
                leafing: "Roses coming into leaf", buds: "Roses in bud",
                bloom: "Rose harvest in Isparta", green: "The rose harvest is over",
                turning: "Rose leaves turning", falling: "Roses losing their leaves" },
    skyLabel: "The sky over the campus: the sun, the moon and the weather as they are now. Snow on Davraz, the pines and the rose gardens follow the season.",
    skyLabelPast: "The sky over the campus at the chosen day and hour. Snow on Davraz, the pines and the rose gardens follow the season.",
    weatherNow: "Now in Isparta",
    weatherWord: { clear: "clear", partly: "partly cloudy", overcast: "overcast", fog: "foggy",
                   drizzle: "drizzle", rain: "rain", snow: "snow", storm: "storm" },
    pinCase: "Where cases are set, the number is how many", pinWeekly: "This week's case", pinEvent: "Event",
    pinTap: "Tap a pin to see the cases and events there.",
    pinCases: "{n} cases", pinCasesOne: "{n} case", pinEvents: "{n} events", pinEventsOne: "{n} event",
    backToMap: "Back to the map",
    pinLight: "Your light in your unit (only you see it)",
    lightTitle: "You answered {n} steps today, so your light is on in your unit. Only you can see it.",
    lightTitleOne: "You answered {n} step today, so your light is on in your unit. Only you can see it.",
    hereCases: "Cases set here", hereEvents: "Events here",
    caseGo: "Go to the case", caseGoVisitor: "Sign in to solve", caseWeekly: "This week's case",
    caseState: { new: "New", half: "Half done", done: "Finished", revealed: "Answers revealed",
                 voided: "Set aside" },
    eventLink: "Details",
    spotSub: "Marked on the map",
    todayHead: "The campus today",
    todayHeadAt: "The campus on {date}",
    asOf: "As it stood at the end of {date}",
    unitToday: "The unit's standing is as of today.",
    fcPast: "Forecast for {date}: {f}, actual {a}.",
    fcNone: "No forecast was sealed for {date}.",
    fcHead: "The campus twin's forecast",
    fcToday: "The twin forecast how many answers the campus would give today and sealed the number.",
    fcSeal: "Seal", fcSoFar: "So far: {n} answers.", fcSoFarOne: "So far: {n} answer.",
    fcOpens: "The forecast is revealed when the day is over.",
    fcYesterday: "Yesterday: forecast {f}, actual {a}.", fcOff: "Off by {p}%.", fcExact: "Exactly right.",
    fcVerified: "Seal checked in this browser.", fcBroken: "The seal does not match.",
    fcMean: "Average error over the last {n} days: {p}%.", fcFirst: "Past forecasts will appear here once the first day is over.",
    fcHow: "The forecast uses earlier days only.",
    fcBars: "Recent days: forecast and actual",
    fcKeyForecast: "forecast", fcKeyActual: "actual",
    ccHead: "Confidence and accuracy",
    ccArea: "Area", ccConf: "Confidence", ccHit: "Accuracy", ccState: "Verdict",
    ccOver: "In {area} the campus is more confident than it is right.",
    ccUnder: "In {area} the campus is less confident than it is right.",
    ccFine: "In every area the campus's confidence matches its accuracy.",
    ccKey: "Confidence is the average confidence stated with the answers. Accuracy is the share of steps solved correctly. An area counts as overconfident or underconfident when the two are more than 8 points apart. Since 50% means “I don't know”, overconfidence is read from the confidence stated above 50%.",
    ccWait: "An area appears here once at least {n} people have stated their confidence in it.",
    trHead: "Trap of the week", trHeadMonth: "Trap of the month",
    trLede: "{title}, step {step}: {p}% of those on campus who answered it got it wrong.",
    trArea: "Area", trNote: "This step explained", trTry: "Try it yourself",
    trNone: "Not enough answers yet in cases whose correct answers have been revealed.",
    trWhy: "Only cases whose correct answers have been revealed, and steps answered by at least {n} people, count.",
  },
};

/* A sequential scale from stone to deep rose, after Isparta's roses. One hue
   deepens as the single quantity grows. */
const ACCENT = "#C00000";

/* Two skins for one map. Daylight is the site plan; after dark the ground goes
   quiet and the lit buildings show who is still on campus. */
const APP_TITLE = {
  tr: "SDÜ Yapay Zeka Okuryazarlığı - Kampüs İkizi Platformu",
  en: "SDÜ AI Literacy - Campus Twin Platform",
};

const APP_SUB = {
  tr: "Yapay Zeka Uygulama ve Araştırma Merkezi",
  en: "Artificial Intelligence Application and Research Centre",
};

const SKIN = {
  day: {
    paper: "#F4F4F2", card: "#FFFFFF", line: "#DEDEDA", text: "#2B2B2B", muted: "#77787A",
    land: "#DCE6D0", land2: "#E9EFDF", paved: "#F1EEE3", road: "#EBD9A6", road2: "#DFBE80",
    water: "#C3D9E3", water2: "#D8E7EE", context: "#CFD0C7", contextEdge: "#A9A99E",
    outline: "#7C7A6F", quiet: "#CFCFC4", label: "#96A08C", tint: "#FAFBF7",
    ramp: ["#EBCDB4", "#DDA07E", "#C56C63", "#C00000"],
    wallMix: 0.42, walker: "#6E7A72", walkerGlow: 0,
    // Words and figures in colour: red, amber, green and grey.
    ink: "#C00000", inkWarn: "#9A6416", inkGood: "#4E7C59", inkQuiet: "#77787A",
  },
  night: {
    paper: "#0D131B", card: "#141D27", line: "#243141", text: "#E8EEF3", muted: "#8496A4",
    land: "#15241E", land2: "#1A2B24", paved: "#18212C", road: "#2A2C33", road2: "#383A40",
    water: "#112C39", water2: "#163544", context: "#1C2531", contextEdge: "#2B3746",
    outline: "#3C4A59", quiet: "#2E3A47", label: "#5C7183", tint: "#111A23",
    ramp: ["#8A6A57", "#C98A5E", "#E0705F", "#FF6B7E"],
    wallMix: 0.62, walker: "#FFD9A0", walkerGlow: 1,
    ink: "#F0646A", inkWarn: "#E0A85A", inkGood: "#7FB38C", inkQuiet: "#A4AAB2",
  },
};
const tierOfAct = (a) => (a <= 0 ? 0 : a < 10 ? 1 : a < 30 ? 2 : a < 70 ? 3 : 4);
const roofIn = (C, a) => (a <= 0 ? C.quiet : C.ramp[tierOfAct(a) - 1]);
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c * (1 - amount) + 74 * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
const OUTLINE = "#7C7A6F";

const tierOf = tierOfAct;

const RNG = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

/* --------------------------------------------------------------------------
   Units. Names come from the printed map's legend; footprints and positions
   come from its vector geometry, matched through the legend markers.
   -------------------------------------------------------------------------- */

const WEST_UNITS = new Set(Object.keys(CAMPUS.names).map(Number).filter((n) => n <= 31));

/* A faculty spread over numbered blocks is one unit. E1-E16 are sixteen legend
   entries merged into a single selectable unit, and their figures are summed. */
/* The Institutes building carries several graduate schools; the two largest are
   shown as its two halves. */
const SUBDIVIDE = {
  47: [{ tr: "Fen Bilimleri Enstitüsü", en: "Graduate School of Natural and Applied Sciences" },
       { tr: "Sosyal Bilimler Enstitüsü", en: "Graduate School of Social Sciences" }],
};

const BLOCK_SUFFIX = /\s+(E\d+\s+Bloğu|Block\s+E\d+)$/i;
const stemOf = (s) => s.replace(BLOCK_SUFFIX, "").replace(/,\s*$/, "").trim();

const PLACES = (() => {
  const byStem = new Map();
  for (const [k, v] of Object.entries(CAMPUS.names)) {
    const no = Number(k);
    const stem = stemOf(v.tr);
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push({ no, tr: v.tr, en: v.en });
  }
  const out = [];
  for (const [stem, members] of byStem.entries()) {
    members.sort((a, b) => a.no - b.no);
    const nos = members.map((m) => m.no);
    const pts = nos.map((n) => CAMPUS.anchor[n]).filter(Boolean);
    const anchor = [pts.reduce((a, p) => a + p[0], 0) / pts.length,
                    pts.reduce((a, p) => a + p[1], 0) / pts.length];
    const base = {
      no: nos[0], members: nos, blocks: nos.length,
      campus: nos[0] <= 31 ? "w" : "e",
      name: stem, en: stemOf(members[0].en), anchor,
    };
    const parts = SUBDIVIDE[base.no];
    if (parts) {
      parts.forEach((label, half) => out.push({
        ...base, key2: `${base.no}.${half}`, halfOf: base.no, half,
        blocks: 1, name: label.tr, en: label.en,
        anchor: [anchor[0] + (half ? 16 : -16), anchor[1]],
      }));
    } else {
      out.push(base);
    }
  }
  return out;
})();

const UNIT_OF = {};
for (const p of PLACES) if (p.halfOf == null) for (const n of p.members) UNIT_OF[n] = p.no;
const idOf = (p) => p.key2 ?? p.no;


const LANDMARKS = { 36: ["Bilgi Merkezi", "Library"], 41: ["Tıp", "Medicine"],
                    44: ["Hastane", "Hospital"], 21: ["Mimarlık", "Architecture"] };

/* Units outside the campus, from SDÜ's published unit list. Adalet MYO and
   Isparta SHMYO also appear there but sit on the East Campus, so they are
   already on the map. Distances are approximate road distances from Isparta. */
const DISTRICTS = [
  { key: "egirdir", km: 35, district: { tr: "Eğirdir", en: "Eğirdir" },
    name: "Eğirdir Sağlık Hizmetleri MYO", en: "Eğirdir Vocational School of Health Services",
    lines: { tr: ["Eğirdir Sağlık", "Hizmetleri MYO"], en: ["Eğirdir Health", "Services School"] } },
  { key: "keciborlu", km: 35, district: { tr: "Keçiborlu", en: "Keçiborlu" },
    name: "Sivil Havacılık Yüksekokulu", en: "School of Civil Aviation",
    lines: { tr: ["Sivil Havacılık", "Yüksekokulu"], en: ["School of Civil", "Aviation"] } },
  { key: "atayalvac", km: 105, district: { tr: "Yalvaç", en: "Yalvaç" },
    name: "Atayalvaç Sağlık Hizmetleri MYO", en: "Atayalvaç Vocational School of Health Services",
    lines: { tr: ["Atayalvaç Sağlık", "Hizmetleri MYO"], en: ["Atayalvaç Health", "Services School"] } },
];

const DISTRICT_KEY = Object.fromEntries(DISTRICTS.map((d) => [d.district.tr, d.key]));

/* Sample participation. In the running system this arrives from /map/activity. */
const roll = RNG(20260820);
const BIG = new Set([5, 6, 21, 32, 36, 39, 41, 44, 46]);
const SAMPLE_DATA = Object.fromEntries([
  ...PLACES.map((p) => {
    const big = BIG.has(p.no) || p.blocks > 3;
    const base = big ? 150 + roll() * 250 : 12 + roll() * 95;
    const reg = Math.round(base * (1 + Math.log2(p.blocks) * 0.6));
    const r = big ? 0.6 + roll() * 0.4 : roll();
    const rate = r > 0.86 ? 0.26 + roll() * 0.16
               : r > 0.58 ? 0.09 + roll() * 0.12
               : r > 0.22 ? 0.02 + roll() * 0.06
               : 0;
    return [idOf(p), { reg: p.halfOf ? Math.round(reg * 0.5) : reg,
                        act: Math.round(reg * rate * (p.halfOf ? 0.5 : 1)) }];
  }),
  ...DISTRICTS.map((d, i) => [d.key, {
    reg: Math.round(28 + roll() * 64),
    act: i === 1 ? 0 : Math.round(roll() * (i === 0 ? 24 : 11)),
  }]),
]);

/* Sample history for the offline sheet: participation spreading over eight
   weeks, and a working week of days. */
for (const v of Object.values(SAMPLE_DATA)) {
  const r = RNG(v.reg * 31 + v.act * 7 + 3);
  v.weeks = Array.from({ length: 8 }, (_, i) => (i === 7 ? v.act
    : Math.round(v.act * (0.18 + 0.82 * (i / 7) ** 1.4) * (0.75 + r() * 0.5))));
  v.days = v.reg >= 10
    ? Array.from({ length: 7 }, (_, i) => Math.round((v.act / 3.2) * (i % 7 >= 5 ? 0.3 : 0.6 + r() * 0.8)))
    : null;
}

const SAMPLE_AWARENESS = {
  people: 412, steps: 9840, units_reporting: 11, threshold: 10,
  note: "Birimler kampüs ortalamasına göre üç grupta gösterilir. Sayısal puan ve sıralama yayımlanmaz.",
  areas: [["op_security", -0.55], ["privacy", 0.05], ["boundaries", 0.3], ["manipulation", 0.42],
          ["integrity", 0.55], ["prompt_design", 0.7], ["verification", 1.15]]
    .map(([dimension, level]) => ({ dimension, level, people: 412, enough: true })),
};
const SAMPLE_ACCURACY = {
  public: true, threshold: 10, people: 412,
  twin: { n: 9840, brier: 0.187, reliability: 0.006, resolution: 0.051, uncertainty: 0.232 },
  areas: [["op_security", 0.78, 0.64], ["privacy", 0.76, 0.65], ["boundaries", 0.72, 0.66],
          ["manipulation", 0.75, 0.66], ["integrity", 0.71, 0.69], ["prompt_design", 0.7, 0.73],
          ["verification", 0.69, 0.79]]
    .map(([dimension, confidence, hit]) => ({ dimension, confidence, hit,
      gap: Math.round((confidence - hit) * 100) / 100, people: 412, enough: true, n: 1400 })),
};
const SAMPLE_TWIN = {
  prompt_design: { theta: 1.0, n: 8 }, verification: { theta: 0.3, n: 14 },
  integrity: { theta: 1.4, n: 6 }, privacy: { theta: -0.4, n: 11 },
  manipulation: { theta: 0.6, n: 4 }, op_security: { theta: -0.9, n: 3 },
  boundaries: { theta: 0.2, n: 9 },
};

const SAMPLE_PULSE = {
  answers_hour: 41, answers_today: 318, people_today: 96, people_week: 766,
  answers_per_day: [120, 164, 210, 188, 96, 41, 230, 262, 241, 198, 276, 102, 58, 318],
  cases: [
    { key: "2026-W34-fabricated-citation", title: "Var Olmayan Kaynak", finished_day: 23, finished_week: 141 },
    { key: "core-01-family-health-query", title: "Annenin Tahlil Sonucu", finished_day: 17, finished_week: 96 },
    { key: "2026-W36-flawless-phishing", title: "Kusursuz Türkçe", finished_day: 9, finished_week: 58 },
  ],
  live: [{ map_no: 5, people: 4 }, { map_no: 36, people: 3 }, { map_no: 41, people: 2 }],
};

/* A structure is a cluster of drawn pieces; several units can stand in one,
   so footprints are looked up per structure. Pieces without a legend number
   are kept as context so the campus reads as a whole. */
const PIECES = {};
const CONTEXT = [];
CAMPUS.build.forEach(([d, evenodd, cid]) => {
  if (cid == null) CONTEXT.push([d, evenodd]);
  else (PIECES[cid] ??= []).push([d, evenodd]);
});

const TENANTS = {};
for (const [cid, list] of Object.entries(CAMPUS.tenants)) {
  TENANTS[cid] = [...new Set(list.map((n) => UNIT_OF[n] ?? n))];
}

/* Everything a unit stands in. */
const FOOTPRINTS = {};
const STRUCTURES = {};
for (const [cid, units] of Object.entries(TENANTS)) {
  for (const u of units) {
    (STRUCTURES[u] ??= []).push(cid);
    (FOOTPRINTS[u] ??= []).push(...(PIECES[cid] ?? []));
  }
}

/* Who shares a building with whom. */
const COTENANTS = {};
for (const units of Object.values(TENANTS)) {
  if (units.length < 2) continue;
  for (const a of units) {
    COTENANTS[a] ??= new Set();
    for (const b of units) if (b !== a) COTENANTS[a].add(b);
  }
}
for (const k of Object.keys(COTENANTS)) COTENANTS[k] = [...COTENANTS[k]];

/* A building shared by several units is divided equally between them, with a
   line where the printed sheet draws one. The split is equal because the map
   gives no floor areas.
   Left-to-right order follows the legend number unless it is listed here. */
const SHARE_ORDER = [[31, 23]];   // Merkezi Derslikler on the left, Yemekhane right

function bboxOf(pieces) {
  const nums = pieces.flatMap(([d]) => d.match(/-?\d+\.?\d*/g).map(Number));
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const SHARES = {};      // unit -> [{ cid, bbox, axis, index, count }]
const EXCLUSIVE = {};   // unit -> pieces of the structures it has to itself
for (const [cid, units] of Object.entries(TENANTS)) {
  const pieces = PIECES[cid] ?? [];
  if (!pieces.length) continue;
  if (units.length < 2) {
    (EXCLUSIVE[units[0]] ??= []).push(...pieces);
    continue;
  }
  const bbox = bboxOf(pieces);
  const w = bbox[2] - bbox[0], h = bbox[3] - bbox[1];
  const axis = h > w * 2 ? "y" : "x";       // a vertical divider unless the block is a tower
  const listed = SHARE_ORDER.find(
    (o) => o.length === units.length && o.every((u) => units.includes(u))
  );
  const order = listed ?? [...units].sort((a, b) => a - b);
  order.forEach((u, i) => (SHARES[u] ??= []).push(
    { cid, bbox, axis, index: i, count: order.length }
  ));
}


/* Markers the printed sheet carries outside the numbered legend, drawn as text
   the way the sheet itself labels them. */
const POI = {
  gate:     { line: "#4E7C59", tr: "Yerleşke Girişi", en: "Campus Gate" },
  entrance: { line: "#4E7C59", tr: "Giriş", en: "Entrance" },
  dorm:     { line: "#5B7A96", tr: "Öğrenci Yurtları", en: "Dormitories" },
  bus:      { line: "#7C6BA8", tr: "Otobüs Durağı", en: "Bus Stop" },
  mosque:   { tr: "Cami", en: "Mosque" },
  sport:    { tr: "Spor Alanı", en: "Sports Ground" },
  cafe:     { tr: "Kafeterya", en: "Cafeteria" },
  amphi:    { tr: "Amfi Tiyatro", en: "Amphitheatre" },
  print:    { tr: "Matbaa", en: "Printery" },
};
const POI_ALWAYS = ["gate", "entrance", "dorm", "bus"];

/* Small block plans for the district row. */
const DISTRICT_PLAN = [
  [[16, 26, 30, 18], [50, 20, 20, 24], [74, 28, 26, 16]],
  [[14, 22, 42, 22], [62, 30, 18, 14], [84, 26, 20, 18]],
  [[20, 30, 22, 14], [46, 22, 30, 22], [80, 32, 22, 12]],
];

/* Walking routes follow the map's own road outlines, so people keep to the
   pavement. */
function pathLength(d) {
  const nums = d.match(/-?\d+\.?\d*/g);
  if (!nums) return 0;
  let len = 0, px = null, py = null;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = +nums[i], y = +nums[i + 1];
    if (px !== null) len += Math.hypot(x - px, y - py);
    px = x; py = y;
  }
  return len;
}

const ROUTES = (() => {
  const out = CAMPUS.ground
    .filter(([d, cls]) => cls === "road" || cls === "road2")
    .map(([d]) => ({ d, len: pathLength(d) }))
    .filter((r) => r.len > 90 && r.d.split("M").length === 2)
    .sort((a, b) => b.len - a.len)
    .slice(0, 14);
  if (CAMPUS.bridge) {
    const [bx, by] = CAMPUS.bridge;
    const d = `M${bx - 60} ${by + 6} L${bx - 15} ${by} L${bx + 26} ${by - 4} L${bx + 74} ${by - 12}`;
    out.push({ d, len: pathLength(d) });
  }
  return out;
})();

const CARS = Array.from({ length: 12 }, (_, i) => {
  const r = RNG(3301 + i * 53);
  const dur = 26 + r() * 16;
  return { id: i, dur, delay: -r() * dur, back: r() > 0.5 };
});

const LAMPS = (() => {
  const out = [];
  for (const rt of ROUTES) {
    const n = rt.d.match(/-?\d+\.?\d*/g).map(Number);
    for (let i = 0; i + 1 < n.length; i += 30) out.push([n[i], n[i + 1]]);
  }
  return out.slice(0, 52);
})();

const PACE = 7.5;   // viewBox units per second
const WALKERS = Array.from({ length: 64 }, (_, i) => {
  const r = RNG(9001 + i * 37);
  const route = i % ROUTES.length;
  const dur = Math.max(18, (ROUTES[route].len / PACE) * (0.85 + r() * 0.4));
  return { id: i, route, dur, delay: -r() * dur, back: r() > 0.5, size: 1.0 + r() * 0.6 };
});

/* The highway corridor, for traffic. */
const HIGHWAY_ROUTE = (() => {
  const cands = CAMPUS.ground
    .filter(([d, cls]) => cls === "road")
    .map(([d]) => {
      const n = d.match(/-?\d+\.?\d*/g).map(Number);
      const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
      return { d, h: Math.max(...ys) - Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) };
    })
    .filter((r) => r.h > r.w * 1.6 && r.h > 200);
  return cands.sort((a, b) => b.h - a.h)[0]?.d || null;
})();

/* Lit windows, scattered once per unit from a fixed seed. */
const WINDOW_CACHE = {};
function windowsFor(id, anchor, tier) {
  const key = `${id}:${tier}`;
  if (WINDOW_CACHE[key]) return WINDOW_CACHE[key];
  const r = RNG(String(id).split("").reduce((a, c) => a + c.charCodeAt(0), 7) * 613 + tier);
  const out = Array.from({ length: 2 + tier * 2 }, () => {
    const s = 0.9 + r() * 0.9;
    return [anchor[0] - 8 + r() * 16, anchor[1] - 7 + r() * 14, s];
  });
  WINDOW_CACHE[key] = out;
  return out;
}

/* How busy the paths look at a given hour. The walkers and the traffic are
   scenery; no figure is read from them. */
const DENSITY = (h) => (h < 6 ? 0.05 : h < 8 ? 0.28 : h < 10 ? 0.75
                      : h < 16 ? 1 : h < 18 ? 0.72 : h < 21 ? 0.34 : 0.12);

/* Every drawn part a unit holds: the structures it has to itself, plus its
   share of the ones it shares. A share carries its clip and, where it meets a
   neighbour, the line that separates them. */
const PARTS_CACHE = new Map();
function partsFor(p) {
  const key = p.key2 ?? p.no;
  if (PARTS_CACHE.has(key)) return PARTS_CACHE.get(key);
  const out = [];
  const mine = EXCLUSIVE[p.no] ?? [];

  if (mine.length && p.halfOf == null) {
    const bb = bboxOf(mine);
    out.push({ pieces: mine, clip: null, centre: p.anchor, divider: null,
               h: bb[3] - bb[1] });
  } else if (mine.length && p.halfOf != null) {
    // One structure holding two graduate schools: halved down the middle.
    const [x0, y0, x1, y1] = bboxOf(mine);
    const half = (x1 - x0) / 2;
    out.push({
      pieces: mine,
      clip: { x: x0 + half * p.half, y: y0, w: half, h: y1 - y0 },
      centre: [x0 + half * (p.half + 0.5), (y0 + y1) / 2],
      h: y1 - y0,
      divider: p.half === 1
        ? { x1: x0 + half, y1: y0, x2: x0 + half, y2: y1 } : null,
    });
  }

  for (const sh of SHARES[p.no] ?? []) {
    const [x0, y0, x1, y1] = sh.bbox;
    const span = sh.axis === "x" ? (x1 - x0) / sh.count : (y1 - y0) / sh.count;
    const clip = sh.axis === "x"
      ? { x: x0 + span * sh.index, y: y0, w: span, h: y1 - y0 }
      : { x: x0, y: y0 + span * sh.index, w: x1 - x0, h: span };
    out.push({
      pieces: PIECES[sh.cid] ?? [],
      clip,
      centre: [clip.x + clip.w / 2, clip.y + clip.h / 2],
      h: clip.h,
      divider: sh.index > 0
        ? (sh.axis === "x"
            ? { x1: clip.x, y1: y0, x2: clip.x, y2: y1 }
            : { x1: x0, y1: clip.y, x2: x1, y2: clip.y })
        : null,
    });
  }
  PARTS_CACHE.set(key, out);
  return out;
}


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

/* ---------------------------------------------------------------------------
   Live participation.

   The map draws the campus from the printed sheet's own geometry; the numbers
   on it come from the server. Counts only. No unit ever appears here with a
   competence figure attached, so units cannot be ranked by performance.
   --------------------------------------------------------------------------- */

/* An answer for visitors that says the part is closed now. The shell asks
   again what is open, and a visitor whose campus was closed meanwhile is taken
   to the sign-in page instead of being shown sample figures. */
function closedNow(res) {
  if (res.status === 404 && res.url.includes("/api/public/")) {
    window.dispatchEvent(new Event("yazem:visitors"));
  }
  return res;
}

async function fetchActivity(from) {
  const res = closedNow(await fetch(`${API}${from}/map/activity`,
                                    { credentials: "include", headers: langHeaders() }));
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/* Server counts, keyed by the legend number the map already uses. Sample data
   is the fallback so the sheet can be worked on without a server, and the
   screen says which one it is showing. `from` is "" for someone signed in and
   "/public" for a visitor. */
function useActivity(sample, from = "") {
  const [live, setLive] = useState(null);
  const [units, setUnits] = useState({});
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let stop = false;
    fetchActivity(from)
      .then((d) => {
        if (stop) return;
        const byNo = {};
        const units = {};
        for (const loc of d.locations ?? []) {
          // A district school has no number on the sheet; its district names it.
          const key = loc.map_no ?? DISTRICT_KEY[loc.district];
          if (key == null) continue;
          byNo[key] = { reg: loc.registered, act: loc.active_7d,
                        weeks: loc.weeks ?? null, days: loc.days ?? null };
          if (loc.unit_id != null && loc.map_no != null) units[loc.map_no] = loc.unit_id;
        }
        setLive(byNo);
        setUnits(units);
        setOffline(false);
      })
      .catch(() => { if (!stop) { setOffline(true); setLive(null); } });
    return () => { stop = true; };
  }, [from]);

  // A unit the server does not report is drawn quiet, so every building stays
  // on the map.
  const data = useMemo(() => {
    if (!live) return sample;
    const out = {};
    for (const key of Object.keys(sample)) {
      out[key] = live[key] ?? { reg: 0, act: 0, weeks: null, days: null };
    }
    for (const [no, v] of Object.entries(live)) out[no] = v;
    return out;
  }, [live, sample]);

  return { data, offline, isLive: live !== null, units };
}


/* What the campus is doing now: whole-campus counts, the week's most
   finished cases, and the buildings where at least two people answered in the
   last hour. Asked again every minute while the screen is open. */
function usePulse(sample, from = "") {
  const [pulse, setPulse] = useState(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let stop = false;
    const ask = () => fetch(`${API}${from}/map/pulse`, { credentials: "include", headers: langHeaders() })
      .then(closedNow)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!stop) { setPulse(d); setOffline(false); } })
      .catch(() => { if (!stop) setOffline(true); });
    ask();
    const id = setInterval(ask, 60000);
    return () => { stop = true; clearInterval(id); };
  }, [from]);
  return offline || !pulse ? { ...sample, sample: offline } : pulse;
}

/* The signed-in person's own twin, drawn over the campus rose. A visitor has
   none. */
function useMyTwin(skip = false) {
  const [twin, setTwin] = useState(null);
  useEffect(() => {
    if (skip) return undefined;
    let stop = false;
    fetch(`${API}/me`, { credentials: "include", headers: langHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (stop || !d?.twin) return;
        setTwin(Object.fromEntries(d.twin.map((x) => [x.dimension,
          { theta: Number(x.theta), n: Number(x.attempts) }])));
      })
      .catch(() => {});
    return () => { stop = true; };
  }, [skip]);
  return twin;
}

/* ---------------------------------------------------------------------------
   Awareness.

   Two shapes, both unrankable by design.

   Campus-wide: one institution looking at itself, areas weakest first. The
   ordering is the whole finding.

   Per unit: a band against the campus average, plus that unit's own weakest
   area, which the unit can act on. The band has three values so two units in
   the same band cannot be put in an order.
   --------------------------------------------------------------------------- */

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

const AREA = {
  tr: { verification: "Doğrulama", privacy: "Mahremiyet", prompt_design: "İstem Tasarımı",
        integrity: "Atıf ve Dürüstlük", manipulation: "Manipülasyon Direnci",
        op_security: "Kurumsal Güvenlik", boundaries: "Sınır ve Yanlılık" },
  en: { verification: "Verification", privacy: "Privacy", prompt_design: "Prompt Design",
        integrity: "Citation", manipulation: "Manipulation", op_security: "Institutional",
        boundaries: "Limits" },
};

const AREA_ICON = {
  verification: "🔍", privacy: "🔒", prompt_design: "✍️", integrity: "🔗",
  manipulation: "🎭", op_security: "🛡️", boundaries: "🚧",
};

const BAND = {
  tr: { above: "kampüsün üstünde", around: "kampüsle aynı düzeyde",
        below: "kampüsün altında", unknown: "ölçülmedi" },
  en: { above: "above the campus", around: "level with the campus",
        below: "below the campus", unknown: "not measured" },
};

/* Text colours, from the skin, so they keep their contrast after dark. */
const BAND_TONE = { above: "var(--ink-good)", around: "var(--ink-quiet)", below: "var(--ink)",
                    unknown: "var(--muted)" };

/* A level is a θ mean, shown as one of five plain words covering the range
   the twin produces. */
function levelWord(level, lang) {
  const tr = ["çok zayıf", "zayıf", "orta", "iyi", "çok iyi"];
  const en = ["very weak", "weak", "fair", "good", "very good"];
  const i = level < -0.5 ? 0 : level < 0.2 ? 1 : level < 0.9 ? 2 : level < 1.6 ? 3 : 4;
  return (lang === "tr" ? tr : en)[i];
}

/* `from` as for useActivity; null asks nothing, for a part that is closed to
   visitors. */
function useAwareness(from = "") {
  const [campus, setCampus] = useState(null);
  useEffect(() => {
    if (from == null) return undefined;
    let stop = false;
    fetch(`${API}${from}/awareness`, { credentials: "include", headers: langHeaders() })
      .then(closedNow)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!stop) setCampus(d); })
      .catch(() => {});
    return () => { stop = true; };
  }, [from]);
  return campus;
}

function useTwinAccuracy(from = "") {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (from == null) return undefined;
    let stop = false;
    fetch(`${API}${from}/twin/accuracy`, { credentials: "include", headers: langHeaders() })
      .then(closedNow)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!stop) setData(d); })
      .catch(() => {});
    return () => { stop = true; };
  }, [from]);
  return data;
}

const confWord = (gap) => (gap == null ? null : gap > 0.08 ? "confOver" : gap < -0.08 ? "confUnder" : "confFine");
const CONF_TONE = { confOver: "var(--ink)", confUnder: "var(--ink-warn)", confFine: "var(--ink-quiet)" };

function useUnitAwareness(unitId, from = "") {
  const [data, setData] = useState(null);
  useEffect(() => {
    let stop = false;
    setData(null);
    if (unitId == null || from == null) return undefined;
    fetch(`${API}${from}/awareness/unit/${unitId}`, { credentials: "include", headers: langHeaders() })
      .then(closedNow)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!stop) setData(d); })
      .catch(() => {});
    return () => { stop = true; };
  }, [unitId, from]);
  return data;
}

/* The campus as one twin: a rose drawn the way each person's is, from the
   campus averages, with the person's own twin traced over it. Areas answered
   by too few people stay closed buds. Below it, the areas weakest first, in
   words: the ordering is the finding. */
const ROSE_AREAS = ["prompt_design", "verification", "integrity", "privacy",
                    "manipulation", "op_security", "boundaries"];
const AREA_SHORT = {
  tr: { prompt_design: "İstem", verification: "Doğrulama", integrity: "Atıf",
        privacy: "Mahremiyet", manipulation: "Manipülasyon", op_security: "Güvenlik",
        boundaries: "Sınırlar" },
  en: { prompt_design: "Prompt", verification: "Verify", integrity: "Integrity",
        privacy: "Privacy", manipulation: "Manipulation", op_security: "Security",
        boundaries: "Limits" },
};
const RR = { size: 320, c: 160, core: 22, max: 108, label: 138 };
const RSECT = (Math.PI * 2) / ROSE_AREAS.length;
const RGAP = 0.035;
const sig = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
const rAt = (a, r) => [RR.c + Math.cos(a) * r, RR.c + Math.sin(a) * r];
const rFor = (p) => RR.core + Math.max(0, Math.min(1, p)) * (RR.max - RR.core);
const r1 = (x) => x.toFixed(1);

function roseArc(a0, a1, r, clockwise = true) {
  const [x0, y0] = rAt(clockwise ? a0 : a1, r), [x1, y1] = rAt(clockwise ? a1 : a0, r);
  return `M${r1(x0)} ${r1(y0)}A${r1(r)} ${r1(r)} 0 0 ${clockwise ? 1 : 0} ${r1(x1)} ${r1(y1)}`;
}

function rosePetal(a0, a1, r0, r) {
  const k = Math.min(7, (r - r0) / 3, ((a1 - a0) * r) / 4);
  const [x0, y0] = rAt(a0, r0), [x5, y5] = rAt(a1, r0);
  if (k < 1.5) {
    const [x1, y1] = rAt(a0, r), [x2, y2] = rAt(a1, r);
    return `M${r1(x0)} ${r1(y0)}L${r1(x1)} ${r1(y1)}A${r1(r)} ${r1(r)} 0 0 1 ${r1(x2)} ${r1(y2)}`
         + `L${r1(x5)} ${r1(y5)}A${r0} ${r0} 0 0 0 ${r1(x0)} ${r1(y0)}Z`;
  }
  const da = k / r;
  const [x1, y1] = rAt(a0, r - k), [c1x, c1y] = rAt(a0, r), [x2, y2] = rAt(a0 + da, r);
  const [x3, y3] = rAt(a1 - da, r), [c2x, c2y] = rAt(a1, r), [x4, y4] = rAt(a1, r - k);
  return `M${r1(x0)} ${r1(y0)}L${r1(x1)} ${r1(y1)}Q${r1(c1x)} ${r1(c1y)} ${r1(x2)} ${r1(y2)}`
       + `A${r1(r)} ${r1(r)} 0 0 1 ${r1(x3)} ${r1(y3)}Q${r1(c2x)} ${r1(c2y)} ${r1(x4)} ${r1(y4)}`
       + `L${r1(x5)} ${r1(y5)}A${r0} ${r0} 0 0 0 ${r1(x0)} ${r1(y0)}Z`;
}

const ROSE_RAMP = [[0, "#F4E1DE"], [0.3, "#EFC3BE"], [0.5, "#E8A9A2"], [0.65, "#D65F58"],
                   [0.8, "#C00000"], [1, "#9E0000"]];
function roseTone(p) {
  const x = Math.max(0, Math.min(1, p));
  let i = 1;
  while (i < ROSE_RAMP.length - 1 && ROSE_RAMP[i][0] < x) i++;
  const [p0, c0] = ROSE_RAMP[i - 1], [p1, c1] = ROSE_RAMP[i];
  const k = (x - p0) / (p1 - p0 || 1);
  const ch = (c, at) => parseInt(c.slice(at, at + 2), 16);
  const mix = (at) => Math.round(ch(c0, at) + (ch(c1, at) - ch(c0, at)) * k);
  return `rgb(${mix(1)},${mix(3)},${mix(5)})`;
}

let campusRoseCount = 0;

/* `today`, when a day gone by is shown: the level of each area now, drawn as a
   dashed line so the change since that day can be seen. */
function CampusRose({ areas, mine, lang, people, C, today }) {
  const uid = useMemo(() => `cr${(campusRoseCount += 1)}`, []);
  const count = Number(people ?? 0).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB");
  const by = Object.fromEntries((areas ?? []).map((a) => [a.dimension, a]));
  return (
    <svg viewBox={`0 0 ${RR.size} ${RR.size}`} style={S.rose} role="img"
      aria-label={ROSE_AREAS.map((d) => AREA_SHORT[lang][d]).join(", ")}>
      <circle cx={RR.c} cy={RR.c} r={rFor(0.5)} fill="none" stroke={C.line}
        strokeDasharray="1 4" strokeLinecap="round" />
      <circle cx={RR.c} cy={RR.c} r={RR.max} fill="none" stroke={C.line} />
      {ROSE_AREAS.map((d, i) => {
        const a = -Math.PI / 2 + i * RSECT;
        const a0 = a - RSECT / 2 + RGAP, a1 = a + RSECT / 2 - RGAP;
        const area = by[d];
        const known = area?.enough !== false && area?.level != null;
        const p = known ? sig(area.level) : 0.5;
        const tone = roseTone(p);
        const lower = Math.sin(a) > 0.5;
        const me = mine?.[d];
        return (
          <g key={d} className="rose-petal" style={{ animationDelay: `${i * 70}ms` }}>
            <path d={rosePetal(a0, a1, RR.core, rFor(p))}
              fill={known ? tone : C.tint} stroke={known ? tone : C.muted}
              strokeDasharray={known ? undefined : "3 3"} strokeWidth="1"
              opacity={known ? 0.92 : 0.7} />
            {me && me.n > 0 && (
              <path d={roseArc(a0 + 0.04, a1 - 0.04, rFor(sig(me.theta)))} fill="none"
                stroke={C.text} strokeWidth="2.2" strokeLinecap="round" />
            )}
            {today?.[d] != null && (
              <path d={roseArc(a0 + 0.04, a1 - 0.04, rFor(sig(today[d])))} fill="none"
                stroke={C.text} strokeWidth="1.6" strokeDasharray="3 3" strokeLinecap="round"
                opacity="0.8" data-today-arc />
            )}
            <path id={`${uid}-l${i}`} fill="none"
              d={roseArc(a - RSECT / 2, a + RSECT / 2, lower ? RR.label + 9 : RR.label, !lower)} />
            <text style={{ ...SVGT.roseLabel, fill: known ? C.text : C.muted }}>
              <textPath href={`#${uid}-l${i}`} startOffset="50%" textAnchor="middle">
                {AREA_SHORT[lang][d]}
              </textPath>
            </text>
          </g>
        );
      })}
      <circle cx={RR.c} cy={RR.c} r={RR.core - 2} fill={C.card} stroke={C.line} />
      <text x={RR.c} y={RR.c + 1} textAnchor="middle"
        style={{ ...SVGT.roseCentre, fontSize: count.length > 5 ? 11.5 : 14 }}>{count}</text>
      <text x={RR.c} y={RR.c + 12} textAnchor="middle" style={SVGT.roseCentreCap}>
        {lang === "tr" ? "kişi" : "people"}
      </text>
    </svg>
  );
}

function CampusAwareness({ data, accuracy, lang, t, mine, C, asOf, today }) {
  if (!data?.areas?.length) return null;
  const sure = Object.fromEntries((accuracy?.areas ?? []).map((a) => [a.dimension, a]));
  const now = asOf && today?.length
    ? Object.fromEntries(today.filter((a) => a.level != null && a.enough !== false)
      .map((a) => [a.dimension, a.level]))
    : null;
  const twinAcc = accuracy?.twin;
  const measured = data.areas.filter((a) => a.level != null);
  const worst = measured[0] ?? data.areas[0];
  return (
    <section style={S.awCard} data-panel="campus-twin" data-as-of={asOf ? "past" : "now"}>
      <div style={S.awHead}>{t.awareness}</div>
      <h2 style={S.awTitle}>{t.campusTwin}</h2>
      {asOf && <p style={S.awAsOf} data-twin-day>{t.asOf.replace("{date}", asOf)}</p>}
      <p style={S.awLede}>
        {t.awLede
          .replace("{area}", AREA[lang][worst.dimension] ?? worst.dimension)
          .replace("{people}", Number(data.people ?? 0).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB"))}
      </p>
      <div style={S.awGrid}>
        <div style={S.roseWrap}>
          <CampusRose areas={data.areas} mine={mine} lang={lang} people={data.people} C={C}
            today={now} />
          <div style={S.roseKey}>
            <span style={S.keyItem}>
              <span style={{ ...S.keySwatch, background: "#D65F58" }} />{now ? t.campusThen : t.campusFill}
            </span>
            {mine && <span style={S.keyItem}><span style={S.keyLine} />{t.you}</span>}
            {now && <span style={S.keyItem}><span style={S.keyDash} />{t.campusNow}</span>}
          </div>
        </div>
        <div>
          <p style={S.awSmall}>{now ? t.twinLedePast : mine ? t.twinLede : t.twinLedeAlone}</p>
          <div style={S.awList}>
            {data.areas.map((a) => {
              const tone = a.level == null ? C.muted
                : a.level < 0 ? "var(--ink)" : a.level < 0.8 ? "var(--ink-warn)" : "var(--ink-good)";
              return (
                <div key={a.dimension} style={S.awRow}>
                  <span style={S.awIcon}>{AREA_ICON[a.dimension]}</span>
                  <span style={S.awName}>{AREA[lang][a.dimension] ?? a.dimension}</span>
                  <span style={{ ...S.awWord, color: tone }}>
                    {a.level == null ? "—" : levelWord(a.level, lang)}
                  </span>
                  {confWord(sure[a.dimension]?.gap) && (
                    <span style={{ ...S.awConf, color: CONF_TONE[confWord(sure[a.dimension].gap)] }}
                      data-conf={confWord(sure[a.dimension].gap)}>
                      {t[confWord(sure[a.dimension].gap)]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {Object.values(sure).some((a) => a.gap != null) && <p style={S.awSmall}>{t.confNote}</p>}
          {twinAcc && (
            <p style={S.awSmall} data-panel="twin-accuracy">
              {t.twinAcc.replace("{n}", twinAcc.n.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB"))
                .replace("{b}", lang === "tr" ? twinAcc.brier.toFixed(2).replace(".", ",") : twinAcc.brier.toFixed(2))}
            </p>
          )}
          {data.areas.some((a) => a.level == null) && (
            <p style={S.awSmall}>{t.budNote.replace("{n}", data.threshold ?? 10)}</p>
          )}
        </div>
      </div>
      <p style={S.awNote}>{data.note}</p>
    </section>
  );
}

/* A short row of bars, oldest first; the marked one is drawn solid. */
function Bars({ title, values, colour, mark, hidden }) {
  if (!values) {
    return hidden ? <p style={S.barsHidden}>{hidden}</p> : null;
  }
  const max = Math.max(1, ...values);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={S.weekCap}>{title}</div>
      <div style={S.week}>
        {values.map((v, i) => (
          <span key={i} className="tick" title={String(v)} style={{
            height: `${6 + (v / max) * 32}px`,
            background: v > 0 ? colour : "#E2E3DA",
            opacity: mark == null || mark === i ? 1 : 0.45,
            animationDelay: `${i * 55}ms`,
          }} />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The time bar.

   Any day and hour since the platform opened, and the campus as it was then:
   the people registered by that day and those who had finished a case in the
   seven days up to it. Played, the sky above turns through the days, the moon
   through its phases and the gardens through the seasons, faster or slower.
   The figures come from /map/history; the sky is worked out here from the date.
   --------------------------------------------------------------------------- */

const TL_HOUR = 3600000, TL_DAY = 86400000;
/* Days played per four seconds. Faster than a day the clock is held at noon,
   so the sky does not flicker between night and day. */
const SPEEDS = { day: 1, week: 7, month: 30 };
const LAPSE_SECONDS = 4;
/* Isparta keeps +03:00 all year, so a campus day is a fixed span. */
const campusMidnight = (iso) => Date.parse(`${iso}T00:00:00+03:00`);
const noonOf = (ms, start) => start + Math.floor((ms - start) / TL_DAY) * TL_DAY + 13 * TL_HOUR;
const fmtDate = (ms, lang, opts) => new Date(ms).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB",
  { timeZone: "Europe/Istanbul", ...opts });
const dateLong = (ms, lang) => fmtDate(ms, lang, { day: "numeric", month: "long", year: "numeric" });

/* The sky band with the bar that moves it. Keeps the exact moment to itself
   and tells the screen only what it redraws for: the day, the hour and how
   dark it is, each time one of them changes. */
function TimeLapse({ history, clock, weather, t, lang, reduced, onMoment }) {
  const end = clock.getTime();
  const start = history ? campusMidnight(history.start) : end - 13 * TL_DAY;
  const [at, setAt] = useState(null);           // null is now
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("day");
  const chosen = useRef(false);
  const atRef = useRef(null);
  atRef.current = at;

  /* A long history plays by the week until the person picks a speed. */
  useEffect(() => {
    if (!chosen.current && history && history.days > 45) setSpeed("week");
  }, [history]);

  useEffect(() => {
    if (!playing) return undefined;
    const now = () => Date.now() - 60000;
    if (reduced) {
      // One day at a time, once a second, without movement in between.
      const id = setInterval(() => {
        const next = noonOf((atRef.current ?? start) + TL_DAY, start);
        if (next >= now()) { setPlaying(false); setAt(null); } else setAt(next);
      }, 1000);
      return () => clearInterval(id);
    }
    const perMs = (SPEEDS[speed] * TL_DAY) / (LAPSE_SECONDS * 1000);
    let raf, last = null, carried = atRef.current ?? start;
    const tick = (ts) => {
      if (last !== null) {
        carried += Math.min(100, ts - last) * perMs;
        // A quarter of an hour is as fine as the sky needs at this pace.
        const shown = speed === "day"
          ? start + Math.round((carried - start) / (TL_HOUR / 4)) * (TL_HOUR / 4)
          : noonOf(carried, start);
        if (carried >= now()) { setPlaying(false); setAt(null); return; }
        if (shown !== atRef.current) setAt(shown);
      }
      last = ts;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, reduced, start]);

  useEffect(() => {
    if (at == null) { onMoment(null); return; }
    const date = new Date(at);
    const day = Math.floor((at - start) / TL_DAY);
    const { h } = campusClock(date);
    onMoment({ day, dayStart: start + day * TL_DAY, hour: h - (h % 2),
               dark: Math.round(darkness(sunPosition(date).altitude) * 4) / 4 });
  }, [at, start, onMoment]);

  const steps = Math.max(1, Math.round((end - start) / TL_HOUR));
  const pos = at == null ? steps : Math.max(0, Math.min(steps, Math.round((at - start) / TL_HOUR)));
  const shownMs = at ?? end;
  const when = new Date(shownMs).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB",
    { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric",
      weekday: "long", hour: "2-digit", minute: "2-digit" });
  const months = [];
  {
    let y = Number(fmtDate(start, "en", { year: "numeric" }));
    let m = Number(fmtDate(start, "en", { month: "numeric" }));
    for (let k = 0; k < 40; k++) {
      m += 1; if (m > 12) { m = 1; y += 1; }
      const ms = Date.parse(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+03:00`);
      if (ms >= end) break;
      months.push({ ms, label: fmtDate(ms, lang, { month: "short" }) });
    }
  }
  const every = months.length > 9 ? 2 : 1;
  const play = () => {
    if (playing) { setPlaying(false); return; }
    if (at == null) setAt(speed === "day" || reduced ? start : noonOf(start, start));
    setPlaying(true);
  };
  return (
    <>
      <SkyBand now={at == null ? clock : new Date(at)} weather={at == null ? weather : null}
        t={t} lang={lang} reduced={reduced} past={at != null} />
      <div style={S.timeBar} data-panel="time" data-time={at == null ? "now" : new Date(at).toISOString()}>
        <button onClick={play} style={S.replayBtn} data-action="time-play"
          aria-label={playing ? t.timePause : t.timePlay} title={playing ? t.timePause : t.timePlay}>
          <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
            {playing
              ? <g fill="currentColor"><rect x="2" y="1.5" width="2.6" height="9" rx=".6" />
                  <rect x="7.4" y="1.5" width="2.6" height="9" rx=".6" /></g>
              : <path d="M3 1.6 L10.4 6 L3 10.4 Z" fill="currentColor" />}
          </svg>
        </button>
        <div style={S.timeTrack}>
          <input type="range" min={0} max={steps} step={1} value={pos} className="time-range"
            aria-label={t.time} aria-valuetext={when}
            onChange={(e) => {
              setPlaying(false);
              const v = Number(e.target.value);
              setAt(v >= steps ? null : start + v * TL_HOUR);
            }} />
          <div style={S.timeMonths} aria-hidden="true">
            {months.map((mo, i) => (i % every === 0) && (
              <span key={mo.ms} style={{ ...S.timeMonth, left: `${((mo.ms - start) / (end - start)) * 100}%` }}>
                {mo.label}
              </span>
            ))}
          </div>
        </div>
        <span style={S.timeWhen} data-time-when>{at == null ? `${t.timeNow} · ${when}` : when}</span>
        <div style={S.seg} role="group" aria-label={t.timeSpeed}>
          {Object.keys(SPEEDS).map((k) => (
            <button key={k} onClick={() => { chosen.current = true; setSpeed(k); }}
              aria-pressed={speed === k} title={t.timeSpeedHelp[k]} data-speed={k}
              style={{ ...S.segBtn, ...(speed === k ? S.segOn : null) }}>{t.timeSpeeds[k]}</button>
          ))}
        </div>
        <button onClick={() => { setPlaying(false); setAt(null); }} disabled={at == null}
          data-action="time-now"
          style={{ ...S.toggle, ...(at == null ? S.timeNowOff : null) }}>{t.timeNow}</button>
      </div>
    </>
  );
}

/* A history for the sheet without a server: the sample counts spread back
   over eight weeks. */
function sampleHistory(data, clock) {
  const days = 56;
  const today = new Date(clock.getTime() + 3 * TL_HOUR).toISOString().slice(0, 10);
  const start = new Date(campusMidnight(today) - (days - 1) * TL_DAY + 3 * TL_HOUR)
    .toISOString().slice(0, 10);
  const locations = [];
  for (const [key, v] of Object.entries(data)) {
    const r = RNG(String(key).length * 97 + v.reg);
    const reg = [], act = [];
    for (let i = 0; i < days; i++) {
      const k = i / (days - 1);
      reg.push(Math.round(v.reg * (0.35 + 0.65 * Math.sqrt(k))));
      const w = v.weeks ? v.weeks[Math.min(7, Math.floor(i / 7))] : v.act;
      act.push(Math.max(0, Math.round(w * (0.8 + r() * 0.4))));
    }
    locations.push({ key, reg, act });
  }
  const sum = (f) => Array.from({ length: days }, (_, i) => locations.reduce((a, l) => a + f(l)[i], 0));
  const answers = sum((l) => l.act).map((n, i) => Math.round(n * (([0, 6].includes(
    new Date(campusMidnight(start) + i * TL_DAY + 12 * TL_HOUR).getUTCDay())) ? 0.6 : 1.4)));
  return { start, today, days, threshold: 10,
           campus: { registered: sum((l) => l.reg), active: sum((l) => l.act), answers,
                     people: answers.map((n) => Math.round(n / 3)) },
           locations };
}

/* One building's reading. Below the threshold it shows only a notice, so no
   figure can reflect one person's result. */
function UnitAwareness({ data, lang, t, today }) {
  if (!data) return null;

  if (!data.enough) {
    return (
      <div style={S.uaBox} data-panel="unit-awareness" data-enough="no">
        <div style={S.uaCap}>{t.awareness}</div>
        <p style={S.uaThin}>{t.tooFew.replace("{n}", data.threshold ?? 10)}</p>
      </div>
    );
  }

  const strong = data.strongest, weak = data.weakest;
  return (
    <div style={S.uaBox} data-panel="unit-awareness" data-enough="yes">
      <div style={S.uaCap}>{t.awareness}</div>
      <div style={S.uaRow}>
        <span style={S.uaIcon}>{AREA_ICON[strong]}</span>
        <span style={S.uaLabel}>{t.strongestArea}</span>
        <span style={S.uaName}>{AREA[lang][strong] ?? strong}</span>
      </div>
      <div style={S.uaRow}>
        <span style={S.uaIcon}>{AREA_ICON[weak]}</span>
        <span style={S.uaLabel}>{t.weakestArea}</span>
        <span style={{ ...S.uaName, color: "var(--ink)" }}>{AREA[lang][weak] ?? weak}</span>
      </div>
      <div style={S.uaBands}>
        {Object.entries(data.areas ?? {}).map(([dim, band]) => (
          <span key={dim} style={{ ...S.uaChip, color: BAND_TONE[band],
                                   borderColor: BAND_TONE[band] }}
            title={`${AREA[lang][dim] ?? dim}: ${BAND[lang][band]}`}>
            {AREA_ICON[dim]}
          </span>
        ))}
      </div>
      <p style={S.uaThin}>{t.bandNote.replace("{n}", data.people)}</p>
      {today && <p style={S.uaThin} data-unit-today>{t.unitToday}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Institutional marks.

   Embedded, so every screen ships as one file that can be dropped into any
   host and the logos load with it. Both are quantised to a few kilobytes; as
   two-ink marks they need only a small palette.

   The wordmark has a transparent background so it sits directly on the page.
   --------------------------------------------------------------------------- */

const LOGO_AIARC = "data:image/png;base64,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";

const LOGO_SDU = "data:image/png;base64,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";

/* ---------------------------------------------------------------------------
   The sky, the weather and the places on the map.

   The sky is worked out in the browser for the campus's own coordinates. The
   weather, the cases set on campus, the events, the campus twin's forecast,
   the week's trap and the person's own light come from the server. Without a
   server the screen shows sample values, as it does for participation.
   --------------------------------------------------------------------------- */

function useServer(path, every = 0) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (path == null) return undefined;
    let stop = false;
    const ask = () => fetch(`${API}${path}`, { credentials: "include", headers: langHeaders() })
      .then(closedNow)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!stop && d) setData(d); })
      .catch(() => {});
    ask();
    const id = every ? setInterval(ask, every) : null;
    return () => { stop = true; if (id) clearInterval(id); };
  }, [path, every]);
  return data;
}

const SAMPLE_WEATHER = { available: true, kind: "partly", strength: "light", temperature: 14.2,
                         cloud: 45, precipitation: 0, wind: 8.4, is_day: true };
const SAMPLE_CASES = [
  { key: "2026-W34-fabricated-citation", title: "Var Olmayan Kaynak", type: "weekly",
    status: "live", place: "36", locale: "tr" },
  { key: "dog-07-yapay-zekaya-dogrulattim", title: "Yapay Zekâya Doğrulattım", type: "open",
    status: "live", place: "57", attempted: true, finished: true, revealed: true, locale: "tr" },
  { key: "core-01-family-health-query", title: "Annenin Tahlil Sonucu", type: "core",
    status: "live", place: "dorm", attempted: true, locale: "tr" },
  { key: "dur-03-kelime-degistirici", title: "Kelime Değiştirici", type: "open",
    status: "live", place: "cafe", locale: "tr" },
  { key: "gvn-10-modelin-onerdigi-paket", title: "Modelin Önerdiği Paket", type: "open",
    status: "live", place: "3", locale: "tr" },
  { key: "dog-17-testler-gecti-diyor", title: "Testler Geçti Diyor", type: "open",
    status: "live", place: "6", locale: "tr" },
];
const SAMPLE_EVENTS = [
  { id: 1, title: "Yapay Zekâ Okuryazarlığı Söyleşisi", place: "22", link: null,
    body: "YAZEM'in bu dönemki ilk söyleşisi Kültür Merkezi'nde.",
    event_at: new Date(Date.now() + 2 * 86400000).toISOString() },
];
const SAMPLE_LIGHT = { place: "5", steps_today: 4, cases_today: 1 };
const SAMPLE_TRAP = { threshold: 10, trap: {
  key: "2026-W34-fabricated-citation", title: "Var Olmayan Kaynak", locale: "tr", step: 2,
  steps: 3, dimension: "verification", people: 214, wrong: 0.62, days: 7, finished: true,
  note: "Künyenin biçimi kusursuz olabilir. Kaynağın var olduğunu gösteren, DOI'nin ya da dergi sayısının gerçekten açılmasıdır." } };
const SAMPLE_FORECAST = {"today": {"day": "2026-10-20", "digest": "bcec3ff58835d8c35304a1df9cf7c8945aca1365513bb0d850eab83224c795ea", "sealed_at": "2026-10-20T07:02:11+03:00"}, "past": [{"day": "2026-10-19", "forecast": 142, "basis": "both", "salt": "a5bb10eb6bdc95823faeb67d6545b23e", "digest": "f5718d102f7ba69bdd13edd1dc0ce17023b71bd6c03f605a2fc31243464c9977", "commitment": "2026-10-19:142:a5bb10eb6bdc95823faeb67d6545b23e", "actual": 151}, {"day": "2026-10-18", "forecast": 138, "basis": "both", "salt": "0899cd856fba9b131050135138cd87c5", "digest": "1526bb45f425c934c437b31840ed7024fc369da00640c307404c7453117dcc10", "commitment": "2026-10-18:138:0899cd856fba9b131050135138cd87c5", "actual": 129}, {"day": "2026-10-17", "forecast": 117, "basis": "both", "salt": "2be9fec91c2c7e4b40fedb0d2bf11da0", "digest": "5664f6ebdf9af0ba3bf5012c114cf3bf60a48d14c479ff885c2a050446cbd44b", "commitment": "2026-10-17:117:2be9fec91c2c7e4b40fedb0d2bf11da0", "actual": 120}, {"day": "2026-10-16", "forecast": 96, "basis": "both", "salt": "73014671303fd8235351b0a5e8aa8c6c", "digest": "7d69092b33023571521d4c0ec51609c40fb4ce3fe22d0804b253fdebfc66aa94", "commitment": "2026-10-16:96:73014671303fd8235351b0a5e8aa8c6c", "actual": 88}, {"day": "2026-10-15", "forecast": 150, "basis": "both", "salt": "6e16930f100e4505c66e0a47609120d6", "digest": "8384becc26896915dccafdda1af6bf7e373526a9e6f1634737279400e5ccb915", "commitment": "2026-10-15:150:6e16930f100e4505c66e0a47609120d6", "actual": 163}, {"day": "2026-10-14", "forecast": 131, "basis": "both", "salt": "d069ad2efe805a0d3b7f993e96ff2585", "digest": "89da7ffe12ffd41a5f70dbb2251f3238017a8f79d88938259f30d1d5fb4d32b6", "commitment": "2026-10-14:131:d069ad2efe805a0d3b7f993e96ff2585", "actual": 127}, {"day": "2026-10-13", "forecast": 124, "basis": "both", "salt": "78dddd3d59eeda1a0397646b3d6470b2", "digest": "1e0453c18d5c4e0aae8067b9ee0c9ccd7a996953e7565249f9aae3d28db19811", "commitment": "2026-10-13:124:78dddd3d59eeda1a0397646b3d6470b2", "actual": 135}]};

/* The hour on the campus clock, wherever the screen is read. */
function campusClock(date) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return { h: get("hour"), m: get("minute") };
  } catch {
    return { h: date.getHours(), m: date.getMinutes() };
  }
}
const timeText = (date, lang) => (date ? date.toLocaleTimeString(lang === "tr" ? "tr-TR" : "en-GB",
  { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }) : "—");
const dayText = (iso, lang) => new Date(`${iso}T12:00:00+03:00`).toLocaleDateString(
  lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" });
const momentText = (iso, lang) => new Date(iso).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB",
  { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const pctText = (v, lang) => (lang === "tr" ? `%${v}` : `${v}%`);
const numText = (v, lang, digits = 1) => v.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB",
  { minimumFractionDigits: digits, maximumFractionDigits: digits });

/* Where a place sits on the map: a building by its number, a spot by the first
   mark of its kind on the printed sheet. */
const SPOT_POINT = {};
for (const [kind, x, y] of CAMPUS.poi ?? []) SPOT_POINT[kind] ??= [x, y];
const placePoint = (place) => (/^\d+$/.test(place ?? "") ? CAMPUS.anchor[Number(place)] ?? null
  : SPOT_POINT[place] ?? null);
/* The selectable unit a building number belongs to. */
const placeUnit = (place) => {
  const n = Number(place), no = UNIT_OF[n] ?? n;
  return PLACES.find((q) => q.no === no && q.halfOf == null)
    ?? PLACES.find((q) => q.halfOf === no) ?? null;
};
const placesOfUnit = (p) => (p.halfOf != null ? [String(p.halfOf)] : p.members.map(String));
const caseState = (c) => (c.voided ? "voided" : c.attempted && !c.finished ? "half"
  : c.finished ? (c.revealed ? "revealed" : "done") : "new");
/* Inside the platform this opens the case on the cases screen. */
const goToCase = (key) => { window.location.hash = `vaka/${key}`; };

/* -------------------------------- the sky -------------------------------- */

const SKY_W = 885, SKY_H = 92, HORIZON = 73;
const STARS = Array.from({ length: 44 }, (_, i) => {
  const r = RNG(7001 + i * 31);
  return [r() * SKY_W, 3 + r() * (HORIZON - 16), 0.45 + r() * 0.75, r() * 4];
});
const SKY_CLOUDS = Array.from({ length: 6 }, (_, i) => {
  const r = RNG(4441 + i * 97);
  return { x: r() * SKY_W, y: 10 + r() * 30, s: 0.7 + r() * 0.7, dur: 110 + r() * 80,
           delay: -r() * 150 };
});
/* From the north-east through the south to the north-west, so the sun rises
   on the left and sets on the right. */
const azX = (az) => (((az - 45 + 360) % 360) / 270) * SKY_W;
const altY = (alt) => HORIZON - (Math.max(-4, Math.min(70, alt)) / 70) * (HORIZON - 8);
/* Davraz lies east-south-east of the campus. Its outline is given as heights
   above the horizon by distance from the peak. */
const DAVRAZ_X = azX(115);
const DAVRAZ = [[-150, 0], [-92, 14], [-48, 27], [-18, 34], [0, 40], [22, 31], [60, 22],
                [110, 12], [170, 0]];
const davrazHeight = (dx) => {
  for (let i = 1; i < DAVRAZ.length; i++) {
    const [x0, h0] = DAVRAZ[i - 1], [x1, h1] = DAVRAZ[i];
    if (dx <= x1) return dx < x0 ? 0 : h0 + ((dx - x0) / (x1 - x0)) * (h1 - h0);
  }
  return 0;
};
/* Black pine forest on Davraz's lower slopes, thicker towards the foot, the
   farther trees first. */
const SLOPE_PINES = Array.from({ length: 72 }, (_, i) => {
  const r = RNG(5303 + i * 29);
  const dx = -136 + r() * 290, h = 3 + r() * 2.8, top = davrazHeight(dx);
  const room = Math.max(0, Math.min(top * 0.5, top - h * 0.8));
  return [DAVRAZ_X + dx, HORIZON + 0.5 - Math.pow(r(), 1.5) * room, h];
}).sort((a, b) => a[1] - b[1]);
/* Pines on the campus itself, nearer than anything else in the band: old
   black pines with flat, layered crowns and young conical ones. */
const NEAR_PINES = [
  [10, 87.5, 15, "young", 1], [28, 91.5, 34, "old", 1], [49, 88.5, 21, "young", 1],
  [67, 91.5, 27, "old", -1], [842, 88.5, 17, "young", 1], [862, 91.5, 31, "old", -1],
  [880, 89.5, 20, "young", 1],
];
/* Rows of oil roses in the plain under Davraz, the back row first. Each bush
   keeps its own twigs and flower places so that it looks the same every day. */
const ROSE_ROWS = [
  { y: 77.4, from: 112, to: 396, step: 4.6, rx: 3, h: 2.9 },
  { y: 83.4, from: 102, to: 406, step: 6, rx: 3.9, h: 3.9 },
  { y: 90.6, from: 90, to: 418, step: 7.8, rx: 5, h: 5.2 },
];
const ROSE_BUSHES = ROSE_ROWS.flatMap((row, k) => {
  const out = [];
  for (let i = 0, x = row.from; x <= row.to; i++, x += row.step) {
    const r = RNG(2711 + k * 1009 + i * 37);
    out.push({
      x: x + (r() - 0.5) * row.step * 0.25, y: row.y, rx: row.rx * (0.9 + r() * 0.2),
      h: row.h * (0.85 + r() * 0.3), s: row.rx / 5, tint: r(),
      twigs: Array.from({ length: 5 }, (_, j) => [(j - 2) * 0.4 + (r() - 0.5) * 0.2, 0.75 + r() * 0.25]),
      flowers: Array.from({ length: 5 }, () => {
        const a = Math.PI * (0.15 + r() * 0.7), d = 0.55 + r() * 0.4;
        return [Math.cos(a) * d, Math.sin(a) * d, Math.floor(r() * 3)];
      }),
    });
  }
  return out;
});

/* One rose bush as it stands at this point of the year. */
function RoseBush({ b, stage, R, snow }) {
  const mound = (k, kh, fill, opacity) => (
    <path d={`M${b.x - b.rx * k} ${b.y} A${b.rx * k} ${b.h * kh} 0 0 1 ${b.x + b.rx * k} ${b.y} Z`}
      fill={fill} opacity={opacity} />
  );
  const twigs = (len, colour, width) => (
    <path d={b.twigs.map(([dx, l]) => `M${b.x} ${b.y} L${b.x + dx * b.rx} ${b.y - b.h * l * len}`).join(" ")}
      stroke={colour} strokeWidth={width} strokeLinecap="round" fill="none" />
  );
  const dots = (n, r, fill) => b.flowers.slice(0, n).map(([fx, fy, c], i) => (
    <circle key={i} cx={b.x + fx * b.rx} cy={b.y - fy * b.h} r={r}
      fill={Array.isArray(fill) ? fill[c] : fill} />
  ));
  const thin = 0.35 + b.s * 0.2;
  let body;
  if (stage === "bare") body = twigs(1, R.twig, thin);
  else if (stage === "pruned") body = twigs(0.45, R.shoot, thin + 0.1);
  else if (stage === "leafing") {
    body = (<>{twigs(0.8, R.twig, thin)}{mound(0.55, 0.45, R.leafLight, 0.9)}
      {b.twigs.map(([dx, l], i) => (
        <circle key={i} cx={b.x + dx * b.rx} cy={b.y - b.h * l * 0.8} r={0.3 + b.s * 0.4} fill={R.leafLight} />
      ))}</>);
  } else if (stage === "buds") body = (<>{mound(1, 1, R.leaf)}{dots(3, 0.2 + b.s * 0.3, R.bud)}</>);
  else if (stage === "bloom") body = (<>{mound(1, 1, R.leaf)}{dots(5, 0.25 + b.s * 0.55, R.petals)}</>);
  else if (stage === "green") body = mound(1, 1, R.leafDeep);
  else if (stage === "turning") body = mound(1, 1, mixHex(R.turn, R.fall, b.tint * 0.35));
  else body = (<>{twigs(0.95, R.twig, thin)}{mound(0.8, 0.7, R.fall, 0.8)}</>);
  return (
    <g>
      {body}
      {snow && !["bare", "pruned"].includes(stage) && (
        <ellipse cx={b.x} cy={b.y - b.h * 0.85} rx={b.rx * 0.6} ry={b.h * 0.22} fill={R.snow} />
      )}
    </g>
  );
}

/* A pine on the campus. The old black pine spreads its crown in loose
   clumps on bare branches, wider than it is tall; the young pine is a cone of
   three tiers. */
const OLD_PINE_CLUMPS = [
  [-0.2, 0.58, 0.15, 0.07], [0.17, 0.6, 0.16, 0.07], [-0.02, 0.66, 0.24, 0.085],
  [-0.15, 0.76, 0.16, 0.075], [0.14, 0.78, 0.17, 0.075], [0, 0.86, 0.18, 0.07],
  [0.04, 0.93, 0.11, 0.055],
];
const OLD_PINE_BRANCHES = [[0.55, -0.2, 0.58], [0.6, 0.17, 0.6], [0.72, -0.15, 0.76], [0.74, 0.14, 0.78]];

function Pine({ x, y, h, kind, flip = 1, P, snow, candles }) {
  if (kind === "old") {
    const lean = 0.03 * h * flip;
    return (
      <g data-pine="old">
        <path d={`M${x - 0.9} ${y} L${x - 0.4 + lean} ${y - h * 0.86} L${x + 0.4 + lean} ${y - h * 0.86} L${x + 0.9} ${y} Z`}
          fill={P.trunk} />
        <path d={OLD_PINE_BRANCHES.map(([from, ox, to]) =>
          `M${x + lean * from} ${y - h * from} L${x + ox * h * flip} ${y - h * to}`).join(" ")}
          stroke={P.trunk} strokeWidth=".7" strokeLinecap="round" fill="none" />
        {OLD_PINE_CLUMPS.map(([ox, oy, kx, ky], i) => {
          const cx = x + ox * h * flip, cy = y - oy * h, rx = kx * h, ry = ky * h;
          return (
            <g key={i}>
              <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={P.dark} />
              <ellipse cx={cx + rx * 0.1 * flip} cy={cy - ry * 0.35} rx={rx * 0.74} ry={ry * 0.5} fill={P.mid} />
              {snow && <ellipse cx={cx} cy={cy - ry * 0.55} rx={rx * 0.8} ry={ry * 0.48} fill={P.snow} />}
              {candles && i >= 3 && [-0.45, 0.05, 0.5].map((k) => (
                <line key={k} x1={cx + k * rx} y1={cy - ry * 0.75} x2={cx + k * rx} y2={cy - ry * 0.75 - 1.4}
                  stroke={P.candle} strokeWidth=".7" strokeLinecap="round" />
              ))}
            </g>
          );
        })}
      </g>
    );
  }
  const tiers = [[0.14, 0.55, 0.3], [0.38, 0.78, 0.23], [0.6, 1, 0.16]];
  return (
    <g data-pine="young">
      <rect x={x - 0.6} y={y - h * 0.16} width="1.2" height={h * 0.16} fill={P.trunk} />
      {tiers.map(([kb, kt, kw], i) => {
        const yb = y - kb * h, yt = y - kt * h, hw = kw * h;
        return (
          <g key={i}>
            <path d={`M${x} ${yt} L${x + hw} ${yb} L${x - hw} ${yb} Z`} fill={P.dark} />
            <path d={`M${x} ${yt} L${x + hw} ${yb} L${x + hw * 0.15} ${yb} Z`} fill={P.mid} />
            {snow && (
              <path d={`M${x} ${yt} L${x + hw * 0.42} ${yt + (yb - yt) * 0.42} L${x - hw * 0.42} ${yt + (yb - yt) * 0.42} Z`}
                fill={P.snow} />
            )}
          </g>
        );
      })}
      {candles && <line x1={x} y1={y - h} x2={x} y2={y - h - 1.8} stroke={P.candle}
        strokeWidth=".8" strokeLinecap="round" />}
    </g>
  );
}

function moonPath(cx, cy, r, phase) {
  const k = Math.cos(2 * Math.PI * phase);
  const rx = Math.max(0.01, Math.abs(k) * r);
  const waxing = phase < 0.5;
  const limb = waxing ? 1 : 0;
  const term = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
  return `M${cx} ${cy - r} A${r} ${r} 0 0 ${limb} ${cx} ${cy + r} A${rx} ${r} 0 0 ${term} ${cx} ${cy - r} Z`;
}

function SkyBand({ now, weather, t, lang, reduced, past }) {
  const sun = sunPosition(now), moon = moonPosition(now), phase = moonPhase(now);
  const times = sunTimes(now);
  const dark = darkness(sun.altitude);
  const live = weather?.available ? weather : null;
  const kind = live?.kind ?? null;
  const cloud = live ? (live.cloud ?? 0) : 0;
  // Behind a cloud deck the sun and the moon are pale and the stars are gone.
  const veiled = ["overcast", "rain", "drizzle", "storm", "snow", "fog"].includes(kind);
  const { top, bottom } = skyColours(sun.altitude, cloud);
  const season = seasonOf(now);
  const snowy = kind === "snow" || (season.winter && live && live.temperature <= 1);
  const stage = roseStage(now);
  const candles = pineCandles(now);
  // The forest on Davraz stands higher than the campus and keeps its snow
  // through the winter.
  const slopeSnow = snowy || season.winter;
  const night = (c, k = 0.8) => mixHex(c, "#121B24", dark * k);
  const snowFill = mixHex("#FFFFFF", "#9AA6B4", dark * 0.8);
  const P = { dark: night("#2B4734", 0.85), mid: night("#3C6146", 0.85),
              trunk: night("#5A4435", 0.85), candle: night("#C8DC8E"), snow: snowFill };
  const R = { leaf: night("#5E8C4A"), leafDeep: night("#4E7B3E"), leafLight: night("#93BE73"),
              twig: night("#6E5442"), shoot: night("#8C4E44"), fall: night("#A9864C"),
              turn: night(mixHex("#738A46", "#C4A048", autumnTurn(now))), bud: night("#D990AB", 0.7),
              petals: ["#E0699A", "#F2A1C0", "#C94C80"].map((c) => night(c, 0.7)), snow: snowFill };
  const forest = mixHex(mixHex("#3A5A45", "#71879A", 0.35), "#152030", dark);
  const groundDay = snowy ? "#E4E8E6" : season.autumn ? "#C6B88F" : "#A3BA84";
  const ground = mixHex(groundDay, "#121B24", dark * 0.85);
  const soil = mixHex(mixHex(groundDay, "#6E5A40", snowy ? 0.12 : 0.4), "#121B24", dark * 0.85);
  const far = mixHex("#9FB2C2", "#1B2533", dark);
  const mountain = mixHex("#71879A", "#152030", dark);
  const city = mixHex("#A0A8AD", "#1E2834", dark);
  const starOpacity = veiled ? 0
    : Math.max(0, (dark - 0.55) / 0.45) * (1 - Math.min(1, cloud / 110));
  const cloudFill = kind && ["overcast", "rain", "drizzle", "storm", "snow"].includes(kind)
    ? mixHex("#B5BBC1", "#2F3946", dark) : mixHex("#FFFFFF", "#3A4556", dark);
  const nClouds = !live ? 0 : Math.min(6, Math.round(cloud / 17));
  const sunUp = sun.altitude > -3, moonUp = moon.altitude > -2;
  const sx = azX(sun.azimuth), sy = altY(sun.altitude);
  const mx = azX(moon.azimuth), my = altY(moon.altitude);
  const warm = Math.max(0, Math.min(1, sun.altitude / 18));
  const sunCore = mixHex("#FF9E4A", "#FFF3C4", warm);
  const drops = kind === "rain" || kind === "storm" ? 46 : kind === "drizzle" ? 24 : 0;
  const flakes = kind === "snow" ? 40 : 0;
  const moonGlyph = phase.phase < 0.03 || phase.phase > 0.97 ? "🌑" : phase.phase < 0.22 ? "🌒"
    : phase.phase < 0.28 ? "🌓" : phase.phase < 0.47 ? "🌔" : phase.phase < 0.53 ? "🌕"
    : phase.phase < 0.72 ? "🌖" : phase.phase < 0.78 ? "🌗" : "🌘";
  return (
    <div style={S.sky} data-panel="sky" data-dark={dark.toFixed(2)} data-weather={kind ?? "none"}>
      <svg viewBox={`0 0 ${SKY_W} ${SKY_H}`} style={S.skySvg} role="img"
        aria-label={past ? t.skyLabelPast : t.skyLabel}
        preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sky-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={top} />
            <stop offset="100%" stopColor={bottom} />
          </linearGradient>
          <radialGradient id="sun-glow">
            <stop offset="0%" stopColor={sunCore} stopOpacity=".9" />
            <stop offset="100%" stopColor={sunCore} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={SKY_W} height={SKY_H} fill="url(#sky-fill)" />
        {starOpacity > 0.02 && (
          <g data-stars={STARS.length}>
            {STARS.map(([x, y, r, d], i) => (
              <circle key={i} cx={x} cy={y} r={r} fill="#F6F1DE" opacity={starOpacity}
                className={reduced ? undefined : "twinkle"} style={{ animationDelay: `${-d}s` }} />
            ))}
          </g>
        )}
        {sunUp && (
          <g data-body="sun" opacity={veiled ? 0.22 : 1 - Math.max(0, cloud - 55) / 110}>
            <circle cx={sx} cy={sy} r="26" fill="url(#sun-glow)" opacity={0.55 + (1 - warm) * 0.3} />
            <circle cx={sx} cy={sy} r="8.5" fill={sunCore} />
          </g>
        )}
        {moonUp && (
          <g data-body="moon" opacity={(dark > 0.3 ? 1 : 0.55) * (veiled ? 0.3 : 1)}>
            <circle cx={mx} cy={my} r="7" fill={mixHex("#B9C0C9", "#2A3444", dark)} opacity=".55" />
            {phase.lit > 0.02 && (
              <path d={moonPath(mx, my, 7, phase.phase)} fill="#F4F0DE" />
            )}
          </g>
        )}
        {SKY_CLOUDS.slice(0, nClouds).map((c, i) => (
          <g key={i} className={reduced ? undefined : "sky-cloud"}
            style={{ animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}>
            <g transform={`translate(${c.x} ${c.y}) scale(${c.s})`} fill={cloudFill}
              opacity={kind === "partly" || kind === "clear" ? 0.8 : 0.92}>
              <ellipse cx="0" cy="0" rx="22" ry="8" />
              <ellipse cx="-12" cy="2" rx="13" ry="7" />
              <ellipse cx="13" cy="1" rx="15" ry="7.5" />
              <ellipse cx="2" cy="-5" rx="12" ry="7" />
            </g>
          </g>
        ))}
        {/* Hills all round, the city to the south, Davraz to the east-south-east. */}
        <path d={`M0 ${HORIZON - 7} C 120 ${HORIZON - 15}, 220 ${HORIZON - 4}, 330 ${HORIZON - 10}`
          + ` S 560 ${HORIZON - 3}, 680 ${HORIZON - 12} S 820 ${HORIZON - 6}, ${SKY_W} ${HORIZON - 10}`
          + ` L ${SKY_W} ${HORIZON} L 0 ${HORIZON} Z`} fill={far} />
        <path d={`M${DAVRAZ.map(([dx, h]) => `${DAVRAZ_X + dx} ${HORIZON - h}`).join(" L")} Z`}
          fill={mountain} data-mountain="davraz" />
        {(season.snowyPeak || kind === "snow") && (
          <path d={`M${DAVRAZ_X - 30} ${HORIZON - 30} L${DAVRAZ_X - 18} ${HORIZON - 34} L${DAVRAZ_X} ${HORIZON - 40}`
            + ` L${DAVRAZ_X + 22} ${HORIZON - 31} L${DAVRAZ_X + 34} ${HORIZON - 27} L${DAVRAZ_X + 18} ${HORIZON - 29}`
            + ` L${DAVRAZ_X + 6} ${HORIZON - 26} L${DAVRAZ_X - 8} ${HORIZON - 30} L${DAVRAZ_X - 20} ${HORIZON - 27} Z`}
            fill={snowFill} data-snow="davraz" />
        )}
        <g data-pines="davraz" data-pine-snow={slopeSnow ? "yes" : "no"}>
          {SLOPE_PINES.map(([x, y, h], i) => (
            <g key={i}>
              <path d={`M${x} ${y - h} L${x + h * 0.33} ${y} L${x - h * 0.33} ${y} Z`} fill={forest} />
              {slopeSnow && (
                <path d={`M${x} ${y - h} L${x + h * 0.16} ${y - h * 0.52} L${x - h * 0.16} ${y - h * 0.52} Z`}
                  fill={snowFill} />
              )}
            </g>
          ))}
        </g>
        <g fill={city} data-city="isparta">
          {[[410, 6], [418, 9], [427, 5], [434, 11], [444, 7], [452, 13], [463, 8], [471, 10],
            [480, 6], [489, 9], [498, 5], [506, 8]].map(([x, h], i) => (
            <rect key={i} x={x} y={HORIZON - h} width="7" height={h} />
          ))}
          {dark > 0.5 && [[412, 3], [429, 2], [437, 6], [455, 9], [466, 4], [484, 3], [500, 2]]
            .map(([x, h], i) => <rect key={`w${i}`} x={x} y={HORIZON - h - 1} width="1.6" height="1.4"
              fill="#FFD79A" opacity={0.6 + dark * 0.4} />)}
        </g>
        {kind === "fog" && (
          <rect x="0" y={HORIZON - 30} width={SKY_W} height="40"
            fill={mixHex("#EEF1F3", "#5C6672", dark)} opacity=".62" />
        )}
        {Array.from({ length: drops }, (_, i) => {
          const r = RNG(911 + i * 17);
          const x = r() * SKY_W, y = r() * HORIZON;
          return <line key={i} x1={x} y1={y} x2={x - 2} y2={y + 6} stroke={dark > 0.5 ? "#8FA2B6" : "#7E8F9E"}
            strokeWidth=".8" opacity=".7" className={reduced ? undefined : "drop"}
            style={{ animationDelay: `${-r()}s` }} />;
        })}
        {Array.from({ length: flakes }, (_, i) => {
          const r = RNG(613 + i * 23);
          return <circle key={i} cx={r() * SKY_W} cy={r() * HORIZON} r={0.8 + r() * 0.9} fill="#FFFFFF"
            opacity=".9" className={reduced ? undefined : "flake"} style={{ animationDelay: `${-r() * 7}s` }} />;
        })}
        <rect x="0" y={HORIZON} width={SKY_W} height={SKY_H - HORIZON} fill={ground} />
        <g data-roses={stage}>
          {ROSE_ROWS.map((row, i) => (
            <rect key={i} x={row.from - row.rx} y={row.y - 0.7} width={row.to - row.from + 2 * row.rx}
              height="1.3" fill={soil} />
          ))}
          {ROSE_BUSHES.map((b, i) => <RoseBush key={i} b={b} stage={stage} R={R} snow={snowy} />)}
        </g>
        <g data-pines="near" data-pine-snow={snowy ? "yes" : "no"}
          data-pine-candles={candles ? "yes" : "no"}>
          {NEAR_PINES.map(([x, y, h, k, flip], i) => (
            <Pine key={i} x={x} y={y} h={h} kind={k} flip={flip} P={P} snow={snowy} candles={candles} />
          ))}
        </g>
      </svg>
      <div style={S.skyCap}>
        <span>{t.skyRise} {timeText(times.sunrise, lang)} · {t.skySet} {timeText(times.sunset, lang)}</span>
        <span><span style={S.skyGlyph} aria-hidden="true">{moonGlyph}</span> {t.skyMoon}: {moonWord(phase.phase, lang)} ({pctText(Math.round(phase.lit * 100), lang)})</span>
        {live && (
          <span data-weather-text>
            {`${t.weatherNow}: ${numText(live.temperature, lang)} °C, ${t.weatherWord[kind] ?? kind}`}
          </span>
        )}
        <span data-roses-text><span style={S.skyGlyph} aria-hidden="true">🌹</span> {t.roseWord[stage]}</span>
      </div>
    </div>
  );
}

/* Rain, snow, fog and cloud over the site plan, drawn above the buildings. */
function WeatherLayer({ weather, w, h, dark, reduced }) {
  if (!weather?.available) return null;
  const { kind, strength } = weather;
  const n = { light: 1, moderate: 2, heavy: 3 }[strength] ?? 1;
  const drops = kind === "rain" || kind === "storm" ? 55 * n : kind === "drizzle" ? 30 * n : 0;
  const flakes = kind === "snow" ? 45 * n : 0;
  // Clouds cast shadows only when the sun is out between them.
  const shadows = kind === "partly" && dark < 0.5 ? 3 : 0;
  const grey = ["overcast", "rain", "storm", "snow", "drizzle"].includes(kind);
  return (
    <g pointerEvents="none" data-layer="weather" data-weather={kind} aria-hidden="true">
      {grey && <rect width={w} height={h} fill={mixHex("#5B6570", "#000000", dark)} opacity=".09" />}
      {Array.from({ length: shadows }, (_, i) => {
        const r = RNG(2711 + i * 41);
        return (
          <ellipse key={i} cx={r() * w} cy={40 + r() * (h - 80)} rx={90 + r() * 70} ry={40 + r() * 30}
            fill={mixHex("#2B3440", "#000000", dark)} opacity={0.07}
            className={reduced ? undefined : "cloud-shadow"}
            style={{ animationDuration: `${80 + i * 19}s`, animationDelay: `${-i * 23}s` }} />
        );
      })}
      {kind === "fog" && (
        <rect width={w} height={h} fill={mixHex("#EEF1F3", "#7A8592", dark)} opacity=".36"
          className={reduced ? undefined : "fog"} />
      )}
      {Array.from({ length: drops }, (_, i) => {
        const r = RNG(31 + i * 7);
        const x = r() * w, y = r() * h;
        return <line key={i} x1={x} y1={y} x2={x - 3} y2={y + 9}
          stroke={mixHex("#6F8394", "#AFC3D6", dark)} strokeWidth=".9" opacity=".55"
          className={reduced ? undefined : "drop"} style={{ animationDelay: `${-r()}s` }} />;
      })}
      {Array.from({ length: flakes }, (_, i) => {
        const r = RNG(57 + i * 11);
        return <circle key={i} cx={r() * w} cy={r() * h} r={1 + r() * 1.2} fill="#FFFFFF"
          opacity=".85" className={reduced ? undefined : "flake"}
          style={{ animationDelay: `${-r() * 7}s` }} />;
      })}
    </g>
  );
}

/* The pins: cases set at a place, events there, and the person's own light. */
const PIN = "M0 0 C-2 -4 -6.5 -7.5 -6.5 -12.5 A6.5 6.5 0 1 1 6.5 -12.5 C6.5 -7.5 2 -4 0 0 Z";

/* "3 vaka · 1 etkinlik": what a pin holds, in words. */
function pinCounts(t, m) {
  const one = (key, n) => ((n === 1 && t[`${key}One`]) || t[key]).replace("{n}", n);
  return [m.cases.length ? one("pinCases", m.cases.length) : null,
          m.events.length ? one("pinEvents", m.events.length) : null].filter(Boolean).join(" · ");
}

function PinLayer({ marks, light, k, grow = 1, t, lang, onPick, nameOfPlace, onHover }) {
  const s = grow / Math.max(1, k);
  return (
    <g data-layer="pins">
      {light && (
        <g transform={`translate(${light.x - 9} ${light.y + 3}) scale(${s})`} pointerEvents="none"
          data-light={light.place}>
          <title>{light.title}</title>
          <circle r="3.4" fill="#FFD36B" className="light-ring" opacity=".8" />
          <circle r="3.4" fill="#FFD36B" stroke="#B9822B" strokeWidth=".8" />
        </g>
      )}
      {marks.map((m) => {
        const both = m.cases.length > 0 && m.events.length > 0;
        const weekly = m.cases.some((c) => c.type === "weekly" && c.status === "live");
        const label = [nameOfPlace(m.place), pinCounts(t, m)].filter(Boolean).join(" · ");
        return (
          <g key={m.place} transform={`translate(${m.x} ${m.y - 2}) scale(${s})`} role="button"
            tabIndex={0} aria-label={label} data-pin={m.place} style={{ cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); onPick(m.place); }}
            onMouseEnter={() => onHover?.(m.place)} onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(m.place)} onBlur={() => onHover?.(null)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(m.place); } }}>
            <title>{label}</title>
            {m.cases.length > 0 && (
              <g transform={`translate(${both ? -6 : 0} 0)`} data-pin-kind={weekly ? "weekly" : "case"}>
                <path d={PIN} fill={weekly ? ACCENT : "#FFFFFF"} stroke={ACCENT} strokeWidth="1.3" />
                <text x="0" y="-9.8" textAnchor="middle" fontSize="7.6" fontWeight="700"
                  fontFamily={MONO} fill={weekly ? "#FFFFFF" : ACCENT}>{m.cases.length}</text>
              </g>
            )}
            {m.events.length > 0 && (
              <g transform={`translate(${both ? 6 : 0} 0)`} data-pin-kind="event">
                <path d={PIN} fill="#2E5E8C" stroke="#1D3F60" strokeWidth="1" />
                <rect x="-3.2" y="-15.6" width="6.4" height="5.6" rx=".8" fill="none"
                  stroke="#FFFFFF" strokeWidth=".9" />
                <line x1="-3.2" y1="-13.8" x2="3.2" y2="-13.8" stroke="#FFFFFF" strokeWidth=".9" />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

function BackToMap({ t, frameRef, reduced }) {
  return (
    <button style={S.back} data-action="back-to-map"
      onClick={() => frameRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth",
                                                         block: "start" })}>
      ↑ {t.backToMap}
    </button>
  );
}

function PinSwatch({ fill, stroke = ACCENT, count }) {
  return (
    <svg viewBox="-8 -21 16 22" width={count ? 14 : 11} height={count ? 19 : 15} aria-hidden="true"
      style={{ flexShrink: 0 }}>
      <path d={PIN} fill={fill} stroke={stroke} strokeWidth="1.4" />
      {count && (
        <text x="0" y="-9.8" textAnchor="middle" fontSize="7.6" fontWeight="700"
          fontFamily={MONO} fill={stroke}>{count}</text>
      )}
    </svg>
  );
}

/* The cases set at a place and the events there, in the side panel. */
/* A visitor is sent to the door first; once signed in, the case opens. */
function HereList({ t, lang, cases, events, visitor }) {
  if (!cases.length && !events.length) return null;
  return (
    <div style={S.here} data-panel="here">
      {cases.length > 0 && (
        <>
          <div style={S.hereHead}>{t.hereCases}</div>
          {cases.map((c) => (
            <div key={c.key} style={S.hereRow} data-here-case={c.key}>
              <div style={{ minWidth: 0 }}>
                <div style={S.hereTitle} lang={c.locale}>{c.title}</div>
                <div style={S.hereMeta}>
                  {c.type === "weekly" ? `${t.caseWeekly} · ` : ""}{t.caseState[caseState(c)]}
                </div>
              </div>
              <button onClick={() => goToCase(c.key)} style={S.hereGo} data-action="go-to-case">
                {visitor ? t.caseGoVisitor : t.caseGo}
              </button>
            </div>
          ))}
        </>
      )}
      {events.length > 0 && (
        <>
          <div style={S.hereHead}>{t.hereEvents}</div>
          {events.map((e) => (
            <div key={e.id} style={S.hereEvent} data-here-event={e.id}>
              <div style={S.hereTitle} data-user-content>{e.title}</div>
              {e.event_at && <div style={S.hereMeta}>{momentText(e.event_at, lang)}</div>}
              <div style={S.hereBody} data-user-content>{e.body}</div>
              {typeof e.link === "string" && /^https:\/\//i.test(e.link) && (
                <a href={e.link} target="_blank" rel="noopener noreferrer" style={S.hereLink}>
                  {t.eventLink}
                </a>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* The campus twin as it stood at the end of one day of the history, in the
   shapes the live panels take. An area resting on too few people that day has
   no figure, as on a live day. */
function twinOnDay(history, day) {
  const tw = history?.twin;
  if (!tw || day == null) return null;
  const areas = Object.entries(tw.areas).map(([dimension, a]) => ({
    dimension, level: a.level[day], people: a.people[day], enough: a.level[day] != null,
  })).sort((x, y) => (x.level ?? Infinity) - (y.level ?? Infinity));
  const sure = Object.entries(tw.areas).map(([dimension, a]) => {
    const confidence = a.confidence[day], hit = a.hit[day];
    const enough = confidence != null && hit != null;
    return { dimension, enough, confidence, hit, gap: enough ? confidence - hit : null };
  });
  return {
    awareness: { people: tw.people[day], areas, threshold: history.threshold },
    accuracy: { threshold: history.threshold, twin: null, areas: sure },
    forecast: tw.forecast[day], actual: history.campus.answers[day],
  };
}

/* A day gone by: what the campus twin forecast for it and what happened. */
function ForecastDayCard({ t, lang, date, forecast, actual }) {
  const off = forecast != null && actual > 0
    ? Math.round((Math.abs(forecast - actual) / actual) * 100) : null;
  const peak = Math.max(1, forecast ?? 0, actual ?? 0);
  const fmt = (n) => n.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB");
  return (
    <section style={S.todayCard} data-panel="forecast" data-past>
      <h3 style={S.todayTitle}>{t.fcHead}</h3>
      {forecast != null ? (
        <>
          <p style={S.todayText} data-forecast-day>
            {t.fcPast.replace("{date}", date).replace("{f}", fmt(forecast)).replace("{a}", fmt(actual))}
            {" "}{off === 0 ? t.fcExact : off != null ? t.fcOff.replace("{p}", off) : ""}
          </p>
          <div aria-hidden="true" style={S.fcBars}>
            <div style={S.fcPair}>
              <span style={{ ...S.fcBar, height: `${(forecast / peak) * 38 + 2}px`, ...S.fcBarForecast }} />
              <span style={{ ...S.fcBar, height: `${(actual / peak) * 38 + 2}px` }} />
            </div>
          </div>
          <p style={S.fcKey} aria-hidden="true">
            <span style={{ ...S.fcSwatch, ...S.fcBarForecast, borderBottom: S.fcBarForecast.border }} />
            {t.fcKeyForecast}
            <span style={{ ...S.fcSwatch, marginLeft: 10 }} />
            {t.fcKeyActual}
          </p>
        </>
      ) : (
        <p style={S.todaySmall}>{t.fcNone.replace("{date}", date)}</p>
      )}
      <p style={S.todayFoot}>{t.fcHow}</p>
    </section>
  );
}

/* The campus twin's forecast of today's answers: sealed today, opened after. */
function ForecastCard({ t, lang, data, soFar }) {
  const [checked, setChecked] = useState({});
  useEffect(() => {
    let stop = false;
    (async () => {
      const out = {};
      for (const d of data?.past ?? []) {
        try { out[d.day] = (await sha256Hex(d.commitment)) === d.digest; }
        catch { out[d.day] = null; }
      }
      if (!stop) setChecked(out);
    })();
    return () => { stop = true; };
  }, [data]);
  if (!data?.today) return null;
  const past = data.past ?? [];
  const last = past[0];
  const yesterday = new Date(`${data.today.day}T12:00:00+03:00`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const isYesterday = last && last.day === yesterday.toISOString().slice(0, 10);
  const off = (d) => (d.actual > 0 ? Math.round((Math.abs(d.forecast - d.actual) / d.actual) * 100) : null);
  const errs = past.map(off).filter((v) => v != null);
  const mean = errs.length >= 2 ? Math.round(errs.reduce((a, b) => a + b, 0) / errs.length) : null;
  const bars = [...past].slice(0, 7).reverse();
  const peak = Math.max(1, ...bars.flatMap((d) => [d.forecast, d.actual ?? 0]));
  const digest = data.today.digest;
  return (
    <section style={S.todayCard} data-panel="forecast">
      <h3 style={S.todayTitle}>{t.fcHead}</h3>
      <p style={S.todayText}>{t.fcToday}</p>
      <div style={S.sealLine}>
        <span style={S.sealCap}>{t.fcSeal}</span>
        <code style={S.sealCode} title={digest} data-seal={digest}>
          {digest.slice(0, 12)}…{digest.slice(-6)}
        </code>
      </div>
      <p style={S.todaySmall}>
        {plural(t, "fcSoFar", soFar).replace("{n}", soFar.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB"))} {t.fcOpens}
      </p>
      {last ? (
        <div data-forecast-day={last.day}>
          <p style={S.todayText}>
            {(isYesterday ? t.fcYesterday : `${dayText(last.day, lang)}: ${t.fcYesterday.split(": ").slice(1).join(": ")}`)
              .replace("{f}", last.forecast).replace("{a}", last.actual ?? "—")}{" "}
            {off(last) === 0 ? t.fcExact : off(last) != null ? t.fcOff.replace("{p}", off(last)) : ""}
          </p>
          <p style={{ ...S.todaySmall, color: checked[last.day] === false ? "var(--ink)" : "var(--ink-good)" }}
            data-seal-check={checked[last.day] == null ? "pending" : checked[last.day] ? "ok" : "broken"}>
            {checked[last.day] === false ? `✗ ${t.fcBroken}` : checked[last.day] ? `✓ ${t.fcVerified}` : "…"}
          </p>
          {bars.length > 1 && (
            <div aria-label={t.fcBars} role="img" style={S.fcBars}>
              {bars.map((d) => (
                <div key={d.day} style={S.fcPair} title={`${dayText(d.day, lang)}: ${d.forecast} / ${d.actual}`}>
                  <span style={{ ...S.fcBar, height: `${(d.forecast / peak) * 38 + 2}px`, ...S.fcBarForecast }} />
                  <span style={{ ...S.fcBar, height: `${((d.actual ?? 0) / peak) * 38 + 2}px` }} />
                </div>
              ))}
            </div>
          )}
          {bars.length > 1 && (
            <p style={S.fcKey} aria-hidden="true">
              <span style={{ ...S.fcSwatch, ...S.fcBarForecast, borderBottom: S.fcBarForecast.border }} />
              {t.fcKeyForecast}
              <span style={{ ...S.fcSwatch, marginLeft: 10 }} />
              {t.fcKeyActual}
            </p>
          )}
          {mean != null && <p style={S.todaySmall}>{t.fcMean.replace("{n}", errs.length).replace("{p}", mean)}</p>}
        </div>
      ) : (
        <p style={S.todaySmall}>{t.fcFirst}</p>
      )}
      <p style={S.todayFoot}>{t.fcHow}</p>
    </section>
  );
}

/* How sure the campus is in each area, beside how often it is right. The
   verdict uses the same words and threshold as the campus twin's list. */
function ConfidenceCard({ t, lang, accuracy }) {
  if (!accuracy) return null;
  const areas = (accuracy.areas ?? []).filter((a) => a.enough && a.gap != null);
  let lede = null;
  if (areas.length) {
    const worst = areas.reduce((a, b) => (Math.abs(b.gap) > Math.abs(a.gap) ? b : a));
    const word = confWord(worst.gap);
    const name = AREA[lang][worst.dimension] ?? worst.dimension;
    lede = word === "confFine" ? t.ccFine
      : (word === "confOver" ? t.ccOver : t.ccUnder).replace("{area}", name);
  }
  const pct = (v) => (v == null ? "—" : pctText(Math.round(v * 100), lang));
  return (
    <section style={S.todayCard} data-panel="confidence">
      <h3 style={S.todayTitle}>{t.ccHead}</h3>
      {areas.length ? (
        <>
          <p style={S.todayText} data-conf-lede>{lede}</p>
          <div style={S.ccTable} role="table" aria-label={t.ccHead}>
            <div style={S.ccLine} role="row">
              <span style={S.ccTh} role="columnheader">{t.ccArea}</span>
              <span style={{ ...S.ccNum, ...S.ccTh }} role="columnheader">{t.ccConf}</span>
              <span style={{ ...S.ccNum, ...S.ccTh }} role="columnheader">{t.ccHit}</span>
              <span style={S.ccTh} role="columnheader" aria-label={t.ccState} />
            </div>
            {areas.map((a) => {
              const word = confWord(a.gap);
              return (
                <div key={a.dimension} style={S.ccLine} role="row" data-conf-row={word}>
                  <span style={S.ccName} role="cell">{AREA[lang][a.dimension] ?? a.dimension}</span>
                  <span style={S.ccNum} role="cell">{pct(a.confidence)}</span>
                  <span style={S.ccNum} role="cell">{pct(a.hit)}</span>
                  <span style={{ ...S.ccWord, color: CONF_TONE[word] }} role="cell">{t[word]}</span>
                </div>
              );
            })}
          </div>
          <p style={S.todayFoot}>{t.ccKey}</p>
        </>
      ) : (
        <p style={S.todaySmall}>{t.ccWait.replace("{n}", accuracy.threshold ?? 10)}</p>
      )}
    </section>
  );
}

/* The step the campus most often got wrong lately. */
function TrapCard({ t, lang, data }) {
  if (!data) return null;
  const trap = data.trap;
  const [before, after] = t.trLede.split("{title}");
  return (
    <section style={S.todayCard} data-panel="trap">
      <h3 style={S.todayTitle}>{trap?.days > 7 ? t.trHeadMonth : t.trHead}</h3>
      {trap ? (
        <>
          <p style={S.todayText} data-trap={trap.key}>
            {before}<span lang={trap.locale}>{trap.title}</span>
            {after.replace("{step}", trap.step).replace("{p}", Math.round(trap.wrong * 100))}
          </p>
          <p style={S.todaySmall}>{t.trArea}: {AREA[lang][trap.dimension] ?? trap.dimension}</p>
          {trap.finished && trap.note && (
            <div style={S.trapNote}>
              <div style={S.hereHead}>{t.trNote}</div>
              <p style={S.todayText} lang={trap.locale} data-user-content>{trap.note}</p>
            </div>
          )}
          <button onClick={() => goToCase(trap.key)} style={S.hereGo} data-action="trap-case">
            {trap.finished ? t.caseGo : t.trTry}
          </button>
        </>
      ) : (
        <p style={S.todaySmall}>{t.trNone}</p>
      )}
      <p style={S.todayFoot}>{t.trWhy.replace("{n}", data.threshold ?? 10)}</p>
    </section>
  );
}

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

/* Campus names are centred above their own markers. */
const labelFor = (test) => {
  const pts = Object.entries(CAMPUS.anchor)
    .filter(([n]) => test(Number(n))).map(([, v]) => v);
  const xs = pts.map((p) => p[0]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, 48];
};
const WEST_LABEL = labelFor((n) => n <= 31);
const EAST_LABEL = labelFor((n) => n > 31);

function useCountUp(target, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(target); return;
    }
    let raf, start;
    const step = (ts) => {
      start ??= ts;
      const k = Math.min(1, (ts - start) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

const PAD = 16, DIST_H = 156;
const [, , MAP_W, MAP_H] = CAMPUS.vb;

/* The campuses keep their true relative places from the map geometry; only the
   district band changes shape between breakpoints. */
const LAYOUTS = {
  // The district row lives inside the sheet, along the bottom, the way the
  // printed map keeps its own bottom row of blocks.
  wide: { vb: [MAP_W, MAP_H + DIST_H], stacked: false },
  stacked: { vb: [MAP_W, MAP_H + DIST_H], stacked: true },
};

/* -------------------------------------------------------------------------- */

/* English says "1 person" but "2 people"; Turkish needs no second form, so
   only the English table carries the singular, under the same key with "One". */
const plural = (t, key, n) => (n === 1 && t[`${key}One`]) || t[key];

/* `visitor`: what someone who has not signed in may see, as /public/campus
   says it ({ campus, twin, units, board }); absent for someone signed in.
   A visitor's map asks the /public answers, which hold nothing about any one
   person, and leaves out what is a person's own: their twin over the rose,
   their light and the trap, which names a case for them to try. */
export default function CampusPlan({ lang: hostLang, onLang, embedded, themePref, visitor }) {
  const from = visitor ? "/public" : "";
  const twinFrom = visitor && !visitor.twin ? null : from;
  const { data: NOW, offline: mapOffline, units: UNIT_ID } = useActivity(SAMPLE_DATA, from);
  const campusAwareness = useAwareness(twinFrom);
  const twinAccuracy = useTwinAccuracy(twinFrom);
  const pulse = usePulse(SAMPLE_PULSE, from);
  const myTwin = useMyTwin(Boolean(visitor));
  /* The sky's company: the weather, the cases set on campus, the events, the
     campus twin's forecast, the week's trap and the person's own light. */
  const weatherNow = useServer(`${from}/map/weather`, 15 * 60000);
  const forecastNow = useServer(twinFrom == null ? null : `${twinFrom}/map/forecast`, 10 * 60000);
  const trapNow = useServer(visitor ? null : "/map/trap");
  const eventsNow = useServer(`${from}/map/events`, 5 * 60000);
  const casesNow = useServer(visitor ? "/public/map/cases" : "/cases/open");
  const lightNow = useServer(visitor ? null : "/me/light", 2 * 60000);
  const [reduced] = useState(() => {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch { return false; }
  });
  /* The time bar: null is now; otherwise the day shown, the hour and how dark
     it is then, as the bar reports them. */
  const historyNow = useServer(`${from}/map/history`, 10 * 60000);
  const [replay, setReplay] = useState(null);
  const onMoment = useCallback((m) => setReplay((prev) => (
    m && prev && prev.day === m.day && prev.hour === m.hour && prev.dark === m.dark ? prev : m)), []);
  const [now0] = useState(() => new Date());
  const history = useMemo(() => (mapOffline ? sampleHistory(NOW, now0) : historyNow),
    [mapOffline, historyNow, NOW, now0]);
  const series = useMemo(() => {
    const out = {};
    for (const l of history?.locations ?? []) {
      const key = l.key ?? (l.map_no != null ? String(l.map_no) : DISTRICT_KEY[l.district]);
      if (key != null) out[key] = l;
    }
    return out;
  }, [history]);
  const replayDay = replay && history
    ? Math.max(0, Math.min(history.days - 1, replay.day)) : null;
  const pastTwin = useMemo(() => twinOnDay(history, replayDay), [history, replayDay]);
  /* Everything below reads DATA, so a moment in the past only swaps the counts. */
  const DATA = useMemo(() => {
    if (replayDay == null) return NOW;
    const out = {};
    for (const [k, v] of Object.entries(NOW)) {
      const s = series[k];
      out[k] = s ? { ...v, reg: s.reg[replayDay], act: s.act[replayDay] } : { ...v, act: 0 };
    }
    return out;
  }, [NOW, replayDay, series]);
  const windowLabel = (tt) => (replay
    ? tt.activeAt.replace("{date}", dateLong(replay.dayStart, lang)) : tt.active);
  /* Language and the app chrome belong to whoever is hosting this screen.
     Standing alone it keeps its own; inside the shell the shell owns them, so
     only one language switch is on screen. */
  const [ownLang, setOwnLang] = useState(() => openingLang(null));
  const lang = hostLang ?? ownLang;
  if (!hostLang) showLang(ownLang);
  const setLang = onLang ?? ((next) => { pickLang(next); setOwnLang(next); });
  const [sel, setSel] = useState(null);
  const [spot, setSpot] = useState(null);       // a marked spot, when its pin is chosen
  useEffect(() => { if (sel) setSpot(null); }, [sel]);
  const [hover, setHover] = useState(null);
  const [filter, setFilter] = useState("all");
  const [sizeBy, setSizeBy] = useState("reg");
  const [narrow, setNarrow] = useState(false);
  const [ready, setReady] = useState(false);
  const [built, setBuilt] = useState(false);
  const [ping, setPing] = useState(null);
  const [pingKey, setPingKey] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  /* Inside the shell the map follows the shell's light or dark; standing alone
     it has a switch of its own. */
  const [ownSkin, setSkinPref] = useState("auto");
  const skinPref = themePref ? ({ light: "day", dark: "night" }[themePref] ?? "auto") : ownSkin;
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  /* How many screen pixels a unit of the map takes, so pins stay large enough
     to tap on a small screen. */
  const [fit, setFit] = useState(1);
  /* Whether the map is holding the wheel and one-finger drag.
   *
   * The map takes the wheel only once its own button says so, so page
   * scrolling passes over it, and gives it back on a click outside or Escape.
   * The + and − buttons, a mouse drag on a zoomed map and a two-finger pinch
   * work either way. */
  const [engaged, setEngaged] = useState(false);
  const engagedRef = useRef(false);
  engagedRef.current = engaged;
  /* Said for a moment when the wheel turns over a map that is not engaged. */
  const [wheelHint, setWheelHint] = useState(false);
  /* Wide screens put the panel beside the map; narrow ones under it. */
  const [side, setSide] = useState(false);
  const panelRef = useRef(null);
  /* A pan or pinch has just ended: the click that follows is not a choice. */
  const clickGuard = useRef(false);
  const [pinHover, setPinHover] = useState(null);
  const drag = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const svgRef = useRef(null);
  const frameRef = useRef(null);

  const t = L[lang];
  const campusTime = campusClock(clock);
  const hour = replay ? replay.hour : campusTime.h + campusTime.m / 60;
  /* Day turns to night with the sun over Isparta, through twilight, at the
     moment the time bar shows. */
  const dark = skinPref === "auto"
    ? (replay ? replay.dark : darkness(sunPosition(clock).altitude))
    : skinPref === "night" ? 1 : 0;
  const isNight = dark > 0.5;
  /* The sky above changes through the whole twilight; the page itself turns
     over in the quarter of an hour after sunset, so it is never long grey. */
  const turn = Math.min(1, Math.max(0, (dark - 0.3) / 0.4));
  const skinT = turn * turn * (3 - 2 * turn);
  const C = useMemo(() => mixSkin(SKIN.day, SKIN.night, skinT), [skinT]);
  const roofOf = (a) => roofIn(C, a);
  /* The paths fill and empty with the hour of the day, as scenery. */
  const ambientCount = Math.round(4 + 34 * DENSITY(hour));
  /* Buildings where at least two people answered in the last hour, as the
     server reports them; the replay shows the past, so it hides them. */
  const liveSet = useMemo(
    () => new Set(replay == null ? (pulse.live ?? []).map((x) => x.map_no) : []),
    [pulse, replay]);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  /* Zoom and pan. The map is one coordinate space, so this is a single
     transform on the whole drawing. */
  const clampView = (v) => {
    const k = Math.min(6, Math.max(1, v.k));
    const sx = (MAP_W * k - MAP_W) / 2, sy = (MAP_H * k - MAP_H) / 2;
    return { k, x: Math.max(-sx, Math.min(sx, v.x)), y: Math.max(-sy, Math.min(sy, v.y)) };
  };
  const zoomBy = (f, cx, cy) => setView((v) => {
    const k = Math.min(6, Math.max(1, v.k * f));
    const ratio = k / v.k;
    const ox = (cx ?? MAP_W / 2) - MAP_W / 2, oy = (cy ?? MAP_H / 2) - MAP_H / 2;
    return clampView({ k, x: ox - (ox - v.x) * ratio, y: oy - (oy - v.y) * ratio });
  });
  const svgPoint = (e) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return [MAP_W / 2, MAP_H / 2];
    return [((e.clientX - r.left) / r.width) * LO.vb[0], ((e.clientY - r.top) / r.height) * LO.vb[1]];
  };
  const LO = narrow ? LAYOUTS.stacked : LAYOUTS.wide;
  // A pin is about 19 units tall; on screen it should not shrink below 16px.
  const pinGrow = Math.min(2.2, Math.max(1, 16 / (19 * fit)));
  const zoomRef = useRef(zoomBy);
  zoomRef.current = zoomBy;
  const pointRef = useRef(svgPoint);
  pointRef.current = svgPoint;

  /* The wheel is listened to directly, since React's own wheel listener cannot
     keep the page from scrolling while the map zooms. */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    let quiet;
    const onWheel = (e) => {
      if (!engagedRef.current) {
        setWheelHint(true);
        clearTimeout(quiet);
        quiet = setTimeout(() => setWheelHint(false), 2200);
        return;
      }
      e.preventDefault();
      const [x, y] = pointRef.current(e);
      zoomRef.current(e.deltaY < 0 ? 1.18 : 1 / 1.18, x, y);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { el.removeEventListener("wheel", onWheel); clearTimeout(quiet); };
  }, []);

  /* A unit or a pin chosen on the map brings its panel into view: beside the
     map on a wide screen it already is, under it the page scrolls down. */
  useEffect(() => {
    if (!sel && !spot) return;
    const el = panelRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top >= 0 && top < window.innerHeight * 0.55) return;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [sel, spot, reduced]);

  useEffect(() => {
    if (!engaged) return undefined;
    const release = (e) => {
      if (e.type === "keydown" && e.key !== "Escape") return;
      if (e.type === "pointerdown" && frameRef.current?.contains(e.target)) return;
      setEngaged(false);
    };
    document.addEventListener("pointerdown", release, true);
    document.addEventListener("keydown", release);
    return () => {
      document.removeEventListener("pointerdown", release, true);
      document.removeEventListener("keydown", release);
    };
  }, [engaged]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setFit(w / MAP_W);
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const on = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener("change", on);
    const wide = window.matchMedia("(min-width: 1100px)");
    const onWide = (e) => setSide(e.matches);
    setSide(wide.matches);
    wide.addEventListener("change", onWide);
    const id = setTimeout(() => setReady(true), 60);
    // Massing rises out of the ground once, west to east, so the first thing a
    // person sees is the shape of participation.
    const rise = setTimeout(() => setBuilt(true), 220);
    return () => {
      mq.removeEventListener("change", on);
      wide.removeEventListener("change", onWide);
      clearTimeout(id); clearTimeout(rise);
    };
  }, []);

  // The live buildings take turns to flicker, one at a time.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const live = PLACES.filter((p) => liveSet.has(idOf(p)) && FOOTPRINTS[p.no]);
    if (!live.length) { setPing(null); return undefined; }
    let i = 0;
    const id = setInterval(() => {
      setPing(idOf(live[i % live.length]));
      setPingKey((k) => k + 1);
      i += 1;
    }, 2600);
    return () => clearInterval(id);
  }, [liveSet]);

  const nameOf = (p) => (lang === "tr" ? p.name : p.en || p.name);
  const passes = (act) => filter === "all" || (filter === "busy" ? act > 0 : act === 0);

  const totals = useMemo(() => {
    const agg = (list, k) => list.reduce(
      (a, p) => ({ reg: a.reg + DATA[k(p)].reg, act: a.act + DATA[k(p)].act }),
      { reg: 0, act: 0 });
    return {
      west: agg(PLACES.filter((p) => p.campus === "w"), idOf),
      east: agg(PLACES.filter((p) => p.campus === "e"), idOf),
      districts: agg(DISTRICTS, (d) => d.key),
    };
    // Recomputed when the server's counts arrive.
  }, [DATA]);

  const grandAct = totals.west.act + totals.east.act + totals.districts.act;
  const grandReg = totals.west.reg + totals.east.reg + totals.districts.reg;

  const shownReg = useCountUp(grandReg);
  const shownAct = useCountUp(grandAct, 1100);

  const ordered = useMemo(() => Object.entries(DATA)
    .sort((a, b) => b[1].act - a[1].act).map(([k]) => k), [DATA]);
  const rank = sel ? ordered.indexOf(String(sel.key ?? idOf(sel))) + 1 : 0;

  // Units are numbered on the printed map; the server keys them by unit id, and
  // the seed carries the pairing.
  const selUnitId = sel && !sel.key ? (UNIT_ID[sel.no] ?? null) : null;
  const unitAwareness = useUnitAwareness(selUnitId, visitor && !visitor.units ? null : from);

  const detail = sel
    ? sel.key
      ? { title: nameOf(sel), sub: `${t.districts} · ${sel.km} km`, ...DATA[sel.key] }
      : { title: nameOf(sel), sub: `${t[sel.campus === "w" ? "west" : "east"]} · ${sel.no}`, ...DATA[idOf(sel)] }
    : null;

  /* What the server sends, or the sample when there is no server. */
  const weather = mapOffline ? SAMPLE_WEATHER : weatherNow;
  const forecast = mapOffline ? SAMPLE_FORECAST : forecastNow;
  const trap = mapOffline ? SAMPLE_TRAP : trapNow;
  const events = mapOffline ? SAMPLE_EVENTS : (eventsNow?.events ?? []);
  const myCases = mapOffline ? SAMPLE_CASES : (casesNow?.cases ?? []);
  const light = mapOffline ? SAMPLE_LIGHT : lightNow;
  const nameOfPlace = (place) => (/^\d+$/.test(place)
    ? (CAMPUS.names[Number(place)]?.[lang] ?? place) : (POI[place]?.[lang] ?? place));
  /* One pin per place, carrying the cases set there and the events there. */
  const marks = useMemo(() => {
    const at = {};
    const add = (place, kind, item) => {
      const pos = placePoint(place);
      if (!pos) return;
      (at[place] ??= { place, x: pos[0], y: pos[1], cases: [], events: [] })[kind].push(item);
    };
    for (const c of myCases) if (c.place) add(c.place, "cases", c);
    for (const e of events) if (e.place) add(e.place, "events", e);
    return Object.values(at);
  }, [myCases, events]);
  const lightMark = (() => {
    if (!light?.place || !(light.steps_today > 0) || replay != null) return null;
    const pos = placePoint(light.place);
    return pos ? { place: light.place, x: pos[0], y: pos[1],
                   title: plural(t, "lightTitle", light.steps_today).replace("{n}", light.steps_today) }
               : null;
  })();
  const pickPlace = (place) => {
    if (/^\d+$/.test(place)) {
      const unit = placeUnit(place);
      if (unit) { setSpot(null); setSel(unit); }
    } else {
      setSel(null); setSpot(place);
    }
  };
  const hereOf = (places) => ({
    cases: myCases.filter((c) => places.includes(c.place)),
    events: events.filter((e) => places.includes(e.place)),
  });

  return (
    <div lang={lang} style={{ ...S.root, background: C.paper, color: C.text,
        "--paper": C.paper, "--card": C.card, "--line": C.line,
        "--text": C.text, "--muted": C.muted, "--label": C.label, "--tintBg": C.tint,
        "--ink": C.ink, "--ink-warn": C.inkWarn, "--ink-good": C.inkGood,
        "--ink-quiet": C.inkQuiet,
        transition: "background .6s ease, color .6s ease" }}>
      <style>{CSS}</style>

      {/* Standing alone, this screen shows whose it is; inside the shell the
          shell does. */}
      {!embedded && (
        <div style={S.brandBar}>
          {/* The wordmark is red and black, so the marks keep a light plate
              after dark and stay in their own colours. */}
          <span style={S.brandPlate}>
            <img src={LOGO_AIARC} alt="SDÜ AIARC" style={S.brandWide} />
          </span>
          <div style={S.brandText}>
            <div style={S.brandTitle}>{APP_TITLE[lang] ?? APP_TITLE.tr}</div>
            <div style={S.brandSub}>{APP_SUB[lang] ?? APP_SUB.tr}</div>
          </div>
          <span style={S.brandPlate}>
            <img src={LOGO_SDU} alt={(ORG[lang] ?? ORG.tr).university} style={S.brandSeal} />
          </span>
        </div>
      )}

      <header style={{ ...S.header, ...(narrow ? S.headerNarrow : null) }}>
        <div style={{ minWidth: 0 }}>
          {!narrow && !embedded && <div style={S.eyebrow}>{t.eyebrow}</div>}
          <h1 style={{ ...S.title, ...(narrow ? S.titleNarrow : null) }}>{t.title}</h1>
        </div>
        <div style={S.tools}>
          <div style={S.count}>
            {replay == null && <span className="beacon" />}
            <span style={S.countNum} data-count>
              {replayDay != null ? history.campus.active[replayDay] : grandAct}
            </span>
            <span style={S.countCap}>{windowLabel(t)}</span>
          </div>
          {!embedded && (
            <div style={S.seg}>
              {["tr", "en"].map((l) => (
                <button key={l} onClick={() => setLang(l)}
                  style={{ ...S.segBtn, ...(lang === l ? S.segOn : null) }}>{l.toUpperCase()}</button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* What the campus is doing now, counted for the campus as a whole. The
          list is doubled so the scroll can loop without a seam. */}
      {replayDay != null ? (() => {
        // A day in the past: what the campus did that day, counted whole.
        const n = history.campus.answers[replayDay], pp = history.campus.people[replayDay];
        const date = dateLong(replay.dayStart, lang);
        const text = n > 0
          ? plural(t, "pastDay", n).replace("{date}", date).replace("{n}", n).replace("{p}", pp)
          : t.pastQuiet.replace("{date}", date);
        return (
          <div style={S.ticker} data-panel="pulse" data-past>
            <span style={S.tickerTag}>{t.tickerPast}</span>
            <div style={S.tickerViewport}>
              <div style={{ ...S.tickerRun, paddingLeft: 12 }}>
                <span style={S.tickerItem}><span style={S.tickerText}>{text}</span></span>
              </div>
            </div>
          </div>
        );
      })() : (() => {
        const items = [];
        if (pulse.answers_today > 0) {
          items.push(plural(t, "pulseToday", pulse.answers_today).replace("{n}", pulse.answers_today)
            .replace("{p}", pulse.people_today));
          if (pulse.answers_hour > 0) items.push(plural(t, "pulseHour", pulse.answers_hour).replace("{n}", pulse.answers_hour));
        }
        if (pulse.people_week > 0) items.push(plural(t, "pulseWeek", pulse.people_week).replace("{n}", pulse.people_week));
        for (const c of pulse.cases ?? []) {
          // The title is the case's own, in the case's language.
          const [before, after] = t.pulseCase.split("{title}");
          items.push(
            <>
              {before}<span lang={c.locale}>{c.title}</span>
              {after.replace("{d}", c.finished_day).replace("{w}", c.finished_week)}
            </>);
        }
        if (!pulse.answers_today) items.unshift(t.pulseQuiet);
        const loop = items.length > 1;
        return (
          <div style={S.ticker} data-panel="pulse">
            <span style={S.tickerTag}>{t.tickerTag}</span>
            <div style={S.tickerViewport}>
              <div className={loop ? "ticker-run" : undefined}
                style={{ ...S.tickerRun, ...(loop ? null : { paddingLeft: 12 }) }}>
                {(loop ? [...items, ...items] : items).map((text, i) => (
                  <span key={i} style={S.tickerItem}>
                    <span style={S.tickerText}>{text}</span>
                    {loop && <span style={S.tickerSep} aria-hidden="true">◆</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <div style={S.toolbar}>
        <div style={S.chips}>
          {["all", "busy", "quiet"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ ...S.chip, ...(filter === f ? S.chipOn : null) }}>{t[f]}</button>
          ))}
        </div>
        <div style={S.rightTools}>
          {replay == null && (
            <span style={S.clock}>
              <span>{String(campusTime.h).padStart(2, "0")}:{String(campusTime.m).padStart(2, "0")}</span>
              <span style={S.clockCap}>
                {plural(t, "hourAnswers", pulse.answers_hour ?? 0).replace("{n}", pulse.answers_hour ?? 0)}
              </span>
            </span>
          )}
          {!themePref && (
            <div style={S.seg}>
              {["auto", "day", "night"].map((m) => (
                <button key={m} onClick={() => setSkinPref(m)}
                  style={{ ...S.segBtn, ...(skinPref === m ? S.segOn : null) }}>{t[m]}</button>
              ))}
            </div>
          )}
          <button onClick={() => setSizeBy(sizeBy === "reg" ? "act" : "reg")} style={S.toggle}>
            {sizeBy === "reg" ? t.sizeReg : t.sizeAct}
          </button>
        </div>
      </div>

      <div style={{ ...S.body, flexDirection: "column" }}>
        <TimeLapse history={history} clock={clock} weather={weather} t={t} lang={lang}
          reduced={reduced} onMoment={onMoment} />
        <div style={side ? S.mapRow : S.mapStack}>
        <div style={{ ...S.mapCol,
                      width: side
                        ? `min(calc(100% - 356px), calc((100vh - 96px) * ${(LO.vb[0] / LO.vb[1]).toFixed(4)}))`
                        : `min(100%, calc((100vh - 96px) * ${(LO.vb[0] / LO.vb[1]).toFixed(4)}))` }}>
        <div ref={frameRef}
        style={{ ...S.mapWrap, ...(engaged ? S.mapWrapOn : null) }}>
        {/* Zoom, the whole map again, and whether the map takes the wheel. */}
        <div style={S.mapCtl} data-panel="map-controls">
          <button style={{ ...S.engage, ...(engaged ? S.engageOn : null) }}
            aria-pressed={engaged} data-action="map-explore"
            onClick={(e) => { e.stopPropagation(); setEngaged((v) => !v); }}>
            {engaged ? t.zoomOn : t.zoomOff}
          </button>
          <div style={S.zoomStack}>
            <button onClick={() => zoomBy(1.4)} style={S.zoomBtn} data-action="zoom-in"
              aria-label={t.zoomIn} title={t.zoomIn} disabled={view.k >= 6}>+</button>
            <button onClick={() => zoomBy(1 / 1.4)} style={S.zoomBtn} data-action="zoom-out"
              aria-label={t.zoomOut} title={t.zoomOut} disabled={view.k <= 1}>−</button>
            <button onClick={() => setView({ k: 1, x: 0, y: 0 })} style={S.zoomBtn}
              data-action="zoom-reset" aria-label={t.reset} title={t.reset}
              disabled={view.k === 1 && view.x === 0 && view.y === 0}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none"
                  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        {wheelHint && <div style={S.wheelHint} role="status" data-panel="wheel-hint">{t.wheelHint}</div>}
          <svg ref={svgRef} viewBox={`0 0 ${LO.vb[0]} ${LO.vb[1]}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ ...S.svg,
                     cursor: view.k > 1 ? "grab" : "default",
                     /* Unengaged the page must still scroll under a finger;
                        pinch-zoom stays available either way. */
                     touchAction: engaged ? "none" : "pan-y pinch-zoom" }}
            role="img" aria-label={t.title}
            onDoubleClick={(e) => { const [x, y] = svgPoint(e); zoomBy(view.k >= 3 ? 0.35 : 2.2, x, y); }}
            onPointerDown={(e) => {
              // Nothing is captured on the way down, so a click still reaches
              // the building or pin under the pointer.
              clickGuard.current = false;
              pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
              if (pointers.current.size === 2) {
                // Two fingers: pinch. Recorded here so the gesture starts from
                // the exact spread and midpoint the hand began with.
                const [a, b] = [...pointers.current.values()];
                pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k,
                                  x: view.x, y: view.y };
                for (const id of pointers.current.keys()) {
                  try { e.currentTarget.setPointerCapture(id); } catch { /* already lifted */ }
                }
                drag.current = null;
              } else if (view.k > 1 && (e.pointerType === "mouse" || engaged)) {
                // A mouse pans a zoomed map by dragging. A finger pans only
                // while the map is being explored, so it can still scroll the page.
                drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY,
                                 ox: view.x, oy: view.y, moved: 0, on: false };
              } else {
                drag.current = null;
              }
            }}
            onPointerMove={(e) => {
              if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
              if (pinch.current && pointers.current.size === 2) {
                const [a, b] = [...pointers.current.values()];
                const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
                const f = d / (pinch.current.d || 1);
                const r = svgRef.current.getBoundingClientRect();
                const mx = ((a[0] + b[0]) / 2 - r.left) / r.width * LO.vb[0];
                const my = ((a[1] + b[1]) / 2 - r.top) / r.height * LO.vb[1];
                const k = Math.min(6, Math.max(1, pinch.current.k * f));
                const ratio = k / pinch.current.k;
                const ox = mx - MAP_W / 2, oy = my - MAP_H / 2;
                setView(clampView({ k, x: ox - (ox - pinch.current.x) * ratio,
                                       y: oy - (oy - pinch.current.y) * ratio }));
                return;
              }
              const g = drag.current;
              if (!g || g.id !== e.pointerId) return;
              g.moved = Math.max(g.moved, Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy));
              if (!g.on) {
                // A press that has not moved is still a click.
                if (g.moved < 5) return;
                g.on = true;
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* lifted */ }
              }
              const r = svgRef.current.getBoundingClientRect();
              const sc = LO.vb[0] / r.width;
              const dx = (e.clientX - g.sx) * sc, dy = (e.clientY - g.sy) * sc;
              setView((v) => clampView({ ...v, x: g.ox + dx, y: g.oy + dy }));
            }}
            onPointerUp={(e) => {
              pointers.current.delete(e.pointerId);
              if (pointers.current.size < 2 && pinch.current) {
                pinch.current = null;
                clickGuard.current = true;
              }
              const g = drag.current; drag.current = null;
              if (g?.on) clickGuard.current = true;
            }}
            onPointerCancel={(e) => { pointers.current.delete(e.pointerId);
                                      pinch.current = null; drag.current = null; }}
            onClickCapture={(e) => {
              // The click that ends a pan or a pinch chooses nothing.
              if (clickGuard.current) {
                clickGuard.current = false;
                e.stopPropagation();
              }
            }}
            onClick={() => { setSel(null); setSpot(null); }}>
            <defs>
              <filter id="cast" x="-40%" y="-40%" width="200%" height="200%">
                <feDropShadow dx="1" dy="2" stdDeviation="1.4"
                  floodColor="#5A5F52" floodOpacity=".3" />
              </filter>
              <linearGradient id="daylight" x1="0" x2="1">
                <stop offset="0%" stopColor="#FFF3D6" stopOpacity="0" />
                <stop offset="50%" stopColor="#FFF3D6" stopOpacity=".5" />
                <stop offset="100%" stopColor="#FFF3D6" stopOpacity="0" />
              </linearGradient>
            </defs>

            <rect width={LO.vb[0]} height={LO.vb[1]} fill={C.paper} />
            <g className="daylight" pointerEvents="none"
              style={{ display: isNight ? "none" : undefined }}>
              <rect x={-LO.vb[0] * 0.5} y="0" width={LO.vb[0] * 0.5} height={MAP_H}
                fill="url(#daylight)" />
            </g>

            <g className="viewport"
              transform={`translate(${view.x} ${view.y}) scale(${view.k})`}
              style={{ transformOrigin: `${MAP_W / 2}px ${MAP_H / 2}px` }}>

            {/* Ground, in the source's own drawing order, since the map paints
                a road body and then covers its middle. */}
            {CAMPUS.ground.map(([d, cls, e], i) => (
              <path key={i} d={d} fill={C[cls]} fillRule={e ? "evenodd" : "nonzero"} />
            ))}

            {/* Buildings the legend does not number, kept as context so the
                campus reads as a whole. */}
            {CONTEXT.map(([d, e], i) => (
              <path key={`c${i}`} d={d} fillRule={e ? "evenodd" : "nonzero"}
                fill={C.context} stroke={C.contextEdge}
                strokeWidth={0.4 / Math.max(1, view.k)} />
            ))}

            {/* The footbridge over the highway, at the point the printed map
                labels "Üst Geçit". It is the only link between the campuses. */}
            {CAMPUS.bridge && (
              <g pointerEvents="none">
                <path d={`M${CAMPUS.bridge[0] - 15} ${CAMPUS.bridge[1]} L${CAMPUS.bridge[0] + 26} ${CAMPUS.bridge[1] - 4}`}
                  stroke={C.outline} strokeWidth="3.4" strokeLinecap="round" />
                <path d={`M${CAMPUS.bridge[0] - 15} ${CAMPUS.bridge[1]} L${CAMPUS.bridge[0] + 26} ${CAMPUS.bridge[1] - 4}`}
                  stroke={isNight ? "#F2C88A" : "#FBFBF7"} strokeWidth="1.6" strokeLinecap="round" />
                {[0, 1, 2, 3, 4].map((k) => (
                  <line key={k}
                    x1={CAMPUS.bridge[0] - 15 + k * 10.25} y1={CAMPUS.bridge[1] - k * 1 - 3}
                    x2={CAMPUS.bridge[0] - 15 + k * 10.25} y2={CAMPUS.bridge[1] - k * 1 + 3}
                    stroke={C.outline} strokeWidth=".7" />
                ))}
                <text x={CAMPUS.bridge[0] + 5} y={CAMPUS.bridge[1] + 14}
                  style={SVGT.tiny} textAnchor="middle">{t.overpass}</text>
              </g>
            )}

            <text x={WEST_LABEL[0]} y={WEST_LABEL[1]} style={SVGT.campus} textAnchor="middle">
              {t.west.toLocaleUpperCase(lang)}
            </text>
            <text x={EAST_LABEL[0]} y={EAST_LABEL[1]} style={SVGT.campus} textAnchor="middle">
              {t.east.toLocaleUpperCase(lang)}
            </text>

            {/* Walkers on the paths, thin before eight, full through the
                middle of the day, a handful after dark. Scenery only. */}
            <g pointerEvents="none">
              {WALKERS.slice(0, ambientCount).map((w) => (
                <circle key={w.id} r={w.size} fill={C.walker}
                  opacity={isNight ? 0.85 : 0.55}
                  style={{
                    offsetPath: `path("${ROUTES[w.route].d}")`,
                    offsetRotate: "0deg",
                    animation: `walk ${w.dur}s linear ${w.delay}s infinite`,
                    animationDirection: w.back ? "reverse" : "normal",
                    filter: isNight ? "drop-shadow(0 0 2.5px #FFC978)" : "none",
                  }} />
              ))}
            </g>

            {/* Traffic on the highway. It never stops entirely, but it thins
                out overnight like everything else. */}
            {HIGHWAY_ROUTE && (
              <g pointerEvents="none">
                {CARS.slice(0, Math.max(2, Math.round(2 + 10 * DENSITY(hour)))).map((c) => (
                  <rect key={c.id} x="-1.4" y="-0.8" width="2.8" height="1.6" rx=".5"
                    fill={isNight ? "#FFE1A8" : "#8A9199"}
                    opacity={isNight ? 0.95 : 0.55}
                    style={{
                      offsetPath: `path("${HIGHWAY_ROUTE}")`,
                      offsetRotate: "auto",
                      animation: `walk ${c.dur}s linear ${c.delay}s infinite`,
                      animationDirection: c.back ? "reverse" : "normal",
                      filter: isNight ? "drop-shadow(0 0 3px #FFC978)" : "none",
                    }} />
                ))}
              </g>
            )}

            {/* Landmarks the printed map marks and the legend does not number:
                gates, dormitories, bus stops, mosques, sports grounds. */}
            <g pointerEvents="none">
              {CAMPUS.poi?.map(([kind, x, y], i) => {
                const g = POI[kind];
                // Gates, entrances, dormitories and bus stops show at any scale;
                // the rest appear once zoomed in, keeping the overview clear.
                if (!g || (view.k < 1.5 && !POI_ALWAYS.includes(kind))) return null;
                const s = 1 / view.k;
                return (
                  <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
                    <text x="0" y="0" textAnchor="middle" style={{
                      fontFamily: MONO, fontSize: 8.4, letterSpacing: ".04em",
                      fill: g.line ?? C.muted, fontWeight: 600,
                      paintOrder: "stroke", stroke: C.paper, strokeWidth: 2.6,
                      strokeLinejoin: "round",
                    }}>{g[lang]}</text>
                  </g>
                );
              })}
            </g>

            {/* Street lamps come on with the dark. */}
            {isNight && (
              <g pointerEvents="none">
                {LAMPS.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r="1.5" fill="#FFD79A"
                    className="lamp" style={{ animationDelay: `${(i % 7) * 0.6}s` }} />
                ))}
              </g>
            )}

            {/* Numbered units, drawn back to front so extrusions overlap right */}
            {[...PLACES].sort((a, b) => a.anchor[1] - b.anchor[1]).map((p, i) => {
              const d = DATA[idOf(p)];
              const tier = tierOf(d.act);
              const metric = sizeBy === "reg" ? d.reg : d.act;
              const baseLift = 0.8 + Math.min(4.6, Math.sqrt(metric) * 0.26);
              const dim = !passes(d.act);
              const uid = idOf(p);
              const on = (sel && idOf(sel) === uid) || hover === uid;
              const roof = roofOf(d.act);
              const paths = FOOTPRINTS[p.no];
              const parts = partsFor(p);
              // Outlines and party walls are drawn in map units, so their width
              // is divided by the zoom to keep a constant weight on screen.
              const ink = 1 / Math.max(1, view.k);
              const [ax, ay] = p.anchor;
              return (
                <g key={uid}
                  className={`unit ${ready ? "in" : ""} ${on ? "on" : ""}`}
                  style={{ transitionDelay: `${(i % 26) * 16}ms`, opacity: dim ? 0.32 : 1 }}
                  onClick={(e) => { e.stopPropagation(); setSel(p); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(p); }
                  }}
                  onMouseEnter={() => setHover(uid)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(uid)}
                  onBlur={() => setHover(null)}
                  tabIndex={dim ? -1 : 0} role="button"
                  aria-label={`${nameOf(p)}: ${d.reg} ${t.registered}, ${d.act} ${windowLabel(t)}`}
                >
                  <circle cx={ax} cy={ay} r="9" fill="transparent" />

                  {/* A unit draws each structure it has to itself and its share
                      of any it shares. Wall, roof, outline and selection all use
                      the same clip, so a share reads as one part of the building. */}
                  {parts.map((part, pi) => {
                    const lift = Math.max(0.6, Math.min(baseLift, (part.h ?? 12) * 0.3));
                    const cpid = part.clip ? `part-${uid}-${pi}` : null;
                    const cref = cpid ? `url(#${cpid})` : undefined;
                    return (
                      <g key={`p${pi}`}>
                        {cpid && (
                          <defs>
                            <clipPath id={cpid}>
                              <rect x={part.clip.x} y={part.clip.y}
                                width={part.clip.w} height={part.clip.h} />
                            </clipPath>
                          </defs>
                        )}
                        {part.pieces.map(([pd, pe], k) => (
                          <path key={`w${k}`} d={pd} clipPath={cref}
                            fillRule={pe ? "evenodd" : "nonzero"}
                            fill={shade(roof, C.wallMix)} stroke={C.outline}
                            strokeWidth={0.5 * ink} filter="url(#cast)" />
                        ))}
                        <g className="lift"
                          style={{
                            transform: `translateY(${-(built ? lift : 0)}px)`,
                            transitionDelay: `${(ax / MAP_W) * 620}ms`,
                          }}>
                          {part.pieces.map(([pd, pe], k) => (
                            <path key={`r${k}`} className="roof" d={pd} clipPath={cref}
                              fillRule={pe ? "evenodd" : "nonzero"} fill={roof}
                              stroke={on ? C.text : C.outline}
                              strokeWidth={(on ? 1.4 : 0.5) * ink} />
                          ))}
                          {isNight && d.act > 0 && (
                            <g className="windows" pointerEvents="none" clipPath={cref}>
                              {windowsFor(`${uid}-${pi}`, part.centre, tier).map(([wx, wy, ws], k) => (
                                <rect key={k} x={wx} y={wy} width={ws} height={ws * 0.7} rx=".3"
                                  fill="#FFD79A" opacity={0.35 + tier * 0.14} />
                              ))}
                            </g>
                          )}
                          {on && part.pieces.map(([pd, pe], k) => (
                            <path key={`t${k}`} className="trace" d={pd} pathLength="100"
                              clipPath={cref} fillRule={pe ? "evenodd" : "nonzero"}
                              fill="none" stroke={C.text} strokeWidth={1.6 * ink} />
                          ))}
                          {liveSet.has(uid) && part.pieces.map(([pd, pe], k) => (
                            <path key={`live${k}`} className="halo" d={pd} clipPath={cref}
                              fillRule={pe ? "evenodd" : "nonzero"} fill="none"
                              stroke={ACCENT} strokeWidth={1.4 * ink}
                              style={{ animationDuration: "2.8s" }} />
                          ))}
                          {ping === uid && part.pieces.map(([pd, pe], k) => (
                            <path key={`${pingKey}-${k}`} className="ping" d={pd} clipPath={cref}
                              fillRule={pe ? "evenodd" : "nonzero"} fill="none"
                              stroke={roof} strokeWidth={1.6 * ink} />
                          ))}
                          {/* The party wall between neighbours in one building.
                              Clipped to the footprint so it never runs across a
                              courtyard or off the end of the block. */}
                          {part.divider && (
                            <>
                              <defs>
                                <clipPath id={`body-${uid}-${pi}`}>
                                  {part.pieces.map(([pd, pe], k) => (
                                    <path key={k} d={pd}
                                      fillRule={pe ? "evenodd" : "nonzero"} />
                                  ))}
                                </clipPath>
                              </defs>
                              <g clipPath={`url(#body-${uid}-${pi})`}>
                                <line {...part.divider} stroke={C.paper} strokeWidth={1.9 * ink} />
                                <line {...part.divider} stroke={C.outline} strokeWidth={0.8 * ink} />
                              </g>
                            </>
                          )}
                        </g>
                      </g>
                    );
                  })}

                  {on && p.blocks > 1 && (
                    <text x={ax} y={ay - 12} style={SVGT.num} textAnchor="middle">
                      {`${p.members[0]}–${p.members[p.members.length - 1]}`}
                    </text>
                  )}


                  {LANDMARKS[p.no] && !on && (
                    <text x={ax} y={ay + 15} style={SVGT.landmark} textAnchor="middle">
                      {LANDMARKS[p.no][lang === "tr" ? 0 : 1]}
                    </text>
                  )}
                </g>
              );
            })}

            {replay == null && (
              <PinLayer marks={marks} light={lightMark} k={view.k} grow={pinGrow} t={t} lang={lang}
                onPick={pickPlace} nameOfPlace={nameOfPlace} onHover={setPinHover} />
            )}

            </g>

            {/* The weather as it is outside, over the whole sheet. */}
            {replay == null && (
              <WeatherLayer weather={weather} w={LO.vb[0]} h={MAP_H} dark={dark} reduced={reduced} />
            )}

            {/* The printed sheet tags its roads at the edge, as in BURDUR /45 KM.
                District units get the same edge tags, since they lie beyond the
                ground shown. */}
            {DISTRICTS.map((d, i) => {
              const v = DATA[d.key];
              const on = sel?.key === d.key;
              const dim = !passes(v.act);
              const pos = [[MAP_W * 0.30, 14], [MAP_W * 0.60, 14], [MAP_W * 0.82, 14]][i];
              const w = 96;
              return (
                <g key={`tag-${d.key}`} className="unit in" role="button" tabIndex={dim ? -1 : 0}
                  style={{ opacity: dim ? 0.3 : 1, cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); setSel(d); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(d); }
                  }}
                  aria-label={`${nameOf(d)}, ${d.district[lang]}, ${d.km} km`}>
                  <path d={`M${pos[0] - w / 2} ${pos[1] + 11} L${pos[0]} ${pos[1] + 19} L${pos[0] + w / 2} ${pos[1] + 11}`}
                    fill="none" stroke={roofOf(v.act)} strokeWidth="1" strokeDasharray="2 3" />
                  <rect x={pos[0] - w / 2} y={pos[1] - 1} width={w} height="13" rx="6.5"
                    fill={on ? roofOf(v.act) : C.card} stroke={roofOf(v.act)} strokeWidth="1" />
                  <text x={pos[0]} y={pos[1] + 8.4} textAnchor="middle"
                    style={{ ...SVGT.tag, fill: on ? C.paper : C.text }}>
                    <tspan lang="tr">{d.district[lang].toLocaleUpperCase("tr")}</tspan> / {d.km} KM
                  </text>
                </g>
              );
            })}


            {/* Units outside the campus, as their own small blocks along the
                bottom of the sheet. */}
            <g>
              <line x1={PAD} y1={MAP_H + 6} x2={MAP_W - PAD} y2={MAP_H + 6}
                stroke={C.line} strokeWidth="1" />
              <text x={PAD} y={MAP_H + 22} style={SVGT.insetHead}>
                {t.districts.toLocaleUpperCase(lang)}
              </text>
              {DISTRICTS.map((d, i) => {
                const v = DATA[d.key];
                const on = sel?.key === d.key;
                const dim = !passes(v.act);
                const roof = roofOf(v.act);
                const colW = (MAP_W - PAD * 2) / 3;
                const x0 = PAD + i * colW;
                const y0 = MAP_H + 26;
                const lift = 1.6 + Math.min(6, Math.sqrt(v.reg) * 0.34);
                return (
                  <g key={d.key} className="unit in" role="button" tabIndex={dim ? -1 : 0}
                    style={{ opacity: dim ? 0.34 : 1, cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); setSel(d); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(d); }
                    }}
                    onMouseEnter={() => setHover(null)}
                    aria-label={`${nameOf(d)}, ${d.district[lang]}, ${d.km} km, ${v.reg} ${t.registered}`}>
                    <rect x={x0} y={y0 - 8} width={colW - 12} height={DIST_H - 40} rx="8"
                      fill={on ? C.tint : "transparent"}
                      stroke={on ? C.text : "transparent"} strokeWidth="1" />
                    {DISTRICT_PLAN[i].map(([bx, by, bw, bh], k) => (
                      <g key={k} transform={`translate(${x0 + 16 + bx * 1.3} ${y0 + 8 + by * 0.86})`}>
                        <path d={`M0 0 h${bw * 1.3} v${bh * 0.96} h${-bw * 1.3} Z`}
                          fill={shade(roof, C.wallMix)} stroke={C.outline} strokeWidth=".8" />
                        <path d={`M0 ${-lift} h${bw * 1.3} v${bh * 0.96} h${-bw * 1.3} Z`}
                          fill={roof} stroke={on ? C.text : C.outline} strokeWidth={on ? 1.3 : 0.8} />
                        {isNight && v.act > 0 && [0, 1, 2].map((wI) => (
                          <rect key={wI} x={5 + wI * 9} y={-lift + 5} width="4" height="3"
                            fill="#FFD79A" opacity=".85" />
                        ))}
                      </g>
                    ))}
                    <text x={x0 + 14} y={y0 + 96} style={SVGT.insetName}>
                      {d.lines[lang][0]} {d.lines[lang][1]}
                    </text>
                    <text x={x0 + 14} y={y0 + 112} style={SVGT.insetKm}>
                      {d.district[lang]} · {d.km} km
                    </text>
                    <text x={x0 + colW - 26} y={y0 + 114} textAnchor="end" style={SVGT.insetNum}>
                      <tspan fill={v.act ? roof : C.muted}>{v.act}</tspan>
                      <tspan fill={C.muted}> / </tspan>
                      <tspan>{v.reg}</tspan>
                    </text>
                  </g>
                );
              })}
            </g>

            {/* What a pin stands for, in words, while it is pointed at. */}
            {replay == null && pinHover && (() => {
              const m = marks.find((x) => x.place === pinHover);
              if (!m) return null;
              const full = nameOfPlace(m.place);
              const line = full.length > 30 ? `${full.slice(0, 29)}…` : full;
              const meta = pinCounts(t, m);
              const w = Math.max(line.length * 6.4, meta.length * 5.8) + 26;
              const px = (m.x - MAP_W / 2) * view.k + MAP_W / 2 + view.x;
              const py = (m.y - 12 - MAP_H / 2) * view.k + MAP_H / 2 + view.y;
              if (px < -20 || px > MAP_W + 20 || py < -20 || py > MAP_H + 20) return null;
              const flip = px + w + 14 > MAP_W;
              const bx = Math.max(4, Math.min(MAP_W - w - 4, flip ? px - w - 10 : px + 10));
              const by = Math.max(4, py - 44);
              return (
                <g pointerEvents="none" className="tip" data-pin-tip={m.place}>
                  <defs>
                    <clipPath id="pintipclip">
                      <rect x={bx + 4} y={by} width={w - 8} height={34} />
                    </clipPath>
                  </defs>
                  <rect x={bx} y={by} width={w} height={34} rx="6"
                    fill={C.card} stroke={C.text} strokeWidth=".9" />
                  <text x={bx + 11} y={by + 14} clipPath="url(#pintipclip)" style={SVGT.tipName}>{line}</text>
                  <text x={bx + 11} y={by + 26} clipPath="url(#pintipclip)" style={SVGT.tipMeta}>{meta}</text>
                </g>
              );
            })()}

            {/* One legible plate for whatever is being pointed at. */}
            {!pinHover && (() => {
              const p = PLACES.find((q) => idOf(q) === (hover ?? (sel ? idOf(sel) : null)));
              if (!p || (hover == null && !sel) || sel?.key) return null;
              const full = nameOf(p);
              const line = full.length > 30 ? `${full.slice(0, 29)}…` : full;
              const v = DATA[idOf(p)];
              // The second line is usually the longer one, so the plate is
              // sized from both and then kept inside the sheet.
              const meta = `${v.reg} ${t.registered} · ${v.act} ${windowLabel(t)}`;
              // Estimating text width from a character count is unreliable once
              // a font falls back, so the plate is generous and also clips.
              const w = Math.max(line.length * 6.4, meta.length * 5.8) + 26;
              // The plate is drawn outside the zoom group so it stays legible;
              // its anchor therefore has to be pushed through the same transform.
              const px = (p.anchor[0] - MAP_W / 2) * view.k + MAP_W / 2 + view.x;
              const py = (p.anchor[1] - MAP_H / 2) * view.k + MAP_H / 2 + view.y;
              if (px < -20 || px > MAP_W + 20 || py < -20 || py > MAP_H + 20) return null;
              const flip = px + w + 14 > MAP_W;
              const bx = Math.max(4, Math.min(MAP_W - w - 4, flip ? px - w - 10 : px + 10));
              const by = Math.max(4, py - 44);
              return (
                <g pointerEvents="none" className="tip">
                  <defs>
                    <clipPath id="tipclip">
                      <rect x={bx + 4} y={by} width={w - 8} height={34} />
                    </clipPath>
                  </defs>
                  <line x1={px} y1={py} x2={flip ? bx + w : bx} y2={by + 17}
                    stroke={C.text} strokeWidth=".7" opacity=".45" />
                  <circle cx={px} cy={py} r="2" fill={C.text} />
                  <rect x={bx} y={by} width={w} height={34} rx="6"
                    fill={C.card} stroke={C.text} strokeWidth=".9" />
                  <text x={bx + 11} y={by + 14} clipPath="url(#tipclip)" style={SVGT.tipName}>{line}</text>
                  <text x={bx + 11} y={by + 26} clipPath="url(#tipclip)" style={SVGT.tipMeta}>
                    {`${v.reg} ${t.registered} · `}
                    <tspan fill={v.act ? roofOf(v.act) : C.muted}>{v.act}</tspan>
                    {` ${windowLabel(t)}`}
                  </text>
                </g>
              );
            })()}
          </svg>

        </div>

        <div style={S.legendBar} data-panel="legend">
          <span style={S.legendGroup}>
            <span style={S.legendCap}>{windowLabel(t)}</span>
            <span style={{ ...S.sw, background: C.quiet }} />
            {C.ramp.map((c) => <span key={c} style={{ ...S.sw, background: c }} />)}
            <span style={S.legendCap}>70+</span>
          </span>
          {liveSet.size > 0 && (
            <span style={S.legendGroup}>
              <span style={{ ...S.poiItem, color: "var(--ink)" }}>
                <span style={S.liveRing} aria-hidden="true" />{t.liveBuild}
              </span>
            </span>
          )}
          {replay == null && (marks.length > 0 || lightMark) && (
            <span style={S.legendGroup} data-legend="pins">
              {marks.some((m) => m.cases.length) && (
                <span style={S.poiItem}><PinSwatch fill="#FFFFFF" count="2" />{t.pinCase}</span>
              )}
              {marks.some((m) => m.cases.some((c) => c.type === "weekly" && c.status === "live")) && (
                <span style={S.poiItem}><PinSwatch fill={ACCENT} />{t.pinWeekly}</span>
              )}
              {marks.some((m) => m.events.length) && (
                <span style={S.poiItem}><PinSwatch fill="#2E5E8C" stroke="#1D3F60" />{t.pinEvent}</span>
              )}
              {lightMark && (
                <span style={S.poiItem} data-legend-light>
                  <span style={S.lightDot} aria-hidden="true" />{t.pinLight}
                </span>
              )}
            </span>
          )}
          {replay == null && marks.length > 0 && (
            <span style={S.legendNote} data-legend="pin-tap">{t.pinTap}</span>
          )}
        </div>
        </div>

        <aside ref={panelRef} data-panel="map-panel"
          style={{ ...S.panel, ...(side ? S.panelSide : null), ...(narrow ? S.panelNarrow : null) }}>
          {spot ? (
            <div data-panel="spot" data-spot={spot}>
              <div style={S.pRow}>
                <span style={S.pSub}>{t.spotSub}</span>
                <span style={S.pTools}>
                  {!side && <BackToMap t={t} frameRef={frameRef} reduced={reduced} />}
                  <button onClick={() => setSpot(null)} style={S.close} aria-label={lang === "tr" ? "Kapat" : "Close"}>✕</button>
                </span>
              </div>
              <h2 style={S.pTitle}>{nameOfPlace(spot)}</h2>
              <HereList t={t} lang={lang} visitor={Boolean(visitor)} {...hereOf([spot])} />
            </div>
          ) : detail ? (
            <>
              <div style={S.pRow}>
                <span style={S.pSub}>{detail.sub}</span>
                <span style={S.pTools}>
                  {!side && <BackToMap t={t} frameRef={frameRef} reduced={reduced} />}
                  <button onClick={() => setSel(null)} style={S.close} aria-label={lang === "tr" ? "Kapat" : "Close"}>✕</button>
                </span>
              </div>

              <h2 style={S.pTitle}>{detail.title}</h2>
              {!sel.key && sel.blocks > 1 && (
                <div style={S.multi}>{sel.blocks} {t.blocks}</div>
              )}
              {!sel.key && COTENANTS[sel.no]?.length > 0 && (
                <div style={S.shared}>
                  {(() => {
                    const names = COTENANTS[sel.no]
                      .map((n) => PLACES.find((q) => q.no === n))
                      .filter(Boolean).map((q) => nameOf(q));
                    const head = names.slice(0, 3).join(", ");
                    const rest = names.length - 3;
                    return `${t.shared}: ${head}${rest > 0 ? ` ${t.andMore.replace("{n}", rest)}` : ""}`;
                  })()}
                </div>
              )}
              {!sel.key && (
                <HereList t={t} lang={lang} visitor={Boolean(visitor)}
                  {...hereOf(placesOfUnit(sel))} />
              )}
              <div style={S.figs}>
                <div><div style={S.fig}>{detail.reg}</div><div style={S.figCap}>{t.registered}</div></div>
                <div>
                  <div style={{ ...S.fig, color: detail.act ? "var(--ink)" : "var(--muted)" }}>{detail.act}</div>
                  <div style={S.figCap}>{windowLabel(t)}</div>
                </div>
              </div>
              <Bars title={t.week} values={detail.days} colour={roofOf(detail.act)}
                hidden={t.daysHidden} />
              <Bars title={t.weekTrend} values={detail.weeks} colour={roofOf(detail.act)}
                mark={7} />
              <UnitAwareness data={unitAwareness} lang={lang} t={t} today={replay != null} />

              {detail.act === 0 ? (
                <p style={S.quiet}>{t.nothing}</p>
              ) : (
                <div style={S.meta}>
                  <div style={S.metaRow}>
                    <span style={S.metaLabel}>{t.share}</span>
                    <span style={S.mono}>
                      {lang === "tr" ? `%${((detail.act / Math.max(1, grandAct)) * 100).toFixed(1).replace(".", ",")}` : `${((detail.act / Math.max(1, grandAct)) * 100).toFixed(1)}%`}
                    </span>
                  </div>
                  <div style={S.metaRow}>
                    <span style={S.metaLabel}>{t.rank}</span>
                    <span style={S.mono}>{rank} / {PLACES.length + DISTRICTS.length}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={S.pRow}>
                <span style={S.pSub}>{t.campusTotal}</span>
                <span style={S.mono}>{PLACES.length + DISTRICTS.length} {t.of}</span>
              </div>
              <div style={S.figs}>
                <div><div style={S.fig}>{shownReg}</div><div style={S.figCap}>{t.registered}</div></div>
                <div>
                  <div style={{ ...S.fig, color: "var(--ink)" }}>{shownAct}</div>
                  <div style={S.figCap}>{windowLabel(t)}</div>
                </div>
              </div>
              <div style={narrow || side ? undefined : S.panelCols}>
              <div>
              {["west", "east", "districts"].map((k) => (
                <div key={k} style={S.split}>
                  <span style={S.splitName}>{t[k]}</span>
                  <div style={S.splitBar}>
                    <div className="bar-fill" style={{
                      width: `${(totals[k].act / Math.max(1, grandAct)) * 100}%`,
                      background: roofOf(totals[k].act),
                    }} />
                  </div>
                  <span style={S.mono}>{totals[k].act}</span>
                </div>
              ))}
              </div>
              <div style={S.topList}>
                {[...PLACES, ...DISTRICTS]
                  .map((u) => ({ u, v: DATA[u.key ?? idOf(u)] }))
                  .sort((a, b) => b.v.act - a.v.act).slice(0, 6)
                  .map(({ u, v }) => (
                    <button key={u.key ?? u.no} onClick={() => setSel(u)} style={S.topRow}>
                      <span style={{ ...S.topDot, background: roofOf(v.act) }} />
                      <span style={S.topName}>{nameOf(u)}</span>
                      <span style={S.mono}>{v.act}</span>
                    </button>
                  ))}
              </div>
              </div>
              <p style={S.hint}>{t.hint}</p>
            </>
          )}
        </aside>
        </div>

        <div style={S.below}>
        {mapOffline && <p style={S.mapOffline}>{t.mapOffline}</p>}
        {/* The campus today: the twin's sealed forecast, the campus's
            confidence beside its accuracy, and the step it most often got wrong.
            A visitor sees the first two while the campus twin is open to them. */}
        {/* While the time bar shows a day gone by, the campus twin below shows
            that day too: its forecast and what happened, and the campus as it
            stood at the end of the day. The trap is about the last few days, so
            it waits for the present. */}
        {(() => {
          if (pastTwin) {
            const date = dateLong(replay.dayStart, lang);
            return (
              <section style={S.today} data-panel="campus-today" data-past>
                <div style={S.awHead}>{t.todayHeadAt.replace("{date}", date)}</div>
                <div style={{ ...S.todayGrid,
                              gridTemplateColumns: narrow ? "1fr" : "repeat(2, minmax(0, 1fr))" }}>
                  <ForecastDayCard t={t} lang={lang} date={date} forecast={pastTwin.forecast}
                    actual={pastTwin.actual} />
                  <ConfidenceCard t={t} lang={lang} accuracy={pastTwin.accuracy} />
                </div>
              </section>
            );
          }
          const accuracy = twinAccuracy ?? (mapOffline ? SAMPLE_ACCURACY : null);
          const cards = [forecast?.today, accuracy, trap].filter(Boolean).length;
          if (!cards) return null;
          return (
            <section style={S.today} data-panel="campus-today">
              <div style={S.awHead}>{t.todayHead}</div>
              <div style={{ ...S.todayGrid,
                            gridTemplateColumns: narrow ? "1fr"
                              : `repeat(${Math.max(2, cards)}, minmax(0, 1fr))` }}>
                <ForecastCard t={t} lang={lang} data={forecast} soFar={pulse.answers_today ?? 0} />
                <ConfidenceCard t={t} lang={lang} accuracy={accuracy} />
                <TrapCard t={t} lang={lang} data={trap} />
              </div>
            </section>
          );
        })()}
        {/* Below the selection, as the backdrop the selected building is read
            against. */}
        {pastTwin ? (
          <CampusAwareness lang={lang} t={t} C={C}
            data={{ ...pastTwin.awareness, note: campusAwareness?.note }}
            accuracy={pastTwin.accuracy} mine={null} today={campusAwareness?.areas}
            asOf={dateLong(replay.dayStart, lang)} />
        ) : (
          <CampusAwareness lang={lang} t={t} C={C}
            data={campusAwareness ?? (mapOffline ? SAMPLE_AWARENESS : null)}
            accuracy={twinAccuracy ?? (mapOffline ? SAMPLE_ACCURACY : null)}
            mine={myTwin ?? (mapOffline ? SAMPLE_TWIN : null)} />
        )}

        <p style={S.note}>{t.note}</p>

        {!embedded && <Colophon lang={lang} />}
        </div>
      </div>


    </div>
  );
}

/* -------------------------------------------------------------------------- */


const PAPER = "#F4F4F2";
const CARD = "#FFFFFF";
const LINE = "#DEDEDA";
const TEXT = "#2B2B2B";
const MUTED = "#77787A";
const DISPLAY = "'Archivo', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const CSS = `

.unit { cursor: pointer; opacity: 0; }
.unit.in { opacity: 1; transition: opacity .45s ease; }
.unit .roof { transition: transform .18s cubic-bezier(.2,.8,.3,1), stroke .15s, stroke-width .15s; }
.unit.on .roof { transform: translateY(-3px); }
.unit:focus-visible { outline: none; }
.unit:focus-visible .roof { stroke: #31363A; stroke-width: 2; }

/* The busiest roofs carry a slow outline that widens and fades, in the
   roof's own colour. */
.halo { animation: ring ease-in-out infinite; opacity: 0; transform-box: fill-box;
        transform-origin: center; }
@keyframes ring {
  0%, 100% { opacity: 0; transform: scale(1); }
  45%      { opacity: .55; transform: scale(1.13); }
}

.flow { animation: flow 3.2s linear infinite; }
@keyframes flow { to { stroke-dashoffset: -20; } }

/* The campus rose opens once, petal after petal. */
.rose-petal { transform-box: view-box; transform-origin: 160px 160px;
              animation: bloom .9s cubic-bezier(.22,.9,.28,1) both; }
@keyframes bloom { from { transform: scale(.25); opacity: 0 } to { transform: scale(1); opacity: 1 } }
.time-range { width: 100%; accent-color: ${ACCENT}; margin: 0; display: block; }

.lamp { animation: lamp 4.5s ease-in-out infinite; opacity: .55; }
@keyframes lamp { 0%,100% { opacity: .45 } 50% { opacity: .85 } }

.beacon { width: 7px; height: 7px; border-radius: 99px; background: ${ACCENT};
          display: inline-block; animation: beacon 2.6s ease-in-out infinite; }
@keyframes beacon { 0%,100% { opacity: 1 } 50% { opacity: .35 } }

.tip { animation: fade .14s ease both; }
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }

.tick { flex: 1; border-radius: 2px; transform-origin: bottom;
        animation: rise .4s cubic-bezier(.2,.8,.3,1) both; }
@keyframes rise { from { transform: scaleY(0); opacity: 0 } to { transform: scaleY(1); opacity: 1 } }

.bar-fill { height: 100%; border-radius: 99px;
            transition: width .5s cubic-bezier(.2,.8,.3,1); }


/* Extrusion. Height carries a number, so a change of measure is animated. */
.lift { transition: transform .7s cubic-bezier(.22,.9,.28,1); }
.unit.on .roof { transform: translateY(-3px); }

/* Selection draws its own outline once. */
.trace { stroke-dasharray: 100; stroke-dashoffset: 100;
         animation: trace .55s cubic-bezier(.3,.8,.3,1) forwards; }
@keyframes trace { to { stroke-dashoffset: 0; } }

/* A single finish, somewhere on campus. */
.ping { transform-box: fill-box; transform-origin: center;
        animation: ping 1.5s cubic-bezier(.15,.7,.3,1) forwards; }
@keyframes ping {
  0%   { opacity: .85; transform: scale(1); }
  100% { opacity: 0;   transform: scale(1.55); }
}

/* People move along the routes; offset-path keeps it on the GPU. */
@keyframes walk { from { offset-distance: 0%; } to { offset-distance: 100%; } }

.ticker-run { animation: ticker 108s linear infinite; }
.ticker-run:hover { animation-play-state: paused; }
@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }

.viewport { transition: transform .28s cubic-bezier(.2,.8,.3,1); }
.viewport path, .windows rect { transition: fill .6s ease, stroke .6s ease; }

.daylight { animation: daylight 46s linear infinite; }
@keyframes daylight {
  from { transform: translateX(0); }
  to   { transform: translateX(260%); }
}


button:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }

/* The sky and the weather. Each moves slowly and none of them flashes. */
.twinkle { animation: twinkle 5s ease-in-out infinite; }
@keyframes twinkle { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
.sky-cloud { animation: skydrift 150s linear infinite; }
@keyframes skydrift { from { transform: translateX(-180px); } to { transform: translateX(1060px); } }
.cloud-shadow { animation: shadowdrift 90s linear infinite; }
@keyframes shadowdrift { from { transform: translateX(-260px); } to { transform: translateX(1150px); } }
.drop { animation: drop .85s linear infinite; }
@keyframes drop { from { transform: translate(0, -36px); opacity: 0 } 20% { opacity: .6 }
                  to { transform: translate(-9px, 48px); opacity: 0 } }
.flake { animation: flake 7s linear infinite; }
@keyframes flake { from { transform: translate(0, -30px); } 50% { transform: translate(7px, 10px); }
                   to { transform: translate(-3px, 52px); } }
.fog { animation: fogdrift 24s ease-in-out infinite alternate; }
@keyframes fogdrift { from { opacity: .26 } to { opacity: .42 } }
.light-ring { animation: lightring 2.6s ease-out infinite; transform-box: fill-box;
              transform-origin: center; }
@keyframes lightring { from { transform: scale(1); opacity: .8 } to { transform: scale(3.4); opacity: 0 } }
[data-panel="map-controls"] button:disabled { opacity: .38; cursor: default; }
[data-panel="map-controls"] button:last-child { border-bottom: none !important; }
[data-pin]:focus { outline: none; }
[data-pin]:focus-visible path { stroke-width: 2.6; }

@media (prefers-reduced-motion: reduce) {
  .twinkle, .sky-cloud, .cloud-shadow, .drop, .flake, .fog, .light-ring { animation: none !important; }
  .halo, .flow, .beacon, .tick, .unit.in, .trace, .ping, .rose-petal { animation: none; }
  .ticker-run { animation: none; }
  circle[style*="offset-path"], rect[style*="offset-path"] { animation: none !important; display: none; }
  .lamp { animation: none; }
  .lift, .unit .roof { transition: none; }
  .daylight { display: none; }
  .trace { stroke-dashoffset: 0; }
}
`;

const SVGT = {
  campus: { fill: "var(--label)", fontFamily: DISPLAY, fontSize: 13, fontWeight: 600,
            letterSpacing: "3.4px", fontStretch: "115%" },
  tiny: { fill: "var(--muted)", fontFamily: MONO, fontSize: 8.5, letterSpacing: ".3px" },
  num: { fill: "var(--muted)", fontFamily: MONO, fontSize: 10.5, fontWeight: 600 },
  landmark: { fill: "var(--muted)", fontFamily: MONO, fontSize: 9, letterSpacing: ".04em" },
  tag: { fontFamily: MONO, fontSize: 8.4, letterSpacing: ".06em", fontWeight: 500 },
  insetHead: { fill: "var(--label)", fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600,
               letterSpacing: "2.2px", fontStretch: "115%" },
  insetName: { fill: "var(--text)", fontFamily: DISPLAY, fontSize: 15, fontWeight: 700 },
  insetKm: { fill: "var(--muted)", fontFamily: MONO, fontSize: 11.5 },
  insetNum: { fill: "var(--text)", fontFamily: MONO, fontSize: 16 },
  tipName: { fill: "var(--text)", fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 700 },
  tipMeta: { fill: "var(--muted)", fontFamily: MONO, fontSize: 9 },
  roseLabel: { fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, letterSpacing: ".01em" },
  roseCentre: { fill: "var(--text)", fontFamily: DISPLAY, fontSize: 14, fontWeight: 700 },
  roseCentreCap: { fill: "var(--muted)", fontFamily: DISPLAY, fontSize: 8.5 },
};

const V = (n) => `var(${n})`;
const S = {
  brandBar: { display: "flex", alignItems: "center", gap: 14,
              padding: "12px 0 14px", marginBottom: 4,
              borderBottom: `1px solid ${V("--line")}` },
  brandPlate: { display: "inline-flex", alignItems: "center", flexShrink: 0,
                background: "#FFFFFF", borderRadius: 8, padding: "5px 8px" },
  brandWide: { height: 26, width: "auto", flexShrink: 0, display: "block" },
  brandText: { flex: 1, minWidth: 0 },
  brandTitle: { fontSize: 16, fontWeight: 700, letterSpacing: "-.01em",
                color: V("--text"), lineHeight: 1.2 },
  brandSub: { fontSize: 11.5, color: V("--muted"), lineHeight: 1.35, marginTop: 1 },
  brandSeal: { height: 26, width: "auto", flexShrink: 0, display: "block" },
  /* Quiet on purpose. The marks identify the system and stay in the
     background. */
  colophon: { display: "grid", gap: 7, justifyItems: "center", textAlign: "center",
              marginTop: 24, paddingTop: 16, borderTop: `1px solid ${V("--line")}`,
              opacity: 0.78 },
  colophonCompact: { display: "grid", gap: 6, justifyItems: "center",
                     textAlign: "center", marginTop: 16, paddingTop: 12,
                     borderTop: `1px solid ${V("--line")}`, opacity: 0.7 },
  colophonMarks: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                   justifyContent: "center" },
  markWide: { height: 22, width: "auto" },
  markSeal: { height: 22, width: "auto" },
  colophonName: { fontSize: 10.5, color: V("--muted"), lineHeight: 1.45, maxWidth: "52ch" },
  colophonSep: { color: LINE },
  credits: { display: "grid", gap: 1, marginTop: 2 },
  creditsCap: { fontSize: 11, fontWeight: 600, color: V("--muted"), marginBottom: 2 },
  creditRow: { display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap",
               alignItems: "baseline" },
  creditName: { fontSize: 11, fontWeight: 600, color: V("--muted") },
  creditRole: { fontSize: 10.5, color: V("--muted") },
  /* Awareness. The rows are a grid so the bar keeps its width however long the
     Turkish area names run. */
  awCard: { background: V("--card"), border: `1px solid ${V("--line")}`, borderRadius: 12,
            padding: 16, marginBottom: 14 },
  awHead: { fontSize: 12.5, fontWeight: 600, color: V("--muted"), marginBottom: 2 },
  awTitle: { margin: "0 0 6px", fontSize: 20, fontWeight: 700, letterSpacing: "-.015em",
             fontStretch: "110%" },
  awLede: { fontSize: 14, lineHeight: 1.5, margin: "0 0 12px", color: V("--text") },
  awAsOf: { fontSize: 12.5, fontWeight: 600, margin: "-2px 0 8px", color: V("--accent") },
  awSmall: { fontSize: 12.5, lineHeight: 1.5, color: V("--muted"), margin: "0 0 10px" },
  awGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "8px 28px", alignItems: "center" },
  rose: { width: "100%", maxWidth: 340, height: "auto", display: "block", margin: "0 auto",
          overflow: "visible" },
  roseWrap: { display: "grid", gap: 6, justifyItems: "center" },
  roseKey: { display: "flex", gap: 16, fontSize: 12, color: V("--muted") },
  keyItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  keySwatch: { width: 14, height: 10, borderRadius: 3 },
  keyLine: { width: 16, height: 0, borderTop: `2.2px solid ${V("--text")}`, borderRadius: 2 },
  keyDash: { width: 16, height: 0, borderTop: `2px dashed ${V("--text")}`, opacity: 0.8 },
  awList: { display: "grid", gap: 8, marginBottom: 14 },
  awRow: { display: "grid", gridTemplateColumns: "18px minmax(110px, 1fr) auto auto",
           alignItems: "center", gap: 9 },
  awIcon: { fontFamily: EMOJI_FONT, fontSize: 14, lineHeight: 1 },
  awName: { fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis" },
  awBarWrap: { height: 7, borderRadius: 99, background: V("--line"),
               overflow: "hidden" },
  awBar: { display: "block", height: "100%", borderRadius: 99 },
  awWord: { fontSize: 12.5, fontWeight: 600, textAlign: "right" },
  awConf: { fontSize: 11.5, fontWeight: 600, textAlign: "right", minWidth: 74 },
  barsHidden: { fontSize: 11.5, lineHeight: 1.45, color: V("--muted"), margin: "0 0 14px" },
  awNote: { fontSize: 11, color: V("--muted"), lineHeight: 1.45, margin: "12px 0 0" },

  uaBox: { marginTop: 12, paddingTop: 12, borderTop: `1px solid ${V("--line")}` },
  uaCap: { fontSize: 12.5, fontWeight: 600, color: V("--muted"), marginBottom: 7 },
  uaRow: { display: "flex", alignItems: "center", gap: 7, marginBottom: 4 },
  uaIcon: { fontFamily: EMOJI_FONT, fontSize: 14, lineHeight: 1 },
  uaLabel: { fontSize: 11.5, color: V("--muted"), width: 54, flexShrink: 0 },
  uaName: { fontSize: 13, fontWeight: 600 },
  uaBands: { display: "flex", gap: 4, flexWrap: "wrap", margin: "8px 0 6px" },
  uaChip: { fontFamily: EMOJI_FONT, fontSize: 13, lineHeight: 1,
            border: "1px solid", borderRadius: 7, padding: "3px 5px" },
  uaThin: { fontSize: 10.5, color: V("--muted"), lineHeight: 1.45, margin: 0 },

  root: { display: "flex", flexDirection: "column", minHeight: "auto",
          background: V("--paper"), color: V("--text"), fontFamily: DISPLAY },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, padding: "18px 22px 12px" },
  headerNarrow: { padding: "12px 14px 10px" },
  eyebrow: { fontSize: 12.5, color: V("--muted") },
  title: { margin: "4px 0 0", fontSize: 28, fontWeight: 700, letterSpacing: "-.02em",
           fontStretch: "110%" },
  titleNarrow: { fontSize: 20, margin: 0 },
  tools: { display: "flex", alignItems: "center", gap: 14, flexShrink: 0 },
  count: { display: "flex", alignItems: "baseline", gap: 7 },
  countNum: { fontSize: 22, color: V("--ink"), fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  countCap: { fontSize: 12.5, color: V("--muted") },
  seg: { display: "flex", border: `1px solid ${V("--line")}`, borderRadius: 7,
         overflow: "hidden", background: V("--card") },
  segBtn: { padding: "7px 12px", minHeight: 38, minWidth: 38, background: "none", border: "none",
            color: V("--muted"), fontFamily: DISPLAY, fontSize: 12.5, cursor: "pointer" },
  /* Background and text both come from the theme, so the selected segment
     stays readable in either skin. */
  segOn: { background: V("--tint"), color: V("--text"),
           boxShadow: `inset 0 0 0 1px ${V("--line")}` },

  ticker: { display: "flex", alignItems: "stretch", gap: 0, margin: "0 22px 12px",
            border: `1px solid ${V("--line")}`, borderRadius: 10, overflow: "hidden",
            background: V("--card") },
  tickerTag: { display: "flex", alignItems: "center", padding: "0 14px",
               fontFamily: DISPLAY, fontSize: 12.5, color: "#FFFFFF",
               background: ACCENT, whiteSpace: "nowrap", fontWeight: 600 },
  tickerViewport: { flex: 1, minWidth: 0, overflow: "hidden", padding: "9px 0" },
  tickerRun: { display: "inline-flex", whiteSpace: "nowrap", willChange: "transform" },
  tickerItem: { display: "inline-flex", alignItems: "baseline", gap: 8, paddingRight: 14 },
  tickerText: { fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 500 },
  tickerSep: { fontSize: 8, color: V("--line"), padding: "0 4px" },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center",
             gap: 10, padding: "0 22px 12px", flexWrap: "wrap" },
  chips: { display: "flex", gap: 6 },
  chip: { padding: "6px 13px", minHeight: 32, background: V("--card"),
          border: `1px solid ${V("--line")}`, borderColor: V("--line"),
          borderRadius: 99, color: V("--muted"),
          fontFamily: DISPLAY, fontSize: 12.5, cursor: "pointer" },
  chipOn: { background: ACCENT, borderColor: ACCENT, color: "#FFF", fontWeight: 600 },
  rightTools: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  clock: { display: "inline-flex", alignItems: "baseline", gap: 10, fontSize: 13,
           color: V("--text"), fontVariantNumeric: "tabular-nums" },
  clockCap: { color: V("--muted"), fontSize: 12.5 },
  toggle: { padding: "6px 13px", minHeight: 32, background: V("--card"),
            border: `1px solid ${V("--line")}`, borderRadius: 99, color: V("--text"),
            fontFamily: DISPLAY, fontSize: 12.5, cursor: "pointer" },

  body: { display: "flex", padding: "0 22px", alignItems: "stretch" },
  /* The map fits the screen's height; the panel takes the width left over. */
  mapRow: { display: "flex", gap: 16, alignItems: "flex-start" },
  mapStack: { display: "flex", flexDirection: "column" },
  mapCol: { flex: "0 0 auto", minWidth: 0, margin: "0 auto" },
  mapWrapOn: { boxShadow: `0 0 0 2px ${V("--text")}`, borderRadius: 12 },
  mapCtl: { position: "absolute", top: 10, right: 10, zIndex: 3, display: "flex",
            flexDirection: "column", alignItems: "flex-end", gap: 6 },
  engage: { padding: "6px 11px", minHeight: 32, borderRadius: 99,
            border: `1px solid ${V("--line")}`, borderColor: V("--line"),
            background: V("--card"),
            color: V("--muted"), fontFamily: DISPLAY, fontSize: 11.5,
            cursor: "pointer", opacity: 0.94 },
  engageOn: { borderColor: V("--text"), color: V("--text"), fontWeight: 600 },
  zoomStack: { display: "flex", flexDirection: "column", borderRadius: 9, overflow: "hidden",
               border: `1px solid ${V("--line")}`, background: V("--card"),
               boxShadow: "0 1px 3px rgba(0,0,0,.08)" },
  zoomBtn: { width: 34, height: 34, display: "inline-flex", alignItems: "center",
             justifyContent: "center", background: "none", border: "none",
             borderBottom: `1px solid ${V("--line")}`, color: V("--text"),
             fontFamily: DISPLAY, fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 0 },
  wheelHint: { position: "absolute", left: "50%", bottom: 16, transform: "translateX(-50%)",
               zIndex: 4, maxWidth: "min(460px, 86%)", padding: "9px 14px", borderRadius: 10,
               background: "rgba(20,22,26,.86)", color: "#FFFFFF", fontSize: 13,
               lineHeight: 1.45, textAlign: "center", pointerEvents: "none" },
  mapWrap: { position: "relative", minWidth: 0, scrollMarginTop: 12 },
  svg: { width: "100%", height: "auto", display: "block", borderRadius: 12,
         border: `1px solid ${V("--line")}`, background: V("--paper") },
  legendBar: { display: "flex", alignItems: "center", justifyContent: "space-between",
               gap: 12, flexWrap: "wrap", marginTop: 8, padding: "8px 12px",
               background: V("--card"), border: `1px solid ${V("--line")}`,
               borderRadius: 10 },
  legendGroup: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  poiItem: { display: "inline-flex", alignItems: "center", gap: 6,
             fontSize: 12.5, color: V("--muted") },
  poiDot: { fontSize: 14, lineHeight: 1 },
  legendCap: { fontSize: 12.5, color: V("--muted"), margin: "0 5px" },
  sw: { width: 22, height: 12, borderRadius: 3, border: "1px solid rgba(0,0,0,.10)" },
  liveRing: { width: 12, height: 12, borderRadius: 99, border: `2px solid ${ACCENT}`,
              display: "inline-block" },
  timeBar: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
             margin: "0 0 10px", padding: "8px 12px", background: V("--card"),
             border: `1px solid ${V("--line")}`, borderRadius: 10 },
  timeTrack: { position: "relative", flex: "1 1 260px", minWidth: 180, paddingBottom: 14 },
  timeMonths: { position: "absolute", left: 0, right: 0, bottom: 0, height: 12 },
  timeMonth: { position: "absolute", transform: "translateX(-50%)", fontSize: 10.5,
               color: V("--muted"), whiteSpace: "nowrap", lineHeight: "12px" },
  timeWhen: { fontSize: 12.5, fontWeight: 600, minWidth: 0, flex: "0 1 auto" },
  timeNowOff: { opacity: 0.5, cursor: "default" },
  replayBtn: { width: 32, height: 32, borderRadius: 99, border: `1px solid ${V("--line")}`,
               background: V("--card"), color: V("--ink"), display: "inline-flex",
               alignItems: "center", justifyContent: "center", cursor: "pointer" },

  panel: { width: "auto", marginLeft: 0, marginTop: 14, padding: "16px 20px",
           background: V("--card"), border: `1px solid ${V("--line")}`, borderRadius: 12,
           display: "flex", flexDirection: "column", scrollMarginTop: 12 },
  panelSide: { flex: "1 1 340px", minWidth: 320, marginTop: 0, position: "sticky", top: 12,
               maxHeight: "calc(100vh - 24px)", overflowY: "auto" },
  panelNarrow: { padding: "14px 16px" },
  below: { marginTop: 16 },
  legendNote: { flexBasis: "100%", fontSize: 12, color: V("--muted"), lineHeight: 1.45 },
  pRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  pSub: { fontSize: 12.5, color: V("--muted") },
  pTools: { display: "inline-flex", alignItems: "center", gap: 6 },
  back: { background: "none", border: `1px solid ${V("--line")}`, borderRadius: 99,
          color: V("--muted"), fontFamily: DISPLAY, fontSize: 12, padding: "4px 10px",
          cursor: "pointer" },
  close: { background: "none", border: "none", color: V("--muted"), fontSize: 13,
           cursor: "pointer", padding: 4, lineHeight: 1 },
  shared: { fontSize: 12, lineHeight: 1.45, color: V("--muted"),
            background: V("--tintBg"), border: `1px solid ${V("--line")}`,
            borderRadius: 8, padding: "8px 10px", margin: "0 0 14px" },
  multi: { fontSize: 12, color: V("--muted"), margin: "-8px 0 14px" },
  pTitle: { margin: "10px 0 16px", fontSize: 19, fontWeight: 600, lineHeight: 1.25,
            letterSpacing: "-.015em" },
  figs: { display: "flex", gap: 28, marginBottom: 16 },
  fig: { fontSize: 30, fontWeight: 700, letterSpacing: "-.02em", fontStretch: "108%",
         fontVariantNumeric: "tabular-nums" },
  figCap: { fontSize: 12.5, color: V("--muted"), marginTop: 3 },
  weekCap: { fontSize: 12, color: V("--muted"), marginBottom: 7 },
  week: { display: "flex", alignItems: "flex-end", gap: 4, height: 40 },
  meta: { marginTop: 16, borderTop: `1px solid ${V("--line")}`, paddingTop: 12 },
  metaRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline",
             gap: 10, marginBottom: 8 },
  metaLabel: { fontSize: 12.5, color: V("--muted") },
  quiet: { fontSize: 12.5, color: V("--muted"), marginTop: 14 },

  panelCols: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28,
               alignItems: "start" },
  topList: { display: "flex", flexDirection: "column", gap: 1 },
  topRow: { display: "flex", alignItems: "center", gap: 9, width: "100%", minHeight: 34,
            padding: "6px 7px", background: "none", border: "none", borderRadius: 6,
            color: V("--text"), fontFamily: DISPLAY, fontSize: 12.5, textAlign: "left",
            cursor: "pointer" },
  topDot: { width: 8, height: 8, borderRadius: 2, flexShrink: 0,
            border: "1px solid rgba(0,0,0,.12)" },
  topName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
             whiteSpace: "nowrap" },
  split: { display: "flex", alignItems: "center", gap: 10, marginBottom: 9 },
  splitName: { fontSize: 12.5, color: V("--muted"), width: 106, flexShrink: 0 },
  splitBar: { flex: 1, height: 6, background: V("--line"),
              borderRadius: 99, overflow: "hidden" },
  mono: { fontSize: 12.5, color: V("--muted"), fontVariantNumeric: "tabular-nums" },
  hint: { fontSize: 12.5, color: V("--muted"), marginTop: 16 },
  note: { marginTop: "auto", paddingTop: 16, fontSize: 11.5, lineHeight: 1.5,
          color: V("--muted"), borderTop: `1px solid ${V("--line")}` },

  // the sky band
  sky: { marginBottom: 8, borderRadius: 12, overflow: "hidden",
         border: `1px solid ${V("--line")}`, background: V("--card") },
  skySvg: { display: "block", width: "100%", height: "auto", aspectRatio: `${SKY_W} / ${SKY_H}` },
  skyCap: { display: "flex", flexWrap: "wrap", gap: "4px 18px", padding: "7px 12px",
            fontSize: 12.5, color: V("--muted"), borderTop: `1px solid ${V("--line")}` },
  skyGlyph: { fontFamily: EMOJI_FONT },
  lightDot: { width: 10, height: 10, borderRadius: 99, background: "#FFD36B",
              border: "1px solid #B9822B", boxShadow: "0 0 6px #FFD36B", display: "inline-block" },
  // what is set at a place
  here: { margin: "4px 0 14px", display: "grid", gap: 8 },
  hereHead: { fontSize: 12, fontWeight: 600, color: V("--muted"), marginTop: 4 },
  hereRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
             padding: "8px 10px", borderRadius: 8, background: V("--tintBg"),
             border: `1px solid ${V("--line")}` },
  hereEvent: { padding: "8px 10px", borderRadius: 8, background: V("--tintBg"),
               border: `1px solid ${V("--line")}`, display: "grid", gap: 3 },
  hereTitle: { fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, color: V("--text") },
  hereMeta: { fontSize: 12, color: V("--muted") },
  hereBody: { fontSize: 12.5, lineHeight: 1.45, color: V("--text") },
  hereLink: { fontSize: 12.5, color: V("--ink"), fontWeight: 600 },
  hereGo: { flexShrink: 0, padding: "6px 11px", minHeight: 32, borderRadius: 7,
            border: `1px solid ${V("--ink")}`, background: "transparent", color: V("--ink"),
            fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  // the campus today
  today: { marginBottom: 14 },
  todayGrid: { display: "grid", gap: 12, marginTop: 6, alignItems: "stretch" },
  todayCard: { background: V("--card"), border: `1px solid ${V("--line")}`, borderRadius: 12,
               padding: 14, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  todayTitle: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-.01em",
                fontStretch: "106%", color: V("--text") },
  todayText: { margin: 0, fontSize: 13.5, lineHeight: 1.5, color: V("--text") },
  todaySmall: { margin: 0, fontSize: 12.5, lineHeight: 1.45, color: V("--muted") },
  todayFoot: { margin: "auto 0 0", paddingTop: 6, fontSize: 11.5, lineHeight: 1.45,
               color: V("--muted") },
  sealLine: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  sealCap: { fontSize: 12, color: V("--muted") },
  sealCode: { fontFamily: MONO, fontSize: 12, padding: "3px 7px", borderRadius: 6,
              background: V("--tintBg"), border: `1px solid ${V("--line")}`, color: V("--text") },
  fcBars: { display: "flex", alignItems: "flex-end", gap: 6, height: 44, margin: "2px 0" },
  fcPair: { display: "flex", alignItems: "flex-end", gap: 2 },
  fcBar: { width: 7, borderRadius: "2px 2px 0 0", background: ACCENT, display: "inline-block" },
  fcBarForecast: { background: "transparent", border: `1.5px solid ${V("--muted")}`, borderBottom: "none" },
  fcKey: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: V("--muted"),
           margin: "2px 0 4px" },
  fcSwatch: { width: 8, height: 8, borderRadius: 2, background: ACCENT, display: "inline-block" },
  // one grid for the whole table, so the columns line up across the rows
  ccTable: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto auto",
             columnGap: 12, rowGap: 3, alignItems: "baseline", fontSize: 12.5 },
  ccLine: { display: "contents" },
  ccTh: { fontSize: 11, fontWeight: 600, color: V("--muted"), paddingBottom: 2 },
  ccNum: { textAlign: "right", fontVariantNumeric: "tabular-nums", color: V("--text") },
  ccName: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: V("--text") },
  ccWord: { fontWeight: 600, fontSize: 12, textAlign: "right", whiteSpace: "nowrap" },
  trapNote: { padding: "8px 10px", borderRadius: 8, background: V("--tintBg"),
              border: `1px solid ${V("--line")}` },
};
