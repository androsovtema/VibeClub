-- T17.1: лимит дополнительных изображений проекта 4 → 9 (итого до 10 с обложкой).
-- Применяет Тёма в Supabase SQL Editor после миграции 2026-07-08-project-images.sql.

alter table public.projects
  drop constraint if exists projects_images_max;

alter table public.projects
  add constraint projects_images_max
  check (coalesce(array_length(images, 1), 0) <= 9);
