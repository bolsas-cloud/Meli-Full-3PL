// ============================================
// MODULO: Costos y Rentabilidad
// ============================================
// Cruza costos de ProduccionTextilApp con publicaciones ML
// Calcula margenes reales y sugiere precios optimos
// ============================================

import { supabase, supabaseProduccion } from '../config.js';
import { mostrarNotificacion, formatearMoneda } from '../utils.js';

let publicaciones = [];
let costosProduccion = {};
let configCalc = {
    pctComision: 15.3,   // % comision ML (se auto-calcula del promedio real)
    pctPublicidad: 8,    // % estimado gasto publicidad (ACOS)
    pctPromocion: 10,    // % margen para promociones/descuentos
    pctImpuestos: 3,     // % retenciones impositivas (IIBB, SIRTAC, IVA)
    margenObjetivo: 25   // % margen neto sobre COSTO (no sobre precio)
};
let sortCol = 'margen_pct';
let sortAsc = true;
let filtroBusqueda = '';

// Config de costos ML (envio, fijos, umbrales)
let configCostosEnvio = [];
let configCostosFijos = [];
let configUmbrales = {
    umbral_envio_gratis: 33000,
    peso_default_gr: 500
};
let realtimeChannel = null;
let realtimeDebounce = null;

export const moduloCostos = {

    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">

                <!-- Config -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div class="flex flex-wrap items-center gap-3">
                        <div class="flex items-center gap-1.5">
                            <label class="text-[10px] font-medium text-gray-600" title="Comision ML promedio (se auto-calcula)">% Comision</label>
                            <input type="number" id="cfg-pct-comision" value="${configCalc.pctComision}" min="0" max="30" step="0.1"
                                   onchange="moduloCostos.actualizarConfig()"
                                   class="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center">
                        </div>
                        <div class="flex items-center gap-1.5">
                            <label class="text-[10px] font-medium text-gray-600" title="Porcentaje estimado de gasto en publicidad (ACOS)">% Publi</label>
                            <input type="number" id="cfg-pct-publi" value="${configCalc.pctPublicidad}" min="0" max="30" step="0.5"
                                   onchange="moduloCostos.actualizarConfig()"
                                   class="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center">
                        </div>
                        <div class="flex items-center gap-1.5">
                            <label class="text-[10px] font-medium text-gray-600" title="Porcentaje destinado a descuentos y promociones">% Promo</label>
                            <input type="number" id="cfg-pct-promo" value="${configCalc.pctPromocion}" min="0" max="30" step="0.5"
                                   onchange="moduloCostos.actualizarConfig()"
                                   class="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center">
                        </div>
                        <div class="flex items-center gap-1.5">
                            <label class="text-[10px] font-medium text-gray-600" title="Retenciones impositivas estimadas (IIBB, SIRTAC, IVA)">% Imp</label>
                            <input type="number" id="cfg-pct-imp" value="${configCalc.pctImpuestos}" min="0" max="15" step="0.5"
                                   onchange="moduloCostos.actualizarConfig()"
                                   class="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center">
                        </div>
                        <div class="flex items-center gap-1.5">
                            <label class="text-[10px] font-medium text-gray-600" title="Margen de ganancia neto objetivo sobre el COSTO del producto">% Margen s/costo</label>
                            <input type="number" id="cfg-margen-obj" value="${configCalc.margenObjetivo}" min="0" max="100" step="1"
                                   onchange="moduloCostos.actualizarConfig()"
                                   class="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center">
                        </div>
                        <div class="flex-1"></div>
                        <div class="flex items-center gap-1.5">
                            <span class="text-[10px] text-gray-400" id="cfg-carga-variable" title="Carga Variable Total (V) = suma de todos los %"></span>
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="text" id="filtro-costos" placeholder="Buscar SKU o producto..."
                                   oninput="moduloCostos.filtrar(this.value)"
                                   class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52">
                        </div>
                    </div>
                </div>

                <!-- KPIs resumen -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">Productos con costo</span>
                        <p class="text-xl font-bold text-gray-800 mt-1" id="kpi-con-costo">-</p>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">Sin costo asignado</span>
                        <p class="text-xl font-bold text-red-600 mt-1" id="kpi-sin-costo">-</p>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">Margen prom. s/costo</span>
                        <p class="text-xl font-bold mt-1" id="kpi-margen-prom">-</p>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">Precio sub-optimo</span>
                        <p class="text-xl font-bold text-orange-600 mt-1" id="kpi-sub-optimo">-</p>
                    </div>
                </div>

                <!-- Tabla productos -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div class="p-4 border-b border-gray-200 flex items-center justify-between">
                        <h3 class="text-sm font-bold text-gray-700">Rentabilidad por Publicacion</h3>
                        <span class="text-xs text-gray-400" id="costos-count"></span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('sku')">SKU</th>
                                    <th class="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('titulo')">Producto</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('precio')">Precio ML</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('costo')">Costo Prod</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('comision_ml')">Comision</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('cargo_fijo')">Cargo Fijo</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('envio')">Envio</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('impuestos')">Impuestos</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('publi_est')">Publi est.</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('margen')">Margen $</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('margen_pct')">Margen %s/C</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase">Sugerido</th>
                                </tr>
                            </thead>
                            <tbody id="costos-tabla-body" class="divide-y divide-gray-100">
                                <tr><td colspan="12" class="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        window.moduloCostos = moduloCostos;
        await moduloCostos.cargarDatos();
        moduloCostos.iniciarRealtime();
    },

    destroy: () => {
        if (realtimeChannel) {
            supabaseProduccion.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }
        if (realtimeDebounce) {
            clearTimeout(realtimeDebounce);
            realtimeDebounce = null;
        }
    },

    iniciarRealtime: () => {
        // Limpiar canal anterior si existe
        if (realtimeChannel) {
            supabaseProduccion.removeChannel(realtimeChannel);
        }

        realtimeChannel = supabaseProduccion
            .channel('costos-productos-realtime')
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'productos' },
                (payload) => {
                    const p = payload.new;
                    if (!p.sku) return;

                    const costoNuevo = parseFloat(p.costo_calculado) || parseFloat(p.costo_producto) || 0;
                    const costoAnterior = costosProduccion[p.sku]?.costo || 0;

                    // Solo recalcular si el costo cambio
                    if (costoNuevo !== costoAnterior) {
                        console.log(`Realtime: costo actualizado ${p.sku}: $${costoAnterior} -> $${costoNuevo}`);
                        if (costoNuevo > 0) {
                            costosProduccion[p.sku] = { costo: costoNuevo, tipo: p.tipo, nombre: p.nombre_producto };
                        }

                        // Debounce para no recalcular en cada cambio masivo
                        if (realtimeDebounce) clearTimeout(realtimeDebounce);
                        realtimeDebounce = setTimeout(() => {
                            // Actualizar costos en publicaciones
                            publicaciones.forEach(pub => {
                                if (costosProduccion[pub.sku]) {
                                    pub.costo = costosProduccion[pub.sku].costo;
                                    pub.costoOrigen = 'directo';
                                } else if (pub.sku.length > 3) {
                                    const base = pub.sku.slice(0, -3);
                                    const cant = parseInt(pub.sku.slice(-3)) || 1;
                                    const skuUnit = base + '001';
                                    if (costosProduccion[skuUnit]) {
                                        pub.costo = costosProduccion[skuUnit].costo * cant;
                                        pub.costoOrigen = 'calculado';
                                    }
                                }
                            });
                            moduloCostos.recalcular();
                            moduloCostos.renderKPIs();
                            moduloCostos.renderTabla();
                            mostrarNotificacion('Costos actualizados en tiempo real', 'success');
                        }, 500);
                    }
                }
            )
            .subscribe((status) => {
                console.log('Realtime costos:', status);
            });
    },

    cargarDatos: async () => {
        try {
            // Cargar todo en paralelo
            const [pubRes, prodRes, envioRes, fijosRes, umbralesRes] = await Promise.all([
                // 1. Publicaciones ML con costos ML + peso y envio gratis
                supabase
                    .from('publicaciones_meli')
                    .select('sku, titulo, precio, comision_ml, cargo_fijo_ml, costo_envio_ml, impuestos_estimados, neto_estimado, tipo_logistica, estado, peso_gr, tiene_envio_gratis')
                    .not('sku', 'is', null),
                // 2. Costos de Produccion (Terminado + Pack)
                supabaseProduccion
                    .from('productos')
                    .select('sku, nombre_producto, tipo, costo_calculado, costo_producto')
                    .in('tipo', ['Terminado', 'Pack'])
                    .not('sku', 'is', null)
                    .eq('activo', true),
                // 3. Config costos envio por peso
                supabase
                    .from('config_costos_envio_ml')
                    .select('*')
                    .eq('activo', true)
                    .order('peso_desde_gr'),
                // 4. Config costos fijos por rango de precio
                supabase
                    .from('config_costos_fijos_ml')
                    .select('*')
                    .eq('activo', true)
                    .order('precio_desde'),
                // 5. Umbrales
                supabase
                    .from('config_umbrales_ml')
                    .select('*')
            ]);

            const pubData = pubRes.data;
            const prodData = prodRes.data;

            // Procesar config envio y fijos
            if (envioRes.data?.length > 0) configCostosEnvio = envioRes.data;
            if (fijosRes.data?.length > 0) configCostosFijos = fijosRes.data;
            if (umbralesRes.data?.length > 0) {
                umbralesRes.data.forEach(u => {
                    configUmbrales[u.clave] = parseFloat(u.valor) || 0;
                });
            }

            // Auto-calcular % comision promedio desde datos reales de ML
            const pubsConComision = (pubData || []).filter(p => p.precio > 0 && p.comision_ml > 0);
            if (pubsConComision.length > 0) {
                const sumaPct = pubsConComision.reduce((acc, p) =>
                    acc + (parseFloat(p.comision_ml) / parseFloat(p.precio)) * 100, 0);
                configCalc.pctComision = parseFloat((sumaPct / pubsConComision.length).toFixed(1));
                const inputComision = document.getElementById('cfg-pct-comision');
                if (inputComision) inputComision.value = configCalc.pctComision;
            }

            // Auto-calcular % impuestos promedio desde datos reales
            const pubsConImp = (pubData || []).filter(p => p.precio > 0 && p.impuestos_estimados > 0);
            if (pubsConImp.length > 0) {
                const sumaPctImp = pubsConImp.reduce((acc, p) =>
                    acc + (parseFloat(p.impuestos_estimados) / parseFloat(p.precio)) * 100, 0);
                configCalc.pctImpuestos = parseFloat((sumaPctImp / pubsConImp.length).toFixed(1));
                const inputImp = document.getElementById('cfg-pct-imp');
                if (inputImp) inputImp.value = configCalc.pctImpuestos;
            }

            // Indexar costos por SKU
            costosProduccion = {};
            (prodData || []).forEach(p => {
                const costo = parseFloat(p.costo_calculado) || parseFloat(p.costo_producto) || 0;
                if (costo > 0) {
                    costosProduccion[p.sku] = { costo, tipo: p.tipo, nombre: p.nombre_producto };
                }
            });

            // 3. Cruzar publicaciones con costos
            publicaciones = (pubData || []).filter(p => p.sku).map(p => {
                const precio = parseFloat(p.precio) || 0;
                const comisionMl = parseFloat(p.comision_ml) || 0;
                const cargoFijo = parseFloat(p.cargo_fijo_ml) || 0;
                const impuestos = parseFloat(p.impuestos_estimados) || 0;
                const pesoGr = parseFloat(p.peso_gr) || 0;
                const tieneEnvioGratis = p.tiene_envio_gratis === true;

                // Calcular costo de envio gratis (el vendedor absorbe parte)
                const costoEnvio = tieneEnvioGratis
                    ? moduloCostos.calcularCostoEnvio(pesoGr, precio)
                    : 0;

                // Buscar costo: primero match directo por SKU
                let costo = 0;
                let costoOrigen = null;
                if (costosProduccion[p.sku]) {
                    costo = costosProduccion[p.sku].costo;
                    costoOrigen = 'directo';
                } else {
                    // Fallback: buscar unidad (suffix 001) y multiplicar
                    const baseSku = p.sku.slice(0, -3);
                    const cant = parseInt(p.sku.slice(-3)) || 1;
                    const skuUnidad = baseSku + '001';
                    if (costosProduccion[skuUnidad]) {
                        costo = costosProduccion[skuUnidad].costo * cant;
                        costoOrigen = 'calculado';
                    }
                }

                const publiEst = precio * (configCalc.pctPublicidad / 100);
                const totalDescuentos = comisionMl + cargoFijo + costoEnvio + impuestos + publiEst;
                const margen = precio - costo - totalDescuentos;
                const margenPct = costo > 0 ? (margen / costo) * 100 : 0;

                return {
                    sku: p.sku,
                    titulo: p.titulo || '',
                    precio,
                    costo,
                    costoOrigen,
                    comision_ml: comisionMl,
                    cargo_fijo: cargoFijo,
                    envio: costoEnvio,
                    impuestos,
                    publi_est: publiEst,
                    margen,
                    margen_pct: margenPct,
                    estado: p.estado,
                    tipo_logistica: p.tipo_logistica,
                    peso_gr: pesoGr,
                    tiene_envio_gratis: tieneEnvioGratis
                };
            });

            moduloCostos.recalcular();
            moduloCostos.renderKPIs();
            moduloCostos.renderTabla();

        } catch (error) {
            console.error('Error cargando costos:', error);
            mostrarNotificacion('Error cargando datos de costos', 'error');
        }
    },

    actualizarConfig: () => {
        configCalc.pctComision = parseFloat(document.getElementById('cfg-pct-comision')?.value) || 15;
        configCalc.pctPublicidad = parseFloat(document.getElementById('cfg-pct-publi')?.value) || 0;
        configCalc.pctPromocion = parseFloat(document.getElementById('cfg-pct-promo')?.value) || 0;
        configCalc.pctImpuestos = parseFloat(document.getElementById('cfg-pct-imp')?.value) || 0;
        configCalc.margenObjetivo = parseFloat(document.getElementById('cfg-margen-obj')?.value) || 25;
        moduloCostos.recalcular();
        moduloCostos.renderKPIs();
        moduloCostos.renderTabla();
    },

    recalcular: () => {
        // Carga Variable Total (V) = comision + publi + promo + impuestos
        const V = (configCalc.pctComision + configCalc.pctPublicidad +
                   configCalc.pctPromocion + configCalc.pctImpuestos) / 100;
        const divisor = 1 - V;

        // Mostrar carga variable en UI
        const vEl = document.getElementById('cfg-carga-variable');
        if (vEl) vEl.textContent = `V=${(V * 100).toFixed(1)}% | Divisor=${divisor.toFixed(3)}`;

        publicaciones.forEach(p => {
            // === MARGEN REAL con datos reales de ML ===
            // Recalcular envio con precio actual
            p.envio = p.tiene_envio_gratis
                ? moduloCostos.calcularCostoEnvio(p.peso_gr, p.precio)
                : 0;
            p.publi_est = p.precio * (configCalc.pctPublicidad / 100);
            p.promo_est = p.precio * (configCalc.pctPromocion / 100);
            p.imp_est = p.precio * (configCalc.pctImpuestos / 100);
            const totalDescuentos = p.comision_ml + p.cargo_fijo + p.envio + p.impuestos + p.publi_est;
            p.margen = p.precio - p.costo - totalDescuentos;
            p.margen_pct = p.costo > 0 ? (p.margen / p.costo) * 100 : 0;

            // === PRECIO SUGERIDO con formula del informe ===
            // P = (C * (1 + m) + cf_o_E) / (1 - V)
            // Margen es sobre COSTO, no sobre precio
            if (p.costo > 0 && divisor > 0.05) {
                p.precio_sugerido = moduloCostos.calcularPrecioSugerido(
                    p.costo, p.peso_gr, p.tiene_envio_gratis
                );
            } else {
                p.precio_sugerido = null;
            }
        });
    },

    // Formula algebraica exacta del informe de pricing
    // P = (C * (1 + m) + cf_o_E) / (1 - V)
    // Evalua 4 escalones y selecciona el valido
    calcularPrecioSugerido: (costo, pesoGr, tieneEnvioGratis) => {
        const m = configCalc.margenObjetivo / 100;
        const V = (configCalc.pctComision + configCalc.pctPublicidad +
                   configCalc.pctPromocion + configCalc.pctImpuestos) / 100;
        const divisor = 1 - V;
        if (divisor <= 0.05) return null;

        const umbral = configUmbrales.umbral_envio_gratis || 33000;

        // Base de retorno de capital: C * (1 + m)
        const baseMargen = costo * (1 + m);

        // Obtener costos fijos por escalon desde config_costos_fijos_ml
        // Fallback a los valores del informe si no hay config
        const obtenerCostoFijo = (precioDesde) => {
            if (configCostosFijos.length > 0) {
                const rango = configCostosFijos.find(r =>
                    precioDesde >= parseFloat(r.precio_desde) && precioDesde < parseFloat(r.precio_hasta)
                );
                return rango ? parseFloat(rango.costo_fijo) || 0 : 0;
            }
            // Fallback hardcoded del informe (vigencia 2025/2026)
            if (precioDesde < 15000) return 1115;
            if (precioDesde < 25000) return 2300;
            if (precioDesde < 33000) return 2810;
            return 0;
        };

        // Costo de envio para este peso (con descuento, porque precio >= umbral)
        const fleteCotizado = moduloCostos.calcularCostoEnvio(pesoGr, umbral);

        // Escalon 1: precio < $15.000
        const cf1 = obtenerCostoFijo(1000);
        const precioTrozo1 = (baseMargen + cf1) / divisor;

        // Escalon 2: $15.000 <= precio < $25.000
        const cf2 = obtenerCostoFijo(15000);
        const precioTrozo2 = (baseMargen + cf2) / divisor;

        // Escalon 3: $25.000 <= precio < umbral
        const cf3 = obtenerCostoFijo(25000);
        const precioTrozo3 = (baseMargen + cf3) / divisor;

        // Escalon 4: precio >= umbral (envio gratis obligatorio, sin cargo fijo)
        const precioTrozo4 = (baseMargen + fleteCotizado) / divisor;

        // Seleccion condicional: el trozo valido es el que cae en su propio rango
        if (precioTrozo1 >= 1000 && precioTrozo1 < 15000) {
            return Math.ceil(precioTrozo1);
        }
        if (precioTrozo2 >= 15000 && precioTrozo2 < 25000) {
            return Math.ceil(precioTrozo2);
        }
        if (precioTrozo3 >= 25000 && precioTrozo3 < umbral) {
            return Math.ceil(precioTrozo3);
        }
        // Si ningun escalon de costo fijo encaja, el precio supera el umbral
        // y debe absorber el flete
        return Math.ceil(precioTrozo4);
    },

    renderKPIs: () => {
        const conCosto = publicaciones.filter(p => p.costo > 0);
        const sinCosto = publicaciones.filter(p => p.costo === 0);
        const margenProm = conCosto.length > 0
            ? conCosto.reduce((s, p) => s + p.margen_pct, 0) / conCosto.length
            : 0;
        const subOptimo = conCosto.filter(p => p.margen_pct < configCalc.margenObjetivo && p.margen_pct >= 0).length;

        const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
        set('kpi-con-costo', conCosto.length);
        set('kpi-sin-costo', sinCosto.length);
        set('kpi-margen-prom', `${margenProm.toFixed(1)}%`);
        set('kpi-sub-optimo', subOptimo);

        const margenEl = document.getElementById('kpi-margen-prom');
        if (margenEl) margenEl.className = `text-xl font-bold mt-1 ${margenProm >= configCalc.margenObjetivo ? 'text-green-600' : margenProm >= 0 ? 'text-yellow-600' : 'text-red-600'}`;
    },

    filtrar: (texto) => {
        filtroBusqueda = texto.toLowerCase();
        moduloCostos.renderTabla();
    },

    ordenar: (col) => {
        if (sortCol === col) {
            sortAsc = !sortAsc;
        } else {
            sortCol = col;
            sortAsc = col === 'sku' || col === 'titulo';
        }
        moduloCostos.renderTabla();
    },

    renderTabla: () => {
        const body = document.getElementById('costos-tabla-body');
        if (!body) return;

        let items = [...publicaciones];

        // Filtrar
        if (filtroBusqueda) {
            items = items.filter(p =>
                p.sku.toLowerCase().includes(filtroBusqueda) ||
                p.titulo.toLowerCase().includes(filtroBusqueda)
            );
        }

        // Ordenar
        items.sort((a, b) => {
            let va = a[sortCol], vb = b[sortCol];
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va < vb) return sortAsc ? -1 : 1;
            if (va > vb) return sortAsc ? 1 : -1;
            return 0;
        });

        const countEl = document.getElementById('costos-count');
        if (countEl) countEl.textContent = `${items.length} publicaciones`;

        const fmt = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const indicador = (col) => sortCol === col ? (sortAsc ? ' ▲' : ' ▼') : '';

        // Actualizar headers
        document.querySelectorAll('#costos-tabla-body')?.closest?.('table')?.querySelectorAll?.('th');

        if (items.length === 0) {
            body.innerHTML = '<tr><td colspan="12" class="px-4 py-8 text-center text-gray-400">Sin resultados</td></tr>';
            return;
        }

        body.innerHTML = items.map(p => {
            const margenColor = p.costo === 0
                ? 'text-gray-400'
                : p.margen_pct >= configCalc.margenObjetivo ? 'text-green-600'
                : p.margen_pct >= 10 ? 'text-yellow-600'
                : 'text-red-600';

            const costoDisplay = p.costo > 0
                ? `$ ${fmt(p.costo)}`
                : '<span class="text-gray-300">sin costo</span>';

            const costoTag = p.costoOrigen === 'calculado'
                ? ' <span class="text-[9px] text-blue-400" title="Calculado desde unidad x cantidad">calc</span>'
                : '';

            const sugeridoDisplay = p.precio_sugerido
                ? `<span class="${p.precio_sugerido > p.precio ? 'text-red-500 font-medium' : 'text-green-500'}" title="Precio sugerido para ${configCalc.margenObjetivo}% margen sobre costo\nFormula: P = (C*(1+m) + cf/E) / (1-V)">$ ${fmt(p.precio_sugerido)}</span>`
                : '<span class="text-gray-300">-</span>';

            const diffSugerido = p.precio_sugerido && p.precio > 0
                ? ((p.precio_sugerido - p.precio) / p.precio * 100).toFixed(0)
                : null;
            const diffTag = diffSugerido !== null && Math.abs(diffSugerido) >= 1
                ? ` <span class="text-[9px] ${diffSugerido > 0 ? 'text-red-400' : 'text-green-400'}">${diffSugerido > 0 ? '+' : ''}${diffSugerido}%</span>`
                : '';

            return `
                <tr class="hover:bg-gray-50 text-xs">
                    <td class="px-3 py-2 font-mono text-[10px] text-gray-600">${p.sku}</td>
                    <td class="px-3 py-2 text-gray-800 max-w-[200px] truncate" title="${p.titulo}">${p.titulo.substring(0, 45)}${p.titulo.length > 45 ? '...' : ''}</td>
                    <td class="px-3 py-2 text-right font-medium">$ ${fmt(p.precio)}</td>
                    <td class="px-3 py-2 text-right">${costoDisplay}${costoTag}</td>
                    <td class="px-3 py-2 text-right text-red-500">$ ${fmt(p.comision_ml)}</td>
                    <td class="px-3 py-2 text-right text-red-500">$ ${fmt(p.cargo_fijo)}</td>
                    <td class="px-3 py-2 text-right text-orange-500">${p.envio > 0 ? '$ ' + fmt(p.envio) : '<span class="text-gray-300">-</span>'}</td>
                    <td class="px-3 py-2 text-right text-red-500">$ ${fmt(p.impuestos)}</td>
                    <td class="px-3 py-2 text-right text-purple-500">$ ${fmt(p.publi_est)}</td>
                    <td class="px-3 py-2 text-right font-medium ${margenColor}">$ ${fmt(p.margen)}</td>
                    <td class="px-3 py-2 text-right font-bold ${margenColor}">${p.margen_pct.toFixed(1)}%</td>
                    <td class="px-3 py-2 text-right">${sugeridoDisplay}${diffTag}</td>
                </tr>
            `;
        }).join('');
    },

    // Calcular costo fijo segun precio (desde config_costos_fijos_ml)
    calcularCostoFijo: (precio) => {
        if (!configCostosFijos || configCostosFijos.length === 0) return 0;
        const rango = configCostosFijos.find(r =>
            precio >= parseFloat(r.precio_desde) && precio < parseFloat(r.precio_hasta)
        );
        return rango ? parseFloat(rango.costo_fijo) || 0 : 0;
    },

    // Calcular costo de envio gratis segun peso y precio
    calcularCostoEnvio: (pesoGr, precio) => {
        if (!configCostosEnvio || configCostosEnvio.length === 0) return 0;

        const umbral = configUmbrales.umbral_envio_gratis || 33000;
        const tieneDescuento = precio >= umbral;
        const pesoEfectivo = pesoGr > 0 ? pesoGr : (configUmbrales.peso_default_gr || 500);

        const rango = configCostosEnvio.find(r =>
            pesoEfectivo >= parseFloat(r.peso_desde_gr) && pesoEfectivo < parseFloat(r.peso_hasta_gr)
        );

        const r = rango || configCostosEnvio[configCostosEnvio.length - 1];
        return tieneDescuento
            ? parseFloat(r.costo_con_descuento) || 0
            : parseFloat(r.costo_sin_descuento) || 0;
    },

    // Exportar datos para P&L
    obtenerCostosParaPYL: () => {
        const map = {};
        publicaciones.forEach(p => {
            if (p.costo > 0) map[p.sku] = p.costo;
        });
        return map;
    }
};

window.moduloCostos = moduloCostos;
