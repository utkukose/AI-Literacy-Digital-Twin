/* Avatars. A person picks one from a fixed set of pictures (av-01, av-02, …)
   kept next to the page in avatar/, with avatar/index.json listing the set.
   Without a picture, or before the set has been added, a person is shown by
   their initials on a colour that follows from the name, so the same person
   always looks the same. A page that has to stand on its own can set
   window.__YAZEM_AVATARS__ to carry the pictures inline. */

const AVATAR_TONES = ["#A6192E", "#4E7C59", "#9A6416", "#3E5C76",
                      "#6B4C7A", "#2E6F6B", "#A4502F", "#4A4A48"];

/* What each picture shows, in Turkish and English: the picker reads it out. */
const AVATAR_NAMES = {
  "av-01": ["Robot", "Robot"], "av-02": ["Robot baykuş", "Robot owl"],
  "av-03": ["Robot kedi", "Robot cat"], "av-04": ["Ejderha", "Dragon"],
  "av-05": ["Anka kuşu", "Phoenix"], "av-06": ["Grifon", "Griffin"],
  "av-07": ["Pegasus", "Pegasus"], "av-08": ["Tek boynuzlu at", "Unicorn"],
  "av-09": ["Bukalemun", "Chameleon"], "av-10": ["Tilki", "Fox"],
  "av-11": ["Kurt", "Wolf"], "av-12": ["Ayı", "Bear"],
  "av-13": ["Vaşak", "Lynx"], "av-14": ["Geyik", "Deer"],
  "av-15": ["Kirpi", "Hedgehog"], "av-16": ["Sincap", "Squirrel"],
  "av-17": ["Porsuk", "Badger"], "av-18": ["Rakun", "Raccoon"],
  "av-19": ["Kartal", "Eagle"], "av-20": ["Doğan", "Falcon"],
  "av-21": ["Baykuş", "Owl"], "av-22": ["Leylek", "Stork"],
  "av-23": ["Turna", "Crane"], "av-24": ["Papağan", "Macaw"],
  "av-25": ["Kırlangıç", "Swallow"], "av-26": ["Martı", "Gull"],
  "av-27": ["Tukan", "Toucan"], "av-28": ["Yunus", "Dolphin"],
  "av-29": ["Deniz kaplumbağası", "Sea turtle"], "av-30": ["Ahtapot", "Octopus"],
  "av-31": ["Su samuru", "Otter"], "av-32": ["Fok", "Seal"],
  "av-33": ["Köpek balığı", "Shark"], "av-34": ["Yengeç", "Crab"],
  "av-35": ["Aksolotl", "Axolotl"], "av-36": ["Flamingo", "Flamingo"],
  "av-37": ["Aslan", "Lion"], "av-38": ["Kaplan", "Tiger"],
  "av-39": ["Çita", "Cheetah"], "av-40": ["Panter", "Panther"],
  "av-41": ["Gergedan", "Rhinoceros"], "av-42": ["Fil", "Elephant"],
  "av-43": ["Zürafa", "Giraffe"], "av-44": ["Zebra", "Zebra"],
  "av-45": ["Goril", "Gorilla"], "av-46": ["Kedi", "Cat"],
  "av-47": ["Kangal", "Kangal dog"], "av-48": ["Tavşan", "Rabbit"],
  "av-49": ["Kızıl panda", "Red panda"], "av-50": ["Koala", "Koala"],
  "av-51": ["Penguen", "Penguin"], "av-52": ["Arı", "Bee"],
  "av-53": ["Dağ keçisi", "Wild goat"], "av-54": ["At", "Horse"],
};

export function avatarName(code, lang = "tr") {
  const names = AVATAR_NAMES[code];
  return names ? names[lang === "en" ? 1 : 0] : code;
}

function avatarBase() {
  if (typeof document === "undefined") return "";
  const tag = document.querySelector("base[href]");
  const from = tag ? tag.getAttribute("href") : window.location.pathname;
  return from.endsWith("/") ? from : from.replace(/[^/]*$/, "");
}

export function avatarSrc(code) {
  if (!code || !/^av-\d{2,3}$/.test(code)) return null;
  const inline = typeof window !== "undefined" ? window.__YAZEM_AVATARS__ : null;
  if (inline) return inline[code] ?? null;
  return `${avatarBase()}avatar/${code}.webp`;
}

/* Two letters: the first of the first word and the first of the last, or the
   first two of a single word. A username's dots and dashes separate words. */
export function initialsOf(label) {
  const parts = String(label || "").replace(/[._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = [...parts[0]][0] ?? "";
  const second = parts.length > 1 ? [...parts[parts.length - 1]][0] : ([...parts[0]][1] ?? "");
  return (first + second).toLocaleUpperCase("tr");
}

function toneOf(label) {
  let h = 7;
  for (const c of String(label || "")) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/* The picture over the initials: if the picture cannot be loaded it is hidden
   and the initials show through. */
export function Avatar({ code, label, size = 36, style }) {
  const src = avatarSrc(code);
  return (
    <span data-avatar={src ? code : "initials"} aria-hidden="true"
      style={{ position: "relative", display: "inline-flex", alignItems: "center",
               justifyContent: "center", width: size, height: size, flexShrink: 0,
               borderRadius: "50%", overflow: "hidden", background: toneOf(label),
               color: "#fff", fontWeight: 700, fontSize: Math.max(10, Math.round(size * 0.38)),
               letterSpacing: "-.02em", lineHeight: 1, userSelect: "none", ...style }}>
      {initialsOf(label)}
      {src && (
        <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                   objectFit: "cover", background: "#F4F4F2" }} />
      )}
    </span>
  );
}

/* The set on offer, read from avatar/index.json. Empty when the set has not
   been added, in which case the picker is not shown. */
export async function avatarList() {
  const inline = typeof window !== "undefined" ? window.__YAZEM_AVATARS__ : null;
  if (inline) return Object.keys(inline).sort();
  try {
    const res = await fetch(`${avatarBase()}avatar/index.json`, { cache: "no-cache" });
    if (!res.ok) return [];
    const list = await res.json();
    return Array.isArray(list) ? list.filter((c) => /^av-\d{2,3}$/.test(c)) : [];
  } catch {
    return [];
  }
}
