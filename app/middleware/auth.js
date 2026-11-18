// Autenticación: valida el token de Supabase Auth y carga el usuario SIGI.
// En DEMO_MODE acepta el header 'x-demo-correo' para facilitar las pruebas.
import { supabase } from '../../config/supabase.js';
import { config } from '../../config/config.js';
import { repoUsuarios } from '../repositories/index.js';
import { Usuario } from '../models/Usuario.js';

// Caché token -> id de Supabase Auth (60 s): evita consultar a Supabase Auth en cada solicitud.
// El usuario SIGI (rol, activo) se guarda 30 s y se olvida apenas el administrador lo modifica.
const CACHE_MS = 60_000;
const MAX_CACHE = 1000;
const tokens = new Map();

// Usuario SIGI en memoria por 30 s para no consultarlo en cada solicitud.
// UsuarioController llama a olvidarUsuarios() al editar, desactivar o borrar, así el cambio es inmediato.
const USUARIO_MS = 30_000;
const usuarios = new Map();
export function olvidarUsuarios() { usuarios.clear(); }
async function usuarioPor(campo, valor) {
  const clave = `${campo}:${valor}`;
  const guardado = usuarios.get(clave);
  if (guardado && guardado.vence > Date.now()) return guardado.fila;
  const fila = (await repoUsuarios.listar({ [campo]: valor }))[0] || null;
  if (fila) {
    if (usuarios.size >= MAX_CACHE) usuarios.delete(usuarios.keys().next().value);
    usuarios.set(clave, { fila, vence: Date.now() + USUARIO_MS });
  }
  return fila;
}

async function authIdDeToken(token) {
  const guardado = tokens.get(token);
  if (guardado && guardado.vence > Date.now()) return guardado.authId;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) { tokens.delete(token); return null; }
  if (tokens.size >= MAX_CACHE) tokens.delete(tokens.keys().next().value);
  tokens.set(token, { authId: data.user.id, vence: Date.now() + CACHE_MS });
  return data.user.id;
}

function cargarUsuario(req, res, next, fila) {
  if (fila.activo === false) return res.status(403).json({ error: 'Su usuario está inactivo. Comuníquese con el administrador.' });
  req.usuario = new Usuario(fila);
  next();
}

export async function autenticar(req, res, next) {
  try {
    const encabezado = req.headers.authorization || '';
    const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null;

    if (config.demoMode && req.headers['x-demo-correo']) {
      const fila = await usuarioPor('correo', req.headers['x-demo-correo']);
      if (!fila) return res.status(401).json({ error: 'Usuario demo no encontrado' });
      return cargarUsuario(req, res, next, fila);
    }

    if (!token) return res.status(401).json({ error: 'Token requerido' });

    const authId = await authIdDeToken(token);
    if (!authId) return res.status(401).json({ error: 'Token inválido o vencido' });

    const fila = await usuarioPor('auth_id', authId);
    if (!fila) return res.status(403).json({ error: 'El usuario no está registrado en SIGI' });
    cargarUsuario(req, res, next, fila);
  } catch (e) {
    next(e);
  }
}
