// RecepcionController - Módulo "Reporte y recepción"
import {
  repoIncapacidades, repoEntidades, repoRecepciones, repoReemplazos, repoDocumentos,
  listarIncapacidades, listarColaboradores, colaboradorPorId, colaboradorDeUsuario,
  registrarBitacora, esColaboradorReportable,
} from '../repositories/index.js';
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { DocumentoService, TIPOS_PERMITIDOS } from '../services/DocumentoService.js';
import { IaOcrService } from '../services/IaOcrService.js';
import {
  cambiarEstado, asyncHandler, notificarAuxiliares, errorHttp, casoOError,
  alcanceColaboradores, verificarAlcance,
} from './_helpers.js';

export const TIPOS_DOCUMENTO = ['CERTIFICADO', 'EPICRISIS', 'FURIPS', 'NACIDO_VIVO', 'REGISTRO_CIVIL', 'DOC_IDENTIDAD'];
const CANALES = ['PRESENCIAL', 'CORREO_ELECTRONICO', 'OFICINA_PRINCIPAL', 'LIDER_COMERCIAL', 'GESTION_HUMANA'];
const ESTADOS_ABIERTOS_A_SOPORTES = ['REPORTADA', 'DOCUMENTACION_REMITIDA', 'RECIBIDA', 'DOCUMENTACION_INCOMPLETA'];
const ESTADOS_CERRADOS = ['ARCHIVADA', 'DADA_DE_BAJA'];
// Un caso se puede modificar o eliminar mientras no se haya verificado (aún no hay liquidación ni gestiones)
const ESTADOS_EDITABLES = ['REPORTADA', 'DOCUMENTACION_REMITIDA', 'RECIBIDA', 'DOCUMENTACION_INCOMPLETA'];
const ESTADOS_EDITABLES_COLABORADOR = ['REPORTADA', 'DOCUMENTACION_REMITIDA'];
const TIPOS_NOVEDAD = ['ENFERMEDAD_GENERAL', 'ACCIDENTE_LABORAL', 'ACCIDENTE_TRANSITO', 'LICENCIA_MATERNIDAD', 'LICENCIA_PATERNIDAD'];

/** Valida que el usuario pueda modificar o eliminar el caso en su estado actual. */
async function exigirEdicion(usuario, caso, accion) {
  if (!['AUXILIAR', 'RECEPCIONISTA', 'ADMIN', 'LIDER', 'COLABORADOR'].includes(usuario.rol)) {
    throw errorHttp(`Su rol no puede ${accion} incapacidades.`, 403);
  }
  await verificarAlcance(usuario, caso.colaborador_id);
  const permitidos = ['COLABORADOR', 'LIDER'].includes(usuario.rol) ? ESTADOS_EDITABLES_COLABORADOR : ESTADOS_EDITABLES;
  if (!permitidos.includes(caso.estado)) {
    throw errorHttp(permitidos === ESTADOS_EDITABLES
      ? `El caso ${caso.numero_caso} ya fue verificado y no se puede ${accion}.`
      : `El caso ${caso.numero_caso} ya fue recibido por Gestión Humana. Pídales a ellos que lo corrijan.`, 422);
  }
}

