// CobroController - Módulo "Cobro"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoIncapacidades, repoPagos, listarIncapacidades } from '../repositories/index.js';
import { DocumentoService } from '../services/DocumentoService.js';
import { cambiarEstado, asyncHandler, notificarAuxiliares, casoOError, errorHttp, diasAcumulados } from './_helpers.js';
import { registrarGestion } from './TranscripcionController.js';
import { config } from '../../config/config.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ESTADOS_COBRO = ['RADICADA', 'ACEPTADA', 'COBRADA', 'EN_COBRO_PERSUASIVO', 'EN_COBRO_JURIDICO', 'PAGO_NOTIFICADO'];
const PUEDE_PAGAR = ['COBRADA', 'EN_COBRO_PERSUASIVO', 'EN_COBRO_JURIDICO'];
const hoy = () => new Date().toISOString().slice(0, 10);
const diasDesde = (f) => (f ? Math.floor((Date.now() - new Date(f)) / 86400000) : 0);

export const CobroController = {
  // GET /api/cobro/tablero - cartera por entidad con la siguiente gestión de cada caso
  tablero: asyncHandler(async (_req, res) => {
    const casos = await listarIncapacidades({ estado: ESTADOS_COBRO });
    const porEntidad = {};
    for (const c of casos) {
      const nombre = c.entidad?.nombre || 'Sin entidad';
      porEntidad[nombre] ||= { casos: [], saldo_adeudado: 0 };
      const gestiones = c.gestiones || [];
      const solicitud = gestiones.filter((g) => g.tipo === 'SOLICITUD_PAGO').sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
      const saldo = Math.max(Number(c.valor_solicitado || 0) - Number(c.valor_pagado || 0), 0);
      porEntidad[nombre].casos.push({
        ...c,
        saldo,
        dias_cobro: solicitud ? diasDesde(solicitud.fecha) : null,
        requerimientos: gestiones.filter((g) => g.tipo === 'REQUERIMIENTO').length,
        ultimo_seguimiento: gestiones.filter((g) => g.tipo === 'SEGUIMIENTO').map((g) => g.fecha).sort().pop() || null,
        cobro_vencido: Boolean(c.fecha_promesa_pago && c.fecha_promesa_pago < hoy() && PUEDE_PAGAR.includes(c.estado)),
      });
      if (c.estado !== 'RADICADA') porEntidad[nombre].saldo_adeudado += saldo;
    }
    res.json(porEntidad);
  }),

  /**
   * La entidad notifica la aceptación y la fecha promesa de pago,
   * o el rechazo con su causal. body: { fecha_promesa_pago } | { rechazo: true, causal }
   */
  notificarAceptacion: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['RADICADA'], 'el registro de la respuesta de la entidad');
    if (req.body.rechazo) {
      if (!req.body.causal?.trim()) throw errorHttp('Escriba la causal del rechazo.');
      await registrarGestion({ caso, tipo: 'SEGUIMIENTO', usuario: req.usuario, descripcion: `Rechazo: ${req.body.causal.trim()}` });
      await cambiarEstado(caso, 'RECHAZADA', req.usuario, { causal: req.body.causal.trim() });
      return res.json({ mensaje: 'Rechazo registrado. El caso pasa a Transcripción y radicación para subsanar la causal.' });
    }
    const fecha = req.body.fecha_promesa_pago;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) throw errorHttp('Indique la fecha promesa de pago notificada por la entidad.');
    await repoIncapacidades.actualizar(caso.id, { fecha_promesa_pago: fecha });
    await cambiarEstado(caso, 'ACEPTADA', req.usuario, { fecha_promesa_pago: fecha });
    res.json({ mensaje: `Aceptación registrada con promesa de pago el ${fecha}. Ya puede solicitar el pago.` });
  }),

  /**
   * Solicitud de pago de prestaciones económicas. La constancia de envío es obligatoria.
   * multipart: valor_solicitado?, descripcion?, evidencia
   */
  solicitarPago: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['ACEPTADA'], 'la solicitud de pago');
    const valor = Number(req.body.valor_solicitado || caso.valor_solicitado || 0);
    if (valor <= 0) throw errorHttp('El valor a solicitar debe ser mayor que cero. Revise el IBC del formato de seguimiento.');
    const formulario = caso.tipo.startsWith('LICENCIA') ? 'formulario de licencias' : 'formulario de prestaciones económicas';
    await registrarGestion({
      caso, tipo: 'SOLICITUD_PAGO', usuario: req.usuario, archivo: req.file, exigirEvidencia: true,
      descripcion: `Solicitud de pago por ${valor} (${formulario}). ${req.body.descripcion || ''}`.trim(),
    });
    await repoIncapacidades.actualizar(caso.id, { valor_solicitado: valor });
    await cambiarEstado(caso, 'COBRADA', req.usuario, { valor });
    const acumulados = await diasAcumulados(caso);
    res.json({
      mensaje: `Solicitud de pago registrada. El caso queda en cobro hasta que la entidad pague.` +
        (acumulados > 180 ? ' Atención: la incapacidad supera 180 días; desde el día 181 el trámite es del colaborador ante el fondo de pensiones.' : ''),
    });
  }),

  /**
   * Seguimiento semanal en el canal de la entidad.
   * multipart: observacion, evidencia?
   */
  seguimiento: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, PUEDE_PAGAR, 'seguimiento de cobro');
    if (!req.body.observacion?.trim()) throw errorHttp('Escriba lo que se consultó o respondió la entidad.');
    await registrarGestion({ caso, tipo: 'SEGUIMIENTO', usuario: req.usuario, archivo: req.file,
      descripcion: `Seguimiento: ${req.body.observacion.trim()}` });
    const vencido = caso.fecha_promesa_pago && caso.fecha_promesa_pago < hoy();
    res.json({
      cobro_vencido: Boolean(vencido),
      mensaje: vencido
        ? 'Seguimiento registrado. La fecha promesa de pago ya venció: puede enviar un requerimiento de cobro persuasivo.'
        : 'Seguimiento registrado.',
    });
  }),

  /**
   * Requerimiento de cobro persuasivo (mínimo dos). Genera el texto desde
   * la plantilla con fundamentos de hecho y de derecho.
   * multipart: evidencia?, deterioro_crediticio?
   */
  requerimiento: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['COBRADA', 'EN_COBRO_PERSUASIVO'], 'requerimientos de cobro');
    const numero = (caso.gestiones || []).filter((g) => g.tipo === 'REQUERIMIENTO').length + 1;

    let plantilla;
    try {
      plantilla = fs.readFileSync(path.join(aqui, '../../resources/plantillas/requerimiento_cobro.txt'), 'utf8');
    } catch {
      plantilla = 'Requerimiento de pago Nº {{numero}} del caso {{numero_caso}} a {{entidad}} por {{valor}}.';
    }
    const texto = plantilla
      .replaceAll('{{numero}}', String(numero))
      .replaceAll('{{numero_caso}}', caso.numero_caso)
      .replaceAll('{{entidad}}', caso.entidad?.nombre || '')
      .replaceAll('{{colaborador}}', caso.colaborador?.usuario?.nombre || '')
      .replaceAll('{{valor}}', Number(caso.valor_solicitado || 0).toLocaleString('es-CO'))
      .replaceAll('{{fecha}}', hoy());

    await registrarGestion({ caso, tipo: 'REQUERIMIENTO', usuario: req.usuario, archivo: req.file,
      numero: `REQ-${numero}`, descripcion: texto });
    if (caso.estado === 'COBRADA') await cambiarEstado(caso, 'EN_COBRO_PERSUASIVO', req.usuario);

    const solicitud = (caso.gestiones || []).filter((g) => g.tipo === 'SOLICITUD_PAGO').map((g) => g.fecha).sort()[0];
    const diasCobro = diasDesde(solicitud || caso.created_at);
    const ofrecerJuridica = numero >= 2 && (diasCobro >= config.plazos.diasCobroAntesDeJuridica || req.body.deterioro_crediticio === 'true');
    res.json({
      requerimiento_numero: numero, dias_cobro: diasCobro, texto, ofrecer_cobro_juridico: ofrecerJuridica,
      mensaje: `Requerimiento Nº ${numero} registrado (${diasCobro} días de cobro).` +
        (numero < 2 ? ' El procedimiento exige al menos dos requerimientos antes del traslado a jurídica.' : '') +
        (ofrecerJuridica ? ' Ya puede trasladar el caso a cobro jurídico.' : ''),
    });
  }),

  /**
   * La entidad paga: registra la transferencia y el soporte de liquidación.
   * El caso queda en Pago notificado, pendiente de conciliar con Contabilidad.
   * multipart: valor, fecha_pago, soporte?
   */
  registrarPago: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, PUEDE_PAGAR, 'el registro de un pago');
    const valor = Number(req.body.valor);
    if (!(valor > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(req.body.fecha_pago || '')) {
      throw errorHttp('Indique el valor pagado (mayor que cero) y la fecha del pago.');
    }
    const soporte = req.file ? await DocumentoService.guardarEvidencia({ incapacidad: caso, tipoGestion: 'LIQUIDACION', archivo: req.file }) : null;
    const pago = await repoPagos.crear({
      incapacidad_id: caso.id, entidad_id: caso.entidad_id, valor, fecha_pago: req.body.fecha_pago,
      soporte_url: soporte, estado: 'IDENTIFICADO',
    });
    const diferencia = valor - Number(caso.valor_solicitado || 0);
    await cambiarEstado(caso, 'PAGO_NOTIFICADO', req.usuario, { valor, diferencia });
    await notificarAuxiliares(`Pago notificado ${caso.numero_caso}`, `La entidad pagó ${valor.toLocaleString('es-CO')}. Pendiente de conciliación.`);
    res.json({
      pago, diferencia,
      mensaje: 'Pago registrado; queda pendiente de conciliar con Contabilidad.' +
        (diferencia ? ` Diferencia contra lo esperado: ${diferencia.toLocaleString('es-CO')}.` : '') +
        (soporte ? '' : ' Falta el soporte de liquidación: sin él no se podrá archivar.'),
    });
  }),
};
