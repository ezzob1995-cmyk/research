/* =====================================================================
 *  PhenoAge — Levine et al., Aging 2018 ("An epigenetic biomarker of
 *  aging for lifespan and healthspan"), גרסת הסמנים הקליניים.
 *
 *  הקלט ביחידות המקובלות במעבדות בישראל, והמרה ליחידות המקור:
 *    אלבומין   g/dL   → g/L      (×10)
 *    קריאטינין mg/dL  → µmol/L   (×88.42)
 *    גלוקוז    mg/dL  → mmol/L   (÷18.016)
 *    CRP       mg/L   → mg/dL    (÷10) ואז ln
 *    לימפוציטים %, MCV fL, RDW %, ALP U/L, WBC 10³/µL — ללא המרה
 * ===================================================================== */
(function (global) {
  const COEF = {
    intercept: -19.9067,
    albumin: -0.0336,      // g/L
    creatinine: 0.0095,    // µmol/L
    glucose: 0.1953,       // mmol/L
    lncrp: 0.0954,         // ln(mg/dL)
    lymph: -0.0120,        // %
    mcv: 0.0268,           // fL
    rdw: 0.3306,           // %
    alp: 0.00188,          // U/L
    wbc: 0.0554,           // 10^3/µL
    age: 0.0804            // years
  };
  const GAMMA = 0.0076927;
  const REQUIRED = ['age', 'albumin', 'creatinine', 'glucose', 'crp', 'lymph', 'mcv', 'rdw', 'alp', 'wbc'];

  function num(v) {
    if (v === null || v === undefined || v === '') return NaN;
    return Number(String(v).replace(',', '.'));
  }

  /** d: {age, albumin(g/dL), creatinine(mg/dL), glucose(mg/dL), crp(mg/L), lymph(%), mcv, rdw, alp, wbc} */
  function compute(d) {
    const missing = REQUIRED.filter(k => !isFinite(num(d[k])));
    if (missing.length) return { ok: false, missing };

    let crp_mgL = num(d.crp);
    // CRP של 0 / "<0.1" — ln לא מוגדר; נשתמש בסף הגילוי המקובל
    if (crp_mgL <= 0) crp_mgL = 0.1;

    const x = {
      albumin: num(d.albumin) * 10,
      creatinine: num(d.creatinine) * 88.42,
      glucose: num(d.glucose) / 18.016,
      lncrp: Math.log(crp_mgL / 10),
      lymph: num(d.lymph),
      mcv: num(d.mcv),
      rdw: num(d.rdw),
      alp: num(d.alp),
      wbc: num(d.wbc),
      age: num(d.age)
    };
    let xb = COEF.intercept;
    for (const k of Object.keys(x)) xb += COEF[k] * x[k];

    const mortality = 1 - Math.exp(-Math.exp(xb) * (Math.exp(120 * GAMMA) - 1) / GAMMA);
    if (!(mortality > 0 && mortality < 1)) return { ok: false, error: 'OUT_OF_RANGE' };
    const pheno = 141.50225 + Math.log(-0.00553 * Math.log(1 - mortality)) / 0.090165;
    if (!isFinite(pheno)) return { ok: false, error: 'OUT_OF_RANGE' };

    return {
      ok: true,
      phenoage: round(pheno, 2),
      acceleration: round(pheno - x.age, 2),
      mortality_10y: round(mortality * 100, 2), // % סיכון תמותה ב-10 שנים (מודל)
      xb: round(xb, 4)
    };
  }

  function round(v, d) { const f = Math.pow(10, d); return Math.round(v * f) / f; }

  /** גיל בשנים (עשרוני) לפי חודש לידה YYYY-MM ותאריך בדיקה */
  function ageAt(birthMonth, visitDate) {
    if (!birthMonth || !visitDate) return null;
    const [y, m] = birthMonth.split('-').map(Number);
    if (!y || !m) return null;
    const b = new Date(y, m - 1, 15);
    const v = new Date(visitDate);
    if (isNaN(v)) return null;
    return round((v - b) / (365.2425 * 24 * 3600 * 1000), 1);
  }

  global.PhenoAge = { compute, ageAt, REQUIRED };
  if (typeof module !== 'undefined') module.exports = global.PhenoAge;
})(typeof window !== 'undefined' ? window : globalThis);
