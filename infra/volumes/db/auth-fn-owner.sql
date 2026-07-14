-- Фикс владельцев auth-функций (T-LOC, пойман на живом подъёме 2026-07-14).
-- Образ supabase/postgres создаёт auth.uid()/role()/email() владельцем postgres,
-- а GoTrue подключается как supabase_auth_admin и падает на своей миграции
-- 00_init_auth_schema: "must be owner of function uid" (SQLSTATE 42501).
-- Монтируется в /docker-entrypoint-initdb.d/migrations/zz-auth-fn-owner.sql —
-- фаза migrations идёт ПОСЛЕ создания функций образом, zz- ставит файл в конец.
alter function auth.uid() owner to supabase_auth_admin;
alter function auth.role() owner to supabase_auth_admin;
alter function auth.email() owner to supabase_auth_admin;

-- Пароль supabase_storage_admin (пойман там же, 2026-07-14): образ создаёт
-- эту роль в фазе migrations — ПОСЛЕ init-scripts, поэтому ALTER USER из
-- 99-roles.sql по ней не попадает (по supabase_auth_admin — попадает, та
-- существует раньше). Симптом: storage в Restarting, 28P01
-- "password authentication failed for user supabase_storage_admin".
\set pgpass `echo "$POSTGRES_PASSWORD"`
alter user supabase_storage_admin with password :'pgpass';
