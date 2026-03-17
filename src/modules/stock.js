// ============================================
// MODULO: Seguimiento de Stock
// ============================================
// Vista consolidada del inventario en Mercado Libre:
// - Stock en Full (bodega ML)
// - Stock en depósito (en tu poder) - EDITABLE
// - Indicador Flex
// - Estado: Activas / Pausadas
// ============================================

import { supabase, supabaseProduccion } from '../config.js';
import { mostrarNotificacion, formatearNumero } from '../utils.js';

// Estado local del modulo
let productos = [];
let productosOriginales = []; // Para detectar cambios
let filtros = {
    busqueda: '',
    logistica: 'todos',
    estado: 'todos'
};
let stockTallerMap = {}; // { sku: stock_actual }

export const moduloStock = {

    // ============================================
    // RENDER: Dibuja la interfaz
    // ============================================
    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">

                <!-- KPIs de Stock -->
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-medium text-gray-500">Stock Full</span>
                            <i class="fas fa-warehouse text-blue-500"></i>
                        </div>
                        <p class="text-2xl font-bold text-gray-800 mt-2" id="kpi-stock-full">-</p>
                        <p class="text-xs text-gray-500 mt-1">unidades en bodega ML</p>
                    </div>

                    <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-medium text-gray-500">Stock Depósito</span>
                            <i class="fas fa-box text-green-500"></i>
                        </div>
                        <p class="text-2xl font-bold text-gray-800 mt-2" id="kpi-stock-deposito">-</p>
                        <p class="text-xs text-gray-500 mt-1">unidades en tu poder</p>
                    </div>

                    <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-medium text-gray-500">En Tránsito</span>
                            <i class="fas fa-truck text-orange-500"></i>
                        </div>
                        <p class="text-2xl font-bold text-gray-800 mt-2" id="kpi-stock-transito">-</p>
                        <p class="text-xs text-gray-500 mt-1">hacia Full</p>
                    </div>

                    <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-medium text-gray-500">Stock Taller</span>
                            <i class="fas fa-industry text-purple-500"></i>
                        </div>
                        <p class="text-2xl font-bold text-gray-800 mt-2" id="kpi-stock-taller">-</p>
                        <p class="text-xs text-gray-500 mt-1">unidades en taller</p>
                    </div>

                    <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-medium text-gray-500">Publicaciones</span>
                            <i class="fas fa-tags text-indigo-500"></i>
                        </div>
                        <p class="text-2xl font-bold text-gray-800 mt-2" id="kpi-publicaciones">-</p>
                        <p class="text-xs text-gray-500 mt-1" id="kpi-publicaciones-detalle">activas / total</p>
                    </div>

                    <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-medium text-gray-500">Con Flex</span>
                            <i class="fas fa-bolt text-purple-500"></i>
                        </div>
                        <p class="text-2xl font-bold text-gray-800 mt-2" id="kpi-flex">-</p>
                        <p class="text-xs text-gray-500 mt-1">envío rápido activo</p>
                    </div>
                </div>

                <!-- Panel de Filtros -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-4">
                        <div class="flex flex-wrap items-center gap-4">
                            <!-- Búsqueda -->
                            <div class="relative">
                                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                                <input type="text" id="buscar-stock" placeholder="Buscar por SKU o título..."
                                       class="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent w-64">
                            </div>

                            <!-- Filtro Logística -->
                            <select id="filtro-logistica" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="todos">Toda logística</option>
                                <option value="fulfillment">Full</option>
                                <option value="flex">Con Flex</option>
                                <option value="otros">Otros</option>
                            </select>

                            <!-- Filtro Estado -->
                            <select id="filtro-estado" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="todos">Todos los estados</option>
                                <option value="active">Activas</option>
                                <option value="paused">Pausadas</option>
                            </select>
                        </div>

                        <div class="flex items-center gap-2">
                            <!-- Botón Previsualizar -->
                            <button onclick="moduloStock.previsualizarCambios()" id="btn-previsualizar"
                                    class="bg-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors flex items-center gap-2">
                                <i class="fas fa-eye"></i>
                                Ver Cambios
                            </button>

                            <!-- Botón Guardar -->
                            <button onclick="moduloStock.guardarCambios()" id="btn-guardar-stock"
                                    class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2">
                                <i class="fas fa-save" id="save-icon-stock"></i>
                                Guardar Cambios
                            </button>

                            <!-- Botón PDF Valorizado -->
                            <button onclick="moduloStock.generarPDFValorizado()"
                                    class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2">
                                <i class="fas fa-file-pdf"></i>
                                PDF Valorizado
                            </button>

                            <!-- Botón Sincronizar -->
                            <button onclick="moduloStock.sincronizar()" id="btn-sync-stock"
                                    class="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors flex items-center gap-2">
                                <i class="fas fa-sync-alt" id="sync-icon-stock"></i>
                                Sincronizar
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Tabla de Stock -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full" style="table-layout:fixed">
                            <colgroup>
                                <col style="width:140px">
                                <col style="width:auto">
                                <col style="width:110px">
                                <col style="width:90px">
                                <col style="width:90px">
                                <col style="width:80px">
                                <col style="width:60px">
                                <col style="width:110px">
                            </colgroup>
                            <thead class="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th class="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">SKU</th>
                                    <th class="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Producto</th>
                                    <th class="px-2 py-3 text-right text-xs font-bold text-gray-500 uppercase">Stock Depósito</th>
                                    <th class="px-2 py-3 text-right text-xs font-bold text-gray-500 uppercase">Stock Full</th>
                                    <th class="px-2 py-3 text-right text-xs font-bold text-gray-500 uppercase">Stock Taller</th>
                                    <th class="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase">Logística</th>
                                    <th class="px-1 py-3 text-center text-xs font-bold text-gray-500 uppercase">Flex</th>
                                    <th class="px-2 pr-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Estado</th>
                                </tr>
                            </thead>
                            <tbody id="tabla-stock" class="divide-y divide-gray-100">
                                <tr>
                                    <td colspan="8" class="px-4 py-12 text-center text-gray-500">
                                        <i class="fas fa-spinner fa-spin fa-2x mb-2"></i>
                                        <p>Cargando inventario...</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            <!-- Modal Previsualizar Cambios -->
            <div id="modal-cambios" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50">
                <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
                    <div class="p-4 border-b border-gray-200 flex justify-between items-center">
                        <h3 class="text-lg font-bold text-gray-800">Cambios Pendientes</h3>
                        <button onclick="moduloStock.cerrarModal()" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="p-4 overflow-y-auto max-h-[60vh]" id="lista-cambios">
                        <!-- Contenido dinámico -->
                    </div>
                    <div class="p-4 border-t border-gray-200 flex justify-end gap-2">
                        <button onclick="moduloStock.cerrarModal()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                            Cancelar
                        </button>
                        <button onclick="moduloStock.confirmarGuardado()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                            Confirmar y Guardar
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Resetear filtros al entrar a la vista
        filtros.busqueda = '';
        filtros.logistica = 'todos';
        filtros.estado = 'todos';

        // Configurar eventos
        document.getElementById('buscar-stock').addEventListener('input', (e) => {
            filtros.busqueda = e.target.value.toLowerCase();
            moduloStock.pintarTabla();
        });

        document.getElementById('filtro-logistica').addEventListener('change', (e) => {
            filtros.logistica = e.target.value;
            moduloStock.pintarTabla();
        });

        document.getElementById('filtro-estado').addEventListener('change', (e) => {
            filtros.estado = e.target.value;
            moduloStock.pintarTabla();
        });

        // Exponer en window para eventos onclick
        window.moduloStock = moduloStock;

        // Cargar datos
        await moduloStock.cargarDatos();
    },

    // ============================================
    // CARGAR DATOS: Obtiene productos de Supabase
    // ============================================
    cargarDatos: async () => {
        try {
            const { data, error } = await supabase
                .from('publicaciones_meli')
                .select('id_publicacion, sku, titulo, precio, comision_ml, cargo_fijo_ml, impuestos_estimados, neto_estimado, stock_full, stock_deposito, stock_transito, tipo_logistica, tiene_flex, estado, user_product_id')
                .not('sku', 'is', null)
                .order('titulo');

            if (error) throw error;

            productos = data || [];

            // --- Stock Taller desde Producción ---
            const skusStock = productos.map(p => p.sku).filter(Boolean);
            stockTallerMap = {};
            if (skusStock.length > 0) {
                const { data: stData } = await supabaseProduccion
                    .from('productos')
                    .select('sku, stock_actual')
                    .in('sku', skusStock)
                    .eq('tipo', 'Pack');
                if (stData) {
                    stData.forEach(p => {
                        stockTallerMap[p.sku] = Math.round(p.stock_actual ?? 0);
                    });
                }
            }
            productos.forEach(p => {
                p.stock_taller = stockTallerMap[p.sku] ?? null;
            });

            // Guardar copia original para detectar cambios
            productosOriginales = JSON.parse(JSON.stringify(productos));

            moduloStock.calcularKPIs();
            moduloStock.pintarTabla();

        } catch (error) {
            console.error('Error cargando stock:', error);
            mostrarNotificacion('Error al cargar datos de stock', 'error');
        }
    },

    // ============================================
    // CALCULAR KPIs: Resume métricas de stock
    // ============================================
    calcularKPIs: () => {
        const stockFull = productos.reduce((sum, p) => sum + (parseInt(p.stock_full) || 0), 0);
        const stockDeposito = productos.reduce((sum, p) => sum + (parseInt(p.stock_deposito) || 0), 0);
        const stockTransito = productos.reduce((sum, p) => sum + (parseInt(p.stock_transito) || 0), 0);
        const stockTaller = productos.reduce((sum, p) => sum + (p.stock_taller || 0), 0);
        const activas = productos.filter(p => p.estado === 'active').length;
        const total = productos.length;
        const conFlex = productos.filter(p => p.tiene_flex === true).length;

        document.getElementById('kpi-stock-full').textContent = formatearNumero(stockFull);
        document.getElementById('kpi-stock-deposito').textContent = formatearNumero(stockDeposito);
        document.getElementById('kpi-stock-transito').textContent = formatearNumero(stockTransito);
        document.getElementById('kpi-stock-taller').textContent = formatearNumero(stockTaller);
        document.getElementById('kpi-publicaciones').textContent = `${activas} / ${total}`;
        document.getElementById('kpi-publicaciones-detalle').textContent = 'activas / total';
        document.getElementById('kpi-flex').textContent = formatearNumero(conFlex);
    },

    // ============================================
    // PINTAR TABLA: Renderiza productos filtrados
    // ============================================
    pintarTabla: () => {
        const tbody = document.getElementById('tabla-stock');

        // Aplicar filtros
        let productosFiltrados = productos.filter(p => {
            const matchBusqueda = !filtros.busqueda ||
                (p.sku || '').toLowerCase().includes(filtros.busqueda) ||
                (p.titulo || '').toLowerCase().includes(filtros.busqueda);

            let matchLogistica = true;
            if (filtros.logistica === 'fulfillment') {
                matchLogistica = p.tipo_logistica === 'fulfillment';
            } else if (filtros.logistica === 'flex') {
                matchLogistica = p.tiene_flex === true;
            } else if (filtros.logistica === 'otros') {
                matchLogistica = p.tipo_logistica !== 'fulfillment' && p.tiene_flex !== true;
            }

            const matchEstado = filtros.estado === 'todos' || p.estado === filtros.estado;

            return matchBusqueda && matchLogistica && matchEstado;
        });

        if (productosFiltrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-4 py-12 text-center text-gray-500">
                        <i class="fas fa-inbox fa-2x mb-2"></i>
                        <p>No se encontraron productos</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = productosFiltrados.map(p => {
            const stockFull = parseInt(p.stock_full) || 0;
            const stockDeposito = parseInt(p.stock_deposito) || 0;
            const esFull = p.tipo_logistica === 'fulfillment';

            // Colores según tipo logística
            let logisticaColor = 'bg-gray-100 text-gray-800';
            let logisticaTexto = p.tipo_logistica || '-';
            if (p.tipo_logistica === 'fulfillment') {
                logisticaColor = 'bg-blue-100 text-blue-800';
                logisticaTexto = 'Full';
            } else if (p.tipo_logistica === 'cross_docking') {
                logisticaColor = 'bg-purple-100 text-purple-800';
                logisticaTexto = 'Cross';
            }

            // Color según estado
            const estadoColor = p.estado === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
            const estadoTexto = p.estado === 'active' ? 'Activa' : 'Pausada';

            // Stock crítico si es 0 y está activo
            const stockCritico = (stockFull + stockDeposito) === 0 && p.estado === 'active';

            // Flex badge
            const flexBadge = p.tiene_flex
                ? '<span class="px-2 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800"><i class="fas fa-bolt mr-1"></i>Sí</span>'
                : '<span class="px-2 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">No</span>';

            // Checkbox para Flex (deshabilitado si es Full-Only sin Flex actualmente)
            const flexDisabled = esFull && !p.tiene_flex;
            const flexChecked = p.tiene_flex ? 'checked' : '';

            return `
                <tr class="hover:bg-gray-50 transition-colors" data-item-id="${p.id_publicacion}">
                    <td class="px-3 py-2 font-mono text-xs text-gray-600 truncate">${p.sku || '-'}</td>
                    <td class="px-3 py-2">
                        <div class="truncate text-sm" title="${(p.titulo || '').replace(/"/g, '&quot;')}">${p.titulo || '-'}</div>
                    </td>
                    <td class="px-2 py-2 text-right">
                        <input type="number"
                               class="stock-deposito-input w-full px-2 py-1 text-right text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand focus:border-transparent"
                               value="${stockDeposito}"
                               data-item-id="${p.id_publicacion}"
                               data-original="${stockDeposito}"
                               min="0">
                    </td>
                    <td class="px-2 py-2 text-right text-sm font-medium ${stockCritico ? 'text-red-600' : 'text-gray-800'}">
                        ${formatearNumero(stockFull)}
                        ${stockCritico ? '<i class="fas fa-exclamation-triangle text-red-500 ml-1" title="Sin stock"></i>' : ''}
                    </td>
                    <td class="px-2 py-2 text-right text-sm ${(p.stock_taller || 0) > 0 ? 'text-purple-600 font-medium' : 'text-gray-400'}">
                        ${p.stock_taller != null ? formatearNumero(p.stock_taller) : '-'}
                    </td>
                    <td class="px-2 py-2 text-center">
                        <span class="px-1.5 py-0.5 rounded-full text-xs font-bold ${logisticaColor}">${logisticaTexto}</span>
                    </td>
                    <td class="px-1 py-2 text-center">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox"
                                   class="flex-toggle sr-only peer"
                                   data-item-id="${p.id_publicacion}"
                                   data-original="${p.tiene_flex}"
                                   ${flexChecked}
                                   ${flexDisabled ? 'disabled' : ''}>
                            <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 ${flexDisabled ? 'opacity-50 cursor-not-allowed' : ''}"></div>
                        </label>
                    </td>
                    <td class="px-2 pr-4 py-2 text-center">
                        <select class="estado-select border border-gray-300 rounded px-1 py-1 text-xs ${estadoColor}"
                                data-item-id="${p.id_publicacion}"
                                data-original="${p.estado}">
                            <option value="active" ${p.estado === 'active' ? 'selected' : ''}>Activa</option>
                            <option value="paused" ${p.estado === 'paused' ? 'selected' : ''}>Pausada</option>
                        </select>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // ============================================
    // OBTENER CAMBIOS: Detecta qué ha cambiado
    // ============================================
    obtenerCambios: () => {
        const cambios = [];
        const filas = document.querySelectorAll('#tabla-stock tr[data-item-id]');

        filas.forEach(fila => {
            const itemId = fila.dataset.itemId;
            const producto = productos.find(p => p.id_publicacion === itemId);
            const productoOriginal = productosOriginales.find(p => p.id_publicacion === itemId);

            if (!producto || !productoOriginal) return;

            const inputStock = fila.querySelector('.stock-deposito-input');
            const checkFlex = fila.querySelector('.flex-toggle');
            const selectEstado = fila.querySelector('.estado-select');

            const nuevoStock = parseInt(inputStock?.value) || 0;
            const nuevoFlex = checkFlex?.checked || false;
            const nuevoEstado = selectEstado?.value || 'active';

            const stockCambiado = nuevoStock !== (parseInt(productoOriginal.stock_deposito) || 0);
            const flexCambiado = nuevoFlex !== (productoOriginal.tiene_flex || false);
            const estadoCambiado = nuevoEstado !== productoOriginal.estado;

            if (stockCambiado || flexCambiado || estadoCambiado) {
                cambios.push({
                    itemId: itemId,
                    sku: producto.sku || '-',
                    titulo: producto.titulo || '-',
                    userProductId: producto.user_product_id,
                    stockCambiado,
                    stockOriginal: parseInt(productoOriginal.stock_deposito) || 0,
                    nuevoStock,
                    flexCambiado,
                    flexOriginal: productoOriginal.tiene_flex || false,
                    nuevoFlex,
                    estadoCambiado,
                    estadoOriginal: productoOriginal.estado,
                    nuevoEstado
                });
            }
        });

        return cambios;
    },

    // ============================================
    // PREVISUALIZAR CAMBIOS: Muestra modal con cambios
    // ============================================
    previsualizarCambios: () => {
        const cambios = moduloStock.obtenerCambios();

        if (cambios.length === 0) {
            mostrarNotificacion('No hay cambios pendientes', 'info');
            return;
        }

        const listaCambios = document.getElementById('lista-cambios');
        listaCambios.innerHTML = `
            <p class="text-sm text-gray-600 mb-4">Se encontraron <strong>${cambios.length}</strong> producto(s) con cambios:</p>
            <div class="space-y-3">
                ${cambios.map(c => `
                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p class="font-medium text-gray-800">${c.sku} - ${c.titulo}</p>
                        <div class="mt-2 text-sm text-gray-600 space-y-1">
                            ${c.stockCambiado ? `<p><i class="fas fa-box text-green-500 mr-2"></i>Stock: ${c.stockOriginal} → <strong>${c.nuevoStock}</strong></p>` : ''}
                            ${c.flexCambiado ? `<p><i class="fas fa-bolt text-purple-500 mr-2"></i>Flex: ${c.flexOriginal ? 'Sí' : 'No'} → <strong>${c.nuevoFlex ? 'Sí' : 'No'}</strong></p>` : ''}
                            ${c.estadoCambiado ? `<p><i class="fas fa-toggle-on text-blue-500 mr-2"></i>Estado: ${c.estadoOriginal} → <strong>${c.nuevoEstado}</strong></p>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        document.getElementById('modal-cambios').classList.remove('hidden');
        document.getElementById('modal-cambios').classList.add('flex');
    },

    // ============================================
    // CERRAR MODAL
    // ============================================
    cerrarModal: () => {
        document.getElementById('modal-cambios').classList.add('hidden');
        document.getElementById('modal-cambios').classList.remove('flex');
    },

    // ============================================
    // GUARDAR CAMBIOS: Muestra previsualización
    // ============================================
    guardarCambios: () => {
        moduloStock.previsualizarCambios();
    },

    // ============================================
    // CONFIRMAR GUARDADO: Envía cambios a ML
    // ============================================
    confirmarGuardado: async () => {
        const cambios = moduloStock.obtenerCambios();

        if (cambios.length === 0) {
            mostrarNotificacion('No hay cambios para guardar', 'info');
            moduloStock.cerrarModal();
            return;
        }

        const btn = document.getElementById('btn-guardar-stock');
        const icon = document.getElementById('save-icon-stock');

        try {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            icon.classList.remove('fa-save');
            icon.classList.add('fa-spinner', 'fa-spin');

            moduloStock.cerrarModal();
            mostrarNotificacion(`Guardando ${cambios.length} cambio(s) en Mercado Libre...`, 'info');

            // Preparar payload para la Edge Function
            const cambiosParaEnviar = cambios.map(c => ({
                itemId: c.itemId,
                sku: c.sku,
                userProductId: c.userProductId,
                stockCambiado: c.stockCambiado,
                nuevoStock: c.nuevoStock,
                flexCambiado: c.flexCambiado,
                nuevoFlex: c.nuevoFlex,
                estadoCambiado: c.estadoCambiado,
                nuevoEstado: c.nuevoEstado
            }));

            const { data, error } = await supabase.functions.invoke('sync-meli', {
                body: { action: 'update-stock', cambiosStock: cambiosParaEnviar }
            });

            if (error) throw error;

            if (data.fallidos && data.fallidos.length > 0) {
                mostrarNotificacion(`${data.exitos} actualizados, ${data.fallidos.length} fallaron`, 'warning');
                console.error('Fallos:', data.fallidos);
            } else {
                mostrarNotificacion(`${data.exitos} producto(s) actualizados correctamente`, 'success');
            }

            // Recargar datos
            await moduloStock.cargarDatos();

        } catch (error) {
            console.error('Error guardando cambios:', error);
            mostrarNotificacion('Error al guardar cambios en ML', 'error');
        } finally {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            icon.classList.remove('fa-spinner', 'fa-spin');
            icon.classList.add('fa-save');
        }
    },

    // ============================================
    // SINCRONIZAR: Actualiza stock desde ML
    // ============================================
    // ============================================
    // PDF VALORIZADO: Genera reporte de stock con valor neto
    // ============================================
    generarPDFValorizado: () => {
        // Filtrar productos con stock > 0 y precio
        const productosConStock = productos.filter(p => {
            const stockTotal = (parseInt(p.stock_full) || 0) + (parseInt(p.stock_deposito) || 0);
            return stockTotal > 0 && (parseFloat(p.precio) || 0) > 0;
        });

        if (productosConStock.length === 0) {
            mostrarNotificacion('No hay productos con stock y precio para valorizar', 'warning');
            return;
        }

        // Calcular valores
        const lineas = productosConStock.map(p => {
            const stockFull = parseInt(p.stock_full) || 0;
            const stockDeposito = parseInt(p.stock_deposito) || 0;
            const stockTransito = parseInt(p.stock_transito) || 0;
            const stockTotal = stockFull + stockDeposito;
            const precioML = parseFloat(p.precio) || 0;
            const comision = parseFloat(p.comision_ml) || 0;
            const cargoFijo = parseFloat(p.cargo_fijo_ml) || 0;
            const impuestos = parseFloat(p.impuestos_estimados) || 0;
            // Neto = precio - comisión - cargo fijo - impuestos (mismo cálculo que módulo Precios)
            const precioNeto = (parseFloat(p.neto_estimado) || 0) > 0
                ? parseFloat(p.neto_estimado)
                : precioML - comision - cargoFijo - impuestos;
            const valorNeto = precioNeto * stockTotal;
            return { ...p, stockFull, stockDeposito, stockTransito, stockTotal, precioML, precioNeto, valorNeto };
        }).sort((a, b) => b.valorNeto - a.valorNeto);

        const totalValor = lineas.reduce((sum, l) => sum + l.valorNeto, 0);
        const totalUnidades = lineas.reduce((sum, l) => sum + l.stockTotal, 0);
        const totalTransito = lineas.reduce((sum, l) => sum + l.stockTransito, 0);

        const fmt = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmtInt = (n) => n.toLocaleString('es-AR');
        const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        const ventana = window.open('', '_blank');
        ventana.document.write(`<!DOCTYPE html>
<html><head>
<title>Stock Valorizado - ${fecha}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #333; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 2px solid #1a56db; padding-bottom: 12px; }
    .header h1 { font-size: 18px; color: #1a56db; }
    .header .fecha { font-size: 11px; color: #666; text-align: right; }
    .kpis { display: flex; gap: 20px; margin-bottom: 16px; }
    .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 16px; }
    .kpi .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi .value { font-size: 16px; font-weight: 700; color: #1e293b; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .total-row { background: #1a56db !important; color: white; font-weight: 700; }
    .total-row td { border: none; padding: 8px; }
    .titulo { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nota { margin-top: 12px; font-size: 10px; color: #94a3b8; }
    @media print { body { padding: 10px; } }
</style>
</head><body>
<div class="header">
    <div>
        <h1>Stock Valorizado - Mercado Libre</h1>
        <p style="color:#64748b; margin-top:4px;">Neto = Precio ML - Comisión ML - Cargo Fijo - Impuestos</p>
    </div>
    <div class="fecha">${fecha}</div>
</div>
<div class="kpis">
    <div class="kpi">
        <div class="label">Productos</div>
        <div class="value">${lineas.length}</div>
    </div>
    <div class="kpi">
        <div class="label">Unidades Totales</div>
        <div class="value">${fmtInt(totalUnidades)}</div>
    </div>
    <div class="kpi">
        <div class="label">Valor Neto Total</div>
        <div class="value" style="color:#16a34a">$ ${fmt(totalValor)}</div>
    </div>
</div>
<table>
    <thead>
        <tr>
            <th>SKU</th>
            <th>Producto</th>
            <th class="num">Full</th>
            <th class="num">Depósito</th>
            <th class="num">Tránsito</th>
            <th class="num">Total</th>
            <th class="num">Precio ML</th>
            <th class="num">Neto ML</th>
            <th class="num">Valor Neto Stock</th>
        </tr>
    </thead>
    <tbody>
        ${lineas.map(l => `
        <tr>
            <td style="font-family:monospace; font-size:10px;">${l.sku || '-'}</td>
            <td class="titulo" title="${(l.titulo || '').replace(/"/g, '&quot;')}">${l.titulo || '-'}</td>
            <td class="num">${fmtInt(l.stockFull)}</td>
            <td class="num">${fmtInt(l.stockDeposito)}</td>
            <td class="num">${l.stockTransito > 0 ? fmtInt(l.stockTransito) : '-'}</td>
            <td class="num" style="font-weight:600">${fmtInt(l.stockTotal)}</td>
            <td class="num">$ ${fmt(l.precioML)}</td>
            <td class="num">$ ${fmt(l.precioNeto)}</td>
            <td class="num" style="font-weight:600">$ ${fmt(l.valorNeto)}</td>
        </tr>`).join('')}
        <tr class="total-row">
            <td colspan="4" style="text-align:right">TOTAL</td>
            <td class="num">${fmtInt(totalTransito)}</td>
            <td class="num">${fmtInt(totalUnidades)}</td>
            <td colspan="2"></td>
            <td class="num">$ ${fmt(totalValor)}</td>
        </tr>
    </tbody>
</table>
<p class="nota">* Valor estimado de posible ingreso neto. Neto ML = Precio - Comisión - Cargo Fijo - Impuestos. No incluye costo de envío gratis ni costos operativos propios.</p>
<div class="no-print" style="margin-top:16px; text-align:center;">
    <button onclick="window.print()" style="padding:8px 24px; background:#1a56db; color:white; border:none; border-radius:6px; font-size:13px; cursor:pointer;">Imprimir / Guardar PDF</button>
</div>
<style>@media print { .no-print { display: none !important; } }</style>
</body></html>`);
        ventana.document.close();
    },

    sincronizar: async () => {
        const btn = document.getElementById('btn-sync-stock');
        const icon = document.getElementById('sync-icon-stock');

        if (!btn || btn.disabled) return;

        try {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            icon.classList.add('fa-spin');

            mostrarNotificacion('Sincronizando stock desde Mercado Libre...', 'info');

            const { data, error } = await supabase.functions.invoke('sync-meli', {
                body: { action: 'sync-inventory' }
            });

            if (error) throw error;

            const updated = data?.updated || 0;
            mostrarNotificacion(`Stock sincronizado: ${updated} productos actualizados`, 'success');

            // Recargar datos
            await moduloStock.cargarDatos();

        } catch (error) {
            console.error('Error sincronizando stock:', error);
            mostrarNotificacion('Error al sincronizar stock', 'error');
        } finally {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            icon.classList.remove('fa-spin');
        }
    }
};

// Exponer en window para el HTML
window.moduloStock = moduloStock;
