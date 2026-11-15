-- =====================================================================
--  מערכת מחקר מחלקתי — סכמת מסד נתונים ל-Supabase (PostgreSQL)
--  הרצה: Supabase → SQL Editor → להדביק את כל הקובץ → Run
--  אפשר להריץ שוב בבטחה (הקובץ לא מוחק נתונים קיימים).
--
--  עקרון אבטחה: הטבלאות יושבות בסכמה פרטית "research" שאינה חשופה
--  לאינטרנט. הדפדפן יכול רק לקרוא לפונקציות rs_* , וכל פונקציה בודקת
--  טוקן התחברות והרשאות לפני שהיא נוגעת בנתונים.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists research;

-- ---------------------------------------------------------------------
--  טבלאות
-- ---------------------------------------------------------------------
create table if not exists research.staff (
  id                   uuid primary key default gen_random_uuid(),
  username             text not null unique,
  full_name            text not null,
  password_hash        text not null,
  role                 text not null default 'staff' check (role in ('admin','staff')),
  forms                text[] not null default array['labs','feet','neglect'],
  can_add_patients     boolean not null default true,
  can_edit_others      boolean not null default false,
  can_export           boolean not null default false,
  can_view_stats       boolean not null default false,
  active               boolean not null default true,
  must_change_password boolean not null default true,
  failed_attempts      int not null default 0,
  locked_until         timestamptz,
  last_login           timestamptz,
  created_at           timestamptz not null default now()
);

