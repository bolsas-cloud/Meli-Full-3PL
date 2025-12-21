// ============================================
// MODULO: Dashboard de Ventas
// ============================================
// Muestra KPIs de ventas, publicidad y graficos
// de tendencias con datos de Supabase
// ============================================

import { supabase } from '../config.js';
import { mostrarNotificacion, formatearMoneda, formatearFecha, formatearHora, formatearPorcentaje, formatearNumero } from '../utils.js';

// Estado local del modulo
let filtros = {
    desde: null,
    hasta: null,
    periodo: 'mes_actual'
};
let kpis = {};
let ventasDiarias = [];
let topProductos = [];
let ultimaActualizacion = null;
let chartInstance = null;

export const moduloDashboard = {

    // ============================================
    // RENDER: Dibuja la interfaz
    // ============================================
    render: async (contenedor) => {
        // Calcular fechas por defecto (mes actual)
        const hoy = new Date();
        filtros.hasta = hoy.toISOString().split('T')[0];
        filtros.desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];

        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">

                <!-- Panel de Filtros -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div class="flex flex-wrap items-center gap-3">
                        <span class="text-sm font-medium text-gray-600">Periodo:</span>
                        <div class="flex flex-wrap gap-2">
                            <button onclick="moduloDashboard.aplicarFiltro('hoy')"
                                    class="btn-filtro px-3 py-1.5 text-sm rounded-lg border transition-colors"
                                    data-periodo="hoy">
                                Hoy
                            </button>
                            <button onclick="moduloDashboard.aplicarFiltro('ayer')"
                                    class="btn-filtro px-3 py-1.5 text-sm rounded-lg border transition-colors"
                                    data-periodo="ayer">
                                Ayer
                            </button>
                            <button onclick="moduloDashboard.aplicarFiltro('7dias')"
                                    class="btn-filtro px-3 py-1.5 text-sm rounded-lg border transition-colors"
                                    data-periodo="7dias">
                                7 dias
                            </button>
                            <button onclick="moduloDashboard.aplicarFiltro('mes_actual')"
                                    class="btn-filtro px-3 py-1.5 text-sm rounded-lg border transition-colors active"
                                    data-periodo="mes_actual">
                                Mes actual
                            </button>
                            <button onclick="moduloDashboard.aplicarFiltro('mes_anterior')"
                                    class="btn-filtro px-3 py-1.5 text-sm rounded-lg border transition-colors"
                                    data-periodo="mes_anterior">
                                Mes anterior
                            </button>
                        </div>

                        <div class="flex items-center gap-2 ml-auto">
                            <input type="date" id="filtro-desde" value="${filtros.desde}"
                                   class="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                            <span class="text-gray-400">-</span>
                            <input type="date" id="filtro-hasta" value="${filtros.hasta}"
                                   class="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                            <button onclick="moduloDashboard.aplicarFiltroPersonalizado()"
                                    class="bg-brand text-white px-3 py-1.5 text-sm rounded-lg hover:bg-brand-dark transition-colors">
                                Aplicar
                            </button>
                        </div>
                    </div>

                    <div class="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500">
                        <span id="info-periodo">Mostrando: ${formatearFecha(filtros.desde)} - ${formatearFecha(filtros.hasta)}</span>
                        <div class="flex items-center gap-3">
                            <span id="info-actualizacion">
                                <i class="fas fa-clock mr-1"></i>
                                Cargando...
                            </span>
                            <button type="button"
                                    onclick="moduloDashboard.sincronizarDatos()"
                                    id="btn-sync"
                                    class="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                                    title="Sincronizar ordenes y stock desde Mercado Libre">
                                <i class="fas fa-sync-alt" id="sync-icon"></i>
                                <span>Sincronizar ML</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- KPIs Cards -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" id="kpis-container">
                    <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div class="flex items-center justify-between">
                            <p class="text-xs font-bold text-gray-400 uppercase">Ventas Netas</p>
                            <i class="fas fa-dollar-sign text-green-500"></i>
                        </div>
                        <p class="text-2xl font-bold text-gray-800 mt-2" id="kpi-ventas">-</p>
                        <p class="text-xs text-gray-500 mt-1" id="kpi-items">- items vendidos</p>
                    </div>

                    <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div class="flex items-center justify-between">
                            <p class="text-xs font-bold text-gray-400 uppercase">Ordenes</p>
                            <i class="fas fa-shopping-cart text-blue-500"></i>
                        </div>
                        <p class="text-2xl font-bold text-gray-800 mt-2" id="kpi-ordenes">-</p>
                        <p class="text-xs text-gray-500 mt-1">ordenes confirmadas</p>
                    </div>

                    <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div class="flex items-center justify-between">
                            <p class="text-xs font-bold text-gray-400 uppercase">Costo Meli</p>
                            <i class="fas fa-hand-holding-usd text-yellow-500"></i>
                        </div>
                        <p class="text-2xl font-bold text-gray-800 mt-2" id="kpi-costo-meli">-</p>
                        <p class="text-xs text-gray-500 mt-1">comisiones + envio (prom)</p>
                    </div>

                    <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div class="flex items-center justify-between">
                            <p class="text-xs font-bold text-gray-400 uppercase">Publicidad</p>
                            <i class="fas fa-bullhorn text-orange-500"></i>
                        </div>
                        <p class="text-2xl font-bold text-gray-800 mt-2" id="kpi-publicidad">-</p>
                        <p class="text-xs text-gray-500 mt-1">inversion en ads</p>
                    </div>

                    <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <div class="flex items-center justify-between">
                            <p class="text-xs font-bold text-gray-400 uppercase">ACOS</p>
                            <i class="fas fa-percentage text-purple-500"></i>
                        </div>
                        <p class="text-2xl font-bold text-gray-800 mt-2" id="kpi-acos">-</p>
                        <p class="text-xs text-gray-500 mt-1">costo publicitario / ventas</p>
                    </div>
                </div>

                <!-- Grafico -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <i class="fas fa-chart-bar text-brand"></i>
                        Ventas vs Publicidad por Dia
                    </h3>
                    <div class="relative" style="height: 350px;">
                        <canvas id="chart-ventas"></canvas>
                    </div>
                </div>

                <!-- Top Productos -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div class="p-4 border-b border-gray-100">
                        <h3 class="font-bold text-gray-800 flex items-center gap-2">
                            <i class="fas fa-trophy text-yellow-500"></i>
                            Top 15 Productos Mas Vendidos
                        </h3>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-100">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">#</th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">SKU</th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Producto</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Cantidad</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Total Neto</th>
                                </tr>
                            </thead>
                            <tbody id="tabla-top-productos" class="divide-y divide-gray-100 text-sm">
                                <tr>
                                    <td colspan="5" class="px-4 py-8 text-center text-gray-400">
                                        <i class="fas fa-spinner fa-spin fa-2x mb-2"></i>
                                        <p>Cargando datos...</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        `;

        // Estilos para botones de filtro
        const style = document.createElement('style');
        style.textContent = `
            .btn-filtro { border-color: #e5e7eb; background: white; color: #374151; }
            .btn-filtro:hover { background: #f3f4f6; }
            .btn-filtro.active { background: #4EAB87; color: white; border-color: #4EAB87; }
        `;
        document.head.appendChild(style);

        // Cargar datos
        await moduloDashboard.cargarDatos();

        // Exponer modulo en window
        window.moduloDashboard = moduloDashboard;
    },

    // ============================================
    // CARGAR DATOS: Obtiene KPIs y datos de Supabase
    // ============================================
    cargarDatos: async () => {
        try {
            // Cargar en paralelo
            const [kpisResult, ventasResult, topResult] = await Promise.all([
                supabase.rpc('obtener_kpis_dashboard', {
                    p_fecha_desde: filtros.desde,
                    p_fecha_hasta: filtros.hasta
                }),
                supabase.rpc('obtener_ventas_diarias', {
                    p_fecha_desde: filtros.desde,
                    p_fecha_hasta: filtros.hasta
                }),
                supabase.rpc('obtener_top_productos', {
                    p_fecha_desde: filtros.desde,
                    p_fecha_hasta: filtros.hasta,
                    p_limite: 15
                })
            ]);

            // Procesar KPIs
            if (kpisResult.error) {
                console.error('Error en KPIs:', kpisResult.error);
                // Fallback: calcular en JS si RPC no existe
                await moduloDashboard.cargarDatosFallback();
                return;
            }

            if (kpisResult.data && kpisResult.data.length > 0) {
                kpis = kpisResult.data[0];
                ultimaActualizacion = {
                    ordenes: kpis.ultima_actualizacion_ordenes,
                    publicidad: kpis.ultima_actualizacion_publicidad
                };
            }

            // Procesar ventas diarias
            if (!ventasResult.error && ventasResult.data) {
                ventasDiarias = ventasResult.data;
            }

            // Procesar top productos
            if (!topResult.error && topResult.data) {
                topProductos = topResult.data;
            }

            // Pintar UI
            moduloDashboard.pintarKPIs();
            moduloDashboard.pintarGrafico();
            moduloDashboard.pintarTablaTop();
            moduloDashboard.actualizarInfoActualizacion();

        } catch (error) {
            console.error('Error cargando datos:', error);
            mostrarNotificacion('Error cargando datos del dashboard', 'error');
            // Intentar fallback
            await moduloDashboard.cargarDatosFallback();
        }
    },

    // ============================================
    // FALLBACK: Si las funciones RPC no existen
    // ============================================
    cargarDatosFallback: async () => {
        console.log('Usando fallback JS para cargar datos...');

        try {
            // Obtener ordenes del periodo
            const { data: ordenes, error: errorOrdenes } = await supabase
                .from('ordenes_meli')
                .select('id_orden, neto_recibido, cantidad, fecha_pago, fecha_creacion, id_item, titulo_item, sku, pct_costo_meli')
                .or(`fecha_pago.gte.${filtros.desde},fecha_creacion.gte.${filtros.desde}`)
                .or(`fecha_pago.lte.${filtros.hasta},fecha_creacion.lte.${filtros.hasta}`);

            // Obtener publicidad del periodo
            const { data: publicidad, error: errorPub } = await supabase
                .from('costos_publicidad')
                .select('fecha, costo_diario')
                .gte('fecha', filtros.desde)
                .lte('fecha', filtros.hasta);

            // Calcular KPIs
            if (!errorOrdenes && ordenes) {
                const ordenesUnicas = new Set(ordenes.map(o => o.id_orden));
                kpis.ventas_netas = ordenes.reduce((sum, o) => sum + (parseFloat(o.neto_recibido) || 0), 0);
                kpis.cantidad_ordenes = ordenesUnicas.size;
                kpis.items_vendidos = ordenes.reduce((sum, o) => sum + (parseInt(o.cantidad) || 0), 0);

                // Ultima actualizacion
                const fechas = ordenes.map(o => new Date(o.fecha_creacion)).filter(d => !isNaN(d));
                if (fechas.length > 0) {
                    ultimaActualizacion = { ordenes: new Date(Math.max(...fechas)).toISOString() };
                }
            }

            if (!errorPub && publicidad) {
                kpis.inversion_publicidad = publicidad.reduce((sum, p) => sum + (parseFloat(p.costo_diario) || 0), 0);

                // Agregar estimacion para dias faltantes
                const ultimoCosto = publicidad.length > 0 ? publicidad[publicidad.length - 1].costo_diario : 0;
                const hoy = new Date();
                const ultimaFechaPub = publicidad.length > 0 ? new Date(publicidad[publicidad.length - 1].fecha) : null;

                if (ultimaFechaPub) {
                    const diasFaltantes = Math.floor((hoy - ultimaFechaPub) / (1000 * 60 * 60 * 24));
                    if (diasFaltantes > 0 && diasFaltantes <= 3) {
                        kpis.inversion_publicidad += ultimoCosto * diasFaltantes;
                    }
                }
            }

            // Calcular ACOS
            kpis.acos = kpis.ventas_netas > 0
                ? ((kpis.inversion_publicidad || 0) / kpis.ventas_netas) * 100
                : 0;

            // Calcular % promedio de costo Meli
            if (!errorOrdenes && ordenes) {
                const ordenesConCosto = ordenes.filter(o => o.pct_costo_meli != null);
                if (ordenesConCosto.length > 0) {
                    const sumaCostos = ordenesConCosto.reduce((sum, o) => sum + parseFloat(o.pct_costo_meli), 0);
                    kpis.pct_costo_meli_promedio = sumaCostos / ordenesConCosto.length;
                } else {
                    kpis.pct_costo_meli_promedio = 0;
                }
            }

            // Agrupar ventas por dia para grafico
            if (!errorOrdenes && ordenes) {
                const ventasPorDia = {};
                ordenes.forEach(o => {
                    const fecha = (o.fecha_pago || o.fecha_creacion || '').split('T')[0];
                    if (!fecha) return;
                    if (!ventasPorDia[fecha]) {
                        ventasPorDia[fecha] = { ventas: 0, ordenes: new Set() };
                    }
                    ventasPorDia[fecha].ventas += parseFloat(o.neto_recibido) || 0;
                    ventasPorDia[fecha].ordenes.add(o.id_orden);
                });

                // Publicidad por dia
                const pubPorDia = {};
                if (publicidad) {
                    publicidad.forEach(p => {
                        pubPorDia[p.fecha] = parseFloat(p.costo_diario) || 0;
                    });
                }

                // Generar array
                ventasDiarias = Object.keys(ventasPorDia).sort().map(fecha => ({
                    fecha,
                    ventas: ventasPorDia[fecha].ventas,
                    ordenes: ventasPorDia[fecha].ordenes.size,
                    publicidad: pubPorDia[fecha] || 0
                }));
            }

            // Agrupar top productos
            if (!errorOrdenes && ordenes) {
                const productoMap = {};
                ordenes.forEach(o => {
                    const key = o.id_item || o.sku || 'N/A';
                    if (!productoMap[key]) {
                        productoMap[key] = {
                            id_item: o.id_item,
                            sku: o.sku || 'N/A',
                            titulo: o.titulo_item || 'Sin titulo',
                            cantidad_vendida: 0,
                            total_vendido: 0
                        };
                    }
                    productoMap[key].cantidad_vendida += parseInt(o.cantidad) || 0;
                    productoMap[key].total_vendido += parseFloat(o.neto_recibido) || 0;
                });

                topProductos = Object.values(productoMap)
                    .sort((a, b) => b.cantidad_vendida - a.cantidad_vendida)
                    .slice(0, 15);
            }

            // Pintar UI
            moduloDashboard.pintarKPIs();
            moduloDashboard.pintarGrafico();
            moduloDashboard.pintarTablaTop();
            moduloDashboard.actualizarInfoActualizacion();

            mostrarNotificacion('Datos cargados (modo fallback)', 'info');

        } catch (error) {
            console.error('Error en fallback:', error);
            mostrarNotificacion('Error cargando datos', 'error');
        }
    },

    // ============================================
    // PINTAR KPIs
    // ============================================
    pintarKPIs: () => {
        document.getElementById('kpi-ventas').textContent = formatearMoneda(kpis.ventas_netas || 0);
        document.getElementById('kpi-items').textContent = `${formatearNumero(kpis.items_vendidos || 0)} items vendidos`;
        document.getElementById('kpi-ordenes').textContent = formatearNumero(kpis.cantidad_ordenes || 0);
        document.getElementById('kpi-costo-meli').textContent = formatearPorcentaje(kpis.pct_costo_meli_promedio || 0);
        document.getElementById('kpi-publicidad').textContent = formatearMoneda(kpis.inversion_publicidad || 0);
        document.getElementById('kpi-acos').textContent = formatearPorcentaje(kpis.acos || 0);
    },

    // ============================================
    // PINTAR GRAFICO: Chart.js combo (barras + linea)
    // ============================================
    pintarGrafico: () => {
        const canvas = document.getElementById('chart-ventas');
        if (!canvas) return;

        // Destruir grafico anterior si existe
        if (chartInstance) {
            chartInstance.destroy();
        }

        // Preparar datos
        const labels = ventasDiarias.map(d => {
            const fecha = new Date(d.fecha + 'T12:00:00');
            return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
        });

        const ventasData = ventasDiarias.map(d => d.ventas || 0);
        const publicidadData = ventasDiarias.map(d => d.publicidad || 0);

        // Crear grafico
        chartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Ventas Netas',
                        data: ventasData,
                        backgroundColor: 'rgba(78, 171, 135, 0.7)',
                        borderColor: 'rgba(78, 171, 135, 1)',
                        borderWidth: 1,
                        order: 2
                    },
                    {
                        label: 'Publicidad',
                        data: publicidadData,
                        type: 'line',
                        borderColor: 'rgba(249, 115, 22, 1)',
                        backgroundColor: 'rgba(249, 115, 22, 0.1)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: 'rgba(249, 115, 22, 1)',
                        fill: true,
                        tension: 0.3,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed.y;
                                return `${context.dataset.label}: ${formatearMoneda(value)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Monto ($)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '$' + (value / 1000).toFixed(0) + 'k';
                            }
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    },

    // ============================================
    // PINTAR TABLA TOP PRODUCTOS
    // ============================================
    pintarTablaTop: () => {
        const tbody = document.getElementById('tabla-top-productos');
        if (!tbody) return;

        if (topProductos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-4 py-8 text-center text-gray-400">
                        <i class="fas fa-inbox fa-2x mb-2"></i>
                        <p>No hay datos de ventas en el periodo seleccionado</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = topProductos.map((p, idx) => {
            // Mostrar SKU si existe, sino mostrar ID de item abreviado
            let skuDisplay = p.sku;
            if (!skuDisplay || skuDisplay === 'N/A') {
                // Mostrar ultimos 8 caracteres del id_item si no hay SKU
                skuDisplay = p.id_item ? `...${p.id_item.slice(-8)}` : '-';
            }

            return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3 font-bold text-gray-400 w-12">${idx + 1}</td>
                <td class="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">${skuDisplay}</td>
                <td class="px-4 py-3">
                    <div class="truncate" style="max-width: 500px;" title="${(p.titulo || '').replace(/"/g, '&quot;')}">${p.titulo || '-'}</div>
                </td>
                <td class="px-4 py-3 text-right font-medium whitespace-nowrap">${formatearNumero(p.cantidad_vendida || 0)}</td>
                <td class="px-4 py-3 text-right font-medium text-green-600 whitespace-nowrap">${formatearMoneda(p.total_vendido || 0)}</td>
            </tr>
        `;
        }).join('');
    },

    // ============================================
    // ACTUALIZAR INFO DE ACTUALIZACION
    // ============================================
    actualizarInfoActualizacion: () => {
        const infoEl = document.getElementById('info-actualizacion');
        if (!infoEl) return;

        if (ultimaActualizacion && ultimaActualizacion.ordenes) {
            const fechaOrden = formatearFecha(ultimaActualizacion.ordenes);
            const horaOrden = formatearHora(ultimaActualizacion.ordenes);
            infoEl.innerHTML = `
                <i class="fas fa-clock mr-1"></i>
                Ultima orden: ${fechaOrden} ${horaOrden}
            `;
        } else {
            infoEl.innerHTML = `
                <i class="fas fa-info-circle mr-1"></i>
                Sin datos de actualizacion
            `;
        }
    },

    // ============================================
    // APLICAR FILTRO: Periodos predefinidos
    // ============================================
    aplicarFiltro: async (periodo) => {
        const hoy = new Date();
        let desde, hasta;

        switch (periodo) {
            case 'hoy':
                desde = hasta = hoy.toISOString().split('T')[0];
                break;

            case 'ayer':
                const ayer = new Date(hoy);
                ayer.setDate(ayer.getDate() - 1);
                desde = hasta = ayer.toISOString().split('T')[0];
                break;

            case '7dias':
                const hace7 = new Date(hoy);
                hace7.setDate(hace7.getDate() - 6);
                desde = hace7.toISOString().split('T')[0];
                hasta = hoy.toISOString().split('T')[0];
                break;

            case 'mes_actual':
                desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
                hasta = hoy.toISOString().split('T')[0];
                break;

            case 'mes_anterior':
                const inicioMesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
                const finMesAnt = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
                desde = inicioMesAnt.toISOString().split('T')[0];
                hasta = finMesAnt.toISOString().split('T')[0];
                break;

            default:
                desde = filtros.desde;
                hasta = filtros.hasta;
        }

        // Actualizar filtros
        filtros.desde = desde;
        filtros.hasta = hasta;
        filtros.periodo = periodo;

        // Actualizar inputs
        document.getElementById('filtro-desde').value = desde;
        document.getElementById('filtro-hasta').value = hasta;

        // Actualizar botones activos
        document.querySelectorAll('.btn-filtro').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.periodo === periodo) {
                btn.classList.add('active');
            }
        });

        // Actualizar info
        document.getElementById('info-periodo').textContent =
            `Mostrando: ${formatearFecha(desde)} - ${formatearFecha(hasta)}`;

        // Recargar datos
        mostrarNotificacion('Cargando datos...', 'info');
        await moduloDashboard.cargarDatos();
    },

    // ============================================
    // APLICAR FILTRO PERSONALIZADO
    // ============================================
    aplicarFiltroPersonalizado: async () => {
        const desde = document.getElementById('filtro-desde').value;
        const hasta = document.getElementById('filtro-hasta').value;

        if (!desde || !hasta) {
            mostrarNotificacion('Selecciona ambas fechas', 'warning');
            return;
        }

        if (desde > hasta) {
            mostrarNotificacion('La fecha desde debe ser anterior a hasta', 'warning');
            return;
        }

        // Quitar active de todos los botones
        document.querySelectorAll('.btn-filtro').forEach(btn => btn.classList.remove('active'));

        // Actualizar filtros
        filtros.desde = desde;
        filtros.hasta = hasta;
        filtros.periodo = 'personalizado';

        // Actualizar info
        document.getElementById('info-periodo').textContent =
            `Mostrando: ${formatearFecha(desde)} - ${formatearFecha(hasta)}`;

        // Recargar datos
        mostrarNotificacion('Cargando datos...', 'info');
        await moduloDashboard.cargarDatos();
    },

    // ============================================
    // SINCRONIZAR DATOS: Llama a Edge Function
    // ============================================
    sincronizarDatos: async () => {
        const btn = document.getElementById('btn-sync');
        const icon = document.getElementById('sync-icon');

        if (!btn || btn.disabled) return;

        try {
            // Deshabilitar boton y mostrar spinner
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            icon.classList.add('fa-spin');

            mostrarNotificacion('Sincronizando ordenes desde Mercado Libre...', 'info');

            // Llamar a la Edge Function - Solo ordenes para el Dashboard
            // (sync incremental desde ultima orden existente)
            const { data, error } = await supabase.functions.invoke('sync-meli', {
                body: { action: 'sync-orders' }
            });

            if (error) throw error;

            // Mostrar resultado
            const ordenes = data?.nuevas || 0;
            const total = data?.total || 0;

            if (ordenes > 0) {
                mostrarNotificacion(
                    `Sincronizacion completada: ${ordenes} ordenes nuevas de ${total} revisadas`,
                    'success'
                );
            } else {
                mostrarNotificacion('Sin ordenes nuevas', 'info');
            }

            // Recargar datos del dashboard
            await moduloDashboard.cargarDatos();

        } catch (error) {
            console.error('Error sincronizando:', error);

            // Manejar errores especificos
            if (error.message?.includes('token') || error.message?.includes('401')) {
                mostrarNotificacion('Token de ML expirado. Reconecta desde Configuracion.', 'error');
            } else if (error.message?.includes('Edge Function')) {
                mostrarNotificacion('La Edge Function no esta desplegada. Ejecuta: npx supabase functions deploy sync-meli', 'warning');
            } else {
                mostrarNotificacion(`Error: ${error.message || 'No se pudo sincronizar'}`, 'error');
            }
        } finally {
            // Restaurar boton
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            if (icon) {
                icon.classList.remove('fa-spin');
            }
        }
    }
};

// Exponer en window para el HTML
window.moduloDashboard = moduloDashboard;
