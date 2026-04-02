// ============================================
// MODULO: P&L (Profit & Loss) Integrado
// ============================================
// Cruza: Ventas (ordenes_meli) - Costos ML (billing) - Ads
// Para mostrar margen real mensual y por producto
// ============================================

import { supabase, supabaseProduccion } from '../config.js';
import { mostrarNotificacion, formatearMoneda } from '../utils.js';

let datosMensuales = [];
let datosProductos = [];
let mesSeleccionado = null;
let chartInstance = null;

export const moduloPYL = {

    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">

                <!-- Filtros -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="flex items-center gap-3">
                            <span class="text-sm font-medium text-gray-600">Mes:</span>
                            <select id="sel-mes-pyl" onchange="moduloPYL.cambiarMes(this.value)"
                                    class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                                <option value="">Cargando...</option>
                            </select>
                        </div>
                        <button onclick="moduloPYL.generarPDF()"
                                class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
                            <i class="fas fa-file-pdf mr-1"></i> PDF P&L
                        </button>
                    </div>
                </div>

                <!-- KPI Cards principales -->
                <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">Ventas Brutas</span>
                        <p class="text-xl font-bold text-gray-800 mt-1" id="kpi-pyl-ventas">-</p>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">COGS</span>
                        <p class="text-xl font-bold text-amber-600 mt-1" id="kpi-pyl-cogs">-</p>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">Costos ML</span>
                        <p class="text-xl font-bold text-red-600 mt-1" id="kpi-pyl-costos">-</p>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">Gasto Ads</span>
                        <p class="text-xl font-bold text-purple-600 mt-1" id="kpi-pyl-ads">-</p>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">Margen Real</span>
                        <p class="text-xl font-bold mt-1" id="kpi-pyl-margen">-</p>
                    </div>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <span class="text-xs font-medium text-gray-500">% Margen</span>
                        <p class="text-xl font-bold mt-1" id="kpi-pyl-pct">-</p>
                    </div>
                </div>

                <!-- Grafico P&L mensual -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <h3 class="text-sm font-bold text-gray-700 mb-3">P&L Mensual</h3>
                    <div style="height: 300px; position: relative;">
                        <canvas id="chart-pyl-mensual"></canvas>
                    </div>
                </div>

                <!-- Tabla P&L detallada -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div class="p-4 border-b border-gray-200">
                        <h3 class="text-sm font-bold text-gray-700">Detalle P&L Mensual</h3>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Mes</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Ventas Brutas</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">COGS</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Comisiones</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Cargos Fijos</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Envios</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Publicidad</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Impuestos</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Margen Real</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">% Margen</th>
                                </tr>
                            </thead>
                            <tbody id="pyl-tabla-body" class="divide-y divide-gray-100">
                                <tr><td colspan="9" class="px-4 py-8 text-center text-gray-400">Cargando datos...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        `;

        window.moduloPYL = moduloPYL;
        await moduloPYL.cargarDatos();
    },

    cargarDatos: async () => {
        try {
            // Cargar billing (ya tiene totales por periodo/mes)
            const { data: billingData } = await supabase
                .from('billing_periodos')
                .select('*')
                .order('anio', { ascending: false })
                .order('mes', { ascending: false });

            // Cargar ventas mensuales via RPC (evita limite de 1000 filas)
            const { data: ventasRpc } = await supabase.rpc('rpc_ventas_mensuales');

            // Cargar costos publicidad diarios
            const { data: adsData } = await supabase
                .from('costos_publicidad')
                .select('fecha, costo_diario')
                .order('fecha', { ascending: false });

            // Cargar unidades vendidas por SKU/mes para COGS
            const { data: unidadesData } = await supabase.rpc('rpc_unidades_mensuales_por_sku');

            // Cargar costos de produccion
            const { data: prodData } = await supabaseProduccion
                .from('productos')
                .select('sku, costo_calculado, costo_producto, tipo')
                .in('tipo', ['Terminado', 'Pack'])
                .not('sku', 'is', null)
                .eq('activo', true);

            // Indexar costos por SKU
            const costosMap = {};
            (prodData || []).forEach(p => {
                const c = parseFloat(p.costo_calculado) || parseFloat(p.costo_producto) || 0;
                if (c > 0) costosMap[p.sku] = c;
            });

            // Calcular COGS mensual
            const cogsMensuales = {};
            (unidadesData || []).forEach(u => {
                let costo = costosMap[u.sku] || 0;
                // Fallback: buscar unidad y multiplicar
                if (costo === 0 && u.sku && u.sku.length > 3) {
                    const base = u.sku.slice(0, -3);
                    const cant = parseInt(u.sku.slice(-3)) || 1;
                    const skuUnit = base + '001';
                    if (costosMap[skuUnit]) costo = costosMap[skuUnit] * cant;
                }
                if (costo > 0) {
                    if (!cogsMensuales[u.mes_key]) cogsMensuales[u.mes_key] = 0;
                    cogsMensuales[u.mes_key] += costo * (parseInt(u.unidades) || 0);
                }
            });

            // Ventas ya vienen agrupadas por mes desde el RPC
            const ventasMensuales = {};
            (ventasRpc || []).forEach(v => {
                ventasMensuales[v.mes_key] = parseFloat(v.ventas_brutas) || 0;
            });

            // Agrupar ads por mes
            const adsMensuales = {};
            (adsData || []).forEach(a => {
                if (!a.fecha) return;
                const d = new Date(a.fecha + 'T12:00:00');
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                if (!adsMensuales[key]) adsMensuales[key] = 0;
                adsMensuales[key] += (parseFloat(a.costo_diario) || 0);
            });

            // Construir datos P&L por mes
            // Usar billing_periodos como base, o ventas si no hay billing
            const mesesSet = new Set([
                ...(billingData || []).map(b => `${b.anio}-${String(b.mes).padStart(2, '0')}`),
                ...Object.keys(ventasMensuales),
                ...Object.keys(adsMensuales)
            ]);

            datosMensuales = [...mesesSet].sort().reverse().map(key => {
                const [anio, mes] = key.split('-');
                const billing = (billingData || []).find(b => b.anio === parseInt(anio) && b.mes === parseInt(mes));
                const ventas = ventasMensuales[key] || 0;
                const gastoAds = adsMensuales[key] || 0;
                const cogs = cogsMensuales[key] || 0;

                const comisiones = Math.abs(billing?.total_comisiones || 0);
                const cargosFijos = Math.abs(billing?.total_cargos_fijos || 0);
                const envios = Math.abs(billing?.total_envios || 0);
                // Prioridad: billing_periodos (fuente oficial ML) > costos_publicidad (sync diario, fallback)
                // Evita double-counting si ambas fuentes tienen datos para el mismo periodo
                const publicidadBilling = Math.abs(billing?.total_publicidad || 0);
                const publicidad = publicidadBilling > 0 ? publicidadBilling : gastoAds;
                const impuestos = Math.abs(billing?.total_impuestos || 0);
                const totalCostosML = comisiones + cargosFijos + envios + publicidad + impuestos;
                const margen = ventas - cogs - totalCostosML;
                const pctMargen = ventas > 0 ? (margen / ventas) * 100 : 0;
                const tieneCostos = comisiones > 0 || envios > 0 || cargosFijos > 0 || impuestos > 0;

                return {
                    key, anio: parseInt(anio), mes: parseInt(mes),
                    ventas, cogs, comisiones, cargosFijos, envios, publicidad, impuestos,
                    totalCostosML, margen, pctMargen, tieneCostos
                };
            }).filter(d => d.ventas > 0 || d.tieneCostos);

            // Llenar selector de meses
            const sel = document.getElementById('sel-mes-pyl');
            if (sel) {
                sel.innerHTML = datosMensuales.map(d => {
                    const mesNombre = new Date(d.anio, d.mes - 1).toLocaleString('es-AR', { month: 'long' });
                    return `<option value="${d.key}">${mesNombre} ${d.anio}</option>`;
                }).join('');
            }

            if (datosMensuales.length > 0) {
                mesSeleccionado = datosMensuales[0].key;
                moduloPYL.actualizarKPIs(datosMensuales[0]);
            }

            moduloPYL.renderTabla();
            moduloPYL.renderGrafico();

        } catch (error) {
            console.error('Error cargando P&L:', error);
        }
    },

    cambiarMes: (key) => {
        mesSeleccionado = key;
        const datos = datosMensuales.find(d => d.key === key);
        if (datos) moduloPYL.actualizarKPIs(datos);
    },

    actualizarKPIs: (d) => {
        const fmt = (n) => `$ ${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

        const setEl = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        setEl('kpi-pyl-ventas', fmt(d.ventas));
        setEl('kpi-pyl-cogs', d.cogs > 0 ? fmt(d.cogs) : 'sin datos');
        setEl('kpi-pyl-costos', fmt(d.totalCostosML));
        setEl('kpi-pyl-ads', fmt(d.publicidad));
        setEl('kpi-pyl-margen', fmt(d.margen));

        const margenEl = document.getElementById('kpi-pyl-margen');
        if (margenEl) margenEl.className = `text-xl font-bold mt-1 ${d.margen >= 0 ? 'text-green-600' : 'text-red-600'}`;

        setEl('kpi-pyl-pct', `${d.pctMargen.toFixed(1)}%`);
        const pctEl = document.getElementById('kpi-pyl-pct');
        if (pctEl) pctEl.className = `text-xl font-bold mt-1 ${d.pctMargen >= 20 ? 'text-green-600' : d.pctMargen >= 0 ? 'text-yellow-600' : 'text-red-600'}`;
    },

    renderTabla: () => {
        const body = document.getElementById('pyl-tabla-body');
        if (!body) return;

        const fmt = (n) => Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        // Solo mostrar meses con datos de costos (billing con desglose)
        const mesesConDatos = datosMensuales.filter(d => d.tieneCostos);

        if (mesesConDatos.length === 0) {
            body.innerHTML = '<tr><td colspan="10" class="px-4 py-8 text-center text-gray-400">Sincroniza Billing ML para ver el P&L</td></tr>';
            return;
        }

        body.innerHTML = mesesConDatos.map(d => {
            const mesNombre = new Date(d.anio, d.mes - 1).toLocaleString('es-AR', { month: 'short' });
            return `
                <tr class="hover:bg-gray-50 cursor-pointer" onclick="moduloPYL.cambiarMes('${d.key}'); document.getElementById('sel-mes-pyl').value='${d.key}'">
                    <td class="px-4 py-3 font-medium text-gray-800">${mesNombre} ${d.anio}</td>
                    <td class="px-4 py-3 text-right font-medium">$ ${fmt(d.ventas)}</td>
                    <td class="px-4 py-3 text-right text-amber-600">${d.cogs > 0 ? '$ ' + fmt(d.cogs) : '<span class="text-gray-300">-</span>'}</td>
                    <td class="px-4 py-3 text-right text-red-600">$ ${fmt(d.comisiones)}</td>
                    <td class="px-4 py-3 text-right text-red-600">$ ${fmt(d.cargosFijos)}</td>
                    <td class="px-4 py-3 text-right text-orange-600">$ ${fmt(d.envios)}</td>
                    <td class="px-4 py-3 text-right text-purple-600">$ ${fmt(d.publicidad)}</td>
                    <td class="px-4 py-3 text-right text-red-600">$ ${fmt(d.impuestos)}</td>
                    <td class="px-4 py-3 text-right font-bold ${d.margen >= 0 ? 'text-green-600' : 'text-red-600'}">$ ${fmt(d.margen)}</td>
                    <td class="px-4 py-3 text-right font-bold ${d.pctMargen >= 20 ? 'text-green-600' : d.pctMargen >= 0 ? 'text-yellow-600' : 'text-red-600'}">${d.pctMargen.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');
    },

    renderGrafico: () => {
        const canvas = document.getElementById('chart-pyl-mensual');
        if (!canvas || !window.Chart) return;

        if (chartInstance) chartInstance.destroy();

        const ultimos = [...datosMensuales].filter(d => d.tieneCostos).reverse().slice(-6);
        const labels = ultimos.map(d => {
            const mesNombre = new Date(d.anio, d.mes - 1).toLocaleString('es-AR', { month: 'short' });
            return `${mesNombre} ${d.anio}`;
        });

        chartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Ventas', data: ultimos.map(d => d.ventas), backgroundColor: 'rgba(34, 197, 94, 0.7)', order: 2 },
                    { label: 'COGS', data: ultimos.map(d => -d.cogs), backgroundColor: 'rgba(245, 158, 11, 0.7)', stack: 'costos', order: 2 },
                    { label: 'Comisiones', data: ultimos.map(d => -d.comisiones), backgroundColor: 'rgba(59, 130, 246, 0.7)', stack: 'costos', order: 2 },
                    { label: 'Envios', data: ultimos.map(d => -d.envios), backgroundColor: 'rgba(249, 115, 22, 0.7)', stack: 'costos', order: 2 },
                    { label: 'Publicidad', data: ultimos.map(d => -d.publicidad), backgroundColor: 'rgba(139, 92, 246, 0.7)', stack: 'costos', order: 2 },
                    { label: 'Impuestos', data: ultimos.map(d => -d.impuestos), backgroundColor: 'rgba(239, 68, 68, 0.7)', stack: 'costos', order: 2 },
                    {
                        label: '% Margen',
                        data: ultimos.map(d => d.pctMargen),
                        type: 'line',
                        borderColor: 'rgb(16, 185, 129)',
                        backgroundColor: 'transparent',
                        yAxisID: 'y1',
                        tension: 0.3,
                        pointRadius: 4,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                scales: {
                    y: {
                        ticks: { callback: (v) => `$${(v / 1000).toFixed(0)}k` }
                    },
                    y1: {
                        position: 'right',
                        grid: { display: false },
                        ticks: { callback: (v) => `${v}%` }
                    }
                }
            }
        });
    },

    generarPDF: () => {
        if (datosMensuales.length === 0) {
            mostrarNotificacion('Sin datos para generar P&L', 'warning');
            return;
        }

        const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const fmt = (n) => Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        const mesesPDF = datosMensuales.filter(d => d.tieneCostos).slice(0, 6);
        const ventana = window.open('', '_blank');
        ventana.document.write(`<!DOCTYPE html>
<html><head>
<title>P&L Mercado Libre - ${fecha}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #333; padding: 20px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 16px; }
    .header h1 { font-size: 18px; color: #059669; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f5f9; padding: 6px 8px; text-align: right; font-size: 9px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
    th:first-child { text-align: left; }
    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    td:first-child { text-align: left; font-weight: 600; }
    .positive { color: #16a34a; } .negative { color: #dc2626; } .amber { color: #d97706; }
    .total-row { background: #f0fdf4; font-weight: 700; }
    .subtotal-row { background: #fefce8; font-weight: 600; }
    .no-print { margin-top: 16px; text-align: center; }
    @media print { .no-print { display: none !important; } body { padding: 10px; } @page { orientation: landscape; } }
</style>
</head><body>
<div class="header">
    <div>
        <h1>Estado de Resultados (P&L) - Mercado Libre</h1>
        <p style="color:#64748b; margin-top:4px;">Ventas brutas - COGS - Costos ML = Margen Real</p>
    </div>
    <div style="font-size:11px; color:#666;">${fecha}</div>
</div>
<table>
    <thead><tr>
        <th style="text-align:left">Concepto</th>
        ${mesesPDF.map(d => {
            const mesNombre = new Date(d.anio, d.mes - 1).toLocaleString('es-AR', { month: 'short' });
            return `<th>${mesNombre} ${d.anio}</th>`;
        }).join('')}
    </tr></thead>
    <tbody>
        <tr><td>Ventas Brutas</td>${mesesPDF.map(d => `<td class="positive">$ ${fmt(d.ventas)}</td>`).join('')}</tr>
        <tr><td>(-) COGS (Costo Prod.)</td>${mesesPDF.map(d => `<td class="amber">${d.cogs > 0 ? '$ ' + fmt(d.cogs) : '-'}</td>`).join('')}</tr>
        <tr class="subtotal-row"><td>= Margen Bruto</td>${mesesPDF.map(d => `<td class="${(d.ventas - d.cogs) >= 0 ? 'positive' : 'negative'}">$ ${fmt(d.ventas - d.cogs)}</td>`).join('')}</tr>
        <tr><td>(-) Comisiones ML</td>${mesesPDF.map(d => `<td class="negative">$ ${fmt(d.comisiones)}</td>`).join('')}</tr>
        <tr><td>(-) Cargos Fijos</td>${mesesPDF.map(d => `<td class="negative">$ ${fmt(d.cargosFijos)}</td>`).join('')}</tr>
        <tr><td>(-) Envios</td>${mesesPDF.map(d => `<td class="negative">$ ${fmt(d.envios)}</td>`).join('')}</tr>
        <tr><td>(-) Publicidad</td>${mesesPDF.map(d => `<td class="negative">$ ${fmt(d.publicidad)}</td>`).join('')}</tr>
        <tr><td>(-) Impuestos</td>${mesesPDF.map(d => `<td class="negative">$ ${fmt(d.impuestos)}</td>`).join('')}</tr>
        <tr class="total-row"><td>= Margen Real</td>${mesesPDF.map(d => `<td class="${d.margen >= 0 ? 'positive' : 'negative'}">$ ${fmt(d.margen)}</td>`).join('')}</tr>
        <tr class="total-row"><td>% Margen</td>${mesesPDF.map(d => `<td class="${d.pctMargen >= 20 ? 'positive' : 'negative'}">${d.pctMargen.toFixed(1)}%</td>`).join('')}</tr>
    </tbody>
</table>
<p style="margin-top:12px; font-size:9px; color:#94a3b8;">* COGS calculado desde costos de ProduccionTextilApp. Margen Real incluye costo de mercaderia.</p>
<div class="no-print">
    <button onclick="window.print()" style="padding:8px 24px; background:#059669; color:white; border:none; border-radius:6px; font-size:13px; cursor:pointer;">Imprimir / Guardar PDF</button>
</div>
</body></html>`);
        ventana.document.close();
    }
};

window.moduloPYL = moduloPYL;
