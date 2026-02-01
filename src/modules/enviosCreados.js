// ============================================
// MÓDULO: Envíos Creados
// ============================================
// Gestión de envíos creados con la calculadora:
// - Listar, editar, preparar y eliminar envíos
// - Estados: En Preparación, Despachado, Recibido
// ============================================

import { supabase, supabaseRRHH, supabaseProduccion } from '../config.js';
import { mostrarNotificacion, confirmarAccion, formatearFecha, fechaLocalISO, generarId } from '../utils.js';

// Estado local del módulo
let enviosCache = [];
let envioSeleccionado = null;
let filtroDestino = 'todos';  // 'todos', 'meli', 'externo'
let destinosCache = {};       // { id_destino: { nombre, tipo, ... } }
let usandoTablasNuevas = true; // Flag para saber si usamos tablas nuevas o legacy
let vistaActual = 'recientes'; // 'recientes' | 'historicos'
let historicosCache = [];      // Cache separado para históricos (sin detalles)

// Estado para modal de agregar producto
let publicacionesDisponibles = [];
let publicacionSeleccionada = null;

// Estado para confirmación de exceso de cantidad
let excesoPendiente = null; // { idx: number, delta: number }

// ============================================
// ESTADO: Integración RRHH (preparaciones)
// ============================================
let colaboradoresCache = [];      // Lista de colaboradores de RRHH
let tareasEnvioCache = [];        // Tareas con etapa="ENVIO" de Producción
let consumiblesCache = [];        // Productos tipo EMPAQUE de Producción
let preparacionRRHH = null;       // Registro de preparacion en RRHH
let tareasSeleccionadas = [];     // Tareas marcadas en UI con sus colaboradores
let consumiblesUsados = {};       // { producto_id: cantidad }
let cantidadBultosPrep = 0;       // Cantidad de bultos ingresada

// ============================================
// HELPERS: Integración RRHH
// ============================================

// Sincronizar envío con tabla preparaciones en RRHH
async function sincronizarConRRHH(envio, accion = 'crear') {
    try {
        const destino = envio.destino || destinosCache[envio.id_destino];
        const destinoNombre = destino?.nombre || 'Desconocido';
        const destinoTipo = destino?.tipo || 'meli';

        const totalUnidades = envio.productos?.reduce((sum, p) => sum + (p.cantidad_enviada || 0), 0) || 0;

        if (accion === 'crear') {
            // Crear o actualizar registro en preparaciones
            const { error } = await supabaseRRHH.from('preparaciones').upsert({
                tipo: 'ENVIO_MELI',
                id_origen: envio.id_envio,
                codigo_visible: envio.id_envio,
                destino_nombre: destinoNombre,
                destino_tipo: destinoTipo,
                total_items: envio.productos?.length || 0,
                total_unidades: totalUnidades,
                estado: 'PENDIENTE'
            }, { onConflict: 'tipo,id_origen' });

            if (error) {
                console.error('Error sincronizando con RRHH:', error);
            }
        } else if (accion === 'cancelar') {
            // Marcar como cancelado
            await supabaseRRHH.from('preparaciones')
                .update({ estado: 'CANCELADO' })
                .eq('tipo', 'ENVIO_MELI')
                .eq('id_origen', envio.id_envio);
        }
    } catch (err) {
        console.error('Error en sincronización RRHH:', err);
    }
}

// Cargar datos maestros para preparación extendida
async function cargarDatosMaestrosPreparacion() {
    try {
        // Cargar en paralelo
        const [colabRes, tareasRes, consRes] = await Promise.all([
            // Colaboradores activos de RRHH
            supabaseRRHH.from('colaboradores')
                .select('id, nombre')
                .eq('activo', true)
                .order('nombre'),

            // Tareas con etapa ENVIO de Producción
            supabaseProduccion.from('tareas')
                .select('id_tarea, nombre_tarea, etapa')
                .eq('etapa', 'ENVIO')
                .order('nombre_tarea'),

            // Productos tipo EMPAQUE (consumibles) de Producción
            supabaseProduccion.from('productos')
                .select('id_producto, nombre_producto, sku')
                .eq('tipo', 'EMPAQUE')
                .eq('activo', true)
                .order('nombre_producto')
        ]);

        colaboradoresCache = colabRes.data || [];
        tareasEnvioCache = tareasRes.data || [];
        consumiblesCache = consRes.data || [];

        console.log(`Maestros cargados: ${colaboradoresCache.length} colaboradores, ${tareasEnvioCache.length} tareas, ${consumiblesCache.length} consumibles`);
    } catch (err) {
        console.error('Error cargando maestros:', err);
    }
}

// Obtener preparación desde RRHH
async function obtenerPreparacionRRHH(idEnvio) {
    try {
        const { data, error } = await supabaseRRHH.from('preparaciones')
            .select('*')
            .eq('tipo', 'ENVIO_MELI')
            .eq('id_origen', idEnvio)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
            console.error('Error obteniendo preparación:', error);
        }
        return data;
    } catch (err) {
        console.error('Error en obtenerPreparacionRRHH:', err);
        return null;
    }
}

// Helper para parsear fechas como local (evita problema UTC)
function parsearFechaLocal(fechaStr) {
    if (!fechaStr) return null;
    // Si es formato YYYY-MM-DD, parsearlo como fecha local
    if (typeof fechaStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
        const [año, mes, dia] = fechaStr.split('-').map(Number);
        return new Date(año, mes - 1, dia);
    }
    return new Date(fechaStr);
}

