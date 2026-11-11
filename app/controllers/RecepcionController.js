// RecepcionController - Módulo "Reporte y recepción" (CU-01 a CU-06)
import {
  repoIncapacidades, repoColaboradores, repoEntidades, repoRecepciones,
  repoReemplazos, listarIncapacidades, incapacidadCompleta, registrarBitacora,
} from '../repositories/index.js';
import { ReglasIncapacidadService } from '../services/ReglasIncapacidadService.js';
import { NotificacionService } from '../services/NotificacionService.js';
import { DocumentoService } from '../services/DocumentoService.js';
import { IaOcrService } from '../services/IaOcrService.js';
import { cambiarEstado, asyncHandler, notificarAuxiliares } from './_helpers.js';

export const RecepcionController = {
  // GET /api/incapacidades?estado=...
  listar: asyncHandler(async (req, res) => {
    const filtros = {};
    if (req.query.estado) filtros.estado = req.query.estado.split(',');
    // Un colaborador solo ve sus propios casos
    if (req.usuario.rol === 'COLABORADOR') {
      const c = await repoColaboradores.listar({ usuario_id: req.usuario.id });
      if (!c.length) return res.json([]);
      filtros.colaborador_id = c[0].id;
    }
    res.json(await listarIncapacidades(filtros));
  }),

  // GET /api/incapacidades/:id
  detalle: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    res.json(caso);
  }),

  // GET /api/entidades
  entidades: asyncHandler(async (_req, res) => {
    res.json(await repoEntidades.listar({}, { orden: 'nombre', asc: true }));
  }),

  /**
   * CU-01 · Informar incapacidad.
   * Valida fechas, detecta prórrogas por superposición, crea el caso en
   * estado REPORTADA y notifica al líder y al auxiliar.
   */
  informar: asyncHandler(async (req, res) => {
    const { colaborador_id, entidad_id, tipo, fecha_inicio, dias, observaciones, prorroga_de } = req.body;
    if (!entidad_id || !tipo || !fecha_inicio || !dias) {
      return res.status(400).json({ error: 'Campos obligatorios: entidad_id, tipo, fecha_inicio, dias' });
    }
    if (Number(dias) < 1) return res.status(400).json({ error: 'El número de días debe ser mayor a cero' });

    // El colaborador reporta su propio caso; auxiliar/líder pueden reportar por otro (CU-01 1a)
    let colaboradorId = colaborador_id;
    if (req.usuario.rol === 'COLABORADOR' || !colaboradorId) {
      const c = await repoColaboradores.listar({ usuario_id: req.usuario.id });
      if (c.length) colaboradorId = c[0].id;
    }
    if (!colaboradorId) return res.status(400).json({ error: 'No se pudo determinar el colaborador del caso' });

    // CU-01 5a: detección de fechas superpuestas -> posible prórroga
    const fin = new Date(fecha_inicio);
    fin.setDate(fin.getDate() + Number(dias) - 1);
    const existentes = await repoIncapacidades.listar({ colaborador_id: colaboradorId });
    const superpuesta = existentes.find(
      (i) => !prorroga_de && new Date(i.fecha_inicio) <= fin && new Date(i.fecha_fin) >= new Date(fecha_inicio)
    );
    if (superpuesta && !req.body.confirmar_no_prorroga) {
      return res.status(409).json({
        advertencia: 'Ya existe un caso con fechas superpuestas. ¿Es una prórroga?',
        caso_existente: superpuesta.numero_caso,
        caso_existente_id: superpuesta.id,
      });
    }

    const caso = await repoIncapacidades.crear({
      colaborador_id: colaboradorId,
      entidad_id, tipo,
      fecha_inicio, dias: Number(dias),
      fecha_fin: fin.toISOString().slice(0, 10),
      observaciones: observaciones || null,
      prorroga_de: prorroga_de || null,
      estado: 'REPORTADA',
    });

    await registrarBitacora(req.usuario.id, 'CU-01:INFORMAR', { numero_caso: caso.numero_caso });

    // Notificar al líder y al Auxiliar de Administración de Personal
    const colaborador = await repoColaboradores.porId(colaboradorId);
    if (colaborador?.lider_id) {
      await NotificacionService.notificarUsuario(
        colaborador.lider_id, `Nueva incapacidad ${caso.numero_caso}`,
        'Se reportó una incapacidad de un colaborador a su cargo. Gestione el reemplazo (CU-03).'
      );
    }
    await notificarAuxiliares(`Nueva incapacidad ${caso.numero_caso}`, 'Caso reportado, pendiente de recepción documental.');

    const documentos = ReglasIncapacidadService.documentosRequeridos(tipo, { dias: Number(dias) });
    res.status(201).json({
      caso,
      documentos_requeridos: documentos,
      plazo_entrega_dias: 2,
      mensaje: `Caso ${caso.numero_caso} creado. Debe entregar los soportes dentro de los 2 días siguientes.`,
    });
  }),

  /**
   * CU-02 · Remitir documentación (adjuntos digitales + canal de entrega física).
   * multipart/form-data: archivos[] con campo tipo_documento por archivo.
   */
  remitirDocumentacion: asyncHandler(async (req, res) => {
    const caso = await incapacidadCompleta(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const tipos = [].concat(req.body.tipos_documento || []);
    const archivos = req.files || [];
    if (!archivos.length && !tipos.length) {
      return res.status(400).json({ error: 'Adjunte al menos un documento' });
    }

    const guardados = [];
    for (let i = 0; i < Math.max(archivos.length, tipos.length); i++) {
      guardados.push(await DocumentoService.guardarSoporte({
        incapacidad: caso,
        tipoSoporte: tipos[i] || 'CERTIFICADO',
        archivo: archivos[i],
      }));
    }

    // Extemporánea si pasó el plazo de 2 días (CU-02 5a)
    const extemporanea = ReglasIncapacidadService.esRemisionExtemporanea(caso.fecha_inicio);
    const actualizada = await cambiarEstado(caso.id, 'DOCUMENTACION_REMITIDA', req.usuario, {
      canal_entrega_fisica: req.body.canal_entrega || 'PRESENCIAL', extemporanea,
    });
    if (extemporanea) {
      await repoIncapacidades.actualizar(caso.id, { extemporanea: true });
      await notificarAuxiliares(`Remisión extemporánea ${caso.numero_caso}`, 'La documentación se remitió después de 2 días.');
    }

    const faltantes = ReglasIncapacidadService.documentosFaltantes(
      caso.tipo, [...caso.documentos, ...guardados], { dias: caso.dias }
    );
    res.json({
      caso: actualizada, documentos_guardados: guardados, faltantes, extemporanea,
      mensaje: 'Recuerde que los originales deben llegar físicamente a Administración de Personal.',
    });
  }),

  /**
   * CU-03 · Asignar reemplazo (Líder). Valida conflicto de fechas (CU-03 4a).
   */
  asignarReemplazo: asyncHandler(async (req, res) => {
    const caso = await repoIncapacidades.porId(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    const { reemplazo_id, fecha_inicio, fecha_fin, justificacion } = req.body;

    if (reemplazo_id) {
      const asignaciones = await repoReemplazos.listar({ reemplazo_id }, { orden: 'fecha_inicio', asc: true });
      const conflicto = asignaciones.find(
        (a) => new Date(a.fecha_inicio) <= new Date(fecha_fin) && new Date(a.fecha_fin) >= new Date(fecha_inicio)
      );
      if (conflicto) {
        return res.status(409).json({ error: 'El reemplazo ya tiene una asignación en esas fechas. Elija otra persona o ajuste el periodo.' });
      }
    }

    const reemplazo = await repoReemplazos.crear({
      incapacidad_id: caso.id,
      reemplazo_id: reemplazo_id || null, // null = "Sin reemplazo" con justificación (CU-03 2a)
      fecha_inicio: fecha_inicio || caso.fecha_inicio,
      fecha_fin: fecha_fin || caso.fecha_fin,
      justificacion: justificacion || null,
    });
    await registrarBitacora(req.usuario.id, 'CU-03:REEMPLAZO', { incapacidad_id: caso.id });
    await notificarAuxiliares(`Reemplazo asignado ${caso.numero_caso}`, 'El líder registró el reemplazo del colaborador.');
    res.status(201).json(reemplazo);
  }),

  /**
   * CU-04/05/06 · Recibir incapacidad (generalización):
   * registra canal, fecha y receptor, y deja el caso RECIBIDA.
   */
  recibir: asyncHandler(async (req, res) => {
    const caso = await repoIncapacidades.porId(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    const canal = req.body.canal || (req.usuario.rol === 'RECEPCIONISTA' ? 'PRESENCIAL' : 'CORREO_ELECTRONICO');

    const recepcion = await repoRecepciones.crear({
      incapacidad_id: caso.id, canal, receptor_id: req.usuario.id,
    });
    const actualizada = await cambiarEstado(caso.id, 'RECIBIDA', req.usuario, { canal });
    await notificarAuxiliares(`Documentos recibidos ${caso.numero_caso}`, `Canal: ${canal}. Pendiente de verificación (CU-07).`);

    res.json({
      caso: actualizada, recepcion,
      comprobante: {
        numero_caso: caso.numero_caso, canal, fecha: recepcion.fecha,
        receptor: req.usuario.nombre,
      },
    });
  }),

  /**
   * CU-06 paso 4 · IA/OCR: extraer datos propuestos del certificado
   * (imagen/PDF en base64 o texto plano).
   */
  extraerDatosIA: asyncHandler(async (req, res) => {
    const { imagen_base64, media_type, texto } = req.body;
    if (!imagen_base64 && !texto) {
      return res.status(400).json({ error: 'Envíe imagen_base64 (con media_type) o texto del certificado' });
    }
    const datos = await IaOcrService.extraerDatosCertificado({
      imagenBase64: imagen_base64, mediaType: media_type, texto,
    });
    res.json(datos);
  }),
};
