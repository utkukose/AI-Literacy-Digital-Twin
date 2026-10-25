/* One build, two outputs.
 *
 *   dist/app      the system people actually use: every screen behind one
 *                 navigation bar, served by the API container.
 *   dist/<screen> each screen on its own, for looking at a single piece in
 *                 isolation and for dropping into another host application.
 *
 * The single-file copies keep no relative imports, which is checked below: an
 * import that survives folding works in this build and breaks in that one. */

import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";

const UI = "ui";
const OUT = "dist";
const SCREENS = [
  { name: "student", entry: "StudentApp.jsx",
    shared: ["apiClient.js", "badgeArt.jsx", "avatarArt.jsx", "language.js", "theme.jsx", "credits.js",
             "links.js", "marks.js", "sampleCases.js"] },
  { name: "admin", entry: "AdminPanel.jsx",
    shared: ["avatarArt.jsx", "badgeArt.jsx", "language.js", "theme.jsx", "credits.js"] },
  { name: "editor", entry: "CaseEditor.jsx", shared: ["language.js", "theme.jsx", "credits.js"] },
  { name: "campus", entry: "CampusPlan.jsx",
    shared: ["campusGeometry.js", "language.js", "campusSky.js", "sha256.js", "credits.js"] },
  { name: "badge", entry: "Badge.jsx",
    shared: ["badgeArt.jsx", "language.js", "theme.jsx", "credits.js", "marks.js"] },
  { name: "board", entry: "Board.jsx",
    shared: ["apiClient.js", "badgeArt.jsx", "avatarArt.jsx", "language.js", "theme.jsx", "marks.js"] },
];

fs.mkdirSync(OUT, { recursive: true });

/* The two typefaces, served from the platform itself so that opening a page
   asks no other host for anything. Archivo carries its width and weight axes;
   Latin Extended holds ğ, ş and İ, and the browser fetches a file only when the
   page uses a character in its range. */
const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,"
  + "U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,"
  + "U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,"
  + "U+2113,U+2C60-2C7F,U+A720-A7FF";
const face = (family, file, weight, range, extra = "") =>
  `@font-face{font-family:'${family}';font-style:normal;font-display:swap;`
  + `font-weight:${weight};${extra}src:url(fonts/${file}) format('woff2');`
  + `unicode-range:${range}}`;
const FONT_FACES = [
  face("Archivo", "archivo-latin-wdth-normal.woff2", "100 900", LATIN, "font-stretch:62% 125%;"),
  face("Archivo", "archivo-latin-ext-wdth-normal.woff2", "100 900", LATIN_EXT,
       "font-stretch:62% 125%;"),
  face("IBM Plex Mono", "ibm-plex-mono-latin-400-normal.woff2", "400", LATIN),
  face("IBM Plex Mono", "ibm-plex-mono-latin-ext-400-normal.woff2", "400", LATIN_EXT),
  face("IBM Plex Mono", "ibm-plex-mono-latin-500-normal.woff2", "500", LATIN),
  face("IBM Plex Mono", "ibm-plex-mono-latin-ext-500-normal.woff2", "500", LATIN_EXT),
].join("");

