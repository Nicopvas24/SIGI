// AuthController - autenticación, sesión y notificaciones del usuario
import { supabaseAuth } from '../../config/supabase.js';
import { config } from '../../config/config.js';
import { repoUsuarios, colaboradorDeUsuario } from '../repositories/index.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { asyncHandler, errorHttp } from './_helpers.js';

const sesion = (s) => ({ token: s.access_token, refresh_token: s.refresh_token, expira_en: s.expires_at });

export const AuthController = {
  // POST /api/auth/login  { correo, password }
  login: asyncHandler(async (req, res) => {
    const correo = req.body.correo?.trim().toLowerCase();
    if (!correo) throw errorHttp('Escriba su correo.');

    if (config.demoMode) {
      const filas = await repoUsuarios.listar({ correo });
      if (!filas.length) throw errorHttp('No existe un usuario con ese correo.', 401);
      if (filas[0].activo === false) throw errorHttp('Su usuario está inactivo. Comuníquese con el administrador.', 403);
      return res.json({ modo: 'demo', token: null, usuario: filas[0] });
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email: correo, password: req.body.password || '' });
    if (error) throw errorHttp(/invalid/i.test(error.message) ? 'Correo o contraseña incorrectos.' : error.message, 401);
    const filas = await repoUsuarios.listar({ auth_id: data.user.id });
    if (!filas.length) throw errorHttp('Su cuenta no está vinculada a un usuario de SIGI.', 403);
    if (filas[0].activo === false) throw errorHttp('Su usuario está inactivo.', 403);
    res.json({ modo: 'supabase', ...sesion(data.session), usuario: filas[0] });
  }),

  // POST /api/auth/refrescar  { refresh_token } - renueva el token vencido sin volver a ingresar
  refrescar: asyncHandler(async (req, res) => {
    if (!req.body.refresh_token) throw errorHttp('Sesión vencida.', 401);
    const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: req.body.refresh_token });
    if (error || !data.session) throw errorHttp('Su sesión venció. Ingrese de nuevo.', 401);
    res.json(sesion(data.session));
  }),

  // GET /api/auth/perfil
  perfil: asyncHandler(async (req, res) => {
    // En paralelo: se consulta en cada cambio de módulo y debe responder rápido
    const [colaborador, pendientes] = await Promise.all([
      colaboradorDeUsuario(req.usuario.id),
      NotificacionService.pendientes(req.usuario.id),
    ]);
    res.json({ usuario: req.usuario, colaborador, notificaciones_pendientes: pendientes.length });
  }),

  // GET /api/notificaciones
  notificaciones: asyncHandler(async (req, res) => {
    res.json(await NotificacionService.recientes(req.usuario.id));
  }),

  // POST /api/notificaciones/:id/leida   |   POST /api/notificaciones/leidas
  marcarLeida: asyncHandler(async (req, res) => {
    await NotificacionService.marcarLeida(req.params.id, req.usuario.id);
    res.json({ ok: true });
  }),
  marcarTodas: asyncHandler(async (req, res) => {
    await NotificacionService.marcarTodas(req.usuario.id);
    res.json({ ok: true });
  }),
};
