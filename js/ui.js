/* =====================================================================
 *  כלי ממשק משותפים: עזרים, אייקונים, חלונות, שדות טופס, תרשימים
 * ===================================================================== */
(function () {
  'use strict';
  const R = window.R = window.R || {};

  /* ---------- עזרים בסיסיים ---------- */
  R.$ = (sel, root = document) => root.querySelector(sel);
  R.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  R.esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = R.esc;

  R.today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  R.fmtDate = (d) => {
    if (!d) return '—';
    const x = new Date(d);
    if (isNaN(x)) return esc(d);
    return x.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  R.fmtDateTime = (d) => {
    if (!d) return '—';
    const x = new Date(d);
    return x.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + x.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };
  R.relTime = (d) => {
    if (!d) return '';
    const s = (Date.now() - new Date(d)) / 1000;
    if (s < 60) return 'עכשיו';
    if (s < 3600) return `לפני ${Math.round(s / 60)} דק׳`;
    if (s < 86400) return `לפני ${Math.round(s / 3600)} שע׳`;
    if (s < 86400 * 7) return `לפני ${Math.round(s / 86400)} ימים`;
    return R.fmtDate(d);
  };
  R.fmtSigned = (n) => (n === null || n === undefined || isNaN(n)) ? '—' : (n > 0 ? '+' : '') + n;
  R.addMonths = (dateStr, m) => { const d = new Date(dateStr); d.setMonth(d.getMonth() + Number(m)); return d.toISOString().slice(0, 10); };
  R.daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  R.mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  R.sd = (a) => { if (a.length < 2) return null; const m = R.mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  R.round = (v, d = 1) => v === null || v === undefined || isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d;
  R.genPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const a = new Uint32Array(10); crypto.getRandomValues(a);
    return Array.from(a, n => chars[n % chars.length]).join('');
  };
  R.ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  /* ---------- אייקונים (SVG) ---------- */
  const IC = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21c0-3-2-5.5-5-6.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    bars: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    back: '<path d="m9 18 6-6-6-6"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    flask: '<path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7 15h10"/>'
  };
  R.icon = (name, size = 18) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[name] || ''}</svg>`;

  /* ---------- הודעות וחלונות ---------- */
  R.toast = (msg, kind) => {
    let box = R.$('#toast');
    if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = (kind === 'good' ? R.icon('checkCircle') : kind === 'bad' ? R.icon('alert') : '') + `<span>${esc(msg)}</span>`;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, kind === 'bad' ? 5000 : 2800);
  };

  R.modal = (title, bodyHtml, buttons, opts = {}) => new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="mh"><h2>${esc(title)}</h2><button class="icon-btn" data-x aria-label="סגור">${R.icon('x')}</button></div>
        <div class="mb">${bodyHtml}</div>
        <div class="mf">${(buttons || [{ id: 'ok', label: 'אישור', cls: 'primary' }]).map(b => `<button data-b="${b.id}" class="btn ${b.cls || ''}">${esc(b.label)}</button>`).join('')}</div>
      </div>`;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('in'));
    const close = (v) => { back.classList.remove('in'); setTimeout(() => back.remove(), 150); resolve(v); };
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
    back.addEventListener('click', async (e) => {
      if (e.target.closest('[data-x]')) return close(null);
      const b = e.target.closest('[data-b]');
      if (!b) return;
      const def = (buttons || []).find(x => x.id === b.dataset.b);
      if (def && def.onClick) {
        b.disabled = true;
        try { const r = await def.onClick(back); if (r !== false) close(b.dataset.b); }
        catch (err) { R.fail(err); }
        finally { b.disabled = false; }
      } else close(b.dataset.b);
    });
    if (opts.onOpen) opts.onOpen(back);
    const first = back.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea');
    if (first && !opts.noFocus) setTimeout(() => first.focus(), 40);
  });
  R.confirm = (msg, okLabel = 'אישור', danger) =>
    R.modal('אישור', `<p style="margin:0">${esc(msg)}</p>`, [{ id: 'ok', label: okLabel, cls: danger ? 'danger' : 'primary' }, { id: 'cancel', label: 'ביטול' }]).then(v => v === 'ok');

  R.fail = (err) => {
    console.error(err);
    if (err && err.code === 'NOT_AUTHENTICATED') { R.logout && R.logout(true); return; }
    R.toast(API.message(err), 'bad');
  };

  /* ---------- תגיות ---------- */
  R.pill = (text, cls = '') => `<span class="pill ${cls}">${esc(text)}</span>`;
  R.accelPill = (a) => {
    if (a === null || a === undefined || a === '') return '<span class="muted">—</span>';
    const cls = a > 5 ? 'bad' : a > 0 ? 'warn' : 'good';
    return `<span class="pill ${cls} num">${esc(R.fmtSigned(a))}</span>`;
  };
  R.empty = (text, icon = 'clipboard') => `<div class="empty">${R.icon(icon, 34)}<div>${esc(text)}</div></div>`;

  /* ---------- שדות טופס ---------- */
  R.fieldHtml = (f, value, prefix = '') => {
    const id = prefix + f.key;
    const req = f.required ? ' req' : '';
    const opts = f.options || [];
    const wide = (f.type === 'textarea' || f.type === 'checks' || (f.type === 'score' && opts.length > 3) || (f.type === 'radio' && opts.length > 4)) ? ' wide' : '';
    const nv = R.normVal ? R.normVal(f, value) : value;
    const v = nv === undefined || nv === null ? '' : nv;
    let input = '';
    switch (f.type) {
      case 'number': {
        const attrs = `type="number" inputmode="decimal" id="${id}" name="${esc(f.key)}" value="${esc(v)}" step="${f.step || 'any'}" data-min="${f.min ?? ''}" data-max="${f.max ?? ''}"`;
        input = f.unit ? `<div class="with-unit"><input ${attrs}><span class="unit">${esc(f.unit)}</span></div>` : `<input ${attrs}>`;
        break;
      }
      case 'text': input = `<input type="text" id="${id}" name="${esc(f.key)}" value="${esc(v)}">`; break;
      case 'date': input = `<input type="date" id="${id}" name="${esc(f.key)}" value="${esc(v)}">`; break;
      case 'textarea': input = `<textarea id="${id}" name="${esc(f.key)}">${esc(v)}</textarea>`; break;
      case 'select':
        input = `<select id="${id}" name="${esc(f.key)}"><option value="">— בחירה —</option>${opts.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        break;
      case 'radio':
      case 'yesno': {
        const list = f.type === 'yesno' ? ['כן', 'לא'] : opts;
        input = `<div class="opts">${list.map(o => `<label class="opt"><input type="radio" name="${esc(f.key)}" value="${esc(o)}" ${o === v ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;
        break;
      }
      case 'score':
        input = `<div class="opts">${opts.map(([lbl, sc]) => `<label class="opt"><input type="radio" name="${esc(f.key)}" value="${esc(lbl)}" ${lbl === v ? 'checked' : ''}><span>${esc(lbl)}</span>${sc ? `<em class="sc">${sc}</em>` : ''}</label>`).join('')}</div>`;
        break;
      case 'checks': {
        const arr = Array.isArray(v) ? v : [];
        input = `<div class="opts">${opts.map(o => `<label class="opt"><input type="checkbox" name="${esc(f.key)}" value="${esc(o)}" ${arr.includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;
        break;
      }
      default: input = `<input type="text" id="${id}" name="${esc(f.key)}" value="${esc(v)}">`;
    }
    return `<div class="field${req}${wide}" data-field="${esc(f.key)}">
      <label for="${id}">${esc(f.label)}</label>${input}
      ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}<div class="warn" hidden></div></div>`;
  };

  R.readFields = (root, fields) => {
    const out = {};
    for (const f of fields) {
      const nm = CSS.escape(f.key);
      if (f.type === 'checks') out[f.key] = R.$$(`input[name="${nm}"]:checked`, root).map(i => i.value);
      else if (['radio', 'yesno', 'score'].includes(f.type)) { const c = R.$(`input[name="${nm}"]:checked`, root); out[f.key] = c ? c.value : ''; }
      else {
        const el = R.$(`[name="${nm}"]`, root);
        if (!el) continue;
        out[f.key] = f.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim();
      }
    }
    for (const k of Object.keys(out)) if (out[k] === '' || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
    return out;
  };

  R.checkRanges = (root) => {
    let bad = 0;
    R.$$('input[type=number]', root).forEach(inp => {
      const box = inp.closest('.field'); const w = box && R.$('.warn', box);
      const v = inp.value === '' ? null : Number(inp.value);
      const min = inp.dataset.min === '' ? null : Number(inp.dataset.min);
      const max = inp.dataset.max === '' ? null : Number(inp.dataset.max);
      const out = v !== null && ((min !== null && v < min) || (max !== null && v > max));
      inp.classList.toggle('out-of-range', out);
      if (w) { w.hidden = !out; w.textContent = out ? `ערך חריג (טווח סביר ${min ?? ''}–${max ?? ''}). לבדוק יחידות.` : ''; }
      if (out) bad++;
    });
    return bad;
  };

  /* ---------- תרשימים (SVG) ---------- */
  const PALETTE = ['#127a72', '#d9822b', '#5b6fd6', '#c2477a', '#6a9a3a', '#8a63c9', '#2f8fbf'];
  R.PALETTE = PALETTE;
  function niceTicks(min, max, n = 5) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || mag * 10;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const t = []; for (let v = lo; v <= hi + step / 2; v += step) t.push(Math.round(v * 1000) / 1000);
    return t;
  }

  /** points: [{x, y, g (group), label}] */
  R.scatterChart = ({ points, xLabel, yLabel, diagonal, groups }) => {
    if (!points.length) return R.empty('אין נתונים להצגה', 'chart');
    const W = 640, H = 380, m = { l: 52, r: 16, t: 16, b: 46 };
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    let lo = Math.min(...xs, ...ys), hi = Math.max(...xs, ...ys);
    const xt = niceTicks(diagonal ? lo : Math.min(...xs), diagonal ? hi : Math.max(...xs));
    const yt = niceTicks(diagonal ? lo : Math.min(...ys), diagonal ? hi : Math.max(...ys));
    const X = v => m.l + (v - xt[0]) / (xt[xt.length - 1] - xt[0]) * (W - m.l - m.r);
    const Y = v => H - m.b - (v - yt[0]) / (yt[yt.length - 1] - yt[0]) * (H - m.t - m.b);
    const gl = groups || [...new Set(points.map(p => p.g))];
    const col = g => PALETTE[Math.max(0, gl.indexOf(g)) % PALETTE.length];
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" direction="ltr">`;
    yt.forEach(v => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" class="tick">${v}</text>`; });
    xt.forEach(v => { s += `<text x="${X(v)}" y="${H - m.b + 18}" text-anchor="middle" class="tick">${v}</text>`; });
    if (diagonal) {
      const a = Math.max(xt[0], yt[0]), b = Math.min(xt[xt.length - 1], yt[yt.length - 1]);
      s += `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" class="diag"/><text x="${X(b) - 4}" y="${Y(b) + 14}" text-anchor="end" class="tick">ביולוגי = כרונולוגי</text>`;
    }
    points.forEach(p => { s += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="5" fill="${col(p.g)}" fill-opacity=".75" stroke="#fff" stroke-width="1.2"><title>${esc(p.label || '')}</title></circle>`; });
    s += `<text x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle" class="axis">${esc(xLabel)}</text>`;
    s += `<text x="14" y="${(m.t + H - m.b) / 2}" text-anchor="middle" class="axis" transform="rotate(-90 14 ${(m.t + H - m.b) / 2})">${esc(yLabel)}</text></svg>`;
    const legend = gl.length > 1 ? `<div class="legend">${gl.map(g => `<span><i style="background:${col(g)}"></i>${esc(g)}</span>`).join('')}</div>` : '';
    return s + legend;
  };

  /** series: [{name, color, points:[{x: Date|string, y}]}] */
  R.lineChart = ({ series, yLabel }) => {
    const all = series.flatMap(s => s.points);
    if (!all.length) return R.empty('אין נתונים להצגה', 'chart');
    const W = 640, H = 260, m = { l: 48, r: 18, t: 14, b: 40 };
    const tx = all.map(p => new Date(p.x).getTime());
    let x0 = Math.min(...tx), x1 = Math.max(...tx);
    if (x0 === x1) { x0 -= 864e5 * 30; x1 += 864e5 * 30; }
    const yt = niceTicks(Math.min(...all.map(p => p.y)), Math.max(...all.map(p => p.y)), 4);
    const X = t => m.l + (t - x0) / (x1 - x0) * (W - m.l - m.r);
    const Y = v => H - m.b - (v - yt[0]) / (yt[yt.length - 1] - yt[0]) * (H - m.t - m.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" direction="ltr">`;
    yt.forEach(v => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" class="tick">${v}</text>`; });
    const seen = new Set();
    all.forEach(p => { const k = String(p.x).slice(0, 10); if (seen.has(k)) return; seen.add(k); const t = new Date(p.x).getTime(); s += `<text x="${X(t)}" y="${H - m.b + 18}" text-anchor="middle" class="tick">${R.fmtDate(p.x).slice(0, 5)}/${String(new Date(p.x).getFullYear()).slice(2)}</text>`; });
    series.forEach(se => {
      const pts = se.points.slice().sort((a, b) => new Date(a.x) - new Date(b.x));
      if (pts.length > 1) s += `<polyline fill="none" stroke="${se.color}" stroke-width="2.5" ${se.dash ? 'stroke-dasharray="6 5"' : ''} points="${pts.map(p => `${X(new Date(p.x).getTime()).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}"/>`;
      pts.forEach(p => { s += `<circle cx="${X(new Date(p.x).getTime()).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4.5" fill="${se.color}" stroke="#fff" stroke-width="1.5"><title>${esc(se.name)}: ${p.y}</title></circle>`; });
    });
    s += `<text x="14" y="${(m.t + H - m.b) / 2}" text-anchor="middle" class="axis" transform="rotate(-90 14 ${(m.t + H - m.b) / 2})">${esc(yLabel || '')}</text></svg>`;
    return s + `<div class="legend">${series.map(se => `<span><i style="background:${se.color}"></i>${esc(se.name)}</span>`).join('')}</div>`;
  };

  /** rows: [{label, value, n, sd}] — עמודות אופקיות סביב אפס */
  R.meanBars = (rows, unit = '') => {
    if (!rows.length) return R.empty('אין נתונים להצגה', 'bars');
    const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.value)));
    return `<div class="mbars">${rows.map(r => {
      const w = Math.abs(r.value) / maxAbs * 50;
      const pos = r.value >= 0;
      return `<div class="mbar"><span class="lbl">${esc(r.label)}</span>
        <div class="track"><div class="zero"></div><div class="fill ${pos ? 'pos' : 'neg'}" style="width:${w}%;${pos ? 'left:50%' : `left:${50 - w}%`}"></div></div>
        <span class="val num">${R.fmtSigned(r.value)}${unit}</span><span class="n muted small">n=${r.n}${r.sd != null ? ` · SD ${r.sd}` : ''}</span></div>`;
    }).join('')}</div>`;
  };

  R.progressBars = (rows) => `<div class="bars">${rows.map(r => `<div class="bar-row"><span>${r.label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, r.pct)}%;${r.color ? `background:${r.color}` : ''}"></div></div><span class="num">${esc(r.text)}</span></div>`).join('')}</div>`;
})();
