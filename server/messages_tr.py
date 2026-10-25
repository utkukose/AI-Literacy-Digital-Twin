"""Turkish wording for the case checks, for the people using the editor and the
panel.

validate_case.py and case_check.py report in English, which suits the
repository's own tools and their logs. A person correcting a case in the
editor or reading an import report in Turkish reads Turkish, so the server
passes every finding through `tr` before showing it. A finding with no rule
here is shown as it is, which is better than hiding it;
tests/messages_tr_test.py checks that every message the checks can produce has
a rule. Somebody using the English interface reads the checks' own words,
tidied into sentences by `en`.
"""

from __future__ import annotations

import re

FEEDBACK = {"correct": "Doğru cevaba dönüt", "incorrect": "Yanlış cevaba dönüt",
            "partial": "Kısmen doğru cevaba dönüt"}
DEBRIEF = {"summary": "Çözüm notunun özeti boş.",
           "takeaway": "Çözüm notunda akılda kalacak kural boş."}
GROUP = {"forbidden": "Kalmamalı", "required": "Kalmalı"}
LANGUAGE = {"Turkish": "Türkçe", "English": "İngilizce"}

# The parts of a case a finding can point to, as the editor names them.
PLACES = {"title": "başlık", "context": "bağlam", "variants": "varyantlar",
          "place": "vakanın geçtiği yer", "solution note": "çözüm notu"}


def places(text: str) -> str:
    """A list of parts of a case ("context, step 2, variants") in Turkish."""
    out = []
    for part in text.split(", "):
        step = re.fullmatch(r"step (\d+)", part)
        out.append(f"{step[1]}. adım" if step else PLACES.get(part, part))
    return ", ".join(out)


def _variant(i: str) -> str:
    return f"{int(i) + 1}. varyantın" if i.isdigit() else f"{i} varyantının"


