// NotificacionService - notificaciones en la plataforma (tabla notificaciones)
import { supabase } from '../../config/supabase.js';
import { repoNotificaciones, repoUsuarios } from '../repositories/index.js';

export const NotificacionService = {
  // Las notificaciones se envían en segundo plano: el trámite responde sin esperarlas
  // y si una falla no se revierte (solo se registra en consola).
  notificarUsuario(usuarioId, asunto, mensaje) {
    if (!usuarioId) return Promise.resolve();
    repoNotificaciones.crear({ usuario_id: usuarioId, asunto, mensaje })
      .catch((e) => console.error('[NotificacionService]', e.message));
    return Promise.resolve();
  },

  notificarRol(rol, asunto, mensaje) {
    repoUsuarios.listar({ rol, activo: true })
      .then((usuarios) => Promise.all(usuarios.map((u) => repoNotificaciones.crear({ usuario_id: u.id, asunto, mensaje }))))
      .catch((e) => console.error('[NotificacionService]', e.message));
    return Promise.resolve();
  },

  async pendientes(usuarioId) {
    return repoNotificaciones.listar({ usuario_id: usuarioId, leida: false });
  },

  async recientes(usuarioId, limite = 40) {
    const { data, error } = await supabase.from('notificaciones').select('*')
      .eq('usuario_id', usuarioId).order('created_at', { ascending: false }).limit(limite);
    if (error) throw new Error(error.message);
    return data;
  },

  async marcarLeida(id, usuarioId) {
    const { error } = await supabase.from('notificaciones').update({ leida: true }).eq('id', id).eq('usuario_id', usuarioId);
    if (error) throw new Error(error.message);
  },

  async marcarTodas(usuarioId) {
    const { error } = await supabase.from('notificaciones').update({ leida: true }).eq('usuario_id', usuarioId).eq('leida', false);
    if (error) throw new Error(error.message);
  },
};
