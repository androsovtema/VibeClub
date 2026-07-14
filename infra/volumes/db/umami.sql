-- Отдельная роль и база для Umami в том же инстансе Postgres (T-LOC).
-- Выполняется один раз при первом запуске тома (docker-entrypoint-initdb.d).
\set umami_pass `echo "$UMAMI_DB_PASSWORD"`

create role umami with login password :'umami_pass';
create database umami owner umami;