# Each rule is a pattern for one English message and the Turkish sentence it
# becomes. A step is named by its id (st1, st2...), as in the editor.
RULES: list[tuple[str, object]] = [
    # the case as a whole
    (r"missing top-level field: (.+)", "Vakada {0} alanı eksik."),
    (r"schema_version must be (.+)", "Şema sürümü (schema_version) {0} olmalı."),
    (r"title must be a non-empty text", "Vakanın başlığı boş olamaz ve düz metin olmalı."),
    (r"id must be a text", "Vakanın kimliği düz metin olmalı."),
    (r"a value of the wrong type in (\S+)", lambda m: unreadable(m[1])),
    (r"filename must end in (.+)", "Dosya adı .tr.yaml ya da .en.yaml ile bitmeli."),
    (r"language '(.*)' does not match filename locale '(.*)'",
     "Vakanın dili ({0}) dosya adındaki dille ({1}) aynı değil."),
    (r"id '(.*)' does not match filename stem '(.*)'",
     "Vakanın kimliği ({0}) dosya adıyla ({1}) aynı değil."),
    (r"type must be one of (.+): '(.*)'", "Vaka türü geçersiz: '{1}'."),
    (r"core id must match core-NN-slug: '(.*)'",
     "Temel vakanın kimliği core-NN-ad biçiminde olmalı: '{0}'."),
    (r"id must start with a lowercase letter or a digit and use only letters, digits and"
     r" hyphens, 5-61 characters: '(.*)'",
     "Kimlik küçük harf ya da rakamla başlamalı, yalnızca harf, rakam ve tire içermeli ve 5 ile 61"
     " karakter arasında olmalı: '{0}'."),
    (r"invalid status: '(.*)'", "Geçersiz durum: '{0}'."),
    (r"audience must be a non-empty list drawn from (.+)",
     "Hedef kitle boş olamaz ve yalnızca student, academic ve admin_staff değerlerini alabilir."),
    (r"weekly cases require publish_at and close_at",
     "Haftalık vakada açılış (publish_at) ve kapanış (close_at) tarihleri gerekli."),
    (r"publish_at must precede close_at", "Açılış tarihi kapanış tarihinden önce olmalı."),
    (r"estimated_minutes is (.+); target is 12-15",
     "Tahmini süre {0} dakika. Hedef 12 ile 15 dakika arası."),
    (r"place must be a building number on the campus map \((\S+)-(\S+)\) or one of (.+): '(.*)'",
     "Vakanın yeri (place), kampüs haritasındaki bir bina numarası ({0}-{1}) ya da şunlardan "
     "biri olmalı: {2}. Yazılan: '{3}'."),
    (r"status is 'live' but reviewed_by is empty", "Durum 'live' ama reviewed_by boş."),
    (r"reviewed_by must differ from author", "İnceleyen kişi yazardan farklı olmalı."),
    (r"YAML parse error: (.+)", "YAML okunamadı: {0}"),
    (r"top level must be a mapping", "Dosyanın en üst düzeyi bir vaka nesnesi olmalı."),
    (r"structure differs from (\S+) at: (.+)",
     "Bu dilin dosyası {0} dosyasıyla aynı yapıda değil: {1}."),
    (r"case has no steps", "Vakada adım yok."),
    (r"step without id", "Kimliği olmayan bir adım var."),
    (r"duplicate step id: (.+)", "Adım kimliği yinelenmiş: {0}."),
    (r"context is longer than (.+) characters", "Bağlam {0} karakterden uzun."),

    # variants
    (r"variants must be a non-empty list", "En az bir varyant gerekli."),
    (r"weekly cases need at least 3 variants, found (.+)",
     "Haftalık vakada en az üç varyant gerekli, şu an {0} tane var."),
    (r"variant #(.+) has no key", lambda m: f"{_variant(m[1])} anahtarı yok."),
    (r"duplicate variant key: (.+)", "Varyant anahtarı yinelenmiş: {0}."),
    (r"all variants must define the same value keys", "Her varyant aynı alanları tanımlamalı."),
    (r"placeholder \{\{(.+)\}\} is not defined in variants",
     lambda m: f"{{{{{m[1]}}}}} varyantlarda tanımlı değil."),
    (r"variant value '(.*)' is never used", "'{0}' varyant alanı metinde hiç kullanılmıyor."),

    # steps, any kind
    (r"step (\S+): payload contains an answer marker \('(.*)'\); the client must not receive it",
     "{0}: Kullanıcıya giden metinde cevabı ele veren bir işaret var: '{1}'."),
    (r"step (\S+): missing field '(.*)'", "{0}: {1} alanı eksik."),
    (r"step (\S+): unknown dimension '(.*)'", "{0}: Bilinmeyen yetkinlik alanı: '{1}'."),
    (r"step (\S+): unknown kind '(.*)'", "{0}: Bilinmeyen adım türü: '{1}'."),
    (r"step (\S+): points must be an integer in 1\.\.10",
     "{0}: Puan 1 ile 10 arasında bir tam sayı olmalı."),
    (r"step (\S+): feedback\.(\S+) is empty",
     lambda m: f"{m[1]}: {FEEDBACK.get(m[2], 'Dönüt (' + m[2] + ')')} boş."),
    (r"(\S+): prompt is longer than (.+) characters", "{0}: Yönerge {1} karakterden uzun."),

    # span_select
    (r"step (\S+): unbalanced \[\[ \]\] markers \((.+) vs (.+)\)",
     "{0}: [[ ]] işaretleri eşleşmiyor: {1} açılış, {2} kapanış."),
    (r"step (\S+): span_select has no \[\[\.\.\.\]\] targets",
     "{0}: İşaretlenecek yer yok. Doğru cevabı [[ ]] arasına al."),
    (r"step (\S+): (.+) targets exceeds max_selections (.+)",
     "{0}: {1} hedef var ama en çok {2} yer seçilebiliyor."),
    (r"step (\S+): min_selections (.+) exceeds target count (.+)",
     "{0}: En az {1} seçim isteniyor ama yalnızca {2} hedef var."),
    (r"(\S+)/(\S+): passage longer than (.+)",
     "{0}, {1} varyantı: Metin {2} karakterden uzun."),

    # source_verify
    (r"step (\S+): source_verify has no items", "{0}: Künye yok."),
    (r"step (\S+): no truth entry for (.+)", "{0}: Cevap anahtarında şu künyeler yok: {1}."),
    (r"step (\S+): truth entry for unknown items (.+)",
     "{0}: Cevap anahtarında adımda olmayan künyeler var: {1}."),
    (r"step (\S+): truth\.(\S+) missing 'exists'",
     "{0}: {1} künyesinin gerçek mi uydurma mı olduğu yazılmamış."),
    (r"step (\S+): truth\.(\S+) missing 'evidence'", "{0}: {1} künyesinin açıklaması yok."),
    (r"step (\S+): all items share the same truth value",
     "{0}: Künyelerin hepsi gerçek ya da hepsi uydurma. Böyle olunca her künyeye aynı cevabı veren tam puan alır."),
    (r"(\S+)/(\S+): item (\S+) longer than (.+)",
     "{0}, {1} varyantı: {2} künyesi {3} karakterden uzun."),

    # pattern_check
    (r"step (\S+): pattern_check needs forbidden or required constraints",
     "{0}: En az bir kural gerekli."),
    (r"step (\S+): (\S+) constraint without pattern",
     lambda m: f"{m[1]}: {GROUP.get(m[2], m[2])} listesinde kalıbı olmayan bir kural var."),
    (r"step (\S+): invalid regex '(.*)': (.+)", "{0}: Kalıp okunamadı: '{1}' ({2})."),
    (r"step (\S+): regex '(.*)' repeats a repetition or an alternation and can take very long"
     r" on some answers",
     "{0}: '{1}' kalıbında iç içe tekrar ya da tekrarlanan seçenekli bir grup var. Bazı "
     "cevaplarda denetim çok uzun sürebilir, kalıbı sadeleştir."),
    (r"step (\S+): constraint '(.*)' has no label", "{0}: '{1}' kuralının etiketi yok."),
    (r"(\S+): no model answer, so the rules cannot be checked",
     "{0}: Örnek cevap (answer.model_answer) yok, bu yüzden kurallar sınanamıyor."),

    # reasoned_choice
    (r"step (\S+): needs at least 2 options", "{0}: En az iki seçenek gerekli."),
    (r"step (\S+): correct_option not among options",
     "{0}: Doğru seçenek, seçeneklerin arasında yok."),
    (r"step (\S+): reason_weights must cover exactly the listed reasons",
     "{0}: Gerekçe ağırlıkları listelenen gerekçelerle birebir eşleşmeli."),
    (r"step (\S+): no reason carries full weight",
     "{0}: Ağırlığı 1,0 olan bir gerekçe yok."),
    (r"step (\S+): option_weight must be in \[0, 1\]",
     "{0}: Seçenek ağırlığı (option_weight) 0 ile 1 arasında olmalı."),
    (r"(\S+)/(\S+): option (\S+) longer than (.+)",
     "{0}, {1} varyantı: {2} seçeneği {3} karakterden uzun."),

    # branching
    (r"step (\S+): start node '(.*)' not defined", "{0}: Başlangıç düğümü '{1}' tanımlı değil."),
    (r"step (\S+): terminal node '(.*)' has options",
     "{0}: '{1}' bitiş düğümünde seçenek olmamalı."),
    (r"step (\S+): non-terminal node '(.*)' has no options", "{0}: '{1}' düğümünde seçenek yok."),
    (r"step (\S+): option '(.*)' points to unknown node '(.*)'",
     "{0}: '{1}' seçeneği tanımsız bir düğüme gidiyor: '{2}'."),
    (r"step (\S+): option '(.*)' outcome must be in \[0, 1\]",
     "{0}: '{1}' seçeneğinin sonuç değeri 0 ile 1 arasında olmalı."),
    (r"step (\S+): node '(.*)' is unreachable", "{0}: '{1}' düğümüne hiçbir yoldan ulaşılmıyor."),
    (r"step (\S+): no terminal node is reachable", "{0}: Ulaşılabilen bir bitiş düğümü yok."),
    (r"step (\S+): more than (\S+) nodes", "{0}: Karar ağacında en çok {1} düğüm olabilir."),
    (r"step (\S+): a node offers more than (\S+) options",
     "{0}: Bir düğümde en çok {1} seçenek olabilir."),
    (r"step (\S+): the decision tree loops back on itself",
     "{0}: Karar ağacındaki bir yol daha önce geçtiği bir düğüme geri dönüyor."),
    (r"step (\S+): more than (\S+) ways through the tree",
     "{0}: Karar ağacında baştan sona en çok {1} farklı yol olabilir."),
    (r"step (\S+): scoring must be path_mean or path_min",
     "{0}: Puanlama path_mean ya da path_min olmalı."),
    (r"step (\S+): a branching step does not ask for confidence.*",
     "{0}: Dallanan adımda güven düzeyi sorulmaz, confidence false olmalı."),
    (r"(\S+): node (\S+) longer than (.+)", "{0}: {1} düğümünün metni {2} karakterden uzun."),

    # the solution note
    (r"debrief\.per_step missing entry for step '(.*)'",
     "Çözüm notunda {0} adımı için açıklama yok."),
    (r"debrief\.per_step has entry for unknown step '(.*)'",
     "Çözüm notunda vakada olmayan bir adım için açıklama var: {0}."),
    (r"debrief\.(\S+) is empty",
     lambda m: DEBRIEF.get(m[1], f"Çözüm notunda {m[1]} boş.")),
    (r"debrief source has no resolvable link: (.*)",
     "Bu kaynakta açılabilir bir bağlantı yok: {0}"),

    # answering every variant once
    (r"(\S+): unknown kind (.+)", "{0}: Bilinmeyen adım türü: {1}."),
    (r"(\S+)/(\S+): the best answer scores (.+), not 1\.0",
     lambda m: f"{m[1]}, {m[2]} varyantı: En iyi cevap 1,0 yerine "
               f"{m[3].replace('.', ',')} puan alıyor."),
    (r"(\S+)/(\S+): a poor answer scores as well as the best one",
     "{0}, {1} varyantı: Kötü bir cevap da en iyi cevap kadar puan alıyor."),
    (r"the case could not be answered: (.+)", "Vaka otomatik olarak çözülemedi: {0}"),

    # a new version of a live case, and a draft's language
    (r"the case id cannot change: (.*)", "Vakanın kimliği değiştirilemez: {0}"),
    (r"the steps of a live case must keep their order and kind: (.*)",
     "Yayındaki vakanın adımları aynı sırayla ve aynı türde kalmalı: {0}"),
    (r"variant keys cannot change: (.*)", "Varyant anahtarları değiştirilemez: {0}"),
    (r"language '(.*)' does not match the draft's language '(.*)'",
     "Vakanın dili ({0}) taslağın diliyle ({1}) aynı değil."),

    # a version of a case in another language
    (r"structure differs from the (\S+) version at: (.+)",
     lambda m: f"Bu sürüm, vakanın {LANGUAGE.get(m[1], m[1])} sürümüyle aynı yapıda değil:"
               f" {places(m[2])}."),
    (r"(\S+) texts are the same as in the (\S+) version, in: (.+)",
     lambda m: f"{m[1]} metin {LANGUAGE.get(m[2], m[2])} sürümdekiyle aynı, çevrilmemiş"
               f" olabilir: {places(m[3])}."),
]

