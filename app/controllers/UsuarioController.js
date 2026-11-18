// UsuarioController - Administración de usuarios de la plataforma (solo ADMIN).
// Cada usuario tiene: cuenta en Supabase Auth (para ingresar con contraseña), fila en
// `usuarios` (rol y datos) y, si puede tener incapacidades, fila en `colaboradores`.
import { supabase } from '../../config/supabase.js';
import { Roles } from '../models/enums.js';
import { repoUsuarios, repoColaboradores, registrarBitacora } from '../repositories/index.js';
import { asyncHandler, errorHttp } from './_helpers.js';
import { olvidarUsuarios } from '../middleware/auth.js';

const ROLES = Object.values(Roles);
const SELECT = `*, colaborador:colaboradores!usuario_id(id, cargo, area, ibc, entidad_eps_id, entidad_arl_id, lider_id)`;
const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
const uno = (v) => (Array.isArray(v) ? v[0] || null : v || null);

async function usuarioCompleto(id) {
  const { data, error } = await supabase.from('usuarios').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data && { ...data, colaborador: uno(data.colaborador) };
}

/** Valida y normaliza el cuerpo. `parcial` permite omitir campos (edición). */
function leerDatos(body, { parcial = false } = {}) {
  const d = {};
  const texto = (k) => (body[k] === undefined ? undefined : String(body[k] ?? '').trim());
  for (const k of ['nombre', 'documento', 'correo', 'rol', 'password']) {
    const v = texto(k);
    if (v !== undefined) d[k] = v;
  }
  if (d.correo !== undefined) d.correo = d.correo.toLowerCase();
  if (body.activo !== undefined) d.activo = Boolean(body.activo);

  if (!parcial) {
    for (const [k, nombre] of [['nombre', 'el nombre'], ['documento', 'el documento'], ['correo', 'el correo'], ['rol', 'el rol']]) {
      if (!d[k]) throw errorHttp(`Escriba ${nombre}.`);
    }
    if (!d.password) throw errorHttp('Asigne una contraseña inicial.');
  }
  if (d.nombre === '' || d.documento === '' || d.correo === '') throw errorHttp('Nombre, documento y correo no pueden quedar vacíos.');
  if (d.correo && !correoValido(d.correo)) throw errorHttp('El correo no es válido.');
  if (d.documento && !/^\d{4,15}$/.test(d.documento)) throw errorHttp('El documento debe tener solo números (4 a 15 dígitos).');
  if (d.rol && !ROLES.includes(d.rol)) throw errorHttp('Rol no válido.');
  if (d.password !== undefined && d.password !== '' && d.password.length < 8) throw errorHttp('La contraseña debe tener al menos 8 caracteres.');
  if (d.password === '') delete d.password; // en edición, vacío = no cambiar

  // Datos laborales: null = no es colaborador; objeto = crear/actualizar
  if (body.colaborador !== undefined) {
    const c = body.colaborador;
    if (c === null) d.colaborador = null;
    else {
      const ibc = c.ibc === '' || c.ibc == null ? 0 : Math.round(Number(c.ibc));
      if (!(ibc >= 0)) throw errorHttp('El IBC debe ser un valor mayor o igual a cero.');
      const id = (v) => (v === '' || v == null ? null : v);
      d.colaborador = {
        cargo: String(c.cargo || '').trim() || null,
        area: String(c.area || '').trim() || null,
        ibc,
        entidad_eps_id: id(c.entidad_eps_id) && Number(c.entidad_eps_id),
        entidad_arl_id: id(c.entidad_arl_id) && Number(c.entidad_arl_id),
        lider_id: id(c.lider_id),
      };
    }
  }
  return d;
}

