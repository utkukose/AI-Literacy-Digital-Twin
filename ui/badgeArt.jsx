/* The badge's pictures: a crest for each level, an emblem for each area, a
   medallion for each rare mark that comes with the platform, and a picture in
   each group's colours for the marks and medals administrators add without
   one. The files sit next to the page in rozet/, and a page that has to stand
   on its own sets window.__YAZEM_ART__ to carry them inline. */

const ART_FILE = {
  level: { 1: "seviye-1", 2: "seviye-2", 3: "seviye-3", 4: "seviye-4", 5: "seviye-5" },
  dim: {
    verification: "alan-dogrulama", privacy: "alan-mahremiyet", prompt_design: "alan-istem",
    integrity: "alan-atif", manipulation: "alan-manipulasyon", op_security: "alan-guvenlik",
    boundaries: "alan-sinirlar",
  },
  mark: {
    blind_spot: "isaret-kor-nokta", even_hand: "isaret-denge", honest_doubt: "isaret-durust-tereddut",
    first_sight: "isaret-ilk-bakista", unshaken: "isaret-sarsilmaz", held_line: "isaret-tutulan-cizgi",
    custom: "isaret-ozel",
  },
  medal: { super: "madalya-super", mega: "madalya-mega", ultra: "madalya-ultra" },
};

/* The directory the page was served from, as the API client reads it, so the
   pictures resolve behind a path as well as at the root of a host. */
function artBase() {
  if (typeof document === "undefined") return "";
  const tag = document.querySelector("base[href]");
  const from = tag ? tag.getAttribute("href") : window.location.pathname;
  const dir = from.endsWith("/") ? from : from.replace(/[^/]*$/, "");
  return dir;
}

export function artSrc(kind, key) {
  const name = ART_FILE[kind]?.[key];
  if (!name) return null;
  const inline = typeof window !== "undefined" ? window.__YAZEM_ART__ : null;
  return inline?.[name] ?? `${artBase()}rozet/${name}.webp`;
}

/* Where a mark or a medal is drawn from: the platform's own art for the six
   rare marks it comes with, the picture an administrator uploaded, otherwise
   the picture of its group. Someone who has not signed in reads uploaded
   pictures from the public address. */
export function awardSrc(award, visitor = false) {
  if (!award) return null;
  if (award.built_in) return artSrc("mark", award.code);
  if (award.image) {
    return `${artBase()}api${visitor ? "/public" : ""}/awards/${encodeURIComponent(award.code)}`
      + `/image?v=${encodeURIComponent(award.image)}`;
  }
  return award.category === "marks" ? artSrc("mark", "custom") : artSrc("medal", award.category);
}

/* One picture. A locked one is shown in grey: the person can see what there
   is to earn without it looking earned. */
function Picture({ src, size, locked, alt, style, tag }) {
  return (
    <img src={src} width={size} height={size} alt={alt} loading="lazy" decoding="async"
      data-art={tag} data-locked={locked ? "1" : undefined}
      style={{ display: "block", width: size, height: size, flexShrink: 0, objectFit: "contain",
               filter: locked ? "grayscale(1) contrast(.85) brightness(1.08)" : "none",
               opacity: locked ? 0.42 : 1, ...style }} />
  );
}

export function ArtImage({ kind, k, size = 64, locked = false, alt = "", style }) {
  const src = artSrc(kind, k);
  if (!src) return null;
  return <Picture src={src} size={size} locked={locked} alt={alt} style={style}
    tag={`${kind}-${k}`} />;
}

export function AwardImage({ award, size = 48, locked = false, alt = "", visitor = false,
                             style }) {
  const src = awardSrc(award, visitor);
  if (!src) return null;
  return <Picture src={src} size={size} locked={locked} alt={alt} style={style}
    tag={`award-${award.code}`} />;
}
