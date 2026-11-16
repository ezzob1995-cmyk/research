/* =====================================================================
 *  מנוע טפסים: חישובים, התראות, מעקב ביקורים, איכות נתונים, הרשאות
 * ===================================================================== */
(function () {
  'use strict';
  const R = window.R = window.R || {};

  /* ---------- טפסים ---------- */
  R.forms = {};
  R.formList = [];
  R.setForms = (list) => {
    R.formList = (list || []).map(x => Object.assign({}, x.def, { key: x.key, active: x.active, sort: x.sort }))
      .sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100) || a.key.localeCompare(b.key));
    R.forms = Object.fromEntries(R.formList.map(f => [f.key, f]));
  };
  R.dataForms = () => R.formList.filter(f => f.key !== '_patient');
  R.activeForms = () => R.dataForms().filter(f => f.active);
  R.patientForm = () => R.forms._patient || { sections: [] };
  R.formOf = (key) => R.forms[key] || { key, title: key, short: key, icon: '📄', sections: [], calc: [], alerts: [] };
  R.fields = (form, includeArchived) => (form.sections || []).flatMap(s => s.fields || []).filter(f => includeArchived || f.active !== false);

  R.fieldOf = (form, key) => R.fields(form, true).find(x => x.key === key);
  /* ערך ישן → הנוסח הנוכחי של האפשרות (אחרי שהמנהל שינה טקסט של אפשרות) */
  R.normVal = (f, v) => {
    if (!f || !f.renames || v === undefined || v === null) return v;
    const one = (x) => { let s = x, i = 0; while (Object.prototype.hasOwnProperty.call(f.renames, s) && i++ < 20) s = f.renames[s]; return s; };
    return Array.isArray(v) ? v.map(one) : one(v);
  };
  R.scoreOf = (form, key, value) => {
    const f = R.fields(form, true).find(x => x.key === key && x.type === 'score');
    if (!f) return 0;
    const v = R.normVal(f, value);
    const o = (f.options || []).find(o => o[0] === v);
    return o ? Number(o[1]) || 0 : 0;
  };

  R.compute = (form, data, ctx = {}) => {
    const out = {};
    for (const c of form.calc || []) {
      if (c.type === 'phenoage') {
        const r = PhenoAge.compute(data);
        if (r.ok) Object.assign(out, { phenoage: r.phenoage, acceleration: r.acceleration, mortality_10y: r.mortality_10y });
      } else if (c.type === 'bmi') {
        const w = Number(data[c.weight || 'weight']), h = Number(data[c.height || 'height']);
        if (w > 0 && h > 0) out.bmi = Math.round(w / Math.pow(h / 100, 2) * 10) / 10;
      } else if (c.type === 'score_sum') {
        const keys = (c.fields && c.fields.length ? c.fields : R.fields(form).filter(f => f.type === 'score').map(f => f.key));
        const answered = keys.filter(k => data[k] !== undefined && data[k] !== '');
        if (!answered.length) continue;
        const sum = answered.reduce((s, k) => s + R.scoreOf(form, k, data[k]), 0);
        out[c.out] = sum;
        out.answered = answered.length;
        if (c.level_out && c.levels && c.levels.length) {
          const lv = c.levels.slice().sort((a, b) => a.max - b.max).find(l => sum <= Number(l.max));
          out[c.level_out] = lv ? lv.label : c.levels[c.levels.length - 1].label;
        }
      }
    }
    return out;
  };

  R.computedLabels = (form) => {
    const L = {};
    for (const c of form.calc || []) {
      if (c.type === 'phenoage') Object.assign(L, { phenoage: 'גיל ביולוגי (PhenoAge)', acceleration: 'פער (ביולוגי − כרונולוגי)', mortality_10y: 'סיכון מודל 10 שנים %' });
      else if (c.type === 'bmi') L.bmi = 'BMI';
      else if (c.type === 'score_sum') { L[c.out] = c.label || 'ציון'; if (c.level_out) L[c.level_out] = c.level_label || 'רמה'; L.answered = 'פריטים שנענו'; }
    }
    return L;
  };

  R.summary = (form, rec) => {
    const c = rec.computed || {}, d = rec.data || {};
    if (c.phenoage != null) return `גיל ביולוגי ${c.phenoage} · פער ${R.fmtSigned(c.acceleration)}`;
    for (const k of form.calc || []) if (k.type === 'score_sum' && c[k.out] != null) return `ציון ${c[k.out]}${k.level_out && c[k.level_out] ? ' · ' + c[k.level_out] : ''}`;
    if (form.calc && form.calc.some(k => k.type === 'phenoage')) return 'חסרים נתונים לחישוב';
    const parts = [];
    for (const f of R.fields(form)) {
      if (f.type === 'textarea') continue;
      const v = R.normVal(f, d[f.key]);
      if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
      parts.push(Array.isArray(v) ? v.join(', ') : String(v) + (f.unit ? ' ' + f.unit : ''));
      if (parts.length >= 3) break;
    }
    return parts.join(' · ');
  };

  R.alertsFor = (form, data, computed) => {
    const msgs = [];
    for (const a of form.alerts || []) {
      const v = computed && computed[a.key] !== undefined ? computed[a.key] : R.normVal(R.fieldOf(form, a.key), data[a.key]);
      if (v === undefined || v === null || v === '') continue;
      let hit = false;
      if (a.op === 'gt') hit = Number(v) > Number(a.value);
      else if (a.op === 'lt') hit = Number(v) < Number(a.value);
      else if (a.op === 'eq') hit = Array.isArray(v) ? v.includes(a.value) : String(v) === String(a.value);
      if (hit) msgs.push(a.msg || `${a.key}: ${v}`);
    }
    return msgs;
  };

  /* ---------- הרשאות (צד לקוח — השרת בודק שוב) ---------- */
  R.isAdmin = () => R.S.user && R.S.user.role === 'admin';
  R.isDoctor = () => R.S.user && R.S.user.role === 'doctor';
  R.can = (perm) => R.isAdmin() || (R.S.user && !!R.S.user[perm]);
  const fp = (form, action) => R.isAdmin() || !!(((R.S.user && R.S.user.form_perms) || {})[form] || {})[action];
  R.canEnter = (form) => fp(form, 'enter') && R.formOf(form).active !== false;
  R.canEditRec = (r) => !r.verified_at && (fp(r.form_type, 'edit_all') || (r.created_by === R.S.user.id && fp(r.form_type, 'edit_own')));
  R.canDeleteRec = (r) => !r.verified_at && (fp(r.form_type, 'delete_all') || (r.created_by === R.S.user.id && fp(r.form_type, 'delete_own')));
  R.canResolveNote = (n) => ['admin', 'doctor'].includes(R.S.user.role) || n.created_by === R.S.user.id || n.to_role === 'team';
  R.roleLabel = (r) => ({ admin: 'מנהל', doctor: 'רופא/ה', staff: 'צוות' }[r] || r);

  /* ---------- גיל וזכאות ---------- */
  R.ageNow = (bm) => bm ? PhenoAge.ageAt(bm, R.today()) : null;
  R.sexLabel = (s) => s === 'M' ? 'זכר' : s === 'F' ? 'נקבה' : '—';
  R.eligibility = (p) => {
    const inc = R.S.settings.inclusion_criteria || [], exc = R.S.settings.exclusion_criteria || [];
    const d = p.data || {};
    const incOk = inc.filter(c => (d._inclusion || []).includes(c)).length;
    const excHit = exc.filter(c => (d._exclusion || []).includes(c));
    if (!inc.length && !exc.length) return { status: 'na' };
    if (excHit.length) return { status: 'excluded', text: 'עומד/ת בקריטריון אי-הכללה', excHit };
    if (incOk === inc.length) return { status: 'ok', text: 'עומד/ת בכל קריטריוני ההכללה' };
    return { status: 'partial', text: `${incOk}/${inc.length} קריטריוני הכללה סומנו` };
  };

  /* ---------- מעקב ביקורים ---------- */
  R.followups = (patients) => {
    const soon = Number(R.S.settings.due_soon_days) || 30;
    const today = R.today();
    const rows = [];
    for (const p of patients) {
      if (!p.active) continue;
      for (const f of R.activeForms()) {
        const m = Number(f.followup_months);
        if (!m) continue;
        const last = (p.last_by_form || {})[f.key] || null;
        const due = last ? R.addMonths(last, m) : (p.created_at || today).slice(0, 10);
        const days = R.daysBetween(today, due);
        const status = !last ? 'never' : days < 0 ? 'overdue' : days <= soon ? 'soon' : 'ok';
        rows.push({ patient: p, form: f, last, due, days, status });
      }
    }
    const rank = { never: 0, overdue: 1, soon: 2, ok: 3 };
    return rows.sort((a, b) => rank[a.status] - rank[b.status] || a.days - b.days);
  };
  R.followStatus = (r) => ({
    never: R.pill('לא בוצע עדיין', 'bad'),
    overdue: R.pill(`באיחור ${-r.days} ימים`, 'bad'),
    soon: R.pill(r.days === 0 ? 'היום' : `בעוד ${r.days} ימים`, 'warn'),
    ok: R.pill(`בעוד ${r.days} ימים`, 'good')
  }[r.status]);

  /* ---------- איכות נתונים ---------- */
  R.qualityIssues = (p, recs) => {
    const issues = [];
    const d = p.data || {};
    if (!p.sex) issues.push({ sev: 2, text: 'חסר מין' });
    if (!p.birth_month) issues.push({ sev: 3, text: 'חסר חודש לידה (אין חישוב גיל)' });
    for (const f of R.fields(R.patientForm()).filter(f => f.required)) if (d[f.key] === undefined || d[f.key] === '') issues.push({ sev: 2, text: `חסר: ${f.label}` });
    if (!d.consent_date) issues.push({ sev: 3, text: 'חסר תאריך הסכמה מדעת' });
    const el = R.eligibility(p);
    if (el.status === 'partial') issues.push({ sev: 2, text: el.text });
    if (el.status === 'excluded') issues.push({ sev: 3, text: 'מסומן קריטריון אי-הכללה: ' + el.excHit.join(', ') });
    const mine = recs.filter(r => r.patient_id === p.id);
    for (const f of R.activeForms().filter(f => Number(f.followup_months))) {
      if (!mine.some(r => r.form_type === f.key)) issues.push({ sev: 2, text: `אין אף הזנה: ${f.short || f.title}` });
    }
    for (const r of mine) {
      const F = R.formOf(r.form_type);
      const miss = R.fields(F).filter(f => f.required && (r.data || {})[f.key] === undefined);
      if (miss.length) issues.push({ sev: 3, text: `${F.short} ${R.fmtDate(r.visit_date)}: חסרים ${miss.length} שדות חובה`, rec: r.id });
    }
    const unver = mine.filter(r => !r.verified_at).length;
    if (unver) issues.push({ sev: 1, text: `${unver} הזנות שטרם אושרו`, unverified: true });
    return issues;
  };
})();
