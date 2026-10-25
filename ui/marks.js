/* The rare marks that come with the platform, in the words migration 022
   gives them, and the groups marks and medals sit in. The screens read both
   from the server; these stand in when there is none, as in a screen opened
   on its own, and name a mark on a ranking row before the list arrives. */

export const PLATFORM_MARKS = [
  { code: "blind_spot", tr: "Kör Nokta", en: "Blind Spot",
    trWhat: "Bir zamanlar en zayıf alanın olan bir alanı Temel seviyeye çıkarmak.",
    enWhat: "Bring an area that was once your weakest up to the Basic level." },
  { code: "even_hand", tr: "Denge", en: "Even Hand",
    trWhat: "Yedi alanın hepsinde aynı anda iyi durumda olmak ve hiçbir alanı ötekilerin çok gerisinde bırakmamak.",
    enWhat: "Be good in all seven areas at once, leaving no area far behind the others." },
  { code: "honest_doubt", tr: "Dürüst Tereddüt", en: "Honest Doubt",
    trWhat: "Yanıldığın on adımda bunu önceden sezip düşük bir güven (%50 ya da %60) seçmek. Bilmediğini bilmenin karşılığıdır.",
    enWhat: "On ten steps you got wrong, sense it beforehand and choose a low confidence (50% or 60%). It rewards knowing what you do not know." },
  { code: "first_sight", tr: "İlk Bakışta", en: "First Sight",
    trWhat: "Üç ayrı vakada bütün adımları doğru cevaplamak ve güven sorulan her adımda %90 güven seçmek.",
    enWhat: "In three different cases, answer every step right, choosing 90% confidence wherever confidence is asked." },
  { code: "unshaken", tr: "Sarsılmaz", en: "Unshaken",
    trWhat: "On ayrı vakada, birbirini izleyen kararlardan oluşan adımlarda her kararı en doğru yoldan vermek.",
    enWhat: "In ten different cases, take the best path at every decision of the steps made of successive decisions." },
  { code: "held_line", tr: "İstikrar", en: "Held Line",
    trWhat: "Altı ay art arda, her ay güven sorulan en az beş adımda seçtiğin güveni isabetinle uyumlu tutmak.",
    enWhat: "For six months in a row, keep the confidence you choose in line with your accuracy, on at least five steps a month that ask for it." },
];

export const AWARD_GROUPS = [
  { code: "marks", tr: "Nadir işaretler", en: "Rare marks" },
  { code: "super", tr: "Süper Madalyalar", en: "Super Medals" },
  { code: "mega", tr: "Mega Madalyalar", en: "Mega Medals" },
  { code: "ultra", tr: "Ultra Madalyalar", en: "Ultra Medals" },
];

/* A platform mark as the server lists it, in one language. */
export function platformMark(m, lang) {
  const en = lang === "en";
  return { code: m.code, category: "marks", name: en ? m.en : m.tr,
           what: en ? m.enWhat : m.trWhat, built_in: true, active: true, manual: false,
           image: null };
}
