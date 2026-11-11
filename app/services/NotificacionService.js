// NotificacionService - notificaciones en plataforma (tabla notificaciones)
// En producción se integraría además el envío por correo (SMTP, sección 11).
import { repoNotificaciones, repoUsuarios } from '../repositories/index.js';

export const NotificacionService = {
  async notificarUsuario(usuarioId, asunto, mensaje) {
    if (!usuarioId) return;
    try {
      await repoNotificaciones.crear({ usuario_id: usuarioId, asunto, mensaje });
    } catch (e) {
      // CU-01 6a: si falla la notificación se registra el error y el caso queda creado
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

  async marcarLeida(id) {
    return repoNotificaciones.actualizar(id, { leida: true });
  },
};
