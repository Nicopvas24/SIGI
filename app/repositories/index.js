// Repositorios por tabla + consultas especializadas
import { BaseRepository } from './BaseRepository.js';
import { supabase } from '../../config/supabase.js';

export const repoUsuarios = new BaseRepository('usuarios');
export const repoEntidades = new BaseRepository('entidades');
export const repoColaboradores = new BaseRepository('colaboradores');
export const repoIncapacidades = new BaseRepository('incapacidades');
export const repoDocumentos = new BaseRepository('documentos_soporte');
export const repoRecepciones = new BaseRepository('recepciones');
export const repoReemplazos = new BaseRepository('reemplazos');
export const repoFormatos = new BaseRepository('formatos_seguimiento');
export const repoGestiones = new BaseRepository('gestiones');
export const repoEvidencias = new BaseRepository('evidencias');
export const repoPagos = new BaseRepository('pagos');
export const repoConciliaciones = new BaseRepository('conciliaciones');
export const repoProcesosJuridicos = new BaseRepository('procesos_juridicos');
export const repoConceptos = new BaseRepository('conceptos_rehabilitacion');
export const repoNotificaciones = new BaseRepository('notificaciones');

// Vista expandida de una incapacidad con sus relaciones
export const SELECT_INCAPACIDAD = `
  *,
  colaborador:colaboradores(id, cargo, area, ibc,
    usuario:usuarios!usuario_id(id, nombre, documento, correo)),
  entidad:entidades(*),
  documentos:documentos_soporte(*),
  recepciones(*),
  formatos:formatos_seguimiento(*),
  gestiones(*, evidencias(*)),
  pagos(*),
  procesos:procesos_juridicos(*),
  conceptos:conceptos_rehabilitacion(*)
`;

export async function incapacidadCompleta(id) {
  const { data, error } = await supabase
    .from('incapacidades').select(SELECT_INCAPACIDAD).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listarIncapacidades(filtros = {}) {
  let q = supabase.from('incapacidades').select(SELECT_INCAPACIDAD);
  if (filtros.estado) {
    q = Array.isArray(filtros.estado) ? q.in('estado', filtros.estado) : q.eq('estado', filtros.estado);
  }
  if (filtros.colaborador_id) q = q.eq('colaborador_id', filtros.colaborador_id);
  if (filtros.entidad_id) q = q.eq('entidad_id', filtros.entidad_id);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// Bitácora de auditoría (CU-15 paso 5)
export async function registrarBitacora(usuarioId, accion, detalle = {}) {
  await supabase.from('bitacora').insert({ usuario_id: usuarioId || null, accion, detalle });
}
