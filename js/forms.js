/* =====================================================================
 *  הגדרת הטפסים של המחקר
 *  ---------------------------------------------------------------
 *  כאן מוסיפים / משנים שדות או טפסים שלמים — בלי לגעת בשאר הקוד.
 *  סוגי שדות: number, text, textarea, date, select, radio, checks, yesno, score
 *  score = שאלה עם אפשרויות בעלות ניקוד (נסכם אוטומטית ב-compute)
 *  אחרי הוספת טופס חדש: לתת לצוות הרשאה אליו במסך "ניהול צוות".
 * ===================================================================== */

const PATIENT_FIELDS = [
  { key: 'diagnosis', label: 'קבוצת אבחנה', type: 'select',
    options: ['סכיזופרניה', 'הפרעה סכיזואפקטיבית', 'הפרעה דו-קוטבית', 'דיכאון מז\'ורי', 'הפרעה פסיכוטית אחרת', 'אחר'] },
  { key: 'med_classes', label: 'קבוצות תרופות פסיכיאטריות (נוכחי)', type: 'checks',
    options: ['אנטיפסיכוטי דור 1', 'אנטיפסיכוטי דור 2', 'קלוזפין', 'אנטיפסיכוטי ארוך טווח (LAI)', 'ליתיום', 'ולפרואט / מייצב אחר', 'נוגד דיכאון', 'בנזודיאזפינים'] },
  { key: 'treatment_years', label: 'שנות טיפול פסיכיאטרי (הערכה)', type: 'number', min: 0, max: 80, step: 1 },
  { key: 'onset_age', label: 'גיל הופעת המחלה', type: 'number', min: 5, max: 90, step: 1 },
  { key: 'smoking', label: 'עישון', type: 'radio', options: ['לא מעשן', 'מעשן', 'מעשן בעבר'] },
  { key: 'diabetes', label: 'סוכרת ידועה', type: 'yesno' },
  { key: 'consent_date', label: 'תאריך הסכמה מדעת', type: 'date' },
  { key: 'notes', label: 'הערות', type: 'textarea' }
];

