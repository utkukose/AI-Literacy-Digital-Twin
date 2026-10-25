import React, { useState, useEffect } from "react";
import { sha256Hex } from "./sha256.js";
import { THEME_CSS } from "./theme.jsx";
import { CREDITS } from "./credits.js";
import { ArtImage, AwardImage } from "./badgeArt.jsx";
import { awardList } from "./apiClient.js";
import { PLATFORM_MARKS, AWARD_GROUPS, platformMark } from "./marks.js";

/* ---------------------------------------------------------------------------
   About the platform.

   Two parts under one tab: a guide to the platform with how it measures and
   the science behind the measurement, and the people who made it. Open to
   anyone, signed in or not, so a person can read what happens to their answers
   before asking for a code.

   Every figure on this page is the platform's own: the formulas, the limits
   and the thresholds are the ones the server runs.
   --------------------------------------------------------------------------- */

const PAPER = "var(--paper)", CARD = "var(--card)", LINE = "var(--line)", SOFT = "var(--soft)";
const TEXT = "var(--text)", MUTED = "var(--muted)", ACCENT = "var(--accent)";
const DISPLAY = "'Archivo', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* The confidence levels a person picks from, and the share of a step's value
   the scoring rule gives for each outcome: 1 - 4(c - s)^2. */
const LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9];
const rule = (c, s) => 1 - 4 * (c - s) ** 2;
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/* Checked one by one against the publisher's record. Asterisks mark what APA
   sets in italics. */
const REFS = [
  "Rasch, G. (1960). *Probabilistic models for some intelligence and attainment tests*. Danish Institute for Educational Research.",
  "Elo, A. E. (1978). *The rating of chessplayers, past and present*. Arco Publishing.",
  "Pelánek, R. (2016). Applications of the Elo rating system in adaptive educational systems. *Computers & Education*, *98*, 169–179. https://doi.org/10.1016/j.compedu.2016.03.017",
  "Brier, G. W. (1950). Verification of forecasts expressed in terms of probability. *Monthly Weather Review*, *78*(1), 1–3. https://doi.org/10.1175/1520-0493(1950)078<0001:VOFEIT>2.0.CO;2",
  "Murphy, A. H. (1973). A new vector partition of the probability score. *Journal of Applied Meteorology*, *12*(4), 595–600. https://doi.org/10.1175/1520-0450(1973)012<0595:ANVPOT>2.0.CO;2",
  "Gneiting, T., & Raftery, A. E. (2007). Strictly proper scoring rules, prediction, and estimation. *Journal of the American Statistical Association*, *102*(477), 359–378. https://doi.org/10.1198/016214506000001437",
  "Fleming, S. M., & Lau, H. C. (2014). How to measure metacognition. *Frontiers in Human Neuroscience*, *8*, Article 443. https://doi.org/10.3389/fnhum.2014.00443",
  "Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin*, *132*(3), 354–380. https://doi.org/10.1037/0033-2909.132.3.354",
  "Grieves, M., & Vickers, J. (2017). Digital twin: Mitigating unpredictable, undesirable emergent behavior in complex systems. In F.-J. Kahlen, S. Flumerfelt, & A. Alves (Eds.), *Transdisciplinary perspectives on complex systems: New findings and approaches* (pp. 85–113). Springer International Publishing. https://doi.org/10.1007/978-3-319-38756-7_4",
  "Sweeney, L. (2002). k-anonymity: A model for protecting privacy. *International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems*, *10*(5), 557–570. https://doi.org/10.1142/S0218488502001648",
  "Nosek, B. A., Ebersole, C. R., DeHaven, A. C., & Mellor, D. T. (2018). The preregistration revolution. *Proceedings of the National Academy of Sciences*, *115*(11), 2600–2606. https://doi.org/10.1073/pnas.1708274114",
  "Long, D., & Magerko, B. (2020). What is AI literacy? Competencies and design considerations. In *Proceedings of the 2020 CHI Conference on Human Factors in Computing Systems* (pp. 1–16). Association for Computing Machinery. https://doi.org/10.1145/3313831.3376727",
  "Köse, U. (2026). *Yapay Zekâ Okuryazarlığı Eğitimi*. SDÜ Süleyman Demirel Üniversitesi Uzaktan Eğitim Uygulama ve Araştırma Merkezi. https://uzem.sdu.edu.tr/tr/haber/yapay-zek-okuryazarligi-egitimi-erisime-acildi-62530h.html",
];

const AREAS = ["prompt_design", "verification", "integrity", "privacy", "manipulation",
               "op_security", "boundaries"];
const AREA_ICON = { verification: "🔍", privacy: "🔒", prompt_design: "✍️", integrity: "🔗",
                    manipulation: "🎭", op_security: "🛡️", boundaries: "🚧" };

const PEOPLE = [
  { name: "Prof. Dr. Utku Köse", role: [CREDITS.tr.people[0][1], CREDITS.en.people[0][1]],
    photo: "utku-kose.webp",
    links: [["ORCID", "https://orcid.org/0000-0002-9652-6415"],
            ["utkukose.com", "https://utkukose.com"],
            ["GitHub", "https://github.com/utkukose"],
            ["LinkedIn", "https://www.linkedin.com/in/utku-k%C3%B6se-97b12532/"]] },
  { name: "Enes Şenol", role: [CREDITS.tr.people[1][1], CREDITS.en.people[1][1]],
    photo: "enes-senol.webp",
    links: [["LinkedIn", "https://www.linkedin.com/in/enes-senol-aa652b242/"]] },
];

/* The portraits sit in team/ next to the page, wherever the platform is served
   from. */
function teamSrc(file) {
  if (typeof document === "undefined") return `team/${file}`;
  const tag = document.querySelector("base[href]");
  const from = tag ? tag.getAttribute("href") : window.location.pathname;
  return `${from.endsWith("/") ? from : from.replace(/[^/]*$/, "")}team/${file}`;
}

/* A portrait, or the initials while there is none to show. */
function Portrait({ person }) {
  const [failed, setFailed] = useState(false);
  if (!person.photo || failed) {
    return (
      <div style={S.initials} aria-hidden="true">
        {person.name.replace(/^Prof\. Dr\. /, "").split(" ").map((w) => w[0]).join("")}
      </div>
    );
  }
  return (
    <img src={teamSrc(person.photo)} alt="" width="180" height="212" style={S.portrait}
      onError={() => setFailed(true)} data-portrait />
  );
}

