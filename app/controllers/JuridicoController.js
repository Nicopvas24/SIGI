// JuridicoController - Módulo "Cobro jurídico" (CU-20 a CU-23)
import {
  repoProcesosJuridicos, incapacidadCompleta, registrarBitacora, listarIncapacidades,
} from '../repositories/index.js';
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { cambiarEstado, asyncHandler } from './_helpers.js';
import { config } from '../../config/config.js';

export const JuridicoController = {
  // GET /api/juridico/casos - expedientes en cobro jurídico
  casos: asyncHandler(async (_req, res) => {
    res.json(await listarIncapacidades({ estado: ['EN_COBRO_JURIDICO', 'DADA_DE_BAJA'] }));
  }),

  /**
   * CU-20 · Trasladar a cobro jurídico: arma el expediente (historial completo)
   * y notifica al Área Jurídica. body: { causal }
   */
  trasladar: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const actualizada = await cambiarEstado(caso.id, 'EN_COBRO_JURIDICO', req.usuario, {
      causal: req.body.causal || 'Incumplimiento de pago',
    });
    await NotificacionService.notificarRol(
      'JURIDICA',
      `Expediente ${caso.numero_caso} trasladado a cobro jurídico`,
      `Causal: ${req.body.causal || 'incumplimiento de pago'}. Revise el expediente y decida: recuperar o dar de baja.`
    );
    // El expediente es el caso completo (soportes, radicados, requerimientos, evidencias, saldo)
    res.json({
      caso: actualizada,
      expediente: {
        numero_caso: caso.numero_caso,
        colaborador: caso.colaborador?.usuario?.nombre,
        entidad: caso.entidad?.nombre,
        saldo: Number(caso.valor_solicitado || 0) - Number(caso.valor_pagado || 0),
        documentos: caso.documentos,
        gestiones: caso.gestiones,
      },
    });
  }),

  /**
   * CU-20 paso 6 · Decisión de jurídica: RECUPERAR o DAR_DE_BAJA.
   */
  decidir: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    const decision = req.body.decision;

    if (decision === 'DAR_DE_BAJA') {
      const actualizada = await cambiarEstado(caso.id, 'DADA_DE_BAJA', req.usuario);
      await NotificacionService.notificarRol('CONTABILIDAD', `Baja ${caso.numero_caso}`, 'Jurídica decidió dar de baja la incapacidad.');
      return res.json({ caso: actualizada });
    }
    await registrarBitacora(req.usuario.id, 'CU-20:DECISION_RECUPERAR', { numero_caso: caso.numero_caso });
    res.json({ mensaje: 'Decisión de recuperar registrada. Radique el derecho de petición (CU-22).' });
  }),

  /**
   * CU-22 · Radicar derecho de petición (término legal: 15 días hábiles).
   * body: { radicado, fecha_radicacion, causal_negacion }
   */
  derechoPeticion: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    if (caso.estado !== 'EN_COBRO_JURIDICO') {
      return res.status(422).json({ error: 'El caso debe estar EN_COBRO_JURIDICO (CU-21 precondición)' });
    }
    const fecha = req.body.fecha_radicacion || new Date().toISOString().slice(0, 10);
    const vencimiento = ReglasIncapacidadService.sumarDiasHabiles(
      new Date(fecha), config.plazos.respuestaDerechoPeticionDiasHabiles
    );
    const proceso = await repoProcesosJuridicos.crear({
      incapacidad_id: caso.id,
      tipo: 'DERECHO_PETICION',
      abogado_id: req.usuario.id,
      causal: req.body.causal_negacion || null,
      radicado: req.body.radicado || null,
      fecha_radicacion: fecha,
      vencimiento_termino: vencimiento.toISOString().slice(0, 10),
      estado: 'RADICADO',
    });
    res.status(201).json({ proceso, vencimiento_termino: proceso.vencimiento_termino });
  }),

  /**
   * CU-23 · Radicar acción de tutela (última opción).
   * body: { radicado, juzgado, fecha_radicacion }
   */
  accionTutela: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    // Precondición CU-23: derecho de petición negado o sin respuesta
    const peticiones = (caso.procesos || []).filter((p) => p.tipo === 'DERECHO_PETICION');
    const habilitada = peticiones.some(
      (p) => p.resultado === 'DESFAVORABLE' || p.resultado === 'SIN_RESPUESTA' ||
             (p.vencimiento_termino && new Date(p.vencimiento_termino) < new Date() && !p.resultado)
    );
    if (!habilitada) {
      return res.status(422).json({
        error: 'La tutela solo procede si el derecho de petición fue negado o no tuvo respuesta al vencer el término (CU-23 precondición).',
      });
    }

    const proceso = await repoProcesosJuridicos.crear({
      incapacidad_id: caso.id,
      tipo: 'ACCION_TUTELA',
      abogado_id: req.usuario.id,
      radicado: req.body.radicado || null,
      juzgado: req.body.juzgado || null,
      fecha_radicacion: req.body.fecha_radicacion || new Date().toISOString().slice(0, 10),
      estado: 'RADICADO',
    });
    res.status(201).json(proceso);
  }),

  /**
   * CU-21 paso 5 · Registrar respuesta/fallo de un proceso jurídico.
   * body: { resultado: FAVORABLE|DESFAVORABLE|SIN_RESPUESTA }
   */
  registrarResultado: asyncHandler(async (req, res) => {
    const proceso = await repoProcesosJuridicos.porId(req.params.procesoId);
    if (!proceso) return res.status(404).json({ error: 'Proceso no encontrado' });
    const actualizado = await repoProcesosJuridicos.actualizar(proceso.id, {
      resultado: req.body.resultado, estado: 'RESUELTO',
    });
    await registrarBitacora(req.usuario.id, 'CU-21:RESULTADO', {
      proceso_id: proceso.id, resultado: req.body.resultado,
    });
    res.json({
      proceso: actualizado,
      sugerencia: req.body.resultado === 'FAVORABLE'
        ? 'Respuesta favorable: el caso vuelve a seguimiento de pago (CU-18/CU-22 7a).'
        : proceso.tipo === 'DERECHO_PETICION'
          ? 'Negado o sin respuesta: se habilita la acción de tutela (CU-23).'
          : 'Fallo desfavorable: jurídica decide si impugna o da de baja (CU-23 7a).',
    });
  }),
};
