// Autenticación: valida el token de Supabase Auth y carga el usuario SIGI.
// En DEMO_MODE acepta el header 'x-demo-correo' para facilitar las pruebas.
import { supabase } from '../../config/supabase.js';
import { config } from '../../config/config.js';
import { repoUsuarios } from '../repositories/index.js';
import { Usuario } from '../models/Usuario.js';

export async function autenticar(req, res, next) {
  try {
    const encabezado = req.headers.authorization || '';
    const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null;

    if (config.demoMode && req.headers['x-demo-correo']) {
      const filas = await repoUsuarios.listar({ correo: req.headers['x-demo-correo'] });
      if (!filas.length) return res.status(401).json({ error: 'Usuario demo no encontrado' });
      req.usuario = new Usuario(filas[0]);
      return next();
    }

    if (!token) return res.status(401).json({ error: 'Token requerido' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Token inválido o vencido' });

    const filas = await repoUsuarios.listar({ auth_id: data.user.id });
    if (!filas.length) return res.status(403).json({ error: 'El usuario no está registrado en SIGI' });

    req.usuario = new Usuario(filas[0]);
    next();
  } catch (e) {
    next(e);
  }
}
