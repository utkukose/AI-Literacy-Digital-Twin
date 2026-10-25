import React, { useState, useMemo, useEffect } from "react";
import { Avatar } from "./avatarArt.jsx";
import { AwardImage } from "./badgeArt.jsx";
import { langHeaders, openingLang, pickLang, showLang } from "./language.js";
import { THEME_CSS } from "./theme.jsx";
import { CREDITS } from "./credits.js";

/* ---------------------------------------------------------------------------
   YAZEM admin panel.

   Publishing, review, units, access and reports. Cases are written in the case
   editor, so this panel has no editor.

   Three decisions are visible in the interface because they decide what the
   programme rewards:

     * Reach is shown before publish. Nobody sends a case to an unknown number
       of people.
     * Review is a correction queue over people who are already inside, and
       the wording says so.
     * A unit is closed, never deleted, and the panel says what that means for
       the people still in it.

   Every list comes from the server; sample data stands in when it cannot be
   reached, so the screen also works standalone.
   --------------------------------------------------------------------------- */

const L = {
  tr: {
    app: "YAZEM Yönetim Paneli",
    tabs: ["Yayın", "Duyurular", "Doğru cevaplar", "İnceleme", "Kişiler", "Sorun bildirimleri", "İşaret ve madalya", "Birimler", "Erişim", "Raporlar"],
    // publish
    cases: "Vakalar", unregistered: "Yayına alınmamış vakalar", noCases: "Kayıtlı vaka yok",
    noCasesYet: "Henüz yayımlanmış vaka yok. Vaka Yaz ekranında yazılan bir vaka incelemeden "
      + "geçince burada hedef kitlesini belirleyip yayımlayabilirsin.",
    audience: "Hedef kitle", roles: { student: "Öğrenci", academic: "Akademik", admin_staff: "İdari" },
    eyebrow: "SDÜ · YAPAY ZEKA OKURYAZARLIĞI", domainExample: "ornek.sdu.edu.tr",
    caseAttempts: "{n} deneme", caseRules: "{n} kural",
    caseLangs: { tr: "Türkçe", en: "İngilizce" }, caseLangsTitle: "Vakanın dilleri: {l}",
    status: { live: "yayında", scheduled: "zamanlandı", archived: "arşivde" },
    today: "bugün", daysAgo: "{n} gün önce",
    targeting: "Hedefleme", everyone: "Kural yok: Hedef kitledeki herkese açılır",
    addRule: "Birim kuralı ekle", include: "Dâhil", exclude: "Hariç",
    subtree: "alt birimlerle", onlyThis: "yalnızca bu birim",
    reach: "Ulaşacağı kişi", reachHint: "Yayımlamadan önce hesaplanır",
    topUnits: "En kalabalık birimler", save: "Hedeflemeyi kaydet", publish: "Yayımla",
    saved: "Kaydedildi", published: "Yayımlandı", notSaved: "Sunucuya ulaşılamadı. Değişiklik kaydedilmedi.",
    excludeWins: "Kurallar çakışırsa hariç kuralı geçerli olur.",
    importAll: "Hepsini yayına al",
    importConfirm: "{n} vaka şimdi yayına alınacak. Her vaka, dosyasında belirtilen hedef kitleye "
      + "kapanış tarihi olmadan açılır. Hedeflemeyi sonra her vaka için ayrı ayrı değiştirebilirsin.",
    importYes: "Evet, yayına al", cancel: "Vazgeç",
    imported: "{n} vaka yayına alındı.", importFailed: "{n} vaka yayına alınamadı:",
    languagesAdded: "{n} vakanın dil sürümleri güncellendi.",
    // the case's picture
    picHead: "Temsili görsel", picNone: "Bu vakanın görseli yok.",
    picUpload: "Görsel yükle", picReplace: "Görseli değiştir", picRemove: "Yüklenen görseli kaldır",
    picBank: "Depodaki görsel", picUploaded: "Panelden yüklenen görsel",
    picBankBack: "Kaldırırsan depodaki görsel geri gelir.",
    picHint: "PNG, JPEG ya da WebP, en çok 5 MB. Görsel 3:2 oranında kırpılır, en çok 1200 × 800 piksele küçültülür ve içindeki konum gibi bilgiler silinir.",
    picWorking: "Görsel hazırlanıyor…", picDone: "Görsel yüklendi.", picRemoved: "Yüklenen görsel kaldırıldı.",
    picType: "Yalnızca PNG, JPEG ya da WebP biçiminde bir görsel seçebilirsin.",
    picTooBig: "Görsel en çok 5 MB olabilir.", picTooSmall: "Görsel en az 300 × 200 piksel olmalı.",
    picUnreadable: "Bu görsel açılamadı. Başka bir dosya dene.",
    bulkHead: "Görselleri toplu yükle",
    bulkWhat: "Dosya adı vaka kimliğiyle aynı olan her görsel kendi vakasına yüklenir, örneğin gvn-03-gece-gelen-onay-istekleri.png. Var olan görsel yenisiyle değişir.",
    bulkChoose: "Görselleri seç", bulkProgress: "{done}/{n} görsel yüklendi",
    bulkDone: "{n} görsel yüklendi.", bulkUnmatched: "Hiçbir vakayla eşleşmeyen dosyalar",
    bulkFailed: "Yüklenemeyen görseller",
    // announcements
    newsNew: "Yeni duyuru", newsEdit: "Duyuruyu düzenle",
    newsTitle: "Başlık", newsBody: "Metin",
    newsBodyHint: "Düz metin olarak görünür, satır başları korunur.",
    newsLink: "Bağlantı (isteğe bağlı)", newsLinkHint: "Yalnızca https:// ile başlayan adresler kabul edilir.",
    newsAudience: "Kimler görsün?",
    newsAudiences: { public: "Herkes (giriş sayfasında da görünür)",
                     members: "Giriş yapan herkes", student: "Yalnızca öğrenciler",
                     staff: "Yalnızca personel (akademik ve idari)" },
    newsAudienceShort: { public: "Herkes", members: "Giriş yapanlar", student: "Öğrenciler",
                         staff: "Personel" },
    newsStart: "Başlangıç", newsStartHint: "Boş bırakırsan hemen yayımlanır.",
    newsEnd: "Bitiş", newsEndHint: "Boş bırakırsan sen kaldırana kadar görünür.",
    newsPlace: "Etkinliğin yeri (isteğe bağlı)", newsPlaceNone: "Haritada gösterme",
    newsPlaceHint: "Bir yer seçersen etkinlik, duyuru yayında kaldığı sürece haritada o yerde görünür.",
    newsEvent: "Etkinliğin zamanı",
    newsEventHint: "Etkinlik başladıktan üç saat sonra haritadan kalkar.",
    newsPublish: "Yayımla", newsSave: "Değişikliği kaydet", newsCancel: "Vazgeç",
    newsPreview: "Önizleme", newsList: "Duyurular", newsNone: "Henüz duyuru yok.",
    newsStates: { live: "Yayında", scheduled: "Zamanlandı", ended: "Süresi doldu" },
    newsEditBtn: "Düzenle", newsDelete: "Sil",
    newsDeleteAsk: "Bu duyuru silinsin mi? Silinen duyuru kimseye görünmez, yalnızca yönetim kaydında kalır.",
    newsDeleteYes: "Evet, sil",
    newsAdded: "Duyuru yayımlandı.", newsUpdated: "Değişiklik kaydedildi.", newsDeleted: "Duyuru silindi.",
    newsReadOnly: "Duyuruları tam yetkili yöneticiler ve editörler yayımlayabilir.",
    newsFromTo: "{from} – {to}", newsOpenEnd: "{from} tarihinden kaldırılana kadar",
    newsChars: "{n}/{max}",
    // marks and medals
    awIntro: "Rozette seviyenin ve alan seviyelerinin yanında nadir işaretler ve madalyalar yer alır. Platformla gelen altı nadir işaret kendi koşullarıyla kazanılır. Buradan yeni nadir işaretler ve Süper, Mega, Ultra madalyalar ekleyebilirsin. Bir koşul seçersen platform onu karşılayan herkese kendiliğinden verir. Elle vermeyi seçersen kime verileceğine yönetim karar verir.",
    awNew: "Yeni işaret ya da madalya", awEdit: "Düzenle",
    awGroup: "Grup",
    awGroups: { marks: "Nadir işaret", super: "Süper Madalya", mega: "Mega Madalya",
                ultra: "Ultra Madalya" },
    awGroupsMany: { marks: "Nadir işaretler", super: "Süper Madalyalar", mega: "Mega Madalyalar",
                    ultra: "Ultra Madalyalar" },
    awName: "Adı", awNameEn: "İngilizce adı (isteğe bağlı)",
    awWhat: "Nasıl kazanıldığı", awWhatEn: "İngilizce açıklaması (isteğe bağlı)",
    awWhatHint: "Kullanıcılar rozetlerinde bunu okur. Koşulu açık bir dille anlat.",
    awSuggest: "Açıklamayı koşuldan yaz", awRuleLabel: "Koşul",
    awRule: "Nasıl kazanılır?",
    awKinds: { manual: "Yönetim elle verir", cases: "Belirli sayıda vaka bitirmek",
               case: "Belirli bir vakayı bitirmek", area: "Alan seviyesine ulaşmak",
               level: "Seviyeye ulaşmak", streak: "Art arda haftalarda vaka bitirmek",
               calibration: "Kendini tanıma puanını tutturmak", points: "Toplam puana ulaşmak" },
    awCount: "Vaka sayısı", awCase: "Vaka", awPerfect: "Bütün adımları doğru cevaplanmış olmalı",
    awArea: "Alan", awAnyArea: "Herhangi bir alan", awTier: "Alan seviyesi", awAreas: "Kaç alanda",
    awLevel: "Seviye", awWeeks: "Kaç hafta art arda", awBrier: "Kendini tanıma puanı en çok",
    awAnswers: "En az kaç cevapta", awPoints: "Puan",
    awTiers: ["Temel", "Sağlam", "Usta"],
    awLevels: { 2: "Uygulayıcı", 3: "Denetleyen", 4: "Yetkin", 5: "Rehber" },
    awDims: { prompt_design: "Görev ve İstem Tasarımı", verification: "Doğrulama ve Halüsinasyon Tespiti",
              integrity: "Atıf ve Akademik Dürüstlük", privacy: "Veri Mahremiyeti",
              manipulation: "Manipülasyon Direnci", op_security: "Kurumsal Bilgi Güvenliği",
              boundaries: "Sınır ve Yanlılık Bilinci" },
    awActive: "Kazanılabilir", awActiveHint: "Kapalıyken kimse kazanamaz. Kazanmış olanlar korur.",
    awAdd: "Ekle", awSave: "Değişikliği kaydet", awCancel: "Vazgeç",
    awAdded: "Eklendi.", awUpdated: "Değişiklik kaydedildi.", awDeleted: "Silindi.",
    awChecking: "Koşulu şimdiden karşılayanlara birkaç dakika içinde verilecek.",
    awPic: "Görsel", awPicHint: "PNG, JPEG ya da WebP, en çok 5 MB. Görsel kare olarak kırpılır, en çok 512 × 512 piksele küçültülür ve içindeki konum gibi bilgiler silinir. Görsel yüklemezsen grubun görseli kullanılır.",
    awPicAfter: "Görseli, ekledikten sonra düzenlerken yükleyebilirsin.",
    awPicTooSmall: "Görsel en az 96 × 96 piksel olmalı.",
    awPicUpload: "Görsel yükle", awPicReplace: "Görseli değiştir", awPicRemove: "Görseli kaldır",
    awPicDone: "Görsel yüklendi.", awPicRemoved: "Görsel kaldırıldı.",
    awList: "Platformdaki işaret ve madalyalar",
    awBuiltIn: "Platformla gelir", awOn: "Açık", awOff: "Kapalı",
    awHolders: "{n} kişide", awByHand: "{n} kişiye elle verildi",
    awHoldersBtn: "Kazananlar", awEditBtn: "Düzenle", awDeleteBtn: "Sil",
    awDeleteAsk: "Bu silinsin mi? Henüz kimse kazanmadığı için platformdan kalkar, yalnızca yönetim kaydında kalır.",
    awDeleteYes: "Evet, sil", awCantDelete: "Kazananı olduğu için silinemez. Kapatabilirsin.",
    awReadOnly: "İşaret ve madalyaları tam yetkili yöneticiler ve editörler ekler.",
    awNoHolders: "Henüz kimsede yok.", awWithCase: "{c} vakasıyla", awGiven: "elle verildi",
    awMore: "Son {n} kişi gösteriliyor.",
    awGrantHead: "Elle ver", awGrantFind: "Kullanıcı adı ya da adla ara",
    awGrantBtn: "Ver", awGranted: "Verildi.", awRevoke: "Geri al", awRevoked: "Geri alındı.",
    awGrantOnlyFull: "Elle vermeyi ve geri almayı tam yetkili yöneticiler yapar.",
    awBuiltInNote: "Platformla gelen işaretler yalnızca koşulları karşılanınca kazanılır.",
    awR: { manual: "Yönetim tarafından verilir.", cases: "{n} vaka bitirmek.",
           case: "{c} vakasını bitirmek.", casePerfect: "{c} vakasının bütün adımlarını doğru cevaplamak.",
           areaAny: "{k} alanda en az {tier} seviyesine ulaşmak.",
           areaOne: "{area} alanında {tier} seviyesine ulaşmak.",
           level: "{name} seviyesine ({n}. seviye) ulaşmak.",
           streak: "{n} hafta art arda, her hafta en az bir vaka bitirmek.",
           calibration: "En az {n} cevapta kendini tanıma puanını {b} ya da altında tutmak.",
           points: "Toplamda {n} puana ulaşmak." },
    // correct answers
    ruleHead: "Doğru cevaplar ne zaman açıklansın?",
    ruleWhat: "Bir vakanın doğru cevapları, aşağıdaki iki koşul birlikte sağlandığında o vakayı "
      + "bitiren herkese açıklanır. Kapanış tarihi geçen vakanın cevapları kendiliğinden açıklanır. "
      + "Açıklanan cevaplar bir daha gizlenmez. Bir vakanın cevaplarını gizli tutmak istersen aşağıdaki listede “Gizli tut” düğmesini kullan.",
    minAnswers: "En az kaç kişi bitirmiş olsun",
    minShare: "Vakanın ulaştığı kişilerin en az yüzde kaçı bitirmiş olsun",
    saveRule: "Kuralı kaydet", ruleSaved: "Kural kaydedildi",
    revealCases: "Vakalar",
    revealState: { saturation: "açıklandı, eşik aşıldı", closed: "açıklandı, vaka kapandı",
                   manual: "elle açıklandı", held: "gizli tutuluyor", none: "açıklanmadı" },
    finishedOf: "{f} / {r} kişi bitirdi",
    openNow: "Şimdi açıkla", holdClosed: "Gizli tut", backToRule: "Kurala bırak",
    // review
    queue: "İnceleme listesi", empty: "Liste boş",
    queueNote: "Listedeki kişiler platformu kullanmaya devam eder. Burada yalnızca bir yöneticinin bakıp gerekirse düzelteceği kayıtlar yer alır.",
    reasons: {
      unknown_domain: "Bilinmeyen alan adı", name_implausible: "Ad şüpheli",
      unit_change: "Birim değişikliği", duplicate_suspect: "Mükerrer kayıt şüphesi",
      reported: "Bildirildi", fast_finish: "Olağan dışı hızlı çözüm",
    },
    resolve: "Düzeltildi", dismiss: "Kapat", moveTo: "Birime taşı", inQueue: "kayıt",
    fastLine: "{time} içinde bitirdi, tahmini süre {minutes} dk · {right}/{steps} adım doğru",
    fastFine: "Sorun yok",
    voidAction: "Denemeyi geçersiz say", voidConfirm: "Geçersiz say",
    voidWhat: "Denemenin puanı ve kişinin ikizine etkisi geri alınır, vaka da yeniden çözülemez. Yazdığın gerekçe kişiye vaka ekranında gösterilir. Gerekirse kararı kişinin geçmişinden geri alabilirsin.",
    voidReason: "Gerekçe (kişiye gösterilir)", voidCase: "Vaka", voidPickCase: "Vaka seç…",
    voidDone: "Deneme geçersiz sayıldı, {points} puan geri alındı.",
    phVoids: "Geçersiz sayılan denemeler", phVoidBy: "Karar veren: {who}", pointsShort: "puan",
    restore: "Geri al", restored: "Deneme yeniden geçerli sayıldı.",
    fastLimitHead: "Olağan dışı hızlı çözüm",
    fastLimitWhat: "Tahmini sürenin bu yüzdesinden kısa sürede bitirilen ve neredeyse bütün adımları doğru cevaplanan denemeler inceleme listesine düşer. Bu yalnızca bir uyarıdır. Denemeyi geçersiz sayıp saymamaya bir yönetici karar verir. Vaka yazarlarının ve yöneticilerin çözümleri denetlenmez. 0 yazarsan denetim kapanır.",
    fastLimitField: "Tahmini sürenin yüzdesi", fastLimitSave: "Kaydet",
    // units
    tree: "Birim ağacı", people: "kişi", closed: "kapalı",
    domains: "Kabul edilen e-posta alan adları",
    domainWhat: "Sisteme kimin girebileceğini bu liste belirler. Giriş kodu yalnızca buradaki açık alan adlarıyla biten adreslere gönderilir.",
    registered: "kayıtlı", open: "açık", closed_: "kapalı",
    closeDomain: "Kapat", openDomain: "Aç", deleteDomain: "Sil",
    closeMeans: "Kapatılan alan adıyla biten adreslere kod gönderilmez ve bu adreslerle açılmış oturumlar hemen kapanır. Hesaplar ve geçmişleri silinmez, alan adı yeniden açılınca kişiler yeni bir kodla girebilir. Hiç kimsenin kayıtlı olmadığı bir alan adı tamamen silinebilir.",
    closeConfirm: "Bu alan adıyla kayıtlı {n} kişinin oturumu hemen kapanır ve bu adreslere kod gönderilmez. Hesaplar ve geçmişleri silinmez.",
    closeYes: "Evet, kapat", closeNo: "Vazgeç",
    domainsReadOnly: "Bu listeyi yalnızca tam yetkili yöneticiler değiştirebilir.",
    addDomain: "Alan adı ekle",
    domainNote: "Not (isteğe bağlı): Bu alan adı kimlere ait?",
    roleWarning: "Kişinin rolü e-posta alan adına göre belirlenir ve kişi bunu değiştiremez. Öğrenci alan adını personel olarak işaretlersen öğrencilere personel yetkisi vermiş olursun. Gmail, Hotmail gibi herkesin adres açabildiği e-posta hizmetleri eklenemez.",
    addUnit: "Alt birim ekle", closeUnit: "Birimi kapat",
    closeWarn: "Bu birimde {n} kişi var. Birimi kapatmak kayıtları silmez. Birim yeni kayıtlara kapanır ve bu kişiler başka bir birime taşınana kadar birimsiz kalır.",
    depthNote: "Ağaçta seçilebilir iki düzey var. Daha alt düzeylerde kişi sayısı raporlama eşiğine zaten ulaşmıyor.",
    // reports
    participation: "Katılım", byUnit: "Birime göre", pct: "oran",
    eligible: "hedeflenen", finished: "tamamlayan",
    belowThreshold: "{n} birim, 10 kişilik eşiğin altında kaldığı için gösterilmiyor.",
    weakest: "En zayıf alanlar", weakestHint: "Haftanın vakası buradan seçilir.",
    dims: {
      prompt_design: "Görev ve İstem Tasarımı", verification: "Doğrulama",
      integrity: "Atıf ve Dürüstlük", privacy: "Veri Mahremiyeti",
      manipulation: "Manipülasyon Direnci", op_security: "Kurumsal Güvenlik",
      boundaries: "Sınır ve Yanlılık",
    },
    twinAccHead: "İkizin isabeti",
    twinAccSteps: "Tahmin edilen adım", twinAccBrier: "Brier puanı", twinAccRel: "Kalibrasyon", twinAccRes: "Ayırt edicilik",
    twinAccUnc: "Belirsizlik",
    twinAccFew: "İkizin isabeti, en az {n} kişi cevap verdikten sonra hesaplanıyor.",
    twinAccWhat: "İkiz, her adımın sonucunu adım gösterilirken tahmin ediyor ve tahmini mühürlüyor. Brier puanı bu tahminlerin isabetini ölçer: Sıfır kusursuz tahmin demek, 0,25 ise her adım için %50 demekle aynı.",
    twinAccShow: "Kampüs haritasında herkese göster", twinAccHide: "Herkesten gizle",
    twinAccIsPublic: "Şu an herkes görüyor.", twinAccIsPrivate: "Şu an yalnızca yöneticiler görüyor.",
    // problem reports
    reportsHead: "Vakalarla ilgili bildirimler",
    reportsWhat: "Kişilerin vakalarda gördüğü sorunlar burada vaka vaka listelenir. Bildirenin adı gösterilmez, yalnızca rolü görünür. Bir bildirimi kapatırken yazdığın not bildirene gösterilir.",
    reportsOpen: "Açık", reportsClosed: "Kapatılmış",
    reportsNone: "Açık bildirim yok.",
    reportsNoneClosed: "Kapatılmış bildirim yok.",
    reportKinds: { answer_key: "Cevap anahtarı yanlış", source: "Kaynak ya da künye hatalı",
                   wording: "Metin anlaşılmıyor", technical: "Teknik sorun", other: "Diğer" },
    reportStates: { open: "Açık", fixed: "Düzeltildi", dismissed: "Değişiklik gerekmedi" },
    reportWhole: "Vakanın geneli", reportStep: "{n}. adım",
    reportVariant: "{v} varyantı", reportVersion: "sürüm {n}",
    reportNote: "Bildirene gösterilecek not (isteğe bağlı)",
    markFixed: "Düzeltildi olarak kapat", markDismissed: "Değişiklik gerekmiyor",
    reopen: "Yeniden aç",
    closeAll: "Bu vakanın bütün açık bildirimlerini kapat",
    closeAllWhat: "{n} açık bildirim aynı notla kapatılacak.",
    openCount: "{n} açık",
    editCase: "Bu vakayı düzenle",
    editCaseHint: "Vakanın yeni bir sürümü açılır. Adımlar ve varyantlar aynı kalır. Metinler, cevap anahtarı ve kaynaklar değişebilir. Yeni sürüm yayımlanana kadar herkes yayındaki sürümü çözer.",
    editVersion: { tr: "Türkçesini düzenle", en: "İngilizcesini düzenle" },
    addVersion: { tr: "Türkçe sürüm ekle", en: "İngilizce sürüm ekle" },
    addVersionHint: "Vakanın bu dildeki sürümü, var olan sürümün bir kopyası olarak açılır. Adımlar, cevaplar ve sayılar aynı kalır, yalnızca metinler bu dilde yazılır. Bu sürüm incelenip yayımlanınca vaka iki dilde sunulur. Kim hangi dildekini çözerse çözsün aynı vakayı çözmüş olur.",
    reportFrom: "{l} sürümden gönderildi",
    editingBy: "Bu vakanın yeni bir sürümünü {who} hazırlıyor. Bir vakanın her dilinde aynı anda yalnızca bir sürüm açık olabilir.",
    openDraft: "Taslağı aç",
    editNeedsAuthor: "Bir vakayı düzenlemek için yönetici olmanın yanında vaka yazarı da olman gerekiyor.",
    // drafts and import
    draftsHead: "Yayımlanmayı bekleyen taslaklar",
    draftsNone: "Onaylanıp yayımlanmayı bekleyen taslak yok.",
    draftsWaiting: "{n} taslak incelemede. Her taslağı Vaka Yaz ekranında, yazarından başka bir yazar inceler.",
    draftOrigin: { editor: "Yeni vaka", import: "Dosyadan", revision: "Yeni sürüm",
                   translation: "Yeni dil sürümü" },
    draftAddsLanguage: "Yayımlanınca vaka bu dilde de sunulur. Hangi dilde çözülürse çözülsün aynı vaka sayılır.",
    draftBy: "Yazan: {who}", draftApprovedBy: "Onaylayan: {who}", draftVersion: "sürüm {n}",
    draftReplaces: "Yayımlanınca yayındaki sürümün yerine geçer. Vakayı çözmekte olanlar kaldıkları yerden devam eder.",
    publishDraft: "Yayımla",
    draftPublished: "Yayımlandı. Hedef kitlesini yukarıdaki vaka listesinden ayarlayabilirsin.",
    importHead: "Dosyadan vaka ekle",
    importWhat: "YAML ya da JSON dosyalarını veya bunları içeren bir zip dosyasını yükle. Her vaka, Vaka Yaz ekranındaki denetimden geçer. Sistem, puanlamanın doğru çalıştığını görmek için her varyantı bir kez çözer. Sorunsuz olanlar doğrudan incelemeye gider, sorunlu olanlar düzeltilmek üzere taslak olarak kalır. İçe aktardığın vakayı sen onaylayamazsın: Başka bir yazar inceler, onaylanınca burada yayımlanır.",
    importLimits: "Dosya başına en çok 5 MB, bir seferde en çok 200 vaka.",
    importChoose: "Dosya seç", importSend: "İçe aktar", importNone: "Henüz dosya seçilmedi.",
    importState: { in_review: "İncelemede", draft: "Taslak, düzeltilmeli", rejected: "Kabul edilmedi" },
    importSummary: "{r} incelemede, {d} taslak, {x} kabul edilmedi",
    importRevision: "Yayındaki vakanın yeni sürümü",
    importMore: "ve {n} sorun daha",
    importNeedsAuthor: "Dosyadan vaka eklemek için yönetici olmanın yanında vaka yazarı da olman gerekiyor.",
    // limits
    visHead: "Giriş yapmadan bakanlar",
    visWhat: "Kampüs sayfası giriş yapmadan da açılabilir. Açıkken ziyaretçiler haritayı, gökyüzünü ve zaman çubuğunu, kampüs ve bina düzeyindeki sayıları, kampüste geçen vakaların adlarını ve herkese açık duyuruları görür. Kişilere ait bir bilgi gösterilmez. Değişiklik ziyaretçilere hemen yansır.",
    visCampus: "Kampüs sayfası",
    visCampusWhat: "Bu ayar açıkken giriş sayfasında “Kampüsü gör” düğmesi de görünür.",
    visTwin: "Kampüs ikizi",
    visTwinWhat: "Kampüsün alanlara göre gül grafiği, ikizin günlük tahmini, güven ve isabet, zaman çubuğunda geçmiş günlerle birlikte.",
    visUnits: "Birimlerin alan karşılaştırması",
    visUnitsWhat: "Seçilen birimin en güçlü ve en zayıf alanı ile alanlarının kampüse göre durumu.",
    visBoard: "Sıralama",
    visBoardWhat: "Yalnızca profilinde dışarıdan görünmeyi ayrıca kabul edenler listelenir. Sıralamadaki {m} kişiden {n} kişi kabul etti.",
    visTurnOn: "Aç", visTurnOff: "Kapat",
    visPageOff: "Kampüs sayfası kapalıyken öteki bölümler de ziyaretçilere kapalıdır.",
    limitsHead: "Çözüm sınırları",
    limitsWhat: "Oturum, kişinin ilk vakaya başlamasıyla açılır ve belirlenen süre boyunca sürer. Süre bitince bekleme süresi başlar. Bekleme bittikten sonra kişi yeni bir kodla giriş yapınca yeni oturum açılır. Başlanmış bir vaka her zaman bitirilebilir. Yöneticiler bu sınırlara takılmaz.",
    limitsOn: "Sınırlar şu an uygulanıyor.", limitsOff: "Sınırlar şu an devre dışı, herkes istediği kadar vaka çözebilir.",
    limitsTurnOn: "Sınırları uygula", limitsTurnOff: "Sınırları devre dışı bırak",
    limitCases: "Oturum başına vaka sayısı", limitMinutes: "Oturum süresi (dakika)",
    limitCooldown: "Bekleme süresi (saat)", limitWeekly: "Haftalık vaka sınırı",
    limitRange: "{lo} ile {hi} arası", limitBad: "{field} {lo} ile {hi} arasında olmalı.",
    limitsSave: "Sınırları kaydet", limitsSaved: "Sınırlar kaydedildi",
    // sign-in codes
    codeLimitHead: "Giriş kodu sınırı",
    codeLimitWhat: "Bir IP adresinden bir saatte istenebilecek giriş kodu sayısı. Kampüs ağında çok kişi internete aynı IP adresiyle çıkar. Bir derste ya da bir tanıtım etkinliğinde çok kişi aynı anda giriş yapacaksa bu sayıyı önceden artır. Değişiklik hemen geçerli olur.",
    codeLimitField: "Saat başına kod sayısı",
    codeLimitSave: "Kaydet",
    // the twin's loop
    loopHead: "İkizin önerileri",
    loopWhat: "Kampüs ikizinden çıkan öneriler. Her öneri en az {k} kişinin verisine dayanıyor.",
    loopNone: "Şimdilik bir öneri yok.",
    loopWeakest: "Kampüsün en zayıf alanı {dim}. Orta zorlukta bir adımı doğru çözme olasılığı %{p}.",
    loopOverconfident: "{dim} alanında kampüs kendine fazla güveniyor: Güven ortalaması %{c}, tam doğru cevap oranı %{s}.",
    loopReviewWave: "{dim} alanında {n} kişinin tekrar zamanı geldi.",
    loopFewCases: "{dim} alanında yayında yalnızca {n} vaka var. Bu alana yeni vaka eklemek iyi olur.",
    focusThis: "Bu alanı bir hafta öne çıkar",
    focusNow: "Odak alanı {dim}, {until} tarihine kadar. Bu alanda henüz güçlü olmayan herkesin sıradaki vakası bu alandan gelir.",
    focusClear: "Odağı kaldır", focusSet: "Odak ayarlandı", focusCleared: "Odak kaldırıldı",
    hintHead: "İpucu deneyi",
    hintWhat: "İkizin tahminine göre bir adım zor geçecekse, kişilerin rastgele seçilmiş yarısı o adımdan önce bir strateji ipucu görüyor. Ardından her kişi için sonucun mühürlü tahminden ne kadar iyi çıktığı hesaplanıyor ve iki grup bu farka göre karşılaştırılıyor.",
    hintArm: { hint: "İpucu gösterilenler", control: "Gösterilmeyenler", open: "Deney dışı" },
    hintGroup: "Grup", hintPeople: "Kişi", hintSteps: "Adım",
    hintGain: "Beklenenden fark (yüzde puan)", hintHit: "Tam doğru",
    hintNone: "Henüz ipucu eşiğinin altına düşen bir adım yok.",
    hintDiff: "İpucunun etkisi {d} yüzde puan (%95 güven aralığı: {lo} ile {hi}).",
    hintWait: "Etki, iki grupta da en az {n} kişi olunca hesaplanır.",
    hintRunning: "Deney sürüyor.", hintStopped: "Deney durdu, ipucu herkese gösteriliyor.",
    hintStop: "Deneyi durdur, herkese ipucu göster", hintStart: "Deneyi yeniden başlat",
    hintEthics: "Sonuçlar yayımlanacaksa etik kurul onayı gerekir.",
    // people: profile approvals and suspensions
    pqHead: "Profil onayları",
    pqWaiting: "{n} değişiklik onay bekliyor",
    pqNote: "Kişiler, değişiklikleri onay beklerken de profillerini kullanmaya devam eder. Yalnızca görev değişikliği onaylanmadan geçerli olmaz. Burada başkalarına görünecek bilgileri onaylarsın. Bir değişikliği reddedersen yazdığın gerekçeyi kişi görür.",
    pqEmpty: "Onay bekleyen değişiklik yok.",
    pqFirst: "İlk profil", pqChange: "Değişiklik",
    pqNow: "Şimdiki", pqNew: "Önerilen",
    pqApprove: "Onayla", pqReject: "Reddet",
    pqReason: "Gerekçe (kişiye gösterilir)",
    pqSendReject: "Reddi onayla",
    pqOwn: "Bu senin değişikliğin. Başka bir yönetici karar vermeli.",
    pqRejectedBefore: "Daha önce {n} kez reddedildi",
    pqReadOnly: "Bu rolle değişiklikleri görebilirsin ama karar veremezsin.",
    pqRecent: "Son kararları göster", pqHideRecent: "Son kararları gizle",
    pqRecentNone: "Henüz karar verilmiş değişiklik yok.",
    pqBy: "Karar veren: {who}",
    pqFields: { given_name: "Ad", family_name: "Soyad", title: "Unvan", username: "Kullanıcı adı",
                unit: "Birim", role: "Görev", bio: "Biyografi" },
    pqWarns: {
      word: "Argo ya da kaba olabilecek bir sözcük", social: "Sosyal medya adı",
      handle: "@ ile başlayan hesap adı", link_like: "Web adresini andıran ifade",
      repeated: "Uzun karakter tekrarı", caps: "Büyük harflerle yazılmış",
      title_in_name: "Ad alanında unvan", institutional: "Kurumu andıran kullanıcı adı",
      implausible_name: "Ad gerçek görünmüyor",
      duplicate_name: "Aynı birimde aynı adla başka biri var",
      unit_recent: "Birimini son dört ay içinde de değiştirmiş",
      role_change: "Görevi değişiyor",
    },
    pfHead: "Kişi listesi",
    pfCount: "{n} kişi",
    pfWhat: "Liste en yeni kayıttan başlar. Ad, kullanıcı adı ya da e-posta adresiyle arayabilirsin. Adresler veritabanında şifreli saklandığı için e-posta adresi tam yazılmalı.",
    pfPlaceholder: "Ad, kullanıcı adı ya da e-posta adresi",
    pfSearch: "Ara", pfNone: "Eşleşen kişi yok.", pfMore: "Daha fazla göster",
    pfRole: "Görev", pfTitle: "Unvan", pfState: "Durum", pfAll: "Hepsi",
    pfRoles: { student: "Öğrenci", academic: "Akademik personel", admin_staff: "İdari personel" },
    pfNoTitle: "Unvanı olmayan personel", pfTitleNone: "Unvan yok",
    pfStates: { approved: "Profili onaylı", unapproved: "Profili onaysız", incomplete: "Profili eksik",
                waiting: "Değişiklik bekliyor", suspended: "Askıda" },
    pfAdmin: "Yönetici", pfSuspended: "Askıda", pfApproved: "Profili onaylı",
    pfUnapproved: "Profili onaysız", pfIncomplete: "Profili eksik",
    pfWaiting: "Bekleyen değişiklik", pfClosed: "Hesap kapalı",
    pfHistory: "Geçmiş", pfHideHistory: "Geçmişi gizle",
    pcEdit: "Profili düzenle",
    pcWhat: "Düzenleme hemen geçerli olur ve profil onaylı sayılır. Gerekçeyi kişi profil ekranında görür, işlem yönetim kaydına yazılır.",
    pcWaiting: "Bu kişinin onay bekleyen bir değişikliği var. Düzenlemeyi kaydedersen o istek kapanır.",
    pcRole: "Görev", pcTitle: "Unvan", pcNoTitle: "Unvan yok", pcStudentTitle: "Öğrencilerin unvanı olmaz.",
    pcUnit: "Birim", pcDept: "Bölüm", pcPick: "Seç",
    pcBio: "Biyografi (isteğe bağlı)", pcReason: "Gerekçe (kişiye gösterilir)",
    pcSave: "Düzenlemeyi kaydet", pcDone: "Profil düzenlendi.",
    fieldErrors: {
      characters: "Bu alanda yalnızca harf, boşluk, nokta, kesme işareti ve kısa çizgi kullanılabilir.",
      too_short: "Bu alan en az iki harf olmalı.",
      name_too_long: "Bu alan en çok 60 karakter olabilir.",
      profanity: "Bu alanda uygun olmayan bir ifade var.",
      email: "E-posta adresi eklenemez.",
      link: "Bağlantı ya da web adresi eklenemez.",
      phone: "Telefon numarası eklenemez.",
      too_long: "Biyografi en çok 160 karakter olabilir.",
      shape: "Kullanıcı adı 3 ile 24 karakter arasında olmalı ve harf ya da rakamla başlamalı. Harf, rakam, nokta, alt çizgi ve kısa çizgi kullanılabilir. Türkçeye özgü harfler (ç, ğ, ı, ö, ş, ü) kullanılamaz.",
      reserved: "Bu kullanıcı adı kullanılamaz.",
      domain_like: "Kullanıcı adı bir web adresine benzememeli.",
    },
    psSuspend: "Askıya al", psLift: "Askıdan çıkar",
    psDuration: "Süre", psDays: { 1: "1 gün", 7: "7 gün", 30: "30 gün" }, psOpenEnded: "Süresiz",
    psReason: "Gerekçe (kişiye gösterilir)",
    psNote: "Yönetim notu (isteğe bağlı)",
    psNoteHint: "Bu not kişiye platformda gösterilmez ama kişi kendi verilerini isterse ona verilir.",
    psConfirm: "Askıya almayı onayla",
    psWhat: "Kişinin açık oturumları hemen kapanır. Giriş kodunu doğruladığında neden ve ne zamana kadar askıya alındığını görür. Verileri silinmez, askıda kaldığı sürece kampüs sayılarına katılmaz.",
    psOnlyAdmin: "E-posta adreslerini görmek, profil düzenlemek ve askıya almak yalnızca tam yetkili yöneticilere açık.",
    psUntil: "Bitiş: {date}", psForever: "Süresiz",
    psLiftNote: "Askıdan çıkarma notu (isteğe bağlı)",
    plHead: "Askıdaki hesaplar", plNone: "Askıda hesap yok.",
    phSuspensions: "Askıya alma kayıtları", phChanges: "Profil değişiklikleri", phNone: "Kayıt yok.",
    phBy: "Askıya alan: {who}", phLiftedBy: "Askıdan çıkaran: {who}", phRanOut: "Süresi doldu",
    phCorrected: "Düzenleyen yönetici: {who}",
    changeStates: { pending: "Bekliyor", approved: "Onaylandı", rejected: "Reddedildi",
                    replaced: "Yerine yenisi geldi", withdrawn: "Geri çekildi" },
    demo: "Şu an örnek veri görüyorsun. Burada yaptığın hiçbir şey kaydedilmez.",
    offline: "Sunucuya ulaşılamadı. Panelde gezinebilirsin ama veriler örnek, değişiklikler de kaydedilmiyor.",
  },
  en: {
    app: "YAZEM Admin",
    tabs: ["Publish", "Announcements", "Correct answers", "Review", "People", "Problem reports", "Marks and medals", "Units", "Access", "Reports"],
    cases: "Cases", unregistered: "Unregistered body", noCases: "No registered cases",
    noCasesYet: "No cases published yet. Write one under Write, take it through "
      + "review, and it can be targeted and published here.",
    audience: "Audience", roles: { student: "Students", academic: "Academic", admin_staff: "Admin staff" },
    eyebrow: "SDÜ · AI LITERACY", domainExample: "example.sdu.edu.tr",
    caseAttempts: "{n} attempts", caseRules: "{n} rules",
    caseAttemptsOne: "{n} attempt", caseRulesOne: "{n} rule",
    caseLangs: { tr: "Turkish", en: "English" }, caseLangsTitle: "Languages of the case: {l}",
    status: { live: "live", scheduled: "scheduled", archived: "archived" },
    today: "today", daysAgo: "{n} days ago", daysAgoOne: "yesterday",
    targeting: "Targeting", everyone: "No rules: it goes to everyone in the audience",
    addRule: "Add a unit rule", include: "Include", exclude: "Exclude",
    subtree: "with sub-units", onlyThis: "this unit only",
    reach: "People reached", reachHint: "Computed before publishing",
    topUnits: "Largest groups", save: "Save targeting", publish: "Publish",
    saved: "Saved", published: "Published", notSaved: "Offline, not saved",
    excludeWins: "An exclude rule overrides an include rule.",
    importAll: "Import them all",
    importConfirm: "{n} cases will go live now, each for the audience its file names, "
      + "with no closing date. Targeting can be changed case by case afterwards.",
    importConfirmOne: "{n} case will go live now, for the audience its file names, "
      + "with no closing date. Targeting can be changed afterwards.",
    importYes: "Yes, import", cancel: "Cancel",
    imported: "{n} cases are live.", importFailed: "{n} cases could not be imported:",
    importedOne: "{n} case is live.", importFailedOne: "{n} case could not be imported:",
    languagesAdded: "The language versions of {n} cases were updated.",
    languagesAddedOne: "The language versions of {n} case were updated.",
    picHead: "Representative picture", picNone: "This case has no picture.",
    picUpload: "Upload a picture", picReplace: "Replace the picture", picRemove: "Remove the uploaded picture",
    picBank: "The bank's picture", picUploaded: "Uploaded in the panel",
    picBankBack: "Removing it brings the bank's picture back.",
    picHint: "PNG, JPEG or WebP, up to 5 MB. The picture is cropped to 3:2, scaled down to at most 1200 × 800 pixels, and stripped of details such as location.",
    picWorking: "Preparing the picture…", picDone: "Picture uploaded.", picRemoved: "Uploaded picture removed.",
    picType: "Choose a PNG, JPEG or WebP picture.",
    picTooBig: "The picture can be at most 5 MB.", picTooSmall: "The picture must be at least 300 × 200 pixels.",
    picUnreadable: "This picture could not be opened. Try another file.",
    bulkHead: "Upload pictures in bulk",
    bulkWhat: "Each picture whose file name is a case's key goes to that case, for example gvn-03-gece-gelen-onay-istekleri.png. A picture already there is replaced.",
    bulkChoose: "Choose pictures", bulkProgress: "{done}/{n} pictures uploaded",
    bulkDone: "{n} pictures uploaded.", bulkDoneOne: "{n} picture uploaded.", bulkUnmatched: "Files that match no case",
    bulkFailed: "Pictures that could not be uploaded",
    newsNew: "New announcement", newsEdit: "Edit the announcement",
    newsTitle: "Title", newsBody: "Text",
    newsBodyHint: "Shown as plain text; line breaks are kept.",
    newsLink: "Link (optional)", newsLinkHint: "Only an address that starts with https://.",
    newsAudience: "Who sees it?",
    newsAudiences: { public: "Everyone (also on the sign-in page)",
                     members: "Everyone signed in", student: "Students only",
                     staff: "Staff only (academic and administrative)" },
    newsAudienceShort: { public: "Everyone", members: "Signed in", student: "Students",
                         staff: "Staff" },
    newsStart: "Starts", newsStartHint: "Leave empty to publish now.",
    newsEnd: "Ends", newsEndHint: "Leave empty to keep it up until you remove it.",
    newsPlace: "Where the event is (optional)", newsPlaceNone: "Not on the map",
    newsPlaceHint: "When chosen, the event appears at this place on the campus map while the announcement is up.",
    newsEvent: "When the event starts",
    newsEventHint: "It leaves the map three hours after it starts.",
    newsPublish: "Publish", newsSave: "Save the change", newsCancel: "Cancel",
    newsPreview: "Preview", newsList: "Announcements", newsNone: "No announcements yet.",
    newsStates: { live: "Live", scheduled: "Scheduled", ended: "Ended" },
    newsEditBtn: "Edit", newsDelete: "Delete",
    newsDeleteAsk: "Delete this announcement? Nobody will see it again; only the administrative log keeps it.",
    newsDeleteYes: "Yes, delete",
    newsAdded: "Announcement published.", newsUpdated: "Change saved.", newsDeleted: "Announcement deleted.",
    newsReadOnly: "Full administrators and editors publish announcements.",
    newsFromTo: "{from} – {to}", newsOpenEnd: "From {from} until removed",
    newsChars: "{n}/{max}",
    // marks and medals
    awIntro: "Besides the level and the area levels, the badge carries rare marks and medals. The six rare marks that come with the platform are earned by their own conditions. Here you can add rare marks of your own and Super, Mega and Ultra medals. Choose a condition and the platform gives it to everyone who meets it. Choose to give it by hand and the administrators decide who gets it.",
    awNew: "New mark or medal", awEdit: "Edit",
    awGroup: "Group",
    awGroups: { marks: "Rare mark", super: "Super Medal", mega: "Mega Medal", ultra: "Ultra Medal" },
    awGroupsMany: { marks: "Rare marks", super: "Super Medals", mega: "Mega Medals",
                    ultra: "Ultra Medals" },
    awName: "Name", awNameEn: "English name (optional)",
    awWhat: "How it is earned", awWhatEn: "English description (optional)",
    awWhatHint: "People read this on their badge. Say the condition plainly.",
    awSuggest: "Write the description from the condition", awRuleLabel: "Condition",
    awRule: "How is it earned?",
    awKinds: { manual: "Given by the administrators", cases: "Finish a number of cases",
               case: "Finish a particular case", area: "Reach an area level",
               level: "Reach a level", streak: "Finish cases in weeks in a row",
               calibration: "Keep self-knowledge on target", points: "Reach a total of points" },
    awCount: "Number of cases", awCase: "Case", awPerfect: "Every step answered right",
    awArea: "Area", awAnyArea: "Any area", awTier: "Area level", awAreas: "In how many areas",
    awLevel: "Level", awWeeks: "Weeks in a row", awBrier: "Self-knowledge at most",
    awAnswers: "Over at least this many answers", awPoints: "Points",
    awTiers: ["Basic", "Solid", "Expert"],
    awLevels: { 2: "Practised", 3: "Reviewer", 4: "Capable", 5: "Guide" },
    awDims: { prompt_design: "Task and Prompt Design", verification: "Verification and Hallucination Detection",
              integrity: "Citation and Academic Integrity", privacy: "Data Privacy",
              manipulation: "Manipulation Resistance", op_security: "Institutional Information Security",
              boundaries: "Limits and Bias Awareness" },
    awActive: "Can be earned", awActiveHint: "While it is off nobody can earn it. Those who hold it keep it.",
    awAdd: "Add", awSave: "Save the change", awCancel: "Cancel",
    awAdded: "Added.", awUpdated: "Change saved.", awDeleted: "Removed.",
    awChecking: "Those who already meet the condition will get it within a few minutes.",
    awPic: "Picture", awPicHint: "PNG, JPEG or WebP, at most 5 MB. The picture is cropped square, made at most 512 × 512 pixels, and anything written alongside it, such as a location, is removed. Without a picture the group's own is used.",
    awPicAfter: "You can upload a picture once it is added, while editing it.",
    awPicTooSmall: "A picture must be at least 96 × 96 pixels.",
    awPicUpload: "Upload a picture", awPicReplace: "Change the picture", awPicRemove: "Remove the picture",
    awPicDone: "Picture uploaded.", awPicRemoved: "Picture removed.",
    awList: "Marks and medals on the platform",
    awBuiltIn: "Comes with the platform", awOn: "On", awOff: "Off",
    awHolders: "held by {n}", awByHand: "{n} given by hand",
    awHoldersBtn: "Holders", awEditBtn: "Edit", awDeleteBtn: "Remove",
    awDeleteAsk: "Remove this? Nobody holds it yet, so it leaves the platform. Only the administrative log keeps it.",
    awDeleteYes: "Yes, remove", awCantDelete: "Somebody holds it, so it cannot be removed. You can switch it off.",
    awReadOnly: "Full administrators and editors add marks and medals.",
    awNoHolders: "Nobody holds it yet.", awWithCase: "with {c}", awGiven: "given by hand",
    awMore: "Showing the latest {n}.",
    awGrantHead: "Give by hand", awGrantFind: "Search by username or name",
    awGrantBtn: "Give", awGranted: "Given.", awRevoke: "Take back", awRevoked: "Taken back.",
    awGrantOnlyFull: "Full administrators give and take back by hand.",
    awBuiltInNote: "The marks that come with the platform are earned only by meeting their conditions.",
    awR: { manual: "Given by the administrators.", cases: "Finish {n} cases.",
           case: "Finish {c}.", casePerfect: "Answer every step of {c} right.",
           areaAny: "Reach at least {tier} in {k} areas.",
           areaOne: "Reach {tier} in {area}.",
           level: "Reach {name} (level {n}).",
           streak: "Finish at least one case a week, {n} weeks in a row.",
           calibration: "Keep self-knowledge at {b} or below over at least {n} answers.",
           points: "Reach {n} points in all." },
    ruleHead: "When are the correct answers revealed?",
    ruleWhat: "A case's correct answers are revealed to everyone who has finished it once both "
      + "conditions hold. A case past its closing date has its answers revealed by itself. Revealed "
      + "answers are never hidden again. To keep a case's answers hidden, hold them below.",
    minAnswers: "At least this many people have finished",
    minShare: "And at least this share of the people the case reaches (%)",
    saveRule: "Save the rule", ruleSaved: "Rule saved",
    revealCases: "Cases",
    revealState: { saturation: "revealed, threshold reached", closed: "revealed, case closed",
                   manual: "revealed by hand", held: "kept hidden", none: "not revealed" },
    finishedOf: "{f} / {r} people finished",
    openNow: "Reveal now", holdClosed: "Keep hidden", backToRule: "Back to the rule",
    queue: "Review queue", empty: "Queue is empty",
    queueNote: "These people are already in the system. Review is a correction queue, not a gate.",
    reasons: {
      unknown_domain: "Unknown domain", name_implausible: "Name looks off",
      unit_change: "Unit change", duplicate_suspect: "Possible duplicate",
      reported: "Reported", fast_finish: "Unusually fast finish",
    },
    fastLine: "Finished in {time} against an estimated {minutes} min · {right}/{steps} steps right",
    fastFine: "Nothing wrong",
    voidAction: "Set the attempt aside", voidConfirm: "Set aside",
    voidWhat: "The attempt's points and its effect on the twin are taken back, and the person cannot solve the case again. The reason you write is shown to the person on the case. The decision can be undone from the person's history if needed.",
    voidReason: "Reason (shown to the person)", voidCase: "Case", voidPickCase: "Choose a case…",
    voidDone: "The attempt was set aside and {points} points were taken back.",
    phVoids: "Attempts set aside", phVoidBy: "Decided by {who}", pointsShort: "points",
    restore: "Undo", restored: "The attempt counts again.",
    fastLimitHead: "Unusually fast finishes",
    fastLimitWhat: "A case finished in less than this share of its estimated time, with nearly all of its steps right, goes on the review list. This is only a flag; an administrator decides whether to set the attempt aside. Case authors and administrators are not checked. 0 turns the check off.",
    fastLimitField: "Share of the estimated time (%)", fastLimitSave: "Save",
    resolve: "Resolve", dismiss: "Dismiss", moveTo: "Move to unit", inQueue: "in queue",
    tree: "Unit tree", people: "people", closed: "closed",
    domains: "Accepted email domains",
    domainWhat: "This list decides who can get in. Sign-in codes go only to addresses ending in one of the open domains.",
    registered: "registered", open: "open", closed_: "closed",
    closeDomain: "Close", openDomain: "Open", deleteDomain: "Delete",
    closeMeans: "A closed domain gets no codes, and the sessions opened with its addresses end at once. Accounts and their history are kept; when the domain opens again people sign in with a new code. A domain nobody has used can be deleted outright.",
    closeConfirm: "The sessions of the {n} people registered with this domain end at once, and no codes go to these addresses. Accounts and their history are kept.",
    closeConfirmOne: "The sessions of the {n} person registered with this domain end at once, and no codes go to this address. The account and its history are kept.",
    closeYes: "Yes, close it", closeNo: "Cancel",
    domainsReadOnly: "Only full administrators can change this list.",
    addDomain: "Add a domain",
    domainNote: "Note (optional): whose addresses are these?",
    roleWarning: "The role comes from the domain and cannot be changed by the person. Marking a student domain as staff gives students staff access. Mail services where anyone can open an address, such as Gmail or Hotmail, cannot be added.",
    addUnit: "Add sub-unit", closeUnit: "Close unit",
    closeWarnOne: "{n} person is in this unit. Closing does not delete anything; the unit stops accepting registrations and this person has no unit until they are moved.",
    closeWarn: "{n} people are in this unit. Closing does not delete anything; the unit stops accepting registrations and these people have no unit until they are moved.",
    depthNote: "The tree is two selectable levels deep. Anything deeper never clears the reporting threshold.",
    participation: "Participation", byUnit: "By unit", pct: "rate",
    eligible: "targeted", finished: "finished",
    belowThreshold: "{n} units are held back by the threshold (n < 10).",
    belowThresholdOne: "{n} unit is held back by the threshold (n < 10).",
    weakest: "Weakest areas", weakestHint: "This is what next week's case is chosen from.",
    dims: {
      prompt_design: "Task and Prompt Design", verification: "Verification",
      integrity: "Citation and Integrity", privacy: "Data Privacy",
      manipulation: "Manipulation Resistance", op_security: "Institutional Security",
      boundaries: "Limits and Bias",
    },
    twinAccHead: "Twin accuracy",
    twinAccSteps: "Steps predicted", twinAccBrier: "Brier score", twinAccRel: "Calibration", twinAccRes: "Discrimination",
    twinAccUnc: "Uncertainty",
    twinAccFew: "Twin accuracy is computed once at least {n} people have answered.",
    twinAccWhat: "The twin predicts each step's outcome when the step is shown and seals the prediction. The Brier score measures how accurate those predictions are: zero is a perfect forecast, and 0.25 is the same as saying 50% for every step.",
    twinAccShow: "Show everyone on the campus map", twinAccHide: "Hide from everyone",
    twinAccIsPublic: "Everyone can see it now.", twinAccIsPrivate: "Only administrators can see it now.",
    // problem reports
    reportsHead: "Problem reports about cases",
    reportsWhat: "Problems people found in cases, grouped by case. The writer is not named; only their role is shown. The note you write when closing a report is shown to its writer.",
    reportsOpen: "Open", reportsClosed: "Closed",
    reportsNone: "No open reports.",
    reportsNoneClosed: "No closed reports.",
    reportKinds: { answer_key: "The answer key is wrong", source: "A source or reference is wrong",
                   wording: "The text is unclear", technical: "A technical problem", other: "Other" },
    reportStates: { open: "Open", fixed: "Fixed", dismissed: "No change needed" },
    reportWhole: "The case as a whole", reportStep: "Step {n}",
    reportVariant: "Variant {v}", reportVersion: "version {n}",
    reportNote: "Note for the writer (optional)",
    markFixed: "Close as fixed", markDismissed: "No change needed",
    reopen: "Reopen",
    closeAll: "Close all open reports of this case",
    closeAllWhat: "{n} open reports will be closed with the same note.",
    closeAllWhatOne: "{n} open report will be closed with this note.",
    openCount: "{n} open",
    editCase: "Edit this case",
    editCaseHint: "A new version of the case is opened. Steps and variants stay as they are; wording, the answer key and sources can change. Until the new version is published, everyone solves this one.",
    editVersion: { tr: "Edit the Turkish version", en: "Edit the English version" },
    addVersion: { tr: "Add a Turkish version", en: "Add an English version" },
    addVersionHint: "The version in this language opens as a copy of the existing one. Steps, answers and numbers stay as they are; only the texts are written in this language. Once it is reviewed and published, the case is offered in both languages. Whichever one a person solves, they have solved the same case.",
    reportFrom: "Sent from the {l} version",
    editingBy: "{who} is preparing a new version of this case. Each language of a case can have only one version open at a time.",
    openDraft: "Open the draft",
    editNeedsAuthor: "To edit a case you need to be a case author as well as an administrator.",
    draftsHead: "Drafts waiting to be published",
    draftsNone: "No approved drafts are waiting.",
    draftsWaitingOne: "{n} draft is in review. An author who did not write it reviews it in the Write screen.",
    draftsWaiting: "{n} drafts are in review. An author who did not write them reviews them in the Write screen.",
    draftOrigin: { editor: "New case", import: "From a file", revision: "New version",
                   translation: "New language version" },
    draftAddsLanguage: "Once published, the case is also offered in this language. Whichever language it is solved in, it counts as the same case.",
    draftBy: "By {who}", draftApprovedBy: "Approved by {who}", draftVersion: "version {n}",
    draftReplaces: "Once published it replaces the live version. People in the middle of the case carry on where they were.",
    publishDraft: "Publish",
    draftPublished: "Published. Its audience can be set in the case list above.",
    importHead: "Add cases from files",
    importWhat: "Upload YAML or JSON files, or a zip of them. Each case goes through the editor's checks and every variant is solved once. Sound cases go straight to review; the others stay as drafts to be corrected. You cannot approve a case you imported: another author reviews it, and once approved it is published here.",
    importLimits: "At most 5 MB per file and 200 cases at a time.",
    importChoose: "Choose files", importSend: "Import", importNone: "No files chosen yet.",
    importState: { in_review: "In review", draft: "Draft, needs fixing", rejected: "Rejected" },
    importSummary: "{r} in review, {d} drafts, {x} rejected",
    importRevision: "A new version of a live case",
    importMore: "and {n} more problems", importMoreOne: "and {n} more problem",
    importNeedsAuthor: "To add cases from files you need to be a case author as well as an administrator.",
    visHead: "Visitors who have not signed in",
    visWhat: "The campus page can be opened without signing in. While it is open, visitors see the map, the sky and the time bar, the figures for the campus and its buildings, the titles of the cases set on campus and the announcements meant for everyone. Nothing about any one person is shown. A change reaches visitors at once.",
    visCampus: "The campus page",
    visCampusWhat: "The See the campus link on the sign-in page comes and goes with it.",
    visTwin: "The campus twin",
    visTwinWhat: "The campus rose by area, the twin's daily forecast, confidence and accuracy.",
    visUnits: "Units by area",
    visUnitsWhat: "When a unit is selected, its strongest and weakest areas and how its areas stand against the campus.",
    visBoard: "The ranking",
    visBoardWhat: "Only people who also agreed in their profile to be seen from outside are listed. {n} of the {m} people on the ranking have agreed.",
    visTurnOn: "Open", visTurnOff: "Close",
    visPageOff: "While the campus page is closed, the other parts are closed to visitors too.",
    limitsHead: "Solving limits",
    limitsWhat: "A session opens when a person starts their first case and lasts the set time. When it ends a waiting period starts. The next session opens after the wait, with a new sign-in code. A started case can always be finished. Administrators are not limited.",
    limitsOn: "The limits are on.", limitsOff: "The limits are off; anyone can solve as many cases as they like.",
    limitsTurnOn: "Turn the limits on", limitsTurnOff: "Turn the limits off",
    limitCases: "Cases per session", limitMinutes: "Session length (minutes)",
    limitCooldown: "Waiting period (hours)", limitWeekly: "Weekly case limit",
    limitRange: "{lo} to {hi}", limitBad: "{field} must be between {lo} and {hi}.",
    limitsSave: "Save the limits", limitsSaved: "Limits saved",
    codeLimitHead: "Sign-in code limit",
    codeLimitWhat: "How many sign-in codes one IP address may ask for in an hour. On the campus network many people reach the internet through the same address, so raise it beforehand when many people will sign in at once, in a class or at an event. A change applies at once.",
    codeLimitField: "Codes per hour",
    codeLimitSave: "Save",
    loopHead: "Suggestions from the twin",
    loopWhat: "Suggestions drawn from the campus twin. Each one rests on the data of at least {k} people.",
    loopNone: "No suggestions for now.",
    loopWeakest: "The campus is weakest in {dim}. The chance of solving a step of average difficulty is {p}%.",
    loopOverconfident: "In {dim} the campus is overconfident: confidence averages {c}%, fully right answers {s}%.",
    loopReviewWave: "{n} people are due for review in {dim}.",
    loopFewCases: "Only {n} live cases in {dim}. New cases in this area would help.",
    focusThis: "Bring this area forward for a week",
    focusNow: "The focus is {dim} until {until}. Everyone not yet strong in it gets their next case from this area.",
    focusClear: "Lift the focus", focusSet: "Focus set", focusCleared: "Focus lifted",
    hintHead: "Tip experiment",
    hintWhat: "When the twin expects a step to be missed, half of the people, chosen at random, see a strategy tip before it. For each person, how much better the result was than the sealed prediction is compared between the two groups.",
    hintArm: { hint: "Shown tips", control: "Not shown", open: "Outside the experiment" },
    hintGroup: "Group", hintPeople: "People", hintSteps: "Steps",
    hintGain: "Above expectation (points)", hintHit: "Fully right",
    hintNone: "No step has fallen below the tip threshold yet.",
    hintDiff: "Effect of the tip: {d} points (95% interval {lo} to {hi}).",
    hintWait: "The effect is computed once both groups have at least {n} people.",
    hintRunning: "The experiment is running.", hintStopped: "The experiment is stopped; everyone sees the tips.",
    hintStop: "Stop the experiment, show tips to everyone", hintStart: "Restart the experiment",
    hintEthics: "Publishing the results requires ethics committee approval.",
    pqHead: "Profile approvals",
    pqWaiting: "{n} changes waiting", pqWaitingOne: "{n} change waiting",
    pqNote: "People keep using their profiles while they wait, except that a change of role takes effect only once approved. What others will see is approved here. When you reject a change, the person reads your reason.",
    pqEmpty: "Nothing is waiting for approval.",
    pqFirst: "First profile", pqChange: "Change",
    pqNow: "Now", pqNew: "Proposed",
    pqApprove: "Approve", pqReject: "Reject",
    pqReason: "Reason (shown to the person)",
    pqSendReject: "Confirm the rejection",
    pqOwn: "This is your own change. Another administrator has to decide.",
    pqRejectedBefore: "Rejected {n} times before", pqRejectedBeforeOne: "Rejected once before",
    pqReadOnly: "Your role can see changes but not decide them.",
    pqRecent: "Show recent decisions", pqHideRecent: "Hide recent decisions",
    pqRecentNone: "No decided changes yet.",
    pqBy: "Decided by {who}",
    pqFields: { given_name: "First name", family_name: "Surname", title: "Title",
                username: "Username", unit: "Unit", role: "Role", bio: "Bio" },
    pqWarns: {
      word: "A word that may be rude or offensive", social: "A social media name",
      handle: "An @ account name", link_like: "Wording that looks like a web address",
      repeated: "A long run of one character", caps: "Written in capitals",
      title_in_name: "A title in the name field", institutional: "A username that looks institutional",
      implausible_name: "The name does not look real",
      duplicate_name: "Someone in the same unit has the same name",
      unit_recent: "Also changed unit within the last four months",
      role_change: "Role is changing",
    },
    pfHead: "List of people",
    pfCount: "{n} people", pfCountOne: "{n} person",
    pfWhat: "The list starts with the newest accounts. You can search by name, username or e-mail address. Addresses are stored encrypted, so an e-mail address has to be typed in full.",
    pfPlaceholder: "Name, username or e-mail address",
    pfSearch: "Search", pfNone: "Nobody matches.", pfMore: "Show more",
    pfRole: "Role", pfTitle: "Title", pfState: "State", pfAll: "All",
    pfRoles: { student: "Student", academic: "Academic staff", admin_staff: "Administrative staff" },
    pfNoTitle: "Staff without a title", pfTitleNone: "No title",
    pfStates: { approved: "Profile approved", unapproved: "Profile not approved",
                incomplete: "Profile not filled in", waiting: "Change waiting", suspended: "Suspended" },
    pfAdmin: "Administrator", pfSuspended: "Suspended", pfApproved: "Profile approved",
    pfUnapproved: "Profile not approved", pfIncomplete: "Profile not filled in",
    pfWaiting: "Change waiting", pfClosed: "Account closed",
    pfHistory: "History", pfHideHistory: "Hide history",
    pcEdit: "Edit the profile",
    pcWhat: "The edit takes effect at once and the profile counts as approved. The person reads the reason on their profile screen, and the edit is written to the audit log.",
    pcWaiting: "This person has a change waiting for approval. Saving the edit closes it.",
    pcRole: "Role", pcTitle: "Title", pcNoTitle: "No title", pcStudentTitle: "Students have no title.",
    pcUnit: "Unit", pcDept: "Department", pcPick: "Choose",
    pcBio: "Bio (optional)", pcReason: "Reason (shown to the person)",
    pcSave: "Save the edit", pcDone: "The profile was edited.",
    fieldErrors: {
      characters: "Only letters, spaces, full stops, apostrophes and hyphens are allowed here.",
      too_short: "This needs at least two letters.",
      name_too_long: "This can be at most 60 characters.",
      profanity: "This contains wording that is not allowed.",
      email: "E-mail addresses are not allowed.",
      link: "Links and web addresses are not allowed.",
      phone: "Phone numbers are not allowed.",
      too_long: "The bio can be at most 160 characters.",
      shape: "A username is 3 to 24 characters and starts with a letter or digit. Letters, digits, dots, underscores and hyphens are allowed.",
      reserved: "This username cannot be used.",
      domain_like: "A username should not look like a web address.",
    },
    psSuspend: "Suspend", psLift: "Lift the suspension",
    psDuration: "Duration", psDays: { 1: "1 day", 7: "7 days", 30: "30 days" }, psOpenEnded: "No end",
    psReason: "Reason (shown to the person)",
    psNote: "Note for administrators (optional)",
    psNoteHint: "The note is not shown in the application, but it is given to the person if they ask for their data.",
    psConfirm: "Confirm the suspension",
    psWhat: "Open sessions end at once. After verifying a sign-in code the person sees the reason and the end date. Their data is kept and left out of campus counts while the suspension lasts.",
    psOnlyAdmin: "Seeing e-mail addresses, editing profiles and suspending are open to full administrators only.",
    psUntil: "Ends: {date}", psForever: "No end",
    psLiftNote: "Note on lifting (optional)",
    plHead: "Suspended accounts", plNone: "No account is suspended.",
    phSuspensions: "Suspensions", phChanges: "Profile changes", phNone: "Nothing recorded.",
    phBy: "Suspended by {who}", phLiftedBy: "Lifted by {who}", phRanOut: "Ran out",
    phCorrected: "Edited by the administration: {who}",
    changeStates: { pending: "Waiting", approved: "Approved", rejected: "Rejected",
                    replaced: "Replaced by a newer one", withdrawn: "Withdrawn" },
    demo: "You are looking at sample data; nothing you do here is saved.",
    offline: "No connection. You can look around, but the data is sample and nothing is saved.",
  },
};