_COMPILED = [(re.compile(f"^{pattern}$", re.S), out) for pattern, out in RULES]


def tr(message: str) -> str:
    """The Turkish sentence for one finding, or the finding itself."""
    for pattern, out in _COMPILED:
        m = pattern.match(message)
        if m:
            return out(m) if callable(out) else out.format(*m.groups())
    return message


def known(message: str) -> bool:
    return any(p.match(message) for p, _ in _COMPILED)


_STEP_PREFIX = re.compile(r"^(\S+?)(?:, (\S+) varyantı)?: (.+)$", re.S)

# How the checks name a step in English: "step st1: ...", "st1/B: ..." for one
# variant of it, or "st1: ...".
_EN_PREFIXES = (re.compile(r"^step (\S+): (.+)$", re.S),
                re.compile(r"^(\S+?)/(\S+): (.+)$", re.S),
                re.compile(r"^(\S+): (.+)$", re.S))


def _sentence(text: str) -> str:
    """A finding as a sentence. One that opens with a field name keeps it as
    it is written in the case."""
    text = text.strip()
    first = text.split(" ", 1)[0]
    if not any(ch in first for ch in "_.{'#"):
        text = text[:1].upper() + text[1:]
    return text if text.endswith((".", "?", "!")) else text + "."


def en(message: str, step_ids: list[str]) -> tuple[str, str]:
    """Where an English finding is, and the finding as a sentence."""
    for pattern in _EN_PREFIXES:
        m = pattern.match(message)
        if m and m[1] in step_ids:
            where = f"Step {step_ids.index(m[1]) + 1}"
            if m.lastindex == 3:
                where += f", variant {m[2]}"
            return where, _sentence(m[m.lastindex])
    return "Case", _sentence(message)


