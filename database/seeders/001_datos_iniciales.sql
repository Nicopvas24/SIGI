-- ============================================================
-- SIGI - Seeder 001: entidades (tabla 5.2.1) y usuarios demo
-- ============================================================

-- Entidades con sus tiempos de transcripción (procedimiento 5.2.1)
insert into entidades (nombre, tipo, plazo_transcripcion_dias, plazo_transito_dias, canal_transcripcion, portal_url, correo_contacto) values
  ('Salud Total', 'EPS', 365,  15,   'PORTAL_WEB', 'https://transaccional.saludtotal.com.co/OficinaVirtual/#/', null),
  ('Nueva EPS',   'EPS', 365,  null, 'PORTAL_WEB', 'https://www.nuevaeps.com.co',            null),
  ('SOS',         'EPS', 365,  null, 'CORREO',     null, 'incapacidades@sos.com.co'),
  ('Sanitas',     'EPS', 1095, null, 'CORREO',     null, 'incapacidades@sanitas.com.co'),
  ('SURA EPS',    'EPS', 150,  null, 'PORTAL_WEB', 'https://www.epssura.com',                null),
  ('Asmet Salud', 'EPS', 365,  null, 'PORTAL_WEB', 'https://www.asmetsalud.com',             null),
  ('Famisanar',   'EPS', 365,  null, 'CORREO',     null, 'incapacidades@famisanar.com.co'),
  ('ARL SURA',    'ARL', 365,  null, 'PORTAL_WEB', 'https://www.sura.co/arl', null);

-- Usuarios demo (uno por rol). En producción se vinculan con auth_id de Supabase Auth.
insert into usuarios (documento, nombre, correo, rol) values
  ('1001', 'Carlos Colaborador',  'colaborador@sigi.demo',  'COLABORADOR'),
  ('1003', 'Rosa Recepcionista',  'recepcion@sigi.demo',    'RECEPCIONISTA'),
  ('1004', 'Andrea Auxiliar',     'auxiliar@sigi.demo',     'AUXILIAR'),
  ('1005', 'Julián Jurídica',     'juridica@sigi.demo',     'JURIDICA'),
  ('1006', 'Camila Contabilidad', 'contabilidad@sigi.demo', 'CONTABILIDAD'),
  ('1007', 'Gloria Documental',   'documental@sigi.demo',   'GESTION_DOCUMENTAL'),
  ('1008', 'Admin SIGI',          'admin@sigi.demo',        'ADMIN');

-- Colaborador demo afiliado a Salud Total
insert into colaboradores (usuario_id, cargo, area, ibc, entidad_eps_id, entidad_arl_id)
select u.id, 'Analista', 'Operaciones', 2500000,
       (select id from entidades where nombre = 'Salud Total'),
       (select id from entidades where nombre = 'ARL SURA')
from usuarios u where u.documento = '1001';
