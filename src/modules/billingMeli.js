// ============================================
// MODULO: Billing ML - Costos y Gastos de Mercado Libre
// ============================================
// Muestra resumen mensual de cargos de ML:
// comisiones, cargos fijos, envios, publicidad, impuestos
// ============================================

import { supabase } from '../config.js';
import { mostrarNotificacion, formatearMoneda, formatearNumero } from '../utils.js';

let periodos = [];
let detalle = [];
let periodoSeleccionado = null;
let chartInstance = null;

export const moduloBilling = {

    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">

                <!-- Filtros y Acciones -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="flex items-center gap-3">
                            <span class="text-sm font-medium text-gray-600">Periodo:</span>
                            <select id="sel-periodo-billing"
                                    onchange="moduloBilling.cambiarPeriodo(this.value)"
                                    class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500">
                                <option value="">Cargando...</option>
                            </select>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="moduloBilling.generarPDF()"
                                    class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
                                <i class="fas fa-file-pdf mr-1"></i> PDF Resumen
                            </button>
                            <button id="btn-sync-billing" onclick="moduloBilling.sincronizar()"
                                    class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                                <i id="sync-icon-billing" class="fas fa-sync-alt mr-1"></i> Sincronizar
                            </button>
                        </div>
                    </div>
                </div>

                <!-- KPI Cards -->
                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3" id="billing-kpis">
                    ${['Total', 'Comisiones', 'Cargos Fijos', 'Envios', 'Publicidad', 'Impuestos', 'Reembolsos'].map(label => `
                        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                            <span class="text-xs font-medium text-gray-500">${label}</span>
                            <p class="text-lg font-bold text-gray-800 mt-1" id="kpi-billing-${label.toLowerCase().replace(' ', '_')}">-</p>
                        </div>
                    `).join('')}
                </div>

                <!-- Grafico de Tendencia -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <h3 class="text-sm font-bold text-gray-700 mb-3">Tendencia Mensual de Costos</h3>
                    <div style="height: 280px; position: relative;">
                        <canvas id="chart-billing-tendencia"></canvas>
                    </div>
                </div>

                <!-- Tabla Detalle -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div class="p-4 border-b border-gray-200 flex justify-between items-center">
                        <h3 class="text-sm font-bold text-gray-700">Detalle de Cargos</h3>
                        <span id="billing-detalle-count" class="text-xs text-gray-500"></span>
                    </div>
                    <div class="overflow-x-auto max-h-[500px] overflow-y-auto">
                        <table class="min-w-full">
                            <thead class="bg-gray-50 sticky top-0">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Tipo</th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Descripcion</th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Orden</th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Item</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Monto</th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Fecha</th>
                                </tr>
                            </thead>
                            <tbody id="billing-detalle-body" class="divide-y divide-gray-100">
                                <tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">Sincroniza para cargar datos</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        `;

        window.moduloBilling = moduloBilling;
        await moduloBilling.cargarDatos();
    },

    cargarDatos: async () => {
        try {
            const { data, error } = await supabase
                .from('billing_periodos')
                .select('*')
                .order('anio', { ascending: false })
                .order('mes', { ascending: false });

            if (error) throw error;
            periodos = data || [];

            if (periodos.length === 0) {
                document.getElementById('sel-periodo-billing').innerHTML = '<option value="">Sin datos - Sincronizar primero</option>';
                return;
            }

            // Llenar selector de periodos
            const sel = document.getElementById('sel-periodo-billing');
            sel.innerHTML = periodos.map(p => {
                const mesNombre = new Date(p.anio, (p.mes || 1) - 1).toLocaleString('es-AR', { month: 'long' });
                return `<option value="${p.periodo_key}">${mesNombre} ${p.anio}</option>`;
            }).join('');

            // Seleccionar el primero (mas reciente)
            periodoSeleccionado = periodos[0].periodo_key;
            moduloBilling.actualizarKPIs(periodos[0]);
            moduloBilling.renderGrafico();
            await moduloBilling.cargarDetalle(periodoSeleccionado);

        } catch (error) {
            console.error('Error cargando billing:', error);
        }
    },

    cambiarPeriodo: async (key) => {
        periodoSeleccionado = key;
        const periodo = periodos.find(p => p.periodo_key === key);
        if (periodo) {
            moduloBilling.actualizarKPIs(periodo);
            await moduloBilling.cargarDetalle(key);
        }
    },

    actualizarKPIs: (p) => {
        const fmt = (v) => formatearMoneda ? formatearMoneda(Math.abs(v || 0)) : `$ ${Math.abs(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;

        const setKPI = (id, valor) => {
            const el = document.getElementById(id);
            if (el) el.textContent = fmt(valor);
        };

        setKPI('kpi-billing-total', p.total_general);
        setKPI('kpi-billing-comisiones', p.total_comisiones);
        setKPI('kpi-billing-cargos_fijos', p.total_cargos_fijos);
        setKPI('kpi-billing-envios', p.total_envios);
        setKPI('kpi-billing-publicidad', p.total_publicidad);
        setKPI('kpi-billing-impuestos', p.total_impuestos);
        setKPI('kpi-billing-reembolsos', p.total_reembolsos);
    },

    cargarDetalle: async (key) => {
        try {
            const { data, error } = await supabase
                .from('billing_detalle')
                .select('*')
                .eq('periodo_key', key)
                .order('monto', { ascending: true });

            if (error) throw error;
            detalle = data || [];

            const countEl = document.getElementById('billing-detalle-count');
            if (countEl) countEl.textContent = `${detalle.length} registros`;

            const body = document.getElementById('billing-detalle-body');
            if (!body) return;

            if (detalle.length === 0) {
                body.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">Sin detalle para este periodo</td></tr>';
                return;
            }

            const tipoBadge = (tipo) => {
                const colores = {
                    'commission': 'bg-blue-100 text-blue-800',
                    'sale_fee': 'bg-blue-100 text-blue-800',
                    'shipping': 'bg-orange-100 text-orange-800',
                    'advertising': 'bg-purple-100 text-purple-800',
                    'tax': 'bg-red-100 text-red-800',
                    'refund': 'bg-green-100 text-green-800',
                };
                const tipoLower = (tipo || '').toLowerCase();
                for (const [key, cls] of Object.entries(colores)) {
                    if (tipoLower.includes(key)) return cls;
                }
                return 'bg-gray-100 text-gray-800';
            };

            body.innerHTML = detalle.map(d => `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-2">
                        <span class="px-2 py-0.5 rounded-full text-xs font-medium ${tipoBadge(d.tipo_cargo)}">${d.tipo_cargo || '-'}</span>
                    </td>
                    <td class="px-4 py-2 text-sm text-gray-600 max-w-xs truncate" title="${(d.descripcion || '').replace(/"/g, '&quot;')}">${d.descripcion || '-'}</td>
                    <td class="px-4 py-2 text-xs font-mono text-gray-500">${d.orden_id || '-'}</td>
                    <td class="px-4 py-2 text-xs font-mono text-gray-500">${d.item_id || '-'}</td>
                    <td class="px-4 py-2 text-sm text-right font-medium ${(d.monto || 0) < 0 ? 'text-red-600' : 'text-green-600'}">
                        $ ${Math.abs(d.monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td class="px-4 py-2 text-xs text-gray-500">${d.fecha_cargo || '-'}</td>
                </tr>
            `).join('');

        } catch (error) {
            console.error('Error cargando detalle:', error);
        }
    },

    renderGrafico: () => {
        const canvas = document.getElementById('chart-billing-tendencia');
        if (!canvas || !window.Chart) return;

        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        // Ultimos 6 periodos (mas antiguo primero)
        const ultimos = [...periodos].reverse().slice(-6);
        const labels = ultimos.map(p => {
            const mesNombre = new Date(p.anio, (p.mes || 1) - 1).toLocaleString('es-AR', { month: 'short' });
            return `${mesNombre} ${p.anio}`;
        });

        const datasets = [
            { label: 'Comisiones', data: ultimos.map(p => Math.abs(p.total_comisiones || 0)), backgroundColor: 'rgba(59, 130, 246, 0.8)' },
            { label: 'Cargos Fijos', data: ultimos.map(p => Math.abs(p.total_cargos_fijos || 0)), backgroundColor: 'rgba(245, 158, 11, 0.8)' },
            { label: 'Envios', data: ultimos.map(p => Math.abs(p.total_envios || 0)), backgroundColor: 'rgba(249, 115, 22, 0.8)' },
            { label: 'Publicidad', data: ultimos.map(p => Math.abs(p.total_publicidad || 0)), backgroundColor: 'rgba(139, 92, 246, 0.8)' },
            { label: 'Impuestos', data: ultimos.map(p => Math.abs(p.total_impuestos || 0)), backgroundColor: 'rgba(239, 68, 68, 0.8)' },
        ];

        chartInstance = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
                },
                scales: {
                    x: { stacked: true },
                    y: {
                        stacked: true,
                        ticks: {
                            callback: (v) => `$ ${(v / 1000).toFixed(0)}k`
                        }
                    }
                }
            }
        });
    },

    sincronizar: async () => {
        const btn = document.getElementById('btn-sync-billing');
        const icon = document.getElementById('sync-icon-billing');
        if (!btn || btn.disabled) return;

        try {
            btn.disabled = true;
            btn.classList.add('opacity-50');
            icon.classList.add('fa-spin');
            mostrarNotificacion('Sincronizando billing desde Mercado Libre...', 'info');

            const { data, error } = await supabase.functions.invoke('sync-meli', {
                body: { action: 'sync-billing' }
            });

            if (error) throw error;

            if (data?.success) {
                mostrarNotificacion(`Billing sincronizado: ${data.periodos} periodos, ${data.detalles} registros`, 'success');
                await moduloBilling.cargarDatos();
            } else {
                mostrarNotificacion(data?.error || 'Error al sincronizar billing', 'error');
            }

        } catch (error) {
            console.error('Error sincronizando billing:', error);
            mostrarNotificacion('Error al sincronizar billing', 'error');
        } finally {
            btn.disabled = false;
            btn.classList.remove('opacity-50');
            icon.classList.remove('fa-spin');
        }
    },

    generarPDF: () => {
        const periodo = periodos.find(p => p.periodo_key === periodoSeleccionado);
        if (!periodo) {
            mostrarNotificacion('Selecciona un periodo primero', 'warning');
            return;
        }

        const mesNombre = new Date(periodo.anio, (periodo.mes || 1) - 1).toLocaleString('es-AR', { month: 'long', year: 'numeric' });
        const fmt = (n) => Math.abs(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        // Agrupar detalle por tipo
        const porTipo = {};
        detalle.forEach(d => {
            const tipo = d.tipo_cargo || 'OTRO';
            if (!porTipo[tipo]) porTipo[tipo] = { count: 0, total: 0 };
            porTipo[tipo].count++;
            porTipo[tipo].total += (d.monto || 0);
        });

        const ventana = window.open('', '_blank');
        ventana.document.write(`<!DOCTYPE html>
<html><head>
<title>Billing ML - ${mesNombre}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #333; padding: 20px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1a56db; padding-bottom: 12px; margin-bottom: 16px; }
    .header h1 { font-size: 18px; color: #1a56db; }
    .kpis { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
    .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 14px; }
    .kpi .label { font-size: 9px; color: #64748b; text-transform: uppercase; }
    .kpi .value { font-size: 14px; font-weight: 700; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
    td { padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .total-row { background: #1a56db !important; color: white; font-weight: 700; }
    .total-row td { border: none; padding: 6px 8px; }
    .no-print { margin-top: 16px; text-align: center; }
    @media print { .no-print { display: none !important; } body { padding: 10px; } }
</style>
</head><body>
<div class="header">
    <div>
        <h1>Resumen de Costos - Mercado Libre</h1>
        <p style="color:#64748b; margin-top:4px;">${mesNombre}</p>
    </div>
    <div style="font-size:11px; color:#666; text-align:right;">${fecha}</div>
</div>
<div class="kpis">
    <div class="kpi"><div class="label">Total General</div><div class="value" style="color:#dc2626">$ ${fmt(periodo.total_general)}</div></div>
    <div class="kpi"><div class="label">Comisiones</div><div class="value">$ ${fmt(periodo.total_comisiones)}</div></div>
    <div class="kpi"><div class="label">Cargos Fijos</div><div class="value">$ ${fmt(periodo.total_cargos_fijos)}</div></div>
    <div class="kpi"><div class="label">Envios</div><div class="value">$ ${fmt(periodo.total_envios)}</div></div>
    <div class="kpi"><div class="label">Publicidad</div><div class="value">$ ${fmt(periodo.total_publicidad)}</div></div>
    <div class="kpi"><div class="label">Impuestos</div><div class="value">$ ${fmt(periodo.total_impuestos)}</div></div>
    <div class="kpi"><div class="label">Reembolsos</div><div class="value" style="color:#16a34a">$ ${fmt(periodo.total_reembolsos)}</div></div>
</div>

<h3 style="font-size:12px; color:#374151; margin-bottom:8px;">Resumen por Tipo de Cargo</h3>
<table>
    <thead>
        <tr>
            <th>Tipo de Cargo</th>
            <th class="num">Cantidad</th>
            <th class="num">Monto Total</th>
        </tr>
    </thead>
    <tbody>
        ${Object.entries(porTipo).sort((a, b) => a[1].total - b[1].total).map(([tipo, data]) => `
        <tr>
            <td>${tipo}</td>
            <td class="num">${data.count}</td>
            <td class="num" style="font-weight:600">$ ${fmt(data.total)}</td>
        </tr>`).join('')}
        <tr class="total-row">
            <td>TOTAL</td>
            <td class="num">${detalle.length}</td>
            <td class="num">$ ${fmt(periodo.total_general)}</td>
        </tr>
    </tbody>
</table>

<div class="no-print">
    <button onclick="window.print()" style="padding:8px 24px; background:#1a56db; color:white; border:none; border-radius:6px; font-size:13px; cursor:pointer;">Imprimir / Guardar PDF</button>
</div>
</body></html>`);
        ventana.document.close();
    }
};

window.moduloBilling = moduloBilling;