/* --------------------------------- sample --------------------------------- */


/* ---------------------------------------------------------------------------
   The panel's connection to the server.

   Reach comes from the preview endpoint, which runs the real targeting
   function inside a transaction it then rolls back, so the number shown is the
   number a publish would reach.
   --------------------------------------------------------------------------- */

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

const BASE = API;

class ApiError extends Error {
  constructor(status, message, detail) { super(message); this.status = status; this.detail = detail; }
}

/* The server's reason for a refusal as one line: FastAPI sends a string, a
   list of field errors, or an object with a code. */
function detailText(detail, fallback) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  if (detail && typeof detail === "object") return detail.message ?? detail.code ?? fallback;
  return fallback;
}

/* English says "1 case" but "2 cases"; Turkish needs no second form, so only
   the English table carries the singular, under the same key with "One". */
const plural = (t, key, n) => (n === 1 && t[`${key}One`]) || t[key];

async function call(path, { method = "GET", body, form } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method, credentials: "include",
      headers: { ...langHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, document.documentElement.lang === "en"
      ? "The server could not be reached." : "Sunucuya ulaşılamadı.");
  }
  if (res.status === 204) return null;
  let payload = null;
  try { payload = await res.json(); } catch { payload = null; }
  if (!res.ok) throw new ApiError(res.status, detailText(payload?.detail, res.statusText), payload?.detail);
  return payload;
}

const admin = {
  cases: () => call("/admin/cases"),
  drafts: () => call("/admin/drafts"),
  reach: (key, audience, rules) =>
    call(`/admin/cases/${encodeURIComponent(key)}/reach`,
         { method: "POST", body: { audience, rules } }),
  saveTargeting: (key, audience, rules) =>
    call(`/admin/cases/${encodeURIComponent(key)}/targeting`,
         { method: "PUT", body: { audience, rules } }),
  publishDraft: (id) => call(`/authoring/drafts/${id}/publish`, { method: "POST" }),
  schedule: (key, publish_at, close_at) =>
    call(`/admin/cases/${encodeURIComponent(key)}/publish`,
         { method: "POST", body: { publish_at, close_at } }),
  review: () => call("/admin/review"),
  resolve: (id, action, note, unit_id) =>
    call(`/admin/review/${id}`, { method: "POST", body: { action, note, unit_id } }),
  units: () => call("/admin/units/tree"),
  domains: () => call("/admin/domains"),
  addDomain: (domain, role, note) =>
    call("/admin/domains", { method: "POST", body: { domain, role, note } }),
  setDomainState: (domain, is_active) =>
    call(`/admin/domains/${encodeURIComponent(domain)}`,
         { method: "PUT", body: { is_active } }),
  removeDomain: (domain) =>
    call(`/admin/domains/${encodeURIComponent(domain)}`, { method: "DELETE" }),
  closeUnit: (id) => call(`/admin/units/${id}/close`, { method: "POST" }),
  participation: (caseKey) =>
    call(`/admin/reports/participation${caseKey ? `?case_key=${encodeURIComponent(caseKey)}` : ""}`),
  dimensions: () => call("/admin/reports/dimensions"),
  publishAll: () => call("/admin/cases/publish-all", { method: "POST" }),
  reveal: () => call("/admin/reveal"),
  revealRule: (min_answers, min_share) =>
    call("/admin/reveal/rule", { method: "PUT", body: { min_answers, min_share } }),
  revealSwitch: (key, open) =>
    call(`/admin/cases/${encodeURIComponent(key)}/reveal`, { method: "POST", body: { open } }),
  settings: () => call("/admin/settings"),
  visitors: () => call("/admin/visitors"),
  putSetting: (key, value) =>
    call(`/admin/settings/${encodeURIComponent(key)}`, { method: "PUT", body: { value } }),
  twinAccuracy: () => call("/twin/accuracy"),
  caseReports: (state) => call(`/admin/reports?state=${state}`),
  closeReport: (id, action, note) =>
    call(`/admin/reports/${id}`, { method: "POST", body: { action, note: note || null } }),
  closeCaseReports: (key, action, note) =>
    call(`/admin/cases/${encodeURIComponent(key)}/reports/close`,
         { method: "POST", body: { action, note: note || null } }),
  revise: (key, locale) => call(
    `/authoring/cases/${encodeURIComponent(key)}/revise${locale ? `?locale=${locale}` : ""}`,
    { method: "POST" }),
  translate: (key, locale) => call(`/authoring/cases/${encodeURIComponent(key)}/translate`,
                                   { method: "POST", body: { locale } }),
  importCases: (files) => {
    const fd = new FormData();
    for (const f of files) fd.append("uploads", f);
    return call("/authoring/import", { method: "POST", form: fd });
  },
  interventions: () => call("/admin/interventions"),
  whoami: () => call("/admin/me"),
  profileChanges: (state = "pending") => call(`/admin/profile-changes?state=${state}`),
  decideProfile: (id, action, reason) =>
    call(`/admin/profile-changes/${id}`, { method: "POST", body: { action, reason: reason || null } }),
  people: ({ q = "", role = "", title = "", state = "", offset = 0, limit = 25 } = {}) =>
    call(`/admin/people?${new URLSearchParams({ q, role, title, state,
                                                offset: String(offset), limit: String(limit) })}`),
  profileOptions: () => call("/admin/profile-options"),
  correctProfile: (id, body) => call(`/admin/people/${id}/profile`, { method: "PUT", body }),
  person: (id) => call(`/admin/people/${id}`),
  suspensions: () => call("/admin/suspensions"),
  voidAttempt: (id, case_key, reason) =>
    call(`/admin/people/${id}/void`, { method: "POST", body: { case_key, reason } }),
  restoreAttempt: (id, case_key, note) =>
    call(`/admin/people/${id}/restore`, { method: "POST", body: { case_key, note: note || null } }),
  suspend: (id, days, reason, note) =>
    call(`/admin/people/${id}/suspend`, { method: "POST", body: { days, reason, note: note || null } }),
  lift: (id, note) => call(`/admin/people/${id}/lift`, { method: "POST", body: { note: note || null } }),
  setFocus: (dimension, days = 7) =>
    call("/admin/focus", { method: "PUT", body: { dimension, days } }),
  hintExperiment: () => call("/admin/hint-experiment"),
  announcements: () => call("/admin/announcements"),
  addAnnouncement: (body) => call("/admin/announcements", { method: "POST", body }),
  editAnnouncement: (id, body) => call(`/admin/announcements/${id}`, { method: "PUT", body }),
  removeAnnouncement: (id) => call(`/admin/announcements/${id}`, { method: "DELETE" }),
  setCaseImage: (key, blob, name) => {
    const fd = new FormData();
    fd.append("image", blob, name);
    return call(`/admin/cases/${encodeURIComponent(key)}/image`, { method: "POST", form: fd });
  },
  removeCaseImage: (key) =>
    call(`/admin/cases/${encodeURIComponent(key)}/image`, { method: "DELETE" }),
  caseImageUrl: (key, version) =>
    `${BASE}/cases/${encodeURIComponent(key)}/image?v=${encodeURIComponent(version)}`,
  awards: () => call("/admin/awards"),
  addAward: (body) => call("/admin/awards", { method: "POST", body }),
  editAward: (id, body) => call(`/admin/awards/${id}`, { method: "PUT", body }),
  removeAward: (id) => call(`/admin/awards/${id}`, { method: "DELETE" }),
  setAwardImage: (id, blob, name) => {
    const fd = new FormData();
    fd.append("image", blob, name);
    return call(`/admin/awards/${id}/image`, { method: "POST", form: fd });
  },
  removeAwardImage: (id) => call(`/admin/awards/${id}/image`, { method: "DELETE" }),
  holders: (id) => call(`/admin/awards/${id}/holders`),
  grant: (id, person_id) => call(`/admin/awards/${id}/grant`, { method: "POST", body: { person_id } }),
  revoke: (id, person_id) => call(`/admin/awards/${id}/holders/${person_id}`, { method: "DELETE" }),
};