create table if not exists research.sessions (
  token_hash  text primary key,
  staff_id    uuid not null references research.staff(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create table if not exists research.patients (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- מספר סידורי (ללא פרטים מזהים!)
  ward        text,
  sex         text check (sex in ('M','F') or sex is null),
  birth_month text,                          -- YYYY-MM (לחישוב גיל בלבד)
  data        jsonb not null default '{}'::jsonb,
  active      boolean not null default true, -- false = פרש מהמחקר
  created_by  uuid references research.staff(id),
  created_at  timestamptz not null default now(),
  updated_by  uuid references research.staff(id),
  updated_at  timestamptz
);

create table if not exists research.records (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references research.patients(id) on delete cascade,
  form_type   text not null,
  visit_date  date not null,
  data        jsonb not null default '{}'::jsonb,
  computed    jsonb not null default '{}'::jsonb,
  deleted     boolean not null default false,
  created_by  uuid references research.staff(id),
  created_at  timestamptz not null default now(),
  updated_by  uuid references research.staff(id),
  updated_at  timestamptz
);
create index if not exists records_patient_idx on research.records(patient_id);
create index if not exists records_form_idx    on research.records(form_type);
create index if not exists records_creator_idx on research.records(created_by);

create table if not exists research.audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  staff_id   uuid references research.staff(id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  text,
  details    jsonb
);

create table if not exists research.settings (
  key   text primary key,
  value jsonb not null
);

-- הגנה כפולה: RLS פעיל ללא מדיניות = אין גישה ישירה לאף אחד
alter table research.staff     enable row level security;
alter table research.sessions  enable row level security;
alter table research.patients  enable row level security;
alter table research.records   enable row level security;
alter table research.audit_log enable row level security;
alter table research.settings  enable row level security;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema research from anon';
    execute 'revoke all on all tables in schema research from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema research from authenticated';
    execute 'revoke all on all tables in schema research from authenticated';
  end if;
end $$;

-- הגדרות ברירת מחדל
insert into research.settings(key, value) values
  ('study_name',        '"מחקר מחלקתי — גיל ביולוגי מול גיל כרונולוגי"'),
  ('wards',             '["המחלקה שלנו","מחלקה סגורה נשים"]'),
  ('target_patients',   '60'),
  ('target_visits',     '2'),
  ('start_date',        'null'),
  ('end_date',          'null')
on conflict (key) do nothing;

-- מנהל ראשוני: admin / ChangeMe123!  (חובה להחליף בכניסה הראשונה)
insert into research.staff(username, full_name, password_hash, role, can_export, can_view_stats, can_edit_others)
values ('admin', 'מנהל המחקר', extensions.crypt('ChangeMe123!', extensions.gen_salt('bf', 10)), 'admin', true, true, true)
on conflict (username) do nothing;

-- ---------------------------------------------------------------------
--  פונקציות עזר פנימיות (לא חשופות)
-- ---------------------------------------------------------------------
create or replace function research._hash_token(p_token text) returns text
language sql immutable set search_path = research, extensions, pg_temp as $$
  select encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
$$;

create or replace function research._auth(p_token text) returns research.staff
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff;
begin
  select st.* into s
    from research.sessions se join research.staff st on st.id = se.staff_id
   where se.token_hash = research._hash_token(p_token) and se.expires_at > now();
  if not found or not s.active then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  -- הארכת תוקף (12 שעות מהפעולה האחרונה)
  update research.sessions set expires_at = now() + interval '12 hours'
   where token_hash = research._hash_token(p_token);
  return s;
end $$;

create or replace function research._is_admin(s research.staff) returns boolean
language sql immutable as $$ select s.role = 'admin' $$;

create or replace function research._log(p_staff uuid, p_action text, p_entity text, p_entity_id text, p_details jsonb)
returns void language sql security definer set search_path = research, pg_temp as $$
  insert into research.audit_log(staff_id, action, entity, entity_id, details)
  values (p_staff, p_action, p_entity, p_entity_id, p_details)
$$;

create or replace function research._user_json(s research.staff) returns json
language sql stable as $$
  select json_build_object(
    'id', s.id, 'username', s.username, 'full_name', s.full_name, 'role', s.role,
    'forms', s.forms, 'can_add_patients', s.can_add_patients, 'can_edit_others', s.can_edit_others,
    'can_export', s.can_export, 'can_view_stats', s.can_view_stats, 'active', s.active,
    'must_change_password', s.must_change_password, 'last_login', s.last_login, 'created_at', s.created_at)
$$;

create or replace function research._settings_json() returns json
language sql stable security definer set search_path = research, pg_temp as $$
  select coalesce(json_object_agg(key, value), '{}'::json) from research.settings
$$;

-- ---------------------------------------------------------------------
--  API — התחברות
-- ---------------------------------------------------------------------
create or replace function public.rs_login(p_username text, p_password text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; v_token text;
begin
  select * into s from research.staff where lower(username) = lower(trim(p_username));
  -- שגיאות התחברות מוחזרות (לא raise) כדי שמונה הניסיונות הכושלים יישמר
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
  return json_build_object('token', v_token, 'user', research._user_json(s), 'settings', research._settings_json());
end $$;

create or replace function public.rs_logout(p_token text) returns json
language sql security definer set search_path = research, extensions, pg_temp as $$
  delete from research.sessions where token_hash = research._hash_token(p_token);
  select json_build_object('ok', true);
$$;

create or replace function public.rs_me(p_token text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff;
begin
  s := research._auth(p_token);
  return json_build_object('user', research._user_json(s), 'settings', research._settings_json());
end $$;

create or replace function public.rs_change_password(p_token text, p_old text, p_new text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff;
begin
  s := research._auth(p_token);
  if s.password_hash <> extensions.crypt(p_old, s.password_hash) then raise exception 'BAD_OLD_PASSWORD'; end if;
  if length(coalesce(p_new,'')) < 8 then raise exception 'WEAK_PASSWORD'; end if;
  update research.staff set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)),
                            must_change_password = false where id = s.id;
  -- ניתוק כל החיבורים האחרים
  delete from research.sessions where staff_id = s.id and token_hash <> research._hash_token(p_token);
  perform research._log(s.id, 'change_password', 'staff', s.id::text, null);
  return json_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  API — הגדרות מחקר
-- ---------------------------------------------------------------------
create or replace function public.rs_save_settings(p_token text, p_settings jsonb) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; k text; v jsonb;
begin
  s := research._auth(p_token);
  if not research._is_admin(s) then raise exception 'FORBIDDEN'; end if;
  for k, v in select * from jsonb_each(p_settings) loop
    if k in ('study_name','wards','target_patients','target_visits','start_date','end_date') then
      insert into research.settings(key, value) values (k, v)
      on conflict (key) do update set value = excluded.value;
    end if;
  end loop;
  perform research._log(s.id, 'save_settings', 'settings', null, p_settings);
  return research._settings_json();
end $$;

-- ---------------------------------------------------------------------
--  API — מטופלים
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
               (select max(r.visit_date) from research.records r where r.patient_id = p.id and not r.deleted) as last_visit
          from research.patients p left join research.staff cs on cs.id = p.created_by
      ) x), '[]'::json);
