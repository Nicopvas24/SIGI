// TranscripcionController - Módulo "Transcripción, radicación y SG-SST"
import { repoGestiones, repoEvidencias, listarIncapacidades, registrarBitacora } from '../repositories/index.js';
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { DocumentoService } from '../services/DocumentoService.js';
import { IaOcrService } from '../services/IaOcrService.js';
import { cambiarEstado, asyncHandler, casoOError, errorHttp } from './_helpers.js';

/** Registra una gestión ante la entidad y, si llega archivo, su evidencia. */
export async function registrarGestion({ caso, tipo, usuario, numero, descripcion, archivo, exigirEvidencia = false }) {
  if (exigirEvidencia && !archivo) {
    throw errorHttp('Adjunte la evidencia de la gestión (pantallazo, constancia o radicado en PDF o imagen).');
  }
  const url = archivo ? await DocumentoService.guardarEvidencia({ incapacidad: caso, tipoGestion: tipo, archivo }) : null;
  const gestion = await repoGestiones.crear({
    incapacidad_id: caso.id, tipo, numero_referencia: numero || null,
    descripcion: descripcion || null, responsable_id: usuario.id,
  });
  if (url) {
    await repoEvidencias.crear({ gestion_id: gestion.id, archivo_url: url, descripcion: descripcion || tipo, usuario_id: usuario.id });
  }
  await registrarBitacora(usuario.id, `GESTION:${tipo}`, { numero_caso: caso.numero_caso, gestion_id: gestion.id, evidencia: Boolean(url) });
  return gestion;
}

