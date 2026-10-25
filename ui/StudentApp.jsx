import React, { useState, useMemo, useEffect, useRef, createContext, useContext } from "react";
import { auth, me, cases, files, reports, news, awardList, ApiError, useMock, isMock,
         mockScore, mockElo, mockDelay } from "./apiClient";
import { ArtImage, AwardImage } from "./badgeArt.jsx";
import { Avatar, avatarList, avatarName } from "./avatarArt.jsx";
import { openingLang, pickLang, pickedThisVisit, showLang } from "./language.js";
import { THEME_CSS, ThemeSwitch } from "./theme.jsx";
import { CREDITS } from "./credits.js";
import { TRAINING_URL } from "./links.js";
import { PLATFORM_MARKS, AWARD_GROUPS, platformMark } from "./marks.js";
import { SAMPLE_CASES } from "./sampleCases.js";

/* English says "1 step" but "2 steps"; Turkish needs no second form, so only
   the English table carries the singular, under the same key with "One". */
const plural = (t, key, n) => (n === 1 && t[`${key}One`]) || t[key];

/* The language of the case on screen, which may differ from the interface's.
   Its words are marked with it, so a reader, a screen reader and the
   browser's translation all know which language they are in. */
const CaseLang = createContext(undefined);

/* ---------------------------------------------------------------------------
   The student side: the twin, and the loop that moves it.

   Answers go to the server and outcomes come back. Nothing here decides whether
   a step was right or what it was worth, and no step's answer key is in the
   payload before that step is reached, so the browser cannot choose its score.

   Opened without a server, the screen falls back to apiClient's offline mode,
   which computes outcomes locally from the same formulas. That path is for
   working on the interface, and the banner says so.
   --------------------------------------------------------------------------- */

const DIMS = ["prompt_design", "verification", "integrity", "privacy",
              "manipulation", "op_security", "boundaries"];

const T = {
  tr: {
    // Address form is "sen" everywhere, including the case texts.
    twin: "Dijital İkizin", points: "Puan", calibration: "Kendini tanıma",
    casesLede: "Sana açık bütün vakalar burada. Yarım bıraktığın vaka en üstte durur.",
    allCases: "Bütün vakalar",
    calibHelp: "Ne kadar emin olduğunla ne kadar doğru bildiğin birbirini tutuyor mu?",

    joinTitle: "SDÜ Yapay Zeka Okuryazarlığı",
    joinLede: "Sisteme giriş için sdu uzantılı e-posta adresine göndereceğimiz altı haneli giriş kodunu kullanmalısın.",
    email: "Üniversite e-posta adresi", emailHint: "Öğrenciler için @stud.sdu.edu.tr, personel için @sdu.edu.tr uzantılı adresler geçerlidir.",
    emailExample: "ad.soyad@stud.sdu.edu.tr", usernameExample: "ad.soyad",
    sendCode: "Kod gönder", codeSent: "Kodu {email} adresine gönderdik.",
    code: "E-postana gelen kod",
    codeHint: "Kod 15 dakika geçerlidir. Birkaç dakika içinde gelmezse istenmeyen e-postalar klasörüne bak ve adresi doğru yazdığından emin ol.",
    verify: "Doğrula",
    wrongDomain: "Kişisel e-posta adresleriyle giriş yapılamaz. Üniversite e-posta adresini kullanmalısın.",
    badEmail: "Bu e-posta adresi geçerli görünmüyor. Yazdığın adresi kontrol et.",

    // The page people see before signing in
    landingSub: "Kampüs İkizi Platformu",
    landingLede: "Bu platformda gündelik hayatta ve çalışma hayatında yapay zekâ ile ilgili karşılaşabileceğin vakaları çözebilirsin. Verdiğin her cevap sayesinde dijital ikizin seni biraz daha iyi tanır ve yedi alandan hangisinde güçlü olduğunu, hangisinde zorlandığını gösterir. Süreç senin ve bütün kampüsün yapay zekâ farkındalığını geliştirme odaklıdır.",
    signInHead: "Giriş yap",
    newsHead: "Duyurular",
    newsMore: "Devamını oku", newsLess: "Kısalt",
    newsLink: "Bağlantıyı aç",
    newsWhere: "Yer", newsWhen: "Zaman",
    aboutLink: "Platform nasıl çalışıyor?", guideLink: "Nasıl kullanılır?",
    guideFirst: "Platformu ilk kez mi kullanıyorsun?", guideFirstLink: "Kullanım rehberine göz at",
    guideOpen: "Kullanım rehberini aç",
    campusButton: "Kampüsü gör",
    campusHint: "Kampüs haritasını ve kampüsün anlık durumunu görmek için tıkla.",
    demoButton: "Demo", demoHint: "Platformu demo kullanıcılar ve analizlerle inceleyin.",
    trainingHead: "Yapay Zekâ Okuryazarlığı Eğitimi",
    trainingText: "Platformu kullanmaya başlamadan önce üniversitemizin yapay zekâ okuryazarlığı eğitimini izlemeni öneririz. Eğitime nasıl ulaşacağını duyuruda bulabilirsin.",
    trainingLink: "Duyuruyu aç",
    newsClose: "Okundu olarak işaretle ve kapat",
    newsUnread: "{n} okunmamış", newsAll: "Tüm duyurular ({n})", newsAllClose: "Listeyi kapat",
    newsAllRead: "Okunmamış duyurun yok. Okuduklarını tüm duyurular listesinde yeniden açabilirsin.",
    newsMoreUnread: "Tüm duyurular listesinde {n} okunmamış duyuru daha var.",
    newsRead: "Okundu", newsMarkRead: "Okundu olarak işaretle", newsMarkUnread: "Okunmadı olarak işaretle",
    newsDelete: "Sil", newsDeleted: "Duyuru silindi.", newsUndo: "Geri al",
    newsKept: "Okundu ve silindi bilgisi yalnızca bu tarayıcıda tutulur.",
    langLabel: "Dil", themeLabel: "Görünüm",
    tooManyCodes: "Kısa sürede çok fazla kod istendi. Biraz bekleyip yeniden dene.",
    badCode: "Kod hatalı ya da süresi dolmuş.",
    givenName: "Ad", familyName: "Soyad",
    titleLabel: "Unvan", noTitle: "Unvan yok",
    usernameLabel: "Kullanıcı adı",
    usernameHint: "Kendine bir kullanıcı adı seç. Küçük harf, rakam, nokta, alt çizgi ve kısa çizgi kullanabilirsin. Türkçeye özgü harfler (ç, ğ, ı, ö, ş, ü) kullanılamaz.",
    unitLabel: "Birimin",
    profileNew: "Hesabını tamamlamak için birkaç bilgi gerekiyor. Bunları sonradan değiştirebilirsin.",
    profileEdit: "Bilgilerin aşağıda. Değiştirmek istediğin alanı düzeltip kaydedebilirsin.",
    saveProfile: "Kaydet ve devam et",
    saveFailed: "Kaydedilemedi. Yeniden dene.",
    pickUnit: "Birim seç…", joinFinish: "Kaydı tamamla",
    joinNote: "Bilgilerini kaydettiğinde hesabın hemen açılır. Adın, kullanıcı adın ve biyografin ise yönetim onayladıktan sonra başkalarına görünür.",
    signOut: "Çıkış yap",

    level: "Seviye", areaLevels: "Alan seviyeleri", nextLevel: "Sonraki seviye",
    needDims: "{n} alanda yeterli düzeye gel", needCases: "{n} vaka tamamla",
    needCalib: "Kendini tanıma puanını {t} ya da altına indir",
    reached: "tamam",
    levelNote: "Seviyeni kaç vaka çözdüğün değil, ne kadar iyi çözdüğün belirliyor.",
    sealNote: "Sen ilerledikçe rozetin de değişir.",
    areaLevelsHelp: "İkizindeki yedi alanın her biri Temel, Sağlam ve Usta seviyelerinden geçer. Bir alanın seviyesi o alandaki başarına ve o alanda cevapladığın adım sayısına bakar.",
    notYet: "henüz yok",
    marksHead: "Nadir işaretler",
    marksHelp: "Her biri belirli bir çalışma biçimiyle kazanılır. Çok vaka çözmek tek başına yetmez. Kazandığın bir işaret sende kalır.",
    medalsHead: "Madalyalar",
    medalsHelp: "Madalyaları platformun yönetimi zaman zaman ekler. Bir madalyanın koşulunu karşıladığında onu kendiliğinden kazanırsın. Bazı madalyaları ise yönetim elle verir.",
    earnedOn: "Kazanıldı: {d}", byHand: "Yönetim tarafından verildi", handTag: "elle verilir",

    files: "Vaka dosyaları", openFile: "Aç",
    filesLater: "Bazı dosyalar sonraki adımlarda açılacak.",

    weekly: "Haftanın Vakası", core: "Temel Vaka", open: "Vaka", start: "Başla",
    resume: "yarım kaldı", doneShort: "bitti",
    levelUp: "Seviye atladın", newAreaLevel: "Yeni alan seviyesi",
    newMark: "Yeni nadir işaret", newMedal: "Yeni {g}",
    keptGoing: "Bu vaka rozetini değiştirmedi ama ikizin seni biraz daha iyi tanıyor.",
    step: "Adım", of: "/", submit: "Gönder", next: "Devam", finish: "Bitir",
    confidence: "Bu cevaptan ne kadar eminsin?",
    confHelp: "Çok emin olup yanılmak, emin değilim demekten daha pahalıya patlar.",
    correct: "Doğru", partial: "Kısmen doğru", incorrect: "Yanlış",
    twinMoved: "İkizin güncellendi", debrief: "Çözüm notu",
    takeaway: "Aklında kalsın", backHome: "Geri dön", done: "Vaka bitti",
    markHint: "İşaretlemek istediğin kelimelere tıkla", selected: "seçildi",
    real: "Gerçek", fake: "Uydurma", chars: "karakter kaldı",
    why: "Neden?", chooseFirst: "Önce bir seçenek işaretle",
    noConfidence: "Ne kadar emin olduğunu seç", earned: "puan",
    minutes: "dk", steps: "adım", strongest: "En iyi olduğun alan",
    weakest: "Bu hafta buna odaklan", attempts: "vaka",

    serverNote: "",
    offlineNote: "Bağlantı kurulamadı. Şu an örnek veriyle geziniyorsun, ilerlemen kaydedilmiyor.",
    sending: "Gönderiliyor…",
    sendFailed: "Gönderilemedi. Yazdıkların ve seçimlerin duruyor, yeniden deneyebilirsin.",
    tooFast: "Kısa sürede çok fazla istek gönderildi. Biraz bekleyip yeniden dene.",
    retry: "Tekrar dene",
    marks: "işaret", review: "Çözüm notunu aç",
    perStep: "Adım adım açıklama", sources: "Kaynaklar",
    endingCap: "Sonuç", noCases: "Şu an sana açık bir vaka yok.",
    listFailed: "Vaka listesi yüklenemedi. Sayfayı yenilemeyi dene.",

    // The twin
    howToRead: "Nasıl okunur?",
    roseHelp: "Her yaprak bir alanı gösteriyor. Yaprak ne kadar büyükse o alanda orta zorlukta bir adımı doğru çözme olasılığın o kadar yüksek. Yaprağın çevresindeki açık renkli hâle, ikizinin bu tahmindeki belirsizliğini gösteriyor ve cevap verdikçe daralıyor. Dıştaki her boncuk da bir cevabını gösteriyor: Dolu kırmızı doğru, açık kırmızı kısmen doğru, boş halka yanlış cevaptır.",
    roseNew: "İkizin seni henüz tanımıyor. İlk vakanı çözdüğünde yapraklar açılmaya başlar.",
    toCases: "Vakalara git",
    replay: "İkizinin gelişimi", play: "Oynat", pause: "Durdur", backToNow: "Bugüne dön",
    today: "Bugün", answerN: "{n}. cevap",
    answersN: "{n} cevap", noAnswersYet: "henüz cevap yok",
    chance: "Orta zorlukta bir adımı doğru çözme olasılığın",
    likelyRange: "Büyük olasılıkla %{lo} ile %{hi} arasında.",
    stillLearning: "İkizin seni bu alanda henüz az tanıyor. Aralık bu yüzden geniş.",
    areaSure: "Bu alandaki {n} cevabında güvenin ortalama %{c}, tam doğru cevap oranın %{s}.",
    areaOver: "Burada kendine fazla güveniyorsun.",
    areaUnder: "Burada kendine gereğinden az güveniyorsun.",
    areaFine: "Güvenin isabetinle uyumlu.",
    summaryAnswers: "İkizin {n} cevabına dayanıyor.",
    strongestArea: "En güçlü olduğun alan",
    leastKnown: "İkizinin seni en az tanıdığı alan",
    pickArea: "Bir yaprağı seçersen o alanın ayrıntıları açılır.",
    solveHere: "Bu alanda bir vaka çöz",
    noCaseHere: "Bu alanda şu an sana açık yeni bir vaka yok.",
    recentAnswers: "Son cevapların",
    closeArea: "Özete dön",
    nextCase: "Sıradaki vakan",
    nextWhy: "İkizinin seni en az tanıdığı alan",
    resumeCase: "Yarım kalan vakan",
    continueCase: "Devam et",
    allDone: "Sana açık bütün vakaları bitirdin. Yeni vakalar eklendikçe burada görünecek.",
    mirror: "Güven ve isabet",
    mirrorHelp: "Her sütun, o güven düzeyiyle verdiğin cevapların ne kadarının doğru çıktığını gösterir. Kısa çizgi, güveninle tam uyuşan isabet düzeyidir.",
    mirrorFew: "Birkaç cevap daha verince grafik netleşecek.",
    mirrorOver: "Emin olduğun kadar isabetli değilsin.",
    mirrorUnder: "Sandığından daha isabetlisin.",
    mirrorFine: "Güvenin isabetinle uyuşuyor.",
    mirrorNums: "Ortalama güvenin %{c}, isabetin %{s}.",
    mirrorTipOver: "Emin olmadığında bunu söylemek puanını korur.",
    mirrorTipUnder: "Cevabını bildiğin adımlarda daha yüksek bir güven seçebilirsin.",
    brierLine: "Kendini tanıma puanın {b}. Sıfır kusursuz demek, 0,25 ise yazı tura atmakla aynı.",
    answerShort: "cevap",
    casesHead: "Vakalar",
    filterAll: "Tümü", filterNew: "Yeni", filterHalf: "Yarım", filterDone: "Bitti",
    filterRevealed: "Cevapları açıklanan", allAreas: "Bütün alanlar",
    allLangs: "Bütün diller", langNames: { tr: "Türkçe", en: "İngilizce" },
    caseIn: "Vakanın dili: {l}", caseLangs: "Vakanın dilleri: {l}",
    versionHead: "Hangi dilde çözmek istersin?",
    versionNote: "Bu vakanın iki dilde sürümü var. Hangisini çözersen çöz, aynı vakayı çözmüş olursun.",
    versionStarted: "Bu vakaya {l} başladın, aynı dilde devam edeceksin.",
    versionFinished: "Bu vakayı {l} çözdün.",
    versionFailed: "Bu sürüm şu an açılamadı. Biraz sonra yeniden dene.",
    showMore: "Daha fazla göster", nothingHere: "Bu filtreye uyan vaka yok.",
    newShort: "yeni", revealedShort: "cevaplar açıklandı", voidedShort: "geçersiz sayıldı",
    voidedHead: "Bu vakadaki denemen geçersiz sayıldı",
    voidedBody: "Yönetim {date} tarihinde bu denemeyi geçersiz saydı. Denemenin puanı ve ikizine etkisi geri alındı, vaka yeniden çözülemez.",
    voidedReason: "Gerekçe",

    // Correct answers
    answersHead: "Doğru cevaplar",
    answersAgain: "Doğru cevapları yeniden göster",
    answersPending: "Doğru cevaplar, bu vakayı yeterince kişi bitirdiğinde açıklanacak. Açıklandığında vaka listende “cevaplar açıklandı” yazısını göreceksin.",
    answersHeld: "Bu vakanın doğru cevapları şimdilik açıklanmıyor.",
    answersProgress: "Açıklanma eşiğine ilerleme: %{p}",
    rightMark: "Doğru işaretin", missedMark: "Kaçırdığın", extraMark: "Gereksiz işaretin",
    problemSpots: "Sorunlu yerler",
    realRef: "Gerçek", fakeRef: "Uydurma", yourCall: "senin kararın",
    rightOption: "Doğru seçenek", yourPick: "senin seçimin",
    bestReason: "En güçlü gerekçe", partReason: "Kısmen geçerli", noReason: "Geçerli değil",
    yourReason: "senin gerekçen",
    mustNot: "Olmamalı", must: "Olmalı", ruleMet: "tamam", ruleMissed: "karşılanmadı",
    bestPath: "En iyi yol", diverged: "Sen burada başka bir yolu seçtin.",
    yourResult: "Senin sonucun",
    loading: "Yükleniyor…",
    situation: "Durum", bestChoice: "En iyi karar",

    // The sealed prediction
    sealShort: "İkizin bu adım için tahminini mühürledi",
    sealWhy: "Tahmin, cevabını etkilemesin diye gizli tutuluyor. Cevabını gönderdiğinde açıklanır ve tarayıcın mührü kendisi doğrular.",
    sealOpened: "Tahmin açıklandı",
    sealTwin: "İkizinin tahmini", sealYou: "Senin güvenin", sealResult: "Tam doğru mu?",
    sealRight: "evet", sealWrong: "hayır",
    sealChecked: "Mühür doğrulandı: Tahmin cevabından önce yapılmış ve sonradan değişmemiş.",
    sealBroken: "Mühür doğrulanamadı: Açıklanan tahmin, cevaptan önce gösterilen mühürle uyuşmuyor.",
    sealLate: "Bu adımın tahmini, mührü sana gösterilmeden açıklandı. Tahmin yine de cevabından önce yapıldı.",
    sealNoCheck: "Bu tarayıcı mührü doğrulayamıyor. Mührü kendin hesaplamak için: SHA-256({c}).",
    sealCode: "Mühür",

    // Who knows you better
    whoKnows: "Seni kim daha iyi tanıyor?",
    whoFew: "Kendi güvenini ikizinin tahminleriyle karşılaştırmak için en az {m} cevap gerekiyor. Şu an {n} cevabın var.",
    whoYou: "Sen", whoTwin: "İkizin",
    whoTwinWins: "İkizin, cevaplarını senden daha isabetli tahmin ediyor.",
    whoYouWin: "Kendi cevaplarını ikizinden daha isabetli tahmin ediyorsun.",
    whoTie: "Sen de ikizin de cevaplarını aynı isabetle tahmin ediyorsunuz.",
    whoScale: "Brier puanı: Sıfır kusursuz tahmin demek, 0,25 ise her adım için %50 demekle aynı. Kısa çubuk daha iyi.",
    whoParts: "Puanın nelerden oluşuyor?",
    partRel: "Kalibrasyon", partRelHelp: "Güveninle isabetin arasındaki fark. Sıfıra ne kadar yakınsa o kadar iyi.",
    partRes: "Ayırt edicilik", partResHelp: "Bildiğin ve bilmediğin adımlarda güvenini ne kadar farklı seçtiğin. Ne kadar yüksekse o kadar iyi.",
    partUnc: "Belirsizlik", partUncHelp: "Adımların sana göre zorluğu. Bu senin elinde değil.",
    aurocLine: "Güvenin, doğru cevaplarını yanlışlarından %{a} isabetle ayırıyor. %50, yazı tura atmakla aynı.",
    sessionTitle: "Çözüm oturumu",
    weekUsage: "Bu hafta {used}/{limit} vaka",
    sessionIdle: "İlk vakana başladığında {m} dakikalık bir çözüm oturumu açılır. Bir oturumda en çok {n} vakaya başlayabilirsin.",
    sessionOpen: "Bu oturumda {n} vakaya daha başlayabilirsin. Oturumun kapanışı: Saat {time}.",
    sessionFull: "Bu oturumdaki {n} vakanın hepsine başladın. Başladıklarını bitirebilirsin. Yeni oturumun açılışı: {when}.",
    sessionCooldown: "Çözüm oturumun sona erdi. Yeni oturumun açılışı: {when}. O zamana kadar ikizine, sonuçlarına ve kampüs haritasına bakabilirsin.",
    sessionNewSignIn: "Yeni bir çözüm oturumu için yeniden giriş yapman gerekiyor. E-posta adresine yeni bir kod gönderilir.",
    weeklyFull: "Bu hafta başlayabileceğin {n} vakanın hepsine başladın. Sınır pazartesi yenilenir.",
    signInAgain: "Yeni kodla giriş yap",
    startBlocked: "Bu vakaya şu an başlayamazsın.",
    lockedShort: "kapalı",
    dayToday: "bugün", dayTomorrow: "yarın",
    report: "Sorun bildir",
    reportTitle: "Bu vakada bir sorun mu gördün?",
    reportAbout: "Neyle ilgili?",
    reportWhere: "Nerede?",
    reportWhole: "Vakanın geneli",
    reportStepN: "{n}. adım",
    reportKinds: { answer_key: "Cevap anahtarı yanlış", source: "Kaynak ya da künye hatalı",
                   wording: "Metin anlaşılmıyor ya da yazım hatası var", technical: "Teknik bir sorun",
                   other: "Başka bir şey" },
    reportBody: "Ne gördüğünü kısaca yaz",
    reportHint: "Örneğin hangi ifadenin neden yanlış olduğunu yaz. Adını ya da başkalarının bilgilerini yazma.",
    reportSend: "Bildirimi gönder", reportCancel: "Vazgeç", backToCase: "Vakaya dön",
    reportSent: "Bildirimin alındı, teşekkürler. Yöneticiler inceleyip gerekirse vakayı düzeltecek.",
    reportExists: "Bu konuda henüz sonuçlanmamış bir bildirimin var.",
    reportLimit: "Günde en çok {n} bildirim gönderebilirsin.",
    reportOffline: "Örnek veriyle gezinirken bildirim gönderilemez.",
    myReports: "Bildirdiğin sorunlar",
    reportStates: { open: "Alındı", fixed: "Düzeltildi", dismissed: "Gerek görülmedi" },
    reportNote: "Yönetimin notu",
    tipHead: "İpucu",
    confNudge: "Bu alandaki son {n} cevabında güvenin ortalama %{c}, tam doğru cevap oranın %{s}. Güvenini bir kez daha düşünebilirsin.",
    whyReview: "Daha önce zorlandığın, tekrar zamanı gelen alan",
    whyFocus: "Kampüsün bu haftaki odağı",

    // The profile
    avatarLabel: "Avatarın",
    avatarHelp: "Avatarın onay beklemeden hemen değişir.",
    avatarNone: "Baş harflerim",
    staffKind: "Görevin",
    staffAcademic: "Akademik personel", staffAdmin: "İdari personel",
    deptLabel: "Bölümün", pickDept: "Bölüm seç…",
    bioLabel: "Kısa biyografi",
    bioHint: "Kendini birkaç sözcükle anlat. Bağlantı, e-posta adresi ve telefon numarası eklenemez.",
    boardLabel: "Sıralamada görün",
    boardExcluded: "Vaka yazarları ve yöneticiler cevap anahtarlarını görebildiği için sıralamada yer almaz.",
    boardHelp: "Açarsan kullanıcı adın, avatarın, rolün, birimin, biyografin, seviyen, alan seviyelerin, nadir işaretlerin, madalyaların, puanın ve sıran sıralama sayfasında görünür. Adın ve soyadın görünmez. İstediğin zaman kapatabilirsin.",
    boardPublicLabel: "Platform dışından bakanlar da görebilsin",
    boardPublicClosed: "Yönetim sıralamayı üniversite dışına açarsa, giriş yapmadan bakanlar da seni sıralamada görebilir. Şu anda sıralamayı yalnızca platformu kullananlar görüyor.",
    boardPublicOpen: "Sıralama şu anda üniversite dışına da açık. Bunu açarsan giriş yapmadan bakanlar da seni sıralamada görür, açmazsan yalnızca platformu kullananlar görür.",
    stFirst: "Profilin yönetimin onayını bekliyor. Onaylanınca başkaları da görebilir.",
    stPending: "Onay bekleyen bir değişikliğin var ({fields}). Onaylanana kadar eski bilgilerin geçerli.",
    stWithdraw: "Değişikliği geri çek",
    stRejected: "Son gönderdiğin değişiklik onaylanmadı.",
    stEdited: "Yönetim profilini düzenledi. Değişen: {fields}.",
    stEditedClosed: "Onay bekleyen değişikliğin bu düzenlemeyle kapandı.",
    stReason: "Gerekçe",
    stApproved: "Profilin onaylı.",
    outApplied: "Kaydedildi. Profilin onaylanınca başkaları da görebilecek.",
    outPending: "Değişikliğin onaya gönderildi. Onaylanana kadar eski bilgilerin görünür.",
    outWithdrawn: "Bekleyen değişiklik geri çekildi. Onaylı profilin geçerli.",
    outUnchanged: "Değişiklik yok.",
    outWaiting: "Bu değişiklik zaten onay bekliyor.",
    outRoleWaits: "Kaydedildi. Görev değişikliğin yönetim onaylayınca geçerli olacak, o zamana kadar önceki görevin geçerli.",
    stRoleWaits: "Görev değişikliğin de onay bekliyor. Onaylanana kadar önceki görevin geçerli.",
    staffKindHelp: "Görevini değiştirirsen değişiklik yönetim onaylayınca geçerli olur.",
    goOn: "Devam et", saveOnly: "Kaydet", skipSave: "Kaydetmeden devam et",
    profileTitle: "Profilin",
    profileLede: "Adın, kullanıcı adın, görevin, unvanın, birimin ve biyografin yönetim onayladıktan sonra güncellenir. Avatarın ve sıralama tercihin hemen değişir.",
    caseLangHead: "Vaka dili",
    caseLangLede: "Hangi dildeki vakaların sana gösterileceğini seç. İki dilde sürümü olan bir vakayı açarken dilini de seçebilirsin. Bir vakaya hangi dilde başladıysan o dilde devam eder.",
    caseLangBoth: "İkisi de",
    caseLangAuto: "Bir seçim yapmadığın sürece arayüz Türkçeyken Türkçe vakalar, İngilizceyken iki dildeki vakalar gösterilir.",
    caseLangSaved: "Kaydedildi.", caseLangFailed: "Kaydedilemedi. Yeniden dene.",
    profileFailed: "Profilin yüklenemedi. Sayfayı yenilemeyi dene.",
    fieldNames: { given_name: "ad", family_name: "soyad", title: "unvan", username: "kullanıcı adı",
                  unit_id: "birim", role: "görev", bio: "biyografi" },
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
      unit_invalid: "Bu birim seçilemiyor.",
    },
    suspTitle: "Hesabın askıya alındı",
    suspUntil: "Askı süresi {date} tarihinde bitiyor.",
    suspOpen: "Bitiş tarihi yok, yönetim hesabını askıdan çıkarana kadar sürüyor.",
    suspReason: "Gerekçe",
    suspHelp: "Hesabın askıdayken platformu kullanamazsın. Verilerin silinmedi. Bir yanlışlık olduğunu düşünüyorsan Yapay Zeka Uygulama ve Araştırma Merkezi ile görüş.",
  },

  en: {
    twin: "Your Digital Twin", points: "Points", calibration: "Self-knowledge",
    casesLede: "Every case open to you is here. A case you left halfway stays at the top.",
    allCases: "All cases",
    joinTitle: "SDÜ AI Literacy",
    joinLede: "To sign in, use the six-digit code we send to your SDÜ e-mail address.",
    email: "University e-mail address", emailHint: "Students sign in with an @stud.sdu.edu.tr address, staff with an @sdu.edu.tr address.",
    emailExample: "name.surname@stud.sdu.edu.tr", usernameExample: "name.surname",
    sendCode: "Send code", codeSent: "Code sent to {email}.",
    code: "Code",
    codeHint: "Six digits, valid for 15 minutes. If it has not arrived in a few minutes, check the address and your spam folder.",
    verify: "Verify",
    wrongDomain: "That is a personal address. Please sign in with your university e-mail address.",
    badEmail: "Check the email address.",

    landingSub: "Campus Twin Platform",
    landingLede: "Here you solve cases about AI that you may come across in everyday life and at work. With every answer your digital twin gets to know you a little better and shows which of the seven areas you are strong in and which you find hard. The aim is to raise your own AI awareness and that of the whole campus.",
    signInHead: "Sign in",
    newsHead: "Announcements",
    newsMore: "Read more", newsLess: "Show less",
    newsLink: "Open the link",
    newsWhere: "Where", newsWhen: "When",
    aboutLink: "How does the platform work?", guideLink: "How do I use it?",
    guideFirst: "New to the platform?", guideFirstLink: "Have a look at the user guide",
    guideOpen: "Open the user guide",
    campusButton: "See the campus",
    campusHint: "Click to see the campus map and what is happening on campus right now.",
    demoButton: "Demo", demoHint: "Explore the platform with demo users and analyses.",
    trainingHead: "AI Literacy Training",
    trainingText: "Before you start using the platform, we recommend watching the university's AI literacy training. The university's announcement explains how to reach it.",
    trainingLink: "Open the announcement",
    newsClose: "Mark as read and close",
    newsUnread: "{n} unread", newsAll: "All announcements ({n})", newsAllClose: "Close the list",
    newsAllRead: "No unread announcements. You can open the ones you read again from the list of all announcements.",
    newsMoreUnread: "{n} more unread in the list of all announcements.",
    newsRead: "Read", newsMarkRead: "Mark as read", newsMarkUnread: "Mark as unread",
    newsDelete: "Delete", newsDeleted: "Announcement deleted.", newsUndo: "Undo",
    newsKept: "What you read or delete is kept in this browser only.",
    langLabel: "Language", themeLabel: "Appearance",
    tooManyCodes: "Too many codes were asked for in a short time. Wait a little and try again.",
    badCode: "The code is wrong or has expired.",
    givenName: "First name", familyName: "Surname",
    titleLabel: "Title", noTitle: "No title",
    usernameLabel: "Username",
    usernameHint: "The name shown on lists. Lowercase letters, digits, dots, underscores and hyphens.",
    unitLabel: "Your unit",
    profileNew: "Tell us who you are. You can change this later.",
    profileEdit: "Here is what we have. Correct anything you want to change.",
    saveProfile: "Save and continue",
    saveFailed: "Could not save, try again.",
    pickUnit: "Choose a unit…", joinFinish: "Finish and start",
    joinNote: "Saving opens your account at once. What you write is shown to others after YAZEM approves it.",
    signOut: "Sign out",
    level: "Level", areaLevels: "Area levels", nextLevel: "Next level",
    needDims: "Do well enough in {n} areas", needCases: "Finish {n} cases",
    needDimsOne: "Do well enough in {n} area", needCasesOne: "Finish {n} case",
    needCalib: "Bring self-knowledge to {t} or below",
    reached: "done",
    levelNote: "Your level comes from how well you solve, not how many you solve.",
    sealNote: "Your badge changes as you go.",
    areaLevelsHelp: "Each of the seven areas of your twin goes through the Basic, Solid and Expert levels. An area's level looks at how well you do in it and how many of its steps you have answered.",
    notYet: "not yet",
    marksHead: "Rare marks",
    marksHelp: "Each one answers a way of working. Solving more cases does not earn them on its own. A mark you earn stays yours.",
    medalsHead: "Medals",
    medalsHelp: "The platform's administrators add medals from time to time. Most are earned on their own once their condition is met. Some are given by the administrators.",
    earnedOn: "Earned: {d}", byHand: "Given by the administrators", handTag: "given by hand",
    files: "Case files", openFile: "Open",
    filesLater: "Some files open later in the case.",
    calibHelp: "How closely your confidence in an answer matches how right you were.",
    weekly: "Case of the Week", core: "Core Case", open: "Case", start: "Start",
    resume: "unfinished", doneShort: "done",
    levelUp: "You levelled up", newAreaLevel: "New area level",
    newMark: "New rare mark", newMedal: "New {g}",
    keptGoing: "This case did not change your badge, but your twin got a little sharper.",
    step: "Step", of: "of", submit: "Submit", next: "Next", finish: "Finish",
    confidence: "How confident are you?",
    confHelp: "Being wrong when you were sure costs more than saying you don't know.",
    correct: "Correct", partial: "Partly correct", incorrect: "Incorrect",
    twinMoved: "Your twin has been updated", debrief: "Solution note",
    takeaway: "Takeaway", backHome: "Back to twin", done: "Case complete",
    markHint: "Tap the relevant words", selected: "selected",
    real: "Real", fake: "Fabricated", chars: "characters left", charsOne: "character left",
    why: "Why?", chooseFirst: "Pick an option first",
    noConfidence: "Choose a confidence level", earned: "points",
    minutes: "min", steps: "steps", stepsOne: "step", strongest: "Your strongest area",
    weakest: "Focus this week", attempts: "cases",
    serverNote: "",
    offlineNote: "No connection. You are browsing sample data, and nothing you do here is saved.",
    sending: "Sending…",
    sendFailed: "Could not send. Your answer is untouched; try again.",
    tooFast: "Too many attempts. Wait a moment and try again.",
    retry: "Try again",
    marks: "marked", review: "Open the solution note",
    perStep: "Step by step", sources: "Sources",
    endingCap: "Outcome", noCases: "No case is open to you right now.",
    listFailed: "Could not load the case list. Try reloading the page.",

    howToRead: "How to read it",
    roseHelp: "Each petal is an area. The bigger the petal, the likelier you are to solve a step of average difficulty in that area. The pale halo around a petal shows how unsure your twin still is, and it narrows as you answer. Each bead on the outside is one answer: solid red right, pale red partly right, an empty ring wrong.",
    roseNew: "Your twin does not know you yet. The petals start to open with your first case.",
    toCases: "Go to the cases",
    replay: "How your twin grew", play: "Play", pause: "Pause", backToNow: "Back to today",
    today: "Today", answerN: "Answer {n}",
    answersN: "{n} answers", answersNOne: "{n} answer", noAnswersYet: "no answers yet",
    chance: "Your chance of solving a step of average difficulty",
    likelyRange: "Most likely between {lo}% and {hi}%.",
    stillLearning: "Your twin knows little about this area yet, so the range is wide.",
    areaSure: "Over your {n} answers in this area your confidence averages {c}%, and {s}% were fully right.",
    areaOver: "Here you are more sure than your answers support.",
    areaUnder: "Here you know more than you think.",
    areaFine: "Your confidence matches your accuracy.",
    summaryAnswers: "Your twin is built from {n} answers.",
    summaryAnswersOne: "Your twin is built from {n} answer.",
    strongestArea: "Your strongest area",
    leastKnown: "Where your twin knows you least",
    pickArea: "Tap a petal to open that area.",
    solveHere: "Solve a case in this area",
    noCaseHere: "No new case in this area is open to you right now.",
    recentAnswers: "Your latest answers",
    closeArea: "Back to the summary",
    nextCase: "Your next case",
    nextWhy: "From the area your twin knows least",
    resumeCase: "Your unfinished case",
    continueCase: "Continue",
    allDone: "You have finished every case open to you. New ones will appear here.",
    mirror: "Confidence and accuracy",
    mirrorHelp: "Each column shows how many of the answers you gave at that confidence were right. The short line is the accuracy that would match your confidence exactly.",
    mirrorFew: "A few more answers and the chart will sharpen.",
    mirrorOver: "You are not as accurate as you are sure.",
    mirrorUnder: "You seem less sure than you have reason to be.",
    mirrorFine: "Your confidence matches your accuracy.",
    mirrorNums: "Average confidence {c}%, accuracy {s}%.",
    mirrorTipOver: "Saying you are unsure, when you are, protects your points.",
    mirrorTipUnder: "Where you know, you can choose a higher confidence.",
    brierLine: "Your self-knowledge score is {b}. Zero is perfect; 0.25 is a coin toss.",
    answerShort: "answers",
    casesHead: "Cases",
    filterAll: "All", filterNew: "New", filterHalf: "Unfinished", filterDone: "Done",
    filterRevealed: "Answers revealed", allAreas: "All areas",
    allLangs: "All languages", langNames: { tr: "Turkish", en: "English" },
    caseIn: "Case language: {l}", caseLangs: "Case languages: {l}",
    versionHead: "Which language would you like to solve it in?",
    versionNote: "This case comes in two languages. Whichever you choose, you solve the same case.",
    versionStarted: "You started this case in {l}; it continues in that language.",
    versionFinished: "You solved this case in {l}.",
    versionFailed: "This version could not be opened just now. Try again in a moment.",
    showMore: "Show more", nothingHere: "No case matches this filter.",
    newShort: "new", revealedShort: "answers revealed", voidedShort: "set aside",
    voidedHead: "Your attempt at this case was set aside",
    voidedBody: "The administrators set this attempt aside on {date}. Its points and its effect on your twin were taken back, and the case cannot be solved again.",
    voidedReason: "Reason",

    answersHead: "Correct answers",
    answersAgain: "Show the correct answers again",
    answersPending: "The correct answers are revealed once enough people have finished this case. Your case list will then say “answers revealed”.",
    answersHeld: "The correct answers for this case are not being revealed for now.",
    answersProgress: "{p}% of the way to the reveal",
    rightMark: "You marked it", missedMark: "You missed it", extraMark: "Not needed",
    problemSpots: "Where the problem sits",
    realRef: "Real", fakeRef: "Fabricated", yourCall: "your call",
    rightOption: "Correct option", yourPick: "your pick",
    bestReason: "Strongest reason", partReason: "Partly valid", noReason: "Not valid",
    yourReason: "your reason",
    mustNot: "Must not", must: "Must", ruleMet: "met", ruleMissed: "missing",
    bestPath: "The best path", diverged: "You took another way here.",
    yourResult: "Your result",
    loading: "Loading…",
    situation: "Situation", bestChoice: "Best decision",

    sealShort: "Your twin has sealed its prediction for this step",
    sealWhy: "The prediction is hidden so that it cannot sway your answer. It is revealed when you send your answer, and your browser checks the seal itself.",
    sealOpened: "Prediction revealed",
    sealTwin: "Your twin predicted", sealYou: "Your confidence", sealResult: "Fully right?",
    sealRight: "yes", sealWrong: "no",
    sealChecked: "Seal checked: the prediction was made before your answer and has not changed since.",
    sealBroken: "Seal does not match: the revealed prediction does not match the seal shown before your answer.",
    sealLate: "This step's prediction was revealed without its seal being shown to you. The prediction was still made before your answer.",
    sealNoCheck: "This browser cannot check the seal. To compute the seal yourself: SHA-256({c}).",
    sealCode: "Seal",

    whoKnows: "Who knows you better?",
    whoFew: "Comparing your own confidence with your twin's predictions takes at least {m} answers. You have {n} so far.",
    whoYou: "You", whoTwin: "Your twin",
    whoTwinWins: "Your twin predicts your answers more accurately than you do.",
    whoYouWin: "You predict your own answers more accurately than your twin.",
    whoTie: "You and your twin predict your answers equally well.",
    whoScale: "Brier score: zero is a perfect forecast, and 0.25 is the same as saying 50% for every step. A shorter bar is better.",
    whoParts: "What your score is made of",
    partRel: "Calibration", partRelHelp: "How far your confidence sits from your accuracy; closer to zero is better.",
    partRes: "Discrimination", partResHelp: "How differently you rate steps you know and steps you don't; higher is better.",
    partUnc: "Uncertainty", partUncHelp: "How hard the steps are for you; not in your hands.",
    aurocLine: "Your confidence tells your right answers from your wrong ones {a}% of the time. 50% is a coin toss.",
    sessionTitle: "Solving session",
    weekUsage: "This week {used}/{limit} cases",
    sessionIdle: "Starting your first case opens a {m}-minute solving session. You can start up to {n} cases in a session.",
    sessionOpen: "You can start {n} more cases in this session. It closes at {time}.",
    sessionOpenOne: "You can start {n} more case in this session. It closes at {time}.",
    sessionFull: "You have started all {n} cases of this session. You can finish the ones you started. The next session opens {when}.",
    sessionCooldown: "Your solving session has ended. The next one opens {when}. Until then you can look at your twin, your results and the campus map.",
    sessionNewSignIn: "To open a new solving session, sign in again. A new code will be sent to your address.",
    weeklyFull: "You have started all {n} cases allowed this week. The limit resets on Monday.",
    weeklyFullOne: "You have started the one case allowed this week. The limit resets on Monday.",
    signInAgain: "Sign in with a new code",
    startBlocked: "You cannot start this case right now.",
    lockedShort: "Closed",
    dayToday: "today", dayTomorrow: "tomorrow",
    report: "Report a problem",
    reportTitle: "Did you see a problem in this case?",
    reportAbout: "What is it about?",
    reportWhere: "Where?",
    reportWhole: "The case as a whole",
    reportStepN: "Step {n}",
    reportKinds: { answer_key: "The answer key is wrong", source: "A source or reference is wrong",
                   wording: "The text is unclear or has a typo", technical: "A technical problem",
                   other: "Something else" },
    reportBody: "Describe what you saw",
    reportHint: "For example, which statement is wrong and why. Do not include your name or anyone else's details.",
    reportSend: "Send the report", reportCancel: "Cancel", backToCase: "Back to the case",
    reportSent: "Your report has been received, thank you. The administrators will review it and correct the case if needed.",
    reportExists: "You already have an open report about this.",
    reportLimit: "You can send up to {n} reports a day.",
    reportOffline: "Reports cannot be sent while you are browsing sample data.",
    myReports: "Problems you reported",
    reportStates: { open: "Received", fixed: "Fixed", dismissed: "No change needed" },
    reportNote: "Note from the administrators",
    tipHead: "Tip",
    confNudge: "Over your last {n} answers in this area your confidence averaged {c}%, and {s}% were fully right. You may want to think again about your confidence.",
    whyReview: "Time for review, an area you found hard",
    whyFocus: "The campus focus this week",

    // The profile
    avatarLabel: "Your avatar",
    avatarHelp: "Your avatar changes at once, without waiting for approval.",
    avatarNone: "My initials",
    staffKind: "Your role",
    staffAcademic: "Academic staff", staffAdmin: "Administrative staff",
    deptLabel: "Your department", pickDept: "Choose a department…",
    bioLabel: "Short bio",
    bioHint: "A few words about yourself. Links, e-mail addresses and phone numbers are not allowed.",
    boardLabel: "Show me on the ranking",
    boardExcluded: "Case authors and administrators can read the answer keys, so they are not on the ranking.",
    boardHelp: "If you switch this on, your username, avatar, role, unit, bio, level, area levels, rare marks, medals, points and rank appear on the ranking page. Your name does not. You can switch it off at any time.",
    boardPublicLabel: "Let visitors see me too",
    boardPublicClosed: "If the administrators open the ranking to people outside the university, visitors who have not signed in could see you on it too. Right now only people using the platform see the ranking.",
    boardPublicOpen: "The ranking is open to people outside the university right now. If you switch this on, visitors who have not signed in see you on it too. Otherwise only people using the platform do.",
    stFirst: "Your profile is waiting for approval. Once approved, others can see it.",
    stPending: "A change is waiting for approval ({fields}). Until then your approved details stay in place.",
    stWithdraw: "Withdraw the change",
    stRejected: "Your last change was not approved.",
    stEdited: "Your profile was edited by the administration. Changed: {fields}.",
    stEditedClosed: "The change you were waiting on was closed by this edit.",
    stReason: "Reason",
    stApproved: "Your profile is approved.",
    outApplied: "Saved. Others can see your profile once it is approved.",
    outPending: "Your change was sent for approval. Until then your old details are shown.",
    outWithdrawn: "The waiting change was withdrawn. Your approved profile stays.",
    outUnchanged: "Nothing changed.",
    outWaiting: "This change is already waiting for approval.",
    outRoleWaits: "Saved. Your change of role takes effect once the administrators approve it. Until then your previous role stays.",
    stRoleWaits: "Your change of role is waiting for approval too. Until then your previous role stays.",
    staffKindHelp: "If you change your role, the change takes effect once the administrators approve it.",
    goOn: "Continue", saveOnly: "Save", skipSave: "Continue without saving",
    profileTitle: "Your profile",
    profileLede: "Your name, username, role, title, unit and bio change after approval. Your avatar and ranking choice change at once.",
    caseLangHead: "Case language",
    caseLangLede: "Choose which languages your cases are offered in. When a case comes in both languages, you can also choose the language as you open it. A case you have started stays in the language you started it in.",
    caseLangBoth: "Both",
    caseLangAuto: "Until you choose, a Turkish interface offers Turkish cases and an English one offers cases in both languages.",
    caseLangSaved: "Saved.", caseLangFailed: "Could not be saved. Try again.",
    profileFailed: "Your profile could not be loaded. Try reloading the page.",
    fieldNames: { given_name: "first name", family_name: "surname", title: "title",
                  username: "username", unit_id: "unit", role: "role", bio: "bio" },
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
      unit_invalid: "This unit cannot be chosen.",
    },
    suspTitle: "Your account is suspended",
    suspUntil: "The suspension ends on {date}.",
    suspOpen: "The suspension has no end date and lasts until the administration lifts it.",
    suspReason: "Reason",
    suspHelp: "You cannot use the platform while your account is suspended. Your data has not been deleted. If you think this is a mistake, contact the Artificial Intelligence Application and Research Centre.",
  },
};

