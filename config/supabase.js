// Cliente de Supabase (base de datos relacional PostgreSQL + Auth + Storage)
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  console.warn('[SIGI] Falta configurar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env');
}

// Cliente administrativo (backend): usa la service role key, salta RLS.
export const supabase = createClient(
  config.supabase.url || 'http://localhost:54321',
  config.supabase.serviceRoleKey || 'service-role-key',
  { auth: { persistSession: false } }
);

// Cliente público (solo para login con email/contraseña de Supabase Auth)
export const supabaseAuth = createClient(
  config.supabase.url || 'http://localhost:54321',
  config.supabase.anonKey || 'anon-key',
  { auth: { persistSession: false } }
);
