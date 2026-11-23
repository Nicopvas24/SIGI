-- ============================================================
-- SIGI - Seeder 004: más EPS y ARL, y enlaces de portal corregidos
-- Enlaces revisados el 2026-11-23 en los sitios oficiales.
-- Las entidades nuevas usan el plazo general de transcripción (365 días);
-- ajústelo si la entidad publica uno distinto.
-- Idempotente: se puede ejecutar varias veces.
-- ============================================================

-- Enlaces que no abrían o redirigían
update entidades set portal_url = 'https://transaccional.saludtotal.com.co/OficinaVirtual/#/' where nombre = 'Salud Total';
update entidades set portal_url = 'https://www.sura.co/arl' where nombre = 'ARL SURA';

insert into entidades (nombre, tipo, plazo_transcripcion_dias, plazo_transito_dias, canal_transcripcion, portal_url, correo_contacto) values
  ('Comfenalco Valle',    'EPS', 365, null, 'PORTAL_WEB', 'https://www.comfenalcovalle.com.co', null),
  ('Compensar',           'EPS', 365, null, 'PORTAL_WEB', 'https://corporativo.compensar.com/salud', null),
  ('Coosalud',            'EPS', 365, null, 'PORTAL_WEB', 'https://coosalud.com', null),
  ('Mutual Ser',          'EPS', 365, null, 'PORTAL_WEB', 'https://www.mutualser.com', null),
  ('Aliansalud',          'EPS', 365, null, 'PORTAL_WEB', 'https://www.aliansalud.com.co', null),
  ('Savia Salud',         'EPS', 365, null, 'PORTAL_WEB', 'https://www.saviasaludeps.com', null),
  ('Capital Salud',       'EPS', 365, null, 'PORTAL_WEB', 'https://www.capitalsalud.gov.co', null),
  ('ARL Positiva',        'ARL', 365, null, 'PORTAL_WEB', 'https://positiva.gov.co', null),
  ('ARL Colmena',         'ARL', 365, null, 'PORTAL_WEB', 'https://www.colmenaseguros.com/arl/hacemos-las-cosas-faciles/radicacion-incapacidades-temporales', null),
  ('ARL Seguros Bolívar', 'ARL', 365, null, 'PORTAL_WEB', 'https://www.segurosbolivar.com', null),
  ('ARL AXA Colpatria',   'ARL', 365, null, 'PORTAL_WEB', 'https://www.axacolpatria.co', null),
  ('ARL Seguros Alfa',    'ARL', 365, null, 'PORTAL_WEB', 'https://www.segurosalfa.com.co', null),
  ('ARL Mapfre',          'ARL', 365, null, 'PORTAL_WEB', 'https://www.mapfre.com.co', null)
on conflict (nombre) do nothing;

-- Dos colaboradores ficticios pasan a entidades nuevas, para tener ejemplos en los documentos de prueba
update colaboradores set entidad_eps_id = (select id from entidades where nombre = 'Comfenalco Valle')
where usuario_id = (select id from usuarios where documento = '1089912346');
update colaboradores set entidad_arl_id = (select id from entidades where nombre = 'ARL Positiva')
where usuario_id = (select id from usuarios where documento = '1093784512');