export const moduloEnviosCreados = {

    // ============================================
    // RENDER: Dibuja la interfaz principal
    // ============================================
    render: async (contenedor) => {
        // Resetear estado al entrar al módulo
        vistaActual = 'recientes';
        historicosCache = [];
        filtroDestino = 'todos';

        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">
                <!-- Header con filtros -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-4">
                        <div class="flex items-center gap-3">
                            <h3 class="text-lg font-bold text-gray-800">
                                <i class="fas fa-truck-loading text-brand mr-2"></i>
                                Envíos Creados
                            </h3>
                            <span id="contador-envios" class="text-sm text-gray-500"></span>
                        </div>

                        <div class="flex items-center gap-3">
                            <!-- Filtro por estado (solo en recientes) -->
                            <select id="filtro-estado"
                                    class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                <option value="todos">Todos los estados</option>
                                <option value="Borrador">Borrador</option>
                                <option value="En Preparación">En Preparación</option>
                                <option value="Despachado">Despachado</option>
                            </select>

                            <!-- Botón recargar -->
                            <button onclick="moduloEnviosCreados.cargarEnvios()"
                                    class="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center gap-2">
                                <i class="fas fa-sync-alt"></i>
                                Recargar
                            </button>
                        </div>
                    </div>

                    <!-- Pestañas Recientes / Históricos -->
                    <div class="mt-4 border-t border-gray-100 pt-4">
                        <div class="flex gap-2 mb-3">
                            <button onclick="moduloEnviosCreados.cambiarVista('recientes')"
                                    id="tab-recientes"
                                    class="tab-vista px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-brand text-white">
                                <i class="fas fa-clock mr-1"></i> Recientes
                                <span id="count-recientes" class="ml-1 px-1.5 py-0.5 bg-white/20 rounded-full text-xs"></span>
                            </button>
                            <button onclick="moduloEnviosCreados.cambiarVista('historicos')"
                                    id="tab-historicos"
                                    class="tab-vista px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200">
                                <i class="fas fa-archive mr-1"></i> Históricos
                                <span id="count-historicos" class="ml-1 px-1.5 py-0.5 bg-gray-200 rounded-full text-xs"></span>
                            </button>
                        </div>
                    </div>

                    <!-- Pestañas de filtro por destino -->
                    <div id="tabs-destinos" class="border-t border-gray-100 pt-3 hidden">
                        <div class="flex flex-wrap gap-2" id="contenedor-tabs-destinos">
                            <button onclick="moduloEnviosCreados.filtrarPorDestino('todos')"
                                    class="tab-destino px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-brand text-white"
                                    data-destino="todos">
                                <i class="fas fa-boxes mr-1"></i> Todos
                                <span id="count-todos" class="ml-1 px-1.5 py-0.5 bg-white/20 rounded-full text-xs"></span>
                            </button>
                            <button onclick="moduloEnviosCreados.filtrarPorDestino('meli')"
                                    class="tab-destino px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    data-destino="meli">
                                <i class="fas fa-store text-yellow-500 mr-1"></i> Full
                                <span id="count-meli" class="ml-1 px-1.5 py-0.5 bg-gray-200 rounded-full text-xs"></span>
                            </button>
                            <button onclick="moduloEnviosCreados.filtrarPorDestino('externo')"
                                    class="tab-destino px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    data-destino="externo">
                                <i class="fas fa-warehouse text-blue-500 mr-1"></i> 3PL
                                <span id="count-externo" class="ml-1 px-1.5 py-0.5 bg-gray-200 rounded-full text-xs"></span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Lista de envíos -->
                <div id="lista-envios" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div class="col-span-full text-center py-12 text-gray-400">
                        <i class="fas fa-circle-notch fa-spin fa-2x mb-4"></i>
                        <p>Cargando envíos...</p>
                    </div>
                </div>
            </div>

            <!-- Modal de edición de productos -->
            <div id="modal-editar-envio" class="fixed inset-0 z-50 hidden" aria-modal="true">
                <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onclick="moduloEnviosCreados.cerrarModal()"></div>
                <div class="fixed inset-0 z-10 overflow-y-auto p-4 flex items-center justify-center">
                    <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-fade-in">
                        <div class="bg-brand text-white px-6 py-4 flex items-center justify-between">
                            <h3 id="modal-titulo" class="font-bold text-lg">Editar Envío</h3>
                            <button onclick="moduloEnviosCreados.cerrarModal()" class="text-white/80 hover:text-white">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        <div id="modal-contenido" class="p-6 overflow-y-auto max-h-[60vh]">
                            <!-- Se llena dinámicamente -->
                        </div>
                        <div class="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                            <button onclick="moduloEnviosCreados.cerrarModal()"
                                    class="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors">
                                Cancelar
                            </button>
                            <button onclick="moduloEnviosCreados.guardarCambiosEnvio()"
                                    id="btn-guardar-modal"
                                    class="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors flex items-center gap-2">
                                <i class="fas fa-save"></i>
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal de agregar producto -->
            <div id="modal-agregar-producto" class="fixed inset-0 z-[60] hidden" aria-modal="true">
                <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onclick="moduloEnviosCreados.cerrarModalAgregarProducto()"></div>
                <div class="fixed inset-0 z-10 overflow-y-auto p-4 flex items-center justify-center">
                    <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg min-h-[420px] overflow-hidden animate-fade-in flex flex-col">
                        <div class="bg-brand text-white px-6 py-4 flex items-center justify-between">
                            <h3 class="font-bold text-lg">
                                <i class="fas fa-plus-circle mr-2"></i>
                                Agregar Producto
                            </h3>
                            <button onclick="moduloEnviosCreados.cerrarModalAgregarProducto()" class="text-white/80 hover:text-white">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        <div class="p-6 flex-1">
                            <!-- Buscador -->
                            <div class="relative">
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    Buscar publicación
                                </label>
                                <div class="relative">
                                    <input type="text"
                                           id="input-buscar-publicacion"
                                           class="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-3 focus:ring-2 focus:ring-brand focus:border-transparent"
                                           placeholder="Escribí SKU, título o ID..."
                                           autocomplete="off"
                                           oninput="moduloEnviosCreados.filtrarPublicacionesBusqueda(this.value)">
                                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                                </div>

                                <!-- Dropdown de resultados -->
                                <div id="dropdown-publicaciones"
                                     class="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto hidden">
                                    <!-- Se llena dinámicamente -->
                                </div>
                            </div>

                            <!-- Producto seleccionado -->
                            <div id="producto-seleccionado-preview" class="mt-4 hidden">
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    Producto seleccionado
                                </label>
                                <div class="bg-brand-light border border-brand/30 rounded-lg p-3 flex items-center justify-between">
                                    <div class="flex-1 min-w-0">
                                        <p id="preview-sku" class="font-bold text-brand-text"></p>
                                        <p id="preview-titulo" class="text-sm text-gray-600 truncate"></p>
                                    </div>
                                    <button onclick="moduloEnviosCreados.limpiarSeleccionProducto()"
                                            class="ml-2 text-gray-400 hover:text-red-500">
                                        <i class="fas fa-times-circle"></i>
                                    </button>
                                </div>
                            </div>

                            <!-- Cantidad -->
                            <div id="cantidad-container" class="mt-4 hidden">
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    Cantidad a enviar
                                </label>
                                <input type="number"
                                       id="input-cantidad-agregar"
                                       class="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand focus:border-transparent"
                                       value="1"
                                       min="1">
                            </div>
                        </div>
                        <div class="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                            <button onclick="moduloEnviosCreados.cerrarModalAgregarProducto()"
                                    class="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors">
                                Cancelar
                            </button>
                            <button onclick="moduloEnviosCreados.confirmarAgregarProducto()"
                                    id="btn-confirmar-agregar"
                                    disabled
                                    class="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                <i class="fas fa-plus"></i>
                                Agregar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Cargar envíos
        await moduloEnviosCreados.cargarEnvios();

        // Configurar filtro
        document.getElementById('filtro-estado').addEventListener('change', () => {
            moduloEnviosCreados.filtrarEnvios();
        });

        // Exponer módulo en window
        window.moduloEnviosCreados = moduloEnviosCreados;
    },

    // ============================================
    // CARGAR: Obtener envíos desde Supabase (OPTIMIZADO)
    // Intenta usar tablas nuevas (registro_envios + destinos_envio), fallback a legacy
    // ============================================
    cargarEnvios: async () => {
        const listaDiv = document.getElementById('lista-envios');
        listaDiv.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-400">
                <i class="fas fa-circle-notch fa-spin fa-2x mb-4"></i>
                <p>Cargando envíos...</p>
            </div>
        `;

        try {
            let envios = [];
            let todosDetalles = [];

            // Fecha límite: 30 días atrás
            const fechaLimite = new Date();
            fechaLimite.setDate(fechaLimite.getDate() - 30);
            const fechaLimiteISO = fechaLimite.toISOString();

            // Intentar cargar destinos primero
            const { data: destinos, error: errorDestinos } = await supabase
                .from('destinos_envio')
                .select('*');

            if (!errorDestinos && destinos && destinos.length > 0) {
                // Tablas nuevas disponibles
                destinosCache = {};
                destinos.forEach(d => destinosCache[d.id_destino] = d);
                usandoTablasNuevas = true;

                // Mostrar pestañas de destino
                document.getElementById('tabs-destinos')?.classList.remove('hidden');

                // Cargar envíos RECIENTES: últimos 30 días O estado != 'Recibido'
                const enviosRes = await supabase
                    .from('registro_envios')
                    .select('*')
                    .or(`fecha_creacion.gte.${fechaLimiteISO},estado.neq.Recibido`)
                    .order('fecha_creacion', { ascending: false });

                if (enviosRes.error) throw enviosRes.error;
                envios = enviosRes.data || [];

                // También cargar conteo de históricos (Recibido + antiguos)
                const historicosRes = await supabase
                    .from('registro_envios')
                    .select('id_envio, estado, fecha_creacion, id_destino, fecha_colecta')
                    .eq('estado', 'Recibido')
                    .lt('fecha_creacion', fechaLimiteISO)
                    .order('fecha_creacion', { ascending: false });

                historicosCache = (historicosRes.data || []).map(e => ({
                    ...e,
                    destino: destinosCache[e.id_destino] || { id_destino: 'FULL', nombre: 'MercadoLibre Full', tipo: 'meli' }
                }));

                // Luego cargar detalles SOLO de los envíos cargados (evita límite de 1000)
                const envioIds = envios.map(e => e.id_envio);
                if (envioIds.length > 0) {
                    const detallesRes = await supabase
                        .from('detalle_envios')
                        .select('id_envio, sku, id_publicacion, cantidad_sugerida, cantidad_enviada, cantidad_recibida')
                        .in('id_envio', envioIds);

                    if (detallesRes.error) {
                        console.error('Error cargando detalles:', detallesRes.error);
                        throw detallesRes.error;
                    }
                    todosDetalles = detallesRes.data || [];
                }

                console.log(`Cargados: ${envios.length} envíos, ${todosDetalles.length} detalles`);

                // Enriquecer cada envío con datos del destino
                envios.forEach(envio => {
                    const destino = destinosCache[envio.id_destino];
                    envio.destino = destino || { id_destino: 'FULL', nombre: 'MercadoLibre Full', tipo: 'meli' };
                });

            } else {
                // Fallback a tablas legacy
                usandoTablasNuevas = false;
                document.getElementById('tabs-destinos')?.classList.add('hidden');

                // Cargar envíos primero
                const enviosRes = await supabase
                    .from('registro_envios_full')
                    .select('*')
                    .order('fecha_creacion', { ascending: false });

                if (enviosRes.error) throw enviosRes.error;
                envios = enviosRes.data || [];

                // Luego cargar detalles SOLO de los envíos cargados
                const envioIds = envios.map(e => e.id_envio);
                if (envioIds.length > 0) {
                    const detallesRes = await supabase
                        .from('detalle_envios_full')
                        .select('id_envio, sku, id_publicacion, cantidad_enviada, cantidad_original')
                        .in('id_envio', envioIds);

                    if (detallesRes.error) {
                        console.error('Error cargando detalles legacy:', detallesRes.error);
                        throw detallesRes.error;
                    }
                    todosDetalles = detallesRes.data || [];
                }

                console.log(`Cargados (legacy): ${envios.length} envíos, ${todosDetalles.length} detalles`);

                // Para legacy, todos los envíos son a Full
                envios.forEach(envio => {
                    envio.destino = { id_destino: 'FULL', nombre: 'MercadoLibre Full', tipo: 'meli' };
                    envio.id_destino = 'FULL';
                });
            }

            // Obtener todos los SKUs únicos para buscar títulos
            const todosSkus = [...new Set(todosDetalles.map(d => d.sku).filter(Boolean))];

            // Tercera consulta: títulos (solo si hay SKUs)
            let titulosMap = {};
            if (todosSkus.length > 0) {
                const { data: pubs } = await supabase
                    .from('publicaciones_meli')
                    .select('sku, titulo')
                    .in('sku', todosSkus);

                if (pubs) {
                    pubs.forEach(p => titulosMap[p.sku] = p.titulo);
                }
            }

            // Asociar detalles a cada envío en memoria
            const detallesPorEnvio = {};
            todosDetalles.forEach(det => {
                if (!detallesPorEnvio[det.id_envio]) {
                    detallesPorEnvio[det.id_envio] = [];
                }
                detallesPorEnvio[det.id_envio].push({
                    ...det,
                    titulo: titulosMap[det.sku] || det.sku
                });
            });

            // Agregar productos y totales a cada envío
            envios.forEach(envio => {
                envio.productos = detallesPorEnvio[envio.id_envio] || [];
                envio.totalBultos = envio.productos.reduce((sum, d) => sum + (d.cantidad_enviada || 0), 0);
            });

            // Filtrar envíos huérfanos (sin productos) - son residuos de migraciones fallidas
            const enviosConProductos = envios.filter(e => e.productos.length > 0);
            const enviosHuerfanos = envios.filter(e => e.productos.length === 0);
            if (enviosHuerfanos.length > 0) {
                console.warn(`⚠️ ${enviosHuerfanos.length} envíos sin productos (huérfanos):`, enviosHuerfanos.map(e => e.id_envio));
            }

            enviosCache = enviosConProductos;

            // Actualizar contadores de pestañas
            moduloEnviosCreados.actualizarContadoresTabs();

            // Aplicar filtro actual y pintar
            moduloEnviosCreados.aplicarFiltros();

            // Actualizar contador general
            document.getElementById('contador-envios').textContent = `(${envios.length} envíos)`;

        } catch (error) {
            console.error('Error cargando envíos:', error);
            listaDiv.innerHTML = `
                <div class="col-span-full text-center py-12 text-red-500">
                    <i class="fas fa-exclamation-triangle fa-2x mb-4"></i>
                    <p>Error al cargar envíos: ${error.message}</p>
                </div>
            `;
        }
    },

    // ============================================
    // ACTUALIZAR: Contadores de pestañas de destino y vista
    // ============================================
    actualizarContadoresTabs: () => {
        // Contadores por destino (de envíos recientes)
        const countTodos = enviosCache.length;
        const countMeli = enviosCache.filter(e => e.destino?.tipo === 'meli').length;
        const countExterno = enviosCache.filter(e => e.destino?.tipo === 'externo').length;

        const elTodos = document.getElementById('count-todos');
        const elMeli = document.getElementById('count-meli');
        const elExterno = document.getElementById('count-externo');

        if (elTodos) elTodos.textContent = countTodos;
        if (elMeli) elMeli.textContent = countMeli;
        if (elExterno) elExterno.textContent = countExterno;

        // Contadores de vista (recientes / históricos)
        const elRecientes = document.getElementById('count-recientes');
        const elHistoricos = document.getElementById('count-historicos');

        if (elRecientes) elRecientes.textContent = enviosCache.length;
        if (elHistoricos) elHistoricos.textContent = historicosCache.length;
    },

    // ============================================
    // FILTRAR: Por tipo de destino
    // ============================================
    filtrarPorDestino: (tipo) => {
        filtroDestino = tipo;

        // Actualizar estilos de pestañas
        document.querySelectorAll('.tab-destino').forEach(btn => {
            if (btn.dataset.destino === tipo) {
                btn.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
                btn.classList.add('bg-brand', 'text-white');
            } else {
                btn.classList.remove('bg-brand', 'text-white');
                btn.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
            }
        });

        moduloEnviosCreados.aplicarFiltros();
    },

    // ============================================
    // CAMBIAR VISTA: Recientes / Históricos
    // ============================================
    cambiarVista: (vista) => {
        vistaActual = vista;

        // Actualizar estilos de pestañas
        const tabRecientes = document.getElementById('tab-recientes');
        const tabHistoricos = document.getElementById('tab-historicos');

        if (vista === 'recientes') {
            tabRecientes?.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
            tabRecientes?.classList.add('bg-brand', 'text-white');
            tabHistoricos?.classList.remove('bg-brand', 'text-white');
            tabHistoricos?.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');

            // Mostrar filtros (estado y destino)
            document.getElementById('filtro-estado')?.classList.remove('hidden');
            document.getElementById('tabs-destinos')?.classList.remove('hidden');

            // Pintar envíos recientes
            moduloEnviosCreados.aplicarFiltros();
        } else {
            tabHistoricos?.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
            tabHistoricos?.classList.add('bg-brand', 'text-white');
            tabRecientes?.classList.remove('bg-brand', 'text-white');
            tabRecientes?.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');

            // Ocultar filtros en históricos
            document.getElementById('filtro-estado')?.classList.add('hidden');
            document.getElementById('tabs-destinos')?.classList.add('hidden');

            // Pintar históricos (lista simplificada)
            moduloEnviosCreados.pintarHistoricos();
        }
    },

    // ============================================
    // PINTAR HISTÓRICOS: Lista simplificada
    // ============================================
    pintarHistoricos: () => {
        const listaDiv = document.getElementById('lista-envios');

        if (!historicosCache || historicosCache.length === 0) {
            listaDiv.innerHTML = `
                <div class="col-span-full text-center py-12 text-gray-400">
                    <i class="fas fa-archive fa-3x mb-4"></i>
                    <p class="text-lg">No hay envíos históricos</p>
                    <p class="text-sm mt-2">Los envíos recibidos con más de 30 días aparecerán aquí</p>
                </div>
            `;
            return;
        }

        listaDiv.innerHTML = `
            <div class="col-span-full">
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table class="w-full">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ID Envío</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Destino</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha Creación</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha Colecta</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Estado</th>
                                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Acciones</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${historicosCache.map(envio => {
                                const fechaCreacion = new Date(envio.fecha_creacion);
                                const fechaColecta = parsearFechaLocal(envio.fecha_colecta);
                                const destino = envio.destino || { nombre: 'Full', tipo: 'meli' };
                                const esExterno = destino.tipo === 'externo';

                                const badgeDestino = esExterno
                                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                           <i class="fas fa-warehouse"></i> ${destino.nombre || '3PL'}
                                       </span>`
                                    : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                           <i class="fas fa-store"></i> Full
                                       </span>`;

                                return `
                                    <tr class="hover:bg-gray-50 cursor-pointer" onclick="moduloEnviosCreados.verDetalleHistorico('${envio.id_envio}')">
                                        <td class="px-4 py-3 font-medium text-gray-800">${envio.id_envio}</td>
                                        <td class="px-4 py-3">${badgeDestino}</td>
                                        <td class="px-4 py-3 text-sm text-gray-600">${fechaCreacion.toLocaleDateString('es-AR')}</td>
                                        <td class="px-4 py-3 text-sm text-gray-600">${fechaColecta ? fechaColecta.toLocaleDateString('es-AR') : '-'}</td>
                                        <td class="px-4 py-3">
                                            <span class="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                                ${envio.estado}
                                            </span>
                                        </td>
                                        <td class="px-4 py-3 text-center">
                                            <button onclick="event.stopPropagation(); moduloEnviosCreados.verDetalleHistorico('${envio.id_envio}')"
                                                    class="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                                                    title="Ver detalle">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    // ============================================
    // VER DETALLE: Carga detalles de un envío histórico
    // ============================================
    verDetalleHistorico: async (idEnvio) => {
        mostrarNotificacion('Cargando detalle...', 'info');

        try {
            // Cargar detalles del envío
            const { data: detalles, error } = await supabase
                .from('detalle_envios')
                .select('sku, id_publicacion, cantidad_sugerida, cantidad_enviada, cantidad_recibida')
                .eq('id_envio', idEnvio);

            if (error) throw error;

            // Obtener títulos de las publicaciones
            const skus = detalles.map(d => d.sku).filter(Boolean);
            let titulosMap = {};
            if (skus.length > 0) {
                const { data: pubs } = await supabase
                    .from('publicaciones_meli')
                    .select('sku, titulo')
                    .in('sku', skus);

                if (pubs) {
                    pubs.forEach(p => titulosMap[p.sku] = p.titulo);
                }
            }

            // Enriquecer detalles con títulos
            const detallesConTitulo = detalles.map(d => ({
                ...d,
                titulo: titulosMap[d.sku] || d.sku
            }));

            // Obtener datos del envío
            const envioHistorico = historicosCache.find(e => e.id_envio === idEnvio);
            const destino = envioHistorico?.destino || { nombre: 'Full', tipo: 'meli' };

            // Mostrar modal con detalle
            const modal = document.getElementById('modal-editar-envio');
            const modalTitulo = document.getElementById('modal-titulo');
            const modalContenido = document.getElementById('modal-contenido');
            const btnGuardar = document.getElementById('btn-guardar-modal');

            modalTitulo.innerHTML = `<i class="fas fa-archive mr-2"></i> Detalle Histórico: ${idEnvio}`;
            btnGuardar.classList.add('hidden'); // Ocultar botón guardar

            const totalUnidades = detallesConTitulo.reduce((sum, d) => sum + (d.cantidad_enviada || 0), 0);

            modalContenido.innerHTML = `
                <div class="space-y-4">
                    <div class="flex items-center gap-2 text-sm text-gray-600">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${destino.tipo === 'externo' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}">
                            <i class="fas ${destino.tipo === 'externo' ? 'fa-warehouse' : 'fa-store'}"></i>
                            ${destino.nombre || 'Full'}
                        </span>
                        <span>•</span>
                        <span>${detallesConTitulo.length} productos</span>
                        <span>•</span>
                        <span>${totalUnidades} unidades</span>
                    </div>

                    <table class="w-full text-sm">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-3 py-2 text-left font-semibold text-gray-700">SKU</th>
                                <th class="px-3 py-2 text-left font-semibold text-gray-700">Producto</th>
                                <th class="px-3 py-2 text-right font-semibold text-gray-700">Enviado</th>
                                <th class="px-3 py-2 text-right font-semibold text-gray-700">Recibido</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${detallesConTitulo.map(d => `
                                <tr class="hover:bg-gray-50">
                                    <td class="px-3 py-2 font-medium text-gray-800">${d.sku}</td>
                                    <td class="px-3 py-2 text-gray-600 truncate max-w-[200px]" title="${d.titulo}">${d.titulo}</td>
                                    <td class="px-3 py-2 text-right">${d.cantidad_enviada || 0}</td>
                                    <td class="px-3 py-2 text-right ${d.cantidad_recibida !== d.cantidad_enviada ? 'text-orange-600 font-medium' : ''}">${d.cantidad_recibida || 0}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            modal.classList.remove('hidden');

        } catch (error) {
            console.error('Error cargando detalle histórico:', error);
            mostrarNotificacion(`Error: ${error.message}`, 'error');
        }
    },

    // ============================================
    // APLICAR: Ambos filtros (estado + destino)
    // ============================================
    aplicarFiltros: () => {
        const filtroEstado = document.getElementById('filtro-estado')?.value || 'todos';

        let enviosFiltrados = enviosCache;

        // Filtrar por estado
        if (filtroEstado !== 'todos') {
            enviosFiltrados = enviosFiltrados.filter(e => e.estado === filtroEstado);
        }

        // Filtrar por destino
        if (filtroDestino !== 'todos') {
            enviosFiltrados = enviosFiltrados.filter(e => e.destino?.tipo === filtroDestino);
        }

        moduloEnviosCreados.pintarEnvios(enviosFiltrados);
    },

    // ============================================
    // PINTAR: Renderizar tarjetas de envíos
    // ============================================
    pintarEnvios: (envios) => {
        const listaDiv = document.getElementById('lista-envios');

        if (!envios || envios.length === 0) {
            listaDiv.innerHTML = `
                <div class="col-span-full text-center py-12 text-gray-400">
                    <i class="fas fa-box-open fa-3x mb-4"></i>
                    <p class="text-lg">No hay envíos registrados</p>
                    <p class="text-sm mt-2">Crea uno desde la Calculadora de Envíos</p>
                </div>
            `;
            return;
        }

        listaDiv.innerHTML = envios.map(envio => {
            const fechaCreacion = new Date(envio.fecha_creacion);
            const fechaColecta = parsearFechaLocal(envio.fecha_colecta);
            const destino = envio.destino || { nombre: 'Full', tipo: 'meli' };
            const esExterno = destino.tipo === 'externo';

            // Colores según estado
            const estadoColores = {
                'Borrador': 'bg-gray-100 text-gray-700 border-gray-300',
                'En Preparación': 'bg-yellow-100 text-yellow-800 border-yellow-300',
                'Despachado': 'bg-blue-100 text-blue-800 border-blue-300',
                'Recibido': 'bg-green-100 text-green-800 border-green-300'
            };

            const estadoClase = estadoColores[envio.estado] || estadoColores['Borrador'];

            // Borde izquierdo según tipo de destino
            const bordeIzq = esExterno ? 'border-l-blue-500' : 'border-l-yellow-500';

            // Badge de destino
            const badgeDestino = esExterno
                ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                       <i class="fas fa-warehouse"></i> ${destino.nombre || '3PL'}
                   </span>`
                : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                       <i class="fas fa-store"></i> Full
                   </span>`;

            return `
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 ${bordeIzq} overflow-hidden hover:shadow-md transition-shadow" data-estado="${envio.estado}" data-destino-tipo="${destino.tipo}">
                <!-- Header de la tarjeta -->
                <div class="p-4 border-b border-gray-100">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-gray-800 text-lg">${envio.id_envio}</h4>
                            <div class="flex items-center gap-2 mt-1">
                                ${badgeDestino}
                                ${envio.id_envio_ml ? `<span class="text-xs text-gray-500">ML: ${envio.id_envio_ml}</span>` : ''}
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="px-3 py-1 rounded-full text-xs font-bold ${estadoClase}">
                                ${envio.estado}
                            </span>
                            ${envio.embalado ? `
                            <span class="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                                <i class="fas fa-check-circle mr-1"></i>Embalado
                            </span>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- Métricas -->
                <div class="p-4 grid grid-cols-3 gap-4 bg-gray-50">
                    <div class="text-center">
                        <p class="text-xs text-gray-500 uppercase font-medium">Creación</p>
                        <p class="font-bold text-gray-800">${fechaCreacion.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</p>
                    </div>
                    <div class="text-center">
                        <p class="text-xs text-gray-500 uppercase font-medium">Colecta</p>
                        <p class="font-bold text-gray-800">${fechaColecta ? fechaColecta.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '-'}</p>
                    </div>
                    <div class="text-center">
                        <p class="text-xs text-gray-500 uppercase font-medium">Bultos</p>
                        <p class="font-bold text-gray-800">${envio.totalBultos || 0}</p>
                    </div>
                </div>

                <!-- Productos -->
                <div class="p-4">
                    <p class="text-sm font-medium text-gray-700 mb-2">
                        <i class="fas fa-box mr-1"></i>
                        Productos (${envio.productos.length})
                    </p>
                    <ul class="text-sm text-gray-600 max-h-24 overflow-y-auto space-y-1">
                        ${envio.productos.slice(0, 5).map(p => {
                            const cantOriginal = p.cantidad_original || p.cantidad_enviada;
                            const cantEnviada = p.cantidad_enviada || 0;
                            const hayDiscrepancia = cantOriginal > cantEnviada;
                            return `
                            <li class="flex justify-between">
                                <span class="truncate" title="${p.titulo || p.sku}">${p.sku}</span>
                                ${hayDiscrepancia
                                    ? `<span class="font-medium text-orange-600" title="Cantidad ajustada: ${cantEnviada} de ${cantOriginal}">
                                        ${cantEnviada} <span class="text-xs text-gray-400">de ${cantOriginal}</span>
                                       </span>`
                                    : `<span class="font-medium">${cantEnviada} uds</span>`
                                }
                            </li>`;
                        }).join('')}
                        ${envio.productos.length > 5 ? `<li class="text-gray-400 italic">+${envio.productos.length - 5} más...</li>` : ''}
                    </ul>
                </div>

                <!-- Notas -->
                ${envio.notas ? `
                <div class="px-4 pb-2">
                    <p class="text-xs text-gray-500 italic truncate" title="${envio.notas}">
                        <i class="fas fa-sticky-note mr-1"></i>${envio.notas}
                    </p>
                </div>
                ` : ''}

                <!-- Acciones -->
                <div class="p-4 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-2">
                    <!-- Select de estado -->
                    <select class="estado-select text-sm border border-gray-300 rounded-lg px-2 py-1 flex-1 min-w-[120px]"
                            data-id="${envio.id_envio}"
                            onchange="moduloEnviosCreados.cambiarEstado('${envio.id_envio}', this.value)">
                        <option value="Borrador" ${envio.estado === 'Borrador' ? 'selected' : ''}>Borrador</option>
                        <option value="En Preparación" ${envio.estado === 'En Preparación' ? 'selected' : ''}>En Preparación</option>
                        <option value="Despachado" ${envio.estado === 'Despachado' ? 'selected' : ''}>Despachado</option>
                        <option value="Recibido" ${envio.estado === 'Recibido' ? 'selected' : ''}>Recibido</option>
                    </select>

                    <!-- Botones de acción -->
                    <div class="flex gap-1 flex-wrap">
                        <button onclick="moduloEnviosCreados.iniciarPreparacion('${envio.id_envio}')"
                                class="p-2 ${envio.estado === 'En Preparación' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'} rounded-lg transition-colors"
                                title="Preparar envío"
                                ${envio.estado !== 'En Preparación' ? 'disabled' : ''}>
                            <i class="fas fa-box-open"></i>
                        </button>

                        <button onclick="moduloEnviosCreados.editarEnvio('${envio.id_envio}')"
                                class="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                                title="Editar productos">
                            <i class="fas fa-edit"></i>
                        </button>

                        <button onclick="moduloEnviosCreados.generarPDF('${envio.id_envio}')"
                                class="p-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                                title="Generar PDF">
                            <i class="fas fa-file-pdf"></i>
                        </button>

                        ${esExterno ? `
                        <button onclick="moduloEnviosCreados.generarRemito('${envio.id_envio}')"
                                class="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                                title="Generar Remito 3PL">
                            <i class="fas fa-file-invoice"></i>
                        </button>

                        <button onclick="moduloEnviosCreados.generarEtiquetas('${envio.id_envio}')"
                                class="p-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors"
                                title="Generar Etiquetas">
                            <i class="fas fa-tags"></i>
                        </button>
                        ` : ''}

                        <button onclick="moduloEnviosCreados.eliminarEnvio('${envio.id_envio}')"
                                class="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                                title="Eliminar envío">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    },

    // ============================================
    // FILTRAR: Por estado (legacy, redirige a aplicarFiltros)
    // ============================================
    filtrarEnvios: () => {
        moduloEnviosCreados.aplicarFiltros();
    },

    // ============================================
    // CAMBIAR ESTADO: Actualizar estado del envío
    // ============================================
    cambiarEstado: async (idEnvio, nuevoEstado) => {
        try {
            const tabla = usandoTablasNuevas ? 'registro_envios' : 'registro_envios_full';
            const { error } = await supabase
                .from(tabla)
                .update({ estado: nuevoEstado })
                .eq('id_envio', idEnvio);

            if (error) throw error;

            // Actualizar caché local
            const envio = enviosCache.find(e => e.id_envio === idEnvio);
            if (envio) envio.estado = nuevoEstado;

            // Sincronizar con RRHH si cambia a "En Preparación"
            if (nuevoEstado === 'En Preparación' && envio) {
                await sincronizarConRRHH(envio, 'crear');
            }

            mostrarNotificacion(`Estado actualizado a "${nuevoEstado}"`, 'success');

            // Recargar para actualizar colores
            moduloEnviosCreados.aplicarFiltros();

        } catch (error) {
            console.error('Error cambiando estado:', error);
            mostrarNotificacion('Error al cambiar estado', 'error');
        }
    },

    // ============================================
    // EDITAR: Abrir modal de edición
    // ============================================
    editarEnvio: async (idEnvio) => {
        const envio = enviosCache.find(e => e.id_envio === idEnvio);
        if (!envio) {
            mostrarNotificacion('Envío no encontrado', 'error');
            return;
        }

        envioSeleccionado = envio;
        document.getElementById('modal-titulo').textContent = `Editar Envío: ${idEnvio}`;

        const fechaColecta = envio.fecha_colecta
            ? fechaLocalISO(parsearFechaLocal(envio.fecha_colecta))
            : '';

        document.getElementById('modal-contenido').innerHTML = `
            <div class="space-y-4">
                <!-- Campos del envío -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Fecha Colecta</label>
                        <input type="date" id="edit-fecha-colecta" value="${fechaColecta}"
                               class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">ID Envío ML</label>
                        <input type="text" id="edit-id-ml" value="${envio.id_envio_ml || ''}" placeholder="Ej: 12345678"
                               class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent">
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                    <textarea id="edit-notas" rows="2" placeholder="Observaciones..."
                              class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent">${envio.notas || ''}</textarea>
                </div>

                <!-- Lista de productos -->
                <div>
                    <div class="flex justify-between items-center mb-2">
                        <label class="block text-sm font-medium text-gray-700">
                            Productos del Envío
                            <span class="text-gray-400 font-normal">(${envio.productos.length})</span>
                        </label>
                        <button onclick="moduloEnviosCreados.agregarProducto()"
                                class="text-sm text-brand hover:text-brand-dark font-medium">
                            <i class="fas fa-plus mr-1"></i>Agregar
                        </button>
                    </div>

                    <!-- Buscador de productos del envío -->
                    <div class="relative mb-2">
                        <input type="text"
                               id="input-filtrar-productos-envio"
                               class="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent"
                               placeholder="Filtrar por SKU o título..."
                               autocomplete="off"
                               oninput="moduloEnviosCreados.filtrarProductosEnvio(this.value)">
                        <i class="fas fa-filter absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                    </div>

                    <div id="lista-productos-editar" class="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                        ${envio.productos.map((p, idx) => `
                            <div class="flex items-center justify-between p-3 hover:bg-gray-50 producto-item-envio"
                                 data-idx="${idx}"
                                 data-sku="${(p.sku || '').toLowerCase()}"
                                 data-titulo="${(p.titulo || '').toLowerCase()}">
                                <div class="flex-1 min-w-0">
                                    <p class="font-medium text-gray-800 truncate">${p.sku}</p>
                                    <p class="text-xs text-gray-500 truncate">${p.titulo || '-'}</p>
                                </div>
                                <div class="flex items-center gap-2 ml-4">
                                    <input type="number" value="${p.cantidad_enviada}" min="0"
                                           class="w-16 text-center border border-gray-300 rounded px-2 py-1"
                                           onchange="moduloEnviosCreados.actualizarCantidadProducto(${idx}, this.value)">
                                    <button onclick="moduloEnviosCreados.quitarProducto(${idx})"
                                            class="text-red-500 hover:text-red-700">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <p id="contador-filtro-productos" class="text-xs text-gray-400 mt-1 hidden"></p>
                </div>
            </div>
        `;

        document.getElementById('modal-editar-envio').classList.remove('hidden');
    },

    // ============================================
    // MODAL: Cerrar
    // ============================================
    cerrarModal: () => {
        document.getElementById('modal-editar-envio').classList.add('hidden');
        document.getElementById('btn-guardar-modal')?.classList.remove('hidden'); // Restaurar botón guardar
        envioSeleccionado = null;
    },

    // ============================================
    // GUARDAR: Cambios del modal
    // ============================================
    guardarCambiosEnvio: async () => {
        if (!envioSeleccionado) return;

        const btnGuardar = document.getElementById('btn-guardar-modal');
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Guardando...';

        try {
            const fechaColecta = document.getElementById('edit-fecha-colecta').value;
            const idMl = document.getElementById('edit-id-ml').value.trim();
            const notas = document.getElementById('edit-notas').value.trim();

            const tablaEnvios = usandoTablasNuevas ? 'registro_envios' : 'registro_envios_full';
            const tablaDetalles = usandoTablasNuevas ? 'detalle_envios' : 'detalle_envios_full';

            // Actualizar registro del envío
            // Guardar fecha con hora al mediodía para evitar problemas de timezone UTC
            const { error } = await supabase
                .from(tablaEnvios)
                .update({
                    fecha_colecta: fechaColecta ? `${fechaColecta}T12:00:00` : null,
                    id_envio_ml: idMl || null,
                    notas: notas || null
                })
                .eq('id_envio', envioSeleccionado.id_envio);

            if (error) throw error;

            // Actualizar detalles de productos
            // Primero eliminar los existentes
            await supabase
                .from(tablaDetalles)
                .delete()
                .eq('id_envio', envioSeleccionado.id_envio);

            // Insertar los nuevos
            if (envioSeleccionado.productos.length > 0) {
                const detallesBase = envioSeleccionado.productos.map(p => ({
                    id_envio: envioSeleccionado.id_envio,
                    sku: p.sku,
                    id_publicacion: p.id_publicacion || null,
                    cantidad_enviada: p.cantidad_enviada
                }));

                // Agregar campos específicos según tabla
                const detalles = usandoTablasNuevas
                    ? detallesBase.map(d => ({ ...d, cantidad_sugerida: d.cantidad_enviada }))
                    : detallesBase.map(d => ({ ...d, cantidad_original: d.cantidad_enviada }));

                const { error: errorDet } = await supabase
                    .from(tablaDetalles)
                    .insert(detalles);

                if (errorDet) throw errorDet;
            }

            mostrarNotificacion('Envío actualizado correctamente', 'success');
            moduloEnviosCreados.cerrarModal();
            await moduloEnviosCreados.cargarEnvios();

        } catch (error) {
            console.error('Error guardando envío:', error);
            mostrarNotificacion('Error al guardar cambios', 'error');
        } finally {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
        }
    },

    // ============================================
    // PRODUCTOS: Actualizar cantidad
    // ============================================
    actualizarCantidadProducto: (idx, cantidad) => {
        if (envioSeleccionado && envioSeleccionado.productos[idx]) {
            envioSeleccionado.productos[idx].cantidad_enviada = parseInt(cantidad) || 0;
        }
    },

    // ============================================
    // PRODUCTOS: Quitar de la lista
    // ============================================
    quitarProducto: (idx) => {
        if (envioSeleccionado) {
            envioSeleccionado.productos.splice(idx, 1);
            // Re-renderizar la lista
            moduloEnviosCreados.editarEnvio(envioSeleccionado.id_envio);
        }
    },

    // ============================================
    // PRODUCTOS: Filtrar lista en modal de edición
    // ============================================
    filtrarProductosEnvio: (texto) => {
        const busqueda = texto.trim().toLowerCase();
        const items = document.querySelectorAll('.producto-item-envio');
        const contador = document.getElementById('contador-filtro-productos');
        let visibles = 0;

        items.forEach(item => {
            const sku = item.dataset.sku || '';
            const titulo = item.dataset.titulo || '';

            if (busqueda === '' || sku.includes(busqueda) || titulo.includes(busqueda)) {
                item.classList.remove('hidden');
                visibles++;
            } else {
                item.classList.add('hidden');
            }
        });

        // Mostrar contador si hay filtro activo
        if (busqueda !== '') {
            contador.textContent = `Mostrando ${visibles} de ${items.length} productos`;
            contador.classList.remove('hidden');
        } else {
            contador.classList.add('hidden');
        }
    },

    // ============================================
    // PRODUCTOS: Agregar nuevo (abre modal)
    // ============================================
    agregarProducto: async () => {
        await moduloEnviosCreados.abrirModalAgregarProducto();
    },

    // ============================================
    // MODAL AGREGAR: Abrir y cargar publicaciones
    // ============================================
    abrirModalAgregarProducto: async () => {
        if (!envioSeleccionado) return;

        // Resetear estado
        publicacionSeleccionada = null;
        document.getElementById('input-buscar-publicacion').value = '';
        document.getElementById('dropdown-publicaciones').classList.add('hidden');
        document.getElementById('producto-seleccionado-preview').classList.add('hidden');
        document.getElementById('cantidad-container').classList.add('hidden');
        document.getElementById('btn-confirmar-agregar').disabled = true;
        document.getElementById('input-cantidad-agregar').value = 1;

        // Mostrar modal
        document.getElementById('modal-agregar-producto').classList.remove('hidden');

        // Cargar publicaciones disponibles
        await moduloEnviosCreados.cargarPublicacionesDisponibles();

        // Enfocar input
        setTimeout(() => {
            document.getElementById('input-buscar-publicacion')?.focus();
        }, 100);
    },

    // ============================================
    // MODAL AGREGAR: Cargar publicaciones (excluyendo las del envío)
    // ============================================
    cargarPublicacionesDisponibles: async () => {
        try {
            // Obtener SKUs ya incluidos en el envío
            const skusEnEnvio = envioSeleccionado.productos.map(p => p.sku?.toUpperCase()).filter(Boolean);

            // Cargar todas las publicaciones
            const { data: pubs, error } = await supabase
                .from('publicaciones_meli')
                .select('sku, titulo, id_publicacion, id_inventario, stock_full')
                .order('sku', { ascending: true });

            if (error) throw error;

            // Filtrar excluyendo las que ya están en el envío
            publicacionesDisponibles = (pubs || []).filter(p =>
                !skusEnEnvio.includes(p.sku?.toUpperCase())
            );

        } catch (error) {
            console.error('Error cargando publicaciones:', error);
            mostrarNotificacion('Error al cargar publicaciones', 'error');
            publicacionesDisponibles = [];
        }
    },

    // ============================================
    // MODAL AGREGAR: Filtrar publicaciones en dropdown
    // ============================================
    filtrarPublicacionesBusqueda: (texto) => {
        const dropdown = document.getElementById('dropdown-publicaciones');
        const busqueda = texto.trim().toLowerCase();

        if (busqueda.length < 2) {
            dropdown.classList.add('hidden');
            return;
        }

        // Filtrar por SKU, título o ID
        const resultados = publicacionesDisponibles.filter(p => {
            const sku = (p.sku || '').toLowerCase();
            const titulo = (p.titulo || '').toLowerCase();
            const idPub = (p.id_publicacion || '').toLowerCase();
            const idInv = (p.id_inventario || '').toLowerCase();

            return sku.includes(busqueda) ||
                   titulo.includes(busqueda) ||
                   idPub.includes(busqueda) ||
                   idInv.includes(busqueda);
        }).slice(0, 10); // Limitar a 10 resultados

        if (resultados.length === 0) {
            dropdown.innerHTML = `
                <div class="px-4 py-3 text-sm text-gray-500 text-center">
                    <i class="fas fa-search mr-1"></i>
                    No se encontraron resultados
                </div>
            `;
        } else {
            dropdown.innerHTML = resultados.map(p => `
                <div class="px-4 py-3 hover:bg-brand-light cursor-pointer transition-colors border-b border-gray-100 last:border-0"
                     onclick="moduloEnviosCreados.seleccionarPublicacion('${p.sku}')">
                    <div class="flex justify-between items-start">
                        <div class="flex-1 min-w-0">
                            <p class="font-medium text-gray-800">${p.sku || '-'}</p>
                            <p class="text-sm text-gray-500 truncate">${p.titulo || '-'}</p>
                        </div>
                        <span class="ml-2 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
                            Stock: ${p.stock_full || 0}
                        </span>
                    </div>
                </div>
            `).join('');
        }

        dropdown.classList.remove('hidden');
    },

    // ============================================
    // MODAL AGREGAR: Seleccionar publicación
    // ============================================
    seleccionarPublicacion: (sku) => {
        const pub = publicacionesDisponibles.find(p => p.sku === sku);
        if (!pub) return;

        publicacionSeleccionada = pub;

        // Ocultar dropdown
        document.getElementById('dropdown-publicaciones').classList.add('hidden');
        document.getElementById('input-buscar-publicacion').value = '';

        // Mostrar preview del producto seleccionado
        document.getElementById('preview-sku').textContent = pub.sku;
        document.getElementById('preview-titulo').textContent = pub.titulo || '-';
        document.getElementById('producto-seleccionado-preview').classList.remove('hidden');

        // Mostrar input de cantidad
        document.getElementById('cantidad-container').classList.remove('hidden');

        // Habilitar botón de agregar
        document.getElementById('btn-confirmar-agregar').disabled = false;

        // Enfocar input de cantidad
        document.getElementById('input-cantidad-agregar').focus();
        document.getElementById('input-cantidad-agregar').select();
    },

    // ============================================
    // MODAL AGREGAR: Limpiar selección
    // ============================================
    limpiarSeleccionProducto: () => {
        publicacionSeleccionada = null;

        document.getElementById('producto-seleccionado-preview').classList.add('hidden');
        document.getElementById('cantidad-container').classList.add('hidden');
        document.getElementById('btn-confirmar-agregar').disabled = true;
        document.getElementById('input-buscar-publicacion').value = '';
        document.getElementById('input-buscar-publicacion').focus();
    },

    // ============================================
    // MODAL AGREGAR: Confirmar y agregar producto
    // ============================================
    confirmarAgregarProducto: () => {
        if (!publicacionSeleccionada || !envioSeleccionado) return;

        const cantidad = parseInt(document.getElementById('input-cantidad-agregar').value) || 1;

        // Agregar al envío
        envioSeleccionado.productos.push({
            sku: publicacionSeleccionada.sku,
            titulo: publicacionSeleccionada.titulo,
            id_publicacion: publicacionSeleccionada.id_publicacion,
            cantidad_enviada: cantidad
        });

        mostrarNotificacion(`${publicacionSeleccionada.sku} agregado al envío`, 'success');

        // Cerrar modal de agregar
        moduloEnviosCreados.cerrarModalAgregarProducto();

        // Re-renderizar el modal de edición
        moduloEnviosCreados.editarEnvio(envioSeleccionado.id_envio);
    },

    // ============================================
    // MODAL AGREGAR: Cerrar
    // ============================================
    cerrarModalAgregarProducto: () => {
        document.getElementById('modal-agregar-producto').classList.add('hidden');
        publicacionSeleccionada = null;
    },

    // ============================================
    // ELIMINAR: Envío completo
    // ============================================
    eliminarEnvio: async (idEnvio) => {
        const confirmado = await confirmarAccion(
            '¿Eliminar envío?',
            `El envío ${idEnvio} y todos sus productos serán eliminados permanentemente.`,
            'danger',
            'Sí, Eliminar'
        );

        if (!confirmado) return;

        try {
            const tablaEnvios = usandoTablasNuevas ? 'registro_envios' : 'registro_envios_full';
            const tablaDetalles = usandoTablasNuevas ? 'detalle_envios' : 'detalle_envios_full';

            // Eliminar progreso de preparación si existe
            await supabase
                .from('preparacion_en_curso')
                .delete()
                .eq('id_envio', idEnvio);

            // Eliminar detalles (FK)
            await supabase
                .from(tablaDetalles)
                .delete()
                .eq('id_envio', idEnvio);

            // Eliminar registro del envío
            const { error } = await supabase
                .from(tablaEnvios)
                .delete()
                .eq('id_envio', idEnvio);

            if (error) throw error;

            mostrarNotificacion('Envío eliminado', 'success');
            await moduloEnviosCreados.cargarEnvios();

        } catch (error) {
            console.error('Error eliminando envío:', error);
            mostrarNotificacion('Error al eliminar envío', 'error');
        }
    },

    // ============================================
    // GENERAR PDF: Crear PDF del envío para imprimir
    // ============================================
    generarPDF: async (idEnvio) => {
        const envio = enviosCache.find(e => e.id_envio === idEnvio);
        if (!envio) {
            mostrarNotificacion('Envío no encontrado', 'error');
            return;
        }

        try {
            // Obtener inventory_id de cada producto desde publicaciones_meli
            const skus = envio.productos.map(p => p.sku).filter(Boolean);
            let inventoryMap = {};

            if (skus.length > 0) {
                const { data: pubs } = await supabase
                    .from('publicaciones_meli')
                    .select('sku, id_inventario')
                    .in('sku', skus);

                if (pubs) {
                    pubs.forEach(p => inventoryMap[p.sku] = p.id_inventario);
                }
            }

            // Usar jsPDF
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const fechaCreacion = new Date(envio.fecha_creacion);
            const fechaColecta = parsearFechaLocal(envio.fecha_colecta);
            const totalBultos = envio.productos.reduce((sum, p) => sum + (p.cantidad_enviada || 0), 0);

            // === HEADER MINIMALISTA ===
            doc.setFontSize(18);
            doc.setTextColor(50, 50, 50);
            doc.setFont('helvetica', 'bold');
            doc.text('Envío a Full', 14, 20);

            // ID del envío destacado
            doc.setFontSize(11);
            doc.setTextColor(78, 171, 135);
            doc.text(envio.id_envio, 14, 28);

            // Info compacta en una línea
            doc.setFontSize(9);
            doc.setTextColor(120, 120, 120);
            doc.setFont('helvetica', 'normal');
            const infoLine = [
                `Creado: ${fechaCreacion.toLocaleDateString('es-AR')}`,
                fechaColecta ? `Colecta: ${fechaColecta.toLocaleDateString('es-AR')}` : null,
                envio.id_envio_ml ? `ML: ${envio.id_envio_ml}` : null
            ].filter(Boolean).join('  |  ');
            doc.text(infoLine, 14, 35);

            // Resumen en header derecho
            doc.setFontSize(10);
            doc.setTextColor(50, 50, 50);
            doc.setFont('helvetica', 'bold');
            doc.text(`${envio.productos.length} productos`, 196, 20, { align: 'right' });
            doc.text(`${totalBultos} unidades`, 196, 27, { align: 'right' });

            // Estado con color
            const estadoColor = {
                'Borrador': [150, 150, 150],
                'En Preparación': [234, 179, 8],
                'Despachado': [59, 130, 246],
                'Recibido': [34, 197, 94]
            };
            doc.setTextColor(...(estadoColor[envio.estado] || [100, 100, 100]));
            doc.setFontSize(9);
            doc.text(envio.estado.toUpperCase(), 196, 34, { align: 'right' });

            // Línea separadora sutil
            doc.setDrawColor(230, 230, 230);
            doc.setLineWidth(0.5);
            doc.line(14, 42, 196, 42);

            // === TABLA DE PRODUCTOS ===
            // Verificar si hay discrepancias para mostrar columna adicional
            const hayDiscrepancias = envio.productos.some(p =>
                (p.cantidad_original || p.cantidad_enviada) > (p.cantidad_enviada || 0)
            );

            const productosData = envio.productos.map((p, idx) => {
                const cantOriginal = p.cantidad_original || p.cantidad_enviada;
                const cantEnviada = p.cantidad_enviada || 0;
                const tieneDiscrepancia = cantOriginal > cantEnviada;

                const fila = [
                    idx + 1,
                    p.sku || '-',
                    inventoryMap[p.sku] || '-',
                    p.titulo || '-',
                    cantEnviada
                ];

                // Agregar columna de original solo si hay discrepancias en algún producto
                if (hayDiscrepancias) {
                    fila.push(tieneDiscrepancia ? cantOriginal : '-');
                }

                return fila;
            });

            // Header dinámico según si hay discrepancias
            const tableHead = hayDiscrepancias
                ? [['#', 'SKU', 'Inv ID', 'Producto', 'Env', 'Orig']]
                : [['#', 'SKU', 'Inv ID', 'Producto', 'Cant']];

            // Estilos de columnas dinámicos
            const columnStyles = hayDiscrepancias
                ? {
                    0: { cellWidth: 10, halign: 'center', textColor: [150, 150, 150], fontSize: 7 },
                    1: { cellWidth: 30, fontSize: 7, font: 'courier' },
                    2: { cellWidth: 20, fontSize: 7, textColor: [100, 100, 100] },
                    3: { cellWidth: 94 },
                    4: { cellWidth: 14, halign: 'center', fontStyle: 'bold', textColor: [234, 88, 12] }, // Naranja para enviado
                    5: { cellWidth: 14, halign: 'center', textColor: [150, 150, 150] } // Gris para original
                }
                : {
                    0: { cellWidth: 10, halign: 'center', textColor: [150, 150, 150], fontSize: 7 },
                    1: { cellWidth: 34, fontSize: 7, font: 'courier' },
                    2: { cellWidth: 22, fontSize: 7, textColor: [100, 100, 100] },
                    3: { cellWidth: 104 },
                    4: { cellWidth: 12, halign: 'center', fontStyle: 'bold', textColor: [50, 50, 50] }
                };

            doc.autoTable({
                startY: 48,
                head: tableHead,
                body: productosData,
                theme: 'plain',
                headStyles: {
                    fillColor: [248, 250, 252],
                    textColor: [80, 80, 80],
                    fontStyle: 'bold',
                    fontSize: 8,
                    cellPadding: 4,
                    lineWidth: 0,
                    lineColor: [230, 230, 230]
                },
                bodyStyles: {
                    fontSize: 8,
                    cellPadding: 3,
                    lineColor: [240, 240, 240],
                    lineWidth: 0.1
                },
                alternateRowStyles: {
                    fillColor: [252, 252, 253]
                },
                columnStyles: columnStyles,
                styles: {
                    overflow: 'linebreak',
                    cellPadding: 3
                },
                margin: { left: 14, right: 14 },
                tableLineColor: [230, 230, 230],
                tableLineWidth: 0.1
            });

            // === FOOTER ===
            const finalY = doc.lastAutoTable.finalY + 8;

            // Notas si existen
            if (envio.notas) {
                doc.setFontSize(8);
                doc.setTextColor(100, 100, 100);
                doc.setFont('helvetica', 'italic');
                doc.text(`Notas: ${envio.notas}`, 14, finalY);
            }

            // Timestamp
            doc.setFontSize(7);
            doc.setTextColor(180, 180, 180);
            doc.setFont('helvetica', 'normal');
            doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 105, 290, { align: 'center' });

            // === ABRIR EN NUEVA VENTANA ===
            const pdfBlob = doc.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');

            mostrarNotificacion('PDF generado', 'success');

        } catch (error) {
            console.error('Error generando PDF:', error);
            mostrarNotificacion('Error al generar PDF', 'error');
        }
    },

    // ============================================
    // MODO PREPARACIÓN: Escaneo de productos
    // ============================================
    preparacionActiva: null,
    productosPreparacion: [],
    ultimoSkuFoco: null,
    autoSaveTimeout: null, // Timer para debounce del auto-guardado
    realtimeChannel: null, // Canal de Supabase Realtime para multi-usuario
    realtimeDebounce: null, // Timer para debounce de cambios Realtime

    iniciarPreparacion: async (idEnvio) => {
        const envio = enviosCache.find(e => e.id_envio === idEnvio);
        if (!envio) {
            mostrarNotificacion('Envío no encontrado', 'error');
            return;
        }

        if (envio.estado !== 'En Preparación') {
            mostrarNotificacion('El envío debe estar en estado "En Preparación"', 'warning');
            return;
        }

        moduloEnviosCreados.preparacionActiva = envio;

        // Cargar datos maestros para preparación extendida (colaboradores, tareas, consumibles)
        await cargarDatosMaestrosPreparacion();

        // Obtener preparación desde RRHH (para preseleccionar colaborador asignado)
        preparacionRRHH = await obtenerPreparacionRRHH(idEnvio);

        // Inicializar estado de tareas y consumibles
        tareasSeleccionadas = [];
        consumiblesUsados = {};
        cantidadBultosPrep = envio.totalBultos || 0;

        // Si hay preparación en RRHH y está asignada, marcar inicio
        if (preparacionRRHH && preparacionRRHH.estado === 'ASIGNADO') {
            await supabaseRRHH.rpc('rpc_iniciar_preparacion', {
                p_preparacion_id: preparacionRRHH.id,
                p_colaborador_id: preparacionRRHH.asignado_a_id
            });
        }

        // Verificar si hay progreso guardado
        const progresoGuardado = await moduloEnviosCreados.cargarProgresoGuardado(envio.id_envio);
        const progresoMap = {};
        progresoGuardado.forEach(p => {
            progresoMap[p.sku] = p.cantidad_escaneada || 0;
        });

        // Obtener inventory_id de todos los productos en UNA sola consulta (batch)
        const skusEnvio = envio.productos.map(p => p.sku).filter(Boolean);
        let inventoryMap = {};

        if (skusEnvio.length > 0) {
            const { data: pubsData } = await supabase
                .from('publicaciones_meli')
                .select('sku, id_inventario')
                .in('sku', skusEnvio);

            if (pubsData) {
                pubsData.forEach(p => inventoryMap[p.sku] = p.id_inventario);
            }
        }

        // Construir array con inventory_id y cantidad escaneada
        const productosConInventory = envio.productos.map(prod => ({
            ...prod,
            inventory_id: inventoryMap[prod.sku] || null,
            cantidad_escaneada: progresoMap[prod.sku] || 0
        }));

        moduloEnviosCreados.productosPreparacion = productosConInventory;
        moduloEnviosCreados.cambiosPendientes = false; // Sin cambios nuevos al iniciar

        // Notificar si se cargó progreso
        if (progresoGuardado.length > 0) {
            const totalEscaneados = productosConInventory.reduce((sum, p) => sum + (p.cantidad_escaneada || 0), 0);
            if (totalEscaneados > 0) {
                mostrarNotificacion(`Progreso recuperado: ${totalEscaneados} unidades escaneadas`, 'info');
            }
        }

        // Mostrar UI de preparación
        const contenedor = document.getElementById('app-content');
        contenedor.innerHTML = `
            <div class="max-w-5xl mx-auto space-y-4">
                <!-- Header -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="flex items-center gap-4">
                                <h3 class="text-lg font-bold text-gray-800">
                                    <i class="fas fa-box-open text-yellow-500 mr-2"></i>
                                    Preparando: ${envio.id_envio}
                                </h3>
                                <span id="header-progreso-bultos" class="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-bold">
                                    0 / ${envio.totalBultos} bultos
                                </span>
                            </div>
                            <p class="text-sm text-gray-500">
                                Escanea los productos o usa los botones +/-
                                <span id="indicador-guardado" class="ml-2 text-green-600 hidden">
                                    <i class="fas fa-check-circle"></i> Guardado
                                </span>
                                <span id="indicador-guardando" class="ml-2 text-blue-500 hidden">
                                    <i class="fas fa-circle-notch fa-spin"></i> Guardando...
                                </span>
                            </p>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="moduloEnviosCreados.volverDePreparacion()"
                                    class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                                <i class="fas fa-arrow-left mr-1"></i>Volver
                            </button>
                            <button onclick="moduloEnviosCreados.finalizarPreparacion()"
                                    class="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors">
                                <i class="fas fa-check-circle mr-1"></i>Finalizar
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Sección RRHH: Preparador, Tareas, Consumibles, Bultos -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="font-bold text-gray-700">
                            <i class="fas fa-users text-brand mr-2"></i>
                            Datos de Preparación
                        </h4>
                        <span id="tiempo-preparacion" class="text-sm text-gray-500">
                            <i class="fas fa-clock mr-1"></i> 00:00:00
                        </span>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- Preparador principal -->
                        <div>
                            <label class="block text-sm font-medium text-gray-600 mb-1">Preparador</label>
                            <select id="select-preparador" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="">-- Seleccionar --</option>
                                ${colaboradoresCache.map(c => `
                                    <option value="${c.id}" ${preparacionRRHH?.asignado_a_id === c.id ? 'selected' : ''}>
                                        ${c.nombre}
                                    </option>
                                `).join('')}
                            </select>
                        </div>

                        <!-- Cantidad de bultos -->
                        <div>
                            <label class="block text-sm font-medium text-gray-600 mb-1">Cantidad de Bultos</label>
                            <input type="number" id="input-bultos" min="1" value="${cantidadBultosPrep}"
                                   onchange="cantidadBultosPrep = parseInt(this.value) || 1"
                                   class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                        </div>
                    </div>

                    <!-- Tareas -->
                    ${tareasEnvioCache.length > 0 ? `
                    <div class="mt-4">
                        <label class="block text-sm font-medium text-gray-600 mb-2">Tareas Realizadas</label>
                        <div class="space-y-2" id="lista-tareas-prep">
                            ${tareasEnvioCache.map(t => `
                                <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 border border-gray-100">
                                    <input type="checkbox" id="tarea-${t.id_tarea}"
                                           onchange="moduloEnviosCreados.toggleTarea('${t.id_tarea}', '${t.nombre_tarea}')"
                                           class="w-4 h-4 text-brand rounded">
                                    <label for="tarea-${t.id_tarea}" class="flex-1 text-sm text-gray-700">
                                        ${t.nombre_tarea}
                                    </label>
                                    <div id="colab-${t.id_tarea}" class="hidden flex items-center gap-2">
                                        <select id="select-colab-${t.id_tarea}" class="border border-gray-300 rounded px-2 py-1 text-xs">
                                            ${colaboradoresCache.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
                                        </select>
                                        <button onclick="moduloEnviosCreados.agregarColabTarea('${t.id_tarea}')"
                                                class="text-brand hover:text-brand-dark text-xs">
                                            <i class="fas fa-plus"></i>
                                        </button>
                                    </div>
                                    <div id="chips-${t.id_tarea}" class="flex flex-wrap gap-1"></div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Consumibles -->
                    ${consumiblesCache.length > 0 ? `
                    <div class="mt-4">
                        <label class="block text-sm font-medium text-gray-600 mb-2">Consumibles Utilizados</label>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-2" id="lista-consumibles-prep">
                            ${consumiblesCache.map(c => `
                                <div class="flex items-center gap-2 p-2 rounded-lg border border-gray-100">
                                    <input type="number" id="cons-${c.id_producto}" min="0" step="0.5" value="0"
                                           onchange="consumiblesUsados['${c.id_producto}'] = parseFloat(this.value) || 0"
                                           class="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center">
                                    <span class="text-xs text-gray-600 truncate" title="${c.nombre_producto}">
                                        ${c.nombre_producto.length > 15 ? c.nombre_producto.substring(0,15) + '...' : c.nombre_producto}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>

                <!-- Área de foco/escaneo -->
                <div id="foco-escaneo" class="bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center transition-all">
                    <div id="foco-titulo" class="text-xl font-bold text-gray-500">Esperando escaneo...</div>
                    <div class="text-sm text-gray-400 mt-2">
                        <span id="foco-sku">SKU: -</span> | <span id="foco-inventory">Inventory ID: -</span>
                    </div>
                    <div id="foco-contador" class="text-2xl font-bold text-gray-700 mt-2"></div>
                </div>

                <!-- Input de escaneo -->
                <div class="flex items-center gap-2">
                    <button onclick="moduloEnviosCreados.ajustarCantidad(-1)"
                            class="w-12 h-12 bg-red-100 text-red-700 rounded-lg text-xl font-bold hover:bg-red-200 transition-colors"
                            id="btn-restar">-</button>
                    <input type="text" id="input-escaner"
                           class="flex-1 border-2 border-gray-300 rounded-lg px-4 py-3 text-center text-lg focus:border-brand focus:ring-2 focus:ring-brand/20"
                           placeholder="[ Escanea un código o escribe SKU/Inventory ID ]"
                           autocomplete="off"
                           onkeydown="if(event.key==='Enter'){moduloEnviosCreados.procesarEscaneo(this.value);this.value='';}">
                    <button onclick="moduloEnviosCreados.ajustarCantidad(1)"
                            class="w-12 h-12 bg-green-100 text-green-700 rounded-lg text-xl font-bold hover:bg-green-200 transition-colors"
                            id="btn-sumar">+</button>
                </div>

                <!-- Tabla de productos -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table class="w-full table-fixed">
                        <thead class="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase w-auto">SKU / Título</th>
                                <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase w-28">Inventory ID</th>
                                <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase w-20">A Enviar</th>
                                <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase w-24">Escaneados</th>
                                <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase w-28">Estado</th>
                            </tr>
                        </thead>
                        <tbody id="tabla-preparacion">
                            ${moduloEnviosCreados.renderFilasPreparacion()}
                        </tbody>
                    </table>
                </div>

                <!-- Resumen -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex justify-between items-center">
                    <div class="text-sm text-gray-600">
                        <span class="font-bold text-gray-800" id="resumen-completados">0</span> de
                        <span class="font-bold">${productosConInventory.length}</span> productos completados
                    </div>
                    <div class="text-sm">
                        <span class="px-3 py-1 rounded-full bg-green-100 text-green-800 font-bold" id="resumen-bultos">
                            0 / ${envio.totalBultos} bultos
                        </span>
                    </div>
                </div>
            </div>

            <!-- Modal de confirmación para finalizar con incompletos -->
            <div id="modal-finalizar-incompletos" class="fixed inset-0 z-50 hidden" aria-modal="true">
                <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm"></div>
                <div class="fixed inset-0 z-10 overflow-y-auto p-4 flex items-center justify-center">
                    <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden animate-fade-in">
                        <div class="bg-yellow-500 text-white px-6 py-4 flex items-center gap-3">
                            <i class="fas fa-exclamation-triangle text-2xl"></i>
                            <div>
                                <h3 class="font-bold text-lg">Productos Incompletos</h3>
                                <p class="text-yellow-100 text-sm">Revisá las cantidades antes de finalizar</p>
                            </div>
                        </div>
                        <div class="p-6 overflow-y-auto max-h-[50vh]">
                            <p class="text-sm text-gray-600 mb-4">
                                Los siguientes productos tienen menos unidades escaneadas que las planificadas.
                                Podés ajustar la cantidad final o continuar con lo escaneado:
                            </p>
                            <div id="lista-incompletos" class="space-y-3">
                                <!-- Se llena dinámicamente -->
                            </div>
                        </div>
                        <div class="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                            <button onclick="moduloEnviosCreados.cerrarModalIncompletos()"
                                    class="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors">
                                Cancelar
                            </button>
                            <button onclick="moduloEnviosCreados.confirmarFinalizarConIncompletos()"
                                    class="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors flex items-center gap-2">
                                <i class="fas fa-check"></i>
                                Finalizar con estas cantidades
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal de confirmación para exceder cantidad programada -->
            <div id="modal-confirmar-exceso" class="fixed inset-0 z-50 hidden" aria-modal="true">
                <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm"></div>
                <div class="fixed inset-0 z-10 overflow-y-auto p-4 flex items-center justify-center">
                    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
                        <div class="bg-orange-500 text-white px-6 py-4 flex items-center gap-3">
                            <i class="fas fa-exclamation-circle text-2xl"></i>
                            <div>
                                <h3 class="font-bold text-lg">Exceder cantidad programada</h3>
                                <p class="text-orange-100 text-sm">Se requiere confirmación</p>
                            </div>
                        </div>
                        <div class="p-6">
                            <p class="text-gray-700 mb-4">
                                Estás por cargar <strong>más unidades</strong> de las programadas para:
                            </p>
                            <div class="bg-gray-50 rounded-lg p-4 mb-4">
                                <p id="exceso-producto-nombre" class="font-bold text-gray-800 mb-2"></p>
                                <div class="flex justify-between text-sm">
                                    <span class="text-gray-500">Programado:</span>
                                    <span id="exceso-cantidad-programada" class="font-bold text-blue-600"></span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-gray-500">Actual:</span>
                                    <span id="exceso-cantidad-actual" class="font-bold text-green-600"></span>
                                </div>
                                <div class="flex justify-between text-sm border-t mt-2 pt-2">
                                    <span class="text-gray-500">Nueva cantidad:</span>
                                    <span id="exceso-cantidad-nueva" class="font-bold text-orange-600"></span>
                                </div>
                            </div>
                            <p class="text-sm text-gray-500">
                                <i class="fas fa-info-circle mr-1"></i>
                                ¿Confirmas que querés agregar más unidades?
                            </p>
                        </div>
                        <div class="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                            <button onclick="moduloEnviosCreados.cancelarExceso()"
                                    class="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors">
                                Cancelar
                            </button>
                            <button onclick="moduloEnviosCreados.confirmarExceso()"
                                    class="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2">
                                <i class="fas fa-check"></i>
                                Sí, agregar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Enfocar input
        setTimeout(() => {
            document.getElementById('input-escaner')?.focus();
        }, 100);

        // Suscribirse a cambios en tiempo real para multi-usuario
        moduloEnviosCreados.suscribirseRealtime(envio.id_envio);
    },

    // ============================================
    // REALTIME: Suscribirse a cambios de otros usuarios
    // ============================================
    suscribirseRealtime: (idEnvio) => {
        // Desuscribirse del canal anterior si existe
        if (moduloEnviosCreados.realtimeChannel) {
            supabase.removeChannel(moduloEnviosCreados.realtimeChannel);
        }

        // Crear nuevo canal para este envío
        moduloEnviosCreados.realtimeChannel = supabase
            .channel(`preparacion-${idEnvio}`)
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'preparacion_en_curso',
                    filter: `id_envio=eq.${idEnvio}`
                },
                (payload) => {
                    console.log('[Realtime] Cambio recibido:', payload);
                    moduloEnviosCreados.procesarCambioRealtime(payload);
                }
            )
            .subscribe((status) => {
                console.log('[Realtime] Estado suscripción:', status);
            });
    },

    // ============================================
    // REALTIME: Procesar cambio de otro usuario
    // ============================================
    procesarCambioRealtime: async (payload) => {
        // Ignorar si no hay preparación activa
        if (!moduloEnviosCreados.preparacionActiva) return;

        // Debounce para evitar múltiples recargas
        if (moduloEnviosCreados.realtimeDebounce) {
            clearTimeout(moduloEnviosCreados.realtimeDebounce);
        }

        moduloEnviosCreados.realtimeDebounce = setTimeout(async () => {
            try {
                // Recargar progreso desde la base de datos
                const progresoActualizado = await moduloEnviosCreados.cargarProgresoGuardado(
                    moduloEnviosCreados.preparacionActiva.id_envio
                );

                if (progresoActualizado.length > 0) {
                    // Actualizar cantidades escaneadas desde el progreso
                    const progresoMap = {};
                    progresoActualizado.forEach(p => {
                        progresoMap[p.sku] = p.cantidad_escaneada || 0;
                    });

                    // Verificar si hay cambios reales antes de actualizar UI
                    let hayCambios = false;
                    moduloEnviosCreados.productosPreparacion.forEach(p => {
                        const nuevaCantidad = progresoMap[p.sku] ?? p.cantidad_escaneada;
                        if (p.cantidad_escaneada !== nuevaCantidad) {
                            hayCambios = true;
                            p.cantidad_escaneada = nuevaCantidad;
                        }
                    });

                    if (hayCambios) {
                        // Mostrar indicador de sincronización
                        mostrarNotificacion('Cambios sincronizados de otro usuario', 'info');

                        // Actualizar UI
                        document.getElementById('tabla-preparacion').innerHTML =
                            moduloEnviosCreados.renderFilasPreparacion();

                        // Actualizar resumen
                        const completados = moduloEnviosCreados.productosPreparacion.filter(
                            p => (p.cantidad_escaneada || 0) >= (p.cantidad_enviada || 0)
                        ).length;
                        const totalEscaneados = moduloEnviosCreados.productosPreparacion.reduce(
                            (sum, p) => sum + (p.cantidad_escaneada || 0), 0
                        );
                        const totalRequeridos = moduloEnviosCreados.productosPreparacion.reduce(
                            (sum, p) => sum + (p.cantidad_enviada || 0), 0
                        );

                        document.getElementById('resumen-completados').textContent = completados;
                        document.getElementById('resumen-bultos').textContent =
                            `${totalEscaneados} / ${totalRequeridos} bultos`;

                        // Actualizar foco si hay producto seleccionado
                        if (moduloEnviosCreados.ultimoSkuFoco) {
                            const prod = moduloEnviosCreados.productosPreparacion.find(
                                p => p.sku === moduloEnviosCreados.ultimoSkuFoco
                            );
                            if (prod) {
                                moduloEnviosCreados.actualizarFoco(prod);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('[Realtime] Error procesando cambio:', error);
            }
        }, 300); // Debounce de 300ms
    },

    renderFilasPreparacion: () => {
        return moduloEnviosCreados.productosPreparacion.map((p, idx) => {
            const escaneados = p.cantidad_escaneada || 0;
            const requeridos = p.cantidad_enviada || 0;
            let estadoClase = 'bg-gray-100 text-gray-600';
            let estadoTexto = 'Pendiente';

            if (escaneados >= requeridos) {
                estadoClase = 'bg-green-100 text-green-700';
                estadoTexto = 'Completado';
            } else if (escaneados > 0) {
                estadoClase = 'bg-yellow-100 text-yellow-700';
                estadoTexto = 'En Progreso';
            }

            return `
                <tr class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    data-idx="${idx}"
                    onclick="moduloEnviosCreados.seleccionarProducto(${idx})">
                    <td class="px-4 py-3">
                        <div class="font-medium text-gray-800">${p.sku || '-'}</div>
                        <div class="text-xs text-gray-500 truncate" title="${(p.titulo || '').replace(/"/g, '&quot;')}">${p.titulo || '-'}</div>
                    </td>
                    <td class="px-4 py-3 text-center text-sm font-mono text-gray-600 w-28">${p.inventory_id || '-'}</td>
                    <td class="px-4 py-3 text-center font-bold text-gray-800 w-20">${requeridos}</td>
                    <td class="px-4 py-3 text-center font-bold text-lg w-24 ${escaneados >= requeridos ? 'text-green-600' : 'text-gray-800'}">${escaneados}</td>
                    <td class="px-4 py-3 text-center w-28">
                        <span class="px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap ${estadoClase}">${estadoTexto}</span>
                    </td>
                </tr>
            `;
        }).join('');
    },

    procesarEscaneo: (codigo) => {
        if (!codigo || !codigo.trim()) return;
        codigo = codigo.trim().toUpperCase();

        // Buscar por inventory_id o SKU
        const idx = moduloEnviosCreados.productosPreparacion.findIndex(p =>
            (p.inventory_id && p.inventory_id.toUpperCase() === codigo) ||
            (p.sku && p.sku.toUpperCase() === codigo)
        );

        if (idx === -1) {
            mostrarNotificacion('Producto no encontrado en este envío', 'warning');
            return;
        }

        const prod = moduloEnviosCreados.productosPreparacion[idx];
        const escaneadosActual = prod.cantidad_escaneada || 0;
        const requeridos = prod.cantidad_enviada || 0;

        // Si ya alcanzó o superó el límite, pedir confirmación
        if (escaneadosActual >= requeridos) {
            moduloEnviosCreados.mostrarModalExceso(idx, 1);
            document.getElementById('input-escaner').value = '';
            return;
        }

        prod.cantidad_escaneada = escaneadosActual + 1;
        moduloEnviosCreados.ultimoSkuFoco = prod.sku;

        // Auto-guardar con debounce
        moduloEnviosCreados.programarAutoGuardado();

        moduloEnviosCreados.actualizarUIPreparacion(idx);
        document.getElementById('input-escaner').value = '';
        document.getElementById('input-escaner').focus();
    },

    seleccionarProducto: (idx) => {
        const prod = moduloEnviosCreados.productosPreparacion[idx];
        moduloEnviosCreados.ultimoSkuFoco = prod.sku;
        moduloEnviosCreados.actualizarFoco(prod);
    },

    ajustarCantidad: (delta) => {
        if (!moduloEnviosCreados.ultimoSkuFoco) {
            mostrarNotificacion('Escanea un producto primero', 'info');
            return;
        }

        const idx = moduloEnviosCreados.productosPreparacion.findIndex(
            p => p.sku === moduloEnviosCreados.ultimoSkuFoco
        );

        if (idx === -1) return;

        const prod = moduloEnviosCreados.productosPreparacion[idx];
        const escaneadosActual = prod.cantidad_escaneada || 0;
        const requeridos = prod.cantidad_enviada || 0;

        // Si se está sumando y ya alcanzó o superó el límite, pedir confirmación
        if (delta > 0 && escaneadosActual >= requeridos) {
            moduloEnviosCreados.mostrarModalExceso(idx, delta);
            return;
        }

        prod.cantidad_escaneada = Math.max(0, escaneadosActual + delta);

        // Auto-guardar con debounce
        moduloEnviosCreados.programarAutoGuardado();

        moduloEnviosCreados.actualizarUIPreparacion(idx);

        // Devolver foco al input del escáner para que la lectora funcione correctamente
        document.getElementById('input-escaner')?.focus();
    },

    actualizarUIPreparacion: (idxActualizado) => {
        // Actualizar tabla
        document.getElementById('tabla-preparacion').innerHTML = moduloEnviosCreados.renderFilasPreparacion();

        // Actualizar foco
        const prod = moduloEnviosCreados.productosPreparacion[idxActualizado];
        moduloEnviosCreados.actualizarFoco(prod);

        // Actualizar resumen
        const completados = moduloEnviosCreados.productosPreparacion.filter(
            p => (p.cantidad_escaneada || 0) >= (p.cantidad_enviada || 0)
        ).length;
        const totalEscaneados = moduloEnviosCreados.productosPreparacion.reduce(
            (sum, p) => sum + (p.cantidad_escaneada || 0), 0
        );
        const totalRequeridos = moduloEnviosCreados.productosPreparacion.reduce(
            (sum, p) => sum + (p.cantidad_enviada || 0), 0
        );

        document.getElementById('resumen-completados').textContent = completados;
        document.getElementById('resumen-bultos').textContent = `${totalEscaneados} / ${totalRequeridos} bultos`;

        // Actualizar también el header
        const headerProgreso = document.getElementById('header-progreso-bultos');
        if (headerProgreso) {
            headerProgreso.textContent = `${totalEscaneados} / ${totalRequeridos} bultos`;
            // Cambiar color según progreso
            if (totalEscaneados >= totalRequeridos) {
                headerProgreso.className = 'px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm font-bold';
            } else if (totalEscaneados > 0) {
                headerProgreso.className = 'px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 text-sm font-bold';
            } else {
                headerProgreso.className = 'px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-bold';
            }
        }
    },

    actualizarFoco: (prod) => {
        const foco = document.getElementById('foco-escaneo');
        const escaneados = prod.cantidad_escaneada || 0;
        const requeridos = prod.cantidad_enviada || 0;

        foco.className = escaneados >= requeridos
            ? 'bg-green-50 border-2 border-green-400 rounded-xl p-6 text-center transition-all'
            : 'bg-blue-50 border-2 border-blue-400 rounded-xl p-6 text-center transition-all';

        document.getElementById('foco-titulo').textContent = prod.titulo || prod.sku;
        document.getElementById('foco-titulo').className = `text-xl font-bold ${escaneados >= requeridos ? 'text-green-700' : 'text-blue-700'}`;
        document.getElementById('foco-sku').textContent = `SKU: ${prod.sku || '-'}`;
        document.getElementById('foco-inventory').textContent = `Inventory ID: ${prod.inventory_id || '-'}`;
        document.getElementById('foco-contador').innerHTML = `<span class="${escaneados >= requeridos ? 'text-green-600' : 'text-blue-600'}">${escaneados}</span> / ${requeridos}`;
    },

    // ============================================
    // AUTO-GUARDADO: Programar guardado con debounce (500ms)
    // ============================================
    programarAutoGuardado: () => {
        // Cancelar guardado anterior si existe
        if (moduloEnviosCreados.autoSaveTimeout) {
            clearTimeout(moduloEnviosCreados.autoSaveTimeout);
        }

        // Mostrar indicador "Guardando..."
        const indicadorGuardando = document.getElementById('indicador-guardando');
        const indicadorGuardado = document.getElementById('indicador-guardado');
        if (indicadorGuardando) indicadorGuardando.classList.remove('hidden');
        if (indicadorGuardado) indicadorGuardado.classList.add('hidden');

        // Programar guardado en 500ms
        moduloEnviosCreados.autoSaveTimeout = setTimeout(() => {
            moduloEnviosCreados.autoGuardarProgreso();
        }, 500);
    },

    // ============================================
    // AUTO-GUARDADO: Ejecutar guardado silencioso
    // ============================================
    autoGuardarProgreso: async () => {
        const envio = moduloEnviosCreados.preparacionActiva;
        if (!envio) return;

        try {
            // Eliminar progreso anterior de este envío
            await supabase
                .from('preparacion_en_curso')
                .delete()
                .eq('id_envio', envio.id_envio);

            // Insertar nuevo progreso
            const registros = moduloEnviosCreados.productosPreparacion.map(p => ({
                id_envio: envio.id_envio,
                sku: p.sku,
                inventory_id: p.inventory_id || null,
                titulo: p.titulo || null,
                cantidad_requerida: p.cantidad_enviada || 0,
                cantidad_escaneada: p.cantidad_escaneada || 0
            }));

            const { error } = await supabase
                .from('preparacion_en_curso')
                .insert(registros);

            if (error) throw error;

            // Mostrar indicador "Guardado" brevemente
            const indicadorGuardando = document.getElementById('indicador-guardando');
            const indicadorGuardado = document.getElementById('indicador-guardado');
            if (indicadorGuardando) indicadorGuardando.classList.add('hidden');
            if (indicadorGuardado) {
                indicadorGuardado.classList.remove('hidden');
                // Ocultar después de 2 segundos
                setTimeout(() => indicadorGuardado.classList.add('hidden'), 2000);
            }

        } catch (error) {
            console.error('Error en auto-guardado:', error);
            // Mostrar error brevemente
            const indicadorGuardando = document.getElementById('indicador-guardando');
            if (indicadorGuardando) {
                indicadorGuardando.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error al guardar';
                indicadorGuardando.classList.remove('text-blue-500');
                indicadorGuardando.classList.add('text-red-500');
                setTimeout(() => {
                    indicadorGuardando.classList.add('hidden');
                    indicadorGuardando.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Guardando...';
                    indicadorGuardando.classList.remove('text-red-500');
                    indicadorGuardando.classList.add('text-blue-500');
                }, 2000);
            }
        }
    },

    // ============================================
    // CARGAR PROGRESO: Recupera progreso guardado si existe
    // ============================================
    cargarProgresoGuardado: async (idEnvio) => {
        try {
            const { data, error } = await supabase
                .from('preparacion_en_curso')
                .select('*')
                .eq('id_envio', idEnvio);

            if (error) throw error;

            return data || [];
        } catch (error) {
            console.error('Error cargando progreso:', error);
            return [];
        }
    },

    // ============================================
    // TAREAS: Manejo de tareas en preparación
    // ============================================
    toggleTarea: (tareaId, tareaNombre) => {
        const checkbox = document.getElementById(`tarea-${tareaId}`);
        const colabDiv = document.getElementById(`colab-${tareaId}`);

        if (checkbox.checked) {
            // Mostrar selector de colaborador
            colabDiv.classList.remove('hidden');

            // Agregar tarea con el preparador principal por defecto
            const preparadorId = document.getElementById('select-preparador').value;
            const preparadorOption = document.getElementById('select-preparador').selectedOptions[0];
            const preparadorNombre = preparadorOption?.text || '';

            const tareaExistente = tareasSeleccionadas.find(t => t.tarea_id === tareaId);
            if (!tareaExistente) {
                tareasSeleccionadas.push({
                    tarea_id: tareaId,
                    tarea_nombre: tareaNombre,
                    colaboradores: preparadorId ? [{ id: preparadorId, nombre: preparadorNombre }] : []
                });
                moduloEnviosCreados.renderChipsTarea(tareaId);
            }
        } else {
            // Ocultar y limpiar
            colabDiv.classList.add('hidden');
            tareasSeleccionadas = tareasSeleccionadas.filter(t => t.tarea_id !== tareaId);
            document.getElementById(`chips-${tareaId}`).innerHTML = '';
        }
    },

    agregarColabTarea: (tareaId) => {
        const select = document.getElementById(`select-colab-${tareaId}`);
        const colabId = select.value;
        const colabNombre = select.selectedOptions[0]?.text || '';

        if (!colabId) return;

        const tarea = tareasSeleccionadas.find(t => t.tarea_id === tareaId);
        if (!tarea) return;

        // Evitar duplicados
        if (tarea.colaboradores.some(c => c.id === colabId)) {
            mostrarNotificacion('Colaborador ya agregado', 'warning');
            return;
        }

        tarea.colaboradores.push({ id: colabId, nombre: colabNombre });
        moduloEnviosCreados.renderChipsTarea(tareaId);
    },

    renderChipsTarea: (tareaId) => {
        const tarea = tareasSeleccionadas.find(t => t.tarea_id === tareaId);
        const container = document.getElementById(`chips-${tareaId}`);

        if (!tarea || !container) return;

        container.innerHTML = tarea.colaboradores.map(c => `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-brand/10 text-brand rounded-full text-xs">
                ${c.nombre}
                <button onclick="moduloEnviosCreados.quitarColabTarea('${tareaId}', '${c.id}')"
                        class="hover:text-red-500">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        `).join('');
    },

    quitarColabTarea: (tareaId, colabId) => {
        const tarea = tareasSeleccionadas.find(t => t.tarea_id === tareaId);
        if (!tarea) return;

        tarea.colaboradores = tarea.colaboradores.filter(c => c.id !== colabId);
        moduloEnviosCreados.renderChipsTarea(tareaId);
    },

    // ============================================
    // VOLVER: Salir de preparación (siempre funciona, ya se auto-guardó)
    // ============================================
    volverDePreparacion: async () => {
        // Cancelar cualquier auto-guardado pendiente y ejecutar guardado final
        if (moduloEnviosCreados.autoSaveTimeout) {
            clearTimeout(moduloEnviosCreados.autoSaveTimeout);
            await moduloEnviosCreados.autoGuardarProgreso();
        }

        // Desuscribirse de Realtime si existe
        if (moduloEnviosCreados.realtimeChannel) {
            supabase.removeChannel(moduloEnviosCreados.realtimeChannel);
            moduloEnviosCreados.realtimeChannel = null;
        }

        // Limpiar estado
        moduloEnviosCreados.preparacionActiva = null;
        moduloEnviosCreados.productosPreparacion = [];
        moduloEnviosCreados.ultimoSkuFoco = null;

        // Volver a la lista
        const contenedor = document.getElementById('app-content');
        await moduloEnviosCreados.render(contenedor);
    },

    finalizarPreparacion: async () => {
        const envio = moduloEnviosCreados.preparacionActiva;
        if (!envio) return;

        // Obtener productos incompletos
        const incompletos = moduloEnviosCreados.productosPreparacion.filter(
            p => (p.cantidad_escaneada || 0) < (p.cantidad_enviada || 0)
        );

        if (incompletos.length > 0) {
            // Mostrar modal con productos incompletos
            moduloEnviosCreados.mostrarModalIncompletos(incompletos);
            return;
        }

        // Todo completo, finalizar directamente
        await moduloEnviosCreados.ejecutarFinalizacion();
    },

    // ============================================
    // MODAL INCOMPLETOS: Mostrar modal con lista editable
    // ============================================
    mostrarModalIncompletos: (incompletos) => {
        const listaDiv = document.getElementById('lista-incompletos');

        listaDiv.innerHTML = incompletos.map((p, idx) => `
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3" data-sku="${p.sku}">
                <div class="flex items-center justify-between">
                    <div class="flex-1 min-w-0 mr-3">
                        <p class="font-medium text-gray-800 truncate">${p.sku}</p>
                        <p class="text-xs text-gray-500 truncate">${p.titulo || '-'}</p>
                    </div>
                    <div class="flex items-center gap-3 text-sm">
                        <div class="text-center">
                            <p class="text-xs text-gray-400">Planificado</p>
                            <p class="font-bold text-gray-600">${p.cantidad_enviada || 0}</p>
                        </div>
                        <div class="text-gray-300">→</div>
                        <div class="text-center">
                            <p class="text-xs text-gray-400">Escaneado</p>
                            <p class="font-bold text-blue-600">${p.cantidad_escaneada || 0}</p>
                        </div>
                        <div class="text-gray-300">→</div>
                        <div class="text-center">
                            <p class="text-xs text-gray-400">Final</p>
                            <input type="number"
                                   class="w-16 text-center border border-yellow-300 rounded px-2 py-1 font-bold cantidad-final-input"
                                   value="${p.cantidad_escaneada || 0}"
                                   min="0"
                                   max="${p.cantidad_enviada || 0}"
                                   data-sku="${p.sku}">
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        document.getElementById('modal-finalizar-incompletos').classList.remove('hidden');
    },

    // ============================================
    // MODAL EXCESO: Mostrar confirmación para exceder cantidad
    // ============================================
    mostrarModalExceso: (idx, delta) => {
        const prod = moduloEnviosCreados.productosPreparacion[idx];
        const escaneadosActual = prod.cantidad_escaneada || 0;
        const requeridos = prod.cantidad_enviada || 0;
        const nuevaCantidad = escaneadosActual + delta;

        // Guardar datos del exceso pendiente
        excesoPendiente = { idx, delta };

        // Llenar datos del modal
        document.getElementById('exceso-producto-nombre').textContent = prod.titulo || prod.sku;
        document.getElementById('exceso-cantidad-programada').textContent = requeridos;
        document.getElementById('exceso-cantidad-actual').textContent = escaneadosActual;
        document.getElementById('exceso-cantidad-nueva').textContent = nuevaCantidad;

        // Mostrar modal
        document.getElementById('modal-confirmar-exceso').classList.remove('hidden');
    },

    // ============================================
    // MODAL EXCESO: Confirmar exceso
    // ============================================
    confirmarExceso: () => {
        if (!excesoPendiente) return;

        const { idx, delta } = excesoPendiente;
        const prod = moduloEnviosCreados.productosPreparacion[idx];

        // Aplicar el incremento
        prod.cantidad_escaneada = (prod.cantidad_escaneada || 0) + delta;
        moduloEnviosCreados.ultimoSkuFoco = prod.sku;

        // Auto-guardar
        moduloEnviosCreados.programarAutoGuardado();

        // Actualizar UI
        moduloEnviosCreados.actualizarUIPreparacion(idx);

        // Cerrar modal y limpiar
        document.getElementById('modal-confirmar-exceso').classList.add('hidden');
        excesoPendiente = null;

        // Devolver foco al escáner
        document.getElementById('input-escaner')?.focus();
    },

    // ============================================
    // MODAL EXCESO: Cancelar exceso
    // ============================================
    cancelarExceso: () => {
        document.getElementById('modal-confirmar-exceso').classList.add('hidden');
        excesoPendiente = null;

        // Devolver foco al escáner
        document.getElementById('input-escaner')?.focus();
    },

    // ============================================
    // MODAL INCOMPLETOS: Cerrar modal
    // ============================================
    cerrarModalIncompletos: () => {
        document.getElementById('modal-finalizar-incompletos').classList.add('hidden');
    },

    // ============================================
    // MODAL INCOMPLETOS: Confirmar y finalizar con cantidades ajustadas
    // ============================================
    confirmarFinalizarConIncompletos: async () => {
        // Obtener cantidades finales del modal
        const inputs = document.querySelectorAll('.cantidad-final-input');
        const cantidadesFinales = {};

        inputs.forEach(input => {
            cantidadesFinales[input.dataset.sku] = parseInt(input.value) || 0;
        });

        // Actualizar cantidades en productosPreparacion
        moduloEnviosCreados.productosPreparacion.forEach(p => {
            if (cantidadesFinales[p.sku] !== undefined) {
                // Usar la cantidad final ingresada como la nueva cantidad_enviada
                p.cantidad_enviada = cantidadesFinales[p.sku];
                p.cantidad_escaneada = cantidadesFinales[p.sku];
            }
        });

        // Cerrar modal
        moduloEnviosCreados.cerrarModalIncompletos();

        // Ejecutar finalización con cantidades actualizadas
        await moduloEnviosCreados.ejecutarFinalizacion(true);
    },

    // ============================================
    // EJECUTAR FINALIZACIÓN: Lógica común para finalizar
    // ============================================
    ejecutarFinalizacion: async (actualizarCantidades = false) => {
        const envio = moduloEnviosCreados.preparacionActiva;
        if (!envio) return;

        const tablaEnvios = usandoTablasNuevas ? 'registro_envios' : 'registro_envios_full';
        const tablaDetalles = usandoTablasNuevas ? 'detalle_envios' : 'detalle_envios_full';
        const campoOriginal = usandoTablasNuevas ? 'cantidad_sugerida' : 'cantidad_original';

        try {
            // Si hay que actualizar cantidades en tabla de detalles
            if (actualizarCantidades) {
                // Primero obtener las cantidades originales de la BD
                const { data: detallesOriginales } = await supabase
                    .from(tablaDetalles)
                    .select(`sku, cantidad_enviada, ${campoOriginal}`)
                    .eq('id_envio', envio.id_envio);

                // Crear mapa de cantidades originales
                const cantidadesOriginales = {};
                if (detallesOriginales) {
                    detallesOriginales.forEach(d => {
                        // Usar cantidad_original/sugerida si existe, sino cantidad_enviada original
                        cantidadesOriginales[d.sku] = d[campoOriginal] || d.cantidad_enviada;
                    });
                }

                // Eliminar detalles anteriores
                await supabase
                    .from(tablaDetalles)
                    .delete()
                    .eq('id_envio', envio.id_envio);

                // Insertar con cantidades actualizadas, preservando cantidad original
                const detallesActualizados = moduloEnviosCreados.productosPreparacion.map(p => {
                    const base = {
                        id_envio: envio.id_envio,
                        sku: p.sku,
                        id_publicacion: p.id_publicacion || null,
                        cantidad_enviada: p.cantidad_enviada
                    };
                    base[campoOriginal] = cantidadesOriginales[p.sku] || p.cantidad_enviada;
                    return base;
                });

                const { error: errorDetalles } = await supabase
                    .from(tablaDetalles)
                    .insert(detallesActualizados);

                if (errorDetalles) throw errorDetalles;
            }

            // Cambiar estado a "Despachado" y marcar como embalado
            const { error } = await supabase
                .from(tablaEnvios)
                .update({
                    estado: 'Despachado',
                    embalado: true
                })
                .eq('id_envio', envio.id_envio);

            if (error) throw error;

            // Finalizar preparación en RRHH
            if (preparacionRRHH?.id) {
                // Obtener cantidad de bultos del input
                const bultosInput = document.getElementById('input-bultos');
                const cantBultos = parseInt(bultosInput?.value) || cantidadBultosPrep;

                // Preparar consumibles usados (filtrar los que tienen cantidad > 0)
                const consumiblesArray = Object.entries(consumiblesUsados)
                    .filter(([, cantidad]) => cantidad > 0)
                    .map(([id, cantidad]) => {
                        const producto = consumiblesCache.find(c => c.id_producto === id);
                        return {
                            producto_id: id,
                            nombre: producto?.nombre_producto || id,
                            cantidad: cantidad
                        };
                    });

                // Llamar RPC para finalizar
                const { data: resRRHH, error: errRRHH } = await supabaseRRHH.rpc('rpc_finalizar_preparacion', {
                    p_preparacion_id: preparacionRRHH.id,
                    p_tareas_realizadas: tareasSeleccionadas,
                    p_consumibles: consumiblesArray,
                    p_cantidad_bultos: cantBultos
                });

                if (errRRHH) {
                    console.error('Error finalizando en RRHH:', errRRHH);
                } else {
                    console.log('Preparación finalizada en RRHH:', resRRHH);

                    // Registrar en bitacora_trabajos para cada colaborador/tarea
                    const preparadorId = document.getElementById('select-preparador')?.value;
                    if (tareasSeleccionadas.length > 0) {
                        for (const tarea of tareasSeleccionadas) {
                            for (const colab of tarea.colaboradores) {
                                await supabaseRRHH.from('bitacora_trabajos').insert({
                                    colaborador_id: colab.id,
                                    fecha: new Date().toISOString().split('T')[0],
                                    tipo_trabajo: 'ENVIO',
                                    descripcion: `${tarea.tarea_nombre} - ${envio.id_envio}`,
                                    referencia_externa: envio.id_envio,
                                    cantidad: 1
                                });
                            }
                        }
                    } else if (preparadorId) {
                        // Si no hay tareas marcadas, registrar al preparador principal
                        await supabaseRRHH.from('bitacora_trabajos').insert({
                            colaborador_id: preparadorId,
                            fecha: new Date().toISOString().split('T')[0],
                            tipo_trabajo: 'ENVIO',
                            descripcion: `Preparación envío ${envio.id_envio}`,
                            referencia_externa: envio.id_envio,
                            cantidad: 1
                        });
                    }
                }
            }

            // Limpiar progreso guardado ya que se completó
            await supabase
                .from('preparacion_en_curso')
                .delete()
                .eq('id_envio', envio.id_envio);

            // Desuscribirse de Realtime
            if (moduloEnviosCreados.realtimeChannel) {
                supabase.removeChannel(moduloEnviosCreados.realtimeChannel);
                moduloEnviosCreados.realtimeChannel = null;
            }

            // Limpiar estado de preparación RRHH
            preparacionRRHH = null;
            tareasSeleccionadas = [];
            consumiblesUsados = {};
            cantidadBultosPrep = 0;

            mostrarNotificacion('Preparación finalizada. Envío marcado como Despachado y Embalado.', 'success');

            moduloEnviosCreados.preparacionActiva = null;
            moduloEnviosCreados.productosPreparacion = [];
            moduloEnviosCreados.ultimoSkuFoco = null;

            // Volver a la lista
            const contenedor = document.getElementById('app-content');
            await moduloEnviosCreados.render(contenedor);

        } catch (error) {
            console.error('Error finalizando preparación:', error);
            mostrarNotificacion('Error al finalizar preparación', 'error');
        }
    },

    // ============================================
    // REMITO 3PL: Abrir modal para generar remito
    // ============================================
    generarRemito: async (idEnvio) => {
        const envio = enviosCache.find(e => e.id_envio === idEnvio);
        if (!envio) {
            mostrarNotificacion('Envío no encontrado', 'error');
            return;
        }

        const destino = envio.destino;
        if (!destino || destino.tipo !== 'externo') {
            mostrarNotificacion('El remito solo está disponible para envíos a depósitos externos', 'warning');
            return;
        }

        // Verificar si ya tiene remito
        if (envio.link_remito) {
            mostrarNotificacion('Este envío ya tiene un remito generado', 'info');
            return;
        }

        try {
            // Importar módulo de remitos dinámicamente
            const { moduloRemitosEnvio } = await import('./remitosEnvio.js');
            await moduloRemitosEnvio.abrirModalRemito(idEnvio);
        } catch (importError) {
            console.error('Error cargando módulo de remitos:', importError);
            mostrarNotificacion('Error al cargar módulo de remitos', 'error');
        }
    },

    // ============================================
    // ETIQUETAS 3PL: Generar etiquetas para bultos
    // ============================================
    generarEtiquetas: async (idEnvio) => {
        const envio = enviosCache.find(e => e.id_envio === idEnvio);
        if (!envio) {
            mostrarNotificacion('Envío no encontrado', 'error');
            return;
        }

        const destino = envio.destino;
        if (!destino || destino.tipo !== 'externo') {
            mostrarNotificacion('Las etiquetas solo están disponibles para envíos a depósitos externos', 'warning');
            return;
        }

        try {
            // Importar módulo de remitos dinámicamente si existe
            try {
                const { moduloRemitos } = await import('./remitosEnvio.js');
                await moduloRemitos.generarEtiquetas(envio, destino);
            } catch (importError) {
                // Si el módulo no existe aún, mostrar mensaje
                console.warn('Módulo de etiquetas no disponible:', importError);
                mostrarNotificacion('Funcionalidad de etiquetas en desarrollo. Próximamente disponible.', 'info');
            }
        } catch (error) {
            console.error('Error generando etiquetas:', error);
            mostrarNotificacion('Error al generar etiquetas', 'error');
        }
    }
};

// Exponer en window para el HTML
window.moduloEnviosCreados = moduloEnviosCreados;
