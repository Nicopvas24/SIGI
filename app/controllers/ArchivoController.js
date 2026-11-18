// ArchivoController - Módulo "Archivo"
import { repoDocumentos, repoPagos, listarIncapacidades, registrarBitacora } from '../repositories/index.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { DocumentoService } from '../services/DocumentoService.js';
import { cambiarEstado, asyncHandler, casoOError, errorHttp } from './_helpers.js';

const tieneSoporte = (c) => (c.pagos || []).some((p) => p.soporte_url);
const ESTADOS_CON_PAGO = ['PAGO_NOTIFICADO', 'PAGADA'];
const masReciente = (a, b) => String(b.fecha_pago).localeCompare(String(a.fecha_pago));

export const ArchivoController = {
  /**
   * Adjunta (o reemplaza) el soporte de liquidación de la entidad a un caso ya pagado.
   * Antes solo podía adjuntarse al registrar el pago; si se omitió, o el pago entró por
   * conciliación, el caso quedaba sin poder archivarse. multipart: soporte
   */
  adjuntarLiquidacion: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ESTADOS_CON_PAGO, 'adjuntar el soporte de liquidación');
    if (!req.file) throw errorHttp('Adjunte el soporte de liquidación en PDF o imagen.');
    const pagos = [...(caso.pagos || [])].sort(masReciente);
    if (!pagos.length) throw errorHttp('El caso no tiene pagos registrados. Registre primero el pago en Cobro o Conciliación.', 422);

    // Se asocia al pago más reciente sin soporte; si todos lo tienen, se reemplaza el del más reciente
    const pago = pagos.find((p) => !p.soporte_url) || pagos[0];
    const reemplazo = Boolean(pago.soporte_url);
    const url = await DocumentoService.guardarEvidencia({ incapacidad: caso, tipoGestion: 'LIQUIDACION', archivo: req.file });
    await repoPagos.actualizar(pago.id, { soporte_url: url });
    await registrarBitacora(req.usuario.id, 'ARCHIVO:SOPORTE_LIQUIDACION', {
      numero_caso: caso.numero_caso, pago_id: pago.id, reemplazo, archivo: req.file.originalname,
    });
    res.json({
      mensaje: `Soporte de liquidación ${reemplazo ? 'reemplazado' : 'adjuntado'} en ${caso.numero_caso}.` +
        (caso.estado === 'PAGADA' ? ' Ya puede archivarse.' : ''),
    });
  }),

  // GET /api/incapacidades/:id/soporte-liquidacion - enlace temporal al soporte más reciente
  verLiquidacion: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id);
    const pago = [...(caso.pagos || [])].filter((p) => p.soporte_url).sort(masReciente)[0];
    if (!pago) throw errorHttp('El caso no tiene soporte de liquidación.', 404);
    res.json({ url: await DocumentoService.enlaceFirmado(pago.soporte_url) });
  }),

  // GET /api/archivo/pagadas - casos pagados pendientes de transferir a Gestión Documental
  pagadas: asyncHandler(async (_req, res) => {
    const casos = await listarIncapacidades({ estado: 'PAGADA' });
    res.json(casos.map((c) => ({ ...c, tiene_soporte_liquidacion: tieneSoporte(c) })));
  }),

  /**
   * Cruce de incapacidades pagadas contra los físicos encontrados.
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
   * Archivar una incapacidad pagada: exige soporte de liquidación, deja
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
    await Promise.all([
      ...destruidos.map((d) => DocumentoService.marcarEstado(d.id, 'DESTRUIDO')),
      ...transferidos.map((d) => DocumentoService.marcarEstado(d.id, 'TRANSFERIDO')),
    ]);
    await registrarBitacora(req.usuario.id, 'ARCHIVO:ACTA_DESTRUCCION', {
      numero_caso: caso.numero_caso, documentos_destruidos: destruidos.map((d) => d.tipo_documento), ubicacion_fisica: ubicacion,
    });

    await cambiarEstado(caso, 'ARCHIVADA', req.usuario, { ubicacion_fisica: ubicacion });
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
