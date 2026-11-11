// Configuración general (BD, correo, plazos) - sección 12: config/
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
  // IA: Google Gemini (https://aistudio.google.com/apikey). Se activa al definir GEMINI_API_KEY.
  ia: {
    apiKey: process.env.GEMINI_API_KEY?.trim() || '',
    habilitada: Boolean(process.env.GEMINI_API_KEY?.trim()),
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest',
  },
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