def finding(message: str, step_ids: list[str], level: str = "error") -> dict:
    """One finding as the editor lists it: where in the case, then what, in
    Turkish and in English.

    A finding about a step names the step by its place in the case, the way
    the editor numbers them, rather than by its id.
    """
    where_en, msg_en = en(message, step_ids)
    text = tr(message)
    m = _STEP_PREFIX.match(text)
    if m and m[1] in step_ids:
        where = f"Adım {step_ids.index(m[1]) + 1}"
        if m[2]:
            where += f", {m[2]} varyantı"
        return {"level": level, "where": where, "msg": m[3],
                "where_en": where_en, "msg_en": msg_en}
    return {"level": level, "where": "Vaka", "msg": text,
            "where_en": where_en, "msg_en": msg_en}


def line(f: dict, locale: str = "tr") -> str:
    """A finding as one line, for a report that lists files."""
    if locale == "en" and "msg_en" in f:
        return f["msg_en"] if f["where_en"] == "Case" else f"{f['where_en']}: {f['msg_en']}"
    return f["msg"] if f["where"] == "Vaka" else f"{f['where']}: {f['msg']}"


# Where a value of the wrong type was found (validate_case.Unreadable).
UNREADABLE = {
    "list:variants": "Varyantlar (variants) bir liste olarak yazılmalı.",
    "list:steps": "Adımlar (steps) bir liste olarak yazılmalı.",
    "map:debrief": "Çözüm notu (debrief) summary, takeaway, per_step ve sources "
                   "alanlarından oluşmalı.",
    "case": "Vakanın genel alanlarından biri okunamadı.",
    "variants": "Varyantlardaki alanlardan biri okunamadı.",
    "texts": "Metinlerden biri okunamadı.",
    "debrief": "Çözüm notundaki (debrief) alanlardan biri okunamadı.",
}
WRONG_TYPE_EXAMPLE = "Boş bırakılmış ya da metin yerine liste veya sayı yazılmış olabilir."

