// TranscripcionController - Módulo "Transcripción, radicación y SG-SST" (CU-11 a CU-16)
import {
  repoIncapacidades, repoEntidades, repoGestiones, repoEvidencias,
  listarIncapacidades, incapacidadCompleta, registrarBitacora,
} from '../repositories/index.js';
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { IaOcrService } from '../services/IaOcrService.js';
import { cambiarEstado, asyncHandler } from './_helpers.js';

export const TranscripcionController = {
  // GET /api/transcripcion/pendientes - bandeja "Por transcribir" con plazo restante y canal (CU-11 paso 2)
  pendientes: asyncHandler(async (_req, res) => {
    const casos = await listarIncapacidades({ estado: 'VERIFICADA' });
    const conPlazo = casos.map((c) => {
      const dias = ReglasIncapacidadService.diasRestantesTranscripcion(c.entidad, c);
      return {
        ...c,
        plazo_restante_dias: dias,
        canal_entidad: c.entidad.canal_transcripcion,
        prioritario: dias <= 15,             // CU-12 2a
        plazo_vencido: dias <= 0,            // CU-11 2a: bloquea el trámite normal
      };
    });
    res.json(conPlazo.sort((a, b) => a.plazo_restante_dias - b.plazo_restante_dias));
  }),

  /**
   * CU-11/12/13 · Registrar la transcripción (portal web o correo según la entidad).
   * body: { numero_transcripcion, evidencia_url, descripcion }
   */
  transcribir: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const diasRestantes = ReglasIncapacidadService.diasRestantesTranscripcion(caso.entidad, caso);
    if (diasRestantes <= 0 && !req.body.autorizado_coordinacion) {
      return res.status(422).json({
        error: 'Plazo de transcripción vencido: el trámite queda para revisión de la coordinación (CU-11 2a).',
      });
    }
    if (!req.body.numero_transcripcion) {
      return res.status(400).json({ error: 'Registre el número o constancia de transcripción' });
    }

    const gestion = await repoGestiones.crear({
      incapacidad_id: caso.id,
      tipo: 'TRANSCRIPCION',
      numero_referencia: req.body.numero_transcripcion,
      descripcion: `Canal: ${caso.entidad.canal_transcripcion}. ${req.body.descripcion || ''}`.trim(),
      responsable_id: req.usuario.id,
    });
    if (req.body.evidencia_url) {
      await repoEvidencias.crear({
        gestion_id: gestion.id, archivo_url: req.body.evidencia_url,
        descripcion: 'Constancia de transcripción', usuario_id: req.usuario.id,
      });
    }

    const actualizada = await cambiarEstado(caso.id, 'TRANSCRITA', req.usuario, {
      numero_transcripcion: req.body.numero_transcripcion,
    });
    res.json({
      caso: actualizada, gestion,
      mensaje: 'Transcrita. El físico pasa a novedades de nómina (5.2).',
    });
  }),

  /**
   * CU-14 · Radicar ante EPS/ARL - «include» CU-15 (evidencia obligatoria).
   * body: { numero_radicado, medio: 'WEB'|'FISICO', evidencia_url, descripcion }
   */
  radicar: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    const { numero_radicado, medio, evidencia_url, descripcion } = req.body;

    if (!numero_radicado) return res.status(400).json({ error: 'Registre el número de radicado' });
    // CU-15 3a: sin evidencia no se permite cerrar la gestión
    if (!evidencia_url) {
      return res.status(422).json({ error: 'Debe adjuntar la evidencia documental de la radicación (CU-15)' });
    }

    const gestion = await repoGestiones.crear({
      incapacidad_id: caso.id,
      tipo: 'RADICACION',
      numero_referencia: numero_radicado,
      descripcion: `Medio: ${medio || 'WEB'}. ${descripcion || ''}`.trim(),
      responsable_id: req.usuario.id,
    });
    await repoEvidencias.crear({
      gestion_id: gestion.id, archivo_url: evidencia_url,
      descripcion: 'Evidencia de radicación (CU-15)', usuario_id: req.usuario.id,
    });
    await registrarBitacora(req.usuario.id, 'CU-15:EVIDENCIA', { gestion_id: gestion.id });

    const actualizada = await cambiarEstado(caso.id, 'RADICADA', req.usuario, { numero_radicado });
    res.json({ caso: actualizada, gestion, mensaje: 'Radicada con evidencia. Seguimiento semanal programado.' });
  }),

  /**
   * Rechazo de transcripción/radicación por la entidad (CU-12 3b, CU-13 5b).
   */
  rechazar: asyncHandler(async (req, res) => {
    const actualizada = await cambiarEstado(req.params.id, 'RECHAZADA', req.usuario, {
      causal: req.body.causal || 'Sin causal registrada',
    });
    res.json({ caso: actualizada, mensaje: 'Caso en RECHAZADA para subsanar y solicitar nueva transcripción.' });
  }),

  // Subsanar: devuelve el caso rechazado a VERIFICADA (para nueva transcripción)
  subsanar: asyncHandler(async (req, res) => {
    const actualizada = await cambiarEstado(req.params.id, 'VERIFICADA', req.usuario, {
      subsanacion: req.body.descripcion || '',
    });
    res.json({ caso: actualizada });
  }),

  /**
   * CU-16 · Reporte de ausentismo al SG-SST (primeros 3 días del mes).
   * GET /api/sgsst/reporte?periodo=YYYY-MM  (+ ?ia=true para análisis con IA)
   */
  reporteAusentismo: asyncHandler(async (req, res) => {
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);
    const [anio, mes] = periodo.split('-').map(Number);
    const desde = new Date(anio, mes - 1, 1);
    const hasta = new Date(anio, mes, 0);

    const todas = await listarIncapacidades({});
    const delPeriodo = todas.filter(
      (i) => new Date(i.fecha_inicio) <= hasta && new Date(i.fecha_fin) >= desde
    );

    const registros = delPeriodo.map((i) => ({
      colaborador: i.colaborador?.usuario?.nombre,
      area: i.colaborador?.area,
      tipo: i.tipo,
      origen: ['ACCIDENTE_LABORAL'].includes(i.tipo) ? 'LABORAL' : 'COMUN',
      dias: i.dias,
      // Reserva clínica: solo el código agrupado (CU-16 3b)
      diagnostico_agrupado: (i.diagnostico_cie10 || 'SIN_DX').slice(0, 3),
      estado: i.estado,
    }));

    const diasPerdidos = registros.reduce((s, r) => s + r.dias, 0);
    const resumen = {
      periodo,
      total_incapacidades: registros.length,
      dias_perdidos: diasPerdidos,
      por_tipo: agrupar(registros, 'tipo'),
      por_area: agrupar(registros, 'area'),
      indice_frecuencia: registros.length,       // eventos del periodo
      indice_severidad: diasPerdidos,            // días perdidos del periodo
      extemporaneo: new Date().getDate() > 3 && periodo === new Date().toISOString().slice(0, 7) ? false : undefined,
    };

    let analisis_ia = null;
    if (req.query.ia === 'true') {
      analisis_ia = await IaOcrService.analizarAusentismo({
        periodo, resumen,
        registros: registros.map(({ colaborador, ...r }) => r), // anonimizado para la IA
      });
    }
    await registrarBitacora(req.usuario.id, 'CU-16:REPORTE_SGSST', { periodo });
    res.json({ resumen, registros, analisis_ia });
  }),

  // Catálogo de entidades con plazos (apoyo a la vista de transcripción)
  entidadesPlazos: asyncHandler(async (_req, res) => {
    res.json(await repoEntidades.listar({}, { orden: 'nombre', asc: true }));
  }),
};

function agrupar(filas, campo) {
  return filas.reduce((acc, f) => {
    const k = f[campo] || 'SIN_DATO';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}
