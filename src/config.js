// ============================================
// CONFIGURACIÓN DE SUPABASE
// ============================================
const SUPABASE_URL = 'https://cpwsdpzxzhlmozzasnqx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd3NkcHp4emhsbW96emFzbnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNzgzNDAsImV4cCI6MjA4MTg1NDM0MH0.yPjNhAdJ71UFGbT5l1R96ZbxPr3C5_zKtqNNKMUmvzk';

// ============================================
// CONFIGURACIÓN DE MERCADO LIBRE
// ============================================
export const MELI_CONFIG = {
    APP_ID: '4370336012652573',
    CLIENT_SECRET: 'LXRXjcqrcWxDemTEv7Iq8GVIMBOsUZzB',
    REDIRECT_URI: 'https://meli-full-3pl.vercel.app/callback.html',
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
// CLIENTE SUPABASE
// ============================================
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
