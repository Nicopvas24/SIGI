// Helpers compartidos por los controladores
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { NotificacionService } from '../services/NotificacionService.js';
import {
  repoIncapacidades, registrarBitacora, incapacidadCompleta,
  listarColaboradores, colaboradorDeUsuario,
} from '../repositories/index.js';

export function errorHttp(mensaje, status = 400) {
  return Object.assign(new Error(mensaje), { status });
}

/**
 * Cambia el estado de una incapacidad validando el diagrama de estados,
 * registra la bitácora y devuelve el caso actualizado.
 */
export async function cambiarEstado(incapacidadId, nuevoEstado, usuario, detalle = {}) {
  const actual = await repoIncapacidades.porId(incapacidadId);
  if (!actual) throw errorHttp('Caso no encontrado', 404);
  if (actual.estado === nuevoEstado) return actual;
  ReglasIncapacidadService.validarTransicion(actual.estado, nuevoEstado);
  const actualizada = await repoIncapacidades.actualizar(incapacidadId, { estado: nuevoEstado });
  await registrarBitacora(usuario?.id, `ESTADO:${actual.estado}->${nuevoEstado}`, {
    incapacidad_id: incapacidadId, numero_caso: actual.numero_caso, ...detalle,
  });
  return actualizada;
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
 * Colaboradores que el usuario puede ver: el colaborador solo a sí mismo, el líder
 * a su equipo (y a sí mismo). El resto de roles ve todos (devuelve null).
 */
export async function alcanceColaboradores(usuario) {
  if (usuario.rol === 'COLABORADOR') {
    const propio = await colaboradorDeUsuario(usuario.id);
    return propio ? [propio.id] : [];
  }
  if (usuario.rol === 'LIDER') {
    const equipo = await listarColaboradores({ liderId: usuario.id });
    const propio = await colaboradorDeUsuario(usuario.id);
    return [...equipo.map((c) => c.id), ...(propio ? [propio.id] : [])];
  }
  return null;
}

export async function verificarAlcance(usuario, colaboradorId) {
  const alcance = await alcanceColaboradores(usuario);
  if (alcance && !alcance.includes(colaboradorId)) {
    throw errorHttp('No tiene permiso sobre los casos de este colaborador.', 403);
  }
}

export async function notificarAuxiliares(asunto, mensaje) {
  await NotificacionService.notificarRol('AUXILIAR', asunto, mensaje);
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
