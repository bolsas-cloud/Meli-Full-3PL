// ============================================
// MÓDULO: Gestión de Precios
// ============================================
// Permite visualizar, modificar y actualizar
// precios de publicaciones en Mercado Libre
// + Historial de evolución de precios
// ============================================

import { supabase } from '../config.js';
import { mostrarNotificacion, formatearMoneda, confirmarAccion } from '../utils.js';

// Estado local del módulo
let productos = [];
let productosOriginales = [];
let seleccionados = new Set();
let fallosPendientes = {}; // Map: sku -> { cantidad, ultimoIntento, ultimoPrecio }
let filtros = {
    busqueda: '',
    estado: 'todos',
    fallos: false // Nuevo filtro para productos con fallos
};
let pctComisionPromedio = 30; // Default 30%, se actualiza con datos reales
let tipoModificacionActual = 'porcentaje'; // Para registrar en fallos
let valorModificacionActual = 0; // Para registrar en fallos

// Configuración de costos de ML
let configCostosEnvio = []; // Rangos de costos por peso
let configCostosFijos = []; // Rangos de costos fijos por precio
let configUmbrales = {
    umbral_envio_gratis: 33000,
    descuento_envio_pct: 50,
    peso_default_gr: 500
};

// Estado para historial de precios
let tabActual = 'gestion'; // 'gestion' | 'historial'
let historialData = [];
let filtroHistorial = {
    periodo: 3, // meses
    busqueda: ''
};

