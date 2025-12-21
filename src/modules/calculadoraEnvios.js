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
                        <i class="fas fa-sliders-h text-brand"></i>
                        Parámetros de Cálculo
                    </h3>

                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Tiempo Tránsito (días)
                                <i class="fas fa-info-circle text-gray-400 ml-1" title="Días que tarda el envío en llegar a Full"></i>
                            </label>
                            <input type="number" id="param-transito" value="3" min="1" max="15"
                                   class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Frecuencia Envío (días)
                                <i class="fas fa-info-circle text-gray-400 ml-1" title="Cada cuántos días envías a Full"></i>
                            </label>
                            <input type="number" id="param-frecuencia" value="7" min="1" max="30"
                                   class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Nivel de Servicio
                                <i class="fas fa-info-circle text-gray-400 ml-1" title="Confiabilidad del stock de seguridad"></i>
                            </label>
                            <select id="param-servicio"
                                    class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent">
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
                                   class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent">
                        </div>
                    </div>

                    <div class="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-end gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                <i class="fas fa-calendar-alt text-brand mr-1"></i>
                                Fecha de Colecta Programada
                                <i class="fas fa-info-circle text-gray-400 ml-1" title="Fecha en que ML recolectará el envío. El cálculo considera el stock que se venderá hasta esa fecha."></i>
                            </label>
                            <input type="date" id="param-fecha-colecta"
                                   class="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent">
                        </div>

                        <button onclick="moduloCalculadora.calcular()"
                                class="bg-brand text-white px-6 py-2 rounded-lg font-medium hover:bg-brand-dark transition-colors flex items-center gap-2 h-[42px]">
                            <i class="fas fa-calculator"></i>
                            Calcular Sugerencias
                        </button>
                        <button onclick="moduloCalculadora.sincronizarDesdeML()"
                                class="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 h-[42px]">
                            <i class="fas fa-sync-alt"></i>
                            Sincronizar ML
                        </button>
                        <button onclick="moduloCalculadora.guardarConfig()"
                                class="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center gap-2 h-[42px]">
                            <i class="fas fa-save"></i>
                            Guardar Config
                        </button>
                        <button onclick="moduloCalculadora.diagnosticar()"
                                class="bg-yellow-100 text-yellow-700 px-4 py-2 rounded-lg font-medium hover:bg-yellow-200 transition-colors flex items-center gap-2 h-[42px]"
                                title="Verificar estado de los datos">
                            <i class="fas fa-stethoscope"></i>
                            Diagnóstico
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
                                    class="text-sm bg-brand text-white px-4 py-1 rounded-lg hover:bg-brand-dark transition-colors flex items-center gap-1"
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
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Título</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Ventas/Día</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Stock Full</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">En Tránsito</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase" title="Stock de Seguridad">Stock Seg.</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Cobertura</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">A ENVIAR</th>
                                    <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Riesgo</th>
                                </tr>
                            </thead>
                            <tbody id="tabla-sugerencias" class="divide-y divide-gray-100 text-sm">
                                <tr>
                                    <td colspan="10" class="px-4 py-8 text-center text-gray-400">
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
    // CALCULAR: Sugerencias de envío (preferencia: RPC en DB)
    // Flujo: 1) Sincronizar ML → 2) Calcular
    // ============================================
    calcular: async () => {
        const tbody = document.getElementById('tabla-sugerencias');

        // Leer fecha de colecta primero
        const fechaColectaStr = document.getElementById('param-fecha-colecta').value;

        // Validar fecha de colecta
        if (!fechaColectaStr) {
            mostrarNotificacion('Selecciona una fecha de colecta para calcular', 'warning');
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="px-4 py-8 text-center text-yellow-600">
                        <i class="fas fa-calendar-alt fa-2x mb-2"></i>
                        <p>Selecciona una fecha de colecta programada</p>
                    </td>
                </tr>
            `;
            return;
        }

        // ========== PASO 1: Sincronizar datos desde ML ==========
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="px-4 py-8 text-center text-gray-400">
                    <i class="fas fa-sync-alt fa-spin fa-2x mb-2"></i>
                    <p>Sincronizando datos con Mercado Libre...</p>
                </td>
            </tr>
        `;

        // Sincronizar (silencioso - no bloquea si falla)
        await moduloCalculadora.sincronizarDesdeML(true);

        // ========== PASO 1.5: Actualizar ventas diarias desde órdenes ==========
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="px-4 py-8 text-center text-gray-400">
                    <i class="fas fa-chart-line fa-spin fa-2x mb-2"></i>
                    <p>Calculando ventas diarias desde órdenes...</p>
                </td>
            </tr>
        `;

        // Intentar actualizar ventas desde órdenes (RPC en DB)
        try {
            const { data: ventasUpdated, error: ventasError } = await supabase.rpc('actualizar_ventas_diarias_publicaciones', {
                p_dias_evaluacion: 90
            });
            if (!ventasError && ventasUpdated > 0) {
                console.log(`✓ Ventas diarias actualizadas para ${ventasUpdated} productos`);
            } else {
                // Fallback: calcular localmente en JS
                await moduloCalculadora.calcularVentasDiariasJS();
            }
        } catch (err) {
            console.warn('RPC actualizar_ventas_diarias_publicaciones no disponible:', err);
            // Fallback: calcular localmente en JS
            await moduloCalculadora.calcularVentasDiariasJS();
        }

        // ========== PASO 1.6: Actualizar stock en tránsito desde envíos activos ==========
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="px-4 py-8 text-center text-gray-400">
                    <i class="fas fa-truck fa-spin fa-2x mb-2"></i>
                    <p>Calculando stock en tránsito...</p>
                </td>
            </tr>
        `;
        await moduloCalculadora.calcularStockTransitoJS();

        // ========== PASO 2: Calcular sugerencias ==========
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="px-4 py-8 text-center text-gray-400">
                    <i class="fas fa-calculator fa-spin fa-2x mb-2"></i>
                    <p>Calculando sugerencias...</p>
                </td>
            </tr>
        `;

        try {
            // Leer parámetros
            const Tt = parseInt(document.getElementById('param-transito').value) || 3;
            const Fe = parseInt(document.getElementById('param-frecuencia').value) || 7;
            const Z = parseFloat(document.getElementById('param-servicio').value) || 1.65;
            const incremento = parseFloat(document.getElementById('param-evento').value) || 0;

            // ========== CALCULAR EN JAVASCRIPT ==========
            // Usamos JS porque tiene la lógica de fallback ventas_90d / 90
            const fechaColecta = new Date(fechaColectaStr + 'T00:00:00');

            const { data: productosReales, error } = await supabase
                .from('publicaciones_meli')
                .select('id_publicacion, sku, titulo, ventas_90d, stock_full, stock_transito, ventas_dia, desviacion, id_inventario')
                .eq('tipo_logistica', 'fulfillment')
                .order('ventas_90d', { ascending: false });

            if (error) throw error;

            console.log(`Productos fulfillment encontrados: ${productosReales?.length || 0}`);

            if (productosReales && productosReales.length > 0) {
                sugerencias = moduloCalculadora.calcularSugerenciasJS(productosReales, Tt, Fe, Z, incremento, fechaColecta);
                mostrarNotificacion(`${sugerencias.length} productos analizados`, 'success');
            } else {
                sugerencias = moduloCalculadora.generarDatosDemo(Tt, Fe, Z, incremento, fechaColecta);
                mostrarNotificacion('No hay productos fulfillment. Usando demo.', 'warning');
            }

            // Pintar tabla
            moduloCalculadora.pintarTabla();

            // Actualizar estadísticas
            await moduloCalculadora.actualizarStats();

        } catch (error) {
            console.error('Error calculando:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="px-4 py-8 text-center text-red-500">
                        <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                        <p>Error al calcular: ${error.message}</p>
                    </td>
                </tr>
            `;
        }
    },

    // ============================================
    // CALCULAR JS: Réplica EXACTA de GAS (Logistica_Full.js)
    // Fórmulas de Logistica_Full.js líneas 251-286:
    // - L = Fe + Tt
    // - consumoProyectado = V × diasHastaColecta
    // - stockProyectadoEnColecta = (Sml + enTransito) - consumoProyectado
    // - Ss = Z × σ × √L
    // - cantidadNecesaria = (V × L) + Ss
    // - cantidadAEnviar = cantidadNecesaria - stockProyectadoEnColecta
    // - coberturaActual = Sml / V (o Infinity si V=0)
    // - Riesgo: Normal, RIESGO, CRÍTICO
    // ============================================
    calcularSugerenciasJS: (productos, Tt, Fe, Z, incremento, fechaColecta) => {
        const DIAS_PERIODO = 90;

        // Calcular días hasta la colecta (igual que GAS)
        const hoy = new Date();
        const hoyUTC = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
        const fechaColectaUTC = new Date(Date.UTC(
            fechaColecta.getFullYear(),
            fechaColecta.getMonth(),
            fechaColecta.getDate()
        ));
        const diasHastaColecta = Math.max(0, (fechaColectaUTC - hoyUTC) / (1000 * 60 * 60 * 24));

        // Lead Time total (igual que GAS línea 243)
        const L = Fe + Tt;

        console.log(`[GAS-REPLICA] Tt=${Tt}, Fe=${Fe}, L=${L}, Z=${Z}, diasHastaColecta=${diasHastaColecta}`);
        console.log(`[GAS-REPLICA] Calculando sugerencias para ${productos.length} productos...`);

        const sugerencias = [];

        for (const p of productos) {
            // Obtener ventas diarias (V) y desvío estándar (sigma)
            const ventasDiaDB = parseFloat(p.ventas_dia) || 0;
            const ventas90dDB = parseFloat(p.ventas_90d) || 0;

            // Igual que GAS: usa ventas_dia si existe, sino calcula desde ventas_90d
            const V = ventasDiaDB > 0 ? ventasDiaDB : (ventas90dDB / DIAS_PERIODO);
            const sigma = parseFloat(p.desviacion) || (V * 0.3);

            // Solo procesar si V >= 0 (GAS línea 256: "if (V >= 0)")
            if (V >= 0) {
                const Sml = parseInt(p.stock_full) || 0;      // Stock en Full
                const enTransito = parseInt(p.stock_transito) || 0;

                // ========== FÓRMULAS EXACTAS DE GAS (líneas 260-266) ==========
                // Consumo proyectado hasta la fecha de colecta
                const consumoProyectado = V * diasHastaColecta;

                // Stock proyectado en el momento de la colecta
                const stockProyectadoEnColecta = (Sml + enTransito) - consumoProyectado;

                // Stock de Seguridad: Ss = Z × σ × √L
                const Ss = Z * sigma * Math.sqrt(L);

                // Cantidad necesaria para cubrir el período de reposición
                const cantidadNecesaria = (V * L) + Ss;

                // Cantidad a enviar
                let cantidadAEnviar = Math.ceil(cantidadNecesaria - stockProyectadoEnColecta);
                if (cantidadAEnviar < 0) { cantidadAEnviar = 0; }

                // ========== COBERTURA Y RIESGO (líneas 268-273) ==========
                const coberturaActual = (V > 0) ? Sml / V : Infinity;

                // Nivel de riesgo (igual que GAS)
                let nivelRiesgo = "Normal";
                if (V > 0) {
                    // Solo calculamos riesgo para productos con ventas
                    if (coberturaActual < (L + diasHastaColecta)) { nivelRiesgo = "RIESGO"; }
                    if (coberturaActual < (Tt + diasHastaColecta)) { nivelRiesgo = "CRÍTICO"; }
                }

                // Debug para primeros productos
                if (sugerencias.length < 3) {
                    console.log(`[${p.sku}] V=${V.toFixed(2)}, Sml=${Sml}, enTransito=${enTransito}, Ss=${Ss.toFixed(1)}, cobertura=${coberturaActual.toFixed(1)}, aEnviar=${cantidadAEnviar}, riesgo=${nivelRiesgo}`);
                }

                sugerencias.push({
                    id_publicacion: p.id_publicacion,
                    sku: p.sku,
                    titulo: p.titulo,
                    ventas_dia: V,                           // Columna 3: V
                    stock_actual_full: Sml,                  // Columna 4: Stock Full
                    stock_en_transito: enTransito,           // Columna 5: En Tránsito
                    stock_seguridad: Math.ceil(Ss),          // Columna 6: Stock Seg.
                    dias_cobertura: coberturaActual,         // Columna 7: Cobertura
                    cantidad_a_enviar: cantidadAEnviar,      // Columna 8: A ENVIAR
                    nivel_riesgo: nivelRiesgo,               // Columna 9: Riesgo
                    id_inventario: p.id_inventario
                });
            }
        }

        // Ordenar por CANTIDAD A ENVIAR descendente (igual que GAS línea 294)
        sugerencias.sort((a, b) => b.cantidad_a_enviar - a.cantidad_a_enviar);

        return sugerencias;
    },

    // ============================================
    // PINTAR: Tabla de sugerencias
    // ============================================
    pintarTabla: () => {
        const tbody = document.getElementById('tabla-sugerencias');

        if (sugerencias.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="px-4 py-8 text-center text-gray-400">
                        <p>No hay sugerencias disponibles</p>
                    </td>
                </tr>
            `;
            return;
        }

        // Usar id_publicacion como clave única (fallback a sku para datos demo)
        // Columnas igual que GAS: SKU, Título, V, Stock Full, En Tránsito, Stock Seg., Cobertura, A ENVIAR, Riesgo
        tbody.innerHTML = sugerencias.map(s => {
            const key = s.id_publicacion || s.sku;
            return `
            <tr class="hover:bg-gray-50 transition-colors ${productosSeleccionados.has(key) ? 'bg-brand-light' : ''}">
                <td class="px-4 py-3">
                    <input type="checkbox"
                           ${productosSeleccionados.has(key) ? 'checked' : ''}
                           onchange="moduloCalculadora.toggleSeleccion('${key}')">
                </td>
                <td class="px-4 py-3 font-mono text-xs text-gray-600" title="${s.id_publicacion || ''}">${s.sku}</td>
                <td class="px-4 py-3">
                    <div class="max-w-xs truncate" title="${s.titulo}">${s.titulo || '-'}</div>
                </td>
                <td class="px-4 py-3 text-right font-medium">${(s.ventas_dia || 0).toFixed(2)}</td>
                <td class="px-4 py-3 text-right">${s.stock_actual_full || 0}</td>
                <td class="px-4 py-3 text-right text-gray-500">${s.stock_en_transito || 0}</td>
                <td class="px-4 py-3 text-right">${s.stock_seguridad || 0}</td>
                <td class="px-4 py-3 text-right">
                    <span class="${(s.dias_cobertura || 0) < 7 && s.dias_cobertura !== Infinity ? 'text-red-600 font-bold' : ''}">
                        ${s.dias_cobertura === Infinity ? '∞' : (s.dias_cobertura || 0).toFixed(1)}
                    </span>
                </td>
                <td class="px-4 py-3 text-right">
                    <input type="number"
                           value="${s.cantidad_a_enviar || 0}"
                           min="0"
                           class="w-20 text-right border border-gray-300 rounded px-2 py-1"
                           onchange="moduloCalculadora.actualizarCantidad('${key}', this.value)">
                </td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${colorRiesgo(s.nivel_riesgo)}">
                        ${s.nivel_riesgo || 'N/A'}
                    </span>
                </td>
            </tr>
        `}).join('');
    },

    // ============================================
    // ACTUALIZAR: Estadísticas del panel (preferencia: RPC)
    // ============================================
    actualizarStats: async () => {
        // Si ya tenemos sugerencias calculadas, usarlas
        // Niveles de riesgo GAS: "Normal", "RIESGO", "CRÍTICO"
        if (sugerencias.length > 0) {
            const total = sugerencias.length;
            const criticos = sugerencias.filter(s => s.nivel_riesgo === 'CRÍTICO').length;
            const riesgo = sugerencias.filter(s => s.nivel_riesgo === 'RIESGO').length;
            const normal = sugerencias.filter(s => s.nivel_riesgo === 'Normal').length;

            document.getElementById('stat-total').textContent = total;
            document.getElementById('stat-criticos').textContent = criticos;
            document.getElementById('stat-bajos').textContent = riesgo;  // "RIESGO" en GAS
            document.getElementById('stat-ok').textContent = normal;    // "Normal" en GAS
            return;
        }

        // Si no hay sugerencias, intentar obtener stats de RPC
        try {
            const { data, error } = await supabase.rpc('obtener_estadisticas_stock');
            if (!error && data && data.length > 0) {
                const stats = data[0];
                document.getElementById('stat-total').textContent = stats.total_skus || 0;
                document.getElementById('stat-criticos').textContent = stats.criticos || 0;
                document.getElementById('stat-bajos').textContent = stats.stock_bajo || 0;
                document.getElementById('stat-ok').textContent = stats.ok || 0;
            }
        } catch (err) {
            console.warn('RPC stats no disponible:', err);
        }
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
            sugerencias.forEach(s => {
                const key = s.id_publicacion || s.sku;
                productosSeleccionados.add(key);
            });
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
            .forEach(s => {
                const key = s.id_publicacion || s.sku;
                productosSeleccionados.add(key);
            });
        moduloCalculadora.pintarTabla();
        moduloCalculadora.actualizarBotonRegistrar();
        mostrarNotificacion(`${productosSeleccionados.size} productos críticos seleccionados`, 'info');
    },

    // ============================================
    // ACTUALIZAR: Cantidad a enviar (busca por id_publicacion o sku)
    // ============================================
    actualizarCantidad: (key, cantidad) => {
        const idx = sugerencias.findIndex(s => (s.id_publicacion || s.sku) === key);
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

            // Crear detalles del envío (usando id_publicacion como clave)
            const detalles = sugerencias
                .filter(s => {
                    const key = s.id_publicacion || s.sku;
                    return productosSeleccionados.has(key);
                })
                .map(s => ({
                    id_envio: idEnvio,
                    id_publicacion: s.id_publicacion || null,
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
    // DEMO: Generar datos de ejemplo (fórmulas GAS exactas)
    // ============================================
    generarDatosDemo: (Tt, Fe, Z, incremento, fechaColecta) => {
        // Datos de ejemplo para desarrollo
        const productos = [
            { sku: 'LAC101500XACRC050', titulo: 'Bolsa Lienzo 10x15 x50 Un', ventas_dia: 2.5, stock_actual_full: 12 },
            { sku: 'LAC152000XACRC025', titulo: 'Bolsa Lienzo 15x20 x25 Un', ventas_dia: 3.2, stock_actual_full: 5 },
            { sku: 'GPC354000XSGPC002', titulo: 'Bolsa Gift Premium 35x40 x2', ventas_dia: 1.1, stock_actual_full: 45 },
            { sku: 'LAC202500XACRC010', titulo: 'Bolsa Lienzo 20x25 x10 Un', ventas_dia: 0.8, stock_actual_full: 28 },
            { sku: 'LAC303500XACRC005', titulo: 'Bolsa Lienzo 30x35 x5 Un', ventas_dia: 4.5, stock_actual_full: 3 }
        ];

        // Calcular días hasta la colecta (igual que GAS)
        const hoy = new Date();
        const hoyUTC = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
        const fechaColectaUTC = fechaColecta ? new Date(Date.UTC(
            fechaColecta.getFullYear(),
            fechaColecta.getMonth(),
            fechaColecta.getDate()
        )) : hoyUTC;
        const diasHastaColecta = Math.max(0, (fechaColectaUTC - hoyUTC) / (1000 * 60 * 60 * 24));

        // Lead Time = Fe + Tt (igual que GAS)
        const L = Fe + Tt;

        const sugerencias = productos.map(p => {
            const V = p.ventas_dia;
            const Sml = p.stock_actual_full;
            const enTransito = 0;
            const sigma = V * 0.3; // Estimación si no hay datos

            // ========== FÓRMULAS EXACTAS DE GAS ==========
            const consumoProyectado = V * diasHastaColecta;
            const stockProyectadoEnColecta = (Sml + enTransito) - consumoProyectado;
            const Ss = Z * sigma * Math.sqrt(L);
            const cantidadNecesaria = (V * L) + Ss;
            let cantidadAEnviar = Math.ceil(cantidadNecesaria - stockProyectadoEnColecta);
            if (cantidadAEnviar < 0) { cantidadAEnviar = 0; }

            const coberturaActual = (V > 0) ? Sml / V : Infinity;

            // Nivel de riesgo (igual que GAS)
            let nivelRiesgo = "Normal";
            if (V > 0) {
                if (coberturaActual < (L + diasHastaColecta)) { nivelRiesgo = "RIESGO"; }
                if (coberturaActual < (Tt + diasHastaColecta)) { nivelRiesgo = "CRÍTICO"; }
            }

            return {
                sku: p.sku,
                titulo: p.titulo,
                ventas_dia: V,
                stock_actual_full: Sml,
                stock_en_transito: enTransito,
                stock_seguridad: Math.ceil(Ss),
                dias_cobertura: coberturaActual,
                cantidad_a_enviar: cantidadAEnviar,
                nivel_riesgo: nivelRiesgo
            };
        });

        // Ordenar por cantidad a enviar descendente (igual que GAS)
        sugerencias.sort((a, b) => b.cantidad_a_enviar - a.cantidad_a_enviar);

        return sugerencias;
    },

    // ============================================
    // CALCULAR VENTAS DIARIAS: Fallback en JavaScript
    // Agrupa órdenes de los últimos 90 días y calcula promedio por SKU
    // ============================================
    calcularVentasDiariasJS: async () => {
        const DIAS_EVALUACION = 90;

        try {
            // Obtener órdenes de los últimos 90 días
            const fechaDesde = new Date();
            fechaDesde.setDate(fechaDesde.getDate() - DIAS_EVALUACION);

            // NOTA: La columna es fecha_creacion, NO fecha_orden
            const { data: ordenes, error } = await supabase
                .from('ordenes_meli')
                .select('sku, cantidad, fecha_creacion, id_item')
                .gte('fecha_creacion', fechaDesde.toISOString());

            if (error) {
                console.error('Error consultando órdenes:', error);
                return;
            }

            if (!ordenes || ordenes.length === 0) {
                console.log('No hay órdenes en los últimos 90 días');
                return;
            }

            console.log(`Procesando ${ordenes.length} órdenes para calcular ventas...`);

            // Agrupar por SKU y por id_item (MLA...) para calcular totales
            const ventasPorSku = {};
            const ventasPorItem = {};

            ordenes.forEach(orden => {
                // Por SKU (si está disponible)
                if (orden.sku) {
                    if (!ventasPorSku[orden.sku]) {
                        ventasPorSku[orden.sku] = { total: 0, ordenes: [] };
                    }
                    ventasPorSku[orden.sku].total += orden.cantidad || 1;
                    ventasPorSku[orden.sku].ordenes.push(orden.cantidad || 1);
                }

                // Por id_item (MLA...) siempre
                if (orden.id_item) {
                    if (!ventasPorItem[orden.id_item]) {
                        ventasPorItem[orden.id_item] = { total: 0, ordenes: [] };
                    }
                    ventasPorItem[orden.id_item].total += orden.cantidad || 1;
                    ventasPorItem[orden.id_item].ordenes.push(orden.cantidad || 1);
                }
            });

            // Calcular desviación estándar
            const calcularDesviacion = (ordenes, promedioDiario) => {
                if (ordenes.length < 2) return promedioDiario * 0.3; // Fallback: 30%
                const promedio = ordenes.reduce((a, b) => a + b, 0) / ordenes.length;
                const varianza = ordenes.reduce((acc, val) => acc + Math.pow(val - promedio, 2), 0) / ordenes.length;
                return Math.sqrt(varianza) || promedioDiario * 0.3;
            };

            // Actualizar publicaciones por SKU
            let actualizados = 0;
            for (const [sku, datos] of Object.entries(ventasPorSku)) {
                const ventasDia = datos.total / DIAS_EVALUACION;
                const desviacion = calcularDesviacion(datos.ordenes, ventasDia);

                const { error: updateError } = await supabase
                    .from('publicaciones_meli')
                    .update({
                        ventas_dia: ventasDia,
                        desviacion: desviacion
                    })
                    .eq('sku', sku);

                if (!updateError) actualizados++;
            }

            // Actualizar publicaciones por id_publicacion (MLA...)
            for (const [idItem, datos] of Object.entries(ventasPorItem)) {
                const ventasDia = datos.total / DIAS_EVALUACION;
                const desviacion = calcularDesviacion(datos.ordenes, ventasDia);

                const { error: updateError } = await supabase
                    .from('publicaciones_meli')
                    .update({
                        ventas_dia: ventasDia,
                        desviacion: desviacion
                    })
                    .eq('id_publicacion', idItem);

                if (!updateError) actualizados++;
            }

            console.log(`✓ Ventas diarias calculadas: ${actualizados} registros actualizados (${DIAS_EVALUACION} días)`);

        } catch (err) {
            console.error('Error calculando ventas diarias en JS:', err);
        }
    },

    // ============================================
    // CALCULAR STOCK EN TRÁNSITO: Desde envíos activos
    // Suma cantidades de envíos con estado "En Preparación" o "Despachado"
    // ============================================
    calcularStockTransitoJS: async () => {
        try {
            // 1. Obtener envíos activos (En Preparación o Despachado)
            const { data: enviosActivos, error: errorEnvios } = await supabase
                .from('registro_envios_full')
                .select('id_envio')
                .in('estado', ['En Preparación', 'Despachado']);

            if (errorEnvios) {
                console.error('Error consultando envíos activos:', errorEnvios);
                return;
            }

            if (!enviosActivos || enviosActivos.length === 0) {
                console.log('No hay envíos activos, limpiando stock en tránsito...');
                // Limpiar stock_transito de todas las publicaciones
                await supabase
                    .from('publicaciones_meli')
                    .update({ stock_transito: 0 })
                    .neq('stock_transito', 0);
                return;
            }

            const idsEnvios = enviosActivos.map(e => e.id_envio);
            console.log(`Calculando tránsito desde ${idsEnvios.length} envíos activos...`);

            // 2. Obtener detalles de esos envíos
            const { data: detalles, error: errorDetalles } = await supabase
                .from('detalle_envios_full')
                .select('sku, id_publicacion, cantidad_enviada')
                .in('id_envio', idsEnvios);

            if (errorDetalles) {
                console.error('Error consultando detalles:', errorDetalles);
                return;
            }

            // 3. Agrupar por SKU y por id_publicacion
            const transitoPorSku = {};
            const transitoPorItem = {};

            detalles.forEach(d => {
                if (d.sku) {
                    transitoPorSku[d.sku] = (transitoPorSku[d.sku] || 0) + (d.cantidad_enviada || 0);
                }
                if (d.id_publicacion) {
                    transitoPorItem[d.id_publicacion] = (transitoPorItem[d.id_publicacion] || 0) + (d.cantidad_enviada || 0);
                }
            });

            // 4. Primero resetear todos los stock_transito a 0
            await supabase
                .from('publicaciones_meli')
                .update({ stock_transito: 0 })
                .neq('stock_transito', 0);

            // 5. Actualizar con los valores calculados por SKU
            for (const [sku, cantidad] of Object.entries(transitoPorSku)) {
                await supabase
                    .from('publicaciones_meli')
                    .update({ stock_transito: cantidad })
                    .eq('sku', sku);
            }

            // 6. Actualizar por id_publicacion
            for (const [idPub, cantidad] of Object.entries(transitoPorItem)) {
                await supabase
                    .from('publicaciones_meli')
                    .update({ stock_transito: cantidad })
                    .eq('id_publicacion', idPub);
            }

            const totalSkus = Object.keys(transitoPorSku).length + Object.keys(transitoPorItem).length;
            console.log(`✓ Stock en tránsito actualizado para ${totalSkus} productos`);

        } catch (err) {
            console.error('Error calculando stock en tránsito:', err);
        }
    },

    // ============================================
    // SINCRONIZAR: Traer datos desde API de ML
    // @param silencioso: si es true, no muestra errores y continúa con datos existentes
    // ============================================
    sincronizarDesdeML: async (silencioso = false) => {
        if (!silencioso) {
            mostrarNotificacion('Sincronizando con Mercado Libre...', 'info');
        }

        try {
            // Verificar si hay token de ML almacenado (en config_meli, donde lo guarda auth.js)
            const { data: tokenData, error: tokenError } = await supabase
                .from('config_meli')
                .select('valor')
                .eq('clave', 'access_token')
                .single();

            if (tokenError || !tokenData?.valor) {
                if (!silencioso) {
                    mostrarNotificacion('No hay sesión de ML activa. Ve a Configuración para conectar.', 'warning');
                } else {
                    console.log('Sin sesión ML activa, continuando con datos existentes');
                }
                // Continúa con datos existentes - no es un error bloqueante
                return { success: true, source: 'cache' };
            }

            // Llamar Edge Function de Supabase para sincronizar
            const { data, error } = await supabase.functions.invoke('sync-meli', {
                body: { action: 'sync-inventory' }
            });

            if (error) {
                // Si no hay Edge Function, usar datos de Supabase existentes
                console.warn('Edge Function no disponible:', error);
                if (!silencioso) {
                    mostrarNotificacion('Usando datos de la última migración.', 'info');
                }
                return { success: true, source: 'cache' };
            }

            if (data?.success) {
                const updated = data.updated || 0;
                if (!silencioso && updated > 0) {
                    mostrarNotificacion(`Sincronizado: ${updated} productos actualizados`, 'success');
                }
                return { success: true, source: 'api', updated };
            }

            return { success: true, source: 'cache' };
        } catch (error) {
            console.error('Error sincronizando:', error);
            if (!silencioso) {
                mostrarNotificacion('Error de sincronización. Usando datos existentes.', 'warning');
            }
            // Aún así retorna success para que el cálculo continúe
            return { success: true, source: 'cache' };
        }
    },

    // ============================================
    // DIAGNÓSTICO: Verificar estado de los datos
    // ============================================
    diagnosticar: async () => {
        const appContent = document.getElementById('app-content');

        appContent.innerHTML = `
            <div class="max-w-4xl mx-auto">
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <i class="fas fa-stethoscope text-yellow-500"></i>
                        Diagnóstico de Datos
                    </h3>
                    <div id="diagnostico-resultado" class="text-center py-8">
                        <i class="fas fa-spinner fa-spin fa-2x text-gray-400 mb-4"></i>
                        <p class="text-gray-500">Analizando datos...</p>
                    </div>
                </div>
            </div>
        `;

        const resultado = document.getElementById('diagnostico-resultado');
        let html = '';

        try {
            // 1. Total publicaciones
            const { count: totalPubs } = await supabase
                .from('publicaciones_meli')
                .select('*', { count: 'exact', head: true });

            // 2. Publicaciones fulfillment
            const { data: fullPubs, count: countFull } = await supabase
                .from('publicaciones_meli')
                .select('sku, titulo, stock_full, ventas_90d, ventas_dia, tipo_logistica', { count: 'exact' })
                .eq('tipo_logistica', 'fulfillment')
                .limit(5);

            // 3. Publicaciones con stock > 0
            const { count: conStock } = await supabase
                .from('publicaciones_meli')
                .select('*', { count: 'exact', head: true })
                .gt('stock_full', 0);

            // 4. Publicaciones con ventas_90d > 0
            const { count: conVentas90 } = await supabase
                .from('publicaciones_meli')
                .select('*', { count: 'exact', head: true })
                .gt('ventas_90d', 0);

            // 5. Publicaciones con ventas_dia > 0
            const { count: conVentasDia } = await supabase
                .from('publicaciones_meli')
                .select('*', { count: 'exact', head: true })
                .gt('ventas_dia', 0);

            // 6. Total órdenes
            const { count: totalOrdenes } = await supabase
                .from('ordenes_meli')
                .select('*', { count: 'exact', head: true });

            // 7. Órdenes últimos 90 días
            const fechaDesde = new Date();
            fechaDesde.setDate(fechaDesde.getDate() - 90);
            const { data: ordenesRecientes, count: countOrdenesRecientes } = await supabase
                .from('ordenes_meli')
                .select('id_orden, sku, id_item, cantidad, fecha_creacion', { count: 'exact' })
                .gte('fecha_creacion', fechaDesde.toISOString())
                .limit(5);

            // 8. Órdenes con SKU
            const { count: ordenesConSku } = await supabase
                .from('ordenes_meli')
                .select('*', { count: 'exact', head: true })
                .not('sku', 'is', null);

            // 9. Envíos activos
            const { count: enviosActivos } = await supabase
                .from('registro_envios_full')
                .select('*', { count: 'exact', head: true })
                .in('estado', ['En Preparación', 'Despachado']);

            // 10. Tipos de logística únicos
            const { data: tiposLog } = await supabase
                .from('publicaciones_meli')
                .select('tipo_logistica')
                .not('tipo_logistica', 'is', null);

            const tiposUnicos = [...new Set(tiposLog?.map(t => t.tipo_logistica) || [])];

            // Construir HTML del diagnóstico
            html = `
                <div class="space-y-6">
                    <!-- Publicaciones -->
                    <div class="border-b border-gray-200 pb-4">
                        <h4 class="font-bold text-gray-700 mb-3">📦 Publicaciones (publicaciones_meli)</h4>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div class="bg-gray-50 p-3 rounded-lg">
                                <div class="text-2xl font-bold ${totalPubs > 0 ? 'text-green-600' : 'text-red-600'}">${totalPubs || 0}</div>
                                <div class="text-gray-500">Total registros</div>
                            </div>
                            <div class="bg-gray-50 p-3 rounded-lg">
                                <div class="text-2xl font-bold ${countFull > 0 ? 'text-green-600' : 'text-red-600'}">${countFull || 0}</div>
                                <div class="text-gray-500">Con tipo_logistica='fulfillment'</div>
                            </div>
                            <div class="bg-gray-50 p-3 rounded-lg">
                                <div class="text-2xl font-bold ${conStock > 0 ? 'text-green-600' : 'text-orange-600'}">${conStock || 0}</div>
                                <div class="text-gray-500">Con stock_full > 0</div>
                            </div>
                            <div class="bg-gray-50 p-3 rounded-lg">
                                <div class="text-2xl font-bold ${conVentas90 > 0 ? 'text-green-600' : 'text-orange-600'}">${conVentas90 || 0}</div>
                                <div class="text-gray-500">Con ventas_90d > 0</div>
                            </div>
                        </div>
                        <div class="mt-2 text-xs text-gray-500">
                            <strong>Tipos de logística encontrados:</strong> ${tiposUnicos.length > 0 ? tiposUnicos.join(', ') : 'Ninguno'}
                        </div>
                        ${fullPubs && fullPubs.length > 0 ? `
                        <div class="mt-3 text-xs">
                            <strong>Muestra de productos fulfillment:</strong>
                            <pre class="bg-gray-100 p-2 rounded mt-1 overflow-x-auto">${JSON.stringify(fullPubs, null, 2)}</pre>
                        </div>
                        ` : ''}
                    </div>

                    <!-- Órdenes -->
                    <div class="border-b border-gray-200 pb-4">
                        <h4 class="font-bold text-gray-700 mb-3">🛒 Órdenes (ordenes_meli)</h4>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div class="bg-gray-50 p-3 rounded-lg">
                                <div class="text-2xl font-bold ${totalOrdenes > 0 ? 'text-green-600' : 'text-red-600'}">${totalOrdenes || 0}</div>
                                <div class="text-gray-500">Total órdenes</div>
                            </div>
                            <div class="bg-gray-50 p-3 rounded-lg">
                                <div class="text-2xl font-bold ${countOrdenesRecientes > 0 ? 'text-green-600' : 'text-orange-600'}">${countOrdenesRecientes || 0}</div>
                                <div class="text-gray-500">Últimos 90 días</div>
                            </div>
                            <div class="bg-gray-50 p-3 rounded-lg">
                                <div class="text-2xl font-bold ${ordenesConSku > 0 ? 'text-green-600' : 'text-orange-600'}">${ordenesConSku || 0}</div>
                                <div class="text-gray-500">Con SKU asignado</div>
                            </div>
                        </div>
                        ${ordenesRecientes && ordenesRecientes.length > 0 ? `
                        <div class="mt-3 text-xs">
                            <strong>Muestra de órdenes recientes:</strong>
                            <pre class="bg-gray-100 p-2 rounded mt-1 overflow-x-auto">${JSON.stringify(ordenesRecientes, null, 2)}</pre>
                        </div>
                        ` : ''}
                    </div>

                    <!-- Envíos -->
                    <div class="pb-4">
                        <h4 class="font-bold text-gray-700 mb-3">🚚 Envíos Activos</h4>
                        <div class="bg-gray-50 p-3 rounded-lg inline-block">
                            <div class="text-2xl font-bold text-blue-600">${enviosActivos || 0}</div>
                            <div class="text-gray-500 text-sm">En Preparación / Despachado</div>
                        </div>
                    </div>

                    <!-- Diagnóstico -->
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h4 class="font-bold text-yellow-800 mb-2">🔍 Diagnóstico</h4>
                        <ul class="text-sm text-yellow-700 space-y-1">
                            ${countFull === 0 ? '<li>❌ <strong>No hay productos con tipo_logistica="fulfillment".</strong> Verifica la migración o sincroniza con ML.</li>' : '<li>✅ Hay productos fulfillment</li>'}
                            ${conStock === 0 ? '<li>❌ <strong>Ningún producto tiene stock_full > 0.</strong> El stock no se está sincronizando desde ML.</li>' : '<li>✅ Hay productos con stock</li>'}
                            ${totalOrdenes === 0 ? '<li>❌ <strong>No hay órdenes en la base de datos.</strong> Importa órdenes desde GAS o sincroniza con ML.</li>' : '<li>✅ Hay órdenes registradas</li>'}
                            ${countOrdenesRecientes === 0 && totalOrdenes > 0 ? '<li>⚠️ <strong>No hay órdenes de los últimos 90 días.</strong> Las ventas_dia se calcularán como 0.</li>' : ''}
                            ${conVentas90 === 0 && conVentasDia === 0 ? '<li>❌ <strong>No hay datos de ventas.</strong> Necesitas importar ventas_90d o tener órdenes recientes.</li>' : '<li>✅ Hay datos de ventas</li>'}
                        </ul>
                    </div>

                    <!-- Acciones -->
                    <div class="flex gap-3 justify-center pt-4">
                        <button onclick="router.navegar('calculadora')"
                                class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                            <i class="fas fa-arrow-left mr-2"></i>Volver
                        </button>
                        <a href="migracion.html" target="_blank"
                           class="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors">
                            <i class="fas fa-database mr-2"></i>Ir a Migración
                        </a>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Error en diagnóstico:', error);
            html = `
                <div class="text-center text-red-500">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                    <p>Error al diagnosticar: ${error.message}</p>
                </div>
            `;
        }

        resultado.innerHTML = html;
    }
};

// Exponer en window para el HTML
window.moduloCalculadora = moduloCalculadora;
