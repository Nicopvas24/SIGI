// IaOcrService - Módulo de IA para análisis de información con Google Gemini
// (nota final del procedimiento: "Utilizar un modelo de inteligencia
// artificial para análisis de información").
//
// Capacidades:
//  1. leerCertificado       - lee un certificado (PDF/imagen) y propone los datos del caso
//  2. analizarSoportes      - analiza los soportes digitales de un caso (legibilidad, coherencia)
//  3. resumirColaborador    - resumen del historial de incapacidades de un colaborador
//  4. analizarAusentismo    - análisis del informe mensual para el SG-SST
//  5. predecirRiesgo180     - casos que podrían superar 180 días acumulados
import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/config.js';

let cliente = null;
function obtenerCliente() {
  if (!config.ia.habilitada) {
    throw Object.assign(
      new Error('El asistente de IA no está configurado. Defina GEMINI_API_KEY en el archivo .env.'),
      { status: 503, propio: true }
    );
  }
  cliente ??= new GoogleGenAI({ apiKey: config.ia.apiKey });
  return cliente;
}

const BASE_SISTEMA =
  'Eres el asistente de análisis de SIGI, el sistema de gestión de incapacidades de Gestión Humana ' +
  'de una empresa colombiana (EPS, ARL, licencias de maternidad y paternidad). Responde en español, ' +
  'con frases claras y concretas. Protege la reserva clínica: no transcribas detalles médicos más allá ' +
  'del código CIE-10. Responde únicamente con JSON válido que siga el esquema indicado.';

/**
 * Llama a Gemini y devuelve el JSON de la respuesta.
 * `partes` es la lista de partes del mensaje: { text } o { inlineData: { mimeType, data } }.
 */