/* Everything the screen needs, fetched once. Sample data is the fallback so
   the panel can be worked on without a server. */
function useAdminData() {
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(null);

  const load = React.useCallback(async () => {
    try {
      // The screen needs the first group to be useful at all. The second is
      // shown where it is available: an older server, or one that refuses a
      // single list, still leaves the rest of the panel working.
      const [[cases, review, units, domains, part, dims],
             [drafts, reports, people, whoami]] = await Promise.all([
        Promise.all([admin.cases(), admin.review(), admin.units(), admin.domains(),
                     admin.participation(), admin.dimensions()]),
        Promise.allSettled([admin.drafts(), admin.caseReports("open"),
                            admin.profileChanges("pending"), admin.whoami()]),
      ]);
      const value = (r) => (r.status === "fulfilled" ? r.value : null);
      setData({ cases, review, units, domains, part, dims,
                drafts: value(drafts), reports: value(reports),
                people: value(people), whoami: value(whoami) });
      setOffline(false);
      setError(null);
    } catch (e) {
      if (e.status === 0) { setOffline(true); setData(null); }
      else setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { data, offline, error, reload: load };
}

const UNITS = [
  { id: 1, code: "SDU", name: "Süleyman Demirel Üniversitesi", depth: 0, parent: null, people: 0, selectable: false },
  { id: 2, code: "mdbf", name: "Mühendislik ve Doğa Bilimleri Fakültesi", depth: 1, parent: 1, people: 958, selectable: false },
  { id: 3, code: "mdbf-bm", name: "Bilgisayar Mühendisliği", depth: 2, parent: 2, people: 214, selectable: true },
  { id: 4, code: "mdbf-ee", name: "Elektrik-Elektronik Mühendisliği", depth: 2, parent: 2, people: 186, selectable: true },
  { id: 5, code: "mdbf-mak", name: "Makine Mühendisliği", depth: 2, parent: 2, people: 158, selectable: true },
  { id: 6, code: "tip", name: "Tıp Fakültesi", depth: 1, parent: 1, people: 232, selectable: true },
  { id: 7, code: "iibf", name: "İktisadi ve İdari Bilimler Fakültesi", depth: 1, parent: 1, people: 240, selectable: true },
  { id: 8, code: "hukuk", name: "Hukuk Fakültesi", depth: 1, parent: 1, people: 50, selectable: true },
  { id: 9, code: "egitim", name: "Eğitim Fakültesi", depth: 1, parent: 1, people: 236, selectable: true },
  { id: 10, code: "bidb", name: "Bilgi İşlem Daire Başkanlığı", depth: 1, parent: 1, people: 38, selectable: true },
  { id: 11, code: "oidb", name: "Öğrenci İşleri Daire Başkanlığı", depth: 1, parent: 1, people: 74, selectable: true },
  { id: 12, code: "egirdir", name: "Eğirdir Sağlık Hizmetleri MYO", depth: 1, parent: 1, people: 40, selectable: true },
  { id: 13, code: "shyo", name: "Sivil Havacılık Yüksekokulu", depth: 1, parent: 1, people: 74, selectable: true },
];

/* Sample fallback. In the system these come from /admin/domains. */
const DOMAINS = [
  { domain: "sdu.edu.tr", role: "academic", is_active: true, people: 412,
    note: "Personel adresi. Akademik/idari ayrımı kayıtta beyan edilir." },
  { domain: "stud.sdu.edu.tr", role: "student", is_active: true, people: 3980,
    note: "Öğrenci adresi. Rol alan adından gelir ve değiştirilemez." },
];

const CASES = [
  { key: "2026-W35-voice-clone", title: "Sesi Tanıdık Gelen Arama", type: "weekly",
    status: "scheduled", audience: ["student", "academic", "admin_staff"], rules: 0, attempts: 0 },
  { key: "2026-W34-fabricated-citation", title: "Var Olmayan Kaynak", type: "weekly",
    status: "live", audience: ["academic", "student"], rules: 1, attempts: 412 },
  { key: "core-01-family-health-query", title: "Annenin Tahlil Sonucu", type: "core",
    status: "live", audience: ["student", "academic", "admin_staff"], rules: 0, attempts: 1840 },
  { key: "2026-W33-exam-question", title: "Sınav Sorusu Nereye Gitti", type: "weekly",
    status: "archived", audience: ["academic"], rules: 2, attempts: 268 },
];
const UNREGISTERED = ["2026-W36-biased-advice"];

const REVIEW = [
  { id: 1, reason: "unit_change", name: "Elif Kandemir", unit: "Tıp Fakültesi",
    role: "academic", detail: "Eğitim Fakültesi'ne geçtiğini bildirdi", days: 0 },
  { id: 2, reason: "unknown_domain", name: "Mert Öztürk", unit: "—",
    role: "academic", detail: "hastane.sdu.edu.tr: kural tablosunda yok", days: 1 },
  { id: 3, reason: "duplicate_suspect", name: "Ayşe Yılmaz", unit: "Bilgisayar Mühendisliği",
    role: "student", detail: "Aynı ad ve birimde ikinci kayıt", days: 2 },
  { id: 4, reason: "name_implausible", name: "aaa aaa", unit: "İktisadi ve İdari Bilimler Fakültesi",
    role: "student", detail: "Otomatik kontrol işaretledi", days: 4 },
];

const PARTICIPATION = [
  { unit: "Bilgi İşlem Daire Başkanlığı", eligible: 38, finished: 31 },
  { unit: "Bilgisayar Mühendisliği", eligible: 214, finished: 142 },
  { unit: "Eğitim Fakültesi", eligible: 236, finished: 121 },
  { unit: "Elektrik-Elektronik Mühendisliği", eligible: 186, finished: 88 },
  { unit: "Tıp Fakültesi", eligible: 232, finished: 94 },
  { unit: "Öğrenci İşleri Daire Başkanlığı", eligible: 74, finished: 26 },
  { unit: "Sivil Havacılık Yüksekokulu", eligible: 74, finished: 18 },
  { unit: "Hukuk Fakültesi", eligible: 50, finished: 11 },
];
const BELOW_THRESHOLD = 6;

/* The same seven marks the badge uses. They scale, render identically
   everywhere and already carry meaning in this system. */
function DimGlyph({ name }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6,
              strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "lens":    return (<g {...p}><circle cx="-1.4" cy="-1.4" r="4.4" /><path d="M2 2 L5.4 5.4" /></g>);
    case "keyhole": return (<g {...p}><circle cx="0" cy="-1.8" r="2.7" /><path d="M-2 5.4 L0 0.8 L2 5.4 Z" /></g>);
    case "brief":   return (<g {...p}><path d="M-5 -3.4 H5" /><path d="M-5 0 H5" /><path d="M-5 3.4 H0.6" /></g>);
    case "cite":    return (<g {...p}><path d="M-5 -2.6 H1.6" /><path d="M-5 0.8 H-1" />
                            <path d="M1.6 -2.6 a3.4 3.4 0 0 1 3.4 3.4 v2.6" /></g>);
    case "level":   return (<g {...p}><rect x="-5.6" y="-2.6" width="11.2" height="5.2" rx="2.6" />
                            <circle cx="0" cy="0" r="1.3" /></g>);
    case "lock":    return (<g {...p}><rect x="-4.4" y="-0.8" width="8.8" height="6" rx="1.3" />
                            <path d="M-2.2 -0.8 v-2 a2.2 2.2 0 0 1 4.4 0 v2" /></g>);
    case "edge":    return (<g {...p}><path d="M-6 2.6 H0" /><path d="M0 -4.4 v8.6" />
                            <path d="M2.2 2.6 H3.4" /><path d="M5.2 2.6 H6.2" /></g>);
    default: return null;
  }
}


const DIM_GLYPH = {
  verification: "lens", privacy: "keyhole", prompt_design: "brief",
  integrity: "cite", manipulation: "level", op_security: "lock",
  boundaries: "edge",
};

/* ---------------------------------------------------------------------------
   Institutional marks.

   Embedded, so every screen ships as one file that can be dropped into any
   host and the logos load with it. Both are quantised to a few kilobytes; as
   two-ink marks they need only a small palette.

   The wordmark has a transparent background so it sits directly on the page.
   --------------------------------------------------------------------------- */

const LOGO_AIARC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAaQAAACdBAMAAAAJYBHXAAAAMFBMVEUAAADCAgIBAQHkCgqzCwu+AAD7+PjHHR3UVFTJJSXoZmblnJwAAAAAAAAAAAAAAAABp25QAAAADHRSTlMA/PwRBfoHoFtfFiB0VWfEAAAUlUlEQVR42u1df3AT153/SO/5yZKhaJsmEKe9qkrDXFNIl67GSVynWcbb9Ca9Dm6voQ2DwwaoDG5a7GkSCG2C6A/AZHoRbQ4KaZol+AiFu6m5NvRozHR7ceglhaJekiZDp46YSdOmMWeTNjZsVtL9Ie0PyVppJQvkzPn7D6u3b5/f531/f9/bBZihGZqhGZohi6gkAQBIv8QDrdK+mSW5xOQp34X/AjBPBgj5BubJOJBM3596h6MWOY6LiQD1cVwzDXDcXHlaz9fros9Y9p8FyyjNIEOhYVpjoi76BI0LHW/jbX26S5W30gXQ6XSHZJtgtwhgqe1e9057z4Pa09D9fyU6gIPKNBY90+IR8Vj+ncgsNXfVq2CdqgKBruQ1Kj71wtXb3hlcWnjsSx0A3r7VgHgCX7o5e9kFAE0DuXvPAU8B/6pMey4R8rU4AHjPGt7oBr9t1uvUDwzA92GPrkLKNDwLPBZLTHcuLbw+nnVC/55rOH0GyMZBGMx19fxSBzAYyMzS3xGC1wyqi3TQ0B/F0wM6mO9yh3IXGUiD7wAjHhyDDtWcKYn2iGijkiRJuZgVUK2n1JLRBhNBEVGoSG6tpy7xZyAel4HvZGUqkJ6tUz1flyh9Q8/dgz6Ndcnuatf29fXlYGgZHW2+b14tCIIgQKxkRP+ewPewW/6R4t9J9pA6B0RUQialIrBUQUYLQF1yl+mXKqDzsfS3sGHJy5s8MXa/p56QRBV6VpXGlfZjkH+qN/YL2VtJF+PIdtgXII+GYrF6WzwVOH8wq15PKjwPnWZajhtgy5OFSD4K/zgANACQf1A/SMHFypA59Z1f5gF4j7t4nmmFXFLmkAkNAN4G8Fg9uRQUMZQ1A7q6uVP8pcvn9XChWZd/dmDFU0u1Dzx4eMWPV3Qq9YN09WuqESZIkh6KL3L5fCjPchIotBu3YylYnMme2/GzVYlUok6QHmU7NsKMf37BVzdaCp29UXvDnoWP1k/wtLU/2QEAmYnrkypTPwCkDXWxCisnnEswoSQAJmP/6/bWO7dEsadekMhNn85dTYTE5xgABD4EAD7A8LUJAQA8L+rAQKGnZgB4zyEwymfM0CTTP+sQlHiiPpAUJRI0pAfQlPfo3vGTAIBGP9RXsD+g68uzyu4DGBIAIHtNs6ABCJ4DgBN2Lg3U0eJ1mk2bEwAlOlo/tCgIIPOrONCzmlBdbP5YDMDor5JD6C82mBo4jOXwf8U0h99RLu/33HOJ7YMZtq41WtIbRTxzljXCDFtFFUv6qRXHUp2SEb2AS+lsjMG4ERowA8hznqax+nFpg9WkosGnA3oubBBVSvp1rw7drH3pno+cLDIYvyGJh+D15Yrmb60CGrdhnlwnSBa1DbW9P6F+LU7VbKY0KOKZBYnWxQ9DlwBAH4LeHSo2z+DrfWAA+UT2Z2MT9At9eIhP1EfwzlAjhVDb1O92kgY/RJqLJtjuWII0+CGpYrbB90a2Kl4geLz/V77gCPNlzfaFhi+dS837026fXCddOpOXOKXAr+827fPaLRogdlkNfTm7XFSX2Lv/mBUA2lQXXbLMQ0/caDu7kU+ApJoeyFr1N19U+ARAUk0PxOIA8OY9JLd1UQiJyUoBJK7jkrvaoiQAsJlpwheoHTWDUW/YoPkA+EUcN5f4r8r1aryMejhursLXyTxIVtvKZQCwPLAnO3N9LCtlutEQXWpqR9p86LTpagtIq5fgVUth42IYAKJo+Lc8wUtdfukFb2qQmJYPaVqYh6ltrWhIhuwSeGAMm/IzxMbdoxvwziQZAMQdRcwDVzfzMEVSAGBs7vrzu/KH9/UAiemrS8yF8SquS2RR0OiQObvxSOmCBOu/Pdd97MSkW/KHOMcHR09elCVi+YLXECzWKSI6x0j97dXcqpZL0T0oqEEWRuKeD+rHR9icBTlMvz6XCkr/1Rd/3veQzaTMe1IBbj1SXA90gP30FYOja2xrldYB9uT/lrCgnrUpF5DCeb/SydKYxHNJMFPw0Nh0LhUEHoq/QP15/VZce1yhyyePw1pV9r1hmx8bNa8CLQW3ilBjdhuiIkgAhmXFjqkAXxTaz0aYL7eSnnef83Ad0BRKZ4s2w64C6IvSyftu4vG93fZIZtCEFJj/u83bC4KcSTRUHSQj4kaJSLyxMKuldLZuN7I61dH1530Fx3bITb/eEoM0aFasqT5q3nquS4E0WHqvrkou5WOalC/JmU0jMP2Q73jDZZuxK5EPybj5D0k1v6UpquRN2YLEn+5SJJTbeqwakh1TASTxMzGw99ktryenS5MhUd3/WoEmPRjLF0YTEmmMKi42G3KQqnC1zgdaxq7YcmFrgphcSiVoZuuZ4n11OhH/ql30+K3LqMO29sLeu11tn7gy4uGircMldKlpiX1jZvGp+CRdMpngPbvACiwo8xUqisElSv2uEFXPpVyxuKgPDY4sVmD598OHvxoJOqqAdtfT1o8feHqcOur3P6xWMLuquJQWFScuCS2Ndrve9c+aI5cAoyoDIOBhkziR41LAw9xhmQqXvM7e9uRJT/Mnjn666a2rGl45/NkD20oWvC48agZG1y78qRMnbqcHa6TrJSWvVGifOTCxB1pIU7DXR0tH4fealmRWsM2p06PXinVJLizBv/Mo/3ILCJh8mDftiOX1B217v5Q8b8jdr3/rNCAhsUuRL5XirXJlovG53y+BpnCJd5lAbao/ZF2eNzY+L1BHffEQqtcS0rANRshlegH4x+RRwGtC11k03pMd5O+SmkLbcnzSxVDurOKjnh67WchVfgcBQO8cuFhcosM2UI5mHCB9nTuW3njkygyJr96RO4Q53oc+E/J/HDVLhOr7c1yKL7bE0TqBkfs9ptrRthWZsq5WWyEKFwZFk424A0yr/DBbRaPpOcVnzqaynG3KY/TK3OJ1ARAXWbGgyd+aGXFXPpwsTPAJ4SRJkYUJw4SnbCk0WTRrcdzgkj+VkxVLX8TjDz+51TbeuCLaELGVodF8VQvaUsAq6njhKrlUANrcVKP0LykAIFZCAra7A+1j3CgAzwkAAZ8tn7r7RaW2Fo9N0Z0ZQQP/kqED3uySpqxCtHjz5wDbyWGaMRlI1XX3oN1TrpxSGZcsAzE8BS4BvaZ6LFEAQPYMWLHsD+T8qMgMGcVnziqdFyt6mCKJxvkcig4eAMQO03ZlWEH1yJQ7qu5Z2IlpCglBU+OzZYp40mxY1lJgn5dZFu1zroqcFUGS5RpBspxnsAcAguaxKvGygr9h/WzzLriIYWvNAkLjoscUrj8UQBI7DAum3lZV9FC6RqysdDvXQGumhOGZXF7scbbNYybu+YnKITGtTNVbcRfnBW48Vrqas9eQPDERy8OooxCbvNd08FoVXNJcVfLLUkQ/1nTdJyecO8R7CjMgZbLrMyO8YrFeBVzSw1NHRE80bd3+8suluEidJ0ec3jOk6gp3rxjlmQc9HJo6IqKviW6HVKrUK1b5zoY7g+tF5RlRaXq08UcK6GCp2qiKi0leS4hrgygQXUspqn91JlU7SJpcE0SYf0hpq++7QJbgPV6T8UiTLKqYJpBqwyQsoHVGZEGqUWSUaq77G2i1jvFYXKw3JGrYu/fWaIlsclek+CEVqehcJEi1Oo5FM7qt+DJ54oOXjkt5NOwiUXfKFqw6oni8K+jUza+qFx+STadendqAuln7iDl2WhS6+ObBlq+mtakEWSFjA0IPxIq+rxk4ePBg6yUWvKRzglEekWjKmnizUvQAyvhSQJy4BEZcUexZ01RINeQu1FPzySq190vlh7SlpwPOPB2rBq0uJuTaQypPwUqXtKydUK0hg2KVkEpUtlysUtIx47YDj1sTVspKhmHv1aRaDy5dBAqaFmx/9a7WecVqkyUCHQnTiZVbedVjVvmpu/dR6vJxlzETCB0rN0vF2kBKvTB9BS9oGcZg2TU3lVLXvi5WCUmpybRLeDc2bv2JgbKydMHy44+obiwUrQQRc5+BUN2xIAfNawSCOiu/fn5zy2xIj8X6peUmqoJDK+Oks3Jdsq280wlXy37INzmtaOSUubHpJeUqQsxjvMAHXdy1/XeKlZ8sdW0enGM8S0rT5VZXF9/n1EVWNpt+KVO2xjXe8nvTKA61bWUbnLWPbEjZIcnmcyWONFRiwtXn/hgp/teVxrix7m3PleUSApZA6Kqo7nbu6fPYuWSTEa8jl1xYR/mcWfIad/qGRbev3wwIvri9/JAeWxVNLXUG+ek8wbM70fc6ZLX2HYDXHBlpnhASdzR+uEiHL657wnZ+orl80U++U3WZ6/vydSntMPcKTfSqO6wFFdVia3NfgNqKKaHyYRt9YnZNj0U5Lp2D7nv2ByxMtMincQalQdsEWUf5P5W57veV1W9p+bi5CDkaPGY7OQO9mJDkNbn5pk+q+0y8mqxW05KVPOW4AuMLdNH9MOJSN51XbaHVQKrw65GnHe90V5CwUnVszEU3kqlOlyoK7NLOt1aTd7kepu3Zg+OuYpZDq/UquOTuA0rlu+oZ15JH1ei4u563VyLNNkh31IJJgKa4NU+6/1sue7YsVcUqIDElWQMmAbhNpm7+viSyW9rcBleP9VSAydrYdH38rEyBec8ufajs3xelweNrXfMT1347VtTLlY3bXGFKv1qmdLnq7z+vqxSUOhskKqmDrC/Gu174xLX33KtjSILoApbHOY4rSvkxTtEjhlTv9pUzoGxVS4ftYIb1tQn2enFDfpN64FS5l919I8WO6w6X2m9JJ11FGbqwEwf/8BdnVEyetbCD8pW4wtTTyhfw85Njbl7hn3weK+r0WFRTXMZ6wmwV7Is3FI9jNjylKSAFGaJgrrTz595EFYjSG3dkHLlU9NlyK+cyFiSkvZTQR/ZVFqwYg/aLqIpkZ3mpKAxc5TSzliJmQZh04eChSpkUATM0QzM0QzM0Q/9f6GJ6PcI7/ajZ7CNApIqBaTvvbh0CEbFI50vPpYs3gybBHvASQSmVAhqRqVwiemUMyDvxpTxxH/WvLzy38fGy2STftb7gNCJx4JJ//b3oWm+E9QEMJy0UlA4ni+SY+VPWm5OPO6RM3hBAJ41w+odI72l7AZBGCDc2R108crp1EICE0ZORK/4ya0jUVSpmziZAFo8kpJGElDmbAHo8PZm/Qlqh/FLEL1KQMHjHEZpZPEKv0EbeM8oNRq44QhZjRSfoxB4/a45vElcrmWP0ltcbf4eHbz2y6gwG+xXgGRd8XRlm4fmOd8MMhVzaPJf6uAEgrxzcGwRgfHGEFNwEASD2fuaq/PqxZ24BH3OL7ufmopeLi7mmJu6befdRjkv4YVjDaSuzkxX7rqDXacsisP4jq7989IY5wTe/e9eVLwX7gDVz4t+655PC7L99Z51/y+bXG2+IPY+7r9z4Zf+2NY03xBLs+G/RCP9X3gz8yxrfnPsb1mHOG8r6N991459e8Sw6tejUjS+d23bgVHzTRiAD7amlwNgTiffcs/Vvsz4YTT3xP1v/8xdky9b7cN/2u4+W+8AWY+FwWEY4HIY3HA5jZTgcZuH5chiAjHAI2VshbwjhcDhkcOnnXE8Xd4TjuLlNXM+d3EBv8E6O45QdHMf1cs2M47irWlgTd6+PU3o57qoWkBu4zdxqP8fNW8xxc6O9HHfFZzhuLTfQy3EHOI7jOG5gMcfNlUEbOW4bx8X9HMcpmznuQW4L1xzgOC62+XJurp/jy5kHTUsirWD4VQDpV5OhH358GFoym6IrQBLe9KsAEGLsVZtmviYf0thnsUkBEGIA8PiSCSTBxnFAztBrRnvSv9GukfuXsTXKY0r6N8ApvIY2YM03vKPjWoOy4sJbA2xUAcDOB7FCxhYkvUvGtQ4FgNyXAb7vewsJsG0heBD9PBuVd256Q6Zlil5ZugNJ5PbENIApXgBYmc52lgHvexGCF6c1zdy7lXFZMC2Sj2RFIKkBQOr6tUCPh2C9mB4X1icmgK/yGdGzgu6V0xl0LmP7kAD+FP3vXd3owN6v3CZntSAz0QE16LsbePr67DdIKY81QOLCp6CAdsl0u++bonab0hDpUr7tCpICQA4b1S89HALSuc9whHL7SkkAYN5snxCg4GwyndCfzc4py6XDGxUAuA4kjsCBPSqATjUtpxVAXAkkeC2F/cA/CfduVPBWDLufAjKGxyUAj+Qj2SGg78weilNvkZEReB0ZGYAknwj4VruCBACPpz9uOKn0MJDbZvciCSA9PAykkyEtNCwCUIPa8oPAAU3Z6MM/DphcSjRm/0FqDCmsCwGgB7TgMuhzfnwuhUQSAeoFUifHAhMgL+6SU0rurZjfAikgASQCuQOjJHoGCAVGfyQCLyVwXnsf2KFDNzcqa3TXkIzNmdDp/LqQNxyC13pGAbBvKZ6U2WovxfMePBuE+aJfWrdV1sZEP8C8EHkBR3fvp2AK+ejXMwBEpPswcPgNeKHtHigoHOa+qDDepwDB8d07OgAA9+ORqHbfruW7ceX3iuzMFoeU9oYBeMNp+Q5vGNCSuXgiBKST4RCAtJdlL1IZWccK78eWs73Xyd9X8FZPtu9rmrVrm5b3KhPA+DWy+nR05/kNfp0S3HWsR5MBmT8fw+e1B5SoDxvyIfHnY7a4olvekDt2oPWMr5C/v1FOYMMDFbwpxbL+lGVZZC/BMjCDcVmcLNICiL3NPFjrnfNooJUIssBDaBEUoTUg8O0CVgmrBAAtgkAI9rXKQECISCSyTxgAE/YLA903ziP4ibBKGBBaCBF4obVJ4JmwXxgAiMATIvBoirRgXytpEvYRYYBFPgahXRBIRdGkDYd3folYXwR4wrggY+t3c81GtM8XRAuFQUHBILvmtbrYi+anmFPYIIWLl1xzXJJuAfVz8VsYx3ExPtBO2hHhidQi8ZF2IvFURKQ90g4AERFAf7sMEIkHkYgEMIlJVObuFUAlIoHyIBIi7ZB4JrVIAIiU7R6QWhARAYknEph0K08lqZ1IFy0to8IA0C3tr/L5wDSulFadJ9XuvzWq1Ujko3P/jFXe5lPVPn75n2fKGzM0QzM0QzOE/wO/a8fV8D+x6gAAAABJRU5ErkJggg==";

const LOGO_SDU = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAMAAAAOusbgAAAAP1BMVEX9+PjgBxIAAAD0nqPrW2T////nOkReXl2bm5vS29vj9fSsqanve4L4vcF3c3MsLCsAAAAAAAAAAAAAAAAAAABCn3IqAAAAEHRSTlP+/gD+/gL+//9fqR7+/w7/M0+lcQAACfNJREFUeNrFW4l2ozoMFZViSALN///tsxZvWAaS5p1hOm1WX2tfLODn6vW83eTvL9wfD6iux+MOv/LWzT5y5YJrH/vVJe93hUSkfCEq/P2u2L9fBH4yKggoUpicKxAK+FOwvwTM6zzvAppxwENncMP+ArAQ+6hR+UJGX8nHvgQN57D3BpXkIcTfzNzId4p/qMV+sLiffwBmaTFsTShCAZ74LQJa+ZVK9nFLEfoGnwI/d7BRtDStQh5gBtadUCt1g/4IOH7r+ciwKI8AIgJmYBLCUd/vhM2y/n0fWLi8FQpUtBCiSOODTYBtM6wBNWOUAXRMNAxxn7XOGCcj3QQmXwZWrgvwXsORoSPRt7eAhVylISgr9RnKtRkwCn8Fcidifo2VbWOif68D39hyKWmJ8BZhA9FgpnmKKsbA/Eh9SSti2ZZx6jEwLHBfewJUa8gTkXdEiU9gFQpBtJqyljfKn3YSIgkuMrj0Fq3Ka+vSrFysx4TiSvhHONIAywtreeYKGhzce72MqlGSItPiuWmsNJEywerlMAr6dg7MuGujKKjKAqxLNI0uqr8QTONwGiKDg0t7k5w2IRtD9tdoUTjuBqn/vKoI/5b3VgcZznCFgkppCcG5qigS9cMUrnyRemQ4xWWOpRd91BabPSmas9EdBPbwe92GvbtakwMo16ZPwwGqYQdF3hQ/2vla9HOn2zXw70+KReDQfQpboFW1CaF2ejEhvPnANzZg0YUcFBp7uXZhpRggHsT0I/qwEfDPw0KrfIs+gc3QaIj6e+2RoQr7d8siSMyk9ghvXiFH0qRnvWpDrVhU9BhLJoXw9kXmthR3LQGnhKoCXDtoUhHRCFf2xaEZ1kBjSSsu25RZdsVsqCw45a3pK6huwKNHJWHuwSU667PGKrOWwmxIAn6m5EYdgfnZ4BMT6wksaT0NkRW9ONsVUgWWgJNGi5sqOQX5uDEN4O3hOiEOxWGamkSuoaowGxpGq0QwyWhArwRHjlerVGya8UmY7mnO8VKtmrIDS8AlBEuWpvsdMJCZEYGDBmdSj7hasrL7sHlwThFVSI8auCI4bXKsVxmYsxD5QY1ChB2PShaC+j4/1GgBFcElvgzt19aRVTABT5KGTVrJOFYVF9qqDF1JhorgHNssr+y0BbEk2SLTiTOCGLa2vG/sOQS8q8JRMymoJYxpl+QpNBqzFHhFsqhr+XUAz7SC5ae6fiVlUGfZ+MrNFzBlw7W8D3PhZP7JM8Ac3cnK2hAV+2nAD43cnDJsls2iq1iZM7zQZqakG0BcXTe2at6lVbSanpDMbvtZnDJukDyYB0zZKEvMRstCk7f1DZC3QMk1sX5BbUuaJjE/cGBKmJFJkSz4TcUo1t7lRAlq3kRFvRj4gVXkpaH3rQJOZC/JL3NP9ppPctgXV6JeYOEhlXs4MKWc06gGU4CafpymMa8xGeikJaT6TShGTLnPEUbBXcxIHT5URXHCHyQOyQ6EkavxGjKnqXbXB8Ck4owsytn2Nh0CY1XNCcOY19GcLDeSQBPGkT0xhHLTJy1oATCMgFOwwEQ7MapymrTWT0ZzkLdm4OwFzYCzcpHrAZhHpXR9JuCStq/D7K5ye6XbU/ByjPGcrTqJ2l9DZUxFFO61FoFK6E0FTtaMMNSQZIDWcGUhw09tTCdpNGVHvSFiS2fWrYG3TfVtJJwzjR/4VUeVxE6HeXS2p2L3xfngmGFYii+kTJv6ylXBccjpQjIVDmPV5zzK/y0GhaJdYEq96XZEAc8qMok4cKKKfg6UOBNhH1BeEX85FLG+rcknSedHtHUj6s4JBqlulb9EYOwaAGdcTqkKeYV0GH877Ut8F7StsYFurfydMNWpEwuZ2tYp0tAYs+rEfCEB074X2H1rC6l9lTMBTTMbBzZJ9rXG2gJd4NwcQmOZ+kj+DpnUWsFSNn11s6KbtHGy0sQW9R9h6Ls6eZJ0aLcdSwq5nDxYOYDBPEDV5UGrYvRpMB27CFxk7MiImHkphhAFEnYW/8pMzG4RB8CNtVAPPErWWHuD5dvt5rHEQqy9iedBeOuIuAdmLgU3c0l9o1QtNcaTW+Ok7A+oHfseGE1N1P/sArDruDIl0BrUVLrDWmaQLsEbdVhtJYpogyRBEAKLZhq6aqrtVDpnNDXJliSbSHYuhQ6rXeWitkWMAxdNmDNf0oppk9pjxWKn/D94fEMrJmtglOZI8al+dzZrTuKAGjgVVoYsCOsZ7T0XVmaEyeVK25nCuK1V5VOY+W4nAyaP1Ypv0nMSD5hLFcszLwcJDkJrlcegypTq4IVkBQy6dVf6a8BND5zOG4irUcs+kuhiuzGUY98Uj0uSGdfYThIBpRitNkQ7KH8vEbA008KjlHTraepTVJStBqlXiGUE3KU+OdnL/ZfzRrx09sRldLivBS4me5LehpodY7HNOW6wdFmPu08s80H506S3ltA3bmRPRqIir0pcu9HkbW0+FXFK6O/gHJtVqDNfS6aoKJgjkrizeYHTNEBLmB6Y2qVqwNlkSG6Cw59eljGnp6Zo+3Fe3+Nm8RaKXE2IqJ6Qe8oi6s2p2rBTpyUDJ2S8Dtyv/6haEX5uPDt6PS9DtWdWz6cEayviWR2C9CTvl5m93ZQXXOXCntPcfPnxeF0EOM8OxHxg6fNR+VK3m348XldSXhroVscvAaPL6bqlOMo1lwrHHs7Fchb5mW2LVyScWoqpiXrgRArykoAX3k50LMyPZRGJCLUvv4HR0GRN1LptPEivlzlBZn/C/+AVr9lIXcRPL69TgkvbuDkK2evXvETa5iUHvETx67WoO+H3Xmy+y+u1UwhXs6pGua9exmymomJ567mzvi0iDkfIzjBDdTTgk+wEgUj9chasa1X0Vy2HIQOSJ/jsmgu/3UWr458ByZ8iSyhdfNz2wGtEcgD4A7a34v6IrxxqXsqx3zg3d23YO8b9Hs0ebn+MO2L253L2F+sOrndH9R8NYhxHhmlwVN8MJ/wZebiQM5xQjWP8WcVGy7jjGEPN/mwA5YTR/sjNn6BHsAcjN9WQ0WCG+Y0hI2fnwyGjaqzKva6OVQ1wD8aqBoNkF8nGoy+eDJKdI18YnTtX6IvDgt46R8OCLr2nw4LOeOTfr0vjkd1AaE/u6nDgbdzzEViHb5gOYPQ8ZDqy3jdGYNuhX28lymDa3IX9lHMTV68P/TZjzp6G2nyT4EnbJkwD9/zmmHMz2O2ITH8pMMmY64jidwe7+1H23RCw3TGQmYwwIPfdUfZueH8vYp43WzU9maZudD9lTZ8M7+9vV6iAgzmwoG6sH5k1iXx4u4J3g0ZzfguF8eR1rD6+QcO7JaUA5pmiYJP9NH3vlpSDm3CmPB1sh1701Ztwxrcdpcn1/W1XX7vtaHCj1Thifu9Gq394a9k/vJnu/7h98D87uFZu8X04zQAAAABJRU5ErkJggg==";

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

const APP_TITLE = {
  tr: "SDÜ Yapay Zeka Okuryazarlığı - Kampüs İkizi Platformu",
  en: "SDÜ AI Literacy - Campus Twin Platform",
};

const APP_SUB = {
  tr: "Yapay Zeka Uygulama ve Araştırma Merkezi",
  en: "Artificial Intelligence Application and Research Centre",
};

/* The tabs, in the order of t.tabs. */
const TAB_KEYS = ["publish", "news", "answers", "review", "people", "reports", "awards",
                  "units", "access", "stats"];
const TAB_ICON = ["weekly", "publish", "check", "flag", "person", "bell", "trophy", "unit", "key",
                  "chart"];

const KIND_ICON = {
  span_select: "target", source_verify: "check", pattern_check: "brief",
  reasoned_choice: "scales", branching: "steps",
};

const REASON_TONE = {
  unknown_domain: "var(--warn)", name_implausible: "var(--accent)",
  unit_change: "var(--good)", duplicate_suspect: "var(--accent)", reported: "#7C6BA8",
  fast_finish: "var(--accent)",
};

/* The icon set.
 *
 * Colour emoji, set at a fixed size with an explicit emoji font stack so a
 * Linux desktop, a Mac and an Android phone all draw the same colour glyph.
 *
 * The badge keeps its own drawn marks as an earned crest. Everywhere else
 * (case cards, tabs, step kinds, the sign-in fields) these are what a student
 * recognises without reading. */
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",' +
                   '"Twemoji Mozilla","EmojiOne Color",sans-serif';

const ICONS = {
  weekly: "📅", core: "📘", play: "▶️", file: "📎", flag: "🚩",
  spark: "✨", check: "✅", trophy: "🏆", scales: "⚖️", target: "🎯",
  clock: "⏱️", steps: "🧩", mail: "✉️", key: "🔑", person: "👤",
  unit: "🏛️", publish: "📣", chart: "📊", brief: "✍️", lock: "🛡️",
  lens: "🔍", bell: "🔔", inbox: "📥", compass: "🧭",
  // the seven areas
  verification: "🔍", privacy: "🔒", prompt_design: "✍️",
  integrity: "🔗", manipulation: "🎭", op_security: "🛡️", boundaries: "🚧",
};

function Icon({ name, size = 18, style }) {
  const glyph = ICONS[name];
  if (!glyph) return null;
  return (
    <span aria-hidden="true" style={{
      fontFamily: EMOJI_FONT,
      fontSize: size,
      lineHeight: 1,
      display: "inline-block",
      verticalAlign: "-.16em",
      flexShrink: 0,
      fontStyle: "normal",
      ...style,
    }}>{glyph}</span>
  );
}



const DIMENSIONS = [
  { dimension: "op_security", theta: -0.42, people: 1180 },
  { dimension: "manipulation", theta: -0.11, people: 1204 },
  { dimension: "privacy", theta: 0.28, people: 1310 },
  { dimension: "boundaries", theta: 0.34, people: 1152 },
  { dimension: "prompt_design", theta: 0.61, people: 1402 },
  { dimension: "verification", theta: 0.78, people: 1466 },
  { dimension: "integrity", theta: 0.95, people: 1288 },
];

/* Local reach, used when the server cannot be asked. It follows the server's
   rules: role first, then exclude beats include. */
function computeReach(audience, rules, units = UNITS) {
  const byId = Object.fromEntries(units.map((u) => [u.id, u]));
  const under = (u, ruleUnit, subtree) => {
    if (u.id === ruleUnit) return true;
    if (!subtree) return false;
    let cur = u;
    while (cur?.parent) {
      if (cur.parent === ruleUnit) return true;
      cur = byId[cur.parent];
    }
    return false;
  };
  const includes = rules.filter((r) => r.mode === "include");
  const excludes = rules.filter((r) => r.mode === "exclude");

  const hit = units.filter((u) => {
    if (!u.people) return false;
    if (excludes.some((r) => under(u, r.unit_id, r.subtree))) return false;
    if (!includes.length) return true;
    return includes.some((r) => under(u, r.unit_id, r.subtree));
  });

  // Sample split of a unit's headcount across roles, for the preview only.
  const SPLIT = { student: 0.72, academic: 0.19, admin_staff: 0.09 };
  const by_role = {};
  for (const role of audience) {
    by_role[role] = Math.round(hit.reduce((a, u) => a + u.people * SPLIT[role], 0));
  }
  return {
    by_role,
    total: Object.values(by_role).reduce((a, b) => a + b, 0),
    units: hit.sort((a, b) => b.people - a.people).slice(0, 6),
  };
}

/* -------------------------------------------------------------------------- */

/* Colours sampled from the institution's own marks.
 *
 *   #E10613  the university seal's red, sampled from the crest
 *   #C00000  the centre's red, sampled from the AIARC wordmark
 *
 * The darker red carries text, borders and filled buttons because it clears
 * 4.5:1 on both the card and the page background. The seal red is used where
 * the brighter mark belongs: the badge, small highlights, the crest itself. */
const PAPER = "var(--paper)", CARD = "var(--card)", LINE = "var(--line)";
const TEXT = "var(--text)", MUTED = "var(--muted)", ACCENT = "var(--accent)", BRAND = "var(--brand)";
/* The amber for marks and borders; words take the deeper one, which reads on the
   light page as well as the dark. */
const GOOD = "var(--good)", WARN = "var(--warn)", WARN_TEXT = "var(--warn-text)";
/* A pill's words in its own colour, the amber deepened. */
const inkOf = (tone) => (tone === WARN ? WARN_TEXT : tone);
const DISPLAY = "'Archivo', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export default function AdminPanel({ lang: hostLang, onLang, embedded }) {
  /* Language and the app chrome belong to whoever is hosting this screen.
     Standing alone it keeps its own; inside the shell the shell owns them, so
     only one language switch is on screen. */
  const [ownLang, setOwnLang] = useState(() => openingLang(null));
  const lang = hostLang ?? ownLang;
  if (!hostLang) showLang(ownLang);
  const setLang = onLang ?? ((next) => { pickLang(next); setOwnLang(next); });
  const [tab, setTab] = useState(0);
  const current = TAB_KEYS[tab];
  const [narrow, setNarrow] = useState(false);
  const { data, offline, error, reload } = useAdminData();
  const t = L[lang];
  // Closing reports updates the count on the tab without reloading the panel.
  const [openReports, setOpenReports] = useState(null);
  useEffect(() => { setOpenReports(null); }, [data]);
  const reportCount = openReports
    ?? (offline ? SAMPLE_CASE_REPORTS.open_total : data?.reports?.open_total ?? 0);
  // The same for profile changes waiting for a decision.
  const [waitingProfiles, setWaitingProfiles] = useState(null);
  useEffect(() => { setWaitingProfiles(null); }, [data]);
  const profileCount = waitingProfiles
    ?? (offline ? SAMPLE_PEOPLE.queue.waiting : data?.people?.waiting ?? 0);

  // Live where the server answered, sample where it did not. One place decides,
  // so no screen can be half-real without the banner saying so.
  const live = {
    cases: data?.cases?.registered ?? CASES,
    unregistered: data?.cases?.unregistered ?? UNREGISTERED,
    // Not every administrator may read these lists; null means "not shown".
    drafts: offline ? SAMPLE_DRAFTS : data?.drafts ?? null,
    review: data?.review ?? REVIEW,
    units: data?.units ?? UNITS,
    domains: data?.domains ?? DOMAINS,
    // The picture each case is shown with, by key.
    images: data?.cases?.images ?? {},
    participation: data?.part?.units ?? PARTICIPATION,
    below: data?.part?.below_threshold ?? BELOW_THRESHOLD,
    dimensions: data?.dims ?? DIMENSIONS,
    // What this administrator may do; a server too old to say is read as no.
    who: offline ? { can_write: true, can_suspend: true, can_manage_access: true,
                     can_manage_people: true, person_id: 0 }
                 : data?.whoami ?? { can_write: false, can_suspend: false,
                                     can_manage_access: false, can_manage_people: false },
    peopleQueue: offline ? SAMPLE_PEOPLE.queue : data?.people ?? { items: [], waiting: 0 },
  };

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const on = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  return (
    <div lang={lang} style={S.root}>
      <style>{CSS}</style>
      {/* Standing alone, this screen shows whose it is; inside the shell the
          shell does. */}
      {!embedded && (
        <div style={S.brandBar}>
          <img src={LOGO_AIARC} alt="SDÜ AIARC" style={S.brandWide} />
          <div style={S.brandText}>
            <div style={S.brandTitle}>{APP_TITLE[lang] ?? APP_TITLE.tr}</div>
            <div style={S.brandSub}>{APP_SUB[lang] ?? APP_SUB.tr}</div>
          </div>
          <img src={LOGO_SDU} alt={(ORG[lang] ?? ORG.tr).university} style={S.brandSeal} />
        </div>
      )}

      <header style={S.header}>
        <div>
          {!embedded && <div style={S.eyebrow}>{t.eyebrow}</div>}
          <h1 style={S.h1}>{t.app}</h1>
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

      <nav style={S.tabs} className="adm-tabs">
        {t.tabs.map((name, i) => (
          <button key={name} onClick={() => setTab(i)}
            style={{ ...S.tab, ...(tab === i ? S.tabOn : null) }}>
            <Icon name={TAB_ICON[i]} size={16} />
            {name}
            {TAB_KEYS[i] === "review" && live.review.length > 0 && (
              <span style={S.badge}>{live.review.length}</span>
            )}
            {TAB_KEYS[i] === "people" && profileCount > 0 && (
              <span style={S.badge} data-badge="people">{profileCount}</span>
            )}
            {TAB_KEYS[i] === "reports" && reportCount > 0 && (
              <span style={S.badge} data-badge="reports">{reportCount}</span>
            )}
          </button>
        ))}
      </nav>

      {offline && <div style={S.offline}>{t.offline}</div>}
      {error && <div style={S.errline}>{error}</div>}

      <main style={S.main}>
        {current === "publish" && (
          <div style={S.stack}>
            <Publish t={t} lang={lang} narrow={narrow} live={live}
              offline={offline} reload={reload} />
            <div style={{ ...S.split, gridTemplateColumns: narrow ? "1fr" : "1fr 1fr" }}>
              <DraftsQueue t={t} lang={lang} live={live} offline={offline} reload={reload} />
              <ImportBox t={t} offline={offline} reload={reload} />
            </div>
            {live.who.can_write && (
              <BulkPictures t={t} live={live} offline={offline} reload={reload} />
            )}
          </div>
        )}
        {current === "news" && (
          <Announcements t={t} lang={lang} narrow={narrow} live={live} offline={offline} />
        )}
        {current === "answers" && <Answers t={t} narrow={narrow} offline={offline} />}
        {current === "review" && (
          <Review t={t} lang={lang} live={live} offline={offline} reload={reload} />
        )}
        {current === "people" && <People t={t} lang={lang} live={live} offline={offline}
                                         onCount={setWaitingProfiles} />}
        {current === "reports" && (
          <CaseReports t={t} lang={lang} offline={offline} onCount={setOpenReports} />
        )}
        {current === "awards" && (
          <Awards t={t} lang={lang} narrow={narrow} live={live} offline={offline} />
        )}
        {current === "units" && <Units t={t} live={live} offline={offline} reload={reload} />}
        {current === "access" && (
          <div style={S.stack}>
            <Access t={t} live={live} offline={offline} reload={reload} />
            <VisitorsCard t={t} offline={offline} canWrite={live.who.can_write} />
            <LimitsCard t={t} offline={offline} />
            <CodeLimitCard t={t} offline={offline} />
            <NumberSettingCard t={t} offline={offline} setting={FAST_LIMIT} />
          </div>
        )}
        {current === "stats" && <Reports t={t} lang={lang} live={live} offline={offline} />}
      </main>

      {offline && <p style={S.demo}>{t.demo}</p>}

      {!embedded && <Colophon lang={lang} />}
    </div>
  );
}

/* --------------------------------- publish -------------------------------- */

/* Case files on disk that are not registered yet, and a way to register them
   all at once. */
function Unregistered({ t, keys, offline, reload }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);
  if (!keys.length && !outcome) return null;
  const go = async () => {
    if (offline) { setOutcome({ note: t.notSaved }); setAsking(false); return; }
    setBusy(true);
    try {
      const r = await admin.publishAll();
      setOutcome(r);
      reload();
    } catch (e) { setOutcome({ note: e.message }); }
    finally { setBusy(false); setAsking(false); }
  };
  return (
    <div style={S.warnBox} data-panel="unregistered">
      {keys.length > 0 && (
        <>
          <div style={S.warnHead}>{t.unregistered} ({keys.length})</div>
          <div style={S.unregList}>
            {keys.map((k) => <div key={k} style={S.mono}>{k}</div>)}
          </div>
          {!asking ? (
            <button onClick={() => setAsking(true)} style={{ ...S.smallPrimary, marginTop: 10 }}
              data-action="import-all">
              {t.importAll} ({keys.length})
            </button>
          ) : (
            <div style={S.confirm}>
              <p style={S.confirmBody}>{plural(t, "importConfirm", keys.length).replace("{n}", keys.length)}</p>
              <div style={S.actions}>
                <button onClick={go} disabled={busy} style={S.smallPrimary}
                  data-action="import-confirm">{busy ? "…" : t.importYes}</button>
                <button onClick={() => setAsking(false)} style={S.smallGhost}>{t.cancel}</button>
              </div>
            </div>
          )}
        </>
      )}
      {outcome?.published && (
        <p style={{ ...S.hint, color: GOOD }} role="status">
          {plural(t, "imported", outcome.published.length).replace("{n}", outcome.published.length)}
        </p>
      )}
      {outcome?.languages?.changed?.length > 0 && (
        <p style={{ ...S.hint, color: GOOD }} role="status" data-languages-added>
          {plural(t, "languagesAdded", outcome.languages.changed.length)
            .replace("{n}", outcome.languages.changed.length)}
        </p>
      )}
      {outcome?.failed?.length > 0 && (
        <div style={S.hint}>
          {plural(t, "importFailed", outcome.failed.length).replace("{n}", outcome.failed.length)}
          {outcome.failed.map((f) => (
            <div key={f.key} style={S.mono}>{f.key}: {f.error}</div>
          ))}
        </div>
      )}
      {outcome?.note && <p style={S.hint}>{outcome.note}</p>}
    </div>
  );
}

