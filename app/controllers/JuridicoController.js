// JuridicoController - Módulo "Cobro jurídico" (CU-20 a CU-23)
import { repoProcesosJuridicos, listarIncapacidades, registrarBitacora } from '../repositories/index.js';
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { cambiarEstado, asyncHandler, casoOError, errorHttp } from './_helpers.js';
import { registrarGestion } from './TranscripcionController.js';
import { config } from '../../config/config.js';

const hoy = () => new Date().toISOString().slice(0, 10);

export const JuridicoController = {
  // GET /api/juridico/casos - expedientes en cobro jurídico y dados de baja
  casos: asyncHandler(async (_req, res) => {
    res.json(await listarIncapacidades({ estado: ['EN_COBRO_JURIDICO', 'DADA_DE_BAJA'] }));
  }),

  /**
   * CU-20 · Trasladar a cobro jurídico: por incumplimiento de pago tras el cobro
   * persuasivo, o por una causal de rechazo improcedente. body: { causal }
   */
  trasladar: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['EN_COBRO_PERSUASIVO', 'RECHAZADA'], 'el traslado a jurídica');
    const causal = req.body.causal?.trim();
    if (!causal) throw errorHttp('Escriba la causal del traslado.');
    if (caso.estado === 'EN_COBRO_PERSUASIVO') {
      const requerimientos = caso.gestiones.filter((g) => g.tipo === 'REQUERIMIENTO').length;
      if (requerimientos < 2) throw errorHttp('Antes del traslado deben enviarse al menos dos requerimientos de cobro persuasivo.', 422);
    }
    await registrarGestion({ caso, tipo: 'SEGUIMIENTO', usuario: req.usuario, descripcion: `Traslado a jurídica: ${causal}` });
    await cambiarEstado(caso.id, 'EN_COBRO_JURIDICO', req.usuario, { causal });
    await NotificacionService.notificarRol('JURIDICA', `Expediente ${caso.numero_caso} en cobro jurídico`,
      `${caso.colaborador?.usuario?.nombre} · ${caso.entidad?.nombre}. Causal: ${causal}. Revise el expediente y decida si se recupera o se da de baja.`);
    res.json({ mensaje: `Expediente ${caso.numero_caso} trasladado al área jurídica.` });
  }),

  /** Decisión de jurídica sobre el expediente: RECUPERAR o DAR_DE_BAJA. */
  decidir: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['EN_COBRO_JURIDICO'], 'esta decisión');
    if (req.body.decision === 'DAR_DE_BAJA') {
      await cambiarEstado(caso.id, 'DADA_DE_BAJA', req.usuario, { motivo: req.body.motivo || null });
      await NotificacionService.notificarRol('CONTABILIDAD', `Baja de cartera · ${caso.numero_caso}`,
        `Jurídica dio de baja el saldo de ${caso.entidad?.nombre}.${req.body.motivo ? ` Motivo: ${req.body.motivo}` : ''}`);
      return res.json({ mensaje: `Caso ${caso.numero_caso} dado de baja. Contabilidad fue notificada.` });
    }
    if (req.body.decision !== 'RECUPERAR') throw errorHttp('La decisión debe ser recuperar o dar de baja.');
    await registrarBitacora(req.usuario.id, 'JURIDICA:RECUPERAR', { numero_caso: caso.numero_caso });
    res.json({ mensaje: 'Decisión de recuperar registrada. El primer paso es radicar el derecho de petición.' });
  }),

  /** CU-22 · Radicar derecho de petición (término de respuesta: 15 días hábiles). */
  derechoPeticion: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['EN_COBRO_JURIDICO'], 'un derecho de petición');
    if (!req.body.radicado?.trim()) throw errorHttp('Escriba el número de radicado.');
    if ((caso.procesos || []).some((p) => p.tipo === 'DERECHO_PETICION' && !p.resultado)) {
      throw errorHttp('Ya hay un derecho de petición en curso. Registre su respuesta antes de radicar otro.', 409);
    }
    const fecha = req.body.fecha_radicacion || hoy();
    const vencimiento = ReglasIncapacidadService.sumarDiasHabiles(new Date(fecha), config.plazos.respuestaDerechoPeticionDiasHabiles)
      .toISOString().slice(0, 10);
    const proceso = await repoProcesosJuridicos.crear({
      incapacidad_id: caso.id, tipo: 'DERECHO_PETICION', abogado_id: req.usuario.id,
      causal: req.body.causal_negacion?.trim() || null, radicado: req.body.radicado.trim(),
      fecha_radicacion: fecha, vencimiento_termino: vencimiento, estado: 'RADICADO',
    });
    res.status(201).json({ proceso, mensaje: `Derecho de petición radicado. La entidad debe responder a más tardar el ${vencimiento}.` });
  }),

  /** CU-23 · Radicar acción de tutela: procede si la petición fue negada o no se respondió a tiempo. */
  accionTutela: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['EN_COBRO_JURIDICO'], 'una acción de tutela');
    if (!req.body.radicado?.trim() || !req.body.juzgado?.trim()) throw errorHttp('Escriba el número de proceso y el juzgado.');
    const procede = (caso.procesos || []).some((p) => p.tipo === 'DERECHO_PETICION' && (
      p.resultado === 'DESFAVORABLE' || p.resultado === 'SIN_RESPUESTA' ||
      (!p.resultado && p.vencimiento_termino && p.vencimiento_termino < hoy())));
    if (!procede) {
      throw errorHttp('La tutela solo procede cuando el derecho de petición fue negado o no se respondió dentro del término.', 422);
    }
    const proceso = await repoProcesosJuridicos.crear({
      incapacidad_id: caso.id, tipo: 'ACCION_TUTELA', abogado_id: req.usuario.id,
      radicado: req.body.radicado.trim(), juzgado: req.body.juzgado.trim(),
      fecha_radicacion: req.body.fecha_radicacion || hoy(), estado: 'RADICADO',
    });
    res.status(201).json({ proceso, mensaje: 'Acción de tutela radicada.' });
  }),

  /** Registrar la respuesta o el fallo de un proceso: FAVORABLE | DESFAVORABLE | SIN_RESPUESTA. */
  registrarResultado: asyncHandler(async (req, res) => {
    const proceso = await repoProcesosJuridicos.porId(req.params.procesoId);
    if (!proceso) throw errorHttp('Proceso no encontrado', 404);
    if (!['FAVORABLE', 'DESFAVORABLE', 'SIN_RESPUESTA'].includes(req.body.resultado)) throw errorHttp('Resultado no válido.');
    const actualizado = await repoProcesosJuridicos.actualizar(proceso.id, { resultado: req.body.resultado, estado: 'RESUELTO' });
    await registrarBitacora(req.usuario.id, 'JURIDICA:RESULTADO', { proceso_id: proceso.id, resultado: req.body.resultado });
    const siguiente = req.body.resultado === 'FAVORABLE'
      ? 'Respuesta favorable: registre el pago desde Cobro cuando la entidad consigne.'
      : proceso.tipo === 'DERECHO_PETICION'
        ? 'Sin respuesta favorable: ya puede radicar la acción de tutela.'
        : 'Fallo desfavorable: decida si se impugna o se da de baja el caso.';
    res.json({ proceso: actualizado, mensaje: siguiente });
  }),
};
