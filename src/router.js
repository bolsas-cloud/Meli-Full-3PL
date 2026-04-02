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
import { moduloBilling } from './modules/billingMeli.js';
import { moduloAds } from './modules/adsAnalytics.js';
import { moduloPYL } from './modules/pyl.js';
import { moduloCostos } from './modules/costosRentabilidad.js';
import { moduloMensajes } from './modules/mensajes.js';
import { moduloKnowledgeBase } from './modules/knowledgeBase.js';
import { moduloAnaliticas } from './modules/analiticas.js';

// Módulo activo actual (para cleanup de realtime, timers, etc.)
let moduloActivo = null;

export const router = {

    // Función principal de navegación
    navegar: (ruta) => {
        console.log('Navegando a:', ruta);

        // 0. Cleanup del módulo anterior (realtime, timers, etc.)
        if (moduloActivo && typeof moduloActivo.destroy === 'function') {
            moduloActivo.destroy();
        }
        moduloActivo = null;

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
            'billing': 'Billing ML',
            'ads': 'Ads Analytics',
            'pyl': 'P&L Integrado',
            'costos': 'Costos y Rentabilidad',
            'mensajes': 'Mensajes ML',
            'knowledge': 'Base de Conocimiento',
            'analiticas': 'Analíticas de Atención',
            'trafico': 'Tráfico y Visitas',
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

        // 3b. Auto-expandir sección del módulo activo en sidebar
        if (window.sidebarSections && window.sidebarSections[ruta] && typeof expandSection === 'function') {
            expandSection(window.sidebarSections[ruta]);
        }

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

            case 'billing':
                moduloBilling.render(appContent);
                break;

            case 'ads':
                moduloAds.render(appContent);
                break;

            case 'pyl':
                moduloPYL.render(appContent);
                break;

            case 'costos':
                moduloCostos.render(appContent);
                moduloActivo = moduloCostos;
                break;

            case 'mensajes':
                moduloMensajes.render(appContent);
                moduloActivo = moduloMensajes;
                break;

            case 'knowledge':
                moduloKnowledgeBase.render(appContent);
                moduloActivo = moduloKnowledgeBase;
                break;

            case 'analiticas':
                moduloAnaliticas.render(appContent);
                moduloActivo = moduloAnaliticas;
                break;

            case 'depositos':
                moduloDepositos.render(appContent);
                break;

            case 'trafico':
                appContent.innerHTML = '<div class="p-8 text-center text-gray-400"><i class="fas fa-eye fa-3x mb-4"></i><p class="text-lg">Módulo de Tráfico en construcción</p><p class="text-sm mt-2">Se implementará con el plan de visitas</p></div>';
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
