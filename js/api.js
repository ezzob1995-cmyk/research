/* =====================================================================
 *  שכבת נתונים: Supabase (אמיתי) או מצב הדגמה (localStorage)
 *  שתיהן חושפות בדיוק אותן פונקציות.
 * ===================================================================== */
(function () {
  const CFG = window.APP_CONFIG || {};
  const DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_KEY;

  class ApiError extends Error { constructor(code) { super(code); this.code = code; } }

  const ERRORS = {
    BAD_CREDENTIALS: 'שם משתמש או סיסמה שגויים',
    USER_DISABLED: 'המשתמש הושבת — פנה למנהל המחקר',
    USER_LOCKED: 'יותר מדי ניסיונות כושלים. נסה שוב בעוד 15 דקות',
    NOT_AUTHENTICATED: 'פג תוקף ההתחברות — יש להתחבר מחדש',
    FORBIDDEN: 'אין לך הרשאה לפעולה זו',
    FORBIDDEN_FORM: 'אין לך הרשאה להזין טופס זה',
    BAD_OLD_PASSWORD: 'הסיסמה הנוכחית שגויה',
    WEAK_PASSWORD: 'סיסמה חייבת להכיל לפחות 8 תווים',
    CODE_REQUIRED: 'חובה להזין מספר סידורי',
    CODE_EXISTS: 'מספר סידורי זה כבר קיים במערכת',
    DATE_REQUIRED: 'חובה להזין תאריך',
    FORM_REQUIRED: 'חסר סוג טופס',
    NOT_FOUND: 'הרשומה לא נמצאה',
    USERNAME_REQUIRED: 'חובה שם משתמש ושם מלא',
    USERNAME_EXISTS: 'שם המשתמש כבר תפוס',
    PASSWORD_REQUIRED: 'חובה להגדיר סיסמה למשתמש חדש',
    CANNOT_DEMOTE_SELF: 'לא ניתן להסיר הרשאת מנהל מעצמך או להשבית את עצמך',
    NETWORK: 'אין חיבור לשרת. בדוק חיבור לאינטרנט'
  };
  function message(err) {
    const c = err && (err.code || err.message);
    return ERRORS[c] || ('שגיאה: ' + c);
  }

  /* ------------------------------ Supabase ------------------------------ */
  async function rpc(fn, params) {
    const headers = { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_KEY };
    if (CFG.SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + CFG.SUPABASE_KEY;
    let res;
    try {
      res = await fetch(CFG.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
        method: 'POST', headers, body: JSON.stringify(params || {})
      });
    } catch (e) { throw new ApiError('NETWORK'); }
    let body = null;
    try { body = await res.json(); } catch (e) { /* empty */ }
    if (!res.ok) {
      const code = body && body.message ? String(body.message).trim() : 'HTTP_' + res.status;
      throw new ApiError(code);
    }
    if (body && body.error) throw new ApiError(body.error);
    return body;
  }

  const remote = {
    login: (u, p) => rpc('rs_login', { p_username: u, p_password: p }),
    logout: (t) => rpc('rs_logout', { p_token: t }),
    me: (t) => rpc('rs_me', { p_token: t }),
    changePassword: (t, o, n) => rpc('rs_change_password', { p_token: t, p_old: o, p_new: n }),
    saveSettings: (t, s) => rpc('rs_save_settings', { p_token: t, p_settings: s }),
    listPatients: (t) => rpc('rs_list_patients', { p_token: t }),
    savePatient: (t, p) => rpc('rs_save_patient', { p_token: t, p_patient: p }),
    listRecords: (t, pid, form) => rpc('rs_list_records', { p_token: t, p_patient_id: pid || null, p_form_type: form || null }),
    saveRecord: (t, r) => rpc('rs_save_record', { p_token: t, p_record: r }),
    deleteRecord: (t, id) => rpc('rs_delete_record', { p_token: t, p_id: id }),
    staffList: (t) => rpc('rs_staff_list', { p_token: t }),
    staffSave: (t, s) => rpc('rs_staff_save', { p_token: t, p_staff: s }),
    stats: (t) => rpc('rs_stats', { p_token: t }),
    audit: (t, n) => rpc('rs_audit', { p_token: t, p_limit: n || 300 }),
    exportAll: (t) => rpc('rs_export', { p_token: t })
  };

  /* ------------------------------ מצב הדגמה ------------------------------ */
  const KEY = 'research_demo_db_v1';
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return memDb; } },
    set(db) { memDb = db; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* memory only */ } }
  };
  let memDb = null;
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
  const now = () => new Date().toISOString();
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return 'h' + (h >>> 0).toString(16); };
  const delay = (v) => new Promise(r => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 60));

  function freshDb() {
    return {
      settings: { study_name: 'מחקר מחלקתי — גיל ביולוגי מול גיל כרונולוגי', wards: ['המחלקה שלנו', 'מחלקה סגורה נשים'], target_patients: 60, target_visits: 2, start_date: null, end_date: null },
      staff: [{ id: uid(), username: 'admin', full_name: 'מנהל המחקר', pw: hash('ChangeMe123!'), role: 'admin', forms: Object.keys(FORMS),
        can_add_patients: true, can_edit_others: true, can_export: true, can_view_stats: true, active: true,
        must_change_password: true, failed_attempts: 0, locked_until: null, last_login: null, created_at: now() }],
      sessions: {}, patients: [], records: [], audit: []
    };
  }
  function db() { let d = store.get(); if (!d) { d = freshDb(); store.set(d); } return d; }
  function userJson(s) { const { pw, failed_attempts, locked_until, ...u } = s; return u; }
  function log(d, staffId, action, entity, entityId, details) {
    d.audit.unshift({ id: d.audit.length + 1, at: now(), staff_id: staffId, action, entity, entity_id: entityId, details: details || null });
    if (d.audit.length > 3000) d.audit.length = 3000;
  }
  function auth(d, token) {
    const s = d.sessions[token];
    if (!s || new Date(s.expires) < new Date()) throw new ApiError('NOT_AUTHENTICATED');
    const u = d.staff.find(x => x.id === s.staff_id);
    if (!u || !u.active) throw new ApiError('NOT_AUTHENTICATED');
    s.expires = new Date(Date.now() + 12 * 3600e3).toISOString();
    return u;
  }
  const isAdmin = (u) => u.role === 'admin';
  const name = (d, id) => (d.staff.find(s => s.id === id) || {}).full_name || null;

  function listPatients(d) {
    return d.patients.map(p => {
      const recs = d.records.filter(r => r.patient_id === p.id && !r.deleted);
      const counts = {}; recs.forEach(r => counts[r.form_type] = (counts[r.form_type] || 0) + 1);
      const last = recs.map(r => r.visit_date).sort().pop() || null;
      return { ...p, created_by_name: name(d, p.created_by), counts, last_visit: last };
    }).sort((a, b) => a.code.localeCompare(b.code, 'he', { numeric: true }));
  }
  function listRecords(d, pid, form) {
    return d.records.filter(r => !r.deleted && (!pid || r.patient_id === pid) && (!form || r.form_type === form)).map(r => {
      const p = d.patients.find(x => x.id === r.patient_id) || {};
      return { ...r, patient_code: p.code, ward: p.ward, created_by_name: name(d, r.created_by), updated_by_name: name(d, r.updated_by) };
    }).sort((a, b) => (b.visit_date + b.created_at).localeCompare(a.visit_date + a.created_at));
  }

  const demo = {
    async login(u, p) {
      const d = db();
      const s = d.staff.find(x => x.username.toLowerCase() === String(u).trim().toLowerCase());
      if (!s) throw new ApiError('BAD_CREDENTIALS');
      if (!s.active) throw new ApiError('USER_DISABLED');
      if (s.locked_until && new Date(s.locked_until) > new Date()) throw new ApiError('USER_LOCKED');
      if (s.pw !== hash(p)) {
        s.failed_attempts++; if (s.failed_attempts >= 5) s.locked_until = new Date(Date.now() + 15 * 60e3).toISOString();
        log(d, s.id, 'login_failed', 'staff', s.id); store.set(d); throw new ApiError('BAD_CREDENTIALS');
      }
      const token = uid() + uid();
      d.sessions[token] = { staff_id: s.id, expires: new Date(Date.now() + 12 * 3600e3).toISOString() };
      s.failed_attempts = 0; s.locked_until = null; s.last_login = now();
      log(d, s.id, 'login', 'staff', s.id); store.set(d);
      return delay({ token, user: userJson(s), settings: d.settings });
    },
    async logout(t) { const d = db(); delete d.sessions[t]; store.set(d); return { ok: true }; },
    async me(t) { const d = db(); const u = auth(d, t); store.set(d); return delay({ user: userJson(u), settings: d.settings }); },
    async changePassword(t, o, n) {
      const d = db(); const u = auth(d, t);
      if (u.pw !== hash(o)) throw new ApiError('BAD_OLD_PASSWORD');
      if (!n || n.length < 8) throw new ApiError('WEAK_PASSWORD');
      u.pw = hash(n); u.must_change_password = false; log(d, u.id, 'change_password', 'staff', u.id); store.set(d);
      return { ok: true };
    },
    async saveSettings(t, s) {
      const d = db(); const u = auth(d, t); if (!isAdmin(u)) throw new ApiError('FORBIDDEN');
      Object.assign(d.settings, s); log(d, u.id, 'save_settings', 'settings', null, s); store.set(d); return delay(d.settings);
    },
    async listPatients(t) { const d = db(); auth(d, t); return delay(listPatients(d)); },
    async savePatient(t, p) {
      const d = db(); const u = auth(d, t);
      const code = String(p.code || '').trim(); if (!code) throw new ApiError('CODE_REQUIRED');
      const dup = d.patients.find(x => x.code.toLowerCase() === code.toLowerCase() && x.id !== p.id);
      if (dup) throw new ApiError('CODE_EXISTS');
      let row;
      if (!p.id) {
        if (!(isAdmin(u) || u.can_add_patients)) throw new ApiError('FORBIDDEN');
        row = { id: uid(), code, ward: p.ward || null, sex: p.sex || null, birth_month: p.birth_month || null, data: p.data || {}, active: p.active !== false, created_by: u.id, created_at: now(), updated_by: null, updated_at: null };
        d.patients.push(row); log(d, u.id, 'create_patient', 'patient', row.id, { code });
      } else {
        row = d.patients.find(x => x.id === p.id); if (!row) throw new ApiError('NOT_FOUND');
        if (!(isAdmin(u) || u.can_edit_others || row.created_by === u.id)) throw new ApiError('FORBIDDEN');
        Object.assign(row, { code, ward: p.ward || null, sex: p.sex || null, birth_month: p.birth_month || null, data: p.data || {}, active: p.active !== false, updated_by: u.id, updated_at: now() });
        log(d, u.id, 'update_patient', 'patient', row.id, { code });
      }
      store.set(d); return delay(row);
    },
    async listRecords(t, pid, form) { const d = db(); auth(d, t); return delay(listRecords(d, pid, form)); },
    async saveRecord(t, r) {
      const d = db(); const u = auth(d, t);
      if (!r.form_type) throw new ApiError('FORM_REQUIRED');
      if (!(isAdmin(u) || u.forms.includes(r.form_type))) throw new ApiError('FORBIDDEN_FORM');
      if (!r.visit_date) throw new ApiError('DATE_REQUIRED');
      if (!d.patients.find(p => p.id === r.patient_id)) throw new ApiError('NOT_FOUND');
      let row;
      if (!r.id) {
        row = { id: uid(), patient_id: r.patient_id, form_type: r.form_type, visit_date: r.visit_date, data: r.data || {}, computed: r.computed || {}, deleted: false, created_by: u.id, created_at: now(), updated_by: null, updated_at: null };
        d.records.push(row); log(d, u.id, 'create_record', r.form_type, row.id);
      } else {
        row = d.records.find(x => x.id === r.id && !x.deleted); if (!row) throw new ApiError('NOT_FOUND');
        if (!(isAdmin(u) || u.can_edit_others || row.created_by === u.id)) throw new ApiError('FORBIDDEN');
        Object.assign(row, { visit_date: r.visit_date, data: r.data || {}, computed: r.computed || {}, updated_by: u.id, updated_at: now() });
        log(d, u.id, 'update_record', row.form_type, row.id);
      }
      store.set(d); return delay(row);
    },
    async deleteRecord(t, id) {
      const d = db(); const u = auth(d, t);
      const row = d.records.find(x => x.id === id && !x.deleted); if (!row) throw new ApiError('NOT_FOUND');
      if (!(isAdmin(u) || u.can_edit_others || row.created_by === u.id)) throw new ApiError('FORBIDDEN');
      row.deleted = true; row.updated_by = u.id; row.updated_at = now(); log(d, u.id, 'delete_record', row.form_type, row.id); store.set(d);
      return { ok: true };
    },
    async staffList(t) { const d = db(); const u = auth(d, t); if (!isAdmin(u)) throw new ApiError('FORBIDDEN'); return delay(d.staff.map(userJson)); },
    async staffSave(t, s) {
      const d = db(); const u = auth(d, t); if (!isAdmin(u)) throw new ApiError('FORBIDDEN');
      if (s.password && s.password.length < 8) throw new ApiError('WEAK_PASSWORD');
      if (!String(s.username || '').trim() || !String(s.full_name || '').trim()) throw new ApiError('USERNAME_REQUIRED');
      if (d.staff.find(x => x.username.toLowerCase() === s.username.trim().toLowerCase() && x.id !== s.id)) throw new ApiError('USERNAME_EXISTS');
      const fields = { username: s.username.trim(), full_name: s.full_name.trim(), role: s.role || 'staff', forms: s.forms || [],
        can_add_patients: s.can_add_patients !== false, can_edit_others: !!s.can_edit_others, can_export: !!s.can_export, can_view_stats: !!s.can_view_stats, active: s.active !== false };
      let row;
      if (!s.id) {
        if (!s.password) throw new ApiError('PASSWORD_REQUIRED');
        row = { id: uid(), ...fields, pw: hash(s.password), must_change_password: true, failed_attempts: 0, locked_until: null, last_login: null, created_at: now() };
        d.staff.push(row); log(d, u.id, 'create_staff', 'staff', row.id, { username: row.username });
      } else {
        if (s.id === u.id && (fields.role !== 'admin' || !fields.active)) throw new ApiError('CANNOT_DEMOTE_SELF');
        row = d.staff.find(x => x.id === s.id); if (!row) throw new ApiError('NOT_FOUND');
        Object.assign(row, fields);
        if (s.password) { row.pw = hash(s.password); row.must_change_password = s.id !== u.id; row.failed_attempts = 0; row.locked_until = null; }
        if (s.password || !row.active) for (const k of Object.keys(d.sessions)) if (d.sessions[k].staff_id === row.id && row.id !== u.id) delete d.sessions[k];
        log(d, u.id, s.password ? 'reset_password' : 'update_staff', 'staff', row.id, { username: row.username });
      }
      store.set(d); return delay(userJson(row));
    },
    async stats(t) {
      const d = db(); const u = auth(d, t); if (!(isAdmin(u) || u.can_view_stats)) throw new ApiError('FORBIDDEN');
      const recs = d.records.filter(r => !r.deleted);
      const count = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const weekAgo = Date.now() - 7 * 864e5, yearAgo = Date.now() - 365 * 864e5;
      const pw = {}; recs.forEach(r => { (pw[r.form_type] = pw[r.form_type] || new Set()).add(r.patient_id); });
      const wards = {}; d.patients.forEach(p => { const w = p.ward || '—'; wards[w] = wards[w] || { ward: w, patients: 0, records: 0 }; wards[w].patients++; });
      recs.forEach(r => { const p = d.patients.find(x => x.id === r.patient_id); const w = (p && p.ward) || '—'; if (wards[w]) wards[w].records++; });
      const byMonth = count(recs.filter(r => new Date(r.created_at) > yearAgo), r => r.created_at.slice(0, 7));
      const pheno = {}; recs.filter(r => r.form_type === 'labs' && r.computed && r.computed.acceleration != null).forEach(r => {
        const p = d.patients.find(x => x.id === r.patient_id); const w = (p && p.ward) || '—';
        (pheno[w] = pheno[w] || []).push(r);
      });
      const avg = (a, f) => a.length ? Math.round(a.reduce((s, x) => s + Number(f(x)), 0) / a.length * 100) / 100 : null;
      const visits = {}; d.patients.forEach(p => { const n = recs.filter(r => r.patient_id === p.id && r.form_type === 'labs').length; visits[n] = (visits[n] || 0) + 1; });
      return delay({
        settings: d.settings, patients_total: d.patients.length, patients_active: d.patients.filter(p => p.active).length, records_total: recs.length,
        by_form: count(recs, r => r.form_type),
        patients_with_form: Object.fromEntries(Object.entries(pw).map(([k, v]) => [k, v.size])),
        by_ward: Object.values(wards),
        by_month: Object.entries(byMonth).map(([month, n]) => ({ month, n })).sort((a, b) => a.month.localeCompare(b.month)),
        staff: d.staff.map(s => {
          const mine = recs.filter(r => r.created_by === s.id);
          return { id: s.id, full_name: s.full_name, username: s.username, role: s.role, active: s.active, last_login: s.last_login,
            records_total: mine.length, records_month: mine.filter(r => new Date(r.created_at) >= monthStart).length,
            records_week: mine.filter(r => new Date(r.created_at) > weekAgo).length,
            edits: d.records.filter(r => r.updated_by === s.id).length, patients_added: d.patients.filter(p => p.created_by === s.id).length,
            active_days: new Set(mine.map(r => r.created_at.slice(0, 10))).size, last_entry: mine.map(r => r.created_at).sort().pop() || null,
            by_form: count(mine, r => r.form_type) };
        }).sort((a, b) => b.records_total - a.records_total),
        phenoage: Object.entries(pheno).map(([ward, a]) => ({ ward, n: a.length, avg_accel: avg(a, r => r.computed.acceleration), avg_pheno: avg(a, r => r.computed.phenoage), avg_age: avg(a, r => r.data.age) })),
        visits_distribution: Object.entries(visits).map(([v, n]) => ({ visits: Number(v), patients: n })).sort((a, b) => a.visits - b.visits)
      });
    },
    async audit(t, n) {
      const d = db(); const u = auth(d, t); if (!isAdmin(u)) throw new ApiError('FORBIDDEN');
      return delay(d.audit.slice(0, n || 300).map(a => ({ ...a, full_name: name(d, a.staff_id) })));
    },
    async exportAll(t) {
      const d = db(); const u = auth(d, t); if (!(isAdmin(u) || u.can_export)) throw new ApiError('FORBIDDEN');
      log(d, u.id, 'export'); store.set(d);
      return delay({ patients: listPatients(d), records: listRecords(d) });
    },

    /* --- הדגמה בלבד --- */
    resetDemo() { store.set(freshDb()); },
    seedDemo() {
      const d = db();
      const admin = d.staff[0];
      const names = [['dana', 'דנה כהן'], ['yossi', 'יוסי לוי'], ['rania', 'ראניה חטיב'], ['moshe', 'משה אברהם'], ['lina', 'לינא עודה']];
      const staff = names.map(([u, n], i) => {
        let s = d.staff.find(x => x.username === u);
        if (!s) { s = { id: uid(), username: u, full_name: n, pw: hash('Staff12345'), role: 'staff', forms: i % 2 ? ['labs', 'feet', 'neglect'] : ['labs', 'neglect'],
          can_add_patients: true, can_edit_others: false, can_export: false, can_view_stats: false, active: true, must_change_password: false, failed_attempts: 0, locked_until: null, last_login: now(), created_at: now() }; d.staff.push(s); }
        return s;
      });
      const rnd = (a, b, dec = 1) => Math.round((a + Math.random() * (b - a)) * Math.pow(10, dec)) / Math.pow(10, dec);
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      const diag = PATIENT_FIELDS[0].options, meds = PATIENT_FIELDS[1].options;
      const start = d.patients.length;
      for (let i = 1; i <= 24; i++) {
        const by = pick(staff);
        const ward = i % 3 === 0 ? d.settings.wards[1] : d.settings.wards[0];
        const p = { id: uid(), code: 'R-' + String(start + i).padStart(3, '0'), ward, sex: ward === d.settings.wards[1] ? 'F' : pick(['M', 'F']),
          birth_month: `${1955 + Math.floor(Math.random() * 45)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}`,
          data: { diagnosis: pick(diag), med_classes: [pick(meds), pick(meds)].filter((v, j, a) => a.indexOf(v) === j), treatment_years: Math.floor(rnd(1, 30, 0)), smoking: pick(['לא מעשן', 'מעשן', 'מעשן בעבר']), diabetes: pick(['כן', 'לא', 'לא']) },
          active: true, created_by: by.id, created_at: new Date(Date.now() - rnd(30, 200, 0) * 864e5).toISOString(), updated_by: null, updated_at: null };
        d.patients.push(p);
        const nv = Math.random() < 0.6 ? 2 : 1;
        for (let v = 0; v < nv; v++) {
          const date = new Date(Date.now() - (v === 0 ? rnd(100, 180, 0) : rnd(5, 60, 0)) * 864e5).toISOString().slice(0, 10);
          const data = { age: PhenoAge.ageAt(p.birth_month, date), albumin: rnd(3.4, 4.8, 2), creatinine: rnd(0.6, 1.3, 2), glucose: rnd(78, 150, 0), fasting: 'כן', crp: rnd(0.3, 18, 1),
            alp: rnd(45, 130, 0), wbc: rnd(4.5, 11, 1), lymph: rnd(18, 40, 1), mcv: rnd(82, 98, 1), rdw: rnd(12, 15.5, 1), weight: rnd(55, 115, 1), height: rnd(155, 188, 0) };
          const who = pick(staff), at = new Date(new Date(date).getTime() + 3600e3 * rnd(1, 30, 0)).toISOString();
          d.records.push({ id: uid(), patient_id: p.id, form_type: 'labs', visit_date: date, data, computed: FORMS.labs.compute(data), deleted: false, created_by: who.id, created_at: at, updated_by: null, updated_at: null });
          if (Math.random() < 0.7) {
            const nd = {}; allFields(FORMS.neglect).filter(f => f.type === 'score').forEach(f => nd[f.key] = pick([f.options[0][0], f.options[0][0], f.options[1][0], f.options[2][0]]));
            d.records.push({ id: uid(), patient_id: p.id, form_type: 'neglect', visit_date: date, data: nd, computed: FORMS.neglect.compute(nd), deleted: false, created_by: who.id, created_at: at, updated_by: null, updated_at: null });
          }
          if (Math.random() < 0.5) {
            const fd = {}; allFields(FORMS.feet).filter(f => f.type === 'score').forEach(f => fd[f.key] = pick([f.options[0][0], f.options[0][0], f.options[1][0]]));
            d.records.push({ id: uid(), patient_id: p.id, form_type: 'feet', visit_date: date, data: fd, computed: FORMS.feet.compute(fd), deleted: false, created_by: who.id, created_at: at, updated_by: null, updated_at: null });
          }
        }
      }
      log(d, admin.id, 'seed_demo'); store.set(d);
    }
  };

  window.API = Object.assign({ DEMO, ApiError, message }, DEMO ? demo : remote);
})();
