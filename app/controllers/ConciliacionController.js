// ConciliacionController - Módulo "Conciliación" (CU-24, CU-25)
import {
  repoPagos, repoConciliaciones, repoIncapacidades,
  listarIncapacidades, registrarBitacora,
} from '../repositories/index.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { cambiarEstado, asyncHandler } from './_helpers.js';

export const ConciliacionController = {
  // GET /api/conciliacion?periodo=YYYY-MM
  estado: asyncHandler(async (req, res) => {
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);
    const conciliaciones = await repoConciliaciones.listar({ periodo });
    const pagos = await repoPagos.listar({}, { orden: 'fecha_pago', asc: false });
    const cobradas = await listarIncapacidades({ estado: ['COBRADA', 'PAGO_NOTIFICADO'] });
    res.json({
      periodo,
      conciliacion: conciliaciones[0] || null,
      pagos_por_identificar: pagos.filter((p) => p.estado === 'POR_IDENTIFICAR'),
      pagos_identificados: pagos.filter((p) => p.estado !== 'POR_IDENTIFICAR'),
      casos_cobrados: cobradas,
    });
  }),

  /**
   * CU-24 pasos 1-2 · Contabilidad carga las consignaciones del mes.
   * body: { periodo, consignaciones: [{ entidad_id, valor, fecha_pago }] }
   */
  cargarConsignaciones: asyncHandler(async (req, res) => {
    const { periodo, consignaciones = [] } = req.body;
    if (!periodo || !consignaciones.length) {
      return res.status(400).json({ error: 'Envíe periodo y consignaciones' });
    }
    let conciliacion = (await repoConciliaciones.listar({ periodo }))[0];
    if (!conciliacion) {
      conciliacion = await repoConciliaciones.crear({ periodo, estado: 'ABIERTA' });
    }
    const total = consignaciones.reduce((s, c) => s + Number(c.valor), 0);
    await repoConciliaciones.actualizar(conciliacion.id, {
      total_consignado: Number(conciliacion.total_consignado || 0) + total,
    });

    const creados = [];
    for (const c of consignaciones) {
      creados.push(await repoPagos.crear({
        entidad_id: c.entidad_id,
        conciliacion_id: conciliacion.id,
        valor: Number(c.valor),
        fecha_pago: c.fecha_pago,
        estado: 'POR_IDENTIFICAR',
      }));
    }
    await registrarBitacora(req.usuario.id, 'CU-24:CONSIGNACIONES', { periodo, total });
    res.status(201).json({ conciliacion, pagos: creados });
  }),

  /**
   * CU-24 paso 4 · Propuesta de coincidencias: cruza pagos POR_IDENTIFICAR
   * con los casos COBRADA de la misma entidad por valor y fechas.
   */
  proponerCoincidencias: asyncHandler(async (_req, res) => {
    const pagos = await repoPagos.listar({ estado: 'POR_IDENTIFICAR' }, { orden: 'fecha_pago', asc: true });
    const cobradas = await listarIncapacidades({ estado: ['COBRADA', 'PAGO_NOTIFICADO'] });
    const propuestas = pagos.map((p) => {
      const candidatos = cobradas
        .filter((c) => c.entidad_id === p.entidad_id)
        .map((c) => ({
          incapacidad_id: c.id,
          numero_caso: c.numero_caso,
          colaborador: c.colaborador?.usuario?.nombre,
          valor_esperado: Number(c.valor_solicitado || 0),
          diferencia: Number(p.valor) - Number(c.valor_solicitado || 0),
        }))
        .sort((a, b) => Math.abs(a.diferencia) - Math.abs(b.diferencia))
        .slice(0, 3);
      return { pago: p, candidatos };
    });
    res.json(propuestas);
  }),

  /**
   * CU-24 pasos 5-7 · Confirmar coincidencia: marca el caso PAGADA,
   * calcula diferencias y ejecuta CU-25 («include»: registrar en base de datos).
   */
  confirmarCoincidencia: asyncHandler(async (req, res) => {
    const { pago_id, incapacidad_id } = req.body;
    const pago = await repoPagos.porId(pago_id);
    const caso = await repoIncapacidades.porId(incapacidad_id);
    if (!pago || !caso) return res.status(404).json({ error: 'Pago o caso no encontrado' });

    await repoPagos.actualizar(pago.id, { incapacidad_id: caso.id, estado: 'IDENTIFICADO' });

    const valorPagadoTotal = Number(caso.valor_pagado || 0) + Number(pago.valor);
    const diferencia = Number(caso.valor_solicitado || 0) - valorPagadoTotal;
    // CU-25 «include»: actualiza valores pagados y saldos en la base de seguimiento
    await repoIncapacidades.actualizar(caso.id, { valor_pagado: valorPagadoTotal });

    let estadoFinal = caso.estado;
    if (diferencia <= 0.01) {
      if (caso.estado === 'COBRADA') await cambiarEstado(caso.id, 'PAGO_NOTIFICADO', req.usuario);
      const act = await cambiarEstado(caso.id, 'PAGADA', req.usuario, { valor_pagado: valorPagadoTotal });
      estadoFinal = act.estado;
    }
    await registrarBitacora(req.usuario.id, 'CU-25:REGISTRO_BD', {
      numero_caso: caso.numero_caso, valor_pagado: valorPagadoTotal, saldo: Math.max(diferencia, 0),
    });

    res.json({
      pago_identificado: true,
      estado_caso: estadoFinal,
      valor_pagado_total: valorPagadoTotal,
      saldo_pendiente: Math.max(diferencia, 0),
      nota: diferencia > 0.01 ? 'Pago parcial: el saldo vuelve a seguimiento (CU-24 6a).' : null,
      alerta: diferencia < -0.01 ? 'El valor pagado supera el solicitado: revisar (CU-25 2a).' : null,
    });
  }),

  /**
   * CU-24 pasos 9-10 · Contabilidad concilia y cierra el periodo.
   */
  cerrarPeriodo: asyncHandler(async (req, res) => {
    const periodo = req.body.periodo;
    const conciliacion = (await repoConciliaciones.listar({ periodo }))[0];
    if (!conciliacion) return res.status(404).json({ error: 'No hay conciliación abierta para ese periodo' });

    const pendientes = await repoPagos.listar({ conciliacion_id: conciliacion.id, estado: 'POR_IDENTIFICAR' });
    if (pendientes.length && !req.body.forzar) {
      await NotificacionService.notificarRol('CONTABILIDAD', `Valores por identificar (${periodo})`,
        `${pendientes.length} consignación(es) sin identificar. Contactar al asesor de la entidad (CU-24 4a).`);
      return res.status(409).json({ error: `Hay ${pendientes.length} pago(s) por identificar`, pendientes });
    }

    const pagos = await repoPagos.listar({ conciliacion_id: conciliacion.id });
    for (const p of pagos.filter((x) => x.estado === 'IDENTIFICADO')) {
      await repoPagos.actualizar(p.id, { estado: 'CONCILIADO' });
    }
    const cerrada = await repoConciliaciones.actualizar(conciliacion.id, { estado: 'CONCILIADA' });
    await registrarBitacora(req.usuario.id, 'CU-24:PERIODO_CONCILIADO', { periodo });
    res.json({ conciliacion: cerrada, mensaje: `Periodo ${periodo} conciliado.` });
  }),
};
