/* =====================================================================
 *  מערכת מחקר מחלקתי — מעטפת, ניתוב ומסכי עבודה שוטפת
 * ===================================================================== */
(function () {
  'use strict';
  const R = window.R;
  const { $, $$, esc, icon } = R;
  const S = R.S = { token: null, user: null, settings: {}, openNotes: 0, overdue: 0 };
  R.pages = R.pages || {};
  const view = () => $('#view');

  /* ------------------------------ מטמון נתונים ------------------------------ */
  const cache = { patients: null, records: null };
  R.getPatients = async (force) => { if (!cache.patients || force) cache.patients = await API.listPatients(S.token); return cache.patients; };
  R.getRecords = async (force) => { if (!cache.records || force) cache.records = await API.listRecords(S.token); return cache.records; };
  R.invalidate = () => { cache.patients = null; cache.records = null; };
  R.refreshBadges = async () => {
    try {
      const me = await API.me(S.token);
      S.openNotes = me.open_notes || 0;
      const pts = await R.getPatients();
      S.overdue = R.followups(pts).filter(r => r.status === 'overdue' || r.status === 'never').length;
      paintBadges();
    } catch (e) { /* שקט */ }
  };
  function paintBadges() {
    const b1 = $('[data-badge=notes]'), b2 = $('[data-badge=follow]');
    if (b1) { b1.textContent = S.openNotes; b1.hidden = !S.openNotes; }
    if (b2) { b2.textContent = S.overdue; b2.hidden = !S.overdue; }
  }

  /* ------------------------------ מעטפת ------------------------------ */
  function navItems() {
    const g = [];
    g.push({ title: 'עבודה שוטפת', items: [
      ['home', 'ראשי', 'home'], ['patients', 'מטופלים', 'users'], ['followup', 'מעקב ביקורים', 'calendar', 'follow'],
      ['notes', 'הערות ושאלות', 'message', 'notes'], ['mine', 'ההזנות שלי', 'list']] });
    const research = [];
    if (R.can('can_view_stats')) research.push(['dashboard', 'התקדמות וצוות', 'activity'], ['analytics', 'ניתוח ותרשימים', 'chart'], ['quality', 'איכות נתונים', 'checkCircle']);
    if (R.can('can_export')) research.push(['export', 'ייצוא לאקסל', 'download']);
    if (research.length) g.push({ title: 'מחקר', items: research });
    if (R.isAdmin()) g.push({ title: 'ניהול', items: [['staff', 'צוות והרשאות', 'shield'], ['forms', 'טפסים ובדיקות', 'layers'], ['settings', 'הגדרות מחקר', 'sliders'], ['audit', 'יומן פעולות', 'clock']] });
    return g;
  }
  function initials(n) { return (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join(''); }

  function shell() {
    document.body.className = '';
    document.body.innerHTML = `
      <div class="layout">
        <aside class="side" id="side">
          <div class="brand"><div class="logo">${icon('flask', 22)}</div>
            <div><div class="b1">${esc(S.settings.study_name || 'מחקר מחלקתי')}</div><div class="b2">מערכת איסוף נתוני מחקר</div></div></div>
          <nav>${navItems().map(gr => `<div class="ngroup"><div class="ntitle">${gr.title}</div>
            ${gr.items.map(([k, l, ic, badge]) => `<a href="#/${k}" data-nav="${k}">${icon(ic)}<span>${l}</span>${badge ? `<b class="badge" data-badge="${badge}" hidden></b>` : ''}</a>`).join('')}</div>`).join('')}</nav>
          <div class="me">
            <div class="avatar">${esc(initials(S.user.full_name))}</div>
            <div class="grow"><div class="nm">${esc(S.user.full_name)}</div><div class="rl">${R.roleLabel(S.user.role)}</div></div>
            <a href="#/password" class="icon-btn light" title="החלפת סיסמה">${icon('key')}</a>
            <button class="icon-btn light" id="logout" title="יציאה">${icon('logout')}</button>
          </div>
        </aside>
        <div class="side-shade" id="shade"></div>
        <div class="main">
          <header class="mobilebar"><button class="icon-btn" id="menu">${icon('menu')}</button><b>${esc(S.settings.study_name || 'מחקר')}</b></header>
          <main id="view"></main>
        </div>
      </div>
      <div id="toast"></div>`;
    $('#logout').onclick = () => R.logout();
    const toggle = (open) => { $('#side').classList.toggle('open', open); $('#shade').classList.toggle('open', open); };
    $('#menu').onclick = () => toggle(true);
    $('#shade').onclick = () => toggle(false);
    $$('#side nav a').forEach(a => a.addEventListener('click', () => toggle(false)));
    paintBadges();
  }
  function markNav(page) {
    const map = { patient: 'patients', record: 'patients', form: 'forms' };
    const cur = map[page] || page;
    $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === cur));
  }
  R.loading = () => { view().innerHTML = '<div class="loader"><div class="spinner"></div></div>'; };
  R.head = (title, sub, actions = '', crumbs = '') => `<div class="page-head"><div>${crumbs ? `<div class="crumbs">${crumbs}</div>` : ''}<h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="actions">${actions}</div></div>`;

  /* ------------------------------ התחברות ------------------------------ */
  function loginFrame(inner) {
    document.body.className = 'login-body';
    document.body.innerHTML = `<div class="login-wrap"><div class="login-art">
        <div class="logo big">${icon('flask', 34)}</div>
        <h2>מערכת מחקר מחלקתי</h2><p>איסוף נתונים מאובטח לצוות המחקר — בדיקות, הערכות, מעקב ותיעוד.</p>
        <ul><li>${icon('lock')} גישה אישית לכל איש צוות</li><li>${icon('shield')} מספרים סידוריים בלבד — ללא פרטים מזהים</li><li>${icon('clipboard')} כל פעולה מתועדת</li></ul>
      </div><div class="login-card">${inner}</div></div><div id="toast"></div>`;
  }
  function renderLogin(errMsg) {
    if (!API.CONFIGURED) {
      loginFrame(`<h1>נדרשת הגדרה</h1><p class="muted">יש למלא את js/config.js בכתובת ובמפתח של Supabase (ראו README).</p>`);
      return;
    }
    loginFrame(`<form id="lf" autocomplete="on">
        <h1>כניסה</h1><p class="muted" style="margin-top:-.4rem">הזן/י את פרטי המשתמש שקיבלת ממנהל המחקר</p>
        ${errMsg ? `<div class="alert bad">${icon('alert')}<span>${esc(errMsg)}</span></div>` : ''}
        <div class="field"><label for="u">שם משתמש</label><input type="text" id="u" autocomplete="username" required dir="ltr"></div>
        <div class="field"><label for="p">סיסמה</label><input type="password" id="p" autocomplete="current-password" required dir="ltr"></div>
        <button class="btn primary block">כניסה</button>
        <p class="muted small">שכחת סיסמה? פנה/י למנהל המחקר לאיפוס. · יש לוודא שהמקלדת באנגלית.</p></form>`);
    $('#u').focus();
    $('#lf').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#lf button'); btn.disabled = true;
      try { afterAuth(await API.login($('#u').value, $('#p').value)); }
      catch (err) { renderLogin(API.message(err)); }
    };
  }
  function afterAuth(r) {
    if (r.token) { S.token = r.token; R.ss.set('rs_token', r.token); }
    S.user = r.user; S.settings = r.settings || {}; S.openNotes = r.open_notes || 0;
    R.setForms(r.forms || []);
    if (!R.formList.length) { loginFrame(`<h1>השרת לא עודכן</h1><p>יש להריץ את הקובץ <b>sql/upgrade_v2.sql</b> ב-Supabase → SQL Editor, ואז לרענן.</p>`); return; }
    if (S.user.must_change_password) return renderForcePassword();
    shell();
    if (!location.hash || location.hash === '#/login') location.hash = '#/home';
    route();
    R.refreshBadges();
  }
  function renderForcePassword() {
    loginFrame(`<form id="pf"><h1>בחירת סיסמה אישית</h1>
        <p class="muted">זו כניסה ראשונה או שהסיסמה אופסה. יש לבחור סיסמה חדשה — לפחות 8 תווים.</p>
        <div class="alert bad" id="perr" hidden></div>
        <div class="field"><label>סיסמה נוכחית (זמנית)</label><input type="password" id="o" required dir="ltr"></div>
        <div class="field"><label>סיסמה חדשה</label><input type="password" id="n1" minlength="8" required dir="ltr"></div>
        <div class="field"><label>אימות סיסמה חדשה</label><input type="password" id="n2" minlength="8" required dir="ltr"></div>
        <button class="btn primary block">שמירה והמשך</button></form>`);
    $('#pf').onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#perr');
      const show = (m) => { err.hidden = false; err.textContent = m; };
      if ($('#n1').value !== $('#n2').value) return show('הסיסמאות אינן תואמות');
      if ($('#n1').value === $('#o').value) return show('הסיסמה החדשה חייבת להיות שונה מהזמנית');
      try { await API.changePassword(S.token, $('#o').value, $('#n1').value); S.user.must_change_password = false; R.toast('הסיסמה עודכנה', 'good'); afterAuth({ user: S.user, settings: S.settings, forms: R.formList.map(f => ({ key: f.key, def: f, active: f.active, sort: f.sort })), open_notes: S.openNotes }); }
      catch (ex) { show(API.message(ex)); }
    };
  }
  R.logout = async (expired) => {
    try { if (S.token) await API.logout(S.token); } catch (e) { /* ignore */ }
    S.token = null; S.user = null; R.invalidate(); R.ss.del('rs_token');
    location.hash = '#/login';
    renderLogin(expired ? 'פג תוקף ההתחברות — יש להתחבר מחדש' : null);
  };

  let idleTimer = null;
  function resetIdle() {
    clearTimeout(idleTimer);
    const mins = (window.APP_CONFIG && APP_CONFIG.IDLE_LOGOUT_MINUTES) || 20;
    idleTimer = setTimeout(() => { if (S.token) { R.logout(); R.toast('נותקת אוטומטית בגלל חוסר פעילות'); } }, mins * 60e3);
  }
  ['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true }));

  /* ------------------------------ ניתוב ------------------------------ */
  async function route() {
    if (!S.token) return renderLogin();
    if (!$('#view')) shell();
    window.onbeforeunload = null;
    resetIdle();
    const h = (location.hash || '#/home').slice(2).split('/');
    const page = h[0] || 'home';
    markNav(page);
    window.scrollTo(0, 0);
    const fn = R.pages[page];
    if (!fn) { location.hash = '#/home'; return; }
    try { await fn(...h.slice(1).map(decodeURIComponent)); } catch (err) { R.fail(err); }
  }
  R.route = route;
  window.addEventListener('hashchange', route);

  /* =====================================================================
   *  מסכים
   * ===================================================================== */

  /* ---------- ראשי ---------- */
  R.pages.home = async () => {
    R.loading();
    const [patients, recs, notes] = await Promise.all([R.getPatients(true), R.getRecords(true), API.listNotes(S.token, null, 'open')]);
    const mine = recs.filter(r => r.created_by === S.user.id);
    const week = mine.filter(r => new Date(r.created_at) > Date.now() - 7 * 864e5).length;
    const fu = R.followups(patients);
    S.overdue = fu.filter(r => r.status === 'overdue' || r.status === 'never').length; paintBadges();
    const myRole = S.user.role === 'staff' ? 'team' : 'doctor';
    const openRoots = notes.filter(n => !n.parent_id && n.status === 'open' && (R.isAdmin() || n.to_role === myRole || n.created_by === S.user.id));
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';
    view().innerHTML = `
      ${R.head(`${greet}, ${esc(S.user.full_name.split(' ')[0])}`, R.fmtDate(new Date()) + ' · ' + R.roleLabel(S.user.role))}
      <div class="grid k4">
        <div class="card kpi"><div class="kic teal">${icon('clipboard')}</div><div><div class="label">ההזנות שלי השבוע</div><div class="value">${week}</div><div class="small muted">${mine.length} בסך הכול</div></div></div>
        <div class="card kpi"><div class="kic blue">${icon('users')}</div><div><div class="label">מטופלים פעילים</div><div class="value">${patients.filter(p => p.active).length}</div><div class="small muted">${patients.length} גויסו</div></div></div>
        <a class="card kpi link" href="#/followup"><div class="kic orange">${icon('calendar')}</div><div><div class="label">ביקורים באיחור / חסרים</div><div class="value">${S.overdue}</div><div class="small muted">${fu.filter(r => r.status === 'soon').length} בקרוב</div></div></a>
        <a class="card kpi link" href="#/notes"><div class="kic rose">${icon('message')}</div><div><div class="label">הערות פתוחות</div><div class="value">${openRoots.length}</div><div class="small muted">${R.isDoctor() ? 'ממתינות לך' : 'בצוות'}</div></div></a>
      </div>
      <div class="grid k2">
        <div class="card">
          <h2>${icon('search')} מעבר מהיר למטופל</h2>
          <form id="qf" class="row" style="align-items:flex-end">
            <div class="grow"><input type="search" id="qc" list="codes" placeholder="מספר סידורי, לדוגמה R-012" autocomplete="off" dir="ltr"></div>
            <button class="btn primary">פתיחה</button>
          </form>
          <datalist id="codes">${patients.map(p => `<option value="${esc(p.code)}">`).join('')}</datalist>
          ${R.can('can_add_patients') ? `<button class="btn ghost" id="newp" style="margin-top:.6rem">${icon('plus')} גיוס מטופל חדש</button>` : ''}
          <div class="pills" style="margin-top:.9rem">${R.activeForms().filter(f => R.canEnter(f.key)).map(f => `<span class="pill brand">${f.icon || ''} ${esc(f.short || f.title)}</span>`).join('') || '<span class="muted small">אין לך הרשאת הזנה לטפסים</span>'}</div>
        </div>
        <div class="card">
          <div class="row between"><h2>${icon('calendar')} ביקורים שמועדם הגיע</h2><a href="#/followup">הכול ←</a></div>
          ${fu.filter(r => r.status !== 'ok').slice(0, 6).map(r => `<a class="list-item" href="#/patient/${r.patient.id}">
              <span class="code">${esc(r.patient.code)}</span><span class="grow">${r.form.icon || ''} ${esc(r.form.short || r.form.title)}</span>${R.followStatus(r)}</a>`).join('') || R.empty('אין ביקורים ממתינים', 'checkCircle')}
        </div>
      </div>
      ${openRoots.length ? `<div class="card"><div class="row between"><h2>${icon('message')} הערות פתוחות</h2><a href="#/notes">הכול ←</a></div>
        ${openRoots.slice(0, 4).map(n => noteMini(n)).join('')}</div>` : ''}
      <div class="card">
        <div class="row between"><h2>${icon('list')} ההזנות האחרונות שלי</h2><a href="#/mine">הכול ←</a></div>
        ${R.recordsTable(mine.slice(0, 6), { showPatient: true })}
      </div>`;
    $('#qf').onsubmit = async (e) => {
      e.preventDefault();
      const code = $('#qc').value.trim(); if (!code) return;
      const p = patients.find(x => x.code.toLowerCase() === code.toLowerCase());
      if (p) { location.hash = '#/patient/' + p.id; return; }
      if (!R.can('can_add_patients')) return R.toast('מספר סידורי לא נמצא', 'bad');
      if (await R.confirm(`המספר "${code}" לא קיים. לגייס מטופל חדש?`, 'גיוס')) R.editPatient(null, code);
    };
    if ($('#newp')) $('#newp').onclick = () => R.editPatient(null);
    R.bindRecordTable();
  };

  function noteMini(n) {
    return `<a class="list-item" href="#/patient/${n.patient_id}">
      ${n.auto ? `<span class="pill warn">${icon('alert', 13)} התראה</span>` : `<span class="pill">${n.to_role === 'doctor' ? 'לרופא/ה' : 'לצוות'}</span>`}
      <span class="code">${esc(n.patient_code || '')}</span><span class="grow ell">${esc(n.body)}</span><span class="muted small">${R.relTime(n.created_at)}</span></a>`;
  }

  /* ---------- מטופלים ---------- */
  R.pages.patients = async () => {
    R.loading();
    const patients = await R.getPatients(true);
    const wards = S.settings.wards || [];
    const forms = R.activeForms();
    view().innerHTML = `
      ${R.head('מטופלים במחקר', `${patients.length} מטופלים · זיהוי לפי מספר סידורי בלבד`, R.can('can_add_patients') ? `<button class="btn primary" id="newp">${icon('plus')} גיוס מטופל</button>` : '')}
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input type="search" id="q" placeholder="חיפוש מספר סידורי…" dir="ltr"></div>
          <select id="wf"><option value="">כל המחלקות</option>${wards.map(w => `<option>${esc(w)}</option>`).join('')}</select>
          <label class="switch"><input type="checkbox" id="ia"><span></span> הצגת פורשים</label>
        </div>
        <div class="table-wrap" id="pt"></div>
      </div>`;
    const draw = () => {
      const q = $('#q').value.trim().toLowerCase(), w = $('#wf').value, ia = $('#ia').checked;
      const list = patients.filter(p => (!q || p.code.toLowerCase().includes(q)) && (!w || p.ward === w) && (ia || p.active));
      $('#pt').innerHTML = list.length ? `<table><thead><tr><th>מספר סידורי</th><th>מחלקה</th><th>מין · גיל</th>
          ${forms.map(f => `<th title="${esc(f.title)}" class="c">${f.icon || ''} ${esc(f.short || '')}</th>`).join('')}
          <th>ביקור אחרון</th><th>זכאות</th><th></th></tr></thead><tbody>
          ${list.map(p => { const el = R.eligibility(p); return `<tr class="click" data-p="${p.id}"><td><b class="code">${esc(p.code)}</b>${p.active ? '' : ' ' + R.pill('פרש', '')}</td><td>${esc(p.ward || '—')}</td>
            <td>${R.sexLabel(p.sex)} · <span class="num">${R.ageNow(p.birth_month) ?? '—'}</span></td>
            ${forms.map(f => `<td class="c num">${(p.counts || {})[f.key] || '<span class="muted">·</span>'}</td>`).join('')}
            <td>${R.fmtDate(p.last_visit)}</td>
            <td>${el.status === 'ok' ? R.pill('תקין', 'good') : el.status === 'excluded' ? R.pill('אי-הכללה', 'bad') : el.status === 'partial' ? R.pill('חלקי', 'warn') : '—'}</td>
            <td>${p.open_notes ? `<span class="pill rose">${icon('message', 12)} ${p.open_notes}</span>` : ''}</td></tr>`; }).join('')}
          </tbody></table>` : R.empty('אין מטופלים להצגה', 'users');
      $$('#pt [data-p]').forEach(tr => tr.onclick = () => location.hash = '#/patient/' + tr.dataset.p);
    };
    ['input', 'change'].forEach(ev => ['#q', '#wf', '#ia'].forEach(s => $(s).addEventListener(ev, draw)));
    draw();
    if ($('#newp')) $('#newp').onclick = () => R.editPatient(null);
  };

  R.editPatient = async (p, presetCode) => {
    const isNew = !p;
    p = p || { code: presetCode || '', ward: (S.settings.wards || [])[0] || '', sex: '', birth_month: '', data: {}, active: true };
    const d = p.data || {};
    const inc = S.settings.inclusion_criteria || [], exc = S.settings.exclusion_criteria || [];
    const PF = R.patientForm();
    const body = `<form id="pfm" onsubmit="return false">
      <div class="form-grid">
        <div class="field req"><label>מספר סידורי</label><input type="text" name="code" value="${esc(p.code)}" dir="ltr"></div>
        <div class="field"><label>מחלקה</label><select name="ward">${(S.settings.wards || []).map(w => `<option ${w === p.ward ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select></div>
        <div class="field"><label>מין</label><div class="opts">
          <label class="opt"><input type="radio" name="sex" value="M" ${p.sex === 'M' ? 'checked' : ''}><span>זכר</span></label>
          <label class="opt"><input type="radio" name="sex" value="F" ${p.sex === 'F' ? 'checked' : ''}><span>נקבה</span></label></div></div>
        <div class="field"><label>חודש ושנת לידה</label><input type="month" name="birth_month" value="${esc(p.birth_month || '')}"><div class="hint">לחישוב גיל. ללא יום לידה — מצמצם זיהוי.</div></div>
      </div>
      ${inc.length || exc.length ? `<div class="subcard"><h3>${icon('checkCircle')} קריטריונים</h3><div class="form-grid">
        ${inc.length ? `<div class="field wide"><label>קריטריוני הכללה (לסמן את מה שמתקיים)</label><div class="opts">${inc.map(c => `<label class="opt"><input type="checkbox" name="_inclusion" value="${esc(c)}" ${(d._inclusion || []).includes(c) ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')}</div></div>` : ''}
        ${exc.length ? `<div class="field wide"><label>קריטריוני אי-הכללה (לסמן רק אם מתקיים)</label><div class="opts">${exc.map(c => `<label class="opt bad"><input type="checkbox" name="_exclusion" value="${esc(c)}" ${(d._exclusion || []).includes(c) ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')}</div></div>` : ''}
      </div></div>` : ''}
      ${PF.sections.map(s => { const fs = (s.fields || []).filter(f => f.active !== false); return fs.length ? `<div class="subcard"><h3>${esc(s.title)}</h3><div class="form-grid">${fs.map(f => R.fieldHtml(f, d[f.key], 'pf_')).join('')}</div></div>` : ''; }).join('')}
      ${!isNew ? `<div class="subcard"><h3>סטטוס במחקר</h3>
        <label class="switch"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><span></span> פעיל/ה במחקר</label>
        <div class="form-grid" id="wd" ${p.active ? 'hidden' : ''} style="margin-top:.8rem">
          <div class="field"><label>תאריך פרישה</label><input type="date" name="_withdrawal_date" value="${esc(d._withdrawal_date || '')}"></div>
          <div class="field"><label>סיבת פרישה</label><select name="_withdrawal_reason"><option value="">—</option>${['שחרור מאשפוז', 'ביטול הסכמה', 'העברה למוסד אחר', 'החמרה רפואית', 'פטירה', 'אחר'].map(o => `<option ${d._withdrawal_reason === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        </div></div>` : ''}
      <p class="small muted" style="margin:0">${icon('shield', 14)} אין להזין שם, ת"ז, טלפון או כל פרט מזהה. טבלת הקישור בין המספר למטופל נשמרת בנפרד, מחוץ למערכת.</p>
    </form>`;
    await R.modal(isNew ? 'גיוס מטופל חדש' : 'עריכת מטופל ' + p.code, body, [
      { id: 'save', label: 'שמירה', cls: 'primary', onClick: async (root) => {
        const f = $('#pfm', root);
        const sex = $('input[name=sex]:checked', f);
        const data = R.readFields(f, R.fields(PF, true));
        data._inclusion = $$('input[name=_inclusion]:checked', f).map(i => i.value);
        data._exclusion = $$('input[name=_exclusion]:checked', f).map(i => i.value);
        const active = isNew ? true : $('[name=active]', f).checked;
        if (!active) { data._withdrawal_date = $('[name=_withdrawal_date]', f).value || R.today(); data._withdrawal_reason = $('[name=_withdrawal_reason]', f).value; }
        const saved = await API.savePatient(S.token, { id: p.id || null, code: $('[name=code]', f).value.trim(), ward: $('[name=ward]', f).value, sex: sex ? sex.value : '', birth_month: $('[name=birth_month]', f).value, active, data });
        R.invalidate();
        R.toast('נשמר', 'good');
        if (location.hash === '#/patient/' + saved.id) route(); else location.hash = '#/patient/' + saved.id;
      } },
      { id: 'cancel', label: 'ביטול' }
    ], { wide: true, onOpen: (root) => { const a = $('[name=active]', root); if (a) a.onchange = () => { $('#wd', root).hidden = a.checked; }; } });
  };

  /* ---------- כרטיס מטופל ---------- */
  R.pages.patient = async (id) => {
    R.loading();
    const [patients, recs, notes] = await Promise.all([R.getPatients(true), API.listRecords(S.token, id), API.listNotes(S.token, id)]);
    const p = patients.find(x => x.id === id);
    if (!p) { view().innerHTML = R.empty('המטופל לא נמצא'); return; }
    const d = p.data || {};
    const el = R.eligibility(p);
    const forms = R.dataForms().filter(f => f.active || recs.some(r => r.form_type === f.key));
    const tabs = [...forms.map(f => [f.key, `${f.icon || ''} ${esc(f.short || f.title)}`, recs.filter(r => r.form_type === f.key).length]), ['_timeline', `${icon('clock', 15)} ציר זמן`, recs.length]];
    let tab = R.ss.get('rs_tab'); if (!tabs.some(t => t[0] === tab)) tab = tabs[0][0];
    const PF = R.patientForm();
    const details = R.fields(PF).filter(f => d[f.key] !== undefined && d[f.key] !== '' && f.type !== 'textarea' && !(Array.isArray(d[f.key]) && !d[f.key].length));
    view().innerHTML = `
      ${R.head(`מטופל <span class="code">${esc(p.code)}</span> ${p.active ? '' : R.pill('פרש/ה', '')}`, `${esc(p.ward || '')} · ${R.sexLabel(p.sex)} · גיל ${R.ageNow(p.birth_month) ?? '—'}`,
        R.can('can_add_patients') ? `<button class="btn" id="editp">${icon('edit')} עריכת פרטים</button>` : '', `<a href="#/patients">מטופלים</a>`)}
      <div class="patient-layout">
        <div>
          <div class="card">
            <div class="facts">
              ${details.map(f => { const v = R.normVal(f, d[f.key]); return `<div><span>${esc(f.label)}</span><b>${esc(Array.isArray(v) ? v.join(', ') : v)}${f.unit ? ' ' + esc(f.unit) : ''}</b></div>`; }).join('')}
              <div><span>זכאות</span><b>${el.status === 'ok' ? R.pill(el.text, 'good') : el.status === 'excluded' ? R.pill(el.text, 'bad') : el.status === 'partial' ? R.pill(el.text, 'warn') : '—'}</b></div>
              ${!p.active ? `<div><span>פרישה</span><b>${R.fmtDate(d._withdrawal_date)} · ${esc(d._withdrawal_reason || '')}</b></div>` : ''}
            </div>
            ${d.notes ? `<p class="small muted" style="margin:.8rem 0 0">${esc(d.notes)}</p>` : ''}
            <div class="muted small" style="margin-top:.6rem">גויס ע"י ${esc(p.created_by_name || '—')} · ${R.fmtDate(p.created_at)}</div>
          </div>
          <div class="tabs" id="tabs">${tabs.map(([k, l, n]) => `<button data-t="${k}" class="${k === tab ? 'active' : ''}">${l} <em>${n}</em></button>`).join('')}</div>
          <div id="tabc"></div>
        </div>
        <aside class="card notes-side" id="psnotes"></aside>
      </div>`;
    if ($('#editp')) $('#editp').onclick = () => R.editPatient(p);
    const drawTab = (k) => {
      R.ss.set('rs_tab', k);
      $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.t === k));
      if (k === '_timeline') {
        $('#tabc').innerHTML = `<div class="card"><h2>${icon('clock')} ציר זמן</h2>${recs.length ? `<div class="timeline">${recs.map(r => { const F = R.formOf(r.form_type); return `<a class="tl" href="#/record/${r.id}"><span class="dot">${F.icon || '•'}</span><div><div><b>${esc(F.short || F.title)}</b> · ${R.fmtDate(r.visit_date)} ${r.verified_at ? `<span class="pill good">${icon('lock', 11)} אושר</span>` : ''}</div><div class="muted small">${esc(R.summary(F, r))}</div></div></a>`; }).join('')}</div>` : R.empty('אין הזנות עדיין')}</div>`;
        return;
      }
      const F = R.formOf(k);
      const list = recs.filter(r => r.form_type === k);
      let chart = '';
      if ((F.calc || []).some(c => c.type === 'phenoage')) {
        const pts = list.filter(r => r.computed && r.computed.phenoage != null);
        if (pts.length) chart = `<div class="chart-box">${R.lineChart({ yLabel: 'שנים', series: [
          { name: 'גיל ביולוגי (PhenoAge)', color: '#127a72', points: pts.map(r => ({ x: r.visit_date, y: r.computed.phenoage })) },
          { name: 'גיל כרונולוגי', color: '#9aa8b4', dash: true, points: pts.map(r => ({ x: r.visit_date, y: Number(r.data.age) })) }] })}</div>`;
      }
      const fu = Number(F.followup_months) && p.active ? R.followups([p]).find(x => x.form.key === k) : null;
      $('#tabc').innerHTML = `<div class="card">
        <div class="row between"><h2>${F.icon || ''} ${esc(F.title)}</h2>
          <div class="row">${fu ? R.followStatus(fu) : ''}${R.canEnter(k) && p.active ? `<a class="btn primary" href="#/record/new/${p.id}/${k}">${icon('plus')} הזנה חדשה</a>` : ''}</div></div>
        ${chart}${R.recordsTable(list, {})}</div>`;
      R.bindRecordTable();
    };
    $$('#tabs button').forEach(b => b.onclick = () => drawTab(b.dataset.t));
    drawTab(tab);
    R.renderNotes($('#psnotes'), notes, { patient_id: p.id, title: 'הערות על המטופל' });
  };

  /* ---------- טבלת הזנות ---------- */
  R.recordsTable = (list, opt) => {
    if (!list.length) return R.empty('אין הזנות עדיין');
    return `<div class="table-wrap"><table><thead><tr>
        ${opt.showPatient ? '<th>מטופל</th>' : ''}${opt.showPatient ? '<th>טופס</th>' : ''}<th>תאריך</th><th>תקציר</th><th>הוזן ע"י</th><th>סטטוס</th><th></th></tr></thead><tbody>
      ${list.map(r => {
        const F = R.formOf(r.form_type);
        return `<tr>
          ${opt.showPatient ? `<td><a href="#/patient/${r.patient_id}" class="code">${esc(r.patient_code)}</a></td><td>${F.icon || ''} ${esc(F.short || F.title)}</td>` : ''}
          <td class="nowrap">${R.fmtDate(r.visit_date)}</td>
          <td>${esc(R.summary(F, r))}${(r.computed && r.computed._alerts || []).length ? ` <span class="pill warn" title="${esc(r.computed._alerts.join(' · '))}">${icon('alert', 12)} ${r.computed._alerts.length}</span>` : ''}</td>
          <td class="small">${esc(r.created_by_name || '—')}<div class="muted">${R.relTime(r.created_at)}</div></td>
          <td>${r.verified_at ? `<span class="pill good" title="${esc(r.verified_by_name || '')} · ${R.fmtDateTime(r.verified_at)}">${icon('lock', 11)} אושר</span>` : r.updated_at ? `<span class="pill">נערך</span>` : ''}</td>
          <td class="actions"><a class="btn sm" href="#/record/${r.id}">${R.canEditRec(r) ? icon('edit', 14) + ' עריכה' : icon('eye', 14) + ' צפייה'}</a>
            ${R.canDeleteRec(r) ? `<button class="btn sm danger icon-only" data-del="${r.id}" title="מחיקה">${icon('trash', 14)}</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  };
  R.bindRecordTable = () => {
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (!(await R.confirm('למחוק את ההזנה? (המחיקה נרשמת ביומן)', 'מחיקה', true))) return;
      try { await API.deleteRecord(S.token, b.dataset.del); R.invalidate(); R.toast('נמחק'); route(); } catch (e) { R.fail(e); }
    });
  };

  /* ---------- הערות (רכיב) ---------- */
  R.renderNotes = (box, notes, ctx) => {
    const roots = notes.filter(n => !n.parent_id && (!ctx.record_id || n.record_id === ctx.record_id)).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || new Date(b.created_at) - new Date(a.created_at));
    const replies = (id) => notes.filter(n => n.parent_id === id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    box.innerHTML = `<h2>${icon('message')} ${esc(ctx.title || 'הערות')}</h2>
      <form class="note-new" data-new>
        <textarea placeholder="${R.isDoctor() ? 'הערה / הנחיה לצוות…' : 'שאלה או הערה לרופא/ה…'}" required></textarea>
        <div class="row between"><select class="sm" data-to>${R.isDoctor() ? '<option value="team">לצוות</option><option value="doctor">לרופאים</option>' : '<option value="doctor">לרופא/ה</option><option value="team">לצוות</option>'}</select>
          <button class="btn primary sm">${icon('send', 14)} שליחה</button></div>
      </form>
      <div class="threads">${roots.map(n => R.threadHtml(n, replies(n.id), ctx)).join('') || '<div class="muted small" style="padding:.6rem 0">אין הערות עדיין</div>'}</div>`;
    R.bindThreads(box, async () => R.renderNotes(box, await API.listNotes(S.token, ctx.patient_id), ctx), ctx);
  };
  R.threadHtml = (n, reps, ctx = {}) => `<div class="thread ${n.status}" data-thread="${n.id}">
      <div class="th-head">${n.auto ? `<span class="pill warn">${icon('alert', 12)} התראה אוטומטית</span>` : `<span class="pill">${n.to_role === 'doctor' ? 'לרופא/ה' : 'לצוות'}</span>`}
        ${!ctx.patient_id && n.patient_code ? `<a href="#/patient/${n.patient_id}" class="code">${esc(n.patient_code)}</a>` : ''}
        ${n.record_id && n.record_form ? `<a href="#/record/${n.record_id}" class="small">${esc(R.formOf(n.record_form).short || '')} ${R.fmtDate(n.record_date)}</a>` : ''}
        <span class="grow"></span>${n.status === 'resolved' ? `<span class="pill good">${icon('check', 11)} טופל</span>` : ''}</div>
      <div class="msg"><div class="who">${esc(n.created_by_name || '')} <span class="muted">· ${R.relTime(n.created_at)}</span></div><div class="txt">${esc(n.body)}</div></div>
      ${reps.map(r => `<div class="msg reply ${r.created_by_role === 'doctor' ? 'doc' : ''}"><div class="who">${esc(r.created_by_name || '')}${r.created_by_role === 'doctor' ? ' ' + R.pill('רופא/ה', 'brand') : ''} <span class="muted">· ${R.relTime(r.created_at)}</span></div><div class="txt">${esc(r.body)}</div></div>`).join('')}
      <form class="reply-form" data-reply="${n.id}"><input type="text" placeholder="תגובה…" required><button class="btn sm">${icon('send', 14)}</button>
        ${R.canResolveNote(n) ? `<button type="button" class="btn sm ${n.status === 'open' ? 'good' : ''}" data-status="${n.status === 'open' ? 'resolved' : 'open'}">${n.status === 'open' ? icon('check', 14) + ' טופל' : 'פתיחה מחדש'}</button>` : ''}</form>
    </div>`;
  R.bindThreads = (box, reload, ctx = {}) => {
    const nf = $('[data-new]', box);
    if (nf) nf.onsubmit = async (e) => {
      e.preventDefault();
      try { await API.addNote(S.token, { patient_id: ctx.patient_id || null, record_id: ctx.record_id || null, to_role: $('[data-to]', nf).value, body: $('textarea', nf).value }); R.toast('ההערה נשלחה', 'good'); await reload(); R.refreshBadges(); } catch (er) { R.fail(er); }
    };
    $$('[data-reply]', box).forEach(f => {
      f.onsubmit = async (e) => { e.preventDefault(); try { await API.addNote(S.token, { parent_id: f.dataset.reply, body: $('input', f).value }); await reload(); R.refreshBadges(); } catch (er) { R.fail(er); } };
      const st = $('[data-status]', f);
      if (st) st.onclick = async () => { try { await API.setNoteStatus(S.token, f.dataset.reply, st.dataset.status); await reload(); R.refreshBadges(); } catch (er) { R.fail(er); } };
    });
  };

  /* ---------- עורך הזנה ---------- */
  R.pages.record = async (a, b, c) => {
    R.loading();
    let rec = null, patientId = b, formType = c;
    const patients = await R.getPatients(true);
    if (a !== 'new') {
      rec = (await API.listRecords(S.token)).find(r => r.id === a);
      if (!rec) { view().innerHTML = R.empty('ההזנה לא נמצאה'); return; }
      patientId = rec.patient_id; formType = rec.form_type;
    }
    const F = R.formOf(formType);
    const p = patients.find(x => x.id === patientId);
    if (!p || !F.sections.length) { view().innerHTML = R.empty('טופס או מטופל לא תקינים'); return; }
    const readonly = rec ? !R.canEditRec(rec) : !R.canEnter(formType);
    const data = rec ? rec.data || {} : {};
    const fields = R.fields(F);
    const archived = rec ? R.fields(F, true).filter(f => f.active === false && data[f.key] !== undefined) : [];
    const hasPheno = (F.calc || []).some(x => x.type === 'phenoage');

    view().innerHTML = `
      ${R.head(`${F.icon || ''} ${esc(F.title)}`, `${rec ? 'עריכת הזנה' : 'הזנה חדשה'} · מטופל <span class="code">${esc(p.code)}</span> · ${esc(p.ward || '')}`, '', `<a href="#/patients">מטופלים</a> › <a href="#/patient/${p.id}">${esc(p.code)}</a>`)}
      ${rec && rec.verified_at ? `<div class="alert good">${icon('lock')}<span>ההזנה אושרה ונעולה ע"י ${esc(rec.verified_by_name || '')} · ${R.fmtDateTime(rec.verified_at)}</span>${R.can('can_verify') ? '<button class="btn sm" id="unverify">ביטול אישור</button>' : ''}</div>` : ''}
      <div class="editor-layout">
        <form id="rf" onsubmit="return false">
          ${F.description ? `<div class="alert info">${icon('clipboard')}<span>${esc(F.description)}</span></div>` : ''}
          <fieldset><legend>פרטי ביקור</legend><div class="form-grid">
            <div class="field req"><label for="visit_date">תאריך הבדיקה / ההערכה</label><input type="date" id="visit_date" value="${esc(rec ? rec.visit_date : R.today())}" max="${R.today()}"></div>
          </div></fieldset>
          ${F.sections.map(s => { const fs = (s.fields || []).filter(f => f.active !== false); return fs.length ? `<fieldset><legend>${esc(s.title)}</legend><div class="form-grid">${fs.map(f => R.fieldHtml(f, data[f.key])).join('')}</div></fieldset>` : ''; }).join('')}
          ${archived.length ? `<fieldset class="archived"><legend>שדות שהוסרו מהטופס (נתונים קיימים)</legend><div class="form-grid">${archived.map(f => `<div class="field"><label>${esc(f.label)}</label><div>${esc(Array.isArray(data[f.key]) ? data[f.key].join(', ') : data[f.key])}</div></div>`).join('')}</div></fieldset>` : ''}
          <div class="row sticky-actions">
            ${readonly ? `<span class="muted">${icon('eye')} צפייה בלבד${rec && rec.verified_at ? ' — ההזנה נעולה' : ''}</span>` : `<button class="btn primary" id="save">${icon('check')} שמירה</button><button class="btn" id="saveNew">שמירה והזנה נוספת</button>`}
            ${rec && !rec.verified_at && R.can('can_verify') ? `<button class="btn good" id="verify">${icon('lock')} אישור ונעילה</button>` : ''}
            <a class="btn ghost" href="#/patient/${p.id}">חזרה</a>
          </div>
          ${rec ? `<p class="small muted">הוזן ע"י ${esc(rec.created_by_name || '')} · ${R.fmtDateTime(rec.created_at)}${rec.updated_at ? ` · עודכן ע"י ${esc(rec.updated_by_name || '')} · ${R.fmtDateTime(rec.updated_at)}` : ''}</p>` : ''}
        </form>
        <aside class="side-col">
          <div class="card computed" id="comp"></div>
          ${rec ? '<div class="card" id="rnotes"></div>' : ''}
        </aside>
      </div>`;
    const form = $('#rf');
    if (readonly) $$('input, select, textarea', form).forEach(i => i.disabled = true);

    const ageField = fields.find(f => f.autoAge);
    const ageInput = ageField && $(`[name="${ageField.key}"]`, form);
    let ageTouched = !!(rec && ageField && data[ageField.key] !== undefined);
    if (ageInput) {
      ageInput.addEventListener('input', () => { ageTouched = true; });
      const box = ageInput.closest('.field');
      if (!$('.hint', box)) box.insertAdjacentHTML('beforeend', '<div class="hint"></div>');
      const setAge = () => {
        const a2 = PhenoAge.ageAt(p.birth_month, $('#visit_date').value);
        $('.hint', box).textContent = a2 !== null ? `מחושב מחודש לידה ${p.birth_month}: ${a2}` : 'לא הוזן חודש לידה למטופל — להקליד גיל ידנית';
        if (a2 !== null && !ageTouched && !readonly) ageInput.value = a2;
      };
      $('#visit_date').addEventListener('change', setAge);
      setAge();
    }

    const update = () => {
      const d = R.readFields(form, fields);
      const c = R.compute(F, d);
      const al = R.alertsFor(F, d, c);
      R.checkRanges(form);
      let html = `<h3>${icon('activity')} חישוב אוטומטי</h3>`;
      if (hasPheno) {
        if (c.phenoage != null) {
          html += `<div class="muted small">גיל ביולוגי (PhenoAge)</div><div class="big num">${c.phenoage}</div>
            <div class="line"><span>גיל כרונולוגי</span><b class="num">${d.age}</b></div>
            <div class="line"><span>פער</span>${R.accelPill(c.acceleration)}</div>
            <div class="line"><span>סיכון מודל 10 שנים</span><b class="num">${c.mortality_10y}%</b></div>`;
        } else {
          const req = PhenoAge.REQUIRED.filter(k => d[k] === undefined);
          const lab = Object.fromEntries(R.fields(F, true).map(f => [f.key, f.label]));
          html += `<p class="muted small">חסרים ${req.length} ערכים לחישוב:</p><div class="pills">${req.map(k => R.pill(lab[k] || k, 'warn')).join('')}</div>`;
        }
        if (c.bmi) html += `<div class="line"><span>BMI</span><b class="num">${c.bmi}</b></div>`;
      } else {
        const L = R.computedLabels(F);
        const ent = Object.entries(c).filter(([k]) => L[k]);
        html += ent.length ? ent.map(([k, v]) => `<div class="line"><span>${esc(L[k])}</span><b>${esc(v)}</b></div>`).join('') : `<p class="muted small">${(F.calc || []).length ? 'יחושב לאחר מילוי הפריטים' : 'אין חישוב בטופס זה'}</p>`;
      }
      if (al.length) html += `<div class="alert warn" style="margin-top:.8rem">${icon('alert')}<div><b>יישלח לרופא/ה:</b><br>${al.map(esc).join('<br>')}</div></div>`;
      $('#comp').innerHTML = html;
    };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();

    if (rec) {
      const box = $('#rnotes');
      const load = async () => R.renderNotes(box, await API.listNotes(S.token, p.id), { patient_id: p.id, record_id: rec.id, title: 'הערות על ההזנה' });
      load();
    }

    const save = async (again) => {
      const vd = $('#visit_date').value;
      if (!vd) return R.toast('חובה להזין תאריך', 'bad');
      const d = R.readFields(form, fields);
      for (const f of archived) d[f.key] = data[f.key];
      const missing = fields.filter(f => f.required && d[f.key] === undefined);
      const bad = R.checkRanges(form);
      if (bad && !(await R.confirm(`יש ${bad} ערכים מחוץ לטווח הסביר (מסומנים בכתום). ייתכן שגיאת יחידות. לשמור בכל זאת?`, 'שמירה בכל זאת'))) return;
      if (missing.length && !(await R.confirm(`חסרים ${missing.length} שדות חובה (${missing.map(f => f.label).join(', ')}). לשמור בכל זאת?`, 'שמירה חלקית'))) return;
      if (!rec && (await API.listRecords(S.token, p.id, formType)).some(r => r.visit_date === vd) && !(await R.confirm('כבר קיימת הזנה מטופס זה לאותו תאריך. ליצור הזנה נוספת?', 'כן, ליצור'))) return;
      const computed = R.compute(F, d);
      const alerts = R.alertsFor(F, d, computed);
      if (alerts.length) computed._alerts = alerts;
      $$('#save, #saveNew').forEach(x => x.disabled = true);
      try {
        const saved = await API.saveRecord(S.token, { id: rec ? rec.id : null, patient_id: p.id, form_type: formType, visit_date: vd, data: d, computed });
        const prev = rec && rec.computed && rec.computed._alerts || [];
        const fresh = alerts.filter(m => !prev.includes(m));
        if (fresh.length && S.settings.alerts_enabled !== false) {
          await API.addNote(S.token, { patient_id: p.id, record_id: saved.id, to_role: 'doctor', auto: true, body: `${F.short || F.title} ${R.fmtDate(vd)}: ${fresh.join(' · ')}` });
          R.toast('נשלחה התראה לרופא/ה', 'good');
        }
        R.toast('נשמר בהצלחה', 'good');
        R.invalidate(); R.refreshBadges();
        if (again) { if (a === 'new') route(); else location.hash = `#/record/new/${p.id}/${formType}`; }
        else location.hash = '#/patient/' + p.id;
      } catch (e) { R.fail(e); $$('#save, #saveNew').forEach(x => x.disabled = false); }
    };
    if ($('#save')) $('#save').onclick = () => save(false);
    if ($('#saveNew')) $('#saveNew').onclick = () => save(true);
    const verify = async (v) => { try { await API.verifyRecord(S.token, rec.id, v); R.toast(v ? 'ההזנה אושרה וננעלה' : 'האישור בוטל', 'good'); R.invalidate(); route(); } catch (e) { R.fail(e); } };
    if ($('#verify')) $('#verify').onclick = async () => { if (await R.confirm('לאשר את ההזנה? לאחר האישור לא ניתן לערוך או למחוק אותה.', 'אישור ונעילה')) verify(true); };
    if ($('#unverify')) $('#unverify').onclick = () => verify(false);
  };

  /* ---------- מעקב ביקורים ---------- */
  R.pages.followup = async () => {
    R.loading();
    const rows = R.followups(await R.getPatients(true));
    const forms = R.activeForms().filter(f => Number(f.followup_months));
    view().innerHTML = `
      ${R.head('מעקב ביקורים', forms.map(f => `${f.icon || ''} ${esc(f.short)} — כל ${f.followup_months} חודשים`).join(' · ') || 'לא הוגדרו תדירויות מעקב (ניהול → טפסים)')}
      <div class="card">
        <div class="toolbar">
          <div class="seg" id="seg">${[['due', 'דורש טיפול'], ['soon', 'בקרוב'], ['all', 'הכול']].map(([k, l], i) => `<button data-s="${k}" class="${i ? '' : 'active'}">${l}</button>`).join('')}</div>
          <select id="ff"><option value="">כל הטפסים</option>${forms.map(f => `<option value="${f.key}">${esc(f.short)}</option>`).join('')}</select>
        </div>
        <div id="fl"></div>
      </div>`;
    let seg = 'due';
    const draw = () => {
      const ff = $('#ff').value;
      const list = rows.filter(r => (!ff || r.form.key === ff) && (seg === 'all' || (seg === 'due' ? ['never', 'overdue'].includes(r.status) : r.status === 'soon')));
      $('#fl').innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>מטופל</th><th>מחלקה</th><th>טופס</th><th>ביקור אחרון</th><th>מועד הבא</th><th>סטטוס</th><th></th></tr></thead><tbody>
        ${list.map(r => `<tr><td><a href="#/patient/${r.patient.id}" class="code">${esc(r.patient.code)}</a></td><td>${esc(r.patient.ward || '')}</td><td>${r.form.icon || ''} ${esc(r.form.short)}</td>
          <td>${R.fmtDate(r.last)}</td><td>${R.fmtDate(r.due)}</td><td>${R.followStatus(r)}</td>
          <td class="actions">${R.canEnter(r.form.key) ? `<a class="btn sm primary" href="#/record/new/${r.patient.id}/${r.form.key}">${icon('plus', 14)} הזנה</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : R.empty('אין ביקורים בקטגוריה זו', 'checkCircle');
    };
    $$('#seg button').forEach(b => b.onclick = () => { seg = b.dataset.s; $$('#seg button').forEach(x => x.classList.toggle('active', x === b)); draw(); });
    $('#ff').onchange = draw;
    draw();
  };

  /* ---------- הערות ---------- */
  R.pages.notes = async () => {
    R.loading();
    const all = await API.listNotes(S.token);
    const myRole = S.user.role === 'staff' ? 'team' : 'doctor';
    view().innerHTML = `
      ${R.head('הערות ושאלות', R.isDoctor() ? 'שאלות מהצוות והתראות אוטומטיות על ערכים חריגים' : 'תקשורת בין הצוות לרופאים המשתתפים במחקר')}
      <div class="card">
        <div class="toolbar">
          <div class="seg" id="sst">${[['open', 'פתוחות'], ['resolved', 'טופלו'], ['all', 'הכול']].map(([k, l], i) => `<button data-s="${k}" class="${i ? '' : 'active'}">${l}</button>`).join('')}</div>
          <div class="seg" id="sto">${[['mine', R.isAdmin() ? 'הכול' : 'אליי'], ['doctor', 'לרופאים'], ['team', 'לצוות'], ['auto', 'התראות']].map(([k, l], i) => `<button data-s="${k}" class="${i ? '' : 'active'}">${l}</button>`).join('')}</div>
        </div>
        <div id="nl" class="threads"></div>
      </div>`;
    let st = 'open', to = 'mine';
    const draw = (notes) => {
      const roots = notes.filter(n => !n.parent_id
        && (st === 'all' || n.status === st)
        && (to === 'mine' ? (R.isAdmin() || n.to_role === myRole || n.created_by === S.user.id) : to === 'auto' ? n.auto : n.to_role === to));
      $('#nl').innerHTML = roots.map(n => R.threadHtml(n, notes.filter(r => r.parent_id === n.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)))).join('') || R.empty('אין הערות להצגה', 'message');
      R.bindThreads($('#nl'), async () => draw(await API.listNotes(S.token)));
    };
    $$('#sst button').forEach(b => b.onclick = () => { st = b.dataset.s; $$('#sst button').forEach(x => x.classList.toggle('active', x === b)); draw(all); });
    $$('#sto button').forEach(b => b.onclick = () => { to = b.dataset.s; $$('#sto button').forEach(x => x.classList.toggle('active', x === b)); draw(all); });
    draw(all);
  };

  /* ---------- ההזנות שלי ---------- */
  R.pages.mine = async () => {
    R.loading();
    const recs = (await R.getRecords(true)).filter(r => r.created_by === S.user.id);
    view().innerHTML = `${R.head('ההזנות שלי', `${recs.length} הזנות`)}<div class="card">${R.recordsTable(recs, { showPatient: true })}</div>`;
    R.bindRecordTable();
  };

  /* ---------- סיסמה ---------- */
  R.pages.password = () => {
    view().innerHTML = `${R.head('החלפת סיסמה', '')}<div class="card" style="max-width:460px">
      <form id="cp"><div class="field"><label>סיסמה נוכחית</label><input type="password" id="o" required dir="ltr"></div>
      <div class="field"><label>סיסמה חדשה (8 תווים לפחות)</label><input type="password" id="n1" minlength="8" required dir="ltr"></div>
      <div class="field"><label>אימות</label><input type="password" id="n2" required dir="ltr"></div>
      <button class="btn primary">עדכון</button></form></div>`;
    $('#cp').onsubmit = async (e) => {
      e.preventDefault();
      if ($('#n1').value !== $('#n2').value) return R.toast('הסיסמאות אינן תואמות', 'bad');
      try { await API.changePassword(S.token, $('#o').value, $('#n1').value); R.toast('הסיסמה עודכנה', 'good'); location.hash = '#/home'; } catch (ex) { R.fail(ex); }
    };
  };

  /* ------------------------------ התחלה ------------------------------ */
  R.boot = async () => {
    const t = R.ss.get('rs_token');
    if (!t || !API.CONFIGURED) return renderLogin();
    try { S.token = t; afterAuth(await API.me(t)); }
    catch (e) { S.token = null; R.ss.del('rs_token'); renderLogin(); }
  };
})();
