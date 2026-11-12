// VerificacionController - Módulo "Verificación documental"
import { repoIncapacidades, repoDocumentos, repoFormatos, listarIncapacidades, registrarBitacora } from '../repositories/index.js';
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { DocumentoService } from '../services/DocumentoService.js';
import { IaOcrService } from '../services/IaOcrService.js';
import { cambiarEstado, asyncHandler, diasAcumulados, casoOError, errorHttp } from './_helpers.js';
import { config } from '../../config/config.js';

const NOMBRES_DOC = {
  CERTIFICADO: 'certificado de incapacidad', EPICRISIS: 'epicrisis', FURIPS: 'FURIPS',
  NACIDO_VIVO: 'certificado de nacido vivo', REGISTRO_CIVIL: 'registro civil', DOC_IDENTIDAD: 'documento de identidad',
};
const listaDocs = (tipos) => tipos.map((t) => NOMBRES_DOC[t] || t).join(', ');
const MAX_BYTES_IA = 15 * 1024 * 1024;

export const VerificacionController = {
  // GET /api/verificacion/pendientes - bandeja de verificación, del más antiguo al más reciente
  pendientes: asyncHandler(async (_req, res) => {
    const casos = await listarIncapacidades({ estado: ['RECIBIDA', 'DOCUMENTACION_INCOMPLETA'] });
    res.json(casos
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((c) => ({ ...c, documentos_requeridos: ReglasIncapacidadService.documentosRequeridos(c.tipo, { dias: c.dias }) })));
  }),

  /**
   * Verificar documentación.
   * body: { conformes: [documento_id, ...], ibc?, observaciones? }
   * Los documentos no incluidos en `conformes` quedan como no conformes.
   * Completa: diligencia el formato de seguimiento, archiva en digital y deja Verificada.
   * Incompleta: solicita los faltantes al colaborador con plazo de 3 días hábiles.
   */
  verificar: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['RECIBIDA', 'DOCUMENTACION_INCOMPLETA'], 'verificación');
    const conformes = new Set([].concat(req.body.conformes || []));

    for (const d of caso.documentos.filter((x) => ['CARGADO', 'EN_REVISION', 'CONFORME', 'NO_CONFORME'].includes(x.estado))) {
      await DocumentoService.marcarEstado(d.id, conformes.has(d.id) ? 'CONFORME' : 'NO_CONFORME');
    }
    const documentos = await repoDocumentos.listar({ incapacidad_id: caso.id });
    const faltantes = ReglasIncapacidadService.documentosFaltantes(
      caso.tipo, documentos.filter((d) => d.estado === 'CONFORME'), { dias: caso.dias }
    );

    if (faltantes.length) {
      const limite = ReglasIncapacidadService.sumarDiasHabiles(new Date(), config.plazos.documentacionFaltanteDiasHabiles)
        .toISOString().slice(0, 10);
      await cambiarEstado(caso.id, 'DOCUMENTACION_INCOMPLETA', req.usuario, { faltantes });
      await NotificacionService.notificarUsuario(caso.colaborador?.usuario?.id, `Soportes pendientes · ${caso.numero_caso}`,
        `Faltan o no son válidos: ${listaDocs(faltantes)}. Tiene plazo hasta el ${limite} (3 días hábiles) para entregarlos.` +
        (req.body.observaciones ? ` Observación: ${req.body.observaciones}` : ''));
      return res.json({ completa: false, faltantes, fecha_limite: limite,
        mensaje: `Documentación incompleta. Se solicitó al colaborador: ${listaDocs(faltantes)}. Plazo: ${limite}.` });
    }

    // Formato de seguimiento con la liquidación según días acumulados
    const ibc = Number(req.body.ibc || caso.colaborador?.ibc || 0);
    const previos = (await diasAcumulados(caso)) - caso.dias;
    const liq = ReglasIncapacidadService.liquidar({ tipo: caso.tipo, dias: caso.dias, ibc, diasAcumulados: previos });
    const versiones = await repoFormatos.listar({ incapacidad_id: caso.id });
    const formato = await repoFormatos.crear({
      incapacidad_id: caso.id, version: versiones.length + 1, ibc,
      dias_empresa: liq.diasEmpresa, valor_empresa: liq.valorEmpresa,
      dias_entidad: liq.diasEntidad, valor_entidad: liq.valorEntidad,
      dias_acumulados: previos + caso.dias, observaciones: req.body.observaciones || null,
    });
    await repoIncapacidades.actualizar(caso.id, { valor_solicitado: liq.valorEntidad });

    // Archivo digital de los soportes conformes
    for (const d of documentos.filter((x) => x.estado === 'CONFORME')) {
      await DocumentoService.marcarEstado(d.id, 'ARCHIVADO_DIGITAL');
    }
    await cambiarEstado(caso.id, 'VERIFICADA', req.usuario);
    await registrarBitacora(req.usuario.id, 'VERIFICACION_COMPLETA', { numero_caso: caso.numero_caso, formato: formato.id });

    res.json({
      completa: true, formato_seguimiento: formato, liquidacion: liq,
      mensaje: `Caso ${caso.numero_caso} verificado. A cargo de la empresa: ${liq.diasEmpresa} día(s); a cargo de la entidad: ${liq.diasEntidad} día(s).` +
        (ibc ? '' : ' El colaborador no tiene IBC registrado: los valores quedaron en cero.') +
        (liq.advertencias.length ? ` ${liq.advertencias.join(' ')}` : ''),
    });
  }),

  /** Segundo llamado por documentación faltante. */
  segundoLlamado: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['DOCUMENTACION_INCOMPLETA'], 'un segundo llamado');
    await NotificacionService.notificarUsuario(caso.colaborador?.usuario?.id, `Segundo llamado · ${caso.numero_caso}`,
      'No hemos recibido los soportes pendientes. De no entregarlos, será citado con la coordinación de Administración de Personal.');
    await registrarBitacora(req.usuario.id, 'SEGUNDO_LLAMADO', { numero_caso: caso.numero_caso });
    res.json({ mensaje: 'Segundo llamado enviado al colaborador.' });
  }),

  /**
   * IA · Analiza los archivos digitales del caso con Gemini: tipo real del documento,
   * legibilidad y coherencia con los datos registrados. Las epicrisis no se envían (reserva clínica).
   */
  analizarSoportesIA: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id);
    const candidatos = caso.documentos.filter((d) => d.url && !d.es_reservado && d.estado !== 'DESTRUIDO');
    const archivos = [];
    let bytes = 0;
    for (const d of candidatos) {
      const a = await DocumentoService.descargar(d.url);
      if (!a || bytes + a.bytes > MAX_BYTES_IA) continue;
      bytes += a.bytes;
      archivos.push({ tipo: d.tipo_documento, ...a });
    }
    if (!archivos.length) {
      throw errorHttp('El caso no tiene soportes digitales que analizar (solo entregas físicas o epicrisis reservada).', 422);
    }

    const resultado = await IaOcrService.analizarSoportes({
      caso: {
        colaborador: caso.colaborador?.usuario?.nombre,
        documento_identidad: caso.colaborador?.usuario?.documento,
        tipo: caso.tipo, fecha_inicio: caso.fecha_inicio, dias: caso.dias, entidad: caso.entidad?.nombre,
      },
      requeridos: ReglasIncapacidadService.documentosRequeridos(caso.tipo, { dias: caso.dias }),
      archivos,
    });
    const omitidos = caso.documentos.filter((d) => d.es_reservado && d.url).length;
    res.json({ ...resultado, analizados: archivos.length,
      nota: omitidos ? 'La epicrisis no se envía a la IA por ser información clínica reservada.' : null });
  }),
};
