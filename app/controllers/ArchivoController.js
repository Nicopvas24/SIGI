// ArchivoController - Módulo "Archivo" (CU-29, CU-30)
import { repoDocumentos, listarIncapacidades, registrarBitacora } from '../repositories/index.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { DocumentoService } from '../services/DocumentoService.js';
import { cambiarEstado, asyncHandler, casoOError, errorHttp } from './_helpers.js';

const tieneSoporte = (c) => (c.pagos || []).some((p) => p.soporte_url);

export const ArchivoController = {
  // GET /api/archivo/pagadas - casos pagados pendientes de transferir a Gestión Documental
  pagadas: asyncHandler(async (_req, res) => {
    const casos = await listarIncapacidades({ estado: 'PAGADA' });
    res.json(casos.map((c) => ({ ...c, tiene_soporte_liquidacion: tieneSoporte(c) })));
  }),

  /**
   * CU-30 · Cruce de incapacidades pagadas contra los físicos encontrados.
   * body: { fisicos_encontrados: [incapacidad_id, ...] }
   */
  verificarFisicos: asyncHandler(async (req, res) => {
    const pagadas = await listarIncapacidades({ estado: 'PAGADA' });
    const encontrados = new Set(req.body.fisicos_encontrados || []);
    const aptas = pagadas.filter((c) => encontrados.has(c.id) && tieneSoporte(c));
    const sinSoporte = pagadas.filter((c) => encontrados.has(c.id) && !tieneSoporte(c));
    const sinFisico = pagadas.filter((c) => !encontrados.has(c.id));
    await registrarBitacora(req.usuario.id, 'ARCHIVO:CRUCE_FISICOS', { aptas: aptas.length, sin_fisico: sinFisico.length });
    res.json({
      aptas_para_envio: aptas.map((c) => c.numero_caso),
      sin_soporte_liquidacion: sinSoporte.map((c) => c.numero_caso),
      pagadas_sin_fisico: sinFisico.map((c) => c.numero_caso),
      alerta: sinFisico.length ? 'Hay incapacidades pagadas cuyo físico no se encontró: inicie su búsqueda antes de transferir.' : null,
    });
  }),

  /**
   * CU-29 · Archivar una incapacidad pagada: exige soporte de liquidación, deja
   * constancia de la destrucción de la epicrisis y notifica a Gestión Documental.
   * body: { confirmacion_destruccion_epicrisis: true, ubicacion_fisica }
   */
  archivar: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['PAGADA'], 'el archivo');
    if (!tieneSoporte(caso)) throw errorHttp('El caso no tiene soporte de liquidación de la entidad; no puede transferirse.', 422);
    if (!req.body.confirmacion_destruccion_epicrisis) {
      throw errorHttp('Confirme que retiró y destruyó la historia clínica o epicrisis, que no reposan en el archivo.', 422);
    }
    const ubicacion = req.body.ubicacion_fisica?.trim();
    if (!ubicacion) throw errorHttp('Indique la ubicación física asignada por Gestión Documental.');

    const documentos = await repoDocumentos.listar({ incapacidad_id: caso.id });
    const destruidos = documentos.filter((d) => d.es_reservado);
    const transferidos = documentos.filter((d) => !d.es_reservado && ['CONFORME', 'ARCHIVADO_DIGITAL'].includes(d.estado));
    for (const d of destruidos) await DocumentoService.marcarEstado(d.id, 'DESTRUIDO');
    for (const d of transferidos) await DocumentoService.marcarEstado(d.id, 'TRANSFERIDO');
    await registrarBitacora(req.usuario.id, 'ARCHIVO:ACTA_DESTRUCCION', {
      numero_caso: caso.numero_caso, documentos_destruidos: destruidos.map((d) => d.tipo_documento), ubicacion_fisica: ubicacion,
    });

    await cambiarEstado(caso.id, 'ARCHIVADA', req.usuario, { ubicacion_fisica: ubicacion });
    await NotificacionService.notificarRol('GESTION_DOCUMENTAL', `Transferencia ${caso.numero_caso}`,
      `Expediente de ${caso.colaborador?.usuario?.nombre} (${caso.entidad?.nombre}) enviado para custodia. Ubicación: ${ubicacion}.`);

    res.json({
      planilla_transferencia: {
        numero_caso: caso.numero_caso, entidad: caso.entidad?.nombre, colaborador: caso.colaborador?.usuario?.nombre,
        fecha_inicio: caso.fecha_inicio, ubicacion_fisica: ubicacion,
        documentos_transferidos: transferidos.length, documentos_destruidos: destruidos.length,
      },
      mensaje: `Caso ${caso.numero_caso} archivado: ${transferidos.length} documento(s) transferido(s) y ${destruidos.length} destruido(s).`,
    });
  }),
};
