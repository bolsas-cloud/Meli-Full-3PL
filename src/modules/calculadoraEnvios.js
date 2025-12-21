// ============================================
// MÓDULO: Calculadora de Envíos a Full
// ============================================
// Calcula qué productos y cantidades enviar a las
// bodegas de Mercado Libre Fulfillment
// ============================================

import { supabase } from '../config.js';
import { mostrarNotificacion, formatearMoneda, colorRiesgo, generarId } from '../utils.js';

// Estado local del módulo
let sugerencias = [];
let configLogistica = {};
let productosSeleccionados = new Set();

export const moduloCalculadora = {

    // ============================================
    // RENDER: Dibuja la interfaz
    // ============================================
    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">

                <!-- Panel de Configuración -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <i class="fas fa-sliders-h text-brand-blue"></i>
                        Parámetros de Cálculo
                    </h3>

                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Tiempo Tránsito (días)
                                <i class="fas fa-info-circle text-gray-400 ml-1" title="Días que tarda el envío en llegar a Full"></i>
                            </label>
                            <input type="number" id="param-transito" value="3" min="1" max="15"
                                   class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-blue focus:border-transparent">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Frecuencia Envío (días)
                                <i class="fas fa-info-circle text-gray-400 ml-1" title="Cada cuántos días envías a Full"></i>
                            </label>
                            <input type="number" id="param-frecuencia" value="7" min="1" max="30"
                                   class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-blue focus:border-transparent">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Nivel de Servicio
                                <i class="fas fa-info-circle text-gray-400 ml-1" title="Confiabilidad del stock de seguridad"></i>
                            </label>
                            <select id="param-servicio"
                                    class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-blue focus:border-transparent">
                                <option value="1.28">90% - Relajado</option>
                                <option value="1.65" selected>95% - Estándar</option>
                                <option value="2.33">99% - Conservador</option>
                            </select>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Incremento Evento (%)
                                <i class="fas fa-info-circle text-gray-400 ml-1" title="Incremento por evento especial próximo"></i>
                            </label>
                            <input type="number" id="param-evento" value="0" min="0" max="200"
                                   class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-blue focus:border-transparent">
                        </div>
                    </div>

                    <div class="mt-4 flex gap-3">
                        <button onclick="moduloCalculadora.calcular()"
                                class="bg-brand-blue text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center gap-2">
                            <i class="fas fa-calculator"></i>
                            Calcular Sugerencias
                        </button>
                        <button onclick="moduloCalculadora.guardarConfig()"
                                class="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors">
                            <i class="fas fa-save"></i>
                            Guardar Config
                        </button>
                    </div>
                </div>

                <!-- Resumen Rápido -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4" id="resumen-cards">
                    <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <p class="text-xs font-bold text-gray-400 uppercase">Total SKUs</p>
                        <p class="text-2xl font-bold text-gray-800" id="stat-total">-</p>
                    </div>
                    <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-red-500">
                        <p class="text-xs font-bold text-gray-400 uppercase">Críticos</p>
                        <p class="text-2xl font-bold text-red-600" id="stat-criticos">-</p>
                    </div>
                    <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-yellow-500">
                        <p class="text-xs font-bold text-gray-400 uppercase">Stock Bajo</p>
                        <p class="text-2xl font-bold text-yellow-600" id="stat-bajos">-</p>
                    </div>
                    <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500">
                        <p class="text-xs font-bold text-gray-400 uppercase">OK</p>
                        <p class="text-2xl font-bold text-green-600" id="stat-ok">-</p>
                    </div>
                </div>

                <!-- Tabla de Sugerencias -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div class="p-4 border-b border-gray-100 flex justify-between items-center">
                        <h3 class="font-bold text-gray-800">Sugerencias de Envío</h3>
                        <div class="flex gap-2">
                            <button onclick="moduloCalculadora.seleccionarCriticos()"
                                    class="text-sm bg-red-50 text-red-700 px-3 py-1 rounded-lg hover:bg-red-100 transition-colors">
                                Seleccionar Críticos
                            </button>
                            <button onclick="moduloCalculadora.registrarEnvio()"
                                    class="text-sm bg-brand-blue text-white px-4 py-1 rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
                                    id="btn-registrar" disabled>
                                <i class="fas fa-truck"></i>
                                Registrar Envío
                            </button>
                        </div>
                    </div>

                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-100">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                                        <input type="checkbox" id="check-all" onchange="moduloCalculadora.toggleAll(this)">
                                    </th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">SKU</th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Producto</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Ventas/Día</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Stock Full</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">En Tránsito</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Días Cobertura</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Cantidad a Enviar</th>
                                    <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Riesgo</th>
                                </tr>
                            </thead>
                            <tbody id="tabla-sugerencias" class="divide-y divide-gray-100 text-sm">
                                <tr>
                                    <td colspan="9" class="px-4 py-8 text-center text-gray-400">
                                        <i class="fas fa-calculator fa-2x mb-2"></i>
                                        <p>Haz clic en "Calcular Sugerencias" para ver los resultados</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        `;

        // Cargar configuración guardada
        await moduloCalculadora.cargarConfig();

        // Exponer módulo en window
        window.moduloCalculadora = moduloCalculadora;
    },

    // ============================================
    // CARGAR: Configuración desde Supabase
    // ============================================
    cargarConfig: async () => {
        try {
            const { data, error } = await supabase
                .from('config_logistica')
                .select('*');

            if (error) throw error;

            // Convertir a objeto
            data.forEach(row => {
                configLogistica[row.parametro] = row.valor;
            });

            // Aplicar a los inputs
            if (configLogistica.tiempoTransito) {
                document.getElementById('param-transito').value = configLogistica.tiempoTransito;
            }
            if (configLogistica.frecuenciaEnvio) {
                document.getElementById('param-frecuencia').value = configLogistica.frecuenciaEnvio;
            }
            if (configLogistica.nivelServicioZ) {
                document.getElementById('param-servicio').value = configLogistica.nivelServicioZ;
            }
            if (configLogistica.incrementoEvento) {
                document.getElementById('param-evento').value = configLogistica.incrementoEvento;
            }

            console.log('Configuración cargada:', configLogistica);

        } catch (error) {
            console.error('Error cargando configuración:', error);
        }
    },

    // ============================================
    // GUARDAR: Configuración en Supabase
    // ============================================
    guardarConfig: async () => {
        try {
            const params = [
                { parametro: 'tiempoTransito', valor: document.getElementById('param-transito').value },
                { parametro: 'frecuenciaEnvio', valor: document.getElementById('param-frecuencia').value },
                { parametro: 'nivelServicioZ', valor: document.getElementById('param-servicio').value },
                { parametro: 'incrementoEvento', valor: document.getElementById('param-evento').value }
            ];

            for (const param of params) {
                const { error } = await supabase
                    .from('config_logistica')
                    .upsert(param, { onConflict: 'parametro' });

                if (error) throw error;
            }

            mostrarNotificacion('Configuración guardada', 'success');

        } catch (error) {
            console.error('Error guardando configuración:', error);
            mostrarNotificacion('Error al guardar configuración', 'error');
        }
    },

    // ============================================
    // CALCULAR: Sugerencias de envío
    // ============================================
    calcular: async () => {
        const tbody = document.getElementById('tabla-sugerencias');
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="px-4 py-8 text-center text-gray-400">
                    <i class="fas fa-circle-notch fa-spin fa-2x mb-2"></i>
                    <p>Calculando sugerencias...</p>
                </td>
            </tr>
        `;

        try {
            // Leer parámetros
            const Tt = parseFloat(document.getElementById('param-transito').value) || 3;
            const Fe = parseFloat(document.getElementById('param-frecuencia').value) || 7;
            const Z = parseFloat(document.getElementById('param-servicio').value) || 1.65;
            const incremento = parseFloat(document.getElementById('param-evento').value) || 0;

            // Obtener datos de sugerencias (si ya existen calculados)
            // Por ahora usamos datos de ejemplo hasta integrar con API de ML
            const { data: dataSugerencias, error } = await supabase
                .from('sugerencias_envio_full')
                .select('*')
                .order('nivel_riesgo', { ascending: true });

            if (error) throw error;

            if (!dataSugerencias || dataSugerencias.length === 0) {
                // Datos de demo si no hay datos reales
                sugerencias = moduloCalculadora.generarDatosDemo(Tt, Fe, Z, incremento);
            } else {
                sugerencias = dataSugerencias;
            }

            // Pintar tabla
            moduloCalculadora.pintarTabla();

            // Actualizar estadísticas
            moduloCalculadora.actualizarStats();

        } catch (error) {
            console.error('Error calculando:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="px-4 py-8 text-center text-red-500">
                        <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                        <p>Error al calcular: ${error.message}</p>
                    </td>
                </tr>
            `;
        }
    },

    // ============================================
    // PINTAR: Tabla de sugerencias
    // ============================================
    pintarTabla: () => {
        const tbody = document.getElementById('tabla-sugerencias');

        if (sugerencias.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="px-4 py-8 text-center text-gray-400">
                        <p>No hay sugerencias disponibles</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sugerencias.map(s => `
            <tr class="hover:bg-gray-50 transition-colors ${productosSeleccionados.has(s.sku) ? 'bg-blue-50' : ''}">
                <td class="px-4 py-3">
                    <input type="checkbox"
                           ${productosSeleccionados.has(s.sku) ? 'checked' : ''}
                           onchange="moduloCalculadora.toggleSeleccion('${s.sku}')">
                </td>
                <td class="px-4 py-3 font-mono text-xs text-gray-600">${s.sku}</td>
                <td class="px-4 py-3">
                    <div class="max-w-xs truncate" title="${s.titulo}">${s.titulo || '-'}</div>
                </td>
                <td class="px-4 py-3 text-right font-medium">${(s.ventas_dia || 0).toFixed(2)}</td>
                <td class="px-4 py-3 text-right">${s.stock_actual_full || 0}</td>
                <td class="px-4 py-3 text-right text-gray-500">${s.stock_en_transito || 0}</td>
                <td class="px-4 py-3 text-right">
                    <span class="${(s.dias_cobertura || 0) < 3 ? 'text-red-600 font-bold' : ''}">${(s.dias_cobertura || 0).toFixed(1)}</span>
                </td>
                <td class="px-4 py-3 text-right">
                    <input type="number"
                           value="${s.cantidad_a_enviar || 0}"
                           min="0"
                           class="w-20 text-right border border-gray-300 rounded px-2 py-1"
                           onchange="moduloCalculadora.actualizarCantidad('${s.sku}', this.value)">
                </td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${colorRiesgo(s.nivel_riesgo)}">
                        ${s.nivel_riesgo || 'N/A'}
                    </span>
                </td>
            </tr>
        `).join('');
    },

    // ============================================
    // ACTUALIZAR: Estadísticas del panel
    // ============================================
    actualizarStats: () => {
        const total = sugerencias.length;
        const criticos = sugerencias.filter(s => s.nivel_riesgo === 'CRÍTICO').length;
        const bajos = sugerencias.filter(s => s.nivel_riesgo === 'BAJO').length;
        const ok = sugerencias.filter(s => s.nivel_riesgo === 'OK').length;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-criticos').textContent = criticos;
        document.getElementById('stat-bajos').textContent = bajos;
        document.getElementById('stat-ok').textContent = ok;
    },

    // ============================================
    // SELECCIÓN: Toggle checkbox individual
    // ============================================
    toggleSeleccion: (sku) => {
        if (productosSeleccionados.has(sku)) {
            productosSeleccionados.delete(sku);
        } else {
            productosSeleccionados.add(sku);
        }
        moduloCalculadora.pintarTabla();
        moduloCalculadora.actualizarBotonRegistrar();
    },

    // ============================================
    // SELECCIÓN: Toggle todos
    // ============================================
    toggleAll: (checkbox) => {
        if (checkbox.checked) {
            sugerencias.forEach(s => productosSeleccionados.add(s.sku));
        } else {
            productosSeleccionados.clear();
        }
        moduloCalculadora.pintarTabla();
        moduloCalculadora.actualizarBotonRegistrar();
    },

    // ============================================
    // SELECCIÓN: Solo críticos
    // ============================================
    seleccionarCriticos: () => {
        productosSeleccionados.clear();
        sugerencias
            .filter(s => s.nivel_riesgo === 'CRÍTICO')
            .forEach(s => productosSeleccionados.add(s.sku));
        moduloCalculadora.pintarTabla();
        moduloCalculadora.actualizarBotonRegistrar();
        mostrarNotificacion(`${productosSeleccionados.size} productos críticos seleccionados`, 'info');
    },

    // ============================================
    // ACTUALIZAR: Cantidad a enviar
    // ============================================
    actualizarCantidad: (sku, cantidad) => {
        const idx = sugerencias.findIndex(s => s.sku === sku);
        if (idx >= 0) {
            sugerencias[idx].cantidad_a_enviar = parseInt(cantidad) || 0;
        }
    },

    // ============================================
    // ACTUALIZAR: Estado del botón registrar
    // ============================================
    actualizarBotonRegistrar: () => {
        const btn = document.getElementById('btn-registrar');
        btn.disabled = productosSeleccionados.size === 0;
    },

    // ============================================
    // REGISTRAR: Crear envío con productos seleccionados
    // ============================================
    registrarEnvio: async () => {
        if (productosSeleccionados.size === 0) {
            mostrarNotificacion('Selecciona al menos un producto', 'warning');
            return;
        }

        try {
            const idEnvio = generarId('ENV');

            // Crear registro de envío
            const { error: errorEnvio } = await supabase
                .from('registro_envios_full')
                .insert({
                    id_envio: idEnvio,
                    estado: 'Borrador',
                    fecha_creacion: new Date().toISOString()
                });

            if (errorEnvio) throw errorEnvio;

            // Crear detalles del envío
            const detalles = sugerencias
                .filter(s => productosSeleccionados.has(s.sku))
                .map(s => ({
                    id_envio: idEnvio,
                    sku: s.sku,
                    cantidad_enviada: s.cantidad_a_enviar || 0
                }));

            const { error: errorDetalle } = await supabase
                .from('detalle_envios_full')
                .insert(detalles);

            if (errorDetalle) throw errorDetalle;

            mostrarNotificacion(`Envío ${idEnvio} creado con ${detalles.length} productos`, 'success');

            // Limpiar selección
            productosSeleccionados.clear();
            moduloCalculadora.pintarTabla();
            moduloCalculadora.actualizarBotonRegistrar();

        } catch (error) {
            console.error('Error registrando envío:', error);
            mostrarNotificacion('Error al registrar envío', 'error');
        }
    },

    // ============================================
    // DEMO: Generar datos de ejemplo
    // ============================================
    generarDatosDemo: (Tt, Fe, Z, incremento) => {
        // Datos de ejemplo para desarrollo
        const productos = [
            { sku: 'LAC101500XACRC050', titulo: 'Bolsa Lienzo 10x15 x50 Un', ventas_dia: 2.5, stock_actual_full: 12 },
            { sku: 'LAC152000XACRC025', titulo: 'Bolsa Lienzo 15x20 x25 Un', ventas_dia: 3.2, stock_actual_full: 5 },
            { sku: 'GPC354000XSGPC002', titulo: 'Bolsa Gift Premium 35x40 x2', ventas_dia: 1.1, stock_actual_full: 45 },
            { sku: 'LAC202500XACRC010', titulo: 'Bolsa Lienzo 20x25 x10 Un', ventas_dia: 0.8, stock_actual_full: 28 },
            { sku: 'LAC303500XACRC005', titulo: 'Bolsa Lienzo 30x35 x5 Un', ventas_dia: 4.5, stock_actual_full: 3 }
        ];

        return productos.map(p => {
            // Fórmula: Q* = [V × (Tt + Fe) + Z × σ × √(Tt + Fe)] - Sml
            const sigma = p.ventas_dia * 0.3; // Desviación estimada
            const demandaPeriodo = p.ventas_dia * (Tt + Fe) * (1 + incremento/100);
            const stockSeguridad = Z * sigma * Math.sqrt(Tt + Fe);
            const cantidadIdeal = Math.ceil(demandaPeriodo + stockSeguridad - p.stock_actual_full);
            const diasCobertura = p.stock_actual_full / p.ventas_dia;

            let nivelRiesgo = 'OK';
            if (diasCobertura < 3) nivelRiesgo = 'CRÍTICO';
            else if (diasCobertura < 7) nivelRiesgo = 'BAJO';

            return {
                sku: p.sku,
                titulo: p.titulo,
                ventas_dia: p.ventas_dia,
                stock_actual_full: p.stock_actual_full,
                stock_en_transito: 0,
                stock_seguridad: Math.ceil(stockSeguridad),
                dias_cobertura: diasCobertura,
                cantidad_a_enviar: Math.max(0, cantidadIdeal),
                nivel_riesgo: nivelRiesgo
            };
        });
    }
};

// Exponer en window para el HTML
window.moduloCalculadora = moduloCalculadora;
