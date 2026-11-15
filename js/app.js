/* =====================================================================
 *  מערכת מחקר מחלקתי — ממשק משתמש
 * ===================================================================== */
(function () {
  'use strict';

  const S = { token: null, user: null, settings: {}, patients: null };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const view = () => $('#view');

  /* ------------------------------ אחסון סשן ------------------------------ */
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  /* ------------------------------ עזרים ------------------------------ */
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    $('#toast').appendChild(el);
    setTimeout(() => el.remove(), kind === 'bad' ? 5000 : 2800);
  }
  function fail(err) {
    console.error(err);
    if (err && err.code === 'NOT_AUTHENTICATED') { doLogout(true); return; }
    toast(API.message(err), 'bad');
  }
  function fmtDate(d) {
    if (!d) return '—';
    const x = new Date(d);
    if (isNaN(x)) return esc(d);
    return x.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtDateTime(d) {
    if (!d) return '—';
    const x = new Date(d);
    return x.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + x.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const isAdmin = () => S.user && S.user.role === 'admin';
  const can = (perm) => isAdmin() || (S.user && !!S.user[perm]);
  const canForm = (f) => isAdmin() || (S.user && (S.user.forms || []).includes(f));
  const canEditRow = (row) => isAdmin() || can('can_edit_others') || (row && row.created_by === S.user.id);
  const sexLabel = (s) => s === 'M' ? 'זכר' : s === 'F' ? 'נקבה' : '—';
  const accelPill = (a) => {
    if (a === null || a === undefined || a === '') return '<span class="muted">—</span>';
    const cls = a > 5 ? 'bad' : a > 0 ? 'warn' : 'good';
    return `<span class="pill ${cls} num">${esc(fmtSigned(a))}</span>`;
  };
  function ageNow(bm) { return bm ? PhenoAge.ageAt(bm, today()) : null; }
  function genPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const a = new Uint32Array(10); crypto.getRandomValues(a);
    return Array.from(a, n => chars[n % chars.length]).join('');
  }

  function modal(title, bodyHtml, buttons) {
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'modal-back';
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
          <div class="mh"><h2>${esc(title)}</h2><button class="ghost" data-x aria-label="סגור">✕</button></div>
          <div class="mb">${bodyHtml}</div>
          <div class="mf">${(buttons || [{ id: 'ok', label: 'אישור', cls: 'primary' }]).map(b => `<button data-b="${b.id}" class="${b.cls || ''}">${esc(b.label)}</button>`).join('')}</div>
        </div>`;
      document.body.appendChild(back);
      const close = (v) => { back.remove(); resolve(v); };
      back.addEventListener('click', async (e) => {
        if (e.target === back || e.target.closest('[data-x]')) return close(null);
        const b = e.target.closest('[data-b]');
        if (!b) return;
        const def = (buttons || []).find(x => x.id === b.dataset.b);
        if (def && def.onClick) {
          b.disabled = true;
          try { const r = await def.onClick(back); if (r !== false) close(b.dataset.b); }
          catch (err) { fail(err); }
          finally { b.disabled = false; }
        } else close(b.dataset.b);
      });
      const first = back.querySelector('input, select, textarea');
      if (first) setTimeout(() => first.focus(), 30);
    });
  }
  const confirmBox = (msg, okLabel = 'אישור', danger) =>
    modal('אישור', `<p>${esc(msg)}</p>`, [{ id: 'ok', label: okLabel, cls: danger ? 'danger' : 'primary' }, { id: 'cancel', label: 'ביטול' }]).then(v => v === 'ok');

  /* ------------------------------ רינדור שדות ------------------------------ */
  function fieldHtml(f, value, prefix = '') {
    const id = prefix + f.key;
    const req = f.required ? ' req' : '';
    const wide = (f.type === 'textarea' || f.type === 'checks' || (f.type === 'score' && f.options.length > 3)) ? ' wide' : '';
    let input = '';
    const v = value === undefined || value === null ? '' : value;
    switch (f.type) {
      case 'number':
        input = `<div class="with-unit"><input type="number" inputmode="decimal" id="${id}" name="${f.key}" value="${esc(v)}"
                 ${f.step ? `step="${f.step}"` : 'step="any"'} data-min="${f.min ?? ''}" data-max="${f.max ?? ''}">
                 ${f.unit ? `<span class="unit">${esc(f.unit)}</span>` : ''}</div>`;
        if (!f.unit) input = `<input type="number" inputmode="decimal" id="${id}" name="${f.key}" value="${esc(v)}" step="${f.step || 'any'}" data-min="${f.min ?? ''}" data-max="${f.max ?? ''}">`;
        break;
      case 'text': input = `<input type="text" id="${id}" name="${f.key}" value="${esc(v)}">`; break;
      case 'date': input = `<input type="date" id="${id}" name="${f.key}" value="${esc(v)}">`; break;
      case 'textarea': input = `<textarea id="${id}" name="${f.key}">${esc(v)}</textarea>`; break;
      case 'select':
        input = `<select id="${id}" name="${f.key}"><option value="">— בחר —</option>${f.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        break;
      case 'radio':
      case 'yesno': {
        const opts = f.type === 'yesno' ? ['כן', 'לא'] : f.options;
        input = `<div class="opts">${opts.map(o => `<label class="opt"><input type="radio" name="${f.key}" value="${esc(o)}" ${o === v ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div>`;
        break;
      }
      case 'score':
        input = `<div class="opts">${f.options.map(([lbl]) => `<label class="opt"><input type="radio" name="${f.key}" value="${esc(lbl)}" ${lbl === v ? 'checked' : ''}>${esc(lbl)}</label>`).join('')}</div>`;
        break;
      case 'checks': {
        const arr = Array.isArray(v) ? v : [];
        input = `<div class="opts">${f.options.map(o => `<label class="opt"><input type="checkbox" name="${f.key}" value="${esc(o)}" ${arr.includes(o) ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div>`;
        break;
      }
    }
    return `<div class="field${req}${wide}" data-field="${f.key}">
      <label for="${id}">${esc(f.label)}</label>${input}
      ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}<div class="warn" hidden></div></div>`;
  }

  function readFields(root, fields) {
    const out = {};
    for (const f of fields) {
      if (f.type === 'checks') {
        out[f.key] = $$(`input[name="${f.key}"]:checked`, root).map(i => i.value);
      } else if (['radio', 'yesno', 'score'].includes(f.type)) {
        const c = $(`input[name="${f.key}"]:checked`, root);
        out[f.key] = c ? c.value : '';
      } else {
        const el = $(`[name="${f.key}"]`, root);
        if (!el) continue;
        if (f.type === 'number') out[f.key] = el.value === '' ? '' : Number(el.value);
        else out[f.key] = el.value.trim();
      }
    }
    // מחיקת ריקים
    for (const k of Object.keys(out)) if (out[k] === '' || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
    return out;
  }

  function checkRanges(root) {
    let bad = 0;
    $$('input[type=number]', root).forEach(inp => {
      const box = inp.closest('.field'); const w = box && $('.warn', box);
      const v = inp.value === '' ? null : Number(inp.value);
      const min = inp.dataset.min === '' ? null : Number(inp.dataset.min);
      const max = inp.dataset.max === '' ? null : Number(inp.dataset.max);
      const out = v !== null && ((min !== null && v < min) || (max !== null && v > max));
      inp.classList.toggle('out-of-range', out);
      if (w) { w.hidden = !out; w.textContent = out ? `ערך חריג (טווח סביר ${min}–${max}). לבדוק יחידות.` : ''; }
      if (out) bad++;
    });
    return bad;
  }

  /* ------------------------------ שלד ------------------------------ */
  function shell() {
    const nav = [
      ['#/home', 'ראשי'],
      ['#/patients', 'מטופלים'],
      ['#/mine', 'ההזנות שלי']
    ];
    if (can('can_view_stats')) nav.push(['#/admin', 'התקדמות המחקר']);
    if (isAdmin()) nav.push(['#/admin/staff', 'ניהול צוות'], ['#/admin/settings', 'הגדרות'], ['#/admin/audit', 'יומן פעולות']);
    if (can('can_export')) nav.push(['#/export', 'ייצוא לאקסל']);
    document.body.innerHTML = `
      ${API.DEMO ? `<div class="demo-banner"><b>מצב הדגמה</b><span>הנתונים נשמרים רק בדפדפן הזה. לחיבור אמיתי — למלא את js/config.js (ראו README).</span>
        ${isAdmin() ? '<button id="seed">טען נתוני דוגמה</button><button id="reset" class="danger">אפס הדגמה</button>' : ''}</div>` : ''}
      <header class="topbar">
        <div class="title">🔬 ${esc(S.settings.study_name || 'מחקר מחלקתי')}</div>
        <nav>${nav.map(([h, l]) => `<a href="${h}" data-nav="${h}">${l}</a>`).join('')}</nav>
        <div class="who"><span>${esc(S.user.full_name)}${isAdmin() ? ' · מנהל' : ''}</span>
          <a href="#/password" style="color:#c3d0dc">סיסמה</a><button id="logout" class="sm">יציאה</button></div>
      </header>
      <main id="view"></main><div id="toast"></div>`;
    $('#logout').onclick = () => doLogout();
    if ($('#seed')) $('#seed').onclick = () => { API.seedDemo(); S.patients = null; toast('נטענו נתוני דוגמה', 'good'); route(); };
    if ($('#reset')) $('#reset').onclick = async () => { if (await confirmBox('למחוק את כל נתוני ההדגמה?', 'אפס', true)) { API.resetDemo(); ss.del('rs_token'); location.hash = ''; location.reload(); } };
  }
  function markNav() {
    const h = location.hash || '#/home';
    $$('[data-nav]').forEach(a => {
      const n = a.dataset.nav;
      a.classList.toggle('active', h === n || (n !== '#/admin' && h.startsWith(n + '/')) || (n === '#/patients' && h.startsWith('#/patient')));
    });
  }
  const loading = () => { view().innerHTML = '<div class="spinner"></div>'; };

  /* ------------------------------ התחברות ------------------------------ */
  function renderLogin(errMsg) {
    document.body.innerHTML = `
      <div class="login-wrap"><form class="login-card" id="lf" autocomplete="on">
        <div style="font-size:2rem">🔬</div>
        <h1>מערכת מחקר מחלקתי</h1>
        <p class="muted small" style="margin-top:-.3rem">כניסה לצוות המחקר</p>
        ${errMsg ? `<div class="err">${esc(errMsg)}</div>` : ''}
        ${API.DEMO ? `<div class="err" style="background:var(--warn-soft);color:#7a3e06">מצב הדגמה · כניסה ראשונה: <b>admin</b> / <b>ChangeMe123!</b></div>` : ''}
        <div class="field"><label for="u">שם משתמש</label><input type="text" id="u" autocomplete="username" required></div>
        <div class="field"><label for="p">סיסמה</label><input type="password" id="p" autocomplete="current-password" required></div>
        <button class="primary" style="width:100%;justify-content:center;padding:.7rem">כניסה</button>
        <p class="muted small" style="margin-bottom:0">שכחת סיסמה? פנה למנהל המחקר לאיפוס.</p>
      </form></div><div id="toast"></div>`;
    $('#u').focus();
    $('#lf').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#lf button'); btn.disabled = true;
      try {
        const r = await API.login($('#u').value, $('#p').value);
        S.token = r.token; S.user = r.user; S.settings = r.settings || {};
        ss.set('rs_token', r.token);
        afterLogin();
      } catch (err) { renderLogin(API.message(err)); }
    };
  }

  function afterLogin() {
    if (S.user.must_change_password) return renderForcePassword();
    shell();
    if (!location.hash || location.hash === '#/login') location.hash = '#/home';
    route();
  }

  function renderForcePassword() {
    document.body.innerHTML = `
      <div class="login-wrap"><form class="login-card" id="pf">
        <h1>החלפת סיסמה</h1>
        <p class="muted small">זו כניסה ראשונה (או שהסיסמה אופסה). יש לבחור סיסמה אישית — לפחות 8 תווים.</p>
        <div class="err" id="perr" hidden></div>
        <div class="field"><label>סיסמה נוכחית (זמנית)</label><input type="password" id="o" required></div>
        <div class="field"><label>סיסמה חדשה</label><input type="password" id="n1" minlength="8" required></div>
        <div class="field"><label>אימות סיסמה חדשה</label><input type="password" id="n2" minlength="8" required></div>
        <button class="primary" style="width:100%;justify-content:center">שמירה והמשך</button>
      </form></div><div id="toast"></div>`;
    $('#pf').onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#perr');
      if ($('#n1').value !== $('#n2').value) { err.hidden = false; err.textContent = 'הסיסמאות אינן תואמות'; return; }
      if ($('#n1').value === $('#o').value) { err.hidden = false; err.textContent = 'הסיסמה החדשה חייבת להיות שונה מהזמנית'; return; }
      try {
        await API.changePassword(S.token, $('#o').value, $('#n1').value);
        S.user.must_change_password = false;
        toast('הסיסמה עודכנה', 'good');
        afterLogin();
      } catch (ex) { err.hidden = false; err.textContent = API.message(ex); }
    };
  }

  async function doLogout(expired) {
    try { if (S.token) await API.logout(S.token); } catch (e) { /* ignore */ }
    S.token = null; S.user = null; S.patients = null; ss.del('rs_token');
    location.hash = '#/login';
    renderLogin(expired ? 'פג תוקף ההתחברות — יש להתחבר מחדש' : null);
  }

  /* ניתוק אוטומטי בהיעדר פעילות */
  let idleTimer = null;
  function resetIdle() {
    clearTimeout(idleTimer);
    const mins = (window.APP_CONFIG && APP_CONFIG.IDLE_LOGOUT_MINUTES) || 20;
    idleTimer = setTimeout(() => { if (S.token) { doLogout(); toast('נותקת אוטומטית בגלל חוסר פעילות'); } }, mins * 60e3);
  }
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true }));

  /* ------------------------------ ניתוב ------------------------------ */
  async function route() {
    if (!S.token) return renderLogin();
    if (!$('#view')) shell();
    resetIdle();
    markNav();
    window.scrollTo(0, 0);
    const h = (location.hash || '#/home').slice(2).split('/');
    try {
      switch (h[0]) {
        case 'home': return await pageHome();
        case 'patients': return await pagePatients();
        case 'patient': return await pagePatient(h[1]);
        case 'record': return h[1] === 'new' ? await pageRecord(null, h[2], h[3]) : await pageRecord(h[1]);
        case 'mine': return await pageMine();
        case 'password': return pagePassword();
        case 'admin':
          if (!h[1]) return await pageDashboard();
          if (h[1] === 'staff') return await pageStaff();
          if (h[1] === 'settings') return pageSettings();
          if (h[1] === 'audit') return await pageAudit();
          break;
        case 'export': return pageExport();
      }
      location.hash = '#/home';
    } catch (err) { fail(err); }
  }
  window.addEventListener('hashchange', route);

  async function getPatients(force) {
    if (!S.patients || force) S.patients = await API.listPatients(S.token);
    return S.patients;
  }

  /* ------------------------------ ראשי ------------------------------ */
  async function pageHome() {
    loading();
    const [patients, recs] = await Promise.all([getPatients(true), API.listRecords(S.token)]);
    const mine = recs.filter(r => r.created_by === S.user.id);
    const weekAgo = Date.now() - 7 * 864e5;
    const week = mine.filter(r => new Date(r.created_at) > weekAgo).length;
    const formsAllowed = Object.keys(FORMS).filter(canForm);
    view().innerHTML = `
      <div class="page-head"><div><h1>שלום ${esc(S.user.full_name)}</h1>
        <div class="muted">מה מזינים היום?</div></div></div>
      <div class="grid k2">
        <div class="card">
          <h2>מעבר מהיר למטופל</h2>
          <form id="qf" class="row" style="align-items:flex-end">
            <div class="grow"><label for="qc">מספר סידורי</label><input type="search" id="qc" list="codes" placeholder="לדוגמה R-012" autocomplete="off"></div>
            <button class="primary">פתח</button>
          </form>
          <datalist id="codes">${patients.map(p => `<option value="${esc(p.code)}">`).join('')}</datalist>
          <p class="muted small" style="margin-bottom:0">מטופל לא קיים? ${can('can_add_patients') ? 'אפשר להקים אותו מכאן.' : 'פנה למנהל להקמת המטופל.'}</p>
        </div>
        <div class="card">
          <h2>הסיכום שלי</h2>
          <div class="grid k4" style="grid-template-columns:repeat(3,1fr)">
            <div><div class="muted small">השבוע</div><div class="kpi value" style="padding:0">${week}</div></div>
            <div><div class="muted small">סה"כ הזנות</div><div class="kpi value" style="padding:0">${mine.length}</div></div>
            <div><div class="muted small">מטופלים במחקר</div><div class="kpi value" style="padding:0">${patients.length}</div></div>
          </div>
          <div class="pills" style="margin-top:.8rem">${formsAllowed.map(f => `<span class="pill brand">${FORMS[f].icon} ${esc(FORMS[f].short)}</span>`).join('') || '<span class="muted small">אין הרשאה לטפסים — פנה למנהל</span>'}</div>
        </div>
      </div>
      <div class="card">
        <div class="row between"><h2 style="margin:0">ההזנות האחרונות שלי</h2><a href="#/mine">לכל ההזנות ←</a></div>
        ${recordsTable(mine.slice(0, 8), { showPatient: true })}
      </div>`;
    $('#qf').onsubmit = async (e) => {
      e.preventDefault();
      const code = $('#qc').value.trim(); if (!code) return;
      const p = patients.find(x => x.code.toLowerCase() === code.toLowerCase());
      if (p) { location.hash = '#/patient/' + p.id; return; }
      if (!can('can_add_patients')) return toast('מספר סידורי לא נמצא', 'bad');
      if (await confirmBox(`המספר "${code}" לא קיים. להקים מטופל חדש?`, 'הקמה')) editPatient(null, code);
    };
    bindRecordTable();
  }

  /* ------------------------------ מטופלים ------------------------------ */
  async function pagePatients() {
    loading();
    const patients = await getPatients(true);
    const wards = S.settings.wards || [];
    view().innerHTML = `
      <div class="page-head"><div><h1>מטופלים במחקר</h1><div class="muted">${patients.length} מטופלים · זיהוי לפי מספר סידורי בלבד</div></div>
        ${can('can_add_patients') ? '<button class="primary" id="newp">＋ מטופל חדש</button>' : ''}</div>
      <div class="card">
        <div class="row" style="margin-bottom:.8rem">
          <input type="search" id="q" placeholder="חיפוש לפי מספר סידורי…" style="max-width:260px">
          <select id="wf" style="max-width:220px"><option value="">כל המחלקות</option>${wards.map(w => `<option>${esc(w)}</option>`).join('')}</select>
          <label class="check-line" style="margin:0"><input type="checkbox" id="ia"> הצג גם פורשים</label>
        </div>
        <div class="table-wrap" id="pt"></div>
      </div>`;
    const draw = () => {
      const q = $('#q').value.trim().toLowerCase(), w = $('#wf').value, ia = $('#ia').checked;
      const list = patients.filter(p => (!q || p.code.toLowerCase().includes(q)) && (!w || p.ward === w) && (ia || p.active));
      $('#pt').innerHTML = list.length ? `<table><thead><tr><th>מספר סידורי</th><th>מחלקה</th><th>מין</th><th>גיל</th>
          ${Object.keys(FORMS).map(f => `<th title="${esc(FORMS[f].title)}">${FORMS[f].icon} ${esc(FORMS[f].short)}</th>`).join('')}
          <th>ביקור אחרון</th><th>סטטוס</th></tr></thead><tbody>
          ${list.map(p => `<tr class="click" data-p="${p.id}"><td><b>${esc(p.code)}</b></td><td>${esc(p.ward || '—')}</td><td>${sexLabel(p.sex)}</td>
            <td class="num">${ageNow(p.birth_month) ?? '—'}</td>
            ${Object.keys(FORMS).map(f => `<td class="num">${(p.counts || {})[f] || '<span class="muted">0</span>'}</td>`).join('')}
            <td>${fmtDate(p.last_visit)}</td><td>${p.active ? '<span class="pill good">פעיל</span>' : '<span class="pill">פרש</span>'}</td></tr>`).join('')}
          </tbody></table>` : '<div class="empty">אין מטופלים להצגה</div>';
      $$('#pt [data-p]').forEach(tr => tr.onclick = () => location.hash = '#/patient/' + tr.dataset.p);
    };
    ['input', 'change'].forEach(ev => { $('#q').addEventListener(ev, draw); $('#wf').addEventListener(ev, draw); $('#ia').addEventListener(ev, draw); });
    draw();
    if ($('#newp')) $('#newp').onclick = () => editPatient(null);
  }

  async function editPatient(p, presetCode) {
    const isNew = !p;
    p = p || { code: presetCode || '', ward: (S.settings.wards || [])[0] || '', sex: '', birth_month: '', data: {}, active: true };
    const wards = S.settings.wards || [];
    const body = `<form id="pfm" onsubmit="return false">
      <div class="form-grid">
        <div class="field req"><label>מספר סידורי</label><input type="text" name="code" value="${esc(p.code)}" required></div>
        <div class="field"><label>מחלקה</label><select name="ward">${wards.map(w => `<option ${w === p.ward ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select></div>
        <div class="field"><label>מין</label><div class="opts">
          <label class="opt"><input type="radio" name="sex" value="M" ${p.sex === 'M' ? 'checked' : ''}>זכר</label>
          <label class="opt"><input type="radio" name="sex" value="F" ${p.sex === 'F' ? 'checked' : ''}>נקבה</label></div></div>
        <div class="field"><label>חודש ושנת לידה</label><input type="month" name="birth_month" value="${esc(p.birth_month || '')}">
          <div class="hint">לחישוב גיל אוטומטי. ללא יום לידה — מצמצם זיהוי.</div></div>
        ${PATIENT_FIELDS.map(f => fieldHtml(f, (p.data || {})[f.key], 'pf_')).join('')}
        ${!isNew ? `<div class="field wide"><label class="check-line"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> פעיל במחקר (להסיר סימון אם המטופל פרש / שוחרר)</label></div>` : ''}
      </div>
      <p class="small muted" style="margin:0">⚠️ אין להזין שם, ת"ז, טלפון או כל פרט מזהה. טבלת הקישור בין המספר הסידורי למטופל נשמרת בנפרד, מחוץ למערכת.</p>
    </form>`;
    await modal(isNew ? 'מטופל חדש' : 'עריכת מטופל ' + p.code, body, [
      { id: 'save', label: 'שמירה', cls: 'primary', onClick: async (root) => {
        const f = $('#pfm', root);
        const sex = $('input[name=sex]:checked', f);
        const payload = {
          id: p.id || null, code: $('[name=code]', f).value.trim(), ward: $('[name=ward]', f).value,
          sex: sex ? sex.value : '', birth_month: $('[name=birth_month]', f).value,
          active: isNew ? true : $('[name=active]', f).checked,
          data: readFields(f, PATIENT_FIELDS)
        };
        const saved = await API.savePatient(S.token, payload);
        S.patients = null;
        toast('נשמר', 'good');
        location.hash = '#/patient/' + saved.id;
        if (!isNew) route();
      } },
      { id: 'cancel', label: 'ביטול' }
    ]);
  }

  async function pagePatient(id) {
    loading();
    const patients = await getPatients(true);
    const p = patients.find(x => x.id === id);
    if (!p) { view().innerHTML = '<div class="card empty">המטופל לא נמצא</div>'; return; }
    const recs = await API.listRecords(S.token, id);
    const d = p.data || {};
    const tab = ss.get('rs_tab') && FORMS[ss.get('rs_tab')] ? ss.get('rs_tab') : Object.keys(FORMS)[0];
    view().innerHTML = `
      <div class="page-head">
        <div><div class="muted small"><a href="#/patients">מטופלים</a> ›</div><h1>מטופל ${esc(p.code)} ${p.active ? '' : '<span class="pill">פרש</span>'}</h1></div>
        ${canEditRow(p) ? '<button id="editp">✎ עריכת פרטים</button>' : ''}
      </div>
      <div class="card">
        <div class="grid k4">
          <div><div class="muted small">מחלקה</div><b>${esc(p.ward || '—')}</b></div>
          <div><div class="muted small">מין · גיל</div><b>${sexLabel(p.sex)} · <span class="num">${ageNow(p.birth_month) ?? '—'}</span></b></div>
          <div><div class="muted small">אבחנה</div><b>${esc(d.diagnosis || '—')}</b></div>
          <div><div class="muted small">עישון · סוכרת</div><b>${esc(d.smoking || '—')} · ${esc(d.diabetes || '—')}</b></div>
        </div>
        ${(d.med_classes || []).length ? `<div class="pills" style="margin-top:.8rem">${d.med_classes.map(m => `<span class="pill">${esc(m)}</span>`).join('')}</div>` : ''}
        <div class="muted small" style="margin-top:.6rem">הוקם ע"י ${esc(p.created_by_name || '—')} · ${fmtDate(p.created_at)}</div>
      </div>
      <div class="tabs" id="tabs">${Object.keys(FORMS).map(f => `<button data-t="${f}" class="${f === tab ? 'active' : ''}">${FORMS[f].icon} ${esc(FORMS[f].short)} (${recs.filter(r => r.form_type === f).length})</button>`).join('')}</div>
      <div id="tabc"></div>`;
    if ($('#editp')) $('#editp').onclick = () => editPatient(p);
    const drawTab = (f) => {
      ss.set('rs_tab', f);
      $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.t === f));
      const list = recs.filter(r => r.form_type === f);
      let trend = '';
      if (f === 'labs') {
        const pts = list.filter(r => r.computed && r.computed.phenoage != null).slice().reverse();
        if (pts.length) trend = `<div class="table-wrap" style="margin-bottom:1rem"><table><thead><tr><th>תאריך</th><th>גיל כרונולוגי</th><th>גיל ביולוגי</th><th>פער</th><th>CRP</th><th>גלוקוז</th><th>אלבומין</th></tr></thead><tbody>
          ${pts.map(r => `<tr><td>${fmtDate(r.visit_date)}</td><td class="num">${esc(r.data.age)}</td><td class="num"><b>${esc(r.computed.phenoage)}</b></td><td>${accelPill(r.computed.acceleration)}</td>
            <td class="num">${esc(r.data.crp ?? '—')}</td><td class="num">${esc(r.data.glucose ?? '—')}</td><td class="num">${esc(r.data.albumin ?? '—')}</td></tr>`).join('')}</tbody></table></div>`;
      }
      $('#tabc').innerHTML = `<div class="card">
        <div class="row between" style="margin-bottom:.6rem"><h2 style="margin:0">${FORMS[f].icon} ${esc(FORMS[f].title)}</h2>
          ${canForm(f) && p.active ? `<a class="btn primary" href="#/record/new/${p.id}/${f}">＋ הזנה חדשה</a>` : ''}</div>
        ${trend}${recordsTable(list, {})}</div>`;
      bindRecordTable();
    };
    $$('#tabs button').forEach(b => b.onclick = () => drawTab(b.dataset.t));
    drawTab(tab);
  }

  /* ------------------------------ טבלת רשומות ------------------------------ */
  function recordsTable(list, opt) {
    if (!list.length) return '<div class="empty">אין הזנות עדיין</div>';
    return `<div class="table-wrap"><table><thead><tr>
        ${opt.showPatient ? '<th>מטופל</th>' : ''}<th>טופס</th><th>תאריך</th><th>תקציר</th><th>הוזן ע"י</th><th>עודכן</th><th></th></tr></thead><tbody>
      ${list.map(r => {
        const F = FORMS[r.form_type] || { icon: '📄', short: r.form_type, summary: () => '' };
        return `<tr>
          ${opt.showPatient ? `<td><a href="#/patient/${r.patient_id}"><b>${esc(r.patient_code)}</b></a></td>` : ''}
          <td>${F.icon} ${esc(F.short)}</td><td>${fmtDate(r.visit_date)}</td>
          <td>${esc(F.summary ? F.summary(r) : '')}</td>
          <td class="small">${esc(r.created_by_name || '—')}<div class="muted">${fmtDateTime(r.created_at)}</div></td>
          <td class="small">${r.updated_at ? esc(r.updated_by_name || '') + '<div class="muted">' + fmtDateTime(r.updated_at) + '</div>' : '<span class="muted">—</span>'}</td>
          <td class="actions"><a class="btn sm" href="#/record/${r.id}">${canEditRow(r) ? 'עריכה' : 'צפייה'}</a>
            ${canEditRow(r) ? `<button class="sm danger" data-del="${r.id}">מחיקה</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }
  function bindRecordTable() {
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (!(await confirmBox('למחוק את ההזנה? (המחיקה נרשמת ביומן)', 'מחיקה', true))) return;
      try { await API.deleteRecord(S.token, b.dataset.del); toast('נמחק'); route(); } catch (e) { fail(e); }
    });
  }

  /* ------------------------------ עורך רשומה ------------------------------ */
  async function pageRecord(recordId, patientId, formType) {
    loading();
    const patients = await getPatients(true);
    let rec = null;
    if (recordId) {
      const all = await API.listRecords(S.token);
      rec = all.find(r => r.id === recordId);
      if (!rec) { view().innerHTML = '<div class="card empty">ההזנה לא נמצאה</div>'; return; }
      patientId = rec.patient_id; formType = rec.form_type;
    }
    const F = FORMS[formType];
    const p = patients.find(x => x.id === patientId);
    if (!F || !p) { view().innerHTML = '<div class="card empty">טופס או מטופל לא תקינים</div>'; return; }
    const readonly = rec ? !canEditRow(rec) : !canForm(formType);
    const data = rec ? rec.data || {} : {};
    const visit = rec ? rec.visit_date : today();

    view().innerHTML = `
      <div class="page-head"><div><div class="muted small"><a href="#/patient/${p.id}">מטופל ${esc(p.code)}</a> ›</div>
        <h1>${F.icon} ${esc(F.title)}</h1><div class="muted">${rec ? 'עריכת הזנה' : 'הזנה חדשה'} · ${esc(p.ward || '')}</div></div></div>
      <div class="editor-layout">
        <form id="rf" onsubmit="return false">
          ${F.description ? `<div class="card small" style="background:var(--brand-soft);border-color:#c7e4de">${esc(F.description)}</div>` : ''}
          <fieldset><legend>פרטי ביקור</legend><div class="form-grid">
            <div class="field req"><label for="visit_date">תאריך הבדיקה / ההערכה</label><input type="date" id="visit_date" value="${esc(visit)}" max="${today()}"></div>
          </div></fieldset>
          ${F.sections.map(s => `<fieldset><legend>${esc(s.title)}</legend><div class="form-grid">${s.fields.map(f => fieldHtml(f, data[f.key])).join('')}</div></fieldset>`).join('')}
          <div class="row">
            ${readonly ? '<span class="muted">צפייה בלבד — אין הרשאת עריכה</span>' : '<button class="primary" id="save">💾 שמירה</button><button id="saveNew">שמירה והזנה נוספת</button>'}
            <a class="btn" href="#/patient/${p.id}">ביטול</a>
          </div>
          ${rec ? `<p class="small muted">הוזן ע"י ${esc(rec.created_by_name || '')} ב-${fmtDateTime(rec.created_at)}${rec.updated_at ? ` · עודכן ע"י ${esc(rec.updated_by_name || '')} ב-${fmtDateTime(rec.updated_at)}` : ''}</p>` : ''}
        </form>
        <aside class="card computed" id="comp"></aside>
      </div>`;
    const form = $('#rf');
    const fields = allFields(F);
    if (readonly) $$('input, select, textarea', form).forEach(i => i.disabled = true);

    // גיל אוטומטי
    const ageField = fields.find(f => f.autoAge);
    const ageInput = ageField && $(`[name="${ageField.key}"]`, form);
    let ageTouched = !!(rec && data[ageField && ageField.key] !== undefined);
    if (ageInput) {
      ageInput.addEventListener('input', () => { ageTouched = true; });
      const box = ageInput.closest('.field');
      $('.hint', box) || box.insertAdjacentHTML('beforeend', '<div class="hint"></div>');
      const setAge = () => {
        const a = PhenoAge.ageAt(p.birth_month, $('#visit_date').value);
        const hint = $('.hint', box);
        if (a !== null) hint.textContent = `מחושב מחודש לידה ${p.birth_month}: ${a}`;
        else hint.textContent = 'לא הוזן חודש לידה למטופל — יש להקליד גיל ידנית';
        if (a !== null && !ageTouched && !readonly) ageInput.value = a;
      };
      $('#visit_date').addEventListener('change', setAge);
      setAge();
    }

    const updateComputed = () => {
      const d = readFields(form, fields);
      const c = F.compute ? F.compute(d) : {};
      checkRanges(form);
      let html = '<h3>חישוב אוטומטי</h3>';
      if (formType === 'labs') {
        const req = PhenoAge.REQUIRED.filter(k => d[k] === undefined);
        if (c.phenoage != null) {
          html += `<div class="muted small">גיל ביולוגי (PhenoAge)</div><div class="big num">${c.phenoage}</div>
            <div class="line"><span>גיל כרונולוגי</span><b class="num">${d.age}</b></div>
            <div class="line"><span>פער</span>${accelPill(c.acceleration)}</div>
            <div class="line"><span>סיכון מודל 10 שנים</span><b class="num">${c.mortality_10y}%</b></div>`;
        } else {
          const labels = Object.fromEntries(fields.map(f => [f.key, f.label]));
          html += `<p class="muted">חסרים ${req.length} ערכים לחישוב:</p><div class="pills">${req.map(k => `<span class="pill warn">${esc(labels[k] || k)}</span>`).join('')}</div>`;
        }
        if (c.bmi) html += `<div class="line"><span>BMI</span><b class="num">${c.bmi}</b></div>`;
        html += '<p class="small muted" style="margin-bottom:0">Levine et al., Aging 2018. החישוב נשמר יחד עם ההזנה.</p>';
      } else {
        const entries = Object.entries(c);
        html += entries.length ? entries.map(([k, v]) => `<div class="line"><span>${esc((F.computedLabels || {})[k] || k)}</span><b>${esc(v)}</b></div>`).join('')
          : '<p class="muted">יחושב לאחר מילוי הפריטים</p>';
      }
      $('#comp').innerHTML = html;
    };
    form.addEventListener('input', updateComputed);
    form.addEventListener('change', updateComputed);
    updateComputed();

    const save = async (again) => {
      const vd = $('#visit_date').value;
      if (!vd) return toast('חובה להזין תאריך', 'bad');
      const d = readFields(form, fields);
      const missingReq = fields.filter(f => f.required && d[f.key] === undefined);
      const bad = checkRanges(form);
      if (bad && !(await confirmBox(`יש ${bad} ערכים מחוץ לטווח הסביר (מסומנים בכתום). ייתכן שגיאת יחידות. לשמור בכל זאת?`, 'שמירה בכל זאת'))) return;
      if (missingReq.length && !(await confirmBox(`חסרים ${missingReq.length} שדות חובה (${missingReq.map(f => f.label).join(', ')}). לשמור כטיוטה חלקית?`, 'שמירה חלקית'))) return;
      const dupe = !rec && (await API.listRecords(S.token, p.id, formType)).find(r => r.visit_date === vd);
      if (dupe && !(await confirmBox('כבר קיימת הזנה מטופס זה לאותו תאריך. ליצור הזנה נוספת?', 'כן, ליצור'))) return;
      $$('#save, #saveNew').forEach(b => b.disabled = true);
      try {
        await API.saveRecord(S.token, { id: rec ? rec.id : null, patient_id: p.id, form_type: formType, visit_date: vd, data: d, computed: F.compute ? F.compute(d) : {} });
        toast('נשמר בהצלחה', 'good');
        S.patients = null;
        if (again) { if (location.hash.includes('/new/')) route(); else location.hash = `#/record/new/${p.id}/${formType}`; }
        else location.hash = '#/patient/' + p.id;
      } catch (e) { fail(e); $$('#save, #saveNew').forEach(b => b.disabled = false); }
    };
    if ($('#save')) $('#save').onclick = () => save(false);
    if ($('#saveNew')) $('#saveNew').onclick = () => save(true);
  }

  /* ------------------------------ ההזנות שלי ------------------------------ */
  async function pageMine() {
    loading();
    const recs = (await API.listRecords(S.token)).filter(r => r.created_by === S.user.id);
    view().innerHTML = `<div class="page-head"><h1>ההזנות שלי</h1><div class="muted">${recs.length} הזנות</div></div>
      <div class="card">${recordsTable(recs, { showPatient: true })}</div>`;
    bindRecordTable();
  }

  function pagePassword() {
    view().innerHTML = `<div class="card" style="max-width:460px"><h1>החלפת סיסמה</h1>
      <form id="cp"><div class="field"><label>סיסמה נוכחית</label><input type="password" id="o" required></div>
      <div class="field"><label>סיסמה חדשה (8 תווים לפחות)</label><input type="password" id="n1" minlength="8" required></div>
      <div class="field"><label>אימות</label><input type="password" id="n2" required></div>
      <button class="primary">עדכון</button></form></div>`;
    $('#cp').onsubmit = async (e) => {
      e.preventDefault();
      if ($('#n1').value !== $('#n2').value) return toast('הסיסמאות אינן תואמות', 'bad');
      try { await API.changePassword(S.token, $('#o').value, $('#n1').value); toast('הסיסמה עודכנה', 'good'); location.hash = '#/home'; } catch (ex) { fail(ex); }
    };
  }

  /* ------------------------------ התקדמות המחקר ------------------------------ */
  async function pageDashboard() {
    if (!can('can_view_stats')) { location.hash = '#/home'; return; }
    loading();
    const st = await API.stats(S.token);
    const set = st.settings || {};
    const target = Number(set.target_patients) || 0;
    const tv = Number(set.target_visits) || 1;
    const pct = (a, b) => b ? Math.min(100, Math.round(a / b * 100)) : 0;
    const followed = (st.visits_distribution || []).filter(v => v.visits >= tv).reduce((s, v) => s + v.patients, 0);
    const pAll = st.patients_total || 0;
    const months = st.by_month || [];
    const maxM = Math.max(1, ...months.map(m => m.n));
    const staffMax = Math.max(1, ...(st.staff || []).map(s => s.records_total));
    const pheno = st.phenoage || [];
    const allPheno = pheno.reduce((s, w) => s + w.n, 0);
    const avgAccel = allPheno ? Math.round(pheno.reduce((s, w) => s + w.avg_accel * w.n, 0) / allPheno * 100) / 100 : null;

    view().innerHTML = `
      <div class="page-head"><div><h1>התקדמות המחקר</h1><div class="muted">${esc(set.study_name || '')}
        ${set.start_date ? ` · ${fmtDate(set.start_date)} – ${fmtDate(set.end_date)}` : ''}</div></div>
        <button id="refresh">↻ רענון</button></div>
      <div class="grid k4">
        <div class="card kpi"><div class="label">מטופלים שגויסו</div><div class="value">${pAll} <small>/ ${target || '—'}</small></div>
          <div class="progress"><span style="width:${pct(pAll, target)}%"></span></div><div class="small muted">${pct(pAll, target)}% מהיעד</div></div>
        <div class="card kpi"><div class="label">השלימו ${tv} בדיקות דם ומעלה</div><div class="value">${followed} <small>/ ${pAll}</small></div>
          <div class="progress"><span style="width:${pct(followed, pAll)}%"></span></div><div class="small muted">${pct(followed, pAll)}% מהמגויסים</div></div>
        <div class="card kpi"><div class="label">סה"כ הזנות</div><div class="value">${st.records_total}</div>
          <div class="small muted">${Object.keys(FORMS).map(f => `${FORMS[f].icon} ${(st.by_form || {})[f] || 0}`).join(' · ')}</div></div>
        <div class="card kpi"><div class="label">פער גיל ממוצע (ביולוגי − כרונולוגי)</div><div class="value">${avgAccel === null ? '—' : `<span class="num">${fmtSigned(avgAccel)}</span>`} <small>שנים</small></div>
          <div class="small muted">על בסיס ${allPheno} בדיקות</div></div>
      </div>

      <div class="grid k2">
        <div class="card"><h2>כיסוי טפסים (מטופלים עם לפחות הזנה אחת)</h2><div class="bars">
          ${Object.keys(FORMS).map(f => { const n = (st.patients_with_form || {})[f] || 0; return `<div class="bar-row"><span>${FORMS[f].icon} ${esc(FORMS[f].short)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${pct(n, pAll)}%"></div></div><span class="num">${n}/${pAll}</span></div>`; }).join('')}
        </div></div>
        <div class="card" style="grid-column:1/-1"><h2>לפי מחלקה</h2><div class="table-wrap"><table><thead><tr><th>מחלקה</th><th>מטופלים</th><th>הזנות</th><th>בדיקות PhenoAge</th><th>גיל ממוצע</th><th>ביולוגי ממוצע</th><th>פער ממוצע</th></tr></thead><tbody>
          ${(st.by_ward || []).map(w => { const ph = pheno.find(x => x.ward === w.ward) || {}; return `<tr><td>${esc(w.ward)}</td><td class="num">${w.patients}</td><td class="num">${w.records}</td>
            <td class="num">${ph.n || 0}</td><td class="num">${ph.avg_age ?? '—'}</td><td class="num">${ph.avg_pheno ?? '—'}</td><td>${accelPill(ph.avg_accel)}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">אין נתונים</td></tr>'}
          </tbody></table></div></div>
      </div>

      <div class="grid k2">
        <div class="card"><h2>הזנות לפי חודש</h2>
          ${months.length ? `<div class="colchart">${months.map(m => `<div class="col"><span class="v">${m.n}</span><div class="b" style="height:${Math.round(m.n / maxM * 100)}%"></div></div>`).join('')}</div>
          <div class="colchart-labels">${months.map(m => `<span>${m.month.slice(5)}/${m.month.slice(2, 4)}</span>`).join('')}</div>` : '<div class="empty">אין נתונים</div>'}
        </div>
        <div class="card"><h2>מספר בדיקות דם למטופל</h2><div class="bars">
          ${(st.visits_distribution || []).map(v => `<div class="bar-row"><span>${v.visits} בדיקות</span><div class="bar-track"><div class="bar-fill" style="width:${pct(v.patients, pAll)}%;background:${v.visits >= tv ? 'var(--brand)' : '#9fb3c3'}"></div></div><span class="num">${v.patients}</span></div>`).join('') || '<div class="empty">אין נתונים</div>'}
        </div></div>
      </div>

      <div class="card"><h2>ביצועי הצוות</h2><div class="table-wrap"><table><thead><tr>
        <th>איש צוות</th><th>סה"כ הזנות</th><th></th><th>החודש</th><th>7 ימים</th>${Object.keys(FORMS).map(f => `<th>${FORMS[f].icon}</th>`).join('')}
        <th>עריכות</th><th>מטופלים שהקים</th><th>ימי פעילות</th><th>הזנה אחרונה</th><th>כניסה אחרונה</th></tr></thead><tbody>
        ${(st.staff || []).map(s => `<tr${s.active ? '' : ' style="opacity:.55"'}><td><b>${esc(s.full_name)}</b><div class="muted small">${esc(s.username)}${s.role === 'admin' ? ' · מנהל' : ''}</div></td>
          <td class="num"><b>${s.records_total}</b></td><td style="min-width:110px"><div class="bar-track"><div class="bar-fill" style="width:${Math.round(s.records_total / staffMax * 100)}%"></div></div></td>
          <td class="num">${s.records_month}</td><td class="num">${s.records_week}</td>
          ${Object.keys(FORMS).map(f => `<td class="num">${(s.by_form || {})[f] || 0}</td>`).join('')}
          <td class="num">${s.edits}</td><td class="num">${s.patients_added}</td><td class="num">${s.active_days}</td>
          <td class="small">${fmtDateTime(s.last_entry)}</td><td class="small">${fmtDateTime(s.last_login)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    $('#refresh').onclick = () => route();
  }

  /* ------------------------------ ניהול צוות ------------------------------ */
  async function pageStaff() {
    if (!isAdmin()) { location.hash = '#/home'; return; }
    loading();
    const list = await API.staffList(S.token);
    const yes = (b) => b ? '✔' : '<span class="muted">—</span>';
    view().innerHTML = `
      <div class="page-head"><div><h1>ניהול צוות</h1><div class="muted">${list.filter(s => s.active).length} משתמשים פעילים</div></div>
        <button class="primary" id="adds">＋ איש צוות חדש</button></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>שם</th><th>שם משתמש</th><th>תפקיד</th><th>טפסים מורשים</th>
        <th>הקמת מטופלים</th><th>עריכת הזנות של אחרים</th><th>צפייה בהתקדמות</th><th>ייצוא</th><th>סטטוס</th><th>כניסה אחרונה</th><th></th></tr></thead><tbody>
        ${list.map(s => `<tr${s.active ? '' : ' style="opacity:.55"'}><td><b>${esc(s.full_name)}</b></td><td class="num">${esc(s.username)}</td>
          <td>${s.role === 'admin' ? '<span class="pill brand">מנהל</span>' : 'צוות'}</td>
          <td><div class="pills">${s.role === 'admin' ? '<span class="pill">הכול</span>' : (s.forms || []).map(f => FORMS[f] ? `<span class="pill">${FORMS[f].icon} ${esc(FORMS[f].short)}</span>` : '').join('') || '<span class="muted">אין</span>'}</div></td>
          <td>${yes(s.role === 'admin' || s.can_add_patients)}</td><td>${yes(s.role === 'admin' || s.can_edit_others)}</td>
          <td>${yes(s.role === 'admin' || s.can_view_stats)}</td><td>${yes(s.role === 'admin' || s.can_export)}</td>
          <td>${s.active ? (s.must_change_password ? '<span class="pill warn">ממתין להחלפת סיסמה</span>' : '<span class="pill good">פעיל</span>') : '<span class="pill">מושבת</span>'}</td>
          <td class="small">${fmtDateTime(s.last_login)}</td>
          <td class="actions"><button class="sm" data-e="${s.id}">עריכה</button></td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card small muted">💡 שכח סיסמה? "עריכה" ← "איפוס סיסמה". איש הצוות יתבקש להחליף אותה בכניסה הבאה. עזב את הצוות? להסיר את סימון "פעיל" — ההזנות שלו נשמרות.</div>`;
    $('#adds').onclick = () => editStaff(null);
    $$('[data-e]').forEach(b => b.onclick = () => editStaff(list.find(s => s.id === b.dataset.e)));
  }

  async function editStaff(s) {
    const isNew = !s;
    s = s || { username: '', full_name: '', role: 'staff', forms: Object.keys(FORMS), can_add_patients: true, can_edit_others: false, can_view_stats: false, can_export: false, active: true };
    const pw = isNew ? genPassword() : '';
    const body = `<form id="sf" onsubmit="return false"><div class="form-grid">
        <div class="field req"><label>שם מלא</label><input type="text" name="full_name" value="${esc(s.full_name)}"></div>
        <div class="field req"><label>שם משתמש (לכניסה)</label><input type="text" name="username" value="${esc(s.username)}" autocomplete="off" style="direction:ltr;text-align:right"></div>
        <div class="field ${isNew ? 'req' : ''}"><label>${isNew ? 'סיסמה ראשונית' : 'איפוס סיסמה (להשאיר ריק = ללא שינוי)'}</label>
          <div class="row" style="flex-wrap:nowrap"><input type="text" name="password" value="${esc(pw)}" autocomplete="off" style="direction:ltr"><button type="button" id="gen" class="sm">יצירה</button></div>
          <div class="hint">איש הצוות יחליף אותה בכניסה הראשונה</div></div>
        <div class="field"><label>תפקיד</label><div class="opts">
          <label class="opt"><input type="radio" name="role" value="staff" ${s.role !== 'admin' ? 'checked' : ''}>צוות</label>
          <label class="opt"><input type="radio" name="role" value="admin" ${s.role === 'admin' ? 'checked' : ''}>מנהל (כל ההרשאות)</label></div></div>
        <div class="field wide"><label>טפסים שמותר להזין</label><div class="opts">
          ${Object.keys(FORMS).map(f => `<label class="opt"><input type="checkbox" name="forms" value="${f}" ${(s.forms || []).includes(f) ? 'checked' : ''}>${FORMS[f].icon} ${esc(FORMS[f].short)}</label>`).join('')}</div></div>
        <div class="field wide"><label>הרשאות</label>
          <label class="check-line"><input type="checkbox" name="can_add_patients" ${s.can_add_patients ? 'checked' : ''}> הקמת מטופלים חדשים</label>
          <label class="check-line"><input type="checkbox" name="can_edit_others" ${s.can_edit_others ? 'checked' : ''}> עריכה ומחיקה של הזנות שהזינו אחרים</label>
          <label class="check-line"><input type="checkbox" name="can_view_stats" ${s.can_view_stats ? 'checked' : ''}> צפייה במסך התקדמות המחקר וביצועי צוות</label>
          <label class="check-line"><input type="checkbox" name="can_export" ${s.can_export ? 'checked' : ''}> ייצוא נתונים לאקסל</label>
          <label class="check-line"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> משתמש פעיל</label></div>
      </div></form>`;
    await modal(isNew ? 'איש צוות חדש' : 'עריכת ' + s.full_name, body, [
      { id: 'save', label: 'שמירה', cls: 'primary', onClick: async (root) => {
        const f = $('#sf', root);
        const payload = {
          id: s.id || null, full_name: $('[name=full_name]', f).value.trim(), username: $('[name=username]', f).value.trim(),
          password: $('[name=password]', f).value.trim() || null, role: $('[name=role]:checked', f).value,
          forms: $$('[name=forms]:checked', f).map(i => i.value)
        };
        ['can_add_patients', 'can_edit_others', 'can_view_stats', 'can_export', 'active'].forEach(k => payload[k] = $(`[name=${k}]`, f).checked);
        await API.staffSave(S.token, payload);
        if (payload.password) {
          setTimeout(() => modal('פרטי כניסה למסירה', `<p>יש למסור לאיש הצוות (באופן אישי, לא בקבוצה):</p>
            <div class="cred-box">שם משתמש: ${esc(payload.username)}\nסיסמה:     ${esc(payload.password)}\nכתובת:     ${esc(location.href.split('#')[0])}</div>
            <p class="small muted">בכניסה הראשונה המערכת תחייב להחליף סיסמה.</p>`, [{ id: 'copy', label: 'העתקה', cls: 'primary', onClick: () => {
              navigator.clipboard && navigator.clipboard.writeText(`שם משתמש: ${payload.username}\nסיסמה: ${payload.password}\nכתובת: ${location.href.split('#')[0]}`).then(() => toast('הועתק'));
              return false; } }, { id: 'ok', label: 'סגירה' }]), 50);
        } else toast('נשמר', 'good');
        route();
      } },
      { id: 'cancel', label: 'ביטול' }
    ]);
  }
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'gen') { const inp = e.target.parentElement.querySelector('input'); inp.value = genPassword(); }
  });

  /* ------------------------------ הגדרות ------------------------------ */
  function pageSettings() {
    if (!isAdmin()) { location.hash = '#/home'; return; }
    const s = S.settings;
    view().innerHTML = `<div class="page-head"><h1>הגדרות המחקר</h1></div>
      <form class="card" id="stf" style="max-width:720px"><div class="form-grid">
        <div class="field wide"><label>שם המחקר</label><input type="text" name="study_name" value="${esc(s.study_name || '')}"></div>
        <div class="field wide"><label>מחלקות משתתפות (שורה לכל מחלקה)</label><textarea name="wards">${esc((s.wards || []).join('\n'))}</textarea></div>
        <div class="field"><label>יעד גיוס מטופלים</label><input type="number" name="target_patients" value="${esc(s.target_patients ?? '')}" min="0"></div>
        <div class="field"><label>יעד בדיקות דם לכל מטופל (במשך המחקר)</label><input type="number" name="target_visits" value="${esc(s.target_visits ?? '')}" min="1"></div>
        <div class="field"><label>תאריך התחלה</label><input type="date" name="start_date" value="${esc(s.start_date || '')}"></div>
        <div class="field"><label>תאריך סיום מתוכנן</label><input type="date" name="end_date" value="${esc(s.end_date || '')}"></div>
      </div><button class="primary">שמירה</button></form>`;
    $('#stf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const payload = {
        study_name: f.study_name.value.trim(),
        wards: f.wards.value.split('\n').map(x => x.trim()).filter(Boolean),
        target_patients: Number(f.target_patients.value) || 0,
        target_visits: Number(f.target_visits.value) || 1,
        start_date: f.start_date.value || null, end_date: f.end_date.value || null
      };
      try { S.settings = await API.saveSettings(S.token, payload); toast('ההגדרות נשמרו', 'good'); shell(); route(); } catch (ex) { fail(ex); }
    };
  }

  /* ------------------------------ יומן ------------------------------ */
  const ACTIONS = { login: 'כניסה', login_failed: 'כניסה נכשלה', change_password: 'החלפת סיסמה', create_patient: 'הקמת מטופל', update_patient: 'עדכון מטופל',
    create_record: 'הזנה חדשה', update_record: 'עדכון הזנה', delete_record: 'מחיקת הזנה', create_staff: 'הקמת משתמש', update_staff: 'עדכון משתמש',
    reset_password: 'איפוס סיסמה', save_settings: 'עדכון הגדרות', export: 'ייצוא נתונים', seed_demo: 'טעינת הדגמה' };
  async function pageAudit() {
    if (!isAdmin()) { location.hash = '#/home'; return; }
    loading();
    const list = await API.audit(S.token, 500);
    view().innerHTML = `<div class="page-head"><div><h1>יומן פעולות</h1><div class="muted">500 הפעולות האחרונות</div></div></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>זמן</th><th>משתמש</th><th>פעולה</th><th>פרטים</th></tr></thead><tbody>
      ${list.map(a => `<tr><td class="small">${fmtDateTime(a.at)}</td><td>${esc(a.full_name || '—')}</td>
        <td>${a.action === 'login_failed' || a.action === 'delete_record' ? `<span class="pill warn">${esc(ACTIONS[a.action] || a.action)}</span>` : esc(ACTIONS[a.action] || a.action)}</td>
        <td class="small muted">${esc(a.entity && FORMS[a.entity] ? FORMS[a.entity].short : '')} ${esc(a.details ? (a.details.code || a.details.username || '') : '')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">ריק</td></tr>'}
      </tbody></table></div></div>`;
  }

  /* ------------------------------ ייצוא לאקסל ------------------------------ */
  function pageExport() {
    if (!can('can_export')) { location.hash = '#/home'; return; }
    view().innerHTML = `<div class="page-head"><h1>ייצוא נתונים לאקסל</h1></div>
      <div class="card" style="max-width:720px">
        <p>הקובץ כולל גיליון מטופלים, גיליון לכל טופס (כל הזנה = שורה, עם פרטי המטופל), ${isAdmin() || can('can_view_stats') ? 'ביצועי צוות, ' : ''}ומילון משתנים.</p>
        <label class="check-line"><input type="radio" name="hdr" value="he" checked> כותרות בעברית (לקריאה)</label>
        <label class="check-line"><input type="radio" name="hdr" value="en"> שמות משתנים באנגלית (ל-SPSS / R / סטטיסטיקאי)</label>
        <label class="check-line"><input type="checkbox" id="inact" checked> לכלול מטופלים שפרשו</label>
        <button class="primary" id="go" style="margin-top:.6rem">⬇ הורדת קובץ Excel</button>
        <p class="small muted" style="margin-bottom:0">כל ייצוא נרשם ביומן. הקובץ מכיל מספרים סידוריים בלבד — לשמור במחשב מאובטח בהתאם לאישור ועדת הלסינקי.</p>
      </div>`;
    $('#go').onclick = async () => {
      const btn = $('#go'); btn.disabled = true; btn.textContent = 'מכין קובץ…';
      try {
        const data = await API.exportAll(S.token);
        let stats = null;
        if (can('can_view_stats')) { try { stats = await API.stats(S.token); } catch (e) { /* ignore */ } }
        buildWorkbook(data, stats, $('input[name=hdr]:checked').value === 'en', $('#inact').checked);
        toast('הקובץ ירד', 'good');
      } catch (e) { fail(e); }
      btn.disabled = false; btn.textContent = '⬇ הורדת קובץ Excel';
    };
  }

  function buildWorkbook(data, stats, english, includeInactive) {
    if (typeof XLSX === 'undefined') { toast('ספריית האקסל לא נטענה', 'bad'); return; }
    const patients = data.patients.filter(p => includeInactive || p.active);
    const pIds = new Set(patients.map(p => p.id));
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: !english }] };
    const dict = [];
    const col = (key, he, form, unit) => { dict.push({ variable: key, label: he, unit: unit || '', sheet: form }); return english ? key : he + (unit ? ` (${unit})` : ''); };
    const val = (v) => Array.isArray(v) ? v.join('; ') : (v === undefined || v === null ? '' : v);

    // --- מטופלים
    const pCols = [['patient_code', 'מספר סידורי'], ['ward', 'מחלקה'], ['sex', 'מין'], ['birth_month', 'חודש לידה'], ['age_now', 'גיל היום'], ['active', 'פעיל']]
      .concat(PATIENT_FIELDS.map(f => [f.key, f.label]))
      .concat(Object.keys(FORMS).map(f => ['n_' + f, 'מס׳ הזנות — ' + FORMS[f].short]))
      .concat([['created_by', 'הוקם ע"י'], ['created_at', 'תאריך הקמה']]);
    const pHead = pCols.map(([k, l]) => col(k, l, 'patients'));
    const pRows = patients.map(p => [p.code, p.ward, p.sex, p.birth_month, ageNow(p.birth_month), p.active ? 1 : 0]
      .concat(PATIENT_FIELDS.map(f => val((p.data || {})[f.key])))
      .concat(Object.keys(FORMS).map(f => (p.counts || {})[f] || 0))
      .concat([p.created_by_name, p.created_at ? p.created_at.slice(0, 10) : '']));
    addSheet(wb, english ? 'patients' : 'מטופלים', [pHead, ...pRows]);

    // --- גיליון לכל טופס
    for (const fk of Object.keys(FORMS)) {
      const F = FORMS[fk];
      const fields = allFields(F);
      const compKeys = Object.keys(F.computedLabels || {});
      const head = [col('patient_code', 'מספר סידורי', fk), col('ward', 'מחלקה', fk), col('sex', 'מין', fk), col('visit_date', 'תאריך', fk), col('visit_no', 'מס׳ ביקור', fk)]
        .concat(fields.map(f => col(f.key, f.label, fk, f.unit)))
        .concat(compKeys.map(k => col(k, F.computedLabels[k], fk)))
        .concat([col('entered_by', 'הוזן ע"י', fk), col('entered_at', 'זמן הזנה', fk), col('updated_by', 'עודכן ע"י', fk)]);
      const recs = data.records.filter(r => r.form_type === fk && pIds.has(r.patient_id))
        .sort((a, b) => (a.patient_code + a.visit_date).localeCompare(b.patient_code + b.visit_date, 'he', { numeric: true }));
      const seq = {};
      const rows = recs.map(r => {
        const p = patients.find(x => x.id === r.patient_id) || {};
        seq[r.patient_id] = (seq[r.patient_id] || 0) + 1;
        return [r.patient_code, p.ward, p.sex, r.visit_date, seq[r.patient_id]]
          .concat(fields.map(f => {
            const v = (r.data || {})[f.key];
            // מצב SPSS: ציונים כמספרים, כן/לא כ-1/0
            if (english && f.type === 'score' && v !== undefined && v !== '') return scoreOf(F, f.key, v);
            if (english && f.type === 'yesno' && v) return v === 'כן' ? 1 : 0;
            return val(v);
          }))
          .concat(compKeys.map(k => val((r.computed || {})[k])))
          .concat([r.created_by_name, r.created_at ? r.created_at.replace('T', ' ').slice(0, 16) : '', r.updated_by_name || '']);
      });
      addSheet(wb, english ? fk : F.short, [head, ...rows]);
    }

    // --- ביצועי צוות
    if (stats && stats.staff) {
      const sh = [['איש צוות', 'שם משתמש', 'סה"כ הזנות', 'החודש', '7 ימים'].concat(Object.keys(FORMS).map(f => FORMS[f].short)).concat(['עריכות', 'מטופלים שהקים', 'ימי פעילות', 'הזנה אחרונה', 'כניסה אחרונה'])];
      stats.staff.forEach(s => sh.push([s.full_name, s.username, s.records_total, s.records_month, s.records_week].concat(Object.keys(FORMS).map(f => (s.by_form || {})[f] || 0))
        .concat([s.edits, s.patients_added, s.active_days, s.last_entry ? s.last_entry.slice(0, 16).replace('T', ' ') : '', s.last_login ? s.last_login.slice(0, 16).replace('T', ' ') : ''])));
      addSheet(wb, english ? 'staff_performance' : 'ביצועי צוות', sh);
    }

    // --- מילון משתנים
    const seen = new Set();
    const dictRows = [['variable', 'תיאור', 'יחידות', 'גיליון']].concat(dict.filter(d => { const k = d.sheet + d.variable; if (seen.has(k)) return false; seen.add(k); return true; })
      .map(d => [d.variable, d.label, d.unit, d.sheet]));
    dictRows.push([], ['PhenoAge', 'Levine ME et al. Aging (Albany NY) 2018;10(4):573-591', '', 'labs']);
    addSheet(wb, english ? 'dictionary' : 'מילון משתנים', dictRows);

    XLSX.writeFile(wb, `research_export_${today()}.xlsx`);
  }
  function addSheet(wb, name, aoa) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const head = aoa[0] || [];
    ws['!cols'] = head.map((h, i) => ({ wch: Math.min(40, Math.max(10, String(h || '').length + 2, ...aoa.slice(1, 50).map(r => String(r[i] ?? '').length + 1))) }));
    if (aoa.length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: head.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }

  /* ------------------------------ התחלה ------------------------------ */
  async function boot() {
    const t = ss.get('rs_token');
    if (!t) return renderLogin();
    try {
      const r = await API.me(t);
      S.token = t; S.user = r.user; S.settings = r.settings || {};
      afterLogin();
    } catch (e) { ss.del('rs_token'); renderLogin(); }
  }
  boot();
})();