const DIM_LABEL = {
  tr: {
    prompt_design: "Görev ve İstem Tasarımı",
    verification: "Doğrulama ve Halüsinasyon Tespiti",
    integrity: "Atıf ve Akademik Dürüstlük",
    privacy: "Veri Mahremiyeti",
    manipulation: "Manipülasyon Direnci",
    op_security: "Kurumsal Bilgi Güvenliği",
    boundaries: "Sınır ve Yanlılık Bilinci",
  },
  en: {
    prompt_design: "Task and Prompt Design",
    verification: "Verification and Hallucination Detection",
    integrity: "Citation and Academic Integrity",
    privacy: "Data Privacy",
    manipulation: "Manipulation Resistance",
    op_security: "Institutional Information Security",
    boundaries: "Limits and Bias Awareness",
  },
};

const DIM_SHORT = {
  tr: { prompt_design: "İstem", verification: "Doğrulama", integrity: "Atıf",
        privacy: "Mahremiyet", manipulation: "Manipülasyon", op_security: "Güvenlik",
        boundaries: "Sınırlar" },
  en: { prompt_design: "Prompt", verification: "Verify", integrity: "Integrity",
        privacy: "Privacy", manipulation: "Manipulation", op_security: "Security",
        boundaries: "Limits" },
};

/* --------------------------------------------------------------------------
   Scoring — a direct port of scoring.py.
   -------------------------------------------------------------------------- */

const CONFIDENCE = [0.5, 0.6, 0.7, 0.8, 0.9];
const SUCCESS_THRESHOLD = 0.8;

const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
const isSuccess = (x) => (x >= SUCCESS_THRESHOLD ? 1 : 0);

const brier = (x, c) => Math.pow(c - isSuccess(x), 2);

/* Two decimals, with the separator the language uses. */
const decimal = (x, lang) => (lang === "tr" ? x.toFixed(2).replace(".", ",") : x.toFixed(2));
const num1 = (x, lang) => (lang === "tr" ? x.toFixed(1).replace(".", ",") : x.toFixed(1));

/* --------------------------------------------------------------------------
   Graders — a direct port of grading.py.
   -------------------------------------------------------------------------- */

/* One mark running over neighbouring targets counts as one mark per target,
   as in grading.split_adjacent. */
function splitAdjacent(selected, targets, tol) {
  const out = [];
  for (const sel of selected) {
    const inside = targets.filter((t) => t[0] >= sel[0] - tol && t[1] <= sel[1] + tol)
      .sort((a, b) => a[0] - b[0]);
    const joined = inside.length >= 2
      && Math.abs(inside[0][0] - sel[0]) <= tol
      && Math.abs(inside[inside.length - 1][1] - sel[1]) <= tol
      && inside.slice(1).every((b, i) => b[0] - inside[i][1] <= 3);
    if (joined) out.push(...inside); else out.push(sel);
  }
  return out;
}

