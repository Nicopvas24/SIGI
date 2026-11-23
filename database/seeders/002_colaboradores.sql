-- ============================================================
-- SIGI - Seeder 002: más colaboradores de demostración
-- Todo empleado es colaborador (también el personal de Gestión Humana),
-- así cualquiera puede reportar su propia incapacidad.
-- Idempotente: se puede ejecutar varias veces.
-- ============================================================

insert into usuarios (documento, nombre, correo, rol) values
  ('1009', 'María Fernanda Ríos',  'maria.rios@sigi.demo',     'COLABORADOR'),
  ('1010', 'Jorge Iván Castaño',   'jorge.castano@sigi.demo',  'COLABORADOR'),
  ('1011', 'Paula Andrea Gómez',   'paula.gomez@sigi.demo',    'COLABORADOR'),
  ('1012', 'Santiago Herrera',     'santiago.herrera@sigi.demo','COLABORADOR')
on conflict (documento) do nothing;

insert into colaboradores (usuario_id, cargo, area, ibc, entidad_eps_id, entidad_arl_id)
select u.id,
       d.cargo, d.area, d.ibc,
       (select id from entidades where nombre = d.eps),
       (select id from entidades where nombre = 'ARL SURA')
from usuarios u
join (values
  ('1003', 'Recepcionista',             'Administrativa',  1600000, 'Salud Total'),
  ('1004', 'Auxiliar de personal',      'Gestión Humana',  2200000, 'SURA EPS'),
  ('1005', 'Abogada',                   'Jurídica',        5200000, 'Sanitas'),
  ('1006', 'Contadora',                 'Contabilidad',    4500000, 'SOS'),
  ('1007', 'Técnica de archivo',        'Gestión Documental', 1900000, 'Famisanar'),
  ('1008', 'Administrador del sistema', 'Tecnología',      5500000, 'SURA EPS'),
  ('1009', 'Asesora comercial',         'Comercial',       2100000, 'Nueva EPS'),
  ('1010', 'Operario de bodega',        'Operaciones',     1500000, 'Salud Total'),
  ('1011', 'Analista de calidad',       'Operaciones',     3000000, 'Sanitas'),
  ('1012', 'Conductor',                 'Logística',       1800000, 'SOS')
) as d(documento, cargo, area, ibc, eps) on d.documento = u.documento
where not exists (select 1 from colaboradores c where c.usuario_id = u.id);
