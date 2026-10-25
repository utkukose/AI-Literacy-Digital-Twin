/* Light and dark.

   Every screen draws its colours from these variables, so one attribute on the
   page, data-theme="dark", turns the whole system over. The shell decides it:
   Otomatik follows the sun over Isparta, as the campus map does, and Açık or
   Koyu holds it there. The choice stays in the browser.

   This file imports nothing, so a screen built as a single file can carry it. */

const THEME_LIGHT = {
  paper: "#F4F4F2", card: "#FFFFFF", soft: "#FAFAF8", fill: "#EFEFEC",
  line: "#DEDEDA", "line-strong": "#C9CAC6", faint: "#8E8F91", muted: "#6E6F71",
  "text-2": "#55575A", text: "#2B2B2B",
  accent: "#C00000", "accent-strong": "#9E0000", "on-accent": "#FFFFFF", brand: "#E10613",
  "accent-soft": "#FBEDEB", "accent-line": "#F0CFCB", petal: "#E8A9A2",
  warn: "#C08A3E", "warn-text": "#9A6416", "warn-soft": "#FCF7EE", "warn-line": "#E6CFA6",
  amber: "#D9A441",
  good: "#4E7C59", "good-text": "#3E6B4A", "good-soft": "#EEF4EF", "good-line": "#BFD5C4",
  strip: "#2B2B2B", "on-strip": "#FFFFFF", shadow: "rgba(0,0,0,.08)",
};

/* After dark the surfaces go down and the reds come up, so text keeps its
   contrast; a filled red button carries dark text instead of white. */
const THEME_DARK = {
  paper: "#121417", card: "#1A1D21", soft: "#20242A", fill: "#2A2F36",
  line: "#333940", "line-strong": "#4A5159", faint: "#8A9098", muted: "#A4AAB2",
  "text-2": "#C4C8CD", text: "#ECEAE6",
  accent: "#F0646A", "accent-strong": "#FF8A8F", "on-accent": "#1A0B0C", brand: "#FF4D57",
  "accent-soft": "#3A1E21", "accent-line": "#6B2C31", petal: "#B5575A",
  warn: "#E0A85A", "warn-text": "#F0C27A", "warn-soft": "#33291A", "warn-line": "#6B5530",
  amber: "#E8B54F",
  good: "#7FB38C", "good-text": "#9CCBA8", "good-soft": "#1E2B22", "good-line": "#3D5E46",
  strip: "#2A2F36", "on-strip": "#FFFFFF", shadow: "rgba(0,0,0,.4)",
};

const themeBlock = (vars) => Object.entries(vars).map(([k, v]) => `--${k}:${v};`).join("");

/* The centre's wordmark is black and red, so after dark it sits on a light
   plate and keeps its own colours. */
export const THEME_CSS = `:root{color-scheme:light;${themeBlock(THEME_LIGHT)}}`
  + `:root[data-theme="dark"]{color-scheme:dark;${themeBlock(THEME_DARK)}}`
  + `:root[data-theme="dark"] img[alt="SDÜ AIARC"]{background:#F4F4F2;border-radius:6px;`
  + `padding:3px 6px;box-sizing:content-box}`;

export const THEME_PREFS = ["auto", "light", "dark"];

const THEME_WORDS = {
  tr: { label: "Görünüm", auto: "Otomatik", light: "Açık", dark: "Koyu",
        autoHelp: "Otomatik: Isparta'da gün batınca koyu, gün doğunca açık görünüm." },
  en: { label: "Appearance", auto: "Auto", light: "Light", dark: "Dark",
        autoHelp: "Auto: dark after sunset in Isparta, light after sunrise." },
};

function ThemeGlyph({ kind }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6,
                   strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      {kind === "light" && (
        <g {...common}>
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
        </g>
      )}
      {kind === "dark" && (
        <path {...common} d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6Z" />
      )}
      {kind === "auto" && (
        <g {...common}>
          <circle cx="8" cy="8" r="5.6" />
          <path d="M8 2.4v11.2A5.6 5.6 0 0 0 8 2.4Z" fill="currentColor" stroke="none" />
        </g>
      )}
    </svg>
  );
}

/* Three small buttons: Otomatik, Açık, Koyu. */
export function ThemeSwitch({ pref, onPref, lang = "tr", className }) {
  const w = THEME_WORDS[lang] ?? THEME_WORDS.tr;
  return (
    <div role="group" aria-label={w.label} className={className} data-panel="theme"
      style={{ display: "flex", border: "1px solid var(--line)", borderRadius: 7,
               overflow: "hidden", background: "var(--card)", flexShrink: 0 }}>
      {THEME_PREFS.map((k) => (
        <button key={k} type="button" onClick={() => onPref(k)} aria-pressed={pref === k}
          data-theme-pref={k} title={k === "auto" ? w.autoHelp : w[k]} aria-label={w[k]}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
                   width: 34, minHeight: 34, padding: 0, border: "none", cursor: "pointer",
                   background: pref === k ? "var(--fill)" : "none",
                   color: pref === k ? "var(--text)" : "var(--muted)" }}>
          <ThemeGlyph kind={k} />
        </button>
      ))}
    </div>
  );
}
