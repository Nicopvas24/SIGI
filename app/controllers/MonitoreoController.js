// MonitoreoController - Módulo "Monitoreo y reportes" (CU-26, CU-27, CU-28)
// + resumen por colaborador y análisis con IA
import { repoConceptos, listarIncapacidades, listarColaboradores, colaboradorPorId, registrarBitacora } from '../repositories/index.js';
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { IaOcrService } from '../services/IaOcrService.js';
import { asyncHandler, casoOError, errorHttp, alcanceColaboradores, verificarAlcance } from './_helpers.js';

const CERRADOS = ['ARCHIVADA', 'DADA_DE_BAJA'];
const hoy = () => new Date().toISOString().slice(0, 10);

/** Días acumulados de cada caso siguiendo su cadena de prórrogas, sin consultas adicionales. */
function calcularAcumulados(casos) {
  const porId = new Map(casos.map((c) => [c.id, c]));
  const memo = new Map();
  const acumulado = (c, profundidad = 0) => {
    if (memo.has(c.id)) return memo.get(c.id);
    const previa = c.prorroga_de && porId.get(c.prorroga_de);
    const total = c.dias + (previa && profundidad < 100 ? acumulado(previa, profundidad + 1) : 0);
    memo.set(c.id, total);
    return total;
  };
  casos.forEach((c) => acumulado(c));
  return memo;
}

/** El caso más reciente de cada cadena de prórrogas que sigue activa. */
function casosVigentes(casos) {
  const tieneProrroga = new Set(casos.map((c) => c.prorroga_de).filter(Boolean));
  return casos.filter((c) => !tieneProrroga.has(c.id) && !CERRADOS.includes(c.estado));
}

