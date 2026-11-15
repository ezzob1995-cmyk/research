/* =====================================================================
 *  הגדרות חיבור — למלא אחרי יצירת פרויקט ב-Supabase
 *  Supabase → Project Settings → API (או Data API):
 *    SUPABASE_URL  = Project URL       (https://xxxx.supabase.co)
 *    SUPABASE_KEY  = anon / publishable key  (מפתח ציבורי — מותר בדפדפן)
 *  ⚠️ לעולם לא להדביק כאן את ה-service_role / secret key!
 *
 *  כל עוד השדות ריקים — המערכת רצה ב"מצב הדגמה" (הנתונים נשמרים רק
 *  בדפדפן הנוכחי), כדי שאפשר יהיה לנסות אותה לפני ההתקנה.
 * ===================================================================== */
window.APP_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_KEY: '',

  // ניתוק אוטומטי אחרי X דקות ללא פעילות (מחשבים משותפים במחלקה)
  IDLE_LOGOUT_MINUTES: 20
};