export const moduloPrecios = {

    // ============================================
    // RENDER: Dibuja la interfaz con tabs
    // ============================================
    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">

                <!-- Tabs de navegación -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div class="flex border-b border-gray-200">
                        <button id="tab-gestion" onclick="moduloPrecios.cambiarTab('gestion')"
                                class="tab-btn flex-1 px-6 py-4 text-sm font-medium transition-colors border-b-2 border-brand text-brand bg-brand/5">
                            <i class="fas fa-tags mr-2"></i>
                            Gestión de Precios
                        </button>
                        <button id="tab-historial" onclick="moduloPrecios.cambiarTab('historial')"
                                class="tab-btn flex-1 px-6 py-4 text-sm font-medium transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50">
                            <i class="fas fa-chart-line mr-2"></i>
                            Historial de Precios
                        </button>
                        <button id="tab-config" onclick="moduloPrecios.cambiarTab('config')"
                                class="tab-btn flex-1 px-6 py-4 text-sm font-medium transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50">
                            <i class="fas fa-cog mr-2"></i>
                            Configuración Costos
                        </button>
                    </div>
                </div>

                <!-- Contenido de tabs -->
                <div id="contenido-tabs">
                    <!-- Se llena dinámicamente -->
                </div>

            </div>
        `;

        // Agregar estilos
        moduloPrecios.agregarEstilos();

        // Exponer en window para eventos onclick
        window.moduloPrecios = moduloPrecios;

        // Renderizar tab activa
        await moduloPrecios.renderTabActual();
    },

    // ============================================
    // CAMBIAR TAB
    // ============================================
    cambiarTab: async (tab) => {
        tabActual = tab;

        // Actualizar estilos de tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('border-brand', 'text-brand', 'bg-brand/5');
            btn.classList.add('border-transparent', 'text-gray-500');
        });

        const tabActiva = document.getElementById(`tab-${tab}`);
        if (tabActiva) {
            tabActiva.classList.remove('border-transparent', 'text-gray-500');
            tabActiva.classList.add('border-brand', 'text-brand', 'bg-brand/5');
        }

        await moduloPrecios.renderTabActual();
    },

    // ============================================
    // RENDER TAB ACTUAL
    // ============================================
    renderTabActual: async () => {
        const contenedor = document.getElementById('contenido-tabs');

        if (tabActual === 'gestion') {
            await moduloPrecios.renderGestionPrecios(contenedor);
        } else if (tabActual === 'historial') {
            await moduloPrecios.renderHistorialPrecios(contenedor);
        } else if (tabActual === 'config') {
            await moduloPrecios.renderConfiguracionCostos(contenedor);
        }
    },

    // ============================================
    // AGREGAR ESTILOS
    // ============================================
    agregarEstilos: () => {
        if (document.getElementById('estilos-precios')) return;

        const style = document.createElement('style');
        style.id = 'estilos-precios';
        style.textContent = `
            .btn-filtro-estado { background: #f3f4f6; color: #6b7280; }
            .btn-filtro-estado:hover { background: #e5e7eb; }
            .btn-filtro-estado.active { background: #4eab87; color: white; }
            .btn-filtro-fallos { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
            .btn-filtro-fallos:hover { background: #fee2e2; }
            .btn-filtro-fallos.active { background: #dc2626; color: white; border-color: #dc2626; }
            .row-con-fallo { background: #fef2f2 !important; }
            .row-con-fallo:hover { background: #fee2e2 !important; }
            .btn-periodo { background: #f3f4f6; color: #6b7280; }
            .btn-periodo:hover { background: #e5e7eb; }
            .btn-periodo.active { background: #4eab87; color: white; }
            .sparkline { display: inline-block; vertical-align: middle; }
            .variacion-positiva { color: #16a34a; }
            .variacion-negativa { color: #dc2626; }
            .variacion-neutral { color: #6b7280; }
        `;
        document.head.appendChild(style);
    },

    // ============================================
    // RENDER: Vista de Gestión de Precios
    // ============================================
    renderGestionPrecios: async (contenedor) => {
        contenedor.innerHTML = `
            <!-- Panel de Acciones -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div class="flex flex-wrap items-center justify-between gap-4">

                        <!-- Búsqueda y Filtros -->
                        <div class="flex flex-wrap items-center gap-4">
                            <div class="relative">
                                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                                <input type="text" id="buscar-producto" placeholder="Buscar por SKU o título..."
                                       class="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent w-64">
                            </div>

                            <div class="flex gap-2">
                                <button class="btn-filtro-estado active px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-estado="todos">
                                    Todos
                                </button>
                                <button class="btn-filtro-estado px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-estado="active">
                                    <span class="w-2 h-2 rounded-full bg-green-500 inline-block mr-1"></span>
                                    Activas
                                </button>
                                <button class="btn-filtro-estado px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-estado="paused">
                                    <span class="w-2 h-2 rounded-full bg-yellow-500 inline-block mr-1"></span>
                                    Pausadas
                                </button>
                                <button id="btn-filtro-fallos" class="btn-filtro-fallos px-3 py-2 rounded-lg text-sm font-medium transition-colors hidden" data-fallos="true">
                                    <span class="w-2 h-2 rounded-full bg-red-500 inline-block mr-1"></span>
                                    Con Fallos
                                    <span id="badge-fallos" class="ml-1 bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full">0</span>
                                </button>
                                <button id="btn-limpiar-fallos" onclick="moduloPrecios.limpiarTodosFallos()"
                                        class="hidden px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
                                        title="Descartar todos los fallos pendientes">
                                    <i class="fas fa-broom mr-1"></i>
                                    Limpiar
                                </button>
                            </div>
                        </div>

                        <!-- Info de selección -->
                        <div id="info-seleccion" class="text-sm text-gray-500">
                            <span id="contador-seleccion">0</span> productos seleccionados
                        </div>
                    </div>

                    <!-- Barra de Modificación -->
                    <div class="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-center gap-4">
                        <span class="text-sm font-medium text-gray-700">Modificar seleccionados:</span>

                        <select id="tipo-modificacion" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                            <option value="porcentaje">Porcentaje (%)</option>
                            <option value="fijo">Monto fijo ($)</option>
                        </select>

                        <input type="number" id="valor-modificacion" placeholder="Valor" step="0.01"
                               class="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm">

                        <button onclick="moduloPrecios.previsualizar()"
                                class="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors flex items-center gap-2">
                            <i class="fas fa-eye"></i>
                            Previsualizar
                        </button>

                        <button onclick="moduloPrecios.resetear()"
                                class="bg-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors flex items-center gap-2">
                            <i class="fas fa-undo"></i>
                            Resetear
                        </button>

                        <button onclick="moduloPrecios.guardarEnML()" id="btn-guardar-ml"
                                class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
                            <i class="fas fa-save"></i>
                            Guardar en ML
                        </button>
                    </div>
                </div>

                <!-- Tabla de Productos -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full" style="table-layout:fixed">
                            <colgroup>
                                <col style="width:32px">
                                <col style="width:11%">
                                <col style="width:auto">
                                <col style="width:50px">
                                <col style="width:80px">
                                <col style="width:80px">
                                <col style="width:80px">
                                <col style="width:24px">
                                <col style="width:70px">
                                <col style="width:80px">
                            </colgroup>
                            <thead class="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th class="pl-2 pr-1 py-2 text-left">
                                        <input type="checkbox" id="seleccionar-todos"
                                               class="rounded border-gray-300 text-brand focus:ring-brand"
                                               onclick="moduloPrecios.toggleTodos(this.checked)">
                                    </th>
                                    <th class="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase">SKU</th>
                                    <th class="px-2 py-2 text-left text-xs font-bold text-gray-500 uppercase">Producto</th>
                                    <th class="px-2 py-2 text-right text-xs font-bold text-gray-500 uppercase border-r border-gray-200">Peso</th>
                                    <th class="px-2 py-2 text-right text-xs font-bold text-gray-500 uppercase">Precio</th>
                                    <th class="px-2 py-2 text-right text-xs font-bold text-gray-500 uppercase">Nuevo</th>
                                    <th class="px-2 py-2 text-right text-xs font-bold text-gray-500 uppercase">Neto</th>
                                    <th class="text-center" title="Envío gratis"><i class="fas fa-truck text-gray-400 text-xs"></i></th>
                                    <th class="px-1 py-2 text-center text-xs font-bold text-gray-500 uppercase">+%</th>
                                    <th class="px-1 py-2 text-center text-xs font-bold text-gray-500 uppercase">Est.</th>
                                </tr>
                            </thead>
                            <tbody id="tabla-precios" class="divide-y divide-gray-100">
                                <tr>
                                    <td colspan="10" class="px-4 py-12 text-center text-gray-500">
                                        <i class="fas fa-spinner fa-spin fa-2x mb-2"></i>
                                        <p>Sincronizando precios desde Mercado Libre...</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

        `;

        // Configurar eventos
        document.getElementById('buscar-producto')?.addEventListener('input', (e) => {
            filtros.busqueda = e.target.value.toLowerCase();
            moduloPrecios.pintarTabla();
        });

        document.querySelectorAll('.btn-filtro-estado').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-filtro-estado').forEach(b => b.classList.remove('active'));
                document.getElementById('btn-filtro-fallos')?.classList.remove('active');
                btn.classList.add('active');
                filtros.estado = btn.dataset.estado;
                filtros.fallos = false;
                moduloPrecios.pintarTabla();
            });
        });

        // Evento para filtro de fallos
        document.getElementById('btn-filtro-fallos')?.addEventListener('click', () => {
            const btnFallos = document.getElementById('btn-filtro-fallos');
            const isActive = btnFallos.classList.contains('active');

            if (isActive) {
                btnFallos.classList.remove('active');
                filtros.fallos = false;
            } else {
                document.querySelectorAll('.btn-filtro-estado').forEach(b => b.classList.remove('active'));
                btnFallos.classList.add('active');
                filtros.fallos = true;
                filtros.estado = 'todos';
            }
            moduloPrecios.pintarTabla();
        });

        // Cargar datos
        await moduloPrecios.cargarProductos();
    },

    // ============================================
    // RENDER: Vista de Historial de Precios
    // ============================================
    renderHistorialPrecios: async (contenedor) => {
        contenedor.innerHTML = `
            <!-- Panel de Filtros -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div class="flex flex-wrap items-center justify-between gap-4">
                    <!-- Filtros de período -->
                    <div class="flex items-center gap-4">
                        <span class="text-sm font-medium text-gray-700">Período:</span>
                        <div class="flex gap-2">
                            <button class="btn-periodo px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-meses="1">
                                1 Mes
                            </button>
                            <button class="btn-periodo active px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-meses="3">
                                3 Meses
                            </button>
                            <button class="btn-periodo px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-meses="6">
                                6 Meses
                            </button>
                            <button class="btn-periodo px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-meses="12">
                                12 Meses
                            </button>
                        </div>
                    </div>

                    <!-- Búsqueda -->
                    <div class="relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        <input type="text" id="buscar-historial" placeholder="Buscar producto..."
                               class="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent w-64">
                    </div>
                </div>

                <!-- Resumen -->
                <div class="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="bg-gray-50 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-gray-800" id="stat-productos">-</div>
                        <div class="text-xs text-gray-500">Productos con ventas</div>
                    </div>
                    <div class="bg-green-50 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-green-600" id="stat-aumentaron">-</div>
                        <div class="text-xs text-gray-500">Aumentaron precio</div>
                    </div>
                    <div class="bg-red-50 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-red-600" id="stat-bajaron">-</div>
                        <div class="text-xs text-gray-500">Bajaron precio</div>
                    </div>
                    <div class="bg-blue-50 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-blue-600" id="stat-variacion">-</div>
                        <div class="text-xs text-gray-500">Variación promedio</div>
                    </div>
                </div>
            </div>

            <!-- Tabla de Historial -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Producto</th>
                                <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Precio Inicial</th>
                                <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Precio Actual</th>
                                <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Variación</th>
                                <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Evolución</th>
                                <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Ventas</th>
                            </tr>
                        </thead>
                        <tbody id="tabla-historial" class="divide-y divide-gray-100">
                            <tr>
                                <td colspan="6" class="px-4 py-12 text-center text-gray-500">
                                    <i class="fas fa-spinner fa-spin fa-2x mb-2"></i>
                                    <p>Cargando historial de precios...</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Configurar eventos de filtro de período
        document.querySelectorAll('.btn-periodo').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-periodo').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filtroHistorial.periodo = parseInt(btn.dataset.meses);
                moduloPrecios.cargarHistorial();
            });
        });

        // Evento de búsqueda
        document.getElementById('buscar-historial')?.addEventListener('input', (e) => {
            filtroHistorial.busqueda = e.target.value.toLowerCase();
            moduloPrecios.pintarTablaHistorial();
        });

        // Cargar datos
        await moduloPrecios.cargarHistorial();
    },

    // ============================================
    // RENDER: Vista de Configuración de Costos
    // ============================================
    renderConfiguracionCostos: async (contenedor) => {
        contenedor.innerHTML = `
            <!-- Info -->
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <div class="flex items-start gap-3">
                    <i class="fas fa-info-circle text-blue-500 mt-0.5"></i>
                    <div class="text-sm text-blue-800">
                        <p class="font-medium mb-1">Configuración de Costos de Mercado Libre</p>
                        <p>Estos valores se usan para calcular el <strong>Neto Estimado</strong> de cada producto.
                        Incluyen el costo de envío gratis (según peso) y costos fijos (según precio).</p>
                        <p class="mt-1">Fuente: <a href="https://www.mercadolibre.com.ar/ayuda/costos-envios-gratis_3482" target="_blank" class="underline">Ayuda ML</a></p>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

                <!-- Umbrales Generales -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <i class="fas fa-sliders-h text-brand"></i>
                        Umbrales Generales
                    </h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Umbral Envío Gratis con Descuento
                            </label>
                            <div class="flex items-center gap-2">
                                <span class="text-gray-500">$</span>
                                <input type="number" id="umbral-envio-gratis"
                                       value="${configUmbrales.umbral_envio_gratis || 33000}"
                                       class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">
                            </div>
                            <p class="text-xs text-gray-500 mt-1">Productos >= este precio tienen 50% descuento en envío</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Peso por Defecto (sin dato)
                            </label>
                            <div class="flex items-center gap-2">
                                <input type="number" id="peso-default"
                                       value="${configUmbrales.peso_default_gr || 500}"
                                       class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <span class="text-gray-500">gramos</span>
                            </div>
                            <p class="text-xs text-gray-500 mt-1">Se usa cuando el producto no tiene peso cargado</p>
                        </div>
                        <button onclick="moduloPrecios.guardarUmbrales()"
                                class="w-full bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors">
                            <i class="fas fa-save mr-2"></i>Guardar Umbrales
                        </button>
                    </div>
                </div>

                <!-- Costos Fijos por Precio -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <i class="fas fa-dollar-sign text-brand"></i>
                        Costos Fijos por Rango de Precio
                    </h3>
                    <p class="text-xs text-gray-500 mb-3">Aplican a productos con precio menor al umbral de envío gratis</p>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-2 py-2 text-left text-xs font-bold text-gray-500">Desde</th>
                                    <th class="px-2 py-2 text-left text-xs font-bold text-gray-500">Hasta</th>
                                    <th class="px-2 py-2 text-right text-xs font-bold text-gray-500">Costo Fijo</th>
                                </tr>
                            </thead>
                            <tbody id="tabla-costos-fijos" class="divide-y divide-gray-100">
                                ${configCostosFijos.map(c => `
                                    <tr>
                                        <td class="px-2 py-2">${formatearMoneda(c.precio_desde)}</td>
                                        <td class="px-2 py-2">${formatearMoneda(c.precio_hasta)}</td>
                                        <td class="px-2 py-2 text-right">
                                            <input type="number"
                                                   data-id="${c.id}"
                                                   data-tipo="fijo"
                                                   value="${c.costo_fijo}"
                                                   class="w-20 border border-gray-300 rounded px-2 py-1 text-right text-sm">
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <button onclick="moduloPrecios.guardarCostosFijos()"
                            class="w-full mt-4 bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors">
                        <i class="fas fa-save mr-2"></i>Guardar Costos Fijos
                    </button>
                </div>

            </div>

            <!-- Costos de Envío por Peso -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <i class="fas fa-truck text-brand"></i>
                    Costos de Envío Gratis por Peso
                </h3>
                <p class="text-xs text-gray-500 mb-3">
                    <strong>Sin descuento:</strong> Productos nuevos < $${(configUmbrales.umbral_envio_gratis || 33000).toLocaleString()} o reputación baja |
                    <strong>Con descuento 50%:</strong> Productos nuevos >= $${(configUmbrales.umbral_envio_gratis || 33000).toLocaleString()} y reputación verde
                </p>
                <div class="overflow-x-auto max-h-96">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50 sticky top-0">
                            <tr>
                                <th class="px-3 py-2 text-left text-xs font-bold text-gray-500">Rango de Peso</th>
                                <th class="px-3 py-2 text-right text-xs font-bold text-gray-500">Sin Descuento</th>
                                <th class="px-3 py-2 text-right text-xs font-bold text-gray-500">Con Descuento (50%)</th>
                            </tr>
                        </thead>
                        <tbody id="tabla-costos-envio" class="divide-y divide-gray-100">
                            ${configCostosEnvio.map(c => {
                                const pesoDesde = c.peso_desde_gr >= 1000 ? (c.peso_desde_gr / 1000) + ' kg' : c.peso_desde_gr + ' g';
                                const pesoHasta = c.peso_hasta_gr >= 1000 ? (c.peso_hasta_gr / 1000) + ' kg' : c.peso_hasta_gr + ' g';
                                return `
                                    <tr class="hover:bg-gray-50">
                                        <td class="px-3 py-2 text-gray-600">${pesoDesde} - ${pesoHasta}</td>
                                        <td class="px-3 py-2 text-right">
                                            <input type="number"
                                                   data-id="${c.id}"
                                                   data-tipo="envio-sin"
                                                   value="${c.costo_sin_descuento}"
                                                   class="w-24 border border-gray-300 rounded px-2 py-1 text-right text-sm">
                                        </td>
                                        <td class="px-3 py-2 text-right">
                                            <input type="number"
                                                   data-id="${c.id}"
                                                   data-tipo="envio-con"
                                                   value="${c.costo_con_descuento}"
                                                   class="w-24 border border-gray-300 rounded px-2 py-1 text-right text-sm">
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <button onclick="moduloPrecios.guardarCostosEnvio()"
                        class="w-full mt-4 bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors">
                    <i class="fas fa-save mr-2"></i>Guardar Costos de Envío
                </button>
            </div>
        `;
    },

    // ============================================
    // GUARDAR UMBRALES
    // ============================================
    guardarUmbrales: async () => {
        const umbralEnvio = parseFloat(document.getElementById('umbral-envio-gratis').value) || 33000;
        const pesoDefault = parseFloat(document.getElementById('peso-default').value) || 500;

        try {
            await supabase.from('config_umbrales_ml').upsert([
                { clave: 'umbral_envio_gratis', valor: umbralEnvio, descripcion: 'Precio mínimo para envío gratis con descuento 50%' },
                { clave: 'peso_default_gr', valor: pesoDefault, descripcion: 'Peso por defecto si no hay dato' }
            ], { onConflict: 'clave' });

            configUmbrales.umbral_envio_gratis = umbralEnvio;
            configUmbrales.peso_default_gr = pesoDefault;

            mostrarNotificacion('Umbrales guardados correctamente', 'success');
        } catch (error) {
            console.error('Error guardando umbrales:', error);
            mostrarNotificacion('Error al guardar umbrales', 'error');
        }
    },

    // ============================================
    // GUARDAR COSTOS FIJOS
    // ============================================
    guardarCostosFijos: async () => {
        const inputs = document.querySelectorAll('#tabla-costos-fijos input[data-tipo="fijo"]');
        const updates = [];

        inputs.forEach(input => {
            const id = parseInt(input.dataset.id);
            const valor = parseFloat(input.value) || 0;
            updates.push({ id, costo_fijo: valor });
        });

        try {
            for (const upd of updates) {
                await supabase
                    .from('config_costos_fijos_ml')
                    .update({ costo_fijo: upd.costo_fijo, updated_at: new Date().toISOString() })
                    .eq('id', upd.id);
            }

            // Recargar configuración
            const { data } = await supabase
                .from('config_costos_fijos_ml')
                .select('*')
                .eq('activo', true)
                .order('precio_desde');

            if (data) configCostosFijos = data;

            mostrarNotificacion('Costos fijos guardados correctamente', 'success');
        } catch (error) {
            console.error('Error guardando costos fijos:', error);
            mostrarNotificacion('Error al guardar costos fijos', 'error');
        }
    },

    // ============================================
    // GUARDAR COSTOS ENVÍO
    // ============================================
    guardarCostosEnvio: async () => {
        const inputsSin = document.querySelectorAll('#tabla-costos-envio input[data-tipo="envio-sin"]');
        const inputsCon = document.querySelectorAll('#tabla-costos-envio input[data-tipo="envio-con"]');
        const updates = {};

        inputsSin.forEach(input => {
            const id = parseInt(input.dataset.id);
            if (!updates[id]) updates[id] = {};
            updates[id].costo_sin_descuento = parseFloat(input.value) || 0;
        });

        inputsCon.forEach(input => {
            const id = parseInt(input.dataset.id);
            if (!updates[id]) updates[id] = {};
            updates[id].costo_con_descuento = parseFloat(input.value) || 0;
        });

        try {
            for (const [id, values] of Object.entries(updates)) {
                await supabase
                    .from('config_costos_envio_ml')
                    .update({
                        costo_sin_descuento: values.costo_sin_descuento,
                        costo_con_descuento: values.costo_con_descuento,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', parseInt(id));
            }

            // Recargar configuración
            const { data } = await supabase
                .from('config_costos_envio_ml')
                .select('*')
                .eq('activo', true)
                .order('peso_desde_gr');

            if (data) configCostosEnvio = data;

            mostrarNotificacion('Costos de envío guardados correctamente', 'success');
        } catch (error) {
            console.error('Error guardando costos de envío:', error);
            mostrarNotificacion('Error al guardar costos de envío', 'error');
        }
    },

    // ============================================
    // CARGAR HISTORIAL: Obtiene precios desde órdenes + publicaciones
    // ============================================
    cargarHistorial: async () => {
        const tbody = document.getElementById('tabla-historial');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-4 py-12 text-center text-gray-500">
                    <i class="fas fa-spinner fa-spin fa-2x mb-2"></i>
                    <p>Cargando historial de precios...</p>
                </td>
            </tr>
        `;

        try {
            // Calcular fecha de inicio según período
            const fechaInicio = new Date();
            fechaInicio.setMonth(fechaInicio.getMonth() - filtroHistorial.periodo);

            // Consultas en paralelo: órdenes históricas + precios actuales de publicaciones
            const [ordenesRes, publicacionesRes] = await Promise.all([
                supabase
                    .from('ordenes_meli')
                    .select('id_item, titulo_item, precio_unitario, fecha_creacion')
                    .gte('fecha_creacion', fechaInicio.toISOString())
                    .order('fecha_creacion', { ascending: true }),
                supabase
                    .from('publicaciones_meli')
                    .select('id_publicacion, precio, titulo, estado')
                    .in('estado', ['active', 'paused']) // Solo activas y pausadas
            ]);

            if (ordenesRes.error) throw ordenesRes.error;
            if (publicacionesRes.error) throw publicacionesRes.error;

            const ordenes = ordenesRes.data || [];
            const publicaciones = publicacionesRes.data || [];

            // Crear mapa de precios actuales por id_publicacion
            const preciosActuales = {};
            publicaciones.forEach(pub => {
                preciosActuales[pub.id_publicacion] = parseFloat(pub.precio) || 0;
            });

            // Agrupar órdenes por producto
            const productosPorItem = {};

            ordenes.forEach(orden => {
                const key = orden.id_item;
                if (!productosPorItem[key]) {
                    productosPorItem[key] = {
                        id_item: orden.id_item,
                        titulo: orden.titulo_item,
                        precios: [],
                        ventas: 0
                    };
                }
                productosPorItem[key].precios.push({
                    precio: parseFloat(orden.precio_unitario),
                    fecha: new Date(orden.fecha_creacion)
                });
                productosPorItem[key].ventas++;
            });

            // Calcular datos para cada producto
            historialData = Object.values(productosPorItem).map(prod => {
                const preciosOrdenados = prod.precios.sort((a, b) => a.fecha - b.fecha);
                const precioInicial = preciosOrdenados[0]?.precio || 0;

                // Precio actual: de la publicación, no de la última venta
                const precioActual = preciosActuales[prod.id_item] || preciosOrdenados[preciosOrdenados.length - 1]?.precio || 0;

                const variacion = precioInicial > 0 ? ((precioActual - precioInicial) / precioInicial * 100) : 0;

                // Obtener puntos únicos para el sparkline (agrupar por fecha)
                const preciosPorDia = {};
                preciosOrdenados.forEach(p => {
                    const dia = p.fecha.toISOString().split('T')[0];
                    preciosPorDia[dia] = p.precio;
                });
                // Agregar precio actual como último punto del sparkline
                const hoy = new Date().toISOString().split('T')[0];
                preciosPorDia[hoy] = precioActual;

                const puntosSparkline = Object.values(preciosPorDia);

                return {
                    id_item: prod.id_item,
                    titulo: prod.titulo,
                    precioInicial,
                    precioActual,
                    variacion,
                    ventas: prod.ventas,
                    sparklineData: puntosSparkline
                };
            });

            // Ordenar por variación descendente (mayor aumento primero)
            historialData.sort((a, b) => b.variacion - a.variacion);

            // Actualizar estadísticas
            moduloPrecios.actualizarEstadisticasHistorial();

            // Pintar tabla
            moduloPrecios.pintarTablaHistorial();

        } catch (error) {
            console.error('Error cargando historial:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-4 py-12 text-center text-red-500">
                        <i class="fas fa-exclamation-circle fa-2x mb-2"></i>
                        <p>Error al cargar historial</p>
                    </td>
                </tr>
            `;
        }
    },

    // ============================================
    // ACTUALIZAR ESTADÍSTICAS DEL HISTORIAL
    // ============================================
    actualizarEstadisticasHistorial: () => {
        const total = historialData.length;
        const aumentaron = historialData.filter(p => p.variacion > 0).length;
        const bajaron = historialData.filter(p => p.variacion < 0).length;
        const variacionPromedio = total > 0
            ? (historialData.reduce((sum, p) => sum + p.variacion, 0) / total).toFixed(1)
            : 0;

        document.getElementById('stat-productos').textContent = total;
        document.getElementById('stat-aumentaron').textContent = aumentaron;
        document.getElementById('stat-bajaron').textContent = bajaron;
        document.getElementById('stat-variacion').textContent = `${variacionPromedio > 0 ? '+' : ''}${variacionPromedio}%`;
    },

    // ============================================
    // PINTAR TABLA HISTORIAL
    // ============================================
    pintarTablaHistorial: () => {
        const tbody = document.getElementById('tabla-historial');
        if (!tbody) return;

        // Aplicar filtro de búsqueda
        let datosFiltrados = historialData;
        if (filtroHistorial.busqueda) {
            datosFiltrados = historialData.filter(p =>
                (p.titulo || '').toLowerCase().includes(filtroHistorial.busqueda) ||
                (p.id_item || '').toLowerCase().includes(filtroHistorial.busqueda)
            );
        }

        if (datosFiltrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-4 py-12 text-center text-gray-500">
                        <i class="fas fa-inbox fa-2x mb-2"></i>
                        <p>No hay datos de ventas en este período</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = datosFiltrados.map(p => {
            const variacionClase = p.variacion > 0 ? 'variacion-positiva' : (p.variacion < 0 ? 'variacion-negativa' : 'variacion-neutral');
            const variacionIcono = p.variacion > 0 ? 'fa-arrow-up' : (p.variacion < 0 ? 'fa-arrow-down' : 'fa-minus');

            return `
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-4 py-3">
                        <div class="text-sm font-medium text-gray-800 truncate max-w-md" title="${(p.titulo || '').replace(/"/g, '&quot;')}">${p.titulo || '-'}</div>
                        <div class="text-xs text-gray-500 font-mono">${p.id_item || '-'}</div>
                    </td>
                    <td class="px-4 py-3 text-right font-medium text-gray-600">
                        ${formatearMoneda(p.precioInicial)}
                    </td>
                    <td class="px-4 py-3 text-right font-bold text-gray-800">
                        ${formatearMoneda(p.precioActual)}
                    </td>
                    <td class="px-4 py-3 text-center">
                        <span class="inline-flex items-center gap-1 font-bold ${variacionClase}">
                            <i class="fas ${variacionIcono} text-xs"></i>
                            ${p.variacion > 0 ? '+' : ''}${p.variacion.toFixed(1)}%
                        </span>
                    </td>
                    <td class="px-4 py-3 text-center">
                        ${moduloPrecios.generarSparkline(p.sparklineData, p.variacion)}
                    </td>
                    <td class="px-4 py-3 text-center">
                        <span class="inline-flex items-center justify-center w-10 h-6 bg-gray-100 rounded text-xs font-medium text-gray-600">
                            ${p.ventas}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // ============================================
    // GENERAR SPARKLINE SVG
    // ============================================
    generarSparkline: (data, variacion) => {
        if (!data || data.length < 2) {
            return '<span class="text-gray-300 text-xs">Sin datos</span>';
        }

        const width = 80;
        const height = 24;
        const padding = 2;

        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;

        // Generar puntos del path
        const points = data.map((value, index) => {
            const x = padding + (index / (data.length - 1)) * (width - 2 * padding);
            const y = height - padding - ((value - min) / range) * (height - 2 * padding);
            return `${x},${y}`;
        });

        const pathD = `M ${points.join(' L ')}`;
        const color = variacion >= 0 ? '#16a34a' : '#dc2626';

        return `
            <svg width="${width}" height="${height}" class="sparkline">
                <path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
    },

    // ============================================
    // CARGAR PRODUCTOS: Sync desde ML y cargar de Supabase
    // OPTIMIZADO: consultas en paralelo
    // ============================================
    cargarProductos: async () => {
        try {
            // Sincronizar precios desde ML
            mostrarNotificacion('Sincronizando precios desde ML...', 'info');

            const { data: syncResult, error: syncError } = await supabase.functions.invoke('sync-meli', {
                body: { action: 'sync-prices' }
            });

            if (syncError) {
                console.warn('Error sincronizando precios:', syncError);
            } else if (syncResult?.updated) {
                console.log(`Sincronizados ${syncResult.updated} precios`);
            }

            // ============================================
            // PARALELO: Cargar comisión promedio, productos, fallos y config de costos
            // ============================================
            const [ordenesRes, productosRes, fallosRes, costosEnvioRes, costosFijosRes, umbralesRes] = await Promise.all([
                supabase
                    .from('ordenes_meli')
                    .select('pct_costo_meli')
                    .not('pct_costo_meli', 'is', null)
                    .order('fecha_pago', { ascending: false })
                    .limit(100),
                supabase
                    .from('publicaciones_meli')
                    .select('sku, id_publicacion, titulo, precio, comision_ml, cargo_fijo_ml, costo_envio_ml, impuestos_estimados, neto_estimado, estado, tipo_logistica, peso_gr, tiene_envio_gratis')
                    .in('estado', ['active', 'paused']) // Solo activas y pausadas, no cerradas
                    .order('titulo'),
                supabase
                    .from('v_precios_fallos_pendientes')
                    .select('*'),
                // Cargar configuración de costos de envío
                supabase
                    .from('config_costos_envio_ml')
                    .select('*')
                    .eq('activo', true)
                    .order('peso_desde_gr'),
                // Cargar configuración de costos fijos
                supabase
                    .from('config_costos_fijos_ml')
                    .select('*')
                    .eq('activo', true)
                    .order('precio_desde'),
                // Cargar umbrales
                supabase
                    .from('config_umbrales_ml')
                    .select('*')
            ]);

            // Procesar comisión promedio
            if (ordenesRes.data && ordenesRes.data.length > 0) {
                const suma = ordenesRes.data.reduce((acc, o) => acc + (parseFloat(o.pct_costo_meli) || 0), 0);
                pctComisionPromedio = suma / ordenesRes.data.length;
                console.log(`% Comisión promedio: ${pctComisionPromedio.toFixed(2)}% (de ${ordenesRes.data.length} órdenes)`);
            }

            // Procesar configuración de costos de envío
            if (costosEnvioRes.data && costosEnvioRes.data.length > 0) {
                configCostosEnvio = costosEnvioRes.data;
                console.log(`Cargados ${configCostosEnvio.length} rangos de costos de envío`);
            }

            // Procesar configuración de costos fijos
            if (costosFijosRes.data && costosFijosRes.data.length > 0) {
                configCostosFijos = costosFijosRes.data;
                console.log(`Cargados ${configCostosFijos.length} rangos de costos fijos`);
            }

            // Procesar umbrales
            if (umbralesRes.data && umbralesRes.data.length > 0) {
                umbralesRes.data.forEach(u => {
                    configUmbrales[u.clave] = parseFloat(u.valor) || 0;
                });
                console.log('Umbrales cargados:', configUmbrales);
            }

            // Procesar productos
            if (productosRes.error) throw productosRes.error;

            productos = productosRes.data || [];
            productosOriginales = JSON.parse(JSON.stringify(productos));
            seleccionados.clear();

            // Procesar fallos pendientes
            fallosPendientes = {};
            if (fallosRes.data && fallosRes.data.length > 0) {
                fallosRes.data.forEach(f => {
                    fallosPendientes[f.sku] = {
                        cantidad: f.cantidad_fallos,
                        ultimoIntento: f.ultimo_intento,
                        ultimoPrecio: f.ultimo_precio_intentado,
                        idPublicacion: f.id_publicacion
                    };
                });
            }

            // Actualizar badge y visibilidad del filtro de fallos
            const cantidadFallos = Object.keys(fallosPendientes).length;
            const btnFallos = document.getElementById('btn-filtro-fallos');
            const btnLimpiarFallos = document.getElementById('btn-limpiar-fallos');
            const badgeFallos = document.getElementById('badge-fallos');

            if (cantidadFallos > 0) {
                btnFallos?.classList.remove('hidden');
                btnLimpiarFallos?.classList.remove('hidden');
                if (badgeFallos) badgeFallos.textContent = cantidadFallos;
            } else {
                btnFallos?.classList.add('hidden');
                btnLimpiarFallos?.classList.add('hidden');
                filtros.fallos = false;
            }

            moduloPrecios.pintarTabla();
            mostrarNotificacion(`${productos.length} productos cargados`, 'success');

        } catch (error) {
            console.error('Error cargando productos:', error);
            mostrarNotificacion('Error al cargar productos', 'error');

            document.getElementById('tabla-precios').innerHTML = `
                <tr>
                    <td colspan="10" class="px-4 py-12 text-center text-red-500">
                        <i class="fas fa-exclamation-circle fa-2x mb-2"></i>
                        <p>Error al cargar productos. Intenta de nuevo.</p>
                    </td>
                </tr>
            `;
        }
    },

    // ============================================
    // PINTAR TABLA: Renderiza los productos filtrados
    // ============================================
    pintarTabla: () => {
        const tbody = document.getElementById('tabla-precios');

        // Aplicar filtros
        let productosFiltrados = productos.filter(p => {
            const matchBusqueda = !filtros.busqueda ||
                (p.sku || '').toLowerCase().includes(filtros.busqueda) ||
                (p.titulo || '').toLowerCase().includes(filtros.busqueda);

            const matchEstado = filtros.estado === 'todos' || p.estado === filtros.estado;

            // Filtro de fallos
            const matchFallos = !filtros.fallos || fallosPendientes[p.sku];

            return matchBusqueda && matchEstado && matchFallos;
        });

        if (productosFiltrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="px-4 py-12 text-center text-gray-500">
                        <i class="fas fa-inbox fa-2x mb-2"></i>
                        <p>No se encontraron productos</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = productosFiltrados.map(p => {
            const isSelected = seleccionados.has(p.sku);
            const precioOriginal = productosOriginales.find(o => o.sku === p.sku)?.precio || p.precio;
            const precioModificado = p.precioNuevo !== undefined;
            const diferencia = precioModificado ? ((p.precioNuevo - precioOriginal) / precioOriginal * 100).toFixed(1) : null;

            const estadoColor = p.estado === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
            const estadoTexto = p.estado === 'active' ? 'Activa' : 'Pausada';

            // Info de fallos pendientes
            const falloInfo = fallosPendientes[p.sku];
            const tieneFallo = !!falloInfo;

            // Calcular neto estimado COMPLETO
            // Incluye: comisión + cargo fijo ML + impuestos + costo de envío gratis
            const precioParaNeto = precioModificado ? p.precioNuevo : precioOriginal;
            const comision = parseFloat(p.comision_ml) || 0;
            const cargoFijoML = parseFloat(p.cargo_fijo_ml) || 0;
            const impuestos = parseFloat(p.impuestos_estimados) || 0;
            const pesoGr = parseFloat(p.peso_gr) || 0;
            const tieneEnvioGratis = p.tiene_envio_gratis === true;

            // Calcular costo de envío gratis SOLO si el producto tiene envío gratis
            const costoEnvio = tieneEnvioGratis
                ? moduloPrecios.calcularCostoEnvio(pesoGr, precioParaNeto)
                : 0;

            // Calcular costo fijo por rango de precio (complementa al cargo_fijo_ml de ML)
            // Nota: cargo_fijo_ml ya viene de ML, pero a veces no incluye todos los costos
            const costoFijoRango = moduloPrecios.calcularCostoFijo(precioParaNeto);

            // Usar el mayor entre cargo_fijo_ml y costo_fijo_rango (evitar duplicar)
            const cargoFijoFinal = Math.max(cargoFijoML, costoFijoRango);

            let netoEstimado;
            if (comision > 0 || cargoFijoFinal > 0 || costoEnvio > 0) {
                // Usar costos reales/calculados
                netoEstimado = precioParaNeto - comision - cargoFijoFinal - impuestos - costoEnvio;
            } else {
                // Fallback: usar % promedio de órdenes
                netoEstimado = precioParaNeto * (1 - pctComisionPromedio / 100);
            }

            // Guardar costos para mostrar en tooltip
            p._costoEnvio = costoEnvio;
            p._costoFijo = cargoFijoFinal;
            p._comision = comision;
            p._impuestos = impuestos;

            // Calcular % markup sobre neto (cuánto hay que cargarle al neto para llegar al precio)
            const pctMarkup = netoEstimado > 0 ? ((precioParaNeto - netoEstimado) / netoEstimado * 100).toFixed(1) : 0;

            // Determinar clase de fila
            const rowClass = tieneFallo
                ? 'row-con-fallo'
                : (precioModificado ? 'bg-yellow-50' : '');

            // Formatear precios estilo contable ($ alineado izq, número alineado der)
            const formatoContable = (monto) => {
                const num = parseFloat(monto) || 0;
                return num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            };

            return `
                <tr class="hover:bg-gray-50 transition-colors ${rowClass}">
                    <td class="pl-2 pr-1 py-2">
                        <input type="checkbox"
                               class="rounded border-gray-300 text-brand focus:ring-brand"
                               ${isSelected ? 'checked' : ''}
                               onchange="moduloPrecios.toggleSeleccion('${p.sku}', this.checked)">
                    </td>
                    <td class="px-2 py-2 font-mono text-xs text-gray-600">
                        <div class="truncate">${p.sku || '-'}</div>
                        ${tieneFallo ? `
                            <span class="bg-red-500 text-white text-xs px-1 py-0.5 rounded-full" title="Fallos pendientes">
                                ${falloInfo.cantidad}
                            </span>
                        ` : ''}
                    </td>
                    <td class="px-2 py-2">
                        <div class="truncate text-xs" title="${(p.titulo || '').replace(/"/g, '&quot;')}">${p.titulo || '-'}</div>
                        ${tieneFallo ? `
                            <div class="text-xs text-red-600 mt-1">
                                <i class="fas fa-exclamation-triangle mr-1"></i>
                                Pendiente: ${formatearMoneda(falloInfo.ultimoPrecio)}
                                <button onclick="moduloPrecios.reintentarFallo('${p.sku}')"
                                        class="ml-1 text-blue-600 hover:text-blue-800 underline">
                                    <i class="fas fa-redo"></i>
                                </button>
                            </div>
                        ` : ''}
                    </td>
                    <td class="px-2 py-2 text-right text-xs ${pesoGr > 0 ? 'text-gray-600' : 'text-gray-400'} border-r border-gray-200">
                        ${pesoGr > 0 ? (pesoGr >= 1000 ? (pesoGr / 1000).toFixed(1) + 'kg' : pesoGr + 'g') : '-'}
                    </td>
                    <td class="px-2 py-2 ${precioModificado ? 'line-through text-gray-400' : 'text-gray-800'}">
                        <div class="flex justify-between text-xs font-medium">
                            <span>$</span>
                            <span>${formatoContable(precioOriginal)}</span>
                        </div>
                    </td>
                    <td class="px-2 py-2">
                        ${precioModificado ? `
                            <div class="flex justify-between text-xs font-bold text-green-600">
                                <span>$</span>
                                <span>${formatoContable(p.precioNuevo)}</span>
                            </div>
                            <div class="text-xs ${diferencia > 0 ? 'text-green-600' : 'text-red-600'} text-right">
                                (${diferencia > 0 ? '+' : ''}${diferencia}%)
                            </div>
                        ` : '<div class="text-gray-400 text-xs text-center">-</div>'}
                    </td>
                    <td class="px-2 py-2">
                        ${netoEstimado > 0 ? `
                            <div class="flex justify-between text-xs text-gray-600 cursor-help" title="Desglose:
• Precio: ${formatearMoneda(precioParaNeto)}
• Comisión ML: -${formatearMoneda(p._comision)}
• Costo fijo: -${formatearMoneda(p._costoFijo)}
• Impuestos: -${formatearMoneda(p._impuestos)}
• Envío gratis: -${formatearMoneda(p._costoEnvio)}
─────────────────
• NETO: ${formatearMoneda(netoEstimado)}">
                                <span>$</span>
                                <span>${formatoContable(netoEstimado)}</span>
                            </div>
                        ` : '<div class="text-gray-400 text-xs text-center">-</div>'}
                    </td>
                    <td class="text-center">
                        ${costoEnvio > 0 ? '<i class="fas fa-truck text-blue-500 text-xs" title="Tiene costo de envío gratis"></i>' : ''}
                    </td>
                    <td class="px-1 py-2 text-center text-xs font-medium text-orange-600">+${pctMarkup}%</td>
                    <td class="px-1 py-2 text-center">
                        <span class="px-1.5 py-0.5 rounded-full text-xs font-bold ${estadoColor}">${estadoTexto}</span>
                    </td>
                </tr>
            `;
        }).join('');

        // Actualizar contador
        document.getElementById('contador-seleccion').textContent = seleccionados.size;
    },

    // ============================================
    // TOGGLE SELECCIÓN
    // ============================================
    toggleSeleccion: (sku, checked) => {
        if (checked) {
            seleccionados.add(sku);
        } else {
            seleccionados.delete(sku);
        }
        document.getElementById('contador-seleccion').textContent = seleccionados.size;
    },

    toggleTodos: (checked) => {
        const checkboxes = document.querySelectorAll('#tabla-precios input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = checked;
            const sku = cb.getAttribute('onchange').match(/'([^']+)'/)?.[1];
            if (sku) {
                if (checked) {
                    seleccionados.add(sku);
                } else {
                    seleccionados.delete(sku);
                }
            }
        });
        document.getElementById('contador-seleccion').textContent = seleccionados.size;
    },

    // ============================================
    // CALCULAR COSTO DE ENVÍO según peso y precio
    // ============================================
    calcularCostoEnvio: (pesoGr, precio) => {
        // Si no hay configuración, retornar 0
        if (!configCostosEnvio || configCostosEnvio.length === 0) {
            return 0;
        }

        // Determinar si tiene descuento (precio >= umbral)
        const umbral = configUmbrales.umbral_envio_gratis || 33000;
        const tieneDescuento = precio >= umbral;

        // Usar peso por defecto si no hay dato
        const pesoEfectivo = pesoGr && pesoGr > 0
            ? pesoGr
            : (configUmbrales.peso_default_gr || 500);

        // Buscar costo según peso
        const rango = configCostosEnvio.find(r =>
            pesoEfectivo >= r.peso_desde_gr && pesoEfectivo < r.peso_hasta_gr
        );

        if (!rango) {
            // Si no encuentra rango, usar el último (más pesado)
            const ultimoRango = configCostosEnvio[configCostosEnvio.length - 1];
            return tieneDescuento
                ? parseFloat(ultimoRango.costo_con_descuento) || 0
                : parseFloat(ultimoRango.costo_sin_descuento) || 0;
        }

        return tieneDescuento
            ? parseFloat(rango.costo_con_descuento) || 0
            : parseFloat(rango.costo_sin_descuento) || 0;
    },

    // ============================================
    // CALCULAR COSTO FIJO según precio
    // ============================================
    calcularCostoFijo: (precio) => {
        // Si no hay configuración, retornar 0
        if (!configCostosFijos || configCostosFijos.length === 0) {
            return 0;
        }

        // Buscar costo según precio
        const rango = configCostosFijos.find(r =>
            precio >= r.precio_desde && precio < r.precio_hasta
        );

        return rango ? parseFloat(rango.costo_fijo) || 0 : 0;
    },

    // ============================================
    // REDONDEO PSICOLÓGICO AUTOMÁTICO
    // (Lógica exacta de GAS)
    // ============================================
    redondearPrecioPsicologico: (precio) => {
        // 1. Quitar decimales
        let entero = Math.round(precio);

        // 2. Obtener último dígito
        let ultimoDigito = entero % 10;
        let diferencia = 0;

        // 3. Forzar terminación en 3, 5, 7, 9 (siempre hacia arriba)
        if (ultimoDigito <= 3) {
            diferencia = 3 - ultimoDigito;  // 0,1,2,3 → 3
        } else if (ultimoDigito <= 5) {
            diferencia = 5 - ultimoDigito;  // 4,5 → 5
        } else if (ultimoDigito <= 7) {
            diferencia = 7 - ultimoDigito;  // 6,7 → 7
        } else {
            diferencia = 9 - ultimoDigito;  // 8,9 → 9
        }

        return entero + diferencia;
    },

    // ============================================
    // PREVISUALIZAR: Calcula nuevos precios sin guardar
    // ============================================
    previsualizar: () => {
        if (seleccionados.size === 0) {
            mostrarNotificacion('Selecciona al menos un producto', 'warning');
            return;
        }

        const tipo = document.getElementById('tipo-modificacion').value;
        const valor = parseFloat(document.getElementById('valor-modificacion').value);

        if (isNaN(valor) || valor === 0) {
            mostrarNotificacion('Ingresa un valor válido', 'warning');
            return;
        }

        // Guardar para registro de fallos
        tipoModificacionActual = tipo;
        valorModificacionActual = valor;

        let modificados = 0;

        productos.forEach(p => {
            if (seleccionados.has(p.sku)) {
                const precioBase = productosOriginales.find(o => o.sku === p.sku)?.precio || p.precio;
                let nuevoPrecio;

                if (tipo === 'porcentaje') {
                    nuevoPrecio = precioBase * (1 + valor / 100);
                } else {
                    nuevoPrecio = precioBase + valor;
                }

                // Aplicar redondeo psicológico automático
                p.precioNuevo = moduloPrecios.redondearPrecioPsicologico(nuevoPrecio);
                modificados++;
            }
        });

        moduloPrecios.pintarTabla();
        mostrarNotificacion(`${modificados} precios calculados con redondeo psicológico`, 'success');
    },

    // ============================================
    // RESETEAR: Vuelve a valores originales
    // ============================================
    resetear: () => {
        productos.forEach(p => {
            delete p.precioNuevo;
        });
        seleccionados.clear();
        document.getElementById('seleccionar-todos').checked = false;
        document.getElementById('valor-modificacion').value = '';
        moduloPrecios.pintarTabla();
        mostrarNotificacion('Cambios descartados', 'info');
    },

    // ============================================
    // GUARDAR EN ML: Envía cambios a Mercado Libre
    // ============================================
    guardarEnML: async () => {
        // Obtener productos con precios modificados
        const productosModificados = productos.filter(p => p.precioNuevo !== undefined);

        if (productosModificados.length === 0) {
            mostrarNotificacion('No hay precios modificados para guardar', 'warning');
            return;
        }

        const confirmar = await confirmarAccion(
            'Confirmar Cambio de Precios',
            `Vas a actualizar ${productosModificados.length} precios en Mercado Libre. Esta acción es inmediata y afectará tus publicaciones.`,
            'warning',
            'Sí, Actualizar'
        );

        if (!confirmar) return;

        const btn = document.getElementById('btn-guardar-ml');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        try {
            // Preparar datos para la Edge Function
            const productosParaActualizar = productosModificados.map(p => ({
                itemId: p.id_publicacion,
                sku: p.sku,
                titulo: p.titulo,
                precioAnterior: productosOriginales.find(o => o.sku === p.sku)?.precio || p.precio,
                nuevoPrecio: p.precioNuevo
            }));

            // Llamar Edge Function
            const { data, error } = await supabase.functions.invoke('sync-meli', {
                body: {
                    action: 'update-prices',
                    productos: productosParaActualizar
                }
            });

            if (error) throw error;

            const exitosos = data.exitos || 0;
            const fallidos = data.fallidos || [];

            // Marcar como resueltos los fallos previos de productos exitosos
            if (exitosos > 0) {
                const skusExitosos = productosParaActualizar
                    .filter(p => !fallidos.find(f => f.sku === p.sku))
                    .map(p => p.sku);

                if (skusExitosos.length > 0) {
                    await supabase
                        .from('precios_actualizacion_fallidas')
                        .update({ estado: 'resuelto', fecha_resolucion: new Date().toISOString() })
                        .in('sku', skusExitosos)
                        .eq('estado', 'pendiente');
                }
            }

            // Registrar los fallos en la tabla
            if (fallidos.length > 0) {
                const registrosFallos = fallidos.map(f => {
                    const prodInfo = productosParaActualizar.find(p => p.sku === f.sku);
                    return {
                        sku: f.sku,
                        id_publicacion: f.itemId || prodInfo?.itemId,
                        titulo: prodInfo?.titulo,
                        precio_anterior: prodInfo?.precioAnterior,
                        precio_nuevo: prodInfo?.nuevoPrecio,
                        tipo_modificacion: tipoModificacionActual,
                        valor_modificacion: valorModificacionActual,
                        error_mensaje: f.error,
                        estado: 'pendiente'
                    };
                });

                await supabase
                    .from('precios_actualizacion_fallidas')
                    .insert(registrosFallos);
            }

            // Actualizar estado local de productos exitosos
            productosModificados.forEach(p => {
                const fallo = fallidos.find(f => f.sku === p.sku);
                if (!fallo) {
                    const original = productosOriginales.find(o => o.sku === p.sku);
                    if (original) {
                        original.precio = p.precioNuevo;
                    }
                    p.precio = p.precioNuevo;
                }
                delete p.precioNuevo;
            });

            seleccionados.clear();

            // Mostrar resultado
            if (fallidos.length === 0) {
                mostrarNotificacion(`${exitosos} precios actualizados correctamente`, 'success');
                moduloPrecios.pintarTabla();
            } else {
                // Mostrar modal con productos fallidos
                moduloPrecios.mostrarModalFallos(exitosos, fallidos);
                // Recargar para actualizar badge de fallos
                await moduloPrecios.cargarProductos();
            }

        } catch (error) {
            console.error('Error guardando precios:', error);
            mostrarNotificacion('Error al guardar precios en ML', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Guardar en ML';
        }
    },

    // ============================================
    // MOSTRAR MODAL FALLOS: Muestra resumen de productos fallidos
    // ============================================
    mostrarModalFallos: (exitosos, fallidos) => {
        // Crear modal si no existe
        let modal = document.getElementById('modal-fallos-precios');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-fallos-precios';
            modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden">
                <div class="bg-red-600 text-white px-6 py-4">
                    <h3 class="text-lg font-bold flex items-center gap-2">
                        <i class="fas fa-exclamation-triangle"></i>
                        Actualización con Errores
                    </h3>
                </div>
                <div class="p-6">
                    <div class="mb-4 flex gap-4">
                        <div class="flex-1 bg-green-50 rounded-lg p-3 text-center">
                            <div class="text-2xl font-bold text-green-600">${exitosos}</div>
                            <div class="text-sm text-green-700">Exitosos</div>
                        </div>
                        <div class="flex-1 bg-red-50 rounded-lg p-3 text-center">
                            <div class="text-2xl font-bold text-red-600">${fallidos.length}</div>
                            <div class="text-sm text-red-700">Con Errores</div>
                        </div>
                    </div>

                    <div class="text-sm text-gray-600 mb-3">
                        Los siguientes productos no pudieron actualizarse:
                    </div>

                    <div class="max-h-64 overflow-y-auto border rounded-lg divide-y">
                        ${fallidos.map(f => `
                            <div class="p-3 hover:bg-gray-50">
                                <div class="font-medium text-gray-800">${f.sku}</div>
                                <div class="text-sm text-red-600">${f.error}</div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="mt-4 text-sm text-gray-500">
                        <i class="fas fa-info-circle mr-1"></i>
                        Estos productos quedan marcados para reintentar desde el listado.
                    </div>
                </div>
                <div class="px-6 py-4 bg-gray-50 flex justify-end gap-2">
                    <button onclick="moduloPrecios.cerrarModalFallos()"
                            class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                        Cerrar
                    </button>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    },

    // ============================================
    // CERRAR MODAL FALLOS
    // ============================================
    cerrarModalFallos: () => {
        const modal = document.getElementById('modal-fallos-precios');
        if (modal) modal.classList.add('hidden');
    },

    // ============================================
    // REINTENTAR FALLO: Reintenta actualizar un precio fallido
    // ============================================
    reintentarFallo: async (sku) => {
        const falloInfo = fallosPendientes[sku];
        if (!falloInfo) {
            mostrarNotificacion('No se encontró información del fallo', 'error');
            return;
        }

        const producto = productos.find(p => p.sku === sku);
        if (!producto) {
            mostrarNotificacion('Producto no encontrado', 'error');
            return;
        }

        const confirmar = await confirmarAccion(
            'Reintentar Actualización',
            `¿Reintentar actualizar "${sku}" a ${formatearMoneda(falloInfo.ultimoPrecio)}?`,
            'warning',
            'Sí, Reintentar'
        );

        if (!confirmar) return;

        mostrarNotificacion('Reintentando actualización...', 'info');

        try {
            const { data, error } = await supabase.functions.invoke('sync-meli', {
                body: {
                    action: 'update-prices',
                    productos: [{
                        itemId: producto.id_publicacion,
                        sku: sku,
                        precioAnterior: producto.precio,
                        nuevoPrecio: falloInfo.ultimoPrecio
                    }]
                }
            });

            if (error) throw error;

            if (data.exitos > 0) {
                // Marcar como resuelto
                await supabase
                    .from('precios_actualizacion_fallidas')
                    .update({ estado: 'resuelto', fecha_resolucion: new Date().toISOString() })
                    .eq('sku', sku)
                    .eq('estado', 'pendiente');

                mostrarNotificacion(`Precio de ${sku} actualizado correctamente`, 'success');

                // Recargar productos
                await moduloPrecios.cargarProductos();
            } else if (data.fallidos?.length > 0) {
                // Registrar nuevo fallo
                await supabase
                    .from('precios_actualizacion_fallidas')
                    .update({ estado: 'reintentado' })
                    .eq('sku', sku)
                    .eq('estado', 'pendiente');

                await supabase
                    .from('precios_actualizacion_fallidas')
                    .insert({
                        sku: sku,
                        id_publicacion: producto.id_publicacion,
                        titulo: producto.titulo,
                        precio_anterior: producto.precio,
                        precio_nuevo: falloInfo.ultimoPrecio,
                        tipo_modificacion: 'reintento',
                        valor_modificacion: 0,
                        error_mensaje: data.fallidos[0].error,
                        estado: 'pendiente'
                    });

                mostrarNotificacion(`Error al actualizar: ${data.fallidos[0].error}`, 'error');
                await moduloPrecios.cargarProductos();
            }

        } catch (error) {
            console.error('Error reintentando:', error);
            mostrarNotificacion('Error al reintentar actualización', 'error');
        }
    },

    // ============================================
    // DESCARTAR FALLO: Marca un fallo como descartado
    // ============================================
    descartarFallo: async (sku) => {
        const confirmar = await confirmarAccion(
            'Descartar Fallo',
            `¿Descartar el fallo pendiente de "${sku}"? El precio no se actualizará.`,
            'warning',
            'Sí, Descartar'
        );

        if (!confirmar) return;

        try {
            await supabase
                .from('precios_actualizacion_fallidas')
                .update({ estado: 'descartado' })
                .eq('sku', sku)
                .eq('estado', 'pendiente');

            mostrarNotificacion('Fallo descartado', 'info');
            await moduloPrecios.cargarProductos();

        } catch (error) {
            console.error('Error descartando fallo:', error);
            mostrarNotificacion('Error al descartar', 'error');
        }
    },

    // ============================================
    // LIMPIAR TODOS LOS FALLOS: Descarta todos los fallos pendientes
    // ============================================
    limpiarTodosFallos: async () => {
        const cantidadFallos = Object.keys(fallosPendientes).length;

        if (cantidadFallos === 0) {
            mostrarNotificacion('No hay fallos pendientes', 'info');
            return;
        }

        const confirmar = await confirmarAccion(
            'Limpiar Todos los Fallos',
            `¿Descartar los ${cantidadFallos} fallos pendientes? Los precios no se actualizarán en ML.`,
            'warning',
            'Sí, Limpiar Todo'
        );

        if (!confirmar) return;

        try {
            // Marcar todos los fallos pendientes como descartados
            const { error } = await supabase
                .from('precios_actualizacion_fallidas')
                .update({ estado: 'descartado' })
                .eq('estado', 'pendiente');

            if (error) throw error;

            mostrarNotificacion(`${cantidadFallos} fallos descartados`, 'success');

            // Limpiar filtro de fallos si estaba activo
            filtros.fallos = false;
            document.getElementById('btn-filtro-fallos')?.classList.remove('active');
            document.querySelectorAll('.btn-filtro-estado').forEach(b => b.classList.remove('active'));
            document.querySelector('.btn-filtro-estado[data-estado="todos"]')?.classList.add('active');

            // Recargar productos
            await moduloPrecios.cargarProductos();

        } catch (error) {
            console.error('Error limpiando fallos:', error);
            mostrarNotificacion('Error al limpiar fallos', 'error');
        }
    }
};

// Exponer en window para el HTML
window.moduloPrecios = moduloPrecios;
