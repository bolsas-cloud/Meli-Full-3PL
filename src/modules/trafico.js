// ============================================
// MÓDULO TRÁFICO - Visitas y Performance
// Dashboard de tráfico de publicaciones
// ============================================
import { supabase } from '../config.js';
import { mostrarNotificacion, formatearFecha, formatearNumero, formatearMoneda } from '../utils.js';

let metricas = null;
let chartVisitas = null;
let filtroDias = 30;

export const moduloTrafico = {

    render: async (contenedor) => {
        contenedor.innerHTML = `
        <div class="p-4 sm:p-8 space-y-6 overflow-y-auto h-full">

            <!-- Header -->
            <div class="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 class="text-xl font-bold text-gray-800">
                        <i class="fas fa-eye text-brand mr-2"></i>Tráfico y Visitas
                    </h2>
                    <p class="text-sm text-gray-500 mt-1">Visitas, conversión y performance de publicaciones</p>
                </div>
                <div class="flex items-center gap-2">
                    <select id="traf-filtro-dias" onchange="moduloTrafico.cambiarPeriodo(this.value)"
                        class="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none">
                        <option value="7">Últimos 7 días</option>
                        <option value="30" selected>Últimos 30 días</option>
                        <option value="90">Últimos 90 días</option>
                    </select>
                    <button onclick="moduloTrafico.syncVisitas()" id="btn-sync-visitas"
                        class="px-3 py-1.5 bg-brand text-white text-sm rounded-lg hover:bg-brand-dark transition-colors flex items-center gap-2">
                        <i class="fas fa-sync-alt"></i> Sync Visitas
                    </button>
                    <button onclick="moduloTrafico.mostrarModalEvento()"
                        class="px-3 py-1.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-2">
                        <i class="fas fa-flag"></i> Evento
                    </button>
                </div>
            </div>

            <!-- KPIs -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" id="traf-kpis">
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 animate-pulse"><div class="h-4 bg-gray-200 rounded w-3/4 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/2"></div></div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 animate-pulse"><div class="h-4 bg-gray-200 rounded w-3/4 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/2"></div></div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 animate-pulse"><div class="h-4 bg-gray-200 rounded w-3/4 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/2"></div></div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 animate-pulse"><div class="h-4 bg-gray-200 rounded w-3/4 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/2"></div></div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 animate-pulse"><div class="h-4 bg-gray-200 rounded w-3/4 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/2"></div></div>
            </div>

            <!-- Gráfico visitas diarias -->
            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                <h3 class="text-sm font-bold text-gray-700 mb-4"><i class="fas fa-chart-area text-brand mr-2"></i>Visitas Diarias</h3>
                <div class="relative" style="height: 320px;"><canvas id="chart-visitas-diarias"></canvas></div>
                <p class="text-[10px] text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i>Los datos de visitas de ML tienen hasta 48hs de latencia</p>
            </div>

            <!-- Tabla publicaciones + Eventos -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Tabla publicaciones -->
                <div class="lg:col-span-2 bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                    <h3 class="text-sm font-bold text-gray-700 mb-4"><i class="fas fa-list-ol text-orange-500 mr-2"></i>Publicaciones por Visitas</h3>
                    <div id="traf-tabla-pubs" class="overflow-x-auto">
                        <p class="text-sm text-gray-400 text-center py-4">Cargando...</p>
                    </div>
                </div>
                <!-- Eventos recientes -->
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                    <h3 class="text-sm font-bold text-gray-700 mb-4"><i class="fas fa-flag text-amber-500 mr-2"></i>Eventos</h3>
                    <div id="traf-eventos" class="space-y-2">
                        <p class="text-sm text-gray-400 text-center py-4">Sin eventos en el período</p>
                    </div>
                </div>
            </div>

            <!-- Modal evento -->
            <div id="modal-evento" class="fixed inset-0 z-50 hidden" aria-modal="true">
                <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onclick="moduloTrafico.cerrarModalEvento()"></div>
                <div class="fixed inset-0 z-10 overflow-y-auto p-4 flex items-center justify-center">
                    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md animate-fade-in">
                        <div class="bg-amber-500 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
                            <h3 class="font-bold text-lg">Registrar Evento</h3>
                            <button onclick="moduloTrafico.cerrarModalEvento()" class="text-white/80 hover:text-white"><i class="fas fa-times text-xl"></i></button>
                        </div>
                        <div class="p-6 space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                                <input type="date" id="evento-fecha" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                <select id="evento-tipo" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent">
                                    <option value="promocion">Promoción</option>
                                    <option value="estrategia">Estrategia</option>
                                    <option value="mercado">Mercado / Fecha especial</option>
                                    <option value="competencia">Competencia</option>
                                    <option value="otro">Otro</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Título</label>
                                <input type="text" id="evento-titulo" placeholder="Ej: Hot Sale -20%, Subí presupuesto ads..." class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
                                <textarea id="evento-descripcion" rows="2" placeholder="Detalles adicionales..." class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent resize-none"></textarea>
                            </div>
                        </div>
                        <div class="bg-gray-50 px-6 py-4 flex justify-end gap-3 rounded-b-xl">
                            <button onclick="moduloTrafico.cerrarModalEvento()" class="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">Cancelar</button>
                            <button onclick="moduloTrafico.guardarEvento()" class="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center gap-2"><i class="fas fa-save"></i> Guardar</button>
                        </div>
                    </div>
                </div>
            </div>

        </div>`;

        window.moduloTrafico = moduloTrafico;
        await moduloTrafico.cargarDatos();
    },

    cargarDatos: async () => {
        try {
            const { data, error } = await supabase.rpc('rpc_metricas_trafico', { p_dias: filtroDias });
            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || 'Error en RPC');

            metricas = data;
            moduloTrafico.pintarKPIs();
            moduloTrafico.pintarChartVisitas();
            moduloTrafico.pintarTablaPublicaciones();
            moduloTrafico.pintarEventos();
        } catch (error) {
            console.error('Error cargando tráfico:', error);
            mostrarNotificacion('Error al cargar tráfico: ' + error.message, 'error');
        }
    },

    pintarKPIs: () => {
        const t = metricas.totales;
        const tend = metricas.tendencia_pct || 0;
        const container = document.getElementById('traf-kpis');

        const revenueVisita = t.visitas_total > 0 ? Math.round(t.revenue_periodo / t.visitas_total) : 0;
        const tendIcon = tend > 0 ? 'fa-arrow-up text-green-500' : tend < 0 ? 'fa-arrow-down text-red-500' : 'fa-minus text-gray-400';

        const kpiData = [
            { label: 'Visitas', value: formatearNumero(t.visitas_total), sub: `${t.visitas_dia_promedio}/día promedio`, icon: 'fa-eye', color: 'text-blue-500' },
            { label: 'Conversión', value: `${t.conversion_pct}%`, sub: `${t.ordenes_periodo} órdenes`, icon: 'fa-shopping-cart', color: t.conversion_pct >= 3 ? 'text-green-500' : t.conversion_pct >= 1 ? 'text-yellow-500' : 'text-red-500' },
            { label: 'Revenue', value: formatearMoneda(t.revenue_periodo), sub: `$${formatearNumero(revenueVisita)}/visita`, icon: 'fa-dollar-sign', color: 'text-green-500' },
            { label: 'Tendencia', value: `${tend > 0 ? '+' : ''}${tend}%`, sub: `vs período anterior`, icon: tendIcon, color: tend >= 0 ? 'text-green-500' : 'text-red-500' },
            { label: 'Órdenes', value: formatearNumero(t.ordenes_periodo), sub: `En ${filtroDias} días`, icon: 'fa-receipt', color: 'text-purple-500' },
        ];

        container.innerHTML = kpiData.map(k => `
            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                <div class="flex items-center justify-between">
                    <p class="text-xs font-bold text-gray-400 uppercase">${k.label}</p>
                    <i class="fas ${k.icon} ${k.color}"></i>
                </div>
                <p class="text-2xl font-bold text-gray-800 mt-2">${k.value}</p>
                <p class="text-xs text-gray-500 mt-1">${k.sub}</p>
            </div>
        `).join('');
    },

    pintarChartVisitas: () => {
        if (chartVisitas) chartVisitas.destroy();
        const canvas = document.getElementById('chart-visitas-diarias');
        if (!canvas) return;

        const dias = metricas.por_dia || [];
        const eventos = metricas.eventos || [];
        const labels = dias.map(d => { const dt = new Date(d.fecha); return `${dt.getDate()}/${dt.getMonth() + 1}`; });

        // Mapear eventos a índices del gráfico
        const eventosPorFecha = {};
        eventos.forEach(e => { eventosPorFecha[e.fecha] = e; });

        chartVisitas = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Visitas',
                    data: dias.map(d => d.visitas),
                    backgroundColor: dias.map(d => eventosPorFecha[d.fecha] ? 'rgba(245, 158, 11, 0.8)' : 'rgba(59, 130, 246, 0.7)'),
                    borderColor: dias.map(d => eventosPorFecha[d.fecha] ? 'rgb(245, 158, 11)' : 'rgb(59, 130, 246)'),
                    borderWidth: 1,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            afterBody: function(context) {
                                const idx = context[0].dataIndex;
                                const fecha = dias[idx]?.fecha;
                                const ev = eventosPorFecha[fecha];
                                return ev ? [`\n${ev.tipo}: ${ev.titulo}`] : [];
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Visitas' } }
                }
            }
        });
    },

    pintarTablaPublicaciones: () => {
        const container = document.getElementById('traf-tabla-pubs');
        const pubs = metricas.top_publicaciones || [];

        if (pubs.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Sin datos de visitas. Hacé click en "Sync Visitas".</p>';
            return;
        }

        const scoreColor = (s) => s >= 80 ? 'bg-green-100 text-green-700' : s >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';

        container.innerHTML = `
            <table class="w-full text-xs">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-2 py-2 text-left font-bold text-gray-500 w-8">#</th>
                        <th class="px-2 py-2 text-left font-bold text-gray-500">Publicación</th>
                        <th class="px-2 py-2 text-right font-bold text-gray-500 whitespace-nowrap w-16">Visitas</th>
                        <th class="px-2 py-2 text-right font-bold text-gray-500 whitespace-nowrap w-16">Órdenes</th>
                        <th class="px-2 py-2 text-right font-bold text-gray-500 whitespace-nowrap w-14">Conv.</th>
                        <th class="px-2 py-2 text-center font-bold text-gray-500 whitespace-nowrap w-14">Score</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${pubs.map((p, i) => {
                        const titulo = p.titulo || p.id_publicacion;
                        return `<tr class="hover:bg-gray-50">
                            <td class="px-2 py-2 text-gray-400 font-bold">${i + 1}</td>
                            <td class="px-2 py-2">
                                <a href="${p.permalink || '#'}" target="_blank" class="text-blue-600 hover:underline truncate block" title="${titulo}">${titulo}</a>
                            </td>
                            <td class="px-2 py-2 text-right font-medium whitespace-nowrap">${formatearNumero(p.visitas)}</td>
                            <td class="px-2 py-2 text-right whitespace-nowrap">${p.ordenes}</td>
                            <td class="px-2 py-2 text-right font-medium whitespace-nowrap">${p.conversion_pct}%</td>
                            <td class="px-2 py-2 text-center whitespace-nowrap"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${scoreColor(p.score_ml)}">${p.score_ml || '-'}</span></td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    },

    pintarEventos: () => {
        const container = document.getElementById('traf-eventos');
        const eventos = metricas.eventos || [];

        if (eventos.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Sin eventos. Registrá uno con el botón "Evento".</p>';
            return;
        }

        const tipoColor = { promocion: 'border-l-amber-500 bg-amber-50', estrategia: 'border-l-blue-500 bg-blue-50', mercado: 'border-l-purple-500 bg-purple-50', precio: 'border-l-green-500 bg-green-50', ads: 'border-l-cyan-500 bg-cyan-50', stock: 'border-l-red-500 bg-red-50', publicacion: 'border-l-gray-500 bg-gray-50', competencia: 'border-l-orange-500 bg-orange-50', otro: 'border-l-gray-400 bg-gray-50' };

        container.innerHTML = eventos.map(e => `
            <div class="border-l-4 ${tipoColor[e.tipo] || tipoColor.otro} rounded-r-lg p-2.5">
                <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-[10px] font-bold text-gray-400">${formatearFecha(e.fecha)}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-white/80 font-medium">${e.tipo}</span>
                    ${e.origen === 'automatico' ? '<i class="fas fa-robot text-[10px] text-gray-400" title="Detectado automáticamente"></i>' : ''}
                </div>
                <p class="text-xs font-medium text-gray-700">${e.titulo}</p>
            </div>
        `).join('');
    },

    cambiarPeriodo: async (dias) => {
        filtroDias = parseInt(dias);
        await moduloTrafico.cargarDatos();
    },

    syncVisitas: async () => {
        const btn = document.getElementById('btn-sync-visitas');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sincronizando...';
        try {
            const { data, error } = await supabase.functions.invoke('sync-meli', { body: { action: 'sync-visitas' } });
            if (error) throw error;
            mostrarNotificacion(`Visitas sincronizadas: ${data?.updated || 0} registros`, 'success');
            await moduloTrafico.cargarDatos();
        } catch (error) {
            mostrarNotificacion('Error: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sync Visitas';
        }
    },

    mostrarModalEvento: () => {
        document.getElementById('evento-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('evento-titulo').value = '';
        document.getElementById('evento-descripcion').value = '';
        document.getElementById('modal-evento').classList.remove('hidden');
    },

    cerrarModalEvento: () => {
        document.getElementById('modal-evento').classList.add('hidden');
    },

    guardarEvento: async () => {
        const fecha = document.getElementById('evento-fecha').value;
        const tipo = document.getElementById('evento-tipo').value;
        const titulo = document.getElementById('evento-titulo').value.trim();
        if (!titulo) { mostrarNotificacion('Ingresá un título', 'warning'); return; }

        try {
            const { error } = await supabase.from('eventos_tienda').insert({
                fecha, tipo, titulo,
                descripcion: document.getElementById('evento-descripcion').value.trim() || null,
                origen: 'manual'
            });
            if (error) throw error;
            moduloTrafico.cerrarModalEvento();
            mostrarNotificacion('Evento registrado', 'success');
            await moduloTrafico.cargarDatos();
        } catch (error) {
            mostrarNotificacion('Error: ' + error.message, 'error');
        }
    },

    destroy: () => {
        if (chartVisitas) { chartVisitas.destroy(); chartVisitas = null; }
        metricas = null;
    }
};

window.moduloTrafico = moduloTrafico;
