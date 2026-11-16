-- =====================================================================
--  שדרוג גרסה 2 — مرحلة التحديث 2
--  להריץ פעם אחת ב-Supabase → SQL Editor (אחרי schema.sql).
--  לא מוחק שום נתון. אפשר להריץ שוב בבטחה.
--  חדש: טפסים הניתנים לעריכה, הרשאות מפורטות, תפקיד רופא/ה, הערות,
--        אישור (נעילת) הזנות, קריטריוני הכללה/אי-הכללה, מעקב ביקורים.
-- =====================================================================

-- ---------------------------------------------------------------------
--  צוות: תפקיד רופא/ה + הרשאות לכל טופס
-- ---------------------------------------------------------------------
alter table research.staff drop constraint if exists staff_role_check;
alter table research.staff add constraint staff_role_check check (role in ('admin','staff','doctor'));
alter table research.staff add column if not exists form_perms jsonb;
alter table research.staff add column if not exists can_verify boolean not null default false;

-- המרת ההרשאות הישנות (רשימת טפסים + עריכת אחרים) למבנה החדש
update research.staff st set form_perms = (
  select coalesce(jsonb_object_agg(f, jsonb_build_object(
           'enter', true, 'edit_own', true, 'edit_all', st.can_edit_others,
           'delete_own', true, 'delete_all', st.can_edit_others)), '{}'::jsonb)
    from unnest(st.forms) f)
 where st.form_perms is null;
-- מי שהיה מורשה לבדיקות דם — מקבל גם "שינוי תרופתי"
update research.staff set form_perms = form_perms || jsonb_build_object('meds', form_perms->'labs')
 where form_perms ? 'labs' and not form_perms ? 'meds';
update research.staff set form_perms = '{}'::jsonb where form_perms is null;
alter table research.staff alter column form_perms set default '{}'::jsonb;
alter table research.staff alter column form_perms set not null;
update research.staff set can_verify = true where role = 'admin';

-- ---------------------------------------------------------------------
--  הזנות: אישור / נעילה
-- ---------------------------------------------------------------------
alter table research.records add column if not exists verified_by uuid references research.staff(id);
alter table research.records add column if not exists verified_at timestamptz;