const T = {
  tr: {
    tabHow: "Nasıl çalışır",
    tabUse: "Kullanım rehberi",
    tabTeam: "Ekip",
    back: "Girişe dön",
    useTitle: "Platform nasıl kullanılır?",
    useLede: "Bu rehber platformun ekranlarını ve sekmelerini görsellerle tanıtır. Görseller örnek verilerle hazırlanmıştır. Cevaplarından yetkinliğinin nasıl ölçüldüğünü merak edersen “Nasıl çalışır” bölümüne bakabilirsin.",
    useOpen: "Görseli büyük aç",
    use: [
      ["giris", "Giriş yapmak", [
        "Üniversite e-posta adresini yaz ve “Kod gönder” düğmesine bas. E-postana gelen altı haneli kodu gir. Parola gerekmez.",
        "İlk girişte adın, soyadın, kullanıcı adın ve birimin sorulur. Sonra İkizim sekmesi açılır."]],
      ["sekmeler", "Sekmeler", [
        "Üst çubuktaki sekmelerle ekranlar arasında geçersin: İkizim, Vakalar, Kampüs, Sıralama ve Hakkında.",
        "Sağdaki avatarına basınca profilin açılır, soru işareti ise bu rehberi açar. Yanlarındaki düğmelerle ekranı açık ya da koyu görünüme alabilir, dili değiştirebilirsin. Telefonda bu düğmeler ve rehberin bağlantısı profil ekranındadır."]],
      ["rozet", "İkizim: Rozet", [
        "İkizim sekmesi rozetinle açılır. Seviyeni ve bir sonraki seviyenin istediklerini burada görürsün.",
        "Alan seviyeleri, nadir işaretler ve madalyalar birer satırda toplanır, satıra basınca açılır. Henüz kazanmadıkların gri görünür."]],
      ["gul", "İkizim: Gül grafiği", [
        "Gül grafiğinin her yaprağı bir alanı gösterir. Yaprak uzadıkça o alanda bir adımı doğru çözme olasılığın artar.",
        "Bir yaprağa basınca o alanın ayrıntıları açılır. Grafiğin altındaki çubukla ikizinin geçmişte nasıl göründüğüne bakabilirsin."]],
      ["duyurular", "Duyurular", [
        "Okumadığın duyurular İkizim sekmesinin üstünde durur. Çarpıya basınca duyuru okundu olarak işaretlenir ve oradan kalkar.",
        "“Tüm duyurular” listesinde okuduklarını yeniden açabilir, okunmadı olarak işaretleyebilir ya da silebilirsin. Bu bilgiler yalnızca kullandığın tarayıcıda tutulur."]],
      ["vakalar", "Vakalar", [
        "Vakalar sekmesinin üstünde ikizinin senin için seçtiği vaka ve neden seçildiği yer alır. Yarım bıraktığın bir vaka listenin en üstünde durur.",
        "Listeden istediğin vakayı açabilirsin. Türkçe ve İngilizce sürümü olan bir vakanın dilini vakanın açılış ekranında seçersin."]],
      ["adim", "Bir adımı cevaplamak", [
        "Her adımda önce cevabını ver. Adım güven soruyorsa bu cevaptan ne kadar emin olduğunu %50 ile %90 arasında seç. Sonra “Gönder” düğmesine bas.",
        "Sonucu ve kısa açıklamayı gördükten sonra “Devam” düğmesiyle sonraki adıma geçersin. Bir hata görürsen “Sorun bildir” bağlantısını kullanabilirsin."]],
      ["son", "Vakanın sonu", [
        "Vaka bitince kazandığın puanı, yükselen alan seviyelerini ve kazandığın işaret ya da madalyaları görürsün.",
        "Çözüm notu vakanın özünü anlatır. Doğru cevaplar, vakayı yeterince kişi bitirdiğinde açıklanır."]],
      ["kampus", "Kampüs", [
        "Kampüs sekmesindeki harita binalardaki katılımı ve kampüsün yedi alandaki durumunu gösterir. Haritada kimsenin kişisel sonucu yer almaz.",
        "Zaman çubuğunu kaydırarak kampüsün geçmiş günlerine bakabilir, haritadaki etkinlikleri ve vakaları açabilirsin."]],
      ["siralama", "Sıralama", [
        "Sıralamada yalnızca görünmeyi seçenler kullanıcı adlarıyla yer alır. Sıralamaya katılmak ya da ayrılmak için sayfanın üstündeki düğmeyi kullanabilirsin.",
        "Rol ve birim seçerek listeyi daraltabilirsin. Yandaki özet, seçili grubun toplamlarını gösterir."]],
      ["profil", "Profil ve ayarlar", [
        "Profilinde avatarını seçebilir, adını, kullanıcı adını, birimini ve biyografini düzeltebilirsin. Avatarın hemen değişir, diğer değişiklikler yönetim onayladıktan sonra görünür.",
        "Arayüzün dilini, vakaların sunulacağı dilleri ve sıralamada görünüp görünmeyeceğini de buradan ayarlarsın."]],
    ],
    title: "Platform nasıl çalışıyor?",
    lede: "Bu sayfada platformun nasıl kullanıldığı, cevaplardan yetkinliğin nasıl ölçüldüğü ve bu ölçmenin hangi bilimsel yaklaşımlara dayandığı anlatılmaktadır. Her bölümün başında konu kısaca tanıtılır. Formüller ve açıklamaları, bölümün altındaki “Formüller ve açıklamalar” başlığına tıklandığında açılır. Metinde köşeli parantez içinde verilen numaralar, sayfanın sonundaki kaynakçada yer alan kaynakları gösterir. Bir numaraya tıklandığında o kaynağa gidilir.",
    contents: "Bu sayfada",
    details: "Formüller ve açıklamalar",
    guideHead: "Platformun kullanımı",
    guide: [
      [
        "Giriş",
        "Platforma, üniversite e-posta adresine gönderilen altı haneli kodla giriş yapılır, ayrıca bir parola gerekmez. İlk girişte ad, soyad, kullanıcı adı ve birim bilgisi istenir.",
      ],
      [
        "Vaka seçimi",
        "Vakalar sekmesinde dijital ikizin kullanıcı için seçtiği vaka ve bu vakanın neden seçildiği yer alır. Listeden başka bir vakaya da başlanabilir, yarım bırakılan bir vakaya ise daha sonra kaldığı yerden devam edilebilir. Türkçe ve İngilizce sürümü bulunan bir vakanın dili, vakanın açılış ekranında seçilir. Hangi dildeki sürümün çözüldüğü fark etmez, iki sürüm aynı vaka sayılır.",
      ],
      [
        "Adımlar ve güven",
        "Adımların çoğunda cevapla birlikte, bu cevaptan ne kadar emin olunduğu da %50 ile %90 arasında bir değerle belirtilir. %50 ne puan kazandırır ne de kaybettirir, bu yüzden emin olunmayan durumlarda en güvenli seçimdir.",
      ],
      [
        "Sonuç ve çözüm notu",
        "Her adımın ardından sonuç ve kısa bir açıklama gösterilir, vaka bittiğinde de çözüm notu açılır. Vakayı yeterli sayıda kişi bitirdiğinde doğru cevaplar, vakayı tamamlayan herkese açıklanır.",
      ],
      [
        "İkiz ekranı",
        "Girişten sonra ilk açılan İkizim sekmesi, yedi alandaki durumu gül biçiminde bir grafikle gösterir. Bir yaprak seçildiğinde o alanın ayrıntıları açılır. “Güven ve isabet” grafiği ise belirtilen güvenin gerçek başarıyla ne ölçüde örtüştüğünü göstermektedir.",
      ],
      [
        "Puan, seviye ve rozet",
        "Puan, cevabın doğruluğuna ve belirtilen güvene göre hesaplanır. Seviye ve alan seviyeleri ise çözülen vaka sayısına değil, ikizin ölçtüğü yetkinliğe bağlıdır. Rozetin bütün parçaları aşağıdaki “Rozet” bölümünde anlatılmaktadır.",
      ],
      [
        "Kampüs haritası ve sıralama",
        "Kampüs haritası katılımı ve kampüsün yedi alandaki durumunu gösterir. Haritada hiç kimsenin kişisel sonucu yer almaz. Sıralamaya katılmak isteğe bağlıdır ve sıralamada yalnızca kullanıcı adları görünür.",
      ],
      [
        "Sorun bildirme",
        "Bir adımda hata fark edildiğinde, o adımdaki “Sorun bildir” bağlantısıyla durum yönetime iletilebilir.",
      ],
    ],
    twinHead: "Dijital ikiz",
    twin1: "Dijital ikiz, gerçek bir varlığın modelidir ve o varlıktan gelen verilerle sürekli güncellenir. Örneğin bir makinenin dijital ikizi, makineden gelen ölçümlerle değişir ve makinenin bundan sonra nasıl davranacağını tahmin eder [9]. Bu platformdaki dijital ikiz ise kullanıcının yapay zekâ okuryazarlığını modellemektedir. İkiz, yedi alanın her birinde kullanıcının ne kadar yetkin olduğunu tahmin eder ve bu tahminin ne kadar kesin olduğunu da izler.",
    twin2: "İkiz bir döngü içinde çalışır. Her adım ekrana gelmeden önce kullanıcının o adımı doğru çözme olasılığını tahmin eder ve bu tahmini mühürler, yani sonradan değiştirilemeyecek biçimde kayda geçirir. Cevap geldiğinde tahminini gerçekleşen sonuçla karşılaştırarak kendini günceller, ardından öğrendiklerine göre sıradaki vakayı seçer. Kullanıcıların ikizlerinin ortalaması kampüsün dijital ikizini oluşturur. Kampüs ikizi, kampüs haritasında gösterilmektedir.",
    loop: ["Tahmin et ve mühürle", "Kullanıcı cevap verir", "Karşılaştır ve güncelle", "Sıradakini seç"],
    loopLabel: "İkizin döngüsü: Tahmin et ve mühürle, kullanıcı cevap verir, karşılaştır ve güncelle, sıradakini seç.",
    areasHead: "Yedi alan ve vakalar",
    areas1: "Yapay zekâ okuryazarlığı tek bir beceriden ibaret değildir, birbirinden farklı yetkinlikleri bir arada içerir [12, 13]. Platform bu yetkinlikleri aşağıdaki yedi alanda ölçmektedir:",
    areaText: {
      verification: [
        "Doğrulama ve Halüsinasyon Tespiti",
        "Uydurma bilgiyi ve uydurma kaynağı fark etmek, bir iddiayı başka kaynaklarla sınamak.",
      ],
      privacy: [
        "Veri Mahremiyeti",
        "Kişisel ya da hassas bir veriyi bir yapay zekâ aracıyla paylaşmadan önce durup düşünmek.",
      ],
      prompt_design: ["Görev ve İstem Tasarımı", "Görevi, bağlamı ve beklenen çıktıyı açık biçimde tarif etmek."],
      integrity: [
        "Atıf ve Akademik Dürüstlük",
        "Kaynak göstermek, yapay zekâ kullanımını beyan etmek ve yazarlığı korumak.",
      ],
      manipulation: [
        "Manipülasyon Direnci",
        "Sahte ses ve görüntüleri, ikna amacıyla kurgulanmış içerikleri tanımak.",
      ],
      op_security: [
        "Kurumsal Bilgi Güvenliği",
        "Kurum hesaplarını ve üçüncü taraf araçları doğru kullanmak, bir güvenlik olayını bildirmek.",
      ],
      boundaries: [
        "Sınır ve Yanlılık Bilinci",
        "Yanlılığı fark etmek, modellerin sınırlarını ve yapay zekânın kullanılmaması gereken durumları bilmek.",
      ],
    },
    areas2: "Her vaka kampüste yaşanabilecek gerçekçi bir durumu anlatır ve genellikle üç adımdan oluşur. Adımlarda bir metindeki sorunlu ifadeleri işaretlemek, künyelerin gerçek olup olmadığına karar vermek, bir metni belirli kurallara uyacak biçimde yeniden yazmak, gerekçeli bir seçim yapmak ya da birbirini izleyen kararlar vermek gerekir. Vakaların birden fazla çeşidi bulunmaktadır. Çeşitler arasında doğru karar değişmez, yalnızca adlar ve sayılar farklıdır. Kullanıcının hangi çeşidi göreceği, platformun ona verdiği ve kim olduğunu göstermeyen takma kimlikten türetilen bir sayıyla belirlenir.",
    badgeHead: "Rozet",
    badge1: "İkizim sekmesinin en üstündeki rozet, kullanıcının ilerlemesini dört parçada gösterir: Seviye, alan seviyeleri, nadir işaretler ve madalyalar. Seviye ve alan seviyeleri ikizin o anki tahminlerinden hesaplanır, bu nedenle yetkinlik değiştikçe onlar da değişebilir. Nadir işaretler ve madalyalar ise bir kez kazanıldıktan sonra kalıcıdır. Puan rozetin bir parçası değildir: Puan cevaplarla birikir, seviyeyi ise yalnızca ölçülen yetkinlik belirler.",
    levelsHead: "Seviyeler",
    levels1: "Beş seviye vardır. Bir seviyeye ulaşmak için o seviyenin bütün koşullarının birlikte sağlanması gerekir: Yeterli sayıda alanda orta zorluktaki bir adımı doğru çözme olasılığının belirli bir değere ulaşması, belirli sayıda vakanın bitirilmesi ve üst seviyelerde kendini tanıma puanının belirli bir değerin altında kalması. Kendini tanıma puanı, “Güven ve kalibrasyon” bölümünde anlatılan ölçüdür ve küçük olması iyidir.",
    levelNames: ["Başlangıç", "Uygulayıcı", "Denetleyen", "Yetkin", "Rehber"],
    levelWord: "Seviye",
    levelStart: "Platformu kullanan herkes bu seviyeden başlar.",
    levelAreas: "{k} alanda en az %{p}", levelCases: "{n} vaka bitirmek",
    levelCal: "Kendini tanıma puanı {b} ya da altında",
    tiersHead: "Alan seviyeleri",
    tiers1: "Yedi alanın her birinin ayrı bir seviyesi vardır: Temel, Sağlam ve Usta. Bir alanın seviyesi, o alanda orta zorluktaki bir adımı doğru çözme olasılığına ve o alanda cevaplanan adım sayısına bakar. Adım sayısı koşulu, az sayıda cevaba dayanan bir tahminin seviye kazandırmasını önler. Bir alan Temel seviyeye ulaştığında o alanın amblemi rozette renklenir.",
    tierNames: ["Temel", "Sağlam", "Usta"],
    tierNeed: "En az %{p} ve o alanda {n} adım",
    areaShort: { prompt_design: "Görev ve İstem Tasarımı", verification: "Doğrulama ve Halüsinasyon Tespiti",
                 integrity: "Atıf ve Akademik Dürüstlük", privacy: "Veri Mahremiyeti",
                 manipulation: "Manipülasyon Direnci", op_security: "Kurumsal Bilgi Güvenliği",
                 boundaries: "Sınır ve Yanlılık Bilinci" },
    marksHead: "Nadir işaretler",
    marks1: "Nadir işaretler belirli bir çalışma biçimini ödüllendirir ve çok vaka çözmek bunları tek başına kazandırmaz. Bir işaretin koşulu her vaka bitirildiğinde denetlenir, koşul karşılanmışsa işaret o anda kazanılır. Kazanılan bir işaret, sonraki daha zayıf cevaplarla geri alınmaz. Tek istisna, yönetimin kurallara aykırı bulup geçersiz saydığı bir denemedir: Yalnızca o denemeyle kazanılan işaret geri alınır. Platformla gelen altı işaretin yanında yönetimin sonradan eklediği işaretler de bulunabilir.",
    medalsHead: "Madalyalar",
    medals1: "Madalyalar Süper, Mega ve Ultra olmak üzere üç gruptadır ve platformun yönetimi tarafından zaman zaman eklenir. Bir madalyanın koşulu, örneğin belirli sayıda vaka bitirmek, bir alanda belirli bir seviyeye ulaşmak ya da art arda haftalarda vaka bitirmek olabilir. Koşulu olan bir madalya, koşulu karşılayan herkese kendiliğinden verilir. Yeni bir madalya eklendiğinde koşulunu daha önce karşılamış olanlar da onu kazanır. Bazı madalyaları ise yönetim, örneğin bir etkinliğe yapılan katkı için, elle verir.",
    groupEmpty: "Bu grupta henüz madalya yok.",
    handTag: "elle verilir",
    surprise: "İşaret ve madalyaların görselleri burada gri gösterilmektedir. Renkli hâlleri, kazanıldıklarında kullanıcının rozetinde görünür.",
    measureHead: "Ölçme: Yetkinlik ve zorluk",
    measure1: "Her kullanıcının her alanda bir yetkinlik düzeyi, her adımın da bir zorluk düzeyi vardır. İkiz, kullanıcının bir adımı doğru çözme olasılığını bu iki değer arasındaki farktan hesaplar: Yetkinlik zorluğu ne kadar aşarsa doğru çözme olasılığı da o kadar yükselir. Bu yaklaşım Madde Tepki Kuramı'nda Rasch modeli olarak bilinmektedir [1]. Kuramdaki yetenek parametresi burada yetkinliğe, madde (soru) güçlüğü ise adımın zorluğuna karşılık gelir.",
    measure2: "Cevap geldiğinde ikiz, sonucun beklentiden ne kadar saptığına bakar. Beklenenden iyi bir sonuç kullanıcının yetkinlik tahminini yükseltir ve adımın zorluğunu biraz düşürür, beklenenden kötü bir sonuç ise tersini yapar. Bu güncelleme kuralı, satranç oyuncularını derecelendirmek için geliştirilen Elo sisteminden gelmektedir ve uyarlanabilir eğitim sistemlerinde de yaygın biçimde kullanılmaktadır [2, 3]. Kısmen doğru bir cevap da bilgi taşıdığından sonuç yalnızca doğru ya da yanlış olarak değil, 0 ile 1 arasında bir değer olarak işlenir.",
    gapLabel: "Yetkinlik ile zorluk arasındaki fark (θ − b)",
    gapReading: "Doğru çözme olasılığı",
    curveLabel: "Doğru çözme olasılığının yetkinlik ile zorluk arasındaki farka göre değişimi",
    measure3: "İkiz ekranındaki gül grafiğinin her yaprağı bir alanı gösterir. Yaprağın uzunluğu, kullanıcının o alanda orta zorluktaki bir adımı doğru çözme olasılığına karşılık gelir. Yaprağın çevresindeki açık renkli hâle ise ikizin bu tahminden ne kadar emin olduğunu gösterir ve cevap sayısı arttıkça daralır.",
    measureD: [
      [
        "P(doğru) = 1 / (1 + e^−(θ − b))",
        "θ kullanıcının o alandaki yetkinliğini, b ise adımın zorluğunu gösterir.",
      ],
      [
        "θ ← θ + K · (x − P)     b ← b − K_b · (x − P)",
        "x adımın 0 ile 1 arasındaki sonucunu, P ise adım ekrana gelirken mühürlenen tahmini gösterir.",
      ],
      [
        "K = 0,40 ilk on cevapta, sonra 0,15",
        "İkiz kullanıcıyı henüz az tanırken hızlı, tanıdıkça daha temkinli öğrenir. Böylece tek bir kötü gün, ikizin o ana kadar öğrendiklerini bir anda değiştiremez.",
      ],
      [
        "K_b = 0,05 · 30 / (30 + n)",
        "n, adımın kaç kez cevaplandığını gösterir. Adım ne kadar çok cevaplanırsa zorluğu o kadar yavaş değişir. Zorluk vakanın her çeşidi için ayrı tutulmaktadır.",
      ],
      [
        "SH = 1 / √(1 + Σ p(1 − p))",
        "Hâle, Rasch modelinin standart hatasına (SH) göre çizilir. Gösterilen aralık θ ± 1,28 SH'dir ve gerçek yetkinliği beş durumdan dördünde kapsar.",
      ],
    ],
    modelNote: "Kullanılan lojistik model, her sonucun nasıl hesaplandığını adım adım gösterebilmektedir. Bu özellik KVKK açısından da önemlidir: KVKK'nin 11. maddesi kişiye, işlenen verilerinin yalnızca otomatik sistemlerle analiz edilmesi sonucunda aleyhine bir sonuç ortaya çıkmasına itiraz etme hakkı tanır. Böyle bir itiraz ancak sonucun gerekçesi açıklanabiliyorsa cevaplanabilir.",
    confHead: "Güven ve kalibrasyon",
    conf1: "Birbirini izleyen kararlardan oluşan adımlar dışındaki her adımda, cevabın yanında kullanıcının bu cevaptan ne kadar emin olduğu da sorulur. Güven düzeyi %50, %60, %70, %80 ya da %90 olarak seçilir. Ölçeğin %90'da bitmesi bilinçli bir tercihtir: Burada ölçülmek istenen, kullanıcının kendi bilgisini ne kadar doğru tarttığıdır.",
    conf2: "Puan bu güven düzeyine göre hesaplanır ve kullanılan kural dürüstlüğü ödüllendirir. Tahminlerin değerlendirilmesinde uygun puanlama kuralı adıyla bilinen bu yaklaşımda beklenen puan, yani çok sayıda cevapta ortalama olarak kazanılacak puan, kullanıcı gerçekte duyduğu güveni belirttiğinde en yüksek olur [4, 6]. %50 güvenle verilen bir cevap ne puan kazandırır ne de kaybettirir. Buna karşılık çok emin olup yanılmak, adımın değerinden daha fazla puan kaybettirir. Cevabı kendisi bulmayan kişi o cevaba ne kadar güvenmesi gerektiğini bilemeyeceği için başkasından alınmış bir cevabı tekrarlamak kazançlı değildir.",
    beliefLabel: "Kullanıcının gerçekte duyduğu güven:",
    expectedHead: "Belirtilen güvene göre on puanlık bir adımdan beklenen puan",
    expectedNote: "En yüksek çubuk, gerçekte duyulan güven düzeyine denk gelir.",
    ifRight: "Doğru çıkarsa",
    ifWrong: "Yanlış çıkarsa",
    said: "Belirtilen güven",
    conf3: "Seviye ve rozet puandan ayrı tutulmaktadır ve ikizin ölçtüğü yetkinliğe göre belirlenir. Bu nedenle yalnızca puan toplamak ya da çok sayıda vaka çözmek bunları kazandırmaz.",
    confD: [
      [
        "Puan = adım puanı × (1 − 4 (c − s)²)",
        "c belirtilen güveni gösterir. s ise sonuç başarı eşiğine (0,8) ulaştığında 1, ulaşmadığında 0 değerini alır. Hangi güven düzeyinde olursa olsun, gerçekte duyulandan farklı bir güven belirtmek beklenen puanı artırmaz [6].",
      ],
      [
        "Brier = (c − s)²",
        "Belirtilen güven ile gerçekleşen sonuç arasındaki farkı ölçer. Değerin sıfıra yakın olması kalibrasyonun iyi olduğunu gösterir [4]. İkiz ekranındaki “Kendini tanıma” puanı son 30 adımın ortalamasıdır.",
      ],
      [
        "Brier = güvenilirlik − çözünürlük + belirsizlik",
        "“Seni kim daha iyi tanıyor?” kartı kullanıcının Brier puanını ikizinkiyle yan yana koyar ve Murphy ayrıştırmasıyla üç bileşene böler [5]: Güven ile isabet arasındaki fark (kartta “Kalibrasyon”), bilinen ve bilinmeyen adımlara verilen güvenin ne ölçüde farklılaştığı (“Ayırt edicilik”) ve adımların kullanıcı açısından zorluğu (“Belirsizlik”).",
      ],
      [
        "AUROC",
        "Güven düzeyinin doğru cevapları yanlışlardan ne kadar iyi ayırdığını gösterir. ROC eğrisinin altında kalan alan, üstbilişsel duyarlılığın, yani kişinin bildiğini bilmediğinden ayırt edebilmesinin, yaygın olarak kullanılan bir ölçüsüdür [7]. 0,5 değeri hiç ayrım yapılmadığını, 1 değeri ise kusursuz bir ayrımı gösterir.",
      ],
    ],
    sealHead: "Mühürlü tahmin",
    seal1: "Her adım ekrana gelirken ikiz, kullanıcının o adımı doğru çözme olasılığını hesaplar. Bu sayı, rastgele üretilmiş gizli bir karakter dizisiyle birlikte SHA-256 özet fonksiyonundan geçirilir. Özet fonksiyonu, kendisine verilen her metinden o metne özgü ve hep aynı uzunlukta bir karakter dizisi üretir. Ortaya çıkan bu dizi tahminin mührüdür. Kullanıcı cevap vermeden önce yalnızca bu mührü görür. Cevap gönderildikten sonra sayı ve gizli dizi açıklanır, tarayıcı da mührü kendisi yeniden hesaplayıp iki değeri karşılaştırır. Böylece herkes, tahminin cevaptan sonra değiştirilmediğini kendisi doğrulayabilir.",
    seal2: "Kriptografide taahhüt şeması olarak bilinen bu yöntem, bilimsel araştırmalardaki ön kayda, yani hipotezin veriler toplanmadan önce kayda geçirilmesine benzer bir güvence vermektedir [11]. İkiz kendini güncellerken de yalnızca mühürlediği tahmini kullanır.",
    sealTry: "Mühürlenecek metin:",
    sealOut: "Mühür (SHA-256)",
    sealNote: "Metindeki tek bir karakter değiştiğinde mührün tamamı değişir. Mühürden yola çıkarak sayıyı geri bulmak ise mümkün değildir.",
    sealD: [
      [
        "Mühür = SHA-256(deneme : adım : P : r)",
        "Mühürlenen metin, denemenin numarası, adımın kimliği, ondalık kısmı dört basamakla yazılmış tahmin (P) ve 32 karakterlik rastgele diziden (r) oluşur. Rastgele dizi sayesinde aynı tahmin her seferinde farklı bir mühür verir ve tahmin, olası değerler tek tek denenerek mühürden bulunamaz.",
      ],
      [
        "SHA-256(açıklanan metin) = gösterilen mühür",
        "Cevaptan sonra açıklanan metnin mührü tarayıcıda yeniden hesaplanır. İki değer aynıysa tahmin cevaptan önce yapılmış ve sonradan değiştirilmemiştir.",
      ],
    ],
    nextHead: "Sıradaki vaka nasıl seçilir?",
    next1: "İkiz önce tekrar zamanı gelmiş bir alan olup olmadığına bakar. Bir alanda yanlış cevap verildiğinde o alan ertesi gün kullanıcının karşısına yeniden çıkar. Alanda doğru cevap verildikçe tekrar aralığı üç, yedi ve yirmi bir güne uzar. Aralıklı tekrarın öğrenilenleri kalıcı hâle getirdiği, öğrenme araştırmalarının en sağlam bulgularından biridir [8]. Tekrar zamanı gelmiş bir alan yoksa yönetimin öne çıkardığı alan, o da yoksa ikizin kullanıcıyı en az tanıdığı alan seçilir.",
    next2: "Seçilen alanın vakaları arasından, kullanıcının başarı olasılığı %65'e en yakın olan vaka önerilir. Bu düzeydeki bir vaka, bir şey öğretecek kadar zor, sonuna kadar götürülebilecek kadar da kolaydır. Vaka kartında vakanın neden seçildiği de yazar.",
    nextD: [
      [
        "Tekrar aralığı: 1 → 3 → 7 → 21 gün",
        "Başarı eşiğinin (0,8) altında kalan bir sonuç, alanı ertesi gün için tekrar listesine alır. Tekrar zamanı gelmiş bir alanda başarılı olunduğunda aralık bir sonraki değere uzar, 21 günlük aralıktan sonra da alan listeden çıkar.",
      ],
      [
        "Uygunluk = |P(doğru) − 0,65|",
        "Seçilen alanın vakaları arasından bu değeri en küçük olan, yani başarı olasılığı %65'e en yakın olan vaka önerilir.",
      ],
    ],
    hintHead: "İpucu ve deney",
    hint1: "Mühürlü tahmin %45'in altında kaldığında, adımdan önce adımın türüne uygun bir strateji ipucu gösterilir. İpucu cevabı vermez, yalnızca adıma nasıl yaklaşılabileceğini hatırlatır. İpuçlarının gerçekten işe yarayıp yaramadığı bir deneyle sınanmaktadır. Deney sürdüğü sürece kullanıcılar seçkisiz olarak iki gruba ayrılır. Gruplardan biri ipuçlarını görür, diğeri görmez ve iki grubun sonuçları yönetim panelinde karşılaştırılır. Kullanıcının grubu takma kimliğinden türetilen bir sayıyla belirlendiği için her kullanıcı deney boyunca aynı grupta kalır.",
    hint2: "Bir alandaki son cevaplarında bildiğinden belirgin biçimde fazla emin davranan kullanıcı, yüksek bir güven düzeyi seçtiğinde kısa bir uyarı görür.",
    hintD: [
      ["İpucu eşiği: P < 0,45", "Eşik, yönetim panelinden değiştirilebilen bir ayardır."],
      [
        "r = ort(x − P)",
        "Her kullanıcı için, ipucu gösterilebilecek adımlarda sonucun (x) mühürlü tahminden (P) ne kadar saptığının ortalaması alınır. Seçkisiz atama adım düzeyinde değil kullanıcı düzeyinde yapıldığından gruplar da kişi başına hesaplanan bu ortalamalarla karşılaştırılır.",
      ],
      [
        "Δ = ort(r, ipucu grubu) − ort(r, karşılaştırma grubu)",
        "İpucunun etkisi, iki grubun ortalamaları arasındaki farktır.",
      ],
      [
        "%95 güven aralığı = Δ ± 1,96 · SH",
        "SH, iki grubun varyanslarından hesaplanan standart hatadır. Fark ve güven aralığı, her grupta en az 20 kullanıcı olduğunda raporlanır.",
      ],
    ],
    campusHead: "Kampüs ikizi ve mahremiyet",
    campus1: "Kampüs haritası katılımı, kampüsün yedi alandaki durumunu ve her birimin kampüs ortalamasına göre konumunu göstermektedir. Kampüsün gül grafiği kullanıcıların ikizlerinden oluşturulur. Giriş yapan kullanıcının kendi ikizi de bu grafiğin üzerinde bir çizgiyle gösterilir. Haritanın üstündeki zaman çubuğuyla geçmiş bir güne gidildiğinde harita da kampüs ikizi de o günün durumunu gösterir. Bugünkü durum ise gül grafiğinin üzerinde kesik çizgiyle belirir.",
    campus2: "Toplu bir bilgi ancak yeterli sayıda kişiye dayandığında yayımlanır. Birime, alana ya da güne göre ayrılmış bir veri on kişiden azına dayanıyorsa gösterilmez. Bu kadar küçük bir grubun ortalaması tek tek kişilerin sonuçlarını ele verebilir. Bu kural k-anonimlik ilkesine dayanmaktadır [10]. Birimlerin sayısal puanları ve birbirlerine göre sıraları hiçbir yerde yayımlanmaz. Bir birim kampüs ortalamasına göre yalnızca üç gruptan birinde gösterilir: Kampüsün üstünde, kampüsle aynı düzeyde ya da kampüsün altında. Tek bir cevabın saati ve birimi de hiçbir ekranda yer almaz.",
    campus3: "Haritanın üstündeki gökyüzü Isparta'nın o anki gökyüzüdür. Güneş'in ve Ay'ın konumu ile hava durumu gerçektir. Davraz'daki kar, çamlar ve gül bahçeleri ise mevsime göre değişir.",
    campus5: "Haritada vakaların geçtiği yerler ve duyurulan etkinlikler de işaretlidir. Haftanın tuzağı, doğru cevapları açıklanmış vakalar arasında kampüsün son günlerde en çok zorlandığı adımı gösterir ve en az on kişinin cevabına dayanır. Bu adımın açıklamasını yalnızca vakayı bitirmiş olanlar görebilir. Güven ve isabet kartı, kampüsün her alanda bildiği kadar emin olup olmadığını gösterir. Kullanıcının kendi biriminin binasında yanan ışık ise o gün kaç adım cevapladığını gösterir ve bu ışığı yalnızca kullanıcının kendisi görür.",
    campus4: "Kullanıcıların kendileri hakkında yazdıkları bilgiler, başkalarına görünmeden önce yönetimin onayından geçmektedir. Yönetim, yanlış beyan edilmiş bir bilgiyi düzeltebilir ve bunun gerekçesini kullanıcıya gösterir. E-posta adresleri veritabanında şifreli olarak saklanır ve yalnızca tam yetkili yöneticilerin kişi listesinde görünür.",
    campusD: [
      [
        "Yayın eşiği: k ≥ 10",
        "Birime, alana ya da güne göre ayrılmış bir veri ancak en az on kişiye dayandığında gösterilir [10].",
      ],
      [
        "Δθ = θ(birim) − θ(kampüs)",
        "θ(birim), birimdeki kullanıcıların o alandaki yetkinliklerinin ortalamasıdır. Δθ 0,35'i aşarsa birim kampüsün üstünde, −0,35'in altına inerse kampüsün altında, aradaki durumlarda kampüsle aynı düzeyde gösterilir. Bu aralık, olağan dalgalanmalar yüzünden bir birim gruplar arasında gidip gelmesin diye geniş tutulmuştur.",
      ],
      [
        "Fark = ort(c) − isabet oranı",
        "Güven ve isabet kartında farkı 0,08'i aşan alan fazla emin, −0,08'in altında kalan alan az emin, aradakiler ise dengeli sayılır.",
      ],
    ],
    forecastHead: "Kampüs ikizinin günlük tahmini",
    forecast1: "Kampüs ikizi her gün, o gün kampüste kaç cevap verileceğini tahmin eder. Tahmin yalnızca önceki günlerin verisiyle yapılır ve iki ortalamaya dayanır: Son yedi günün ortalaması ve son dört haftada haftanın aynı gününe denk gelen dört günün ortalaması (örneğin salı için son dört salı). Dört haftalık veri birikene kadar yalnızca son yedi günün ortalaması kullanılmaktadır.",
    forecast2: "Tahmin edilen sayı, kişisel tahminlerde olduğu gibi rastgele bir diziyle birlikte mühürlenir ve gün boyunca haritada yalnızca mühür görünür. Gün bittiğinde sayı ve dizi açıklanır, tarayıcı mührü doğrular ve tahmin gerçekleşen sayının yanında gösterilir. Böylece herkes kampüs ikizinin ne kadar isabetli olduğunu kendisi görebilir.",
    forecastD: [
      [
        "Tahmin = (A + B) / 2",
        "A son yedi günde günlük cevap sayısının ortalaması, B ise son dört haftada haftanın aynı gününe denk gelen dört günün ortalamasıdır. Sonuç en yakın tam sayıya yuvarlanır. Dört haftalık veri birikene kadar tahmin yalnızca A'ya dayanır.",
      ],
      [
        "Mühür = SHA-256(gün : tahmin : r)",
        "r, 32 karakterlik rastgele dizidir. Gün bittiğinde açıklanan metnin mührü tarayıcıda yeniden hesaplanır ve gün boyunca gösterilen mühürle karşılaştırılır.",
      ],
      [
        "Sapma = |tahmin − gerçekleşen| / gerçekleşen",
        "Haritada gösterilen sapma yüzdesi bu orandır. Son günlerin ortalama sapması da bu oranların ortalamasıdır.",
      ],
    ],
    refsHead: "Kaynakça",
    teamHead: CREDITS.tr.heading,
    org: "Süleyman Demirel Üniversitesi, Yapay Zeka Uygulama ve Araştırma Merkezi",
    cite: "Kaynak",
  },
  en: {
    tabHow: "How it works",
    tabUse: "User guide",
    tabTeam: "Team",
    back: "Back to sign-in",
    useTitle: "How to use the platform",
    useLede: "This guide shows the platform's screens and tabs in pictures. The pictures were made with sample data. If you wonder how your answers are measured, see “How it works”.",
    useOpen: "Open the picture full size",
    use: [
      ["giris", "Signing in", [
        "Type your university e-mail address and press “Send code”. Enter the six-digit code sent to your e-mail. No password is needed.",
        "The first time, you are asked for your name, surname, username and unit. Then the My twin tab opens."]],
      ["sekmeler", "The tabs", [
        "The tabs on the top bar take you between the screens: My twin, Cases, Campus, Ranking and About.",
        "Your avatar on the right opens your profile, and the question mark opens this guide. The buttons beside them switch between the light and dark look and change the language. On a phone these buttons, and the link to this guide, are on the profile screen."]],
      ["rozet", "My twin: the badge", [
        "The My twin tab opens with your badge. It shows your level and what the next level asks for.",
        "Area levels, rare marks and medals each sit on a line of their own that opens when you press it. Those you have not earned yet are shown in grey."]],
      ["gul", "My twin: the rose", [
        "Each petal of the rose is an area. The longer the petal, the likelier you are to get a step in that area right.",
        "Pressing a petal opens the area's details. The slider under the chart shows how your twin looked in the past."]],
      ["duyurular", "Announcements", [
        "Announcements you have not read sit at the top of the My twin tab. Pressing the cross marks one as read and takes it off the top.",
        "In “All announcements” you can open the ones you read again, mark them unread or delete them. This is kept in the browser you use only."]],
      ["vakalar", "Cases", [
        "At the top of the Cases tab is the case your twin chose for you and why. A case you left half-finished stays at the top of the list.",
        "You can open any case from the list. For a case in both Turkish and English, you choose the language on its opening screen."]],
      ["adim", "Answering a step", [
        "In each step, first give your answer. If the step asks for confidence, choose how sure you are, from 50% to 90%. Then press “Submit”.",
        "After the result and a short explanation, “Next” takes you to the next step. If you see a mistake, use the “Report a problem” link."]],
      ["son", "The end of a case", [
        "When a case ends you see the points you earned, the area levels that went up and any mark or medal you earned.",
        "The solution note sums the case up. The correct answers are shown once enough people have finished the case."]],
      ["kampus", "Campus", [
        "The map in the Campus tab shows participation by building and where the campus stands in the seven areas. Nobody's own result appears on it.",
        "Moving the time bar shows the campus on past days, and the events and cases on the map can be opened."]],
      ["siralama", "Ranking", [
        "Only those who chose to appear are on the ranking, by username. The button at the top of the page lets you join or leave it.",
        "Choosing a role and a unit narrows the list. The summary beside it gives the totals of the selection."]],
      ["profil", "Profile and settings", [
        "In your profile you can choose your avatar and correct your name, username, unit and bio. The avatar changes at once. The other changes appear once the administrators approve them.",
        "You also set the interface language, the languages cases are offered in and whether you appear on the ranking here."]],
    ],
    title: "How the platform works",
    lede: "This page explains how the platform is used, how answers are measured and the scientific approaches the measurement rests on. Each section opens with a short account of its subject. The formulas and their explanations appear when the “Formulas and notes” heading under a section is opened. The numbers in square brackets refer to the reference list at the end of the page, and clicking a number brings that reference into view.",
    contents: "On this page",
    details: "Formulas and notes",
    guideHead: "Using the platform",
    guide: [
      [
        "Signing in",
        "Users sign in with a six-digit code sent to their university e-mail address instead of a password. On the first visit, they give their name, a username and the unit they belong to.",
      ],
      [
        "Choosing a case",
        "The Cases tab shows the case the digital twin has chosen for the user, and why. Another case can be started from the case list, and a case left half done can be resumed later where it was left. For a case that comes in Turkish and English, the language is chosen on the case's opening screen. Whichever version is solved, the same case counts as solved.",
      ],
      [
        "Steps and confidence",
        "In most steps, after doing what the step asks, users state how sure they are of their answer at a level between 50% and 90%. Choosing 50% is safe when unsure, since it neither earns nor loses points.",
      ],
      [
        "Results and the solution note",
        "A result and a short explanation follow each step, and the solution note opens when the case is over. The correct answers are revealed to everyone who finished the case once enough people have finished it.",
      ],
      [
        "The twin screen",
        "The My twin tab, which opens first after signing in, shows the standing in the seven areas as a rose chart, and choosing a petal opens the details of that area. The “Confidence and accuracy” chart shows how far the stated confidence matches actual success.",
      ],
      [
        "Points, level and the badge",
        "Points depend on how right the answer is and on the stated confidence. The level and the area levels come from the competence the twin measures, not from the number of cases solved. Every part of the badge is described in the “The badge” section below.",
      ],
      [
        "The campus map and the ranking",
        "The campus map shows participation and where the campus stands in the seven areas, and no one's own result appears on it. Joining the ranking is optional, and only usernames are shown there.",
      ],
      [
        "Reporting a problem",
        "A mistake noticed in a step can be reported to the administration with the “Report a problem” link on that step.",
      ],
    ],
    twinHead: "The digital twin",
    twin1: "A digital twin is a model of a real thing that is updated along with it. The digital twin of a machine, for example, changes continuously with the measurements the machine sends and predicts how the machine will behave next [9]. The digital twin on this platform models a user's AI literacy. For each of the seven areas, it tracks how competent the user is and how certain that estimate is.",
    twin2: "The twin works in a loop. Before each step appears, it predicts the chance that the user will get the step right and seals that prediction. When the answer arrives, it compares its prediction with the outcome and updates itself, and then chooses the next case in the light of what it has learned. The campus twin is built from the users' twins and is shown on the campus map.",
    loop: ["Predict and seal", "The user answers", "Compare and update", "Choose what comes next"],
    loopLabel: "The twin's loop: predict and seal, the user answers, compare and update, choose what comes next.",
    areasHead: "Seven areas and the cases",
    areas1: "AI literacy is not a single skill but a combination of different competencies [12, 13]. The platform measures these competencies in the seven areas below:",
    areaText: {
      verification: [
        "Verification and Hallucination Detection",
        "Noticing invented facts and sources, and testing a claim against other sources.",
      ],
      privacy: ["Data Privacy", "Stopping to think before sharing personal or sensitive data with an AI tool."],
      prompt_design: ["Task and Prompt Design", "Describing the task, the context and the expected output clearly."],
      integrity: [
        "Citation and Academic Integrity",
        "Citing sources, declaring the use of AI and protecting authorship.",
      ],
      manipulation: ["Manipulation Resistance", "Recognising fake voices and images, and content built to persuade."],
      op_security: [
        "Institutional Information Security",
        "Using institutional accounts and third-party tools properly, and reporting a security incident.",
      ],
      boundaries: [
        "Limits and Bias Awareness",
        "Knowing about bias, the limits of models and the situations where AI should not be used.",
      ],
    },
    areas2: "Each case describes a realistic situation that could happen on campus and usually has three steps. A step may ask the user to mark problematic phrases in a text, decide whether references are real, rewrite a text so that it follows given rules, make a reasoned choice or take a series of decisions. Cases have more than one variant. The right decision stays the same across variants, and only names and numbers change. Which variant a user sees is set by a number derived from their pseudonym.",
    badgeHead: "The badge",
    badge1: "The badge at the top of the My twin tab shows a user's progress in four parts: the level, the area levels, the rare marks and the medals. The level and the area levels are worked out from the twin's current estimates, so they can change as competence changes. Rare marks and medals, once earned, are kept. Points are not part of the badge: they build up with the answers, while the level is set by the measured competence alone.",
    levelsHead: "Levels",
    levels1: "There are five levels. A level is reached when all of its conditions are met at once: the chance of getting a step of average difficulty right reaches a given value in enough areas, a given number of cases is finished and, from the third level on, the self-knowledge score stays below a given value. The self-knowledge score is the measure described in “Confidence and calibration”, and lower is better.",
    levelNames: ["Newcomer", "Practised", "Reviewer", "Capable", "Guide"],
    levelWord: "Level",
    levelStart: "Everyone using the platform starts at this level.",
    levelAreas: "At least {p}% in {k} areas", levelCases: "Finish {n} cases",
    levelCal: "Self-knowledge score {b} or below",
    tiersHead: "Area levels",
    tiers1: "Each of the seven areas has a level of its own: Basic, Solid and Expert. An area's level looks at the chance of getting a step of average difficulty right in that area and at the number of steps answered in it. The number of steps keeps an estimate built on a few answers from earning a level. Once an area reaches Basic, its emblem takes on its colours on the badge.",
    tierNames: ["Basic", "Solid", "Expert"],
    tierNeed: "At least {p}% and {n} steps in the area",
    areaShort: { prompt_design: "Task and Prompt Design", verification: "Verification and Hallucination Detection",
                 integrity: "Citation and Academic Integrity", privacy: "Data Privacy",
                 manipulation: "Manipulation Resistance", op_security: "Institutional Information Security",
                 boundaries: "Limits and Bias Awareness" },
    marksHead: "Rare marks",
    marks1: "Rare marks reward a way of working, and solving many cases does not earn them on its own. A mark's condition is checked whenever a case is finished, and the mark is earned at that moment once the condition is met. A mark that has been earned is not taken back by weaker answers later. The one exception is an attempt the administration sets aside for breaking the rules: only a mark that attempt earned is taken back. Besides the six marks that come with the platform, there may be marks the administration has added.",
    medalsHead: "Medals",
    medals1: "Medals come in three groups, Super, Mega and Ultra, and the platform's administration adds them from time to time. A medal's condition might be finishing a number of cases, reaching a level in an area or finishing cases in weeks in a row. A medal with a condition is given to everyone who meets it, on its own. When a new medal is added, those who already met its condition earn it too. Some medals are given by the administration by hand, for example for help with an event.",
    groupEmpty: "No medal in this group yet.",
    handTag: "given by hand",
    surprise: "The pictures of the marks and medals are shown in grey here. Their colours appear on a user's badge once they are earned.",
    measureHead: "Measurement: competence and difficulty",
    measure1: "Every user has a competence level in each area, and every step has a difficulty level. The twin works out the chance that a user gets a step right from the difference between the two: the further competence exceeds difficulty, the higher the chance. In Item Response Theory this approach is known as the Rasch model [1]. The theory's ability parameter corresponds to competence here, and item difficulty to the difficulty of a step.",
    measure2: "When an answer arrives, the twin looks at how far the outcome departs from what was expected. A better result than expected raises the estimate of the user's competence and lowers the step's difficulty a little, and a worse result does the opposite. This update rule of the Elo rating system, developed to rate chess players, is also widely used in adaptive educational systems [2, 3]. Since a partly correct answer also carries information, the outcome is recorded not simply as right or wrong but as a value between 0 and 1.",
    gapLabel: "Difference between competence and difficulty (θ − b)",
    gapReading: "Chance of getting it right",
    curveLabel: "How the chance of a right answer changes with the difference between competence and difficulty",
    measure3: "Each petal of the rose chart on the twin screen stands for an area. The length of a petal is the user's chance of getting a step of average difficulty in that area right. The pale halo around the petal shows how sure the twin is of that estimate, and it narrows as answers accumulate.",
    measureD: [
      [
        "P(right) = 1 / (1 + e^−(θ − b))",
        "θ is the user's competence in the area, and b is the step's difficulty.",
      ],
      [
        "θ ← θ + K · (x − P)     b ← b − K_b · (x − P)",
        "x is the step's outcome between 0 and 1, and P is the prediction sealed when the step appeared.",
      ],
      [
        "K = 0.40 for the first ten answers, then 0.15",
        "The twin learns fast while it knows the user little, and more carefully as it learns more. A single bad day therefore cannot overturn what the twin has learned so far.",
      ],
      [
        "K_b = 0.05 · 30 / (30 + n)",
        "As a step is answered n times, its difficulty changes more slowly. Difficulty is kept separately for each variant.",
      ],
      [
        "SE = 1 / √(1 + Σ p(1 − p))",
        "The uncertainty shown by the halo is the standard error of the Rasch model. The range shown is θ ± 1.28 SE, which contains the true competence four times out of five.",
      ],
    ],
    modelNote: "The logistic model used here can show step by step how each result was calculated. This matters for KVKK as well: Article 11 of Türkiye's personal data protection law gives a person the right to object to a result against them that arises solely from automated analysis of their data. Such an objection can only be answered if the grounds of the result can be explained.",
    confHead: "Confidence and calibration",
    conf1: "In every step except branching decision steps, the user is also asked how sure they are of their answer. The confidence level is chosen from 50%, 60%, 70%, 80% and 90%. The scale deliberately stops short of 100%, because what is measured is not certainty but how accurately users weigh their own knowledge.",
    conf2: "Points are worked out from this confidence level, and the rule used rewards honesty. Under this rule, known in forecast evaluation as a proper scoring rule, the choice that gives the highest expected points is the confidence the user truly holds [4, 6]. An answer given with 50% confidence neither earns nor loses points. Being very sure and wrong, on the other hand, costs more than the step is worth. Repeating someone else's answer therefore does not pay, because a person who did not find the answer cannot tell how far to trust it.",
    beliefLabel: "Confidence actually held:",
    expectedHead: "Expected points from a ten-point step, by the confidence stated",
    expectedNote: "The highest bar stands above the confidence actually held.",
    ifRight: "If right",
    ifWrong: "If wrong",
    said: "Stated confidence",
    conf3: "Points are kept apart from level and badge. Level and badge are set by the competence the twin measures, so collecting points or solving many cases does not earn them on its own.",
    confD: [
      [
        "Points = step value × (1 − 4 (c − s)²)",
        "c is the stated confidence. s is 1 when the outcome reaches the success threshold (0.8) and 0 when it does not. The rule is honest at every level: stating a confidence other than the one actually held does not raise the expected score [6].",
      ],
      [
        "Brier = (c − s)²",
        "Measures the error in a user's own confidence, and values closer to zero point to better calibration [4]. The calibration figure on the twin screen is the mean of the last 30 steps.",
      ],
      [
        "Brier = reliability − resolution + uncertainty",
        "The “Who knows you better?” card sets the user's Brier score beside the twin's and splits it into three components with Murphy's decomposition [5]: the gap between confidence and accuracy, how far the confidence given to known and unknown steps differs, and how hard the steps were for the user.",
      ],
      [
        "AUROC",
        "Shows how well the confidence level separates right answers from wrong ones. The area under the ROC curve is an established measure of metacognitive sensitivity [7]. A value of 0.5 means no separation, and 1 means perfect separation.",
      ],
    ],
    sealHead: "The sealed prediction",
    seal1: "As each step appears, the twin works out the chance that the user will get it right. This number is joined with a randomly generated salt and sealed with the SHA-256 hash function. Before answering, the user sees only this seal. Once the answer is sent, the number and the salt are revealed, and the browser computes the seal again by itself and compares the two values. Anyone can therefore verify for themselves that the prediction was not changed after the answer.",
    seal2: "Known in cryptography as a commitment scheme, this method gives a guarantee similar to preregistration in research, where a hypothesis is recorded before the data are collected [11]. The twin also uses the sealed prediction when it updates itself, and never learns from a value changed afterwards.",
    sealTry: "Text to seal:",
    sealOut: "Seal (SHA-256)",
    sealNote: "Change a single character in the text and the whole seal changes. Working back from the seal to the number is not possible.",
    sealD: [
      [
        "Seal = SHA-256(attempt : step : P : salt)",
        "The sealed text is made of the attempt's number, the step's key, the prediction (P) written to four decimals and a random 32-character salt. Thanks to the salt, the same prediction gives a different seal each time, and the prediction cannot be found from the seal by trial.",
      ],
      [
        "SHA-256(revealed text) = seal shown",
        "After the answer, the revealed text is hashed again in the browser. If the two values are the same, the prediction was made before the answer and has not changed since.",
      ],
    ],
    nextHead: "How the next case is chosen",
    next1: "The twin first checks whether any area is due for review. An area answered wrongly comes back to the user the next day, and as it is answered rightly, the review interval grows to three, seven and twenty-one days. That spaced repetition makes learning last is one of the most robust findings of learning research [8]. When no area is due, the area put forward by the administration is chosen, and failing that, the area the twin knows least about.",
    next2: "Among the cases of the chosen area, the one where the user's chance of success is closest to 65% is suggested. At this level a case is hard enough to teach something and easy enough to be carried through. The case card also says why the case was chosen.",
    nextD: [
      [
        "Review interval: 1 → 3 → 7 → 21 days",
        "An outcome below the success threshold (0.8) puts the area on the review list for the next day. A success in an area that is due moves its interval to the next value, and after the 21-day interval the area leaves the list.",
      ],
      [
        "Fit = |P(right) − 0.65|",
        "Among the cases of the chosen area, the case with the smallest value, that is the one whose chance of success is closest to 65%, is suggested.",
      ],
    ],
    hintHead: "Hints and the experiment",
    hint1: "When the sealed prediction is below 45%, a strategy hint suited to the kind of step is shown before it. The hint does not give the answer. It only reminds the user how to approach the step. Whether hints really help is tested in an experiment. While it runs, users are randomly assigned to two groups: one group sees hints and the other does not, and the results of the two groups are compared in the administration panel. Since a user's group is set by a number derived from their pseudonym, every user stays in the same group throughout the experiment.",
    hint2: "When a user's confidence in an area has stayed clearly above their accuracy in recent answers, a short warning appears when they choose a high confidence.",
    hintD: [
      ["Hint threshold: P < 0.45", "The threshold is a setting the administration can change."],
      [
        "r = mean(x − P)",
        "For each user, the gap between the outcome (x) and the sealed prediction (P) is averaged over the steps where a hint could be shown. Since users, not steps, are randomly assigned, the groups are compared on these per-user means.",
      ],
      [
        "Δ = mean(r, hint group) − mean(r, comparison group)",
        "The effect of the hint is the difference between the means of the two groups.",
      ],
      [
        "95% confidence interval = Δ ± 1.96 · SE",
        "SE is the standard error computed from the variances of the two groups. The difference and its confidence interval are reported once each group has at least 20 users.",
      ],
    ],
    campusHead: "The campus twin and privacy",
    campus1: "The campus map shows participation on campus, where the campus stands in the seven areas and where each unit stands against the campus average. The campus rose chart is built from the users' twins, and a signed-in user's own twin is drawn over it as a line. When the time bar above the map goes back to an earlier day, both the map and the campus twin show that day, and today's levels appear on the rose chart as a dashed line.",
    campus2: "A combined figure is published only when it rests on enough people. No breakdown by unit, area or day is shown when it rests on fewer than ten people, because the average of so small a group can give individuals away. This rule rests on the principle of k-anonymity [10]. Numeric scores of units and any ranking of units are never published. A unit is shown against the campus average in only one of three groups: above the campus, level with the campus or below the campus. The time and the unit of a single answer appear on no screen.",
    campus3: "The sky above the map reflects Isparta's sky as it is now. The position of the sun and the moon and the weather are real, while the snow on Davraz, the pines and the rose gardens follow the season.",
    campus5: "The map also marks where cases are set and where announced events take place. The trap of the week shows the step the campus has found hardest lately among cases whose correct answers have been revealed, and it rests on the answers of at least ten people. Only those who finished the case can see the note that explains the step. The confidence and accuracy card shows whether the campus is as confident in each area as it is right. The light in the building of a user's unit shows how much they worked that day to that user alone.",
    campus4: "What users write about themselves is approved by the administration before others can see it. The administration can edit something declared wrongly, showing the user the reason. E-mail addresses are stored encrypted in the database and appear only in the full administrators' list of people.",
    campusD: [
      [
        "Publication threshold: k ≥ 10",
        "A breakdown by unit, area or day is shown only when it rests on at least ten people [10].",
      ],
      [
        "Δθ = θ(unit) − θ(campus)",
        "θ(unit) is the mean competence of the unit's users in that area. Above 0.35 the unit is shown above the campus, below −0.35 below it, and level with the campus in between. The margin is kept wide so that ordinary variation does not move a unit between groups.",
      ],
      [
        "Gap = mean(c) − accuracy",
        "On the confidence and accuracy card, an area whose gap is above 0.08 counts as overconfident, one below −0.08 as underconfident, and the areas in between as balanced.",
      ],
    ],
    forecastHead: "The campus twin's daily forecast",
    forecast1: "Every day the campus twin forecasts how many answers will be given on campus that day. The forecast uses data from earlier days only and rests on two averages: the average of the last seven days and the average of the same weekday over the last four weeks. Until four weeks of history exist, only the average of the last seven days is used.",
    forecast2: "Like the personal predictions, the forecast number is sealed with a salt, and during the day the map shows only the seal. When the day is over, the number and the salt are revealed, the browser checks the seal and the forecast is shown beside the actual count. Anyone can therefore see for themselves how accurate the campus twin is.",
    forecastD: [
      [
        "Forecast = (A + B) / 2",
        "A is the average number of answers a day over the last seven days. B is the average of the four days that fell on the same weekday over the last four weeks. The result is rounded to the nearest whole number. Until four weeks of history exist, A alone is used as the forecast.",
      ],
      [
        "Seal = SHA-256(day : forecast : salt)",
        "When the day is over, the revealed text is hashed again in the browser and compared with the seal shown during the day.",
      ],
      [
        "Error = |forecast − actual| / actual",
        "This ratio is the error percentage shown on the map. The average error over recent days is the mean of these ratios.",
      ],
    ],
    refsHead: "References",
    teamHead: CREDITS.en.heading,
    org: "Süleyman Demirel University, Artificial Intelligence Application and Research Centre",
    cite: "Source",
  },
};

