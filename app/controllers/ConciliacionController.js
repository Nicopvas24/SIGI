// ConciliacionController - Módulo "Conciliación"
import {
  repoPagos, repoConciliaciones, repoIncapacidades, listarIncapacidades, incapacidadCompleta, registrarBitacora,
} from '../repositories/index.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { supabase } from '../../config/supabase.js';
import { cambiarEstado, asyncHandler, errorHttp } from './_helpers.js';

const ESTADOS_CONCILIABLES = ['PAGO_NOTIFICADO', 'COBRADA', 'EN_COBRO_PERSUASIVO', 'EN_COBRO_JURIDICO'];
const periodoValido = (p) => /^\d{4}-\d{2}$/.test(p || '');
const saldo = (c) => Math.max(Number(c.valor_solicitado || 0) - Number(c.valor_pagado || 0), 0);
// Aviso de pago de la entidad aún no conciliado (registrado desde Cobro)
const avisoPendiente = (c) => (c.pagos || []).find((p) => p.estado === 'IDENTIFICADO' && !p.conciliacion_id);
const SELECT_PAGO = '*, incapacidad:incapacidades(id, numero_caso, estado, colaborador:colaboradores(usuario:usuarios!usuario_id(nombre)))';

async function conciliacionAbierta(periodo) {
  const existente = (await repoConciliaciones.listar({ periodo }))[0];
  if (existente?.estado === 'CONCILIADA') throw errorHttp(`El periodo ${periodo} ya está conciliado y cerrado.`, 409);
  return existente || repoConciliaciones.crear({ periodo, estado: 'ABIERTA', total_consignado: 0 });
}

/** Suma el pago al caso y lo deja Pagado, o de vuelta en cobro si el pago fue parcial. */
async function aplicarPago(caso, valor, usuario) {
  const valorPagado = Number(caso.valor_pagado || 0) + Number(valor);
  await repoIncapacidades.actualizar(caso.id, { valor_pagado: valorPagado });
  const pendiente = Number(caso.valor_solicitado || 0) - valorPagado;
  if (pendiente <= 0.5) {
    await cambiarEstado(caso, 'PAGO_NOTIFICADO', usuario);
    await cambiarEstado(caso, 'PAGADA', usuario, { valor_pagado: valorPagado });
    return {
      saldo_pendiente: 0,
      mensaje: `El caso ${caso.numero_caso} queda pagado y pasa a Archivo.` +
        (pendiente < -0.5 ? ` Atención: se pagó ${Math.abs(pendiente).toLocaleString('es-CO')} más de lo solicitado; revíselo con Contabilidad.` : ''),
    };
  }
  if (caso.estado === 'PAGO_NOTIFICADO') await cambiarEstado(caso, 'COBRADA', usuario, { pago_parcial: true });
  return { saldo_pendiente: pendiente, mensaje: `Pago parcial: queda un saldo de ${pendiente.toLocaleString('es-CO')} que vuelve a seguimiento de cobro.` };
}