UNREADABLE_EN = {
    "list:variants": "Variants must be written as a list.",
    "list:steps": "Steps must be written as a list.",
    "map:debrief": "The solution note (debrief) must consist of summary, takeaway, "
                   "per_step and sources.",
    "case": "One of the case's general fields could not be read.",
    "variants": "One of the fields in the variants could not be read.",
    "texts": "One of the texts could not be read.",
    "debrief": "One of the fields in the solution note (debrief) could not be read.",
}
WRONG_TYPE_EXAMPLE_EN = ("It may have been left empty, or a list or a number may have "
                         "been written where text belongs.")


def unreadable(part: str, locale: str = "tr") -> str:
    """Why a case body could not be read, and where."""
    if locale == "en":
        if part.startswith("step:"):
            return (f"One of the fields in step {part[5:]} could not be read. "
                    f"{WRONG_TYPE_EXAMPLE_EN}")
        text = UNREADABLE_EN.get(part, "One of the fields in the case could not be read.")
        return text if ":" in part else f"{text} {WRONG_TYPE_EXAMPLE_EN}"
    if part.startswith("step:"):
        return f"{part[5:]}. adımdaki alanlardan biri okunamadı. {WRONG_TYPE_EXAMPLE}"
    text = UNREADABLE.get(part, "Vakadaki alanlardan biri okunamadı.")
    return text if ":" in part else f"{text} {WRONG_TYPE_EXAMPLE}"
