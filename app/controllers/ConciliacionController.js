// ConciliacionController - Módulo "Conciliación" (CU-24, CU-25)
import {
  repoPagos, repoConciliaciones, repoIncapacidades, listarIncapacidades, incapacidadCompleta, registrarBitacora,
} from '../repositories/index.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { cambiarEstado, asyncHandler, errorHttp } from './_helpers.js';

const ESTADOS_CONCILIABLES = ['PAGO_NOTIFICADO', 'COBRADA', 'EN_COBRO_PERSUASIVO', 'EN_COBRO_JURIDICO'];
const periodoValido = (p) => /^\d{4}-\d{2}$/.test(p || '');
const saldo = (c) => Math.max(Number(c.valor_solicitado || 0) - Number(c.valor_pagado || 0), 0);
// Aviso de pago de la entidad aún no conciliado (registrado desde Cobro)
const avisoPendiente = (c) => (c.pagos || []).find((p) => p.estado === 'IDENTIFICADO' && !p.conciliacion_id);

export const ConciliacionController = {
  // GET /api/conciliacion?periodo=YYYY-MM
  estado: asyncHandler(async (req, res) => {
    const periodo = periodoValido(req.query.periodo) ? req.query.periodo : new Date().toISOString().slice(0, 7);
    const conciliacion = (await repoConciliaciones.listar({ periodo }))[0] || null;
    const consignaciones = conciliacion
      ? await repoPagos.listar({ conciliacion_id: conciliacion.id }, { orden: 'fecha_pago', asc: true })
      : [];
    res.json({
      periodo, conciliacion, consignaciones,
      identificadas: consignaciones.filter((p) => p.estado !== 'POR_IDENTIFICAR').length,
      por_identificar: consignaciones.filter((p) => p.estado === 'POR_IDENTIFICAR').length,
    });
  }),

  /**
   * Contabilidad registra los valores consignados por las entidades en el periodo.
   * body: { periodo, consignaciones: [{ entidad_id, valor, fecha_pago }] }
   */
  cargarConsignaciones: asyncHandler(async (req, res) => {
    const { periodo, consignaciones = [] } = req.body;
    if (!periodoValido(periodo) || !consignaciones.length) throw errorHttp('Indique el periodo y al menos una consignación.');
    for (const c of consignaciones) {
      if (!c.entidad_id || !(Number(c.valor) > 0) || !c.fecha_pago) {
        throw errorHttp('Cada consignación necesita entidad, valor mayor que cero y fecha.');
      }
    }
    let conciliacion = (await repoConciliaciones.listar({ periodo }))[0];
    if (conciliacion?.estado === 'CONCILIADA') throw errorHttp(`El periodo ${periodo} ya está conciliado y cerrado.`, 409);
    conciliacion ||= await repoConciliaciones.crear({ periodo, estado: 'ABIERTA', total_consignado: 0 });

    const total = consignaciones.reduce((s, c) => s + Number(c.valor), 0);
    await repoConciliaciones.actualizar(conciliacion.id, { total_consignado: Number(conciliacion.total_consignado || 0) + total });
    const creados = [];
    for (const c of consignaciones) {
      creados.push(await repoPagos.crear({
        entidad_id: Number(c.entidad_id), conciliacion_id: conciliacion.id,
        valor: Number(c.valor), fecha_pago: c.fecha_pago, estado: 'POR_IDENTIFICAR',
      }));
    }
    await registrarBitacora(req.usuario.id, 'CONCILIACION:CONSIGNACIONES', { periodo, total });
    res.status(201).json({ pagos: creados, mensaje: `${creados.length} consignación(es) registrada(s). Identifique a qué casos corresponden.` });
  }),

  /**
   * Propuesta de coincidencias: cada consignación por identificar contra los casos
   * de la misma entidad pendientes de pago, ordenados por cercanía de valor.
   */
  proponerCoincidencias: asyncHandler(async (_req, res) => {
    const pagos = await repoPagos.listar({ estado: 'POR_IDENTIFICAR' }, { orden: 'fecha_pago', asc: true });
    const casos = await listarIncapacidades({ estado: ESTADOS_CONCILIABLES });
    res.json(pagos.map((p) => ({
      pago: p,
      candidatos: casos
        .filter((c) => c.entidad_id === p.entidad_id && saldo(c) > 0)
        .map((c) => {
          const aviso = avisoPendiente(c);
          const esperado = aviso ? Number(aviso.valor) : saldo(c);
          return {
            incapacidad_id: c.id, numero_caso: c.numero_caso, estado: c.estado,
            colaborador: c.colaborador?.usuario?.nombre,
            valor_esperado: esperado, diferencia: Number(p.valor) - esperado,
            pago_notificado: Boolean(aviso),
          };
        })
        .sort((a, b) => Math.abs(a.diferencia) - Math.abs(b.diferencia))
        .slice(0, 5),
    })));
  }),

  /**
   * Confirmar a qué caso corresponde una consignación: actualiza valores pagados
   * y saldos (registro en base de datos) y deja el caso Pagado, o en cobro si el pago es parcial.
   */
  confirmarCoincidencia: asyncHandler(async (req, res) => {
    const { pago_id, incapacidad_id } = req.body;
    const consignacion = await repoPagos.porId(pago_id);
    if (!consignacion || consignacion.estado !== 'POR_IDENTIFICAR') throw errorHttp('La consignación no existe o ya fue identificada.', 404);
    const caso = await incapacidadCompleta(incapacidad_id);
    if (!caso) throw errorHttp('Caso no encontrado', 404);
    if (!ESTADOS_CONCILIABLES.includes(caso.estado)) throw errorHttp(`El caso ${caso.numero_caso} no está pendiente de pago.`, 422);
    if (caso.entidad_id !== consignacion.entidad_id) throw errorHttp('La consignación es de otra entidad.', 422);

    // Si la entidad ya había notificado el pago, se une el aviso con la consignación (un solo registro de pago)
    const aviso = avisoPendiente(caso);
    if (aviso) {
      await repoPagos.actualizar(aviso.id, {
        conciliacion_id: consignacion.conciliacion_id, valor: consignacion.valor, fecha_pago: consignacion.fecha_pago,
      });
      await repoPagos.eliminar(consignacion.id);
    } else {
      await repoPagos.actualizar(consignacion.id, { incapacidad_id: caso.id, estado: 'IDENTIFICADO' });
    }

    const valorPagado = Number(caso.valor_pagado || 0) + Number(consignacion.valor);
    await repoIncapacidades.actualizar(caso.id, { valor_pagado: valorPagado });
    const pendiente = Number(caso.valor_solicitado || 0) - valorPagado;

    let mensaje;
    if (pendiente <= 0.5) {
      await cambiarEstado(caso.id, 'PAGO_NOTIFICADO', req.usuario);
      await cambiarEstado(caso.id, 'PAGADA', req.usuario, { valor_pagado: valorPagado });
      mensaje = `Pago identificado: el caso ${caso.numero_caso} queda pagado.` +
        (pendiente < -0.5 ? ` Atención: se pagó ${Math.abs(pendiente).toLocaleString('es-CO')} más de lo solicitado; revíselo con Contabilidad.` : '');
    } else {
      if (caso.estado === 'PAGO_NOTIFICADO') await cambiarEstado(caso.id, 'COBRADA', req.usuario, { pago_parcial: true });
      mensaje = `Pago parcial identificado. Queda un saldo de ${pendiente.toLocaleString('es-CO')} que vuelve a seguimiento de cobro.`;
    }
    await registrarBitacora(req.usuario.id, 'CONCILIACION:IDENTIFICAR', { numero_caso: caso.numero_caso, valor_pagado: valorPagado });
    res.json({ saldo_pendiente: Math.max(pendiente, 0), mensaje });
  }),

  /** Contabilidad concilia las cuentas y cierra el periodo. */
  cerrarPeriodo: asyncHandler(async (req, res) => {
    const { periodo } = req.body;
    const conciliacion = (await repoConciliaciones.listar({ periodo }))[0];
    if (!conciliacion) throw errorHttp('No hay consignaciones registradas en ese periodo.', 404);
    if (conciliacion.estado === 'CONCILIADA') throw errorHttp('El periodo ya está conciliado.', 409);

    const pagos = await repoPagos.listar({ conciliacion_id: conciliacion.id });
    const pendientes = pagos.filter((p) => p.estado === 'POR_IDENTIFICAR');
    if (pendientes.length && !req.body.forzar) {
      return res.status(409).json({ error: `Hay ${pendientes.length} consignación(es) sin identificar en el periodo.` });
    }
    if (pendientes.length) {
      await NotificacionService.notificarRol('CONTABILIDAD', `Valores por identificar (${periodo})`,
        `${pendientes.length} consignación(es) quedaron sin identificar. Contacte al asesor de cada entidad.`);
    }
    for (const p of pagos.filter((x) => x.estado === 'IDENTIFICADO')) await repoPagos.actualizar(p.id, { estado: 'CONCILIADO' });
    await repoConciliaciones.actualizar(conciliacion.id, { estado: 'CONCILIADA' });
    await registrarBitacora(req.usuario.id, 'CONCILIACION:CIERRE', { periodo });
    res.json({ mensaje: `Periodo ${periodo} conciliado y cerrado.` });
  }),
};
