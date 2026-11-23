-- ============================================================
-- SIGI - Seeder 003: colaboradores ficticios que no operan la plataforma
-- Al reportar una incapacidad solo aparecen los usuarios con rol COLABORADOR;
-- el personal de Gestión Humana, Jurídica, Contabilidad, etc. no sale en esa lista.
-- Las cuentas de acceso (contraseña Sigi2026!) se crean en Supabase Auth desde
-- el menú Usuarios o con DEMO_MODE=true sin contraseña.
-- Idempotente: se puede ejecutar varias veces.
-- ============================================================

insert into usuarios (documento, nombre, correo, rol) values
  ('1088245671', 'Valentina Ospina Marín',   'valentina.ospina@sigi.demo', 'COLABORADOR'),
  ('1093784512', 'Andrés Felipe Restrepo',   'andres.restrepo@sigi.demo',  'COLABORADOR'),
  ('1087653298', 'Daniela Cardona Loaiza',   'daniela.cardona@sigi.demo',  'COLABORADOR'),
  ('1112459870', 'Luis Eduardo Montoya',     'luis.montoya@sigi.demo',     'COLABORADOR'),
  ('1094327765', 'Natalia Giraldo Toro',     'natalia.giraldo@sigi.demo',  'COLABORADOR'),
  ('1089912346', 'Camilo Andrés Bedoya',     'camilo.bedoya@sigi.demo',    'COLABORADOR')
on conflict (documento) do nothing;

insert into colaboradores (usuario_id, cargo, area, ibc, entidad_eps_id, entidad_arl_id, lider_id)
select u.id,
       d.cargo, d.area, d.ibc,
       (select id from entidades where nombre = d.eps),
       (select id from entidades where nombre = 'ARL SURA'),
       (select id from usuarios where correo = 'lider@sigi.demo')
from usuarios u
join (values
  ('1088245671', 'Asesora de ventas',              'Comercial',          1900000, 'SURA EPS'),
  ('1093784512', 'Técnico de mantenimiento',       'Operaciones',        2400000, 'Nueva EPS'),
  ('1087653298', 'Diseñadora gráfica',             'Mercadeo',           2800000, 'Sanitas'),
  ('1112459870', 'Operario de producción',         'Producción',         1500000, 'Salud Total'),
  ('1094327765', 'Ejecutiva de servicio al cliente','Servicio al cliente', 2000000, 'Famisanar'),
  ('1089912346', 'Mensajero',                      'Logística',          1600000, 'SOS')
) as d(documento, cargo, area, ibc, eps) on d.documento = u.documento
where not exists (select 1 from colaboradores c where c.usuario_id = u.id);