async function pedirJSON(partes, instruccion = '') {
  let response;
  try {
    response = await obtenerCliente().models.generateContent({
      model: config.ia.model,
      contents: [{ role: 'user', parts: partes }],
      config: {
        systemInstruction: BASE_SISTEMA + (instruccion ? `\n${instruccion}` : ''),
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });
  } catch (e) {
    throw traducirError(e);
  }

  const texto = (response.text || '').trim();
  if (!texto) {
    throw Object.assign(new Error('La IA no devolvió contenido (posible bloqueo por políticas de seguridad).'), { status: 422 });
  }
  try {
    return JSON.parse(texto);
  } catch {
    const inicio = texto.indexOf('{');
    const fin = texto.lastIndexOf('}');
    try { return JSON.parse(texto.slice(inicio, fin + 1)); } catch { /* sigue abajo */ }
    throw Object.assign(new Error('La respuesta de la IA no tiene un formato válido. Intente de nuevo.'), { status: 502 });
  }
}

function traducirError(e) {
  if (e.propio) return e;
  const status = Number(e.status) || 502;
  const mensajes = {
    400: 'La solicitud a la IA no es válida (revise el archivo o la clave GEMINI_API_KEY).',
    401: 'La clave GEMINI_API_KEY no es válida.',
    403: 'La clave GEMINI_API_KEY no tiene permiso para usar la API de Gemini.',
    404: `El modelo "${config.ia.model}" no está disponible. Revise GEMINI_MODEL en .env.`,
    429: 'Se agotó la cuota gratuita de la API de Gemini. Espere un momento e intente de nuevo.',
    503: 'El servicio de Gemini está saturado en este momento. Intente de nuevo en unos segundos.',
  };
  const err = new Error(mensajes[status] || `Error del servicio de IA: ${e.message}`);
  err.status = status === 401 || status === 403 ? 502 : status;
  console.error('[IaOcrService]', e.message);
  return err;
}

const texto = (t) => ({ text: t });
const archivo = (mimeType, base64) => ({ inlineData: { mimeType, data: base64 } });

export const IaOcrService = {
  /** Lee un certificado de incapacidad (PDF o imagen) y propone los datos del caso. */
  async leerCertificado({ mimeType, base64 }) {
    return pedirJSON([
      archivo(mimeType, base64),
      texto(`Lee este certificado de incapacidad o licencia y extrae sus datos.
Esquema:
{
  "nombre_colaborador": string|null,
  "documento": string|null,
  "entidad": string|null,
  "tipo_novedad": "ENFERMEDAD_GENERAL"|"ACCIDENTE_LABORAL"|"ACCIDENTE_TRANSITO"|"LICENCIA_MATERNIDAD"|"LICENCIA_PATERNIDAD"|null,
  "fecha_inicio": "YYYY-MM-DD"|null,
  "dias": number|null,
  "diagnostico_cie10": string|null,
  "es_prorroga": boolean|null,
  "legible": boolean,
  "confianza": "ALTA"|"MEDIA"|"BAJA",
  "campos_dudosos": string[],
  "observaciones": string
}
Si el documento no es un certificado de incapacidad, pon legible=false y explícalo en observaciones.`),
    ]);
  },

  /**
   * Analiza los soportes digitales de un caso: tipo real de cada documento,
   * legibilidad y coherencia con los datos del caso.
   */
  async analizarSoportes({ caso, requeridos, archivos }) {
    const partes = [];
    archivos.forEach((a, i) => {
      partes.push(texto(`Documento ${i + 1} - registrado como "${a.tipo}":`));
      partes.push(archivo(a.mimeType, a.base64));
    });
    partes.push(texto(`Datos del caso registrados en el sistema: ${JSON.stringify(caso)}
Documentos que exige el tipo de novedad: ${JSON.stringify(requeridos)}
Revisa cada documento: ¿es del tipo registrado?, ¿es legible?, ¿el nombre, documento de identidad, fechas
y días coinciden con el caso? Esquema:
{
  "apto_para_verificar": boolean,
  "documentos": [ { "numero": number, "tipo_registrado": string, "tipo_detectado": string,
                    "legible": boolean, "coincide_con_caso": boolean, "observacion": string } ],
  "inconsistencias": string[],
  "faltantes": string[],
  "recomendacion": string
}`));
    return pedirJSON(partes);
  },

  /** Resumen del historial de incapacidades de un colaborador para Gestión Humana. */
  async resumirColaborador({ colaborador, estadisticas, casos }) {
    return pedirJSON([
      texto(`Resume el historial de incapacidades de este colaborador para la coordinación de Gestión Humana.
Colaborador: ${JSON.stringify(colaborador)}
Estadísticas calculadas por el sistema: ${JSON.stringify(estadisticas)}
Casos (del más reciente al más antiguo): ${JSON.stringify(casos)}
Ten en cuenta los hitos legales: concepto de rehabilitación antes del día 120 acumulado, envío al fondo
de pensiones antes del día 150 y suspensión del pago por nómina desde el día 181.
Esquema:
{
  "resumen": string,
  "situacion_actual": string,
  "patrones": string[],
  "alertas": string[],
  "recomendaciones": string[]
}`),
    ]);
  },

  /** Análisis del ausentismo mensual para el informe al SG-SST (datos anonimizados). */
  async analizarAusentismo({ periodo, resumen, registros }) {
    return pedirJSON([
      texto(`Analiza el ausentismo laboral del periodo ${periodo} para el informe mensual al SG-SST.
Resumen calculado por el sistema: ${JSON.stringify(resumen)}
Registros anonimizados: ${JSON.stringify(registros)}
Esquema:
{
  "resumen_ejecutivo": string,
  "hallazgos": string[],
  "areas_criticas": string[],
  "recomendaciones_sgsst": string[]
}`),
    ]);
  },

  /** Estima qué casos activos podrían superar 180 días acumulados. */
  async predecirRiesgo180({ casos }) {
    return pedirJSON([
      texto(`Evalúa el riesgo de que cada caso activo supere 180 días acumulados de incapacidad,
según días acumulados, prórrogas, tipo de novedad y diagnóstico agrupado.
Casos: ${JSON.stringify(casos)}
Acciones posibles: solicitar el concepto de rehabilitación (antes del día 120), enviarlo al fondo de
pensiones (antes del día 150) o notificar la suspensión del pago por nómina (desde el día 181).
Esquema:
{
  "evaluaciones": [ { "numero_caso": string, "riesgo": "ALTO"|"MEDIO"|"BAJO", "dias_acumulados": number,
                      "razonamiento": string, "accion_sugerida": string } ],
  "conclusion": string
}`),
    ]);
  },
};
