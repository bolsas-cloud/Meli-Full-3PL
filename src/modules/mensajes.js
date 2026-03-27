// ============================================
// MÓDULO MENSAJES - Preguntas y Mensajes ML
// Inbox unificado con sincronización ML ↔ DB
// ============================================
import { supabase } from '../config.js';
import { mostrarNotificacion, generarId, formatearFecha } from '../utils.js';
import { moduloAuth } from './auth.js';

// ---- Proxy ML via Edge Function (evita CORS) ----
const ML_PROXY = 'https://cpwsdpzxzhlmozzasnqx.supabase.co/functions/v1/meli-proxy';

const mlFetch = async (endpoint, options = {}) => {
    const method = options.method || 'GET';

    // Separar path de query params del endpoint
    const [path, queryString] = endpoint.split('?');
    const url = new URL(ML_PROXY);
    url.searchParams.set('endpoint', path);

    // Pasar query params del endpoint como params separados del proxy
    if (queryString) {
        const params = new URLSearchParams(queryString);
        for (const [key, value] of params.entries()) {
            url.searchParams.set(key, value);
        }
    }

    const fetchOptions = { method };
    if (options.body) {
        fetchOptions.headers = { 'Content-Type': 'application/json' };
        fetchOptions.body = options.body;
    }

    const resp = await fetch(url.toString(), fetchOptions);
    return resp.json();
};

// ---- Estado del módulo ----
let conversaciones = [];
let mensajesActivos = [];
let respuestasRapidas = [];
let conversacionSeleccionada = null;
let filtros = { busqueda: '', tipo: 'todos', estado: 'abierta' };
let cargandoSync = false;
let realtimeChannel = null;

// ---- Helpers ----
const tiempoRelativo = (fecha) => {
    if (!fecha) return '';
    const ahora = new Date();
    const msg = new Date(fecha);
    const diff = Math.floor((ahora - msg) / 1000);
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
    if (diff < 172800) return 'ayer';
    return formatearFecha(fecha);
};

const badgePrioridad = (p) => {
    const map = {
        urgente: 'bg-red-100 text-red-700',
        alta: 'bg-orange-100 text-orange-700',
        normal: 'bg-blue-100 text-blue-700',
        baja: 'bg-gray-100 text-gray-500'
    };
    return map[p] || map.normal;
};

const badgeTipo = (t) => {
    return t === 'pregunta'
        ? '<span class="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-semibold">Pregunta</span>'
        : '<span class="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-semibold">Post-venta</span>';
};

const truncar = (text, max = 60) => {
    if (!text) return '';
    return text.length > max ? text.substring(0, max) + '...' : text;
};

