// ============================================
// MODULO: Ads Analytics - Analisis de Publicidad ML
// ============================================
// Metricas: ROAS, ACOS, TACOS, CTR, CPC, CVR
// Semaforo de productos por rendimiento
// ============================================

import { supabase } from '../config.js';
import { mostrarNotificacion, formatearMoneda, formatearNumero } from '../utils.js';

let metricas = [];
let campanas = [];
let resumenProductos = [];
let ventasTotales = 0;
let filtros = { dias: 30, campaign: 'todas' };
let chartGastoInstance = null;
let chartTacosInstance = null;
let sortCol = 'ventas_monto';
let sortAsc = false;

export const moduloAds = {

    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">

                <!-- Filtros -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="flex items-center gap-3">
                            <span class="text-sm font-medium text-gray-600">Periodo:</span>
                            <select id="sel-dias-ads" onchange="moduloAds.cambiarDias(this.value)"
                                    class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                                <option value="7">Ultimos 7 dias</option>
                                <option value="14">Ultimos 14 dias</option>
                                <option value="30" selected>Ultimos 30 dias</option>
                                <option value="60">Ultimos 60 dias</option>
                                <option value="90">Ultimos 90 dias</option>
                            </select>
                            <span class="text-sm font-medium text-gray-600 ml-2">Campana:</span>
                            <select id="sel-campana-ads" onchange="moduloAds.cambiarCampana(this.value)"
                                    class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                                <option value="todas">Todas</option>
                            </select>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="moduloAds.generarPDF()"
                                    class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
                                <i class="fas fa-file-pdf mr-1"></i> PDF Reporte
                            </button>
                            <button id="btn-sync-ads" onclick="moduloAds.sincronizar()"
                                    class="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors">
                                <i id="sync-icon-ads" class="fas fa-sync-alt mr-1"></i> Sincronizar
                            </button>
                        </div>
                    </div>
                </div>

                <!-- KPI Cards -->
                <p class="text-xs text-gray-400" id="ads-kpi-rango"></p>
                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">Gasto Total</span>
                        <p class="text-lg font-bold text-gray-800 mt-1" id="kpi-ads-gasto">-</p>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">ROAS</span>
                        <p class="text-lg font-bold mt-1" id="kpi-ads-roas">-</p>
                        <span class="text-[10px] text-gray-400">Revenue / Gasto</span>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">ACOS</span>
                        <p class="text-lg font-bold mt-1" id="kpi-ads-acos">-</p>
                        <span class="text-[10px] text-gray-400">Gasto / Ventas Ads</span>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">TACOS</span>
                        <p class="text-lg font-bold mt-1" id="kpi-ads-tacos">-</p>
                        <span class="text-[10px] text-gray-400">Gasto / Ventas Totales</span>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">Ventas Ads</span>
                        <p class="text-lg font-bold text-gray-800 mt-1" id="kpi-ads-ventas">-</p>
                        <span class="text-[10px] text-gray-400" id="kpi-ads-unidades"></span>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">CTR Promedio</span>
                        <p class="text-lg font-bold text-gray-800 mt-1" id="kpi-ads-ctr">-</p>
                        <span class="text-[10px] text-gray-400" id="kpi-ads-cpc"></span>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500"><i class="fas fa-leaf text-green-500 mr-1"></i>Ventas Organicas</span>
                        <p class="text-lg font-bold text-green-600 mt-1" id="kpi-ads-organicas">-</p>
                        <span class="text-[10px] text-gray-400" id="kpi-ads-organicas-pct"></span>
                    </div>
                </div>

                <!-- Graficos -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h3 class="text-sm font-bold text-gray-700 mb-3">Gasto vs Revenue Diario</h3>
                        <div style="height: 250px; position: relative;">
                            <canvas id="chart-ads-gasto"></canvas>
                        </div>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h3 class="text-sm font-bold text-gray-700 mb-3">TACOS Semanal (tendencia)</h3>
                        <div style="height: 250px; position: relative;">
                            <canvas id="chart-ads-tacos"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Semaforo de Productos -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div class="p-4 border-b border-gray-200 flex justify-between items-center">
                        <h3 class="text-sm font-bold text-gray-700">Rendimiento por Producto</h3>
                        <div class="flex gap-3 text-xs">
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-green-500 inline-block"></span> Estrella</span>
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-blue-500 inline-block"></span> Potencial</span>
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-yellow-500 inline-block"></span> Optimizar</span>
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-red-500 inline-block"></span> Pausar</span>
                        </div>
                    </div>
                    <div class="overflow-x-auto max-h-[500px] overflow-y-auto">
                        <table class="min-w-full">
                            <thead class="bg-gray-50 sticky top-0">
                                <tr>
                                    <th class="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase w-8"></th>
                                    <th class="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-800" onclick="moduloAds.ordenar('sku')">SKU <span id="sort-sku"></span></th>
                                    <th class="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase">Producto</th>
                                    <th class="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-800" onclick="moduloAds.ordenar('impresiones')">Impresiones <span id="sort-impresiones"></span></th>
                                    <th class="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-800" onclick="moduloAds.ordenar('clicks')">Clicks <span id="sort-clicks"></span></th>
                                    <th class="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-800" onclick="moduloAds.ordenar('ctr')">CTR <span id="sort-ctr"></span></th>
                                    <th class="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-800" onclick="moduloAds.ordenar('costo')">Gasto <span id="sort-costo"></span></th>
                                    <th class="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-800" onclick="moduloAds.ordenar('cpc')">CPC <span id="sort-cpc"></span></th>
                                    <th class="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-800" onclick="moduloAds.ordenar('ventas_unidades')">Ventas <span id="sort-ventas_unidades"></span></th>
                                    <th class="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-800" onclick="moduloAds.ordenar('ventas_monto')">Revenue <span id="sort-ventas_monto"></span></th>
                                    <th class="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-800" onclick="moduloAds.ordenar('roas')">ROAS <span id="sort-roas"></span></th>
                                    <th class="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-800" onclick="moduloAds.ordenar('acos')">ACOS <span id="sort-acos"></span></th>
                                    <th class="px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase cursor-pointer hover:text-gray-800" onclick="moduloAds.ordenar('cvr')">CVR <span id="sort-cvr"></span></th>
                                    <th class="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase">Accion</th>
                                </tr>
                            </thead>
                            <tbody id="ads-productos-body" class="divide-y divide-gray-100">
                                <tr><td colspan="14" class="px-4 py-8 text-center text-gray-400">Sincroniza para cargar datos</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        `;

        window.moduloAds = moduloAds;
        await moduloAds.cargarDatos();
    },

    cambiarDias: async (dias) => {
        filtros.dias = parseInt(dias);
        await moduloAds.cargarDatos();
    },

    cambiarCampana: async (camp) => {
        filtros.campaign = camp;
        await moduloAds.cargarDatos();
    },

    ordenar: (col) => {
        if (sortCol === col) {
            sortAsc = !sortAsc;
        } else {
            sortCol = col;
            sortAsc = col === 'sku'; // texto ascendente por defecto, numeros descendente
        }
        // Ordenar
        resumenProductos.sort((a, b) => {
            const va = a[col] ?? '';
            const vb = b[col] ?? '';
            if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
            return sortAsc ? va - vb : vb - va;
        });
        moduloAds.renderTablaProductos();
        // Actualizar indicadores de sort en headers
        document.querySelectorAll('[id^="sort-"]').forEach(el => el.textContent = '');
        const ind = document.getElementById(`sort-${col}`);
        if (ind) ind.textContent = sortAsc ? '▲' : '▼';
    },

    cargarDatos: async () => {
        try {
            const fechaDesde = new Date();
            fechaDesde.setDate(fechaDesde.getDate() - filtros.dias);
            const fechaDesdeStr = fechaDesde.toISOString().split('T')[0];

            // Todo filtrado por periodo seleccionado
            const [metricasRes, campanasRes, costosRes, ordenesRes] = await Promise.all([
                // Metricas per-item filtradas por fecha del periodo
                supabase
                    .from('ads_metricas_diarias')
                    .select('*')
                    .not('item_id', 'like', '_CAMP_%')
                    .gte('fecha', fechaDesdeStr)
                    .order('fecha'),
                supabase
                    .from('ads_campanas')
                    .select('*')
                    .order('nombre'),
                // Costos diarios filtrados por periodo (para graficos)
                supabase
                    .from('costos_publicidad')
                    .select('fecha, costo_diario')
                    .gte('fecha', fechaDesdeStr)
                    .order('fecha'),
                // Ventas totales filtradas por periodo (para TACOS)
                supabase
                    .from('ordenes_meli')
                    .select('total_lista')
                    .gte('fecha_creacion', fechaDesdeStr)
            ]);

            const metricasItems = metricasRes.data || [];
            campanas = campanasRes.data || [];
            const costosDiarios = costosRes.data || [];
            ventasTotales = (ordenesRes.data || []).reduce((sum, o) => sum + (parseFloat(o.total_lista) || 0), 0);

            // Filtrar por campana
            let itemsFiltrados = metricasItems;
            if (filtros.campaign !== 'todas') {
                itemsFiltrados = metricasItems.filter(m => m.campaign_id === filtros.campaign);
            }

            // Llenar selector de campanas
            const selCamp = document.getElementById('sel-campana-ads');
            if (selCamp) {
                selCamp.innerHTML = '<option value="todas">Todas</option>' +
                    campanas.map(c => `<option value="${c.campaign_id}" ${filtros.campaign === c.campaign_id ? 'selected' : ''}>${c.nombre || c.campaign_id}</option>`).join('');
            }

            // KPIs y tabla usan datos per-item filtrados por periodo
            moduloAds.calcularKPIs(itemsFiltrados);
            moduloAds.calcularResumenProductos(itemsFiltrados);

            // Mostrar rango
            const rangoEl = document.getElementById('ads-kpi-rango');
            if (rangoEl) {
                const fechasUnicas = [...new Set(metricasItems.map(m => m.fecha))];
                rangoEl.textContent = `Ultimos ${filtros.dias} dias · ${fechasUnicas.length} dias con datos · ${metricasItems.length} registros`;
            }

            moduloAds.renderGraficos(costosDiarios);
            moduloAds.renderTablaProductos();

        } catch (error) {
            console.error('Error cargando ads:', error);
        }
    },

    calcularKPIs: (data) => {
        const totales = data.reduce((acc, m) => ({
            gasto: acc.gasto + (m.costo || 0),
            revenueAds: acc.revenueAds + (m.ventas_total_monto || 0),
            unidades: acc.unidades + (m.ventas_total_unidades || 0),
            impresiones: acc.impresiones + (m.impresiones || 0),
            clicks: acc.clicks + (m.clicks || 0),
        }), { gasto: 0, revenueAds: 0, unidades: 0, impresiones: 0, clicks: 0 });

        const roas = totales.gasto > 0 ? totales.revenueAds / totales.gasto : 0;
        const acos = totales.revenueAds > 0 ? (totales.gasto / totales.revenueAds) * 100 : 0;
        const tacos = ventasTotales > 0 ? (totales.gasto / ventasTotales) * 100 : 0;
        const ctr = totales.impresiones > 0 ? (totales.clicks / totales.impresiones) * 100 : 0;
        const cpc = totales.clicks > 0 ? totales.gasto / totales.clicks : 0;

        const fmt = (n) => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

        const setEl = (id, text, color) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = text;
                if (color) el.className = el.className.replace(/text-\S+/g, '') + ` text-lg font-bold mt-1 ${color}`;
            }
        };

        setEl('kpi-ads-gasto', fmt(totales.gasto));
        setEl('kpi-ads-roas', `${roas.toFixed(1)}x`, roas >= 4 ? 'text-green-600' : roas >= 2 ? 'text-yellow-600' : 'text-red-600');
        setEl('kpi-ads-acos', `${acos.toFixed(1)}%`, acos <= 25 ? 'text-green-600' : acos <= 40 ? 'text-yellow-600' : 'text-red-600');
        setEl('kpi-ads-tacos', `${tacos.toFixed(1)}%`, tacos <= 15 ? 'text-green-600' : tacos <= 25 ? 'text-yellow-600' : 'text-red-600');
        setEl('kpi-ads-ventas', fmt(totales.revenueAds));
        setEl('kpi-ads-ctr', `${ctr.toFixed(2)}%`);

        const unidadesEl = document.getElementById('kpi-ads-unidades');
        if (unidadesEl) unidadesEl.textContent = `${totales.unidades} unidades`;

        const cpcEl = document.getElementById('kpi-ads-cpc');
        if (cpcEl) cpcEl.textContent = `CPC: $ ${cpc.toFixed(0)}`;

        // Ventas organicas estimadas = ventas totales del periodo - ventas atribuidas a ads
        const ventasAds = totales.revenueAds;
        const ventasOrganicas = Math.max(0, ventasTotales - ventasAds);
        const pctOrganico = ventasTotales > 0 ? Math.round(ventasOrganicas / ventasTotales * 100) : 0;

        setEl('kpi-ads-organicas', fmt(ventasOrganicas));
        const pctOrgEl = document.getElementById('kpi-ads-organicas-pct');
        if (pctOrgEl) pctOrgEl.textContent = `${pctOrganico}% del total`;
    },

    calcularResumenProductos: (data) => {
        const porItem = {};
        data.forEach(m => {
            const key = m.item_id || 'sin_item';
            if (!porItem[key]) {
                porItem[key] = {
                    item_id: m.item_id, sku: m.sku,
                    impresiones: 0, clicks: 0, costo: 0,
                    ventas_unidades: 0, ventas_monto: 0,
                    organicas_unidades: 0, organicas_monto: 0
                };
            }
            const p = porItem[key];
            p.impresiones += (m.impresiones || 0);
            p.clicks += (m.clicks || 0);
            p.costo += (m.costo || 0);
            p.ventas_unidades += (m.ventas_total_unidades || 0);
            p.ventas_monto += (m.ventas_total_monto || 0);
            p.organicas_unidades += (m.ventas_organicas_unidades || 0);
            p.organicas_monto += (m.ventas_organicas_monto || 0);
        });

        // Calcular indicadores y semaforo
        resumenProductos = Object.values(porItem).map(p => {
            const ctr = p.impresiones > 0 ? (p.clicks / p.impresiones) * 100 : 0;
            const cpc = p.clicks > 0 ? p.costo / p.clicks : 0;
            const cvr = p.clicks > 0 ? (p.ventas_unidades / p.clicks) * 100 : 0;
            const roas = p.costo > 0 ? p.ventas_monto / p.costo : 0;
            const acos = p.ventas_monto > 0 ? (p.costo / p.ventas_monto) * 100 : 0;

            // Semaforo
            let semaforo, accion;
            if (roas >= 4 && p.ventas_unidades >= 3) {
                semaforo = 'estrella'; accion = 'Escalar presupuesto';
            } else if (roas >= 4 && p.ventas_unidades < 3) {
                semaforo = 'potencial'; accion = 'Subir presupuesto';
            } else if (roas >= 2 && roas < 4) {
                semaforo = 'optimizar'; accion = 'Ajustar CPC/conversion';
            } else {
                semaforo = 'pausar'; accion = 'Considerar pausar';
            }

            return { ...p, ctr, cpc, cvr, roas, acos, semaforo, accion };
        }).sort((a, b) => b.ventas_monto - a.ventas_monto);
    },

    renderTablaProductos: () => {
        const body = document.getElementById('ads-productos-body');
        if (!body) return;

        if (resumenProductos.length === 0) {
            body.innerHTML = '<tr><td colspan="14" class="px-4 py-8 text-center text-gray-400">Sin datos de publicidad</td></tr>';
            return;
        }

        const semaforoColor = {
            estrella: 'bg-green-500',
            potencial: 'bg-blue-500',
            optimizar: 'bg-yellow-500',
            pausar: 'bg-red-500'
        };

        const fmt = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const fmt2 = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        body.innerHTML = resumenProductos.map(p => `
            <tr class="hover:bg-gray-50">
                <td class="px-3 py-2 text-center">
                    <span class="w-3 h-3 rounded-full inline-block ${semaforoColor[p.semaforo]}" title="${p.semaforo}"></span>
                </td>
                <td class="px-3 py-2 text-xs font-mono text-gray-600">${p.sku || '-'}</td>
                <td class="px-3 py-2 text-sm text-gray-700 max-w-[200px] truncate">${p.item_id || '-'}</td>
                <td class="px-3 py-2 text-sm text-right text-gray-600">${fmt(p.impresiones)}</td>
                <td class="px-3 py-2 text-sm text-right text-gray-600">${fmt(p.clicks)}</td>
                <td class="px-3 py-2 text-sm text-right">${p.ctr.toFixed(2)}%</td>
                <td class="px-3 py-2 text-sm text-right font-medium">$ ${fmt(p.costo)}</td>
                <td class="px-3 py-2 text-sm text-right">$ ${fmt2(p.cpc)}</td>
                <td class="px-3 py-2 text-sm text-right font-medium">${p.ventas_unidades}</td>
                <td class="px-3 py-2 text-sm text-right font-medium">$ ${fmt(p.ventas_monto)}</td>
                <td class="px-3 py-2 text-sm text-right font-bold ${p.roas >= 4 ? 'text-green-600' : p.roas >= 2 ? 'text-yellow-600' : 'text-red-600'}">${p.roas.toFixed(1)}x</td>
                <td class="px-3 py-2 text-sm text-right ${p.acos <= 25 ? 'text-green-600' : p.acos <= 40 ? 'text-yellow-600' : 'text-red-600'}">${p.acos.toFixed(1)}%</td>
                <td class="px-3 py-2 text-sm text-right ${p.cvr >= 5 ? 'text-green-600' : p.cvr >= 2 ? 'text-yellow-600' : 'text-red-600'}">${p.cvr.toFixed(2)}%</td>
                <td class="px-3 py-2 text-center">
                    <span class="text-xs px-2 py-0.5 rounded-full ${
                        p.semaforo === 'estrella' ? 'bg-green-100 text-green-700' :
                        p.semaforo === 'potencial' ? 'bg-blue-100 text-blue-700' :
                        p.semaforo === 'optimizar' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                    }">${p.accion}</span>
                </td>
            </tr>
        `).join('');
    },

    renderGraficos: (costosDiarios) => {
        // Grafico 1: Gasto diario de ads (de costos_publicidad)
        const canvasGasto = document.getElementById('chart-ads-gasto');
        if (canvasGasto && window.Chart) {
            if (chartGastoInstance) chartGastoInstance.destroy();

            const fechas = costosDiarios.map(c => c.fecha);
            const gastos = costosDiarios.map(c => parseFloat(c.costo_diario) || 0);

            chartGastoInstance = new Chart(canvasGasto, {
                type: 'line',
                data: {
                    labels: fechas.map(f => { const d = new Date(f + 'T12:00:00'); return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }); }),
                    datasets: [{
                        label: 'Gasto Ads Diario',
                        data: gastos,
                        borderColor: 'rgb(139, 92, 246)',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        fill: true, tension: 0.3, pointRadius: 1
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                    scales: {
                        y: { ticks: { callback: (v) => `$${(v / 1000).toFixed(0)}k` } }
                    }
                }
            });
        }

        // Grafico 2: TACOS semanal
        const canvasTacos = document.getElementById('chart-ads-tacos');
        if (canvasTacos && window.Chart) {
            if (chartTacosInstance) chartTacosInstance.destroy();

            // Agrupar costos por semana
            const porSemana = {};
            costosDiarios.forEach(c => {
                const d = new Date(c.fecha + 'T12:00:00');
                const inicioSemana = new Date(d);
                inicioSemana.setDate(d.getDate() - d.getDay());
                const key = inicioSemana.toISOString().split('T')[0];
                if (!porSemana[key]) porSemana[key] = 0;
                porSemana[key] += parseFloat(c.costo_diario) || 0;
            });

            const semanas = Object.keys(porSemana).sort();
            const ventasPorSemana = semanas.length > 0 ? ventasTotales / semanas.length : 0;

            chartTacosInstance = new Chart(canvasTacos, {
                type: 'bar',
                data: {
                    labels: semanas.map(s => {
                        const d = new Date(s + 'T12:00:00');
                        return `Sem ${d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}`;
                    }),
                    datasets: [{
                        label: 'TACOS %',
                        data: semanas.map(s => ventasPorSemana > 0 ? (porSemana[s] / ventasPorSemana) * 100 : 0),
                        backgroundColor: semanas.map(s => {
                            const tacos = ventasPorSemana > 0 ? (porSemana[s] / ventasPorSemana) * 100 : 0;
                            return tacos <= 15 ? 'rgba(34, 197, 94, 0.7)' : tacos <= 25 ? 'rgba(234, 179, 8, 0.7)' : 'rgba(239, 68, 68, 0.7)';
                        }),
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { ticks: { callback: (v) => `${v}%` }, beginAtZero: true }
                    }
                }
            });
        }
    },

    sincronizar: async () => {
        const btn = document.getElementById('btn-sync-ads');
        const icon = document.getElementById('sync-icon-ads');
        if (!btn || btn.disabled) return;

        try {
            btn.disabled = true;
            btn.classList.add('opacity-50');
            icon.classList.add('fa-spin');

            let totalItems = 0;
            let totalDias = 0;
            let campanas = 0;
            let ronda = 1;

            // Loop: la Edge Function procesa max 10 dias por vez, repetimos si hay mas pendientes
            while (true) {
                mostrarNotificacion(`Sincronizando ads (ronda ${ronda})...`, 'info');

                const { data, error } = await supabase.functions.invoke('sync-meli', {
                    body: { action: 'sync-ads-detailed' }
                });

                if (error) throw error;
                if (!data?.success) {
                    mostrarNotificacion(data?.error || 'Error al sincronizar ads', 'error');
                    break;
                }

                totalItems += (data.metricas_items || 0);
                totalDias += (data.dias_procesados || 0);
                campanas = data.campanas || campanas;

                console.log(`Ronda ${ronda}: ${data.dias_procesados} dias (${data.fechaDesde} a ${data.fechaHasta})${data.pendiente ? ' - hay mas' : ' - completo'}`);

                if (!data.pendiente) break;
                ronda++;
            }

            mostrarNotificacion(`Ads sincronizado: ${campanas} campanas, ${totalItems} items, ${totalDias} dias`, 'success');
            await moduloAds.cargarDatos();

        } catch (error) {
            console.error('Error sincronizando ads:', error);
            mostrarNotificacion('Error al sincronizar metricas de publicidad', 'error');
        } finally {
            btn.disabled = false;
            btn.classList.remove('opacity-50');
            icon.classList.remove('fa-spin');
        }
    },

    generarPDF: () => {
        if (resumenProductos.length === 0) {
            mostrarNotificacion('Sin datos para generar reporte', 'warning');
            return;
        }

        const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const fmt = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const fmt2 = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const totGasto = resumenProductos.reduce((s, p) => s + p.costo, 0);
        const totRevenue = resumenProductos.reduce((s, p) => s + p.ventas_monto, 0);
        const totUnidades = resumenProductos.reduce((s, p) => s + p.ventas_unidades, 0);
        const roas = totGasto > 0 ? totRevenue / totGasto : 0;
        const acos = totRevenue > 0 ? (totGasto / totRevenue) * 100 : 0;
        const tacos = ventasTotales > 0 ? (totGasto / ventasTotales) * 100 : 0;

        const semaforoEmoji = { estrella: '🟢', potencial: '🔵', optimizar: '🟡', pausar: '🔴' };

        const ventana = window.open('', '_blank');
        ventana.document.write(`<!DOCTYPE html>
