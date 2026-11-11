// Helpers compartidos por los controladores
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { repoIncapacidades, registrarBitacora, incapacidadCompleta } from '../repositories/index.js';

/**
 * Cambia el estado de una incapacidad validando el diagrama de estados DE-01,
 * registra la bitácora y devuelve el caso actualizado.
 */
export async function cambiarEstado(incapacidadId, nuevoEstado, usuario, detalle = {}) {
  const actual = await repoIncapacidades.porId(incapacidadId);
  if (!actual) { const e = new Error('Incapacidad no encontrada'); e.status = 404; throw e; }
  ReglasIncapacidadService.validarTransicion(actual.estado, nuevoEstado);
  const actualizada = await repoIncapacidades.actualizar(incapacidadId, { estado: nuevoEstado });
  await registrarBitacora(usuario?.id, `ESTADO:${actual.estado}->${nuevoEstado}`, {
    incapacidad_id: incapacidadId, numero_caso: actual.numero_caso, ...detalle,
  });
  return actualizada;
}

export async function notificarAuxiliares(asunto, mensaje) {
  await NotificacionService.notificarRol('AUXILIAR', asunto, mensaje);
}

export { incapacidadCompleta };

// Días acumulados de un caso incluyendo su cadena de prórrogas (CU-26)
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