export const MonitoreoController = {
  /**
   * CU-26 · Reporte de casos que superan 90/120/150/180 días acumulados (con prórrogas),
   * con las acciones que corresponden a cada hito.
   */
  reporte: asyncHandler(async (req, res) => {
    const casos = await listarIncapacidades({});
    const acumulados = calcularAcumulados(casos);
    const filas = casosVigentes(casos)
      .map((c) => {
        const dias = acumulados.get(c.id);
        const concepto = (c.conceptos || [])[0] || null;
        return {
          incapacidad_id: c.id, numero_caso: c.numero_caso,
          colaborador: c.colaborador?.usuario?.nombre, colaborador_id: c.colaborador_id,
          entidad: c.entidad?.nombre, tipo: c.tipo, estado: c.estado,
          dias_acumulados: dias,
          umbral: ReglasIncapacidadService.umbralMonitoreo(dias),
          concepto_rehabilitacion: concepto,
          requiere_concepto: dias >= 90 && !concepto,
          vencido_concepto_120: dias >= 120 && !concepto?.resultado,
          pendiente_envio_afp: Boolean(concepto?.resultado && !concepto.enviado_afp),
          requiere_suspension_nomina: dias > 180,
        };
      })
      .filter((f) => f.dias_acumulados >= 90)
      .sort((a, b) => b.dias_acumulados - a.dias_acumulados);
    res.json({ umbrales: [90, 120, 150, 180], filas });
  }),

  /**
   * CU-27 · Concepto de rehabilitación.
   * body: { accion: 'SOLICITAR' } | { accion: 'REGISTRAR', resultado: FAVORABLE|DESFAVORABLE } | { accion: 'ENVIAR_AFP' }
   */
  conceptoRehabilitacion: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id);
    const acumulados = calcularAcumulados(await listarIncapacidades({ colaborador_id: caso.colaborador_id })).get(caso.id) || caso.dias;
    let concepto = (caso.conceptos || [])[0];

    switch (req.body.accion) {
      case 'SOLICITAR': {
        if (concepto) throw errorHttp('El concepto de rehabilitación ya fue solicitado para este caso.', 409);
        concepto = await repoConceptos.crear({ incapacidad_id: caso.id, fecha_solicitud: hoy() });
        await NotificacionService.notificarUsuario(caso.colaborador?.usuario?.id, `Concepto de rehabilitación · ${caso.numero_caso}`,
          'Gestión Humana solicitó a su EPS el concepto de rehabilitación, que debe emitirse antes del día 120 de incapacidad.');
        return res.status(201).json({ concepto, mensaje: 'Solicitud del concepto de rehabilitación registrada.' });
      }
      case 'REGISTRAR': {
        if (!concepto) throw errorHttp('Primero solicite el concepto a la EPS.', 422);
        if (!['FAVORABLE', 'DESFAVORABLE'].includes(req.body.resultado)) throw errorHttp('Indique si el concepto es favorable o desfavorable.');
        const actualizado = await repoConceptos.actualizar(concepto.id, { fecha_concepto: hoy(), resultado: req.body.resultado });
        await NotificacionService.notificarUsuario(caso.colaborador?.usuario?.id, `Concepto de rehabilitación ${req.body.resultado.toLowerCase()}`,
          `Su EPS emitió concepto de rehabilitación ${req.body.resultado.toLowerCase()} (caso ${caso.numero_caso}).`);
        return res.json({ concepto: actualizado, mensaje: `Concepto ${req.body.resultado.toLowerCase()} registrado y comunicado al colaborador. Envíelo al fondo de pensiones antes del día 150.` });
      }
      case 'ENVIAR_AFP': {
        if (!concepto?.resultado) throw errorHttp('Registre primero el resultado del concepto.', 422);
        const actualizado = await repoConceptos.actualizar(concepto.id, { enviado_afp: true, fecha_envio_afp: hoy() });
        return res.json({
          concepto: actualizado,
          mensaje: acumulados > 150
            ? 'Envío al fondo de pensiones registrado, pero después del día 150: informe a la coordinación.'
            : 'Envío al fondo de pensiones registrado dentro del plazo.',
        });
      }
      default:
        throw errorHttp('Acción no válida.');
    }
  }),

  /** CU-28 · Notificar suspensión del pago por nómina (más de 180 días acumulados). */
  suspensionNomina: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id);
    const acumulados = calcularAcumulados(await listarIncapacidades({ colaborador_id: caso.colaborador_id })).get(caso.id) || caso.dias;
    if (acumulados <= 180) throw errorHttp(`El colaborador acumula ${acumulados} días; la suspensión aplica a partir del día 181.`, 422);
    await NotificacionService.notificarUsuario(caso.colaborador?.usuario?.id, `Suspensión del pago por nómina · ${caso.numero_caso}`,
      'Su incapacidad supera 180 días. Desde el día 181 el pago por nómina se suspende y debe tramitar el reconocimiento ante su fondo de pensiones.');
    await NotificacionService.notificarRol('AUXILIAR', `Novedad de nómina · ${caso.numero_caso}`,
      `Suspender el pago por nómina de ${caso.colaborador?.usuario?.nombre} desde el día 181 y abrir el control de reintegros.`);
    await registrarBitacora(req.usuario.id, 'SUSPENSION_NOMINA', { numero_caso: caso.numero_caso, dias_acumulados: acumulados });
    res.json({ mensaje: 'Suspensión notificada al colaborador y reportada como novedad de nómina.' });
  }),

  /** GET /api/monitoreo/colaboradores - historial resumido por colaborador */
  colaboradores: asyncHandler(async (req, res) => {
    const alcance = await alcanceColaboradores(req.usuario);
    const colaboradores = (await listarColaboradores()).filter((c) => !alcance || alcance.includes(c.id));
    const casos = await listarIncapacidades(alcance ? { colaborador_id: alcance.length ? alcance : ['00000000-0000-0000-0000-000000000000'] } : {});
    const acumulados = calcularAcumulados(casos);
    const vigentes = casosVigentes(casos);
    res.json(colaboradores.map((col) => {
      const propios = casos.filter((c) => c.colaborador_id === col.id);
      const activos = vigentes.filter((c) => c.colaborador_id === col.id);
      return {
        ...col,
        total_casos: propios.length,
        total_dias: propios.filter((c) => c.estado !== 'DADA_DE_BAJA').reduce((s, c) => s + c.dias, 0),
        casos_activos: activos.length,
        dias_acumulados_actual: Math.max(0, ...activos.map((c) => acumulados.get(c.id))),
        ultimo_caso: propios[0] ? { numero_caso: propios[0].numero_caso, fecha_inicio: propios[0].fecha_inicio, estado: propios[0].estado } : null,
      };
    }));
  }),

  /** GET /api/monitoreo/colaboradores/:id - historial completo de un colaborador */
  historialColaborador: asyncHandler(async (req, res) => {
    const col = await colaboradorPorId(req.params.id);
    if (!col) throw errorHttp('Colaborador no encontrado', 404);
    await verificarAlcance(req.usuario, col.id);
    res.json(await historial(col));
  }),

  /** POST /api/ia/resumen-colaborador/:id - resumen del historial con IA */
  resumenColaboradorIA: asyncHandler(async (req, res) => {
    const col = await colaboradorPorId(req.params.id);
    if (!col) throw errorHttp('Colaborador no encontrado', 404);
    await verificarAlcance(req.usuario, col.id);
    const h = await historial(col);
    if (!h.casos.length) throw errorHttp('El colaborador no tiene incapacidades registradas para resumir.', 422);
    const resumen = await IaOcrService.resumirColaborador({
      colaborador: { cargo: col.cargo, area: col.area, eps: col.eps?.nombre, arl: col.arl?.nombre },
      estadisticas: h.estadisticas,
      casos: h.casos.map((c) => ({
        numero_caso: c.numero_caso, tipo: c.tipo, estado: c.estado, fecha_inicio: c.fecha_inicio, dias: c.dias,
        dias_acumulados: c.dias_acumulados, es_prorroga: Boolean(c.prorroga_de), entidad: c.entidad?.nombre,
        diagnostico_agrupado: (c.diagnostico_cie10 || 'sin diagnóstico').slice(0, 3),
        valor_solicitado: Number(c.valor_solicitado || 0), valor_pagado: Number(c.valor_pagado || 0),
        concepto_rehabilitacion: c.conceptos?.[0]?.resultado || null,
      })),
    });
    await registrarBitacora(req.usuario.id, 'IA:RESUMEN_COLABORADOR', { colaborador_id: col.id });
    res.json(resumen);
  }),

  /** IA · Casos activos que podrían superar 180 días acumulados. */
  prediccionIA: asyncHandler(async (_req, res) => {
    const casos = await listarIncapacidades({});
    const acumulados = calcularAcumulados(casos);
    const activos = casosVigentes(casos).filter((c) => c.estado !== 'PAGADA')
      .sort((a, b) => acumulados.get(b.id) - acumulados.get(a.id)).slice(0, 40);
    if (!activos.length) throw errorHttp('No hay casos activos para evaluar.', 422);
    res.json(await IaOcrService.predecirRiesgo180({
      casos: activos.map((c) => ({
        numero_caso: c.numero_caso, tipo: c.tipo, estado: c.estado, dias_este_caso: c.dias,
        dias_acumulados: acumulados.get(c.id), es_prorroga: Boolean(c.prorroga_de),
        diagnostico_agrupado: (c.diagnostico_cie10 || 'sin diagnóstico').slice(0, 3),
        tiene_concepto_rehabilitacion: (c.conceptos || []).length > 0,
      })),
    }));
  }),
};

