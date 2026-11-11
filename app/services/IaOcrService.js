// IaOcrService - Módulo de IA para análisis de información (nota final del
// procedimiento: "Utilizar un modelo de inteligencia artificial para análisis
// de información"). Usa la API de Claude (Anthropic).
//
// Capacidades:
//  1. extraerDatosCertificado  - IA/OCR del certificado de incapacidad (CU-06 paso 4)
//  2. preverificarSoportes     - preverificación e inconsistencias (CU-07, sugerencia)
//  3. analizarAusentismo       - análisis del informe mensual SG-SST (CU-16)
//  4. predecirRiesgo180        - anticipar incapacidades que superarían 180 días (CU-26)
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/config.js';

const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno
const MODEL = config.ia.model;

async function pedirJSON({ system, contenido, maxTokens = 8000 }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system:
      system +
      '\nResponde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques de código.',
    messages: [{ role: 'user', content: contenido }],
  });

  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('El modelo declinó procesar esta solicitud.'), { status: 422 });
  }
  const texto = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  try {
    const inicio = texto.indexOf('{');
    const fin = texto.lastIndexOf('}');
    return JSON.parse(texto.slice(inicio, fin + 1));
  } catch {
    return { error: 'No se pudo interpretar la respuesta de la IA', bruto: texto };
  }
}

export const IaOcrService = {
  /**
   * CU-06 paso 4: a partir de la imagen/PDF (base64) o del texto de un
   * certificado, propone fechas, días, diagnóstico y entidad.
   */
  async extraerDatosCertificado({ imagenBase64, mediaType, texto }) {
    const contenido = [];
    if (imagenBase64) {
      if (mediaType === 'application/pdf') {
        contenido.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imagenBase64 } });
      } else {
        contenido.push({ type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: imagenBase64 } });
      }
    }
    contenido.push({
      type: 'text',
      text:
        (texto ? `Texto del certificado:\n${texto}\n\n` : '') +
        `Extrae los datos del certificado de incapacidad colombiano. Esquema:
{
  "nombre_colaborador": string|null, "documento": string|null,
  "entidad": string|null, "tipo_novedad": "ENFERMEDAD_GENERAL"|"ACCIDENTE_LABORAL"|"ACCIDENTE_TRANSITO"|"LICENCIA_MATERNIDAD"|"LICENCIA_PATERNIDAD"|null,
  "fecha_inicio": "YYYY-MM-DD"|null, "dias": number|null,
  "diagnostico_cie10": string|null, "diagnostico_descripcion": string|null,
  "confianza": "ALTA"|"MEDIA"|"BAJA",
  "campos_dudosos": string[]
}
Si la confianza de un campo es baja, inclúyelo en campos_dudosos (CU-06 4b: se marcará para revisión manual).`,
    });

    return pedirJSON({
      system: 'Eres el módulo IA/OCR de SIGI. Extraes datos de certificados de incapacidad de EPS/ARL colombianas.',
      contenido,
    });
  },

  /**
   * CU-07 (sugerencia): preverifica los soportes y resalta inconsistencias
   * entre el certificado, el colaborador y la lista de chequeo.
   */
  async preverificarSoportes({ incapacidad, documentosRequeridos, documentosCargados }) {
    return pedirJSON({
      system: 'Eres el asistente de verificación documental de SIGI (Gestión Humana, Colombia).',
      contenido: [
        {
          type: 'text',
          text: `Preverifica este caso de incapacidad y resalta inconsistencias.
Caso: ${JSON.stringify(incapacidad)}
Documentos requeridos por el tipo: ${JSON.stringify(documentosRequeridos)}
Documentos cargados: ${JSON.stringify(documentosCargados)}
Esquema de respuesta:
{
  "apto_para_verificar": boolean,
  "faltantes": string[],
  "inconsistencias": string[],
  "recomendaciones": string[]
}`,
        },
      ],
    });
  },

  /**
   * CU-16: análisis del ausentismo mensual (días perdidos, índices de
   * frecuencia y severidad, patrones por área/diagnóstico).
   */
  async analizarAusentismo({ periodo, resumen, registros }) {
    return pedirJSON({
      system:
        'Eres el analista de ausentismo laboral de SIGI para el informe mensual al SG-SST. ' +
        'Protege la reserva clínica: refiérete a los diagnósticos solo por código CIE-10 agrupado.',
      contenido: [
        {
          type: 'text',
          text: `Analiza el ausentismo del periodo ${periodo}.
Resumen calculado por el sistema: ${JSON.stringify(resumen)}
Registros (anonimizados): ${JSON.stringify(registros)}
Esquema:
{
  "resumen_ejecutivo": string,
  "hallazgos": string[],
  "patrones_detectados": string[],
  "areas_criticas": string[],
  "recomendaciones_sgsst": string[]
}`,
        },
      ],
      maxTokens: 10000,
    });
  },

  /**
   * CU-26 (sugerencia): anticipa qué incapacidades podrían superar los
   * 180 días para disparar a tiempo el concepto de rehabilitación.
   */
  async predecirRiesgo180({ casos }) {
    return pedirJSON({
      system:
        'Eres el módulo predictivo de SIGI. Estimas el riesgo de que una incapacidad ' +
        'acumulada supere 180 días, considerando días acumulados, prórrogas y tipo de novedad.',
      contenido: [
        {
          type: 'text',
          text: `Evalúa el riesgo de superar 180 días para estos casos activos:
${JSON.stringify(casos)}
Esquema:
{
  "evaluaciones": [
    { "numero_caso": string, "riesgo": "ALTO"|"MEDIO"|"BAJO",
      "dias_acumulados": number, "razonamiento": string,
      "accion_sugerida": string }
  ],
  "conclusion": string
}
Acciones posibles: solicitar concepto de rehabilitación (antes del día 120, CU-27),
enviar concepto al AFP (antes del día 150), notificar suspensión de pago por nómina (día 181, CU-28).`,
        },
      ],
      maxTokens: 10000,
    });
  },
};