function gradeSpans(selected, targets, tol = 3) {
  if (!targets.length) return 0;
  selected = splitAdjacent(selected, targets, tol);
  const left = [...targets];
  let hits = 0;
  for (const s of selected) {
    const i = left.findIndex((t) => Math.abs(s[0] - t[0]) <= tol && Math.abs(s[1] - t[1]) <= tol);
    if (i >= 0) { left.splice(i, 1); hits++; }
  }
  const precision = selected.length ? hits / selected.length : 0;
  const recall = hits / targets.length;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

/* Balanced accuracy, so calling every reference fabricated scores at chance. */
function gradeSources(answers, truth) {
  const real = Object.keys(truth).filter((k) => truth[k]);
  const fake = Object.keys(truth).filter((k) => !truth[k]);
  const rates = [];
  if (real.length) rates.push(real.filter((k) => answers[k] === true).length / real.length);
  if (fake.length) rates.push(fake.filter((k) => answers[k] === false).length / fake.length);
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

function gradePattern(text, forbidden, required, maxChars) {
  if (maxChars && text.length > maxChars) return { outcome: 0, reason: "over_length" };
  let ok = 0, total = 0;
  const violations = [];
  for (const c of forbidden) {
    total++;
    if (new RegExp(c.pattern, c.flags || "").test(text)) {
      violations.push(c.label);
      if (c.hard) return { outcome: 0, reason: "hard_fail", violations };
    } else ok++;
  }
  for (const c of required) {
    total++;
    if (new RegExp(c.pattern, c.flags || "").test(text)) ok++;
    else violations.push(c.label);
  }
  return { outcome: total ? ok / total : 0, violations };
}

function gradeChoice(option, reason, correct, weights, optionWeight = 0.5) {
  const o = option === correct ? 1 : 0;
  if (!weights) return o;
  return optionWeight * o + (1 - optionWeight) * (weights[reason] ?? 0);
}

const gradePath = (outcomes, mode) =>
  mode === "path_min" ? Math.min(...outcomes)
                      : outcomes.reduce((a, b) => a + b, 0) / outcomes.length;

/* --------------------------------------------------------------------------
   Cases. Bodies mirror the authored YAML; targets are marked inline with
   [[ ]] and resolved at runtime exactly as case_loader.py does.
   -------------------------------------------------------------------------- */

function extractSpans(marked) {
  const re = /\[\[(.+?)\]\]/gs;
  let clean = "", targets = [], cursor = 0, pos = 0, m;
  while ((m = re.exec(marked)) !== null) {
    const lead = marked.slice(cursor, m.index);
    clean += lead; pos += lead.length;
    clean += m[1];
    targets.push([pos, pos + m[1].length]);
    pos += m[1].length;
    cursor = m.index + m[0].length;
  }
  clean += marked.slice(cursor);
  return { clean, targets };
}

/* Level thresholds, matching app.level_rule. The client shows them so that a
   person can see what the next level asks for; the server decides who has it. */
const LEVELS = [
  { level: 1, tr: "Başlangıç", en: "Newcomer",  dims: 1, theta: -0.5, cases: 0,  brier: null },
  { level: 2, tr: "Uygulayıcı", en: "Practised", dims: 3, theta: 0.0,  cases: 12, brier: null },
  { level: 3, tr: "Denetleyen", en: "Reviewer",  dims: 5, theta: 0.5,  cases: 30, brier: 0.20 },
  { level: 4, tr: "Yetkin",     en: "Capable",   dims: 6, theta: 1.0,  cases: 60, brier: 0.15 },
  { level: 5, tr: "Rehber",     en: "Guide",     dims: 7, theta: 1.5,  cases: 100, brier: 0.12 },
];

/* Units offered at registration. In the system this list comes from /units. */
const UNITS = [
  { id: 3, name: "Bilgisayar Mühendisliği" },
  { id: 4, name: "Elektrik-Elektronik Mühendisliği" },
  { id: 6, name: "Tıp Fakültesi" },
  { id: 7, name: "İktisadi ve İdari Bilimler Fakültesi" },
  { id: 8, name: "Hukuk Fakültesi" },
  { id: 9, name: "Eğitim Fakültesi" },
  { id: 10, name: "Bilgi İşlem Daire Başkanlığı" },
];

/* Mail services where anybody can open an address. Which institutional
   domains are accepted is decided on the server and changes in the panel, and
   the server answers every address alike so that it never says which ones it
   knows. The door therefore turns away only what can never be institutional. */
const PERSONAL_MAIL = [
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.tr", "outlook.com",
  "outlook.com.tr", "live.com", "msn.com", "windowslive.com", "yahoo.com", "yahoo.com.tr",
  "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "yandex.com", "yandex.com.tr",
  "yandex.ru", "mail.ru", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "mynet.com",
];
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/;

function addressProblem(address, t) {
  if (!EMAIL_SHAPE.test(address)) return t.badEmail;
  const domain = address.split("@").pop();
  if (PERSONAL_MAIL.some((d) => domain === d || domain.endsWith(`.${d}`))) return t.wrongDomain;
  return null;
}

/* The sample cases the screen falls back on without a server. */
const CASES = SAMPLE_CASES;

/* -------------------------------------------------------------------------- */

/* Colours taken from the institution's own marks.
 *
 *   #E10613  the university seal's red, sampled from the crest
 *   #C00000  the centre's red, sampled from the AIARC wordmark
 *
 * The darker of the two is used for text, borders and filled buttons because
 * it clears 4.5:1 contrast on both the card and the page background. The seal
 * red is kept for the brighter accents: the badge, small highlights and the
 * crest itself. */
const PAPER = "var(--paper)", CARD = "var(--card)", LINE = "var(--line)";
const TEXT = "var(--text)", MUTED = "var(--muted)", ACCENT = "var(--accent)", BRAND = "var(--brand)";
const GOOD = "var(--good)", WARN = "var(--warn-text)", AMBER = "var(--amber)";
/* The rose's own tints, from bud to bloom. */
const BLUSH = "var(--accent-line)", PETAL = "var(--petal)", RING = "var(--line-strong)";
const DISPLAY = "'Archivo', system-ui, sans-serif";
/* A language as its own speakers name it, for choosing the language of a case. */
const ENDONYMS = { tr: "Türkçe", en: "English" };
/* The order languages are listed in: the university's own first. */
const LANG_ORDER = ["tr", "en"];
/* Kept for the sign-in code, where each digit has to be told apart. */
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* `section`: inside the shell the twin and the cases are two screens, "twin"
   and "cases". Standing alone the screen shows both, as one. */
export default function StudentApp({ lang: hostLang, onLang, embedded, themePref, onTheme,
                                     section }) {
  /* Language and the app chrome belong to whoever is hosting this screen.
     Standing alone it keeps its own; inside the shell the shell owns them, so
     only one language switch is on screen. */
  const [ownLang, setOwnLang] = useState(() => openingLang(null));
  const lang = hostLang ?? ownLang;
  if (!hostLang) showLang(ownLang);
  const [twin, setTwin] = useState(() => normaliseTwin(null));
  const [history, setHistory] = useState([]);          // every graded step, oldest first
  const [points, setPoints] = useState(0);
  const [serverCal, setServerCal] = useState(null);   // { brier_mean, n } from /me
  const [casesDone, setCasesDone] = useState(0);
  const [view, setView] = useState({ screen: "home" });
  const [session, setSession] = useState(undefined);  // undefined until known
  const [openCases, setOpenCases] = useState(null);
  const [listFailed, setListFailed] = useState(false);
  const [suggested, setSuggested] = useState(null);   // what /cases/next recommends
  const [offline, setOffline] = useState(false);
  const [fresh, setFresh] = useState(null);           // the area answered last
  const [limits, setLimits] = useState(null);         // the solving limits, from /me
  const [myReports, setMyReports] = useState([]);
  const [suspended, setSuspended] = useState(null);   // the notice, when suspended
  const [notices, setNotices] = useState([]);         // announcements for this person
  const [book, setBook] = useState(null);             // marks and medals, and the person's own
  const [newsState, setNewsState] = useState(() => newsMarks());

  /* Standing alone, a language picked here is kept as the shell keeps it. */
  const setLang = onLang ?? ((next) => {
    pickLang(next);
    setOwnLang(next);
    if (session && !offline) me.setLocale(next, true).catch(() => {});
  });

  const load = async () => {
    const mine = await me.get();
    if (mine?.twin) setTwin(normaliseTwin(mine.twin));
    if (typeof mine?.points === "number") setPoints(mine.points);
    setServerCal(mine?.calibration ?? null);
    setCasesDone(mine?.cases_completed ?? 0);
    setLimits(mine?.limits ?? null);
    // The rest fills in around the twin; any of it failing leaves the twin readable.
    const [open, past, next, mineReports, mineNews, mineAwards] = await Promise.allSettled(
      [cases.open(), me.history(), cases.next(), me.reports(), news.mine(), awardList.mine()]);
    if (mineReports.status === "fulfilled") setMyReports(mineReports.value?.reports ?? []);
    if (mineAwards.status === "fulfilled" && mineAwards.value?.awards) setBook(mineAwards.value);
    if (mineNews.status === "fulfilled") setNotices(mineNews.value?.announcements ?? []);
    if (open.status === "fulfilled" && open.value?.cases) {
      setOpenCases(open.value.cases); setListFailed(false);
    } else {
      setListFailed(true);
    }
    if (past.status === "fulfilled" && Array.isArray(past.value?.steps)) {
      setHistory(past.value.steps);
    }
    setSuggested(next.status === "fulfilled" ? (next.value?.case ?? null) : null);
    return mine;
  };

  /* One probe at start-up decides whether there is a server behind this screen. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await load();
        if (cancelled) return;
        // Inside the shell the shell has already settled the language.
        if (!hostLang && mine) {
          const shown = openingLang(mine);
          setOwnLang(shown);
          if (!mine.locale_chosen && mine.account_locale !== shown) {
            me.setLocale(shown, false).catch(() => {});
          }
        }
        setSession(mine ?? { signedIn: true });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setSession(null);                       // signed out: show the door
          return;
        }
        if (err instanceof ApiError && err.code === "suspended") {
          setSuspended(err.detail ?? {});
          setSession(null);
          return;
        }
        useMock(true);
        setOffline(true);
        const sample = sampleHistory();
        setHistory(sample);
        setTwin(twinFromHistory(sample));
        setPoints(268);
        setCasesDone(18);
        setLimits(SAMPLE_LIMITS);
        setMyReports(SAMPLE_REPORTS);
        setBook({ sample: true });
        setSession({ signedIn: true, sample: true });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const t = T[lang];
  // Without a server the badge shows a sample, in the language on screen.
  const shownBook = useMemo(() => (book?.sample ? sampleBook(lang) : book), [book, lang]);

  /* What is offered depends on the language on screen, so a change of
     language reads the home screen again. */
  const langSeen = useRef(lang);
  useEffect(() => {
    if (langSeen.current === lang) return;
    langSeen.current = lang;
    if (session && !session.sample && !offline) load().catch(() => {});
  }, [lang]);

  const calib = offline ? brierOf(history) : (serverCal?.n ? serverCal.brier_mean : null);

  /* The level and the area levels are read off the twin, as app.badge reads
     them, so a person can see what the next level asks for. Marks and medals
     are the server's record (book). */
  const progression = useMemo(() => {
    const dims = Object.values(twin);
    const cases = casesDone;
    const brier = calib;
    // An area counts once it has been answered at least once.
    const solid = (r) => dims.filter((d) => d.n > 0 && d.theta >= r.theta).length;
    const meets = (r) =>
      solid(r) >= r.dims
      && cases >= r.cases
      && (r.brier == null || (brier != null && brier <= r.brier));
    const reached = LEVELS.filter(meets).pop() ?? LEVELS[0];
    const next = LEVELS.find((r) => r.level === reached.level + 1) ?? null;
    // An area's level asks for an ability and enough answers for it to be
    // more than noise.
    const tiers = Object.fromEntries(
      BADGE_DIMS.map((d) => [d.key, tierFor(twin[d.key]?.theta ?? 0, twin[d.key]?.n ?? 0)]));
    return { reached, next, cases, brier, dims, tiers, solid };
  }, [twin, casesDone, calib]);

  /* One graded step, applied to what this screen shows. The figures are the
     server's; the client does not recompute them. */
  const onResult = (r, confidence, context) => {
    const dim = r.twin?.dimension;
    if (dim) {
      setTwin((tw) => ({ ...tw,
        [dim]: { theta: r.twin.after, n: (tw[dim]?.n ?? 0) + 1 } }));
      setHistory((h) => [...h, {
        dimension: dim, at: new Date().toISOString(), theta: r.twin.after,
        outcome: r.outcome, confidence: confidence ?? null,
        predicted: r.twin.predicted ?? sigmoid(r.twin.before ?? 0),
        case: context?.key, step: context?.step, title: context?.title }]);
      setFresh(dim);
    }
    setPoints((p) => Math.max(0, p + (r.points ?? 0)));
    if (r.calibration) setServerCal(r.calibration);
    if (r.debrief) setCasesDone((n) => n + 1);
    // Marks and medals the finish earned join the person's own at once.
    if (r.awards?.length) {
      const at = new Date().toISOString();
      setBook((b) => (!b?.awards ? b : {
        ...b,
        awards: [...b.awards, ...r.awards.filter((a) => !b.awards.some((x) => x.code === a.code))],
        mine: [...b.mine, ...r.awards.filter((a) => !b.mine.some((m) => m.code === a.code))
          .map((a) => ({ code: a.code, earned_at: at, by_hand: false }))],
      }));
    }
  };

  const goHome = () => {
    setView({ screen: "home" });
    if (!offline) load().catch(() => {});
  };

  const start = (c) => setView({ screen: "case", case: c,
    before: { level: progression.reached.level, tiers: progression.tiers } });

  /* A case in one area: the server picks it, as it picks the next case. */
  const findInArea = async (dim) => {
    if (offline) {
      const local = CASES.find((c) => c.steps.some((s) => s.dimension === dim));
      return local ? caseSummary(local) : null;
    }
    const r = await cases.next(dim);
    return r?.case ? summaryOf(r.case, openCases) : null;
  };

  /* The campus map sends a person to a case with #vaka/<key>. The case opens
     at its first page, as from the list; a new case the solving limits hold
     back stays in the list. */
  const sentTo = useRef(section === "twin" ? null
    : (window.location.hash || "").match(/^#vaka\/([A-Za-z0-9-]{5,61})$/)?.[1] ?? null);
  useEffect(() => {
    const key = sentTo.current;
    if (!key || !openCases) return;
    sentTo.current = null;
    window.history.replaceState(null, "", window.location.pathname + window.location.search
                                + (section === "cases" ? "#vakalar" : ""));
    window.scrollTo(0, 0);
    const listed = openCases.find((c) => c.key === key);
    if (!listed) return;
    const summary = caseSummary(listed);
    const free = !limits || !limits.enabled || limits.exempt || limits.can_start;
    if (statusOf(summary) === "new" && !free) return;
    start(summary);
  }, [openCases]);

  if (session === undefined) return <div lang={lang} style={S.root}><style>{CSS}</style></div>;

  return (
    <div lang={lang} style={S.root}>
      <style>{CSS}</style>
      {session === null ? (
        <Join t={t} lang={lang} setLang={setLang} embedded={embedded} suspended={suspended}
          themePref={themePref} onTheme={onTheme}
          /* A reload, so the shell above this screen asks again who is signed
             in and shows the navigation that goes with it. */
          onDone={() => window.location.reload()} />
      ) : view.screen === "home" ? (
        <Home t={t} lang={lang} setLang={setLang} twin={twin} history={history}
          points={points} embedded={embedded} fresh={fresh} section={section}
          offline={offline} progression={progression} book={shownBook}
          calib={calib} openCases={openCases} listFailed={listFailed}
          suggested={suggested}
          /* A case started from the twin is solved on the cases screen. */
          onStart={section === "twin" ? (c) => { window.location.hash = `vaka/${c.key}`; } : start}
          findInArea={findInArea}
          limits={limits} myReports={myReports}
          notices={notices} newsState={newsState}
          onNews={(id, how) => setNewsState(markNews(id, how))} />
      ) : (
        <CaseRunner t={t} lang={lang} caseDef={view.case} twin={twin} history={history}
          offline={offline || isMock()} onResult={onResult}
          before={view.before} progression={progression}
          onExit={goHome} />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   The twin as numbers.

   Each graded step brings the area's ability estimate (θ after the step) and
   the chance the twin gave beforehand of getting it right. The estimate is read
   as a chance of solving a step of average difficulty, σ(θ). Its uncertainty is
   the Rasch standard error, 1/√(1 + Σ p(1−p)), where the 1 is the information of
   the prior and each answer adds what its prediction could tell. The range
   shown is θ ± 1.28 SE, which holds the estimate four times in five.
   -------------------------------------------------------------------------- */

const Z80 = 1.2816;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pctOf = (x) => Math.round(clamp01(x) * 100);
/* A percentage as each language writes it: %62 in Turkish, 62% in English. */
const pct = (x, lang) => (lang === "tr" ? `%${pctOf(x)}` : `${pctOf(x)}%`);
const fill = (s, vars) => Object.entries(vars).reduce(
  (out, [k, v]) => out.replaceAll(`{${k}}`, v), s);

function twinModel(history, twin) {
  const by = Object.fromEntries(DIMS.map((d) => [d,
    { theta: 0, n: 0, info: 0, beads: [], series: [] }]));
  for (const h of history ?? []) {
    const d = by[h.dimension];
    if (!d) continue;
    const p = Number.isFinite(h.predicted) ? h.predicted : 0.5;
    d.n += 1;
    d.info += p * (1 - p);
    d.theta = h.theta;
    d.beads.push(h);
    d.series.push(h.theta);
  }
  for (const key of DIMS) {
    const d = by[key];
    const known = twin?.[key];
    // The stored twin is the authority on θ. When it holds answers the history
    // does not (an import, say), their information is estimated from the count.
    if (known) {
      d.theta = known.theta;
      if (known.n > d.n) { d.info += (known.n - d.n) * 0.22; d.n = known.n; }
    }
    d.se = 1 / Math.sqrt(1 + d.info);
    d.p = sigmoid(d.theta);
    d.lo = sigmoid(d.theta - Z80 * d.se);
    d.hi = sigmoid(d.theta + Z80 * d.se);
  }
  return by;
}

function twinFromHistory(history) {
  const out = normaliseTwin(null);
  for (const h of history) out[h.dimension] = { theta: h.theta, n: out[h.dimension].n + 1 };
  return out;
}

/* Self-knowledge as the server computes it: the mean Brier score of stated
   confidence against success. */
function brierOf(history) {
  const scored = history.filter((h) => h.confidence != null);
  return scored.length ? mean(scored.map((h) => brier(h.outcome, h.confidence))) : null;
}

/* A plausible term for the screen opened without a server: answers drawn from
   the same model the twin uses, so the halo, the beads and the mirror agree. */
function sampleHistory() {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const skill = { prompt_design: 1.0, verification: 0.3, integrity: 1.4, privacy: -0.4,
                  manipulation: 0.6, op_security: -0.9, boundaries: 0.2 };
  const counts = { prompt_design: 8, verification: 14, integrity: 6, privacy: 11,
                   manipulation: 4, op_security: 3, boundaries: 9 };
  const titles = ["Var Olmayan Kaynak", "Annenin Tahlil Sonucu", "Sesi Tanıdık Gelen Arama",
                  "Kusursuz Türkçe", "Yurt Dışındaki Ortak", "Tespit Aracı Öyle Diyor"];
  const order = [];
  for (const [d, n] of Object.entries(counts)) for (let i = 0; i < n; i++) order.push(d);
  order.sort(() => rand() - 0.5);
  const theta = Object.fromEntries(DIMS.map((d) => [d, 0]));
  const seen = Object.fromEntries(DIMS.map((d) => [d, 0]));
  const t0 = Date.parse("2026-10-15T10:00:00+03:00") - order.length * 26 * 3600e3;
  return order.map((d, i) => {
    const b = (rand() - 0.5) * 1.2;
    const p = sigmoid(theta[d] - b);
    const truth = sigmoid(skill[d] - b);
    const r = rand();
    const outcome = r < truth ? 1 : r < truth + 0.18 ? 0.5 : 0;
    const confidence = CONFIDENCE[Math.min(4, Math.max(0,
      Math.round((truth + (rand() - 0.35) * 0.5 - 0.5) * 10)))];
    const k = seen[d] < 10 ? 0.4 : 0.15;
    theta[d] += k * (outcome - p);
    seen[d] += 1;
    return { dimension: d, at: new Date(t0 + i * 26 * 3600e3).toISOString(),
             theta: theta[d], outcome, confidence, predicted: p,
             case: `sample-${i % titles.length}`, step: `st${(i % 3) + 1}`,
             title: titles[i % titles.length] };
  });
}

/* What each area asks of a person, in a line. */
const DIM_ABOUT = {
  tr: {
    prompt_design: "Bir yapay zekâ aracına işi açıkça, sınırını çizerek ve sonucu kontrol edilebilecek biçimde tarif etmek.",
    verification: "Yapay zekânın verdiği bilginin, kaynağın ve sayının gerçekten doğru olup olmadığını kontrol etmek.",
    integrity: "Yapay zekâ kullanımını dürüstçe beyan etmek ve atıfı doğru yapmak.",
    privacy: "Kişisel ya da hassas veriyi bir araca vermeden önce durup düşünmek.",
    manipulation: "Yapay zekâyla üretilmiş sahte ses ve görüntüleri, ikna tuzaklarını fark etmek ve baskıya boyun eğmemek.",
    op_security: "Kurumun bilgisini, hesaplarını ve sistemlerini korumak.",
    boundaries: "Bir modelin neyi bilemeyeceğini, nerede yanlı davrandığını ve sınırlarını bilmek.",
  },
  en: {
    prompt_design: "Briefing an AI tool clearly, with limits, so the result can be checked.",
    verification: "Testing whether generated facts, sources and figures really exist.",
    integrity: "Declaring AI use honestly and citing correctly.",
    privacy: "Stopping to think before personal or sensitive data goes into a tool.",
    manipulation: "Spotting deepfaked voices and images and persuasion traps, and resisting pressure.",
    op_security: "Protecting the institution's information, accounts and systems.",
    boundaries: "Knowing what a model cannot know, its biases and its limits.",
  },
};

/* A case card's data, from the server's list or from a sample case. */
function caseSummary(o) {
  const local = CASES.find((c) => c.key === o.key) ?? null;
  if (o.title && typeof o.title === "string") {
    return {
      key: o.key, type: o.type, local,
      title: { tr: o.title, en: o.title },
      context: { tr: o.context ?? "", en: o.context ?? "" },
      minutes: o.minutes, stepCount: o.steps,
      dims: o.dimensions ?? (local ? [...new Set(local.steps.map((s) => s.dimension))] : []),
      attempted: o.attempted, finished: o.finished, revealed: !!o.revealed,
      // Set aside by an administrator: when and why.
      voided: o.voided ?? null,
      image: o.image ?? null,
      // The language the case is shown in, and every language it has.
      locale: o.locale ?? "tr", locales: o.locales ?? [o.locale ?? "tr"],
    };
  }
  return {
    key: o.key, type: o.type, local: o, image: null,
    title: o.title, context: o.context, minutes: o.minutes,
    stepCount: o.steps.length, dims: [...new Set(o.steps.map((s) => s.dimension))],
    attempted: false, finished: false, revealed: true,
  };
}

/* A recommendation from /cases/next, as a case card. */
function summaryOf(c, openCases) {
  const listed = openCases?.find((x) => x.key === c.key);
  if (listed) return caseSummary(listed);
  return caseSummary({ key: c.key, type: "open", title: c.title, context: c.context,
                       minutes: c.estimated_minutes, steps: c.step_count,
                       dimensions: c.dimension ? [c.dimension] : [], image: c.image,
                       locale: c.locale, locales: c.locales });
}

/* ---------------------------------- home ---------------------------------- */

function Home({ t, lang, setLang, twin, history, points, calib, offline, progression, book,
               openCases, listFailed, suggested, embedded, fresh, onStart, findInArea,
               limits, myReports, notices, newsState, onNews, section }) {
  // A new case may begin; a started one can always be reopened.
  const canStart = !limits || !limits.enabled || limits.exempt || limits.can_start;
  const list = useMemo(() => (openCases ?? (offline ? CASES : [])).map(caseSummary),
                       [openCases, offline]);
  const model = useMemo(() => twinModel(history, twin), [history, twin]);
  const [selected, setSelected] = useState(null);
  const [replayAt, setReplayAt] = useState(null);       // null: today
  const shown = useMemo(
    () => (replayAt == null ? model : twinModel(history.slice(0, replayAt), null)),
    [replayAt, model, history]);
  const total = history.length;
  /* In one column the twin is long, so what a person came for, the next case
     and the list, comes first and the twin follows. */
  const narrow = useNarrow();
  const toStart = (
    <>
      <SessionStrip t={t} lang={lang} limits={limits} offline={offline} />
      <NextCase t={t} lang={lang} list={list} suggested={suggested}
        offline={offline} openCases={openCases} onStart={onStart} canStart={canStart} />
    </>
  );
  const caseList = (
    <CaseList t={t} lang={lang} list={list} onStart={onStart} canStart={canStart}
      title={section === "cases" ? t.allCases : undefined} />
  );
  const notes = (
    <>
      {openCases && openCases.length === 0 && <p style={S.help}>{t.noCases}</p>}
      {!offline && !openCases && listFailed && <p style={S.offlineBox}>{t.listFailed}</p>}
    </>
  );

  /* The cases on a screen of their own. */
  if (section === "cases") {
    return (
      <div className="tw" data-screen="cases" data-layout={narrow ? "narrow" : "wide"}>
        <header style={S.twinHead}>
          <div>
            <h1 style={S.h1}>{t.casesHead}</h1>
            <p style={S.lede}>{t.casesLede}</p>
          </div>
        </header>
        <div className="tw-first" data-panel="first">{toStart}{caseList}</div>
        <MyReports t={t} lang={lang} list={myReports} />
        {notes}
        {offline && <p style={S.offlineBox}>{t.offlineNote}</p>}
      </div>
    );
  }
  // The twin on a screen of its own, or standing alone the twin and the cases.
  const withCases = section !== "twin";

  return (
    <div className="tw" data-screen="twin" data-layout={narrow ? "narrow" : "wide"}>
      {notices?.length > 0 && (
        <NewsBox t={t} lang={lang} list={notices} state={newsState} onNews={onNews}
          style={S.homeNews} />
      )}
      {narrow && withCases && (
        <div className="tw-first" data-panel="first">{toStart}{caseList}</div>
      )}

      <header style={S.twinHead}>
        <div>
          <h1 style={S.h1}>{t.twin}</h1>
          <p style={S.lede}>
            {total ? fill(plural(t, "summaryAnswers", total), { n: total }) : t.roseNew}
          </p>
          {/* Someone who has not answered yet is shown the way to a first case. */}
          {!total && section === "twin" && (
            <button type="button" style={S.toCases} data-action="to-cases"
              onClick={() => { window.scrollTo(0, 0); window.location.hash = "vakalar"; }}>
              {t.toCases}
            </button>
          )}
          {!total && section === "twin" && <Training t={t} />}
          {!total && section === "twin" && (
            <p style={S.guideLine}>
              {t.guideFirst}{" "}
              <a href="#hakkinda/rehber" style={S.aboutLink} data-action="guide-first">
                {t.guideFirstLink}</a>
            </p>
          )}
        </div>
        {!embedded && <LangSwitch lang={lang} setLang={setLang} />}
      </header>

      <LevelCard t={t} lang={lang} progression={progression} book={book} />

      <section className="tw-hero" style={S.hero}>
        <div className="tw-rose-col">
          <div className="rose-wrap">
            <Rose model={shown} lang={lang} t={t} selected={selected}
              onSelect={(d) => setSelected((cur) => (cur === d ? null : d))}
              level={progression.reached.level}
              fresh={replayAt == null ? fresh : null} />
          </div>
          {total >= 2 && (
            <Replay t={t} lang={lang} history={history} at={replayAt} setAt={setReplayAt} />
          )}
          <details style={S.howTo}>
            <summary style={S.howToHead}>{t.howToRead}</summary>
            <p style={S.howToBody}>{t.roseHelp}</p>
          </details>
        </div>

        <div className="tw-side">
          {selected ? (
            <AreaDetail t={t} lang={lang} dim={selected} model={model}
              onClose={() => setSelected(null)}
              onStart={onStart} findInArea={findInArea} />
          ) : (
            <Summary t={t} lang={lang} model={model} total={total}
              points={points} calib={calib} />
          )}
          {!narrow && withCases && toStart}
          <AreaList t={t} lang={lang} model={model} selected={selected}
            onSelect={(d) => setSelected((cur) => (cur === d ? null : d))} />
        </div>
      </section>

      <div className="tw-row">
        <Mirror t={t} lang={lang} history={history} calib={calib} />
        <WhoKnows t={t} lang={lang} history={history} />
      </div>

      {!narrow && withCases && caseList}
      {withCases && <MyReports t={t} lang={lang} list={myReports} />}

      {withCases && notes}
      {offline && <p style={S.offlineBox}>{t.offlineNote}</p>}

      {!embedded && <Colophon lang={lang} />}
    </div>
  );
}

function LangSwitch({ lang, setLang }) {
  return (
    <div style={S.seg}>
      {["tr", "en"].map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
          style={{ ...S.segBtn, ...(lang === l ? S.segOn : null) }}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

/* Whether the screen is one column wide: a phone, or a tablet held upright. */
function useNarrow(query = "(max-width: 899px)") {
  const [narrow, setNarrow] = useState(() => !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const on = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

/* ------------------------------ announcements ----------------------------- */

/* Announcements are text from the server and are shown as text: nothing in
   them is read as markup, and a link is drawn only when it is an https
   address. */

const NEWS_CUT = 240;

function dateText(iso, lang) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? ""
    : d.toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB",
                           { day: "numeric", month: "long", year: "numeric" });
}

/* A day and a time on the campus clock. */
function momentText(iso, lang) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? ""
    : d.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB",
                       { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
                         timeZone: "Europe/Istanbul" });
}

function NewsItem({ t, lang, item, read = false, onNews }) {
  const [open, setOpen] = useState(false);
  const long = item.body.length > NEWS_CUT;
  const cut = item.body.slice(0, NEWS_CUT - 20);
  const short = `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 120)).trimEnd()}…`;
  const link = typeof item.link === "string" && /^https:\/\//i.test(item.link) ? item.link : null;
  return (
    <article style={{ ...S.newsItem, ...(read ? S.newsItemRead : null) }}
      data-announcement={item.id} data-read={onNews ? (read ? "1" : "0") : undefined}>
      <div style={S.newsTop}>
        {/* An announcement is shown in the language the centre wrote it in. */}
        <h3 style={S.newsTitle} data-user-content>{item.title}</h3>
        {onNews && !read && (
          <button onClick={() => onNews(item.id, "read")} style={S.newsClose} title={t.newsClose}
            aria-label={t.newsClose} data-action="dismiss-news">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" />
            </svg>
          </button>
        )}
        {onNews && read && <span style={S.newsReadTag}>{t.newsRead}</span>}
      </div>
      <div style={S.newsDate}>{dateText(item.starts_at, lang)}</div>
      {(item.place_name || item.event_at) && (
        <div style={S.newsEvent} data-news-event>
          {item.place_name && (
            <span><b>{t.newsWhere}:</b> {item.place_name[lang] ?? item.place_name.tr}</span>
          )}
          {item.event_at && <span><b>{t.newsWhen}:</b> {momentText(item.event_at, lang)}</span>}
        </div>
      )}
      <p style={S.newsBody} data-user-content>{long && !open ? short : item.body}</p>
      {(long || link || onNews) && (
        <div style={S.newsActions}>
          {long && (
            <button onClick={() => setOpen((o) => !o)} aria-expanded={open} style={S.newsMore}>
              {open ? t.newsLess : t.newsMore}
            </button>
          )}
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" style={S.newsLink}>
              {t.newsLink}
            </a>
          )}
          {onNews && (
            <span style={S.newsMarks}>
              <button onClick={() => onNews(item.id, read ? "unread" : "read")}
                style={S.newsSmall} data-action={read ? "news-unread" : "news-read"}>
                {read ? t.newsMarkUnread : t.newsMarkRead}
              </button>
              <button onClick={() => onNews(item.id, "deleted")} style={S.newsSmall}
                data-action="news-delete">{t.newsDelete}</button>
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function News({ t, lang, list, style }) {
  return (
    <section style={{ ...S.news, ...style }} data-panel="news" aria-label={t.newsHead}>
      <div style={S.newsHead}><Icon name="publish" size={15} /> {t.newsHead}</div>
      {list.map((item) => <NewsItem key={item.id} t={t} lang={lang} item={item} />)}
    </section>
  );
}

/* The announcements on the home screen. Those not read yet are open at the
   top; one marked read leaves them but stays in the list of all
   announcements, where it can be read again, marked unread or deleted. */
function NewsBox({ t, lang, list, state, onNews, style }) {
  const [all, setAll] = useState(false);
  const [undo, setUndo] = useState(null);           // the one just deleted
  const kept = list.filter((n) => !state.deleted.includes(n.id));
  const unread = kept.filter((n) => !state.read.includes(n.id));
  const act = (id, how) => {
    onNews(id, how);
    setUndo(how === "deleted" ? id : null);
  };
  if (!kept.length && undo == null) return null;
  const shown = all ? kept : unread.slice(0, NEWS_OPEN);
  return (
    <section style={{ ...S.news, ...style }} data-panel="news" aria-label={t.newsHead}>
      <div style={S.newsHeadRow}>
        <div style={S.newsHead}>
          <Icon name="publish" size={15} /> {t.newsHead}
          {unread.length > 0 && (
            <span style={S.newsCount} data-unread={unread.length}>
              {fill(t.newsUnread, { n: unread.length })}
            </span>
          )}
        </div>
        {kept.length > 0 && (
          <button onClick={() => setAll((a) => !a)} aria-expanded={all} data-action="all-news"
            style={S.newsSmall}>
            {all ? t.newsAllClose : fill(t.newsAll, { n: kept.length })}
          </button>
        )}
      </div>
      {undo != null && (
        <p style={S.newsQuiet} role="status" data-news-undo>
          {t.newsDeleted}{" "}
          <button onClick={() => { onNews(undo, "restore"); setUndo(null); }} style={S.newsSmall}
            data-action="news-undo">{t.newsUndo}</button>
        </p>
      )}
      {!all && unread.length === 0 && kept.length > 0 && (
        <p style={S.newsQuiet} data-news-all-read>{t.newsAllRead}</p>
      )}
      {shown.map((item) => (
        <NewsItem key={item.id} t={t} lang={lang} item={item}
          read={state.read.includes(item.id)} onNews={act} />
      ))}
      {!all && unread.length > NEWS_OPEN && (
        <p style={S.newsQuiet}>{fill(plural(t, "newsMoreUnread", unread.length - NEWS_OPEN),
                                     { n: unread.length - NEWS_OPEN })}</p>
      )}
      {all && <p style={S.newsQuiet}>{t.newsKept}</p>}
    </section>
  );
}

/* How many unread announcements stand open at the top of the home screen. */
const NEWS_OPEN = 3;

/* Which announcements a person has read or deleted, kept in this browser.
   Only their numbers are kept, nothing is sent to the server, and the screen
   works the same when the browser keeps nothing. Closing an announcement in
   earlier versions marked it read. */
const NEWS_READ = "yazem.news.read";
const NEWS_DELETED = "yazem.news.deleted";
const NEWS_CLOSED_BEFORE = "yazem.news.hidden";

function storedIds(key) {
  try {
    const ids = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(ids) ? ids.filter(Number.isInteger) : [];
  } catch { return []; }
}

function newsMarks() {
  const read = [...new Set([...storedIds(NEWS_CLOSED_BEFORE), ...storedIds(NEWS_READ)])];
  return { read, deleted: storedIds(NEWS_DELETED) };
}

function markNews(id, how) {
  const now = newsMarks();
  const without = (ids) => ids.filter((x) => x !== id);
  const next = {
    // Deleting leaves the read mark as it was, so undoing it puts the
    // announcement back where it stood.
    read: how === "unread" ? without(now.read)
      : how === "read" ? [...without(now.read), id] : now.read,
    deleted: how === "deleted" ? [...without(now.deleted), id]
      : how === "restore" ? without(now.deleted) : now.deleted,
  };
  try {
    window.localStorage.setItem(NEWS_READ, JSON.stringify(next.read.slice(-200)));
    window.localStorage.setItem(NEWS_DELETED, JSON.stringify(next.deleted.slice(-200)));
    window.localStorage.removeItem(NEWS_CLOSED_BEFORE);
  } catch { /* kept for this visit only */ }
  return next;
}

/* The picture a case is shown with. A case without one, or a picture that does
   not load, leaves no gap. */
function CaseImage({ caseKey, version }) {
  const [failed, setFailed] = useState(false);
  if (!version || failed) return null;
  return (
    <div style={S.caseImage} data-case-image={caseKey}>
      <img src={cases.imageUrl(caseKey, version)} alt="" decoding="async"
        onError={() => setFailed(true)} style={S.caseImageImg} />
    </div>
  );
}

/* An area's mark, drawn: the same seven glyphs the badge carries. */
function Glyph({ dim, size = 18, colour }) {
  return (
    <svg viewBox="-8 -8 16 16" width={size} height={size} aria-hidden="true"
      style={{ color: colour ?? "currentColor", flexShrink: 0, display: "block" }}>
      <BadgeGlyph name={DIM_ICON[dim]} />
    </svg>
  );
}

/* When nothing is selected: where the person stands, in two lines and two figures. */
function Summary({ t, lang, model, total, points, calib }) {
  const known = DIMS.filter((d) => model[d].n > 0);
  const strongest = known.length
    ? known.reduce((a, b) => (model[b].p > model[a].p ? b : a)) : null;
  // As scoring.select_next_dimension chooses: fewest answers, then lowest ability.
  const leastKnown = DIMS.reduce((a, b) =>
    (model[b].n < model[a].n || (model[b].n === model[a].n && model[b].theta < model[a].theta)
      ? b : a));
  return (
    <div style={S.summary} data-panel="summary">
      <dl style={S.facts}>
        {strongest && (
          <div style={S.fact}>
            <dt style={S.factLabel}>{t.strongestArea}</dt>
            <dd style={S.factValue}>
              <Glyph dim={strongest} size={17} colour={ACCENT} />
              {DIM_LABEL[lang][strongest]}
              <span style={S.factAside}>{pct(model[strongest].p, lang)}</span>
            </dd>
          </div>
        )}
        <div style={S.fact}>
          <dt style={S.factLabel}>{t.leastKnown}</dt>
          <dd style={S.factValue}>
            <Glyph dim={leastKnown} size={17} colour={MUTED} />
            {DIM_LABEL[lang][leastKnown]}
            <span style={S.factAside}>
              {model[leastKnown].n
                ? fill(plural(t, "answersN", model[leastKnown].n), { n: model[leastKnown].n })
                : t.noAnswersYet}
            </span>
          </dd>
        </div>
      </dl>
      <div style={S.figures}>
        <div>
          <div style={S.figure}>{Math.round(points)}</div>
          <div style={S.figureCap}>{t.points}</div>
        </div>
        <div>
          <div style={{ ...S.figure, color: calib == null ? MUTED
                        : calib < 0.12 ? GOOD : calib < 0.22 ? WARN : ACCENT }}>
            {calib == null ? "—" : decimal(calib, lang)}
          </div>
          <div style={S.figureCap}>{t.calibration}</div>
        </div>
      </div>
      {total > 0 && <p style={S.help}>{t.pickArea}</p>}
    </div>
  );
}

/* One area, opened: what it asks, where the person stands, how the estimate
   moved, and a case to work on it. */
function AreaDetail({ t, lang, dim, model, onClose, onStart, findInArea }) {
  const d = model[dim];
  const [busy, setBusy] = useState(false);
  const [none, setNone] = useState(false);
  useEffect(() => { setNone(false); }, [dim]);
  const go = async () => {
    setBusy(true); setNone(false);
    try {
      const c = await findInArea(dim);
      if (c) onStart(c); else setNone(true);
    } catch { setNone(true); }
    finally { setBusy(false); }
  };
  const recent = d.beads.slice(-4).reverse();
  // Stated confidence against success in this area alone, once there are
  // enough answers for the gap to mean something.
  const scored = d.beads.filter((h) => h.confidence != null);
  const meanConf = mean(scored.map((h) => h.confidence));
  const hitRate = mean(scored.map((h) => (h.outcome >= SUCCESS_THRESHOLD ? 1 : 0)));
  const sure = scored.length < AREA_SURE_MIN ? null
    : meanConf - hitRate > 0.08 ? "areaOver" : meanConf - hitRate < -0.08 ? "areaUnder" : "areaFine";
  return (
    <div style={S.detail} data-area-detail={dim}>
      <div style={S.detailHead}>
        <ArtImage kind="dim" k={dim} size={52} alt="" />
        <h2 style={S.detailTitle}>{DIM_LABEL[lang][dim]}</h2>
      </div>
      <p style={S.detailAbout}>{DIM_ABOUT[lang][dim]}</p>
      {d.n > 0 ? (
        <>
          <p style={S.body}>
            {t.chance} <strong style={S.strong}>{pct(d.p, lang)}</strong>.{" "}
            {fill(t.likelyRange, { lo: pctOf(d.lo), hi: pctOf(d.hi) })}
          </p>
          {d.se > 0.55 && <p style={S.help}>{t.stillLearning}</p>}
          {sure && (
            <p style={S.help} data-area-confidence={sure}>
              {fill(t.areaSure, { n: scored.length, c: pctOf(meanConf), s: pctOf(hitRate) })}{" "}
              <strong style={S.strong}>{t[sure]}</strong>
            </p>
          )}
          <Spark series={d.series} lang={lang} />
          <div style={S.recentHead}>{t.recentAnswers}</div>
          <ul style={S.recent}>
            {recent.map((h, i) => (
              <li key={i} style={S.recentRow}>
                <Bead outcome={h.outcome} />
                <span style={S.recentTitle}>{h.title ?? "—"}</span>
                <span style={S.recentWhen}>{shortDate(h.at, lang)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={S.help}>{t.noAnswersYet}</p>
      )}
      <div style={S.detailActions}>
        <button onClick={go} disabled={busy} data-action="solve-in-area"
          style={{ ...S.primary, marginTop: 0, ...(busy ? S.disabled : null) }}>
          {busy ? t.loading : t.solveHere}
        </button>
        <button onClick={onClose} style={S.quiet}>{t.closeArea}</button>
      </div>
      {none && <p style={S.help}>{t.noCaseHere}</p>}
    </div>
  );
}

const shortDate = (iso, lang) => {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB",
                                 { day: "numeric", month: "short" });
};

function Bead({ outcome, size = 10 }) {
  const style = outcome >= SUCCESS_THRESHOLD
    ? { background: ACCENT, border: `1.5px solid ${ACCENT}` }
    : outcome > 0
      ? { background: PETAL, border: `1.5px solid ${PETAL}` }
      : { background: CARD, border: `1.5px solid ${RING}` };
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 99,
                                          flexShrink: 0, display: "inline-block", ...style }} />;
}

/* The estimate over time, as a chance, one point per answer. */
function Spark({ series }) {
  if (series.length < 2) return null;
  const W = 300, H = 56, P = 4;
  // The scale follows the data, at least twenty points wide, so a small move shows.
  const ps = series.map(sigmoid);
  const mid = (Math.max(...ps) + Math.min(...ps)) / 2;
  const half = Math.max(0.1, (Math.max(...ps) - Math.min(...ps)) / 2 + 0.03);
  const xs = (i) => P + (i * (W - 2 * P)) / (series.length - 1);
  const ys = (theta) => H - P - ((sigmoid(theta) - (mid - half)) / (2 * half)) * (H - 2 * P);
  const line = series.map((v, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join("");
  const last = series[series.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={S.spark} aria-hidden="true">
      {Math.abs(0.5 - mid) < half && (
        <line x1={P} x2={W - P} y1={ys(0)} y2={ys(0)} stroke={LINE} strokeDasharray="2 4" />
      )}
      <path d={`${line}L${xs(series.length - 1).toFixed(1)} ${H - P}L${P} ${H - P}Z`}
        fill={BLUSH} opacity=".55" />
      <path d={line} fill="none" stroke={ACCENT} strokeWidth="1.8" strokeLinejoin="round"
        strokeLinecap="round" />
      <circle cx={xs(series.length - 1)} cy={ys(last)} r="3.4" fill={ACCENT} />
    </svg>
  );
}

/* The recommendation: an unfinished case first, then what the twin asks for. */
function NextCase({ t, lang, list, suggested, offline, openCases, onStart, canStart = true }) {
  const unfinished = list.find((c) => c.attempted && !c.finished && !c.voided);
  const pick = unfinished
    ?? (suggested ? summaryOf(suggested, openCases) : null)
    ?? (offline ? list.find((c) => !c.finished) : null);
  if (!pick) {
    return list.length ? <p style={{ ...S.help, margin: "4px 0 6px" }}>{t.allDone}</p> : null;
  }
  const dim = !unfinished && suggested?.dimension ? suggested.dimension : null;
  const why = { review: t.whyReview, focus: t.whyFocus }[suggested?.reason] ?? t.nextWhy;
  const blocked = !canStart && !pick.attempted;
  return (
    <div style={S.next} data-panel="next">
      <div style={S.nextCap}>{unfinished ? t.resumeCase : t.nextCase}</div>
      <div style={S.nextTitle} lang={pick.locale}>{pick.title[lang]}</div>
      {dim && (
        <div style={S.nextWhy} data-reason={suggested?.reason ?? "least_known"}>
          <Glyph dim={dim} size={15} colour={ACCENT} />
          <span>{why}: {DIM_LABEL[lang][dim]}</span>
        </div>
      )}
      <div style={S.nextMeta}>
        {pick.locale && pick.locale !== lang && (
          <span style={S.langBadge} data-case-lang={pick.locale}>
            {fill(t.caseIn, { l: t.langNames[pick.locale] })}
          </span>
        )}
        {pick.minutes ? <span>{pick.minutes} {t.minutes}</span> : null}
        <span>{pick.stepCount ?? 0} {plural(t, "steps", pick.stepCount ?? 0)}</span>
      </div>
      <button onClick={() => onStart(pick)} data-action="next-case" disabled={blocked}
        style={{ ...S.primary, marginTop: 12, ...(blocked ? S.disabled : null) }}>
        {unfinished ? t.continueCase : t.start}
      </button>
    </div>
  );
}

/* The legend that is also the way in: one row per area. */
function AreaList({ t, lang, model, selected, onSelect }) {
  return (
    <div style={S.areas} role="list">
      {DIMS.map((d) => {
        const m = model[d];
        const on = selected === d;
        return (
          <button key={d} role="listitem" onClick={() => onSelect(d)} aria-pressed={on}
            data-area={d} className="area-row"
            style={{ ...S.areaRow, ...(on ? S.areaRowOn : null) }}>
            <Glyph dim={d} size={18} colour={on ? ACCENT : MUTED} />
            <span style={S.areaName}>
              <span style={S.areaLabel}>{DIM_LABEL[lang][d]}</span>
              <span style={S.areaSub}>
                {m.n ? fill(plural(t, "answersN", m.n), { n: m.n }) : t.noAnswersYet}
              </span>
            </span>
            <span style={S.areaBar} aria-hidden="true">
              {m.n > 0 && (
                <>
                  <span style={{ ...S.areaBand, left: `${pctOf(m.lo)}%`,
                                 width: `${Math.max(1, pctOf(m.hi) - pctOf(m.lo))}%` }} />
                  <span style={{ ...S.areaFill, width: `${pctOf(m.p)}%`,
                                 background: rampAt(m.p) }} />
                </>
              )}
            </span>
            <span style={S.areaPct}>{m.n ? pct(m.p, lang) : "—"}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------- rose ---------------------------------- */

/* A rose in the manner of Nightingale's diagrams: one petal per area, its
   length the chance of solving a step of average difficulty there. Isparta's
   flower, drawn from the twin. */

const RG = { size: 440, c: 220, core: 30, max: 148, rows: [163, 172], label: 191 };
const SECTOR = (Math.PI * 2) / DIMS.length;
const GAP = 0.035;
const angleAt = (i) => -Math.PI / 2 + i * SECTOR;
const radiusFor = (p) => RG.core + clamp01(p) * (RG.max - RG.core);
const at = (a, r) => [RG.c + Math.cos(a) * r, RG.c + Math.sin(a) * r];
const f1 = (x) => x.toFixed(1);

function wedge(a0, a1, r0, r1) {
  const [x0, y0] = at(a0, r0), [x1, y1] = at(a0, r1);
  const [x2, y2] = at(a1, r1), [x3, y3] = at(a1, r0);
  return `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}A${f1(r1)} ${f1(r1)} 0 0 1 ${f1(x2)} ${f1(y2)}`
       + `L${f1(x3)} ${f1(y3)}A${f1(r0)} ${f1(r0)} 0 0 0 ${f1(x0)} ${f1(y0)}Z`;
}

/* A wedge whose outer corners are rounded, so the seven read as petals. */
function petalPath(a0, a1, r0, r1) {
  const k = Math.min(9, (r1 - r0) / 3, ((a1 - a0) * r1) / 4);
  if (k < 1.5) return wedge(a0, a1, r0, r1);
  const da = k / r1;
  const [x0, y0] = at(a0, r0), [x1, y1] = at(a0, r1 - k), [c1x, c1y] = at(a0, r1);
  const [x2, y2] = at(a0 + da, r1), [x3, y3] = at(a1 - da, r1), [c2x, c2y] = at(a1, r1);
  const [x4, y4] = at(a1, r1 - k), [x5, y5] = at(a1, r0);
  return `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}Q${f1(c1x)} ${f1(c1y)} ${f1(x2)} ${f1(y2)}`
       + `A${f1(r1)} ${f1(r1)} 0 0 1 ${f1(x3)} ${f1(y3)}Q${f1(c2x)} ${f1(c2y)} ${f1(x4)} ${f1(y4)}`
       + `L${f1(x5)} ${f1(y5)}A${f1(r0)} ${f1(r0)} 0 0 0 ${f1(x0)} ${f1(y0)}Z`;
}

/* An arc, clockwise; counter-clockwise when the text on it must read upright
   along the bottom of the rose. */
function arcPath(a0, a1, r, clockwise = true) {
  const [x0, y0] = at(clockwise ? a0 : a1, r), [x1, y1] = at(clockwise ? a1 : a0, r);
  return `M${f1(x0)} ${f1(y0)}A${f1(r)} ${f1(r)} 0 0 ${clockwise ? 1 : 0} ${f1(x1)} ${f1(y1)}`;
}

/* From an unopened bud to the seal red. */
const RAMP = [[0, "#F4E1DE"], [0.3, "#EFC3BE"], [0.5, "#E8A9A2"], [0.65, "#D65F58"],
              [0.8, "#C00000"], [1, "#9E0000"]];
function rampAt(p) {
  const x = clamp01(p);
  let i = 1;
  while (i < RAMP.length - 1 && RAMP[i][0] < x) i++;
  const [p0, c0] = RAMP[i - 1], [p1, c1] = RAMP[i];
  const k = p1 === p0 ? 0 : (x - p0) / (p1 - p0);
  const ch = (c, s) => parseInt(c.slice(s, s + 2), 16);
  const mix = (s) => Math.round(ch(c0, s) + (ch(c1, s) - ch(c0, s)) * clamp01(k));
  return `rgb(${mix(1)},${mix(3)},${mix(5)})`;
}

/* Numbers that move to their new values instead of jumping. The first values
   grow from `from`, one group after another; later changes move together. */
function useTween(target, { from, duration = 900, group = 1, stagger = 0 } = {}) {
  const reduce = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const [value, setValue] = useState(() => (reduce || !from ? target : from));
  const state = useRef({ value: reduce || !from ? target : from, raf: 0, first: true });
  const signature = target.map((v) => v.toFixed(4)).join(",");
  useEffect(() => {
    const s = state.current;
    if (reduce) { s.value = target; setValue(target); return undefined; }
    const begin = s.value.slice();
    const lag = s.first ? stagger : 0;
    const span = s.first ? duration : Math.min(duration, 480);
    s.first = false;
    const t0 = performance.now();
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    cancelAnimationFrame(s.raf);
    const tick = (now) => {
      let done = true;
      const next = target.map((v, i) => {
        const k = clamp01((now - t0 - Math.floor(i / group) * lag) / span);
        if (k < 1) done = false;
        return begin[i] + (v - begin[i]) * ease(k);
      });
      s.value = next;
      setValue(next);
      if (!done) s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(s.raf);
  }, [signature]);
  return value;
}

let roseCount = 0;

function Rose({ model, lang, t, selected, onSelect, level, fresh, from, compact }) {
  const uid = useMemo(() => `r${(roseCount += 1)}`, []);
  const target = DIMS.flatMap((d) => [model[d].p, model[d].lo, model[d].hi]);
  const v = useTween(target, { from: from ?? target.map(() => 0), group: 3,
                               stagger: from ? 0 : 75 });
  const sel = selected ? DIMS.indexOf(selected) : -1;
  const centre = sel >= 0
    ? { big: pct(v[sel * 3], lang), small: DIM_SHORT[lang][selected] }
    : { big: String(level ?? 1), small: t.level };

  return (
    <svg viewBox={`0 0 ${RG.size} ${RG.size}`} className={`rose${compact ? " rose-compact" : ""}`}
      role="group" aria-label={t.twin}>
      <defs>
        {DIMS.map((d, i) => {
          const colour = rampAt(v[i * 3]);
          return (
            <radialGradient key={d} id={`${uid}-g${i}`} gradientUnits="userSpaceOnUse"
              cx={RG.c} cy={RG.c} r={RG.max}>
              <stop offset="0.2" stopColor={colour} stopOpacity="0.5" />
              <stop offset="1" stopColor={colour} stopOpacity="1" />
            </radialGradient>
          );
        })}
      </defs>

      {/* Two quiet rings: an even chance, and certainty. */}
      <circle cx={RG.c} cy={RG.c} r={radiusFor(0.5)} fill="none" stroke="var(--line)"
        strokeDasharray="1 5" strokeLinecap="round" />
      <circle cx={RG.c} cy={RG.c} r={RG.max} fill="none" stroke="var(--fill)" />

      {DIMS.map((d, i) => {
        const m = model[d];
        const known = m.n > 0;
        const a = angleAt(i);
        const a0 = a - SECTOR / 2 + GAP, a1 = a + SECTOR / 2 - GAP;
        const p = v[i * 3], lo = v[i * 3 + 1], hi = v[i * 3 + 2];
        const r = radiusFor(p), rLo = radiusFor(lo), rHi = radiusFor(hi);
        const colour = rampAt(p);
        const faded = selected && selected !== d;
        const lower = Math.sin(a) > 0.5;
        const label = `${DIM_LABEL[lang][d]}: ${known ? pct(m.p, lang) : t.noAnswersYet}`
          + (known ? `, ${fill(plural(t, "answersN", m.n), { n: m.n })}` : "");
        return (
          <g key={d} className="petal" data-petal={d}
            role="button" tabIndex={compact ? -1 : 0} aria-label={label}
            aria-pressed={selected === d}
            onClick={() => onSelect?.(d)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(d); }
            }}>
            <title>{label}</title>
            {/* A generous target for a finger, drawn first and invisible. */}
            <path d={wedge(a - SECTOR / 2, a + SECTOR / 2, RG.core, RG.label + 14)}
              fill="transparent" />
            <g className="petal-shape" opacity={faded ? 0.28 : 1}>
            {known && rHi > r + 0.5 && (
              <>
                <path d={wedge(a0, a1, r, rHi)} fill={colour} opacity=".11" />
                <path d={arcPath(a0, a1, rHi)} fill="none" stroke={colour} strokeWidth="1"
                  strokeDasharray="2 3" opacity=".6" />
              </>
            )}
            <path className="petal-body" d={petalPath(a0, a1, RG.core, known ? r : radiusFor(0.5))}
              fill={known ? `url(#${uid}-g${i})` : "var(--fill)"}
              stroke={known ? colour : "var(--line-strong)"} strokeWidth={selected === d ? 2.2 : 1}
              strokeDasharray={known ? undefined : "3 3"} strokeLinejoin="round" />
            {known && (
              <line x1={f1(at(a, RG.core + 5)[0])} y1={f1(at(a, RG.core + 5)[1])}
                x2={f1(at(a, r - 10)[0])} y2={f1(at(a, r - 10)[1])}
                stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".38" />
            )}
            {known && rLo > RG.core + 8 && (
              <path d={arcPath(a0 + 0.03, a1 - 0.03, rLo)} fill="none" stroke="#fff"
                strokeWidth="1.3" strokeDasharray="2 3" opacity=".9" />
            )}
            <Beads index={i} beads={m.beads} fresh={fresh === d} />
            </g>
            {!compact && (
              <>
                <path id={`${uid}-l${i}`} fill="none"
                  d={arcPath(a - SECTOR / 2, a + SECTOR / 2, lower ? RG.label + 10 : RG.label,
                             !lower)} />
                <text className="rose-label"
                  style={{ fill: selected === d ? ACCENT : MUTED }}>
                  <textPath href={`#${uid}-l${i}`} startOffset="50%" textAnchor="middle">
                    {DIM_SHORT[lang][d]}
                  </textPath>
                </text>
              </>
            )}
          </g>
        );
      })}

      <circle cx={RG.c} cy={RG.c} r={RG.core - 3} fill={CARD} stroke={LINE} />
      {!compact && (
        <>
          <text x={RG.c} y={RG.c - 2} textAnchor="middle" className="rose-centre">
            {centre.big}
          </text>
          <text x={RG.c} y={RG.c + 13} textAnchor="middle" className="rose-centre-cap">
            {centre.small}
          </text>
        </>
      )}
    </svg>
  );
}

/* Each answer as a bead on the rim, oldest first, filling the inner row and
   then the outer. The most recent answers are kept when there are more. */
function Beads({ index, beads, fresh }) {
  const a = angleAt(index);
  const span = SECTOR - 2 * GAP - 0.1;
  const caps = RG.rows.map((r) => Math.floor((span * r) / 7.4) + 1);
  const shown = beads.slice(-(caps[0] + caps[1]));
  const rows = [shown.slice(0, caps[0]), shown.slice(caps[0])];
  return rows.map((row, k) => {
    const r = RG.rows[k];
    const step = 7.4 / r;
    const startAt = a - ((row.length - 1) * step) / 2;
    const string = row.length > 1 && (
      <path key={`s${k}`} d={arcPath(startAt, startAt + (row.length - 1) * step, r)}
        fill="none" stroke="var(--line)" strokeWidth="1" />);
    return [string, ...row.map((h, j) => {
      const [x, y] = at(startAt + j * step, r);
      const last = fresh && k === (rows[1].length ? 1 : 0) && j === row.length - 1;
      const right = h.outcome >= SUCCESS_THRESHOLD;
      const part = !right && h.outcome > 0;
      return (
        <circle key={`${k}-${j}`} cx={f1(x)} cy={f1(y)} r="2.7"
          className={last ? "bead-new" : undefined}
          fill={right ? ACCENT : part ? PETAL : CARD}
          stroke={right ? ACCENT : part ? PETAL : RING} strokeWidth="1.2" />
      );
    })];
  });
}

/* The twin's history, played back. */
function Replay({ t, lang, history, at: k, setAt }) {
  const n = history.length;
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return undefined;
    const every = Math.max(45, Math.min(220, 3200 / n));
    const id = setInterval(() => {
      setAt((cur) => {
        const next = (cur ?? n) + 1;
        if (next >= n) { setPlaying(false); return null; }
        return next;
      });
    }, every);
    return () => clearInterval(id);
  }, [playing, n]);
  const pos = k ?? n;
  const when = pos >= n ? t.today
    : pos === 0 ? "—" : shortDate(history[pos - 1].at, lang);
  return (
    <div style={S.replay} data-panel="replay">
      <button onClick={() => {
        if (playing) { setPlaying(false); return; }
        if (k == null) setAt(0);
        setPlaying(true);
      }} style={S.playBtn} aria-label={playing ? t.pause : t.play}>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          {playing
            ? <g fill="currentColor"><rect x="2" y="1.5" width="2.6" height="9" rx=".6" />
                <rect x="7.4" y="1.5" width="2.6" height="9" rx=".6" /></g>
            : <path d="M3 1.6 L10.4 6 L3 10.4 Z" fill="currentColor" />}
        </svg>
      </button>
      <label style={S.replayTrack}>
        <span style={S.replayCap}>{t.replay}</span>
        <input type="range" min={0} max={n} value={pos} className="replay-range"
          onChange={(e) => {
            setPlaying(false);
            const next = Number(e.target.value);
            setAt(next >= n ? null : next);
          }} />
      </label>
      <span style={S.replayWhen}>{when}</span>
      {k != null && !playing && (
        <button onClick={() => setAt(null)} style={S.quietSmall}>{t.backToNow}</button>
      )}
    </div>
  );
}

/* --------------------------------- mirror --------------------------------- */

/* A reliability diagram: for each confidence a person can state, how often
   answers given with it were right. */
function Mirror({ t, lang, history, calib }) {
  const scored = history.filter((h) => h.confidence != null);
  const bins = CONFIDENCE.map((c) => {
    const here = scored.filter((h) =>
      Math.min(0.9, Math.max(0.5, Math.round(h.confidence * 10) / 10)) === c);
    const right = here.filter((h) => h.outcome >= SUCCESS_THRESHOLD).length;
    return { c, n: here.length, rate: here.length ? right / here.length : null };
  });
  const meanC = mean(scored.map((h) => h.confidence));
  const meanS = mean(scored.map((h) => (h.outcome >= SUCCESS_THRESHOLD ? 1 : 0)));
  const gap = meanC != null ? meanC - meanS : 0;
  const verdict = scored.length < 6 ? null : gap > 0.08 ? "over" : gap < -0.08 ? "under" : "fine";

  const W = 320, H = 178, L = 38, R = 8, TOP = 12, BOT = 138;
  const col = (W - L - R) / bins.length;
  const y = (v) => BOT - v * (BOT - TOP);
  return (
    <section style={S.card} data-panel="mirror">
      <h2 style={S.cardTitle}>{t.mirror}</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={S.mirrorSvg} role="img"
        aria-label={verdict ? t[`mirror${verdict[0].toUpperCase()}${verdict.slice(1)}`] : t.mirrorFew}>
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke={g ? "var(--fill)" : LINE} />
            <text x={L - 6} y={y(g) + 3.5} textAnchor="end" className="mirror-axis">
              {g === 0 ? "0" : pct(g, lang)}
            </text>
          </g>
        ))}
        {bins.map((b, i) => {
          const x = L + i * col;
          const w = col * 0.56;
          const cx = x + col / 2;
          const enough = b.n >= 3;
          const off = b.rate == null ? 0 : b.c - b.rate;
          const colour = !enough ? "var(--line)" : off > 0.12 ? ACCENT : off < -0.12 ? AMBER : "var(--text-2)";
          return (
            <g key={b.c}>
              {b.rate != null && (
                <rect x={cx - w / 2} y={y(b.rate)} width={w}
                  height={Math.max(1.5, BOT - y(b.rate))} rx="3"
                  fill={colour} opacity={enough ? 0.92 : 0.6} />
              )}
              <line x1={cx - w / 2 - 5} x2={cx + w / 2 + 5} y1={y(b.c)} y2={y(b.c)}
                stroke={TEXT} strokeWidth="1.6" strokeLinecap="round" />
              <text x={cx} y={BOT + 15} textAnchor="middle" className="mirror-tick">
                {pct(b.c, lang)}
              </text>
              <text x={cx} y={BOT + 28} textAnchor="middle" className="mirror-n">
                {b.n ? `${b.n} ${t.answerShort}` : "—"}
              </text>
            </g>
          );
        })}
      </svg>
      {verdict ? (
        <>
          <p style={{ ...S.body, margin: "8px 0 4px", fontWeight: 600 }}>
            {t[{ over: "mirrorOver", under: "mirrorUnder", fine: "mirrorFine" }[verdict]]}
          </p>
          <p style={{ ...S.body, margin: 0 }}>
            {fill(t.mirrorNums, { c: pctOf(meanC), s: pctOf(meanS) })}
            {verdict === "over" ? ` ${t.mirrorTipOver}` : verdict === "under" ? ` ${t.mirrorTipUnder}` : ""}
          </p>
        </>
      ) : (
        <p style={{ ...S.body, margin: "8px 0 0" }}>{t.mirrorFew}</p>
      )}
      {calib != null && (
        <p style={S.help}>{fill(t.brierLine, { b: decimal(calib, lang) })}</p>
      )}
      <p style={S.help}>{t.mirrorHelp}</p>
    </section>
  );
}

/* ----------------------------- who knows you better ----------------------------- */

/* Calibration measures as server/calibration.py computes them: the Brier score,
   its three parts, and how well confidence separates right from wrong. */
const CONF_EDGES = [0.5, 0.55, 0.65, 0.75, 0.85, 1.0];
const WHO_MIN = 10;
// Answers with confidence an area needs before its own confidence fit is shown.
const AREA_SURE_MIN = 6;
const decimal3 = (x, lang) => (lang === "tr" ? x.toFixed(3).replace(".", ",") : x.toFixed(3));

function aurocOf(f, o) {
  const n1 = o.filter((x) => x === 1).length;
  const n0 = o.length - n1;
  if (!n1 || !n0) return null;
  const idx = f.map((_, i) => i).sort((a, b) => f[a] - f[b]);
  const ranks = new Array(f.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && f[idx[j + 1]] === f[idx[i]]) j += 1;
    for (let k = i; k <= j; k += 1) ranks[idx[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  const sum = ranks.reduce((acc, r, i) => acc + (o[i] === 1 ? r : 0), 0);
  return (sum - (n1 * (n1 + 1)) / 2) / (n1 * n0);
}

function calibrationOf(f, o, edges) {
  const n = f.length;
  const base = o.reduce((a, b) => a + b, 0) / n;
  const groups = new Map();
  f.forEach((x, i) => {
    let k = edges.length - 2;
    for (let e = 0; e < edges.length - 1; e += 1) if (x < edges[e + 1]) { k = e; break; }
    const g = groups.get(k) ?? { n: 0, f: 0, o: 0 };
    g.n += 1; g.f += x; g.o += o[i];
    groups.set(k, g);
  });
  let rel = 0, res = 0;
  for (const g of groups.values()) {
    rel += g.n * (g.f / g.n - g.o / g.n) ** 2;
    res += g.n * (g.o / g.n - base) ** 2;
  }
  return {
    n, brier: f.reduce((a, x, i) => a + (x - o[i]) ** 2, 0) / n,
    reliability: rel / n, resolution: res / n, uncertainty: base * (1 - base),
    auroc: aurocOf(f, o),
  };
}

/* The person's own confidence against the twin's sealed predictions, on the
   same answers. */
function WhoKnows({ t, lang, history }) {
  const paired = history.filter((h) => h.confidence != null && h.predicted != null);
  if (paired.length < WHO_MIN) {
    return (
      <section style={S.card} data-panel="who-knows">
        <h2 style={S.cardTitle}>{t.whoKnows}</h2>
        <p style={{ ...S.body, margin: 0 }}>{fill(t.whoFew, { m: WHO_MIN, n: paired.length })}</p>
      </section>
    );
  }
  const hit = paired.map((h) => (h.outcome >= SUCCESS_THRESHOLD ? 1 : 0));
  const self = calibrationOf(paired.map((h) => h.confidence), hit, CONF_EDGES);
  const twinBrier = mean(paired.map((h, i) => (h.predicted - hit[i]) ** 2));
  const diff = self.brier - twinBrier;
  const verdict = Math.abs(diff) < 0.01 ? "whoTie" : diff > 0 ? "whoTwinWins" : "whoYouWin";
  const rows = [[t.whoYou, self.brier, TEXT], [t.whoTwin, twinBrier, ACCENT]];
  const W = 320, BAR = 18, GAP = 12, L = 64, R = 44, MAX = 0.3;
  const x = (v) => L + (Math.min(v, MAX) / MAX) * (W - L - R);
  const H = rows.length * (BAR + GAP) + 16;
  return (
    <section style={S.card} data-panel="who-knows">
      <h2 style={S.cardTitle}>{t.whoKnows}</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={S.mirrorSvg} role="img" aria-label={t[verdict]}>
        <line x1={x(0.25)} x2={x(0.25)} y1={0} y2={H - 14} stroke="var(--line-strong)" strokeDasharray="3 3" />
        <text x={x(0.25)} y={H - 3} textAnchor="middle" className="mirror-n">{decimal(0.25, lang)}</text>
        {rows.map(([label, v, colour], i) => (
          <g key={label} transform={`translate(0 ${i * (BAR + GAP) + 2})`}>
            <text x={L - 8} y={BAR / 2 + 4} textAnchor="end" className="mirror-tick">{label}</text>
            <rect x={L} y={0} width={Math.max(2, x(v) - L)} height={BAR} rx="4"
              fill={colour} opacity="0.88" />
            <text x={x(v) + 6} y={BAR / 2 + 4} className="mirror-tick">{decimal3(v, lang)}</text>
          </g>
        ))}
      </svg>
      <p style={{ ...S.body, margin: "8px 0 4px", fontWeight: 600 }}>{t[verdict]}</p>
      <p style={{ ...S.help, marginTop: 0 }}>{t.whoScale}</p>
      <div style={S.subHead}>{t.whoParts}</div>
      <div style={S.parts}>
        {[[t.partRel, self.reliability, t.partRelHelp],
          [t.partRes, self.resolution, t.partResHelp],
          [t.partUnc, self.uncertainty, t.partUncHelp]].map(([name, v, help]) => (
          <div key={name} style={S.partRow} data-part={name}>
            <span style={S.partName}>{name}</span>
            <span style={S.partValue}>{decimal3(v, lang)}</span>
            <span style={S.partHelp}>{help}</span>
          </div>
        ))}
      </div>
      {self.auroc != null && <p style={S.help}>{fill(t.aurocLine, { a: pctOf(self.auroc) })}</p>}
    </section>
  );
}

/* ---------------------------------- level --------------------------------- */

/* The badge, first on the screen: the level and what the next one asks for,
   then the area levels, the rare marks and, once there are any, the medals,
   each folded into one line until opened. */
function LevelCard({ t, lang, progression, book }) {
  const level = progression.reached.level;
  const [open, setOpen] = useState({});
  const toggle = (part) => setOpen((o) => ({ ...o, [part]: !o[part] }));
  const reachedAreas = DIMS.filter((dim) => (progression.tiers[dim] ?? 0) > 0).length;
  const held = new Map((book?.mine ?? []).map((m) => [m.code, m]));
  // One that has been switched off stays on the badge of those who hold it.
  const shown = (book?.awards ?? []).filter((a) => a.active || held.has(a.code));
  const marks = shown.filter((a) => a.category === "marks");
  const groups = (book?.categories ?? []).filter((c) => c.code !== "marks")
    .map((c) => ({ ...c, awards: shown.filter((a) => a.category === c.code) }))
    .filter((c) => c.awards.length > 0);
  const medals = groups.flatMap((c) => c.awards);
  const tally = (list) => `${list.filter((a) => held.has(a.code)).length}/${list.length}`;
  const strip = (list) => list.map((a) => (
    <AwardImage key={a.code} award={a} size={24} locked={!held.has(a.code)} alt="" />));
  return (
    <section style={{ ...S.card, ...S.badgeCard }} data-panel="level">
      <div className="tw-badge-top">
        <div style={S.sealRow}>
          <ArtImage kind="level" k={level} size={96}
            alt={`${t.level} ${level}, ${progression.reached[lang]}`} />
          <div>
            <div style={S.levelName}>{progression.reached[lang]}</div>
            <div style={S.levelSub}>
              {t.level} {level}
            </div>
            <p style={S.sealNote}>{t.sealNote}</p>
          </div>
        </div>

        {progression.next && (
          <div>
            <div style={{ ...S.subHead, ...S.nextHead, marginTop: 0 }}>
              <ArtImage kind="level" k={progression.next.level} size={30} locked alt="" />
              <span>{t.nextLevel}: {progression.next[lang]}</span>
            </div>
            <div style={S.reqs}>
              {[
                { met: progression.solid(progression.next) >= progression.next.dims,
                  label: plural(t, "needDims", progression.next.dims)
                    .replace("{n}", progression.next.dims) },
                { met: progression.cases >= progression.next.cases,
                  label: plural(t, "needCases", progression.next.cases)
                    .replace("{n}", progression.next.cases) },
                ...(progression.next.brier != null ? [{
                  met: progression.brier != null && progression.brier <= progression.next.brier,
                  label: t.needCalib.replace("{t}",
                    decimal(progression.next.brier, lang)) }] : []),
              ].map((r, i) => (
                <div key={i} style={S.req}>
                  <span style={{ ...S.reqDot, background: r.met ? GOOD : "var(--line)" }} />
                  <span style={{ ...S.reqLabel, color: r.met ? TEXT : MUTED }}>{r.label}</span>
                  {r.met && <span style={S.reqDone}>{t.reached}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Fold id="tw-areas" action="area-levels" head={t.areaLevels} first
        count={`${reachedAreas}/${DIMS.length}`} open={!!open.areas}
        onToggle={() => toggle("areas")}
        strip={DIMS.map((dim) => (
          <ArtImage key={dim} kind="dim" k={dim} size={24}
            locked={(progression.tiers[dim] ?? 0) === 0} alt="" />))}>
        <div className="tw-marks" data-panel="area-levels">
          {DIMS.map((dim) => {
            const tier = progression.tiers[dim] ?? 0;
            return (
              <div key={dim} style={S.markRow} data-area={dim} data-area-tier={tier}>
                <ArtImage kind="dim" k={dim} size={44} locked={tier === 0} alt="" />
                <div>
                  <div style={{ ...S.markName, color: tier ? TEXT : MUTED }}>
                    {DIM_LABEL[lang][dim]}
                  </div>
                  <div style={{ ...S.markWhat, color: tier ? ACCENT : MUTED,
                                fontWeight: tier ? 600 : 400 }}>
                    {tier ? BADGE_TIERS[tier - 1][lang] : t.notYet}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ ...S.help, margin: "8px 0 10px" }}>{t.areaLevelsHelp}</p>
      </Fold>

      {marks.length > 0 && (
        <Fold id="tw-marks" action="marks" head={t.marksHead} count={tally(marks)}
          open={!!open.marks} onToggle={() => toggle("marks")} strip={strip(marks)}>
          <AwardRows t={t} lang={lang} list={marks} held={held} panel="marks" />
          <p style={{ ...S.help, margin: "8px 0 10px" }}>{t.marksHelp}</p>
        </Fold>
      )}

      {medals.length > 0 && (
        <Fold id="tw-medals" action="medals" head={t.medalsHead} count={tally(medals)}
          open={!!open.medals} onToggle={() => toggle("medals")} strip={strip(medals)}>
          {groups.map((g) => (
            <div key={g.code} data-medal-group={g.code}>
              <div style={S.groupHead}>{g.name}</div>
              <AwardRows t={t} lang={lang} list={g.awards} held={held} panel={`medals-${g.code}`} />
            </div>
          ))}
          <p style={{ ...S.help, margin: "8px 0 10px" }}>{t.medalsHelp}</p>
        </Fold>
      )}
      <p style={{ ...S.help, marginTop: 10 }}>{t.levelNote}</p>
    </section>
  );
}

/* One part of the badge folded into a line: its name, how much of it is held,
   its pictures in small. */
function Fold({ id, action, head, count, strip, open, onToggle, first = false, children }) {
  return (
    <div style={first ? S.titlesBox : S.marksBox}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id}
        data-action={action} className="tw-titles-btn" style={S.titlesToggle}>
        <span style={S.titlesHead}>{head}</span>
        <span style={S.titlesCount}>{count}</span>
        <span className="tw-titles-strip" style={S.titlesStrip} aria-hidden="true">{strip}</span>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"
          className="tw-chevron" data-open={open ? "1" : "0"}>
          <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="tw-fold" id={id} data-open={open ? "1" : "0"}>
        <div className="tw-fold-in">{children}</div>
      </div>
    </div>
  );
}

/* Marks or medals with what each asks for. One not held yet is shown in grey;
   one held says since when, and whether the administrators gave it. */
function AwardRows({ t, lang, list, held, panel }) {
  return (
    <div className="tw-marks" data-panel={panel}>
      {list.map((a) => {
        const mine = held.get(a.code);
        return (
          <div key={a.code} style={S.markRow} data-mark={a.code} data-held={mine ? "1" : "0"}>
            <AwardImage award={a} size={48} locked={!mine} alt="" />
            <div>
              <div style={{ ...S.markName, color: mine ? TEXT : MUTED }}>
                {a.name}{a.manual && !mine && <span style={S.handTag}>{t.handTag}</span>}
              </div>
              <div style={S.markWhat}>{a.what}</div>
              {mine && (
                <div style={S.markWhen} data-earned-at={mine.earned_at}>
                  {fill(t.earnedOn, { d: dateText(mine.earned_at, lang) })}
                  {mine.by_hand ? ` · ${t.byHand}` : ""}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------- cases --------------------------------- */

const STATUS_RANK = { half: 0, new: 1, done: 2, revealed: 2, voided: 3 };
const statusOf = (c) => (c.voided ? "voided" : c.attempted && !c.finished ? "half"
  : c.finished ? (c.revealed ? "revealed" : "done") : "new");

/* ------------------------------ solving limits ----------------------------- */

const SAMPLE_LIMITS = {
  enabled: true, exempt: false, can_start: true, reason: null, until: null,
  session: { open: false, opened_at: null, ends_at: null, started: 0, limit: 3, left: 3,
             minutes: 45 },
  week: { used: 2, limit: 10, resets_at: null }, cooldown_hours: 12,
};

/* A time of day as each language writes it: 18.40 in Turkish, 18:40 in English. */
function clock(iso, lang) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return lang === "tr" ? `${hh}.${mm}` : `${hh}:${mm}`;
}

/* When something opens: today or tomorrow by name, otherwise the date. The
   Turkish text follows a colon, so it starts with a capital. */
function whenText(iso, lang, t) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const gap = Math.round((day(d) - day(new Date())) / 86400000);
  const date = gap === 0 ? t.dayToday : gap === 1 ? t.dayTomorrow
    : d.toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "long" });
  const text = `${date} ${clock(iso, lang)}`;
  return lang === "tr" ? text.charAt(0).toLocaleUpperCase("tr-TR") + text.slice(1) : text;
}

function limitText(t, lang, limits) {
  const s = limits.session;
  if (limits.can_start) {
    return s.open ? fill(plural(t, "sessionOpen", s.left), { n: s.left, time: clock(s.ends_at, lang) })
      : fill(t.sessionIdle, { m: s.minutes, n: s.limit });
  }
  return {
    session_full: fill(t.sessionFull, { n: s.limit, when: whenText(limits.until, lang, t) }),
    cooldown: fill(t.sessionCooldown, { when: whenText(limits.until, lang, t) }),
    new_sign_in: t.sessionNewSignIn,
    weekly: fill(plural(t, "weeklyFull", limits.week.limit), { n: limits.week.limit }),
  }[limits.reason] ?? t.startBlocked;
}

async function signInAgain() {
  try { await auth.signOut(); } catch { /* going anyway */ }
  window.location.reload();
}

/* Where the person stands in the session and the week. Hidden when the
   limits are off or do not apply to this person. */
function SessionStrip({ t, lang, limits, offline }) {
  if (!limits || !limits.enabled || limits.exempt) return null;
  const waiting = !limits.can_start;
  return (
    <section style={{ ...S.session, ...(waiting ? S.sessionWait : null) }}
      data-panel="session" data-reason={limits.reason ?? "open"}>
      <div style={S.sessionHead}>
        <span><Icon name="clock" size={14} /> {t.sessionTitle}</span>
        <span style={S.sessionWeek}>
          {fill(t.weekUsage, { used: limits.week.used, limit: limits.week.limit })}
        </span>
      </div>
      <p style={S.sessionBody}>{limitText(t, lang, limits)}</p>
      {limits.reason === "new_sign_in" && !offline && (
        <button onClick={signInAgain} style={S.quiet} data-action="sign-in-again">
          {t.signInAgain}
        </button>
      )}
    </section>
  );
}

/* ------------------------------ problem reports ----------------------------- */

const REPORT_KINDS = ["answer_key", "source", "wording", "technical", "other"];

const SAMPLE_REPORTS = [
  { id: 3, case_key: "2026-W34-fabricated-citation", title: "Var Olmayan Kaynak",
    step_key: "st2", kind: "source", state: "fixed",
    created_at: "2026-10-12T10:20:00+03:00", closed_at: "2026-10-13T09:05:00+03:00",
    close_note: "Künyedeki cilt numarası düzeltildi, teşekkürler." },
];

/* The form a person fills in about a step or the case as a whole. */
function ReportForm({ t, caseKey, steps, current, offline, onClose }) {
  const [where, setWhere] = useState(current ?? "case");
  const [kind, setKind] = useState(null);
  const [body, setBody] = useState("");
  const [state, setState] = useState("idle");      // idle | sending | sent
  const [error, setError] = useState(null);
  const ready = kind && body.trim().length >= 5 && state === "idle";
  const send = async () => {
    if (offline) { setError(t.reportOffline); return; }
    setState("sending"); setError(null);
    try {
      await reports.send(caseKey, where === "case" ? null : where, kind, body.trim());
      setState("sent");
    } catch (e) {
      setState("idle");
      setError(e instanceof ApiError && e.code === "report_exists" ? t.reportExists
        : e instanceof ApiError && e.code === "report_limit" ? fill(t.reportLimit, { n: e.detail?.limit ?? 5 })
          : t.sendFailed);
    }
  };
  if (state === "sent") {
    return (
      <section style={{ ...S.card, ...S.reportCard }} data-panel="report" data-sent="1">
        <p style={{ ...S.body, margin: 0 }}>{t.reportSent}</p>
        <button onClick={onClose} style={{ ...S.quiet, marginTop: 12 }}>{t.backToCase}</button>
      </section>
    );
  }
  return (
    <section style={{ ...S.card, ...S.reportCard }} data-panel="report">
      <h2 style={S.reportTitle}><Icon name="flag" size={15} /> {t.reportTitle}</h2>
      <div style={S.subHead}>{t.reportWhere}</div>
      <div style={S.reportChips}>
        {[["case", t.reportWhole], ...steps.map((s, i) => [s, fill(t.reportStepN, { n: i + 1 })])]
          .map(([k, label]) => (
            <button key={k} onClick={() => setWhere(k)} aria-pressed={where === k}
              data-where={k} style={{ ...S.chip, ...(where === k ? S.chipOn : null) }}>
              {label}
            </button>
          ))}
      </div>
      <div style={S.subHead}>{t.reportAbout}</div>
      <div style={S.reportKinds}>
        {REPORT_KINDS.map((k) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} data-kind={k}
            style={{ ...S.reportKind, ...(kind === k ? S.reportKindOn : null) }}>
            {t.reportKinds[k]}
          </button>
        ))}
      </div>
      <label style={{ ...S.subHead, display: "block" }} htmlFor="report-body">{t.reportBody}</label>
      <textarea id="report-body" value={body} maxLength={1000} rows={4}
        onChange={(e) => setBody(e.target.value)} style={S.reportText}
        placeholder={t.reportHint} />
      {error && <div style={S.errorBox} role="alert">{error}</div>}
      <div style={S.reportActions}>
        <button onClick={send} disabled={!ready} data-action="send-report"
          style={{ ...S.primary, marginTop: 0, ...(ready ? null : S.disabled) }}>
          {state === "sending" ? t.sending : t.reportSend}
        </button>
        <button onClick={onClose} style={S.quiet}>{t.reportCancel}</button>
      </div>
    </section>
  );
}

/* The person's own reports, newest first, with what became of each. */
function MyReports({ t, lang, list }) {
  if (!list?.length) return null;
  return (
    <section style={S.card} data-panel="my-reports">
      <h2 style={S.cardTitle}>{t.myReports}</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {list.slice(0, 5).map((r) => (
          <div key={r.id} style={S.reportRow} data-report={r.id} data-state={r.state}>
            <div style={S.reportRowHead}>
              <span style={S.reportRowTitle}>{r.title}</span>
              <span style={{ ...S.status, ...(r.state === "fixed" ? S.status_done
                : r.state === "open" ? S.status_new : S.status_dismissed) }}>
                {t.reportStates[r.state]}
              </span>
            </div>
            <div style={S.reportRowMeta}>
              {t.reportKinds[r.kind]} · {shortDate(r.created_at, lang)}
            </div>
            {r.close_note && (
              <p style={S.reportNote}>
                <strong>{t.reportNote}:</strong> <span data-user-content>{r.close_note}</span>
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function CaseList({ t, lang, list, onStart, canStart = true, title }) {
  const [status, setStatus] = useState("all");
  const [area, setArea] = useState("");
  const [language, setLanguage] = useState("");
  const [limit, setLimit] = useState(12);
  useEffect(() => { setLimit(12); }, [status, area, language]);
  if (!list.length) return null;
  // Which languages a case comes in matters only once the list holds more than
  // one. A case with two versions is listed once, under both languages.
  const versionsOf = (c) => LANG_ORDER.filter((l) => (c.locales ?? [c.locale ?? "tr"]).includes(l));
  const langs = LANG_ORDER.filter((l) => list.some((c) => versionsOf(c).includes(l)));
  const mixed = langs.length > 1;

  const ranked = list.map((c, i) => ({ c, i, s: statusOf(c) }))
    .sort((x, y) => (STATUS_RANK[x.s] - STATUS_RANK[y.s])
      || ((y.c.type === "weekly") - (x.c.type === "weekly")) || (x.i - y.i));
  const count = (k) => ranked.filter((r) => k === "all" || r.s === k
    || (k === "done" && r.s === "revealed")).length;
  const shown = ranked.filter((r) =>
    (status === "all" || r.s === status || (status === "done" && r.s === "revealed"))
    && (!area || r.c.dims.includes(area))
    && (!language || versionsOf(r.c).includes(language)));
  const filters = [["all", t.filterAll], ["new", t.filterNew], ["half", t.filterHalf],
                   ["done", t.filterDone], ["revealed", t.filterRevealed]];
  return (
    <section style={S.casesSection} data-panel="cases">
      <div style={S.casesHead}>
        <h2 style={S.casesTitle}>{title ?? t.casesHead}</h2>
        <span style={S.casesCount}>{list.length}</span>
      </div>
      <div style={S.filters}>
        {filters.map(([k, label]) => (k === "all" || count(k) > 0) && (
          <button key={k} onClick={() => setStatus(k)} aria-pressed={status === k}
            style={{ ...S.chip, ...(status === k ? S.chipOn : null) }}>
            {label} <span style={S.chipN}>{count(k)}</span>
          </button>
        ))}
        <select value={area} onChange={(e) => setArea(e.target.value)} style={S.areaSelect}
          aria-label={t.allAreas}>
          <option value="">{t.allAreas}</option>
          {DIMS.map((d) => <option key={d} value={d}>{DIM_LABEL[lang][d]}</option>)}
        </select>
        {mixed && (
          <select value={language} onChange={(e) => setLanguage(e.target.value)}
            style={S.areaSelect} aria-label={t.allLangs} data-filter="language">
            <option value="">{t.allLangs}</option>
            {langs.map((l) => <option key={l} value={l}>{t.langNames[l]}</option>)}
          </select>
        )}
      </div>
      <div className="case-grid">
        {shown.slice(0, limit).map(({ c, s }) => {
          const locked = !canStart && s === "new";
          return (
          <button key={c.key} onClick={() => onStart(c)} className="case-row"
            data-case={c.key} disabled={locked} data-locked={locked || undefined}
            style={{ ...S.caseRow, ...(locked ? S.caseLocked : null) }}>
            <span style={S.caseGlyph}>
              {c.dims[0] && <Glyph dim={c.dims[0]} size={18} colour={ACCENT} />}
            </span>
            <span style={S.caseMain}>
              {c.type !== "open" && (
                <span style={S.caseKind}>{c.type === "weekly" ? t.weekly : t.core}</span>
              )}
              <span style={S.caseTitle} lang={c.locale}>{c.title[lang]}</span>
              <span style={S.caseMeta}>
                {mixed && (() => {
                  const vs = versionsOf(c);
                  const label = fill(vs.length > 1 ? t.caseLangs : t.caseIn,
                                     { l: vs.map((l) => t.langNames[l] ?? l).join(", ") });
                  return (
                    <span style={S.langBadge} data-case-lang={vs.join(" ")}
                      title={label} aria-label={label}>
                      {vs.map((l) => l.toUpperCase()).join(" · ")}
                    </span>
                  );
                })()}
                {c.minutes ? <span>{c.minutes} {t.minutes}</span> : null}
                <span>{c.stepCount ?? 0} {plural(t, "steps", c.stepCount ?? 0)}</span>
              </span>
            </span>
            <span style={{ ...S.status, ...S[`status_${s}`] }}>
              {locked ? t.lockedShort : { new: t.newShort, half: t.resume, done: t.doneShort,
                                          revealed: t.revealedShort, voided: t.voidedShort }[s]}
            </span>
          </button>
          );
        })}
      </div>
      {shown.length === 0 && <p style={S.help}>{t.nothingHere}</p>}
      {shown.length > limit && (
        <button onClick={() => setLimit((n) => n + 24)} style={S.more2} data-action="more-cases">
          {t.showMore} ({shown.length - limit})
        </button>
      )}
    </section>
  );
}

/* The door, in three short screens: an address, a code, then the profile. The
   code admits. What the person writes about themselves goes to an
   administrator before anyone else sees it, and nobody waits behind that. */
function Join({ t, lang, setLang, embedded, onDone, suspended: suspendedAtStart, themePref, onTheme }) {
  const [stage, setStage] = useState(suspendedAtStart ? "suspended" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // Read after the code lands: a returning person gets their fields back
  // filled in, and the title is only asked for when the role warrants it.
  const [profile, setProfile] = useState(null);
  const [suspension, setSuspension] = useState(suspendedAtStart ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // What the centre has announced to everyone. Without it the page is the
  // same page, so a failure is not shown.
  const [notices, setNotices] = useState([]);
  // Whether this server has a demo to offer, and whether the campus can be
  // seen without signing in.
  const [demoOpen, setDemoOpen] = useState(false);
  const [campusOpen, setCampusOpen] = useState(false);
  useEffect(() => {
    let off = false;
    news.landing().then((r) => {
      if (off) return;
      setNotices(r?.announcements ?? []);
      setDemoOpen(r?.demo === true);
      setCampusOpen(r?.visitors?.campus === true);
    }).catch(() => {});
    return () => { off = true; };
  }, []);

  const send = async () => {
    const problem = addressProblem(email.trim().toLowerCase(), t);
    if (problem) { setError(problem); return; }
    setError(null); setBusy(true);
    try {
      await auth.requestCode(email.trim().toLowerCase(), lang);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setError(t.tooManyCodes); setBusy(false);
        return;
      }
      /* offline: the code stage opens on the sample */
    }
    await mockDelay();
    setBusy(false); setStage("code");
  };

  /* The profile is filled in after the code, which is checked the moment it is
     typed, so the code cannot expire while the form is filled in. */
  const check = async () => {
    if (!/^\d{6}$/.test(code)) { setError(t.badCode); return; }
    setError(null); setBusy(true);
    try {
      // The language on screen, and whether the person picked it here.
      await auth.verify(email.trim().toLowerCase(), code,
                        { locale: lang, locale_chosen: pickedThisVisit() });
      setProfile(await me.profile());
    } catch (e) {
      if (e instanceof ApiError && e.code === "suspended") {
        setSuspension(e.detail ?? null); setBusy(false); setStage("suspended");
        return;
      }
      if (e instanceof ApiError && e.status === 401) {
        setError(t.badCode); setBusy(false);
        return;
      }
      /* offline: the form opens empty */
    }
    await mockDelay();
    setBusy(false); setStage("profile");
  };

  const opening = stage === "email" || stage === "code";
  const card = (
    <section style={S.card} className="landing-card" data-panel="sign-in">
      {opening && <h2 style={S.signInHead}>{t.signInHead}</h2>}
      {opening && <p style={S.body}>{t.joinLede}</p>}

      {stage === "email" && (
        <>
          <div style={S.confLabel}><Icon name="mail" size={14} /> {t.email}</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            type="email" inputMode="email" autoComplete="email"
            placeholder={t.emailExample} style={S.input} />
          <p style={S.help}>{t.emailHint}</p>
          {error && <div style={S.errorBox} role="alert">{error}</div>}
          <button onClick={send} disabled={busy || !email.trim()}
            style={{ ...S.primary, ...(busy || !email.trim() ? S.disabled : null) }}>
            {busy ? t.sending : t.sendCode}
          </button>
        </>
      )}

      {stage === "code" && (
        <>
          <p style={S.sent}>{t.codeSent.replace("{email}", email.trim().toLowerCase())}</p>
          <div style={S.confLabel}><Icon name="key" size={14} /> {t.code}</div>
          <input value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" placeholder="000000"
            style={{ ...S.input, fontFamily: MONO, fontSize: 22, letterSpacing: ".3em",
                     textAlign: "center" }} />
          <p style={S.help}>{t.codeHint}</p>
          {error && <div style={S.errorBox} role="alert">{error}</div>}
          <button onClick={check} disabled={busy || code.length < 6}
            style={{ ...S.primary, ...(busy || code.length < 6 ? S.disabled : null) }}>
            {busy ? t.sending : t.verify}
          </button>
        </>
      )}

      {stage === "profile" && (
        <ProfileForm t={t} lang={lang} profile={profile} setProfile={setProfile} door
          afterSave={(outcome) => {
            // In use at once, or nothing to wait for: straight in. A change that
            // waits for approval is said so first.
            if (["applied", "unchanged", "waiting"].includes(outcome)) onDone();
          }}
          onContinue={onDone} />
      )}

      {stage === "suspended" && <SuspendedBody t={t} lang={lang} info={suspension} />}
    </section>
  );

  return (
    <div className={opening ? "door door-landing" : "door"} style={S.join}>
      <div style={S.joinHead}>
        {opening ? (
          <img src={LOGO_AIARC} alt="SDÜ AIARC" style={{ ...S.joinMark, marginBottom: 0 }} />
        ) : (
          <div>
            <img src={LOGO_AIARC} alt="SDÜ AIARC" style={S.joinMark} />
            <h1 style={S.h1}>{t.joinTitle}</h1>
          </div>
        )}
        {!embedded && (
          <span style={S.doorTools}>
            {onTheme && <ThemeSwitch pref={themePref} onPref={onTheme} lang={lang} />}
            <LangSwitch lang={lang} setLang={setLang} />
          </span>
        )}
      </div>

      {opening ? (
        <div className="landing" data-screen="landing">
          <div className="landing-intro">
            <h1 style={S.landingTitle}>{t.joinTitle}</h1>
            <p style={S.landingSub}>{t.landingSub}</p>
            <p style={S.landingLede}>{t.landingLede}</p>
            <Training t={t} />
            <p style={S.aboutLine}>
              <a href="#hakkinda" style={S.aboutLink} data-action="about">{t.aboutLink}</a>
              <a href="#hakkinda/rehber" style={S.aboutLink} data-action="guide">{t.guideLink}</a>
            </p>
            {campusOpen && (
              <p style={S.demoLine}>
                <a href="#kampus" style={S.campusButton} data-action="visit-campus">
                  <span aria-hidden="true" style={S.campusIcon}>🗺️</span>{t.campusButton}
                </a>
                <span style={S.demoHint}>{t.campusHint}</span>
              </p>
            )}
            {demoOpen && (
              <p style={S.demoLine}>
                <a href="demo/" style={S.demoButton} data-action="demo">{t.demoButton}</a>
                <span style={S.demoHint}>{t.demoHint}</span>
              </p>
            )}
            {notices.length > 0 && <News t={t} lang={lang} list={notices} />}
          </div>
          {card}
        </div>
      ) : card}

      {!embedded && <Colophon lang={lang} />}
    </div>
  );
}

/* The university's AI literacy training, recommended before the first case. */
function Training({ t }) {
  return (
    <section style={S.training} data-panel="training">
      <div style={S.trainingHead}>
        <span aria-hidden="true" style={S.campusIcon}>🎓</span>{t.trainingHead}
      </div>
      <p style={S.trainingText}>{t.trainingText}</p>
      <a href={TRAINING_URL} target="_blank" rel="noopener noreferrer" style={S.trainingLink}
        data-action="training">{t.trainingLink}<span aria-hidden="true"> ↗</span></a>
    </section>
  );
}

/* Units in two steps: a faculty, school or directorate, then its department
   where it has any. Without a server the sample list stands in, one step deep. */
function unitChoicesOf(profile) {
  const raw = profile?.unit_choices
    ?? (profile?.units ?? UNITS).map((u) => ({ id: u.id, name: u.name, selectable: true,
                                               children: [] }));
  const byName = (a, b) => a.name.localeCompare(b.name, "tr");
  return raw.map((u) => ({ ...u, children: [...(u.children ?? [])].sort(byName) }))
            .sort(byName);
}

function splitUnit(choices, unitId) {
  for (const f of choices) {
    if (f.id === unitId) return [String(f.id), ""];
    const d = f.children.find((c) => c.id === unitId);
    if (d) return [String(f.id), String(d.id)];
  }
  return ["", ""];
}

/* Where the profile stands: approved, waiting, or turned down with a reason. */
function ProfileStatus({ t, profile, onWithdraw, busy }) {
  if (!profile) return null;
  const waiting = profile.pending;
  if (waiting && !waiting.first) {
    return (
      <div style={S.waitBox} data-status="pending" role="status">
        {t.stPending.replace("{fields}",
          (waiting.fields ?? []).map((f) => t.fieldNames[f] ?? f).join(", "))}
        <div>
          <button onClick={onWithdraw} disabled={busy} style={S.quietSmall}
            data-action="withdraw">{t.stWithdraw}</button>
        </div>
      </div>
    );
  }
  if (waiting) {
    const roleWaits = waiting.role && waiting.role !== profile.role;
    return (
      <div style={S.waitBox} data-status="first" role="status">
        {t.stFirst}{roleWaits && <> {t.stRoleWaits}</>}
      </div>
    );
  }
  if (profile.decision?.by_admin) {
    return (
      <div style={S.editedBox} data-status="edited" role="status">
        <div style={S.editedHead}>
          {t.stEdited.replace("{fields}",
            (profile.decision.fields ?? []).map((f) => t.fieldNames[f] ?? f).join(", "))}
        </div>
        {profile.decision.closed_waiting && <div>{t.stEditedClosed}</div>}
        {profile.decision.reason && (
          <div>{t.stReason}: <q data-user-content>{profile.decision.reason}</q></div>
        )}
      </div>
    );
  }
  if (profile.decision?.state === "rejected") {
    return (
      <div style={S.rejectBox} data-status="rejected" role="status">
        <div style={S.rejectHead}>{t.stRejected}</div>
        {profile.decision.reason && (
          <div>{t.stReason}: <q data-user-content>{profile.decision.reason}</q></div>
        )}
      </div>
    );
  }
  if (profile.approved) {
    return (
      <div style={S.okLine} data-status="approved">
        <Icon name="check" size={14} /> {t.stApproved}
      </div>
    );
  }
  return null;
}

/* The profile as the person fills it in: at the door after the code, and later
   on the profile screen. Name, title, username, unit and biography wait for
   approval once the profile has been approved. The avatar and the board switch
   change at once, because neither carries anything the person wrote. */
function ProfileForm({ t, lang, profile, setProfile, door, afterSave, onContinue, onLive }) {
  const staff = Boolean(profile?.role && profile.role !== "student");
  const choices = useMemo(() => unitChoicesOf(profile), [profile]);
  const bioMax = profile?.bio_max ?? 160;

  const [given, setGiven] = useState("");
  const [family, setFamily] = useState("");
  const [username, setUsername] = useState("");
  const [title, setTitle] = useState("");
  const [staffRole, setStaffRole] = useState("academic");
  const [faculty, setFaculty] = useState("");
  const [dept, setDept] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [optIn, setOptIn] = useState(false);
  const [seenOutside, setSeenOutside] = useState(false);
  const [gallery, setGallery] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);        // { field, text }
  const [notice, setNotice] = useState(null);      // what the last save did

  /* The fields show what the person last sent: a change that is waiting, or
     the profile in use. */
  const fill = (p) => {
    const src = p?.pending ?? p ?? {};
    setGiven(src.given_name ?? "");
    setFamily(src.family_name ?? "");
    setUsername(src.username ?? "");
    setTitle(src.title ?? "");
    setStaffRole(src.role === "admin_staff" ? "admin_staff" : "academic");
    const [f, d] = splitUnit(unitChoicesOf(p), src.unit_id);
    setFaculty(f); setDept(d);
    setBio(src.bio ?? "");
    setAvatar(p?.avatar ?? null);
    setOptIn(Boolean(p?.board_opt_in));
    setSeenOutside(Boolean(p?.board_public));
  };

  useEffect(() => { fill(profile); }, []);
  useEffect(() => {
    let off = false;
    avatarList().then((list) => { if (!off) setGallery(list); });
    return () => { off = true; };
  }, []);

  const facultyRow = choices.find((f) => String(f.id) === faculty) ?? null;
  const needsDept = Boolean(facultyRow && facultyRow.children.length && !facultyRow.selectable);
  const unitId = facultyRow
    ? (dept ? Number(dept) : (needsDept ? null : facultyRow.id))
    : null;
  const ready = given.trim() && family.trim() && username.length >= 3 && unitId;
  const label = `${given} ${family}`.trim() || username;

  const fieldError = (field) => error?.field === field && (
    <div style={S.fieldError} role="alert" data-error={field}>{error.text}</div>
  );

  const pickAvatar = async (code) => {
    setAvatar(code);
    try { await me.setAvatar(code); onLive?.(); } catch { /* kept on screen */ }
  };

  const toggleBoard = async () => {
    const next = !optIn;
    const outside = seenOutside;
    setOptIn(next);
    // Leaving the ranking also ends being on it for visitors.
    if (!next) setSeenOutside(false);
    try { await me.setBoard(next); onLive?.(); }
    catch { setOptIn(!next); setSeenOutside(outside); }
  };

  const toggleOutside = async () => {
    const next = !seenOutside;
    setSeenOutside(next);
    try { await me.setBoardPublic(next); } catch { setSeenOutside(!next); }
  };

  const withdraw = async () => {
    setBusy(true); setError(null);
    try {
      const view = await me.withdraw();
      const merged = { ...profile, ...view };
      setProfile(merged); fill(merged); setNotice("withdrawn");
    } catch (e) {
      setError({ field: null, text: e?.message || t.saveFailed });
    } finally { setBusy(false); }
  };

  const save = async () => {
    setError(null); setNotice(null); setBusy(true);
    try {
      const view = await me.declare({
        given_name: given.trim(),
        family_name: family.trim(),
        username: username.trim(),
        unit_id: unitId,
        bio: bio.trim() || null,
        ...(staff ? { title: title || null, staff_role: staffRole } : {}),
      });
      const merged = { ...profile, ...view };
      setProfile(merged); fill(merged);
      setNotice(view?.outcome ?? "applied");
      setBusy(false);
      afterSave?.(view?.outcome ?? "applied");
    } catch (e) {
      const d = e?.detail;
      if (e?.status === 400 && d?.field) {
        setError({ field: d.field, text: t.fieldErrors[d.reason ?? d.code] ?? d.message ?? t.saveFailed });
      } else if (e?.status === 409) {
        setError({ field: "username", text: e.message });
      } else {
        setError({ field: null, text: (typeof e?.message === "string" && e.message) || t.saveFailed });
      }
      setBusy(false);
    }
  };

  const noticeText = notice && {
    applied: t.outApplied, pending: t.outPending, withdrawn: t.outWithdrawn,
    unchanged: t.outUnchanged, waiting: t.outWaiting, role_waits: t.outRoleWaits,
  }[notice];

  return (
    <div data-form="profile">
      {door && <p style={S.body}>{profile?.complete ? t.profileEdit : t.profileNew}</p>}
      <ProfileStatus t={t} profile={profile} onWithdraw={withdraw} busy={busy} />

      <div style={S.profileTop}>
        <Avatar code={avatar} label={label} size={60} />
        <div style={{ minWidth: 0 }}>
          <div style={S.profileName}>{`${given} ${family}`.trim() || " "}</div>
          <div style={S.profileHandle}>{username ? `@${username}` : " "}</div>
        </div>
      </div>

      {gallery.length > 0 && (
        <>
          <div style={S.confLabel}>{t.avatarLabel}</div>
          <div style={S.avatarGrid} role="radiogroup" aria-label={t.avatarLabel}>
            <button type="button" role="radio" aria-checked={!avatar} title={t.avatarNone}
              aria-label={t.avatarNone} onClick={() => pickAvatar(null)} data-pick="none"
              style={{ ...S.avatarPick, ...(!avatar ? S.avatarPickOn : null) }}>
              <Avatar label={label} size={44} />
            </button>
            {gallery.map((code) => (
              <button key={code} type="button" role="radio" aria-checked={avatar === code}
                title={avatarName(code, lang)} aria-label={avatarName(code, lang)}
                onClick={() => pickAvatar(code)} data-pick={code}
                style={{ ...S.avatarPick, ...(avatar === code ? S.avatarPickOn : null) }}>
                <Avatar code={code} label={label} size={44} />
              </button>
            ))}
          </div>
          <p style={S.help}>{t.avatarHelp}</p>
        </>
      )}

      <div style={S.nameRow}>
        <label style={S.nameField}>
          <span style={S.confLabel}><Icon name="person" size={14} /> {t.givenName}</span>
          <input value={given} onChange={(e) => setGiven(e.target.value)}
            autoComplete="given-name" maxLength={60} style={S.input} />
          {fieldError("given_name")}
        </label>
        <label style={S.nameField}>
          <span style={S.confLabel}>{t.familyName}</span>
          <input value={family} onChange={(e) => setFamily(e.target.value)}
            autoComplete="family-name" maxLength={60} style={S.input} />
          {fieldError("family_name")}
        </label>
      </div>

      {/* Asked only where it means something: a student has no academic title. */}
      {staff && (
        <>
          <div style={S.confLabel}>{t.staffKind}</div>
          <div style={S.confRow} role="radiogroup" aria-label={t.staffKind}>
            {[["academic", t.staffAcademic], ["admin_staff", t.staffAdmin]].map(([key, text]) => (
              <button key={key} type="button" role="radio" aria-checked={staffRole === key}
                onClick={() => { setStaffRole(key); if (key === "academic" && title === "idari") setTitle(""); }}
                data-staff={key}
                style={{ ...S.confBtn, ...(staffRole === key ? S.confOn : null) }}>{text}</button>
            ))}
          </div>
          {profile?.complete && <p style={S.help} data-help="staff-role">{t.staffKindHelp}</p>}
          <div style={S.confLabel}>{t.titleLabel}</div>
          <select value={title} style={S.input} data-field="title"
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value === "idari") setStaffRole("admin_staff");
            }}>
            <option value="">{t.noTitle}</option>
            {(profile?.titles ?? []).map((x) => (
              <option key={x.code} value={x.code}>
                {lang === "tr" ? x.label_tr : x.label_en}
              </option>
            ))}
          </select>
        </>
      )}

      <div style={S.confLabel}>{t.usernameLabel}</div>
      <input value={username} autoComplete="username"
        onChange={(e) => setUsername(
          e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+/, "")
            .slice(0, 24))}
        placeholder={t.usernameExample} style={{ ...S.input, fontFamily: MONO }} />
      {fieldError("username")}
      <p style={S.help}>{t.usernameHint}</p>

      <div style={S.confLabel}><Icon name="unit" size={14} /> {t.unitLabel}</div>
      <select value={faculty} style={S.input} data-unit="faculty"
        onChange={(e) => { setFaculty(e.target.value); setDept(""); }}>
        <option value="">{t.pickUnit}</option>
        {choices.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      {facultyRow && facultyRow.children.length > 0 && (
        <>
          <div style={S.confLabel}>{t.deptLabel}</div>
          <select value={dept} onChange={(e) => setDept(e.target.value)} style={S.input}
            data-unit="department">
            <option value="">{t.pickDept}</option>
            {facultyRow.children.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </>
      )}
      {fieldError("unit_id")}

      <div style={S.confLabel}>{t.bioLabel}</div>
      <textarea value={bio} rows={3} maxLength={bioMax} data-field="bio"
        onChange={(e) => setBio(e.target.value.replace(/\s*\n\s*/g, " ").slice(0, bioMax))}
        style={{ ...S.input, ...S.bioInput }} />
      <div style={S.bioMeta}>
        <span>{t.bioHint}</span>
        <span style={S.bioCount}>{bio.length}/{bioMax}</span>
      </div>
      {fieldError("bio")}

      {profile?.board_excluded ? (
        <p style={S.help} data-field="board-excluded">{t.boardExcluded}</p>
      ) : (
        <>
          <label style={S.toggleRow}>
            <input type="checkbox" checked={optIn} onChange={toggleBoard} data-field="board" />
            <span>
              <span style={S.toggleLabel}>{t.boardLabel}</span>
              <span style={S.toggleHelp}>{t.boardHelp}</span>
            </span>
          </label>
          {/* A choice of its own: agreeing to the ranking inside the platform
              is not agreeing to be seen from outside it. */}
          {optIn && (
            <label style={{ ...S.toggleRow, ...S.toggleNested }}>
              <input type="checkbox" checked={seenOutside} onChange={toggleOutside}
                data-field="board-public" />
              <span>
                <span style={S.toggleLabel}>{t.boardPublicLabel}</span>
                <span style={S.toggleHelp} data-board-public={profile?.board_public_open ? "open" : "closed"}>
                  {profile?.board_public_open ? t.boardPublicOpen : t.boardPublicClosed}
                </span>
              </span>
            </label>
          )}
        </>
      )}

      {door && <p style={S.help}>{t.joinNote}</p>}
      {error && !["given_name", "family_name", "username", "unit_id", "bio"].includes(error.field) && (
        <div style={S.errorBox} role="alert">{error.text}</div>
      )}
      {noticeText && (
        <div style={S.sent} role="status" data-outcome={notice}>{noticeText}</div>
      )}

      {notice && onContinue && (["pending", "withdrawn", "role_waits"].includes(notice)) ? (
        <button onClick={onContinue} style={S.primary}>{t.goOn}</button>
      ) : (
        <>
          <button onClick={save} disabled={busy || !ready}
            style={{ ...S.primary, ...(busy || !ready ? S.disabled : null) }}>
            {busy ? t.sending : door ? (profile?.complete ? t.saveProfile : t.joinFinish) : t.saveOnly}
          </button>
          {/* A profile already in use need not be sent again to get in. */}
          {door && profile?.complete && onContinue && (
            <button onClick={onContinue} disabled={busy} style={S.skipButton}
              data-action="skip-save">{t.skipSave}</button>
          )}
        </>
      )}
    </div>
  );
}

function SuspendedBody({ t, lang, info }) {
  const until = info?.until ? new Date(info.until) : null;
  const when = until && !Number.isNaN(until.getTime())
    ? until.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB",
                           { dateStyle: "long", timeStyle: "short" })
    : null;
  return (
    <div data-screen="suspended">
      <h2 style={S.h2}>{t.suspTitle}</h2>
      <p style={S.body}>{when ? t.suspUntil.replace("{date}", when) : t.suspOpen}</p>
      {info?.reason && (
        <div style={S.suspReason}>
          <div style={S.suspReasonCap}>{t.suspReason}</div>
          <p style={S.suspReasonText} data-user-content>{info.reason}</p>
        </div>
      )}
      <p style={S.help}>{t.suspHelp}</p>
    </div>
  );
}

/* Shown by the shell when a signed-in person turns out to be suspended. */
export function SuspendedNotice({ lang = "tr", info, onSignOut }) {
  const t = T[lang] ?? T.tr;
  return (
    <div lang={lang} style={S.root}>
      <style>{CSS}</style>
      <div className="door" style={S.join}>
        <div style={S.joinHead}>
          <div>
            <img src={LOGO_AIARC} alt="SDÜ AIARC" style={S.joinMark} />
            <h1 style={S.h1}>{t.joinTitle}</h1>
          </div>
        </div>
        <section style={S.card}>
          <SuspendedBody t={t} lang={lang} info={info} />
          {onSignOut && <button onClick={onSignOut} style={S.primary}>{t.signOut}</button>}
        </section>
      </div>
    </div>
  );
}

/* The profile, inside the application. On a phone this is also where the
   language is chosen and where signing out lives. */
export function ProfileScreen({ lang: hostLang, onLang, onChanged, onSignOut, themePref, onTheme }) {
  const lang = hostLang ?? "tr";
  const t = T[lang] ?? T.tr;
  const [profile, setProfile] = useState(undefined);
  useEffect(() => {
    let off = false;
    me.profile().then((p) => { if (!off) setProfile(p); })
                .catch(() => { if (!off) setProfile(null); });
    return () => { off = true; };
  }, []);
  return (
    <div lang={lang} style={S.root}>
      <style>{CSS}</style>
      <div className="door" data-screen="profile">
        <div style={S.header}>
          <div>
            <h1 style={S.h1}>{t.profileTitle}</h1>
            <p style={S.lede}>{t.profileLede}</p>
          </div>
        </div>
        {onLang && (
          <div className="phone-only" style={S.langRow} data-panel="language">
            <span style={S.langLabel}>{t.langLabel}</span>
            <LangSwitch lang={lang} setLang={onLang} />
          </div>
        )}
        {onTheme && (
          <div className="phone-only" style={S.langRow} data-panel="appearance">
            <span style={S.langLabel}>{t.themeLabel}</span>
            <ThemeSwitch pref={themePref} onPref={onTheme} lang={lang} />
          </div>
        )}
        {onTheme && (
          <div className="phone-only" style={S.langRow} data-panel="guide-link">
            <a href="#hakkinda/rehber" style={S.aboutLink} data-action="guide">{t.guideOpen}</a>
          </div>
        )}
        <section style={S.card}>
          {profile === undefined && <p style={S.help}>{t.loading}</p>}
          {profile === null && <div style={S.errorBox} role="alert">{t.profileFailed}</div>}
          {profile && (
            <ProfileForm t={t} lang={lang} profile={profile} setProfile={setProfile}
              afterSave={() => onChanged?.()} onLive={onChanged} />
          )}
        </section>
        {profile && <CaseLanguages t={t} lang={lang} />}
        {onSignOut && (
          <button onClick={onSignOut} style={S.more2} data-action="sign-out">{t.signOut}</button>
        )}
      </div>
    </div>
  );
}

/* Which languages a person is offered cases in. Until they choose, it follows
   the interface, so it is read again when the interface changes language. */
function CaseLanguages({ t, lang }) {
  const [state, setState] = useState(undefined);   // { locales, set } | null
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let off = false;
    me.get().then((m) => {
      if (!off) setState({ locales: m.case_locales ?? ["tr"], set: !!m.case_locales_set });
    }).catch(() => { if (!off) setState(null); });
    return () => { off = true; };
  }, [lang]);
  if (!state) return null;
  const current = state.locales.length > 1 ? "both" : state.locales[0];
  const choose = async (value) => {
    setBusy(true); setNote(null);
    try {
      const r = await me.setCaseLocales(value === "both" ? ["tr", "en"] : [value]);
      setState({ locales: r.case_locales, set: r.case_locales_set });
      setNote({ ok: true, text: t.caseLangSaved });
    } catch {
      setNote({ ok: false, text: t.caseLangFailed });
    } finally {
      setBusy(false);
    }
  };
  const options = [["tr", t.langNames.tr], ["en", t.langNames.en], ["both", t.caseLangBoth]];
  return (
    <section style={S.card} data-panel="case-language">
      <h2 style={S.h2}>{t.caseLangHead}</h2>
      <p style={S.help}>{t.caseLangLede}</p>
      <div style={S.filters} role="radiogroup" aria-label={t.caseLangHead}>
        {options.map(([value, label]) => (
          <button key={value} role="radio" aria-checked={current === value} disabled={busy}
            data-case-locales={value} onClick={() => current !== value || !state.set
              ? choose(value) : null}
            style={{ ...S.chip, ...(current === value ? S.chipOn : null) }}>
            {label}
          </button>
        ))}
      </div>
      {!state.set && <p style={{ ...S.help, marginBottom: 0 }}>{t.caseLangAuto}</p>}
      {note && (
        <p role="status" style={{ ...S.help, marginBottom: 0, color: note.ok ? GOOD : ACCENT }}>
          {note.text}
        </p>
      )}
    </section>
  );
}

const BADGE_DIMS = [
  { key: "verification",  tr: "Doğrulama",        en: "Verification",   glyph: "lens" },
  { key: "privacy",       tr: "Mahremiyet",       en: "Privacy",        glyph: "keyhole" },
  { key: "prompt_design", tr: "İstem Tasarımı",   en: "Prompt Design",  glyph: "brief" },
  { key: "integrity",     tr: "Atıf",             en: "Citation",       glyph: "cite" },
  { key: "manipulation",  tr: "Manipülasyon",     en: "Manipulation",   glyph: "level" },
  { key: "op_security",   tr: "Kurumsal Güvenlik",en: "Institutional",  glyph: "lock" },
  { key: "boundaries",    tr: "Sınırlar",         en: "Limits",         glyph: "edge" },
];

/* A tier is a claim about ability, so it needs both a θ and enough attempts for
   that θ to be more than noise. At roughly one step per dimension per week the
   top tier is about a year away. */
const BADGE_TIERS = [
  { tier: 1, theta: 1.2, attempts: 10, tr: "Temel",  en: "Basic" },
  { tier: 2, theta: 1.8, attempts: 25, tr: "Sağlam", en: "Solid" },
  { tier: 3, theta: 2.4, attempts: 50, tr: "Usta",   en: "Expert" },
];

function tierFor(theta, attempts) {
  let t = 0;
  for (const r of BADGE_TIERS) if (theta >= r.theta && attempts >= r.attempts) t = r.tier;
  return t;
}

/* One medal of a group, as the end of a case names it. */
const MEDAL_ONE = {
  tr: { super: "Süper Madalya", mega: "Mega Madalya", ultra: "Ultra Madalya" },
  en: { super: "Super Medal", mega: "Mega Medal", ultra: "Ultra Medal" },
};

/* What the badge shows without a server: the platform's own marks, a medal
   in each group as an administrator might add them, and a few of them held. */
const SAMPLE_MEDALS = [
  { code: "award-1", category: "super", tr: "On Vaka", en: "Ten Cases",
    trWhat: "On vaka bitirmek.", enWhat: "Finish ten cases." },
  { code: "award-2", category: "mega", tr: "Üç Alanda Temel", en: "Basic in Three Areas",
    trWhat: "Üç alanda Temel seviyeye ulaşmak.", enWhat: "Reach the Basic level in three areas." },
  { code: "award-3", category: "ultra", tr: "Zirve", en: "Summit",
    trWhat: "Yetkin seviyesine (4. seviye) ulaşmak.", enWhat: "Reach the Capable level (level 4)." },
];

function sampleBook(lang) {
  const en = lang === "en";
  return {
    categories: AWARD_GROUPS.map((g) => ({ code: g.code, name: en ? g.en : g.tr })),
    awards: [...PLATFORM_MARKS.map((m) => platformMark(m, lang)),
             ...SAMPLE_MEDALS.map((m) => ({ ...platformMark(m, lang), category: m.category,
                                            built_in: false }))],
    mine: [{ code: "honest_doubt", earned_at: "2026-09-18T10:20:00Z", by_hand: false },
           { code: "award-1", earned_at: "2026-10-02T14:05:00Z", by_hand: false }],
  };
}

function BadgeGlyph({ name }) {
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

/* The icon set.
 *
 * Colour emoji, readable at a glance. They are set at a fixed size with an
 * explicit emoji font stack so a Linux desktop, a Mac and an Android phone all
 * draw the same colour glyph.
 *
 * The badge has its own pictures (badgeArt.jsx). Everywhere else (case cards,
 * tabs, step kinds, the sign-in fields) these are what a student recognises
 * without reading. */
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",' +
                   '"Twemoji Mozilla","EmojiOne Color",sans-serif';

const ICONS = {
  weekly: "📅", core: "📘", play: "▶️", file: "📎", flag: "🚩",
  spark: "✨", check: "✅", trophy: "🏆", scales: "⚖️", target: "🎯",
  clock: "⏱️", steps: "🧩", mail: "✉️", key: "🔑", person: "👤", seal: "🔏",
  unit: "🏛️", publish: "📣", chart: "📊", brief: "✍️", lock: "🛡️",
  lens: "🔍",
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

const DIM_ICON = {
  verification: "lens", privacy: "keyhole", prompt_design: "brief",
  integrity: "cite", manipulation: "level", op_security: "lock",
  boundaries: "edge",
};

/* ---------------------------------------------------------------------------
   Institutional marks.

   Embedded, so each screen ships as one file that can be dropped into any
   host. Both are quantised to a few kilobytes; they are two-ink marks, so the
   small palette costs nothing visible.

   The wordmark has a transparent background, so it sits directly on the page.
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

/* ------------------------------- case runner ------------------------------ */

/* A case runs against two calls, start and submit, that answer in the server's
   shape. With a server they go to the API. Without one, localRunner answers
   from the sample cases in this file, so the screen can still be reviewed. */

function serverRunner(caseKey) {
  let attemptId = null;
  return {
    async start(locale) {
      const r = await cases.start(caseKey, locale);
      attemptId = r?.attempt_id ?? null;
      return r;
    },
    submit: (stepKey, submission, confidence) =>
      cases.submit(attemptId, stepKey, submission, confidence),
    files: async () => (await files.forCase(caseKey))?.files ?? [],
  };
}

const verdictOf = (outcome) =>
  outcome >= SUCCESS_THRESHOLD ? "correct" : outcome === 0 ? "incorrect" : "partial";

/* A sample step in the shape case_loader.client_step gives the browser. */
function clientStep(s, lang, nodeId) {
  const out = {
    step_key: s.id, kind: s.kind, dimension: s.dimension, points: s.points,
    confidence: !!s.confidence && s.kind !== "branching", prompt: s.prompt[lang],
  };
  switch (s.kind) {
    case "span_select":
      return { ...out, text: extractSpans(s.marked[lang]).clean,
               min_selections: 1, max_selections: null };
    case "source_verify":
      return { ...out, items: s.items.map((it) => ({ id: it.id, citation: it[lang] })) };
    case "pattern_check":
      return { ...out, seed_text: s.seed[lang], max_chars: s.maxChars, hint: s.hint[lang] };
    case "reasoned_choice":
      return { ...out,
               options: s.options.map((o) => ({ id: o.id, text: o[lang] })),
               reasons: s.reasons.map((r) => ({ id: r.id, text: r[lang] })),
               require_reason: s.reasons.length > 0 };
    case "branching": {
      const id = nodeId ?? s.start;
      const node = s.nodes[id];
      return { ...out, node: {
        id, text: node.text[lang], terminal: !!node.terminal,
        options: (node.options ?? []).map((o) => ({ id: o.id, text: o[lang] })) } };
    }
    default:
      return out;
  }
}

function gradeLocal(s, submission, lang) {
  switch (s.kind) {
    case "span_select":
      return gradeSpans(submission.spans, extractSpans(s.marked[lang]).targets);
    case "source_verify":
      return gradeSources(submission.answers,
        Object.fromEntries(s.items.map((it) => [it.id, it.exists])));
    case "pattern_check":
      return gradePattern(submission.text, s.forbidden, s.required, s.maxChars).outcome;
    case "reasoned_choice":
      return gradeChoice(submission.option, submission.reason, s.correct,
        Object.fromEntries(s.reasons.map((r) => [r.id, r.w])));
    default:
      return 0;
  }
}

/* The tips the server gives, by step kind, for the screen opened without one. */
const OFFLINE_TIPS = {
  tr: {
    span_select: "Metni cümle cümle oku ve sorunlu ifadeyi ara. Metnin tamamını işaretlemek puanını düşürür.",
    source_verify: "Her ifadeyi ayrı değerlendir. Tanıdık görünmesi doğru olduğunu göstermez, kaynağına bak.",
    reasoned_choice: "Önce gerekçeleri oku. Hangisi kararın asıl nedenini söylüyor, hangisi yalnızca kulağa doğru geliyor?",
    pattern_check: "Önce sorunun cevaplanması için gerekeni yaz, sonra gereksiz olan ya da birinin kimliğini ele veren her şeyi çıkar.",
    branching: "Geri alınamayacak kararları önce düşün. Bu tür kararlarda puanı çoğu zaman en kötü karar belirler.",
  },
  en: {
    span_select: "Read sentence by sentence and look for the phrase that carries the problem. Marking the whole text lowers your score.",
    source_verify: "Judge each statement on its own. Looking familiar does not make it right; check its source.",
    reasoned_choice: "Read the reasons first. Which one states the real ground for the decision, and which only sounds right?",
    pattern_check: "First write what the question needs, then remove anything unnecessary or anything that identifies someone.",
    branching: "Think first about the decisions that cannot be undone. In decisions like this the worst decision often sets the score.",
  },
};

function localRunner(caseDef, langOf, twinOf) {
  const steps = caseDef.steps;
  // The sample seals its predictions the way the server does, so the screen
  // can show a seal being opened and checked.
  const seals = {};
  const sealed = async (s, node) => {
    const out = clientStep(s, langOf(), node);
    if (!seals[s.id]) {
      const p = Math.round(sigmoid(twinOf(s.dimension).theta) * 1e4) / 1e4;
      const salt = randomHex(16);
      const commitment = `sample:${s.id}:${p.toFixed(4)}:${salt}`;
      seals[s.id] = { p, salt, commitment, digest: await sha256Hex(commitment),
                      sealed_at: new Date().toISOString(), shown: true };
    }
    if (seals[s.id].digest) out.seal = { digest: seals[s.id].digest, sealed_at: seals[s.id].sealed_at };
    // As on the server: a tip before a step the twin expects to be missed.
    if (seals[s.id].p < 0.45 && !node) out.tip = OFFLINE_TIPS[langOf()]?.[s.kind];
    return out;
  };
  return {
    async start() {
      await mockDelay();
      return { attempt_id: null, step_index: 1, step_count: steps.length,
               finished: false, step: await sealed(steps[0]) };
    },
    async submit(stepKey, submission, confidence) {
      const lang = langOf();
      await mockDelay();
      const at = steps.findIndex((x) => x.id === stepKey);
      const s = steps[at];
      let outcome, ending = null;
      if (s.kind === "branching") {
        let id = s.start;
        const outs = [];
        for (const pick of submission.option_ids) {
          const o = s.nodes[id].options.find((x) => x.id === pick);
          outs.push(o.outcome);
          id = o.next;
        }
        if (!s.nodes[id].terminal) {
          return { path_complete: false, step_index: at + 1, step_count: steps.length,
                   step: await sealed(s, id) };
        }
        outcome = gradePath(outs, s.scoring);
        ending = s.nodes[id].text[lang];
      } else {
        outcome = gradeLocal(s, submission, lang);
      }
      const cur = twinOf(s.dimension);
      const seal = seals[s.id] ?? null;
      const u = mockElo(cur.theta, 0, outcome, cur.n, seal?.p ?? null);
      const last = at === steps.length - 1;
      const verdict = verdictOf(outcome);
      return {
        outcome, verdict, ending,
        points: mockScore(s.points, outcome, confidence),
        feedback: s.feedback[verdict === "correct" ? "correct" : "incorrect"][lang],
        // Without a server there is nobody to keep the answers from: the
        // sample shows them, so the screen can be reviewed.
        reveal: localReveal(s, lang, submission.text),
        reveal_pending: false,
        twin: { dimension: s.dimension, before: u.before, after: u.after, predicted: u.p },
        seal: seal?.digest ? seal : null,
        step_index: last ? at + 1 : at + 2, step_count: steps.length,
        step: last ? null : await sealed(steps[at + 1]),
        debrief: last ? caseDef.debrief[lang] : null,
      };
    },
    files: null,
  };
}

/* A sample step's correct answer, in the shape case_loader.reveal returns. */
function localReveal(s, lang, text) {
  switch (s.kind) {
    case "span_select": {
      const { clean, targets } = extractSpans(s.marked[lang]);
      return { kind: s.kind, targets, phrases: targets.map(([a, b]) => clean.slice(a, b)) };
    }
    case "source_verify":
      return { kind: s.kind, items: s.items.map((it) => ({
        id: it.id, exists: it.exists, evidence: it.why?.[lang] ?? "" })) };
    case "pattern_check": {
      const rules = [];
      for (const [group, list] of [["forbidden", s.forbidden], ["required", s.required]]) {
        for (const c of list) {
          const item = { label: c.label[lang] ?? c.label, kind: group };
          if (text != null) {
            const hit = new RegExp(c.pattern, c.flags || "").test(text);
            item.ok = group === "forbidden" ? !hit : hit;
          }
          rules.push(item);
        }
      }
      return { kind: s.kind, rules };
    }
    case "reasoned_choice":
      return { kind: s.kind, correct_option: s.correct,
               reasons: s.reasons.map((r) => ({ id: r.id, weight: r.w })) };
    case "branching": {
      const best = bestWalk(s.nodes, s.start, s.scoring);
      return { kind: s.kind, outcome: best.score,
               path: best.trail.map(([node, o]) => ({ situation: node.text[lang], choice: o[lang] })),
               ending: s.nodes[best.end].text[lang] };
    }
    default:
      return null;
  }
}

/* The best way through a sample decision tree, as case_loader.best_path finds it. */
function bestWalk(nodes, start, scoring) {
  let best = null;
  const walk = (id, outs, trail, seen) => {
    const node = nodes[id];
    if (node.terminal || !node.options?.length) {
      if (outs.length) {
        const score = gradePath(outs, scoring);
        if (!best || score > best.score
            || (score === best.score && trail.length < best.trail.length)) {
          best = { score, trail, end: id };
        }
      }
      return;
    }
    for (const o of node.options) {
      if (seen.has(o.next)) continue;
      walk(o.next, [...outs, o.outcome], [...trail, [node, o]], new Set([...seen, o.next]));
    }
  };
  walk(start, [], [], new Set([start]));
  return best;
}

function localSolution(caseDef, lang) {
  return {
    open: true, title: caseDef.title[lang], debrief: caseDef.debrief[lang],
    steps: caseDef.steps.map((s) => ({ step: clientStep(s, lang), reveal: localReveal(s, lang),
                                       outcome: null })),
  };
}

/* What a step's answer looks like on the wire, per grading.SUBMISSION_FIELDS. */
function toSubmission(step, a) {
  switch (step.kind) {
    case "span_select": return { spans: spansFromWords(step.text, a?.words) };
    case "source_verify": return { answers: { ...(a?.values ?? {}) } };
    case "pattern_check": return { text: a?.text ?? step.seed_text ?? "" };
    case "reasoned_choice": return { option: a?.option, reason: a?.reason ?? null };
    default: return {};
  }
}

function answerReady(step, a) {
  switch (step.kind) {
    case "span_select": {
      const marks = runsOf(a?.words).length;
      return marks >= (step.min_selections ?? 1)
        && (step.max_selections == null || marks <= step.max_selections);
    }
    case "source_verify":
      return step.items.every((it) => typeof a?.values?.[it.id] === "boolean");
    case "pattern_check": {
      const text = (a?.text ?? step.seed_text ?? "").trim();
      return text.length > 10 && (!step.max_chars || text.length <= step.max_chars);
    }
    case "reasoned_choice":
      return !!a?.option && (!step.require_reason || !!a?.reason);
    default:
      return false;
  }
}

function CaseRunner({ t, lang, caseDef, twin, history, offline, onResult, before, progression,
                     onExit }) {
  const twinRef = useRef(twin);
  twinRef.current = twin;
  const langRef = useRef(lang);
  langRef.current = lang;
  const runnerRef = useRef(null);
  if (!runnerRef.current) {
    runnerRef.current = offline
      ? localRunner(caseDef.local, () => langRef.current,
                    (d) => twinRef.current[d] ?? { theta: 0, n: 0 })
      : serverRunner(caseDef.key);
  }
  const runner = runnerRef.current;

  const [phase, setPhase] = useState("intro");     // intro | step | feedback | end
  const [step, setStep] = useState(null);
  const [index, setIndex] = useState(1);
  const [count, setCount] = useState(caseDef.stepCount ?? 0);
  const [answer, setAnswer] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [path, setPath] = useState([]);
  const [result, setResult] = useState(null);
  const [debrief, setDebrief] = useState(null);
  const [fresh, setFresh] = useState(false);
  const [serverFiles, setServerFiles] = useState(null);
  const [earned, setEarned] = useState(0);
  const [sawAnswers, setSawAnswers] = useState(false);
  const [shownDigest, setShownDigest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [seen, setSeen] = useState([]);              // step keys shown so far
  const [reporting, setReporting] = useState(false);
  /* A case can come in two languages. It is one case either way: a new
     attempt opens in the version chosen here, one already begun keeps its
     language, and solving either version solves the case. */
  const versions = LANG_ORDER.filter((l) => (caseDef.locales ?? [caseDef.locale]).includes(l));
  const [version, setVersion] = useState(caseDef.locale ?? null);
  const [openings, setOpenings] = useState({});     // locale -> { title, context }
  const choosable = !offline && !caseDef.attempted && versions.length > 1;
  // Set aside by an administrator: the opening says so and nothing starts.
  const voided = caseDef.voided ?? null;
  const topRef = useRef(null);

  useEffect(() => { topRef.current?.scrollIntoView({ block: "start" }); },
            [phase, index]);

  /* The file list is asked for again after every step: a file can open with its
     step or once the step is answered, and the server applies that rule. */
  const refreshFiles = async () => {
    if (!runner.files) return;
    try { setServerFiles(await runner.files()); } catch { /* keep the last list */ }
  };

  const failure = (e) =>
    e instanceof ApiError && e.code === "voided"
      ? `${t.voidedHead}.${e.detail?.reason ? ` ${t.voidedReason}: ${e.detail.reason}` : ""}`
    : e instanceof ApiError && e.code === "limit" && e.detail
      ? `${t.startBlocked} ${limitText(t, lang, e.detail)}`
      : e instanceof ApiError && e.status === 429 ? t.tooFast
        : e instanceof ApiError && e.message === "confidence_required" ? t.noConfidence
          : t.sendFailed;

  const show = (r) => {
    setStep(r.step); setIndex(r.step_index); setCount(r.step_count);
    setSeen((s) => (r.step && !s.includes(r.step.step_key) ? [...s, r.step.step_key] : s));
    setShownDigest(r.step?.seal?.digest ?? null);
    setAnswer(null); setConfidence(null); setPath([]); setResult(null);
    setPhase("step");
  };

  const open = async () => {
    const r = await runner.start(version);
    if (r.locale) setVersion(r.locale);
    await refreshFiles();
    if (r.finished) { setDebrief(r.debrief); setFresh(false); setPhase("end"); }
    else show(r);
  };

  const begin = async () => {
    setBusy(true); setError(null);
    try { await open(); } catch (e) { setError(failure(e)); }
    finally { setBusy(false); }
  };

  /* The opening in the other language comes from the server the first time it
     is asked for; the list already holds the one the case was offered in. */
  const opening = version && version !== caseDef.locale ? openings[version] : null;
  const caseTitle = opening ? opening.title : caseDef.title[lang];
  const caseContext = opening ? opening.context : caseDef.context[lang];
  const chooseVersion = async (locale) => {
    if (locale === version || busy) return;
    setError(null);
    if (locale === caseDef.locale || openings[locale]) { setVersion(locale); return; }
    setBusy(true);
    try {
      const r = await cases.intro(caseDef.key, locale);
      setOpenings((o) => ({ ...o, [locale]: { title: r.title, context: r.context } }));
      setVersion(locale);
    } catch {
      setError(t.versionFailed);
    } finally {
      setBusy(false);
    }
  };

  const send = async (submission, conf, revert) => {
    setBusy(true); setError(null);
    try {
      const r = await runner.submit(step.step_key, submission, conf);
      if (r.path_complete === false) { setStep(r.step); return; }
      onResult(r, conf, { key: caseDef.key, step: step.step_key, title: caseTitle });
      setResult(r);
      if (r.reveal) setSawAnswers(true);
      setEarned((p) => p + (r.points ?? 0));
      setPhase("feedback");
      refreshFiles();
    } catch (e) {
      revert?.();
      if (e instanceof ApiError && e.status === 409) {
        // Answered already, from another tab or device: carry on from there.
        try { await open(); } catch (err) { setError(failure(err)); }
      } else {
        setError(failure(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = () => send(toSubmission(step, answer), step.confidence ? confidence : null);

  const pick = (option) => {
    const prev = path;
    const next = [...path, option];
    setPath(next);
    send({ option_ids: next.map((o) => o.id) }, null, () => setPath(prev));
  };

  const advance = () => {
    if (result.step) {
      show({ step: result.step, step_index: result.step_index, step_count: result.step_count });
    } else {
      setDebrief(result.debrief); setFresh(true); setPhase("end");
    }
  };

  const ready = step && step.kind !== "branching" && answerReady(step, answer)
    && (!step.confidence || confidence != null);
  const nudge = useMemo(() => confidenceNudge(history, step?.dimension, confidence),
                        [history, step?.dimension, confidence]);
  const fileList = (at, finished) => visibleFiles(caseDef.local, at, finished, serverFiles);
  // A sample case is written in both languages and follows the interface.
  const caseLang = caseDef.local && !caseDef.locale ? undefined
    : (version ?? caseDef.locale ?? "tr");

  return (
    <CaseLang.Provider value={caseLang}>
    <div ref={topRef} className="run" data-case-lang={caseLang}>
      <header style={S.header}>
        <button onClick={onExit} style={S.back}>← {t.backHome}</button>
        {(phase === "step" || phase === "feedback") && (
          <span style={S.progress} aria-label={`${t.step} ${index} ${t.of} ${count}`}>
            {Array.from({ length: count }, (_, i) => (
              <span key={i} style={{ ...S.progressDot,
                ...(i < index - 1 || (i === index - 1 && phase === "feedback") ? S.progressDone
                    : i === index - 1 ? S.progressNow : null) }} />
            ))}
            <span style={S.progressText}>{t.step} {index} {t.of} {count}</span>
          </span>
        )}
      </header>

      {phase !== "intro" && !reporting && (
        <div style={S.reportBar}>
          <button onClick={() => setReporting(true)} style={S.reportLink} data-action="report">
            <Icon name="flag" size={13} /> {t.report}
          </button>
        </div>
      )}
      {reporting && (
        <ReportForm t={t} caseKey={caseDef.key} steps={seen}
          current={phase === "end" ? "case" : step?.step_key} offline={offline}
          onClose={() => setReporting(false)} />
      )}

      {phase === "intro" && (
        <section style={S.card}>
          <CaseImage caseKey={caseDef.key} version={caseDef.image} />
          <div style={S.introTop}>
            {caseDef.type !== "open" && (
              <span style={S.caseKind}>
                {caseDef.type === "weekly" ? t.weekly : t.core}
              </span>
            )}
            <span style={S.introAreas}>
              {(caseDef.dims ?? []).map((d) => (
                <span key={d} style={S.areaChip}>
                  <Glyph dim={d} size={14} colour={ACCENT} />{DIM_SHORT[lang][d]}
                </span>
              ))}
            </span>
          </div>
          {choosable && (
            <div style={S.versionBox} data-panel="case-version">
              <div style={S.versionHead} id="case-version-head">{t.versionHead}</div>
              <div style={S.versionSeg} role="radiogroup" aria-labelledby="case-version-head">
                {versions.map((l) => (
                  <button key={l} role="radio" aria-checked={version === l} data-version={l}
                    lang={l} onClick={() => chooseVersion(l)} disabled={busy}
                    style={{ ...S.versionBtn, ...(version === l ? S.versionOn : null) }}>
                    {ENDONYMS[l] ?? l.toUpperCase()}
                  </button>
                ))}
              </div>
              <p style={S.versionNote}>{t.versionNote}</p>
            </div>
          )}
          {!choosable && !offline && versions.length > 1 && caseDef.attempted && version && (
            <p style={{ ...S.versionNote, margin: "2px 0 10px" }} data-version-fixed={version}>
              {fill(caseDef.finished ? t.versionFinished : t.versionStarted,
                    { l: t.langNames[version] ?? version })}
            </p>
          )}
          <h2 style={S.h2} lang={caseLang}>{caseTitle}</h2>
          <Prose text={caseContext} />
          <Files t={t} lang={lang} files={fileList(-1, false)}
            note={caseDef.local?.files?.some((f) => f.release !== "with_case")} />
          {error && <div style={S.errorBox} role="alert">{error}</div>}
          {voided ? (
            <div style={S.voidBox} role="status" data-voided>
              <div style={S.voidHead}>{t.voidedHead}</div>
              <p style={S.voidText}>
                {fill(t.voidedBody, { date: voided.at ? dateText(voided.at, lang) : "" })}
              </p>
              {voided.reason && (
                <p style={S.voidText}>
                  <strong>{t.voidedReason}:</strong> <span data-user-content>{voided.reason}</span>
                </p>
              )}
            </div>
          ) : (
            <button onClick={begin} disabled={busy} data-action="begin"
              style={{ ...S.primary, ...(busy ? S.disabled : null) }}>
              {busy ? t.sending : caseDef.finished ? t.review : t.start}
            </button>
          )}
        </section>
      )}

      {phase === "step" && step && (
        <section style={S.card} data-step={step.step_key} data-kind={step.kind}>
          <div style={S.dimTag}>
            <Glyph dim={step.dimension} size={15} colour={ACCENT} />
            {DIM_LABEL[lang][step.dimension]}
          </div>
          {step.seal && <SealChip t={t} seal={step.seal} explain={index === 1} />}
          {step.tip && (
            <div style={S.tipBox} data-tip>
              <Icon name="spark" size={14} />
              <span><strong>{t.tipHead}:</strong> {step.tip}</span>
            </div>
          )}
          <Prose text={step.prompt} style={S.prompt} />
          <Files t={t} lang={lang} files={fileList(index - 1, false)} />
          {step.kind === "branching" ? (
            <Branching step={step} path={path} busy={busy} onPick={pick} />
          ) : (
            <StepBody step={step} t={t} answer={answer} setAnswer={setAnswer} />
          )}
          {step.confidence && (
            <>
              <div style={S.confLabel}>{t.confidence}</div>
              <div style={S.confRow}>
                {CONFIDENCE.map((c) => (
                  <button key={c} onClick={() => setConfidence(c)} data-confidence={c}
                    aria-pressed={confidence === c}
                    style={{ ...S.confBtn, ...(confidence === c ? S.confOn : null) }}>
                    {pct(c, lang)}
                  </button>
                ))}
              </div>
              {nudge ? (
                <p style={S.nudge} data-nudge>
                  {fill(t.confNudge, { n: nudge.n, c: pctOf(nudge.confidence), s: pctOf(nudge.hit) })}
                </p>
              ) : <p style={S.help}>{t.confHelp}</p>}
            </>
          )}
          {error && <div style={S.errorBox} role="alert">{error}</div>}
          {step.kind !== "branching" && (
            <button onClick={submit} disabled={!ready || busy} data-action="submit"
              style={{ ...S.primary, ...(ready && !busy ? null : S.disabled) }}>
              {busy ? t.sending : t.submit}
            </button>
          )}
        </section>
      )}

      {phase === "feedback" && step && result && (
        <Feedback t={t} lang={lang} step={step} result={result} twin={twin}
          history={history} answer={answer} path={path} shownDigest={shownDigest}
          confidence={step.confidence ? confidence : null}
          last={!result.step}
          files={fileList(index, false)}
          onNext={advance} />
      )}

      {phase === "end" && (
        <>
          {fresh && (
            <Ending t={t} lang={lang} before={before} progression={progression}
              earned={earned} awards={result?.awards ?? []} />
          )}
          {debrief && (
            <Debrief t={t} lang={lang} debrief={debrief} files={fileList(count, true)} />
          )}
          {/* Answers already shown step by step are folded away at the end. */}
          <Solution t={t} lang={lang} caseDef={caseDef} offline={offline}
            folded={fresh && sawAnswers} />
          <button onClick={onExit} style={{ ...S.primary, marginTop: 4 }}>{t.backHome}</button>
        </>
      )}
    </div>
    </CaseLang.Provider>
  );
}


/* A word before a confident answer in an area where confidence has run ahead of
   accuracy: the person's own last answers there, nothing else. */
const NUDGE_MIN = 6, NUDGE_GAP = 0.15;
function confidenceNudge(history, dimension, confidence) {
  if (!dimension || confidence == null || confidence < 0.8) return null;
  const scored = (history ?? []).filter((h) => h.dimension === dimension && h.confidence != null)
    .slice(-10);
  if (scored.length < NUDGE_MIN) return null;
  const c = mean(scored.map((h) => h.confidence));
  const hit = mean(scored.map((h) => (h.outcome >= SUCCESS_THRESHOLD ? 1 : 0)));
  return c - hit > NUDGE_GAP ? { n: scored.length, confidence: c, hit } : null;
}

/* The end of a case: what was earned, what moved, and a level, an area level,
 * a rare mark or a medal when one was reached. The rest of the interface stays
 * quiet so this screen can be the one that marks the moment. */
function Ending({ t, lang, before, progression, earned, awards = [] }) {
  const now = progression;
  const leveledUp = before && now.reached.level > before.level;
  const newTiers = before
    ? BADGE_DIMS.filter((d) => (now.tiers[d.key] ?? 0) > (before.tiers?.[d.key] ?? 0))
    : [];

  return (
    <section style={{ ...S.card, ...S.endCard }} data-screen="ending">
      <div className="rise" style={S.endTop}>
        <ArtImage kind="level" k={now.reached.level} size={88}
          alt={`${t.level} ${now.reached.level}, ${now.reached[lang]}`} />
        <div>
          <div style={S.endDone}><Icon name="check" size={13} /> {t.done}</div>
          <div style={S.endPoints}>
            {earned >= 0 ? "+" : ""}{num1(earned, lang)}
            <span style={S.endPointsCap}> {t.earned}</span>
          </div>
        </div>
      </div>

      {leveledUp && (
        <div className="rise pop" style={{ ...S.endNote, borderColor: ACCENT }}>
          <ArtImage kind="level" k={now.reached.level} size={40} alt="" />
          <span style={{ ...S.endNoteCap, color: ACCENT }}>{t.levelUp}</span>
          <span style={S.endNoteBody}>
            {t.level} {now.reached.level} · {now.reached[lang]}
          </span>
        </div>
      )}

      {newTiers.map((d, k) => (
        <div key={d.key} className="rise pop" style={{ ...S.endNote, borderColor: GOOD,
              animationDelay: `${180 + k * 90}ms` }} data-new-area-level={d.key}>
          <ArtImage kind="dim" k={d.key} size={40} alt="" />
          <span style={{ ...S.endNoteCap, color: GOOD }}>{t.newAreaLevel}</span>
          <span style={S.endNoteBody}>
            {DIM_LABEL[lang][d.key]} · {BADGE_TIERS[(now.tiers[d.key] ?? 1) - 1][lang]}
          </span>
        </div>
      ))}

      {awards.map((a, k) => (
        <div key={a.code} className="rise pop" style={{ ...S.endNote, borderColor: ACCENT,
              animationDelay: `${260 + (newTiers.length + k) * 90}ms` }} data-new-award={a.code}>
          <AwardImage award={a} size={44} alt="" />
          <span style={{ ...S.endNoteCap, color: ACCENT }}>
            {a.category === "marks" ? t.newMark
              : fill(t.newMedal, { g: MEDAL_ONE[lang][a.category] ?? t.medalsHead })}
          </span>
          <span style={S.endNoteBody}>{a.name}</span>
        </div>
      ))}

      {!leveledUp && newTiers.length === 0 && awards.length === 0 && (
        <p className="rise" style={{ ...S.endQuiet, animationDelay: "160ms" }}>
          {t.keptGoing}
        </p>
      )}
    </section>
  );
}

/* The solution note: summary, a note per step, the takeaway and the sources.
   The note per step names the answers, so it arrives once the case is open. */
function Debrief({ t, lang, debrief, files: list }) {
  const perStep = Object.values(debrief.per_step ?? {});
  const caseLang = useContext(CaseLang);
  return (
    <section style={S.card} data-screen="debrief">
      <h2 style={S.h2}>{t.debrief}</h2>
      <Prose text={debrief.summary} />
      <Files t={t} lang={lang} files={list} />
      <div style={S.takeaway}>
        <div style={S.takeCap}>{t.takeaway}</div>
        <Prose text={debrief.takeaway} style={S.takeBody} />
      </div>
      {perStep.length > 0 && (
        <details style={S.more}>
          <summary style={S.moreHead}>{t.perStep}</summary>
          {perStep.map((note, i) => (
            <div key={i} style={S.moreRow}>
              <span style={S.moreNo}>{t.step} {i + 1}</span>
              <Prose text={note} style={S.moreBody} />
            </div>
          ))}
        </details>
      )}
      {debrief.sources?.length > 0 && (
        <div style={S.sources}>
          <div style={S.filesHead}>{t.sources}</div>
          {debrief.sources.map((src, i) => (
            <div key={i} style={S.sourceLine} lang={caseLang}><Linked text={src} /></div>
          ))}
        </div>
      )}
    </section>
  );
}

/* The correct answers of a finished case, step by step, once the case is open;
   until then, how far it is from opening. */
function Solution({ t, lang, caseDef, offline, folded }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let stop = false;
    (async () => {
      if (offline) {
        setState(caseDef.local ? { data: localSolution(caseDef.local, lang) } : {});
        return;
      }
      try {
        const data = await cases.solution(caseDef.key);
        if (!stop) setState({ data });
      } catch {
        if (!stop) setState({});
      }
    })();
    return () => { stop = true; };
  }, [caseDef.key, lang, offline]);

  if (state.loading) {
    return <section style={S.card}><p style={{ ...S.help, margin: 0 }}>{t.loading}</p></section>;
  }
  const d = state.data;
  if (!d) return null;
  if (!d.open) {
    return (
      <section style={S.card} data-screen="solution" data-open="false">
        <h2 style={S.h2}>{t.answersHead}</h2>
        <p style={{ ...S.body, marginBottom: 0 }}>{d.held ? t.answersHeld : t.answersPending}</p>
        {d.progress != null && (
          <div style={S.meter}>
            <div style={S.meterTrack}>
              <div style={{ ...S.meterFill, width: `${pctOf(d.progress)}%` }} />
            </div>
            <div style={S.meterText}>{fill(t.answersProgress, { p: pctOf(d.progress) })}</div>
          </div>
        )}
      </section>
    );
  }
  const steps = d.steps.map((s, i) => {
        const v = s.outcome == null ? null : verdictOf(s.outcome);
        return (
          <div key={s.step.step_key} style={i ? S.solStep : S.solFirst}>
            <div style={S.solHead}>
              <span style={S.solNo}>{t.step} {i + 1}</span>
              <span style={S.solArea}>
                <Glyph dim={s.step.dimension} size={14} colour={ACCENT} />
                {DIM_LABEL[lang][s.step.dimension]}
              </span>
              {v && (
                <span style={{ ...S.solVerdict, color: VERDICT_INK[v] }}>
                  {t.yourResult}: {t[v]}
                </span>
              )}
            </div>
            <Prose text={s.step.prompt} style={S.solPrompt} />
            <Reveal t={t} lang={lang} step={s.step} reveal={s.reveal} />
          </div>
        );
  });
  return (
    <section style={S.card} data-screen="solution" data-open="true">
      {folded ? (
        <details>
          <summary style={S.foldHead}>{t.answersAgain}</summary>
          <div style={{ marginTop: 12 }}>{steps}</div>
        </details>
      ) : (
        <>
          <h2 style={S.h2}>{t.answersHead}</h2>
          {steps}
        </>
      )}
    </section>
  );
}

const VERDICT_INK = { correct: GOOD, partial: WARN, incorrect: ACCENT };

/* One step's correct answer. With the person's own answer, each part says
   whether they had it. */
function Reveal({ t, lang, step, reveal, answer, path }) {
  if (!reveal) return null;
  switch (reveal.kind) {
    case "span_select": return <SpanReveal t={t} step={step} reveal={reveal} answer={answer} />;
    case "source_verify": return <SourceReveal t={t} step={step} reveal={reveal} answer={answer} />;
    case "reasoned_choice": return <ChoiceReveal t={t} step={step} reveal={reveal} answer={answer} />;
    case "pattern_check": return <PatternReveal t={t} reveal={reveal} />;
    case "branching": return <BranchReveal t={t} reveal={reveal} path={path} />;
    default: return null;
  }
}

function SpanReveal({ t, step, reveal, answer }) {
  const parts = useMemo(() => splitWords(step.text ?? ""), [step.text]);
  const mine = answer?.words ?? null;
  const seen = new Set();
  const words = parts.map((p, k) => {
    if (p.para) return <span key={k} style={S.paraBreak} />;
    if (p.line) return <span key={k} style={S.lineBreak} />;
    const target = reveal.targets.some(([s, e]) => p.s < e && p.e > s);
    const picked = !!mine?.has(p.i);
    const kind = mine
      ? (target && picked ? "rv-hit" : target ? "rv-miss" : picked ? "rv-extra" : "")
      : (target ? "rv-target" : "");
    if (kind) seen.add(kind);
    return <span key={k} className={`rv-word ${kind}`}>{p.text}</span>;
  });
  const legend = mine
    ? [["rv-hit", t.rightMark], ["rv-miss", t.missedMark], ["rv-extra", t.extraMark]]
    : [["rv-target", t.problemSpots]];
  const caseLang = useContext(CaseLang);
  return (
    <>
      <div style={{ ...S.passage, userSelect: "text" }} lang={caseLang}>{words}</div>
      <div style={S.legend}>
        {legend.filter(([k]) => seen.has(k)).map(([k, label]) => (
          <span key={k} style={S.legendItem}><span className={`rv-swatch ${k}`} />{label}</span>
        ))}
      </div>
    </>
  );
}

function SourceReveal({ t, step, reveal, answer }) {
  const truth = Object.fromEntries(reveal.items.map((i) => [i.id, i]));
  const caseLang = useContext(CaseLang);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {step.items.map((it) => {
        const r = truth[it.id];
        if (!r) return null;
        const mine = answer?.values?.[it.id];
        const right = typeof mine === "boolean" ? mine === r.exists : null;
        return (
          <div key={it.id} style={S.rvItem}>
            <div style={S.rvItemTop}>
              <span style={{ ...S.truthChip, ...(r.exists ? S.truthReal : S.truthFake) }}>
                {r.exists ? t.realRef : t.fakeRef}
              </span>
              {right != null && (
                <span style={{ ...S.rvMine, color: right ? GOOD : ACCENT }}>
                  {right ? "✓" : "✗"} {t.yourCall}: {mine ? t.realRef : t.fakeRef}
                </span>
              )}
            </div>
            <div style={S.rvCitation} lang={caseLang}>{it.citation}</div>
            {r.evidence && <div style={S.rvEvidence} lang={caseLang}>{r.evidence}</div>}
          </div>
        );
      })}
    </div>
  );
}

function ChoiceReveal({ t, step, reveal, answer }) {
  const weights = Object.fromEntries((reveal.reasons ?? []).map((r) => [r.id, r.weight]));
  const options = (step.options ?? []).filter(
    (o) => o.id === reveal.correct_option || o.id === answer?.option);
  const reasons = [...(step.reasons ?? [])]
    .sort((a, b) => (weights[b.id] ?? 0) - (weights[a.id] ?? 0));
  const grade = (w) => (w >= 1 ? t.bestReason : w > 0 ? t.partReason : t.noReason);
  const caseLang = useContext(CaseLang);
  return (
    <>
      <div style={{ display: "grid", gap: 6 }}>
        {options.map((o) => {
          const right = o.id === reveal.correct_option;
          return (
            <div key={o.id} style={{ ...S.rvOption, ...(right ? S.rvOptionRight : S.rvOptionWrong) }}>
              <span style={{ ...S.rvTag, color: right ? GOOD : ACCENT }}>
                {right ? `✓ ${t.rightOption}` : `✗ ${t.yourPick}`}
                {right && answer?.option === o.id ? `, ${t.yourPick}` : ""}
              </span>
              <span lang={caseLang}>{o.text}</span>
            </div>
          );
        })}
      </div>
      {reasons.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          {reasons.map((r) => {
            const w = weights[r.id] ?? 0;
            return (
              <div key={r.id} style={{ ...S.rvReason, opacity: w > 0 ? 1 : 0.72 }}>
                <span style={{ ...S.rvWeight, ...(w >= 1 ? S.rvWeightTop : w > 0 ? S.rvWeightPart : null) }}>
                  {grade(w)}
                </span>
                <span style={S.rvReasonText}>
                  <span lang={caseLang}>{r.text}</span>
                  {answer?.reason === r.id && <span style={S.rvYours}> ({t.yourReason})</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function PatternReveal({ t, reveal }) {
  const caseLang = useContext(CaseLang);
  return (
    <ul style={S.rules}>
      {reveal.rules.map((r, i) => (
        <li key={i} style={S.rule}>
          <span style={{ ...S.ruleMark,
                         ...(r.ok == null ? null : r.ok ? S.ruleOk : S.ruleBad) }}>
            {r.ok == null ? "" : r.ok ? "✓" : "✗"}
          </span>
          <span style={S.ruleKind}>{r.kind === "forbidden" ? t.mustNot : t.must}</span>
          <span style={S.ruleLabel} lang={caseLang}>{r.label}</span>
          {r.ok != null && (
            <span style={{ ...S.ruleState, color: r.ok ? GOOD : ACCENT }}>
              {r.ok ? t.ruleMet : t.ruleMissed}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function BranchReveal({ t, reveal, path }) {
  const mine = path?.length ? path.map((p) => p.text) : null;
  const caseLang = useContext(CaseLang);
  const split = mine ? reveal.path.findIndex((s, i) => mine[i] !== s.choice) : -1;
  return (
    <ol style={S.bestPath}>
      {reveal.path.map((s, i) => (
        <li key={i} style={S.bestStep}>
          <span style={S.bestNo} aria-hidden="true">{i + 1}</span>
          <div style={{ minWidth: 0 }}>
            <Prose text={s.situation} style={S.bestSituation} />
            <div style={S.bestChoice} lang={caseLang}>{s.choice}</div>
            {i === split && <div style={S.diverged}>{t.diverged}</div>}
          </div>
        </li>
      ))}
      <li style={S.bestEnd}>
        <Prose text={reveal.ending} style={S.endingBody} />
      </li>
    </ol>
  );
}

/* Paragraphs separated by a blank line; single line breaks inside a paragraph
   are the authoring file's wrapping and read as spaces. */
/* A blank line starts a paragraph. A line that opens with a list marker or a
   short label ("Kimden:", "Sen:", "2.") starts a line of its own; any other
   single newline is a wrap in the case file. */
const HARD_LINE = /^(?:[-•*]|\d{1,2}[.)])\s|^\p{Lu}[\p{L}\p{N}.'’-]*(?: [\p{L}\p{N}.'’-]+){0,2}:\s/u;

function linesOf(paragraph) {
  const out = [];
  for (const raw of paragraph.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (out.length && !HARD_LINE.test(line)) out[out.length - 1] += ` ${line}`;
    else out.push(line);
  }
  return out;
}

function Prose({ text, style }) {
  const caseLang = useContext(CaseLang);
  if (!text) return null;
  return String(text).trim().split(/\n\s*\n/).map((p, i) => (
    <p key={i} style={{ ...S.body, ...style }} lang={caseLang}>
      {linesOf(p).map((line, j) => (j ? [" ", <br key={`b${j}`} />, line] : line))}
    </p>
  ));
}

function Linked({ text }) {
  const parts = String(text).split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((p, i) => (/^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={S.link}>{p}</a>
    : <span key={i}>{p}</span>));
}

/* Which files a person may see right now. With a server the list arrives
   already filtered by app.attachment_visible. Without one, the sample case's
   files are filtered here by the same rule. An unreleased file is left out,
   since its title alone can be a hint. */
function visibleFiles(local, stepIndex, finished, fromServer) {
  if (fromServer) {
    return fromServer.map((f) => ({
      id: f.id, step: f.step, release: f.release, type: f.type, bytes: f.bytes,
      title: { tr: f.title, en: f.title },
      caption: f.caption ? { tr: f.caption, en: f.caption } : null,
      href: files.url(f.id),
    }));
  }
  return local ? offlineFiles(local, stepIndex, finished) : [];
}

function offlineFiles(caseDef, stepIndex, finished) {
  const steps = caseDef.steps ?? [];
  const here = stepIndex >= 0 ? steps[stepIndex]?.id : null;
  const answered = new Set(steps.slice(0, Math.max(0, stepIndex)).map((s) => s.id));
  return (caseDef.files ?? []).filter((f) => {
    switch (f.release) {
      case "with_case": return true;
      case "with_step": return f.step === here || answered.has(f.step) || finished;
      case "after_step": return answered.has(f.step) || finished;
      case "debrief_only": return finished;
      default: return false;
    }
  });
}

const KB = (n, lang) => (n >= 1048576 ? `${num1(n / 1048576, lang)} MB` : `${Math.round(n / 1024)} KB`);

function Files({ t, lang, files: list, note }) {
  const caseLang = useContext(CaseLang);
  if (!list?.length) return null;
  return (
    <div style={S.files}>
      <div style={S.filesHead}>{t.files}</div>
      {list.map((f) => (
        <a key={f.id} style={S.file} href={f.href ?? "#"}
          target="_blank" rel="noopener noreferrer">
          <span style={S.fileIcon}><Icon name="file" size={17} /></span>
          <span style={S.fileMain}>
            <span style={S.fileTitle} lang={caseLang}>{f.title[lang]}</span>
            {f.caption && (
              <span style={S.fileCap}>
                <span lang={caseLang}>{f.caption[lang]}</span> · {KB(f.bytes, lang)}
              </span>
            )}
          </span>
          <span style={S.fileGo}>{t.openFile} →</span>
        </a>
      ))}
      {note && <p style={S.filesNote}>{t.filesLater}</p>}
    </div>
  );
}

/* The server sends the twin as rows, and nothing for a dimension not yet
   answered; the screen keeps all seven keyed by name. */
function normaliseTwin(fromServer) {
  const rows = Array.isArray(fromServer)
    ? fromServer
    : Object.entries(fromServer ?? {}).map(([dimension, v]) => ({ dimension, ...v }));

  const out = Object.fromEntries(DIMS.map((d) => [d, { theta: 0, n: 0 }]));
  for (const r of rows) {
    if (!r?.dimension || !(r.dimension in out)) continue;
    out[r.dimension] = {
      theta: Number(r.theta ?? 0),
      n: Number(r.attempts ?? r.n ?? 0),
    };
  }
  return out;
}

/* Words are what a finger can hit. Gaps holding a blank line become paragraph
   breaks and a HARD_LINE start becomes a line break, so a quoted e-mail or a
   chat keeps its shape; offsets still index the server's text exactly. */
function splitWords(text) {
  const out = [];
  const re = /\S+/g;
  let m, last = 0, i = 0;
  while ((m = re.exec(text)) !== null) {
    const gap = text.slice(last, m.index);
    if (i > 0 && /\n\s*\n/.test(gap)) out.push({ para: true });
    else if (i > 0 && gap.includes("\n") && HARD_LINE.test(text.slice(m.index, m.index + 80))) {
      out.push({ line: true });
    }
    out.push({ word: true, i, text: m[0], s: m.index, e: m.index + m[0].length });
    last = m.index + m[0].length;
    i += 1;
  }
  return out;
}

/* Consecutive picked words form one mark. */
function runsOf(words) {
  const picked = [...(words ?? [])].sort((x, y) => x - y);
  const runs = [];
  let run = null;
  for (const idx of picked) {
    if (run && idx === run.last + 1) run.last = idx;
    else { if (run) runs.push(run); run = { first: idx, last: idx }; }
  }
  if (run) runs.push(run);
  return runs;
}

function spansFromWords(text, words) {
  const toks = splitWords(text).filter((p) => p.word);
  const TRIM_END = /[.,;:!?)\]}»"']+$/;
  const TRIM_START = /^[([{«"']+/;
  return runsOf(words).map((r) => {
    const first = toks[r.first], last = toks[r.last];
    const lead = (first.text.match(TRIM_START) || [""])[0].length;
    const tail = (last.text.match(TRIM_END) || [""])[0].length;
    return [first.s + lead, Math.max(first.s + lead + 1, last.e - tail)];
  });
}

/* ------------------------------- step bodies ------------------------------ */

function StepBody({ step, t, answer, setAnswer }) {
  switch (step.kind) {
    case "span_select": return <SpanSelect {...{ step, t, answer, setAnswer }} />;
    case "source_verify": return <SourceVerify {...{ step, t, answer, setAnswer }} />;
    case "pattern_check": return <PatternCheck {...{ step, t, answer, setAnswer }} />;
    case "reasoned_choice": return <ReasonedChoice {...{ step, t, answer, setAnswer }} />;
    default: return null;
  }
}

function SpanSelect({ step, t, answer, setAnswer }) {
  const parts = useMemo(() => splitWords(step.text ?? ""), [step.text]);
  const words = answer?.words ?? new Set();
  const toggle = (i) => {
    const next = new Set(words);
    next.has(i) ? next.delete(i) : next.add(i);
    setAnswer({ words: next });
  };
  const marks = runsOf(words).length;
  const caseLang = useContext(CaseLang);
  return (
    <>
      <p style={S.help}>{t.markHint}</p>
      <div style={S.passage} lang={caseLang}>
        {parts.map((p, k) => (p.para || p.line
          ? <span key={k} style={p.para ? S.paraBreak : S.lineBreak} />
          : <span key={k} data-i={p.i} onClick={() => toggle(p.i)}
              className={`word ${words.has(p.i) ? "picked" : ""}`}>{p.text}</span>))}
      </div>
      <div style={S.counter}>
        {marks} {t.marks}{step.max_selections ? ` / ${step.max_selections}` : ""}
      </div>
    </>
  );
}

function SourceVerify({ step, t, answer, setAnswer }) {
  const values = answer?.values ?? {};
  const set = (id, v) => setAnswer({ values: { ...values, [id]: v } });
  const caseLang = useContext(CaseLang);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {step.items.map((it) => (
        <div key={it.id} data-item={it.id} style={S.source}>
          <div style={S.citation} lang={caseLang}>{it.citation}</div>
          <div style={S.pillRow}>
            <button data-value="true" onClick={() => set(it.id, true)}
              style={{ ...S.pill, ...(values[it.id] === true ? S.pillGood : null) }}>{t.real}</button>
            <button data-value="false" onClick={() => set(it.id, false)}
              style={{ ...S.pill, ...(values[it.id] === false ? S.pillBad : null) }}>{t.fake}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PatternCheck({ step, t, answer, setAnswer }) {
  const text = answer?.text ?? step.seed_text ?? "";
  const caseLang = useContext(CaseLang);
  return (
    <>
      {step.hint && <p style={S.help} lang={caseLang}>{step.hint}</p>}
      <textarea data-field="text" value={text} lang={caseLang}
        onChange={(e) => setAnswer({ text: e.target.value })}
        rows={5} style={S.textarea} maxLength={step.max_chars || undefined} />
      {step.max_chars ? (
        <div style={S.counter}>
          {step.max_chars - text.length} {plural(t, "chars", step.max_chars - text.length)}
        </div>
      ) : null}
    </>
  );
}

function ReasonedChoice({ step, t, answer, setAnswer }) {
  const a = answer || {};
  const caseLang = useContext(CaseLang);
  return (
    <>
      <div style={{ display: "grid", gap: 8 }} lang={caseLang}>
        {step.options.map((o) => (
          <button key={o.id} data-option={o.id} onClick={() => setAnswer({ ...a, option: o.id })}
            style={{ ...S.choice, ...(a.option === o.id ? S.choiceOn : null) }}>{o.text}</button>
        ))}
      </div>
      {step.require_reason && (
        <>
          <div style={{ ...S.confLabel, opacity: a.option ? 1 : 0.45 }}>{t.why}</div>
          <div style={{ display: "grid", gap: 8, opacity: a.option ? 1 : 0.45,
                        pointerEvents: a.option ? "auto" : "none" }} lang={caseLang}>
            {step.reasons.map((r) => (
              <button key={r.id} data-reason={r.id} onClick={() => setAnswer({ ...a, reason: r.id })}
                style={{ ...S.choice, ...S.choiceSmall, ...(a.reason === r.id ? S.choiceOn : null) }}>
                {r.text}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* One decision at a time. Each choice goes to the server, which answers with
   the next situation or, at an ending, with the score. */
function Branching({ step, path, busy, onPick }) {
  const node = step.node;
  const caseLang = useContext(CaseLang);
  return (
    <div lang={caseLang}>
      {path.map((p, i) => <div key={i} style={S.pathEcho}>↳ {p.text}</div>)}
      <Prose text={node.text} />
      {!node.terminal && (
        <div style={{ display: "grid", gap: 8 }}>
          {node.options.map((o) => (
            <button key={o.id} data-option={o.id} disabled={busy}
              onClick={() => onPick({ id: o.id, text: o.text })}
              style={{ ...S.choice, ...(busy ? { opacity: 0.6 } : null) }}>{o.text}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- feedback -------------------------------- */

/* ------------------------------ the sealed prediction ----------------------------- */

const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) return null;
  return hexOf(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return hexOf(a.buffer);
}

/* Shown on a step before it is answered: the digest only. */
function SealChip({ t, seal, explain }) {
  return (
    <div style={S.sealWrap} data-seal={seal.digest}>
      <div style={S.sealChip} title={t.sealWhy}>
        <Icon name="seal" size={13} />
        <span>{t.sealShort}</span>
        <span style={S.sealDigest} aria-label={t.sealCode}>{seal.digest.slice(0, 8)}</span>
      </div>
      {explain && <p style={S.sealExplain}>{t.sealWhy}</p>}
    </div>
  );
}

/* Shown with the result: the number, the person's own bet, and whether the
   digest recomputed in the browser matches the one shown before the answer. */
function SealBox({ t, lang, seal, shownDigest, confidence, outcome }) {
  const [check, setCheck] = useState("pending");
  useEffect(() => {
    let stop = false;
    sha256Hex(seal.commitment).then((hex) => {
      if (stop) return;
      if (hex == null) { setCheck("unavailable"); return; }
      const same = hex === seal.digest && (shownDigest == null || shownDigest === seal.digest);
      setCheck(same ? "ok" : "broken");
    }).catch(() => { if (!stop) setCheck("unavailable"); });
    return () => { stop = true; };
  }, [seal.commitment, seal.digest, shownDigest]);
  const right = outcome >= SUCCESS_THRESHOLD;
  const note = check === "ok" ? (seal.shown === false ? t.sealLate : t.sealChecked)
    : check === "broken" ? t.sealBroken
      : check === "unavailable" ? fill(t.sealNoCheck, { c: seal.commitment }) : "…";
  return (
    <div style={S.sealBox} data-seal-check={check}>
      <div style={S.sealHead}><Icon name="seal" size={13} /> {t.sealOpened}</div>
      <div style={S.sealFacts}>
        <span><span style={S.sealLabel}>{t.sealTwin}</span> <strong>{pct(seal.p, lang)}</strong></span>
        {confidence != null && (
          <span><span style={S.sealLabel}>{t.sealYou}</span> <strong>{pct(confidence, lang)}</strong></span>
        )}
        <span>
          <span style={S.sealLabel}>{t.sealResult}</span>{" "}
          <strong style={{ color: right ? GOOD : ACCENT }}>{right ? t.sealRight : t.sealWrong}</strong>
        </span>
      </div>
      <p style={{ ...S.sealBoxNote, color: check === "broken" ? ACCENT : MUTED }}>{note}</p>
    </div>
  );
}

function Feedback({ t, lang, step, result, twin, history, answer, path, last, files: list,
                    shownDigest, confidence, onNext }) {
  const verdict = result.verdict ?? verdictOf(result.outcome);
  const colour = VERDICT_INK[verdict];
  const gained = result.points ?? 0;
  const dimension = result.twin?.dimension ?? step.dimension;
  const before = result.twin?.before ?? null;
  const after = result.twin?.after ?? null;
  const model = useMemo(() => twinModel(history, twin), [history, twin]);
  // The petal starts where it stood before this answer and moves to where it is now.
  const from = useMemo(() => DIMS.flatMap((d) => {
    const m = model[d];
    if (d !== dimension || before == null) return [m.p, m.lo, m.hi];
    return [sigmoid(before), sigmoid(before - Z80 * m.se), sigmoid(before + Z80 * m.se)];
  }), []);
  return (
    <section style={S.card} data-screen="feedback">
      <div data-verdict={verdict} style={{ ...S.verdict, color: colour, borderColor: colour }}>
        {t[verdict]}
        <span style={{ ...S.delta, color: gained >= 0 ? GOOD : ACCENT }}>
          {gained >= 0 ? "+" : ""}{num1(gained, lang)} {t.earned}
        </span>
      </div>

      {result.ending && (
        <div style={S.ending}>
          <div style={S.takeCap}>{t.endingCap}</div>
          <Prose text={result.ending} style={S.endingBody} />
        </div>
      )}

      <Prose text={result.feedback} />

      {result.reveal ? (
        <div style={S.reveal} data-reveal={result.reveal.kind}>
          <div style={S.revealHead}>{t.answersHead}</div>
          <Reveal t={t} lang={lang} step={step} reveal={result.reveal}
            answer={answer} path={path} />
        </div>
      ) : result.reveal_pending ? (
        <p style={S.pending} data-reveal="pending">{t.answersPending}</p>
      ) : null}

      <Files t={t} lang={lang} files={list} />

      {result.seal && (
        <SealBox t={t} lang={lang} seal={result.seal} shownDigest={shownDigest}
          confidence={confidence} outcome={result.outcome} />
      )}

      <div style={S.twinBox}>
        <div style={S.twinCap}>{t.twinMoved}</div>
        <div className="rose-mini">
          <Rose model={model} lang={lang} t={t} selected={dimension} from={from} compact />
        </div>
        {before != null && after != null && (
          <div style={S.twinDelta}>
            <Glyph dim={dimension} size={15} colour={ACCENT} />
            <span>{DIM_LABEL[lang][dimension]}</span>
            <span style={S.twinMove}>
              {pct(sigmoid(before), lang)}
              <span aria-hidden="true" style={{ color: LINE }}> → </span>
              <strong style={{ color: after >= before ? GOOD : ACCENT }}>
                {pct(sigmoid(after), lang)}
              </strong>
            </span>
          </div>
        )}
      </div>

      <button onClick={onNext} data-action="next" style={S.primary}>
        {last ? t.finish : t.next}
      </button>
    </section>
  );
}

/* --------------------------------- styles --------------------------------- */

const CSS = `${THEME_CSS}

.tw, .run, .door { font-variant-numeric: tabular-nums; }
.tw { max-width: 1120px; margin: 0 auto; }
.run, .door { max-width: 680px; margin: 0 auto; }
.door-landing { max-width: 1060px; }
.landing { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; }
.landing-intro { min-width: 0; padding: 4px 2px 0; }
@media (min-width: 900px) {
  .landing { grid-template-columns: minmax(0, 1.12fr) minmax(0, .88fr); gap: 28px 40px;
             align-items: start; }
  .landing > .landing-card { position: sticky; top: 16px; }
}
.tw-first { display: grid; gap: 14px; padding-top: 14px; }
.tw-first > [data-panel="cases"] { margin-top: 8px; }
.phone-only { display: none !important; }
@media (max-width: 720px) { .phone-only { display: flex !important; } }
.tw-hero { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px 36px; }
.tw-rose-col, .tw-side { min-width: 0; }
@media (min-width: 900px) { .tw-rose-col { align-self: center; } }
.tw-side { display: grid; gap: 16px; align-content: start; }
.tw-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; margin-top: 14px; }
.case-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
@media (min-width: 900px) {
  .tw-hero { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); }
  .tw-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .case-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
}

.tw-badge-top { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px 36px; }
@media (min-width: 760px) { .tw-badge-top { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.tw-marks { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px 22px; margin: 8px 0 2px; }
@media (min-width: 620px) { .tw-marks { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 980px) { .tw-marks { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.tw-fold { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .28s ease; }
.tw-fold[data-open="1"] { grid-template-rows: 1fr; }
.tw-fold-in { overflow: hidden; min-height: 0; visibility: hidden; transition: visibility 0s .28s; }
.tw-fold[data-open="1"] .tw-fold-in { visibility: visible; transition: visibility 0s; }
.tw-titles-btn { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto;
                 align-items: center; column-gap: 10px; }
.tw-chevron { color: ${MUTED}; justify-self: end; transition: transform .28s ease; }
@media (max-width: 559px) {
  .tw-titles-btn { grid-template-columns: auto minmax(0, 1fr) auto; row-gap: 6px; }
  .tw-titles-btn > :nth-child(1) { grid-area: 1 / 1; }
  .tw-titles-btn > :nth-child(2) { grid-area: 1 / 2; }
  .tw-titles-btn > .tw-chevron { grid-area: 1 / 3; }
  .tw-titles-btn > .tw-titles-strip { grid-area: 2 / 1 / 3 / 4; }
}
.tw-chevron[data-open="1"] { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) {
  .tw-fold, .tw-fold-in, .tw-chevron { transition: none; }
}

.rose-wrap { width: min(100%, 540px); margin: 0 auto; }
.rose { width: 100%; height: auto; display: block; overflow: visible; }
.rose-mini { width: min(100%, 220px); margin: 2px auto 0; }
.petal { cursor: pointer; outline: none; }
.petal-shape { transition: opacity .3s ease; }
.rose-compact .petal { cursor: default; }
.petal:focus-visible .petal-body { stroke: ${TEXT}; stroke-width: 2.6; }
.rose-label { font-family: ${DISPLAY}; font-size: 14.5px; font-weight: 600; letter-spacing: .01em; }
.rose-centre { font-family: ${DISPLAY}; font-size: 21px; font-weight: 700; fill: ${TEXT};
               font-stretch: 112%; }
.rose-centre-cap { font-family: ${DISPLAY}; font-size: 9.5px; fill: ${MUTED}; }
.bead-new { animation: bead 1.5s ease-out 2; transform-box: fill-box; transform-origin: center; }
@keyframes bead { 0% { transform: scale(1) } 30% { transform: scale(2.2) } 100% { transform: scale(1) } }

.area-row { transition: background .15s; }
.area-row:hover { background: var(--soft); }
.case-row { transition: border-color .15s, box-shadow .2s; }
.case-row:hover { border-color: var(--line-strong); box-shadow: 0 8px 22px -14px rgba(43,43,43,.5); }
.replay-range { width: 100%; margin: 0; accent-color: ${ACCENT}; }
.mirror-axis, .mirror-tick { font-family: ${DISPLAY}; font-size: 10px; fill: ${MUTED}; }
.mirror-n { font-family: ${DISPLAY}; font-size: 9px; fill: var(--faint); }

.word { cursor: pointer; padding: 1px 2px; margin: 0 1px; border-radius: 3px;
        transition: background .12s, box-shadow .12s; display: inline-block; }
.word:hover { background: var(--fill); }
.word.picked { background: rgba(192,0,0,.15); box-shadow: inset 0 -2px 0 ${ACCENT}; }

.rv-word { padding: 1px 2px; margin: 0 1px; border-radius: 3px; display: inline-block; }
.rv-target, .rv-hit { background: rgba(192,0,0,.14); box-shadow: inset 0 -2px 0 ${ACCENT}; }
.rv-miss { box-shadow: inset 0 -2px 0 ${ACCENT};
           background: repeating-linear-gradient(135deg, rgba(192,0,0,.13) 0 3px, transparent 3px 7px); }
.rv-extra { background: var(--fill); color: var(--muted); text-decoration: line-through;
            text-decoration-color: var(--faint); }
.rv-swatch { display: inline-block; width: 18px; height: 11px; border-radius: 3px;
             margin-right: 6px; vertical-align: -1px; padding: 0; }

.rise { animation: rise .5s cubic-bezier(.22,.9,.28,1) both; }
@keyframes rise { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
.pop { animation: rise .5s cubic-bezier(.22,.9,.28,1) both; }

button:focus-visible, textarea:focus-visible, select:focus-visible, input:focus-visible,
summary:focus-visible, a:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  .petal-shape, .case-row, .area-row, .word { transition: none; }
  .bead-new, .rise, .pop { animation: none; }
}
`;

const SMALL = { fontSize: 12.5, lineHeight: 1.5 };

const S = {
  root: { padding: "0 16px 44px", background: PAPER, color: TEXT, fontFamily: DISPLAY },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, padding: "18px 2px 12px" },
  twinHead: { display: "flex", alignItems: "flex-end", justifyContent: "space-between",
              gap: 12, padding: "22px 2px 14px" },
  h1: { margin: 0, fontSize: 27, fontWeight: 700, letterSpacing: "-.02em",
        fontStretch: "112%", lineHeight: 1.1 },
  lede: { margin: "6px 0 0", fontSize: 14, lineHeight: 1.5, color: MUTED, maxWidth: "60ch" },
  h2: { margin: "2px 0 12px", fontSize: 20, fontWeight: 700, letterSpacing: "-.015em",
        lineHeight: 1.25, fontStretch: "106%" },
  seg: { display: "flex", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden",
         background: CARD, flexShrink: 0 },
  segBtn: { padding: "6px 10px", minHeight: 34, background: "none", border: "none",
            color: MUTED, fontFamily: DISPLAY, fontSize: 12, fontWeight: 600, cursor: "pointer" },
  segOn: { background: "var(--fill)", color: TEXT },
  back: { background: "none", border: "none", color: MUTED, fontFamily: DISPLAY,
          fontSize: 13.5, cursor: "pointer", padding: "6px 2px", minHeight: 36 },

  progress: { display: "flex", alignItems: "center", gap: 5 },
  progressDot: { width: 18, height: 4, borderRadius: 99, background: "var(--line)" },
  progressNow: { background: TEXT },
  progressDone: { background: ACCENT },
  progressText: { fontSize: 12, color: MUTED, marginLeft: 6 },

  /* The hero: one white stage for the rose and its readout. */
  hero: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 20,
          padding: "18px 18px 20px" },
  howTo: { marginTop: 6, padding: "0 4px" },
  howToHead: { cursor: "pointer", fontSize: 13, fontWeight: 600, color: TEXT, padding: "6px 0" },
  howToBody: { ...SMALL, color: MUTED, margin: "4px 0 0", maxWidth: "62ch" },

  replay: { display: "flex", alignItems: "center", gap: 12, margin: "6px auto 0",
            maxWidth: 500, padding: "0 2px", flexWrap: "wrap" },
  playBtn: { width: 38, height: 38, borderRadius: 99, border: `1px solid ${LINE}`,
             background: CARD, color: ACCENT, display: "inline-flex", alignItems: "center",
             justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  replayTrack: { flex: 1, minWidth: 150, display: "grid", gap: 2 },
  replayCap: { fontSize: 11.5, color: MUTED },
  replayWhen: { fontSize: 12.5, fontWeight: 600, minWidth: 58, textAlign: "right" },
  quiet: { background: "none", border: `1px solid ${LINE}`, borderRadius: 10, color: TEXT,
           fontFamily: DISPLAY, fontSize: 13.5, padding: "0 14px", minHeight: 44,
           cursor: "pointer" },
  quietSmall: { background: "none", border: "none", color: ACCENT, fontFamily: DISPLAY,
                fontSize: 12.5, fontWeight: 600, padding: "6px 0", cursor: "pointer" },

  summary: { display: "grid", gap: 14 },
  facts: { display: "grid", gap: 12, margin: 0 },
  fact: { display: "grid", gap: 3 },
  factLabel: { fontSize: 12.5, color: MUTED },
  factValue: { margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 16,
               fontWeight: 600, letterSpacing: "-.01em", flexWrap: "wrap" },
  factAside: { fontSize: 13, color: MUTED, fontWeight: 500 },
  figures: { display: "flex", gap: 34, paddingTop: 12, borderTop: `1px solid ${LINE}` },
  figure: { fontSize: 26, fontWeight: 700, letterSpacing: "-.02em", fontStretch: "110%",
            lineHeight: 1.1 },
  figureCap: { fontSize: 12.5, color: MUTED, marginTop: 3 },

  detail: { display: "grid", gap: 0 },
  detailHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  detailTitle: { margin: 0, fontSize: 18.5, fontWeight: 700, letterSpacing: "-.015em",
                 lineHeight: 1.25 },
  detailAbout: { ...SMALL, color: MUTED, margin: "2px 0 12px" },
  detailActions: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" },
  strong: { fontWeight: 700, color: ACCENT },
  spark: { width: "100%", height: 56, display: "block", margin: "8px 0 2px" },
  recentHead: { fontSize: 12.5, color: MUTED, margin: "10px 0 6px" },
  recent: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 },
  recentRow: { display: "flex", alignItems: "center", gap: 9, fontSize: 13.5 },
  recentTitle: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
                 whiteSpace: "nowrap" },
  recentWhen: { fontSize: 12, color: MUTED, flexShrink: 0 },

  next: { border: `1px solid ${ACCENT}`, borderRadius: 14, padding: "14px 16px 16px",
          background: "linear-gradient(180deg, var(--accent-soft), var(--card) 70%)" },
  nextCap: { fontSize: 12.5, fontWeight: 600, color: ACCENT },
  nextTitle: { fontSize: 18, fontWeight: 700, letterSpacing: "-.015em", lineHeight: 1.25,
               margin: "4px 0 6px", fontStretch: "106%" },
  nextWhy: { display: "flex", alignItems: "center", gap: 6, ...SMALL, color: MUTED },
  nextMeta: { display: "flex", gap: 14, fontSize: 12.5, color: MUTED, marginTop: 6 },

  areas: { display: "grid", gap: 2, borderTop: `1px solid ${LINE}`, paddingTop: 8 },
  areaRow: { display: "grid", gridTemplateColumns: "18px minmax(0, 1fr) minmax(70px, 30%) 42px",
             alignItems: "center", gap: 10, width: "100%", textAlign: "left", minHeight: 48,
             padding: "6px 8px", borderRadius: 10, border: "1px solid transparent",
             borderColor: "transparent",
             background: "none", color: TEXT, fontFamily: DISPLAY, cursor: "pointer" },
  areaRowOn: { background: "var(--accent-soft)", borderColor: "var(--accent-line)" },
  areaName: { display: "grid", gap: 1, minWidth: 0 },
  areaLabel: { fontSize: 13.5, fontWeight: 600, lineHeight: 1.25 },
  areaSub: { fontSize: 11.5, color: MUTED },
  areaBar: { position: "relative", height: 8, borderRadius: 99, background: "var(--fill)",
             overflow: "hidden" },
  areaBand: { position: "absolute", top: 0, bottom: 0, background: "var(--accent-line)" },
  areaFill: { position: "absolute", top: 2, bottom: 2, left: 0, borderRadius: 99 },
  areaPct: { fontSize: 13.5, fontWeight: 700, textAlign: "right" },

  card: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 16,
          padding: "18px 18px 20px", marginBottom: 12 },
  cardTitle: { margin: "0 0 8px", fontSize: 17, fontWeight: 700, letterSpacing: "-.015em",
               fontStretch: "106%" },
  mirrorSvg: { width: "100%", height: "auto", display: "block", maxWidth: 420 },

  sealRow: { display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" },
  levelName: { fontSize: 20, fontWeight: 700, letterSpacing: "-.02em", fontStretch: "110%" },
  levelSub: { fontSize: 13, color: MUTED, marginTop: 2 },
  sealNote: { fontSize: 12.5, lineHeight: 1.5, color: MUTED, margin: "6px 0 0", maxWidth: "34ch" },
  subHead: { fontSize: 13, fontWeight: 600, color: TEXT, margin: "14px 0 6px" },
  reqs: { display: "grid", gap: 7, margin: "6px 0 4px" },
  req: { display: "flex", alignItems: "center", gap: 9 },
  reqDot: { width: 8, height: 8, borderRadius: 99, flexShrink: 0 },
  reqLabel: { fontSize: 13.5, flex: 1 },
  reqDone: { fontSize: 12, fontWeight: 600, color: GOOD },
  nextHead: { display: "flex", alignItems: "center", gap: 8 },
  artGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(74px, 1fr))",
             gap: "10px 4px", margin: "8px 0 2px" },
  artCell: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
             gap: 3, minWidth: 0 },
  artName: { fontSize: 11, fontWeight: 600, lineHeight: 1.25, marginTop: 2,
             fontStretch: "90%", whiteSpace: "nowrap", letterSpacing: "-.01em" },
  artSub: { fontSize: 11, lineHeight: 1.2 },
  badgeCard: { marginBottom: 14 },
  titlesBox: { borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`,
               margin: "14px 0 0" },
  marksBox: { borderBottom: `1px solid ${LINE}` },
  titlesToggle: { width: "100%", minHeight: 50, padding: "8px 2px", background: "none",
                  border: "none", color: TEXT, fontFamily: DISPLAY, textAlign: "left",
                  cursor: "pointer" },
  titlesHead: { fontSize: 14, fontWeight: 600 },
  titlesCount: { justifySelf: "start", fontSize: 12, fontWeight: 600, color: MUTED,
                 border: `1px solid ${LINE}`, borderRadius: 99, padding: "1px 8px" },
  titlesStrip: { display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" },
  markRow: { display: "flex", alignItems: "flex-start", gap: 10 },
  markName: { fontSize: 13, fontWeight: 600, lineHeight: 1.3 },
  markWhat: { fontSize: 12, lineHeight: 1.45, color: MUTED },
  markWhen: { fontSize: 11.5, lineHeight: 1.4, color: GOOD, fontWeight: 600, marginTop: 2 },
  handTag: { fontSize: 10.5, fontWeight: 600, color: MUTED, border: `1px solid ${LINE}`,
             borderRadius: 99, padding: "0 6px", marginLeft: 6, whiteSpace: "nowrap" },
  groupHead: { fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase",
               color: MUTED, margin: "10px 0 0" },

  casesSection: { marginTop: 22 },
  casesHead: { display: "flex", alignItems: "baseline", gap: 10, padding: "0 2px" },
  casesTitle: { margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: "-.02em",
                fontStretch: "110%" },
  casesCount: { fontSize: 13, color: MUTED },
  filters: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
             margin: "12px 0 12px" },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36,
          padding: "0 12px", borderRadius: 99, border: `1px solid ${LINE}`, borderColor: LINE,
          background: CARD,
          color: TEXT, fontFamily: DISPLAY, fontSize: 13, cursor: "pointer" },
  chipOn: { background: TEXT, borderColor: TEXT, color: "var(--card)" },
  chipN: { fontSize: 11.5, opacity: 0.7 },
  langBadge: { display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
               color: MUTED, border: `1px solid ${LINE}`, borderRadius: 4, padding: "0 5px",
               lineHeight: "17px" },
  areaSelect: { minHeight: 36, borderRadius: 99, border: `1px solid ${LINE}`, background: CARD,
                color: TEXT, fontFamily: DISPLAY, fontSize: 13, padding: "0 12px",
                maxWidth: "100%" },
  caseRow: { display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
             cursor: "pointer", background: CARD, border: `1px solid ${LINE}`, borderRadius: 14,
             padding: "12px 14px", color: TEXT, fontFamily: DISPLAY, minHeight: 72 },
  caseGlyph: { width: 40, height: 40, borderRadius: 99, background: "var(--accent-soft)", flexShrink: 0,
               display: "inline-flex", alignItems: "center", justifyContent: "center" },
  caseMain: { display: "grid", gap: 3, flex: 1, minWidth: 0 },
  caseKind: { fontSize: 12, fontWeight: 600, color: ACCENT },
  caseTitle: { fontSize: 15.5, fontWeight: 700, letterSpacing: "-.01em", lineHeight: 1.3 },
  caseMeta: { display: "flex", gap: 12, fontSize: 12, color: MUTED },
  status: { fontSize: 12, fontWeight: 600, borderRadius: 99, padding: "3px 9px",
            whiteSpace: "nowrap", flexShrink: 0, border: "1px solid transparent",
            borderColor: "transparent" },
  status_new: { color: TEXT, background: "var(--fill)" },
  status_half: { color: WARN, background: "var(--warn-soft)", borderColor: "var(--warn-line)" },
  status_done: { color: GOOD, background: "var(--good-soft)" },
  status_dismissed: { color: MUTED, background: "var(--fill)" },
  status_voided: { color: MUTED, background: "var(--fill)", borderColor: LINE },
  status_revealed: { color: ACCENT, background: "var(--accent-soft)", borderColor: "var(--accent-line)" },
  more2: { display: "block", margin: "12px auto 0", minHeight: 42, padding: "0 18px",
           borderRadius: 99, border: `1px solid ${LINE}`, background: CARD, color: TEXT,
           fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },

  introTop: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              marginBottom: 6 },
  introAreas: { display: "flex", gap: 6, flexWrap: "wrap" },
  versionBox: { margin: "6px 0 14px", padding: "12px 14px", borderRadius: 12,
                background: "var(--soft)", border: `1px solid ${LINE}` },
  versionHead: { fontSize: 13.5, fontWeight: 700, marginBottom: 8 },
  versionSeg: { display: "inline-flex", gap: 4, padding: 3, borderRadius: 99,
                border: `1px solid ${LINE}`, background: CARD, maxWidth: "100%" },
  versionBtn: { minHeight: 36, minWidth: 96, padding: "0 14px", borderRadius: 99,
                border: "1px solid transparent", borderColor: "transparent",
                background: "transparent", color: TEXT, fontFamily: DISPLAY, fontSize: 13.5,
                fontWeight: 600, cursor: "pointer" },
  versionOn: { background: TEXT, borderColor: TEXT, color: "var(--card)" },
  versionNote: { ...SMALL, color: MUTED, margin: "8px 0 0" },
  voidBox: { marginTop: 14, padding: "12px 14px", borderRadius: 12, background: "var(--soft)",
             border: `1px solid ${LINE}`, borderLeft: `4px solid ${MUTED}` },
  voidHead: { fontSize: 14.5, fontWeight: 700, marginBottom: 4 },
  voidText: { ...SMALL, color: TEXT, margin: "4px 0 0" },
  areaChip: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12,
              fontWeight: 600, color: ACCENT, background: "var(--accent-soft)", borderRadius: 99,
              padding: "3px 9px 3px 7px" },
  dimTag: { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5,
            fontWeight: 600, color: ACCENT, marginBottom: 10, background: "var(--accent-soft)",
            borderRadius: 99, padding: "5px 12px 5px 9px" },
  prompt: { fontSize: 16, lineHeight: 1.5, fontWeight: 600, margin: "0 0 14px",
            letterSpacing: "-.01em" },
  body: { fontSize: 14.5, lineHeight: 1.6, margin: "0 0 14px" },
  help: { ...SMALL, color: MUTED, margin: "10px 0 0" },

  passage: { fontSize: 14.5, lineHeight: 1.9, background: "var(--soft)",
             border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 12px 10px",
             userSelect: "none" },
  counter: { fontSize: 12, color: MUTED, marginTop: 8, textAlign: "right" },

  source: { border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 12px 10px" },
  citation: { fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 },
  pillRow: { display: "flex", gap: 8 },
  pill: { flex: 1, minHeight: 40, borderRadius: 8, border: `1px solid ${LINE}`,
          borderColor: LINE, background: CARD, color: MUTED, fontFamily: DISPLAY, fontSize: 13.5, cursor: "pointer" },
  pillGood: { background: GOOD, borderColor: GOOD, color: "var(--on-accent)", fontWeight: 600 },
  pillBad: { background: ACCENT, borderColor: ACCENT, color: "var(--on-accent)", fontWeight: 600 },

  textarea: { width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${LINE}`,
              fontFamily: DISPLAY, fontSize: 14.5, lineHeight: 1.55, resize: "vertical",
              background: "var(--soft)", color: TEXT },

  choice: { width: "100%", textAlign: "left", padding: "12px 14px", minHeight: 46,
            borderRadius: 10, border: `1px solid ${LINE}`, borderColor: LINE,
            background: CARD, color: TEXT,
            fontFamily: DISPLAY, fontSize: 14, lineHeight: 1.45, cursor: "pointer" },
  choiceSmall: { fontSize: 13.5, padding: "10px 13px" },
  choiceOn: { borderColor: ACCENT, background: "rgba(192,0,0,.06)", fontWeight: 600 },
  pathEcho: { fontSize: 12.5, color: MUTED, marginBottom: 8 },

  confLabel: { display: "flex", alignItems: "center", gap: 7,
               fontSize: 13.5, fontWeight: 600, margin: "18px 0 8px" },
  confRow: { display: "flex", gap: 6 },
  confBtn: { flex: 1, minHeight: 42, borderRadius: 8, border: `1px solid ${LINE}`,
             borderColor: LINE, background: CARD, color: MUTED, fontFamily: DISPLAY, fontSize: 13.5,
             fontWeight: 600, cursor: "pointer" },
  confOn: { background: ACCENT, borderColor: ACCENT, color: "var(--on-accent)" },

  primary: { width: "100%", minHeight: 48, marginTop: 18, borderRadius: 11, border: "none",
             background: ACCENT, color: "var(--on-accent)", fontFamily: DISPLAY, fontSize: 15,
             fontWeight: 600, cursor: "pointer" },
  disabled: { background: "var(--line)", color: "var(--faint)", cursor: "not-allowed" },
  skipButton: { width: "100%", minHeight: 44, marginTop: 8, borderRadius: 11,
                border: `1px solid ${LINE}`, background: CARD, color: TEXT, fontFamily: DISPLAY,
                fontSize: 14, fontWeight: 600, cursor: "pointer" },

  verdict: { display: "flex", alignItems: "baseline", justifyContent: "space-between",
             gap: 10, fontSize: 18, fontWeight: 700, paddingBottom: 10, marginBottom: 14,
             borderBottom: "2px solid", fontStretch: "108%" },
  delta: { fontSize: 14, fontWeight: 600 },

  reveal: { borderTop: `1px solid ${LINE}`, paddingTop: 12, margin: "4px 0 16px" },
  revealHead: { fontSize: 14, fontWeight: 700, marginBottom: 10 },
  pending: { ...SMALL, color: MUTED, background: "var(--soft)", border: `1px dashed var(--line-strong)`,
             borderRadius: 10, padding: "10px 12px", margin: "0 0 14px" },
  legend: { display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 12, color: MUTED },
  legendItem: { display: "inline-flex", alignItems: "center" },
  rvItem: { border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px" },
  rvItemTop: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 },
  truthChip: { fontSize: 12, fontWeight: 700, borderRadius: 99, padding: "2px 9px" },
  truthReal: { color: GOOD, background: "var(--good-soft)" },
  truthFake: { color: ACCENT, background: "var(--accent-soft)" },
  rvMine: { fontSize: 12.5, fontWeight: 600 },
  rvCitation: { fontSize: 13, lineHeight: 1.5 },
  rvEvidence: { ...SMALL, color: MUTED, marginTop: 6, paddingLeft: 10,
                borderLeft: `2px solid ${LINE}` },
  rvOption: { display: "grid", gap: 4, borderRadius: 10, padding: "10px 12px", fontSize: 14,
              lineHeight: 1.45, border: "1px solid" },
  rvOptionRight: { borderColor: "var(--good-line)", background: "var(--good-soft)" },
  rvOptionWrong: { borderColor: "var(--accent-line)", background: "var(--accent-soft)" },
  rvTag: { fontSize: 12, fontWeight: 700 },
  rvReason: { display: "grid", gridTemplateColumns: "112px minmax(0, 1fr)", gap: 10,
              alignItems: "start", fontSize: 13.5, lineHeight: 1.45 },
  rvWeight: { fontSize: 11.5, fontWeight: 700, color: MUTED, borderRadius: 6,
              padding: "3px 7px", background: "var(--fill)", textAlign: "center" },
  rvWeightTop: { color: "var(--on-accent)", background: GOOD },
  rvWeightPart: { color: WARN, background: "var(--warn-soft)" },
  rvReasonText: { minWidth: 0 },
  rvYours: { color: ACCENT, fontWeight: 600 },
  rules: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 },
  rule: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 13.5, lineHeight: 1.4 },
  ruleMark: { width: 18, flexShrink: 0, fontWeight: 700, textAlign: "center", color: MUTED },
  ruleOk: { color: GOOD },
  ruleBad: { color: ACCENT },
  ruleKind: { fontSize: 12, color: MUTED, width: 52, flexShrink: 0 },
  ruleLabel: { flex: 1, minWidth: 0 },
  ruleState: { fontSize: 12, fontWeight: 600, flexShrink: 0 },
  bestPath: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 },
  bestStep: { display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)", gap: 10 },
  bestNo: { width: 24, height: 24, borderRadius: 99, background: TEXT, color: "var(--card)",
            fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center",
            justifyContent: "center" },
  bestSituation: { ...SMALL, color: MUTED, margin: "2px 0 4px" },
  bestChoice: { fontSize: 14, fontWeight: 600, lineHeight: 1.45, color: GOOD },
  diverged: { fontSize: 12.5, color: ACCENT, fontWeight: 600, marginTop: 4 },
  bestEnd: { marginLeft: 34, background: "var(--soft)", border: `1px solid ${LINE}`,
             borderLeft: `3px solid ${GOOD}`, borderRadius: 10, padding: "10px 12px 2px" },

  meter: { marginTop: 12 },
  meterTrack: { height: 8, borderRadius: 99, background: "var(--fill)", overflow: "hidden" },
  meterFill: { height: "100%", background: ACCENT, borderRadius: 99 },
  meterText: { fontSize: 12.5, color: MUTED, marginTop: 6 },

  solFirst: { paddingTop: 2 },
  foldHead: { cursor: "pointer", fontSize: 15, fontWeight: 700, padding: "2px 0" },
  solStep: { paddingTop: 16, marginTop: 16, borderTop: `1px solid ${LINE}` },
  solHead: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 },
  solNo: { fontSize: 12, fontWeight: 700, color: "var(--card)", background: TEXT, borderRadius: 99,
           padding: "2px 9px" },
  solArea: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5,
             fontWeight: 600, color: ACCENT },
  solVerdict: { fontSize: 12.5, fontWeight: 600, marginLeft: "auto" },
  solPrompt: { fontSize: 14.5, fontWeight: 600, lineHeight: 1.5, margin: "0 0 10px" },

  twinBox: { marginTop: 16, paddingTop: 12, borderTop: `1px solid ${LINE}` },
  sealWrap: { margin: "-2px 0 12px" },
  sealChip: { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12,
              color: MUTED, border: `1px solid ${LINE}`, borderRadius: 99,
              padding: "3px 10px 3px 8px", background: "var(--soft)" },
  sealDigest: { fontVariantNumeric: "tabular-nums", letterSpacing: ".06em", color: TEXT,
                fontWeight: 600 },
  sealExplain: { ...SMALL, color: MUTED, margin: "6px 0 0", maxWidth: 560 },
  sealBox: { marginTop: 14, padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 10,
             background: "var(--soft)" },
  sealHead: { fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 6 },
  sealFacts: { display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 14 },
  sealLabel: { color: MUTED, fontSize: 12.5 },
  sealBoxNote: { ...SMALL, margin: "8px 0 0" },
  parts: { display: "grid", gap: 8 },
  partRow: { display: "grid", gridTemplateColumns: "92px 54px minmax(0, 1fr)", alignItems: "baseline",
             gap: 8 },
  partName: { fontSize: 13, fontWeight: 600 },
  partValue: { fontSize: 13, fontVariantNumeric: "tabular-nums" },
  partHelp: { ...SMALL, color: MUTED },
  twinCap: { fontSize: 12.5, fontWeight: 600, color: MUTED, marginBottom: 2 },
  twinDelta: { display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
               fontSize: 13.5, flexWrap: "wrap", marginTop: 4 },
  twinMove: { fontWeight: 600 },

  takeaway: { background: "var(--soft)", border: `1px solid ${LINE}`, borderRadius: 10,
              padding: "12px 14px", marginTop: 6 },
  takeCap: { fontSize: 12.5, fontWeight: 700, color: ACCENT, marginBottom: 5 },
  takeBody: { fontSize: 14.5, lineHeight: 1.55, margin: 0, fontWeight: 600 },

  join: { paddingTop: 8 },
  landingTitle: { margin: "6px 0 0", fontSize: "clamp(30px, 6.2vw, 44px)", fontWeight: 700,
                  letterSpacing: "-.028em", lineHeight: 1.04, fontStretch: "114%",
                  maxWidth: "16ch" },
  landingSub: { margin: "10px 0 0", fontSize: 15.5, fontWeight: 600, color: ACCENT,
                letterSpacing: "-.005em" },
  aboutLine: { margin: "12px 0 0", fontSize: 15, display: "flex", flexWrap: "wrap",
               gap: "6px 18px" },
  guideLine: { margin: "10px 0 0", fontSize: 14.5, color: MUTED },
  aboutLink: { color: ACCENT, fontWeight: 600, textDecoration: "underline",
               textUnderlineOffset: 3 },
  demoLine: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "16px 0 18px" },
  demoButton: { display: "inline-flex", alignItems: "center", padding: "8px 16px", minHeight: 38,
                borderRadius: 8, border: `1.5px solid ${ACCENT}`, color: ACCENT, fontWeight: 700,
                fontSize: 14, textDecoration: "none", background: CARD },
  demoHint: { fontSize: 13, color: MUTED, lineHeight: 1.45, flex: "1 1 220px" },
  training: { margin: "16px 0 0", padding: "12px 14px", borderRadius: 12, maxWidth: "62ch",
              background: "var(--accent-soft)", border: "1px solid var(--accent-line)" },
  trainingHead: { display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700,
                  color: TEXT },
  trainingText: { margin: "6px 0 10px", fontSize: 14, lineHeight: 1.55, color: TEXT },
  trainingLink: { display: "inline-flex", alignItems: "center", gap: 2, padding: "6px 12px",
                  minHeight: 34, borderRadius: 8, border: `1.5px solid ${ACCENT}`, color: ACCENT,
                  background: CARD, fontSize: 14, fontWeight: 700, textDecoration: "none" },
  toCases: { marginTop: 12, padding: "8px 16px", minHeight: 38, borderRadius: 8, border: "none",
             background: ACCENT, color: "var(--on-accent)", fontFamily: DISPLAY, fontSize: 14,
             fontWeight: 700, cursor: "pointer" },
  campusButton: { display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px",
                  minHeight: 38, borderRadius: 8, border: "none", color: "var(--on-accent)",
                  fontWeight: 700, fontSize: 14, textDecoration: "none", background: ACCENT },
  campusIcon: { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
                fontSize: 15, lineHeight: 1 },
  landingLede: { margin: "14px 0 0", fontSize: 15.5, lineHeight: 1.62, color: TEXT,
                 maxWidth: "54ch" },
  signInHead: { margin: "0 0 6px", fontSize: 19, fontWeight: 700, letterSpacing: "-.015em",
                fontStretch: "106%" },

  news: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 16,
          padding: "14px 16px 6px", marginTop: 22 },
  newsHead: { display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700,
              color: ACCENT, marginBottom: 2 },
  newsItem: { padding: "10px 0 12px", borderTop: `1px solid ${LINE}`, marginTop: 8 },
  newsTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between",
             gap: 10 },
  newsTitle: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-.012em",
               lineHeight: 1.3, overflowWrap: "anywhere" },
  newsClose: { flexShrink: 0, width: 34, height: 34, margin: "-6px -8px 0 0", border: "none",
               borderRadius: 99, background: "none", color: MUTED, cursor: "pointer",
               display: "inline-flex", alignItems: "center", justifyContent: "center" },
  newsDate: { fontSize: 12, color: MUTED, marginTop: 3 },
  newsEvent: { display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 13, marginTop: 6,
               color: TEXT },
  newsBody: { margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.58, whiteSpace: "pre-line",
              overflowWrap: "anywhere" },
  newsActions: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
                 marginTop: 6 },
  newsMore: { background: "none", border: "none", padding: "6px 0", minHeight: 34,
              color: TEXT, fontFamily: DISPLAY, fontSize: 13, fontWeight: 600,
              cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 },
  newsLink: { display: "inline-flex", alignItems: "center", minHeight: 34, color: ACCENT,
              fontSize: 13.5, fontWeight: 600, textUnderlineOffset: 3 },
  homeNews: { marginTop: 16 },
  newsHeadRow: { display: "flex", alignItems: "center", justifyContent: "space-between",
                 gap: 10, flexWrap: "wrap" },
  newsCount: { fontSize: 11.5, fontWeight: 700, color: "var(--on-accent)", background: ACCENT,
               borderRadius: 99, padding: "1px 8px", marginLeft: 4 },
  newsItemRead: { opacity: 0.78 },
  newsReadTag: { flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: MUTED,
                 border: `1px solid ${LINE}`, borderRadius: 99, padding: "1px 8px", marginTop: 2 },
  newsMarks: { display: "inline-flex", gap: 14, marginLeft: "auto" },
  newsSmall: { background: "none", border: "none", padding: "6px 0", minHeight: 34,
               color: MUTED, fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600,
               cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 },
  newsQuiet: { fontSize: 13, color: MUTED, lineHeight: 1.5, margin: "8px 0 8px" },

  caseImage: { margin: "-18px -18px 16px", aspectRatio: "3 / 2", overflow: "hidden",
               borderRadius: "15px 15px 0 0", background: "var(--fill)" },
  caseImageImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  langRow: { alignItems: "center", justifyContent: "space-between", gap: 10,
             background: CARD, border: `1px solid ${LINE}`, borderRadius: 12,
             padding: "8px 8px 8px 14px", margin: "0 0 12px" },
  langLabel: { fontSize: 14, fontWeight: 600 },
  doorTools: { display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap",
               justifyContent: "flex-end" },
  nameRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  nameField: { flex: 1, minWidth: 130, display: "block" },
  joinMark: { height: 26, width: "auto", display: "block", marginBottom: 12, opacity: 0.9 },
  joinHead: { display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10, padding: "18px 4px 14px" },
  input: { width: "100%", minHeight: 48, padding: "11px 13px", borderRadius: 10,
           border: `1px solid ${LINE}`, background: "var(--soft)", color: TEXT,
           fontFamily: DISPLAY, fontSize: 16, marginTop: 2 },
  sent: { fontSize: 13.5, color: GOOD, background: "rgba(78,124,89,.08)",
          border: `1px solid ${GOOD}`, borderRadius: 9, padding: "9px 12px",
          margin: "0 0 6px" },

  profileTop: { display: "flex", alignItems: "center", gap: 14, margin: "4px 0 6px" },
  profileName: { fontSize: 18, fontWeight: 700, letterSpacing: "-.015em", lineHeight: 1.25,
                 fontStretch: "106%", overflow: "hidden", textOverflow: "ellipsis",
                 whiteSpace: "nowrap" },
  profileHandle: { fontFamily: MONO, fontSize: 13, color: MUTED, marginTop: 2 },
  avatarGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))",
                gap: 6, maxHeight: 262, overflowY: "auto", padding: 2 },
  avatarPick: { display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 52, height: 52, borderRadius: 99, border: "2px solid transparent",
                borderColor: "transparent", background: "none", padding: 0, cursor: "pointer" },
  avatarPickOn: { borderColor: ACCENT },
  fieldError: { fontSize: 12.5, lineHeight: 1.45, color: ACCENT, marginTop: 6 },
  bioInput: { minHeight: 76, resize: "vertical", lineHeight: 1.45, fontSize: 15 },
  bioMeta: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline",
             ...SMALL, color: MUTED, marginTop: 6 },
  bioCount: { fontVariantNumeric: "tabular-nums", flexShrink: 0 },
  toggleRow: { display: "flex", alignItems: "flex-start", gap: 10, marginTop: 18,
               padding: "12px 12px", border: `1px solid ${LINE}`, borderRadius: 10,
               background: "var(--soft)", cursor: "pointer" },
  toggleNested: { marginTop: 8, marginLeft: 22 },
  toggleLabel: { display: "block", fontSize: 14, fontWeight: 600 },
  toggleHelp: { display: "block", ...SMALL, color: MUTED, marginTop: 3 },
  waitBox: { ...SMALL, fontSize: 13.5, color: WARN, background: "var(--warn-soft)",
             border: "1px solid var(--warn-line)", borderRadius: 10, padding: "10px 12px",
             margin: "0 0 12px" },
  rejectBox: { ...SMALL, fontSize: 13.5, color: TEXT, background: "var(--accent-soft)",
               border: "1px solid var(--accent-line)", borderRadius: 10, padding: "10px 12px",
               margin: "0 0 12px" },
  rejectHead: { fontWeight: 700, color: ACCENT, marginBottom: 3 },
  editedBox: { ...SMALL, fontSize: 13.5, color: TEXT, background: "var(--soft)",
               border: `1px solid ${LINE}`, borderLeft: `3px solid ${ACCENT}`, borderRadius: 10,
               padding: "10px 12px", margin: "0 0 12px" },
  editedHead: { fontWeight: 700, marginBottom: 3 },
  okLine: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: GOOD,
            fontWeight: 600, margin: "0 0 10px" },
  suspReason: { background: "var(--soft)", border: `1px solid ${LINE}`, borderLeft: `3px solid ${ACCENT}`,
                borderRadius: 10, padding: "10px 12px", margin: "4px 0 6px" },
  suspReasonCap: { fontSize: 12.5, fontWeight: 700, color: ACCENT, marginBottom: 4 },
  suspReasonText: { fontSize: 14.5, lineHeight: 1.55, margin: 0 },

  files: { display: "grid", gap: 6, margin: "4px 0 16px" },
  filesHead: { fontSize: 13, fontWeight: 600, color: MUTED },
  file: { display: "flex", alignItems: "center", gap: 11, width: "100%", minHeight: 52,
          textDecoration: "none", padding: "9px 12px", borderRadius: 10,
          border: `1px solid ${LINE}`, background: "var(--soft)", cursor: "pointer",
          textAlign: "left", color: TEXT },
  fileIcon: { fontSize: 11, color: MUTED, border: `1px solid ${LINE}`, borderRadius: 6,
              padding: "3px 6px", background: CARD, flexShrink: 0 },
  fileMain: { flex: 1, display: "grid", gap: 1, minWidth: 0 },
  fileTitle: { fontSize: 14, fontWeight: 600 },
  fileCap: { fontSize: 12, color: MUTED },
  fileGo: { fontSize: 13, fontWeight: 600, color: ACCENT, whiteSpace: "nowrap" },
  filesNote: { fontSize: 12, color: MUTED, margin: "2px 0 0" },

  endCard: { borderColor: ACCENT, background:
             "linear-gradient(180deg, rgba(192,0,0,.05), transparent 60%)" },
  endTop: { display: "flex", alignItems: "center", gap: 16, marginBottom: 4 },
  endDone: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600,
             color: MUTED },
  endPoints: { fontSize: 32, fontWeight: 700, color: ACCENT, lineHeight: 1.1,
               letterSpacing: "-.02em", fontStretch: "110%" },
  endPointsCap: { fontSize: 13.5, color: MUTED, letterSpacing: 0, fontWeight: 500 },
  endNote: { display: "flex", alignItems: "center", gap: 10, marginTop: 10,
             padding: "10px 12px", borderRadius: 10, border: `1px solid ${LINE}`,
             background: CARD },
  endNoteCap: { fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" },
  endNoteBody: { fontSize: 14.5, fontWeight: 600 },
  endQuiet: { fontSize: 13.5, color: MUTED, lineHeight: 1.5, margin: "10px 0 0" },

  /* Quiet on purpose: the marks identify the system and stay in the
     background of every screen they sit on. */
  colophon: { display: "grid", gap: 7, justifyItems: "center", textAlign: "center",
              marginTop: 28, paddingTop: 16, borderTop: `1px solid ${LINE}`, opacity: 0.8 },
  colophonCompact: { display: "grid", gap: 6, justifyItems: "center",
                     textAlign: "center", marginTop: 16, paddingTop: 12,
                     borderTop: `1px solid ${LINE}`, opacity: 0.72 },
  colophonMarks: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                   justifyContent: "center" },
  markWide: { height: 22, width: "auto" },
  markSeal: { height: 22, width: "auto" },
  colophonName: { fontSize: 11, color: MUTED, lineHeight: 1.45, maxWidth: "52ch" },
  colophonSep: { color: LINE },
  credits: { display: "grid", gap: 1, marginTop: 2 },
  creditsCap: { fontSize: 11, fontWeight: 600, color: MUTED, marginBottom: 2 },
  creditRow: { display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap",
               alignItems: "baseline" },
  creditName: { fontSize: 11.5, fontWeight: 600, color: MUTED },
  creditRole: { fontSize: 11, color: MUTED },
  errorBox: { fontSize: 13, lineHeight: 1.5, color: ACCENT, background: "rgba(192,0,0,.07)",
              border: `1px solid ${ACCENT}`, borderRadius: 9, padding: "10px 12px",
              marginTop: 14 },
  offlineBox: { fontSize: 12.5, lineHeight: 1.55, color: WARN, background: "var(--warn-soft)",
                border: `1px solid var(--warn-line)`, borderRadius: 10, padding: "11px 13px",
                margin: "14px 2px 0" },

  paraBreak: { display: "block", height: 10 },
  lineBreak: { display: "block", height: 0 },
  ending: { background: "var(--soft)", border: `1px solid ${LINE}`, borderLeft: `3px solid ${MUTED}`,
            borderRadius: 10, padding: "10px 14px 2px", margin: "0 0 14px" },
  endingBody: { fontSize: 14, lineHeight: 1.55, margin: "0 0 8px", fontStyle: "italic" },
  more: { marginTop: 14, borderTop: `1px solid ${LINE}`, paddingTop: 10 },
  moreHead: { cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: TEXT,
              padding: "4px 0" },
  moreRow: { marginTop: 10 },
  moreNo: { fontSize: 12.5, fontWeight: 700, color: ACCENT },
  moreBody: { fontSize: 13.5, lineHeight: 1.55, margin: "4px 0 0", color: TEXT },
  sources: { display: "grid", gap: 4, marginTop: 14 },
  sourceLine: { fontSize: 12.5, lineHeight: 1.5, color: MUTED, overflowWrap: "anywhere" },
  link: { color: ACCENT },

  session: { border: `1px solid ${LINE}`, borderRadius: 14, padding: "12px 14px",
             background: CARD },
  sessionWait: { borderColor: "var(--warn-line)", background: "var(--warn-soft)" },
  sessionHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline",
                 gap: 10, flexWrap: "wrap", fontSize: 12.5, fontWeight: 600, color: TEXT },
  sessionWeek: { fontSize: 12, fontWeight: 500, color: MUTED },
  sessionBody: { fontSize: 13.5, lineHeight: 1.55, margin: "6px 0 0", color: TEXT },
  caseLocked: { opacity: 0.55, cursor: "not-allowed" },

  reportBar: { display: "flex", justifyContent: "flex-end", margin: "-6px 0 6px" },
  reportLink: { background: "none", border: "none", color: MUTED, fontFamily: DISPLAY,
                fontSize: 12.5, cursor: "pointer", padding: "6px 0", display: "inline-flex",
                alignItems: "center", gap: 5 },
  reportCard: { borderColor: "var(--warn-line)" },
  reportTitle: { margin: "0 0 4px", fontSize: 16, fontWeight: 700, display: "flex",
                 alignItems: "center", gap: 7 },
  reportChips: { display: "flex", flexWrap: "wrap", gap: 6 },
  reportKinds: { display: "grid", gap: 6 },
  reportKind: { textAlign: "left", minHeight: 42, borderRadius: 9, border: `1px solid ${LINE}`,
                borderColor: LINE, background: CARD, color: TEXT, fontFamily: DISPLAY, fontSize: 13.5,
                padding: "8px 12px", cursor: "pointer" },
  reportKindOn: { borderColor: ACCENT, boxShadow: `inset 0 0 0 1px ${ACCENT}`, color: ACCENT,
                  fontWeight: 600 },
  reportText: { width: "100%", borderRadius: 10, border: `1px solid ${LINE}`, padding: 10,
                fontFamily: DISPLAY, fontSize: 14, lineHeight: 1.5, resize: "vertical" },
  reportActions: { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 14,
                   alignItems: "center" },
  reportRow: { borderTop: `1px solid ${LINE}`, paddingTop: 10 },
  reportRowHead: { display: "flex", justifyContent: "space-between", gap: 10,
                   alignItems: "center" },
  reportRowTitle: { fontSize: 14, fontWeight: 600 },
  reportRowMeta: { fontSize: 12, color: MUTED, marginTop: 2 },
  reportNote: { fontSize: 13, lineHeight: 1.5, margin: "6px 0 0", color: TEXT },

  tipBox: { display: "flex", gap: 8, alignItems: "flex-start", background: "var(--warn-soft)",
            border: "1px solid var(--warn-line)", borderRadius: 10, padding: "9px 12px",
            margin: "0 0 12px", fontSize: 13.5, lineHeight: 1.5 },
  nudge: { fontSize: 13, lineHeight: 1.5, color: WARN, margin: "8px 0 0" },
};