async function historial(col) {
  const casos = await listarIncapacidades({ colaborador_id: col.id });
  const acumulados = calcularAcumulados(casos);
  const vigentes = casosVigentes(casos);
  const validos = casos.filter((c) => c.estado !== 'DADA_DE_BAJA');
  const anio = new Date().getFullYear().toString();
  return {
    colaborador: col,
    estadisticas: {
      total_casos: casos.length,
      total_dias: validos.reduce((s, c) => s + c.dias, 0),
      dias_este_anio: validos.filter((c) => c.fecha_inicio.startsWith(anio)).reduce((s, c) => s + c.dias, 0),
      casos_activos: vigentes.length,
      dias_acumulados_actual: Math.max(0, ...vigentes.map((c) => acumulados.get(c.id))),
      prorrogas: casos.filter((c) => c.prorroga_de).length,
      valor_solicitado: validos.reduce((s, c) => s + Number(c.valor_solicitado || 0), 0),
      valor_pagado: validos.reduce((s, c) => s + Number(c.valor_pagado || 0), 0),
      por_tipo: validos.reduce((acc, c) => ({ ...acc, [c.tipo]: (acc[c.tipo] || 0) + c.dias }), {}),
    },
    casos: casos.map((c) => ({ ...c, dias_acumulados: acumulados.get(c.id) })),
  };
}
