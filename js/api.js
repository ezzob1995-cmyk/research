/* =====================================================================
 *  תקשורת עם השרת (Supabase)
 * ===================================================================== */
(function () {
  const CFG = window.APP_CONFIG || {};
  const CONFIGURED = !!(CFG.SUPABASE_URL && CFG.SUPABASE_KEY);

  class ApiError extends Error { constructor(code) { super(code); this.code = code; } }

  const ERRORS = {
    BAD_CREDENTIALS: 'שם משתמש או סיסמה שגויים',
    USER_DISABLED: 'המשתמש הושבת — פנה/י למנהל המחקר',
    USER_LOCKED: 'יותר מדי ניסיונות כושלים. נסה/י שוב בעוד 15 דקות',
    NOT_AUTHENTICATED: 'פג תוקף ההתחברות — יש להתחבר מחדש',
    FORBIDDEN: 'אין לך הרשאה לפעולה זו',
    FORBIDDEN_FORM: 'אין לך הרשאה להזין טופס זה',
    FORM_INACTIVE: 'הטופס הושבת ע"י המנהל',
    RECORD_LOCKED: 'ההזנה אושרה וננעלה. לשינוי — לבטל את האישור (מנהל / רופא/ה)',
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
    BAD_FORM_KEY: 'מזהה טופס לא תקין — אותיות אנגליות קטנות, ספרות וקו תחתון בלבד',
    BAD_FORM_DEF: 'הגדרת הטופס לא תקינה',
    NOTE_EMPTY: 'ההערה ריקה',
    NETWORK: 'אין חיבור לשרת. בדוק/י חיבור לאינטרנט'
  };
  function message(err) {
    const c = err && (err.code || err.message);
    if (c && /Could not find the function/i.test(c)) return 'השרת לא עודכן — יש להריץ את sql/upgrade_v2.sql ב-Supabase';
    return ERRORS[c] || ('שגיאה: ' + c);
  }

  async function rpc(fn, params) {
    const headers = { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_KEY };
    if (CFG.SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + CFG.SUPABASE_KEY;
    let res;
    try {
      res = await fetch(CFG.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers, body: JSON.stringify(params || {}) });
    } catch (e) { throw new ApiError('NETWORK'); }
    let body = null;
    try { body = await res.json(); } catch (e) { /* empty */ }
    if (!res.ok) throw new ApiError(body && body.message ? String(body.message).trim() : 'HTTP_' + res.status);
    if (body && body.error) throw new ApiError(body.error);
    return body;
  }

  window.API = {
    CONFIGURED, ApiError, message,
    login: (u, p) => rpc('rs_login', { p_username: u, p_password: p }),
    logout: (t) => rpc('rs_logout', { p_token: t }),
    me: (t) => rpc('rs_me', { p_token: t }),
    changePassword: (t, o, n) => rpc('rs_change_password', { p_token: t, p_old: o, p_new: n }),
    saveSettings: (t, s) => rpc('rs_save_settings', { p_token: t, p_settings: s }),
    listForms: (t) => rpc('rs_list_forms', { p_token: t }),
    saveForm: (t, key, def, active, sort) => rpc('rs_save_form', { p_token: t, p_key: key, p_def: def, p_active: active, p_sort: sort }),
    listPatients: (t) => rpc('rs_list_patients', { p_token: t }),
    savePatient: (t, p) => rpc('rs_save_patient', { p_token: t, p_patient: p }),
    listRecords: (t, pid, form) => rpc('rs_list_records', { p_token: t, p_patient_id: pid || null, p_form_type: form || null }),
    saveRecord: (t, r) => rpc('rs_save_record', { p_token: t, p_record: r }),
    deleteRecord: (t, id) => rpc('rs_delete_record', { p_token: t, p_id: id }),
    verifyRecord: (t, id, v) => rpc('rs_verify_record', { p_token: t, p_id: id, p_verified: v }),
    listNotes: (t, pid, status) => rpc('rs_list_notes', { p_token: t, p_patient_id: pid || null, p_status: status || null }),
    addNote: (t, n) => rpc('rs_add_note', { p_token: t, p_note: n }),
    setNoteStatus: (t, id, st) => rpc('rs_set_note_status', { p_token: t, p_id: id, p_status: st }),
    staffList: (t) => rpc('rs_staff_list', { p_token: t }),
    staffSave: (t, s) => rpc('rs_staff_save', { p_token: t, p_staff: s }),
    stats: (t) => rpc('rs_stats', { p_token: t }),
    audit: (t, n) => rpc('rs_audit', { p_token: t, p_limit: n || 300 }),
    exportAll: (t) => rpc('rs_export', { p_token: t })
  };
})();
