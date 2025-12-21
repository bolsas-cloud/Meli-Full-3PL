// ============================================
// PUNTO DE ENTRADA PRINCIPAL
// ============================================
import { router } from './router.js';
import { supabase } from './config.js';
import { moduloAuth } from './modules/auth.js';

// Inicialización cuando el DOM está listo
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Meli Full 3PL - Inicializando...');

    // Verificar conexión con Supabase
    try {
        const { data, error } = await supabase.from('config_logistica').select('*').limit(1);
        if (error) {
            console.warn('Supabase conectado, pero tablas no creadas aún:', error.message);
        } else {
            console.log('Supabase conectado correctamente');
        }
    } catch (e) {
        console.error('Error conectando con Supabase:', e);
    }

    // Inicializar módulo de autenticación y actualizar UI
    await moduloAuth.actualizarUI();

    // Navegar a la vista inicial (Calculadora de Envíos)
    router.navegar('calculadora');
});
