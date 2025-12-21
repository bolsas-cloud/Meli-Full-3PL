// ============================================
// MÓDULO: Gestión de Publicaciones
// ============================================
// Visualización y edición de publicaciones de ML
// Permite editar SKU e Inventory ID manualmente
// ============================================

import { supabase } from '../config.js';
import { mostrarNotificacion, formatearMoneda } from '../utils.js';

// Estado local del módulo
let publicaciones = [];
let filtros = {
    busqueda: '',
    tipo_logistica: 'todos'
};
let paginaActual = 1;
const porPagina = 50;

export const moduloPublicaciones = {

    // ============================================
    // RENDER: Dibuja la interfaz principal
    // ============================================
    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">
                <!-- Header con filtros -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-4">
                        <div class="flex items-center gap-3">
                            <h3 class="text-lg font-bold text-gray-800">
                                <i class="fas fa-store text-brand mr-2"></i>
                                Publicaciones
                            </h3>
                            <span id="contador-publicaciones" class="text-sm text-gray-500"></span>
                        </div>

                        <div class="flex items-center gap-3">
                            <!-- Búsqueda -->
                            <div class="relative">
                                <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                                <input type="text" id="filtro-busqueda"
                                       placeholder="Buscar SKU, título, ID..."
                                       class="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-transparent w-64">
                            </div>

                            <!-- Filtro por logística -->
                            <select id="filtro-logistica"
                                    class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                <option value="todos">Toda logística</option>
                                <option value="fulfillment">Fulfillment</option>
                                <option value="cross_docking">Cross Docking</option>
                                <option value="self_service">Self Service</option>
                            </select>

                            <!-- Botones -->
                            <button onclick="moduloPublicaciones.sincronizarML()"
                                    class="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
                                <i class="fas fa-sync-alt"></i>
                                Sincronizar ML
                            </button>
                            <button onclick="moduloPublicaciones.cargarPublicaciones()"
                                    class="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center gap-2">
                                <i class="fas fa-refresh"></i>
                                Recargar
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Tabla de publicaciones -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">ID Publicación</th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">SKU</th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Inventory ID</th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Título</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Precio</th>
                                    <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Stock Full</th>
                                    <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Logística</th>
                                    <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="tabla-publicaciones" class="divide-y divide-gray-100">
                                <tr>
                                    <td colspan="8" class="px-4 py-12 text-center text-gray-500">
                                        <i class="fas fa-spinner fa-spin fa-2x mb-2"></i>
                                        <p>Cargando publicaciones...</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- Paginación -->
                    <div class="bg-gray-50 px-4 py-3 border-t border-gray-200 flex justify-between items-center">
                        <div id="info-paginacion" class="text-sm text-gray-600"></div>
                        <div class="flex gap-2">
                            <button onclick="moduloPublicaciones.paginaAnterior()"
                                    id="btn-pagina-anterior"
                                    class="px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                                <i class="fas fa-chevron-left"></i> Anterior
                            </button>
                            <button onclick="moduloPublicaciones.paginaSiguiente()"
                                    id="btn-pagina-siguiente"
                                    class="px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                                Siguiente <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal de edición -->
            <div id="modal-editar-pub" class="fixed inset-0 z-50 hidden" aria-modal="true">
                <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onclick="moduloPublicaciones.cerrarModal()"></div>
                <div class="fixed inset-0 z-10 overflow-y-auto p-4 flex items-center justify-center">
                    <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-fade-in">
                        <div class="bg-brand text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
                            <h3 id="modal-pub-titulo" class="font-bold text-lg">Editar Publicación</h3>
                            <button onclick="moduloPublicaciones.cerrarModal()" class="text-white/80 hover:text-white">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        <div id="modal-pub-contenido" class="p-6">
                            <!-- Se llena dinámicamente -->
                        </div>
                        <div class="bg-gray-50 px-6 py-4 flex justify-end gap-3 rounded-b-xl">
                            <button onclick="moduloPublicaciones.cerrarModal()"
                                    class="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors">
                                Cancelar
                            </button>
                            <button onclick="moduloPublicaciones.guardarEdicion()"
                                    id="btn-guardar-pub"
                                    class="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors flex items-center gap-2">
                                <i class="fas fa-save"></i>
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Cargar publicaciones
        await moduloPublicaciones.cargarPublicaciones();

        // Configurar filtros
        document.getElementById('filtro-busqueda').addEventListener('input', (e) => {
            filtros.busqueda = e.target.value.toLowerCase();
            paginaActual = 1;
            moduloPublicaciones.pintarTabla();
        });

        document.getElementById('filtro-logistica').addEventListener('change', (e) => {
            filtros.tipo_logistica = e.target.value;
            paginaActual = 1;
            moduloPublicaciones.pintarTabla();
        });

        // Exponer módulo en window
        window.moduloPublicaciones = moduloPublicaciones;
    },

    // ============================================
    // CARGAR: Obtener publicaciones desde Supabase
    // ============================================
    cargarPublicaciones: async () => {
        const tbody = document.getElementById('tabla-publicaciones');
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-4 py-12 text-center text-gray-500">
                    <i class="fas fa-spinner fa-spin fa-2x mb-2"></i>
                    <p>Cargando publicaciones...</p>
                </td>
            </tr>
        `;

        try {
            const { data, error } = await supabase
                .from('publicaciones_meli')
                .select('id_publicacion, sku, id_inventario, titulo, precio, stock_full, tipo_logistica, estado')
                .order('titulo');

            if (error) throw error;

            publicaciones = data || [];
            document.getElementById('contador-publicaciones').textContent = `(${publicaciones.length} publicaciones)`;

            paginaActual = 1;
            moduloPublicaciones.pintarTabla();

        } catch (error) {
            console.error('Error cargando publicaciones:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-4 py-12 text-center text-red-500">
                        <i class="fas fa-exclamation-circle fa-2x mb-2"></i>
                        <p>Error al cargar publicaciones</p>
                    </td>
                </tr>
            `;
        }
    },

    // ============================================
    // PINTAR: Renderizar tabla con paginación
    // ============================================
    pintarTabla: () => {
        const tbody = document.getElementById('tabla-publicaciones');

        // Filtrar
        let pubsFiltradas = publicaciones.filter(p => {
            const matchBusqueda = !filtros.busqueda ||
                (p.sku || '').toLowerCase().includes(filtros.busqueda) ||
                (p.titulo || '').toLowerCase().includes(filtros.busqueda) ||
                (p.id_publicacion || '').toLowerCase().includes(filtros.busqueda) ||
                (p.id_inventario || '').toLowerCase().includes(filtros.busqueda);

            const matchLogistica = filtros.tipo_logistica === 'todos' ||
                p.tipo_logistica === filtros.tipo_logistica;

            return matchBusqueda && matchLogistica;
        });

        // Paginación
        const totalPaginas = Math.ceil(pubsFiltradas.length / porPagina);
        const inicio = (paginaActual - 1) * porPagina;
        const fin = inicio + porPagina;
        const pubsPagina = pubsFiltradas.slice(inicio, fin);

        // Info paginación
        document.getElementById('info-paginacion').textContent =
            `Mostrando ${inicio + 1}-${Math.min(fin, pubsFiltradas.length)} de ${pubsFiltradas.length}`;

        // Botones paginación
        document.getElementById('btn-pagina-anterior').disabled = paginaActual <= 1;
        document.getElementById('btn-pagina-siguiente').disabled = paginaActual >= totalPaginas;

        if (pubsPagina.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-4 py-12 text-center text-gray-500">
                        <i class="fas fa-inbox fa-2x mb-2"></i>
                        <p>No se encontraron publicaciones</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = pubsPagina.map(p => {
            const logisticaColor = {
                'fulfillment': 'bg-green-100 text-green-800',
                'cross_docking': 'bg-blue-100 text-blue-800',
                'self_service': 'bg-gray-100 text-gray-800'
            };
            const logClase = logisticaColor[p.tipo_logistica] || 'bg-gray-100 text-gray-600';

            // Resaltar si falta SKU o Inventory ID
            const skuClass = p.sku ? '' : 'text-red-500 italic';
            const invClass = p.id_inventario ? '' : 'text-red-500 italic';

            return `
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-4 py-3">
                        <a href="https://articulo.mercadolibre.com.ar/${p.id_publicacion}" target="_blank"
                           class="text-blue-600 hover:underline font-mono text-sm">
                            ${p.id_publicacion || '-'}
                        </a>
                    </td>
                    <td class="px-4 py-3 font-mono text-sm ${skuClass}">${p.sku || '(sin SKU)'}</td>
                    <td class="px-4 py-3 font-mono text-sm ${invClass}">${p.id_inventario || '(sin ID)'}</td>
                    <td class="px-4 py-3">
                        <div class="max-w-xs truncate text-sm" title="${(p.titulo || '').replace(/"/g, '&quot;')}">${p.titulo || '-'}</div>
                    </td>
                    <td class="px-4 py-3 text-right font-medium">${p.precio ? formatearMoneda(p.precio) : '-'}</td>
                    <td class="px-4 py-3 text-center font-bold ${(p.stock_full || 0) === 0 ? 'text-red-600' : 'text-gray-800'}">${p.stock_full || 0}</td>
                    <td class="px-4 py-3 text-center">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${logClase}">
                            ${p.tipo_logistica || '-'}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="moduloPublicaciones.editarPublicacion('${p.id_publicacion}')"
                                class="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                                title="Editar SKU / Inventory ID">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // ============================================
    // PAGINACIÓN
    // ============================================
    paginaAnterior: () => {
        if (paginaActual > 1) {
            paginaActual--;
            moduloPublicaciones.pintarTabla();
        }
    },

    paginaSiguiente: () => {
        const pubsFiltradas = publicaciones.filter(p => {
            const matchBusqueda = !filtros.busqueda ||
                (p.sku || '').toLowerCase().includes(filtros.busqueda) ||
                (p.titulo || '').toLowerCase().includes(filtros.busqueda) ||
                (p.id_publicacion || '').toLowerCase().includes(filtros.busqueda);
            const matchLogistica = filtros.tipo_logistica === 'todos' ||
                p.tipo_logistica === filtros.tipo_logistica;
            return matchBusqueda && matchLogistica;
        });

        const totalPaginas = Math.ceil(pubsFiltradas.length / porPagina);
        if (paginaActual < totalPaginas) {
            paginaActual++;
            moduloPublicaciones.pintarTabla();
        }
    },

    // ============================================
    // EDITAR: Abrir modal de edición
    // ============================================
    editarPublicacion: (idPub) => {
        const pub = publicaciones.find(p => p.id_publicacion === idPub);
        if (!pub) {
            mostrarNotificacion('Publicación no encontrada', 'error');
            return;
        }

        document.getElementById('modal-pub-titulo').textContent = `Editar: ${pub.id_publicacion}`;

        document.getElementById('modal-pub-contenido').innerHTML = `
            <div class="space-y-4">
                <div>
                    <p class="text-sm font-medium text-gray-500 mb-1">Título</p>
                    <p class="text-gray-800 font-medium">${pub.titulo || '-'}</p>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                        <input type="text" id="edit-sku" value="${pub.sku || ''}"
                               placeholder="Ej: LAC101500XACRC050"
                               class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent font-mono">
                        <p class="text-xs text-gray-500 mt-1">Código del vendedor (seller_custom_field)</p>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Inventory ID</label>
                        <input type="text" id="edit-inventory" value="${pub.id_inventario || ''}"
                               placeholder="Ej: JWZL70892"
                               class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand focus:border-transparent font-mono">
                        <p class="text-xs text-gray-500 mt-1">ID de inventario Full de ML</p>
                    </div>
                </div>

                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                    <i class="fas fa-info-circle mr-1"></i>
                    Estos cambios son locales. Para actualizar en ML, usa la API.
                </div>

                <input type="hidden" id="edit-id-pub" value="${pub.id_publicacion}">
            </div>
        `;

        document.getElementById('modal-editar-pub').classList.remove('hidden');
    },

    // ============================================
    // MODAL: Cerrar
    // ============================================
    cerrarModal: () => {
        document.getElementById('modal-editar-pub').classList.add('hidden');
    },

    // ============================================
    // GUARDAR: Cambios de edición
    // ============================================
    guardarEdicion: async () => {
        const idPub = document.getElementById('edit-id-pub').value;
        const nuevoSku = document.getElementById('edit-sku').value.trim().toUpperCase() || null;
        const nuevoInventory = document.getElementById('edit-inventory').value.trim().toUpperCase() || null;

        const btnGuardar = document.getElementById('btn-guardar-pub');
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Guardando...';

        try {
            const { error } = await supabase
                .from('publicaciones_meli')
                .update({
                    sku: nuevoSku,
                    id_inventario: nuevoInventory
                })
                .eq('id_publicacion', idPub);

            if (error) throw error;

            // Actualizar en memoria
            const pub = publicaciones.find(p => p.id_publicacion === idPub);
            if (pub) {
                pub.sku = nuevoSku;
                pub.id_inventario = nuevoInventory;
            }

            mostrarNotificacion('Publicación actualizada', 'success');
            moduloPublicaciones.cerrarModal();
            moduloPublicaciones.pintarTabla();

        } catch (error) {
            console.error('Error guardando:', error);
            mostrarNotificacion('Error al guardar cambios', 'error');
        } finally {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = '<i class="fas fa-save"></i> Guardar';
        }
    },

    // ============================================
    // SINCRONIZAR: Traer datos desde ML
    // ============================================
    sincronizarML: async () => {
        mostrarNotificacion('Sincronizando con Mercado Libre...', 'info');

        try {
            const { data, error } = await supabase.functions.invoke('sync-meli', {
                body: { action: 'sync-inventory' }
            });

            if (error) throw error;

            if (data?.success) {
                mostrarNotificacion(`Sincronizado: ${data.updated || 0} publicaciones actualizadas`, 'success');
                await moduloPublicaciones.cargarPublicaciones();
            } else {
                mostrarNotificacion('Sincronización completada', 'success');
                await moduloPublicaciones.cargarPublicaciones();
            }

        } catch (error) {
            console.error('Error sincronizando:', error);
            mostrarNotificacion('Error al sincronizar con ML', 'error');
        }
    }
};

// Exponer en window para el HTML
window.moduloPublicaciones = moduloPublicaciones;