const SECTIONS = ["guide", "twin", "areas", "badge", "measure", "conf", "seal", "next", "hint",
                  "campus", "forecast", "refs"];

/* The levels and the area levels as app.level_rule and app.area_tier_rule
   set them. A threshold on θ is shown as the chance of getting a step of
   average difficulty right, as the twin screen shows each area. */
const LEVEL_RULES = [
  { level: 1, dims: 1, theta: -0.5, cases: 0, brier: null },
  { level: 2, dims: 3, theta: 0.0, cases: 12, brier: null },
  { level: 3, dims: 5, theta: 0.5, cases: 30, brier: 0.20 },
  { level: 4, dims: 6, theta: 1.0, cases: 60, brier: 0.15 },
  { level: 5, dims: 7, theta: 1.5, cases: 100, brier: 0.12 },
];
const TIER_RULES = [
  { tier: 1, theta: 1.2, attempts: 10 },
  { tier: 2, theta: 1.8, attempts: 25 },
  { tier: 3, theta: 2.4, attempts: 50 },
];
const percent = (theta) => Math.round(100 * sigmoid(theta));
/* A percentage as each language writes it: %73 in Turkish, 73% in English. */
const pc = (v, lang) => (lang === "tr" ? `%${v}` : `${v}%`);
const fill = (text, vars) => Object.entries(vars).reduce(
  (out, [k, v]) => out.split(`{${k}}`).join(String(v)), text);

