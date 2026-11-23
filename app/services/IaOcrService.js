// IaOcrService - Módulo de IA para análisis de información (nota final del
// procedimiento: "Utilizar un modelo de inteligencia artificial para análisis
// de información"). Proveedores: OVHcloud AI Endpoints (gratuito, sin clave)
// o Google Gemini (con GEMINI_API_KEY). Ver config.ia.
//
// Capacidades:
//  1. leerCertificado       - lee un certificado (PDF/imagen) y propone los datos del caso
//  2. analizarSoportes      - analiza los soportes digitales de un caso (legibilidad, coherencia)
//  3. resumirColaborador    - resumen del historial de incapacidades de un colaborador
//  4. analizarAusentismo    - análisis del informe mensual para el SG-SST
//  5. predecirRiesgo180     - casos que podrían superar 180 días acumulados
import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/config.js';

function exigirIA() {
  if (!config.ia.habilitada) {
    throw Object.assign(
      new Error('El asistente de IA no está configurado. Defina IA_PROVEEDOR=ovh (gratuito) o GEMINI_API_KEY en el archivo .env.'),
      { status: 503, propio: true }
    );
  }
}

let cliente = null;
function obtenerCliente() {
  exigirIA();
  cliente ??= new GoogleGenAI({ apiKey: config.ia.apiKey });
  return cliente;
}

const BASE_SISTEMA =
  'Eres el asistente de análisis de SIGI, el sistema de gestión de incapacidades de Gestión Humana ' +
  'de una empresa colombiana (EPS, ARL, licencias de maternidad y paternidad). Responde en español, ' +
  'con frases claras y concretas. Protege la reserva clínica: no transcribas detalles médicos más allá ' +
  'del código CIE-10. No uses emojis ni símbolos decorativos. Responde únicamente con JSON válido que siga el esquema indicado.';

// Quita emojis y símbolos pictográficos de los textos que devuelve la IA (por si los incluye igual)
const EMOJIS = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
function sinEmojis(valor) {
  if (typeof valor === 'string') return valor.replace(EMOJIS, '').replace(/\s{2,}/g, ' ').replace(/\s+([:;,.])/g, '$1').trim();
  if (Array.isArray(valor)) return valor.map(sinEmojis);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, sinEmojis(v)]));
  return valor;
}

/**
 * Llama al proveedor de IA configurado y devuelve el JSON de la respuesta.
 * `partes` es la lista de partes del mensaje: { text } o { inlineData: { mimeType, data } }.
 */
async function pedirJSON(partes, instruccion = '') {
  exigirIA();
  if (config.ia.proveedor === 'ovh') return pedirJSONOvh(partes, instruccion);
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

  return parsearJSON(response.text);
}

function parsearJSON(bruto) {
  const texto = String(bruto || '').trim();
  if (!texto) {
    throw Object.assign(new Error('La IA no devolvió contenido (posible bloqueo por políticas de seguridad).'), { status: 422 });
  }
  try {
    return sinEmojis(JSON.parse(texto));
  } catch {
    const inicio = texto.indexOf('{');
    const fin = texto.lastIndexOf('}');
    try { return sinEmojis(JSON.parse(texto.slice(inicio, fin + 1))); } catch { /* sigue abajo */ }
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

// ---------- Proveedor gratuito: OVHcloud AI Endpoints (API compatible con OpenAI) ----------
// Sin clave tiene un límite aproximado de 2 solicitudes por minuto por IP y por modelo; por eso
// el texto y los documentos usan modelos distintos y ante un 429 se espera y se reintenta.
const MAX_LADO_IMAGEN = 1600;
const MAX_IMAGENES = 4;
const MAX_TEXTO_PDF = 15000;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ESPERA_MAX_REINTENTO_MS = 1000;   // espera máxima antes de reintentar por límite de uso
const TIEMPO_MAX_RESPUESTA_MS = 30000;  // corte si el servicio de IA no responde

async function pedirJSONOvh(partes, instruccion) {
  const contenido = [];
  for (const p of partes) {
    if (p.text) contenido.push({ type: 'text', text: p.text });
    else if (p.inlineData) contenido.push(...(await archivoAContenido(p.inlineData)));
  }
  let imagenes = 0;
  const final = contenido.filter((c) => c.type !== 'image_url' || ++imagenes <= MAX_IMAGENES);
  if (imagenes > MAX_IMAGENES) final.push({ type: 'text', text: `(Se omitieron ${imagenes - MAX_IMAGENES} imagen(es) por el límite del modelo gratuito.)` });

  const { modelo, modeloVision } = config.ia.ovh;
  const sistema = BASE_SISTEMA + (instruccion ? `\n${instruccion}` : '');
  try {
    const datos = await llamarOvh({
      model: imagenes ? modeloVision : modelo,
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: final }],
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });
    return parsearJSON(datos.choices?.[0]?.message?.content);
  } catch (e) {
    if (!e.limite) throw e;
    // Cupo de OVHcloud agotado: los textos (y los PDF, que se envían como texto) pasan al servicio de respaldo
    if (imagenes) {
      throw Object.assign(new Error('Se agotó el cupo gratuito de la IA para leer imágenes. Suba el certificado en PDF, '
        + 'llene el formulario a mano o configure GEMINI_API_KEY en el archivo .env.'), { status: 429 });
    }
    const texto = final.map((c) => c.text).join('\n\n');
    return parsearJSON(await llamarPollinations(sistema, texto));
  }
}

