-- ============================================================
-- SIGI - Sistema Integral de Gestión de Incapacidades
-- Migración 001: esquema inicial (PostgreSQL / Supabase)
-- Basado en el diagrama de clases de la
-- Documentación de Análisis y Diseño - Segunda Entrega
-- ============================================================

-- ---------- Enumeraciones (EstadoIncapacidad, TipoIncapacidad, CanalRecepcion) ----------
create type rol_usuario as enum (
  'COLABORADOR', 'LIDER', 'RECEPCIONISTA', 'AUXILIAR',
  'JURIDICA', 'CONTABILIDAD', 'GESTION_DOCUMENTAL', 'ADMIN'
);

create type tipo_incapacidad as enum (
  'ENFERMEDAD_GENERAL', 'ACCIDENTE_LABORAL', 'ACCIDENTE_TRANSITO',
  'LICENCIA_MATERNIDAD', 'LICENCIA_PATERNIDAD'
);

create type estado_incapacidad as enum (
  'REPORTADA', 'DOCUMENTACION_REMITIDA', 'RECIBIDA', 'DOCUMENTACION_INCOMPLETA',
  'VERIFICADA', 'TRANSCRITA', 'RADICADA', 'ACEPTADA', 'RECHAZADA',
  'COBRADA', 'EN_COBRO_PERSUASIVO', 'EN_COBRO_JURIDICO',
  'PAGO_NOTIFICADO', 'PAGADA', 'DADA_DE_BAJA', 'ARCHIVADA'
);

create type canal_recepcion as enum (
  'PRESENCIAL', 'CORREO_ELECTRONICO', 'OFICINA_PRINCIPAL', 'LIDER_COMERCIAL', 'GESTION_HUMANA'
);

create type tipo_gestion as enum (
  'TRANSCRIPCION', 'RADICACION', 'SOLICITUD_PAGO', 'SEGUIMIENTO', 'REQUERIMIENTO'
);

create type estado_documento as enum (
  'CARGADO', 'EN_REVISION', 'CONFORME', 'NO_CONFORME',
  'ARCHIVADO_DIGITAL', 'TRANSFERIDO', 'DESTRUIDO'
);

create type tipo_proceso_juridico as enum ('DERECHO_PETICION', 'ACCION_TUTELA');

