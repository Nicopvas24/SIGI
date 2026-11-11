-- ============================================================
-- SIGI - Migración 002: seguridad (RLS) y bucket de documentos
-- ============================================================
-- El backend usa la service role key, que omite RLS. Activar RLS sin
-- políticas bloquea el acceso directo con la anon key (pública) a datos
-- personales y clínicos, sin afectar a la API de Express.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Bucket privado para soportes (certificados, epicrisis, FURIPS...).
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 20971520)  -- 20 MB por archivo
on conflict (id) do update set public = false;