/* The part after #hakkinda: the team, the user guide, or how it works. */
const PART_HASH = { how: "#hakkinda", use: "#hakkinda/rehber", team: "#hakkinda/ekip" };

function partFromHash() {
  const rest = (window.location.hash || "").replace(/^#/, "").split("/")[1] ?? "";
  return rest === "ekip" || rest === "team" ? "team"
    : rest === "rehber" || rest === "guide" ? "use" : "how";
}

/* The guide's pictures sit in rehber/<language>/ next to the page. */
function guideSrc(lang, shot) {
  if (typeof document === "undefined") return `rehber/${lang}/${shot}.webp`;
  const tag = document.querySelector("base[href]");
  const from = tag ? tag.getAttribute("href") : window.location.pathname;
  return `${from.endsWith("/") ? from : from.replace(/[^/]*$/, "")}rehber/${lang}/${shot}.webp`;
}

/* Scrolling glides, unless the reader has asked for less motion. */
const glide = () => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ? "auto" : "smooth");

/* A paragraph whose [n] marks are buttons that bring the reference into view.
   They are not links, because the address belongs to the screens. */
function Para({ text, t, style }) {
  const parts = text.split(/(\[\d+(?:,\s*\d+)*\])/g);
  return (
    <p style={style ?? S.p}>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+(?:,\s*\d+)*)\]$/);
        if (!m) return <React.Fragment key={i}>{part}</React.Fragment>;
        const nums = m[1].split(/,\s*/);
        return (
          <span key={i} style={S.cites}>
            [{nums.map((n, j) => (
              <React.Fragment key={n}>
                {j > 0 && ", "}
                <button type="button" style={S.cite} data-cite={n}
                  aria-label={`${t.cite} ${n}`}
                  onClick={() => document.getElementById(`kaynak-${n}`)
                    ?.scrollIntoView({ behavior: glide(), block: "center" })}>
                  {n}
                </button>
              </React.Fragment>
            ))}]
          </span>
        );
      })}
    </p>
  );
}

