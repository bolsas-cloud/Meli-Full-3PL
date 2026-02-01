// ============================================
// CONFIGURACIÓN DE SUPABASE - MELI-FULL-3PL
// ============================================
const SUPABASE_URL = 'https://cpwsdpzxzhlmozzasnqx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd3NkcHp4emhsbW96emFzbnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNzgzNDAsImV4cCI6MjA4MTg1NDM0MH0.yPjNhAdJ71UFGbT5l1R96ZbxPr3C5_zKtqNNKMUmvzk';

// ============================================
// CONFIGURACIÓN DE SUPABASE - VENTAS APP (para remitos)
// ============================================
const VENTAS_SUPABASE_URL = 'https://mzqsfahaawqhpooquofu.supabase.co';
const VENTAS_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16cXNmYWhhYXdxaHBvb3F1b2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1OTA5MzgsImV4cCI6MjA3NzE2NjkzOH0.SUqm_fSVoJgFe-NdBsMB_qS5uqd3fDmvGmMeZ1vXVPk';

// ============================================
// CONFIGURACIÓN DE MERCADO LIBRE
// ============================================
export const MELI_CONFIG = {
    APP_ID: '4370336012652573',
    CLIENT_SECRET: 'LXRXjcqrcWxDemTEv7Iq8GVIMBOsUZzB',
    REDIRECT_URI: 'https://meli-full-3-pl.vercel.app/callback.html',
    AUTH_URL: 'https://auth.mercadolibre.com.ar/authorization',
    TOKEN_URL: 'https://api.mercadolibre.com/oauth/token',
    API_BASE: 'https://api.mercadolibre.com'
};

// ============================================
// VERIFICACIÓN DE CARGA
// ============================================
if (!window.supabase) {
    console.error("CRITICAL: La librería de Supabase no se cargó. Revisa el CDN en index.html");
    alert("Error crítico: No se pudo conectar con el servidor de base de datos.");
}

// ============================================
// CLIENTES SUPABASE
// ============================================
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cliente para VentasApp (remitos y transportes)
export const supabaseVentas = window.supabase.createClient(VENTAS_SUPABASE_URL, VENTAS_SUPABASE_KEY);

// ============================================
// CONFIGURACIÓN DE SUPABASE - RRHH (para preparaciones)
// ============================================
const RRHH_SUPABASE_URL = 'https://iuigafnkgfihvixolsgw.supabase.co';
const RRHH_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1aWdhZm5rZ2ZpaHZpeG9sc2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzg2MjMsImV4cCI6MjA3OTc1NDYyM30.6YWUztVztgX7-ppvuYIJW8zJ0NPJQ1rf2AB-PbbZaUg';

// Cliente para RRHH (preparaciones, colaboradores)
export const supabaseRRHH = window.supabase.createClient(RRHH_SUPABASE_URL, RRHH_SUPABASE_KEY);

// ============================================
// CONFIGURACIÓN DE SUPABASE - PRODUCCIÓN (para tareas y consumibles)
// ============================================
const PROD_SUPABASE_URL = 'https://xukbgcwpmwsxggznxjsj.supabase.co';
const PROD_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1a2JnY3dwbXdzeGdnem54anNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4MDE5NzMsImV4cCI6MjA3ODM3Nzk3M30.voXGaKmQvs2rc1j6ReHlvAaDnSFgzAvBn3bQZfLpf08';

// Cliente para ProduccionTextilApp (tareas, productos EMPAQUE)
export const supabaseProduccion = window.supabase.createClient(PROD_SUPABASE_URL, PROD_SUPABASE_KEY);