// ============================================
// MÓDULO PRINCIPAL
// ============================================
export const moduloMensajes = {

    // ---- RENDER PRINCIPAL ----
    render: async (contenedor) => {
        // Quitar padding del contenedor padre para que el inbox ocupe todo
        contenedor.classList.remove('p-4', 'sm:p-8', 'overflow-y-auto');
        contenedor.classList.add('p-0', 'overflow-hidden');

        contenedor.innerHTML = `
        <div class="h-full flex flex-col">

            <!-- Header con acciones -->
            <div class="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
                <div class="flex items-center gap-3">
                    <h2 class="text-lg font-bold text-gray-800">
                        <i class="fas fa-comments text-brand mr-2"></i>Mensajes
                    </h2>
                    <span id="msg-contador-total" class="text-sm text-gray-500">(0)</span>
                    <span id="msg-badge-sin-leer" class="hidden bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">0</span>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="moduloMensajes.sincronizarTodo()" id="btn-sync-mensajes"
                        class="px-3 py-1.5 bg-brand text-white text-sm rounded-lg hover:bg-brand-dark transition-colors flex items-center gap-2">
                        <i class="fas fa-sync-alt"></i> Sincronizar ML
                    </button>
                </div>
            </div>

            <!-- Layout 3 paneles -->
            <div class="flex flex-1 min-h-0 overflow-hidden">

                <!-- Panel 1: Inbox (lista de conversaciones) -->
                <div class="w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
                    <!-- Filtros -->
                    <div class="p-3 border-b border-gray-100 space-y-2">
                        <input type="text" id="msg-busqueda" placeholder="Buscar cliente, producto..."
                            class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none">
                        <div class="flex gap-1">
                            <button onclick="moduloMensajes.filtrarTipo('todos')" data-filtro-tipo="todos"
                                class="filtro-tipo-btn px-2 py-1 text-[11px] rounded-md bg-brand text-white font-medium">Todos</button>
                            <button onclick="moduloMensajes.filtrarTipo('pregunta')" data-filtro-tipo="pregunta"
                                class="filtro-tipo-btn px-2 py-1 text-[11px] rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">Preguntas</button>
                            <button onclick="moduloMensajes.filtrarTipo('mensaje_postventa')" data-filtro-tipo="mensaje_postventa"
                                class="filtro-tipo-btn px-2 py-1 text-[11px] rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">Post-venta</button>
                        </div>
                        <div class="flex gap-1">
                            <button onclick="moduloMensajes.filtrarEstado('abierta')" data-filtro-estado="abierta"
                                class="filtro-estado-btn px-2 py-1 text-[11px] rounded-md bg-brand text-white font-medium">Abiertas</button>
                            <button onclick="moduloMensajes.filtrarEstado('pendiente')" data-filtro-estado="pendiente"
                                class="filtro-estado-btn px-2 py-1 text-[11px] rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">Pendientes</button>
                            <button onclick="moduloMensajes.filtrarEstado('cerrada')" data-filtro-estado="cerrada"
                                class="filtro-estado-btn px-2 py-1 text-[11px] rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">Cerradas</button>
                            <button onclick="moduloMensajes.filtrarEstado('todos')" data-filtro-estado="todos"
                                class="filtro-estado-btn px-2 py-1 text-[11px] rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">Todas</button>
                        </div>
                    </div>
                    <!-- Lista de conversaciones -->
                    <div id="msg-lista-conversaciones" class="flex-1 overflow-y-auto">
                        <div class="p-8 text-center text-gray-400">
                            <i class="fas fa-spinner fa-spin fa-2x mb-3"></i>
                            <p class="text-sm">Cargando conversaciones...</p>
                        </div>
                    </div>
                </div>

                <!-- Panel 2: Conversación activa -->
                <div class="flex-1 flex flex-col bg-gray-50 min-h-0" id="msg-panel-conversacion">
                    <div id="msg-conversacion-header" class="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0 hidden">
                        <!-- Se llena dinámicamente -->
                    </div>
                    <div id="msg-conversacion-mensajes" class="flex-1 overflow-y-auto p-4 space-y-3">
                        <div class="flex items-center justify-center h-full text-gray-400">
                            <div class="text-center">
                                <i class="fas fa-comments fa-3x mb-3"></i>
                                <p class="text-sm">Seleccioná una conversación</p>
                            </div>
                        </div>
                    </div>
                    <!-- Input de respuesta -->
                    <div id="msg-input-area" class="bg-white border-t border-gray-200 px-4 py-3 flex-shrink-0 hidden relative">
                        <div id="msg-respuestas-rapidas-panel" class="hidden absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-xl w-96 max-h-72 overflow-y-auto z-50">
                            <!-- Se llena dinámicamente -->
                        </div>
                        <div class="flex items-end gap-2">
                            <button onclick="moduloMensajes.toggleRespuestasRapidas()" title="Respuestas rápidas"
                                class="h-10 w-10 flex-shrink-0 flex items-center justify-center text-gray-400 hover:text-brand hover:bg-gray-100 rounded-lg transition-colors border border-gray-200">
                                <i class="fas fa-bolt"></i>
                            </button>
                            <textarea id="msg-input-texto" rows="2" placeholder="Escribí tu respuesta..."
                                class="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none resize-none"
                                onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();moduloMensajes.enviarRespuesta()}"></textarea>
                            <button onclick="moduloMensajes.enviarRespuesta()" id="btn-enviar-respuesta"
                                class="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Panel 3: Contexto -->
                <div id="msg-panel-contexto" class="w-72 flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto hidden">
                    <!-- Se llena dinámicamente al seleccionar conversación -->
                </div>

            </div>
        </div>`;

        // Event listeners
        document.getElementById('msg-busqueda').addEventListener('input', (e) => {
            filtros.busqueda = e.target.value.toLowerCase();
            moduloMensajes.pintarListaConversaciones();
        });

        // Cargar datos
        await moduloMensajes.cargarConversaciones();
        await moduloMensajes.cargarRespuestasRapidas();
        moduloMensajes.suscribirRealtime();

        window.moduloMensajes = moduloMensajes;
    },

    // ---- CARGAR CONVERSACIONES DESDE DB ----
    cargarConversaciones: async () => {
        try {
            let query = supabase
                .from('conversaciones_meli')
                .select('*')
                .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false });

            const { data, error } = await query;
            if (error) throw error;

            conversaciones = data || [];

            // Actualizar contadores
            const sinLeer = conversaciones.reduce((acc, c) => acc + (c.mensajes_sin_leer || 0), 0);
            document.getElementById('msg-contador-total').textContent = `(${conversaciones.length})`;
            const badge = document.getElementById('msg-badge-sin-leer');
            if (sinLeer > 0) {
                badge.textContent = sinLeer;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }

            moduloMensajes.pintarListaConversaciones();
        } catch (error) {
            console.error('Error cargando conversaciones:', error);
            mostrarNotificacion('Error al cargar conversaciones', 'error');
        }
    },

    // ---- PINTAR LISTA DE CONVERSACIONES ----
    pintarListaConversaciones: () => {
        const lista = document.getElementById('msg-lista-conversaciones');

        let filtradas = conversaciones.filter(c => {
            const matchBusqueda = !filtros.busqueda ||
                (c.nombre_cliente || '').toLowerCase().includes(filtros.busqueda) ||
                (c.titulo_publicacion || '').toLowerCase().includes(filtros.busqueda) ||
                (c.ultimo_mensaje_preview || '').toLowerCase().includes(filtros.busqueda) ||
                (c.id_orden || '').toLowerCase().includes(filtros.busqueda);
            const matchTipo = filtros.tipo === 'todos' || c.tipo === filtros.tipo;
            const matchEstado = filtros.estado === 'todos' || c.estado === filtros.estado;
            return matchBusqueda && matchTipo && matchEstado;
        });

        if (filtradas.length === 0) {
            lista.innerHTML = `
                <div class="p-8 text-center text-gray-400">
                    <i class="fas fa-inbox fa-2x mb-3"></i>
                    <p class="text-sm">No hay conversaciones</p>
                    <p class="text-xs mt-1">Presioná "Sincronizar ML" para traer preguntas</p>
                </div>`;
            return;
        }

        lista.innerHTML = filtradas.map(c => {
            const activa = conversacionSeleccionada?.id === c.id;
            const sinLeer = c.mensajes_sin_leer > 0;
            return `
            <div onclick="moduloMensajes.seleccionarConversacion('${c.id}')"
                class="px-3 py-2.5 border-b border-gray-100 cursor-pointer transition-colors
                    ${activa ? 'bg-brand/10 border-l-4 border-l-brand' : 'hover:bg-gray-50'}
                    ${sinLeer ? 'bg-blue-50/50' : ''}">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-sm ${sinLeer ? 'font-bold text-gray-900' : 'font-medium text-gray-700'} truncate max-w-[180px]">
                        ${c.nombre_cliente || 'Cliente #' + (c.id_cliente_ml || '?')}
                    </span>
                    <span class="text-[10px] text-gray-400 flex-shrink-0">${tiempoRelativo(c.ultimo_mensaje_at || c.created_at)}</span>
                </div>
                <div class="flex items-center gap-1 mb-1">
                    ${badgeTipo(c.tipo)}
                    ${!c.respondido ? '<span class="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">Sin responder</span>' : ''}
                    ${sinLeer ? `<span class="bg-brand text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">${c.mensajes_sin_leer}</span>` : ''}
                </div>
                <p class="text-xs text-gray-500 truncate">${truncar(c.titulo_publicacion || c.ultimo_mensaje_preview || '', 50)}</p>
                <p class="text-[11px] text-gray-400 truncate mt-0.5">${truncar(c.ultimo_mensaje_preview || '', 55)}</p>
            </div>`;
        }).join('');
    },

    // ---- SELECCIONAR CONVERSACIÓN ----
    seleccionarConversacion: async (id) => {
        conversacionSeleccionada = conversaciones.find(c => c.id === id);
        if (!conversacionSeleccionada) return;

        // Marcar como leída
        if (conversacionSeleccionada.mensajes_sin_leer > 0) {
            await supabase.from('conversaciones_meli')
                .update({ mensajes_sin_leer: 0 })
                .eq('id', id);
            conversacionSeleccionada.mensajes_sin_leer = 0;
        }

        moduloMensajes.pintarListaConversaciones();
        await moduloMensajes.cargarMensajesConversacion(id);
        moduloMensajes.pintarPanelContexto();

        // Mostrar input y contexto
        document.getElementById('msg-input-area').classList.remove('hidden');
        document.getElementById('msg-panel-contexto').classList.remove('hidden');
        document.getElementById('msg-conversacion-header').classList.remove('hidden');
    },

    // ---- CARGAR MENSAJES DE UNA CONVERSACIÓN ----
    cargarMensajesConversacion: async (idConversacion) => {
        const container = document.getElementById('msg-conversacion-mensajes');
        container.innerHTML = '<div class="flex justify-center p-8"><i class="fas fa-spinner fa-spin text-gray-400 fa-lg"></i></div>';

        try {
            const { data, error } = await supabase
                .from('mensajes_meli')
                .select('*')
                .eq('id_conversacion', idConversacion)
                .order('created_at', { ascending: true });

            if (error) throw error;
            mensajesActivos = data || [];

            moduloMensajes.pintarMensajes();
            moduloMensajes.pintarHeaderConversacion();
        } catch (error) {
            console.error('Error cargando mensajes:', error);
            container.innerHTML = '<div class="text-center text-red-400 p-8"><i class="fas fa-exclamation-circle"></i> Error al cargar mensajes</div>';
        }
    },

    // ---- PINTAR HEADER DE CONVERSACIÓN ----
    pintarHeaderConversacion: () => {
        const c = conversacionSeleccionada;
        if (!c) return;
        const header = document.getElementById('msg-conversacion-header');
        header.innerHTML = `
            <div class="flex items-center justify-between">
                <div>
                    <div class="flex items-center gap-2">
                        <h3 class="font-bold text-gray-800">${c.nombre_cliente || 'Cliente #' + (c.id_cliente_ml || '?')}</h3>
                        ${badgeTipo(c.tipo)}
                        <span class="text-xs px-2 py-0.5 rounded ${badgePrioridad(c.prioridad)}">${c.prioridad}</span>
                    </div>
                    <p class="text-xs text-gray-500 mt-0.5">
                        ${c.titulo_publicacion ? '<i class="fas fa-box mr-1"></i>' + truncar(c.titulo_publicacion, 60) : ''}
                        ${c.id_orden ? ' · <i class="fas fa-receipt mr-1"></i>Orden: ' + c.id_orden : ''}
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    <select onchange="moduloMensajes.cambiarEstado(this.value)" class="text-xs border border-gray-200 rounded-lg px-2 py-1">
                        <option value="abierta" ${c.estado === 'abierta' ? 'selected' : ''}>Abierta</option>
                        <option value="pendiente" ${c.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="cerrada" ${c.estado === 'cerrada' ? 'selected' : ''}>Cerrada</option>
                    </select>
                    <select onchange="moduloMensajes.cambiarPrioridad(this.value)" class="text-xs border border-gray-200 rounded-lg px-2 py-1">
                        <option value="baja" ${c.prioridad === 'baja' ? 'selected' : ''}>Baja</option>
                        <option value="normal" ${c.prioridad === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="alta" ${c.prioridad === 'alta' ? 'selected' : ''}>Alta</option>
                        <option value="urgente" ${c.prioridad === 'urgente' ? 'selected' : ''}>Urgente</option>
                    </select>
                </div>
            </div>`;
    },

    // ---- PINTAR MENSAJES (BURBUJAS) ----
    pintarMensajes: () => {
        const container = document.getElementById('msg-conversacion-mensajes');
        if (mensajesActivos.length === 0) {
            container.innerHTML = '<div class="flex items-center justify-center h-full text-gray-400"><p class="text-sm">Sin mensajes aún</p></div>';
            return;
        }

        let html = '';
        let ultimaFecha = '';

        mensajesActivos.forEach(m => {
            // Separador de fecha
            const fechaMsg = formatearFecha(m.created_at);
            if (fechaMsg !== ultimaFecha) {
                ultimaFecha = fechaMsg;
                html += `<div class="flex justify-center my-2">
                    <span class="bg-gray-200 text-gray-500 text-[10px] px-3 py-1 rounded-full">${fechaMsg}</span>
                </div>`;
            }

            const esVendedor = m.remitente_tipo === 'vendedor';
            const esBot = m.remitente_tipo === 'bot';
            const esSistema = m.remitente_tipo === 'sistema';
            const esNota = m.es_nota_interna;

            if (esSistema) {
                html += `<div class="flex justify-center my-1">
                    <span class="text-[11px] text-gray-400 italic"><i class="fas fa-info-circle mr-1"></i>${m.contenido}</span>
                </div>`;
                return;
            }

            if (esNota) {
                html += `<div class="flex justify-center my-1">
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 max-w-md">
                        <span class="text-[10px] text-yellow-600 font-semibold"><i class="fas fa-sticky-note mr-1"></i>Nota interna</span>
                        <p class="text-xs text-yellow-800 mt-1">${m.contenido}</p>
                    </div>
                </div>`;
                return;
            }

            const hora = new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

            html += `<div class="flex ${esVendedor || esBot ? 'justify-end' : 'justify-start'}">
                <div class="max-w-[70%] ${esVendedor ? 'bg-brand text-white' : esBot ? 'bg-green-500 text-white' : 'bg-white border border-gray-200 text-gray-800'} rounded-2xl px-4 py-2.5 shadow-sm">
                    ${esBot ? '<span class="text-[10px] opacity-75 block mb-1"><i class="fas fa-robot mr-1"></i>Bot</span>' : ''}
                    <p class="text-sm whitespace-pre-wrap">${m.contenido}</p>
                    <div class="flex items-center justify-end gap-1 mt-1">
                        <span class="text-[10px] ${esVendedor || esBot ? 'text-white/60' : 'text-gray-400'}">${hora}</span>
                        ${esVendedor || esBot ? '<i class="fas fa-check-double text-[10px] text-white/60"></i>' : ''}
                    </div>
                </div>
            </div>`;
        });

        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    },

    // ---- PINTAR PANEL DE CONTEXTO ----
    pintarPanelContexto: () => {
        const panel = document.getElementById('msg-panel-contexto');
        const c = conversacionSeleccionada;
        if (!c) return;

        panel.innerHTML = `
            <div class="p-4 space-y-4">
                <!-- Cliente -->
                <div>
                    <h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Cliente</h4>
                    <div class="bg-gray-50 rounded-lg p-3">
                        <p class="text-sm font-medium">${c.nombre_cliente || 'Desconocido'}</p>
                        <p class="text-xs text-gray-500">ID ML: ${c.id_cliente_ml || '-'}</p>
                    </div>
                </div>

                <!-- Publicación -->
                ${c.id_publicacion ? `
                <div>
                    <h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Publicación</h4>
                    <div class="bg-gray-50 rounded-lg p-3">
                        <p class="text-sm">${c.titulo_publicacion || c.id_publicacion}</p>
                        <a href="https://articulo.mercadolibre.com.ar/${c.id_publicacion}" target="_blank"
                            class="text-xs text-brand hover:underline mt-1 inline-block">
                            <i class="fas fa-external-link-alt mr-1"></i>Ver en ML
                        </a>
                    </div>
                </div>` : ''}

                <!-- Orden -->
                ${c.id_orden ? `
                <div>
                    <h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Orden</h4>
                    <div class="bg-gray-50 rounded-lg p-3">
                        <p class="text-sm font-mono">${c.id_orden}</p>
                    </div>
                </div>` : ''}

                <!-- Metadata -->
                <div>
                    <h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Info</h4>
                    <div class="space-y-1.5 text-xs text-gray-600">
                        <p><i class="fas fa-calendar mr-2 w-4 text-center"></i>Creada: ${formatearFecha(c.created_at)}</p>
                        <p><i class="fas fa-clock mr-2 w-4 text-center"></i>Último msg: ${tiempoRelativo(c.ultimo_mensaje_at)}</p>
                        ${c.tiempo_primera_respuesta_seg ? `<p><i class="fas fa-stopwatch mr-2 w-4 text-center"></i>1ra resp: ${Math.round(c.tiempo_primera_respuesta_seg / 60)} min</p>` : ''}
                        <p><i class="fas fa-tag mr-2 w-4 text-center"></i>${c.categoria || 'Sin categoría'}</p>
                    </div>
                </div>

                <!-- Acciones rápidas -->
                <div>
                    <h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Acciones</h4>
                    <div class="space-y-1.5">
                        <button onclick="moduloMensajes.cambiarEstado('cerrada')"
                            class="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-gray-100 transition-colors text-gray-600">
                            <i class="fas fa-check-circle mr-2 text-green-500"></i>Cerrar conversación
                        </button>
                        <button onclick="moduloMensajes.agregarNotaInterna()"
                            class="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-gray-100 transition-colors text-gray-600">
                            <i class="fas fa-sticky-note mr-2 text-yellow-500"></i>Agregar nota interna
                        </button>
                    </div>
                </div>
            </div>`;
    },

    // ---- FILTROS ----
    filtrarTipo: (tipo) => {
        filtros.tipo = tipo;
        document.querySelectorAll('.filtro-tipo-btn').forEach(btn => {
            if (btn.dataset.filtroTipo === tipo) {
                btn.className = 'filtro-tipo-btn px-2 py-1 text-[11px] rounded-md bg-brand text-white font-medium';
            } else {
                btn.className = 'filtro-tipo-btn px-2 py-1 text-[11px] rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium';
            }
        });
        moduloMensajes.pintarListaConversaciones();
    },

    filtrarEstado: (estado) => {
        filtros.estado = estado;
        document.querySelectorAll('.filtro-estado-btn').forEach(btn => {
            if (btn.dataset.filtroEstado === estado) {
                btn.className = 'filtro-estado-btn px-2 py-1 text-[11px] rounded-md bg-brand text-white font-medium';
            } else {
                btn.className = 'filtro-estado-btn px-2 py-1 text-[11px] rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium';
            }
        });
        moduloMensajes.pintarListaConversaciones();
    },

    // ---- CAMBIAR ESTADO / PRIORIDAD ----
    cambiarEstado: async (nuevoEstado) => {
        if (!conversacionSeleccionada) return;
        try {
            const { error } = await supabase.from('conversaciones_meli')
                .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
                .eq('id', conversacionSeleccionada.id);
            if (error) throw error;
            conversacionSeleccionada.estado = nuevoEstado;
            moduloMensajes.pintarHeaderConversacion();
            mostrarNotificacion(`Conversación marcada como ${nuevoEstado}`, 'success');
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion('Error al cambiar estado', 'error');
        }
    },

    cambiarPrioridad: async (nuevaPrioridad) => {
        if (!conversacionSeleccionada) return;
        try {
            const { error } = await supabase.from('conversaciones_meli')
                .update({ prioridad: nuevaPrioridad, updated_at: new Date().toISOString() })
                .eq('id', conversacionSeleccionada.id);
            if (error) throw error;
            conversacionSeleccionada.prioridad = nuevaPrioridad;
            moduloMensajes.pintarHeaderConversacion();
        } catch (error) {
            console.error('Error:', error);
        }
    },

    // ============================================
    // SINCRONIZACIÓN CON MERCADOLIBRE
    // ============================================

    sincronizarTodo: async () => {
        console.log('[Mensajes] Iniciando sincronización...');
        if (cargandoSync) { console.log('[Mensajes] Ya hay una sync en curso, saliendo'); return; }
        cargandoSync = true;
        const btn = document.getElementById('btn-sync-mensajes');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sincronizando...';

        try {
            const conectado = await moduloAuth.verificarSesion();
            console.log('[Mensajes] Sesión ML:', conectado, 'userId:', moduloAuth.getUserId());
            if (!conectado) {
                mostrarNotificacion('Conectate a MercadoLibre primero', 'warning');
                return;
            }

            // Sincronizar preguntas y mensajes en paralelo
            const [pregRes, msgRes] = await Promise.allSettled([
                moduloMensajes.sincronizarPreguntas(),
                moduloMensajes.sincronizarMensajesPostventa()
            ]);

            console.log('[Mensajes] Resultados sync:', pregRes, msgRes);
            const pregCount = pregRes.status === 'fulfilled' ? pregRes.value : 0;
            const msgCount = msgRes.status === 'fulfilled' ? msgRes.value : 0;

            await moduloMensajes.cargarConversaciones();
            mostrarNotificacion(`Sincronizado: ${pregCount} preguntas, ${msgCount} mensajes`, 'success');

        } catch (error) {
            console.error('Error en sincronización:', error);
            mostrarNotificacion('Error al sincronizar: ' + error.message, 'error');
        } finally {
            cargandoSync = false;
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar ML';
        }
    },

    // ---- SYNC PREGUNTAS ----
    sincronizarPreguntas: async () => {
        const sellerId = moduloAuth.getUserId();
        console.log('[Mensajes] Sync preguntas, sellerId:', sellerId);
        if (!sellerId) return 0;

        let count = 0;
        let offset = 0;
        const limit = 50;
        let hayMas = true;

        // Cache de títulos e info para no repetir llamadas
        const cacheTitulos = new Map();

        while (hayMas) {
            const data = await mlFetch(
                `/questions/search?seller_id=${sellerId}&sort_fields=date_created&sort_types=DESC&api_version=4&limit=${limit}&offset=${offset}`
            );

            if (!data || !data.questions || data.questions.length === 0) {
                hayMas = false;
                break;
            }

            for (const q of data.questions) {
                // Ignorar preguntas baneadas, eliminadas o bajo revisión sin texto
                if (['BANNED', 'DELETED', 'DISABLED'].includes(q.status) || !q.text) continue;
                await moduloMensajes._procesarPregunta(q, null, cacheTitulos);
                count++;
            }

            offset += limit;
            if (offset >= (data.total || 0)) hayMas = false;
            // Limitar a las primeras 200 preguntas para no saturar
            if (offset >= 200) hayMas = false;
        }

        return count;
    },

    _procesarPregunta: async (q, _token, cacheTitulos) => {
        const convId = `conv_preg_${q.id}`;
        const sellerId = moduloAuth.getUserId();

        // Obtener info de la publicación (con cache)
        let tituloPublicacion = '';
        try {
            if (cacheTitulos.has(q.item_id)) {
                tituloPublicacion = cacheTitulos.get(q.item_id);
            } else {
                const item = await mlFetch(`/items/${q.item_id}?attributes=title`);
                tituloPublicacion = item?.title || '';
                cacheTitulos.set(q.item_id, tituloPublicacion);
            }
        } catch (e) { /* ignorar */ }

        // Obtener nombre del comprador
        let nombreCliente = '';
        try {
            const user = await mlFetch(`/users/${q.from.id}`);
            nombreCliente = user?.nickname || '';
        } catch (e) { /* ignorar */ }

        const respondido = q.status === 'ANSWERED';
        const textoPreview = respondido ? q.answer?.text : q.text;

        // Upsert conversación
        await supabase.from('conversaciones_meli').upsert({
            id: convId,
            tipo: 'pregunta',
            id_cliente_ml: q.from.id,
            nombre_cliente: nombreCliente,
            estado: respondido ? 'cerrada' : 'abierta',
            id_publicacion: q.item_id,
            titulo_publicacion: tituloPublicacion,
            ml_question_id: q.id,
            ultimo_mensaje_at: q.answer?.date_created || q.date_created,
            ultimo_mensaje_preview: truncar(textoPreview, 100),
            respondido: respondido,
            mensajes_sin_leer: respondido ? 0 : 1,
            categoria: 'consulta_producto',
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

        // Insertar mensaje de la pregunta
        const msgPregId = `msg_preg_${q.id}`;
        await supabase.from('mensajes_meli').upsert({
            id: msgPregId,
            id_conversacion: convId,
            remitente_tipo: 'cliente',
            remitente_id: q.from.id,
            remitente_nombre: nombreCliente,
            contenido: q.text,
            ml_question_id: q.id,
            created_at: q.date_created
        }, { onConflict: 'id' });

        // Si hay respuesta, insertar también
        if (respondido && q.answer) {
            const msgRespId = `msg_resp_${q.id}`;
            await supabase.from('mensajes_meli').upsert({
                id: msgRespId,
                id_conversacion: convId,
                remitente_tipo: 'vendedor',
                remitente_id: sellerId,
                contenido: q.answer.text,
                ml_question_id: q.id,
                created_at: q.answer.date_created
            }, { onConflict: 'id' });
        }
    },

    // ---- SYNC MENSAJES POST-VENTA ----
    sincronizarMensajesPostventa: async () => {
        const sellerId = moduloAuth.getUserId();
        if (!sellerId) return 0;

        let count = 0;

        try {
            // Obtener órdenes recientes desde ML API (tienen pack_id real)
            const ordersData = await mlFetch(
                `/orders/search/recent?seller=${sellerId}&sort=date_desc&limit=30`
            );

            if (!ordersData?.results || ordersData.results.length === 0) return 0;

            // Agrupar por pack_id real (varias órdenes pueden compartir un pack)
            const packs = new Map();
            for (const o of ordersData.results) {
                const packId = o.pack_id || o.id;
                if (!packs.has(packId)) {
                    packs.set(packId, {
                        pack_id: packId,
                        order_id: o.id,
                        buyer_id: o.buyer?.id,
                        buyer_nickname: o.buyer?.nickname,
                        titulo: o.order_items?.[0]?.item?.title || ''
                    });
                }
            }

            for (const [packId, orden] of packs) {
                try {
                    const data = await mlFetch(
                        `/messages/packs/${packId}/sellers/${sellerId}?tag=post_sale`
                    );

                    if (data && data.messages && data.messages.length > 0) {
                        await moduloMensajes._procesarMensajesPostventa(packId, orden, data.messages, sellerId);
                        count += data.messages.length;
                    }
                } catch (e) {
                    // Muchas órdenes no tienen mensajes, es normal (silenciar)
                }
            }
        } catch (error) {
            console.error('Error sync mensajes post-venta:', error);
        }

        return count;
    },

    _procesarMensajesPostventa: async (packId, orden, mensajes, sellerId) => {
        const convId = `conv_msg_${packId}`;
        const ultimoMsg = mensajes[mensajes.length - 1];
        const sinLeer = mensajes.filter(m => m.from?.user_id !== parseInt(sellerId) && !m.date_read).length;

        // Upsert conversación
        await supabase.from('conversaciones_meli').upsert({
            id: convId,
            tipo: 'mensaje_postventa',
            id_cliente_ml: orden.buyer_id,
            nombre_cliente: orden.buyer_nickname,
            estado: 'abierta',
            id_orden: String(orden.order_id),
            id_publicacion: null,
            titulo_publicacion: orden.titulo || '',
            ml_pack_id: String(packId),
            ultimo_mensaje_at: ultimoMsg?.message_date?.created || ultimoMsg?.date_created,
            ultimo_mensaje_preview: truncar(ultimoMsg?.text, 100),
            mensajes_sin_leer: sinLeer,
            respondido: ultimoMsg?.from?.user_id === parseInt(sellerId),
            categoria: 'postventa',
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

        // Insertar cada mensaje
        for (const m of mensajes) {
            const msgId = `msg_pv_${m.id || packId + '_' + Date.parse(m.message_date?.created || m.date_created)}`;
            const esVendedor = m.from?.user_id === parseInt(sellerId);

            await supabase.from('mensajes_meli').upsert({
                id: msgId,
                id_conversacion: convId,
                remitente_tipo: esVendedor ? 'vendedor' : 'cliente',
                remitente_id: m.from?.user_id,
                remitente_nombre: esVendedor ? 'Vendedor' : (orden.buyer_nickname || ''),
                contenido: m.text,
                ml_message_id: m.id,
                estado: m.date_read ? 'leido' : 'enviado',
                created_at: m.message_date?.created || m.date_created
            }, { onConflict: 'id' });
        }
    },

    // ============================================
    // ENVIAR RESPUESTAS
    // ============================================

    enviarRespuesta: async () => {
        const input = document.getElementById('msg-input-texto');
        const texto = input.value.trim();
        if (!texto || !conversacionSeleccionada) return;

        const btn = document.getElementById('btn-enviar-respuesta');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

        try {
            const c = conversacionSeleccionada;

            if (c.tipo === 'pregunta' && c.ml_question_id && !c.respondido) {
                // Responder pregunta en ML via proxy
                const resp = await mlFetch('/answers', {
                    method: 'POST',
                    body: JSON.stringify({
                        question_id: c.ml_question_id,
                        text: texto
                    })
                });

                if (resp.error) throw new Error(resp.error);
            } else if (c.tipo === 'mensaje_postventa' && c.ml_pack_id) {
                // Responder mensaje post-venta en ML via proxy
                const sellerId = moduloAuth.getUserId();
                const resp = await mlFetch(
                    `/messages/packs/${c.ml_pack_id}/sellers/${sellerId}?tag=post_sale`,
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            from: { user_id: parseInt(sellerId) },
                            to: { user_id: parseInt(c.id_cliente_ml) },
                            text: texto
                        })
                    }
                );

                if (resp.error) throw new Error(resp.error);
            }

            // Guardar en DB local (usar ID determinístico para evitar duplicados con sync)
            const msgId = c.tipo === 'pregunta' ? `msg_resp_${c.ml_question_id}` : generarId('msg');
            const ahora = new Date().toISOString();
            const sellerId = moduloAuth.getUserId();

            await supabase.from('mensajes_meli').insert({
                id: msgId,
                id_conversacion: c.id,
                remitente_tipo: 'vendedor',
                remitente_id: sellerId,
                contenido: texto,
                created_at: ahora
            });

            // Calcular tiempo primera respuesta si aplica
            let tiempoPrimeraResp = c.tiempo_primera_respuesta_seg;
            if (!c.respondido && mensajesActivos.length > 0) {
                const primerMsg = mensajesActivos[0];
                tiempoPrimeraResp = Math.floor((new Date(ahora) - new Date(primerMsg.created_at)) / 1000);
            }

            // Actualizar conversación
            await supabase.from('conversaciones_meli').update({
                respondido: true,
                ultimo_mensaje_at: ahora,
                ultimo_mensaje_preview: truncar(texto, 100),
                tiempo_primera_respuesta_seg: tiempoPrimeraResp,
                estado: c.tipo === 'pregunta' ? 'cerrada' : c.estado,
                updated_at: ahora
            }).eq('id', c.id);

            // Actualizar estado local
            c.respondido = true;
            c.ultimo_mensaje_at = ahora;
            c.ultimo_mensaje_preview = truncar(texto, 100);
            if (c.tipo === 'pregunta') c.estado = 'cerrada';

            input.value = '';
            await moduloMensajes.cargarMensajesConversacion(c.id);
            moduloMensajes.pintarListaConversaciones();
            mostrarNotificacion('Respuesta enviada', 'success');

        } catch (error) {
            console.error('Error enviando respuesta:', error);
            mostrarNotificacion('Error al enviar: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    },

    // ---- NOTA INTERNA ----
    agregarNotaInterna: async () => {
        if (!conversacionSeleccionada) return;
        const texto = prompt('Nota interna:');
        if (!texto) return;

        try {
            await supabase.from('mensajes_meli').insert({
                id: generarId('msg'),
                id_conversacion: conversacionSeleccionada.id,
                remitente_tipo: 'vendedor',
                contenido: texto,
                es_nota_interna: true,
                created_at: new Date().toISOString()
            });

            await moduloMensajes.cargarMensajesConversacion(conversacionSeleccionada.id);
            mostrarNotificacion('Nota agregada', 'success');
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion('Error al agregar nota', 'error');
        }
    },

    // ============================================
    // RESPUESTAS RÁPIDAS
    // ============================================

    cargarRespuestasRapidas: async () => {
        try {
            const { data, error } = await supabase
                .from('respuestas_rapidas')
                .select('*')
                .eq('activo', true)
                .order('uso_count', { ascending: false });
            if (error) throw error;
            respuestasRapidas = data || [];
        } catch (error) {
            console.error('Error cargando respuestas rápidas:', error);
        }
    },

    toggleRespuestasRapidas: () => {
        const panel = document.getElementById('msg-respuestas-rapidas-panel');
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            panel.innerHTML = `
                <div class="p-3 border-b border-gray-100">
                    <h4 class="text-sm font-bold text-gray-700"><i class="fas fa-bolt text-yellow-500 mr-1"></i>Respuestas rápidas</h4>
                </div>
                <div class="divide-y divide-gray-100">
                    ${respuestasRapidas.map(r => `
                        <button onclick="moduloMensajes.usarRespuestaRapida('${r.id}')"
                            class="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors">
                            <p class="text-xs font-medium text-gray-700">${r.titulo}</p>
                            <p class="text-[11px] text-gray-500 truncate">${truncar(r.contenido, 70)}</p>
                            ${r.categoria ? `<span class="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mt-1 inline-block">${r.categoria}</span>` : ''}
                        </button>
                    `).join('')}
                    ${respuestasRapidas.length === 0 ? '<p class="p-3 text-xs text-gray-400 text-center">Sin respuestas rápidas</p>' : ''}
                </div>`;
        } else {
            panel.classList.add('hidden');
        }
    },

    usarRespuestaRapida: async (id) => {
        const rr = respuestasRapidas.find(r => r.id === id);
        if (!rr) return;

        let texto = rr.contenido;

        // Reemplazar variables si hay contexto
        if (conversacionSeleccionada) {
            texto = texto.replace('{{nombre_cliente}}', conversacionSeleccionada.nombre_cliente || 'Cliente');
            texto = texto.replace('{{numero_orden}}', conversacionSeleccionada.id_orden || '');
        }

        document.getElementById('msg-input-texto').value = texto;
        document.getElementById('msg-respuestas-rapidas-panel').classList.add('hidden');

        // Incrementar contador de uso
        await supabase.from('respuestas_rapidas')
            .update({ uso_count: (rr.uso_count || 0) + 1 })
            .eq('id', id);
        rr.uso_count = (rr.uso_count || 0) + 1;
    },

    // ============================================
    // REALTIME
    // ============================================

    suscribirRealtime: () => {
        realtimeChannel = supabase
            .channel('mensajes-realtime')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'mensajes_meli'
            }, (payload) => {
                const msg = payload.new;
                // Si es de la conversación activa, agregar al thread
                if (conversacionSeleccionada && msg.id_conversacion === conversacionSeleccionada.id) {
                    mensajesActivos.push(msg);
                    moduloMensajes.pintarMensajes();
                }
                // Recargar lista
                moduloMensajes.cargarConversaciones();
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'conversaciones_meli'
            }, () => {
                moduloMensajes.cargarConversaciones();
            })
            .subscribe();
    },

    // ---- CLEANUP ----
    destroy: () => {
        if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }
        // Restaurar padding del contenedor
        const contenedor = document.getElementById('app-content');
        if (contenedor) {
            contenedor.classList.remove('p-0', 'overflow-hidden');
            contenedor.classList.add('p-4', 'sm:p-8', 'overflow-y-auto');
        }
        conversaciones = [];
        mensajesActivos = [];
        conversacionSeleccionada = null;
    }
};

window.moduloMensajes = moduloMensajes;