// ---------- Respaldo gratuito sin clave: Pollinations (solo texto, ~1 respuesta cada 45 s por IP) ----------
async function llamarPollinations(sistema, texto) {
  let res;
  try {
    res = await fetch(config.ia.respaldoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [{ role: 'system', content: sistema }, { role: 'user', content: texto }],
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(TIEMPO_MAX_RESPUESTA_MS),
    });
  } catch (e) {
    console.error('[IaOcrService] respaldo:', e.message);
    throw Object.assign(new Error(e.name === 'TimeoutError'
      ? 'La IA tardó demasiado en responder. Intente de nuevo.'
      : 'No se pudo contactar el servicio gratuito de IA. Revise la conexión a internet.'), { status: e.name === 'TimeoutError' ? 504 : 502 });
  }
  if (res.ok) return (await res.json()).choices?.[0]?.message?.content;
  const espera = Number(res.headers.get('retry-after'));
  console.error('[IaOcrService] respaldo', res.status);
  if (res.status === 402 || res.status === 429) {
    throw Object.assign(new Error(`La IA gratuita permite una lectura cada 45 segundos. Intente de nuevo${espera ? ` en ${espera} s` : ' en un momento'}.`), { status: 429 });
  }
  throw Object.assign(new Error(`El servicio gratuito de IA no respondió (error ${res.status}). Intente de nuevo.`), { status: 502 });
}

async function llamarOvh(body, intento = 1) {
  const { url, apiKey } = config.ia.ovh;
  let res;
  try {
    res = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIEMPO_MAX_RESPUESTA_MS),
    });
  } catch (e) {
    console.error('[IaOcrService] OVH:', e.message);
    if (e.name === 'TimeoutError') {
      throw Object.assign(new Error('La IA tardó demasiado en responder. Intente de nuevo con un archivo más liviano.'), { status: 504 });
    }
    throw Object.assign(new Error('No se pudo contactar el servicio gratuito de IA. Revise la conexión a internet.'), { status: 502 });
  }
  if (res.ok) return res.json();

  const detalle = await res.text().catch(() => '');
  if (res.status === 429) {
    const segundos = Number(res.headers.get('retry-after')) || 0;
    // Límite por minuto: un solo reintento tras esperar como máximo 1 s
    if (intento === 1 && segundos <= 60) {
      await espera(ESPERA_MAX_REINTENTO_MS);
      return llamarOvh(body, intento + 1);
    }
    // Cupo agotado (OVHcloud ahora limita el acceso sin clave por año): quien llama usa el respaldo
    console.error('[IaOcrService] OVH sin cupo; espera indicada:', segundos, 's');
    throw Object.assign(new Error('Se alcanzó el límite gratuito de la IA. Intente de nuevo más tarde.'), { status: 429, limite: true });
  }
  console.error('[IaOcrService] OVH', res.status, detalle.slice(0, 300));
  const mensajes = {
    400: 'El servicio gratuito de IA rechazó la solicitud (archivo demasiado grande o ilegible).',
    401: 'La clave OVH_AI_KEY no es válida. Bórrela del .env para usar el acceso gratuito sin clave.',
    413: 'Los documentos son demasiado grandes para el modelo gratuito.',
    429: 'Se alcanzó el límite gratuito de la IA (unas 2 solicitudes por minuto). Intente de nuevo en un minuto.',
  };
  throw Object.assign(
    new Error(mensajes[res.status] || `El servicio gratuito de IA no respondió (error ${res.status}). Intente de nuevo.`),
    { status: res.status === 429 ? 429 : 502 }
  );
}

/** Convierte un archivo en partes de mensaje: imágenes reducidas o texto extraído del PDF. */
async function archivoAContenido({ mimeType, data }) {
  const buffer = Buffer.from(data, 'base64');
  if (mimeType !== 'application/pdf') return [imagenParte(await reducirImagen(buffer))];

  const { extractText, getDocumentProxy, renderPageAsImage } = await import('unpdf');
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
  } catch {
    return [{ type: 'text', text: '(El PDF adjunto está dañado o protegido y no se pudo leer.)' }];
  }
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  if (text.replace(/\s+/g, '').length >= 80) {
    return [{ type: 'text', text: `Texto extraído del PDF (${totalPages} página(s)):\n${text.slice(0, MAX_TEXTO_PDF)}` }];
  }
  // PDF escaneado (sin capa de texto): se envían las primeras páginas como imagen
  const paginas = [];
  for (let n = 1; n <= Math.min(totalPages, 2); n++) {
    const png = await renderPageAsImage(pdf, n, { canvasImport: () => import('@napi-rs/canvas'), scale: 1.6 });
    paginas.push(imagenParte(await reducirImagen(Buffer.from(png))));
  }
  return paginas;
}

/** Reduce la imagen a MAX_LADO_IMAGEN px de lado y la codifica en JPEG para no exceder el contexto del modelo. */
async function reducirImagen(buffer) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const img = await loadImage(buffer);
  const factor = Math.min(1, MAX_LADO_IMAGEN / Math.max(img.width, img.height));
  const canvas = createCanvas(Math.round(img.width * factor), Math.round(img.height * factor));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.encode('jpeg', 85);
}

const imagenParte = (jpeg) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}` } });

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
"entidad" es la EPS o ARL que expide el certificado y paga la incapacidad (por ejemplo "Salud Total", "Nueva EPS",
"ARL SURA"), normalmente en el encabezado. No es la IPS, clínica u hospital donde atendieron al paciente.
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
