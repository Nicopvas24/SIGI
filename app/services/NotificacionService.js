// NotificacionService - notificaciones en la plataforma (tabla notificaciones)
import { supabase } from '../../config/supabase.js';
import { repoNotificaciones, repoUsuarios } from '../repositories/index.js';

export const NotificacionService = {
  async notificarUsuario(usuarioId, asunto, mensaje) {
    if (!usuarioId) return;
    try {
      await repoNotificaciones.crear({ usuario_id: usuarioId, asunto, mensaje });
    } catch (e) {
      // Si falla la notificación, el trámite principal no se revierte
      console.error('[NotificacionService]', e.message);
    }
  },

  async notificarRol(rol, asunto, mensaje) {
    try {
      const usuarios = await repoUsuarios.listar({ rol, activo: true });
      await Promise.all(usuarios.map((u) => this.notificarUsuario(u.id, asunto, mensaje)));
    } catch (e) {
      console.error('[NotificacionService]', e.message);
    }
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
