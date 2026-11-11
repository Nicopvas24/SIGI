// AuthController - autenticación y perfil
import { supabaseAuth } from '../../config/supabase.js';
import { config } from '../../config/config.js';
import { repoUsuarios, repoColaboradores } from '../repositories/index.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { asyncHandler } from './_helpers.js';

export const AuthController = {
  // POST /api/auth/login  { correo, password }
  login: asyncHandler(async (req, res) => {
    const { correo, password } = req.body;
    if (!correo) return res.status(400).json({ error: 'Correo requerido' });

    if (config.demoMode) {
      const filas = await repoUsuarios.listar({ correo });
      if (!filas.length) return res.status(401).json({ error: 'Usuario no encontrado' });
      return res.json({ modo: 'demo', token: null, usuario: filas[0] });
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email: correo, password });
    if (error) return res.status(401).json({ error: error.message });
    const filas = await repoUsuarios.listar({ auth_id: data.user.id });
    if (!filas.length) return res.status(403).json({ error: 'El usuario no está registrado en SIGI' });
    res.json({ modo: 'supabase', token: data.session.access_token, usuario: filas[0] });
  }),

  // GET /api/auth/perfil
  perfil: asyncHandler(async (req, res) => {
    let colaborador = null;
    const filas = await repoColaboradores.listar({ usuario_id: req.usuario.id });
    if (filas.length) colaborador = filas[0];
    const notificaciones = await NotificacionService.pendientes(req.usuario.id);
    res.json({ usuario: req.usuario, colaborador, notificaciones });
  }),

  // GET /api/auth/usuarios (listas de apoyo para formularios)
  usuarios: asyncHandler(async (_req, res) => {
    res.json(await repoUsuarios.listar({}, { orden: 'nombre', asc: true }));
  }),
};
