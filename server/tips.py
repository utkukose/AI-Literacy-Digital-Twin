"""Short strategy tips, shown before a step the twin expects a person to miss.

A tip says how to approach a kind of step, never what the answer is, so the
same tip fits every case of that kind. Where an area needs something more
specific than the kind, the area's tip is used.
"""

from __future__ import annotations

TIPS = {
    "tr": {
        "span_select": {
            "*": "Metni cümle cümle oku ve sorunlu ifadeyi ara. Metnin "
                 "tamamını işaretlemek puanını düşürür.",
            "privacy": "Kimliği ele veren her şeyi düşün: Ad, numara, tarih, kurum "
                       "ve bunların bir araya gelmesi.",
            "manipulation": "Seni acele ettiren, sorgulamanı engelleyen ya da "
                            "duygularına seslenen ifadeleri ara.",
            "verification": "Kesin bir bulguyu belirli bir kaynağa bağlayan "
                            "ifadelere dikkat et.",
            "op_security": "Senden bir şey isteyen ifadelere bak: Parola, kod, "
                           "bağlantı, izin.",
            "boundaries": "Bir aracın bilemeyeceği ya da karar veremeyeceği şeyi "
                          "kesinmiş gibi sunan ifadeleri ara.",
        },
        "source_verify": {
            "*": "Her ifadeyi ayrı değerlendir. Tanıdık görünmesi doğru olduğunu "
                 "göstermez, kaynağına bak.",
            "verification": "Bir künyede yazar, başlık, dergi, cilt ve DOI aynı "
                            "kayda götürmeli. Biri bile tutmuyorsa künyeye güvenme.",
        },
        "reasoned_choice": {
            "*": "Önce gerekçeleri oku. Hangisi kararın asıl nedenini söylüyor, "
                 "hangisi yalnızca doğruymuş gibi görünüyor?",
        },
        "pattern_check": {
            "*": "Önce soruyu cevaplamak için gerekeni yaz, sonra gereksiz olan ya da "
                 "birinin kimliğini ele veren her şeyi çıkar.",
        },
        "branching": {
            "*": "Önce geri dönüşü olmayan kararları düşün. Bu tür adımlarda puanı çoğu "
                 "zaman verdiğin en kötü karar belirler.",
        },
    },
    "en": {
        "span_select": {
            "*": "Read sentence by sentence and look for the phrase that carries "
                 "the problem. Marking the whole text lowers your score.",
            "privacy": "Think of everything that identifies someone: a name, a "
                       "number, a date, an institution, and these combined.",
            "manipulation": "Look for phrases that rush you, stop you from "
                            "checking, or play on your feelings.",
            "verification": "Watch for phrases that tie a definite finding to a "
                            "specific source.",
            "op_security": "Look at what is being asked of you: a password, a "
                           "code, a link, a permission.",
            "boundaries": "Look for phrases that present something a tool cannot "
                          "know or decide as certain.",
        },
        "source_verify": {
            "*": "Judge each statement on its own. Looking familiar does not make "
                 "it right; check its source.",
            "verification": "Author, title, journal, volume and DOI must all lead "
                            "to the same record. One mismatch is enough.",
        },
        "reasoned_choice": {
            "*": "Read the reasons first. Which one states the real ground for "
                 "the decision, and which only sounds right?",
        },
        "pattern_check": {
            "*": "First write what the question needs, then remove anything "
                 "unnecessary or anything that identifies someone.",
        },
        "branching": {
            "*": "Think first about the decisions that cannot be undone. In decisions like "
                 "this the worst decision often sets the score.",
        },
    },
}


def tip(locale: str, kind: str, dimension: str) -> str | None:
    by_kind = TIPS.get(locale, TIPS["tr"]).get(kind)
    if not by_kind:
        return None
    return by_kind.get(dimension) or by_kind.get("*")
