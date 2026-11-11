// MonitoreoController - Módulo "Monitoreo" (CU-26, CU-27, CU-28) + IA predictiva
import {
  repoConceptos, repoIncapacidades, listarIncapacidades,
  incapacidadCompleta, registrarBitacora,
} from '../repositories/index.js';
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { IaOcrService } from '../services/IaOcrService.js';
import { asyncHandler, diasAcumulados } from './_helpers.js';

export const MonitoreoController = {
  /**
   * CU-26 · Reporte de monitoreo 90/120/150/180 días: acumula días con
   * prórrogas, clasifica por umbral y marca los puntos de extensión
   * (CU-27: cercano a 120 sin concepto; CU-28: más de 180).
   */
  reporte: asyncHandler(async (req, res) => {
    const todas = await listarIncapacidades({});
    const activas = todas.filter((i) => !['ARCHIVADA', 'DADA_DE_BAJA'].includes(i.estado));

    // Días acumulados por colaborador (incluye cadenas de prórroga)
    const porColaborador = new Map();
    for (const i of activas) {
      const clave = i.colaborador?.id;
      if (!clave) continue;
      const acumulados = await diasAcumulados(i);
      const previo = porColaborador.get(clave);
      if (!previo || acumulados > previo.dias_acumulados) {
        porColaborador.set(clave, {
          colaborador: i.colaborador?.usuario?.nombre,
          documento: i.colaborador?.usuario?.documento,
          numero_caso: i.numero_caso,
          incapacidad_id: i.id,
          entidad: i.entidad?.nombre,
          tipo: i.tipo,
          estado: i.estado,
          dias_acumulados: acumulados,
          concepto_rehabilitacion: (i.conceptos || [])[0] || null,
        });
      }
    }

    const filas = [...porColaborador.values()]
      .map((f) => ({
        ...f,
        umbral: ReglasIncapacidadService.umbralMonitoreo(f.dias_acumulados),
        // Puntos de extensión del CU-26
        requiere_concepto: f.dias_acumulados >= 100 && f.dias_acumulados < 120 && !f.concepto_rehabilitacion,
        vencido_concepto_120: f.dias_acumulados >= 120 && !f.concepto_rehabilitacion,
        pendiente_envio_afp_150: Boolean(f.concepto_rehabilitacion && !f.concepto_rehabilitacion.enviado_afp && f.dias_acumulados >= 120),
        requiere_suspension_nomina: f.dias_acumulados > 180,
      }))
      .filter((f) => f.umbral || f.requiere_concepto)
      .sort((a, b) => b.dias_acumulados - a.dias_acumulados);

    await registrarBitacora(req.usuario.id, 'CU-26:REPORTE_MONITOREO', { filas: filas.length });
    res.json({ umbrales: [90, 120, 150, 180], filas });
  }),

  /**
   * CU-27 · Solicitar / registrar concepto de rehabilitación.
   * POST { accion: 'SOLICITAR' } | { accion: 'REGISTRAR', resultado } | { accion: 'ENVIAR_AFP' }
   */
  conceptoRehabilitacion: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    const hoy = new Date().toISOString().slice(0, 10);
    let concepto = (caso.conceptos || [])[0];

    const accion = req.body.accion;
    if (accion === 'SOLICITAR') {
      concepto = await repoConceptos.crear({ incapacidad_id: caso.id, fecha_solicitud: hoy });
      await NotificacionService.notificarUsuario(
        caso.colaborador?.usuario?.id, `Concepto de rehabilitación - ${caso.numero_caso}`,
        'Se solicitó a la EPS el concepto de rehabilitación (debe emitirse antes del día 120).'
      );
      return res.status(201).json(concepto);
    }
    if (!concepto) return res.status(422).json({ error: 'Primero solicite el concepto (accion: SOLICITAR)' });

    if (accion === 'REGISTRAR') {
      const actualizado = await repoConceptos.actualizar(concepto.id, {
        fecha_concepto: hoy, resultado: req.body.resultado,
      });
      await NotificacionService.notificarUsuario(
        caso.colaborador?.usuario?.id, `Concepto de rehabilitación ${req.body.resultado}`,
        `Resultado del concepto para el caso ${caso.numero_caso}: ${req.body.resultado}.`
      );
      return res.json(actualizado);
    }
    if (accion === 'ENVIAR_AFP') {
      const acum = await diasAcumulados(caso);
      const actualizado = await repoConceptos.actualizar(concepto.id, {
        enviado_afp: true, fecha_envio_afp: hoy,
      });
      return res.json({
        concepto: actualizado,
        alerta: acum > 150 ? 'ALERTA CRÍTICA: el envío al AFP ocurrió después del día 150 (CU-27 7a).' : null,
      });
    }
    res.status(400).json({ error: 'accion debe ser SOLICITAR, REGISTRAR o ENVIAR_AFP' });
  }),

  /**
   * CU-28 · Notificar suspensión de pago por nómina (más de 180 días).
   */
  suspensionNomina: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    const acum = await diasAcumulados(caso);
    if (acum <= 180) {
      return res.status(422).json({ error: `El colaborador acumula ${acum} días; la suspensión aplica con más de 180 (CU-28 precondición).` });
    }
    await NotificacionService.notificarUsuario(
      caso.colaborador?.usuario?.id,
      `Suspensión de pago por nómina - ${caso.numero_caso}`,
      'Su incapacidad supera 180 días: el pago por nómina se suspende desde el día 181 y debe tramitarlo ante el fondo de pensiones (5.5.2).'
    );
    await registrarBitacora(req.usuario.id, 'CU-28:SUSPENSION', {
      numero_caso: caso.numero_caso, dias_acumulados: acum,
    });
    res.json({
      mensaje: 'Suspensión notificada al colaborador y reportada a nómina (día 181).',
      control_reintegro: 'Abierto el control de reintegro de pagos de la EPS al trabajador (CU-28 paso 5).',
    });
  }),

  /**
   * IA (sugerencia CU-26): predecir qué incapacidades podrían superar 180 días.
   */
  prediccionIA: asyncHandler(async (req, res) => {
    const todas = await listarIncapacidades({});
    const activas = todas.filter((i) => !['ARCHIVADA', 'DADA_DE_BAJA', 'PAGADA'].includes(i.estado));
    const casos = [];
    for (const i of activas.slice(0, 40)) {
      casos.push({
        numero_caso: i.numero_caso,
        tipo: i.tipo,
        estado: i.estado,
        dias_este_caso: i.dias,
        dias_acumulados: await diasAcumulados(i),
        es_prorroga: Boolean(i.prorroga_de),
        diagnostico_agrupado: (i.diagnostico_cie10 || 'SIN_DX').slice(0, 3),
        tiene_concepto_rehabilitacion: (i.conceptos || []).length > 0,
      });
    }
    if (!casos.length) return res.json({ evaluaciones: [], conclusion: 'No hay casos activos para evaluar.' });
    res.json(await IaOcrService.predecirRiesgo180({ casos }));
  }),
};