<html><head>
<title>Ads Analytics - ${fecha}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #333; padding: 20px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #7c3aed; padding-bottom: 12px; margin-bottom: 16px; }
    .header h1 { font-size: 18px; color: #7c3aed; }
    .kpis { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
    .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 14px; }
    .kpi .label { font-size: 9px; color: #64748b; text-transform: uppercase; }
    .kpi .value { font-size: 14px; font-weight: 700; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f5f9; padding: 5px 6px; text-align: left; font-size: 9px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
    td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; font-size: 9px; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .good { color: #16a34a; } .warn { color: #ca8a04; } .bad { color: #dc2626; }
    .no-print { margin-top: 16px; text-align: center; }
    @media print { .no-print { display: none !important; } body { padding: 10px; } }
</style>
</head><body>
<div class="header">
    <div>
        <h1>Reporte de Publicidad - Mercado Libre</h1>
        <p style="color:#64748b; margin-top:4px;">Ultimos ${filtros.dias} dias</p>
    </div>
    <div style="font-size:11px; color:#666;">${fecha}</div>
</div>
<div class="kpis">
    <div class="kpi"><div class="label">Gasto Total</div><div class="value">$ ${fmt(totGasto)}</div></div>
    <div class="kpi"><div class="label">ROAS</div><div class="value ${roas >= 4 ? 'good' : roas >= 2 ? 'warn' : 'bad'}">${roas.toFixed(1)}x</div></div>
    <div class="kpi"><div class="label">ACOS</div><div class="value ${acos <= 25 ? 'good' : acos <= 40 ? 'warn' : 'bad'}">${acos.toFixed(1)}%</div></div>
    <div class="kpi"><div class="label">TACOS</div><div class="value ${tacos <= 15 ? 'good' : tacos <= 25 ? 'warn' : 'bad'}">${tacos.toFixed(1)}%</div></div>
    <div class="kpi"><div class="label">Revenue Ads</div><div class="value">$ ${fmt(totRevenue)}</div></div>
    <div class="kpi"><div class="label">Unidades</div><div class="value">${totUnidades}</div></div>
    <div class="kpi"><div class="label">🌿 Ventas Organicas</div><div class="value good">$ ${fmt(Math.max(0, ventasTotales - totRevenue))} (${ventasTotales > 0 ? Math.round(Math.max(0, ventasTotales - totRevenue) / ventasTotales * 100) : 0}%)</div></div>
</div>
<table>
    <thead><tr>
        <th></th><th>SKU</th><th>Item</th><th class="num">Impresiones</th><th class="num">Clicks</th>
        <th class="num">CTR</th><th class="num">Gasto</th><th class="num">CPC</th>
        <th class="num">Ventas</th><th class="num">Revenue</th><th class="num">ROAS</th><th class="num">ACOS</th><th class="num">CVR</th><th>Accion</th>
    </tr></thead>
    <tbody>
        ${resumenProductos.map(p => `
        <tr>
            <td>${semaforoEmoji[p.semaforo]}</td>
            <td style="font-family:monospace">${p.sku || '-'}</td>
            <td>${p.item_id || '-'}</td>
            <td class="num">${fmt(p.impresiones)}</td>
            <td class="num">${fmt(p.clicks)}</td>
            <td class="num">${p.ctr.toFixed(2)}%</td>
            <td class="num">$ ${fmt(p.costo)}</td>
            <td class="num">$ ${fmt2(p.cpc)}</td>
            <td class="num">${p.ventas_unidades}</td>
            <td class="num">$ ${fmt(p.ventas_monto)}</td>
            <td class="num ${p.roas >= 4 ? 'good' : p.roas >= 2 ? 'warn' : 'bad'}" style="font-weight:700">${p.roas.toFixed(1)}x</td>
            <td class="num ${p.acos <= 25 ? 'good' : p.acos <= 40 ? 'warn' : 'bad'}">${p.acos.toFixed(1)}%</td>
            <td class="num ${p.cvr >= 5 ? 'good' : p.cvr >= 2 ? 'warn' : 'bad'}">${p.cvr.toFixed(2)}%</td>
            <td>${p.accion}</td>
        </tr>`).join('')}
    </tbody>
</table>
<div class="no-print">
    <button onclick="window.print()" style="padding:8px 24px; background:#7c3aed; color:white; border:none; border-radius:6px; font-size:13px; cursor:pointer;">Imprimir / Guardar PDF</button>
</div>
</body></html>`);
        ventana.document.close();
    }
};

window.moduloAds = moduloAds;