const sumarDias = (fecha, n) => {
  const d = new Date(`${String(fecha).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const normalizar = (t = '') => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const RecepcionController = {
  // GET /api/incapacidades?estado=...  (cada rol ve solo lo que le corresponde)
  listar: asyncHandler(async (req, res) => {
    const filtros = {};
    if (req.query.estado) filtros.estado = req.query.estado.split(',');
    const alcance = await alcanceColaboradores(req.usuario);
    if (alcance) {
      if (!alcance.length) return res.json([]);
      filtros.colaborador_id = alcance;
    }
    res.json(await listarIncapacidades(filtros));
  }),

  /**
   * Modificar los datos de un caso todavía no verificado.
   * body: { tipo?, entidad_id?, fecha_inicio?, dias?, diagnostico_cie10?, observaciones? }
   */
  modificar: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id);
    await exigirEdicion(req.usuario, caso, 'modificar');
    const b = req.body;
    const cambios = {};
    if (b.tipo !== undefined) {
      if (!TIPOS_NOVEDAD.includes(b.tipo)) throw errorHttp('Tipo de novedad no válido.');
      cambios.tipo = b.tipo;
    }
    if (b.entidad_id !== undefined) {
      const entidad = await repoEntidades.porId(Number(b.entidad_id));
      if (!entidad) throw errorHttp('La entidad seleccionada no existe.');
      cambios.entidad_id = entidad.id;
    }
    if (b.fecha_inicio !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_inicio)) throw errorHttp('La fecha de inicio no es válida.');
      cambios.fecha_inicio = b.fecha_inicio;
    }
    if (b.dias !== undefined) {
      const dias = Number(b.dias);
      if (!Number.isInteger(dias) || dias < 1) throw errorHttp('Los días de incapacidad deben ser un número entero mayor que cero.');
      cambios.dias = dias;
    }
    if (b.diagnostico_cie10 !== undefined) cambios.diagnostico_cie10 = String(b.diagnostico_cie10).trim() || null;
    if (b.observaciones !== undefined) cambios.observaciones = String(b.observaciones).trim() || null;
    if (!Object.keys(cambios).length) throw errorHttp('No hay cambios para guardar.');
    if (cambios.fecha_inicio || cambios.dias) {
      cambios.fecha_fin = sumarDias(cambios.fecha_inicio || caso.fecha_inicio, (cambios.dias || caso.dias) - 1);
    }
    const actualizado = await repoIncapacidades.actualizar(caso.id, cambios);
    registrarBitacora(req.usuario.id, 'MODIFICAR_INCAPACIDAD', {
      numero_caso: caso.numero_caso,
      antes: Object.fromEntries(Object.keys(cambios).map((k) => [k, caso[k]])), despues: cambios,
    });
    if (caso.colaborador?.usuario?.id && caso.colaborador.usuario.id !== req.usuario.id) {
      NotificacionService.notificarUsuario(caso.colaborador.usuario.id, `Incapacidad modificada · ${caso.numero_caso}`,
        `${req.usuario.nombre} corrigió los datos de su incapacidad.`);
    }
    res.json({ caso: actualizado, mensaje: `Caso ${caso.numero_caso} actualizado.` });
  }),

  /**
   * Eliminar un caso todavía no verificado (registrado por error o duplicado).
   * Borra sus soportes y recepciones; no se puede si otro caso es prórroga de este.
   * body: { motivo }
   */
  eliminar: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id);
    await exigirEdicion(req.usuario, caso, 'eliminar');
    const motivo = req.body?.motivo?.trim();
    if (!motivo) throw errorHttp('Escriba el motivo de la eliminación (queda en la auditoría).');
    const prorrogas = await repoIncapacidades.listar({ prorroga_de: caso.id });
    if (prorrogas.length) {
      throw errorHttp(`No se puede eliminar: ${prorrogas.map((p) => p.numero_caso).join(', ')} es prórroga de este caso. Elimine primero la prórroga.`, 409);
    }
    if ((caso.pagos || []).length) throw errorHttp('No se puede eliminar un caso con pagos registrados.', 409);

    await DocumentoService.eliminarArchivos(caso.documentos.map((d) => d.url));
    await repoIncapacidades.eliminar(caso.id); // soportes, recepciones y reemplazos se borran en cascada
    registrarBitacora(req.usuario.id, 'ELIMINAR_INCAPACIDAD', {
      numero_caso: caso.numero_caso, colaborador: caso.colaborador?.usuario?.nombre, estado: caso.estado, motivo,
    });
    if (caso.colaborador?.usuario?.id && caso.colaborador.usuario.id !== req.usuario.id) {
      NotificacionService.notificarUsuario(caso.colaborador.usuario.id, `Incapacidad eliminada · ${caso.numero_caso}`,
        `${req.usuario.nombre} eliminó el caso. Motivo: ${motivo}`);
    }
    res.json({ mensaje: `Caso ${caso.numero_caso} eliminado.` });
  }),

  // GET /api/incapacidades/:id
  detalle: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id);
    await verificarAlcance(req.usuario, caso.colaborador_id);
    res.json(caso);
  }),

  // GET /api/entidades
  entidades: asyncHandler(async (_req, res) => {
    res.json(await repoEntidades.listar({}, { orden: 'nombre', asc: true }));
  }),

  // GET /api/colaboradores - a quién se le puede reportar una incapacidad.
  // Solo usuarios con rol Colaborador: el personal que opera la plataforma no aparece.
  // El líder ve su equipo; el colaborador, solo su registro.
  colaboradores: asyncHandler(async (req, res) => {
    if (req.usuario.rol === 'COLABORADOR') {
      const propio = await colaboradorDeUsuario(req.usuario.id);
      return res.json(propio ? [propio] : []);
    }
    if (req.usuario.rol === 'LIDER') {
      return res.json(await listarColaboradores({ liderId: req.usuario.id, soloReportables: true }));
    }
    res.json(await listarColaboradores({ soloReportables: true }));
  }),

  /**
   * Informar incapacidad. El colaborador reporta la suya; el líder, la
   * recepción o el auxiliar la pueden reportar en nombre de un colaborador.
   */
  informar: asyncHandler(async (req, res) => {
    const { entidad_id, tipo, fecha_inicio, observaciones, prorroga_de, diagnostico_cie10 } = req.body;
    const dias = Number(req.body.dias);
    if (!entidad_id || !tipo || !fecha_inicio || !dias) {
      throw errorHttp('Complete el tipo de novedad, la entidad, la fecha de inicio y los días.');
    }
    if (!Number.isInteger(dias) || dias < 1) throw errorHttp('Los días de incapacidad deben ser un número entero mayor que cero.');

    // Quién es el colaborador incapacitado
    let colaborador;
    if (req.usuario.rol === 'COLABORADOR') {
      colaborador = await colaboradorDeUsuario(req.usuario.id);
      if (!colaborador) throw errorHttp('Su usuario no está vinculado a un registro de colaborador. Comuníquese con Gestión Humana.', 422);
    } else if (req.body.colaborador_id) {
      colaborador = await colaboradorPorId(req.body.colaborador_id);
      if (!colaborador) throw errorHttp('El colaborador seleccionado no existe.', 404);
      if (!esColaboradorReportable(colaborador)) {
        throw errorHttp(`${colaborador.usuario?.nombre || 'Esa persona'} hace parte del personal que opera SIGI. Solo se reportan incapacidades de colaboradores.`, 422);
      }
      await verificarAlcance(req.usuario, colaborador.id);
    } else {
      throw errorHttp('Seleccione el colaborador que tiene la incapacidad.');
    }

    // Prórroga: casos del colaborador que se cruzan con las fechas o terminan justo el día anterior
    const fechaFin = sumarDias(fecha_inicio, dias - 1);
    if (prorroga_de) {
      const base = await repoIncapacidades.porId(prorroga_de);
      if (!base || base.colaborador_id !== colaborador.id) throw errorHttp('El caso de origen de la prórroga no es de este colaborador.');
    } else if (!req.body.confirmar_no_prorroga) {
      const existentes = await repoIncapacidades.listar({ colaborador_id: colaborador.id });
      const relacionada = existentes.find((i) => i.estado !== 'DADA_DE_BAJA' &&
        i.fecha_inicio <= fechaFin && sumarDias(i.fecha_fin, 1) >= fecha_inicio);
      if (relacionada) {
        return res.status(409).json({
          advertencia: relacionada.fecha_fin < fecha_inicio
            ? `La nueva incapacidad empieza justo después del caso ${relacionada.numero_caso}.`
            : `Las fechas se cruzan con el caso ${relacionada.numero_caso}.`,
          caso_existente: relacionada.numero_caso,
          caso_existente_id: relacionada.id,
        });
      }
    }

    const caso = await repoIncapacidades.crear({
      colaborador_id: colaborador.id,
      entidad_id: Number(entidad_id),
      tipo,
      fecha_inicio,
      dias,
      fecha_fin: fechaFin,
      diagnostico_cie10: diagnostico_cie10?.trim() || null,
      observaciones: observaciones?.trim() || null,
      prorroga_de: prorroga_de || null,
      estado: 'REPORTADA',
    });
    await registrarBitacora(req.usuario.id, 'INFORMAR_INCAPACIDAD', { numero_caso: caso.numero_caso });

    const nombre = colaborador.usuario?.nombre || 'un colaborador';
    if (colaborador.usuario?.id && colaborador.usuario.id !== req.usuario.id) {
      await NotificacionService.notificarUsuario(colaborador.usuario.id, `Incapacidad registrada · ${caso.numero_caso}`,
        `${req.usuario.nombre} registró su incapacidad de ${dias} día(s) desde ${fecha_inicio}. Entregue los soportes dentro de los 2 días siguientes.`);
    }
    if (colaborador.lider_id && colaborador.lider_id !== req.usuario.id) {
      await NotificacionService.notificarUsuario(colaborador.lider_id, `Nueva incapacidad ${caso.numero_caso}`,
        `${nombre} reportó una incapacidad de ${dias} día(s) desde ${fecha_inicio}. Asigne el reemplazo.`);
    }
    await notificarAuxiliares(`Nueva incapacidad ${caso.numero_caso}`,
      `${nombre}: ${dias} día(s) desde ${fecha_inicio}. Pendiente de soportes.`);

    res.status(201).json({
      caso,
      documentos_requeridos: ReglasIncapacidadService.documentosRequeridos(tipo, { dias }),
      mensaje: `Caso ${caso.numero_caso} creado${prorroga_de ? ' como prórroga' : ''}. Los soportes deben entregarse dentro de los 2 días siguientes.`,
    });
  }),

  /**
   * Remitir documentación digital. multipart/form-data: un archivo por
   * campo, con el nombre del campo igual al tipo de documento (CERTIFICADO, EPICRISIS...).
   */
  remitirDocumentacion: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ESTADOS_ABIERTOS_A_SOPORTES, 'la entrega de soportes');
    await verificarAlcance(req.usuario, caso.colaborador_id);

    const archivos = (req.files || []).filter((f) => TIPOS_DOCUMENTO.includes(f.fieldname));
    if (!archivos.length) throw errorHttp('Adjunte al menos un archivo (PDF o imagen) del soporte.');

    // Los archivos se suben en paralelo (cada uno lleva su tipo en el nombre, no chocan)
    const guardados = await Promise.all(archivos.map((archivo) =>
      DocumentoService.guardarSoporte({ incapacidad: caso, tipoSoporte: archivo.fieldname, archivo })));

    let extemporanea = false;
    if (caso.estado === 'REPORTADA') {
      extemporanea = ReglasIncapacidadService.esRemisionExtemporanea(caso.fecha_inicio);
      await cambiarEstado(caso, 'DOCUMENTACION_REMITIDA', req.usuario, { extemporanea });
      if (extemporanea) {
        await repoIncapacidades.actualizar(caso.id, { extemporanea: true });
        await notificarAuxiliares(`Remisión extemporánea ${caso.numero_caso}`, 'Los soportes llegaron después del plazo de 2 días.');
      }
    } else if (caso.estado === 'DOCUMENTACION_INCOMPLETA') {
      await cambiarEstado(caso, 'RECIBIDA', req.usuario, { soportes_faltantes_entregados: true });
      await notificarAuxiliares(`Soportes faltantes entregados ${caso.numero_caso}`, 'El caso vuelve a la bandeja de verificación.');
    }

    const todos = [...caso.documentos, ...guardados]; // sin volver a leer de la base
    const faltantes = ReglasIncapacidadService.documentosFaltantes(
      caso.tipo, todos.filter((d) => d.estado !== 'NO_CONFORME'), { dias: caso.dias }
    );
    res.json({
      documentos_guardados: guardados, faltantes, extemporanea,
      mensaje: `${guardados.length} soporte(s) cargado(s). Recuerde entregar los originales en físico a Gestión Humana.`,
    });
  }),

  /**
   * Asignar reemplazo (líder). Valida que el reemplazo no esté
   * incapacitado ni asignado a otro reemplazo en esas fechas.
   */
  asignarReemplazo: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id);
    await verificarAlcance(req.usuario, caso.colaborador_id);
    const { reemplazo_id, justificacion } = req.body;
    const fecha_inicio = req.body.fecha_inicio || caso.fecha_inicio;
    const fecha_fin = req.body.fecha_fin || caso.fecha_fin;
    if (fecha_fin < fecha_inicio) throw errorHttp('La fecha final del reemplazo no puede ser anterior a la inicial.');

    if (reemplazo_id) {
      if (reemplazo_id === caso.colaborador_id) throw errorHttp('El reemplazo no puede ser el mismo colaborador incapacitado.');
      const ausencias = await repoIncapacidades.listar({ colaborador_id: reemplazo_id });
      if (ausencias.some((a) => a.estado !== 'DADA_DE_BAJA' && a.fecha_inicio <= fecha_fin && a.fecha_fin >= fecha_inicio)) {
        throw errorHttp('El reemplazo seleccionado también tiene una incapacidad en esas fechas.', 409);
      }
      const asignaciones = await repoReemplazos.listar({ reemplazo_id });
      if (asignaciones.some((a) => a.fecha_inicio <= fecha_fin && a.fecha_fin >= fecha_inicio)) {
        throw errorHttp('El reemplazo ya cubre a otra persona en esas fechas. Elija otra persona o ajuste el periodo.', 409);
      }
    } else if (!justificacion?.trim()) {
      throw errorHttp('Si no hay reemplazo disponible, escriba la justificación.');
    }

    const reemplazo = await repoReemplazos.crear({
      incapacidad_id: caso.id, reemplazo_id: reemplazo_id || null,
      fecha_inicio, fecha_fin, justificacion: justificacion?.trim() || null,
    });
    await registrarBitacora(req.usuario.id, 'ASIGNAR_REEMPLAZO', { incapacidad_id: caso.id });
    if (reemplazo_id) {
      const r = await colaboradorPorId(reemplazo_id);
      await NotificacionService.notificarUsuario(r?.usuario?.id, `Reemplazo asignado · ${caso.numero_caso}`,
        `Cubrirá a ${caso.colaborador?.usuario?.nombre} del ${fecha_inicio} al ${fecha_fin}.`);
    }
    await notificarAuxiliares(`Reemplazo registrado ${caso.numero_caso}`,
      reemplazo_id ? 'El líder asignó el reemplazo.' : `Sin reemplazo: ${justificacion}`);
    res.status(201).json({ reemplazo, mensaje: reemplazo_id ? 'Reemplazo asignado y notificado.' : 'Se registró que no hay reemplazo.' });
  }),

  /**
   * Recibir incapacidad: registra canal, receptor y los documentos
   * físicos entregados, y deja el caso en Recibida.
   * body: { canal, documentos_fisicos: ['CERTIFICADO', ...] }
   */
  recibir: asyncHandler(async (req, res) => {
    const caso = await casoOError(req.params.id, ['REPORTADA', 'DOCUMENTACION_REMITIDA'], 'el registro de recepción');
    const canal = CANALES.includes(req.body.canal)
      ? req.body.canal
      : req.usuario.rol === 'RECEPCIONISTA' ? 'PRESENCIAL' : 'GESTION_HUMANA';

    const fisicos = [].concat(req.body.documentos_fisicos || []).filter((t) => TIPOS_DOCUMENTO.includes(t));
    const yaCargados = new Set(caso.documentos.map((d) => d.tipo_documento));
    if (!caso.documentos.length && !fisicos.length) {
      throw errorHttp('Marque los documentos que se reciben. El caso no tiene soportes cargados.');
    }
    await Promise.all(fisicos.filter((t) => !yaCargados.has(t))
      .map((tipo) => DocumentoService.guardarSoporte({ incapacidad: caso, tipoSoporte: tipo })));

    const recepcion = await repoRecepciones.crear({ incapacidad_id: caso.id, canal, receptor_id: req.usuario.id });
    await cambiarEstado(caso, 'RECIBIDA', req.usuario, { canal });
    await notificarAuxiliares(`Soportes recibidos ${caso.numero_caso}`, 'Pendiente de verificación documental.');
    res.json({
      recepcion,
      comprobante: { numero_caso: caso.numero_caso, canal, fecha: recepcion.fecha, receptor: req.usuario.nombre },
      mensaje: `Recepción registrada. Comprobante del caso ${caso.numero_caso}.`,
    });
  }),

  // GET /api/documentos/:id/url - enlace temporal para ver un soporte
  verDocumento: asyncHandler(async (req, res) => {
    const doc = await repoDocumentos.porId(req.params.id);
    if (!doc) throw errorHttp('Documento no encontrado', 404);
    const caso = await repoIncapacidades.porId(doc.incapacidad_id);
    await verificarAlcance(req.usuario, caso.colaborador_id);
    if (doc.es_reservado && !['AUXILIAR', 'ADMIN', 'COLABORADOR'].includes(req.usuario.rol)) {
      throw errorHttp('Este documento contiene información clínica reservada.', 403);
    }
    if (!doc.url) throw errorHttp('Este soporte se entregó solo en físico; no tiene archivo digital.', 404);
    res.json({ url: await DocumentoService.enlaceFirmado(doc.url) });
  }),

  /**
   * IA · Leer un certificado (PDF o imagen) y proponer los datos del formulario.
   * multipart: archivo. Sugiere también el colaborador y la entidad registrados.
   */
  leerCertificadoIA: asyncHandler(async (req, res) => {
    const archivo = req.file;
    if (!archivo) throw errorHttp('Adjunte el certificado en PDF o imagen.');
    if (!TIPOS_PERMITIDOS.has(archivo.mimetype)) throw errorHttp('Formato no permitido. Use PDF, JPG, PNG o WEBP.');

    const datos = await IaOcrService.leerCertificado({ mimeType: archivo.mimetype, base64: archivo.buffer.toString('base64') });

    const entidades = await repoEntidades.listar({}, { orden: 'nombre', asc: true });
    const ent = datos.entidad && entidades.find((e) =>
      normalizar(datos.entidad).includes(normalizar(e.nombre)) || normalizar(e.nombre).includes(normalizar(datos.entidad)));

    let colaborador = null;
    const alcance = await alcanceColaboradores(req.usuario);
    if (datos.documento) {
      const todos = await listarColaboradores({ soloReportables: true });
      // Solo dígitos: el certificado suele traer el tipo ("CC 1001234567")
      const digitos = (t) => String(t || '').replace(/\D/g, '');
      const c = digitos(datos.documento) && todos.find((x) => digitos(x.usuario?.documento) === digitos(datos.documento));
      if (c && (!alcance || alcance.includes(c.id))) colaborador = { id: c.id, nombre: c.usuario?.nombre };
    }
    res.json({ ...datos, entidad_id: ent?.id || null, colaborador_sugerido: colaborador });
  }),
};

export { ESTADOS_CERRADOS };
