// أبشري — storage layer. No dependency on any hosting platform or login.
//
// Two interchangeable back-ends with the same interface:
//   LocalStore  (default) — complaints are kept in this browser (localStorage).
//                           Works for every visitor with no account and no setup.
//   SharedStore (optional) — Supabase Postgres. Visitors can only INSERT (row-level
//                           security); only signed-in admins can read. Enabled by
//                           filling config.js. The anon key is public by design.
window.AbshriStorage = (() => {
  const KEY_ALL = "abshri.complaints.v1";   // local mode: every complaint sent from this browser
  const KEY_MINE = "abshri.mine.v1";        // shared mode: local copy of this visitor's own submissions
  const MAX_LOCAL = 2000;

  const safeGet = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const storageWorks = (() => { try { const k = "abshri.probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch (e) { return false; } })();

  // Only well-formed complaints are ever accepted (imports included).
  function clean(it) {
    if (!it || typeof it !== "object" || typeof it.text !== "string") return null;
    const text = it.text.trim().slice(0, 800);
    if (!text) return null;
    return {
      id: String(it.id || ("c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7))).slice(0, 60),
      college: String(it.college || "—").slice(0, 80),
      title: String(it.title || "").slice(0, 80),
      text,
      studentCategory: typeof it.studentCategory === "string" ? it.studentCategory : (typeof it.student_category === "string" ? it.student_category : null),
      createdAt: typeof it.createdAt === "string" ? it.createdAt : (typeof it.created_at === "string" ? it.created_at : null),
    };
  }

  // ------------------------------------------------------------------ local
  const LocalStore = {
    mode: "local",
    ready: Promise.resolve(),
    available: storageWorks,
    async submit(item) {
      if (!storageWorks) throw {code: "storage_blocked"};
      const all = safeGet(KEY_ALL);
      if (all.length >= MAX_LOCAL) throw {code: "full"};
      all.push(item);
      if (!safeSet(KEY_ALL, all)) throw {code: "storage_blocked"};
    },
    async listSent() { return safeGet(KEY_ALL).map(clean).filter(Boolean); },
    mine() { return safeGet(KEY_ALL).map(clean).filter(Boolean); },
    canReadSent: () => true,
    async importItems(list) {
      const all = safeGet(KEY_ALL); const ids = new Set(all.map((x) => x.id)); let added = 0, skipped = 0;
      for (const raw of list) {
        const it = clean(raw);
        if (!it || ids.has(it.id)) { skipped++; continue; }
        all.push(it); ids.add(it.id); added++;
      }
      if (all.length > MAX_LOCAL) throw {code: "full"};
      if (!safeSet(KEY_ALL, all)) throw {code: "storage_blocked"};
      return {added, skipped};
    },
    exportItems() { return safeGet(KEY_ALL).map(clean).filter(Boolean); },
    clear() { safeSet(KEY_ALL, []); },
  };

  // ----------------------------------------------------------------- shared
  function makeSharedStore(cfg) {
    let client = null, session = null, loadErr = null;
    const ready = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
      s.onload = async () => {
        try {
          client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
          const r = await client.auth.getSession(); session = r.data.session;
        } catch (e) { loadErr = e; }
        resolve();
      };
      s.onerror = () => { loadErr = new Error("load"); resolve(); };
      document.head.append(s);
    });
    const store = {
      mode: "shared",
      ready,
      get available() { return !!client && !loadErr; },
      async submit(item) {
        await ready; if (!client) throw {code: "offline"};
        const {error} = await client.from("complaints").insert({
          college: item.college, title: item.title, text: item.text, student_category: item.studentCategory,
        });  // no .select(): visitors are not allowed to read rows back
        if (error) throw {code: "server", message: error.message};
        const mine = safeGet(KEY_MINE); mine.push(item); safeSet(KEY_MINE, mine.slice(-200));
      },
      canReadSent: () => !!session,
      get adminEmail() { return session && session.user ? session.user.email : ""; },
      async login(email, password) {
        await ready; if (!client) throw {code: "offline"};
        const {data, error} = await client.auth.signInWithPassword({email, password});
        if (error) throw {code: "auth", message: error.message};
        session = data.session;
      },
      async logout() { if (client) await client.auth.signOut(); session = null; },
      async listSent() {
        await ready; if (!client || !session) return [];
        const {data, error} = await client.from("complaints").select("id,college,title,text,student_category,created_at")
          .order("created_at", {ascending: false}).limit(1000);
        if (error) throw {code: "server", message: error.message};
        return (data || []).map(clean).filter(Boolean);
      },
      mine() { return safeGet(KEY_MINE).map(clean).filter(Boolean); },
      async importItems(list) {
        let added = 0, skipped = 0;
        for (const raw of list) { const it = clean(raw); if (!it) { skipped++; continue; } await store.submit(it); added++; }
        return {added, skipped};
      },
      exportItems: null, clear: null,
    };
    return store;
  }

  const cfg = window.ABSHRI_CONFIG || {};
  const configured = typeof cfg.supabaseUrl === "string" && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.supabaseUrl.trim())
    && typeof cfg.supabaseAnonKey === "string" && cfg.supabaseAnonKey.trim().length > 20;
  return configured ? makeSharedStore({supabaseUrl: cfg.supabaseUrl.trim(), supabaseAnonKey: cfg.supabaseAnonKey.trim()}) : LocalStore;
})();