-- ---------- Usuarios y roles (superclase Usuario del diagrama de clases) ----------
create table usuarios (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique,                -- id en supabase auth.users
  documento   text unique not null,
  nombre      text not null,
  correo      text unique not null,
  rol         rol_usuario not null default 'COLABORADOR',
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Entidades EPS / ARL (tabla 5.2.1 del procedimiento) ----------
create table entidades (
  id                        serial primary key,
  nombre                    text unique not null,
  tipo                      text not null check (tipo in ('EPS', 'ARL')),
  plazo_transcripcion_dias  int not null,          -- plazo general
  plazo_transito_dias       int,                   -- excepción accidentes de tránsito (Salud Total: 15)
  canal_transcripcion       text not null check (canal_transcripcion in ('PORTAL_WEB', 'CORREO')),
  portal_url                text,
  correo_contacto           text
);

-- ---------- Colaboradores (especialización de Usuario) ----------
create table colaboradores (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid unique not null references usuarios(id),
  cargo           text,
  area            text,
  ibc             numeric(14,2) default 0,         -- Ingreso Base de Cotización
  entidad_eps_id  int references entidades(id),
  entidad_arl_id  int references entidades(id),
  lider_id        uuid references usuarios(id)
);

-- ---------- Incapacidad (clase central del modelo) ----------
create table incapacidades (
  id                 uuid primary key default gen_random_uuid(),
  numero_caso        text unique not null,
  colaborador_id     uuid not null references colaboradores(id),
  entidad_id         int not null references entidades(id),
  tipo               tipo_incapacidad not null,
  estado             estado_incapacidad not null default 'REPORTADA',
  fecha_inicio       date not null,
  dias               int not null check (dias > 0),
  fecha_fin          date not null,
  diagnostico_cie10  text,
  observaciones      text,
  prorroga_de        uuid references incapacidades(id),  -- caso del que es prórroga
  extemporanea       boolean not null default false,     -- remisión después de 2 días (RN-04)
  fecha_promesa_pago date,                               -- fecha en que la entidad promete pagar
  valor_solicitado   numeric(14,2) default 0,
  valor_pagado       numeric(14,2) default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_incapacidades_estado on incapacidades(estado);
create index idx_incapacidades_colaborador on incapacidades(colaborador_id);

-- ---------- Documentos soporte (DE-02) ----------
create table documentos_soporte (
  id             uuid primary key default gen_random_uuid(),
  incapacidad_id uuid not null references incapacidades(id) on delete cascade,
  tipo_documento text not null,   -- CERTIFICADO, EPICRISIS, FURIPS, NACIDO_VIVO, REGISTRO_CIVIL, DOC_IDENTIDAD
  nombre_archivo text not null,
  url            text,
  estado         estado_documento not null default 'CARGADO',
  es_reservado   boolean not null default false,  -- historia clínica / epicrisis (acceso restringido)
  created_at     timestamptz not null default now()
);

-- ---------- Recepción ----------
create table recepciones (
  id             uuid primary key default gen_random_uuid(),
  incapacidad_id uuid not null references incapacidades(id) on delete cascade,
  canal          canal_recepcion not null,
  receptor_id    uuid references usuarios(id),
  fecha          timestamptz not null default now()
);

-- ---------- Reemplazos ----------
create table reemplazos (
  id              uuid primary key default gen_random_uuid(),
  incapacidad_id  uuid not null references incapacidades(id) on delete cascade,
  reemplazo_id    uuid references colaboradores(id),  -- null = "Sin reemplazo"
  fecha_inicio    date not null,
  fecha_fin       date not null,
  justificacion   text
);

-- ---------- Formato de seguimiento  ----------
create table formatos_seguimiento (
  id              uuid primary key default gen_random_uuid(),
  incapacidad_id  uuid not null references incapacidades(id) on delete cascade,
  version         int not null default 1,
  ibc             numeric(14,2) not null,
  dias_empresa    int not null,
  valor_empresa   numeric(14,2) not null,
  dias_entidad    int not null,
  valor_entidad   numeric(14,2) not null,
  dias_acumulados int not null default 0,
  observaciones   text,
  created_at      timestamptz not null default now()
);

-- ---------- Gestiones ante la entidad (Radicacion, Transcripcion, Requerimiento, SolicitudPago) ----------
create table gestiones (
  id                uuid primary key default gen_random_uuid(),
  incapacidad_id    uuid not null references incapacidades(id) on delete cascade,
  tipo              tipo_gestion not null,
  numero_referencia text,          -- nº de transcripción / radicado
  descripcion       text,
  responsable_id    uuid references usuarios(id),
  fecha             timestamptz not null default now()
);

-- ---------- Evidencias (toda gestión debe tener soporte) ----------
create table evidencias (
  id          uuid primary key default gen_random_uuid(),
  gestion_id  uuid not null references gestiones(id) on delete cascade,
  archivo_url text not null,
  descripcion text,
  usuario_id  uuid references usuarios(id),
  sello_tiempo timestamptz not null default now()
);

-- ---------- Conciliaciones y pagos ----------
create table conciliaciones (
  id         uuid primary key default gen_random_uuid(),
  periodo    text not null,            -- 'YYYY-MM'
  estado     text not null default 'ABIERTA' check (estado in ('ABIERTA', 'CONCILIADA')),
  total_consignado numeric(14,2) default 0,
  created_at timestamptz not null default now()
);

create table pagos (
  id              uuid primary key default gen_random_uuid(),
  incapacidad_id  uuid references incapacidades(id),   -- null mientras esté "Por identificar"
  entidad_id      int references entidades(id),
  conciliacion_id uuid references conciliaciones(id),
  valor           numeric(14,2) not null,
  fecha_pago      date not null,
  soporte_url     text,
  estado          text not null default 'POR_IDENTIFICAR'
                  check (estado in ('POR_IDENTIFICAR', 'IDENTIFICADO', 'CONCILIADO'))
);

-- ---------- Procesos jurídicos ----------
create table procesos_juridicos (
  id                  uuid primary key default gen_random_uuid(),
  incapacidad_id      uuid not null references incapacidades(id) on delete cascade,
  tipo                tipo_proceso_juridico not null,
  abogado_id          uuid references usuarios(id),
  causal              text,
  radicado            text,
  juzgado             text,
  fecha_radicacion    date,
  vencimiento_termino date,          -- 15 días hábiles derecho de petición
  resultado           text,          -- FAVORABLE / DESFAVORABLE / SIN_RESPUESTA
  estado              text not null default 'EN_PREPARACION'
                      check (estado in ('EN_PREPARACION', 'RADICADO', 'RESUELTO')),
  created_at          timestamptz not null default now()
);

-- ---------- Concepto de rehabilitación (hitos de 120 y 150 días) ----------
create table conceptos_rehabilitacion (
  id              uuid primary key default gen_random_uuid(),
  incapacidad_id  uuid not null references incapacidades(id) on delete cascade,
  fecha_solicitud date,
  fecha_concepto  date,
  resultado       text check (resultado in ('FAVORABLE', 'DESFAVORABLE')),
  enviado_afp     boolean not null default false,
  fecha_envio_afp date
);

-- ---------- Notificaciones y bitácora de auditoría ----------
create table notificaciones (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id),
  asunto     text not null,
  mensaje    text,
  leida      boolean not null default false,
  created_at timestamptz not null default now()
);

create table bitacora (
  id         bigserial primary key,
  usuario_id uuid references usuarios(id),
  accion     text not null,
  detalle    jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Consecutivo del número de caso ----------
create sequence seq_numero_caso start 1;

create or replace function asignar_numero_caso() returns trigger as $$
begin
  if new.numero_caso is null or new.numero_caso = '' then
    new.numero_caso := 'INC-' || to_char(now(), 'YYYY') || '-' ||
                       lpad(nextval('seq_numero_caso')::text, 5, '0');
  end if;
  new.fecha_fin := new.fecha_inicio + (new.dias - 1);
  return new;
end;
$$ language plpgsql;

create trigger trg_numero_caso before insert on incapacidades
for each row execute function asignar_numero_caso();

create or replace function tocar_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

create trigger trg_updated_at before update on incapacidades
for each row execute function tocar_updated_at();