end $$;

create or replace function public.rs_save_patient(p_token text, p_patient jsonb) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; v_id uuid; p research.patients; v_code text;
begin
  s := research._auth(p_token);
  v_code := trim(coalesce(p_patient->>'code',''));
  if v_code = '' then raise exception 'CODE_REQUIRED'; end if;
  v_id := nullif(p_patient->>'id','')::uuid;

  if v_id is null then
    if not (research._is_admin(s) or s.can_add_patients) then raise exception 'FORBIDDEN'; end if;
    if exists (select 1 from research.patients where lower(code) = lower(v_code)) then raise exception 'CODE_EXISTS'; end if;
    insert into research.patients(code, ward, sex, birth_month, data, active, created_by)
    values (v_code, p_patient->>'ward', nullif(p_patient->>'sex',''), nullif(p_patient->>'birth_month',''),
            coalesce(p_patient->'data','{}'::jsonb), coalesce((p_patient->>'active')::boolean, true), s.id)
    returning * into p;
    perform research._log(s.id, 'create_patient', 'patient', p.id::text, json_build_object('code', p.code)::jsonb);
  else
    select * into p from research.patients where id = v_id;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not (research._is_admin(s) or s.can_edit_others or p.created_by = s.id) then raise exception 'FORBIDDEN'; end if;
    if exists (select 1 from research.patients where lower(code) = lower(v_code) and id <> v_id) then raise exception 'CODE_EXISTS'; end if;
    update research.patients set code = v_code, ward = p_patient->>'ward', sex = nullif(p_patient->>'sex',''),
           birth_month = nullif(p_patient->>'birth_month',''), data = coalesce(p_patient->'data','{}'::jsonb),
           active = coalesce((p_patient->>'active')::boolean, true), updated_by = s.id, updated_at = now()
     where id = v_id returning * into p;
    perform research._log(s.id, 'update_patient', 'patient', p.id::text, json_build_object('code', p.code)::jsonb);
  end if;
  return row_to_json(p);
end $$;

-- ---------------------------------------------------------------------
--  API — רשומות (בדיקות / הערכות)
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
               r.updated_by, us.full_name as updated_by_name, r.updated_at
          from research.records r
          join research.patients p on p.id = r.patient_id
          left join research.staff cs on cs.id = r.created_by
          left join research.staff us on us.id = r.updated_by
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
  if not (research._is_admin(s) or v_form = any(s.forms)) then raise exception 'FORBIDDEN_FORM'; end if;
  if nullif(p_record->>'visit_date','') is null then raise exception 'DATE_REQUIRED'; end if;
  if not exists (select 1 from research.patients where id = (p_record->>'patient_id')::uuid) then raise exception 'NOT_FOUND'; end if;
  v_id := nullif(p_record->>'id','')::uuid;

  if v_id is null then
    insert into research.records(patient_id, form_type, visit_date, data, computed, created_by)
    values ((p_record->>'patient_id')::uuid, v_form, (p_record->>'visit_date')::date,
            coalesce(p_record->'data','{}'::jsonb), coalesce(p_record->'computed','{}'::jsonb), s.id)
    returning * into r;
    perform research._log(s.id, 'create_record', v_form, r.id::text, null);
  else
    select * into r from research.records where id = v_id and not deleted;
    if not found then raise exception 'NOT_FOUND'; end if;
    if not (research._is_admin(s) or s.can_edit_others or r.created_by = s.id) then raise exception 'FORBIDDEN'; end if;
    update research.records set visit_date = (p_record->>'visit_date')::date,
           data = coalesce(p_record->'data','{}'::jsonb), computed = coalesce(p_record->'computed','{}'::jsonb),
           updated_by = s.id, updated_at = now()
     where id = v_id returning * into r;
    perform research._log(s.id, 'update_record', v_form, r.id::text, null);
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
  if not (research._is_admin(s) or s.can_edit_others or r.created_by = s.id) then raise exception 'FORBIDDEN'; end if;
  update research.records set deleted = true, updated_by = s.id, updated_at = now() where id = p_id;
  perform research._log(s.id, 'delete_record', r.form_type, r.id::text, null);
  return json_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  API — ניהול צוות (מנהל בלבד)
