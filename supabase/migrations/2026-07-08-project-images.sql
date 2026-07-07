-- T17: галерея проекта — до 4 дополнительных изображений сверх обложки.
-- Применяет Тёма в Supabase SQL Editor. RLS не меняется: колонка живёт в
-- projects и покрыта существующими политиками (insert/update own,
-- select published/own). Storage-бакет covers и его политики не меняются —
-- дополнительные изображения кладутся туда же, в covers/<uid>/.

alter table public.projects
  add column if not exists images text[] not null default '{}';

alter table public.projects
  drop constraint if exists projects_images_max;

alter table public.projects
  add constraint projects_images_max
  check (coalesce(array_length(images, 1), 0) <= 4);
