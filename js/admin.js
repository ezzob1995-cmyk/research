/* =====================================================================
 *  מסכי מחקר וניהול: התקדמות, ניתוח, איכות נתונים, ייצוא,
 *  צוות והרשאות, בונה טפסים, הגדרות, יומן
 * ===================================================================== */
(function () {
  'use strict';
  const R = window.R;
  const { $, $$, esc, icon } = R;
  const S = R.S;
  const view = () => $('#view');
  const guard = (ok) => { if (!ok) { location.hash = '#/home'; return false; } return true; };

  /* ---------- התקדמות וצוות ---------- */
  R.pages.dashboard = async () => {
    if (!guard(R.can('can_view_stats'))) return;
    R.loading();
    const [st, recs, patients] = await Promise.all([API.stats(S.token), R.getRecords(true), R.getPatients(true)]);
    const set = st.settings || {};
    const target = Number(set.target_patients) || 0, tv = Number(set.target_visits) || 1;
    const pct = (a, b) => b ? Math.min(100, Math.round(a / b * 100)) : 0;
    const labsKey = (R.dataForms().find(f => (f.calc || []).some(c => c.type === 'phenoage')) || {}).key || 'labs';
    const followed = (st.visits_distribution || []).filter(v => v.visits >= tv).reduce((s, v) => s + v.patients, 0);
    const pAll = st.patients_total || 0;
    const months = st.by_month || [], maxM = Math.max(1, ...months.map(m => m.n));
    const pheno = st.phenoage || [], nPh = pheno.reduce((s, w) => s + w.n, 0);
    const avgAccel = nPh ? R.round(pheno.reduce((s, w) => s + w.avg_accel * w.n, 0) / nPh, 2) : null;
    const verified = recs.filter(r => r.verified_at).length;
    const forms = R.dataForms();
    const staffMax = Math.max(1, ...(st.staff || []).map(s => s.records_total));
    view().innerHTML = `
      ${R.head('התקדמות המחקר וביצועי הצוות', `${esc(set.study_name || '')}${set.start_date ? ` · ${R.fmtDate(set.start_date)} – ${R.fmtDate(set.end_date)}` : ''}`, `<button class="btn" id="refresh">${icon('refresh')} רענון</button>`)}
      <div class="grid k4">
        <div class="card kpi"><div class="kic teal">${icon('users')}</div><div class="grow"><div class="label">מטופלים שגויסו</div><div class="value">${pAll} <small>/ ${target || '—'}</small></div><div class="progress"><span style="width:${pct(pAll, target)}%"></span></div></div></div>
        <div class="card kpi"><div class="kic blue">${icon('flask')}</div><div class="grow"><div class="label">השלימו ${tv}+ בדיקות דם</div><div class="value">${followed} <small>/ ${pAll}</small></div><div class="progress"><span style="width:${pct(followed, pAll)}%"></span></div></div></div>
        <div class="card kpi"><div class="kic green">${icon('lock')}</div><div class="grow"><div class="label">הזנות שאושרו</div><div class="value">${verified} <small>/ ${recs.length}</small></div><div class="progress"><span style="width:${pct(verified, recs.length)}%;background:var(--good)"></span></div></div></div>
        <div class="card kpi"><div class="kic orange">${icon('activity')}</div><div><div class="label">פער גיל ממוצע</div><div class="value num">${avgAccel === null ? '—' : R.fmtSigned(avgAccel)} <small>שנים</small></div><div class="small muted">${nPh} בדיקות</div></div></div>
      </div>
      <div class="grid k2">
        <div class="card"><h2>${icon('layers')} כיסוי טפסים</h2>
          ${R.progressBars(forms.map(f => { const n = (st.patients_with_form || {})[f.key] || 0; return { label: `${f.icon || ''} ${esc(f.short || f.title)}`, pct: pct(n, pAll), text: `${n}/${pAll}` }; }))}
          <p class="small muted" style="margin-bottom:0">מטופלים עם לפחות הזנה אחת מכל טופס</p></div>
        <div class="card"><h2>${icon('bars')} הזנות לפי חודש</h2>
          ${months.length ? `<div class="colchart">${months.map(m => `<div class="col"><span class="v">${m.n}</span><div class="b" style="height:${Math.round(m.n / maxM * 100)}%"></div></div>`).join('')}</div>
          <div class="colchart-labels">${months.map(m => `<span>${m.month.slice(5)}/${m.month.slice(2, 4)}</span>`).join('')}</div>` : R.empty('אין נתונים', 'bars')}</div>
      </div>
      <div class="card"><h2>${icon('users')} לפי מחלקה</h2><div class="table-wrap"><table><thead><tr><th>מחלקה</th><th>מטופלים</th><th>הזנות</th><th>בדיקות PhenoAge</th><th>גיל ממוצע</th><th>ביולוגי ממוצע</th><th>פער ממוצע</th></tr></thead><tbody>
        ${(st.by_ward || []).map(w => { const ph = pheno.find(x => x.ward === w.ward) || {}; return `<tr><td>${esc(w.ward)}</td><td class="num">${w.patients}</td><td class="num">${w.records}</td><td class="num">${ph.n || 0}</td><td class="num">${ph.avg_age ?? '—'}</td><td class="num">${ph.avg_pheno ?? '—'}</td><td>${R.accelPill(ph.avg_accel)}</td></tr>`; }).join('') || `<tr><td colspan="7">${R.empty('אין נתונים')}</td></tr>`}
      </tbody></table></div></div>
      <div class="card"><h2>${icon('shield')} ביצועי הצוות</h2><div class="table-wrap"><table><thead><tr>
        <th>איש צוות</th><th>סה"כ</th><th></th><th>החודש</th><th>7 ימים</th>${forms.map(f => `<th class="c" title="${esc(f.title)}">${f.icon || esc(f.short)}</th>`).join('')}
        <th>עריכות</th><th>גיוסים</th><th>ימי פעילות</th><th>הזנה אחרונה</th><th>כניסה אחרונה</th></tr></thead><tbody>
        ${(st.staff || []).map(s => `<tr${s.active ? '' : ' class="dim"'}><td><div class="who-cell"><div class="avatar sm">${esc((s.full_name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join(''))}</div><div><b>${esc(s.full_name)}</b><div class="muted small">${R.roleLabel(s.role)}</div></div></div></td>
          <td class="num"><b>${s.records_total}</b></td><td style="min-width:100px"><div class="bar-track"><div class="bar-fill" style="width:${Math.round(s.records_total / staffMax * 100)}%"></div></div></td>
          <td class="num">${s.records_month}</td><td class="num">${s.records_week}</td>
          ${forms.map(f => `<td class="c num">${(s.by_form || {})[f.key] || '<span class="muted">·</span>'}</td>`).join('')}
          <td class="num">${s.edits}</td><td class="num">${s.patients_added}</td><td class="num">${s.active_days}</td>
          <td class="small">${R.relTime(s.last_entry) || '—'}</td><td class="small">${R.relTime(s.last_login) || '—'}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    $('#refresh').onclick = () => R.route();
    void patients; void labsKey;
  };

  /* ---------- ניתוח ותרשימים ---------- */
  R.pages.analytics = async () => {
    if (!guard(R.can('can_view_stats'))) return;
    R.loading();
    const [patients, recs] = await Promise.all([R.getPatients(true), R.getRecords(true)]);
    const PF = R.patientForm();
    const pmap = Object.fromEntries(patients.map(p => [p.id, p]));
    const labs = recs.filter(r => r.computed && r.computed.phenoage != null && r.data && r.data.age != null && pmap[r.patient_id]);
    const groupers = [['ward', 'מחלקה'], ['sex', 'מין']].concat(R.fields(PF).filter(f => ['select', 'radio', 'yesno', 'checks'].includes(f.type)).map(f => [f.key, f.label]));
    view().innerHTML = `
      ${R.head('ניתוח ותרשימים', `${labs.length} בדיקות PhenoAge · ${new Set(labs.map(r => r.patient_id)).size} מטופלים · ניתוח תיאורי בלבד — לניתוח סטטיסטי מלא יש לייצא ל-SPSS`)}
      <div class="card">
        <div class="row between"><h2>${icon('chart')} גיל ביולוגי מול גיל כרונולוגי</h2>
          <div class="toolbar tight"><div class="seg" id="sm"><button data-s="last" class="active">בדיקה אחרונה לכל מטופל</button><button data-s="all">כל הבדיקות</button></div>
          <select id="sg">${groupers.slice(0, 3).map(([k, l]) => `<option value="${k}">צבע לפי ${esc(l)}</option>`).join('')}</select></div></div>
        <div class="chart-box" id="scatter"></div>
        <p class="small muted" style="margin:0">נקודה מעל הקו המקווקו = גיל ביולוגי גבוה מהכרונולוגי (הזדקנות מואצת).</p>
      </div>
      <div class="grid k2">
        <div class="card"><div class="row between"><h2>${icon('bars')} פער ממוצע לפי קבוצה</h2>
          <select id="cg">${groupers.map(([k, l]) => `<option value="${k}" ${k === 'med_classes' ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div id="cmp"></div><p class="small muted" style="margin:0">בדיקה אחרונה לכל מטופל. בבחירה מרובה (כמו תרופות) מטופל נספר בכל קבוצה שלו.</p></div>
        <div class="card"><h2>${icon('activity')} שינוי לאורך זמן</h2><div id="chg"></div></div>
      </div>`;
    const lastPer = () => { const m = {}; labs.forEach(r => { if (!m[r.patient_id] || r.visit_date > m[r.patient_id].visit_date) m[r.patient_id] = r; }); return Object.values(m); };
    const gval = (p, k) => k === 'ward' ? (p.ward || '—') : k === 'sex' ? R.sexLabel(p.sex) : (R.normVal(R.fieldOf(PF, k), (p.data || {})[k]) ?? '—');
    let mode = 'last';
    const drawScatter = () => {
      const g = $('#sg').value;
      const list = mode === 'last' ? lastPer() : labs;
      $('#scatter').innerHTML = R.scatterChart({ diagonal: true, xLabel: 'גיל כרונולוגי', yLabel: 'גיל ביולוגי (PhenoAge)',
        points: list.map(r => { const p = pmap[r.patient_id]; const gv = gval(p, g); return { x: Number(r.data.age), y: r.computed.phenoage, g: Array.isArray(gv) ? gv.join(', ') || '—' : String(gv), label: `${p.code} · ${R.fmtDate(r.visit_date)} · גיל ${r.data.age} → ${r.computed.phenoage} (${R.fmtSigned(r.computed.acceleration)})` }; }) });
    };
    const drawCmp = () => {
      const k = $('#cg').value, groups = {};
      lastPer().forEach(r => { let v = gval(pmap[r.patient_id], k); (Array.isArray(v) ? (v.length ? v : ['—']) : [v]).forEach(x => (groups[x] = groups[x] || []).push(Number(r.computed.acceleration))); });
      $('#cmp').innerHTML = R.meanBars(Object.entries(groups).map(([label, a]) => ({ label, value: R.round(R.mean(a), 2), n: a.length, sd: R.round(R.sd(a), 1) })).sort((a, b) => b.value - a.value), '');
    };
    const drawChange = () => {
      const by = {}; labs.forEach(r => (by[r.patient_id] = by[r.patient_id] || []).push(r));
      const rows = Object.entries(by).filter(([, a]) => a.length >= 2).map(([pid, a]) => {
        a.sort((x, y) => x.visit_date.localeCompare(y.visit_date));
        const f = a[0], l = a[a.length - 1];
        return { p: pmap[pid], n: a.length, d0: f.computed.acceleration, d1: l.computed.acceleration, delta: R.round(l.computed.acceleration - f.computed.acceleration, 2), months: R.round(R.daysBetween(f.visit_date, l.visit_date) / 30.4, 1) };
      }).sort((a, b) => b.delta - a.delta);
      const md = R.round(R.mean(rows.map(r => r.delta)), 2);
      $('#chg').innerHTML = rows.length ? `<div class="kpi-inline"><span>שינוי ממוצע בפער</span><b class="num">${R.fmtSigned(md)}</b><span class="muted small">שנים · ${rows.length} מטופלים עם 2+ בדיקות</span></div>
        <div class="table-wrap" style="max-height:300px"><table><thead><tr><th>מטופל</th><th>בדיקות</th><th>חודשים</th><th>פער ראשון</th><th>פער אחרון</th><th>שינוי</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td><a href="#/patient/${r.p.id}" class="code">${esc(r.p.code)}</a></td><td class="num">${r.n}</td><td class="num">${r.months}</td><td>${R.accelPill(r.d0)}</td><td>${R.accelPill(r.d1)}</td><td class="num"><b>${R.fmtSigned(r.delta)}</b></td></tr>`).join('')}</tbody></table></div>`
        : R.empty('אין עדיין מטופלים עם שתי בדיקות או יותר', 'activity');
    };
    $$('#sm button').forEach(b => b.onclick = () => { mode = b.dataset.s; $$('#sm button').forEach(x => x.classList.toggle('active', x === b)); drawScatter(); });
    $('#sg').onchange = drawScatter; $('#cg').onchange = drawCmp;
    drawScatter(); drawCmp(); drawChange();
  };

  /* ---------- איכות נתונים ---------- */
  R.pages.quality = async () => {
    if (!guard(R.can('can_view_stats'))) return;
    R.loading();
    const [patients, recs] = await Promise.all([R.getPatients(true), R.getRecords(true)]);
    const rows = patients.filter(p => p.active).map(p => ({ p, issues: R.qualityIssues(p, recs) }));
    const crit = rows.filter(r => r.issues.some(i => i.sev >= 3)).length;
    const clean = rows.filter(r => !r.issues.some(i => !i.unverified)).length;
    const unver = recs.filter(r => !r.verified_at).length;
    view().innerHTML = `
      ${R.head('איכות נתונים', 'מה חסר, מה לא תקין ומה ממתין לאישור — לכל מטופל פעיל')}
      <div class="grid k4">
        <div class="card kpi"><div class="kic green">${icon('checkCircle')}</div><div><div class="label">מטופלים ללא חוסרים</div><div class="value">${clean} <small>/ ${rows.length}</small></div></div></div>
        <div class="card kpi"><div class="kic rose">${icon('alert')}</div><div><div class="label">חוסרים קריטיים</div><div class="value">${crit}</div><div class="small muted">גיל, הסכמה, שדות חובה</div></div></div>
        <div class="card kpi"><div class="kic orange">${icon('lock')}</div><div><div class="label">הזנות שטרם אושרו</div><div class="value">${unver}</div></div></div>
        <div class="card kpi"><div class="kic blue">${icon('calendar')}</div><div><div class="label">ביקורים באיחור</div><div class="value">${R.followups(patients).filter(r => r.status === 'overdue' || r.status === 'never').length}</div></div></div>
      </div>
      <div class="card"><div class="toolbar"><label class="switch"><input type="checkbox" id="hv" checked><span></span> להסתיר "ממתין לאישור"</label></div><div id="ql"></div></div>`;
    const draw = () => {
      const hv = $('#hv').checked;
      const list = rows.map(r => ({ ...r, issues: r.issues.filter(i => !(hv && i.unverified)) })).filter(r => r.issues.length)
        .sort((a, b) => Math.max(...b.issues.map(i => i.sev)) - Math.max(...a.issues.map(i => i.sev)) || b.issues.length - a.issues.length);
      $('#ql').innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>מטופל</th><th>מחלקה</th><th>ממצאים</th></tr></thead><tbody>
        ${list.map(r => `<tr><td><a href="#/patient/${r.p.id}" class="code">${esc(r.p.code)}</a></td><td>${esc(r.p.ward || '')}</td>
          <td><div class="pills">${r.issues.map(i => i.rec ? `<a href="#/record/${i.rec}" class="pill ${i.sev >= 3 ? 'bad' : i.sev === 2 ? 'warn' : ''}">${esc(i.text)}</a>` : R.pill(i.text, i.sev >= 3 ? 'bad' : i.sev === 2 ? 'warn' : '')).join('')}</div></td></tr>`).join('')}</tbody></table></div>`
        : R.empty('כל הנתונים תקינים', 'checkCircle');
    };
    $('#hv').onchange = draw;
    draw();
  };

  /* ---------- צוות והרשאות ---------- */
  const PERMS = [['enter', 'הזנה'], ['edit_own', 'עריכת שלו'], ['edit_all', 'עריכת כולם'], ['delete_own', 'מחיקת שלו'], ['delete_all', 'מחיקת כולם']];
  const PRESETS = {
    staff: { enter: true, edit_own: true, edit_all: false, delete_own: true, delete_all: false },
    senior: { enter: true, edit_own: true, edit_all: true, delete_own: true, delete_all: false },
    none: { enter: false, edit_own: false, edit_all: false, delete_own: false, delete_all: false }
  };
  R.pages.staff = async () => {
    if (!guard(R.isAdmin())) return;
    R.loading();
    const list = await API.staffList(S.token);
    const forms = R.dataForms().filter(f => f.active);
    const permSummary = (s) => {
      if (s.role === 'admin') return R.pill('כל ההרשאות', 'brand');
      const fp = s.form_perms || {};
      return forms.map(f => { const p = fp[f.key] || {}; if (!p.enter && !p.edit_all) return ''; const lvl = p.delete_all ? 'מלא' : p.edit_all ? 'עריכת כולם' : 'הזנה'; return `<span class="pill" title="${esc(f.title)}: ${PERMS.filter(([k]) => p[k]).map(([, l]) => l).join(', ')}">${f.icon || ''} ${esc(f.short)} · ${lvl}</span>`; }).join('') || '<span class="muted small">צפייה בלבד</span>';
    };
    view().innerHTML = `
      ${R.head('צוות והרשאות', `${list.filter(s => s.active).length} משתמשים פעילים`, `<button class="btn primary" id="adds">${icon('plus')} איש צוות חדש</button>`)}
      <div class="card"><div class="table-wrap"><table><thead><tr><th>שם</th><th>תפקיד</th><th>הרשאות טפסים</th><th>נוספות</th><th>סטטוס</th><th>כניסה אחרונה</th><th></th></tr></thead><tbody>
        ${list.map(s => `<tr${s.active ? '' : ' class="dim"'}><td><div class="who-cell"><div class="avatar sm">${esc(s.full_name.split(/\s+/).slice(0, 2).map(w => w[0]).join(''))}</div><div><b>${esc(s.full_name)}</b><div class="muted small" dir="ltr" style="text-align:right">${esc(s.username)}</div></div></div></td>
          <td>${R.pill(R.roleLabel(s.role), s.role === 'admin' ? 'brand' : s.role === 'doctor' ? 'blue' : '')}</td>
          <td><div class="pills">${permSummary(s)}</div></td>
          <td><div class="pills">${s.role !== 'admin' ? [s.can_add_patients && 'גיוס', s.can_verify && 'אישור', s.can_view_stats && 'סטטיסטיקה', s.can_export && 'ייצוא'].filter(Boolean).map(x => R.pill(x)).join('') : ''}</div></td>
          <td>${s.active ? (s.must_change_password ? R.pill('ממתין להחלפת סיסמה', 'warn') : R.pill('פעיל', 'good')) : R.pill('מושבת')}</td>
          <td class="small">${R.relTime(s.last_login) || '—'}</td>
          <td class="actions"><button class="btn sm" data-e="${s.id}">${icon('edit', 14)} עריכה</button></td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="alert info">${icon('key')}<span>שכח/ה סיסמה? "עריכה" ← "איפוס סיסמה". עזב/ה את הצוות? לכבות "פעיל" — ההזנות נשמרות.</span></div>`;
    $('#adds').onclick = () => editStaff(null);
    $$('[data-e]').forEach(b => b.onclick = () => editStaff(list.find(s => s.id === b.dataset.e)));
  };

  async function editStaff(s) {
    const isNew = !s;
    const forms = R.dataForms().filter(f => f.active);
    s = s || { username: '', full_name: '', role: 'staff', form_perms: Object.fromEntries(forms.map(f => [f.key, { ...PRESETS.staff }])), can_add_patients: true, can_view_stats: false, can_export: false, can_verify: false, active: true };
    const fp = s.form_perms || {};
    const pw = isNew ? R.genPassword() : '';
    const body = `<form id="sf" onsubmit="return false">
      <div class="form-grid">
        <div class="field req"><label>שם מלא</label><input type="text" name="full_name" value="${esc(s.full_name)}"></div>
        <div class="field req"><label>שם משתמש (באנגלית)</label><input type="text" name="username" value="${esc(s.username)}" autocomplete="off" dir="ltr"></div>
        <div class="field ${isNew ? 'req' : ''}"><label>${isNew ? 'סיסמה ראשונית' : 'איפוס סיסמה (ריק = ללא שינוי)'}</label>
          <div class="row nowrap"><input type="text" name="password" value="${esc(pw)}" autocomplete="off" dir="ltr"><button type="button" class="btn sm" id="gen">${icon('refresh', 14)}</button></div></div>
      </div>
      <div class="field"><label>תפקיד</label><div class="opts" id="roles">
        ${[['staff', 'צוות סיעודי / מחקר'], ['doctor', 'רופא/ה משתתף/ת'], ['admin', 'מנהל (כל ההרשאות)']].map(([k, l]) => `<label class="opt"><input type="radio" name="role" value="${k}" ${s.role === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <div id="permbox">
        <div class="subcard"><div class="row between"><h3>הרשאות לכל טופס</h3>
          <div class="row tight"><span class="small muted">מילוי מהיר:</span>${[['staff', 'רגיל'], ['senior', 'בכיר'], ['none', 'צפייה בלבד']].map(([k, l]) => `<button type="button" class="btn sm" data-preset="${k}">${l}</button>`).join('')}</div></div>
          <div class="table-wrap"><table class="perm"><thead><tr><th>טופס</th>${PERMS.map(([, l]) => `<th class="c">${l}</th>`).join('')}</tr></thead><tbody>
            ${forms.map(f => `<tr><td>${f.icon || ''} ${esc(f.short || f.title)}</td>${PERMS.map(([k]) => `<td class="c"><input type="checkbox" data-fp="${f.key}" data-pk="${k}" ${(fp[f.key] || {})[k] ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}
          </tbody></table></div>
          <p class="small muted" style="margin:.4rem 0 0">"שלו" = הזנות שהוא עצמו הזין. הזנה שאושרה וננעלה לא ניתנת לעריכה או מחיקה בכל מקרה.</p></div>
        <div class="subcard"><h3>הרשאות כלליות</h3><div class="form-grid">
          <label class="switch"><input type="checkbox" name="can_add_patients" ${s.can_add_patients ? 'checked' : ''}><span></span> גיוס ועריכת מטופלים</label>
          <label class="switch"><input type="checkbox" name="can_verify" ${s.can_verify ? 'checked' : ''}><span></span> אישור ונעילת הזנות</label>
          <label class="switch"><input type="checkbox" name="can_view_stats" ${s.can_view_stats ? 'checked' : ''}><span></span> התקדמות, ניתוח ואיכות נתונים</label>
          <label class="switch"><input type="checkbox" name="can_export" ${s.can_export ? 'checked' : ''}><span></span> ייצוא לאקסל</label>
        </div></div>
      </div>
      <label class="switch"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}><span></span> משתמש פעיל</label>
    </form>`;
    await R.modal(isNew ? 'איש צוות חדש' : 'עריכת ' + s.full_name, body, [
      { id: 'save', label: 'שמירה', cls: 'primary', onClick: async (root) => {
        const f = $('#sf', root);
        const form_perms = {};
        $$('[data-fp]', f).forEach(c => { (form_perms[c.dataset.fp] = form_perms[c.dataset.fp] || {})[c.dataset.pk] = c.checked; });
        const payload = { id: s.id || null, full_name: $('[name=full_name]', f).value.trim(), username: $('[name=username]', f).value.trim(), password: $('[name=password]', f).value.trim() || null, role: $('[name=role]:checked', f).value, form_perms };
        ['can_add_patients', 'can_verify', 'can_view_stats', 'can_export', 'active'].forEach(k => payload[k] = $(`[name=${k}]`, f).checked);
        await API.staffSave(S.token, payload);
        if (payload.password) setTimeout(() => credModal(payload.username, payload.password), 60); else R.toast('נשמר', 'good');
        R.route();
      } },
      { id: 'cancel', label: 'ביטול' }
    ], { wide: true, onOpen: (root) => {
      $('#gen', root).onclick = () => { $('[name=password]', root).value = R.genPassword(); };
      $$('[data-preset]', root).forEach(b => b.onclick = () => { const p = PRESETS[b.dataset.preset]; $$('[data-fp]', root).forEach(c => c.checked = !!p[c.dataset.pk]); });
      const applyRole = (fresh) => {
        const r = $('[name=role]:checked', root).value;
        $('#permbox', root).hidden = r === 'admin';
        if (fresh && r === 'doctor') { $$('[data-fp]', root).forEach(c => c.checked = false); ['can_verify', 'can_view_stats'].forEach(k => $(`[name=${k}]`, root).checked = true); $('[name=can_add_patients]', root).checked = false; }
        if (fresh && r === 'staff') { $$('[data-fp]', root).forEach(c => c.checked = !!PRESETS.staff[c.dataset.pk]); $('[name=can_add_patients]', root).checked = true; }
      };
      $$('[name=role]', root).forEach(x => x.onchange = () => applyRole(true));
      applyRole(false);
    } });
  }
  function credModal(u, p) {
    const url = location.href.split('#')[0];
    const txt = `שם משתמש: ${u}\nסיסמה: ${p}\nכתובת: ${url}`;
    R.modal('פרטי כניסה למסירה', `<p>יש למסור באופן אישי (לא בקבוצת וואטסאפ):</p><div class="cred-box">${esc(txt)}</div><p class="small muted">בכניסה הראשונה המערכת תחייב להחליף סיסמה.</p>`,
      [{ id: 'copy', label: 'העתקה', cls: 'primary', onClick: () => { navigator.clipboard && navigator.clipboard.writeText(txt).then(() => R.toast('הועתק', 'good')); return false; } }, { id: 'ok', label: 'סגירה' }]);
  }

  /* ---------- טפסים ובדיקות ---------- */
  R.pages.forms = async () => {
    if (!guard(R.isAdmin())) return;
    R.setForms(await API.listForms(S.token));
    const pf = R.patientForm();
    view().innerHTML = `
      ${R.head('טפסים ובדיקות', 'הוספה ועריכה של בדיקות, שדות וטפסים — בלי לגעת בקוד', `<button class="btn primary" id="newf">${icon('plus')} טופס חדש</button>`)}
      <div class="form-cards">
        ${R.dataForms().map(f => `<div class="card fcard ${f.active ? '' : 'dim'}">
          <div class="fic">${f.icon || '📄'}</div>
          <div class="grow"><h3>${esc(f.title)}</h3>
            <div class="small muted">${R.fields(f).length} שדות${(f.calc || []).length ? ' · חישוב אוטומטי' : ''}${(f.alerts || []).length ? ` · ${f.alerts.length} התראות` : ''}${Number(f.followup_months) ? ` · מעקב כל ${f.followup_months} ח׳` : ''}</div>
            <div class="small muted code">${esc(f.key)}</div></div>
          <div class="col-actions">${f.active ? R.pill('פעיל', 'good') : R.pill('מושבת')}<a class="btn sm" href="#/form/${f.key}">${icon('edit', 14)} עריכה</a></div></div>`).join('')}
        <div class="card fcard"><div class="fic">${pf.icon || '👤'}</div><div class="grow"><h3>${esc(pf.title || 'פרטי מטופל')}</h3><div class="small muted">${R.fields(pf).length} שדות · מאפייני המטופל במחקר</div></div>
          <div class="col-actions"><a class="btn sm" href="#/form/_patient">${icon('edit', 14)} עריכה</a></div></div>
      </div>
      <div class="alert info">${icon('shield')}<span>שדה שכבר הוזנו בו נתונים לא נמחק — הוא "מוסר מהטופס" והנתונים הקיימים נשמרים ומופיעים בייצוא.</span></div>`;
    $('#newf').onclick = async () => {
      const r = await R.modal('טופס חדש', `<form id="nf" onsubmit="return false"><div class="form-grid">
          <div class="field req"><label>שם הטופס</label><input type="text" name="title" placeholder="לדוגמה: סימנים חיוניים"></div>
          <div class="field req"><label>מזהה באנגלית (למשתנים בייצוא)</label><input type="text" name="key" placeholder="vitals" dir="ltr"><div class="hint">אותיות קטנות, ספרות וקו תחתון. לא ניתן לשנות אחר כך.</div></div>
          <div class="field"><label>אייקון (אימוג׳י)</label><input type="text" name="icon" value="📋" maxlength="4"></div></div></form>`,
        [{ id: 'ok', label: 'יצירה', cls: 'primary', onClick: async (root) => {
          const key = $('[name=key]', root).value.trim(), title = $('[name=title]', root).value.trim();
          if (!/^[a-z][a-z0-9_]{1,30}$/.test(key)) { R.toast(API.message({ code: 'BAD_FORM_KEY' }), 'bad'); return false; }
          if (R.forms[key]) { R.toast('מזהה כבר קיים', 'bad'); return false; }
          if (!title) { R.toast('חסר שם', 'bad'); return false; }
          const def = { title, short: title.split(' ').slice(0, 2).join(' '), icon: $('[name=icon]', root).value || '📋', sections: [{ title: 'כללי', fields: [] }], calc: [], alerts: [], followup_months: null };
          R.setForms(await API.saveForm(S.token, key, def, false, 50));
          location.hash = '#/form/' + key;
        } }, { id: 'c', label: 'ביטול' }]);
      void r;
    };
  };

  /* ---------- עורך טופס ---------- */
  const TYPES = { number: 'מספר', text: 'טקסט קצר', textarea: 'טקסט ארוך', date: 'תאריך', select: 'רשימה נפתחת', radio: 'בחירה אחת', checks: 'בחירה מרובה', yesno: 'כן / לא', score: 'בחירה עם ניקוד' };
  R.pages.form = async (key) => {
    if (!guard(R.isAdmin())) return;
    R.setForms(await API.listForms(S.token));
    const orig = R.forms[key];
    if (!orig) { view().innerHTML = R.empty('הטופס לא נמצא'); return; }
    const isPatient = key === '_patient';
    const savedKeys = new Set(R.fields(orig, true).map(f => f.key));
    const def = JSON.parse(JSON.stringify(orig));
    def.sections = def.sections || []; def.calc = def.calc || []; def.alerts = def.alerts || [];
    let active = orig.active, dirty = false;
    const mark = () => { dirty = true; const b = $('#savef'); if (b) b.classList.add('pulse'); };

    const draw = () => {
      const allKeys = R.fields(def, true);
      const scoreOuts = def.calc.filter(c => c.type === 'score_sum');
      const computedKeys = Object.entries(R.computedLabels(def));
      view().innerHTML = `
        ${R.head(`${esc(def.icon || '')} ${esc(def.title)}`, `מזהה: <span class="code">${esc(key)}</span>`, `<a class="btn ghost" href="#/forms">ביטול</a><button class="btn" id="prev">${icon('eye')} תצוגה מקדימה</button><button class="btn primary" id="savef">${icon('check')} שמירת הטופס</button>`, `<a href="#/forms">טפסים</a>`)}
        <div class="card"><h2>פרטים כלליים</h2><div class="form-grid">
          <div class="field"><label>שם מלא</label><input type="text" data-g="title" value="${esc(def.title || '')}"></div>
          <div class="field"><label>שם קצר (לתפריטים)</label><input type="text" data-g="short" value="${esc(def.short || '')}"></div>
          <div class="field"><label>אייקון</label><input type="text" data-g="icon" value="${esc(def.icon || '')}" maxlength="4"></div>
          ${isPatient ? '' : `<div class="field"><label>תדירות מעקב (חודשים)</label><input type="number" data-g="followup_months" value="${esc(def.followup_months ?? '')}" min="0" placeholder="ללא מעקב"><div class="hint">לרשימת "מעקב ביקורים". ריק = ללא.</div></div>`}
          <div class="field wide"><label>הנחיות למילוי (מוצג בראש הטופס)</label><textarea data-g="description">${esc(def.description || '')}</textarea></div>
          ${isPatient ? '' : `<label class="switch"><input type="checkbox" id="factive" ${active ? 'checked' : ''}><span></span> הטופס פעיל (מופיע להזנה)</label>`}
        </div></div>

        ${def.sections.map((s, si) => `<div class="card section-card">
          <div class="row between"><div class="row grow"><span class="snum">${si + 1}</span><input type="text" class="stitle" data-st="${si}" value="${esc(s.title)}"></div>
            <div class="row tight"><button class="icon-btn" data-smove="${si}:-1" title="למעלה">${icon('up')}</button><button class="icon-btn" data-smove="${si}:1" title="למטה">${icon('down')}</button>
              ${(s.fields || []).every(f => !savedKeys.has(f.key)) ? `<button class="icon-btn danger" data-sdel="${si}" title="מחיקת קטע">${icon('trash')}</button>` : ''}</div></div>
          <div class="table-wrap"><table class="fields"><thead><tr><th></th><th>שם השדה</th><th>מזהה</th><th>סוג</th><th>יחידות / אפשרויות</th><th class="c">חובה</th><th></th></tr></thead><tbody>
            ${(s.fields || []).map((f, fi) => `<tr class="${f.active === false ? 'dim' : ''}">
              <td class="nowrap"><button class="icon-btn xs" data-fmove="${si}:${fi}:-1">${icon('up', 14)}</button><button class="icon-btn xs" data-fmove="${si}:${fi}:1">${icon('down', 14)}</button></td>
              <td><b>${esc(f.label)}</b>${f.active === false ? ' ' + R.pill('הוסר') : ''}${!savedKeys.has(f.key) ? ' ' + R.pill('חדש', 'brand') : ''}</td>
              <td class="code small">${esc(f.key)}</td><td>${TYPES[f.type] || f.type}</td>
              <td class="small muted">${f.unit ? esc(f.unit) : ''}${f.min != null || f.max != null ? ` (${f.min ?? ''}–${f.max ?? ''})` : ''}${f.options ? esc(f.options.map(o => Array.isArray(o) ? `${o[0]}=${o[1]}` : o).join(' · ')).slice(0, 70) : ''}</td>
              <td class="c">${f.required ? icon('check', 16) : ''}</td>
              <td class="actions"><button class="btn sm" data-fedit="${si}:${fi}">${icon('edit', 14)}</button>
                ${savedKeys.has(f.key) ? `<button class="btn sm" data-farch="${si}:${fi}">${f.active === false ? 'החזרה' : 'הסרה'}</button>` : `<button class="btn sm danger" data-fdel="${si}:${fi}">${icon('trash', 14)}</button>`}</td></tr>`).join('') || `<tr><td colspan="7" class="muted small" style="text-align:center">אין שדות בקטע</td></tr>`}
          </tbody></table></div>
          <button class="btn ghost" data-fadd="${si}">${icon('plus')} הוספת שדה / בדיקה</button>
        </div>`).join('')}
        <button class="btn" id="sadd">${icon('plus')} הוספת קטע</button>

        ${isPatient ? '' : `<div class="grid k2" style="margin-top:1rem">
          <div class="card"><h2>${icon('activity')} חישוב אוטומטי</h2>
            ${def.calc.filter(c => c.type === 'phenoage').length ? `<div class="line"><span>PhenoAge (נוסחת לווין)</span>${R.pill('פעיל', 'good')}</div>` : ''}
            <label class="switch"><input type="checkbox" id="cbmi" ${def.calc.some(c => c.type === 'bmi') ? 'checked' : ''}><span></span> חישוב BMI (משדות weight + height)</label>
            <label class="switch"><input type="checkbox" id="csum" ${scoreOuts.length ? 'checked' : ''}><span></span> סכום ניקוד של שאלות "בחירה עם ניקוד"</label>
            ${scoreOuts.map((c, ci) => `<div class="subcard"><div class="form-grid">
              <div class="field"><label>שם הציון</label><input type="text" data-cs="${ci}:label" value="${esc(c.label || '')}"></div>
              <div class="field"><label>מזהה הציון</label><input type="text" data-cs="${ci}:out" value="${esc(c.out || '')}" dir="ltr" ${savedKeys.size && orig.calc && orig.calc.some(o => o.out === c.out) ? 'readonly' : ''}></div></div>
              <label>רמות (ציון עד → שם הרמה)</label>
              ${(c.levels || []).map((l, li) => `<div class="row nowrap" style="margin-bottom:.35rem"><input type="number" data-cl="${ci}:${li}:max" value="${esc(l.max)}" style="width:90px"><span>←</span><input type="text" data-cl="${ci}:${li}:label" value="${esc(l.label)}"><button class="icon-btn danger" data-cldel="${ci}:${li}">${icon('x', 14)}</button></div>`).join('')}
              <button class="btn sm ghost" data-cladd="${ci}">${icon('plus', 14)} רמה</button></div>`).join('')}
          </div>
          <div class="card"><h2>${icon('alert')} התראות לרופא/ה</h2>
            <p class="small muted" style="margin-top:0">כשתנאי מתקיים בשמירה — נשלחת הערה אוטומטית לרופא/ה.</p>
            ${def.alerts.map((a, ai) => `<div class="alert-row">
              <select data-al="${ai}:key"><option value="">— שדה —</option>${allKeys.filter(f => f.type !== 'textarea' && f.type !== 'text' && f.type !== 'date').map(f => `<option value="${esc(f.key)}" ${a.key === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}${computedKeys.map(([k, l]) => `<option value="${esc(k)}" ${a.key === k ? 'selected' : ''}>[חישוב] ${esc(l)}</option>`).join('')}</select>
              <select data-al="${ai}:op">${[['gt', 'גדול מ-'], ['lt', 'קטן מ-'], ['eq', 'שווה ל-']].map(([o, l]) => `<option value="${o}" ${a.op === o ? 'selected' : ''}>${l}</option>`).join('')}</select>
              <input type="text" data-al="${ai}:value" value="${esc(a.value ?? '')}" placeholder="ערך">
              <input type="text" data-al="${ai}:msg" value="${esc(a.msg || '')}" placeholder="הודעה לרופא/ה" class="grow">
              <button class="icon-btn danger" data-aldel="${ai}">${icon('trash', 16)}</button></div>`).join('') || '<div class="muted small">אין התראות</div>'}
            <button class="btn sm ghost" id="aladd" style="margin-top:.5rem">${icon('plus', 14)} התראה</button>
          </div></div>`}`;
      bind();
    };

    const collectGeneral = () => {
      $$('[data-g]').forEach(i => { const k = i.dataset.g; def[k] = k === 'followup_months' ? (i.value === '' ? null : Number(i.value)) : i.value; });
      $$('[data-st]').forEach(i => { def.sections[+i.dataset.st].title = i.value; });
      if ($('#factive')) active = $('#factive').checked;
      $$('[data-cs]').forEach(i => { const [ci, k] = i.dataset.cs.split(':'); def.calc.filter(c => c.type === 'score_sum')[+ci][k] = i.value; });
      $$('[data-cl]').forEach(i => { const [ci, li, k] = i.dataset.cl.split(':'); const c = def.calc.filter(x => x.type === 'score_sum')[+ci]; c.levels[+li][k] = k === 'max' ? Number(i.value) : i.value; });
      $$('[data-al]').forEach(i => { const [ai, k] = i.dataset.al.split(':'); const a = def.alerts[+ai]; a[k] = k === 'value' && i.value !== '' && !isNaN(i.value) && a.op !== 'eq' ? Number(i.value) : i.value; });
    };
    const redraw = () => { collectGeneral(); mark(); draw(); };

    function bind() {
      $$('input, textarea, select', view()).forEach(i => i.addEventListener('change', mark));
      $$('[data-smove]').forEach(b => b.onclick = () => { collectGeneral(); const [si, d] = b.dataset.smove.split(':').map(Number); const t = si + d; if (t < 0 || t >= def.sections.length) return; [def.sections[si], def.sections[t]] = [def.sections[t], def.sections[si]]; mark(); draw(); });
      $$('[data-sdel]').forEach(b => b.onclick = () => { collectGeneral(); def.sections.splice(+b.dataset.sdel, 1); mark(); draw(); });
      $$('[data-fmove]').forEach(b => b.onclick = () => {
        collectGeneral();
        const [si, fi, d] = b.dataset.fmove.split(':').map(Number);
        const arr = def.sections[si].fields, t = fi + d;
        if (t >= 0 && t < arr.length) [arr[fi], arr[t]] = [arr[t], arr[fi]];
        else if (t < 0 && si > 0) def.sections[si - 1].fields.push(arr.splice(fi, 1)[0]);
        else if (t >= arr.length && si < def.sections.length - 1) def.sections[si + 1].fields.unshift(arr.splice(fi, 1)[0]);
        mark(); draw();
      });
      $$('[data-fdel]').forEach(b => b.onclick = () => { collectGeneral(); const [si, fi] = b.dataset.fdel.split(':').map(Number); def.sections[si].fields.splice(fi, 1); mark(); draw(); });
      $$('[data-farch]').forEach(b => b.onclick = () => { collectGeneral(); const [si, fi] = b.dataset.farch.split(':').map(Number); const f = def.sections[si].fields[fi]; f.active = f.active === false ? true : false; mark(); draw(); });
      $$('[data-fedit]').forEach(b => b.onclick = () => { collectGeneral(); const [si, fi] = b.dataset.fedit.split(':').map(Number); fieldModal(def.sections[si].fields[fi], (nf) => { def.sections[si].fields[fi] = nf; mark(); draw(); }); });
      $$('[data-fadd]').forEach(b => b.onclick = () => { collectGeneral(); fieldModal(null, (nf) => { def.sections[+b.dataset.fadd].fields = def.sections[+b.dataset.fadd].fields || []; def.sections[+b.dataset.fadd].fields.push(nf); mark(); draw(); }); });
      $('#sadd').onclick = () => { collectGeneral(); def.sections.push({ title: 'קטע חדש', fields: [] }); mark(); draw(); };
      if ($('#cbmi')) $('#cbmi').onchange = (e) => { collectGeneral(); def.calc = def.calc.filter(c => c.type !== 'bmi'); if (e.target.checked) def.calc.push({ type: 'bmi', weight: 'weight', height: 'height' }); mark(); draw(); };
      if ($('#csum')) $('#csum').onchange = (e) => { collectGeneral(); if (e.target.checked) def.calc.push({ type: 'score_sum', out: key + '_score', label: 'ציון כולל', level_out: key + '_level', level_label: 'רמה', levels: [{ max: 3, label: 'נמוך' }, { max: 7, label: 'בינוני' }, { max: 999, label: 'גבוה' }] }); else def.calc = def.calc.filter(c => c.type !== 'score_sum'); mark(); draw(); };
      $$('[data-cladd]').forEach(b => b.onclick = () => { collectGeneral(); def.calc.filter(c => c.type === 'score_sum')[+b.dataset.cladd].levels.push({ max: 999, label: '' }); mark(); draw(); });
      $$('[data-cldel]').forEach(b => b.onclick = () => { collectGeneral(); const [ci, li] = b.dataset.cldel.split(':').map(Number); def.calc.filter(c => c.type === 'score_sum')[ci].levels.splice(li, 1); mark(); draw(); });
      if ($('#aladd')) $('#aladd').onclick = () => { collectGeneral(); def.alerts.push({ key: '', op: 'gt', value: '', msg: '' }); mark(); draw(); };
      $$('[data-aldel]').forEach(b => b.onclick = () => { collectGeneral(); def.alerts.splice(+b.dataset.aldel, 1); mark(); draw(); });
      $('#prev').onclick = () => { collectGeneral(); R.modal('תצוגה מקדימה: ' + def.title, `${def.description ? `<div class="alert info">${esc(def.description)}</div>` : ''}${def.sections.map(s => { const fs = (s.fields || []).filter(f => f.active !== false); return fs.length ? `<fieldset><legend>${esc(s.title)}</legend><div class="form-grid">${fs.map(f => R.fieldHtml(f, undefined, 'pv_')).join('')}</div></fieldset>` : ''; }).join('')}`, [{ id: 'ok', label: 'סגירה' }], { wide: true, noFocus: true }); };
      $('#savef').onclick = async () => {
        collectGeneral();
        def.alerts = def.alerts.filter(a => a.key && a.value !== '');
        for (const c of def.calc.filter(c => c.type === 'score_sum')) if (!/^[a-z][a-z0-9_]*$/.test(c.out || '')) return R.toast('מזהה הציון חייב להיות באנגלית', 'bad');
        if (!def.title) return R.toast('חסר שם לטופס', 'bad');
        try {
          R.setForms(await API.saveForm(S.token, key, def, isPatient ? true : active, orig.sort));
          dirty = false; R.toast('הטופס נשמר', 'good'); location.hash = '#/forms';
        } catch (e) { R.fail(e); }
      };
    }

    function fieldModal(f, done) {
      const isNewField = !f || !savedKeys.has(f.key);
      f = f || { key: '', label: '', type: 'number' };
      const body = `<form id="ff" onsubmit="return false"><div class="form-grid">
        <div class="field req"><label>שם השדה (כפי שיופיע לצוות)</label><input type="text" name="label" value="${esc(f.label)}"></div>
        <div class="field req"><label>מזהה באנגלית</label><input type="text" name="key" value="${esc(f.key)}" dir="ltr" ${isNewField ? '' : 'readonly'} placeholder="vitamin_d"><div class="hint">${isNewField ? 'אותיות קטנות, ספרות וקו תחתון. שם המשתנה בייצוא.' : 'לא ניתן לשנות — כבר יש נתונים בשם זה'}</div></div>
        <div class="field"><label>סוג</label><select name="type">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field" data-for="number"><label>יחידות</label><input type="text" name="unit" value="${esc(f.unit || '')}" dir="ltr" placeholder="ng/mL"></div>
        <div class="field" data-for="number"><label>ערך סביר מינימלי</label><input type="number" name="min" value="${esc(f.min ?? '')}" step="any"></div>
        <div class="field" data-for="number"><label>ערך סביר מקסימלי</label><input type="number" name="max" value="${esc(f.max ?? '')}" step="any"></div>
        <div class="field" data-for="number"><label>דיוק (צעד)</label><select name="step">${[['1', 'שלם'], ['0.1', '0.1'], ['0.01', '0.01'], ['any', 'חופשי']].map(([v, l]) => `<option value="${v}" ${String(f.step || 'any') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field wide" data-for="options"><label>אפשרויות התשובה</label>
          <div class="opt-head small muted"><span>נוסח האפשרות</span><span data-for="score">ניקוד</span><span></span></div>
          <div id="optrows"></div>
          <div class="row"><button type="button" class="btn sm ghost" id="optadd">${icon('plus', 14)} אפשרות</button>
            <button type="button" class="btn sm ghost" id="optbulk">הדבקת רשימה</button></div>
          ${isNewField ? '' : '<div class="hint">שינוי נוסח של אפשרות קיימת מעדכן אוטומטית גם את ההזנות הישנות (הניקוד נשמר).</div>'}</div>
        <div class="field wide"><label>הסבר קצר מתחת לשדה (לא חובה)</label><input type="text" name="hint" value="${esc(f.hint || '')}"></div>
        <label class="switch"><input type="checkbox" name="required" ${f.required ? 'checked' : ''}><span></span> שדה חובה</label>
      </div></form>`;
      R.modal(isNewField && !f.label ? 'שדה / בדיקה חדשה' : 'עריכת שדה', body, [
        { id: 'ok', label: 'אישור', cls: 'primary', onClick: (root) => {
          const g = (n) => $(`[name=${n}]`, root);
          const nf = Object.assign({}, f, { label: g('label').value.trim(), key: g('key').value.trim(), type: g('type').value, hint: g('hint').value.trim() || undefined, required: g('required').checked || undefined });
          if (!nf.label) { R.toast('חסר שם שדה', 'bad'); return false; }
          if (!/^[a-z][a-z0-9_]{0,40}$/.test(nf.key)) { R.toast('מזהה: אנגלית קטנה, ספרות וקו תחתון, מתחיל באות', 'bad'); return false; }
          if (isNewField && R.fields(def, true).some(x => x.key === nf.key && x !== f)) { R.toast('מזהה כבר קיים בטופס', 'bad'); return false; }
          delete nf.unit; delete nf.min; delete nf.max; delete nf.step; delete nf.options;
          if (nf.type === 'number') {
            if (g('unit').value.trim()) nf.unit = g('unit').value.trim();
            if (g('min').value !== '') nf.min = Number(g('min').value);
            if (g('max').value !== '') nf.max = Number(g('max').value);
            nf.step = g('step').value === 'any' ? undefined : Number(g('step').value);
            if (f.autoAge) nf.autoAge = true;
          }
          if (['select', 'radio', 'checks', 'score'].includes(nf.type)) {
            const rows = $$('.opt-row', root).map(r => ({ orig: r.dataset.orig || null, label: $('.ol', r).value.trim(), score: Number($('.os', r).value) || 0 })).filter(r => r.label);
            if (!rows.length) { R.toast('יש להזין לפחות אפשרות אחת', 'bad'); return false; }
            if (new Set(rows.map(r => r.label)).size !== rows.length) { R.toast('יש שתי אפשרויות עם אותו נוסח', 'bad'); return false; }
            nf.options = nf.type === 'score' ? rows.map(r => [r.label, r.score]) : rows.map(r => r.label);
            // מעקב אחרי שינויי נוסח — כדי שהזנות ישנות ימשיכו להתאים
            const ren = Object.assign({}, f.renames || {});
            rows.forEach(r => { if (r.orig && r.orig !== r.label) { ren[r.orig] = r.label; delete ren[r.label]; } });
            Object.keys(ren).forEach(k => { if (ren[k] === k) delete ren[k]; });
            if (Object.keys(ren).length) nf.renames = ren; else delete nf.renames;
          }
          Object.keys(nf).forEach(k => nf[k] === undefined && delete nf[k]);
          done(nf);
        } },
        { id: 'c', label: 'ביטול' }
      ], { wide: true, onOpen: (root) => {
        const box = $('#optrows', root);
        const rowHtml = (label, score, orig) => `<div class="opt-row" ${orig != null ? `data-orig="${esc(orig)}"` : ''}>
            <input type="text" class="ol" value="${esc(label)}" placeholder="נוסח האפשרות">
            <input type="number" class="os" value="${esc(score)}" step="any" data-for="score">
            <span class="row nowrap tight"><button type="button" class="icon-btn xs" data-om="-1">${icon('up', 14)}</button><button type="button" class="icon-btn xs" data-om="1">${icon('down', 14)}</button>
            <button type="button" class="icon-btn xs danger" data-od>${icon('trash', 14)}</button></span></div>`;
        const sync = () => { const t = $('[name=type]', root).value; $$('[data-for=number]', root).forEach(x => x.hidden = t !== 'number'); $$('[data-for=options]', root).forEach(x => x.hidden = !['select', 'radio', 'checks', 'score'].includes(t)); $$('[data-for=score]', root).forEach(x => x.hidden = t !== 'score'); };
        box.innerHTML = (f.options || []).map(o => Array.isArray(o) ? rowHtml(o[0], o[1], isNewField ? null : o[0]) : rowHtml(o, 0, isNewField ? null : o)).join('');
        if (!box.children.length) box.innerHTML = rowHtml('', 0, null) + rowHtml('', 1, null);
        box.addEventListener('click', async (e) => {
          const row = e.target.closest('.opt-row'); if (!row) return;
          const mv = e.target.closest('[data-om]');
          if (mv) { const d = +mv.dataset.om; const sib = d < 0 ? row.previousElementSibling : row.nextElementSibling; if (sib) d < 0 ? box.insertBefore(row, sib) : box.insertBefore(sib, row); }
          if (e.target.closest('[data-od]')) {
            if (row.dataset.orig && !(await R.confirm(`למחוק את האפשרות "${row.dataset.orig}"? בהזנות ישנות שבחרו בה הערך יישמר, אבל לא יופיע כאפשרות לבחירה.`, 'מחיקה', true))) return;
            row.remove();
          }
        });
        $('#optadd', root).onclick = () => { const n = box.children.length; box.insertAdjacentHTML('beforeend', rowHtml('', n, null)); sync(); $('.opt-row:last-child .ol', box).focus(); };
        $('#optbulk', root).onclick = async () => {
          let txt = '';
          await R.modal('הדבקת רשימת אפשרויות', '<p class="small muted">שורה לכל אפשרות. עם ניקוד: "טקסט = ניקוד".</p><textarea id="bulk" rows="8"></textarea>', [{ id: 'ok', label: 'הוספה', cls: 'primary', onClick: (r2) => { txt = $('#bulk', r2).value; } }, { id: 'c', label: 'ביטול' }]);
          txt.split('\n').map(x => x.trim()).filter(Boolean).forEach(l => { const m = l.split('='); box.insertAdjacentHTML('beforeend', rowHtml(m[0].trim(), Number((m[1] || '').trim()) || 0, null)); });
          $$('.opt-row', box).forEach(r => { if (!$('.ol', r).value.trim() && !r.dataset.orig) r.remove(); });
          sync();
        };
        $('[name=type]', root).onchange = sync; sync();
      } });
    }
    draw();
    window.onbeforeunload = () => dirty ? true : undefined;
  };

  /* ---------- הגדרות ---------- */
  R.pages.settings = () => {
    if (!guard(R.isAdmin())) return;
    const s = S.settings;
    const lines = (a) => esc((a || []).join('\n'));
    view().innerHTML = `${R.head('הגדרות המחקר', '')}
      <form class="card" id="stf" style="max-width:860px">
        <h2>כללי</h2><div class="form-grid">
          <div class="field wide"><label>שם המחקר</label><input type="text" name="study_name" value="${esc(s.study_name || '')}"></div>
          <div class="field wide"><label>מחלקות משתתפות (שורה לכל מחלקה)</label><textarea name="wards">${lines(s.wards)}</textarea></div>
          <div class="field"><label>יעד גיוס מטופלים</label><input type="number" name="target_patients" value="${esc(s.target_patients ?? '')}" min="0"></div>
          <div class="field"><label>יעד בדיקות דם למטופל</label><input type="number" name="target_visits" value="${esc(s.target_visits ?? '')}" min="1"></div>
          <div class="field"><label>תאריך התחלה</label><input type="date" name="start_date" value="${esc(s.start_date || '')}"></div>
          <div class="field"><label>תאריך סיום מתוכנן</label><input type="date" name="end_date" value="${esc(s.end_date || '')}"></div>
        </div>
        <h2>קריטריונים</h2><div class="form-grid">
          <div class="field"><label>קריטריוני הכללה (שורה לכל קריטריון)</label><textarea name="inclusion_criteria" rows="5">${lines(s.inclusion_criteria)}</textarea></div>
          <div class="field"><label>קריטריוני אי-הכללה</label><textarea name="exclusion_criteria" rows="5">${lines(s.exclusion_criteria)}</textarea></div>
        </div>
        <h2>מעקב והתראות</h2><div class="form-grid">
          <div class="field"><label>"בקרוב" = בתוך כמה ימים</label><input type="number" name="due_soon_days" value="${esc(s.due_soon_days ?? 30)}" min="1"></div>
          <label class="switch"><input type="checkbox" name="alerts_enabled" ${s.alerts_enabled !== false ? 'checked' : ''}><span></span> שליחת התראות אוטומטיות לרופא/ה על ערכים חריגים</label>
        </div>
        <button class="btn primary">${icon('check')} שמירה</button></form>`;
    $('#stf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const ls = (n) => f[n].value.split('\n').map(x => x.trim()).filter(Boolean);
      const payload = {
        study_name: f.study_name.value.trim(), wards: ls('wards'),
        target_patients: Number(f.target_patients.value) || 0, target_visits: Number(f.target_visits.value) || 1,
        start_date: f.start_date.value || null, end_date: f.end_date.value || null,
        inclusion_criteria: ls('inclusion_criteria'), exclusion_criteria: ls('exclusion_criteria'),
        due_soon_days: Number(f.due_soon_days.value) || 30, alerts_enabled: f.alerts_enabled.checked
      };
      try { S.settings = await API.saveSettings(S.token, payload); R.toast('ההגדרות נשמרו', 'good'); } catch (ex) { R.fail(ex); }
    };
  };

  /* ---------- יומן ---------- */
  const ACTIONS = { login: 'כניסה', login_failed: 'כניסה נכשלה', change_password: 'החלפת סיסמה', create_patient: 'גיוס מטופל', update_patient: 'עדכון מטופל',
    create_record: 'הזנה חדשה', update_record: 'עדכון הזנה', delete_record: 'מחיקת הזנה', verify_record: 'אישור הזנה', unverify_record: 'ביטול אישור',
    create_staff: 'הקמת משתמש', update_staff: 'עדכון משתמש', reset_password: 'איפוס סיסמה', save_settings: 'עדכון הגדרות', export: 'ייצוא נתונים',
    create_form: 'יצירת טופס', update_form: 'עדכון טופס', add_note: 'הערה', resolve_note: 'סימון הערה כטופלה', reopen_note: 'פתיחת הערה' };
  R.pages.audit = async () => {
    if (!guard(R.isAdmin())) return;
    R.loading();
    const list = await API.audit(S.token, 500);
    view().innerHTML = `${R.head('יומן פעולות', '500 הפעולות האחרונות')}
      <div class="card"><div class="table-wrap"><table><thead><tr><th>זמן</th><th>משתמש</th><th>פעולה</th><th>פרטים</th></tr></thead><tbody>
      ${list.map(a => `<tr><td class="small nowrap">${R.fmtDateTime(a.at)}</td><td>${esc(a.full_name || '—')}</td>
        <td>${['login_failed', 'delete_record', 'unverify_record'].includes(a.action) ? R.pill(ACTIONS[a.action] || a.action, 'warn') : esc(ACTIONS[a.action] || a.action)}</td>
        <td class="small muted">${esc(a.entity && R.forms[a.entity] ? R.forms[a.entity].short : '')} ${esc(a.details ? (a.details.code || a.details.username || a.details.title || '') : '')}</td></tr>`).join('') || `<tr><td colspan="4">${R.empty('ריק')}</td></tr>`}
      </tbody></table></div></div>`;
  };

  /* ---------- ייצוא לאקסל ---------- */
  R.pages.export = () => {
    if (!guard(R.can('can_export'))) return;
    view().innerHTML = `${R.head('ייצוא לאקסל', '')}
      <div class="card" style="max-width:760px">
        <p>הקובץ כולל: מטופלים (כולל קריטריונים ופרישה), גיליון לכל טופס (כל ביקור = שורה), הערות, ${R.can('can_view_stats') ? 'ביצועי צוות, ' : ''}ומילון משתנים.</p>
        <label class="opt block"><input type="radio" name="hdr" value="he" checked><span>כותרות בעברית — לקריאה</span></label>
        <label class="opt block"><input type="radio" name="hdr" value="en"><span>שמות משתנים באנגלית — ל-SPSS / R (ציונים כמספרים, כן/לא = 1/0)</span></label>
        <label class="switch"><input type="checkbox" id="inact" checked><span></span> לכלול מטופלים שפרשו</label>
        <label class="switch"><input type="checkbox" id="onlyv"><span></span> רק הזנות שאושרו</label>
        <div><button class="btn primary" id="go">${icon('download')} הורדת קובץ Excel</button></div>
        <p class="small muted" style="margin-bottom:0">כל ייצוא נרשם ביומן. לשמור את הקובץ במחשב מאובטח בלבד, בהתאם לאישור ועדת הלסינקי.</p>
      </div>`;
    $('#go').onclick = async () => {
      const btn = $('#go'); btn.disabled = true;
      try {
        const data = await API.exportAll(S.token);
        let stats = null;
        if (R.can('can_view_stats')) { try { stats = await API.stats(S.token); } catch (e) { /* ignore */ } }
        buildWorkbook(data, stats, $('input[name=hdr]:checked').value === 'en', $('#inact').checked, $('#onlyv').checked);
        R.toast('הקובץ ירד', 'good');
      } catch (e) { R.fail(e); }
      btn.disabled = false;
    };
  };

  function buildWorkbook(data, stats, en, includeInactive, onlyVerified) {
    if (typeof XLSX === 'undefined') { R.toast('ספריית האקסל לא נטענה', 'bad'); return; }
    const patients = data.patients.filter(p => includeInactive || p.active);
    const pIds = new Set(patients.map(p => p.id));
    const pmap = Object.fromEntries(patients.map(p => [p.id, p]));
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: !en }] };
    const dict = [];
    const col = (key, he, sheet, unit) => { dict.push([key, he, unit || '', sheet]); return en ? key : he + (unit ? ` (${unit})` : ''); };
    const val = (v) => Array.isArray(v) ? v.join('; ') : (v === undefined || v === null ? '' : v);
    const inc = S.settings.inclusion_criteria || [], exc = S.settings.exclusion_criteria || [];
    const PF = R.patientForm();
    const pfFields = R.fields(PF, true);
    const forms = R.dataForms();

    const pHead = [col('patient_code', 'מספר סידורי', 'patients'), col('ward', 'מחלקה', 'patients'), col('sex', 'מין', 'patients'), col('birth_month', 'חודש לידה', 'patients'), col('age_now', 'גיל היום', 'patients'), col('active', 'פעיל', 'patients')]
      .concat(pfFields.map(f => col(f.key, f.label, 'patients', f.unit)))
      .concat(inc.map((c, i) => col(`incl_${i + 1}`, 'הכללה: ' + c, 'patients'))).concat(exc.map((c, i) => col(`excl_${i + 1}`, 'אי-הכללה: ' + c, 'patients')))
      .concat([col('withdrawal_date', 'תאריך פרישה', 'patients'), col('withdrawal_reason', 'סיבת פרישה', 'patients')])
      .concat(forms.map(f => col('n_' + f.key, 'מס׳ הזנות — ' + (f.short || f.title), 'patients')))
      .concat([col('enrolled_by', 'גויס ע"י', 'patients'), col('enrolled_at', 'תאריך גיוס', 'patients')]);
    const yn = (b) => en ? (b ? 1 : 0) : (b ? 'כן' : 'לא');
    const pRows = patients.map(p => { const d = p.data || {}; return [p.code, p.ward, p.sex, p.birth_month, R.ageNow(p.birth_month), p.active ? 1 : 0]
      .concat(pfFields.map(f => en && f.type === 'yesno' && d[f.key] ? (d[f.key] === 'כן' ? 1 : 0) : val(R.normVal(f, d[f.key]))))
      .concat(inc.map(c => yn((d._inclusion || []).includes(c)))).concat(exc.map(c => yn((d._exclusion || []).includes(c))))
      .concat([d._withdrawal_date || '', d._withdrawal_reason || ''])
      .concat(forms.map(f => (p.counts || {})[f.key] || 0))
      .concat([p.created_by_name, (p.created_at || '').slice(0, 10)]); });
    addSheet(wb, en ? 'patients' : 'מטופלים', [pHead, ...pRows]);

    for (const F of forms) {
      const fields = R.fields(F, true);
      const L = R.computedLabels(F), ck = Object.keys(L);
      const recs = data.records.filter(r => r.form_type === F.key && pIds.has(r.patient_id) && (!onlyVerified || r.verified_at))
        .sort((a, b) => (a.patient_code + a.visit_date).localeCompare(b.patient_code + b.visit_date, 'he', { numeric: true }));
      if (!recs.length && !F.active) continue;
      const head = [col('patient_code', 'מספר סידורי', F.key), col('ward', 'מחלקה', F.key), col('sex', 'מין', F.key), col('visit_date', 'תאריך', F.key), col('visit_no', 'מס׳ ביקור', F.key)]
        .concat(fields.map(f => col(f.key, f.label + (f.active === false ? ' [הוסר]' : ''), F.key, f.unit)))
        .concat(ck.map(k => col(k, L[k], F.key))).concat([col('alerts', 'התראות', F.key), col('verified', 'אושר', F.key), col('entered_by', 'הוזן ע"י', F.key), col('entered_at', 'זמן הזנה', F.key)]);
      const seq = {};
      const rows = recs.map(r => {
        const p = pmap[r.patient_id] || {};
        seq[r.patient_id] = (seq[r.patient_id] || 0) + 1;
        return [r.patient_code, p.ward, p.sex, r.visit_date, seq[r.patient_id]]
          .concat(fields.map(f => { const v = R.normVal(f, (r.data || {})[f.key]); if (en && f.type === 'score' && v !== undefined && v !== '') return R.scoreOf(F, f.key, v); if (en && f.type === 'yesno' && v) return v === 'כן' ? 1 : 0; return val(v); }))
          .concat(ck.map(k => val((r.computed || {})[k]))).concat([val((r.computed || {})._alerts), r.verified_at ? 1 : 0, r.created_by_name, (r.created_at || '').replace('T', ' ').slice(0, 16)]);
      });
      addSheet(wb, en ? F.key : (F.short || F.title), [head, ...rows]);
    }

    const notes = (data.notes || []).filter(n => !n.patient_id || pIds.has(n.patient_id));
    addSheet(wb, en ? 'notes' : 'הערות', [['patient_code', 'תאריך', 'מאת', 'אל', 'סוג', 'הערה', 'תגובה ל', 'סטטוס', 'טופל ע"י'].map((h, i) => en ? ['patient_code', 'created_at', 'author', 'to', 'type', 'body', 'reply_to', 'status', 'resolved_by'][i] : h)]
      .concat(notes.sort((a, b) => a.created_at.localeCompare(b.created_at)).map(n => [n.patient_code || '', n.created_at.replace('T', ' ').slice(0, 16), n.created_by_name, n.to_role === 'doctor' ? 'רופא/ה' : 'צוות', n.auto ? 'התראה' : 'הערה', n.body, n.parent_id ? 'כן' : '', n.parent_id ? '' : n.status, n.resolved_by_name || ''])));

    if (stats && stats.staff) {
      const sh = [['איש צוות', 'תפקיד', 'סה"כ', 'החודש', '7 ימים'].concat(forms.map(f => f.short || f.title)).concat(['עריכות', 'גיוסים', 'ימי פעילות', 'הזנה אחרונה'])];
      stats.staff.forEach(s => sh.push([s.full_name, R.roleLabel(s.role), s.records_total, s.records_month, s.records_week].concat(forms.map(f => (s.by_form || {})[f.key] || 0)).concat([s.edits, s.patients_added, s.active_days, (s.last_entry || '').slice(0, 10)])));
      addSheet(wb, en ? 'staff' : 'ביצועי צוות', sh);
    }
    const seen = new Set();
    addSheet(wb, en ? 'dictionary' : 'מילון משתנים', [['variable', 'תיאור', 'יחידות', 'גיליון']].concat(dict.filter(d => { const k = d[3] + d[0]; if (seen.has(k)) return false; seen.add(k); return true; }))
      .concat([[], ['PhenoAge', 'Levine ME et al. Aging (Albany NY) 2018;10(4):573-591', '', 'labs']]));
    XLSX.writeFile(wb, `research_export_${R.today()}.xlsx`);
  }
  function addSheet(wb, name, aoa) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const head = aoa[0] || [];
    ws['!cols'] = head.map((h, i) => ({ wch: Math.min(40, Math.max(10, String(h || '').length + 2, ...aoa.slice(1, 50).map(r => String((r || [])[i] ?? '').length + 1))) }));
    if (aoa.length > 1 && head.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: head.length - 1 } }) };
    let nm = name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31), i = 2;
    while (wb.SheetNames.includes(nm)) nm = name.slice(0, 28) + ' ' + i++;
    XLSX.utils.book_append_sheet(wb, ws, nm);
  }
})();