-- ---------------------------------------------------------------------
--  הגדרות טפסים (נערכות ממסך הניהול)
-- ---------------------------------------------------------------------
create table if not exists research.form_defs (
  key         text primary key,
  def         jsonb not null,
  active      boolean not null default true,
  sort        int not null default 100,
  updated_by  uuid references research.staff(id),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  הערות לרופא/ה ולצוות
-- ---------------------------------------------------------------------
create table if not exists research.notes (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid references research.patients(id) on delete cascade,
  record_id   uuid references research.records(id) on delete set null,
  parent_id   uuid references research.notes(id) on delete cascade,
  to_role     text not null default 'doctor' check (to_role in ('doctor','team')),
  body        text not null,
  auto        boolean not null default false,
  status      text not null default 'open' check (status in ('open','resolved')),
  created_by  uuid references research.staff(id),
  created_at  timestamptz not null default now(),
  resolved_by uuid references research.staff(id),
  resolved_at timestamptz
);
create index if not exists notes_patient_idx on research.notes(patient_id);
create index if not exists notes_parent_idx  on research.notes(parent_id);

alter table research.form_defs enable row level security;
alter table research.notes     enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema research from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema research from authenticated';
  end if;
end $$;

-- הגדרות חדשות
insert into research.settings(key, value) values
  ('inclusion_criteria', '["גיל 18 ומעלה","מאושפז/ת במחלקה משתתפת","טיפול תרופתי פסיכיאטרי קבוע","הסכמה מדעת חתומה (או אפוטרופוס)"]'),
  ('exclusion_criteria', '["מחלה זיהומית חריפה בעת הבדיקה","מחלת כבד או כליה סופנית","הריון","טיפול בסטרואידים / מדכאי חיסון"]'),
  ('alerts_enabled',     'true'),
  ('due_soon_days',      '30')
on conflict (key) do nothing;

-- טפסי ברירת מחדל (לא דורס טפסים שכבר נערכו)
insert into research.form_defs(key, def, active, sort) values ('_patient', $fdef${"key":"_patient","title":"פרטי מטופל (שדות מחקר)","short":"מטופל","icon":"👤","sort":0,"followup_months":null,"sections":[{"title":"רקע קליני","fields":[{"key":"diagnosis","label":"קבוצת אבחנה","type":"select","options":["סכיזופרניה","הפרעה סכיזואפקטיבית","הפרעה דו-קוטבית","דיכאון מז'ורי","הפרעה פסיכוטית אחרת","אחר"]},{"key":"med_classes","label":"קבוצות תרופות פסיכיאטריות (נוכחי)","type":"checks","options":["אנטיפסיכוטי דור 1","אנטיפסיכוטי דור 2","קלוזפין","אנטיפסיכוטי ארוך טווח (LAI)","ליתיום","ולפרואט / מייצב אחר","נוגד דיכאון","בנזודיאזפינים"]},{"key":"treatment_years","label":"שנות טיפול פסיכיאטרי (הערכה)","type":"number","min":0,"max":80,"step":1},{"key":"onset_age","label":"גיל הופעת המחלה","type":"number","min":5,"max":90,"step":1},{"key":"smoking","label":"עישון","type":"radio","options":["לא מעשן","מעשן","מעשן בעבר"]},{"key":"diabetes","label":"סוכרת ידועה","type":"yesno"},{"key":"consent_date","label":"תאריך הסכמה מדעת","type":"date"},{"key":"notes","label":"הערות","type":"textarea"}]}],"calc":[],"alerts":[]}$fdef$::jsonb, true, 0)
  on conflict (key) do nothing;
insert into research.form_defs(key, def, active, sort) values ('labs', $fdef${"key":"labs","title":"בדיקות דם — נוסחת לווין (PhenoAge)","short":"בדיקות דם","icon":"🧪","sort":1,"followup_months":6,"description":"יש להזין ביחידות המופיעות ליד כל שדה. גלוקוז — רצוי בצום. הגיל מחושב אוטומטית מחודש הלידה.","sections":[{"title":"גיל","fields":[{"key":"age","label":"גיל כרונולוגי בעת הבדיקה","type":"number","unit":"שנים","min":16,"max":110,"step":0.1,"required":true,"autoAge":true}]},{"title":"ביוכימיה","fields":[{"key":"albumin","label":"אלבומין","type":"number","unit":"g/dL","min":1.5,"max":6,"step":0.01,"required":true,"hint":"אם התוצאה בסביבות 40 — זו g/L, יש לחלק ב-10"},{"key":"creatinine","label":"קריאטינין","type":"number","unit":"mg/dL","min":0.2,"max":15,"step":0.01,"required":true,"hint":"אם התוצאה בסביבות 80 — זו µmol/L, יש לחלק ב-88.4"},{"key":"glucose","label":"גלוקוז","type":"number","unit":"mg/dL","min":30,"max":600,"step":1,"required":true},{"key":"fasting","label":"בצום?","type":"yesno"},{"key":"crp","label":"CRP","type":"number","unit":"mg/L","min":0,"max":400,"step":0.01,"required":true,"hint":"תוצאה \"<0.1\" — להקליד 0.1"},{"key":"alp","label":"אלקליין פוספטאז (ALP)","type":"number","unit":"U/L","min":10,"max":1500,"step":1,"required":true}]},{"title":"ספירת דם","fields":[{"key":"wbc","label":"WBC — כדוריות לבנות","type":"number","unit":"10³/µL","min":0.5,"max":50,"step":0.01,"required":true},{"key":"lymph","label":"לימפוציטים","type":"number","unit":"%","min":1,"max":90,"step":0.1,"required":true,"hint":"אחוז — לא ערך מוחלט (#)"},{"key":"mcv","label":"MCV","type":"number","unit":"fL","min":50,"max":130,"step":0.1,"required":true},{"key":"rdw","label":"RDW","type":"number","unit":"%","min":8,"max":30,"step":0.1,"required":true}]},{"title":"נתונים נוספים","fields":[{"key":"weight","label":"משקל","type":"number","unit":"ק\"ג","min":25,"max":300,"step":0.1},{"key":"height","label":"גובה","type":"number","unit":"ס\"מ","min":120,"max":220,"step":1},{"key":"hba1c","label":"HbA1c","type":"number","unit":"%","min":3,"max":20,"step":0.1},{"key":"ldl","label":"LDL","type":"number","unit":"mg/dL","min":10,"max":400,"step":1},{"key":"tg","label":"טריגליצרידים","type":"number","unit":"mg/dL","min":10,"max":3000,"step":1},{"key":"meds_now","label":"תרופות פסיכיאטריות ומינונים בעת הבדיקה","type":"textarea"},{"key":"notes","label":"הערות","type":"textarea"}]}],"calc":[{"type":"phenoage"},{"type":"bmi","weight":"weight","height":"height"}],"alerts":[{"key":"crp","op":"gt","value":10,"msg":"CRP מוגבר (מעל 10 mg/L)"},{"key":"glucose","op":"gt","value":200,"msg":"גלוקוז מעל 200 mg/dL"},{"key":"albumin","op":"lt","value":3,"msg":"אלבומין נמוך (מתחת ל-3 g/dL)"},{"key":"wbc","op":"gt","value":15,"msg":"WBC מעל 15"}]}$fdef$::jsonb, true, 1)
  on conflict (key) do nothing;
insert into research.form_defs(key, def, active, sort) values ('feet', $fdef${"key":"feet","title":"הערכת כפות רגליים","short":"רגליים","icon":"🦶","sort":2,"followup_months":3,"description":"בדיקה ויזואלית ומישושית של שתי כפות הרגליים. ממצא חריג באחת הרגליים — לסמן אותו.","sections":[{"title":"עור וציפורניים","fields":[{"key":"skin","label":"מצב העור","type":"score","options":[["תקין",0],["יובש / קשקשת",1],["סדקים / יבלות",2],["פצע פתוח",3]]},{"key":"nails","label":"ציפורניים","type":"score","options":[["תקינות ומטופלות",0],["ארוכות / לא מטופלות",1],["עבות / פטרייתיות",2],["ציפורן חודרנית / זיהום",3]]},{"key":"color","label":"צבע וטמפרטורה","type":"score","options":[["תקין",0],["אדמומיות / חום מקומי",2],["חיוורון / קור",2],["כחלון / השחרה",3]]},{"key":"hygiene","label":"ניקיון כפות הרגליים","type":"score","options":[["נקיות",0],["מלוכלכות מעט",1],["מלוכלכות מאוד / ריח",2]]}]},{"title":"זרימה ותחושה","fields":[{"key":"edema","label":"בצקת","type":"score","options":[["אין",0],["קלה",1],["בינונית",2],["קשה",3]]},{"key":"pulse_r","label":"דופק דורסליס פדיס — ימין","type":"score","options":[["נמוש",0],["חלש",1],["לא נמוש",2]]},{"key":"pulse_l","label":"דופק דורסליס פדיס — שמאל","type":"score","options":[["נמוש",0],["חלש",1],["לא נמוש",2]]},{"key":"sensation","label":"תחושה (מונופילמנט / מגע)","type":"score","options":[["תקינה",0],["ירודה",2],["חסרה",3],["לא נבדק",0]]}]},{"title":"נוסף","fields":[{"key":"wound_location","label":"מיקום פצע / ממצא","type":"text"},{"key":"footwear","label":"הנעלה","type":"score","options":[["מתאימה",0],["לא מתאימה",1],["הולך יחף",2]]},{"key":"referral","label":"הפניה","type":"checks","options":["פודיאטר","אחות פצעים","רופא","אין צורך"]},{"key":"notes","label":"הערות","type":"textarea"}]}],"calc":[{"type":"score_sum","out":"foot_score","label":"ציון רגליים","level_out":"foot_risk","level_label":"רמת סיכון","levels":[{"max":2,"label":"נמוך"},{"max":6,"label":"בינוני"},{"max":999,"label":"גבוה"}]}],"alerts":[{"key":"skin","op":"eq","value":"פצע פתוח","msg":"פצע פתוח בכף הרגל"},{"key":"color","op":"eq","value":"כחלון / השחרה","msg":"כחלון / השחרה בכף הרגל"},{"key":"nails","op":"eq","value":"ציפורן חודרנית / זיהום","msg":"ציפורן חודרנית / זיהום"},{"key":"foot_score","op":"gt","value":6,"msg":"ציון רגליים גבוה"}]}$fdef$::jsonb, true, 2)
  on conflict (key) do nothing;
insert into research.form_defs(key, def, active, sort) values ('neglect', $fdef${"key":"neglect","title":"הערכת הזנחה עצמית","short":"הזנחה","icon":"🧼","sort":3,"followup_months":3,"description":"דירוג לפי התצפית בשבוע האחרון: 0 = תקין, 1 = הזנחה קלה, 2 = הזנחה משמעותית. (כלי פנימי — אפשר להחליף בכלי מתוקף לפי הפרוטוקול שאושר בהלסינקי.)","sections":[{"title":"טיפול עצמי","fields":[{"key":"bathing","label":"היגיינה אישית / רחצה","type":"score","options":[["0 — תקין",0],["1 — הזנחה קלה",1],["2 — הזנחה משמעותית",2]]},{"key":"clothing","label":"לבוש (ניקיון, התאמה)","type":"score","options":[["0 — תקין",0],["1 — הזנחה קלה",1],["2 — הזנחה משמעותית",2]]},{"key":"oral","label":"היגיינת פה ושיניים","type":"score","options":[["0 — תקין",0],["1 — הזנחה קלה",1],["2 — הזנחה משמעותית",2]]},{"key":"grooming","label":"שיער, זקן וציפורניים","type":"score","options":[["0 — תקין",0],["1 — הזנחה קלה",1],["2 — הזנחה משמעותית",2]]}]},{"title":"תפקוד ובריאות","fields":[{"key":"nutrition","label":"תזונה ושתייה","type":"score","options":[["0 — תקין",0],["1 — הזנחה קלה",1],["2 — הזנחה משמעותית",2]]},{"key":"environment","label":"סדר וניקיון החדר / הסביבה","type":"score","options":[["0 — תקין",0],["1 — הזנחה קלה",1],["2 — הזנחה משמעותית",2]]},{"key":"med_adherence","label":"היענות לטיפול תרופתי","type":"score","options":[["0 — תקין",0],["1 — הזנחה קלה",1],["2 — הזנחה משמעותית",2]]},{"key":"med_care","label":"היענות לבדיקות וטיפול רפואי","type":"score","options":[["0 — תקין",0],["1 — הזנחה קלה",1],["2 — הזנחה משמעותית",2]]},{"key":"adl","label":"תפקוד יומיומי (ADL)","type":"score","options":[["0 — תקין",0],["1 — הזנחה קלה",1],["2 — הזנחה משמעותית",2]]},{"key":"help_seeking","label":"פנייה לעזרה בעת צורך","type":"score","options":[["0 — תקין",0],["1 — הזנחה קלה",1],["2 — הזנחה משמעותית",2]]}]},{"title":"נוסף","fields":[{"key":"source","label":"מקור המידע","type":"checks","options":["תצפית ישירה","דיווח צוות","דיווח המטופל","רשומה רפואית"]},{"key":"notes","label":"הערות","type":"textarea"}]}],"calc":[{"type":"score_sum","out":"neglect_score","label":"ציון הזנחה (0–20)","level_out":"neglect_level","level_label":"רמת הזנחה","levels":[{"max":4,"label":"מינימלית"},{"max":10,"label":"קלה-בינונית"},{"max":999,"label":"משמעותית"}]}],"alerts":[{"key":"neglect_score","op":"gt","value":10,"msg":"הזנחה עצמית משמעותית"}]}$fdef$::jsonb, true, 3)
  on conflict (key) do nothing;
insert into research.form_defs(key, def, active, sort) values ('meds', $fdef${"key":"meds","title":"שינוי בטיפול התרופתי","short":"שינוי תרופתי","icon":"💊","sort":4,"followup_months":null,"description":"כל התחלה, הפסקה או שינוי מינון של תרופה פסיכיאטרית — הזנה נפרדת, בתאריך השינוי.","sections":[{"title":"השינוי","fields":[{"key":"change_type","label":"סוג השינוי","type":"radio","required":true,"options":["התחלה","הפסקה","העלאת מינון","הורדת מינון","החלפה"]},{"key":"drug","label":"שם התרופה","type":"text","required":true},{"key":"med_class","label":"קבוצת התרופה","type":"select","options":["אנטיפסיכוטי דור 1","אנטיפסיכוטי דור 2","קלוזפין","אנטיפסיכוטי ארוך טווח (LAI)","ליתיום","ולפרואט / מייצב אחר","נוגד דיכאון","בנזודיאזפינים","אחר"]},{"key":"dose","label":"מינון חדש (יומי)","type":"text","hint":"לדוגמה: 300 mg"},{"key":"reason","label":"סיבת השינוי","type":"select","options":["חוסר יעילות","תופעות לוואי","היענות","החמרה במצב","שיפור במצב","אחר"]},{"key":"notes","label":"הערות","type":"textarea"}]}],"calc":[],"alerts":[]}$fdef$::jsonb, true, 4)
  on conflict (key) do nothing;

-- ---------------------------------------------------------------------
--  עזרים
-- ---------------------------------------------------------------------
create or replace function research._perm(s research.staff, p_form text, p_action text) returns boolean
language sql stable as $$
  select s.role = 'admin' or coalesce((s.form_perms -> p_form ->> p_action)::boolean, false)
$$;

create or replace function research._user_json(s research.staff) returns json
language sql stable as $$
  select json_build_object(
    'id', s.id, 'username', s.username, 'full_name', s.full_name, 'role', s.role,
    'form_perms', s.form_perms, 'can_add_patients', s.can_add_patients,
    'can_export', s.can_export, 'can_view_stats', s.can_view_stats, 'can_verify', s.can_verify,
    'active', s.active, 'must_change_password', s.must_change_password,
    'last_login', s.last_login, 'created_at', s.created_at)
$$;

create or replace function research._forms_json() returns json
language sql stable security definer set search_path = research, pg_temp as $$
  select coalesce(json_agg(json_build_object('key', key, 'def', def, 'active', active, 'sort', sort) order by sort, key), '[]'::json)
    from research.form_defs
$$;

create or replace function research._open_notes(s research.staff) returns int
language sql stable security definer set search_path = research, pg_temp as $$
  select count(*)::int from research.notes n
   where n.parent_id is null and n.status = 'open'
     and (s.role = 'admin' or (s.role = 'doctor' and n.to_role = 'doctor') or (s.role = 'staff' and n.to_role = 'team'))
$$;

-- ---------------------------------------------------------------------
--  התחברות — מחזירה גם את הטפסים
-- ---------------------------------------------------------------------
create or replace function public.rs_login(p_username text, p_password text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; v_token text;
begin
  select * into s from research.staff where lower(username) = lower(trim(p_username));
  if not found then
    perform pg_sleep(0.5);
    return json_build_object('error', 'BAD_CREDENTIALS');
  end if;
  if not s.active then return json_build_object('error', 'USER_DISABLED'); end if;
  if s.locked_until is not null and s.locked_until > now() then return json_build_object('error', 'USER_LOCKED'); end if;
  if s.password_hash <> extensions.crypt(coalesce(p_password,''), s.password_hash) then
    update research.staff
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
     where id = s.id;
    perform research._log(s.id, 'login_failed', 'staff', s.id::text, null);
    return json_build_object('error', 'BAD_CREDENTIALS');
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into research.sessions(token_hash, staff_id, expires_at)
  values (research._hash_token(v_token), s.id, now() + interval '12 hours');
  delete from research.sessions where expires_at < now();
  update research.staff set failed_attempts = 0, locked_until = null, last_login = now()
   where id = s.id returning * into s;
  perform research._log(s.id, 'login', 'staff', s.id::text, null);
  return json_build_object('token', v_token, 'user', research._user_json(s), 'settings', research._settings_json(),
                           'forms', research._forms_json(), 'open_notes', research._open_notes(s));
end $$;

create or replace function public.rs_me(p_token text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff;
begin
  s := research._auth(p_token);
  return json_build_object('user', research._user_json(s), 'settings', research._settings_json(),
                           'forms', research._forms_json(), 'open_notes', research._open_notes(s));
end $$;

-- ---------------------------------------------------------------------
--  הגדרות
-- ---------------------------------------------------------------------
create or replace function public.rs_save_settings(p_token text, p_settings jsonb) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; k text; v jsonb;
begin
  s := research._auth(p_token);
  if not research._is_admin(s) then raise exception 'FORBIDDEN'; end if;
  for k, v in select * from jsonb_each(p_settings) loop
    if k in ('study_name','wards','target_patients','target_visits','start_date','end_date',
             'inclusion_criteria','exclusion_criteria','alerts_enabled','due_soon_days') then
      insert into research.settings(key, value) values (k, v)
      on conflict (key) do update set value = excluded.value;
    end if;
  end loop;
  perform research._log(s.id, 'save_settings', 'settings', null, p_settings);
  return research._settings_json();
end $$;

-- ---------------------------------------------------------------------
--  טפסים
-- ---------------------------------------------------------------------
create or replace function public.rs_list_forms(p_token text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
begin
  perform research._auth(p_token);
  return research._forms_json();
end $$;

create or replace function public.rs_save_form(p_token text, p_key text, p_def jsonb, p_active boolean, p_sort int) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; v_new boolean;
begin
  s := research._auth(p_token);
  if not research._is_admin(s) then raise exception 'FORBIDDEN'; end if;
  if p_key is null or not (p_key = '_patient' or p_key ~ '^[a-z][a-z0-9_]{1,30}$') then raise exception 'BAD_FORM_KEY'; end if;
  if p_def is null or jsonb_typeof(p_def->'sections') <> 'array' then raise exception 'BAD_FORM_DEF'; end if;
  v_new := not exists (select 1 from research.form_defs where key = p_key);
  insert into research.form_defs(key, def, active, sort, updated_by, updated_at)
  values (p_key, p_def || jsonb_build_object('key', p_key), coalesce(p_active, true), coalesce(p_sort, 100), s.id, now())
  on conflict (key) do update set def = excluded.def, active = excluded.active, sort = excluded.sort,
                                  updated_by = excluded.updated_by, updated_at = now();
  perform research._log(s.id, case when v_new then 'create_form' else 'update_form' end, 'form', p_key,
                        json_build_object('title', p_def->>'title')::jsonb);
  return research._forms_json();
end $$;

-- ---------------------------------------------------------------------
--  מטופלים
-- ---------------------------------------------------------------------
create or replace function public.rs_list_patients(p_token text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff;
begin
  s := research._auth(p_token);
  return coalesce((
    select json_agg(row_to_json(x) order by x.code)
      from (
        select p.id, p.code, p.ward, p.sex, p.birth_month, p.data, p.active,
               p.created_at, p.created_by, cs.full_name as created_by_name,
               (select coalesce(json_object_agg(t.form_type, t.n), '{}'::json)
                  from (select r.form_type, count(*) n from research.records r
                         where r.patient_id = p.id and not r.deleted group by r.form_type) t) as counts,
               (select coalesce(json_object_agg(t.form_type, t.d), '{}'::json)
                  from (select r.form_type, max(r.visit_date) d from research.records r
                         where r.patient_id = p.id and not r.deleted group by r.form_type) t) as last_by_form,
               (select max(r.visit_date) from research.records r where r.patient_id = p.id and not r.deleted) as last_visit,
               (select count(*) from research.notes n where n.patient_id = p.id and n.parent_id is null and n.status = 'open') as open_notes
          from research.patients p left join research.staff cs on cs.id = p.created_by
      ) x), '[]'::json);
end $$;

create or replace function public.rs_save_patient(p_token text, p_patient jsonb) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; v_id uuid; p research.patients; v_code text;
begin
  s := research._auth(p_token);
  if not (research._is_admin(s) or s.can_add_patients) then raise exception 'FORBIDDEN'; end if;
  v_code := trim(coalesce(p_patient->>'code',''));
  if v_code = '' then raise exception 'CODE_REQUIRED'; end if;
  v_id := nullif(p_patient->>'id','')::uuid;
  if exists (select 1 from research.patients where lower(code) = lower(v_code) and id is distinct from v_id) then raise exception 'CODE_EXISTS'; end if;
  if v_id is null then
    insert into research.patients(code, ward, sex, birth_month, data, active, created_by)
    values (v_code, p_patient->>'ward', nullif(p_patient->>'sex',''), nullif(p_patient->>'birth_month',''),
            coalesce(p_patient->'data','{}'::jsonb), coalesce((p_patient->>'active')::boolean, true), s.id)
    returning * into p;
    perform research._log(s.id, 'create_patient', 'patient', p.id::text, json_build_object('code', p.code)::jsonb);
  else
    update research.patients set code = v_code, ward = p_patient->>'ward', sex = nullif(p_patient->>'sex',''),
           birth_month = nullif(p_patient->>'birth_month',''), data = coalesce(p_patient->'data','{}'::jsonb),
           active = coalesce((p_patient->>'active')::boolean, true), updated_by = s.id, updated_at = now()
     where id = v_id returning * into p;
    if not found then raise exception 'NOT_FOUND'; end if;
    perform research._log(s.id, 'update_patient', 'patient', p.id::text, json_build_object('code', p.code)::jsonb);
  end if;
  return row_to_json(p);
end $$;

-- ---------------------------------------------------------------------
--  הזנות
-- ---------------------------------------------------------------------
create or replace function public.rs_list_records(p_token text, p_patient_id uuid default null, p_form_type text default null) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff;
begin
  s := research._auth(p_token);
  return coalesce((
    select json_agg(row_to_json(x) order by x.visit_date desc, x.created_at desc)
      from (
        select r.id, r.patient_id, p.code as patient_code, p.ward, r.form_type, r.visit_date, r.data, r.computed,
               r.created_by, cs.full_name as created_by_name, r.created_at,
               r.updated_by, us.full_name as updated_by_name, r.updated_at,
               r.verified_by, vs.full_name as verified_by_name, r.verified_at
          from research.records r
          join research.patients p on p.id = r.patient_id
          left join research.staff cs on cs.id = r.created_by
          left join research.staff us on us.id = r.updated_by
          left join research.staff vs on vs.id = r.verified_by
         where not r.deleted
           and (p_patient_id is null or r.patient_id = p_patient_id)
           and (p_form_type is null or r.form_type = p_form_type)
      ) x), '[]'::json);
end $$;

create or replace function public.rs_save_record(p_token text, p_record jsonb) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; v_id uuid; r research.records; v_form text;
begin
  s := research._auth(p_token);
  v_form := p_record->>'form_type';
  if v_form is null or v_form = '' then raise exception 'FORM_REQUIRED'; end if;
  if nullif(p_record->>'visit_date','') is null then raise exception 'DATE_REQUIRED'; end if;
  if not exists (select 1 from research.patients where id = (p_record->>'patient_id')::uuid) then raise exception 'NOT_FOUND'; end if;
  v_id := nullif(p_record->>'id','')::uuid;

  if v_id is null then
    if not research._perm(s, v_form, 'enter') then raise exception 'FORBIDDEN_FORM'; end if;
    if not exists (select 1 from research.form_defs where key = v_form and active) then raise exception 'FORM_INACTIVE'; end if;
    insert into research.records(patient_id, form_type, visit_date, data, computed, created_by)
    values ((p_record->>'patient_id')::uuid, v_form, (p_record->>'visit_date')::date,
            coalesce(p_record->'data','{}'::jsonb), coalesce(p_record->'computed','{}'::jsonb), s.id)
    returning * into r;
    perform research._log(s.id, 'create_record', v_form, r.id::text, null);
  else
    select * into r from research.records where id = v_id and not deleted;
    if not found then raise exception 'NOT_FOUND'; end if;
    if r.verified_at is not null then raise exception 'RECORD_LOCKED'; end if;
    if not (research._perm(s, r.form_type, 'edit_all') or (r.created_by = s.id and research._perm(s, r.form_type, 'edit_own'))) then
      raise exception 'FORBIDDEN';
    end if;
    update research.records set visit_date = (p_record->>'visit_date')::date,
           data = coalesce(p_record->'data','{}'::jsonb), computed = coalesce(p_record->'computed','{}'::jsonb),
           updated_by = s.id, updated_at = now()
     where id = v_id returning * into r;
    perform research._log(s.id, 'update_record', r.form_type, r.id::text, null);
  end if;
  return row_to_json(r);
end $$;

create or replace function public.rs_delete_record(p_token text, p_id uuid) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; r research.records;
begin
  s := research._auth(p_token);
  select * into r from research.records where id = p_id and not deleted;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.verified_at is not null then raise exception 'RECORD_LOCKED'; end if;
  if not (research._perm(s, r.form_type, 'delete_all') or (r.created_by = s.id and research._perm(s, r.form_type, 'delete_own'))) then
    raise exception 'FORBIDDEN';
  end if;
  update research.records set deleted = true, updated_by = s.id, updated_at = now() where id = p_id;
  perform research._log(s.id, 'delete_record', r.form_type, r.id::text, null);
  return json_build_object('ok', true);
end $$;

create or replace function public.rs_verify_record(p_token text, p_id uuid, p_verified boolean) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; r research.records;
begin
  s := research._auth(p_token);
  if not (research._is_admin(s) or s.can_verify) then raise exception 'FORBIDDEN'; end if;
  update research.records
     set verified_by = case when p_verified then s.id else null end,
         verified_at = case when p_verified then now() else null end
   where id = p_id and not deleted returning * into r;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform research._log(s.id, case when p_verified then 'verify_record' else 'unverify_record' end, r.form_type, r.id::text, null);
  return row_to_json(r);
end $$;

-- ---------------------------------------------------------------------
--  צוות
-- ---------------------------------------------------------------------
create or replace function public.rs_staff_save(p_token text, p_staff jsonb) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; t research.staff; v_id uuid; v_pw text; v_role text;
begin
  s := research._auth(p_token);
  if not research._is_admin(s) then raise exception 'FORBIDDEN'; end if;
  v_id := nullif(p_staff->>'id','')::uuid;
  v_pw := nullif(p_staff->>'password','');
  v_role := coalesce(nullif(p_staff->>'role',''), 'staff');
  if v_role not in ('admin','staff','doctor') then raise exception 'BAD_ROLE'; end if;
  if v_pw is not null and length(v_pw) < 8 then raise exception 'WEAK_PASSWORD'; end if;
  if trim(coalesce(p_staff->>'username','')) = '' or trim(coalesce(p_staff->>'full_name','')) = '' then
    raise exception 'USERNAME_REQUIRED';
  end if;
  if exists (select 1 from research.staff where lower(username) = lower(trim(p_staff->>'username')) and id is distinct from v_id) then
    raise exception 'USERNAME_EXISTS';
  end if;

  if v_id is null then
    if v_pw is null then raise exception 'PASSWORD_REQUIRED'; end if;
    insert into research.staff(username, full_name, password_hash, role, form_perms, can_add_patients,
                               can_export, can_view_stats, can_verify, active, must_change_password)
    values (trim(p_staff->>'username'), trim(p_staff->>'full_name'),
            extensions.crypt(v_pw, extensions.gen_salt('bf', 10)), v_role,
            coalesce(p_staff->'form_perms', '{}'::jsonb),
            coalesce((p_staff->>'can_add_patients')::boolean, true),
            coalesce((p_staff->>'can_export')::boolean, false),
            coalesce((p_staff->>'can_view_stats')::boolean, false),
            coalesce((p_staff->>'can_verify')::boolean, false),
            coalesce((p_staff->>'active')::boolean, true), true)
    returning * into t;
    perform research._log(s.id, 'create_staff', 'staff', t.id::text, json_build_object('username', t.username)::jsonb);
  else
    if v_id = s.id and (v_role <> 'admin' or coalesce((p_staff->>'active')::boolean, true) = false) then
      raise exception 'CANNOT_DEMOTE_SELF';
    end if;
    update research.staff set
           username = trim(p_staff->>'username'), full_name = trim(p_staff->>'full_name'), role = v_role,
           form_perms       = coalesce(p_staff->'form_perms', '{}'::jsonb),
           can_add_patients = coalesce((p_staff->>'can_add_patients')::boolean, true),
           can_export       = coalesce((p_staff->>'can_export')::boolean, false),
           can_view_stats   = coalesce((p_staff->>'can_view_stats')::boolean, false),
           can_verify       = coalesce((p_staff->>'can_verify')::boolean, false),
           active           = coalesce((p_staff->>'active')::boolean, true),
           password_hash    = case when v_pw is null then password_hash else extensions.crypt(v_pw, extensions.gen_salt('bf', 10)) end,
           must_change_password = case when v_pw is null then must_change_password else (v_id <> s.id) end,
           failed_attempts  = case when v_pw is null then failed_attempts else 0 end,
           locked_until     = case when v_pw is null then locked_until else null end
     where id = v_id returning * into t;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_pw is not null or not t.active then
      delete from research.sessions where staff_id = t.id and t.id <> s.id;
    end if;
    perform research._log(s.id, case when v_pw is null then 'update_staff' else 'reset_password' end,
                          'staff', t.id::text, json_build_object('username', t.username)::jsonb);
  end if;
  return research._user_json(t);
end $$;

-- ---------------------------------------------------------------------
--  הערות
-- ---------------------------------------------------------------------
create or replace function public.rs_list_notes(p_token text, p_patient_id uuid default null, p_status text default null) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
begin
  perform research._auth(p_token);
  return coalesce((
    select json_agg(row_to_json(x) order by x.created_at desc)
      from (
        select n.id, n.patient_id, p.code as patient_code, n.record_id, r.form_type as record_form, r.visit_date as record_date,
               n.parent_id, n.to_role, n.body, n.auto, n.status, n.created_by, cs.full_name as created_by_name, cs.role as created_by_role,
               n.created_at, n.resolved_by, rs.full_name as resolved_by_name, n.resolved_at
          from research.notes n
          left join research.patients p on p.id = n.patient_id
          left join research.records r on r.id = n.record_id
          left join research.staff cs on cs.id = n.created_by
          left join research.staff rs on rs.id = n.resolved_by
         where (p_patient_id is null or n.patient_id = p_patient_id)
           and (p_status is null or n.status = p_status or n.parent_id is not null)
      ) x), '[]'::json);
end $$;

create or replace function public.rs_add_note(p_token text, p_note jsonb) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; n research.notes; v_parent research.notes;
begin
  s := research._auth(p_token);
  if trim(coalesce(p_note->>'body','')) = '' then raise exception 'NOTE_EMPTY'; end if;
  if nullif(p_note->>'parent_id','') is not null then
    select * into v_parent from research.notes where id = (p_note->>'parent_id')::uuid;
    if not found then raise exception 'NOT_FOUND'; end if;
    insert into research.notes(patient_id, record_id, parent_id, to_role, body, created_by)
    values (v_parent.patient_id, v_parent.record_id, v_parent.id, v_parent.to_role, trim(p_note->>'body'), s.id)
    returning * into n;
    -- תגובה פותחת מחדש שרשור סגור
    update research.notes set status = 'open', resolved_by = null, resolved_at = null where id = v_parent.id and status = 'resolved';
  else
    insert into research.notes(patient_id, record_id, to_role, body, auto, created_by)
    values (nullif(p_note->>'patient_id','')::uuid, nullif(p_note->>'record_id','')::uuid,
            coalesce(nullif(p_note->>'to_role',''), 'doctor'), trim(p_note->>'body'),
            coalesce((p_note->>'auto')::boolean, false), s.id)
    returning * into n;
  end if;
  perform research._log(s.id, 'add_note', 'note', n.id::text, null);
  return row_to_json(n);
end $$;

create or replace function public.rs_set_note_status(p_token text, p_id uuid, p_status text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; n research.notes;
begin
  s := research._auth(p_token);
  select * into n from research.notes where id = p_id and parent_id is null;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (s.role in ('admin','doctor') or n.created_by = s.id or (n.to_role = 'team')) then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('open','resolved') then raise exception 'BAD_STATUS'; end if;
  update research.notes set status = p_status,
         resolved_by = case when p_status = 'resolved' then s.id else null end,
         resolved_at = case when p_status = 'resolved' then now() else null end
   where id = p_id returning * into n;
  perform research._log(s.id, case when p_status = 'resolved' then 'resolve_note' else 'reopen_note' end, 'note', n.id::text, null);
  return row_to_json(n);
end $$;

-- ---------------------------------------------------------------------
--  ייצוא (כולל הערות)
-- ---------------------------------------------------------------------
create or replace function public.rs_export(p_token text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff;
begin
  s := research._auth(p_token);
  if not (research._is_admin(s) or s.can_export) then raise exception 'FORBIDDEN'; end if;
  perform research._log(s.id, 'export', null, null, null);
  return json_build_object(
    'patients', public.rs_list_patients(p_token),
    'records',  public.rs_list_records(p_token, null, null),
    'notes',    public.rs_list_notes(p_token, null, null));
end $$;

-- ---------------------------------------------------------------------
--  הרשאות הרצה
-- ---------------------------------------------------------------------
revoke all on all functions in schema research from public;
do $$
declare f text;
begin
  foreach f in array array[
    'rs_login(text,text)','rs_logout(text)','rs_me(text)','rs_change_password(text,text,text)',
    'rs_save_settings(text,jsonb)','rs_list_patients(text)','rs_save_patient(text,jsonb)',
    'rs_list_records(text,uuid,text)','rs_save_record(text,jsonb)','rs_delete_record(text,uuid)',
    'rs_verify_record(text,uuid,boolean)',
    'rs_staff_list(text)','rs_staff_save(text,jsonb)','rs_stats(text)','rs_audit(text,int)','rs_export(text)',
    'rs_list_forms(text)','rs_save_form(text,text,jsonb,boolean,int)',
    'rs_list_notes(text,uuid,text)','rs_add_note(text,jsonb)','rs_set_note_status(text,uuid,text)']
  loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function public.%s to anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', f);
    end if;
  end loop;
end $$;

-- גרסה
insert into research.settings(key, value) values ('schema_version', '2')
on conflict (key) do update set value = '2';
