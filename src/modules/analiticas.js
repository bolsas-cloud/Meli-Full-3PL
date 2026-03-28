// ============================================
// MÓDULO ANALÍTICAS - Métricas de Atención
// Dashboard de analíticas de preguntas y mensajes
// ============================================
import { supabase } from '../config.js';
import { mostrarNotificacion, formatearFecha, formatearNumero } from '../utils.js';

// ---- Estado del módulo ----
let metricas = null;
let recomendaciones = [];
let chartSemanal = null;
let chartCategorias = null;
let filtroDias = 30;

export const moduloAnaliticas = {

    render: async (contenedor) => {
        contenedor.innerHTML = `
        <div class="p-4 sm:p-8 space-y-6 overflow-y-auto h-full">

            <!-- Header -->
            <div class="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 class="text-xl font-bold text-gray-800">
                        <i class="fas fa-chart-line text-brand mr-2"></i>Analíticas de Atención
                    </h2>
                    <p class="text-sm text-gray-500 mt-1">Métricas, patrones y recomendaciones</p>
                </div>
                <div class="flex items-center gap-2">
                    <select id="ana-filtro-dias" onchange="moduloAnaliticas.cambiarPeriodo(this.value)"
                        class="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none">
                        <option value="7">Últimos 7 días</option>
                        <option value="30" selected>Últimos 30 días</option>
                        <option value="90">Últimos 90 días</option>
                        <option value="365">Último año</option>
                    </select>
                    <button onclick="moduloAnaliticas.generarAnalisis()" id="btn-generar-analisis"
                        class="px-3 py-1.5 bg-brand text-white text-sm rounded-lg hover:bg-brand-dark transition-colors flex items-center gap-2">
                        <i class="fas fa-magic"></i> Analizar con IA
                    </button>
                </div>
            </div>

            <!-- KPIs -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" id="ana-kpis">
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 animate-pulse"><div class="h-4 bg-gray-200 rounded w-3/4 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/2"></div></div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 animate-pulse"><div class="h-4 bg-gray-200 rounded w-3/4 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/2"></div></div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 animate-pulse"><div class="h-4 bg-gray-200 rounded w-3/4 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/2"></div></div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 animate-pulse"><div class="h-4 bg-gray-200 rounded w-3/4 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/2"></div></div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 animate-pulse"><div class="h-4 bg-gray-200 rounded w-3/4 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/2"></div></div>
            </div>

            <!-- Gráficos -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                    <h3 class="text-sm font-bold text-gray-700 mb-4"><i class="fas fa-chart-bar text-brand mr-2"></i>Evolución Semanal</h3>
                    <div class="relative" style="height: 300px;"><canvas id="chart-semanal"></canvas></div>
                </div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                    <h3 class="text-sm font-bold text-gray-700 mb-4"><i class="fas fa-tags text-purple-500 mr-2"></i>Por Categoría</h3>
                    <div class="relative" style="height: 300px;"><canvas id="chart-categorias"></canvas></div>
                </div>
            </div>

            <!-- Top publicaciones + Recomendaciones -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                    <h3 class="text-sm font-bold text-gray-700 mb-4"><i class="fas fa-fire text-orange-500 mr-2"></i>Publicaciones con Más Preguntas</h3>
                    <div id="ana-top-publicaciones" class="space-y-2"><p class="text-sm text-gray-400 text-center py-4">Cargando...</p></div>
                </div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                    <h3 class="text-sm font-bold text-gray-700 mb-4"><i class="fas fa-lightbulb text-amber-500 mr-2"></i>Recomendaciones</h3>
                    <div id="ana-recomendaciones" class="space-y-3">
                        <p class="text-sm text-gray-400 text-center py-4">Hacé click en "Analizar con IA" para generar recomendaciones</p>
                    </div>
                </div>
            </div>

        </div>`;

        window.moduloAnaliticas = moduloAnaliticas;
        await moduloAnaliticas.cargarDatos();
    },

    cargarDatos: async () => {
        try {
            const { data, error } = await supabase.rpc('rpc_metricas_atencion', { p_dias: filtroDias });
            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || 'Error en RPC');

            metricas = data;
            moduloAnaliticas.pintarKPIs();
            moduloAnaliticas.pintarChartSemanal();
            moduloAnaliticas.pintarChartCategorias();
            moduloAnaliticas.pintarTopPublicaciones();
            moduloAnaliticas.cargarRecomendaciones();
        } catch (error) {
            console.error('Error cargando analíticas:', error);
            mostrarNotificacion('Error al cargar analíticas: ' + error.message, 'error');
        }
    },

    pintarKPIs: () => {
        const t = metricas.totales;
        const container = document.getElementById('ana-kpis');

        const kpiData = [
            { label: 'Total Consultas', value: formatearNumero(t.total_conversaciones), sub: `${t.preguntas} preguntas · ${t.mensajes_postventa} post-venta`, icon: 'fa-comments', color: 'text-blue-500' },
            { label: 'Tasa de Respuesta', value: `${t.tasa_respuesta}%`, sub: `${t.respondidas} de ${t.total_conversaciones}`, icon: 'fa-check-circle', color: t.tasa_respuesta >= 95 ? 'text-green-500' : t.tasa_respuesta >= 80 ? 'text-yellow-500' : 'text-red-500' },
            { label: 'Tiempo Promedio', value: `${t.avg_tiempo_resp_min} min`, sub: `Mediana: ${t.median_tiempo_resp_min} min`, icon: 'fa-clock', color: t.avg_tiempo_resp_min <= 30 ? 'text-green-500' : t.avg_tiempo_resp_min <= 120 ? 'text-yellow-500' : 'text-red-500' },
            { label: 'Sin Responder', value: formatearNumero(t.sin_responder), sub: t.sin_responder > 0 ? 'Requiere atención' : 'Todo respondido', icon: 'fa-exclamation-triangle', color: t.sin_responder > 0 ? 'text-red-500' : 'text-green-500' },
            { label: 'Preguntas/Día', value: (t.preguntas / Math.max(filtroDias, 1)).toFixed(1), sub: `${t.preguntas} en ${filtroDias} días`, icon: 'fa-chart-line', color: 'text-purple-500' },
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

    pintarChartSemanal: () => {
        if (chartSemanal) chartSemanal.destroy();
        const canvas = document.getElementById('chart-semanal');
        if (!canvas) return;

        const semanas = metricas.por_semana || [];
        const labels = semanas.map(s => {
            const d = new Date(s.semana);
            return `${d.getDate()}/${d.getMonth() + 1}`;
        });

        chartSemanal = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Preguntas',
                        data: semanas.map(s => s.total),
                        backgroundColor: 'rgba(59, 130, 246, 0.7)',
                        borderColor: 'rgb(59, 130, 246)',
                        borderWidth: 1,
                        order: 2
                    },
                    {
                        label: 'Respondidas',
                        data: semanas.map(s => s.respondidas),
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderColor: 'rgb(16, 185, 129)',
                        borderWidth: 1,
                        order: 2
                    },
                    {
                        label: 'Tiempo resp. (min)',
                        data: semanas.map(s => s.avg_resp_min),
                        type: 'line',
                        borderColor: 'rgb(245, 158, 11)',
                        borderWidth: 2,
                        pointRadius: 4,
                        tension: 0.3,
                        fill: false,
                        yAxisID: 'y1',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Cantidad' } },
                    y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'Minutos' }, grid: { drawOnChartArea: false } }
                }
            }
        });
    },

    pintarChartCategorias: () => {
        if (chartCategorias) chartCategorias.destroy();
        const canvas = document.getElementById('chart-categorias');
        if (!canvas) return;

        const cats = metricas.por_categoria || [];
        const colores = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6B7280'];

        chartCategorias = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: cats.map(c => c.categoria.replace('_', ' ')),
                datasets: [{
                    data: cats.map(c => c.total),
                    backgroundColor: colores.slice(0, cats.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } } }
            }
        });
    },

    pintarTopPublicaciones: () => {
        const container = document.getElementById('ana-top-publicaciones');
        const pubs = metricas.top_publicaciones || [];

        if (pubs.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Sin datos</p>';
            return;
        }

        const maxPreguntas = pubs[0]?.preguntas || 1;

        container.innerHTML = pubs.map((p, i) => {
            const pct = Math.round((p.preguntas / maxPreguntas) * 100);
            const titulo = p.titulo_publicacion || p.id_publicacion;
            const truncado = titulo.length > 45 ? titulo.substring(0, 45) + '...' : titulo;
            return `
            <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                <span class="text-xs font-bold text-gray-400 w-5 text-right">${i + 1}</span>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-medium text-gray-700 truncate" title="${titulo}">${truncado}</p>
                    <div class="flex items-center gap-2 mt-1">
                        <div class="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div class="bg-brand rounded-full h-1.5" style="width: ${pct}%"></div>
                        </div>
                        <span class="text-[10px] font-bold text-gray-500 whitespace-nowrap">${p.preguntas} preg.</span>
                    </div>
                </div>
                <span class="text-[10px] px-1.5 py-0.5 rounded ${p.avg_resp_min <= 30 ? 'bg-green-100 text-green-700' : p.avg_resp_min <= 120 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">${p.avg_resp_min ? p.avg_resp_min + ' min' : 'N/A'}</span>
            </div>`;
        }).join('');
    },

    cargarRecomendaciones: async () => {
        const container = document.getElementById('ana-recomendaciones');
        const { data, error } = await supabase
            .from('analisis_mensajes')
            .select('*')
            .in('estado', ['pendiente', 'vista'])
            .order('created_at', { ascending: false })
            .limit(10);

        if (error || !data || data.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-400 text-center py-4"><i class="fas fa-lightbulb mr-1"></i>Hacé click en "Analizar con IA" para generar recomendaciones</p>';
            return;
        }

        recomendaciones = data;
        moduloAnaliticas.pintarRecomendaciones();
    },

    pintarRecomendaciones: () => {
        const container = document.getElementById('ana-recomendaciones');
        const prioridadStyle = { critica: 'border-l-red-500 bg-red-50', alta: 'border-l-orange-500 bg-orange-50', normal: 'border-l-blue-500 bg-blue-50', baja: 'border-l-gray-400 bg-gray-50' };
        const prioridadBadge = { critica: 'bg-red-100 text-red-700', alta: 'bg-orange-100 text-orange-700', normal: 'bg-blue-100 text-blue-700', baja: 'bg-gray-100 text-gray-500' };

        container.innerHTML = recomendaciones.map(r => `
            <div class="border-l-4 ${prioridadStyle[r.prioridad] || prioridadStyle.normal} rounded-r-lg p-3">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${prioridadBadge[r.prioridad] || prioridadBadge.normal}">${(r.prioridad || 'normal').toUpperCase()}</span>
                            <span class="text-[10px] text-gray-400">${formatearFecha(r.created_at)}</span>
                        </div>
                        <p class="text-sm font-medium text-gray-800">${r.titulo}</p>
                        <p class="text-xs text-gray-600 mt-1 whitespace-pre-wrap">${r.detalle || ''}</p>
                    </div>
                    <button onclick="moduloAnaliticas.descartarRecomendacion('${r.id}')"
                        class="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0" title="Descartar">
                        <i class="fas fa-times text-xs"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    cambiarPeriodo: async (dias) => {
        filtroDias = parseInt(dias);
        await moduloAnaliticas.cargarDatos();
    },

    descartarRecomendacion: async (id) => {
        await supabase.from('analisis_mensajes').update({ estado: 'descartada' }).eq('id', id);
        recomendaciones = recomendaciones.filter(r => r.id !== id);
        moduloAnaliticas.pintarRecomendaciones();
    },

    generarAnalisis: async () => {
        const btn = document.getElementById('btn-generar-analisis');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Analizando...';

        try {
            const AGENTE_URL = 'https://cpwsdpzxzhlmozzasnqx.supabase.co/functions/v1/meli-agente';
            const resp = await fetch(AGENTE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mensaje: `Analizá los patrones de preguntas de los últimos ${filtroDias} días. Detectá: publicaciones con muchas preguntas repetitivas, temas recurrentes, oportunidades de mejorar descripciones, y cualquier patrón relevante.`,
                })
            });
            const data = await resp.json();

            if (data.error) throw new Error(data.error);

            const { error } = await supabase.from('analisis_mensajes').insert({
                tipo: 'analisis_patrones',
                titulo: `Análisis de patrones (últimos ${filtroDias} días)`,
                detalle: data.texto,
                prioridad: 'normal',
                datos: { iteraciones: data.iteraciones, modelo: data.modelo, periodo_dias: filtroDias },
            });

            if (error) throw error;

            await moduloAnaliticas.cargarRecomendaciones();
            mostrarNotificacion('Análisis generado', 'success');

        } catch (error) {
            console.error('Error generando análisis:', error);
            mostrarNotificacion('Error: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> Analizar con IA';
        }
    },

    destroy: () => {
        if (chartSemanal) { chartSemanal.destroy(); chartSemanal = null; }
        if (chartCategorias) { chartCategorias.destroy(); chartCategorias = null; }
        metricas = null;
        recomendaciones = [];
    }
};

window.moduloAnaliticas = moduloAnaliticas;