function Publish({ t, lang, narrow, live, offline, reload }) {
  const cases = live.cases;
  const [sel, setSel] = useState(cases[0]?.key ?? null);
  const [audience, setAudience] = useState(cases[0]?.audience ?? []);
  const [rules, setRules] = useState([]);
  const [flash, setFlash] = useState(null);
  const [reach, setReach] = useState(() => computeReach(audience, rules, live.units));
  const [busy, setBusy] = useState(false);

  const caseDef = cases.find((c) => c.key === sel) ?? cases[0] ?? null;
  const [revise, revising] = useRevise(t, offline);

  /* The preview is a request, so it is debounced and rapid edits send a
     single query. */
  useEffect(() => {
    if (offline || !caseDef) {
      setReach(computeReach(audience, rules, live.units));
      return;
    }
    const id = setTimeout(() => {
      admin.reach(caseDef.key, audience, rules)
        .then((r) => setReach({
          by_role: r.by_role, total: r.total,
          units: (r.top_units ?? []).map((u) => ({ id: u.name, name: u.name, people: u.people })),
        }))
        .catch(() => setReach(computeReach(audience, rules, live.units)));
    }, 250);
    return () => clearTimeout(id);
  }, [audience, rules, caseDef, offline, live.units]);

  const pick = (key) => {
    const c = cases.find((x) => x.key === key);
    setSel(key); setAudience(c?.audience ?? []); setRules([]); setFlash(null);
  };

  const save = async () => {
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(true);
    try { await admin.saveTargeting(caseDef.key, audience, rules); setFlash(t.saved); }
    catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };

  const publish = async () => {
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(true);
    try {
      await admin.saveTargeting(caseDef.key, audience, rules);
      await admin.schedule(caseDef.key, new Date().toISOString(), null);
      setFlash(t.published);
      reload();
    } catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };
  const toggleRole = (role) =>
    setAudience((a) => (a.includes(role) ? a.filter((x) => x !== role) : [...a, role]));
  const addRule = (unit_id) =>
    setRules((r) => (r.some((x) => x.unit_id === unit_id)
      ? r : [...r, { unit_id, mode: "include", subtree: true }]));
  const setRule = (unit_id, patch) =>
    setRules((r) => r.map((x) => (x.unit_id === unit_id ? { ...x, ...patch } : x)));
  const drop = (unit_id) => setRules((r) => r.filter((x) => x.unit_id !== unit_id));

  /* A fresh installation has no cases and this is the first screen an
     administrator opens, so the empty state is returned before caseDef is
     read (the shell has no error boundary around this panel). */
  if (!caseDef) {
    return (
      <section style={S.card}>
        <div style={S.cardHead}>{t.cases}</div>
        <p style={S.note}>{t.noCasesYet}</p>
        <Unregistered t={t} keys={live.unregistered} offline={offline} reload={reload} />
      </section>
    );
  }

  return (
    <div style={{ ...S.split, gridTemplateColumns: narrow ? "1fr" : "300px 1fr" }}>
      <section style={S.card}>
        <div style={S.cardHead}>{t.cases}</div>
        <div style={S.list}>
          {cases.map((c) => (
            <button key={c.key} onClick={() => pick(c.key)}
              style={{ ...S.caseRow, ...(sel === c.key ? S.caseOn : null) }}>
              <span style={S.rowTop}>
                <span style={S.caseTitleRow}>
                  <Icon name={c.type === "weekly" ? "weekly" : "core"} size={15}
                    style={{ color: ACCENT }} />
                  <span style={S.caseTitle} data-user-content>{c.title}</span>
                </span>
                <StatusPill t={t} status={c.status} />
              </span>
              <span style={S.caseMeta}>
                {(c.locales ?? []).map((l) => (
                  <span key={l} style={S.langChip} data-case-lang={l}
                    title={t.caseLangsTitle.replace("{l}",
                      (c.locales ?? []).map((x) => t.caseLangs[x] ?? x).join(", "))}>
                    {l.toUpperCase()}
                  </span>
                ))}
                {c.key} · {plural(t, "caseAttempts", c.attempts ?? 0).replace("{n}", c.attempts ?? 0)}
                {c.rules > 0 && ` · ${plural(t, "caseRules", c.rules).replace("{n}", c.rules)}`}
              </span>
            </button>
          ))}
        </div>
        <Unregistered t={t} keys={live.unregistered} offline={offline} reload={reload} />
      </section>

      <section style={S.card}>
        <div style={S.headRow}>
          <div style={{ ...S.cardHead, marginBottom: 0 }} data-user-content>{caseDef.title}</div>
          <CaseVersions t={t} caseKey={caseDef.key} locales={caseDef.locales} revise={revise}
            canAdd />
        </div>
        <ReviseNote t={t} note={revising} caseKey={caseDef.key} />
        <CasePicture t={t} caseKey={caseDef.key} info={live.images[caseDef.key] ?? null}
          canWrite={live.who.can_write} offline={offline} reload={reload} />

        <div style={S.blockLabel}>{t.audience}</div>
        <div style={S.chips}>
          {["student", "academic", "admin_staff"].map((role) => (
            <button key={role} onClick={() => toggleRole(role)}
              style={{ ...S.chip, ...(audience.includes(role) ? S.chipOn : null) }}>
              {t.roles[role]}
            </button>
          ))}
        </div>

        <div style={S.blockLabel}>{t.targeting}</div>
        {rules.length === 0 && <p style={S.hint}>{t.everyone}</p>}
        {rules.map((r) => {
          const u = live.units.find((x) => x.id === r.unit_id) ?? { name: `#${r.unit_id}` };
          return (
            <div key={r.unit_id} style={S.rule}>
              <span style={{ ...S.ruleName, opacity: r.mode === "exclude" ? 0.65 : 1 }}>
                {u.name}
              </span>
              <div style={S.miniSeg}>
                {["include", "exclude"].map((m) => (
                  <button key={m} onClick={() => setRule(r.unit_id, { mode: m })}
                    style={{ ...S.miniBtn,
                             ...(r.mode === m
                                 ? (m === "exclude" ? S.miniExclude : S.miniInclude) : null) }}>
                    {t[m]}
                  </button>
                ))}
              </div>
              <button onClick={() => setRule(r.unit_id, { subtree: !r.subtree })}
                style={S.subBtn}>{r.subtree ? t.subtree : t.onlyThis}</button>
              <button onClick={() => drop(r.unit_id)} style={S.dropBtn} aria-label="remove">✕</button>
            </div>
          );
        })}
        {rules.some((r) => r.mode === "exclude") && (
          <p style={S.note}>{t.excludeWins}</p>
        )}

        <select value="" onChange={(e) => e.target.value && addRule(+e.target.value)}
          style={S.select}>
          <option value="">{t.addRule}…</option>
          {live.units.filter((u) => u.depth > 0 && !rules.some((r) => r.unit_id === u.id))
            .map((u) => (
              <option key={u.id} value={u.id}>
                {"— ".repeat(u.depth - 1)}{u.name}
              </option>
            ))}
        </select>

        <div style={S.reachBox}>
          <div style={S.reachTop}>
            <div>
              <div style={S.reachNum} data-reach>{reach.total}</div>
              <div style={S.reachCap}>{t.reach}</div>
            </div>
            <div style={S.reachRoles}>
              {Object.entries(reach.by_role).map(([role, n]) => (
                <div key={role} style={S.reachRole}>
                  <span style={S.mono}>{n}</span>
                  <span style={S.reachRoleName}>{t.roles[role]}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={S.reachHint}>{t.reachHint}</div>
          {reach.units.length > 0 && (
            <>
              <div style={S.blockLabel}>{t.topUnits}</div>
              <div style={S.bars}>
                {reach.units.map((u) => (
                  <div key={u.id} style={S.barRow}>
                    <span style={S.barName}>{u.name}</span>
                    <span style={S.barTrack}>
                      <span style={{ ...S.barFill,
                        width: `${(u.people / reach.units[0].people) * 100}%` }} />
                    </span>
                    <span style={S.mono}>{u.people}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={S.actions}>
          <button onClick={save} disabled={busy} style={S.ghost}>{t.save}</button>
          <button onClick={publish} disabled={reach.total === 0 || busy}
            style={{ ...S.primary, ...(reach.total === 0 || busy ? S.disabled : null) }}>
            {busy ? "…" : t.publish}
          </button>
          {flash && <span style={S.flash}>{flash}</span>}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------ case pictures ----------------------------- */

const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const PICTURE_MAX = 5 * 1024 * 1024;

/* The picture as the case will show it: cropped to 3:2 around its centre, at
   most 1200 × 800, and redrawn in the browser, so nothing written alongside
   it (a location, the device, dates) is sent at all. */
async function preparePicture(file, t) {
  if (!PICTURE_TYPES.includes(file.type)) throw new Error(t.picType);
  if (file.size > PICTURE_MAX) throw new Error(t.picTooBig);
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error(t.picUnreadable); }
  const width = Math.min(1200, Math.floor(Math.min(bitmap.width, bitmap.height * 1.5)));
  const height = Math.round(width / 1.5);
  if (width < 300 || height < 200) {
    bitmap.close?.();
    throw new Error(t.picTooSmall);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const w = bitmap.width * scale, h = bitmap.height * scale;
  canvas.getContext("2d").drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h);
  bitmap.close?.();
  const encode = (type, quality) => new Promise((done) => canvas.toBlob(done, type, quality));
  let blob = await encode("image/webp", 0.86);
  // A browser that cannot write WebP hands back a PNG instead; a JPEG is smaller.
  if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg", 0.88);
  if (!blob) throw new Error(t.picUnreadable);
  return blob;
}

const pictureName = (key, blob) => `${key}.${blob.type === "image/webp" ? "webp" : "jpg"}`;

function CasePicture({ t, caseKey, info, canWrite, offline, reload }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const pick = React.useRef(null);
  useEffect(() => { setNote(null); }, [caseKey]);

  const choose = async (file) => {
    if (!file) return;
    if (offline) { setNote({ ok: false, text: t.notSaved }); return; }
    setBusy(true);
    setNote({ ok: true, text: t.picWorking });
    try {
      const blob = await preparePicture(file, t);
      await admin.setCaseImage(caseKey, blob, pictureName(caseKey, blob));
      setNote({ ok: true, text: t.picDone });
      reload();
    } catch (e) {
      setNote({ ok: false, text: e.message });
    } finally {
      setBusy(false);
      if (pick.current) pick.current.value = "";
    }
  };

  const remove = async () => {
    if (offline) { setNote({ ok: false, text: t.notSaved }); return; }
    setBusy(true);
    try {
      await admin.removeCaseImage(caseKey);
      setNote({ ok: true, text: t.picRemoved });
      reload();
    } catch (e) {
      setNote({ ok: false, text: e.message });
    } finally { setBusy(false); }
  };

  return (
    <div data-panel="case-picture" data-source={info?.source ?? "none"}>
      <div style={S.blockLabel}>{t.picHead}</div>
      <div style={S.picRow}>
        <div style={S.picFrame}>
          {info ? (
            <img src={admin.caseImageUrl(caseKey, info.version)} alt="" style={S.picImg} />
          ) : (
            <span style={S.picEmpty}>{t.picNone}</span>
          )}
        </div>
        <div style={S.picSide}>
          {info && (
            <div style={S.picSource}>{info.source === "upload" ? t.picUploaded : t.picBank}</div>
          )}
          {info?.source === "upload" && info.bank && <p style={S.hint}>{t.picBankBack}</p>}
          {canWrite && (
            <div style={S.picActions}>
              <label style={{ ...S.fileLabel, ...(busy ? S.disabled : null) }} data-file>
                <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => choose(e.target.files?.[0])} style={S.fileInput}
                  disabled={busy} data-field="case-picture" />
                {info ? t.picReplace : t.picUpload}
              </label>
              {info?.source === "upload" && (
                <button onClick={remove} disabled={busy} style={S.smallGhost}
                  data-action="picture-remove">{t.picRemove}</button>
              )}
            </div>
          )}
          {canWrite && <p style={S.hint}>{t.picHint}</p>}
          {note && (
            <p style={{ ...S.hint, color: note.ok ? GOOD : ACCENT }} role="status">{note.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* Pictures for many cases at once, each going to the case its file is named
   after. */
function BulkPictures({ t, live, offline, reload }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const pick = React.useRef(null);
  const keys = useMemo(() => new Map(
    [...live.cases.map((c) => c.key), ...live.unregistered].map((k) => [k.toLowerCase(), k])),
  [live.cases, live.unregistered]);

  const go = async (files) => {
    if (!files.length) return;
    if (offline) { setState({ note: t.notSaved }); return; }
    const matched = [], unmatched = [];
    for (const f of files) {
      const key = keys.get(f.name.replace(/\.[^.]+$/, "").trim().toLowerCase());
      if (key) matched.push({ f, key }); else unmatched.push(f.name);
    }
    const failed = [];
    let done = 0;
    setBusy(true);
    setState({ n: matched.length, done, failed, unmatched });
    for (const { f, key } of matched) {
      try {
        const blob = await preparePicture(f, t);
        await admin.setCaseImage(key, blob, pictureName(key, blob));
        done += 1;
      } catch (e) {
        failed.push({ name: f.name, why: e.message });
      }
      setState({ n: matched.length, done, failed: [...failed], unmatched });
    }
    setBusy(false);
    if (pick.current) pick.current.value = "";
    if (done) reload();
  };

  return (
    <section style={S.card} data-panel="bulk-pictures">
      <div style={S.cardHead}>{t.bulkHead}</div>
      <p style={S.note}>{t.bulkWhat}</p>
      <div style={S.fileRow}>
        <label style={{ ...S.fileLabel, ...(busy ? S.disabled : null) }} data-file>
          <input ref={pick} type="file" multiple accept="image/png,image/jpeg,image/webp"
            onChange={(e) => go([...e.target.files])} style={S.fileInput} disabled={busy}
            data-field="bulk-pictures" />
          {t.bulkChoose}
        </label>
        {state?.n != null && (
          <span style={{ ...S.fileNames, color: busy ? MUTED : GOOD }} role="status"
            data-bulk-done={busy ? undefined : state.done}>
            {busy ? t.bulkProgress.replace("{done}", state.done).replace("{n}", state.n)
                  : plural(t, "bulkDone", state.done).replace("{n}", state.done)}
          </span>
        )}
      </div>
      <p style={S.hint}>{t.picHint}</p>
      {state?.unmatched?.length > 0 && (
        <div style={{ marginTop: 10 }} data-panel="bulk-unmatched">
          <p style={S.hintStrong}>{t.bulkUnmatched} ({state.unmatched.length})</p>
          <div style={S.unregList}>
            {state.unmatched.map((name) => <div key={name} style={S.mono}>{name}</div>)}
          </div>
        </div>
      )}
      {state?.failed?.length > 0 && (
        <div style={{ marginTop: 10 }} data-panel="bulk-failed">
          <p style={S.hintStrong}>{t.bulkFailed} ({state.failed.length})</p>
          <ul style={S.problemList}>
            {state.failed.map((x) => <li key={x.name}><span style={S.mono}>{x.name}</span>: {x.why}</li>)}
          </ul>
        </div>
      )}
      {state?.note && <p style={S.hint}>{state.note}</p>}
    </section>
  );
}

/* ------------------------------ announcements ----------------------------- */

const SAMPLE_NEWS = [
  { id: 2, title: "Bahar dönemi vakaları açıldı",
    body: "Yedi alanda yeni vakalar listede. İlk haftanın vakası pazartesi açılıyor.",
    link: null, audience: "public", state: "live",
    starts_at: "2026-10-12T09:00:00+03:00", ends_at: null },
  { id: 1, title: "Kampüs haritası güncellendi",
    body: "Birimlerin katılım oranları artık haftalık gösteriliyor.",
    link: "https://www.sdu.edu.tr", audience: "members", state: "ended",
    starts_at: "2026-09-20T09:00:00+03:00", ends_at: "2026-10-01T00:00:00+03:00" },
];

const NEWS_LIMITS = { title: 120, body: 600 };
const EMPTY_NEWS = { id: null, title: "", body: "", link: "", audience: "public", place: "",
                     event: "", starts: "",
                     ends: "" };
const NEWS_TONE = { live: GOOD, scheduled: WARN, ended: MUTED };

/* A moment as a datetime-local field holds it: the browser's own time. */
function localInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fullDay(iso, lang) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? ""
    : d.toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB",
                           { day: "numeric", month: "long", year: "numeric" });
}

function newsWhen(t, lang, item) {
  const from = fullDay(item.starts_at, lang);
  return item.ends_at
    ? t.newsFromTo.replace("{from}", from).replace("{to}", fullDay(item.ends_at, lang))
    : t.newsOpenEnd.replace("{from}", from);
}

/* The places on the campus map an event can be set in, named in the language
   on screen. */
function usePlaces(offline) {
  const [places, setPlaces] = useState([]);
  useEffect(() => {
    if (offline) return undefined;
    let stop = false;
    fetch(`${API}/map/places`, { credentials: "include", headers: langHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!stop && d?.places) setPlaces(d.places); })
      .catch(() => {});
    return () => { stop = true; };
  }, [offline]);
  return places;
}

function eventTime(iso, lang) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? ""
    : d.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB",
                       { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function Announcements({ t, lang, narrow, live, offline }) {
  const canWrite = live.who.can_write;
  const places = usePlaces(offline);
  const placeName = (key) => places.find((p) => p.place === key)?.name ?? key;
  const [list, setList] = useState(null);
  const [form, setForm] = useState(EMPTY_NEWS);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(null);

  const load = React.useCallback(async () => {
    if (offline) { setList(SAMPLE_NEWS); return; }
    try { setList((await admin.announcements()).announcements); }
    catch (e) { setError(e.message); setList([]); }
  }, [offline]);
  useEffect(() => { load(); }, [load]);

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setFlash(null); };
  const ready = form.title.trim().length >= 3 && form.body.trim().length > 0
    && form.title.length <= NEWS_LIMITS.title && form.body.length <= NEWS_LIMITS.body;

  const save = async () => {
    if (offline) { setFlash({ ok: false, text: t.notSaved }); return; }
    setBusy(true); setError(null); setFlash(null);
    const body = {
      title: form.title, body: form.body, link: form.link.trim() || null,
      audience: form.audience,
      starts_at: form.starts ? new Date(form.starts).toISOString() : null,
      ends_at: form.ends ? new Date(form.ends).toISOString() : null,
      place: form.place || null,
      event_at: form.place && form.event ? new Date(form.event).toISOString() : null,
    };
    try {
      if (form.id) await admin.editAnnouncement(form.id, body);
      else await admin.addAnnouncement(body);
      setFlash({ ok: true, text: form.id ? t.newsUpdated : t.newsAdded });
      setForm(EMPTY_NEWS);
      load();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (offline) { setFlash({ ok: false, text: t.notSaved }); setAsking(null); return; }
    setBusy(true); setError(null);
    try {
      await admin.removeAnnouncement(id);
      setFlash({ ok: true, text: t.newsDeleted });
      if (form.id === id) setForm(EMPTY_NEWS);
      load();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); setAsking(null); }
  };

  const edit = (item) => {
    setForm({ id: item.id, title: item.title, body: item.body, link: item.link ?? "",
              audience: item.audience, starts: localInput(item.starts_at),
              ends: localInput(item.ends_at), place: item.place ?? "",
              event: localInput(item.event_at) });
    setFlash(null); setError(null);
  };

  const preview = {
    title: form.title.trim() || t.newsTitle, body: form.body.trim() || t.newsBody,
    link: form.link.trim(), starts_at: form.starts ? new Date(form.starts).toISOString()
                                                   : new Date().toISOString(),
  };

  return (
    <div style={{ ...S.split, gridTemplateColumns: narrow ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)" }}>
      {canWrite ? (
        <section style={S.card} data-panel="news-form">
          <div style={S.cardHead}>{form.id ? t.newsEdit : t.newsNew}</div>
          <label style={S.newsField}>
            <span style={S.fieldCap}>{t.newsTitle}</span>
            <input value={form.title} onChange={(e) => set({ title: e.target.value })}
              maxLength={NEWS_LIMITS.title + 20} style={{ ...S.input, width: "100%" }}
              data-field="news-title" />
            <span style={S.newsCount}>
              {t.newsChars.replace("{n}", form.title.length).replace("{max}", NEWS_LIMITS.title)}
            </span>
          </label>
          <label style={S.newsField}>
            <span style={S.fieldCap}>{t.newsBody}</span>
            <textarea value={form.body} onChange={(e) => set({ body: e.target.value })}
              rows={5} style={{ ...S.textarea, minHeight: 110 }} data-field="news-body" />
            <span style={S.newsCount}>
              {t.newsBodyHint} {t.newsChars.replace("{n}", form.body.length)
                .replace("{max}", NEWS_LIMITS.body)}
            </span>
          </label>
          <label style={S.newsField}>
            <span style={S.fieldCap}>{t.newsLink}</span>
            <input value={form.link} onChange={(e) => set({ link: e.target.value })}
              type="url" inputMode="url" placeholder="https://"
              style={{ ...S.input, width: "100%", fontFamily: MONO, fontSize: 13 }}
              data-field="news-link" />
            <span style={S.newsCount}>{t.newsLinkHint}</span>
          </label>
          <label style={S.newsField}>
            <span style={S.fieldCap}>{t.newsAudience}</span>
            <select value={form.audience} onChange={(e) => set({ audience: e.target.value })}
              style={{ ...S.select, marginTop: 0 }} data-field="news-audience">
              {["public", "members", "student", "staff"].map((a) => (
                <option key={a} value={a}>{t.newsAudiences[a]}</option>
              ))}
            </select>
          </label>
          <div style={S.newsDates}>
            <label style={S.newsField}>
              <span style={S.fieldCap}>{t.newsStart}</span>
              <input type="datetime-local" value={form.starts}
                onChange={(e) => set({ starts: e.target.value })}
                style={{ ...S.input, width: "100%", minWidth: 0 }} data-field="news-starts" />
              <span style={S.newsCount}>{t.newsStartHint}</span>
            </label>
            <label style={S.newsField}>
              <span style={S.fieldCap}>{t.newsEnd}</span>
              <input type="datetime-local" value={form.ends}
                onChange={(e) => set({ ends: e.target.value })}
                style={{ ...S.input, width: "100%", minWidth: 0 }} data-field="news-ends" />
              <span style={S.newsCount}>{t.newsEndHint}</span>
            </label>
          </div>
          <div style={S.newsDates}>
            <label style={S.newsField}>
              <span style={S.fieldCap}>{t.newsPlace}</span>
              <select value={form.place} onChange={(e) => set({ place: e.target.value })}
                style={{ ...S.select, marginTop: 0 }} data-field="news-place">
                <option value="">{t.newsPlaceNone}</option>
                {form.place && !places.some((p) => p.place === form.place) && (
                  <option value={form.place}>{form.place}</option>
                )}
                {places.map((p) => (
                  <option key={p.place} value={p.place}>
                    {/^\d+$/.test(p.place) ? `${p.place}. ${p.name}` : p.name}
                  </option>
                ))}
              </select>
              <span style={S.newsCount}>{t.newsPlaceHint}</span>
            </label>
            <label style={S.newsField}>
              <span style={S.fieldCap}>{t.newsEvent}</span>
              <input type="datetime-local" value={form.event} disabled={!form.place}
                onChange={(e) => set({ event: e.target.value })}
                style={{ ...S.input, width: "100%", minWidth: 0 }} data-field="news-event" />
              <span style={S.newsCount}>{t.newsEventHint}</span>
            </label>
          </div>

          <div style={S.blockLabel}>{t.newsPreview}</div>
          <div style={S.newsPreview} data-panel="news-preview">
            <div style={S.newsPreviewTitle} data-user-content>{preview.title}</div>
            <div style={S.newsPreviewDate}>{fullDay(preview.starts_at, lang)}</div>
            {form.place && (
              <div style={S.newsPreviewDate} data-preview-place={form.place}>
                📍 {placeName(form.place)}{form.event ? ` · ${eventTime(form.event, lang)}` : ""}
              </div>
            )}
            <p style={S.newsPreviewBody} data-user-content>{preview.body}</p>
            {/^https:\/\/\S+$/i.test(preview.link) && (
              <span style={S.newsPreviewLink}>{preview.link}</span>
            )}
          </div>

          {error && <div style={{ ...S.errline, margin: "12px 0 0" }} role="alert">{error}</div>}
          <div style={S.actions}>
            <button onClick={save} disabled={!ready || busy} data-action="news-save"
              style={{ ...S.primary, ...(!ready || busy ? S.disabled : null) }}>
              {busy ? "…" : form.id ? t.newsSave : t.newsPublish}
            </button>
            {form.id && (
              <button onClick={() => { setForm(EMPTY_NEWS); setError(null); }} style={S.ghost}>
                {t.newsCancel}
              </button>
            )}
            {flash && (
              <span style={{ ...S.flash, color: flash.ok ? GOOD : ACCENT }} role="status">
                {flash.text}
              </span>
            )}
          </div>
        </section>
      ) : (
        <section style={S.card} data-readonly>
          <p style={S.note}>{t.newsReadOnly}</p>
        </section>
      )}

      <section style={S.card} data-panel="news-list">
        <div style={S.cardHead}>{t.newsList}</div>
        {list === null && <p style={S.hint}>…</p>}
        {list?.length === 0 && <p style={S.hint}>{t.newsNone}</p>}
        <div style={S.list}>
          {(list ?? []).map((item) => (
            <div key={item.id} style={S.newsRow} data-announcement={item.id}
              data-state={item.state}>
              <div style={S.rowTop}>
                <span style={S.newsRowTitle} data-user-content>{item.title}</span>
                <span style={{ ...S.pill, color: inkOf(NEWS_TONE[item.state]), borderColor: NEWS_TONE[item.state] }}>
                  {t.newsStates[item.state] ?? item.state}
                </span>
              </div>
              <div style={S.newsRowMeta}>
                {t.newsAudienceShort[item.audience] ?? item.audience} · {newsWhen(t, lang, item)}
              </div>
              {item.place && (
                <div style={S.newsRowMeta} data-news-place={item.place}>
                  📍 {placeName(item.place)}{item.event_at ? ` · ${eventTime(item.event_at, lang)}` : ""}
                </div>
              )}
              <p style={S.newsRowBody} data-user-content>{item.body}</p>
              {canWrite && (asking === item.id ? (
                <div style={S.confirm}>
                  <p style={S.confirmBody}>{t.newsDeleteAsk}</p>
                  <div style={S.actions}>
                    <button onClick={() => remove(item.id)} disabled={busy} style={S.smallPrimary}
                      data-action="news-delete-yes">{t.newsDeleteYes}</button>
                    <button onClick={() => setAsking(null)} style={S.smallGhost}>{t.cancel}</button>
                  </div>
                </div>
              ) : (
                <div style={S.reviewActions}>
                  <button onClick={() => edit(item)} style={S.smallGhost}
                    data-action="news-edit">{t.newsEditBtn}</button>
                  <button onClick={() => setAsking(item.id)} style={S.smallGhost}
                    data-action="news-delete">{t.newsDelete}</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ----------------------------- marks and medals ---------------------------- */

const AWARD_GROUP_CODES = ["marks", "super", "mega", "ultra"];
const AWARD_DIMS = ["prompt_design", "verification", "integrity", "privacy", "manipulation",
                    "op_security", "boundaries"];
/* Each kind of condition with the settings it starts from. */
const RULE_START = {
  manual: {}, cases: { count: 10 }, case: { case_key: "", perfect: false },
  area: { dimension: "any", tier: 1, count: 3 }, level: { level: 3 }, streak: { weeks: 4 },
  calibration: { max_brier: 0.15, min_answers: 30 }, points: { points: 250 },
};
const EMPTY_AWARD = { id: null, category: "super", name_tr: "", name_en: "", what_tr: "",
                      what_en: "", rule: { kind: "cases", count: 10 }, active: true, position: 0 };

const SAMPLE_AWARDS = {
  categories: AWARD_GROUP_CODES.map((code) => ({ code })),
  awards: [
    { id: 1, code: "honest_doubt", category: "marks", name_tr: "Dürüst Tereddüt",
      name_en: "Honest Doubt",
      what_tr: "Yanıldığın on adımda bunu önceden sezip düşük bir güven (%50 ya da %60) seçmek. Bilmediğini bilmenin karşılığıdır.",
      what_en: null, rule: { kind: "honest_doubt" }, built_in: true, active: true, position: 3,
      image: null, holders: 246, by_hand: 0 },
    { id: 7, code: "award-7", category: "super", name_tr: "On Vaka", name_en: "Ten Cases",
      what_tr: "On vaka bitirmek.", what_en: "Finish ten cases.",
      rule: { kind: "cases", count: 10 }, built_in: false, active: true, position: 1,
      image: null, holders: 1278, by_hand: 0 },
    { id: 12, code: "award-12", category: "marks", name_tr: "Kampüs Elçisi",
      name_en: "Campus Envoy",
      what_tr: "Yapay zekâ okuryazarlığını kampüste yaygınlaştırmaya katkı verenlere yönetim tarafından verilir.",
      what_en: null, rule: { kind: "manual" }, built_in: false, active: true, position: 6,
      image: null, holders: 3, by_hand: 3 },
  ],
  can_write: true, can_grant: true,
};

const fillIn = (text, vars) => Object.entries(vars).reduce(
  (out, [k, v]) => out.split(`{${k}}`).join(String(v)), text);

/* A condition in words: shown in the list, and offered as the description. */
function ruleText(t, rule, cases) {
  const r = t.awR;
  switch (rule?.kind) {
    case "manual": return r.manual;
    case "cases": return fillIn(r.cases, { n: rule.count });
    case "case": {
      const title = cases.find((c) => c.key === rule.case_key)?.title ?? rule.case_key;
      return fillIn(rule.perfect ? r.casePerfect : r.case, { c: `“${title}”` });
    }
    case "area": return rule.dimension === "any"
      ? fillIn(r.areaAny, { k: rule.count, tier: t.awTiers[rule.tier - 1] })
      : fillIn(r.areaOne, { area: t.awDims[rule.dimension], tier: t.awTiers[rule.tier - 1] });
    case "level": return fillIn(r.level, { n: rule.level, name: t.awLevels[rule.level] });
    case "streak": return fillIn(r.streak, { n: rule.weeks });
    case "calibration": return fillIn(r.calibration, {
      n: rule.min_answers,
      b: Number(rule.max_brier).toLocaleString(t === L.en ? "en-GB" : "tr-TR",
                                               { minimumFractionDigits: 2 }) });
    case "points": return fillIn(r.points, { n: rule.points });
    default: return "";
  }
}

/* A square picture, redrawn in the browser at most 512 × 512, so nothing
   written alongside the original (a location, the device, dates) is sent. */
async function prepareMedal(file, t) {
  if (!PICTURE_TYPES.includes(file.type)) throw new Error(t.picType);
  if (file.size > PICTURE_MAX) throw new Error(t.picTooBig);
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error(t.picUnreadable); }
  const side = Math.min(512, bitmap.width, bitmap.height);
  if (side < 96) {
    bitmap.close?.();
    throw new Error(t.awPicTooSmall);
  }
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const scale = Math.max(side / bitmap.width, side / bitmap.height);
  const w = bitmap.width * scale, h = bitmap.height * scale;
  canvas.getContext("2d").drawImage(bitmap, (side - w) / 2, (side - h) / 2, w, h);
  bitmap.close?.();
  const encode = (type, quality) => new Promise((done) => canvas.toBlob(done, type, quality));
  // WebP keeps a transparent background; a browser that cannot write it gets PNG.
  let blob = await encode("image/webp", 0.9);
  if (!blob || blob.type !== "image/webp") blob = await encode("image/png");
  if (!blob) throw new Error(t.picUnreadable);
  return blob;
}

/* What the award looks like to the people who earn it, in the panel's list. */
const asShown = (a, lang) => ({ ...a, name: (lang === "en" && a.name_en) || a.name_tr });

function Awards({ t, lang, narrow, live, offline }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY_AWARD);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(null);
  const [opened, setOpened] = useState(null);         // the award whose holders are shown
  const cases = live.cases ?? [];

  const load = React.useCallback(async () => {
    if (offline) { setData(SAMPLE_AWARDS); return; }
    try { setData(await admin.awards()); }
    catch (e) { setError(e.message); setData({ awards: [], can_write: false, can_grant: false }); }
  }, [offline]);
  useEffect(() => { load(); }, [load]);

  const canWrite = data?.can_write ?? live.who.can_write;
  const canGrant = data?.can_grant ?? false;
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setFlash(null); };
  const setRule = (patch) => set({ rule: { ...form.rule, ...patch } });
  const ready = form.name_tr.trim().length >= 2 && form.what_tr.trim().length >= 5
    && (form.rule.kind !== "case" || form.rule.case_key);

  const suggest = () => set({ what_tr: ruleText(L.tr, form.rule, cases),
                              what_en: ruleText(L.en, form.rule, cases) });

  const save = async () => {
    if (offline) { setFlash({ ok: false, text: t.notSaved }); return; }
    setBusy(true); setError(null); setFlash(null);
    const { id, ...body } = form;
    try {
      const out = id ? await admin.editAward(id, body) : await admin.addAward(body);
      const said = id ? t.awUpdated : t.awAdded;
      setFlash({ ok: true, text: out.checking ? `${said} ${t.awChecking}` : said });
      // A new one stays open for its picture.
      setForm(id ? EMPTY_AWARD : { ...EMPTY_AWARD, ...pick(out) });
      load();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const pick = (a) => ({ id: a.id, category: a.category, name_tr: a.name_tr,
                         name_en: a.name_en ?? "", what_tr: a.what_tr, what_en: a.what_en ?? "",
                         rule: a.rule, active: a.active, position: a.position });
  const edit = (a) => { setForm(pick(a)); setFlash(null); setError(null); window.scrollTo(0, 0); };

  const remove = async (id) => {
    if (offline) { setFlash({ ok: false, text: t.notSaved }); setAsking(null); return; }
    setBusy(true); setError(null);
    try {
      await admin.removeAward(id);
      setFlash({ ok: true, text: t.awDeleted });
      if (form.id === id) setForm(EMPTY_AWARD);
      load();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); setAsking(null); }
  };

  const current = form.id ? data?.awards?.find((a) => a.id === form.id) : null;
  const groups = AWARD_GROUP_CODES.map((code) => ({
    code, awards: (data?.awards ?? []).filter((a) => a.category === code) }))
    .filter((g) => g.awards.length > 0);
  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));

  return (
    <div style={S.stack}>
      <section style={S.card}>
        <p style={{ ...S.note, margin: 0 }}>{t.awIntro}</p>
      </section>
      <div style={{ ...S.split, gridTemplateColumns: narrow ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)" }}>
        {canWrite ? (
          <section style={S.card} data-panel="award-form">
            <div style={S.cardHead}>{form.id ? t.awEdit : t.awNew}</div>
            <label style={S.newsField}>
              <span style={S.fieldCap}>{t.awGroup}</span>
              <select value={form.category} onChange={(e) => set({ category: e.target.value })}
                style={{ ...S.select, marginTop: 0 }} data-field="award-category">
                {AWARD_GROUP_CODES.map((c) => <option key={c} value={c}>{t.awGroups[c]}</option>)}
              </select>
            </label>
            <div style={S.newsDates}>
              <label style={S.newsField}>
                <span style={S.fieldCap}>{t.awName}</span>
                <input value={form.name_tr} onChange={(e) => set({ name_tr: e.target.value })}
                  maxLength={80} style={{ ...S.input, width: "100%", minWidth: 0 }}
                  data-field="award-name" />
              </label>
              <label style={S.newsField}>
                <span style={S.fieldCap}>{t.awNameEn}</span>
                <input value={form.name_en} onChange={(e) => set({ name_en: e.target.value })}
                  maxLength={80} style={{ ...S.input, width: "100%", minWidth: 0 }}
                  data-field="award-name-en" />
              </label>
            </div>

            <label style={S.newsField}>
              <span style={S.fieldCap}>{t.awRule}</span>
              <select value={form.rule.kind} data-field="award-kind"
                onChange={(e) => set({ rule: { kind: e.target.value, ...RULE_START[e.target.value] } })}
                style={{ ...S.select, marginTop: 0 }}>
                {Object.keys(RULE_START).map((k) => <option key={k} value={k}>{t.awKinds[k]}</option>)}
              </select>
            </label>
            <RuleFields t={t} rule={form.rule} setRule={setRule} cases={cases} num={num} />

            <label style={S.newsField}>
              <span style={S.fieldCap}>{t.awWhat}</span>
              <textarea value={form.what_tr} onChange={(e) => set({ what_tr: e.target.value })}
                rows={3} style={{ ...S.textarea, minHeight: 70 }} data-field="award-what" />
              <span style={S.newsCount}>{t.awWhatHint}</span>
            </label>
            <label style={S.newsField}>
              <span style={S.fieldCap}>{t.awWhatEn}</span>
              <textarea value={form.what_en} onChange={(e) => set({ what_en: e.target.value })}
                rows={2} style={{ ...S.textarea, minHeight: 56 }} data-field="award-what-en" />
            </label>
            <div style={S.actions}>
              <button type="button" onClick={suggest} style={S.smallGhost} data-action="award-suggest">
                {t.awSuggest}
              </button>
            </div>

            <label style={{ ...S.newsField, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.active} data-field="award-active"
                onChange={(e) => set({ active: e.target.checked })} />
              <span style={S.fieldCap}>{t.awActive}</span>
            </label>
            <p style={{ ...S.hint, marginTop: 2 }}>{t.awActiveHint}</p>

            {current ? (
              <AwardPicture t={t} award={current} offline={offline} reload={load} />
            ) : (
              <p style={S.hint}>{t.awPicAfter}</p>
            )}

            {error && <div style={{ ...S.errline, margin: "12px 0 0" }} role="alert">{error}</div>}
            <div style={S.actions}>
              <button onClick={save} disabled={!ready || busy} data-action="award-save"
                style={{ ...S.primary, ...(!ready || busy ? S.disabled : null) }}>
                {busy ? "…" : form.id ? t.awSave : t.awAdd}
              </button>
              {form.id && (
                <button onClick={() => { setForm(EMPTY_AWARD); setError(null); setFlash(null); }}
                  style={S.ghost}>{t.awCancel}</button>
              )}
              {flash && (
                <span style={{ ...S.flash, color: flash.ok ? GOOD : ACCENT }} role="status">
                  {flash.text}
                </span>
              )}
            </div>
          </section>
        ) : (
          <section style={S.card} data-readonly>
            <p style={S.note}>{t.awReadOnly}</p>
          </section>
        )}

        <section style={S.card} data-panel="award-list">
          <div style={S.cardHead}>{t.awList}</div>
          {data === null && <p style={S.hint}>…</p>}
          {groups.map((g) => (
            <div key={g.code} data-award-group={g.code}>
              <div style={S.blockLabel}>{t.awGroupsMany[g.code]}</div>
              <div style={S.list}>
                {g.awards.map((a) => (
                  <div key={a.id} style={S.newsRow} data-award={a.code}
                    data-active={a.active ? "1" : "0"}>
                    <div style={S.awardTop}>
                      <AwardImage award={asShown(a, lang)} size={44} locked={!a.active} alt="" />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={S.rowTop}>
                          <span style={S.newsRowTitle}>{lang === "en" && a.name_en ? a.name_en : a.name_tr}</span>
                          <span style={{ ...S.pill, color: a.active ? GOOD : MUTED,
                                         borderColor: a.active ? GOOD : LINE }}>
                            {a.built_in ? t.awBuiltIn : a.active ? t.awOn : t.awOff}
                          </span>
                        </div>
                        <p style={S.newsRowBody}>{lang === "en" && a.what_en ? a.what_en : a.what_tr}</p>
                        {!a.built_in && (
                          <div style={S.newsRowMeta} data-award-rule>
                            {t.awRuleLabel}: {ruleText(t, a.rule, cases)}
                          </div>
                        )}
                        <div style={S.newsRowMeta}>
                          {fillIn(t.awHolders, { n: a.holders.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB") })}
                          {a.by_hand ? ` · ${fillIn(t.awByHand, { n: a.by_hand })}` : ""}
                        </div>
                      </div>
                    </div>
                    <div style={S.reviewActions}>
                      <button onClick={() => setOpened(opened === a.id ? null : a.id)}
                        style={S.smallGhost} data-action="award-holders"
                        aria-expanded={opened === a.id}>{t.awHoldersBtn}</button>
                      {canWrite && !a.built_in && (
                        <button onClick={() => edit(a)} style={S.smallGhost}
                          data-action="award-edit">{t.awEditBtn}</button>
                      )}
                      {canWrite && !a.built_in && asking !== a.id && (
                        <button onClick={() => (a.holders ? setFlash({ ok: false, text: t.awCantDelete })
                                                          : setAsking(a.id))}
                          style={S.smallGhost} data-action="award-delete">{t.awDeleteBtn}</button>
                      )}
                    </div>
                    {asking === a.id && (
                      <div style={S.confirm}>
                        <p style={S.confirmBody}>{t.awDeleteAsk}</p>
                        <div style={S.actions}>
                          <button onClick={() => remove(a.id)} disabled={busy} style={S.smallPrimary}
                            data-action="award-delete-yes">{t.awDeleteYes}</button>
                          <button onClick={() => setAsking(null)} style={S.smallGhost}>{t.cancel}</button>
                        </div>
                      </div>
                    )}
                    {opened === a.id && (
                      <Holders t={t} lang={lang} award={a} offline={offline} canGrant={canGrant}
                        me={live.who.person_id} onChange={load} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

/* The settings of a condition, as its kind asks for them. */
function RuleFields({ t, rule, setRule, cases, num }) {
  const field = (cap, input) => (
    <label style={S.newsField}><span style={S.fieldCap}>{cap}</span>{input}</label>);
  const numberInput = (key, lo, hi, step = 1) => (
    <input type="number" min={lo} max={hi} step={step} value={rule[key]} data-field={`award-${key}`}
      onChange={(e) => setRule({ [key]: step < 1 ? Number(e.target.value)
                                                 : num(e.target.value, lo, hi) })}
      style={{ ...S.input, width: "100%", minWidth: 0 }} />);
  switch (rule.kind) {
    case "cases": return field(t.awCount, numberInput("count", 1, 1000));
    case "case": return (
      <>
        {field(t.awCase, (
          <select value={rule.case_key} onChange={(e) => setRule({ case_key: e.target.value })}
            style={{ ...S.select, marginTop: 0 }} data-field="award-case">
            <option value="">…</option>
            {cases.map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
          </select>))}
        <label style={{ ...S.newsField, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={!!rule.perfect}
            onChange={(e) => setRule({ perfect: e.target.checked })} data-field="award-perfect" />
          <span style={S.fieldCap}>{t.awPerfect}</span>
        </label>
      </>);
    case "area": return (
      <div style={S.newsDates}>
        {field(t.awArea, (
          <select value={rule.dimension} style={{ ...S.select, marginTop: 0 }} data-field="award-area"
            onChange={(e) => setRule(e.target.value === "any"
              ? { dimension: "any", count: rule.count ?? 3 } : { dimension: e.target.value })}>
            <option value="any">{t.awAnyArea}</option>
            {AWARD_DIMS.map((d) => <option key={d} value={d}>{t.awDims[d]}</option>)}
          </select>))}
        {field(t.awTier, (
          <select value={rule.tier} style={{ ...S.select, marginTop: 0 }} data-field="award-tier"
            onChange={(e) => setRule({ tier: Number(e.target.value) })}>
            {t.awTiers.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
          </select>))}
        {rule.dimension === "any" && field(t.awAreas, numberInput("count", 1, 7))}
      </div>);
    case "level": return field(t.awLevel, (
      <select value={rule.level} style={{ ...S.select, marginTop: 0 }} data-field="award-level"
        onChange={(e) => setRule({ level: Number(e.target.value) })}>
        {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}. {t.awLevels[n]}</option>)}
      </select>));
    case "streak": return field(t.awWeeks, numberInput("weeks", 2, 52));
    case "calibration": return (
      <div style={S.newsDates}>
        {field(t.awBrier, numberInput("max_brier", 0.01, 0.25, 0.01))}
        {field(t.awAnswers, numberInput("min_answers", 10, 500))}
      </div>);
    case "points": return field(t.awPoints, numberInput("points", 10, 100000));
    default: return null;
  }
}

function AwardPicture({ t, award, offline, reload }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const pick = React.useRef(null);
  const choose = async (file) => {
    if (!file) return;
    if (offline) { setNote({ ok: false, text: t.notSaved }); return; }
    setBusy(true);
    setNote({ ok: true, text: t.picWorking });
    try {
      const blob = await prepareMedal(file, t);
      await admin.setAwardImage(award.id, blob, `${award.code}.${blob.type === "image/webp" ? "webp" : "png"}`);
      setNote({ ok: true, text: t.awPicDone });
      reload();
    } catch (e) {
      setNote({ ok: false, text: e.message });
    } finally {
      setBusy(false);
      if (pick.current) pick.current.value = "";
    }
  };
  const remove = async () => {
    if (offline) { setNote({ ok: false, text: t.notSaved }); return; }
    setBusy(true);
    try {
      await admin.removeAwardImage(award.id);
      setNote({ ok: true, text: t.awPicRemoved });
      reload();
    } catch (e) {
      setNote({ ok: false, text: e.message });
    } finally { setBusy(false); }
  };
  return (
    <div data-panel="award-picture" style={{ marginTop: 12 }}>
      <div style={S.blockLabel}>{t.awPic}</div>
      <div style={S.picRow}>
        <div style={{ ...S.picFrame, width: 112, height: 112, aspectRatio: "auto" }}>
          <AwardImage award={award} size={96} alt="" />
        </div>
        <div style={S.picSide}>
          <div style={S.picActions}>
            <label style={{ ...S.fileLabel, ...(busy ? S.disabled : null) }} data-file>
              <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp"
                onChange={(e) => choose(e.target.files?.[0])} style={S.fileInput}
                disabled={busy} data-field="award-picture" />
              {award.image ? t.awPicReplace : t.awPicUpload}
            </label>
            {award.image && (
              <button onClick={remove} disabled={busy} style={S.smallGhost}
                data-action="award-picture-remove">{t.awPicRemove}</button>
            )}
          </div>
          <p style={S.hint}>{t.awPicHint}</p>
          {note && (
            <p style={{ ...S.hint, color: note.ok ? GOOD : ACCENT }} role="status">{note.text}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* Who holds a mark or medal, and giving or taking back by hand. */
function Holders({ t, lang, award, offline, canGrant, me, onChange }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(async () => {
    if (offline) { setList({ total: 0, holders: [] }); return; }
    try { setList(await admin.holders(award.id)); }
    catch (e) { setNote({ ok: false, text: e.message }); setList({ total: 0, holders: [] }); }
  }, [award.id, offline]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (offline || q.trim().length < 2) { setFound([]); return undefined; }
    const timer = setTimeout(async () => {
      try { setFound((await admin.people({ q: q.trim(), limit: 8 })).items ?? []); }
      catch { setFound([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, offline]);

  const act = async (work, said) => {
    setBusy(true); setNote(null);
    try { await work(); setNote({ ok: true, text: said }); await load(); onChange(); }
    catch (e) { setNote({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };
  const held = new Set((list?.holders ?? []).map((h) => h.person_id));
  const mayGive = canGrant && !award.built_in && award.active;

  return (
    <div style={S.holders} data-panel="award-holders">
      {list === null && <p style={S.hint}>…</p>}
      {list?.holders?.length === 0 && <p style={S.hint}>{t.awNoHolders}</p>}
      {(list?.holders ?? []).map((h) => (
        <div key={h.person_id} style={S.holderRow} data-holder={h.person_id}>
          <Avatar code={h.avatar} label={h.username ?? h.name ?? "?"} size={28} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={S.holderName}>{h.name ?? h.username ?? `#${h.person_id}`}
              {h.username && h.name ? <span style={S.mono}> @{h.username}</span> : null}</div>
            <div style={S.newsRowMeta}>
              {stamp(lang, h.earned_at)} · {h.by_hand ? t.awGiven
                : h.case_key ? fillIn(t.awWithCase, { c: h.case_key }) : ""}
            </div>
          </div>
          {canGrant && h.by_hand && h.person_id !== me && (
            <button style={S.smallGhost} disabled={busy} data-action="award-revoke"
              onClick={() => act(() => admin.revoke(award.id, h.person_id), t.awRevoked)}>
              {t.awRevoke}
            </button>
          )}
        </div>
      ))}
      {list && list.total > list.holders.length && (
        <p style={S.hint}>{fillIn(t.awMore, { n: list.holders.length })}</p>
      )}
      {award.built_in ? (
        <p style={S.hint}>{t.awBuiltInNote}</p>
      ) : !canGrant ? (
        <p style={S.hint}>{t.awGrantOnlyFull}</p>
      ) : mayGive && (
        <div style={{ marginTop: 8 }}>
          <div style={S.blockLabel}>{t.awGrantHead}</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.awGrantFind}
            style={{ ...S.input, width: "100%", minWidth: 0 }} data-field="award-grant-find" />
          {found.filter((p) => !held.has(p.person_id) && p.person_id !== me).map((p) => (
            <div key={p.person_id} style={S.holderRow} data-candidate={p.person_id}>
              <Avatar code={p.avatar} label={p.username ?? p.name ?? "?"} size={28} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={S.holderName}>{p.name}{p.username ? <span style={S.mono}> @{p.username}</span> : null}</div>
              </div>
              <button style={S.smallPrimary} disabled={busy} data-action="award-grant"
                onClick={() => act(() => admin.grant(award.id, p.person_id), t.awGranted)}>
                {t.awGrantBtn}
              </button>
            </div>
          ))}
        </div>
      )}
      {note && <p style={{ ...S.hint, color: note.ok ? GOOD : ACCENT }} role="status">{note.text}</p>}
    </div>
  );
}

/* --------------------------------- answers -------------------------------- */

const SAMPLE_REVEAL = {
  rule: { min_answers: 30, min_share: 0.6 },
  cases: [
    { key: "2026-W34-fabricated-citation", title: "Var Olmayan Kaynak", open: true,
      reason: "closed", finished: 412, reach: 4392, share: 0.094 },
    { key: "core-01-family-health-query", title: "Annenin Tahlil Sonucu", open: true,
      reason: "saturation", finished: 2840, reach: 4392, share: 0.647 },
    { key: "2026-W35-voice-clone", title: "Sesi Tanıdık Gelen Arama", open: false,
      reason: null, finished: 0, reach: 4392, share: 0 },
    { key: "core-03-confident-and-wrong", title: "Emin Ama Yanlış", open: false,
      reason: "held", finished: 1904, reach: 4392, share: 0.434 },
  ],
};

function Answers({ t, narrow, offline }) {
  const [data, setData] = useState(null);
  const [minAnswers, setMinAnswers] = useState("");
  const [minShare, setMinShare] = useState("");
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = React.useCallback(async () => {
    let d = SAMPLE_REVEAL;
    if (!offline) {
      try { d = await admin.reveal(); } catch (e) { setFlash(e.message); }
    }
    setData(d);
    setMinAnswers(String(d.rule.min_answers));
    setMinShare(String(Math.round(d.rule.min_share * 1000) / 10));
  }, [offline]);
  useEffect(() => { load(); }, [load]);

  if (!data) return null;
  const rule = data.rule;
  const needed = (c) => Math.max(rule.min_answers, Math.ceil(rule.min_share * c.reach));
  const ruleValid = Number(minAnswers) >= 1 && Number(minShare) > 0 && Number(minShare) <= 100;

  const saveRule = async () => {
    if (offline) { setFlash(t.notSaved); return; }
    setBusy("rule");
    try {
      await admin.revealRule(Math.round(Number(minAnswers)), Number(minShare) / 100);
      setFlash(t.ruleSaved);
      await load();
    } catch (e) { setFlash(e.message); }
    finally { setBusy(null); }
  };
  const flip = async (key, open) => {
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(key);
    try { await admin.revealSwitch(key, open); await load(); }
    catch (e) { setFlash(e.message); }
    finally { setBusy(null); }
  };

  const ordered = [...data.cases].sort((a, b) =>
    (a.open - b.open) || ((b.finished / Math.max(1, needed(b))) - (a.finished / Math.max(1, needed(a)))));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section style={S.card}>
        <div style={S.cardHead}>{t.ruleHead}</div>
        <p style={S.note}>{t.ruleWhat}</p>
        <div style={S.ruleForm}>
          <label style={S.ruleField}>
            <span style={S.ruleCap}>{t.minAnswers}</span>
            <input type="number" min="1" step="1" value={minAnswers}
              onChange={(e) => setMinAnswers(e.target.value)} style={S.input}
              data-field="min-answers" />
          </label>
          <label style={S.ruleField}>
            <span style={S.ruleCap}>{t.minShare}</span>
            <input type="number" min="1" max="100" step="1" value={minShare}
              onChange={(e) => setMinShare(e.target.value)} style={S.input}
              data-field="min-share" />
          </label>
        </div>
        <div style={S.actions}>
          <button onClick={saveRule} disabled={!ruleValid || busy === "rule"}
            style={{ ...S.primary, ...(!ruleValid || busy === "rule" ? S.disabled : null) }}
            data-action="save-rule">
            {t.saveRule}
          </button>
          {flash && <span style={S.flash} role="status">{flash}</span>}
        </div>
      </section>

      <section style={S.card}>
        <div style={S.cardHead}>{t.revealCases}</div>
        <div style={{ display: "grid", gap: 6 }}>
          {ordered.map((c) => {
            const need = needed(c);
            const share = Math.min(1, need ? c.finished / need : 1);
            const state = c.reason ?? "none";
            return (
              <div key={c.key} data-reveal-case={c.key}
                style={{ ...S.revealRow, ...(narrow ? { gridTemplateColumns: "1fr" } : null) }}>
                <div style={S.revealMain}>
                  <div style={S.caseTitle} data-user-content>{c.title}</div>
                  <div style={S.caseMeta}>{c.key}</div>
                </div>
                <div style={S.revealMeter}>
                  <span style={S.barTrack}>
                    <span style={{ ...S.barFill, width: `${Math.round(share * 100)}%`,
                                   background: c.open ? GOOD : ACCENT }} />
                  </span>
                  <span style={S.revealNums}>
                    {t.finishedOf.replace("{f}", c.finished).replace("{r}", c.reach)}
                  </span>
                </div>
                <span style={{ ...S.pill, color: c.open ? GOOD : state === "held" ? ACCENT : MUTED,
                               borderColor: c.open ? GOOD : state === "held" ? ACCENT : LINE }}>
                  {t.revealState[state]}
                </span>
                <div style={S.reviewActions}>
                  {!c.open && (
                    <button onClick={() => flip(c.key, true)} disabled={busy === c.key}
                      style={S.smallPrimary}>{t.openNow}</button>
                  )}
                  {state !== "held" && (
                    <button onClick={() => flip(c.key, false)} disabled={busy === c.key}
                      style={S.smallGhost}>{t.holdClosed}</button>
                  )}
                  {(state === "held" || state === "manual") && (
                    <button onClick={() => flip(c.key, null)} disabled={busy === c.key}
                      style={S.smallGhost}>{t.backToRule}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatusPill({ t, status }) {
  const tone = { live: GOOD, scheduled: WARN, archived: MUTED };
  const colour = tone[status] ?? MUTED;
  const label = t.status[status] ?? status;
  return <span style={{ ...S.pill, color: inkOf(colour), borderColor: colour }}>{label}</span>;
}

/* --------------------------------- review --------------------------------- */

function Review({ t, lang, live, offline, reload }) {
  const [items, setItems] = useState(live.review);
  const [busy, setBusy] = useState(null);
  const [unitFor, setUnitFor] = useState({});
  const [voiding, setVoiding] = useState(null);     // the item whose attempt is being set aside
  const [reason, setReason] = useState("");
  const [flash, setFlash] = useState(null);
  const canJudge = live.who.can_suspend;
  useEffect(() => { setItems(live.review); }, [live.review]);

  const close = async (id, action, note = null) => {
    // The row leaves the queue only once the server confirms, so a failed
    // request keeps it in place.
    if (offline) { setItems((x) => x.filter((i) => i.id !== id)); return; }
    setBusy(id); setFlash(null);
    try {
      const r = await admin.resolve(id, action, note, unitFor[id] ? Number(unitFor[id]) : null);
      setItems((x) => x.filter((i) => i.id !== id));
      if (action === "void") {
        setVoiding(null); setReason("");
        setFlash(t.voidDone.replace("{points}", num(r?.points ?? 0, lang)));
      }
      reload();
    } catch (e) {
      // Kept in place; a refusal to set an attempt aside says why.
      if (action === "void") setFlash(e.message);
    }
    finally { setBusy(null); }
  };
  return (
    <section style={S.card}>
      <div style={S.cardHead}>
        {t.queue}<span style={S.mono}> · {items.length} {t.inQueue}</span>
      </div>
      <p style={S.note}>{t.queueNote}</p>
      {flash && <p style={S.flash} role="status">{flash}</p>}
      {items.length === 0 && <p style={S.hint}>{t.empty}</p>}
      <div style={S.list}>
        {items.map((i) => (
          <div key={i.id} style={{ ...S.reviewRow, flexWrap: "wrap" }} data-review={i.reason}>
            <div style={S.reviewMain}>
              <div style={S.rowTop}>
                <span style={S.reviewName} data-user-content>{i.name ?? "—"}</span>
                <span style={{ ...S.pill,
                               color: REASON_TONE[i.reason] ?? ACCENT,
                               borderColor: REASON_TONE[i.reason] ?? ACCENT }}>
                  {t.reasons[i.reason] ?? i.reason}
                </span>
              </div>
              <div style={S.reviewMeta}>
                {i.unit ?? "—"} · {t.roles[i.role] ?? i.role} ·{" "}
                {i.days === 0 ? t.today
                  : i.days ? plural(t, "daysAgo", i.days).replace("{n}", i.days)
                  : i.opened_at ? new Date(i.opened_at).toLocaleDateString(
                    t === L.en ? "en-GB" : "tr-TR") : ""}
              </div>
              {i.fast ? (
                <div style={S.reviewDetail} data-fast>
                  <span data-user-content>{i.fast.title}</span>
                  {" · "}
                  {t.fastLine.replace("{time}", duration(i.fast.seconds, lang))
                    .replace("{minutes}", Math.round((i.fast.expected ?? 0) / 60))
                    .replace("{right}", i.fast.right).replace("{steps}", i.fast.steps)}
                </div>
              ) : <div style={S.reviewDetail}>{i.detail}</div>}
            </div>
            {i.reason === "fast_finish" ? (
              <div style={S.reviewActions}>
                {canJudge && i.attempt_id && (
                  <button onClick={() => { setVoiding(voiding === i.id ? null : i.id); setReason(""); }}
                    disabled={busy === i.id} style={S.smallPrimary} data-action="void-open">
                    {t.voidAction}
                  </button>
                )}
                <button onClick={() => close(i.id, "dismiss")} disabled={busy === i.id}
                  style={S.smallGhost} data-action="fast-fine">{t.fastFine}</button>
              </div>
            ) : (
            <div style={S.reviewActions}>
              {i.reason === "unit_change" && (
                <select style={S.selectSmall} value={unitFor[i.id] ?? ""}
                  onChange={(e) => setUnitFor((m) => ({ ...m, [i.id]: e.target.value }))}>
                  <option value="">{t.moveTo}…</option>
                  {live.units.filter((u) => u.selectable).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              )}
              <button onClick={() => close(i.id, "resolve")} disabled={busy === i.id}
                style={S.smallPrimary}>{t.resolve}</button>
              <button onClick={() => close(i.id, "dismiss")} disabled={busy === i.id}
                style={S.smallGhost}>{t.dismiss}</button>
            </div>
            )}
            {voiding === i.id && (
              <div style={{ ...S.confirm, flexBasis: "100%" }} data-form="void">
                <div style={S.confirmTitle}>{t.voidAction}</div>
                <p style={S.confirmBody}>{t.voidWhat}</p>
                <label style={S.fieldCap}>{t.voidReason}</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                  maxLength={500} style={S.textarea} data-field="void-reason" />
                <div style={S.reviewActions}>
                  <button onClick={() => close(i.id, "void", reason.trim())}
                    disabled={busy === i.id || reason.trim().length < 5}
                    style={{ ...S.smallPrimary,
                             ...(busy === i.id || reason.trim().length < 5 ? S.disabled : null) }}
                    data-action="void-confirm">{t.voidConfirm}</button>
                  <button onClick={() => setVoiding(null)} style={S.smallGhost}>{t.cancel}</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* A length of time as minutes and seconds: "1 dk 12 sn", "1 min 12 s". */
function duration(seconds, lang) {
  const total = Math.max(1, Math.round(seconds ?? 0));
  const m = Math.floor(total / 60), sec = total % 60;
  const [mu, su] = lang === "en" ? ["min", "s"] : ["dk", "sn"];
  return m ? `${m} ${mu}${sec ? ` ${sec} ${su}` : ""}` : `${sec} ${su}`;
}

/* A number as the interface writes it: 12,5 or 12.5. */
function num(x, lang) {
  const text = String(Math.round(Number(x) * 10) / 10);
  return lang === "en" ? text : text.replace(".", ",");
}

/* --------------------------------- people --------------------------------- */

/* What a person writes about themselves is read here before anyone else sees
   it, and an account that is misused is suspended here. A person's first
   profile is already in use while it waits; approving it makes it public. A
   later change waits while the approved profile stays. Everyone with an
   account is listed here as well, with their address for a full
   administrator, who can also edit a profile directly. */

const PROFILE_ROWS = ["given_name", "family_name", "title", "username", "unit", "role", "bio"];

function profileValue(t, row, field) {
  if (!row) return "";
  if (field === "unit") return [row.faculty, row.department].filter(Boolean).join(" / ");
  if (field === "role") return t.roles[row.role] ?? row.role ?? "";
  return row[field] ?? "";
}

function stamp(lang, iso, withTime = false) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return withTime
    ? d.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium", timeStyle: "short" })
    : d.toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium" });
}

function People({ t, lang, live, offline, onCount }) {
  // A suspension started or lifted in one card shows in the other too, a
  // decision in the queue shows in the list, and an edit in the list closes
  // what was waiting in the queue.
  const [version, setVersion] = useState(0);
  const [queueVersion, setQueueVersion] = useState(0);
  const changed = () => setVersion((v) => v + 1);
  return (
    <div style={S.stack}>
      <ProfileQueue t={t} lang={lang} live={live} offline={offline} onCount={onCount}
        version={queueVersion} onDecided={changed} />
      <FindPerson t={t} lang={lang} live={live} offline={offline} version={version}
        onChange={changed} onEdited={() => setQueueVersion((v) => v + 1)} />
      <SuspendedList t={t} lang={lang} live={live} offline={offline} version={version}
        onChange={changed} />
    </div>
  );
}

function ProfileQueue({ t, lang, live, offline, onCount, version, onDecided }) {
  const [items, setItems] = useState(live.peopleQueue.items ?? []);
  const [recent, setRecent] = useState(null);
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState(null);     // the item being turned down
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  useEffect(() => { setItems(live.peopleQueue.items ?? []); }, [live.peopleQueue]);
  // An edit in the list closes the change that was waiting for that person.
  useEffect(() => {
    if (!version || offline) return undefined;
    let off = false;
    admin.profileChanges("pending").then((fresh) => {
      if (!off) { setItems(fresh.items); onCount?.(fresh.waiting); }
    }).catch(() => {});
    return () => { off = true; };
  }, [version]);
  const canDecide = live.who.can_write;

  const decide = async (item, action) => {
    setError(null);
    if (offline) {
      setItems((x) => x.filter((i) => i.id !== item.id));
      onCount?.(Math.max(0, items.length - 1));
      return;
    }
    setBusy(item.id);
    try {
      await admin.decideProfile(item.id, action, action === "reject" ? reason.trim() : null);
      const fresh = await admin.profileChanges("pending");
      setItems(fresh.items); onCount?.(fresh.waiting);
      setRejecting(null); setReason("");
      onDecided?.();
      if (recent) setRecent((await admin.profileChanges("decided")).items);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(null); }
  };

  const toggleRecent = async () => {
    if (recent) { setRecent(null); return; }
    if (offline) { setRecent(SAMPLE_PEOPLE.decided); return; }
    try { setRecent((await admin.profileChanges("decided")).items); }
    catch (e) { setError(e.message); }
  };

  return (
    <section style={S.card} data-card="profile-queue">
      <div style={S.headRow}>
        <div style={{ ...S.cardHead, marginBottom: 0 }}>
          {t.pqHead}<span style={S.mono}> · {plural(t, "pqWaiting", items.length).replace("{n}", items.length)}</span>
        </div>
        <button onClick={toggleRecent} style={S.linkBtn}>
          {recent ? t.pqHideRecent : t.pqRecent}
        </button>
      </div>
      <p style={S.note}>{t.pqNote}</p>
      {!canDecide && <p style={S.hint}>{t.pqReadOnly}</p>}
      {error && <div style={S.errline} role="alert">{error}</div>}
      {items.length === 0 && <p style={S.hint}>{t.pqEmpty}</p>}
      <div style={S.list}>
        {items.map((item) => (
          <ChangeRow key={item.id} t={t} lang={lang} item={item}>
            {item.own ? (
              <p style={S.hint}>{t.pqOwn}</p>
            ) : canDecide && (
              <>
                {rejecting === item.id ? (
                  <div style={S.decideBox}>
                    <label style={S.fieldCap}>{t.pqReason}</label>
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                      rows={2} maxLength={500} style={S.textarea} data-field="reject-reason" />
                    <div style={S.reviewActions}>
                      <button onClick={() => decide(item, "reject")}
                        disabled={busy === item.id || reason.trim().length < 5}
                        style={{ ...S.smallPrimary,
                                 ...(busy === item.id || reason.trim().length < 5 ? S.disabled : null) }}>
                        {t.pqSendReject}
                      </button>
                      <button onClick={() => { setRejecting(null); setReason(""); }}
                        style={S.smallGhost}>{t.cancel}</button>
                    </div>
                  </div>
                ) : (
                  <div style={S.reviewActions}>
                    <button onClick={() => decide(item, "approve")} disabled={busy === item.id}
                      style={S.smallPrimary} data-action="approve">{t.pqApprove}</button>
                    <button onClick={() => { setRejecting(item.id); setReason(""); }}
                      disabled={busy === item.id} style={S.smallGhost}
                      data-action="reject">{t.pqReject}</button>
                  </div>
                )}
              </>
            )}
          </ChangeRow>
        ))}
      </div>
      {recent && (
        <>
          <div style={S.blockLabel}>{t.pqRecent}</div>
          {recent.length === 0 && <p style={S.hint}>{t.pqRecentNone}</p>}
          <div style={S.list}>
            {recent.map((item) => (
              <ChangeRow key={item.id} t={t} lang={lang} item={item} decided />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* One change: who, what differs, and what the checks noticed. */
const OWN_WORDS = ["given_name", "family_name", "username", "bio"];

function ChangeRow({ t, lang, item, decided, children }) {
  const after = item.after ?? {};
  const changed = new Set((item.fields ?? []).map((f) => (f === "unit_id" ? "unit" : f)));
  const rows = item.first || decided
    ? PROFILE_ROWS.filter((f) => profileValue(t, after, f))
    : PROFILE_ROWS.filter((f) => changed.has(f));
  const name = [after.given_name, after.family_name].filter(Boolean).join(" ");
  return (
    <div style={S.changeRow} data-change={item.id}>
      <div style={S.whoTop}>
        <span style={S.reviewName} data-user-content>{name || "—"}</span>
        <span style={S.mono} data-user-content>@{after.username}</span>
        <span style={{ ...S.pill, marginLeft: "auto", color: item.first ? ACCENT : GOOD,
                       borderColor: item.first ? ACCENT : GOOD }}>
          {item.first ? t.pqFirst : t.pqChange}
        </span>
        {decided && (
          <span style={{ ...S.pill, color: item.state === "approved" ? GOOD : ACCENT,
                         borderColor: item.state === "approved" ? GOOD : ACCENT }}>
            {t.changeStates[item.state] ?? item.state}
          </span>
        )}
      </div>
      {item.email && <div style={S.email} data-user-content data-email>{item.email}</div>}
      <div style={S.reviewMeta}>
        {t.roles[after.role] ?? after.role} · {stamp(lang, item.submitted_at, true)}
        {item.person?.rejected_before > 0 && !decided
          ? ` · ${plural(t, "pqRejectedBefore", item.person.rejected_before).replace("{n}", item.person.rejected_before)}` : ""}
        {decided && item.decided_by ? ` · ${t.pqBy.replace("{who}", item.decided_by)}` : ""}
      </div>
      <table style={S.diff}>
        {!item.first && !decided && (
          <thead>
            <tr><th style={S.th} /><th style={S.th}>{t.pqNow}</th><th style={S.th}>{t.pqNew}</th></tr>
          </thead>
        )}
        <tbody>
          {rows.map((f) => {
            // What the person wrote is shown as they wrote it.
            const own = OWN_WORDS.includes(f) || undefined;
            return (
              <tr key={f} data-field={f}>
                <th scope="row" style={S.diffField}>{t.pqFields[f]}</th>
                {!item.first && !decided && (
                  <td style={{ ...S.td, ...S.diffOld }} data-user-content={own}>
                    {profileValue(t, item.before, f) || "—"}
                  </td>
                )}
                <td style={{ ...S.td, ...(changed.has(f) && !item.first ? S.diffNew : null) }}
                  data-user-content={own}>
                  {profileValue(t, after, f) || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(item.warnings ?? []).length > 0 && (
        <div style={S.warnList}>
          {item.warnings.map((w, i) => (
            <span key={i} style={S.warnChip} data-warning={w.code}>
              {t.pqWarns[w.code] ?? w.code}
              {w.detail && w.code === "word" ? `: ${w.detail}` : ""}
              {w.detail && w.code === "role_change"
                ? `: ${w.detail.split(">").map((r) => t.roles[r] ?? r).join(" → ")}` : ""}
            </span>
          ))}
        </div>
      )}
      {decided && item.reason && <div style={S.reviewDetail} data-user-content>“{item.reason}”</div>}
      {children}
    </div>
  );
}

function PersonLine({ t, p }) {
  const title = p.role === "student" ? null : (p.title_label ?? t.pfTitleNone);
  return (
    <div style={S.personLine}>
      <Avatar code={p.avatar} label={p.name || p.username} size={36} />
      <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
        <div style={S.whoTop}>
          <span style={S.reviewName} data-user-content>{p.name || "—"}</span>
          {p.username && <span style={S.mono} data-user-content>@{p.username}</span>}
        </div>
        {p.email && <div style={S.email} data-user-content data-email>{p.email}</div>}
        <div style={S.reviewMeta}>
          {t.roles[p.role] ?? p.role}
          {title && <> · <span data-title={p.title ?? "none"}>{title}</span></>}
          {p.faculty ? ` · ${[p.faculty, p.department].filter(Boolean).join(" / ")}` : ""}
        </div>
        <div style={S.chips}>
          {p.admin && <span style={{ ...S.pill, color: TEXT, borderColor: LINE }}>{t.pfAdmin}</span>}
          {p.suspension && (
            <span style={{ ...S.pill, color: ACCENT, borderColor: ACCENT }}>{t.pfSuspended}</span>
          )}
          {p.status === "closed" && (
            <span style={{ ...S.pill, color: MUTED, borderColor: LINE }}>{t.pfClosed}</span>
          )}
          <span style={{ ...S.pill, color: p.approved ? GOOD : WARN_TEXT,
                         borderColor: p.approved ? GOOD : WARN }}>
            {p.approved ? t.pfApproved : (p.username ? t.pfUnapproved : t.pfIncomplete)}
          </span>
          {p.waiting && <span style={{ ...S.pill, color: WARN_TEXT, borderColor: WARN }}>{t.pfWaiting}</span>}
        </div>
      </div>
    </div>
  );
}

const PEOPLE_PAGE = 25;
const PEOPLE_ROLES = ["student", "academic", "admin_staff"];

/* Offline, the sample people answer the questions the server would. */
function samplePeople({ q = "", role = "", title = "", state = "" }) {
  const needle = q.trim().toLocaleLowerCase("tr");
  const items = SAMPLE_PEOPLE.people.filter((p) =>
    (!needle || `${p.name} ${p.username} ${p.email ?? ""}`.toLocaleLowerCase("tr").includes(needle))
    && (!role || p.role === role)
    && (!title || (title === "none" ? p.role !== "student" && !p.title : p.title === title))
    && (!state || (state === "approved" ? p.approved
                   : state === "unapproved" ? !p.approved && Boolean(p.username)
                   : state === "incomplete" ? !p.username
                   : state === "waiting" ? p.waiting : Boolean(p.suspension))));
  return { items, total: items.length };
}

/* Everyone with an account, the newest first, narrowed by a search and by
   role, title and the state of the profile. A full administrator sees each
   address and can edit a profile here; everyone can open a person's history. */
function FindPerson({ t, lang, live, offline, version, onChange, onEdited }) {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");          // the search the list is for
  const [filters, setFilters] = useState({ role: "", title: "", state: "" });
  const [list, setList] = useState(null);          // { items, total }
  const [options, setOptions] = useState(null);    // the titles and units a profile can hold
  const [open, setOpen] = useState(null);          // { id, mode: "suspend" | "lift" | "void" | "history" | "edit" }
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [edited, setEdited] = useState(null);      // the person whose profile was just edited
  const [caseKey, setCaseKey] = useState("");
  const canSuspend = live.who.can_suspend;
  const canManage = live.who.can_manage_people;
  const caseChoices = [...live.cases].sort((a, b) =>
    String(a.title ?? a.key).localeCompare(String(b.title ?? b.key), lang === "en" ? "en" : "tr"));

  const page = (query, f, offset) => (offline
    ? Promise.resolve(samplePeople({ q: query, ...f }))
    : admin.people({ q: query, ...f, offset, limit: PEOPLE_PAGE }));

  const load = async (query, f) => {
    setError(null);
    try { setList(await page(query, f, 0)); }
    catch (e) { setError(e.message); }
  };

  // A suspension started or lifted elsewhere on the tab shows here too.
  useEffect(() => { load(asked, filters); }, [version]);
  useEffect(() => {
    if (offline) { setOptions(SAMPLE_PROFILE_OPTIONS); return undefined; }
    let off = false;
    admin.profileOptions().then((o) => { if (!off) setOptions(o); }).catch(() => {});
    return () => { off = true; };
  }, [offline]);

  const search = () => {
    const query = q.trim();
    if (query.length === 1) return;
    setOpen(null); setDone(null); setEdited(null); setAsked(query);
    load(query, filters);
  };

  const filter = (key, value) => {
    const next = { ...filters, [key]: value };
    setFilters(next); setOpen(null); setDone(null); setEdited(null);
    load(asked, next);
  };

  const showMore = async () => {
    setBusy(true);
    try {
      const more = await page(asked, filters, list.items.length);
      setList((l) => ({ ...more, items: [...l.items, ...more.items] }));
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const loadHistory = async (p) => {
    setHistory(null);
    if (offline) { setHistory({ suspensions: [], changes: [], voids: [] }); return; }
    try { setHistory(await admin.person(p.person_id)); }
    catch (e) { setError(e.message); }
  };

  const openPanel = async (p, mode) => {
    setError(null); setDone(null); setEdited(null);
    setReason(""); setNote(""); setDays(7); setCaseKey("");
    if (open?.id === p.person_id && open.mode === mode) { setOpen(null); return; }
    setOpen({ id: p.person_id, mode });
    if (mode === "history") await loadHistory(p);
  };

  const act = async (p) => {
    setBusy(true); setError(null); setDone(null);
    try {
      if (!offline) {
        if (open.mode === "suspend") await admin.suspend(p.person_id, days, reason.trim(), note.trim());
        else if (open.mode === "void") {
          const r = await admin.voidAttempt(p.person_id, caseKey, reason.trim());
          setDone(t.voidDone.replace("{points}", num(r.points ?? 0, lang)));
        } else await admin.lift(p.person_id, note.trim());
        onChange?.();
      }
      setOpen(null);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const restore = async (p, v) => {
    setBusy(true); setError(null); setDone(null);
    try {
      if (!offline) await admin.restoreAttempt(p.person_id, v.case_key, null);
      setDone(t.restored);
      await loadHistory(p);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const afterEdit = (person, closedWaiting) => {
    setList((l) => ({ ...l, items: l.items.map((x) => (x.person_id === person.person_id ? person : x)) }));
    setOpen(null); setEdited(person.person_id);
    if (closedWaiting) onEdited?.();
  };

  const found = list?.items ?? [];
  const titles = options?.titles ?? [];
  return (
    <section style={S.card} data-card="find-person">
      <div style={S.cardHead}>
        {t.pfHead}
        {list && (
          <span style={S.mono} data-total={list.total}>
            {" · "}{plural(t, "pfCount", list.total)
              .replace("{n}", list.total.toLocaleString(lang === "en" ? "en-GB" : "tr-TR"))}
          </span>
        )}
      </div>
      <p style={S.hint}>{t.pfWhat}</p>
      <form style={S.domainForm} onSubmit={(e) => { e.preventDefault(); search(); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.pfPlaceholder}
          style={S.input} data-field="people-q" />
        <button type="submit" style={S.ghost} disabled={q.trim().length === 1}>{t.pfSearch}</button>
      </form>
      <div style={S.filterRow}>
        <label style={S.filterField}>
          <span style={S.filterCap}>{t.pfRole}</span>
          <select value={filters.role} onChange={(e) => filter("role", e.target.value)}
            style={S.filterSelect} data-filter="role">
            <option value="">{t.pfAll}</option>
            {PEOPLE_ROLES.map((r) => <option key={r} value={r}>{t.pfRoles[r]}</option>)}
          </select>
        </label>
        <label style={S.filterField}>
          <span style={S.filterCap}>{t.pfTitle}</span>
          <select value={filters.title} onChange={(e) => filter("title", e.target.value)}
            style={S.filterSelect} data-filter="title">
            <option value="">{t.pfAll}</option>
            <option value="none">{t.pfNoTitle}</option>
            {titles.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
          </select>
        </label>
        <label style={S.filterField}>
          <span style={S.filterCap}>{t.pfState}</span>
          <select value={filters.state} onChange={(e) => filter("state", e.target.value)}
            style={S.filterSelect} data-filter="state">
            <option value="">{t.pfAll}</option>
            {Object.entries(t.pfStates).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
      </div>
      {!canManage && <p style={S.hint}>{t.psOnlyAdmin}</p>}
      {error && <div style={S.errline} role="alert">{error}</div>}
      {done && <p style={S.flash} role="status">{done}</p>}
      {list && found.length === 0 && <p style={S.hint}>{t.pfNone}</p>}
      <div style={S.list}>
        {found.map((p) => (
          <div key={p.person_id} style={S.changeRow} data-person={p.username ?? p.person_id}>
            <PersonLine t={t} p={p} />
            {p.suspension && (
              <div style={S.reviewDetail}>
                {p.suspension.ends_at
                  ? t.psUntil.replace("{date}", stamp(lang, p.suspension.ends_at, true))
                  : t.psForever} · <span data-user-content>{p.suspension.reason}</span>
              </div>
            )}
            {edited === p.person_id && <p style={S.flash} role="status">{t.pcDone}</p>}
            <div style={S.reviewActions}>
              {canManage && p.username && p.status !== "closed" && p.person_id !== live.who.person_id && (
                <button onClick={() => openPanel(p, "edit")} style={S.smallGhost}
                  data-action="edit-profile">{t.pcEdit}</button>
              )}
              {canSuspend && !p.admin && !p.suspension && p.status !== "closed" && (
                <button onClick={() => openPanel(p, "suspend")} style={S.smallGhost}
                  data-action="suspend">{t.psSuspend}</button>
              )}
              {canSuspend && p.suspension && (
                <button onClick={() => openPanel(p, "lift")} style={S.smallGhost}
                  data-action="lift">{t.psLift}</button>
              )}
              {canSuspend && !p.admin && (
                <button onClick={() => openPanel(p, "void")} style={S.smallGhost}
                  data-action="void">{t.voidAction}</button>
              )}
              <button onClick={() => openPanel(p, "history")} style={S.smallGhost}
                data-action="history">
                {open?.id === p.person_id && open.mode === "history" ? t.pfHideHistory : t.pfHistory}
              </button>
            </div>

            {open?.id === p.person_id && open.mode === "edit" && (
              <EditProfile t={t} p={p} options={options} offline={offline}
                onDone={afterEdit} onCancel={() => setOpen(null)} />
            )}
            {open?.id === p.person_id && open.mode === "suspend" && (
              <div style={S.confirm} data-form="suspend">
                <div style={S.confirmTitle}>{t.psSuspend}</div>
                <p style={S.confirmBody}>{t.psWhat}</p>
                <div style={S.fieldCap}>{t.psDuration}</div>
                <div style={S.chips} role="radiogroup" aria-label={t.psDuration}>
                  {[1, 7, 30, null].map((d) => (
                    <button key={String(d)} type="button" role="radio" aria-checked={days === d}
                      onClick={() => setDays(d)} data-days={String(d)}
                      style={{ ...S.chip, ...(days === d ? S.chipOn : null) }}>
                      {d ? t.psDays[d] : t.psOpenEnded}
                    </button>
                  ))}
                </div>
                <label style={S.fieldCap}>{t.psReason}</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                  maxLength={500} style={S.textarea} data-field="suspend-reason" />
                <label style={S.fieldCap}>{t.psNote}</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                  maxLength={1000} style={S.textarea} data-field="suspend-note" />
                <p style={S.hint}>{t.psNoteHint}</p>
                <div style={S.reviewActions}>
                  <button onClick={() => act(p)} disabled={busy || reason.trim().length < 5}
                    style={{ ...S.smallPrimary, ...(busy || reason.trim().length < 5 ? S.disabled : null) }}
                    data-action="confirm-suspend">{t.psConfirm}</button>
                  <button onClick={() => setOpen(null)} style={S.smallGhost}>{t.cancel}</button>
                </div>
              </div>
            )}

            {open?.id === p.person_id && open.mode === "void" && (
              <div style={S.confirm} data-form="void">
                <div style={S.confirmTitle}>{t.voidAction}</div>
                <p style={S.confirmBody}>{t.voidWhat}</p>
                <label style={S.fieldCap}>{t.voidCase}</label>
                <select value={caseKey} onChange={(e) => setCaseKey(e.target.value)}
                  style={S.input} data-field="void-case">
                  <option value="">{t.voidPickCase}</option>
                  {caseChoices.map((c) => (
                    <option key={c.key} value={c.key}>{c.title ?? c.key}</option>
                  ))}
                </select>
                <label style={S.fieldCap}>{t.voidReason}</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                  maxLength={500} style={S.textarea} data-field="void-reason" />
                <div style={S.reviewActions}>
                  <button onClick={() => act(p)}
                    disabled={busy || !caseKey || reason.trim().length < 5}
                    style={{ ...S.smallPrimary,
                             ...(busy || !caseKey || reason.trim().length < 5 ? S.disabled : null) }}
                    data-action="void-confirm">{t.voidConfirm}</button>
                  <button onClick={() => setOpen(null)} style={S.smallGhost}>{t.cancel}</button>
                </div>
              </div>
            )}

            {open?.id === p.person_id && open.mode === "lift" && (
              <div style={S.decideBox} data-form="lift">
                <label style={S.fieldCap}>{t.psLiftNote}</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                  maxLength={500} style={S.textarea} />
                <div style={S.reviewActions}>
                  <button onClick={() => act(p)} disabled={busy} style={S.smallPrimary}
                    data-action="confirm-lift">{t.psLift}</button>
                  <button onClick={() => setOpen(null)} style={S.smallGhost}>{t.cancel}</button>
                </div>
              </div>
            )}

            {open?.id === p.person_id && open.mode === "history" && history && (
              <div style={S.decideBox} data-panel="history">
                <div style={S.fieldCap}>{t.phSuspensions}</div>
                {history.suspensions.length === 0 && <p style={S.hint}>{t.phNone}</p>}
                {history.suspensions.map((h, i) => (
                  <div key={i} style={S.historyRow}>
                    <span>{stamp(lang, h.starts_at)} → {h.ends_at ? stamp(lang, h.ends_at) : t.psForever}</span>
                    <span>{h.reason}</span>
                    {h.note && <span style={S.mono}>{h.note}</span>}
                    <span style={S.mono}>
                      {t.phBy.replace("{who}", h.by ?? "—")}
                      {h.lifted_at && (h.lifted_by
                        ? ` · ${t.phLiftedBy.replace("{who}", h.lifted_by)}`
                        : ` · ${t.phRanOut}`)}
                    </span>
                  </div>
                ))}
                <div style={S.fieldCap}>{t.phVoids}</div>
                {(history.voids ?? []).length === 0 && <p style={S.hint}>{t.phNone}</p>}
                {(history.voids ?? []).map((v) => (
                  <div key={v.case_key} style={S.historyRow} data-void={v.case_key}>
                    <span data-user-content>{v.title ?? v.case_key}</span>
                    <span>{stamp(lang, v.at)} · {num(v.points, lang)} {t.pointsShort}</span>
                    <span data-user-content>{v.reason}</span>
                    <span style={S.mono}>{t.phVoidBy.replace("{who}", v.by ?? "—")}</span>
                    {canSuspend && (
                      <span>
                        <button onClick={() => restore(p, v)} disabled={busy}
                          style={S.smallGhost} data-action="restore">{t.restore}</button>
                      </span>
                    )}
                  </div>
                ))}
                <div style={S.fieldCap}>{t.phChanges}</div>
                {history.changes.length === 0 && <p style={S.hint}>{t.phNone}</p>}
                {history.changes.map((c) => (
                  <div key={c.id} style={S.historyRow} data-change-state={c.by_admin ? "edited" : c.state}>
                    <span>
                      {stamp(lang, c.submitted_at)} · {c.by_admin
                        ? t.phCorrected.replace("{who}", c.by ?? "—")
                        : t.changeStates[c.state] ?? c.state}
                    </span>
                    <span style={S.mono}>
                      {(c.fields ?? []).map((f) => t.pqFields[f === "unit_id" ? "unit" : f] ?? f).join(", ")}
                    </span>
                    {c.reason && <span data-user-content>{c.reason}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {list && found.length < list.total && (
        <button onClick={showMore} disabled={busy} style={S.linkBtn}
          data-action="more-people">{t.pfMore}</button>
      )}
    </section>
  );
}


/* Where a unit sits among the choices: its faculty, and itself when it is a
   department. */
function unitChoice(units, unitId) {
  for (const f of units) {
    if (f.id === unitId) return [String(f.id), ""];
    if ((f.children ?? []).some((d) => d.id === unitId)) return [String(f.id), String(unitId)];
  }
  return ["", ""];
}

/* A full administrator edits what a person declared about themselves. The
   same rules hold as on the person's own form, and the reason is shown to the
   person. */
function EditProfile({ t, p, options, offline, onDone, onCancel }) {
  const units = useMemo(() => {
    const byName = (a, b) => a.name.localeCompare(b.name, "tr");
    return (options?.units ?? []).map((u) => ({ ...u, children: [...(u.children ?? [])].sort(byName) }))
      .sort(byName);
  }, [options]);
  const [startFaculty, startDept] = unitChoice(units, p.unit_id);
  const [given, setGiven] = useState(p.given_name ?? "");
  const [family, setFamily] = useState(p.family_name ?? "");
  const [username, setUsername] = useState(p.username ?? "");
  const [role, setRole] = useState(p.role);
  const [title, setTitle] = useState(p.title ?? "");
  const [faculty, setFaculty] = useState(startFaculty);
  const [dept, setDept] = useState(startDept);
  const [bio, setBio] = useState(p.bio ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);       // { field, text }
  const bioMax = options?.bio_max ?? 160;
  const titles = (options?.titles ?? []).filter((x) => x.active || x.code === p.title);

  const facultyRow = units.find((u) => String(u.id) === faculty) ?? null;
  const needsDept = Boolean(facultyRow && facultyRow.children.length && !facultyRow.selectable);
  const unitId = facultyRow ? (dept ? Number(dept) : (needsDept ? null : facultyRow.id)) : null;
  const ready = given.trim() && family.trim() && username.trim().length >= 3 && unitId
    && reason.trim().length >= 5;

  // The administrative title and administrative staff go together, as on the
  // person's own form.
  const pickRole = (r) => {
    setRole(r);
    if (r === "student" || (r === "academic" && title === "idari")) setTitle("");
  };
  const pickTitle = (code) => {
    setTitle(code);
    if (code === "idari") setRole("admin_staff");
  };

  const save = async () => {
    setBusy(true); setError(null);
    const body = {
      given_name: given, family_name: family, username: username.trim().toLowerCase(),
      unit_id: unitId, role, title: role === "student" ? null : (title || null),
      bio: bio.trim() || null, reason: reason.trim(),
    };
    try {
      if (offline) {
        const label = titles.find((x) => x.code === body.title)?.label ?? null;
        onDone({ ...p, ...body, name: `${given} ${family}`, title_label: label,
                 approved: true, waiting: false });
        return;
      }
      const r = await admin.correctProfile(p.person_id, body);
      onDone(r.person, r.waiting_closed);
    } catch (e) {
      const d = e.detail;
      setError({ field: d?.field ?? null, text: (d?.reason && t.fieldErrors[d.reason]) || e.message });
    } finally { setBusy(false); }
  };

  const fieldError = (field) => error?.field === field && (
    <div style={S.errline} role="alert" data-error={field}>{error.text}</div>
  );

  return (
    <div style={S.decideBox} data-form="edit-profile">
      <div style={S.confirmTitle}>{t.pcEdit}</div>
      <p style={S.confirmBody}>{t.pcWhat}</p>
      {p.waiting && <p style={S.confirmBody} data-note="waiting">{t.pcWaiting}</p>}
      <div style={S.formGrid}>
        <label style={S.formField}>
          <span style={S.fieldCap}>{t.pqFields.given_name}</span>
          <input value={given} onChange={(e) => setGiven(e.target.value)} maxLength={60}
            style={S.formInput} data-field="edit-given" />
          {fieldError("given_name")}
        </label>
        <label style={S.formField}>
          <span style={S.fieldCap}>{t.pqFields.family_name}</span>
          <input value={family} onChange={(e) => setFamily(e.target.value)} maxLength={60}
            style={S.formInput} data-field="edit-family" />
          {fieldError("family_name")}
        </label>
      </div>
      <label style={S.formField}>
        <span style={S.fieldCap}>{t.pqFields.username}</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={24}
          autoCapitalize="none" spellCheck={false} style={S.formInput} data-field="edit-username" />
        {fieldError("username")}
      </label>
      <div style={S.fieldCap}>{t.pcRole}</div>
      <div style={S.chips} role="radiogroup" aria-label={t.pcRole}>
        {PEOPLE_ROLES.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={role === r}
            onClick={() => pickRole(r)} data-role={r}
            style={{ ...S.chip, ...(role === r ? S.chipOn : null) }}>{t.pfRoles[r]}</button>
        ))}
      </div>
      <label style={S.formField}>
        <span style={S.fieldCap}>{t.pcTitle}</span>
        <select value={role === "student" ? "" : title} disabled={role === "student"}
          onChange={(e) => pickTitle(e.target.value)} style={S.formInput} data-field="edit-title">
          <option value="">{t.pcNoTitle}</option>
          {titles.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
        </select>
        {role === "student" && <span style={S.hint}>{t.pcStudentTitle}</span>}
      </label>
      <div style={S.formGrid}>
        <label style={S.formField}>
          <span style={S.fieldCap}>{t.pcUnit}</span>
          <select value={faculty} onChange={(e) => { setFaculty(e.target.value); setDept(""); }}
            style={S.formInput} data-field="edit-faculty">
            <option value="">{t.pcPick}</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        {facultyRow && facultyRow.children.length > 0 && (
          <label style={S.formField}>
            <span style={S.fieldCap}>{t.pcDept}</span>
            <select value={dept} onChange={(e) => setDept(e.target.value)} style={S.formInput}
              data-field="edit-dept">
              <option value="">{needsDept ? t.pcPick : "—"}</option>
              {facultyRow.children.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <label style={S.formField}>
        <span style={S.fieldCap}>{t.pcBio}</span>
        <textarea value={bio} rows={2} maxLength={bioMax} style={S.textarea} data-field="edit-bio"
          onChange={(e) => setBio(e.target.value.replace(/\s*\n\s*/g, " ").slice(0, bioMax))} />
        <span style={S.mono}>{bio.length}/{bioMax}</span>
        {fieldError("bio")}
      </label>
      <label style={S.formField}>
        <span style={S.fieldCap}>{t.pcReason}</span>
        <textarea value={reason} rows={2} maxLength={500} onChange={(e) => setReason(e.target.value)}
          style={S.textarea} data-field="edit-reason" />
      </label>
      {error && !error.field && <div style={S.errline} role="alert">{error.text}</div>}
      <div style={S.reviewActions}>
        <button onClick={save} disabled={busy || !ready} data-action="save-profile"
          style={{ ...S.smallPrimary, ...(busy || !ready ? S.disabled : null) }}>{t.pcSave}</button>
        <button onClick={onCancel} style={S.smallGhost}>{t.cancel}</button>
      </div>
    </div>
  );
}

function SuspendedList({ t, lang, live, offline, version, onChange }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const canSuspend = live.who.can_suspend;

  const load = React.useCallback(async () => {
    if (offline) { setList(SAMPLE_PEOPLE.people.filter((p) => p.suspension)); return; }
    try { setList(await admin.suspensions()); setError(null); }
    catch (e) { setError(e.message); }
  }, [offline, version]);
  useEffect(() => { load(); }, [load]);

  const lift = async (p) => {
    if (offline) { setList((x) => x.filter((y) => y.person_id !== p.person_id)); return; }
    setBusy(p.person_id);
    try { await admin.lift(p.person_id, null); onChange?.(); }
    catch (e) { setError(e.message); }
    finally { setBusy(null); }
  };

  return (
    <section style={S.card} data-card="suspended">
      <div style={S.cardHead}>
        {t.plHead}{list && <span style={S.mono}> · {list.length}</span>}
      </div>
      {error && <div style={S.errline} role="alert">{error}</div>}
      {list && list.length === 0 && <p style={S.hint}>{t.plNone}</p>}
      <div style={S.list}>
        {(list ?? []).map((p) => (
          <div key={p.person_id} style={S.changeRow} data-suspended={p.username ?? p.person_id}>
            <PersonLine t={t} p={p} />
            <div style={S.reviewDetail}>
              {p.suspension.ends_at
                ? t.psUntil.replace("{date}", stamp(lang, p.suspension.ends_at, true))
                : t.psForever} · <span data-user-content>{p.suspension.reason}</span>
            </div>
            {p.suspension.note && <div style={S.mono} data-user-content>{p.suspension.note}</div>}
            {canSuspend && (
              <div style={S.reviewActions}>
                <button onClick={() => lift(p)} disabled={busy === p.person_id}
                  style={S.smallGhost}>{t.psLift}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------- units --------------------------------- */


/* Who can get in at all.
 *
 * This is the platform's whole identity check: an address whose domain is not
 * listed here cannot register, and nobody outside finds out — they just fail to
 * sign up. So the screen shows how many people came in through each rule, and
 * says plainly what turning one off does and does not do. */

function Access({ t, live, offline, reload }) {
  const [domain, setDomain] = useState("");
  const [role, setRole] = useState("student");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const rows = live.domains;
  const canManage = live.who.can_manage_access;

  const act = async (fn) => {
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(true); setFlash(null);
    try { await fn(); reload(); }
    catch (e) { setFlash(e.message); }
    finally { setBusy(false); setConfirming(null); }
  };

  return (
    <section style={S.card} data-panel="domains">
      <div style={S.cardHead}>{t.domains}</div>
      <p style={S.note}>{t.domainWhat}</p>

      <div style={S.list}>
        {rows.map((d) => (
          <div key={d.domain} data-domain={d.domain}
            style={{ ...S.domainRow, opacity: d.is_active ? 1 : 0.55 }}>
            <span style={S.domainName}>@{d.domain}</span>
            <span style={{ ...S.pill, color: ACCENT, borderColor: ACCENT }}>
              {t.roles[d.role] ?? d.role}
            </span>
            <span style={S.mono}>{d.people ?? 0} {t.registered}</span>
            <span style={{ ...S.mono, color: d.is_active ? GOOD : MUTED }}>
              {d.is_active ? t.open : t.closed_}
            </span>
            {canManage && (
              <button style={S.smallGhost} disabled={busy} data-action="domain-toggle"
                onClick={() => (d.is_active ? setConfirming(d)
                  : act(() => admin.setDomainState(d.domain, true)))}>
                {d.is_active ? t.closeDomain : t.openDomain}
              </button>
            )}
            {canManage && (d.people ?? 0) === 0 && (
              <button style={S.smallGhost} disabled={busy}
                onClick={() => act(() => admin.removeDomain(d.domain))}>
                {t.deleteDomain}
              </button>
            )}
          </div>
        ))}
      </div>
      {confirming && (
        <div style={S.confirm} data-confirm="close-domain">
          <div style={S.confirmTitle}>@{confirming.domain}</div>
          <p style={S.confirmBody}>{plural(t, "closeConfirm", confirming.people ?? 0).replace("{n}", confirming.people ?? 0)}</p>
          <div style={S.actions}>
            <button onClick={() => setConfirming(null)} style={S.ghost}>{t.closeNo}</button>
            <button onClick={() => act(() => admin.setDomainState(confirming.domain, false))}
              disabled={busy} data-action="domain-close-yes"
              style={{ ...S.primary, ...(busy ? S.disabled : null) }}>{t.closeYes}</button>
          </div>
        </div>
      )}

      <p style={S.note}>{t.closeMeans}</p>

      {!canManage ? (
        <p style={S.hint} data-readonly="domains">{t.domainsReadOnly}</p>
      ) : (
        <>
          <div style={S.cardHead}>{t.addDomain}</div>
          <div style={S.domainForm}>
            <span style={S.at}>@</span>
            <input value={domain} onChange={(e) => setDomain(e.target.value)}
              placeholder={t.domainExample} style={{ ...S.input, fontFamily: MONO }} />
            <select value={role} onChange={(e) => setRole(e.target.value)} style={S.input}>
              <option value="student">{t.roles.student}</option>
              <option value="academic">{t.roles.academic}</option>
              <option value="admin_staff">{t.roles.admin_staff}</option>
            </select>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
            placeholder={t.domainNote} style={{ ...S.input, marginTop: 8, width: "100%" }} />
          <p style={S.hint}>{t.roleWarning}</p>

          <div style={S.actions}>
            <button disabled={busy || !domain.trim()}
              style={{ ...S.primary, ...(busy || !domain.trim() ? S.disabled : null) }}
              onClick={() => act(async () => {
                await admin.addDomain(domain.trim(), role, note.trim() || null);
                setDomain(""); setNote("");
              })}>
              {t.addDomain}
            </button>
          </div>
        </>
      )}
      {flash && <p style={S.flash} role="status">{flash}</p>}
    </section>
  );
}

function Units({ t, live, offline, reload }) {
  const [closing, setClosing] = useState(null);
  const [busy, setBusy] = useState(false);

  const doClose = async () => {
    if (offline) { setClosing(null); return; }
    setBusy(true);
    try { await admin.closeUnit(closing.id); reload(); }
    finally { setBusy(false); setClosing(null); }
  };
  return (
    <section style={S.card}>
      <div style={S.cardHead}>{t.tree}</div>
      <p style={S.note}>{t.depthNote}</p>
      <div style={S.list}>
        {live.units.map((u) => (
          <div key={u.id} style={{ ...S.unitRow, paddingLeft: 10 + u.depth * 22 }}>
            <span style={{ ...S.unitName, fontWeight: u.depth === 0 ? 700 : 600 }}>{u.name}</span>
            <span style={S.unitCode}>{u.code}</span>
            <span style={S.mono}>{u.people ?? 0} {t.people}</span>
            {u.depth < 2 && <button style={S.smallGhost}>{t.addUnit}</button>}
            {u.depth > 0 && (
              <button onClick={() => setClosing(u)} style={S.smallGhost}>{t.closeUnit}</button>
            )}
          </div>
        ))}
      </div>
      {closing && (
        <div style={S.confirm}>
          <div style={S.confirmTitle}>{closing.name}</div>
          <p style={S.confirmBody}>{plural(t, "closeWarn", closing.people ?? 0).replace("{n}", closing.people ?? 0)}</p>
          <div style={S.actions}>
            <button onClick={() => setClosing(null)} style={S.ghost}>✕</button>
            <button onClick={doClose} disabled={busy}
              style={{ ...S.primary, ...(busy ? S.disabled : null) }}>{t.closeUnit}</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* --------------------------------- reports -------------------------------- */

function Reports({ t, lang, live, offline }) {
  const rows = live.participation
    .map((r) => ({
      unit: r.unit ?? r.name_tr,
      eligible: r.eligible, finished: r.finished,
      pct: Number(r.pct ?? (r.eligible ? (r.finished / r.eligible) * 100 : 0)) || 0,
    }))
    .sort((a, b) => b.pct - a.pct);
  const dims = live.dimensions.map((d) => ({
    dimension: d.dimension, theta: d.theta ?? d.theta_mean, people: d.people }));
  const worst = dims.length ? Math.min(...dims.map((d) => d.theta)) : 0;
  const best = dims.length ? Math.max(...dims.map((d) => d.theta)) : 1;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section style={S.card}>
        <div style={S.cardHead}>{t.participation} · {t.byUnit}</div>
        <div style={S.list}>
          {rows.map((r) => (
            <div key={r.unit} style={S.partRow}>
              <span style={S.partName}>{r.unit}</span>
              <span style={S.barTrack}>
                <span style={{ ...S.barFill, width: `${r.pct}%`,
                               background: r.pct >= 50 ? GOOD : r.pct >= 30 ? WARN : ACCENT }} />
              </span>
              <span style={S.partPct}>{lang === "tr" ? `%${r.pct.toFixed(0)}` : `${r.pct.toFixed(0)}%`}</span>
              <span style={S.mono}>{r.finished}/{r.eligible}</span>
            </div>
          ))}
        </div>
        <p style={S.note}>{plural(t, "belowThreshold", live.below).replace("{n}", live.below)}</p>
      </section>

      <section style={S.card}>
        <div style={S.cardHead}>{t.weakest}</div>
        <p style={S.hint}>{t.weakestHint}</p>
        <div style={S.list}>
          {[...dims].sort((a, b) => a.theta - b.theta).map((d) => {
            const span = best - worst || 1;
            const frac = (d.theta - worst) / span;
            return (
              <div key={d.dimension} style={S.partRow}>
                <span style={S.partName}>
                  <span style={S.rowGlyph}><Icon name={d.dimension} size={16} /></span>
                  {t.dims[d.dimension] ?? d.dimension}
                </span>
                <span style={S.barTrack}>
                  <span style={{ ...S.barFill, width: `${20 + frac * 80}%`,
                                 background: d.theta < 0 ? ACCENT : d.theta < 0.5 ? WARN : GOOD }} />
                </span>
                <span style={S.partPct}>{lang === "tr" ? d.theta.toFixed(2).replace(".", ",") : d.theta.toFixed(2)}</span>
                <span style={S.mono}>{d.people}</span>
              </div>
            );
          })}
        </div>
      </section>

      <Interventions t={t} lang={lang} offline={offline} />
      <HintExperiment t={t} lang={lang} offline={offline} />
      <TwinAccuracy t={t} lang={lang} offline={offline} />
    </div>
  );
}

const SAMPLE_ACCURACY = {
  public: false, threshold: 10, people: 412,
  twin: { n: 9840, brier: 0.187, reliability: 0.006, resolution: 0.051, uncertainty: 0.232 },
};

/* How well the twins predict the campus, and whether everyone sees it. */
function TwinAccuracy({ t, lang, offline }) {
  const [data, setData] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = React.useCallback(async () => {
    if (offline) { setData(SAMPLE_ACCURACY); return; }
    try { setData(await admin.twinAccuracy()); } catch (e) { setFlash(e.message); }
  }, [offline]);
  useEffect(() => { load(); }, [load]);
  if (!data) {
    return flash ? (
      <section style={S.card} data-panel="twin-accuracy">
        <div style={S.cardHead}>{t.twinAccHead}</div>
        <p style={S.hint}>{flash}</p>
      </section>
    ) : null;
  }
  const num = (x, d = 3) => (lang === "tr" ? x.toFixed(d).replace(".", ",") : x.toFixed(d));
  const flip = async () => {
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(true);
    try { await admin.putSetting("twin_accuracy_public", !data.public); await load(); setFlash(t.saved); }
    catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };
  return (
    <section style={S.card} data-panel="twin-accuracy">
      <div style={S.cardHead}>{t.twinAccHead}</div>
      {data.twin ? (
        <div style={S.list}>
          {[[t.twinAccSteps, data.twin.n.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB")],
            [t.twinAccBrier, num(data.twin.brier)],
            [t.twinAccRel, num(data.twin.reliability)],
            [t.twinAccRes, num(data.twin.resolution)],
            [t.twinAccUnc, num(data.twin.uncertainty)]].map(([k, v]) => (
            <div key={k} style={S.accRow}><span>{k}</span><span style={S.accValue}>{v}</span></div>
          ))}
        </div>
      ) : (
        <p style={S.hint}>{t.twinAccFew.replace("{n}", data.threshold)}</p>
      )}
      <p style={S.note}>{t.twinAccWhat}</p>
      <div style={S.actions}>
        <button onClick={flip} disabled={busy} data-action="twin-public"
          aria-pressed={data.public}
          style={{ ...(data.public ? S.ghost : S.primary), ...(busy ? S.disabled : null) }}>
          {data.public ? t.twinAccHide : t.twinAccShow}
        </button>
        <span style={S.hint}>{data.public ? t.twinAccIsPublic : t.twinAccIsPrivate}</span>
        {flash && <span style={S.flash}>{flash}</span>}
      </div>
    </section>
  );
}

/* ----------------------------- shared helpers ------------------------------ */

function when(iso, lang) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB",
    { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function day(iso, lang) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long" });
}

const pctText = (x, lang) => (lang === "tr" ? `%${Math.round(x * 100)}` : `${Math.round(x * 100)}%`);

/* A share as signed percentage points: +4,1 or −0,6. */
function signed(x, lang, digits = 1) {
  const v = x * 100;
  const body = Math.abs(v).toFixed(digits);
  const text = lang === "tr" ? body.replace(".", ",") : body;
  if (Number(body) === 0) return text;
  return (v > 0 ? "+" : "−") + text;
}

/* Opening a live case for correction. The editor is another screen of the
   same application, so the panel hands over by address. */
function useRevise(t, offline) {
  const [note, setNote] = useState(null);
  const open = async (key, request) => {
    setNote(null);
    if (offline) { setNote({ key, text: t.notSaved }); return; }
    try {
      const r = await request();
      if (r.existing && !r.mine) {
        setNote({ key, id: r.id, text: t.editingBy.replace("{who}", r.author ?? "—") });
        return;
      }
      window.location.hash = `vaka-yaz/${r.id}`;
    } catch (e) {
      setNote({ key, text: e.status === 403 ? t.editNeedsAuthor : e.message });
    }
  };
  // A case in two languages is corrected one language at a time.
  const start = (key, locale) => open(key, () => admin.revise(key, locale));
  // A case in one language can be given its version in the other.
  start.add = (key, locale) => open(key, () => admin.translate(key, locale));
  return [start, note];
}

/* The buttons that open a case's language versions. Each version is corrected
   on its own; with canAdd, a case written in one language can also be given
   its version in the other. The versions are one case. */
function CaseVersions({ t, caseKey, locales, revise, canAdd = false }) {
  const have = ["tr", "en"].filter((l) => (locales ?? []).includes(l));
  const missing = canAdd && have.length ? ["tr", "en"].filter((l) => !have.includes(l)) : [];
  return (
    <span style={S.versionActions} data-case-versions={have.join(" ") || undefined}>
      {have.length < 2 ? (
        <button onClick={() => revise(caseKey, have[0])} style={S.smallGhost}
          title={t.editCaseHint} data-action="revise-case">{t.editCase}</button>
      ) : have.map((l) => (
        <button key={l} onClick={() => revise(caseKey, l)} style={S.smallGhost}
          title={t.editCaseHint} data-action="revise-case" data-locale={l}>
          {t.editVersion[l]}
        </button>
      ))}
      {missing.map((l) => (
        <button key={l} onClick={() => revise.add(caseKey, l)} style={S.smallGhost}
          title={t.addVersionHint} data-action="add-version" data-locale={l}>
          {t.addVersion[l]}
        </button>
      ))}
    </span>
  );
}

function ReviseNote({ t, note, caseKey }) {
  if (!note || note.key !== caseKey) return null;
  return (
    <p style={S.hint} role="status" data-revise-note>
      {note.text}
      {note.id && <> <a href={`#vaka-yaz/${note.id}`} style={S.inlineLink}>{t.openDraft}</a></>}
    </p>
  );
}

/* ------------------------------ sample data ------------------------------ */

const SAMPLE_DRAFTS = {
  in_review: 2,
  approved: [
    { id: 41, case_key: "2026-W34-fabricated-citation", version: 2, title: "Var Olmayan Kaynak",
      type: "weekly", steps: 3, author_name: "Yönetici Kişi", reviewer_name: "Enes Şenol",
      updated_at: "2026-10-17T16:20:00+03:00", origin: "revision", base_version: 0 },
    { id: 44, case_key: "ornek-ice-aktarma-01", version: 1, title: "Örnek: Dosyadan Gelen Vaka",
      type: "open", steps: 3, author_name: "Yönetici Kişi", reviewer_name: "Enes Şenol",
      updated_at: "2026-10-17T17:05:00+03:00", origin: "import", base_version: null },
  ],
};

/* Sample people, for the panel without a server. */
const SAMPLE_PEOPLE = {
  queue: {
    waiting: 2,
    items: [
      { id: 901, person_id: 41, first: true, own: false, state: "pending",
        submitted_at: "2026-10-18T09:12:00+03:00", fields: ["given_name", "family_name", "username", "unit_id", "bio"],
        warnings: [{ field: "bio", code: "social", detail: "instagram" }],
        person: { status: "active", rejected_before: 0 }, before: null,
        after: { given_name: "Ece", family_name: "Kara", title: null, username: "ece.kara",
                 faculty: "Mühendislik ve Doğa Bilimleri Fakültesi", department: "Bilgisayar Mühendisliği",
                 role: "student", bio: "Veri bilimiyle ilgileniyorum. Instagram: ece.k" } },
      { id: 902, person_id: 42, first: false, own: false, state: "pending",
        submitted_at: "2026-10-18T14:40:00+03:00", fields: ["username", "bio"],
        warnings: [{ field: "bio", code: "word", detail: "salak" }],
        person: { status: "active", rejected_before: 1 },
        before: { given_name: "Kerem", family_name: "Sarı", title: null, username: "kerem_s",
                  faculty: "Hukuk Fakültesi", department: null, role: "student", bio: "Hukuk ve teknoloji." },
        after: { given_name: "Kerem", family_name: "Sarı", title: null, username: "kerem.sari",
                 faculty: "Hukuk Fakültesi", department: null, role: "student",
                 bio: "Hukuk ve teknoloji. Salak sorular da sorarım." } },
    ],
  },
  decided: [],
  people: [
    { person_id: 53, name: "Murat Kılıç", given_name: "Murat", family_name: "Kılıç",
      username: "murat.kilic", email: "ornek.akademisyen@sdu.edu.tr", role: "academic",
      title: "drogruyesi", title_label: "Dr. Öğr. Üyesi", unit_id: 3,
      faculty: "Mühendislik ve Doğa Bilimleri Fakültesi", department: "Bilgisayar Mühendisliği",
      bio: "Veri analitiği üzerine çalışıyorum.", status: "active", approved: true, admin: false,
      waiting: false, avatar: null, suspension: null },
    { person_id: 51, name: "Deniz Yılmaz", given_name: "Deniz", family_name: "Yılmaz",
      username: "deniz.y", email: "ornek.ogrenci1@stud.sdu.edu.tr", role: "student",
      title: null, title_label: null, unit_id: 7, bio: null,
      faculty: "İktisadi ve İdari Bilimler Fakültesi", department: null, status: "suspended",
      approved: true, admin: false, waiting: false, avatar: null,
      suspension: { starts_at: "2026-10-17T10:00:00+03:00", ends_at: "2026-10-24T10:00:00+03:00",
                    reason: "Biyografi alanına üç kez reklam bağlantısı eklendi.", note: "İki kez uyarıldı." } },
    { person_id: 52, name: "Lale Su", given_name: "Lale", family_name: "Su", username: "lale.su",
      email: "ornek.ogrenci2@stud.sdu.edu.tr", role: "student", title: null, title_label: null,
      unit_id: 9, bio: null, faculty: "Eğitim Fakültesi", department: null, status: "active",
      approved: true, admin: false, waiting: true, avatar: null, suspension: null },
  ],
};

const SAMPLE_PROFILE_OPTIONS = {
  titles: [
    { code: "prof", label: "Prof. Dr.", active: true },
    { code: "docdr", label: "Doç. Dr.", active: true },
    { code: "drogruyesi", label: "Dr. Öğr. Üyesi", active: true },
    { code: "arsgor", label: "Arş. Gör.", active: true },
    { code: "idari", label: "İdari Personel", active: true },
  ],
  units: [
    { id: 2, name: "Mühendislik ve Doğa Bilimleri Fakültesi", selectable: false,
      children: [{ id: 3, name: "Bilgisayar Mühendisliği" },
                 { id: 4, name: "Elektrik-Elektronik Mühendisliği" }] },
    { id: 7, name: "İktisadi ve İdari Bilimler Fakültesi", selectable: true, children: [] },
    { id: 9, name: "Eğitim Fakültesi", selectable: true, children: [] },
    { id: 10, name: "Bilgi İşlem Daire Başkanlığı", selectable: true, children: [] },
  ],
  bio_max: 160,
};

const SAMPLE_CASE_REPORTS = {
  open_total: 3,
  cases: [
    { case_key: "2026-W34-fabricated-citation", title: "Var Olmayan Kaynak", open: 2, reports: [
      { id: 11, step_key: "st2", step_index: 2, variant_key: "B", case_version: null,
        kind: "source", role: "student", state: "open",
        body: "İkinci künyedeki cilt numarası derginin sitesindekiyle aynı değil.",
        created_at: "2026-10-17T10:12:00+03:00", closed_at: null, close_note: null },
      { id: 12, step_key: null, step_index: null, variant_key: "A", case_version: null,
        kind: "wording", role: "academic", state: "open",
        body: "Bağlamın ikinci cümlesi yarım kalmış gibi okunuyor.",
        created_at: "2026-10-16T15:40:00+03:00", closed_at: null, close_note: null },
    ] },
    { case_key: "core-01-family-health-query", title: "Annenin Tahlil Sonucu", open: 1, reports: [
      { id: 9, step_key: "st1", step_index: 1, variant_key: "C", case_version: 2,
        kind: "answer_key", role: "student", state: "open",
        body: "Doğum tarihini işaretlediğim hâlde eksik saydı.",
        created_at: "2026-10-15T09:05:00+03:00", closed_at: null, close_note: null },
    ] },
  ],
};

const SAMPLE_CLOSED_REPORTS = {
  open_total: 3,
  cases: [
    { case_key: "2026-W35-voice-clone", title: "Sesi Tanıdık Gelen Arama", open: 0, reports: [
      { id: 4, step_key: "st3", step_index: 3, variant_key: "A", case_version: null,
        kind: "wording", role: "admin_staff", state: "fixed",
        body: "Üçüncü adımda “aramayı sonlandır” seçeneği iki kez yazılmış.",
        created_at: "2026-10-09T11:30:00+03:00", closed_at: "2026-10-10T09:00:00+03:00",
        close_note: "Yinelenen seçenek çıkarıldı, teşekkürler." },
    ] },
  ],
};

const SAMPLE_IMPORT = [
  { file: "yeni-vakalar/ornek-01.tr.yaml", key: "ornek-ice-aktarma-01",
    title: "Örnek: Dosyadan Gelen Vaka", draft_id: 51, status: "in_review", revision: false,
    problems: [] },
  { file: "yeni-vakalar/ornek-02.tr.yaml", key: "ornek-ice-aktarma-02",
    title: "Örnek: Eksik Alanlı Vaka", draft_id: 52, status: "draft", revision: false,
    problems: ["st1: Puan 1 ile 10 arasında olmalı.",
               "st3: Örnek cevap yok, bu yüzden kurallar sınanamıyor."] },
  { file: "notlar.txt", status: "rejected",
    problems: ["Yalnızca .yaml, .yml, .json ya da .zip dosyası alınır."] },
];

const SAMPLE_LOOP = {
  threshold: 10, focus: null,
  cards: [
    { kind: "weakest", dimension: "op_security", chance: 0.41, people: 380 },
    { kind: "overconfident", dimension: "verification", people: 214,
      confidence: 0.81, hit_rate: 0.62 },
    { kind: "review_wave", dimension: "privacy", people: 37 },
  ],
};

const SAMPLE_HINT = {
  running: true, threshold: 0.45, min_people: 20,
  arms: { hint: { people: 46, steps: 131, gain: 0.052, hit_rate: 0.48 },
          control: { people: 44, steps: 127, gain: 0.011, hit_rate: 0.41 } },
  difference: { value: 0.041, low: -0.006, high: 0.088 },
};

/* ----------------------------- problem reports ---------------------------- */

const REPORT_TONE = { answer_key: ACCENT, source: WARN, wording: MUTED, technical: MUTED,
                      other: MUTED };

function CaseReports({ t, lang, offline, onCount }) {
  const [view, setView] = useState("open");
  const [data, setData] = useState(null);
  const [flash, setFlash] = useState(null);
  const [notes, setNotes] = useState({});
  const [bulk, setBulk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revise, revising] = useRevise(t, offline);

  const load = React.useCallback(async () => {
    if (offline) { setData(view === "open" ? SAMPLE_CASE_REPORTS : SAMPLE_CLOSED_REPORTS); return; }
    try {
      const d = await admin.caseReports(view);
      setData(d);
      onCount?.(d.open_total);
    } catch (e) { setFlash(e.message); }
  }, [offline, view, onCount]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn) => {
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(true); setFlash(null);
    try { await fn(); setBulk(null); await load(); }
    catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };
  const note = (k) => (notes[k] ?? "").trim();
  const setNote = (k, v) => setNotes((m) => ({ ...m, [k]: v }));

  return (
    <section style={S.card} data-panel="case-reports">
      <div style={S.headRow}>
        <div style={{ ...S.cardHead, marginBottom: 0 }}>{t.reportsHead}</div>
        <div style={S.miniSeg} role="group" aria-label={t.reportsHead}>
          {[["open", t.reportsOpen], ["closed", t.reportsClosed]].map(([v, label]) => (
            <button key={v} aria-pressed={view === v} data-view={v}
              onClick={() => { setView(v); setData(null); setBulk(null); setFlash(null); }}
              style={{ ...S.miniBtn, ...(view === v ? S.miniOn : null) }}>{label}</button>
          ))}
        </div>
      </div>
      <p style={S.note}>{t.reportsWhat}</p>
      {flash && <p style={S.flash} role="status">{flash}</p>}
      {data && data.cases.length === 0 && (
        <p style={S.hint}>{view === "open" ? t.reportsNone : t.reportsNoneClosed}</p>
      )}
      <div style={S.list}>
        {(data?.cases ?? []).map((g) => {
          const caseNote = `case:${g.case_key}`;
          return (
            <div key={g.case_key} style={S.reportGroup} data-report-case={g.case_key}>
              <div style={S.rowTop}>
                <span style={S.caseTitleRow}>
                  <span style={S.caseTitle} data-user-content>{g.title ?? g.case_key}</span>
                  {g.open > 0 && (
                    <span style={{ ...S.pill, color: ACCENT, borderColor: ACCENT }}>
                      {t.openCount.replace("{n}", g.open)}
                    </span>
                  )}
                </span>
                <CaseVersions t={t} caseKey={g.case_key} locales={g.locales} revise={revise} />
              </div>
              <div style={S.caseMeta}>{g.case_key}</div>
              <ReviseNote t={t} note={revising} caseKey={g.case_key} />

              {g.reports.map((r) => (
                <ReportRow key={r.id} t={t} lang={lang} r={r} busy={busy}
                  bilingual={(g.locales ?? []).length > 1}
                  note={notes[r.id] ?? ""} setNote={(v) => setNote(r.id, v)}
                  close={(action) => act(async () => {
                    await admin.closeReport(r.id, action, action === "reopen" ? null : note(r.id));
                    setNote(r.id, "");
                  })} />
              ))}

              {view === "open" && g.open > 1 && bulk !== g.case_key && (
                <button onClick={() => setBulk(g.case_key)} style={S.linkBtn}
                  data-action="close-case">{t.closeAll}</button>
              )}
              {bulk === g.case_key && (
                <div style={S.confirm}>
                  <p style={S.confirmBody}>{plural(t, "closeAllWhat", g.open).replace("{n}", g.open)}</p>
                  <input value={notes[caseNote] ?? ""} maxLength={500} aria-label={t.reportNote}
                    onChange={(e) => setNote(caseNote, e.target.value)} placeholder={t.reportNote}
                    style={{ ...S.input, width: "100%", marginTop: 8 }} data-field="case-note" />
                  <div style={S.actions}>
                    <button disabled={busy} style={S.smallPrimary} data-action="close-case-fixed"
                      onClick={() => act(() => admin.closeCaseReports(g.case_key, "fixed", note(caseNote)))}>
                      {t.markFixed}
                    </button>
                    <button disabled={busy} style={S.smallGhost} data-action="close-case-dismissed"
                      onClick={() => act(() => admin.closeCaseReports(g.case_key, "dismissed", note(caseNote)))}>
                      {t.markDismissed}
                    </button>
                    <button style={S.smallGhost} onClick={() => setBulk(null)}>{t.cancel}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReportRow({ t, lang, r, busy, note, setNote, close, bilingual = false }) {
  const where = r.step_index ? t.reportStep.replace("{n}", r.step_index)
    : r.step_key ?? t.reportWhole;
  // Which language version it came from, once the case has two.
  const meta = [where, t.roles[r.role] ?? r.role, when(r.created_at, lang),
                bilingual && r.locale && t.reportFrom.replace("{l}", t.caseLangs[r.locale] ?? r.locale),
                r.variant_key && t.reportVariant.replace("{v}", r.variant_key),
                r.case_version != null && t.reportVersion.replace("{n}", r.case_version)]
    .filter(Boolean).join(" · ");
  const tone = REPORT_TONE[r.kind] ?? MUTED;
  const closedTone = r.state === "fixed" ? GOOD : MUTED;
  return (
    <div style={S.reportRow} data-report={r.id} data-state={r.state}>
      <div style={S.reportTop}>
        <span style={{ ...S.pill, color: inkOf(tone), borderColor: tone }}>
          {t.reportKinds[r.kind] ?? r.kind}
        </span>
        <span style={S.reviewMeta}>{meta}</span>
      </div>
      <p style={S.reportBody} data-user-content>{r.body}</p>
      {r.state === "open" ? (
        <div style={S.reportClose}>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
            placeholder={t.reportNote} aria-label={t.reportNote}
            style={{ ...S.input, minHeight: 36, fontSize: 13 }} data-field="report-note" />
          <button disabled={busy} onClick={() => close("fixed")} style={S.smallPrimary}
            data-action="report-fixed">{t.markFixed}</button>
          <button disabled={busy} onClick={() => close("dismissed")} style={S.smallGhost}
            data-action="report-dismissed">{t.markDismissed}</button>
        </div>
      ) : (
        <div style={S.reportClose}>
          <span style={{ ...S.pill, color: closedTone, borderColor: closedTone }}>
            {t.reportStates[r.state] ?? r.state}
          </span>
          {r.close_note && <span style={S.closeNote} data-user-content>{r.close_note}</span>}
          <span style={S.reviewMeta}>{when(r.closed_at, lang)}</span>
          <button disabled={busy} onClick={() => close("reopen")} style={S.smallGhost}
            data-action="report-reopen">{t.reopen}</button>
        </div>
      )}
    </div>
  );
}

/* ----------------------- drafts and cases from files ----------------------- */

/* Approval says a case is sound; publishing it is the programme's decision,
   so the last step is taken here. */
function DraftsQueue({ t, live, offline, reload }) {
  const d = live.drafts;
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(null);
  if (!d) return null;
  const publish = async (id) => {
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(id); setFlash(null);
    try { await admin.publishDraft(id); setFlash(t.draftPublished); reload(); }
    catch (e) { setFlash(e.message); }
    finally { setBusy(null); }
  };
  return (
    <section style={S.card} data-panel="drafts">
      <div style={S.cardHead}>{t.draftsHead}</div>
      {d.approved.length === 0 && <p style={S.hint}>{t.draftsNone}</p>}
      <div style={S.list}>
        {d.approved.map((x) => {
          const replaces = x.base_version !== null && x.base_version !== undefined;
          return (
            <div key={x.id} style={S.reviewRow} data-draft={x.id}>
              <div style={S.reviewMain}>
                <div style={S.rowTop}>
                  <span style={S.reviewName} data-user-content>{x.title ?? x.case_key}</span>
                  <span style={{ ...S.pill, color: ACCENT, borderColor: ACCENT }}>
                    {t.draftOrigin[x.origin] ?? x.origin}
                  </span>
                </div>
                <div style={S.reviewMeta}>
                  {x.locale && (
                    <span style={S.langChip} data-case-lang={x.locale}
                      title={t.caseLangsTitle.replace("{l}", t.caseLangs[x.locale] ?? x.locale)}>
                      {x.locale.toUpperCase()}
                    </span>
                  )}
                  {[x.case_key, t.draftVersion.replace("{n}", x.version)].join(" · ")}
                  {/* People's names are shown as they wrote them. */}
                  {x.author_name && <> · <Named text={t.draftBy} who={x.author_name} /></>}
                  {x.reviewer_name && <> · <Named text={t.draftApprovedBy} who={x.reviewer_name} /></>}
                </div>
                {replaces && <div style={S.reviewDetail}>{t.draftReplaces}</div>}
                {x.origin === "translation" && (
                  <div style={S.reviewDetail}>{t.draftAddsLanguage}</div>
                )}
              </div>
              <div style={S.reviewActions}>
                <button onClick={() => publish(x.id)} disabled={busy === x.id}
                  style={S.smallPrimary} data-action="publish-draft">
                  {busy === x.id ? "…" : t.publishDraft}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {d.in_review > 0 && <p style={S.note}>{plural(t, "draftsWaiting", d.in_review).replace("{n}", d.in_review)}</p>}
      {flash && <p style={S.flash} role="status">{flash}</p>}
    </section>
  );
}

/* "By {who}" with the name marked as a person's own. */
function Named({ text, who }) {
  const [before, after] = text.split("{who}");
  return <>{before}<span data-user-content>{who}</span>{after}</>;
}

const IMPORT_TONE = { in_review: GOOD, draft: WARN, rejected: ACCENT };

function ImportBox({ t, offline, reload }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const [flash, setFlash] = useState(null);
  const pick = React.useRef(null);

  const send = async () => {
    if (!files.length) return;
    setFlash(null);
    if (offline) { setOut(SAMPLE_IMPORT); setFlash(t.notSaved); return; }
    setBusy(true);
    try {
      const r = await admin.importCases(files);
      setOut(r.results);
      setFiles([]);
      if (pick.current) pick.current.value = "";
      reload();
    } catch (e) {
      setFlash(e.status === 403 ? t.importNeedsAuthor : e.message);
    } finally { setBusy(false); }
  };
  const count = (s) => (out ?? []).filter((x) => x.status === s).length;
  return (
    <section style={S.card} data-panel="import">
      <div style={S.cardHead}>{t.importHead}</div>
      <p style={S.note}>{t.importWhat}</p>
      <div style={S.fileRow}>
        <label style={S.fileLabel} data-file>
          <input ref={pick} type="file" multiple accept=".yaml,.yml,.json,.zip"
            onChange={(e) => setFiles([...e.target.files])} style={S.fileInput}
            data-field="import-files" />
          {t.importChoose}
        </label>
        <span style={S.fileNames}>
          {files.length ? files.map((f) => f.name).join(", ") : t.importNone}
        </span>
      </div>
      <p style={S.hint}>{t.importLimits}</p>
      <div style={S.actions}>
        <button onClick={send} disabled={!files.length || busy} data-action="import-send"
          style={{ ...S.primary, ...(!files.length || busy ? S.disabled : null) }}>
          {busy ? "…" : t.importSend}
        </button>
        {flash && <span style={S.flash}>{flash}</span>}
      </div>
      {out && (
        <div style={{ marginTop: 14 }} data-panel="import-results">
          <p style={S.hintStrong}>
            {t.importSummary.replace("{r}", count("in_review")).replace("{d}", count("draft"))
              .replace("{x}", count("rejected"))}
          </p>
          <div style={S.list}>
            {out.map((x, i) => <ImportRow key={`${x.file}-${i}`} t={t} x={x} />)}
          </div>
        </div>
      )}
    </section>
  );
}

function ImportRow({ t, x }) {
  const tone = IMPORT_TONE[x.status] ?? MUTED;
  const problems = x.problems ?? [];
  return (
    <div style={S.reviewRow} data-import={x.key ?? x.file} data-status={x.status}>
      <div style={S.reviewMain}>
        <div style={S.rowTop}>
          <span style={S.reviewName} data-user-content>{x.title ?? x.key ?? x.file}</span>
          <span style={{ ...S.pill, color: inkOf(tone), borderColor: tone }}>
            {t.importState[x.status] ?? x.status}
          </span>
        </div>
        <div style={S.reviewMeta}>{[x.file, x.key].filter(Boolean).join(" · ")}</div>
        {x.revision && <div style={S.reviewDetail}>{t.importRevision}</div>}
        {problems.length > 0 && (
          <ul style={S.problemList}>
            {problems.slice(0, 4).map((m, k) => <li key={k}>{m}</li>)}
            {problems.length > 4 && <li>{plural(t, "importMore", problems.length - 4).replace("{n}", problems.length - 4)}</li>}
          </ul>
        )}
      </div>
      {x.draft_id && (
        <div style={S.reviewActions}>
          <a href={`#vaka-yaz/${x.draft_id}`} style={S.inlineLink}>{t.openDraft}</a>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- limits --------------------------------- */

const LIMIT_FIELDS = [
  ["session_case_limit", "limitCases", 1, 20],
  ["session_minutes", "limitMinutes", 10, 240],
  ["cooldown_hours", "limitCooldown", 0, 168],
  ["weekly_case_limit", "limitWeekly", 1, 100],
];
const LIMIT_DEFAULTS = { limits_enabled: true, session_case_limit: 3, session_minutes: 45,
                         cooldown_hours: 12, weekly_case_limit: 10 };

function LimitsCard({ t, offline }) {
  const [stored, setStored] = useState(null);
  const [form, setForm] = useState({});
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = React.useCallback(async () => {
    try {
      const s = offline ? LIMIT_DEFAULTS : await admin.settings();
      const v = Object.fromEntries(Object.keys(LIMIT_DEFAULTS)
        .map((k) => [k, s[k] ?? LIMIT_DEFAULTS[k]]));
      setStored(v);
      setForm(Object.fromEntries(LIMIT_FIELDS.map(([k]) => [k, String(v[k])])));
    } catch (e) { setFlash(e.message); }
  }, [offline]);
  useEffect(() => { load(); }, [load]);

  if (!stored) {
    return flash ? (
      <section style={S.card} data-panel="limits">
        <div style={S.cardHead}>{t.limitsHead}</div>
        <p style={S.hint}>{flash}</p>
      </section>
    ) : null;
  }
  const toggle = async () => {
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(true); setFlash(null);
    try { await admin.putSetting("limits_enabled", !stored.limits_enabled); await load(); setFlash(t.saved); }
    catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setFlash(null);
    const changes = [];
    for (const [key, label, lo, hi] of LIMIT_FIELDS) {
      const raw = String(form[key] ?? "").trim();
      const n = Number(raw);
      if (!/^\d+$/.test(raw) || n < lo || n > hi) {
        setFlash(t.limitBad.replace("{field}", t[label]).replace("{lo}", lo).replace("{hi}", hi));
        return;
      }
      if (n !== stored[key]) changes.push([key, n]);
    }
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(true);
    try {
      for (const [key, n] of changes) await admin.putSetting(key, n);
      await load();
      setFlash(t.limitsSaved);
    } catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };
  return (
    <section style={S.card} data-panel="limits">
      <div style={S.cardHead}>{t.limitsHead}</div>
      <p style={S.note}>{t.limitsWhat}</p>
      <div style={S.toggleRow}>
        <span style={{ ...S.stateDot, background: stored.limits_enabled ? GOOD : MUTED }} />
        <span style={S.toggleText} data-limits={stored.limits_enabled ? "on" : "off"}>
          {stored.limits_enabled ? t.limitsOn : t.limitsOff}
        </span>
        <button onClick={toggle} disabled={busy} style={S.smallGhost}
          aria-pressed={stored.limits_enabled} data-action="limits-toggle">
          {stored.limits_enabled ? t.limitsTurnOff : t.limitsTurnOn}
        </button>
      </div>
      <div style={S.ruleForm}>
        {LIMIT_FIELDS.map(([key, label, lo, hi]) => (
          <label key={key} style={S.limitField}>
            <span style={S.ruleCap}>{t[label]}</span>
            <input type="number" min={lo} max={hi} step="1" inputMode="numeric"
              value={form[key] ?? ""} data-field={key}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              style={{ ...S.input, fontFamily: MONO, minWidth: 0 }} />
            <span style={S.mono}>{t.limitRange.replace("{lo}", lo).replace("{hi}", hi)}</span>
          </label>
        ))}
      </div>
      <div style={S.actions}>
        <button onClick={save} disabled={busy} data-action="limits-save"
          style={{ ...S.primary, ...(busy ? S.disabled : null) }}>{t.limitsSave}</button>
        {flash && <span style={S.flash} role="status">{flash}</span>}
      </div>
    </section>
  );
}

/* ---------------------------- visitors' campus ---------------------------- */

/* What the campus shows to someone who has not signed in, part by part. */
const VISITOR_PARTS = [
  ["public_campus", "visCampus", "visCampusWhat"],
  ["public_campus_twin", "visTwin", "visTwinWhat"],
  ["public_unit_awareness", "visUnits", "visUnitsWhat"],
  ["public_board", "visBoard", "visBoardWhat"],
];
const SAMPLE_VISITORS = {
  switches: { public_campus: true, public_campus_twin: true, public_unit_awareness: false,
              public_board: false },
  board_people: 140, board_public_people: 36,
};

function VisitorsCard({ t, offline, canWrite }) {
  const [data, setData] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = React.useCallback(async () => {
    if (offline) { setData(SAMPLE_VISITORS); return; }
    try { setData(await admin.visitors()); } catch (e) { setFlash(e.message); }
  }, [offline]);
  useEffect(() => { load(); }, [load]);
  if (!data) {
    return flash ? (
      <section style={S.card} data-panel="visitors">
        <div style={S.cardHead}>{t.visHead}</div>
        <p style={S.hint}>{flash}</p>
      </section>
    ) : null;
  }
  const flip = async (key) => {
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(true); setFlash(null);
    try { await admin.putSetting(key, !data.switches[key]); await load(); setFlash(t.saved); }
    catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };
  const page = data.switches.public_campus;
  return (
    <section style={S.card} data-panel="visitors">
      <div style={S.cardHead}>{t.visHead}</div>
      <p style={S.note}>{t.visWhat}</p>
      <div style={S.visList}>
        {VISITOR_PARTS.map(([key, name, what], i) => {
          const on = data.switches[key];
          // A part is open to visitors only while the page itself is.
          const shown = on && (i === 0 || page);
          return (
            <div key={key} style={{ ...S.visRow, ...(i > 0 && !page ? S.visRowAside : null) }}
              data-visitor-part={key} data-state={on ? "on" : "off"}>
              <span style={{ ...S.stateDot, background: shown ? GOOD : MUTED }} />
              <span style={S.visText}>
                <span style={S.visName}>{t[name]}</span>
                <span style={S.visWhatLine}>
                  {t[what].replace("{n}", data.board_public_people ?? 0)
                          .replace("{m}", data.board_people ?? 0)}
                </span>
              </span>
              <button onClick={() => flip(key)} disabled={busy || !canWrite} style={S.smallGhost}
                aria-pressed={on} data-action={`visitor-${key}`}>
                {on ? t.visTurnOff : t.visTurnOn}
              </button>
            </div>
          );
        })}
      </div>
      {!page && <p style={S.hint}>{t.visPageOff}</p>}
      {flash && <p style={S.flash} role="status">{flash}</p>}
    </section>
  );
}

/* ------------------------------ sign-in codes ------------------------------ */

const CODE_LIMIT = { key: "code_requests_per_ip", lo: 1, hi: 1000, fallback: 5,
                     panel: "code-limit", head: "codeLimitHead", what: "codeLimitWhat",
                     field: "codeLimitField", save: "codeLimitSave" };
const FAST_LIMIT = { key: "fast_finish_percent", lo: 0, hi: 90, fallback: 20,
                     panel: "fast-limit", head: "fastLimitHead", what: "fastLimitWhat",
                     field: "fastLimitField", save: "fastLimitSave" };

function CodeLimitCard({ t, offline }) {
  return <NumberSettingCard t={t} offline={offline} setting={CODE_LIMIT} />;
}

/* One number the panel sets, with what it does said above it. */
function NumberSettingCard({ t, offline, setting }) {
  const [stored, setStored] = useState(null);
  const [value, setValue] = useState("");
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = React.useCallback(async () => {
    try {
      const s = offline ? {} : await admin.settings();
      const n = s[setting.key] ?? setting.fallback;
      setStored(n);
      setValue(String(n));
    } catch (e) { setFlash(e.message); }
  }, [offline, setting]);
  useEffect(() => { load(); }, [load]);

  if (stored === null) {
    return flash ? (
      <section style={S.card} data-panel={setting.panel}>
        <div style={S.cardHead}>{t[setting.head]}</div>
        <p style={S.hint}>{flash}</p>
      </section>
    ) : null;
  }
  const { key, lo, hi } = setting;
  const save = async () => {
    setFlash(null);
    const raw = value.trim();
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || n < lo || n > hi) {
      setFlash(t.limitBad.replace("{field}", t[setting.field]).replace("{lo}", lo).replace("{hi}", hi));
      return;
    }
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(true);
    try {
      if (n !== stored) await admin.putSetting(key, n);
      await load();
      setFlash(t.saved);
    } catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };
  return (
    <section style={S.card} data-panel={setting.panel}>
      <div style={S.cardHead}>{t[setting.head]}</div>
      <p style={S.note}>{t[setting.what]}</p>
      <div style={S.ruleForm}>
        <label style={{ ...S.limitField, maxWidth: 260 }}>
          <span style={S.ruleCap}>{t[setting.field]}</span>
          <input type="number" min={lo} max={hi} step="1" inputMode="numeric"
            value={value} data-field={key}
            onChange={(e) => setValue(e.target.value)}
            style={{ ...S.input, fontFamily: MONO, minWidth: 0 }} />
          <span style={S.mono}>{t.limitRange.replace("{lo}", lo).replace("{hi}", hi)}</span>
        </label>
      </div>
      <div style={S.actions}>
        <button onClick={save} disabled={busy} data-action={`${setting.panel}-save`}
          style={{ ...S.primary, ...(busy ? S.disabled : null) }}>{t[setting.save]}</button>
        {flash && <span style={S.flash} role="status">{flash}</span>}
      </div>
    </section>
  );
}

/* ----------------------------- the twin's loop ----------------------------- */

function Interventions({ t, lang, offline }) {
  const [data, setData] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = React.useCallback(async () => {
    if (offline) { setData(SAMPLE_LOOP); return; }
    try { setData(await admin.interventions()); } catch (e) { setFlash(e.message); }
  }, [offline]);
  useEffect(() => { load(); }, [load]);
  if (!data) {
    return flash ? (
      <section style={S.card} data-panel="interventions">
        <div style={S.cardHead}>{t.loopHead}</div>
        <p style={S.hint}>{flash}</p>
      </section>
    ) : null;
  }
  const dim = (d) => t.dims[d] ?? d;
  const pct = (x) => Math.round(x * 100);
  const text = (c) => {
    switch (c.kind) {
      case "weakest":
        return t.loopWeakest.replace("{dim}", dim(c.dimension)).replace("{p}", pct(c.chance));
      case "overconfident":
        return t.loopOverconfident.replace("{dim}", dim(c.dimension))
          .replace("{c}", pct(c.confidence)).replace("{s}", pct(c.hit_rate));
      case "review_wave":
        return t.loopReviewWave.replace("{dim}", dim(c.dimension)).replace("{n}", c.people);
      case "few_cases":
        return t.loopFewCases.replace("{dim}", dim(c.dimension)).replace("{n}", c.cases);
      default:
        return null;
    }
  };
  const focus = async (dimension) => {
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(true); setFlash(null);
    try {
      await admin.setFocus(dimension, 7);
      await load();
      setFlash(dimension ? t.focusSet : t.focusCleared);
    } catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };
  const focusable = (c) => c.kind === "weakest" || c.kind === "overconfident";
  const cards = data.cards.filter((c) => text(c));
  return (
    <section style={S.card} data-panel="interventions">
      <div style={S.cardHead}>{t.loopHead}</div>
      <p style={S.hint}>{t.loopWhat.replace("{k}", data.threshold)}</p>
      {data.focus && (
        <div style={S.focusBox} data-focus={data.focus.dimension}>
          <span style={S.rowGlyph}><Icon name={data.focus.dimension} size={16} /></span>
          <span style={{ flex: 1, minWidth: 200 }}>
            {t.focusNow.replace("{dim}", dim(data.focus.dimension))
              .replace("{until}", day(data.focus.until, lang))}
          </span>
          <button onClick={() => focus(null)} disabled={busy} style={S.smallGhost}
            data-action="focus-clear">{t.focusClear}</button>
        </div>
      )}
      {cards.length === 0 && <p style={S.hint}>{t.loopNone}</p>}
      <div style={S.list}>
        {cards.map((c, i) => (
          <div key={`${c.kind}-${c.dimension}-${i}`} style={S.loopRow}
            data-card={c.kind} data-dimension={c.dimension}>
            <span style={S.rowGlyph}><Icon name={c.dimension} size={18} /></span>
            <span style={S.loopText}>{text(c)}</span>
            {focusable(c) && data.focus?.dimension !== c.dimension && (
              <button onClick={() => focus(c.dimension)} disabled={busy} style={S.smallGhost}
                data-action="focus">{t.focusThis}</button>
            )}
          </div>
        ))}
      </div>
      {flash && <p style={S.flash} role="status">{flash}</p>}
    </section>
  );
}

function HintExperiment({ t, lang, offline }) {
  const [data, setData] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = React.useCallback(async () => {
    if (offline) { setData(SAMPLE_HINT); return; }
    try { setData(await admin.hintExperiment()); } catch (e) { setFlash(e.message); }
  }, [offline]);
  useEffect(() => { load(); }, [load]);
  if (!data) {
    return flash ? (
      <section style={S.card} data-panel="hint-experiment">
        <div style={S.cardHead}>{t.hintHead}</div>
        <p style={S.hint}>{flash}</p>
      </section>
    ) : null;
  }
  const flip = async () => {
    if (offline) { setFlash(t.notSaved); return; }
    setBusy(true); setFlash(null);
    try { await admin.putSetting("hint_experiment", !data.running); await load(); setFlash(t.saved); }
    catch (e) { setFlash(e.message); }
    finally { setBusy(false); }
  };
  const num = (x) => signed(x, lang);
  const arms = ["hint", "control", "open"].filter((a) => data.arms?.[a]);
  const d = data.difference;
  return (
    <section style={S.card} data-panel="hint-experiment">
      <div style={S.cardHead}>{t.hintHead}</div>
      <p style={S.hint}>{t.hintWhat}</p>
      {arms.length === 0 ? <p style={S.hint}>{t.hintNone}</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                {[t.hintGroup, t.hintPeople, t.hintSteps, t.hintGain, t.hintHit].map((h, i) => (
                  <th key={h} style={{ ...S.th, textAlign: i ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {arms.map((a) => {
                const x = data.arms[a];
                return (
                  <tr key={a} data-arm={a}>
                    <td style={S.td}>{t.hintArm[a]}</td>
                    <td style={S.tdNum}>{x.people}</td>
                    <td style={S.tdNum}>{x.steps}</td>
                    <td style={S.tdNum}>{num(x.gain)}</td>
                    <td style={S.tdNum}>{pctText(x.hit_rate, lang)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={S.hintStrong} data-hint-result>
        {d ? t.hintDiff.replace("{d}", num(d.value)).replace("{lo}", num(d.low))
               .replace("{hi}", num(d.high))
           : t.hintWait.replace("{n}", data.min_people)}
      </p>
      <p style={S.note}>{t.hintEthics}</p>
      <div style={S.actions}>
        <button onClick={flip} disabled={busy} data-action="hint-toggle" aria-pressed={data.running}
          style={{ ...S.ghost, ...(busy ? S.disabled : null) }}>
          {data.running ? t.hintStop : t.hintStart}
        </button>
        <span style={S.hint}>{data.running ? t.hintRunning : t.hintStopped}</span>
        {flash && <span style={S.flash}>{flash}</span>}
      </div>
    </section>
  );
}

/* --------------------------------- styles --------------------------------- */

const CSS = `${THEME_CSS}
* { box-sizing: border-box; }
button, select { font-family: inherit; }
button:focus-visible, select:focus-visible, input:focus-visible, a:focus-visible {
  outline: 2px solid ${ACCENT}; outline-offset: 2px;
}
label[data-file]:focus-within { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
/* Every tab in view on a wide screen; on a phone the row scrolls instead. */
.adm-tabs { flex-wrap: wrap; }
@media (max-width: 760px) { .adm-tabs { flex-wrap: nowrap; overflow-x: auto; } }
`;

const S = {
  brandBar: { display: "flex", alignItems: "center", gap: 14,
              padding: "12px 0 14px", marginBottom: 4,
              borderBottom: `1px solid ${LINE}` },
  brandWide: { height: 30, width: "auto", flexShrink: 0 },
  brandText: { flex: 1, minWidth: 0 },
  brandTitle: { fontSize: 16, fontWeight: 700, letterSpacing: "-.01em",
                color: TEXT, lineHeight: 1.2 },
  brandSub: { fontSize: 11.5, color: MUTED, lineHeight: 1.35, marginTop: 1 },
  brandSeal: { height: 30, width: "auto", flexShrink: 0 },
  root: { background: PAPER, color: TEXT, fontFamily: DISPLAY,
          padding: "0 18px 32px", maxWidth: 1180, margin: "0 auto" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, padding: "20px 2px 12px" },
  eyebrow: { fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", color: MUTED },
  h1: { margin: "4px 0 0", fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" },
  seg: { display: "flex", border: `1px solid ${LINE}`, borderRadius: 8,
         overflow: "hidden", background: CARD },
  segBtn: { padding: "8px 12px", minHeight: 38, background: "none", border: "none",
            color: MUTED, fontFamily: MONO, fontSize: 12, cursor: "pointer" },
  segOn: { background: "var(--fill)", color: TEXT },

  tabs: { display: "flex", gap: "0 4px", borderBottom: `1px solid ${LINE}`, marginBottom: 14,
          scrollbarWidth: "thin" },
  tab: { display: "flex", alignItems: "center", gap: 7, padding: "11px 16px", minHeight: 44,
         background: "none", border: "none", borderBottom: "2px solid transparent",
         // The longhand is repeated so that leaving the "on" style resets it:
         // React removes a longhand without re-applying the shorthand.
         borderBottomColor: "transparent", whiteSpace: "nowrap", flexShrink: 0,
         color: MUTED, fontSize: 14.5, cursor: "pointer" },
  tabOn: { color: TEXT, borderBottomColor: ACCENT, fontWeight: 600 },
  badge: { background: ACCENT, color: "var(--on-accent)", fontFamily: MONO, fontSize: 10.5,
           borderRadius: 99, padding: "2px 7px" },

  main: { display: "block" },
  split: { display: "grid", gap: 12, alignItems: "start" },
  card: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 },
  cardHead: { fontSize: 15, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 10 },
  blockLabel: { fontFamily: MONO, fontSize: 10.5, letterSpacing: ".1em",
                textTransform: "uppercase", color: MUTED, margin: "16px 0 8px" },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  mono: { fontFamily: MONO, fontSize: 12, color: MUTED },
  hint: { fontSize: 13, color: MUTED, margin: "4px 0" },
  note: { fontSize: 12.5, lineHeight: 1.5, color: MUTED, background: "var(--soft)",
          border: `1px solid ${LINE}`, borderRadius: 8, padding: "9px 11px", margin: "8px 0" },

  caseRow: { display: "grid", gap: 3, textAlign: "left", padding: "10px 11px",
             background: "transparent", border: `1px solid transparent`, borderRadius: 9,
             borderColor: "transparent", cursor: "pointer", color: TEXT },
  caseOn: { background: "rgba(192,0,0,.06)", borderColor: ACCENT },
  rowTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  caseTitleRow: { display: "flex", alignItems: "center", gap: 7, minWidth: 0 },
  caseTitle: { fontSize: 14, fontWeight: 600 },
  caseMeta: { fontFamily: MONO, fontSize: 10.5, color: MUTED },
  langChip: { display: "inline-block", fontSize: 9.5, fontWeight: 700, letterSpacing: ".04em",
              border: `1px solid ${LINE}`, borderRadius: 3, padding: "0 4px", marginRight: 5,
              lineHeight: "14px" },
  pill: { fontFamily: MONO, fontSize: 10, border: "1px solid", borderRadius: 99,
          padding: "1px 8px", whiteSpace: "nowrap" },
  warnBox: { marginTop: 12, padding: "10px 11px", borderRadius: 9,
             border: `1px dashed ${WARN}`, background: "var(--warn-soft)" },
  warnHead: { fontFamily: MONO, fontSize: 10.5, letterSpacing: ".08em",
              textTransform: "uppercase", color: WARN_TEXT, marginBottom: 4 },

  chips: { display: "flex", gap: 6, flexWrap: "wrap" },
  chip: { padding: "8px 14px", minHeight: 38, borderRadius: 99, border: `1px solid ${LINE}`,
          borderColor: LINE, background: CARD, color: MUTED, fontSize: 13.5, cursor: "pointer" },
  chipOn: { background: ACCENT, borderColor: ACCENT, color: "var(--on-accent)", fontWeight: 600 },

  rule: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          padding: "8px 10px", border: `1px solid ${LINE}`, borderRadius: 9, marginBottom: 6 },
  ruleName: { flex: 1, minWidth: 150, fontSize: 13.5, fontWeight: 600 },
  miniSeg: { display: "flex", border: `1px solid ${LINE}`, borderRadius: 7, overflow: "hidden" },
  miniBtn: { padding: "6px 11px", minHeight: 32, background: CARD, border: "none",
             color: MUTED, fontSize: 12.5, cursor: "pointer" },
  miniInclude: { background: GOOD, color: "var(--on-accent)", fontWeight: 600 },
  miniExclude: { background: ACCENT, color: "var(--on-accent)", fontWeight: 600 },
  subBtn: { padding: "6px 11px", minHeight: 32, borderRadius: 7, border: `1px solid ${LINE}`,
            background: CARD, color: MUTED, fontFamily: MONO, fontSize: 11, cursor: "pointer" },
  dropBtn: { background: "none", border: "none", color: MUTED, fontSize: 13,
             cursor: "pointer", padding: 6 },
  select: { width: "100%", minHeight: 40, marginTop: 8, padding: "0 10px",
            borderRadius: 9, border: `1px solid ${LINE}`, background: CARD,
            color: TEXT, fontSize: 13.5 },
  selectSmall: { minHeight: 34, padding: "0 8px", borderRadius: 7,
                 border: `1px solid ${LINE}`, background: CARD, fontSize: 12.5 },

  reachBox: { marginTop: 16, padding: 14, borderRadius: 10, background: "var(--soft)",
              border: `1px solid ${LINE}` },
  reachTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between",
              gap: 16, flexWrap: "wrap" },
  reachNum: { fontFamily: MONO, fontSize: 34, fontWeight: 500, letterSpacing: "-.03em",
              color: ACCENT },
  reachCap: { fontFamily: MONO, fontSize: 10.5, letterSpacing: ".08em",
              textTransform: "uppercase", color: MUTED },
  reachHint: { fontFamily: MONO, fontSize: 10.5, color: MUTED, marginTop: 6 },
  reachRoles: { display: "flex", gap: 18 },
  reachRole: { display: "grid", gap: 1 },
  reachRoleName: { fontSize: 11.5, color: MUTED },

  bars: { display: "grid", gap: 5 },
  barRow: { display: "grid", gridTemplateColumns: "minmax(90px,1fr) 2fr 42px",
            alignItems: "center", gap: 9 },
  barName: { fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis",
             whiteSpace: "nowrap" },
  barTrack: { height: 7, background: "var(--fill)", borderRadius: 99, overflow: "hidden" },
  barFill: { display: "block", height: "100%", borderRadius: 99, background: ACCENT },

  actions: { display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" },
  primary: { minHeight: 42, padding: "0 18px", borderRadius: 9, border: "none",
             background: ACCENT, color: "var(--on-accent)", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  ghost: { minHeight: 42, padding: "0 16px", borderRadius: 9, border: `1px solid ${LINE}`,
           background: CARD, color: TEXT, fontSize: 14, cursor: "pointer" },
  disabled: { background: "var(--line)", color: "var(--faint)", cursor: "not-allowed" },
  flash: { fontFamily: MONO, fontSize: 12, color: GOOD },
  smallPrimary: { minHeight: 34, padding: "0 12px", borderRadius: 7, border: "none",
                  background: ACCENT, color: "var(--on-accent)", fontSize: 12.5, cursor: "pointer" },
  smallGhost: { minHeight: 34, padding: "0 12px", borderRadius: 7, border: `1px solid ${LINE}`,
                background: CARD, color: MUTED, fontSize: 12.5, cursor: "pointer" },

  reviewRow: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start",
               padding: "11px 12px", border: `1px solid ${LINE}`, borderRadius: 9 },
  reviewMain: { flex: 1, minWidth: 200, display: "grid", gap: 3 },
  reviewName: { fontSize: 14.5, fontWeight: 700 },
  reviewMeta: { fontFamily: MONO, fontSize: 11, color: MUTED },
  reviewDetail: { fontSize: 13, color: TEXT },
  reviewActions: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },

  domainRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
               padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 9 },
  domainName: { flex: 1, minWidth: 160, fontFamily: MONO, fontSize: 14, fontWeight: 500 },
  domainForm: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },

  whoTop: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 },
  changeRow: { display: "grid", gap: 6, padding: "11px 12px", border: `1px solid ${LINE}`,
               borderRadius: 9, minWidth: 0 },
  personLine: { display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 },
  email: { fontFamily: MONO, fontSize: 12, color: TEXT, overflowWrap: "anywhere" },
  filterRow: { display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0 4px" },
  filterField: { display: "grid", gap: 4, flex: "1 1 160px", minWidth: 0 },
  filterCap: { fontSize: 12, fontWeight: 600, color: MUTED },
  filterSelect: { minHeight: 36, padding: "0 8px", borderRadius: 8, border: `1px solid ${LINE}`,
                  background: CARD, color: TEXT, fontSize: 13, width: "100%" },
  formGrid: { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" },
  formField: { display: "grid", gap: 4, minWidth: 0 },
  formInput: { width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 8,
               border: `1px solid ${LINE}`, background: CARD, color: TEXT, fontSize: 13.5 },
  diff: { width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" },
  diffField: { width: 108, textAlign: "left", fontWeight: 600, fontSize: 12, color: MUTED,
               padding: "6px 8px 6px 0", borderBottom: `1px solid ${LINE}`, verticalAlign: "top" },
  diffOld: { color: MUTED, overflowWrap: "anywhere" },
  diffNew: { background: "var(--warn-soft)", fontWeight: 600, overflowWrap: "anywhere" },
  warnList: { display: "flex", gap: 6, flexWrap: "wrap" },
  warnChip: { fontSize: 12, color: WARN_TEXT, background: "var(--warn-soft)", border: `1px solid ${WARN}`,
              borderRadius: 99, padding: "2px 9px" },
  decideBox: { display: "grid", gap: 6, padding: "10px 11px", borderRadius: 9,
               border: `1px solid ${LINE}`, background: "var(--soft)" },
  fieldCap: { fontSize: 12.5, fontWeight: 600, color: TEXT, marginTop: 4 },
  textarea: { width: "100%", minHeight: 58, padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${LINE}`, background: CARD, color: TEXT, fontSize: 13.5,
              fontFamily: DISPLAY, lineHeight: 1.45, resize: "vertical" },
  historyRow: { display: "grid", gap: 2, fontSize: 13, padding: "6px 0",
                borderBottom: `1px solid ${LINE}` },
  at: { fontFamily: MONO, fontSize: 16, color: MUTED },
  input: { flex: 1, minWidth: 160, minHeight: 42, padding: "9px 12px", borderRadius: 9,
           border: `1px solid ${LINE}`, background: "var(--soft)", color: TEXT, fontSize: 14 },
  unitRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
             padding: "9px 10px", borderBottom: `1px solid ${LINE}` },
  unitName: { flex: 1, minWidth: 160, fontSize: 13.5 },
  unitCode: { fontFamily: MONO, fontSize: 11, color: MUTED,
              border: `1px solid ${LINE}`, borderRadius: 5, padding: "1px 6px" },
  unregList: { maxHeight: 180, overflowY: "auto", display: "grid", gap: 2 },
  ruleForm: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 },
  accRow: { display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "2px 0" },
  accValue: { fontVariantNumeric: "tabular-nums", fontWeight: 600 },
  ruleField: { display: "grid", gap: 4, flex: 1, minWidth: 200 },
  ruleCap: { fontSize: 13, color: TEXT, fontWeight: 600 },
  revealRow: { display: "grid", gridTemplateColumns: "minmax(180px, 1.4fr) minmax(160px, 1fr) auto auto",
               alignItems: "center", gap: 12, padding: "10px 12px",
               border: `1px solid ${LINE}`, borderRadius: 9 },
  revealMain: { display: "grid", gap: 2, minWidth: 0 },
  revealMeter: { display: "grid", gap: 4 },
  revealNums: { fontSize: 12, color: MUTED },
  confirm: { marginTop: 14, padding: 14, borderRadius: 10,
             border: `1px solid ${ACCENT}`, background: "rgba(192,0,0,.05)" },
  confirmTitle: { fontSize: 14.5, fontWeight: 700, marginBottom: 6 },
  confirmBody: { fontSize: 13, lineHeight: 1.5, color: TEXT, margin: 0 },

  partRow: { display: "grid", gridTemplateColumns: "minmax(140px,1.4fr) 2fr 46px 62px",
             alignItems: "center", gap: 10, padding: "5px 0" },
  rowGlyph: { display: "inline-flex", verticalAlign: "-3px", marginRight: 7 },
  partName: { fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  partPct: { fontFamily: MONO, fontSize: 13, textAlign: "right" },

  /* Quiet on purpose. The marks identify the system and stay in the
     background. */
  colophon: { display: "grid", gap: 7, justifyItems: "center", textAlign: "center",
              marginTop: 24, paddingTop: 16, borderTop: `1px solid ${LINE}`,
              opacity: 0.78 },
  colophonCompact: { display: "grid", gap: 6, justifyItems: "center",
                     textAlign: "center", marginTop: 16, paddingTop: 12,
                     borderTop: `1px solid ${LINE}`, opacity: 0.7 },
  colophonMarks: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                   justifyContent: "center" },
  markWide: { height: 22, width: "auto" },
  markSeal: { height: 22, width: "auto" },
  colophonName: { fontSize: 10.5, color: MUTED, lineHeight: 1.45, maxWidth: "52ch" },
  colophonSep: { color: LINE },
  credits: { display: "grid", gap: 1, marginTop: 2 },
  creditsCap: { fontFamily: MONO, fontSize: 9, letterSpacing: ".14em",
                textTransform: "uppercase", color: MUTED, marginBottom: 2 },
  creditRow: { display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap",
               alignItems: "baseline" },
  creditName: { fontSize: 11, fontWeight: 600, color: MUTED },
  creditRole: { fontSize: 10.5, color: MUTED },
  offline: { fontSize: 13, lineHeight: 1.5, color: WARN_TEXT, background: "var(--warn-soft)",
             border: `1px solid ${WARN}`, borderRadius: 8, padding: "9px 12px",
             margin: "0 0 12px" },
  errline: { fontSize: 13, color: ACCENT, background: "rgba(192,0,0,.07)",
             border: `1px solid ${ACCENT}`, borderRadius: 8, padding: "9px 12px",
             margin: "0 0 12px" },
  demo: { fontSize: 11.5, color: MUTED, textAlign: "center", marginTop: 18 },

  stack: { display: "grid", gap: 12 },

  picRow: { display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" },
  picFrame: { width: 210, maxWidth: "100%", aspectRatio: "3 / 2", borderRadius: 9,
              overflow: "hidden", background: "var(--fill)", border: `1px solid ${LINE}`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  picImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  picEmpty: { fontSize: 12.5, color: MUTED, padding: 12, textAlign: "center" },
  picSide: { flex: 1, minWidth: 200, display: "grid", gap: 6, alignContent: "start" },
  picSource: { fontSize: 13.5, fontWeight: 600 },
  picActions: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },

  newsField: { display: "grid", gap: 5, marginTop: 12 },
  newsCount: { fontSize: 12, color: MUTED, lineHeight: 1.45 },
  newsDates: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
               gap: "0 12px" },
  newsPreview: { border: `1px solid ${LINE}`, borderLeft: `3px solid ${ACCENT}`,
                 borderRadius: 9, padding: "10px 12px", background: "var(--soft)" },
  newsPreviewTitle: { fontSize: 15, fontWeight: 700, overflowWrap: "anywhere" },
  newsPreviewDate: { fontSize: 12, color: MUTED, marginTop: 2 },
  newsPreviewBody: { fontSize: 13.5, lineHeight: 1.55, margin: "6px 0 0", whiteSpace: "pre-line",
                     overflowWrap: "anywhere" },
  newsPreviewLink: { display: "inline-block", marginTop: 6, fontSize: 12.5, color: ACCENT,
                     fontWeight: 600, overflowWrap: "anywhere" },
  awardTop: { display: "flex", alignItems: "flex-start", gap: 10 },
  holders: { borderTop: `1px solid ${LINE}`, marginTop: 6, paddingTop: 8, display: "grid", gap: 6 },
  holderRow: { display: "flex", alignItems: "center", gap: 9 },
  holderName: { fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" },
  newsRow: { display: "grid", gap: 6, padding: "11px 12px", border: `1px solid ${LINE}`,
             borderRadius: 9, minWidth: 0 },
  newsRowTitle: { fontSize: 14.5, fontWeight: 700, minWidth: 0, overflowWrap: "anywhere" },
  newsRowMeta: { fontSize: 12, color: MUTED },
  newsRowBody: { fontSize: 13, lineHeight: 1.5, margin: 0, whiteSpace: "pre-line",
                 overflowWrap: "anywhere", color: TEXT },
  headRow: { display: "flex", alignItems: "center", justifyContent: "space-between",
             gap: 10, flexWrap: "wrap", marginBottom: 10 },
  versionActions: { display: "inline-flex", gap: 6, flexWrap: "wrap" },
  miniOn: { background: TEXT, color: "var(--card)", fontWeight: 600 },
  inlineLink: { color: ACCENT, fontWeight: 600, textDecoration: "underline",
                textUnderlineOffset: 2 },
  linkBtn: { justifySelf: "start", background: "none", border: "none", padding: "6px 0",
             color: ACCENT, fontSize: 13, fontWeight: 600, cursor: "pointer",
             textDecoration: "underline", textUnderlineOffset: 2, textAlign: "left" },
  hintStrong: { fontSize: 13.5, color: TEXT, fontWeight: 600, margin: "8px 0" },

  reportGroup: { display: "grid", gap: 8, padding: "12px 12px 10px",
                 border: `1px solid ${LINE}`, borderRadius: 10 },
  reportRow: { display: "grid", gap: 6, padding: "10px 0 2px", borderTop: `1px solid ${LINE}` },
  reportTop: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  reportBody: { fontSize: 14, lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" },
  reportClose: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  closeNote: { fontSize: 13, color: TEXT, flex: 1, minWidth: 160 },

  fileRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 },
  fileLabel: { position: "relative", display: "inline-flex", alignItems: "center",
               minHeight: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${LINE}`,
               background: CARD, color: TEXT, fontSize: 13.5, cursor: "pointer" },
  fileInput: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  fileNames: { fontFamily: MONO, fontSize: 12, color: MUTED, overflowWrap: "anywhere" },
  problemList: { margin: "4px 0 0", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5,
                 color: TEXT },

  toggleRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
               margin: "4px 0 12px" },
  stateDot: { width: 9, height: 9, borderRadius: 99, flexShrink: 0 },
  toggleText: { fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 180 },
  visList: { display: "grid", gap: 0, margin: "4px 0 6px" },
  visRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
            borderTop: `1px solid ${LINE}` },
  visRowAside: { opacity: 0.55 },
  visText: { display: "grid", gap: 2, flex: 1, minWidth: 0 },
  visName: { fontSize: 13.5, fontWeight: 600, color: TEXT },
  visWhatLine: { fontSize: 12.5, lineHeight: 1.45, color: MUTED },
  limitField: { display: "grid", gap: 4, flex: 1, minWidth: 150 },

  focusBox: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              padding: "10px 12px", margin: "4px 0 10px", borderRadius: 9,
              border: `1px solid ${GOOD}`, background: "rgba(78,124,89,.07)", fontSize: 13.5 },
  loopRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
             padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 9 },
  loopText: { flex: 1, minWidth: 220, fontSize: 13.5, lineHeight: 1.5 },

  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5, margin: "6px 0 4px" },
  th: { fontWeight: 600, fontSize: 12, color: MUTED, padding: "6px 8px",
        borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap" },
  td: { padding: "7px 8px", borderBottom: `1px solid ${LINE}` },
  tdNum: { padding: "7px 8px", borderBottom: `1px solid ${LINE}`, textAlign: "right",
           fontVariantNumeric: "tabular-nums" },
};
