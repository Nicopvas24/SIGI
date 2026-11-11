// DocumentoService - archivo digital de soportes (CU-10)
// Convención: Entidad/Año/Colaborador_FechaInicio/Documento_Nombre_FechaInicio_TipoSoporte.ext
// Almacena en Supabase Storage (bucket configurable).
import { supabase } from '../../config/supabase.js';
import { config } from '../../config/config.js';
import { repoDocumentos } from '../repositories/index.js';

const TIPOS_RESERVADOS = new Set(['EPICRISIS', 'HISTORIA_CLINICA']);

export const DocumentoService = {
  rutaArchivo({ entidadNombre, fechaInicio, colaboradorDoc, colaboradorNombre, tipoSoporte, ext }) {
    const anio = String(fechaInicio).slice(0, 4);
    const carpeta = `${slug(entidadNombre)}/${anio}/${colaboradorDoc}_${fechaInicio}`;
    const nombre = `${colaboradorDoc}_${slug(colaboradorNombre)}_${fechaInicio}_${tipoSoporte}.${ext}`;
    return `${carpeta}/${nombre}`;
  },

  async guardarSoporte({ incapacidad, tipoSoporte, archivo }) {
    const ext = (archivo?.originalname?.split('.').pop() || 'pdf').toLowerCase();
    const ruta = this.rutaArchivo({
      entidadNombre: incapacidad.entidad?.nombre || 'entidad',
      fechaInicio: incapacidad.fecha_inicio,
      colaboradorDoc: incapacidad.colaborador?.usuario?.documento || 'doc',
      colaboradorNombre: incapacidad.colaborador?.usuario?.nombre || 'colaborador',
      tipoSoporte,
      ext,
    });

    let url = `storage://${config.supabase.bucket}/${ruta}`;
    if (archivo?.buffer) {
      const { error } = await supabase.storage
        .from(config.supabase.bucket)
        .upload(ruta, archivo.buffer, { contentType: archivo.mimetype, upsert: true });
      if (error) console.warn('[DocumentoService] Storage:', error.message);
      else url = supabase.storage.from(config.supabase.bucket).getPublicUrl(ruta).data.publicUrl;
    }

    return repoDocumentos.crear({
      incapacidad_id: incapacidad.id,
      tipo_documento: tipoSoporte,
      nombre_archivo: ruta.split('/').pop(),
      url,
      estado: 'CARGADO',
      es_reservado: TIPOS_RESERVADOS.has(tipoSoporte), // 5.1.2: información reservada
    });
  },

  async marcarEstado(documentoId, estado) {
    return repoDocumentos.actualizar(documentoId, { estado });
  },
};

function slug(texto = '') {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}
