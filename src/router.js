// ============================================
// ROUTER SPA - Navegación sin recargar página
// ============================================
import { moduloCalculadora } from './modules/calculadoraEnvios.js';
import { moduloEnviosCreados } from './modules/enviosCreados.js';
import { moduloDashboard } from './modules/dashboard.js';
import { moduloStock } from './modules/stock.js';
import { moduloPrecios } from './modules/precios.js';
import { moduloPublicaciones } from './modules/publicaciones.js';
import { moduloEtiquetas } from './modules/etiquetas.js';
import { moduloDepositos } from './modules/depositos.js';

export const router = {

    // Función principal de navegación
    navegar: (ruta) => {
        console.log('Navegando a:', ruta);

        // 1. Actualizar título
        const titulos = {
            'dashboard': 'Dashboard de Ventas',
            'calculadora': 'Calculadora de Envíos a Full',
            'envios': 'Envíos Creados',
            'etiquetas': 'Etiquetado Masivo',
            'stock': 'Seguimiento de Stock',
            'precios': 'Gestión de Precios',
            'publicaciones': 'Gestión de Publicaciones',
            'reconciliacion': 'Reconciliación 3PL',
            'depositos': 'Depósitos de Envío'
        };
        document.getElementById('page-title').innerText = titulos[ruta] || 'Meli Full 3PL';

        // 2. Limpiar contenido anterior
        const appContent = document.getElementById('app-content');
        appContent.innerHTML = '';

        // 3. Resaltar menú activo (UX)
        document.querySelectorAll('.nav-item').forEach(el => {
            const onclick = el.getAttribute('onclick') || '';
            if (onclick.includes(ruta)) {
                el.classList.add('bg-white/20', 'font-bold');
            } else {
                el.classList.remove('bg-white/20', 'font-bold');
            }
        });

        // 4. Cargar el módulo correspondiente
        switch(ruta) {
            case 'calculadora':
                moduloCalculadora.render(appContent);
                break;

            case 'envios':
                moduloEnviosCreados.render(appContent);
                break;

            case 'etiquetas':
                moduloEtiquetas.render(appContent);
                break;

            case 'dashboard':
                moduloDashboard.render(appContent);
                break;

            case 'stock':
                moduloStock.render(appContent);
                break;

            case 'precios':
                moduloPrecios.render(appContent);
                break;

            case 'publicaciones':
                moduloPublicaciones.render(appContent);
                break;

            case 'depositos':
                moduloDepositos.render(appContent);
                break;

            default:
                appContent.innerHTML = `
                    <div class="text-center mt-20 text-gray-400">
                        <i class="fas fa-tools fa-3x mb-4"></i>
                        <p class="text-lg">Módulo "${ruta}" en construcción</p>
                    </div>
                `;
        }
    }
};

// Exponer router al window para que el HTML pueda usar onclick="router.navegar(...)"
window.router = router;
