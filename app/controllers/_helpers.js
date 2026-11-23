// Helpers compartidos por los controladores
import { supabase } from '../../config/supabase.js';
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { NotificacionService } from '../services/NotificacionService.js';
import {
  repoIncapacidades, registrarBitacora, incapacidadCompleta,
  colaboradorDeUsuario,
} from '../repositories/index.js';

export function errorHttp(mensaje, status = 400) {
  return Object.assign(new Error(mensaje), { status });
}

/**
 * Cambia el estado de una incapacidad validando el diagrama de estados,
 * registra la bitácora y devuelve el caso actualizado.
 */
export async function cambiarEstado(casoOId, nuevoEstado, usuario, detalle = {}) {
  // Si se recibe el caso ya cargado se evita volver a leerlo
  const actual = typeof casoOId === 'object' ? casoOId : await repoIncapacidades.porId(casoOId);
  if (!actual) throw errorHttp('Caso no encontrado', 404);
  if (actual.estado === nuevoEstado) return actual;
  ReglasIncapacidadService.validarTransicion(actual.estado, nuevoEstado);

  // Solo actualiza si nadie cambió el estado mientras tanto (dos personas sobre el mismo caso)
  const { data, error } = await supabase.from('incapacidades')
    .update({ estado: nuevoEstado }).eq('id', actual.id).eq('estado', actual.estado).select();
  if (error) throw new Error(error.message);
  if (!data.length) throw errorHttp(`El caso ${actual.numero_caso} cambió de estado mientras tanto. Recargue la página.`, 409);

  registrarBitacora(usuario?.id, `ESTADO:${actual.estado}->${nuevoEstado}`, {
    incapacidad_id: actual.id, numero_caso: actual.numero_caso, ...detalle,
  });
  if (typeof casoOId === 'object') casoOId.estado = nuevoEstado; // el objeto queda al día para un segundo cambio
  return data[0];
}

/** Carga el caso completo o responde 404; opcionalmente exige uno de los estados dados. */
export async function casoOError(id, estadosPermitidos, accion = 'esta acción') {
  const caso = await incapacidadCompleta(id);
  if (!caso) throw errorHttp('Caso no encontrado', 404);
  if (estadosPermitidos && !estadosPermitidos.includes(caso.estado)) {
    throw errorHttp(`El caso ${caso.numero_caso} está en estado ${caso.estado.replaceAll('_', ' ').toLowerCase()} y no admite ${accion}.`, 422);
  }
  return caso;
}

/**
 * Colaboradores que el usuario puede ver: el colaborador solo a sí mismo.
 * El resto de roles ve todos (devuelve null).
 */
export async function alcanceColaboradores(usuario) {
  if (usuario.rol === 'COLABORADOR') {
    const propio = await colaboradorDeUsuario(usuario.id);
    return propio ? [propio.id] : [];
  }
  return null;
}

export async function verificarAlcance(usuario, colaboradorId) {
  const alcance = await alcanceColaboradores(usuario);
  if (alcance && !alcance.includes(colaboradorId)) {
    throw errorHttp('No tiene permiso sobre los casos de este colaborador.', 403);
  }
}

export function notificarAuxiliares(asunto, mensaje) {
  return NotificacionService.notificarRol('AUXILIAR', asunto, mensaje);
}

export { incapacidadCompleta };

// Días acumulados de un caso incluyendo su cadena de prórrogas
export async function diasAcumulados(incapacidad) {
  let total = incapacidad.dias;
  let anterior = incapacidad.prorroga_de;
  let salvaguarda = 0;
  while (anterior && salvaguarda < 50) {
    const previa = await repoIncapacidades.porId(anterior);
    if (!previa) break;
    total += previa.dias;
    anterior = previa.prorroga_de;
    salvaguarda++;
  }
  return total;
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
