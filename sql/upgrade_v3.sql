-- =====================================================================
--  שדרוג 3: מחיקת מטופל (מנהל בלבד) — למטופל שהוזן בטעות / לבדיקה
--  מוחק את המטופל עם כל ההזנות וההערות שלו. נרשם ביומן הפעולות.
--  להריץ פעם אחת ב-Supabase → SQL Editor (אחרי upgrade_v2.sql).
-- =====================================================================
create or replace function public.rs_delete_patient(p_token text, p_id uuid, p_confirm_code text) returns json
language plpgsql security definer set search_path = research, extensions, pg_temp as $$
declare s research.staff; p research.patients; v_recs int; v_notes int;
begin
  s := research._auth(p_token);
  if not research._is_admin(s) then raise exception 'FORBIDDEN'; end if;
  select * into p from research.patients where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if lower(trim(coalesce(p_confirm_code,''))) <> lower(p.code) then raise exception 'CONFIRM_MISMATCH'; end if;
  select count(*) into v_recs from research.records where patient_id = p_id and not deleted;
  select count(*) into v_notes from research.notes where patient_id = p_id;
  delete from research.patients where id = p_id;   -- ההזנות וההערות נמחקות איתו (cascade)
  perform research._log(s.id, 'delete_patient', 'patient', p_id::text,
                        json_build_object('code', p.code, 'records', v_recs, 'notes', v_notes)::jsonb);
  return json_build_object('ok', true, 'records', v_recs, 'notes', v_notes);
end $$;

revoke all on function public.rs_delete_patient(text,uuid,text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.rs_delete_patient(text,uuid,text) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.rs_delete_patient(text,uuid,text) to authenticated;
  end if;
end $$;

insert into research.settings(key, value) values ('schema_version', '3')
on conflict (key) do update set value = '3';