const FORMS = {
  /* ------------------------------------------------------------- */
  labs: {
    title: 'בדיקות דם — נוסחת לווין (PhenoAge)',
    short: 'בדיקות דם',
    icon: '🧪',
    description: 'יש להזין ביחידות המופיעות ליד כל שדה. גלוקוז — רצוי בצום. הגיל מחושב אוטומטית מחודש הלידה.',
    sections: [
      { title: 'גיל', fields: [
        { key: 'age', label: 'גיל כרונולוגי בעת הבדיקה', type: 'number', unit: 'שנים', min: 16, max: 110, step: 0.1, required: true, autoAge: true }
      ]},
      { title: 'ביוכימיה', fields: [
        { key: 'albumin',    label: 'אלבומין',               type: 'number', unit: 'g/dL',  min: 1.5, max: 6,   step: 0.01, required: true, hint: 'אם התוצאה בסביבות 40 — זו g/L, יש לחלק ב-10' },
        { key: 'creatinine', label: 'קריאטינין',             type: 'number', unit: 'mg/dL', min: 0.2, max: 15,  step: 0.01, required: true, hint: 'אם התוצאה בסביבות 80 — זו µmol/L, יש לחלק ב-88.4' },
        { key: 'glucose',    label: 'גלוקוז',                type: 'number', unit: 'mg/dL', min: 30,  max: 600, step: 1,    required: true },
        { key: 'fasting',    label: 'בצום?',                 type: 'yesno' },
        { key: 'crp',        label: 'CRP',                   type: 'number', unit: 'mg/L',  min: 0,   max: 400, step: 0.01, required: true, hint: 'תוצאה "<0.1" — להקליד 0.1' },
        { key: 'alp',        label: 'אלקליין פוספטאז (ALP)', type: 'number', unit: 'U/L',   min: 10,  max: 1500, step: 1,   required: true }
      ]},
      { title: 'ספירת דם', fields: [
        { key: 'wbc',   label: 'WBC — כדוריות לבנות', type: 'number', unit: '10³/µL', min: 0.5, max: 50,  step: 0.01, required: true },
        { key: 'lymph', label: 'לימפוציטים',          type: 'number', unit: '%',      min: 1,   max: 90,  step: 0.1,  required: true, hint: 'אחוז — לא ערך מוחלט (#)' },
        { key: 'mcv',   label: 'MCV',                 type: 'number', unit: 'fL',     min: 50,  max: 130, step: 0.1,  required: true },
        { key: 'rdw',   label: 'RDW',                 type: 'number', unit: '%',      min: 8,   max: 30,  step: 0.1,  required: true }
      ]},
      { title: 'נתונים נוספים (לא חובה)', fields: [
        { key: 'weight', label: 'משקל', type: 'number', unit: 'ק"ג', min: 25, max: 300, step: 0.1 },
        { key: 'height', label: 'גובה', type: 'number', unit: 'ס"מ', min: 120, max: 220, step: 1 },
        { key: 'hba1c',  label: 'HbA1c', type: 'number', unit: '%', min: 3, max: 20, step: 0.1 },
        { key: 'ldl',    label: 'LDL', type: 'number', unit: 'mg/dL', min: 10, max: 400, step: 1 },
        { key: 'tg',     label: 'טריגליצרידים', type: 'number', unit: 'mg/dL', min: 10, max: 3000, step: 1 },
        { key: 'meds_now', label: 'תרופות פסיכיאטריות ומינונים בעת הבדיקה', type: 'textarea' },
        { key: 'notes',  label: 'הערות', type: 'textarea' }
      ]}
    ],
    compute(d) {
      const out = {};
      const r = PhenoAge.compute(d);
      if (r.ok) Object.assign(out, { phenoage: r.phenoage, acceleration: r.acceleration, mortality_10y: r.mortality_10y });
      const w = Number(d.weight), h = Number(d.height);
      if (w > 0 && h > 0) out.bmi = Math.round(w / Math.pow(h / 100, 2) * 10) / 10;
      return out;
    },
    computedLabels: { phenoage: 'גיל ביולוגי (PhenoAge)', acceleration: 'פער (ביולוגי − כרונולוגי)', mortality_10y: 'סיכון מודל ל-10 שנים %', bmi: 'BMI' },
    summary: (r) => r.computed && r.computed.phenoage != null
      ? `גיל ביולוגי ${r.computed.phenoage} · פער ${fmtSigned(r.computed.acceleration)}`
      : 'חסרים נתונים לחישוב'
  },

  /* ------------------------------------------------------------- */
  feet: {
    title: 'הערכת כפות רגליים',
    short: 'רגליים',
    icon: '🦶',
    description: 'בדיקה ויזואלית ומישושית של שתי כפות הרגליים. ממצא חריג באחת הרגליים — לסמן אותו.',
    sections: [
      { title: 'עור וציפורניים', fields: [
        { key: 'skin', label: 'מצב העור', type: 'score', options: [['תקין', 0], ['יובש / קשקשת', 1], ['סדקים / יבלות', 2], ['פצע פתוח', 3]] },
        { key: 'nails', label: 'ציפורניים', type: 'score', options: [['תקינות ומטופלות', 0], ['ארוכות / לא מטופלות', 1], ['עבות / פטרייתיות', 2], ['ציפורן חודרנית / זיהום', 3]] },
        { key: 'color', label: 'צבע וטמפרטורה', type: 'score', options: [['תקין', 0], ['אדמומיות / חום מקומי', 2], ['חיוורון / קור', 2], ['כחלון / השחרה', 3]] },
        { key: 'hygiene', label: 'ניקיון כפות הרגליים', type: 'score', options: [['נקיות', 0], ['מלוכלכות מעט', 1], ['מלוכלכות מאוד / ריח', 2]] }
      ]},
      { title: 'זרימה ותחושה', fields: [
        { key: 'edema', label: 'בצקת', type: 'score', options: [['אין', 0], ['קלה', 1], ['בינונית', 2], ['קשה', 3]] },
        { key: 'pulse_r', label: 'דופק דורסליס פדיס — ימין', type: 'score', options: [['נמוש', 0], ['חלש', 1], ['לא נמוש', 2]] },
        { key: 'pulse_l', label: 'דופק דורסליס פדיס — שמאל', type: 'score', options: [['נמוש', 0], ['חלש', 1], ['לא נמוש', 2]] },
        { key: 'sensation', label: 'תחושה (מונופילמנט / מגע)', type: 'score', options: [['תקינה', 0], ['ירודה', 2], ['חסרה', 3], ['לא נבדק', 0]] }
      ]},
      { title: 'נוסף', fields: [
        { key: 'wound_location', label: 'מיקום פצע / ממצא', type: 'text' },
        { key: 'footwear', label: 'הנעלה', type: 'score', options: [['מתאימה', 0], ['לא מתאימה', 1], ['הולך יחף', 2]] },
        { key: 'referral', label: 'הפניה', type: 'checks', options: ['פודיאטר', 'אחות פצעים', 'רופא', 'אין צורך'] },
        { key: 'notes', label: 'הערות', type: 'textarea' }
      ]}
    ],
    compute(d) {
      const keys = ['skin', 'nails', 'color', 'hygiene', 'edema', 'pulse_r', 'pulse_l', 'sensation', 'footwear'];
      const answered = keys.filter(k => d[k] !== undefined && d[k] !== '');
      if (!answered.length) return {};
      const score = answered.reduce((s, k) => s + scoreOf(FORMS.feet, k, d[k]), 0);
      const level = score <= 2 ? 'נמוך' : score <= 6 ? 'בינוני' : 'גבוה';
      return { foot_score: score, foot_risk: level, answered: answered.length };
    },
    computedLabels: { foot_score: 'ציון רגליים', foot_risk: 'רמת סיכון', answered: 'פריטים שנענו' },
    summary: (r) => r.computed && r.computed.foot_score != null ? `ציון ${r.computed.foot_score} · סיכון ${r.computed.foot_risk}` : ''
  },

  /* ------------------------------------------------------------- */
  neglect: {
    title: 'הערכת הזנחה עצמית',
    short: 'הזנחה',
    icon: '🧼',
    description: 'דירוג לפי התצפית בשבוע האחרון: 0 = תקין, 1 = הזנחה קלה, 2 = הזנחה משמעותית. (כלי פנימי — אפשר להחליף בכלי מתוקף לפי הפרוטוקול שאושר בהלסינקי.)',
    sections: [
      { title: 'טיפול עצמי', fields: [
        { key: 'bathing',  label: 'היגיינה אישית / רחצה',      type: 'score', options: SCALE3() },
        { key: 'clothing', label: 'לבוש (ניקיון, התאמה)',     type: 'score', options: SCALE3() },
        { key: 'oral',     label: 'היגיינת פה ושיניים',       type: 'score', options: SCALE3() },
        { key: 'grooming', label: 'שיער, זקן וציפורניים',     type: 'score', options: SCALE3() }
      ]},
      { title: 'תפקוד ובריאות', fields: [
        { key: 'nutrition',   label: 'תזונה ושתייה',                  type: 'score', options: SCALE3() },
        { key: 'environment', label: 'סדר וניקיון החדר / הסביבה',     type: 'score', options: SCALE3() },
        { key: 'med_adherence', label: 'היענות לטיפול תרופתי',         type: 'score', options: SCALE3() },
        { key: 'med_care',    label: 'היענות לבדיקות וטיפול רפואי',  type: 'score', options: SCALE3() },
        { key: 'adl',         label: 'תפקוד יומיומי (ADL)',            type: 'score', options: SCALE3() },
        { key: 'help_seeking', label: 'פנייה לעזרה בעת צורך',          type: 'score', options: SCALE3() }
      ]},
      { title: 'נוסף', fields: [
        { key: 'source', label: 'מקור המידע', type: 'checks', options: ['תצפית ישירה', 'דיווח צוות', 'דיווח המטופל', 'רשומה רפואית'] },
        { key: 'notes', label: 'הערות', type: 'textarea' }
      ]}
    ],
    compute(d) {
      const keys = ['bathing', 'clothing', 'oral', 'grooming', 'nutrition', 'environment', 'med_adherence', 'med_care', 'adl', 'help_seeking'];
      const answered = keys.filter(k => d[k] !== undefined && d[k] !== '');
      if (!answered.length) return {};
      const score = answered.reduce((s, k) => s + scoreOf(FORMS.neglect, k, d[k]), 0);
      const level = score <= 4 ? 'מינימלית' : score <= 10 ? 'קלה-בינונית' : 'משמעותית';
      return { neglect_score: score, neglect_level: level, answered: answered.length };
    },
    computedLabels: { neglect_score: 'ציון הזנחה (0–20)', neglect_level: 'רמת הזנחה', answered: 'פריטים שנענו' },
    summary: (r) => r.computed && r.computed.neglect_score != null ? `ציון ${r.computed.neglect_score} · ${r.computed.neglect_level}` : ''
  }
};

/* ---- עזרים ---- */
function SCALE3() { return [['0 — תקין', 0], ['1 — הזנחה קלה', 1], ['2 — הזנחה משמעותית', 2]]; }

function scoreOf(form, key, value) {
  for (const s of form.sections) for (const f of s.fields) {
    if (f.key === key && f.type === 'score') {
      const o = f.options.find(o => o[0] === value);
      return o ? o[1] : 0;
    }
  }
  return 0;
}

function fmtSigned(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return (n > 0 ? '+' : '') + n;
}

function allFields(form) { return form.sections.flatMap(s => s.fields); }