function Details({ t, rows, extra }) {
  return (
    <details style={S.details}>
      <summary style={S.summary}>{t.details}</summary>
      <div style={S.detailBody}>
        {rows.map(([formula, words]) => (
          <div key={formula} style={S.formulaRow}>
            <code style={S.formula}>{formula}</code>
            <Para text={words} t={t} style={S.formulaWords} />
          </div>
        ))}
        {extra && <Para text={extra} t={t} style={S.formulaWords} />}
      </div>
    </details>
  );
}

/* The twin's loop, four stations on a ring. */
function Loop({ t }) {
  const cx = 190, cy = 110, rx = 126, ry = 76;
  const pos = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
  const at = (deg) => [cx + rx * Math.cos((deg * Math.PI) / 180),
                       cy + ry * Math.sin((deg * Math.PI) / 180)];
  // Clockwise, from each box to the next, clear of both.
  const arcs = [[-56, -23], [23, 56], [124, 157], [203, 236]].map(([a, b]) => {
    const [x1, y1] = at(a), [x2, y2] = at(b);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${rx} ${ry} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  });
  return (
    <svg viewBox="0 0 380 220" style={S.loop} role="img" aria-label={t.loopLabel}>
      <defs>
        <marker id="loop-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7"
          markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={ACCENT} />
        </marker>
      </defs>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={LINE} strokeWidth="10" />
      {arcs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={ACCENT} strokeWidth="1.8"
          markerEnd="url(#loop-arrow)" />
      ))}
      {t.loop.map((label, i) => {
        const [x, y] = pos[i];
        const words = label.split(" ");
        const half = Math.ceil(words.length / 2);
        const lines = words.length > 2 ? [words.slice(0, half).join(" "), words.slice(half).join(" ")]
                                       : [label];
        return (
          <g key={label}>
            <rect x={x - 58} y={y - 19} width="116" height="38" rx="6" fill={CARD}
              stroke={i === 0 ? ACCENT : "var(--line-strong)"} strokeWidth={i === 0 ? 1.6 : 1} />
            {lines.map((line, j) => (
              <text key={j} x={x} y={y + 4 + (j - (lines.length - 1) / 2) * 13}
                textAnchor="middle" fontFamily={DISPLAY} fontSize="11.5" fill={TEXT}
                fontWeight={i === 0 ? 600 : 400}>{line}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/* The chance of a right answer against θ − b, with a handle. */
function Curve({ t, lang }) {
  const [gap, setGap] = useState(1);
  const W = 300, H = 150, pad = 26;
  const x = (g) => pad + ((g + 4) / 8) * (W - 2 * pad);
  const y = (p) => H - pad - p * (H - 2 * pad);
  const d = Array.from({ length: 81 }, (_, i) => -4 + i * 0.1)
    .map((g, i) => `${i ? "L" : "M"}${x(g).toFixed(1)} ${y(sigmoid(g)).toFixed(1)}`).join(" ");
  const p = sigmoid(gap);
  const num = (v, digits = 1) => v.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB",
    { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (
    <div style={S.widget} data-widget="curve">
      <svg viewBox={`0 0 ${W} ${H}`} style={S.curve} role="img" aria-label={t.curveLabel}>
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke={LINE} />
        <line x1={pad} x2={W - pad} y1={y(0.5)} y2={y(0.5)} stroke={LINE} strokeDasharray="3 3" />
        <line x1={x(0)} x2={x(0)} y1={y(0)} y2={y(1)} stroke={LINE} strokeDasharray="3 3" />
        <path d={d} fill="none" stroke={TEXT} strokeWidth="1.8" />
        <line x1={x(gap)} x2={x(gap)} y1={y(0)} y2={y(p)} stroke={ACCENT} strokeWidth="1" />
        <circle cx={x(gap)} cy={y(p)} r="5" fill={ACCENT} />
        {[-4, -2, 0, 2, 4].map((g) => (
          <text key={g} x={x(g)} y={H - 8} textAnchor="middle" fontSize="10" fill={MUTED}
            fontFamily={MONO}>{g > 0 ? `+${g}` : String(g).replace("-", "−")}</text>
        ))}
        {[0, 0.5, 1].map((v) => (
          <text key={v} x={pad - 4} y={y(v) + 3} textAnchor="end" fontSize="10" fill={MUTED}
            fontFamily={MONO}>{pc(Math.round(v * 100), lang)}</text>
        ))}
      </svg>
      <label style={S.sliderLabel}>
        {t.gapLabel}: <b style={S.mono}>{gap > 0 ? "+" : gap < 0 ? "−" : ""}{num(Math.abs(gap))}</b>
        <input type="range" min="-4" max="4" step="0.1" value={gap}
          onChange={(e) => setGap(Number(e.target.value))} style={S.slider}
          aria-label={t.gapLabel} data-control="gap" />
      </label>
      <div style={S.reading}>
        {t.gapReading}: <b style={S.big} data-reading="chance">{pc(Math.round(p * 100), lang)}</b>
      </div>
    </div>
  );
}

/* Expected points by stated confidence for a belief the reader sets. */
function Scoring({ t, lang }) {
  const [belief, setBelief] = useState(0.7);
  const expected = LEVELS.map((c) => 10 * (belief * rule(c, 1) + (1 - belief) * rule(c, 0)));
  const best = expected.indexOf(Math.max(...expected));
  const [said, setSaid] = useState(2);
  const num = (raw) => {
    const v = Math.round(raw * 10) / 10;
    return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString(
      lang === "tr" ? "tr-TR" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };
  const W = 300, H = 170, base = 84, scale = 8;
  return (
    <div style={S.widget} data-widget="scoring">
      <label style={S.sliderLabel}>
        {t.beliefLabel} <b style={S.mono}>{pc(Math.round(belief * 100), lang)}</b>
        <input type="range" min="0.5" max="0.9" step="0.05" value={belief}
          onChange={(e) => setBelief(Number(e.target.value))} style={S.slider}
          aria-label={t.beliefLabel} data-control="belief" />
      </label>
      <div style={S.widgetHead}>{t.expectedHead}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={S.curve} role="img" aria-label={t.expectedHead}>
        <line x1="20" x2={W - 10} y1={base} y2={base} stroke="var(--line-strong)" />
        {expected.map((raw, i) => {
          const v = Math.round(raw * 10) / 10;
          const bx = 34 + i * 54, h = Math.max(1, Math.abs(v) * scale);
          return (
            <g key={i} data-bar={LEVELS[i]} data-best={i === best || undefined}>
              <rect x={bx} width="30" y={v >= 0 ? base - h : base} height={h} rx="2"
                fill={i === best ? ACCENT : "var(--line-strong)"} />
              <text x={bx + 15} y={v >= 0 ? base - h - 4 : base + h + 11} textAnchor="middle"
                fontSize="10" fontFamily={MONO} fill={i === best ? ACCENT : MUTED}>{num(v)}</text>
              <text x={bx + 15} y={H - 6} textAnchor="middle" fontSize="10.5" fontFamily={MONO}
                fill={TEXT}>{pc(Math.round(LEVELS[i] * 100), lang)}</text>
            </g>
          );
        })}
      </svg>
      <p style={S.note}>{t.expectedNote}</p>
      <div style={S.table} role="table">
        <div style={S.tableRow} role="row">
          <span style={S.tableHead} role="columnheader">{t.said}</span>
          <span style={S.tableHead} role="columnheader">{t.ifRight}</span>
          <span style={S.tableHead} role="columnheader">{t.ifWrong}</span>
        </div>
        {LEVELS.map((c, i) => (
          <button key={c} type="button" onClick={() => setSaid(i)} role="row"
            style={{ ...S.tableRow, ...S.tableBtn, ...(said === i ? S.tableOn : null) }}>
            <span style={S.mono} role="cell">{pc(Math.round(c * 100), lang)}</span>
            <span style={{ ...S.mono, color: "var(--good-text)" }} role="cell">{num(10 * rule(c, 1))}</span>
            <span style={{ ...S.mono, color: rule(c, 0) < 0 ? ACCENT : MUTED }} role="cell">
              {num(10 * rule(c, 0))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* A seal made in the browser from text the reader can change. */
function SealDemo({ t }) {
  const [text, setText] = useState("4521:st2:0.6340:9f1c2a7b5e3d4c6a8b0e1f2d3c4b5a69");
  const [digest, setDigest] = useState("");
  useEffect(() => {
    let stop = false;
    sha256Hex(text).then((d) => { if (!stop) setDigest(d); }).catch(() => {});
    return () => { stop = true; };
  }, [text]);
  return (
    <div style={S.widget} data-widget="seal">
      <label style={S.sliderLabel}>
        {t.sealTry}
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 120))}
          style={S.input} spellCheck="false" data-control="seal-text" />
      </label>
      <div style={S.widgetHead}>{t.sealOut}</div>
      <code style={S.digest} data-reading="digest">{digest}</code>
      <p style={S.note}>{t.sealNote}</p>
    </div>
  );
}

/* The way through the platform, in the order a person meets it. */
function Guide({ t }) {
  return (
    <ol style={S.guide} data-panel="guide">
      {t.guide.map(([head, text], i) => (
        <li key={head} style={S.guideItem} data-guide-step={i + 1}>
          <span style={S.guideNo} aria-hidden="true">{i + 1}</span>
          <span><b style={S.guideHead}>{head}.</b> {text}</span>
        </li>
      ))}
    </ol>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={`bolum-${id}`} style={S.section} data-section={id}>
      <h2 style={S.h2}>{title}</h2>
      {children}
    </section>
  );
}

function How({ t, lang, standalone }) {
  const heads = { guide: t.guideHead, twin: t.twinHead, areas: t.areasHead,
                  badge: t.badgeHead,
                  measure: t.measureHead, conf: t.confHead, seal: t.sealHead,
                  next: t.nextHead, hint: t.hintHead, campus: t.campusHead,
                  forecast: t.forecastHead, refs: t.refsHead };
  const go = (id) => document.getElementById(`bolum-${id}`)
    ?.scrollIntoView({ behavior: glide(), block: "start" });
  return (
    <div data-part="how">
      <header style={S.head}>
        <h1 style={S.h1}>{t.title}</h1>
        <p style={S.lede}>{t.lede}</p>
      </header>

      <nav style={S.toc} aria-label={t.contents}>
        <span style={S.tocLabel}>{t.contents}</span>
        {SECTIONS.map((id) => (
          <button key={id} type="button" onClick={() => go(id)} style={S.tocBtn}>{heads[id]}</button>
        ))}
      </nav>

      <Section id="guide" title={t.guideHead}>
        <Guide t={t} />
      </Section>

      <Section id="twin" title={t.twinHead}>
        <Para text={t.twin1} t={t} />
        <div style={S.figure}><Loop t={t} /></div>
        <Para text={t.twin2} t={t} />
      </Section>

      <Section id="areas" title={t.areasHead}>
        <Para text={t.areas1} t={t} />
        <ul style={S.areaList}>
          {AREAS.map((a) => (
            <li key={a} style={S.areaItem} data-area={a}>
              <span style={S.areaIcon} aria-hidden="true">{AREA_ICON[a]}</span>
              <span>
                <b style={S.areaName}>{t.areaText[a][0]}</b>
                <span style={S.areaWhat}>{t.areaText[a][1]}</span>
              </span>
            </li>
          ))}
        </ul>
        <Para text={t.areas2} t={t} />
      </Section>

      <Section id="badge" title={t.badgeHead}>
        <BadgeParts t={t} lang={lang} standalone={standalone} />
      </Section>

      <Section id="measure" title={t.measureHead}>
        <Para text={t.measure1} t={t} />
        <Curve t={t} lang={lang} />
        <Para text={t.measure2} t={t} />
        <Para text={t.measure3} t={t} />
        <Details t={t} rows={t.measureD} extra={t.modelNote} />
      </Section>

      <Section id="conf" title={t.confHead}>
        <Para text={t.conf1} t={t} />
        <Para text={t.conf2} t={t} />
        <Scoring t={t} lang={lang} />
        <Para text={t.conf3} t={t} />
        <Details t={t} rows={t.confD} />
      </Section>

      <Section id="seal" title={t.sealHead}>
        <Para text={t.seal1} t={t} />
        <SealDemo t={t} />
        <Para text={t.seal2} t={t} />
        <Details t={t} rows={t.sealD} />
      </Section>

      <Section id="next" title={t.nextHead}>
        <Para text={t.next1} t={t} />
        <Para text={t.next2} t={t} />
        <Details t={t} rows={t.nextD} />
      </Section>

      <Section id="hint" title={t.hintHead}>
        <Para text={t.hint1} t={t} />
        <Para text={t.hint2} t={t} />
        <Details t={t} rows={t.hintD} />
      </Section>

      <Section id="campus" title={t.campusHead}>
        <Para text={t.campus1} t={t} />
        <Para text={t.campus2} t={t} />
        <Para text={t.campus3} t={t} />
        <Para text={t.campus5} t={t} />
        <Para text={t.campus4} t={t} />
        <Details t={t} rows={t.campusD} />
      </Section>

      <Section id="forecast" title={t.forecastHead}>
        <Para text={t.forecast1} t={t} />
        <Para text={t.forecast2} t={t} />
        <Details t={t} rows={t.forecastD} />
      </Section>

      <Section id="refs" title={t.refsHead}>
        <ol style={S.refs} lang="en" data-panel="references">
          {REFS.map((r, i) => {
            const [before, doi] = r.split(/ (?=https:\/\/)/);
            return (
              <li key={i} id={`kaynak-${i + 1}`} style={S.ref}
                lang={/[çğıöşüÇĞİÖŞÜâ]/.test(before) ? "tr" : undefined}>
                <span style={S.refNo}>[{i + 1}]</span>
                <span>
                  {before.split(/\*([^*]+)\*/).map((part, k) => (
                    k % 2 ? <i key={k}>{part}</i> : <React.Fragment key={k}>{part}</React.Fragment>
                  ))}
                  {doi && <> <a href={encodeURI(doi)} target="_blank" rel="noopener noreferrer"
                    style={S.refLink}>{doi}</a></>}
                </span>
              </li>
            );
          })}
        </ol>
      </Section>
    </div>
  );
}

/* The badge, part by part. The level crests are shown in colour; everything
   that is earned on the way is shown in grey, so that it stays a surprise
   until it is earned. The marks and medals are the platform's own list, read
   from the server; without it, the six marks that come with the platform. */
function BadgeParts({ t, lang, standalone }) {
  const [book, setBook] = useState(null);
  useEffect(() => {
    let off = false;
    (standalone ? awardList.visitor() : awardList.mine())
      .then((b) => { if (!off && b?.awards) setBook(b); })
      .catch(() => {});
    return () => { off = true; };
  }, [standalone, lang]);
  const shown = (book?.awards ?? PLATFORM_MARKS.map((m) => platformMark(m, lang)))
    .filter((a) => a.active !== false);
  const marks = shown.filter((a) => a.category === "marks");
  const cal = (b) => b.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB",
                                      { minimumFractionDigits: 2 });
  return (
    <div data-panel="badge-parts">
      <Para text={t.badge1} t={t} />

      <h3 style={S.h3}>{t.levelsHead}</h3>
      <Para text={t.levels1} t={t} />
      <div style={S.levelGrid} data-panel="about-levels">
        {LEVEL_RULES.map((r) => (
          <div key={r.level} style={S.levelCard} data-level={r.level}>
            <ArtImage kind="level" k={r.level} size={72} alt="" />
            <div style={S.levelName}>{t.levelNames[r.level - 1]}</div>
            <div style={S.levelNo}>{t.levelWord} {r.level}</div>
            <ul style={S.needList}>
              {r.level === 1 ? <li>{t.levelStart}</li> : (
                <>
                  <li>{fill(t.levelAreas, { k: r.dims, p: percent(r.theta) })}</li>
                  <li>{fill(t.levelCases, { n: r.cases })}</li>
                  {r.brier != null && <li>{fill(t.levelCal, { b: cal(r.brier) })}</li>}
                </>
              )}
            </ul>
          </div>
        ))}
      </div>

      <h3 style={S.h3}>{t.tiersHead}</h3>
      <Para text={t.tiers1} t={t} />
      <div style={S.emblemRow} data-panel="about-areas">
        {AREAS.map((a) => (
          <div key={a} style={S.emblem} data-area-emblem={a}>
            <ArtImage kind="dim" k={a} size={52} locked alt="" />
            <span style={S.emblemName}>{t.areaShort[a]}</span>
          </div>
        ))}
      </div>
      <div style={S.tierRow} data-panel="about-tiers">
        {TIER_RULES.map((r) => (
          <div key={r.tier} style={S.tierCard} data-tier={r.tier}>
            <b style={S.tierName}>{t.tierNames[r.tier - 1]}</b>
            <span style={S.tierNeed}>{fill(t.tierNeed, { p: percent(r.theta), n: r.attempts })}</span>
          </div>
        ))}
      </div>

      <h3 style={S.h3}>{t.marksHead}</h3>
      <Para text={t.marks1} t={t} />
      <AwardList t={t} list={marks} visitor={standalone} panel="about-marks" />

      <h3 style={S.h3}>{t.medalsHead}</h3>
      <Para text={t.medals1} t={t} />
      <div style={S.groupGrid} data-panel="about-medals">
        {AWARD_GROUPS.filter((g) => g.code !== "marks").map((g) => {
          const list = shown.filter((a) => a.category === g.code);
          return (
            <div key={g.code} style={S.groupCard} data-medal-group={g.code}>
              <div style={S.groupTop}>
                <AwardImage award={{ code: g.code, category: g.code }} size={56} locked alt="" />
                <b style={S.groupName}>{lang === "en" ? g.en : g.tr}</b>
              </div>
              {list.length ? <AwardList t={t} list={list} visitor={standalone} compact />
                : <p style={S.groupEmpty}>{t.groupEmpty}</p>}
            </div>
          );
        })}
      </div>
      <p style={S.surprise}>{t.surprise}</p>
    </div>
  );
}

function AwardList({ t, list, visitor, panel, compact = false }) {
  return (
    <ul style={compact ? S.awardListCompact : S.awardList} data-panel={panel}>
      {list.map((a) => (
        <li key={a.code} style={S.awardItem} data-award={a.code}>
          <AwardImage award={a} size={compact ? 40 : 48} locked alt="" visitor={visitor} />
          <span>
            <b style={S.awardName}>
              {a.name}{a.manual && <span style={S.handTag}>{t.handTag}</span>}
            </b>
            <span style={S.awardWhat}>{a.what}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* The user guide: the screens and tabs, each with a picture of it. */
function Use({ t, lang }) {
  const go = (id) => document.getElementById(`rehber-${id}`)
    ?.scrollIntoView({ behavior: glide(), block: "start" });
  return (
    <div data-part="use">
      <header style={S.head}>
        <h1 style={S.h1}>{t.useTitle}</h1>
        <p style={S.lede}>{t.useLede}</p>
      </header>
      <nav style={S.toc} aria-label={t.contents}>
        <span style={S.tocLabel}>{t.contents}</span>
        {t.use.map(([id, title]) => (
          <button key={id} type="button" onClick={() => go(id)} style={S.tocBtn}>{title}</button>
        ))}
      </nav>
      {t.use.map(([id, title, lines], i) => (
        <section key={id} id={`rehber-${id}`} style={S.section} data-guide={id}>
          <h2 style={S.h2}><span style={S.useNo}>{i + 1}</span>{title}</h2>
          {lines.map((line, k) => <p key={k} style={S.p}>{line}</p>)}
          <Shot src={guideSrc(lang, id)} alt={title} open={t.useOpen} />
        </section>
      ))}
    </div>
  );
}

/* A picture of the screen, which opens full size in a tab of its own. A
   picture that is missing leaves no gap. */
function Shot({ src, alt, open }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <a href={src} target="_blank" rel="noopener" style={S.shotLink} title={open}>
      <img src={src} alt={alt} loading="lazy" decoding="async" style={S.shot}
        onError={() => setFailed(true)} data-guide-shot />
    </a>
  );
}

function Team({ t, lang }) {
  return (
    <div data-part="team">
      <header style={S.head}>
        <h1 style={S.h1}>{t.teamHead}</h1>
        <p style={S.lede}>{t.org}</p>
      </header>
      <div style={S.people}>
        {PEOPLE.map((person) => (
          <article key={person.name} style={S.person} data-person={person.name}>
            <Portrait person={person} />
            <div style={{ minWidth: 0 }}>
              <h2 style={S.personName}>{person.name}</h2>
              <div style={S.personRole}>{person.role[lang === "en" ? 1 : 0]}</div>
              {person.links.length > 0 && (
                <div style={S.personLinks}>
                  {person.links.map(([label, href]) => (
                    <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                      style={S.personLink}>{label}</a>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function About({ lang = "tr", standalone = false }) {
  const t = T[lang] ?? T.tr;
  const [part, setPart] = useState(partFromHash);
  useEffect(() => {
    const on = () => setPart(partFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const choose = (next) => {
    setPart(next);
    const hash = PART_HASH[next];
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
    window.scrollTo(0, 0);
  };
  return (
    <div style={S.root} lang={lang} data-screen="about">
      <style>{CSS}</style>
      <div style={S.bar}>
        <div style={S.seg} role="tablist">
          {[["how", t.tabHow], ["use", t.tabUse], ["team", t.tabTeam]].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={part === k}
              onClick={() => choose(k)} data-part-tab={k}
              style={{ ...S.segBtn, ...(part === k ? S.segOn : null) }}>{label}</button>
          ))}
        </div>
        {standalone && (
          <a href="#" style={S.back} data-action="back-to-sign-in"
            onClick={(e) => { e.preventDefault(); window.location.hash = ""; }}>
            {t.back}
          </a>
        )}
      </div>
      {part === "team" ? <Team t={t} lang={lang} />
        : part === "use" ? <Use t={t} lang={lang} />
          : <How t={t} lang={lang} standalone={standalone} />}
    </div>
  );
}

const CSS = `${THEME_CSS}
[data-screen="about"] button:focus-visible, [data-screen="about"] a:focus-visible,
[data-screen="about"] input:focus-visible, [data-screen="about"] summary:focus-visible {
  outline: 2px solid ${ACCENT}; outline-offset: 2px; }
[data-screen="about"] details > summary::-webkit-details-marker { display: none; }
[data-screen="about"] details > summary::before { content: "▸"; display: inline-block;
  width: 1.1em; transition: transform .15s; }
[data-screen="about"] details[open] > summary::before { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) {
  [data-screen="about"] details > summary::before { transition: none; }
}
@media (max-width: 640px) {
  [data-screen="about"] [data-widget] { padding: 12px !important; }
}
`;

const S = {
  root: { maxWidth: 820, margin: "0 auto", padding: "8px 16px 40px", fontFamily: DISPLAY,
          color: TEXT, background: PAPER },
  bar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
         flexWrap: "wrap", margin: "8px 0 18px" },
  seg: { display: "inline-flex", background: "var(--fill)", borderRadius: 999, padding: 3, gap: 2 },
  segBtn: { border: "none", background: "transparent", borderRadius: 999, padding: "7px 16px",
            fontFamily: DISPLAY, fontSize: 14, color: MUTED, cursor: "pointer" },
  segOn: { background: CARD, color: TEXT, fontWeight: 600,
           boxShadow: "0 1px 2px rgba(0,0,0,.08)" },
  back: { fontSize: 14, color: ACCENT, textDecoration: "none", fontWeight: 600 },
  head: { margin: "4px 0 18px" },
  h1: { fontSize: 30, lineHeight: 1.15, letterSpacing: "-.02em", fontStretch: "110%",
        fontWeight: 700, margin: "0 0 8px" },
  lede: { fontSize: 16, lineHeight: 1.6, color: MUTED, margin: 0, maxWidth: 680 },
  toc: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", margin: "0 0 22px" },
  tocLabel: { fontSize: 13, color: MUTED, marginRight: 4 },
  tocBtn: { border: `1px solid ${LINE}`, background: CARD, borderRadius: 999, padding: "5px 11px",
            fontFamily: DISPLAY, fontSize: 13, color: TEXT, cursor: "pointer" },
  section: { background: CARD, border: `1px solid ${LINE}`, borderRadius: 10,
             padding: "18px 20px 14px", margin: "0 0 14px", scrollMarginTop: 80 },
  h2: { fontSize: 20, fontWeight: 700, letterSpacing: "-.01em", margin: "0 0 10px",
        fontStretch: "106%" },
  p: { fontSize: 15.5, lineHeight: 1.68, margin: "0 0 12px", maxWidth: 680 },
  cites: { whiteSpace: "nowrap", color: MUTED },
  cite: { border: "none", background: "none", padding: 0, color: ACCENT, cursor: "pointer",
          fontFamily: DISPLAY, fontSize: "inherit", textDecoration: "underline",
          textUnderlineOffset: 2 },
  figure: { margin: "6px 0 14px", display: "flex", justifyContent: "center" },
  loop: { width: "100%", maxWidth: 440, height: "auto", display: "block", margin: "8px auto" },
  guide: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10, maxWidth: 720 },
  guideItem: { display: "grid", gridTemplateColumns: "26px minmax(0, 1fr)", gap: 10,
               alignItems: "start", fontSize: 15.5, lineHeight: 1.6 },
  guideNo: { width: 24, height: 24, borderRadius: 99, background: ACCENT, color: "var(--on-accent)",
             fontFamily: MONO, fontSize: 12.5, fontWeight: 600, display: "grid",
             placeItems: "center", marginTop: 1 },
  guideHead: { fontWeight: 700 },
  h3: { fontSize: 16.5, fontWeight: 700, margin: "18px 0 8px" },
  useNo: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28,
           height: 28, borderRadius: 99, background: SOFT, color: ACCENT, fontSize: 15,
           marginRight: 10, verticalAlign: "2px" },
  shotLink: { display: "block", margin: "6px 0 10px" },
  shot: { display: "block", width: "100%", height: "auto", borderRadius: 12,
          border: `1px solid ${LINE}`, boxShadow: "0 6px 22px rgba(0,0,0,.08)" },
  levelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
               gap: 10, margin: "4px 0 14px" },
  levelCard: { background: SOFT, borderRadius: 12, padding: "12px 10px", display: "flex",
               flexDirection: "column", alignItems: "center", textAlign: "center", gap: 2 },
  levelName: { fontSize: 15, fontWeight: 700, marginTop: 4 },
  levelNo: { fontSize: 12, color: MUTED },
  needList: { listStyle: "none", padding: 0, margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.45,
              color: TEXT, display: "grid", gap: 2 },
  emblemRow: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
               gap: 10, margin: "4px 0 10px" },
  emblem: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
            gap: 4 },
  emblemName: { fontSize: 12, lineHeight: 1.3, color: MUTED },
  tierRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8,
             margin: "4px 0 14px" },
  tierCard: { background: SOFT, borderRadius: 10, padding: "9px 12px", display: "grid", gap: 2 },
  tierName: { fontSize: 14.5 },
  tierNeed: { fontSize: 13, color: MUTED, lineHeight: 1.4 },
  awardList: { listStyle: "none", padding: 0, margin: "4px 0 14px", display: "grid", gap: 10,
               gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))" },
  awardListCompact: { listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 8 },
  awardItem: { display: "flex", gap: 10, alignItems: "flex-start" },
  awardName: { display: "block", fontSize: 14.5 },
  awardWhat: { display: "block", fontSize: 13.5, color: MUTED, lineHeight: 1.5 },
  handTag: { fontSize: 11, fontWeight: 600, color: MUTED, border: `1px solid ${LINE}`,
             borderRadius: 99, padding: "0 7px", marginLeft: 7, verticalAlign: "1px",
             whiteSpace: "nowrap" },
  groupGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10,
               margin: "4px 0 10px" },
  groupCard: { background: SOFT, borderRadius: 12, padding: 12 },
  groupTop: { display: "flex", alignItems: "center", gap: 10 },
  groupName: { fontSize: 15 },
  groupEmpty: { fontSize: 13, color: MUTED, margin: "8px 0 0" },
  surprise: { fontSize: 13.5, color: MUTED, lineHeight: 1.55, margin: "4px 0 12px", maxWidth: 680 },
  areaList: { listStyle: "none", padding: 0, margin: "0 0 14px", display: "grid", gap: 8 },
  areaItem: { display: "flex", gap: 10, alignItems: "flex-start", background: SOFT,
              borderRadius: 8, padding: "8px 10px" },
  areaIcon: { fontSize: 18, lineHeight: "22px" },
  areaName: { display: "block", fontSize: 15 },
  areaWhat: { display: "block", fontSize: 14, color: MUTED, lineHeight: 1.5 },
  widget: { border: `1px solid ${LINE}`, borderRadius: 8, padding: "14px 16px", margin: "4px 0 14px",
            background: SOFT, maxWidth: 680 },
  widgetHead: { fontSize: 13, color: MUTED, margin: "8px 0 4px" },
  curve: { width: "100%", maxWidth: 460, height: "auto", display: "block" },
  sliderLabel: { display: "block", fontSize: 14, lineHeight: 1.5 },
  slider: { display: "block", width: "100%", maxWidth: 460, marginTop: 6, accentColor: ACCENT },
  reading: { fontSize: 14, marginTop: 6 },
  big: { fontSize: 20, color: ACCENT, fontFamily: MONO },
  mono: { fontFamily: MONO, fontWeight: 500 },
  note: { fontSize: 13, color: MUTED, margin: "6px 0 0", lineHeight: 1.5 },
  table: { display: "grid", gap: 2, marginTop: 10, maxWidth: 460 },
  tableRow: { display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 8, alignItems: "center",
              padding: "5px 8px", fontSize: 14, textAlign: "left" },
  tableHead: { fontSize: 12, color: MUTED },
  tableBtn: { border: "1px solid transparent", background: "transparent", borderRadius: 6,
              cursor: "pointer", fontFamily: DISPLAY, color: TEXT },
  tableOn: { background: CARD, borderColor: LINE },
  input: { display: "block", width: "100%", marginTop: 6, padding: "8px 10px", fontSize: 13.5,
           fontFamily: MONO, border: `1px solid ${LINE}`, borderRadius: 6, background: CARD,
           color: TEXT },
  digest: { display: "block", fontFamily: MONO, fontSize: 12.5, wordBreak: "break-all",
            background: CARD, border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 10px",
            color: TEXT, minHeight: 20 },
  details: { borderTop: `1px solid ${LINE}`, marginTop: 6, paddingTop: 8 },
  summary: { cursor: "pointer", fontSize: 14, fontWeight: 600, color: ACCENT,
             display: "inline-block", padding: "6px 14px", borderRadius: 999,
             border: `1px solid ${ACCENT}`, background: CARD },
  detailBody: { paddingTop: 10 },
  formulaRow: { margin: "0 0 12px" },
  formula: { display: "inline-block", fontFamily: MONO, fontSize: 13.5, background: SOFT,
             border: `1px solid ${LINE}`, borderRadius: 6, padding: "4px 8px", margin: "0 0 4px",
             whiteSpace: "pre-wrap" },
  formulaWords: { fontSize: 14.5, lineHeight: 1.6, margin: 0, maxWidth: 680, color: TEXT },
  refs: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 },
  ref: { display: "grid", gridTemplateColumns: "34px 1fr", fontSize: 13.5, lineHeight: 1.55,
         scrollMarginTop: 100 },
  refNo: { color: MUTED, fontFamily: MONO, fontSize: 12.5, paddingTop: 1 },
  refLink: { color: ACCENT, overflowWrap: "anywhere" },
  people: { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            margin: "0 0 18px" },
  person: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
            gap: 12, background: CARD, border: `1px solid ${LINE}`, borderRadius: 10,
            padding: "20px 16px 18px" },
  portrait: { display: "block", width: 180, height: "auto", maxWidth: "100%" },
  initials: { flex: "0 0 auto", width: 48, height: 48, borderRadius: "50%", background: ACCENT,
              color: "var(--on-accent)", display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 17, letterSpacing: ".02em" },
  personName: { fontSize: 17, margin: "2px 0 2px", fontWeight: 700 },
  personRole: { fontSize: 14, color: MUTED, lineHeight: 1.45 },
  personLinks: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 8 },
  personLink: { fontSize: 13.5, color: ACCENT, fontWeight: 600, textDecoration: "none" },
};
