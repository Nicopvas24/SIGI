// Configuración general: base de datos, IA y plazos del procedimiento
import 'dotenv/config';

export const config = {
  port: process.env.PORT || 4000,
  demoMode: String(process.env.DEMO_MODE).toLowerCase() === 'true',
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: process.env.SUPABASE_BUCKET || 'documentos',
  },
  // IA. Dos proveedores:
  //  - 'ovh': OVHcloud AI Endpoints, gratuito y SIN clave (límite ~2 solicitudes/min por IP y modelo).
  //  - 'gemini': Google Gemini, requiere GEMINI_API_KEY (gratis en https://aistudio.google.com/apikey).
  // IA_PROVEEDOR elige; si no se define, se usa Gemini cuando hay clave y si no la IA queda sin configurar.
  ia: (() => {
    const apiKey = process.env.GEMINI_API_KEY?.trim() || '';
    const proveedor = process.env.IA_PROVEEDOR?.trim().toLowerCase() || (apiKey ? 'gemini' : '');
    return {
      proveedor,
      habilitada: proveedor === 'ovh' || (proveedor === 'gemini' && Boolean(apiKey)),
      apiKey,
      model: process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest',
      ovh: {
        url: process.env.OVH_AI_URL?.trim() || 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
        apiKey: process.env.OVH_AI_KEY?.trim() || '', // opcional: sube el límite de solicitudes
        modelo: process.env.OVH_AI_MODELO?.trim() || 'Mistral-Small-3.2-24B-Instruct-2506',
        modeloVision: process.env.OVH_AI_MODELO_VISION?.trim() || 'Qwen2.5-VL-72B-Instruct',
      },
      // Respaldo sin clave cuando se agota el cupo de OVHcloud (solo texto, ~1 respuesta cada 45 s por IP)
      respaldoUrl: process.env.IA_RESPALDO_URL?.trim() || 'https://text.pollinations.ai/openai',
    };
  })(),
  // Plazos del procedimiento de Gestión Humana
  plazos: {
    remisionDocumentosDias: 2,       // RN-04: 2 días para remitir soportes
    documentacionFaltanteDiasHabiles: 3, // 5.1.2: 3 días hábiles para faltantes
    licenciaPaternidadDias: 30,      // 5.2.1: 30 días calendario desde el nacimiento
    respuestaDerechoPeticionDiasHabiles: 15,
    diasCobroAntesDeJuridica: 180,   // Act. 15: 180 días de cobro sin pago
    umbralesMonitoreo: [90, 120, 150, 180], // 5.5.3
  },
};