// Tablas que referencian a un usuario o a su registro de colaborador (ver migración 001)
const REFERENCIAS_USUARIO = [
  ['bitacora', 'usuario_id', 'registros de auditoría'],
  ['recepciones', 'receptor_id', 'recepciones de soportes'],
  ['gestiones', 'responsable_id', 'gestiones ante entidades'],
  ['evidencias', 'usuario_id', 'evidencias cargadas'],
  ['procesos_juridicos', 'abogado_id', 'procesos jurídicos'],
  ['colaboradores', 'lider_id', 'colaboradores a cargo'],
];
const REFERENCIAS_COLABORADOR = [
  ['incapacidades', 'colaborador_id', 'incapacidades'],
  ['reemplazos', 'reemplazo_id', 'reemplazos asignados'],
];

async function contar(tabla, columna, valor) {
  const { count, error } = await supabase.from(tabla).select('id', { count: 'exact', head: true }).eq(columna, valor);
  if (error) throw new Error(error.message);
  return count || 0;
}

/** Lista legible de lo que impide borrar al usuario (vacía si se puede borrar). */
async function referencias(usuario) {
  const consultas = REFERENCIAS_USUARIO.map(([t, c, n]) => contar(t, c, usuario.id).then((k) => [k, n]));
  if (usuario.colaborador) consultas.push(...REFERENCIAS_COLABORADOR.map(([t, c, n]) => contar(t, c, usuario.colaborador.id).then((k) => [k, n])));
  return (await Promise.all(consultas)).filter(([k]) => k > 0).map(([k, n]) => `${k} ${n}`);
}

function traducirError(e) {
  const m = e?.message || '';
  if (e?.code === '23505' || /duplicate|already|registered|exists/i.test(m)) {
    if (/documento/i.test(m)) return errorHttp('Ya existe un usuario con ese documento.', 409);
    return errorHttp('Ya existe un usuario con ese correo.', 409);
  }
  return e;
}