function page(title) {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#F3F4EF">
<title>${title}</title>
<script>try{var p=localStorage.getItem("yazem.theme");if(p==="dark"||p==="light")document.documentElement.dataset.theme=p}catch(e){}</script>
<style>${FONT_FACES}*{box-sizing:border-box}html,body{margin:0;background:#F3F4EF}html[data-theme=dark],html[data-theme=dark] body{background:#121417}</style>
</head><body><div id="root"></div><script src="./bundle.js"></script></body></html>`;
}

/* The font files and their licence travel next to every page. */
function copyFonts(name) {
  const from = path.join(UI, "assets", "fonts");
  const to = path.join(OUT, name, "fonts");
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
}

/* The deployed system carries no case from the case bank. The sample cases the
   student screen falls back on without a server are swapped for an empty list
   in it, and only the single-file screens keep them. */
const NO_SAMPLE_CASES = {
  name: "no-sample-cases",
  setup(build) {
    build.onResolve({ filter: /\/sampleCases\.js$/ },
                    () => ({ path: path.resolve(UI, "sampleCases.none.js") }));
  },
};

async function bundle(name, entryFile, title, plugins = []) {
  const entry = path.join(OUT, `${name}.entry.jsx`);
  fs.writeFileSync(entry, `
import React from "react";
import { createRoot } from "react-dom/client";
import Screen from "${entryFile}";
createRoot(document.getElementById("root")).render(<Screen />);
`);
  await esbuild.build({
    entryPoints: [entry], bundle: true, jsx: "automatic", minify: true,
    outfile: path.join(OUT, name, "bundle.js"),
    define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning", plugins,
  });
  fs.writeFileSync(path.join(OUT, name, "index.html"), page(title));
  fs.unlinkSync(entry);
  return fs.statSync(path.join(OUT, name, "bundle.js")).size;
}

/* The badge's pictures travel next to every page that shows them. */
function copyArt(name) {
  const from = path.join(UI, "assets", "rozet");
  const to = path.join(OUT, name, "rozet");
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
}

/* The developers' portraits for the About page's team part. */
function copyTeam(name) {
  const from = path.join(UI, "assets", "team");
  const to = path.join(OUT, name, "team");
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    if (f.endsWith(".webp")) fs.copyFileSync(path.join(from, f), path.join(to, f));
  }
}

/* The user guide's pictures, one folder per language, made from the demo by
   tools/guide_shots.py. */
function copyGuide(name) {
  const from = path.join(UI, "assets", "rehber");
  if (!fs.existsSync(from)) return;
  for (const lang of fs.readdirSync(from)) {
    const dir = path.join(from, lang);
    if (!fs.statSync(dir).isDirectory()) continue;
    const to = path.join(OUT, name, "rehber", lang);
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".webp")) fs.copyFileSync(path.join(dir, f), path.join(to, f));
    }
  }
}

/* The avatars travel next to every page that shows them, with avatar/index.json
   listing the set. Until the pictures are added the list is empty and people
   are shown by their initials. */
function copyAvatars(name) {
  const from = path.join(UI, "assets", "avatar");
  const to = path.join(OUT, name, "avatar");
  fs.mkdirSync(to, { recursive: true });
  const codes = [];
  if (fs.existsSync(from)) {
    for (const f of fs.readdirSync(from).sort()) {
      const m = f.match(/^(av-\d{2,3})\.webp$/);
      if (!m) continue;
      fs.copyFileSync(path.join(from, f), path.join(to, f));
      codes.push(m[1]);
    }
  }
  fs.writeFileSync(path.join(to, "index.json"), JSON.stringify(codes));
}

/* The whole system. */
const appSize = await bundle("app", "../ui/App.jsx", "SDÜ Yapay Zeka Okuryazarlığı - Kampüs İkizi Platformu",
                            [NO_SAMPLE_CASES]);
/* A sentence of the first sample case must not be found in the deployed build. */
const sampleLine = fs.readFileSync(path.join(UI, "sampleCases.js"), "utf8")
  .match(/\ben: "([^"\\]{40,})"/)?.[1];
if (sampleLine && fs.readFileSync(path.join(OUT, "app", "bundle.js"), "utf8").includes(sampleLine)) {
  console.error("app: a sample case from the case bank is in the deployed build");
  process.exit(1);
}
copyArt("app");
copyAvatars("app");
copyTeam("app");
copyGuide("app");
copyFonts("app");
console.log(`  app        ${(appSize / 1024).toFixed(0)} KB   ← the deployed system`);

/* Each screen on its own, folded into a single file. */
for (const screen of SCREENS) {
  let source = fs.readFileSync(path.join(UI, screen.entry), "utf8");

  for (const file of screen.shared) {
    let part = fs.readFileSync(path.join(UI, file), "utf8");
    part = part.replace(/^export /gm, "");
    source = source.replace(/^import \{[^}]*\} from "\.\/[^"]+";\n/ms, "");
    const anchor = source.match(/^import React[^\n]*\n/m)[0];
    source = source.replace(anchor, anchor + "\n" + part + "\n");
  }

  if (/from "\.\//.test(source)) {
    console.error(`${screen.name}: a relative import survived folding`);
    process.exit(1);
  }

  const single = path.join(OUT, `${screen.name}.jsx`);
  fs.writeFileSync(single, source);
  const size = await bundle(screen.name, `./${screen.name}.jsx`, "YAZEM");
  if (screen.shared.includes("badgeArt.jsx")) copyArt(screen.name);
  if (screen.shared.includes("avatarArt.jsx")) copyAvatars(screen.name);
  copyFonts(screen.name);
  console.log(`  ${screen.name.padEnd(10)} ${(size / 1024).toFixed(0)} KB`);
}