-- ---------------------------------------------------------------------
create or replace function public.rs_staff_list(p_token text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff;
begin
  s := research._auth(p_token);
  if not research._is_admin(s) then raise exception 'FORBIDDEN'; end if;
  return coalesce((select json_agg(research._user_json(st) order by st.role, st.full_name) from research.staff st), '[]'::json);
end $$;

create or replace function public.rs_staff_save(p_token text, p_staff jsonb) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; t research.staff; v_id uuid; v_pw text; v_forms text[];
begin
  s := research._auth(p_token);
  if not research._is_admin(s) then raise exception 'FORBIDDEN'; end if;
  v_id := nullif(p_staff->>'id','')::uuid;
  v_pw := nullif(p_staff->>'password','');
  if v_pw is not null and length(v_pw) < 8 then raise exception 'WEAK_PASSWORD'; end if;
  if trim(coalesce(p_staff->>'username','')) = '' or trim(coalesce(p_staff->>'full_name','')) = '' then
    raise exception 'USERNAME_REQUIRED';
  end if;
  v_forms := coalesce(array(select jsonb_array_elements_text(p_staff->'forms')), array[]::text[]);

  if v_id is null then
    if v_pw is null then raise exception 'PASSWORD_REQUIRED'; end if;
    if exists (select 1 from research.staff where lower(username) = lower(trim(p_staff->>'username'))) then
      raise exception 'USERNAME_EXISTS';
    end if;
    insert into research.staff(username, full_name, password_hash, role, forms, can_add_patients, can_edit_others,
                               can_export, can_view_stats, active, must_change_password)
    values (trim(p_staff->>'username'), trim(p_staff->>'full_name'),
            extensions.crypt(v_pw, extensions.gen_salt('bf', 10)),
            coalesce(nullif(p_staff->>'role',''),'staff'), v_forms,
            coalesce((p_staff->>'can_add_patients')::boolean, true),
            coalesce((p_staff->>'can_edit_others')::boolean, false),
            coalesce((p_staff->>'can_export')::boolean, false),
            coalesce((p_staff->>'can_view_stats')::boolean, false),
            coalesce((p_staff->>'active')::boolean, true), true)
    returning * into t;
    perform research._log(s.id, 'create_staff', 'staff', t.id::text, json_build_object('username', t.username)::jsonb);
  else
    if exists (select 1 from research.staff where lower(username) = lower(trim(p_staff->>'username')) and id <> v_id) then
      raise exception 'USERNAME_EXISTS';
    end if;
    -- מניעת נעילה עצמית: מנהל לא יכול להוריד לעצמו הרשאת מנהל או להשבית את עצמו
    if v_id = s.id and (coalesce(p_staff->>'role','admin') <> 'admin' or coalesce((p_staff->>'active')::boolean, true) = false) then
      raise exception 'CANNOT_DEMOTE_SELF';
    end if;
    update research.staff set
           username = trim(p_staff->>'username'), full_name = trim(p_staff->>'full_name'),
           role = coalesce(nullif(p_staff->>'role',''),'staff'), forms = v_forms,
           can_add_patients = coalesce((p_staff->>'can_add_patients')::boolean, true),
           can_edit_others  = coalesce((p_staff->>'can_edit_others')::boolean, false),
           can_export       = coalesce((p_staff->>'can_export')::boolean, false),
           can_view_stats   = coalesce((p_staff->>'can_view_stats')::boolean, false),
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
--  API — סטטיסטיקה, התקדמות וביצועים
-- ---------------------------------------------------------------------
create or replace function public.rs_stats(p_token text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff;
begin
  s := research._auth(p_token);
  if not (research._is_admin(s) or s.can_view_stats) then raise exception 'FORBIDDEN'; end if;
  return json_build_object(
    'settings', research._settings_json(),
    'patients_total',  (select count(*) from research.patients),
    'patients_active', (select count(*) from research.patients where active),
    'records_total',   (select count(*) from research.records where not deleted),
    'by_form', (select coalesce(json_object_agg(form_type, n), '{}'::json)
                  from (select form_type, count(*) n from research.records where not deleted group by form_type) t),
    'patients_with_form', (select coalesce(json_object_agg(form_type, n), '{}'::json)
                  from (select form_type, count(distinct patient_id) n from research.records where not deleted group by form_type) t),
    'by_ward', (select coalesce(json_agg(t), '[]'::json) from (
                  select coalesce(p.ward,'—') ward, count(distinct p.id) patients,
                         count(r.id) filter (where r.id is not null) records
                    from research.patients p left join research.records r on r.patient_id = p.id and not r.deleted
                   group by coalesce(p.ward,'—') order by 1) t),
    'by_month', (select coalesce(json_agg(t order by t.month), '[]'::json) from (
                  select to_char(date_trunc('month', created_at), 'YYYY-MM') as month, count(*) n
                    from research.records where not deleted and created_at > now() - interval '12 months'
                   group by 1) t),
    'staff', (select coalesce(json_agg(t order by t.records_total desc), '[]'::json) from (
                  select st.id, st.full_name, st.username, st.role, st.active, st.last_login,
                         (select count(*) from research.records r where r.created_by = st.id and not r.deleted) records_total,
                         (select count(*) from research.records r where r.created_by = st.id and not r.deleted
                             and r.created_at >= date_trunc('month', now())) records_month,
                         (select count(*) from research.records r where r.created_by = st.id and not r.deleted
                             and r.created_at >= now() - interval '7 days') records_week,
                         (select count(*) from research.records r where r.updated_by = st.id and r.updated_at is not null) edits,
                         (select count(*) from research.patients p where p.created_by = st.id) patients_added,
                         (select count(distinct date(r.created_at)) from research.records r where r.created_by = st.id) active_days,
                         (select max(r.created_at) from research.records r where r.created_by = st.id) last_entry,
                         (select coalesce(json_object_agg(form_type, n), '{}'::json) from (
                              select r.form_type, count(*) n from research.records r
                               where r.created_by = st.id and not r.deleted group by r.form_type) f) by_form
                    from research.staff st) t),
    'phenoage', (select coalesce(json_agg(t), '[]'::json) from (
                  select coalesce(p.ward,'—') ward, count(*) n,
                         round(avg((r.computed->>'acceleration')::numeric), 2) avg_accel,
                         round(avg((r.computed->>'phenoage')::numeric), 1) avg_pheno,
                         round(avg((r.data->>'age')::numeric), 1) avg_age
                    from research.records r join research.patients p on p.id = r.patient_id
                   where not r.deleted and r.form_type = 'labs' and r.computed ? 'acceleration'
                   group by coalesce(p.ward,'—') order by 1) t),
    'visits_distribution', (select coalesce(json_agg(t order by t.visits), '[]'::json) from (
                  select visits, count(*) patients from (
                    select p.id, count(r.id) filter (where r.form_type = 'labs') visits
                      from research.patients p left join research.records r on r.patient_id = p.id and not r.deleted
                     group by p.id) v group by visits) t)
  );
end $$;

create or replace function public.rs_audit(p_token text, p_limit int default 200) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff;
begin
  s := research._auth(p_token);
  if not research._is_admin(s) then raise exception 'FORBIDDEN'; end if;
  return coalesce((select json_agg(t) from (
    select a.id, a.at, a.action, a.entity, a.entity_id, a.details, st.full_name
      from research.audit_log a left join research.staff st on st.id = a.staff_id
     order by a.at desc limit least(coalesce(p_limit,200), 2000)) t), '[]'::json);
end $$;

create or replace function public.rs_export(p_token text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff;
begin
  s := research._auth(p_token);
  if not (research._is_admin(s) or s.can_export) then raise exception 'FORBIDDEN'; end if;
  perform research._log(s.id, 'export', null, null, null);
  return json_build_object(
    'patients', public.rs_list_patients(p_token),
    'records',  public.rs_list_records(p_token, null, null));
end $$;

-- ---------------------------------------------------------------------
--  הרשאות הרצה: רק פונקציות ה-API חשופות לדפדפן
-- ---------------------------------------------------------------------
revoke all on all functions in schema research from public;
do $$
declare f text;
begin
  foreach f in array array[
    'rs_login(text,text)','rs_logout(text)','rs_me(text)','rs_change_password(text,text,text)',
    'rs_save_settings(text,jsonb)','rs_list_patients(text)','rs_save_patient(text,jsonb)',
    'rs_list_records(text,uuid,text)','rs_save_record(text,jsonb)','rs_delete_record(text,uuid)',
    'rs_staff_list(text)','rs_staff_save(text,jsonb)','rs_stats(text)','rs_audit(text,int)','rs_export(text)']
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
