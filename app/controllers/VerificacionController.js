// VerificacionController - Módulo "Verificación documental" (CU-07 a CU-10)
import {
  repoIncapacidades, repoDocumentos, repoFormatos, listarIncapacidades,
  incapacidadCompleta, registrarBitacora,
} from '../repositories/index.js';
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { DocumentoService } from '../services/DocumentoService.js';
import { IaOcrService } from '../services/IaOcrService.js';
import { cambiarEstado, asyncHandler, diasAcumulados } from './_helpers.js';
import { config } from '../../config/config.js';

export const VerificacionController = {
  // GET /api/verificacion/pendientes - bandeja "Pendientes de verificación" (más antiguo primero)
  pendientes: asyncHandler(async (_req, res) => {
    const casos = await listarIncapacidades({ estado: ['RECIBIDA', 'DOCUMENTACION_INCOMPLETA'] });
    res.json(casos.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
  }),

  /**
   * CU-07 · Verificar documentación.
   * body: { conformidades: [{documento_id, conforme}], ibc?, observaciones? }
   * Si está completa ejecuta CU-08 («include»: formato de seguimiento) y deja VERIFICADA.
   * Si falta algo ejecuta CU-09 («extend»: solicitar faltantes).
   */
  verificar: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    // Marcar cada documento como conforme / no conforme
    for (const c of req.body.conformidades || []) {
      await DocumentoService.marcarEstado(c.documento_id, c.conforme ? 'CONFORME' : 'NO_CONFORME');
    }

    const documentos = await repoDocumentos.listar({ incapacidad_id: caso.id });
    const conformes = documentos.filter((d) => d.estado === 'CONFORME');
    const faltantes = ReglasIncapacidadService.documentosFaltantes(caso.tipo, conformes, { dias: caso.dias });

    // Punto de extensión: documentación incompleta -> CU-09
    if (faltantes.length > 0) {
      const limite = ReglasIncapacidadService.sumarDiasHabiles(new Date(), config.plazos.documentacionFaltanteDiasHabiles);
      const actualizada = await cambiarEstado(caso.id, 'DOCUMENTACION_INCOMPLETA', req.usuario, { faltantes });
      await NotificacionService.notificarUsuario(
        caso.colaborador?.usuario?.id,
        `Documentación faltante - ${caso.numero_caso}`,
        `Faltan: ${faltantes.join(', ')}. Plazo: 3 días hábiles (hasta ${limite.toISOString().slice(0, 10)}).`
      );
      return res.json({ caso: actualizada, faltantes, fecha_limite: limite, accion: 'CU-09: solicitud de faltantes enviada' });
    }

    // CU-08 «include» · Diligenciar formato de seguimiento con liquidación RN-06
    const ibc = Number(req.body.ibc ?? caso.colaborador?.ibc ?? 0);
    const acumuladosPrevios = (await diasAcumulados(caso)) - caso.dias;
    const liquidacion = ReglasIncapacidadService.liquidar({
      tipo: caso.tipo, dias: caso.dias, ibc, diasAcumulados: acumuladosPrevios,
    });
    const versiones = await repoFormatos.listar({ incapacidad_id: caso.id });
    const formato = await repoFormatos.crear({
      incapacidad_id: caso.id,
      version: versiones.length + 1,
      ibc,
      dias_empresa: liquidacion.diasEmpresa,
      valor_empresa: liquidacion.valorEmpresa,
      dias_entidad: liquidacion.diasEntidad,
      valor_entidad: liquidacion.valorEntidad,
      dias_acumulados: acumuladosPrevios + caso.dias,
      observaciones: req.body.observaciones || null,
    });
    await repoIncapacidades.actualizar(caso.id, { valor_solicitado: liquidacion.valorEntidad });

    const actualizada = await cambiarEstado(caso.id, 'VERIFICADA', req.usuario);
    await registrarBitacora(req.usuario.id, 'CU-07:VERIFICADA', { numero_caso: caso.numero_caso });
    res.json({
      caso: actualizada, formato_seguimiento: formato, liquidacion,
      advertencias: liquidacion.advertencias,
      mensaje: ibc ? undefined : 'IBC desconocido: el formato queda pendiente de IBC (CU-08 2a).',
    });
  }),

  /**
   * CU-09 · Segundo llamado por documentación faltante.
   */
  segundoLlamado: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    await NotificacionService.notificarUsuario(
      caso.colaborador?.usuario?.id,
      `Segundo llamado - ${caso.numero_caso}`,
      'De no entregar la documentación será citado con la coordinación de Administración de Personal.'
    );
    await registrarBitacora(req.usuario.id, 'CU-09:SEGUNDO_LLAMADO', { numero_caso: caso.numero_caso });
    res.json({ mensaje: 'Segundo llamado registrado y notificado al colaborador.' });
  }),

  /**
   * CU-10 · Archivar documentación digital: marca los soportes conformes
   * como ARCHIVADO_DIGITAL (la ruta/nombre ya sigue la convención del DocumentoService).
   */
  archivarDigital: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    if (caso.estado !== 'VERIFICADA' && caso.estado !== 'TRANSCRITA') {
      return res.status(422).json({ error: 'El caso debe estar VERIFICADA para archivar en digital (CU-10)' });
    }
    const documentos = await repoDocumentos.listar({ incapacidad_id: caso.id });
    for (const d of documentos.filter((x) => x.estado === 'CONFORME')) {
      await DocumentoService.marcarEstado(d.id, 'ARCHIVADO_DIGITAL');
    }
    await registrarBitacora(req.usuario.id, 'CU-10:ARCHIVO_DIGITAL', { numero_caso: caso.numero_caso });
    res.json({ mensaje: 'Soportes archivados digitalmente por Entidad/Año/Colaborador_FechaInicio.' });
  }),

  /**
   * IA (sugerencia CU-07): preverificar soportes y resaltar inconsistencias.
   */
  preverificarIA: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    const requeridos = ReglasIncapacidadService.documentosRequeridos(caso.tipo, { dias: caso.dias });
    const resultado = await IaOcrService.preverificarSoportes({
      incapacidad: {
        numero_caso: caso.numero_caso, tipo: caso.tipo, estado: caso.estado,
        fecha_inicio: caso.fecha_inicio, dias: caso.dias,
        colaborador: caso.colaborador?.usuario?.nombre,
        documento: caso.colaborador?.usuario?.documento,
        entidad: caso.entidad?.nombre, diagnostico: caso.diagnostico_cie10,
      },
      documentosRequeridos: requeridos,
      documentosCargados: (caso.documentos || []).map((d) => ({
        tipo: d.tipo_documento, estado: d.estado, archivo: d.nombre_archivo,
      })),
    });
    res.json(resultado);
  }),
};
