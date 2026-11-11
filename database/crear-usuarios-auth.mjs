// Crea (o actualiza) en Supabase Auth un usuario por cada fila de la tabla `usuarios`
// y guarda su id en usuarios.auth_id, para usar login real (DEMO_MODE=false).
//
// Uso:  npm run db:usuarios                 -> contraseña por defecto Sigi2026!
//       npm run db:usuarios -- MiClave123    -> contraseña indicada
import { supabase } from '../config/supabase.js';

const password = process.argv[2] || process.env.SIGI_PASSWORD_DEMO || 'Sigi2026!';
if (password.length < 6) {
  console.error('La contraseña debe tener al menos 6 caracteres (requisito de Supabase Auth).');
  process.exit(1);
}

async function usuariosAuthExistentes() {
  const porCorreo = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`No se pudo listar Auth: ${error.message}`);
    for (const u of data.users) porCorreo.set(u.email?.toLowerCase(), u);
    if (data.users.length < 1000) break;
  }
  return porCorreo;
}

const { data: usuarios, error } = await supabase
  .from('usuarios').select('id, correo, nombre, rol, auth_id').order('documento');
if (error) {
  console.error('Error leyendo la tabla usuarios:', error.message);
  process.exit(1);
}
if (!usuarios.length) {
  console.error('La tabla usuarios está vacía. Ejecute primero el seeder.');
  process.exit(1);
}

const existentes = await usuariosAuthExistentes();
let ok = 0;

for (const u of usuarios) {
  try {
    let authUser = existentes.get(u.correo.toLowerCase());
    if (authUser) {
      const { error: e } = await supabase.auth.admin.updateUserById(authUser.id, {
        password, email_confirm: true,
      });
      if (e) throw e;
    } else {
      const { data, error: e } = await supabase.auth.admin.createUser({
        email: u.correo, password, email_confirm: true,
        user_metadata: { nombre: u.nombre, rol: u.rol },
      });
      if (e) throw e;
      authUser = data.user;
    }

    const { error: e2 } = await supabase.from('usuarios').update({ auth_id: authUser.id }).eq('id', u.id);
    if (e2) throw e2;

    console.log(`✔ ${u.correo.padEnd(26)} ${u.rol}`);
    ok++;
  } catch (e) {
    console.error(`✖ ${u.correo}: ${e.message}`);
  }
}

console.log(`\n${ok}/${usuarios.length} usuarios listos en Supabase Auth. Contraseña: ${password}`);
process.exit(ok === usuarios.length ? 0 : 1);
