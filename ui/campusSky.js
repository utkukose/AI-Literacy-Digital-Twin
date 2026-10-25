/* ---------------------------------------------------------------------------
   The sky over the campus.

   Where the sun and the moon are, when the sun rises and sets, and what the
   season is, for the campus's own coordinates. Worked out in the browser from
   the standard low-precision formulas of positional astronomy; the result is
   good to a minute or two, which is all a drawing needs. Nothing is fetched.
   --------------------------------------------------------------------------- */

export const SKY_LAT = 37.83;
export const SKY_LON = 30.53;

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

const toJulian = (date) => date.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (date) => toJulian(date) - J2000;

const rightAscension = (l, b) =>
  Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l, b) =>
  Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
const siderealTime = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;
const solarMeanAnomaly = (d) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(m) {
  const c = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  return m + c + RAD * 102.9372 + Math.PI;
}
const altitudeOf = (h, phi, dec) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
/* Measured from north, clockwise, in degrees. */
const azimuthOf = (h, phi, dec) => (Math.atan2(Math.sin(h),
  Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / RAD + 180) % 360;

/* The sun's height above the horizon and its bearing, in degrees. */
export function sunPosition(date, lat = SKY_LAT, lon = SKY_LON) {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date);
  const l = eclipticLongitude(solarMeanAnomaly(d));
  const dec = declination(l, 0), ra = rightAscension(l, 0);
  const h = siderealTime(d, lw) - ra;
  return { altitude: altitudeOf(h, phi, dec) / RAD, azimuth: azimuthOf(h, phi, dec) };
}

/* Sunrise and sunset (the upper limb, with refraction), and the start and end
   of civil twilight, for the day that contains `date`. */
export function sunTimes(date, lat = SKY_LAT, lon = SKY_LON) {
  const lw = RAD * -lon, phi = RAD * lat;
  const n = Math.round(toDays(date) - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const m = solarMeanAnomaly(ds), l = eclipticLongitude(m), dec = declination(l, 0);
  const noon = J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);
  const at = (deg) => {
    const cosW = (Math.sin(RAD * deg) - Math.sin(phi) * Math.sin(dec))
      / (Math.cos(phi) * Math.cos(dec));
    if (cosW < -1 || cosW > 1) return [null, null];
    const w = Math.acos(cosW);
    const a = 0.0009 + (w + lw) / (2 * Math.PI) + n;
    const set = J2000 + a + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);
    return [fromJulian(noon - (set - noon)), fromJulian(set)];
  };
  const [sunrise, sunset] = at(-0.833);
  const [dawn, dusk] = at(-6);
  return { sunrise, sunset, dawn, dusk, noon: fromJulian(noon) };
}

/* The moon's height and bearing, in degrees. */
export function moonPosition(date, lat = SKY_LAT, lon = SKY_LON) {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date);
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.229350 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  const ra = rightAscension(l, b), dec = declination(l, b);
  const h = siderealTime(d, lw) - ra;
  let altitude = altitudeOf(h, phi, dec);
  // Refraction near the horizon.
  altitude += (0.0002967 / Math.tan(altitude + 0.00312536 / (altitude + 0.08901179)));
  return { altitude: altitude / RAD, azimuth: azimuthOf(h, phi, dec) };
}

/* How far through its cycle the moon is (0 new, 0.5 full) and how much of it
   is lit, from the angle between the sun and the moon as seen from the Earth. */
export function moonPhase(date) {
  const d = toDays(date);
  const sl = eclipticLongitude(solarMeanAnomaly(d));
  const sDec = declination(sl, 0), sRa = rightAscension(sl, 0);
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.229350 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  const mDec = declination(l, b), mRa = rightAscension(l, b);
  const moonKm = 385001 - 20905 * Math.cos(M), sunKm = 149598000;
  const phi = Math.acos(Math.sin(sDec) * Math.sin(mDec)
    + Math.cos(sDec) * Math.cos(mDec) * Math.cos(sRa - mRa));
  const inc = Math.atan2(sunKm * Math.sin(phi), moonKm - sunKm * Math.cos(phi));
  const angle = Math.atan2(Math.cos(sDec) * Math.sin(sRa - mRa),
    Math.sin(sDec) * Math.cos(mDec) - Math.cos(sDec) * Math.sin(mDec) * Math.cos(sRa - mRa));
  const phase = 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI;
  return { phase, lit: (1 + Math.cos(inc)) / 2, waxing: phase < 0.5 };
}

