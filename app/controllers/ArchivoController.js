// ArchivoController - Módulo "Archivo" (CU-29, CU-30)
import {
  repoDocumentos, listarIncapacidades, incapacidadCompleta, registrarBitacora,
} from '../repositories/index.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { DocumentoService } from '../services/DocumentoService.js';
import { cambiarEstado, asyncHandler } from './_helpers.js';

export const ArchivoController = {
  // GET /api/archivo/pagadas - lote de casos PAGADA listos para archivo
  pagadas: asyncHandler(async (_req, res) => {
    const casos = await listarIncapacidades({ estado: 'PAGADA' });
    res.json(casos.map((c) => ({
      ...c,
      tiene_soporte_liquidacion: (c.pagos || []).some((p) => p.soporte_url),
    })));
  }),

  /**
   * CU-30 «include» · Verificar incapacidades pagadas vs. físicas.
   * body: { fisicos_encontrados: [incapacidad_id, ...] }
   */
  verificarFisicos: asyncHandler(async (req, res) => {
    const pagadas = await listarIncapacidades({ estado: 'PAGADA' });
    const encontrados = new Set(req.body.fisicos_encontrados || []);
    const pagadasSinFisico = pagadas.filter((c) => !encontrados.has(c.id));
    const aptas = pagadas.filter((c) => encontrados.has(c.id));
    await registrarBitacora(req.usuario.id, 'CU-30:VERIFICACION_FISICOS', {
      aptas: aptas.length, sin_fisico: pagadasSinFisico.length,
    });
    res.json({
      aptas_para_envio: aptas.map((c) => c.numero_caso),
      pagadas_sin_fisico: pagadasSinFisico.map((c) => c.numero_caso),
      alerta: pagadasSinFisico.length ? 'Hay incapacidades pagadas sin físico: iniciar búsqueda del documento (CU-30 3a).' : null,
    });
  }),

  /**
   * CU-29 · Archivar incapacidad pagada:
   *  - exige soporte de liquidación (CU-29 1a),
   *  - registra la destrucción de historia clínica/epicrisis (RN-09),
   *  - genera la planilla de transferencia y notifica a Gestión Documental.
   * body: { confirmacion_destruccion_epicrisis: true, ubicacion_fisica }
   */
  archivar: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    if (caso.estado !== 'PAGADA') {
      return res.status(422).json({ error: 'Solo se archivan casos en estado PAGADA (CU-29 precondición)' });
    }
    if (!(caso.pagos || []).some((p) => p.soporte_url)) {
      return res.status(422).json({ error: 'El caso no tiene soporte de liquidación: no puede incluirse en el lote (CU-29 1a)' });
    }
    if (!req.body.confirmacion_destruccion_epicrisis) {
      return res.status(422).json({ error: 'Confirme la destrucción de la historia clínica / epicrisis (no reposan en el archivo)' });
    }

    // Destruir documentos clínicos y transferir el resto
    const documentos = await repoDocumentos.listar({ incapacidad_id: caso.id });
    for (const d of documentos) {
      await DocumentoService.marcarEstado(d.id, d.es_reservado ? 'DESTRUIDO' : 'TRANSFERIDO');
    }
    await registrarBitacora(req.usuario.id, 'CU-29:ACTA_DESTRUCCION', {
      numero_caso: caso.numero_caso,
      documentos_destruidos: documentos.filter((d) => d.es_reservado).map((d) => d.tipo_documento),
    });

    const actualizada = await cambiarEstado(caso.id, 'ARCHIVADA', req.usuario, {
      ubicacion_fisica: req.body.ubicacion_fisica || null,
    });
    await NotificacionService.notificarRol(
      'GESTION_DOCUMENTAL',
      `Transferencia ${caso.numero_caso}`,
      'Expediente físico enviado con planilla de transferencia, ordenado por entidad y fecha de inicio.'
    );

    res.json({
      caso: actualizada,
      planilla_transferencia: {
        numero_caso: caso.numero_caso,
        entidad: caso.entidad?.nombre,
        colaborador: caso.colaborador?.usuario?.nombre,
        fecha_inicio: caso.fecha_inicio,
        ubicacion_fisica: req.body.ubicacion_fisica || 'Por asignar',
        documentos_transferidos: documentos.filter((d) => !d.es_reservado).length,
        documentos_destruidos: documentos.filter((d) => d.es_reservado).length,
      },
    });
  }),
};
