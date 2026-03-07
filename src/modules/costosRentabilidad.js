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
    pctPublicidad: 8,    // % estimado gasto publicidad
    pctPromocion: 10,    // % margen para promociones
    margenObjetivo: 25   // % margen neto objetivo
};
let sortCol = 'margen_pct';
let sortAsc = true;
let filtroBusqueda = '';

export const moduloCostos = {

    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">

                <!-- Config -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div class="flex flex-wrap items-center gap-4">
                        <div class="flex items-center gap-2">
                            <label class="text-xs font-medium text-gray-600">% Publicidad est.</label>
                            <input type="number" id="cfg-pct-publi" value="${configCalc.pctPublicidad}" min="0" max="30" step="0.5"
                                   onchange="moduloCostos.actualizarConfig()"
                                   class="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center">
                        </div>
                        <div class="flex items-center gap-2">
                            <label class="text-xs font-medium text-gray-600">% Promociones</label>
                            <input type="number" id="cfg-pct-promo" value="${configCalc.pctPromocion}" min="0" max="30" step="0.5"
                                   onchange="moduloCostos.actualizarConfig()"
                                   class="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center">
                        </div>
                        <div class="flex items-center gap-2">
                            <label class="text-xs font-medium text-gray-600">% Margen objetivo</label>
                            <input type="number" id="cfg-margen-obj" value="${configCalc.margenObjetivo}" min="0" max="60" step="1"
                                   onchange="moduloCostos.actualizarConfig()"
                                   class="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center">
                        </div>
                        <div class="flex-1"></div>
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
                        <span class="text-xs font-medium text-gray-500">Margen promedio</span>
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
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('impuestos')">Impuestos</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('publi_est')">Publi est.</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('margen')">Margen $</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onclick="moduloCostos.ordenar('margen_pct')">Margen %</th>
                                    <th class="px-3 py-2 text-right text-[10px] font-bold text-gray-500 uppercase">Sugerido</th>
                                </tr>
                            </thead>
                            <tbody id="costos-tabla-body" class="divide-y divide-gray-100">
                                <tr><td colspan="11" class="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        window.moduloCostos = moduloCostos;
        await moduloCostos.cargarDatos();
    },

    cargarDatos: async () => {
        try {
            // 1. Publicaciones ML con costos ML
            const { data: pubData } = await supabase
                .from('publicaciones_meli')
                .select('sku, titulo, precio, comision_ml, cargo_fijo_ml, costo_envio_ml, impuestos_estimados, neto_estimado, tipo_logistica, estado')
                .not('sku', 'is', null);

            // 2. Costos de Produccion (Terminado + Pack)
            const { data: prodData } = await supabaseProduccion
                .from('productos')
                .select('sku, nombre_producto, tipo, costo_calculado, costo_producto')
                .in('tipo', ['Terminado', 'Pack'])
                .not('sku', 'is', null)
                .eq('activo', true);

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
                const envio = parseFloat(p.costo_envio_ml) || 0;
                const impuestos = parseFloat(p.impuestos_estimados) || 0;

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
                const totalDescuentos = comisionMl + cargoFijo + envio + impuestos + publiEst;
                const margen = precio - costo - totalDescuentos;
                const margenPct = precio > 0 ? (margen / precio) * 100 : 0;

                return {
                    sku: p.sku,
                    titulo: p.titulo || '',
                    precio,
                    costo,
                    costoOrigen,
                    comision_ml: comisionMl,
                    cargo_fijo: cargoFijo,
                    envio,
                    impuestos,
                    publi_est: publiEst,
                    margen,
                    margen_pct: margenPct,
                    estado: p.estado,
                    tipo_logistica: p.tipo_logistica
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
        configCalc.pctPublicidad = parseFloat(document.getElementById('cfg-pct-publi')?.value) || 0;
        configCalc.pctPromocion = parseFloat(document.getElementById('cfg-pct-promo')?.value) || 0;
        configCalc.margenObjetivo = parseFloat(document.getElementById('cfg-margen-obj')?.value) || 25;
        moduloCostos.recalcular();
        moduloCostos.renderKPIs();
        moduloCostos.renderTabla();
    },

    recalcular: () => {
        publicaciones.forEach(p => {
            p.publi_est = p.precio * (configCalc.pctPublicidad / 100);
            const totalDescuentos = p.comision_ml + p.cargo_fijo + p.envio + p.impuestos + p.publi_est;
            p.margen = p.precio - p.costo - totalDescuentos;
            p.margen_pct = p.precio > 0 ? (p.margen / p.precio) * 100 : 0;

            // Calcular precio sugerido
            // Precio = (Costo + CargoFijo + Envio) / (1 - %comision - %publi - %promo - %impuestos - %margen)
            if (p.costo > 0) {
                const pctComision = p.precio > 0 ? (p.comision_ml / p.precio) : 0.153;
                const pctImpuestos = p.precio > 0 ? (p.impuestos / p.precio) : 0;
                const divisor = 1 - pctComision - (configCalc.pctPublicidad / 100) - (configCalc.pctPromocion / 100) - pctImpuestos - (configCalc.margenObjetivo / 100);
                if (divisor > 0.05) {
                    p.precio_sugerido = Math.ceil((p.costo + p.cargo_fijo + p.envio) / divisor);
                } else {
                    p.precio_sugerido = null; // Imposible alcanzar ese margen
                }
            } else {
                p.precio_sugerido = null;
            }
        });
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
            body.innerHTML = '<tr><td colspan="11" class="px-4 py-8 text-center text-gray-400">Sin resultados</td></tr>';
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
                ? `<span class="${p.precio_sugerido > p.precio ? 'text-red-500 font-medium' : 'text-green-500'}" title="Precio sugerido para ${configCalc.margenObjetivo}% margen">$ ${fmt(p.precio_sugerido)}</span>`
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
                    <td class="px-3 py-2 text-right text-red-500">$ ${fmt(p.impuestos)}</td>
                    <td class="px-3 py-2 text-right text-purple-500">$ ${fmt(p.publi_est)}</td>
                    <td class="px-3 py-2 text-right font-medium ${margenColor}">$ ${fmt(p.margen)}</td>
                    <td class="px-3 py-2 text-right font-bold ${margenColor}">${p.margen_pct.toFixed(1)}%</td>
                    <td class="px-3 py-2 text-right">${sugeridoDisplay}${diffTag}</td>
                </tr>
            `;
        }).join('');
    },

    // Exportar datos para P&L
    obtenerCostosParaPYL: () => {
        // Devuelve map SKU -> costo para calcular COGS en P&L
        const map = {};
        publicaciones.forEach(p => {
            if (p.costo > 0) map[p.sku] = p.costo;
        });
        return map;
    }
};

window.moduloCostos = moduloCostos;
