// Abshri | أبشري — Arabic complaint NLP core (v2), JavaScript port.
// Line-for-line port of abshri_nlp.py (the notebook). Keep both in sync.
const AbshriNLP = (() => {
  const TASHKEEL = /[ً-ْٰـ]/g;
  const CHAR_MAP = {"أ":"ا","إ":"ا","آ":"ا","ٱ":"ا","ى":"ي","ة":"ه","ؤ":"و","ئ":"ي",
    "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9"};
  const CHAR_RE = new RegExp("[" + Object.keys(CHAR_MAP).join("") + "]", "g");
  const NON_WORD = /[^ء-يa-z0-9]+/g;
  const REPEAT = /(.)\1{2,}/g;

  function normalize(text) {
    let t = String(text).toLowerCase();
    t = t.replace(TASHKEEL, "");
    t = t.replace(CHAR_RE, (ch) => CHAR_MAP[ch]);
    t = t.replace(NON_WORD, " ");
    t = t.replace(REPEAT, "$1");
    return t.split(/\s+/).filter(Boolean).join(" ");
  }

  const PREFIXES = ["وال", "بال", "كال", "فال", "لل", "ال"];
  function lightStem(tok) {
    for (const p of PREFIXES) {
      if (tok.startsWith(p) && tok.length - p.length >= 2) return tok.slice(p.length);
    }
    return tok;
  }

  const STOP_WORDS = new Set(`في من على عن الى إلى ما و او أو ثم ان أن إن انه انها هذا هذه هذي ذا ذي كان كانت يكون تكون
مع كل بعض عند عندنا عندي عندهم فيه فيها فيني لا لم لن قد جدا مره مرة شوي شوية وايد كثير
نحتاج احتاج نبي ابي ابغى نبغى ابغا احنا انا نحن هو هي هم انتم يا لو اذا إذا حتى بس لين
صار يصير صارت اللي الي التي الذي الذين وش ليش ليه كيف متى وين هنا هناك به بها له لها لنا
منه منها عليه عليها عليهم وما ولا ولكن لكن بين غير داخل خارج دايم دائما دايما كذا يعني
والله طيب ايضا أيضا كمان برضو مو مب ماهو ماهي فيه شي شيء اي أي أحد احد الحين الآن اليوم
اخر بعد قبل عشان علشان نفس مثل وقت اسبوع يوم ساعه طول بدون اثناء خلال تحتاج يحتاج يطلع`
    .split(/\s+/).filter(Boolean).map(normalize));

  function tokenize(text) {
    const out = [];
    for (const tok of normalize(text).split(" ").filter(Boolean)) {
      if (STOP_WORDS.has(tok)) continue;
      const stem = lightStem(tok);
      if (STOP_WORDS.has(stem) || stem.length < 2 || /^[0-9]+$/.test(stem)) continue;
      out.push(stem);
    }
    return out;
  }

  const CATEGORIES = [
    {key:"network", ar:"الإنترنت والشبكة", en:"Internet & network",
     strong:["نت","انترنت*","انترنيت*","شبكه*","شبكات*","واي","فاي","wifi"],
     weak:["اتصال*","يفصل*","تفصل*","ينقطع*","يقطع*","انقطاع*","تقطيع*","بطيء*","بطيي*","تغطيه*","راوتر*"]},
    {key:"facilities", ar:"المرافق والتكييف والصيانة", en:"Facilities & maintenance",
     strong:["مكيف*","تكييف*","تكيف*","صيانه*","دورات المياه","حمام*","نظافه*","مصعد*","مصاعد*","اضاءه*","تسريب*"],
     weak:["حار*","حر","برد*","بارد*","خربان*","خربانه*","عطل*","معطل*","وسخ*","كراسي*","كرسي*","طاولات*","مقاعد*","سبوره*","بروجكتر*","ريحه*","نظيف*"]},
    {key:"parking", ar:"المواقف والنقل", en:"Parking & transport",
     strong:["موقف*","مواقف*","باص*","حافله*","حافلات*","مترو*","نقل"],
     weak:["سيارات*","سياره*","زحمه*","زحام*","مشي*","توصيل*"]},
    {key:"food", ar:"الكافتيريا والطعام", en:"Cafeteria & food",
     strong:["كافتيريا*","كافيتيريا*","كافيه*","مطعم*","مقصف*","بوفيه*","اكل*","طعام*","وجبه*","وجبات*"],
     weak:["قهوه*","مشروبات*","اسعار*","غالي*","نشتري*","جوع*","جوعانين*"]},
    {key:"teaching", ar:"التدريس والتقييم", en:"Teaching & assessment",
     strong:["اختبار*","اختبارات*","امتحان*","درجات*","درجه*","تصحيح*","تقييم*","شرح*","يشرح*","تشرح*","منهج*"],
     weak:["دكتور*","استاذ*","محاضر*","مقرر*","ماده*","مواد*","شرايح*","سلايد*","كويز*","اسيله*","اسئله*"]},
    {key:"schedule", ar:"الجداول وضغط الدراسة", en:"Schedule & workload",
     strong:["جدول*","جداول*","تعارض*","ضغط*","واجب*","واجبات*","تكاليف*","تكليف*","مواعيد*"],
     weak:["تسليم*","موعد*","ساعات*","فتره*","فترات*","مهام*","وقت*","اوقات*","متاخر*","بدري*"]},
    {key:"systems", ar:"الأنظمة الإلكترونية والتسجيل", en:"E-systems & registration",
     strong:["نظام*","انظمه*","تسجيل*","بلاك*","blackboard","منصه*","منصات*","الكتروني*","بوابه*","سيرفر*"],
     weak:["حذف*","اضافه*","موقع*","تطبيق*","حساب*","دخول*","باسورد*","يعلق*","تعليق*","رابط*"]},
    {key:"support", ar:"الخدمات الطلابية والإرشاد", en:"Student services & advising",
     strong:["ارشاد*","مرشد*","شوون*","عماده*","مكافاه*","مكافات*","استشاره*","خدمات*"],
     weak:["رد","يردون*","ترد*","تواصل*","ايميل*","بريد*","موظف*","مكتب*","معامله*","دعم*","نفسي*"]},
  ];
  const OTHER = {key:"other", ar:"غير مصنّفة", en:"Unclassified"};
  const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
  CAT_BY_KEY.other = OTHER;

  for (const c of CATEGORIES) {
    c.rules = [];
    for (const [weight, group] of [[2, c.strong], [1, c.weak]]) {
      for (const raw of group) {
        const prefix = raw.endsWith("*");
        const words = normalize(raw.replace(/\*+$/, "")).split(" ").map(lightStem);
        c.rules.push([words, prefix, weight]);
      }
    }
  }

  function matchTokens(tokens, words, prefix) {
    const n = words.length; let hits = 0;
    for (let i = 0; i <= tokens.length - n; i++) {
      let ok = true;
      for (let j = 0; j < n; j++) {
        const t = tokens[i + j], w = words[j], last = j === n - 1;
        if (prefix && last && w.length >= 2) { if (!t.startsWith(w)) { ok = false; break; } }
        else if (t !== w) { ok = false; break; }
      }
      if (ok) hits++;
    }
    return hits;
  }

  function classify(text) {
    const stems = normalize(text).split(" ").filter(Boolean).map(lightStem);
    const scores = {}, matched = {};
    for (const c of CATEGORIES) {
      let s = 0; const m = [];
      for (const [words, prefix, weight] of c.rules) {
        const h = matchTokens(stems, words, prefix);
        if (h) { s += h * weight; m.push(words.join(" ")); }
      }
      scores[c.key] = s; matched[c.key] = m;
    }
    const best = Math.max(...Object.values(scores));
    if (best === 0) return {key: "other", scores, matched};
    const key = CATEGORIES.find((c) => scores[c.key] === best).key;
    return {key, scores, matched};
  }

  function countDocs(lists) {
    const c = new Map();
    for (const list of lists) for (const k of new Set(list)) c.set(k, (c.get(k) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  function keywordCounts(texts, top = 15) { return countDocs(texts.map(tokenize)).slice(0, top); }
  function bigramCounts(texts, top = 10) {
    return countDocs(texts.map((t) => { const k = tokenize(t); return k.slice(1).map((b, i) => k[i] + " " + b); }))
      .slice(0, top).filter(([, v]) => v >= 2);
  }

  return {normalize, lightStem, tokenize, classify, keywordCounts, bigramCounts, CATEGORIES, CAT_BY_KEY};
})();
if (typeof module !== "undefined") module.exports = AbshriNLP;
