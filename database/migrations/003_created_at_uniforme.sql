-- ============================================================
-- SIGI - Migración 003: columna created_at en todas las tablas
-- ============================================================
-- BaseRepository.listar() ordena por created_at por defecto; varias tablas
-- (colaboradores, pagos, gestiones, ...) no la tenían y la consulta fallaba.

do $$
declare t record;
begin
  for t in
    select tablename from pg_tables p
    where schemaname = 'public'
      and tablename <> '_sigi_migraciones'
      and not exists (select 1 from information_schema.columns c
                      where c.table_schema = 'public' and c.table_name = p.tablename
                        and c.column_name = 'created_at')
  loop
    execute format('alter table public.%I add column created_at timestamptz not null default now()', t.tablename);
  end loop;
end $$;