export const ConciliacionController = {
  // GET /api/conciliacion?periodo=YYYY-MM
  estado: asyncHandler(async (req, res) => {
    const periodo = periodoValido(req.query.periodo) ? req.query.periodo : new Date().toISOString().slice(0, 7);
    const conciliacion = (await repoConciliaciones.listar({ periodo }))[0] || null;
    const [consignaciones, notificados] = await Promise.all([
      conciliacion
        ? supabase.from('pagos').select(SELECT_PAGO).eq('conciliacion_id', conciliacion.id).order('fecha_pago')
          .then(({ data, error }) => { if (error) throw new Error(error.message); return data; })
        : [],
      listarIncapacidades({ estado: ['PAGO_NOTIFICADO'] }),
    ]);
    // Pagos que Cobro registró y que Contabilidad todavía no ha confirmado como consignados
    const avisos = notificados.map((c) => ({ caso: c, aviso: avisoPendiente(c) })).filter((x) => x.aviso).map(({ caso, aviso }) => ({
      pago_id: aviso.id, incapacidad_id: caso.id, numero_caso: caso.numero_caso, colaborador: caso.colaborador?.usuario?.nombre,
      entidad: caso.entidad?.nombre, valor: Number(aviso.valor), fecha_pago: aviso.fecha_pago, tiene_soporte: Boolean(aviso.soporte_url),
      valor_solicitado: Number(caso.valor_solicitado || 0), saldo: saldo(caso),
    }));
    res.json({
      periodo, conciliacion, consignaciones, avisos,
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
    const conciliacion = await conciliacionAbierta(periodo);

    const total = consignaciones.reduce((s, c) => s + Math.round(Number(c.valor)), 0);
    await repoConciliaciones.actualizar(conciliacion.id, { total_consignado: Number(conciliacion.total_consignado || 0) + total });
    const creados = [];
    for (const c of consignaciones) {
      creados.push(await repoPagos.crear({
        entidad_id: Number(c.entidad_id), conciliacion_id: conciliacion.id,
        valor: Math.round(Number(c.valor)), fecha_pago: c.fecha_pago, estado: 'POR_IDENTIFICAR',
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

    const r = await aplicarPago(caso, consignacion.valor, req.usuario);
    registrarBitacora(req.usuario.id, 'CONCILIACION:IDENTIFICAR', { numero_caso: caso.numero_caso, valor: Number(consignacion.valor) });
    res.json({ ...r, mensaje: `Pago identificado. ${r.mensaje}` });
  }),

  /**
   * Contabilidad confirma que el pago que registró Cobro sí llegó a la cuenta:
   * lo asocia al periodo, lo suma al total consignado y deja el caso pagado (o en cobro si fue parcial).
   * body: { pago_id, periodo, valor?, fecha_consignacion? }
   */
  confirmarAviso: asyncHandler(async (req, res) => {
    const { pago_id, periodo } = req.body;
    if (!periodoValido(periodo)) throw errorHttp('Indique el periodo de la consignación.');
    const aviso = await repoPagos.porId(pago_id);
    if (!aviso || aviso.estado !== 'IDENTIFICADO' || aviso.conciliacion_id || !aviso.incapacidad_id) {
      throw errorHttp('Ese pago no existe o ya fue conciliado.', 404);
    }
    const caso = await incapacidadCompleta(aviso.incapacidad_id);
    if (caso.estado !== 'PAGO_NOTIFICADO') throw errorHttp(`El caso ${caso.numero_caso} no tiene un pago pendiente de confirmar.`, 422);
    const valor = Math.round(req.body.valor ? Number(req.body.valor) : Number(aviso.valor));
    if (!(valor > 0)) throw errorHttp('El valor consignado debe ser mayor que cero.');

    const conciliacion = await conciliacionAbierta(periodo);
    await Promise.all([
      repoPagos.actualizar(aviso.id, { conciliacion_id: conciliacion.id, valor, fecha_pago: req.body.fecha_consignacion || aviso.fecha_pago }),
      repoConciliaciones.actualizar(conciliacion.id, { total_consignado: Number(conciliacion.total_consignado || 0) + valor }),
    ]);
    const r = await aplicarPago(caso, valor, req.usuario);
    registrarBitacora(req.usuario.id, 'CONCILIACION:CONFIRMAR_PAGO', { numero_caso: caso.numero_caso, valor, periodo });
    res.json({ ...r, mensaje: `Consignación confirmada. ${r.mensaje}` });
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
    await Promise.all(pagos.filter((x) => x.estado === 'IDENTIFICADO').map((p) => repoPagos.actualizar(p.id, { estado: 'CONCILIADO' })));
    await repoConciliaciones.actualizar(conciliacion.id, { estado: 'CONCILIADA' });
    await registrarBitacora(req.usuario.id, 'CONCILIACION:CIERRE', { periodo });
    res.json({ mensaje: `Periodo ${periodo} conciliado y cerrado.` });
  }),
};