/* The moon's phase as a word, by how much of it is lit. */
export function moonWord(phase, lang) {
  const tr = ["Yeni ay", "Hilal", "İlk dördün", "Şişkin ay", "Dolunay", "Şişkin ay",
              "Son dördün", "Hilal"];
  const en = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon",
              "Waning gibbous", "Last quarter", "Waning crescent"];
  const lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const waxing = phase < 0.5;
  const i = lit < 0.03 ? 0 : lit > 0.97 ? 4 : lit < 0.4 ? (waxing ? 1 : 7)
    : lit <= 0.6 ? (waxing ? 2 : 6) : (waxing ? 3 : 5);
  return (lang === "en" ? en : tr)[i];
}

/* How dark it is: 0 in daylight, 1 in full night, and in between through
   twilight, from the sun's height. */
export function darkness(altitude) {
  const x = Math.min(1, Math.max(0, (4 - altitude) / 12));
  return x * x * (3 - 2 * x);
}

/* The oil-rose gardens round Isparta through the year. The provincial
   agriculture directorate's guide to rose growing: mature gardens are pruned
   in March and April, and the harvest starts in mid-May and lasts five to six
   weeks. Between those the plant leafs in April and buds in early May; after
   the harvest it stays green through the summer, turns in autumn and stands
   bare from December. */
export function roseStage(date) {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  if (md < 301 || md >= 1201) return "bare";
  if (md < 410) return "pruned";
  if (md < 502) return "leafing";
  if (md < 515) return "buds";
  if (md <= 626) return "bloom";
  if (md < 916) return "green";
  if (md < 1111) return "turning";
  return "falling";
}

/* How far autumn has turned the rose leaves, from 0 in mid-September to 1 by
   the time they start to fall. */
export function autumnTurn(date) {
  const y = date.getFullYear();
  const from = new Date(y, 8, 16), to = new Date(y, 10, 11);
  return Math.min(1, Math.max(0, (date - from) / (to - from)));
}

/* The pines keep their needles all year. In April and May they put out the
   pale new shoots called candles. */
export const pineCandles = (date) => [4, 5].includes(date.getMonth() + 1);

/* Isparta's year as the map shows it. Davraz keeps snow on its summit from
   late November to April. */
export function seasonOf(date) {
  const m = date.getMonth() + 1, d = date.getDate();
  const md = m * 100 + d;
  return {
    roses: roseStage(date) === "bloom",
    snowyPeak: md >= 1120 || md <= 420,
    winter: m === 12 || m <= 2,
    autumn: m >= 10 && m <= 11,
    spring: m >= 3 && m <= 5,
  };
}

/* One colour between two, by t from 0 to 1. Both are #rrggbb. */
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

/* A palette between the day and night skins. Colours are mixed, numbers are
   mixed, and lists of colours are mixed item by item. */
export function mixSkin(day, night, t) {
  if (t <= 0) return day;
  if (t >= 1) return night;
  const out = {};
  for (const [k, v] of Object.entries(day)) {
    const w = night[k];
    if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) && typeof w === "string") {
      out[k] = mixHex(v, w, t);
    } else if (typeof v === "number" && typeof w === "number") {
      out[k] = v * (1 - t) + w * t;
    } else if (Array.isArray(v) && Array.isArray(w)) {
      out[k] = v.map((x, i) => mixHex(x, w[i] ?? x, t));
    } else {
      out[k] = t < 0.5 ? v : w;
    }
  }
  return out;
}

/* The sky's colours at the zenith and at the horizon for a sun this high,
   dimmed towards grey under cloud. */
export function skyColours(altitude, cloud = 0) {
  const stops = [
    [-18, "#08111D", "#121E30"],
    [-6, "#1B2A47", "#5A4E6B"],
    [-2, "#34507A", "#D9886A"],
    [3, "#6E9CC9", "#F2C48D"],
    [10, "#83B2DB", "#E3EEF2"],
    [40, "#76A8D6", "#DCEAF3"],
  ];
  let top = stops[0][1], bottom = stops[0][2];
  for (let i = 1; i < stops.length; i++) {
    const [a0, t0, b0] = stops[i - 1], [a1, t1, b1] = stops[i];
    if (altitude <= a0) break;
    const k = Math.min(1, (altitude - a0) / (a1 - a0));
    top = mixHex(t0, t1, k); bottom = mixHex(b0, b1, k);
  }
  const grey = Math.min(0.75, Math.max(0, (cloud - 30) / 100));
  return { top: mixHex(top, "#8E949A", grey * (altitude > -4 ? 1 : 0.3)),
           bottom: mixHex(bottom, "#A9AEB2", grey * (altitude > -4 ? 1 : 0.3)) };
}
