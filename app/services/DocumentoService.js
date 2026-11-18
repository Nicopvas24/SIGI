// DocumentoService - archivo digital de soportes y evidencias en Supabase Storage.
// Convención: Entidad/Año/Colaborador_FechaInicio/Documento_Nombre_FechaInicio_TipoSoporte.ext
// El bucket es privado (hay información clínica reservada): se guarda la referencia
// storage://bucket/ruta y los archivos se consultan con enlaces firmados de corta duración.
import { supabase } from '../../config/supabase.js';
import { config } from '../../config/config.js';
import { repoDocumentos } from '../repositories/index.js';

const TIPOS_RESERVADOS = new Set(['EPICRISIS', 'HISTORIA_CLINICA']);
export const TIPOS_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const PREFIJO = `storage://${config.supabase.bucket}/`;

function errorHttp(mensaje, status = 400) {
  return Object.assign(new Error(mensaje), { status });
}

function validarArchivo(archivo) {
  if (!TIPOS_PERMITIDOS.has(archivo.mimetype)) {
    throw errorHttp(`"${archivo.originalname}" no es un formato permitido. Use PDF, JPG, PNG o WEBP.`);
  }
  if (!archivo.size) throw errorHttp(`"${archivo.originalname}" está vacío o es ilegible.`);
}

async function subir(ruta, archivo) {
  validarArchivo(archivo);
  const { error } = await supabase.storage
    .from(config.supabase.bucket)
    .upload(ruta, archivo.buffer, { contentType: archivo.mimetype, upsert: false });
  if (error) throw errorHttp(`No se pudo guardar el archivo en el repositorio: ${error.message}`, 502);
  return PREFIJO + ruta;
}

const extension = (archivo) => (archivo.originalname?.split('.').pop() || 'pdf').toLowerCase();
const version = () => Date.now().toString(36);

export const DocumentoService = {
  rutaArchivo({ entidadNombre, fechaInicio, colaboradorDoc, colaboradorNombre, tipoSoporte, ext }) {
    const anio = String(fechaInicio).slice(0, 4);
    const carpeta = `${slug(entidadNombre)}/${anio}/${colaboradorDoc}_${fechaInicio}`;
    const nombre = `${colaboradorDoc}_${slug(colaboradorNombre)}_${fechaInicio}_${tipoSoporte}_${version()}.${ext}`;
    return `${carpeta}/${nombre}`;
  },

  /**
   * Registra un soporte del caso. Con archivo lo sube al repositorio; sin archivo
   * deja constancia de la entrega física (url null).
   */
  async guardarSoporte({ incapacidad, tipoSoporte, archivo }) {
    let url = null;
    let nombre = `${tipoSoporte} (entrega física)`;
    if (archivo?.buffer) {
      const ruta = this.rutaArchivo({
        entidadNombre: incapacidad.entidad?.nombre || 'entidad',
        fechaInicio: incapacidad.fecha_inicio,
        colaboradorDoc: incapacidad.colaborador?.usuario?.documento || 'doc',
        colaboradorNombre: incapacidad.colaborador?.usuario?.nombre || 'colaborador',
        tipoSoporte,
        ext: extension(archivo),
      });
      url = await subir(ruta, archivo);
      nombre = ruta.split('/').pop();
    }
    return repoDocumentos.crear({
      incapacidad_id: incapacidad.id,
      tipo_documento: tipoSoporte,
      nombre_archivo: nombre,
      url,
      estado: 'CARGADO',
      es_reservado: TIPOS_RESERVADOS.has(tipoSoporte),
    });
  },

  /** Sube el archivo de evidencia de una gestión ante la entidad. */
  async guardarEvidencia({ incapacidad, tipoGestion, archivo }) {
    const ruta = `evidencias/${incapacidad.numero_caso}/${tipoGestion}_${version()}.${extension(archivo)}`;
    return subir(ruta, archivo);
  },

  /** Enlace temporal (10 min) para ver un archivo del bucket privado. */
  async enlaceFirmado(url) {
    if (!url?.startsWith(PREFIJO)) return url || null;
    const { data, error } = await supabase.storage
      .from(config.supabase.bucket).createSignedUrl(url.slice(PREFIJO.length), 600);
    if (error) throw errorHttp(`No se pudo abrir el archivo: ${error.message}`, 404);
    return data.signedUrl;
  },

  /** Descarga un archivo del repositorio como { mimeType, base64, bytes }. */
  async descargar(url) {
    if (!url?.startsWith(PREFIJO)) return null;
    const { data, error } = await supabase.storage.from(config.supabase.bucket).download(url.slice(PREFIJO.length));
    if (error) return null;
    const buffer = Buffer.from(await data.arrayBuffer());
    return { mimeType: data.type || 'application/pdf', base64: buffer.toString('base64'), bytes: buffer.length };
  },

  /** Borra del repositorio los archivos indicados (referencias storage://). Ignora los que no son del bucket. */
  async eliminarArchivos(urls = []) {
    const rutas = urls.filter((u) => u?.startsWith(PREFIJO)).map((u) => u.slice(PREFIJO.length));
    if (!rutas.length) return;
    const { error } = await supabase.storage.from(config.supabase.bucket).remove(rutas);
    if (error) console.error('[DocumentoService] no se pudieron borrar archivos:', error.message);
  },

  async marcarEstado(documentoId, estado) {
    return repoDocumentos.actualizar(documentoId, { estado });
  },
};

function slug(texto = '') {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}