export const UsuarioController = {
  // GET /api/admin/usuarios
  listar: asyncHandler(async (_req, res) => {
    const { data, error } = await supabase.from('usuarios').select(SELECT).order('nombre');
    if (error) throw new Error(error.message);
    res.json(data.map((u) => ({ ...u, colaborador: uno(u.colaborador) })));
  }),

  // POST /api/admin/usuarios
  crear: asyncHandler(async (req, res) => {
    const d = leerDatos(req.body);

    const { data: auth, error: errAuth } = await supabase.auth.admin.createUser({
      email: d.correo, password: d.password, email_confirm: true, user_metadata: { nombre: d.nombre },
    });
    if (errAuth) throw traducirError(errAuth);

    let usuario;
    try {
      usuario = await repoUsuarios.crear({
        auth_id: auth.user.id, nombre: d.nombre, documento: d.documento, correo: d.correo, rol: d.rol, activo: d.activo ?? true,
      });
      if (d.colaborador) await repoColaboradores.crear({ usuario_id: usuario.id, ...d.colaborador });
    } catch (e) {
      // Deshace lo creado para no dejar cuentas huérfanas
      if (usuario) await repoUsuarios.eliminar(usuario.id).catch(() => {});
      await supabase.auth.admin.deleteUser(auth.user.id).catch(() => {});
      throw traducirError(e);
    }
    await registrarBitacora(req.usuario.id, 'ADMIN:CREAR_USUARIO', { usuario_id: usuario.id, correo: d.correo, rol: d.rol });
    res.status(201).json({ usuario: await usuarioCompleto(usuario.id), mensaje: `Usuario ${d.nombre} creado. Ya puede ingresar con su correo y la contraseña asignada.` });
  }),

  // PUT /api/admin/usuarios/:id
  actualizar: asyncHandler(async (req, res) => {
    const actual = await usuarioCompleto(req.params.id);
    if (!actual) throw errorHttp('Usuario no encontrado.', 404);
    const d = leerDatos(req.body, { parcial: true });
    const esUnoMismo = actual.id === req.usuario.id;
    if (esUnoMismo && d.activo === false) throw errorHttp('No puede desactivar su propio usuario.', 422);
    if (esUnoMismo && d.rol && d.rol !== 'ADMIN') throw errorHttp('No puede quitarse a sí mismo el rol de administrador.', 422);

    // Cuenta de acceso: correo y contraseña viven en Supabase Auth
    const cambiosAuth = {};
    if (d.correo && d.correo !== actual.correo) Object.assign(cambiosAuth, { email: d.correo, email_confirm: true });
    if (d.password) cambiosAuth.password = d.password;
    if (Object.keys(cambiosAuth).length) {
      if (actual.auth_id) {
        const { error } = await supabase.auth.admin.updateUserById(actual.auth_id, cambiosAuth);
        if (error) throw traducirError(error);
      } else {
        // Usuario antiguo sin cuenta de acceso: se le crea una
        if (!d.password) throw errorHttp('Este usuario no tiene cuenta de acceso: asígnele una contraseña para crearla.');
        const { data, error } = await supabase.auth.admin.createUser({ email: d.correo || actual.correo, password: d.password, email_confirm: true });
        if (error) throw traducirError(error);
        d.auth_id = data.user.id;
      }
    }

    const fila = {};
    for (const k of ['nombre', 'documento', 'correo', 'rol', 'activo', 'auth_id']) if (d[k] !== undefined) fila[k] = d[k];
    try {
      if (Object.keys(fila).length) await repoUsuarios.actualizar(actual.id, fila);
      if (d.colaborador) {
        if (actual.colaborador) await repoColaboradores.actualizar(actual.colaborador.id, d.colaborador);
        else await repoColaboradores.crear({ usuario_id: actual.id, ...d.colaborador });
      } else if (d.colaborador === null && actual.colaborador) {
        const usos = await Promise.all(REFERENCIAS_COLABORADOR.map(([t, c]) => contar(t, c, actual.colaborador.id)));
        if (usos.some((k) => k > 0)) throw errorHttp('No se pueden quitar los datos laborales: el colaborador tiene incapacidades o reemplazos registrados.', 409);
        await repoColaboradores.eliminar(actual.colaborador.id);
      }
    } catch (e) { throw traducirError(e); }

    olvidarUsuarios();
    await registrarBitacora(req.usuario.id, 'ADMIN:EDITAR_USUARIO', { usuario_id: actual.id, campos: Object.keys(fila), password: Boolean(d.password) });
    res.json({ usuario: await usuarioCompleto(actual.id), mensaje: 'Cambios guardados.' });
  }),

  // DELETE /api/admin/usuarios/:id - borra solo si no tiene registros asociados; si los tiene, sugiere desactivar
  eliminar: asyncHandler(async (req, res) => {
    const actual = await usuarioCompleto(req.params.id);
    if (!actual) throw errorHttp('Usuario no encontrado.', 404);
    if (actual.id === req.usuario.id) throw errorHttp('No puede eliminar su propio usuario.', 422);

    // Se comprueba antes de borrar para no dejar el registro a medias
    const bloqueos = await referencias(actual);
    if (bloqueos.length) {
      throw errorHttp(`${actual.nombre} no puede eliminarse porque tiene ${bloqueos.join(', ')}. Desactívelo para impedir su ingreso sin perder el historial.`, 409);
    }
    const { error: errNotif } = await supabase.from('notificaciones').delete().eq('usuario_id', actual.id);
    if (errNotif) throw new Error(errNotif.message);
    if (actual.colaborador) await repoColaboradores.eliminar(actual.colaborador.id);
    await repoUsuarios.eliminar(actual.id);
    olvidarUsuarios();
    if (actual.auth_id) await supabase.auth.admin.deleteUser(actual.auth_id).catch(() => {});
    await registrarBitacora(req.usuario.id, 'ADMIN:ELIMINAR_USUARIO', { correo: actual.correo, rol: actual.rol });
    res.json({ mensaje: `Usuario ${actual.nombre} eliminado.` });
  }),
};