export const TranscripcionController = {
  /**
   * GET /api/transcripcion/pendientes
   * Verificadas (por transcribir o radicar), transcritas (por radicar) y rechazadas (por subsanar),
   * con el plazo de transcripción que les queda según la entidad.
   */
  pendientes: asyncHandler(async (_req, res) => {
    const casos = await listarIncapacidades({ estado: ['VERIFICADA', 'TRANSCRITA', 'RECHAZADA'] });
    const filas = casos.map((c) => {
      const dias = ReglasIncapacidadService.diasRestantesTranscripcion(c.entidad, c);
      const rechazo = [...(c.gestiones || [])].reverse().find((g) => g.descripcion?.startsWith('Rechazo'));
      return {
        ...c,
        plazo_restante_dias: dias,
        canal_entidad: c.entidad.canal_transcripcion,
        prioritario: c.estado === 'VERIFICADA' && dias <= 15,
        plazo_vencido: c.estado === 'VERIFICADA' && dias <= 0,
        causal_rechazo: c.estado === 'RECHAZADA' ? rechazo?.descripcion?.replace(/^Rechazo:\s*/, '') : null,
      };
    });
    const orden = { RECHAZADA: 0, VERIFICADA: 1, TRANSCRITA: 2 };
    res.json(filas.sort((a, b) => orden[a.estado] - orden[b.estado] || a.plazo_restante_dias - b.plazo_restante_dias));
  }),

  /**
   * Registrar la transcripción ante la entidad.
   * multipart: numero_transcripcion, descripcion?, evidencia? (constancia)
   */
  transcribir: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['VERIFICADA'], 'transcripción');
    if (ReglasIncapacidadService.diasRestantesTranscripcion(caso.entidad, caso) <= 0 && req.body.autorizado_coordinacion !== 'true') {
      throw errorHttp('El plazo de transcripción de la entidad está vencido. El trámite requiere autorización de la coordinación.', 422);
    }
    if (!req.body.numero_transcripcion?.trim()) throw errorHttp('Escriba el número o la constancia de transcripción.');

    await registrarGestion({
      caso, tipo: 'TRANSCRIPCION', usuario: req.usuario, archivo: req.file,
      numero: req.body.numero_transcripcion.trim(),
      descripcion: `Transcripción por ${caso.entidad.canal_transcripcion === 'PORTAL_WEB' ? 'portal web' : 'correo electrónico'}. ${req.body.descripcion || ''}`.trim(),
    });
    await cambiarEstado(caso.id, 'TRANSCRITA', req.usuario);
    res.json({ mensaje: `Caso ${caso.numero_caso} transcrito. El físico pasa a novedades de nómina; el siguiente paso es radicarlo.` });
  }),

  /**
   * Radicar ante la EPS/ARL. La evidencia es obligatoria.
   * multipart: numero_radicado, medio (WEB|FISICO), descripcion?, evidencia
   */
  radicar: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['VERIFICADA', 'TRANSCRITA'], 'radicación');
    if (!req.body.numero_radicado?.trim()) throw errorHttp('Escriba el número de radicado.');
    const medio = req.body.medio === 'FISICO' ? 'físico en oficina' : 'página web';
    await registrarGestion({
      caso, tipo: 'RADICACION', usuario: req.usuario, archivo: req.file, exigirEvidencia: true,
      numero: req.body.numero_radicado.trim(),
      descripcion: `Radicación ${medio}. ${req.body.descripcion || ''}`.trim(),
    });
    await cambiarEstado(caso.id, 'RADICADA', req.usuario);
    res.json({ mensaje: `Caso ${caso.numero_caso} radicado. Ahora aparece en Cobro para registrar la respuesta de la entidad.` });
  }),

  /** La entidad rechaza la transcripción: el caso queda Rechazado con la causal. */
  rechazar: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['TRANSCRITA', 'RADICADA'], 'el registro de un rechazo');
    if (!req.body.causal?.trim()) throw errorHttp('Escriba la causal del rechazo.');
    await registrarGestion({ caso, tipo: 'SEGUIMIENTO', usuario: req.usuario, descripcion: `Rechazo: ${req.body.causal.trim()}` });
    await cambiarEstado(caso.id, 'RECHAZADA', req.usuario, { causal: req.body.causal.trim() });
    res.json({ mensaje: `Rechazo registrado. Subsane la causal desde Transcripción y radicación.` });
  }),

  /** Subsanar la causal de rechazo: el caso vuelve a Verificada para una nueva transcripción. */
  subsanar: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['RECHAZADA'], 'subsanación');
    if (!req.body.descripcion?.trim()) throw errorHttp('Describa cómo se subsanó la causal.');
    await registrarGestion({ caso, tipo: 'SEGUIMIENTO', usuario: req.usuario, descripcion: `Subsanación: ${req.body.descripcion.trim()}` });
    await cambiarEstado(caso.id, 'VERIFICADA', req.usuario);
    res.json({ mensaje: `Causal subsanada. El caso ${caso.numero_caso} queda listo para una nueva transcripción.` });
  }),

  /**
   * Reporte de ausentismo al SG-SST.
   * GET /api/sgsst/reporte?periodo=YYYY-MM  (+ ia=true para el análisis con IA)
   */
  reporteAusentismo: asyncHandler(async (req, res) => {
    const periodo = /^\d{4}-\d{2}$/.test(req.query.periodo || '') ? req.query.periodo : new Date().toISOString().slice(0, 7);
    const [anio, mes] = periodo.split('-').map(Number);
    const desde = `${periodo}-01`;
    const hasta = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);

    const todas = await listarIncapacidades({});
    const delPeriodo = todas.filter((i) => i.estado !== 'DADA_DE_BAJA' && i.fecha_inicio <= hasta && i.fecha_fin >= desde);

    // Días de cada incapacidad que caen dentro del periodo
    const diasEnPeriodo = (i) => {
      const ini = i.fecha_inicio > desde ? i.fecha_inicio : desde;
      const fin = i.fecha_fin < hasta ? i.fecha_fin : hasta;
      return Math.round((new Date(fin) - new Date(ini)) / 86400000) + 1;
    };
    const registros = delPeriodo.map((i) => ({
      numero_caso: i.numero_caso,
      colaborador: i.colaborador?.usuario?.nombre,
      area: i.colaborador?.area || 'Sin área',
      tipo: i.tipo,
      origen: i.tipo === 'ACCIDENTE_LABORAL' ? 'LABORAL' : 'COMUN',
      dias: diasEnPeriodo(i),
      diagnostico_agrupado: (i.diagnostico_cie10 || 'Sin diagnóstico').slice(0, 3),
    }));

    const colaboradoresAfectados = new Set(delPeriodo.map((i) => i.colaborador_id)).size;
    const diasPerdidos = registros.reduce((s, r) => s + r.dias, 0);
    const resumen = {
      periodo,
      total_incapacidades: registros.length,
      colaboradores_afectados: colaboradoresAfectados,
      dias_perdidos: diasPerdidos,
      promedio_dias: registros.length ? Math.round((diasPerdidos / registros.length) * 10) / 10 : 0,
      por_tipo: agrupar(registros, 'tipo'),
      por_area: agrupar(registros, 'area'),
      por_origen: agrupar(registros, 'origen'),
    };

    let analisis_ia = null;
    if (req.query.ia === 'true') {
      if (!registros.length) throw errorHttp('No hay incapacidades en el periodo para analizar.', 422);
      analisis_ia = await IaOcrService.analizarAusentismo({
        periodo, resumen,
        registros: registros.map(({ colaborador, numero_caso, ...r }) => r), // anonimizado
      });
    }
    await registrarBitacora(req.usuario.id, 'REPORTE_SGSST', { periodo, ia: Boolean(analisis_ia) });
    res.json({ resumen, registros, analisis_ia });
  }),
};

function agrupar(filas, campo) {
  return filas.reduce((acc, f) => {
    const k = f[campo] || 'SIN_DATO';
    acc[k] = (acc[k] || 0) + f.dias;
    return acc;
  }, {});
}
