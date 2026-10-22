// أبشري — application logic (views, live analysis, dashboard). Runs entirely in the browser.
(() => {
  const N = AbshriNLP, ST = window.AbshriStorage, DEMO = window.ABSHRI_DEMO || [];
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  };
  const AR = new Intl.NumberFormat("ar-SA");
  const fmt = (n) => AR.format(n);
  const pct = (a, b) => b ? new Intl.NumberFormat("ar-SA", {style: "percent", maximumFractionDigits: 1}).format(a / b) : "—";
  const nC = (n) => n === 1 ? "شكوى واحدة" : n === 2 ? "شكويان" : n >= 3 && n <= 10 ? `${fmt(n)} شكاوى` : `${fmt(n)} شكوى`;
  const COLLEGES = ["علوم الحاسب والمعلومات", "كلية الإدارة والأعمال", "كلية الآداب", "كلية التصاميم والفنون", "كلية علوم الرياضة والنشاط البدني", "كلية العلوم", "كلية التمريض", "كلية اللغات", "كلية أخرى"];
  const catName = (k) => N.CAT_BY_KEY[k] ? N.CAT_BY_KEY[k].ar : k;
  const dateStr = (iso) => { try { return new Date(iso).toLocaleString("ar-SA", {dateStyle: "medium", timeStyle: "short"}); } catch (e) { return ""; } };
  const LOCAL = ST.mode === "local";

  const S = { sent: [], sentReady: false, sentErr: null, source: "all", filter: {q: "", cat: "", college: "", sort: "new"}, shown: 30, confirmClear: false, toolsMsg: null };

  // ---------------- routing ----------------
  const VIEWS = ["submit", "admin", "method"];
  function route() {
    const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "submit";
    for (const x of VIEWS) $("#view-" + x).hidden = x !== v;
    document.querySelectorAll("nav.tabs a").forEach((a) => { if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (v === "admin") { loadSent().then(renderAdmin); renderAdmin(); }
    document.title = v === "submit" ? "أبشري" : v === "admin" ? "لوحة التحليل · أبشري" : "كيف يعمل التحليل · أبشري";
  }
  addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });

  // ---------------- mode notes ----------------
  function renderModeNotes() {
    const box = $("#mode-note"); box.replaceChildren();
    if (LOCAL && !ST.available) {
      box.append(el("div", {class: "notice warn"}, el("span", {class: "dot"}),
        el("p", {text: "متصفحك يمنع حفظ البيانات (غالباً وضع التصفح الخاص). التحليل الحي يعمل، لكن لن تُحفظ الشكوى بعد إغلاق الصفحة."})));
    } else if (LOCAL) {
      box.append(el("div", {class: "notice info"}, el("span", {class: "dot"}),
        el("p", {text: "هذه النسخة تعمل دون حساب ودون خادم: تُحفظ الشكوى في متصفحك على هذا الجهاز، وتظهر فوراً في «لوحة التحليل» مع البيانات التجريبية."})));
    }
    $("#privacy-note").textContent = LOCAL
      ? "لا نطلب اسمك. لا تكتبي اسمك أو رقمك الجامعي أو أسماء أشخاص داخل النص. في هذه النسخة لا تُرسل الشكوى لأي خادم؛ تبقى في متصفحك حتى تمسحيها."
      : "لا نطلب اسمك ولا نحفظ أي بيانات تعريفية مع الشكوى. لا تكتبي اسمك أو رقمك الجامعي أو أسماء أشخاص داخل النص. تُرسل الشكوى إلى قاعدة بيانات المشروع ولا يطّلع عليها إلا المسؤولات المسجَّلات.";
    $("#storage-explain").textContent = LOCAL
      ? "التخزين: كل زائرة تحفظ شكاواها في متصفحها، فلا تختلط بيانات الزائرات ولا تحتاج حساباً. لجمع الشكاوى من عدة أجهزة: صدّريها من «لوحة التحليل» واستورديها على جهاز المسؤولة، أو فعّلي قاعدة البيانات المشتركة (Supabase) من ملف config.js."
      : "التخزين: قاعدة بيانات مشتركة (Supabase). الزائرة تستطيع الإرسال فقط، ولا يقرأ الشكاوى إلا حساب مسؤولة مسجّل.";
  }

  // ---------------- submit: form + live reading ----------------
  for (const c of COLLEGES) $("#college").append(el("option", {value: c, text: c}));
  for (const c of N.CATEGORIES) $("#stcat").append(el("option", {value: c.key, text: c.ar}));
  const MIN = 15, MAX = 600;

  function renderReading() {
    const raw = $("#title").value + " " + $("#text").value;
    const has = raw.trim().length > 0;
    const r = N.classify(raw);
    const pill = $("#r-cat");
    pill.textContent = has ? catName(r.key) : "بانتظار النص";
    pill.className = "pill" + (r.key === "other" ? " other" : "");
    $("#r-norm").textContent = has ? N.normalize(raw) || "—" : "—";
    const hits = r.key === "other" ? [] : r.matched[r.key].flatMap((m) => m.split(" "));
    const toks = N.tokenize(raw);
    const box = $("#r-tokens"); box.replaceChildren();
    if (!toks.length) box.append(el("span", {class: "hint", text: "—"}));
    for (const t of toks) box.append(el("span", {class: "tok" + (hits.some((h) => t === h || t.startsWith(h)) ? " hit" : ""), text: t}));
    const max = Math.max(1, ...Object.values(r.scores));
    const sc = $("#r-scores"); sc.replaceChildren();
    for (const c of [...N.CATEGORIES].sort((a, b) => r.scores[b.key] - r.scores[a.key])) {
      const v = r.scores[c.key];
      sc.append(el("div", {class: "sb"}, el("span", {text: c.ar}), el("i", {class: v ? "" : "zero", style: `width:${(v / max) * 100}%`}), el("span", {class: "num", text: fmt(v)})));
    }
  }
  function countText() {
    const n = $("#text").value.trim().length;
    const c = $("#text-count"); c.textContent = `${fmt(n)} / ${fmt(MAX)}`; c.classList.toggle("over", n > MAX);
  }
  let rt; for (const id of ["title", "text"]) $("#" + id).addEventListener("input", () => { countText(); clearTimeout(rt); rt = setTimeout(renderReading, 120); });

  const SAMPLES = [
    {college: "علوم الحاسب والمعلومات", title: "انقطاع الشبكة في المكتبة", text: "الواي فاي في المكتبة يفصل كل شوي وما نقدر نحمّل ملفات المحاضرات"},
    {college: "كلية الآداب", title: "التكييف في القاعة", text: "المكيف في القاعة ٢١٠ خربان من أسبوعين والجو حااار وقت المحاضرات"},
    {college: "كلية الإدارة والأعمال", title: "الكافتيريا تقفل بدري", text: "الكافيتيريا تقفل الساعة ١٢ وما نلحق ناكل بين المحاضرات"},
  ];
  let sampleI = 0;
  $("#try-sample").addEventListener("click", () => {
    const s = SAMPLES[sampleI++ % SAMPLES.length];
    $("#college").value = s.college; $("#title").value = s.title; $("#text").value = s.text;
    for (const id of ["college", "title", "text"]) setErr(id, "");
    countText(); renderReading(); setStatus("عبّأنا مثالاً. عدّليه أو أرسليه كما هو.", "");
  });

  function setErr(id, msg) {
    const f = $("#" + id), e = $("#" + id + "-err");
    f.setAttribute("aria-invalid", msg ? "true" : "false"); e.textContent = msg || ""; e.hidden = !msg;
  }
  function setStatus(msg, kind) { const s = $("#send-state"); s.textContent = msg; s.className = "status" + (kind ? " " + kind : ""); }
  function validate() {
    const college = $("#college").value, title = $("#title").value.trim(), text = $("#text").value.trim();
    setErr("college", college ? "" : "اختاري الكلية حتى تُحسب الشكوى ضمن الكلية الصحيحة.");
    setErr("title", title.length >= 4 ? "" : "اكتبي عنواناً من ٤ أحرف على الأقل.");
    let tmsg = "";
    if (text.length < MIN) tmsg = `اكتبي ${fmt(MIN)} حرفاً على الأقل حتى يمكن فهم المشكلة.`;
    else if (text.length > MAX) tmsg = `النص أطول من ${fmt(MAX)} حرف. اختصريه قليلاً.`;
    else if (/\b\d{9,10}\b/.test(N.normalize(text))) tmsg = "يبدو أن النص يحتوي رقماً جامعياً أو رقم جوال. احذفيه قبل الإرسال.";
    setErr("text", tmsg);
    const first = ["college", "title", "text"].find((id) => $("#" + id).getAttribute("aria-invalid") === "true");
    if (first) { $("#" + first).focus(); setStatus("راجعي الحقول المعلَّمة باللون الأحمر.", "bad"); }
    return !first;
  }

  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const btn = $("#send");
    const item = {id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      college: $("#college").value, title: $("#title").value.trim(), text: $("#text").value.trim(),
      studentCategory: $("#stcat").value || null, createdAt: new Date().toISOString()};
    btn.disabled = true; setStatus("جارٍ الحفظ…", "");
    try {
      await ST.submit(item);
      const pred = N.classify(item.title + " " + item.text).key;
      $("#done").replaceChildren(el("div", {class: "done", role: "status"},
        el("h2", {class: "h3", text: LOCAL ? "حُفظت شكواك وحُلّلت." : "وصلت شكواك. شكراً لك."}),
        el("p", {}, "صُنّفت تحت ", el("span", {class: "pill", text: catName(pred)}), LOCAL ? " وتظهر الآن في لوحة التحليل مع الشكاوى المشابهة." : " وستظهر للمسؤولات في لوحة التحليل."),
        el("div", {class: "actions"}, el("a", {class: "btn ghost", href: "#admin", text: "افتحي لوحة التحليل"})),
        el("p", {class: "hint", text: "أبشري مشروع طلابي ولا ترسل ردوداً؛ للمعاملات العاجلة تابعي القنوات الرسمية في الجامعة."})));
      $("#done").hidden = false;
      $("#form").reset(); countText(); renderReading(); setStatus("", "");
      renderMine(); S.sentReady = false;
      $("#done").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest"});
    } catch (err) {
      const c = err && err.code;
      setStatus(c === "storage_blocked" ? "تعذّر الحفظ لأن المتصفح يمنع تخزين البيانات (وضع التصفح الخاص؟). جرّبي نافذة عادية."
        : c === "full" ? "وصلت مساحة الحفظ في هذا المتصفح للحد الأقصى. صدّري الشكاوى من لوحة التحليل ثم امسحيها."
        : c === "offline" ? "تعذّر الاتصال بقاعدة البيانات. تحققي من الإنترنت ثم أعيدي المحاولة."
        : "تعذّر الإرسال الآن. أعيدي المحاولة بعد قليل.", "bad");
    } finally { btn.disabled = false; }
  });

  function renderMine() {
    const list = ST.mine();
    const box = $("#mine-list"); box.replaceChildren();
    $("#mine").hidden = !list.length;
    for (const it of [...list].reverse().slice(0, 20)) {
      const k = N.classify(it.title + " " + it.text).key;
      box.append(el("div", {class: "mine-item"},
        el("div", {class: "meta"}, el("span", {class: "pill" + (k === "other" ? " other" : ""), text: catName(k)}), el("span", {text: it.college}),
          it.createdAt ? el("span", {class: "num", text: dateStr(it.createdAt)}) : null),
        el("b", {text: it.title}), el("p", {text: it.text})));
    }
  }

  // ---------------- dashboard data ----------------
  async function loadSent() {
    try {
      await ST.ready;
      S.sent = ST.canReadSent() ? await ST.listSent() : [];
      S.sentErr = null;
    } catch (e) { S.sent = []; S.sentErr = (e && e.message) || "خطأ في الاتصال"; }
    S.sentReady = true;
  }
  function dataset() {
    const demo = DEMO.map((d, i) => ({id: "d" + i, college: d.college, title: "", text: d.text, studentCategory: null, gold: d.label, createdAt: null, demo: true}));
    const sent = S.sent.map((r) => ({...r, studentCategory: N.CAT_BY_KEY[r.studentCategory] ? r.studentCategory : null}));
    return S.source === "demo" ? demo : S.source === "sent" ? sent : [...sent, ...demo];
  }
  const analyze = (rows) => rows.map((r) => { const c = N.classify((r.title ? r.title + " " : "") + r.text); return {...r, cat: c.key, matched: c.matched[c.key] || []}; });

  // ---------------- dashboard tools (export / import / clear / login) ----------------
  function renderTools() {
    const box = $("#admin-tools"); box.replaceChildren();
    const msg = S.toolsMsg ? el("p", {class: "status " + (S.toolsMsg.kind || ""), role: "status", text: S.toolsMsg.text}) : el("p", {class: "status", role: "status"});
    if (LOCAL) {
      const file = el("input", {type: "file", id: "import-file", accept: "application/json,.json", hidden: true});
      file.addEventListener("change", async () => {
        const f = file.files && file.files[0]; if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          const list = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : Array.isArray(data.complaints) ? data.complaints : null;
          if (!list) throw new Error("shape");
          const r = await ST.importItems(list);
          S.toolsMsg = {kind: "good", text: `استُوردت ${nC(r.added)}${r.skipped ? `، وتُجوهل ${fmt(r.skipped)} (مكرر أو غير صالح)` : ""}.`};
        } catch (e) { S.toolsMsg = {kind: "bad", text: "لم نتمكن من قراءة الملف. اختاري ملف JSON صدّرته أبشري."}; }
        file.value = ""; await loadSent(); renderMine(); renderAdmin();
      });
      const exportBtn = el("button", {class: "btn ghost", type: "button", text: "تصدير شكاوى هذا الجهاز (JSON)", onclick: () => {
        const items = ST.exportItems();
        if (!items.length) { S.toolsMsg = {kind: "bad", text: "لا توجد شكاوى مرسلة من هذا الجهاز للتصدير."}; renderTools(); return; }
        const blob = new Blob([JSON.stringify({app: "abshri", exportedAt: new Date().toISOString(), items}, null, 2)], {type: "application/json"});
        const a = el("a", {href: URL.createObjectURL(blob), download: `abshri-complaints-${new Date().toISOString().slice(0, 10)}.json`});
        document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        S.toolsMsg = {kind: "good", text: `صُدّرت ${nC(items.length)} إلى ملف.`}; renderTools();
      }});
      const importBtn = el("button", {class: "btn ghost", type: "button", text: "استيراد ملف شكاوى", onclick: () => file.click()});
      const clearBtn = el("button", {class: "btn ghost", type: "button", text: "مسح شكاوى هذا الجهاز", onclick: () => { S.confirmClear = true; renderTools(); }});
      box.append(el("div", {class: "tools"}, exportBtn, importBtn, clearBtn, file, msg));
      if (S.confirmClear) {
        box.append(el("div", {class: "confirm", role: "group", "aria-label": "تأكيد المسح"},
          el("span", {text: `سيُحذف ${nC(ST.exportItems().length)} من هذا المتصفح نهائياً. البيانات التجريبية لا تتأثر.`}),
          el("button", {class: "btn danger", type: "button", text: "نعم، امسحي", onclick: async () => { ST.clear(); S.confirmClear = false; S.toolsMsg = {kind: "good", text: "مُسحت شكاوى هذا الجهاز."}; await loadSent(); renderMine(); renderAdmin(); }}),
          el("button", {class: "btn ghost", type: "button", text: "إلغاء", onclick: () => { S.confirmClear = false; renderTools(); }})));
      }
      return;
    }
    // shared mode
    if (ST.canReadSent()) {
      box.append(el("div", {class: "tools"}, el("span", {class: "hint", text: `مسجّلة الدخول: ${ST.adminEmail}`}),
        el("button", {class: "btn ghost", type: "button", text: "تسجيل الخروج", onclick: async () => { await ST.logout(); S.sent = []; S.toolsMsg = null; renderAdmin(); }}), msg));
    } else {
      const form = el("form", {class: "card login", novalidate: true},
        el("h2", {class: "h3", text: "دخول المسؤولات لعرض الشكاوى المرسلة"}),
        el("p", {class: "hint", text: "البيانات التجريبية متاحة للجميع دون دخول. الشكاوى المرسلة لا يقرؤها إلا حساب مسؤولة."}),
        el("div", {class: "field"}, el("label", {for: "admin-email", text: "البريد الإلكتروني"}), el("input", {type: "email", id: "admin-email", autocomplete: "username", required: true})),
        el("div", {class: "field"}, el("label", {for: "admin-pass", text: "كلمة المرور"}), el("input", {type: "password", id: "admin-pass", autocomplete: "current-password", required: true})),
        el("div", {class: "actions"}, el("button", {class: "btn", type: "submit", text: "دخول"})), msg);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await ST.login($("#admin-email").value.trim(), $("#admin-pass").value); S.toolsMsg = null; await loadSent(); renderAdmin(); }
        catch (err) { S.toolsMsg = {kind: "bad", text: "تعذّر الدخول. تحققي من البريد وكلمة المرور."}; renderTools(); }
      });
      box.append(form);
    }
  }

  // ---------------- dashboard ----------------
  document.querySelectorAll("[data-src]").forEach((b) => b.addEventListener("click", () => { S.source = b.dataset.src; S.shown = 30; renderAdmin(); }));

  function renderAdmin() {
    const note = $("#admin-note"), body = $("#admin-body");
    note.replaceChildren(); body.replaceChildren();
    document.querySelectorAll("[data-src]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.src === S.source)));
    renderTools();
    const notice = (cls, msg) => note.append(el("div", {class: "notice " + cls}, el("span", {class: "dot"}), el("p", {text: msg})));
    const demoNote = "البيانات التجريبية: ٦٠ شكوى (١١ من النسخة الأولى للمشروع و٤٩ مكتوبة للاختبار)، وليست شكاوى طالبات حقيقية، ولا تحمل تواريخ.";

    if (!S.sentReady && S.source !== "demo") { body.append(el("div", {class: "empty"}, el("p", {text: "جارٍ تحميل الشكاوى…"}))); return; }
    if (S.sentErr && S.source !== "demo") notice("warn", "تعذّر تحميل الشكاوى المرسلة: " + S.sentErr);
    if (S.source === "demo") notice("demo", demoNote);
    if (S.source === "all") notice("demo", `تعرض «الكل» ${nC(S.sent.length)} مرسلة ${LOCAL ? "من هذا الجهاز" : ""} مع ٦٠ شكوى تجريبية. ${demoNote}`);
    if (S.source === "sent" && !S.sent.length) {
      body.append(el("div", {class: "empty"}, el("h2", {class: "h3", text: LOCAL ? "لم تُرسل شكاوى من هذا الجهاز بعد" : ST.canReadSent() ? "لا توجد شكاوى بعد" : "سجّلي الدخول لعرض الشكاوى المرسلة"}),
        el("p", {text: LOCAL ? "أرسلي شكوى من «تقديم شكوى» أو استوردي ملف شكاوى، وستظهر هنا مباشرة مع تحليلها." : "البيانات التجريبية متاحة دون دخول."}),
        el("div", {class: "actions"}, el("a", {class: "btn ghost", href: "#submit", text: "تقديم شكوى"}),
          el("button", {class: "btn ghost", type: "button", text: "عرض البيانات التجريبية", onclick: () => { S.source = "demo"; renderAdmin(); }}))));
      return;
    }

    const rows = analyze(dataset());
    const total = rows.length;
    const byCat = new Map(); for (const r of rows) byCat.set(r.cat, (byCat.get(r.cat) || 0) + 1);
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1] || (a[0] === "other") - (b[0] === "other"));
    const topCat = cats.find(([k]) => k !== "other");
    const unclassified = byCat.get("other") || 0;
    const colleges = [...new Set(rows.map((r) => r.college))];
    const labelled = rows.filter((r) => r.studentCategory || r.gold);
    const agree = labelled.filter((r) => (r.studentCategory || r.gold) === r.cat).length;

    body.append(el("div", {class: "kpis"},
      kpi(fmt(total), "شكوى محلَّلة", S.source === "demo" ? "بيانات تجريبية" : S.source === "sent" ? (LOCAL ? "من هذا الجهاز" : "في قاعدة البيانات") : "مرسلة + تجريبية"),
      kpi(topCat ? catName(topCat[0]) : "—", "الفئة الأكثر تكراراً", topCat ? `${nC(topCat[1])} · ${pct(topCat[1], total)}` : "", true),
      kpi(fmt(colleges.length), "كلية وردت منها شكاوى", ""),
      labelled.length
        ? kpi(pct(agree, labelled.length), "اتفاق المصنّف مع التصنيف اليدوي", `${fmt(agree)} من ${fmt(labelled.length)}`)
        : kpi(fmt(unclassified), "غير مصنّفة تحتاج مراجعة", "لا يوجد تصنيف يدوي للمقارنة")));

    const maxC = cats[0] ? cats[0][1] : 1;
    const catCard = el("div", {class: "card"}, el("header", {}, el("h2", {class: "h3", text: "توزيع الفئات"}), el("span", {class: "eyebrow", text: "اضغطي فئة لتصفية القائمة"})),
      el("div", {class: "bars"}, cats.map(([k, n]) => el("div", {class: "bar" + (k === "other" ? " other" : "")},
        el("button", {type: "button", title: catName(k), text: catName(k), onclick: () => { S.filter.cat = k; S.shown = 30; renderAdmin(); $("#list-anchor").scrollIntoView({block: "start"}); }}),
        el("div", {class: "track"}, el("div", {class: "fill", style: `width:${(n / maxC) * 100}%`})),
        el("span", {class: "n num", text: fmt(n)})))));
    const texts = rows.map((r) => (r.title ? r.title + " " : "") + r.text);
    const kws = N.keywordCounts(texts, 18).filter(([, v]) => v >= 2);
    const bgs = N.bigramCounts(texts, 10);
    const kwCard = el("div", {class: "card"}, el("header", {}, el("h2", {class: "h3", text: "الكلمات المتكررة"}), el("span", {class: "eyebrow", text: "اضغطي كلمة للبحث عنها"})),
      kws.length ? el("div", {class: "chips"}, kws.map(([w, n]) => el("button", {type: "button", class: "chip", title: `${nC(n)} ذكرت «${w}»`, onclick: () => { S.filter.q = w; S.shown = 30; renderAdmin(); $("#list-anchor").scrollIntoView({block: "start"}); }}, w, el("b", {class: "num", text: fmt(n)}))))
                 : el("p", {class: "hint", text: "لا توجد كلمة تكررت في شكويين أو أكثر بعد."}),
      el("div", {class: "stack-6"}, el("span", {class: "eyebrow", text: "عبارات من كلمتين تكررت"}),
        bgs.length ? el("div", {class: "chips"}, bgs.map(([w, n]) => el("span", {class: "chip"}, w, el("b", {class: "num", text: fmt(n)}))))
                   : el("p", {class: "hint", text: "لا توجد عبارة ثنائية تكررت بعد."})));
    body.append(el("div", {class: "grid2"}, catCard, kwCard));

    const catKeys = cats.map(([k]) => k);
    const count = (c, k) => rows.filter((r) => r.college === c && (!k || r.cat === k)).length;
    const tbl = el("table", {}, el("thead", {}, el("tr", {}, el("th", {text: "الكلية"}), catKeys.map((k) => el("th", {text: catName(k)})), el("th", {text: "المجموع"}))));
    const tb = el("tbody");
    const cellMax = Math.max(1, ...colleges.flatMap((c) => catKeys.map((k) => count(c, k))));
    for (const c of [...colleges].sort((a, b) => count(b) - count(a))) {
      const tr = el("tr", {}, el("td", {text: c}));
      for (const k of catKeys) { const n = count(c, k); tr.append(el("td", {class: "heat num", style: n ? `background:color-mix(in srgb, var(--accent) ${12 + (n / cellMax) * 48}%, transparent)` : null, text: n ? fmt(n) : "·"})); }
      tr.append(el("td", {class: "num", text: fmt(count(c))})); tb.append(tr);
    }
    tbl.append(tb);
    body.append(el("div", {class: "card"}, el("header", {}, el("h2", {class: "h3", text: "الفئات حسب الكلية"}), el("span", {class: "eyebrow", text: "أين تتركز كل مشكلة"})), el("div", {class: "tablewrap"}, tbl)));

    const reps = el("div", {class: "reps"});
    for (const [k, n] of cats.filter(([k]) => k !== "other").slice(0, 5)) {
      const g = rows.filter((r) => r.cat === k);
      const top = new Map(N.keywordCounts(g.map((r) => r.text), 6));
      const rep = g.reduce((best, r) => { const s = [...new Set(N.tokenize(r.text))].reduce((a, w) => a + (top.get(w) || 0), 0); return s > best.s ? {s, r} : best; }, {s: -1, r: g[0]}).r;
      reps.append(el("div", {class: "rep"}, el("div", {class: "meta"}, el("span", {class: "pill", text: catName(k)}), el("span", {class: "num", text: nC(n)}), el("span", {text: [...top.keys()].slice(0, 4).join("، ")})), el("q", {text: rep.text})));
    }
    body.append(el("div", {class: "grid2"},
      el("div", {class: "card"}, el("header", {}, el("h2", {class: "h3", text: "مثال يمثّل كل فئة"}), el("span", {class: "eyebrow", text: "الشكوى الأكثر اشتراكاً في كلمات فئتها"})), reps),
      trendCard(rows)));
    body.append(el("span", {id: "list-anchor"}), listCard(rows));
  }

  function kpi(v, label, sub, small) {
    return el("div", {class: "kpi"}, el("span", {class: "s", text: label}), el("span", {class: "v num" + (small ? " small" : ""), text: v}), sub ? el("span", {class: "s", text: sub}) : null);
  }

  function trendCard(rows) {
    const card = el("div", {class: "card"}, el("header", {}, el("h2", {class: "h3", text: "الشكاوى عبر الأسابيع"})));
    const weekOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x.getTime(); };
    const weeks = new Map(); for (const r of rows.filter((r) => r.createdAt)) { const w = weekOf(r.createdAt); if (!isNaN(w)) weeks.set(w, (weeks.get(w) || 0) + 1); }
    if (weeks.size < 2) {
      card.append(el("p", {class: "hint", text: S.source === "demo" ? "البيانات التجريبية بلا تواريخ، فلا يُرسم لها اتجاه زمني." : "يظهر الاتجاه حين تمتد الشكاوى المرسلة على أسبوعين على الأقل."}));
      const un = rows.filter((r) => r.cat === "other");
      card.append(el("span", {class: "eyebrow", text: `غير مصنّفة (${fmt(un.length)}): تحتاج قراءة يدوية أو كلمات جديدة في المعجم`}));
      if (un.length) card.append(el("div", {class: "reps"}, un.slice(0, 4).map((r) => el("div", {class: "rep"}, el("q", {text: r.text}), el("span", {class: "meta", text: r.college})))));
      return card;
    }
    const first = Math.min(...weeks.keys()), last = Math.max(...weeks.keys()), W = 7 * 864e5;
    const series = []; for (let t = first; t <= last + 1; t += W) series.push([t, weeks.get(t) || 0]);
    const s = series.slice(-16), max = Math.max(...s.map(([, n]) => n));
    const w = 560, h = 180, pad = {l: 28, r: 8, t: 10, b: 26}, bw = (w - pad.l - pad.r) / s.length;
    const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("class", "trend"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "عدد الشكاوى في كل أسبوع"); svg.setAttribute("direction", "ltr");
    const mk = (tag, a) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); svg.append(n); return n; };
    for (const g of [0, max]) { const y = pad.t + (h - pad.t - pad.b) * (1 - g / max); mk("line", {x1: pad.l, x2: w - pad.r, y1: y, y2: y, class: "g"}); mk("text", {x: pad.l - 6, y: y + 4, "text-anchor": "end"}).textContent = fmt(g); }
    s.forEach(([t, n], i) => {
      const bh = (h - pad.t - pad.b) * (n / max), x = pad.l + i * bw + bw * .15;
      mk("rect", {x, y: h - pad.b - bh, width: bw * .7, height: Math.max(bh, n ? 2 : 0), rx: 3, class: "b"});
      if (i === 0 || i === s.length - 1 || s.length <= 8) mk("text", {x: x + bw * .35, y: h - 8, "text-anchor": "middle"}).textContent = new Date(t).toLocaleDateString("ar-SA", {day: "numeric", month: "short"});
    });
    card.append(el("span", {class: "eyebrow", text: "بداية كل أسبوع (الأحد)"}), svg);
    return card;
  }

  function listCard(rows) {
    const f = S.filter, q = N.normalize(f.q), qTok = N.tokenize(f.q);
    const list = rows.filter((r) => (!f.cat || r.cat === f.cat) && (!f.college || r.college === f.college) &&
      (!q || N.normalize(r.title + " " + r.text).includes(q) || qTok.some((t) => N.tokenize(r.title + " " + r.text).includes(t))));
    if (f.sort === "new") list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    else if (f.sort === "old") list.sort((a, b) => (a.createdAt || "￿").localeCompare(b.createdAt || "￿"));
    else if (f.sort === "cat") list.sort((a, b) => catName(a.cat).localeCompare(catName(b.cat), "ar"));

    const search = el("input", {type: "search", id: "f-q", placeholder: "ابحثي: نت، مكيف، باص…", value: f.q, "aria-label": "بحث في الشكاوى"});
    let t; search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { S.filter.q = search.value; S.shown = 30; refresh(); }, 200); });
    const sel = (id, label, opts, val, on) => { const s = el("select", {id, "aria-label": label, onchange: (e) => { on(e.target.value); refresh(); }}, opts.map(([v, tx]) => el("option", {value: v, text: tx}))); s.value = val; return s; };
    const catSel = sel("f-cat", "تصفية حسب الفئة", [["", "كل الفئات"], ...[...N.CATEGORIES, N.CAT_BY_KEY.other].map((c) => [c.key, c.ar])], f.cat, (v) => { S.filter.cat = v; S.shown = 30; });
    const colSel = sel("f-col", "تصفية حسب الكلية", [["", "كل الكليات"], ...[...new Set(rows.map((r) => r.college))].map((c) => [c, c])], f.college, (v) => { S.filter.college = v; S.shown = 30; });
    const sortSel = sel("f-sort", "الترتيب", [["new", "الأحدث أولاً"], ["old", "الأقدم أولاً"], ["cat", "حسب الفئة"]], f.sort, (v) => { S.filter.sort = v; });

    const box = el("div", {class: "clist", id: "clist"});
    const card = el("div", {class: "card"},
      el("header", {}, el("h2", {class: "h3", text: "كل الشكاوى"}), el("span", {class: "eyebrow num", id: "list-count", text: `${fmt(list.length)} من ${fmt(rows.length)}`})),
      el("div", {class: "list-tools"}, el("div", {class: "q"}, search), catSel, colSel, sortSel), box);
    function refresh() {
      const keep = document.activeElement && document.activeElement.id;
      const fresh = listCard(rows); card.replaceWith(fresh);
      const n = keep && document.getElementById(keep);
      if (n) { n.focus(); if (n.type === "search") n.setSelectionRange(n.value.length, n.value.length); }
    }
    const hl = new Set(qTok);
    for (const r of list.slice(0, S.shown)) {
      const lbl = r.studentCategory || r.gold;
      box.append(el("div", {class: "citem"},
        el("div", {class: "meta"}, el("span", {class: "pill" + (r.cat === "other" ? " other" : ""), text: catName(r.cat)}),
          S.source === "all" ? el("span", {class: "tag" + (r.demo ? "" : " sent"), text: r.demo ? "تجريبية" : "مرسلة"}) : null,
          el("span", {text: r.college}), r.createdAt ? el("span", {class: "num", text: dateStr(r.createdAt)}) : null,
          lbl && lbl !== r.cat ? el("span", {class: "mismatch", text: (r.gold ? "التصنيف اليدوي: " : "الطالبة اختارت: ") + catName(lbl)}) : null),
        r.title ? el("span", {class: "t", text: r.title}) : null,
        highlight(r.text, hl),
        r.matched.length ? el("span", {class: "hint", text: "سبب التصنيف: " + r.matched.join("، ")}) : null));
    }
    if (!list.length) box.append(el("div", {class: "empty"}, el("p", {text: "لا توجد شكاوى تطابق هذا البحث."}),
      el("button", {class: "btn ghost", type: "button", text: "مسح التصفية", onclick: () => { S.filter = {q: "", cat: "", college: "", sort: f.sort}; refresh(); }})));
    if (list.length > S.shown) box.append(el("button", {class: "btn ghost more", type: "button", text: `عرض المزيد (${fmt(list.length - S.shown)})`, onclick: () => { S.shown += 30; refresh(); }}));
    return card;
  }
  function highlight(text, terms) {
    const p = el("p");
    if (!terms.size) { p.textContent = text; return p; }
    for (const word of text.split(/(\s+)/)) {
      const st = N.tokenize(word)[0];
      if (st && [...terms].some((t) => st === t || st.startsWith(t))) p.append(el("mark", {text: word})); else p.append(word);
    }
    return p;
  }

  // ---------------- method: live evaluation on the demo set ----------------
  (function renderEval() {
    const pred = DEMO.map((d) => N.classify(d.text).key);
    const correct = pred.filter((p, i) => p === DEMO[i].label).length;
    const rowsP = N.CATEGORIES.map((c) => {
      const tp = pred.filter((p, i) => p === c.key && DEMO[i].label === c.key).length;
      const fp = pred.filter((p, i) => p === c.key && DEMO[i].label !== c.key).length;
      const fn = DEMO.filter((d, i) => d.label === c.key && pred[i] !== c.key).length;
      const P = tp + fp ? tp / (tp + fp) : 0, R = tp + fn ? tp / (tp + fn) : 0, F = P + R ? 2 * P * R / (P + R) : 0;
      return {c, P, R, F, n: tp + fn};
    });
    const macro = rowsP.reduce((a, r) => a + r.F, 0) / rowsP.length;
    const f2 = (x) => new Intl.NumberFormat("ar-SA", {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(x);
    $("#eval-kpis").append(
      kpi(pct(correct, DEMO.length), "الدقة", `${fmt(correct)} من ${fmt(DEMO.length)}`),
      kpi(f2(macro), "متوسط F1 للفئات", "Macro-F1"),
      kpi(fmt(pred.filter((p) => p === "other").length), "غير مصنّفة", "بلا كلمة من المعجم"));
    $("#eval-table").append(el("thead", {}, el("tr", {}, ["الفئة", "الدقة P", "الاستدعاء R", "F1", "العدد"].map((h) => el("th", {text: h})))),
      el("tbody", {}, rowsP.map((r) => el("tr", {}, el("td", {text: r.c.ar}), el("td", {class: "num", text: f2(r.P)}), el("td", {class: "num", text: f2(r.R)}), el("td", {class: "num", text: f2(r.F)}), el("td", {class: "num", text: fmt(r.n)})))));
  })();

  // ---------------- boot ----------------
  renderModeNotes(); renderReading(); countText(); renderMine(); route();
  ST.ready.then(async () => { renderModeNotes(); await loadSent(); if (!$("#view-admin").hidden) renderAdmin(); });
})();
