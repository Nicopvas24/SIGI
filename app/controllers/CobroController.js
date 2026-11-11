// CobroController - Módulo "Cobro" (CU-17, CU-18, CU-19, CU-31, CU-32)
import {
  repoIncapacidades, repoGestiones, repoEvidencias, repoPagos,
  listarIncapacidades, incapacidadCompleta, registrarBitacora,
} from '../repositories/index.js';
import { cambiarEstado, asyncHandler, notificarAuxiliares } from './_helpers.js';
import { config } from '../../config/config.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));

export const CobroController = {
  // GET /api/cobro/tablero - casos por entidad con estado, días y saldos (CU-18 paso 2)
  tablero: asyncHandler(async (_req, res) => {
    const casos = await listarIncapacidades({
      estado: ['TRANSCRITA', 'RADICADA', 'ACEPTADA', 'RECHAZADA', 'COBRADA', 'EN_COBRO_PERSUASIVO', 'EN_COBRO_JURIDICO', 'PAGO_NOTIFICADO'],
    });
    const porEntidad = {};
    for (const c of casos) {
      const nombre = c.entidad?.nombre || 'Sin entidad';
      porEntidad[nombre] ||= { casos: [], saldo_adeudado: 0 };
      const saldo = Number(c.valor_solicitado || 0) - Number(c.valor_pagado || 0);
      porEntidad[nombre].casos.push({
        ...c,
        dias_transcurridos: Math.floor((Date.now() - new Date(c.created_at)) / 86400000),
        saldo,
        cobro_vencido: c.fecha_promesa_pago ? new Date(c.fecha_promesa_pago) < new Date() && c.estado !== 'PAGADA' : false,
      });
      if (!['PAGADA', 'ARCHIVADA', 'DADA_DE_BAJA'].includes(c.estado)) {
        porEntidad[nombre].saldo_adeudado += saldo;
      }
    }
    res.json(porEntidad);
  }),

  /**
   * CU-31 · Notificar aceptación y tiempo de pago (interfaz con la EPS/ARL).
   * body: { fecha_promesa_pago } - también sirve para registrar el rechazo
   * con body { rechazo: true, causal }.
   */
  notificarAceptacion: asyncHandler(async (req, res) => {
    const caso = await repoIncapacidades.porId(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    if (req.body.rechazo) {
      const actualizada = await cambiarEstado(caso.id, 'RECHAZADA', req.usuario, { causal: req.body.causal });
      return res.json({ caso: actualizada, mensaje: 'Rechazo registrado con causal (CU-31 1a).' });
    }

    await repoIncapacidades.actualizar(caso.id, { fecha_promesa_pago: req.body.fecha_promesa_pago || null });
    const actualizada = await cambiarEstado(caso.id, 'ACEPTADA', req.usuario, {
      fecha_promesa_pago: req.body.fecha_promesa_pago,
    });
    await notificarAuxiliares(`Aceptada ${caso.numero_caso}`, 'La entidad notificó la aceptación. Ya puede solicitar el pago (CU-17).');
    res.json({ caso: actualizada });
  }),

  /**
   * CU-17 · Solicitar pago de prestaciones económicas (semanal, por entidad).
   * body: { valor_solicitado?, evidencia_url, descripcion }
   */
  solicitarPago: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    if (!req.body.evidencia_url) {
      return res.status(422).json({ error: 'Adjunte la constancia de envío (comportamiento CU-15)' });
    }

    const valor = Number(req.body.valor_solicitado ?? caso.valor_solicitado ?? 0);
    const gestion = await repoGestiones.crear({
      incapacidad_id: caso.id,
      tipo: 'SOLICITUD_PAGO',
      descripcion: `Valor solicitado: ${valor}. ${req.body.descripcion || ''} ` +
        (caso.tipo.startsWith('LICENCIA') ? '(formulario específico de licencias, CU-17 3a)' : ''),
      responsable_id: req.usuario.id,
    });
    await repoEvidencias.crear({
      gestion_id: gestion.id, archivo_url: req.body.evidencia_url,
      descripcion: 'Constancia de solicitud de pago', usuario_id: req.usuario.id,
    });
    await repoIncapacidades.actualizar(caso.id, { valor_solicitado: valor });

    const actualizada = await cambiarEstado(caso.id, 'COBRADA', req.usuario, { valor });
    res.json({ caso: actualizada, gestion });
  }),

  /**
   * CU-18 · Hacer seguimiento al cobro: registra estado consultado,
   * observación y evidencia; detecta cobro vencido (punto de extensión -> CU-19).
   */
  seguimiento: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const gestion = await repoGestiones.crear({
      incapacidad_id: caso.id,
      tipo: 'SEGUIMIENTO',
      descripcion: `Estado consultado: ${req.body.estado_consultado || 'N/D'}. ${req.body.observacion || ''}`.trim(),
      responsable_id: req.usuario.id,
    });
    if (req.body.evidencia_url) {
      await repoEvidencias.crear({
        gestion_id: gestion.id, archivo_url: req.body.evidencia_url,
        descripcion: 'Evidencia de seguimiento', usuario_id: req.usuario.id,
      });
    }

    const vencido = caso.fecha_promesa_pago && new Date(caso.fecha_promesa_pago) < new Date();
    res.json({
      gestion,
      cobro_vencido: Boolean(vencido),
      sugerencia: vencido ? 'Cobro vencido: puede iniciar el cobro persuasivo (CU-19).' : null,
    });
  }),

  /**
   * CU-19 · Cobro persuasivo: genera el requerimiento desde la plantilla
   * (resources/plantillas) y lo registra con evidencia. Dos requerimientos
   * mínimo; a los 180 días sin pago ofrece el traslado a jurídica (CU-20).
   */
  requerimiento: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    if (caso.estado === 'COBRADA') await cambiarEstado(caso.id, 'EN_COBRO_PERSUASIVO', req.usuario);

    const previos = (await repoGestiones.listar({ incapacidad_id: caso.id, tipo: 'REQUERIMIENTO' })).length;
    const numero = previos + 1;

    // Borrador desde plantilla (resources/)
    let plantilla = '';
    try {
      plantilla = fs.readFileSync(path.join(aqui, '../../resources/plantillas/requerimiento_cobro.txt'), 'utf8');
    } catch { plantilla = 'Requerimiento de pago Nº {{numero}} - caso {{numero_caso}} - entidad {{entidad}} - valor {{valor}}'; }
    const borrador = plantilla
      .replaceAll('{{numero}}', String(numero))
      .replaceAll('{{numero_caso}}', caso.numero_caso)
      .replaceAll('{{entidad}}', caso.entidad?.nombre || '')
      .replaceAll('{{colaborador}}', caso.colaborador?.usuario?.nombre || '')
      .replaceAll('{{valor}}', String(caso.valor_solicitado || 0))
      .replaceAll('{{fecha}}', new Date().toISOString().slice(0, 10));

    const gestion = await repoGestiones.crear({
      incapacidad_id: caso.id,
      tipo: 'REQUERIMIENTO',
      numero_referencia: `REQ-${numero}`,
      descripcion: borrador,
      responsable_id: req.usuario.id,
    });
    if (req.body.evidencia_url) {
      await repoEvidencias.crear({
        gestion_id: gestion.id, archivo_url: req.body.evidencia_url,
        descripcion: `Requerimiento ${numero} enviado`, usuario_id: req.usuario.id,
      });
    }

    const diasCobro = Math.floor((Date.now() - new Date(caso.created_at)) / 86400000);
    const ofrecerJuridica = numero >= 2 && (diasCobro >= config.plazos.diasCobroAntesDeJuridica || req.body.deterioro_crediticio);
    await registrarBitacora(req.usuario.id, 'CU-19:REQUERIMIENTO', { numero_caso: caso.numero_caso, numero });

    res.json({
      gestion, requerimiento_numero: numero, dias_cobro: diasCobro,
      ofrecer_cobro_juridico: Boolean(ofrecerJuridica),
      sugerencia: ofrecerJuridica ? '180 días sin pago o deterioro crediticio: trasladar a cobro jurídico (CU-20).' : null,
    });
  }),

  /**
   * CU-32 · Realizar pago (interfaz con la EPS/ARL): registra la transferencia
   * y el soporte de liquidación; deja el caso en PAGO_NOTIFICADO por conciliar.
   */
  registrarPago: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    const { valor, fecha_pago, soporte_url } = req.body;
    if (!valor || !fecha_pago) return res.status(400).json({ error: 'valor y fecha_pago son obligatorios' });

    const pago = await repoPagos.crear({
      incapacidad_id: caso.id,
      entidad_id: caso.entidad_id,
      valor: Number(valor),
      fecha_pago,
      soporte_url: soporte_url || null,
      estado: 'IDENTIFICADO',
    });

    const diferencia = Number(valor) - Number(caso.valor_solicitado || 0);
    const actualizada = await cambiarEstado(caso.id, 'PAGO_NOTIFICADO', req.usuario, { valor, diferencia });
    await notificarAuxiliares(
      `Pago notificado ${caso.numero_caso}`,
      `Valor: ${valor}. ${diferencia !== 0 ? `Diferencia contra lo esperado: ${diferencia} (revisar en CU-24).` : ''} Pendiente de conciliación.`
    );
    res.json({ caso: actualizada, pago, diferencia });
  }),
};
