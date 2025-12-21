// ============================================
// MÓDULO: Envíos Creados
// ============================================
// Gestión de envíos creados con la calculadora:
// - Listar, editar, preparar y eliminar envíos
// - Estados: En Preparación, Despachado, Recibido
// ============================================

import { supabase } from '../config.js';
import { mostrarNotificacion, confirmarAccion, formatearFecha, generarId } from '../utils.js';

// Estado local del módulo
let enviosCache = [];
let envioSeleccionado = null;

export const moduloEnviosCreados = {

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
                                <i class="fas fa-truck-loading text-brand mr-2"></i>
                                Envíos Creados
                            </h3>
                            <span id="contador-envios" class="text-sm text-gray-500"></span>
                        </div>

                        <div class="flex items-center gap-3">
                            <!-- Filtro por estado -->
                            <select id="filtro-estado"
                                    class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                <option value="todos">Todos los estados</option>
                                <option value="Borrador">Borrador</option>
                                <option value="En Preparación">En Preparación</option>
                                <option value="Despachado">Despachado</option>
                                <option value="Recibido">Recibido</option>
                            </select>

                            <!-- Botón recargar -->
                            <button onclick="moduloEnviosCreados.cargarEnvios()"
                                    class="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center gap-2">
                                <i class="fas fa-sync-alt"></i>
                                Recargar
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
    // CARGAR: Obtener envíos desde Supabase
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
            // Obtener envíos
            const { data: envios, error } = await supabase
                .from('registro_envios_full')
                .select('*')
                .order('fecha_creacion', { ascending: false });

            if (error) throw error;

            // Obtener detalles de cada envío
            for (const envio of envios) {
                const { data: detalles, error: errorDet } = await supabase
                    .from('detalle_envios_full')
                    .select('sku, id_publicacion, cantidad_enviada')
                    .eq('id_envio', envio.id_envio);

                if (!errorDet) {
                    envio.productos = detalles || [];
                    envio.totalBultos = detalles.reduce((sum, d) => sum + (d.cantidad_enviada || 0), 0);
                } else {
                    envio.productos = [];
                    envio.totalBultos = 0;
                }

                // Obtener títulos de productos desde publicaciones
                if (envio.productos.length > 0) {
                    const skus = envio.productos.map(p => p.sku).filter(Boolean);
                    if (skus.length > 0) {
                        const { data: pubs } = await supabase
                            .from('publicaciones_meli')
                            .select('sku, titulo')
                            .in('sku', skus);

                        if (pubs) {
                            const titulosMap = {};
                            pubs.forEach(p => titulosMap[p.sku] = p.titulo);
                            envio.productos.forEach(p => {
                                p.titulo = titulosMap[p.sku] || p.sku;
                            });
                        }
                    }
                }
            }

            enviosCache = envios;
            moduloEnviosCreados.pintarEnvios(envios);

            // Actualizar contador
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
            const fechaColecta = envio.fecha_colecta ? new Date(envio.fecha_colecta) : null;

            // Colores según estado
            const estadoColores = {
                'Borrador': 'bg-gray-100 text-gray-700 border-gray-300',
                'En Preparación': 'bg-yellow-100 text-yellow-800 border-yellow-300',
                'Despachado': 'bg-blue-100 text-blue-800 border-blue-300',
                'Recibido': 'bg-green-100 text-green-800 border-green-300'
            };

            const estadoClase = estadoColores[envio.estado] || estadoColores['Borrador'];

            // Borde izquierdo según estado
            const bordeIzq = {
                'Borrador': 'border-l-gray-400',
                'En Preparación': 'border-l-yellow-500',
                'Despachado': 'border-l-blue-500',
                'Recibido': 'border-l-green-500'
            };

            const bordeClase = bordeIzq[envio.estado] || bordeIzq['Borrador'];

            return `
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 ${bordeClase} overflow-hidden hover:shadow-md transition-shadow" data-estado="${envio.estado}">
                <!-- Header de la tarjeta -->
                <div class="p-4 border-b border-gray-100">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-gray-800 text-lg">${envio.id_envio}</h4>
                            ${envio.id_envio_ml ? `<p class="text-xs text-gray-500">ML: ${envio.id_envio_ml}</p>` : ''}
                        </div>
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${estadoClase}">
                            ${envio.estado}
                        </span>
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
                        ${envio.productos.slice(0, 5).map(p => `
                            <li class="flex justify-between">
                                <span class="truncate" title="${p.titulo || p.sku}">${p.sku}</span>
                                <span class="font-medium">${p.cantidad_enviada} uds</span>
                            </li>
                        `).join('')}
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
                    <div class="flex gap-1">
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
    // FILTRAR: Por estado
    // ============================================
    filtrarEnvios: () => {
        const filtro = document.getElementById('filtro-estado').value;
        const enviosFiltrados = filtro === 'todos'
            ? enviosCache
            : enviosCache.filter(e => e.estado === filtro);

        moduloEnviosCreados.pintarEnvios(enviosFiltrados);
    },

    // ============================================
    // CAMBIAR ESTADO: Actualizar estado del envío
    // ============================================
    cambiarEstado: async (idEnvio, nuevoEstado) => {
        try {
            const { error } = await supabase
                .from('registro_envios_full')
                .update({ estado: nuevoEstado })
                .eq('id_envio', idEnvio);

            if (error) throw error;

            // Actualizar caché local
            const envio = enviosCache.find(e => e.id_envio === idEnvio);
            if (envio) envio.estado = nuevoEstado;

            mostrarNotificacion(`Estado actualizado a "${nuevoEstado}"`, 'success');

            // Recargar para actualizar colores
            moduloEnviosCreados.pintarEnvios(enviosCache);

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
            ? new Date(envio.fecha_colecta).toISOString().split('T')[0]
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
                        <label class="block text-sm font-medium text-gray-700">Productos del Envío</label>
                        <button onclick="moduloEnviosCreados.agregarProducto()"
                                class="text-sm text-brand hover:text-brand-dark font-medium">
                            <i class="fas fa-plus mr-1"></i>Agregar
                        </button>
                    </div>

                    <div id="lista-productos-editar" class="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                        ${envio.productos.map((p, idx) => `
                            <div class="flex items-center justify-between p-3 hover:bg-gray-50" data-idx="${idx}">
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

            // Actualizar registro del envío
            const { error } = await supabase
                .from('registro_envios_full')
                .update({
                    fecha_colecta: fechaColecta || null,
                    id_envio_ml: idMl || null,
                    notas: notas || null
                })
                .eq('id_envio', envioSeleccionado.id_envio);

            if (error) throw error;

            // Actualizar detalles de productos
            // Primero eliminar los existentes
            await supabase
                .from('detalle_envios_full')
                .delete()
                .eq('id_envio', envioSeleccionado.id_envio);

            // Insertar los nuevos
            if (envioSeleccionado.productos.length > 0) {
                const detalles = envioSeleccionado.productos.map(p => ({
                    id_envio: envioSeleccionado.id_envio,
                    sku: p.sku,
                    id_publicacion: p.id_publicacion || null,
                    cantidad_enviada: p.cantidad_enviada
                }));

                const { error: errorDet } = await supabase
                    .from('detalle_envios_full')
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
    // PRODUCTOS: Agregar nuevo
    // ============================================
    agregarProducto: async () => {
        // Mostrar input para SKU
        const sku = prompt('Ingresa el SKU del producto a agregar:');
        if (!sku) return;

        // Buscar el producto
        const { data: prod } = await supabase
            .from('publicaciones_meli')
            .select('sku, titulo, id_publicacion')
            .eq('sku', sku.trim().toUpperCase())
            .single();

        if (prod) {
            envioSeleccionado.productos.push({
                sku: prod.sku,
                titulo: prod.titulo,
                id_publicacion: prod.id_publicacion,
                cantidad_enviada: 1
            });
            // Re-renderizar
            moduloEnviosCreados.editarEnvio(envioSeleccionado.id_envio);
        } else {
            mostrarNotificacion('SKU no encontrado', 'warning');
        }
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
            // Eliminar progreso de preparación si existe
            await supabase
                .from('preparacion_en_curso')
                .delete()
                .eq('id_envio', idEnvio);

            // Eliminar detalles (FK)
            await supabase
                .from('detalle_envios_full')
                .delete()
                .eq('id_envio', idEnvio);

            // Eliminar registro del envío
            const { error } = await supabase
                .from('registro_envios_full')
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

            // Usar jsPDF (ya incluido en index.html)
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const fechaCreacion = new Date(envio.fecha_creacion);
            const fechaColecta = envio.fecha_colecta ? new Date(envio.fecha_colecta) : null;

            // Header
            doc.setFontSize(20);
            doc.setTextColor(78, 171, 135); // Color brand
            doc.text('Envío a Full', 105, 20, { align: 'center' });

            // Info del envío
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text(`ID: ${envio.id_envio}`, 14, 35);
            doc.text(`Estado: ${envio.estado}`, 130, 35);

            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.text(`Fecha Creación: ${fechaCreacion.toLocaleDateString('es-AR')}`, 14, 45);
            doc.text(`Fecha Colecta: ${fechaColecta ? fechaColecta.toLocaleDateString('es-AR') : '-'}`, 130, 45);

            if (envio.id_envio_ml) {
                doc.text(`ID ML: ${envio.id_envio_ml}`, 14, 52);
            }

            // Línea separadora
            doc.setDrawColor(200, 200, 200);
            doc.line(14, 58, 196, 58);

            // Tabla de productos usando autoTable con inventory_id
            const productosData = envio.productos.map((p, idx) => [
                idx + 1,
                p.sku || '-',
                inventoryMap[p.sku] || '-',
                (p.titulo || '-').substring(0, 50),
                p.cantidad_enviada || 0
            ]);

            doc.autoTable({
                startY: 65,
                head: [['#', 'SKU', 'Inventory ID', 'Producto', 'Cant.']],
                body: productosData,
                theme: 'striped',
                headStyles: {
                    fillColor: [78, 171, 135],
                    textColor: 255,
                    fontStyle: 'bold',
                    fontSize: 9
                },
                columnStyles: {
                    0: { cellWidth: 12, halign: 'center' },
                    1: { cellWidth: 36 },
                    2: { cellWidth: 24, fontSize: 8 },
                    3: { cellWidth: 104 },
                    4: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }
                },
                styles: {
                    fontSize: 9,
                    cellPadding: 2.5
                },
                margin: { left: 14, right: 14 }
            });

            // Totales
            const totalBultos = envio.productos.reduce((sum, p) => sum + (p.cantidad_enviada || 0), 0);
            const finalY = doc.lastAutoTable.finalY + 10;

            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text(`Total SKUs: ${envio.productos.length}`, 14, finalY);
            doc.text(`Total Bultos: ${totalBultos}`, 130, finalY);

            // Notas si existen
            if (envio.notas) {
                doc.setFontSize(9);
                doc.setTextColor(100, 100, 100);
                doc.text(`Notas: ${envio.notas}`, 14, finalY + 10);
            }

            // Footer
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 105, 285, { align: 'center' });

            // Descargar
            doc.save(`Envio_${envio.id_envio}.pdf`);
            mostrarNotificacion('PDF generado correctamente', 'success');

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
    cambiosPendientes: false, // Trackea si hay cambios desde el último guardado

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

        // Verificar si hay progreso guardado
        const progresoGuardado = await moduloEnviosCreados.cargarProgresoGuardado(envio.id_envio);
        const progresoMap = {};
        progresoGuardado.forEach(p => {
            progresoMap[p.sku] = p.cantidad_escaneada || 0;
        });

        // Obtener inventory_id de cada producto desde publicaciones_meli
        const productosConInventory = [];
        for (const prod of envio.productos) {
            let inventoryId = null;
            if (prod.sku) {
                const { data } = await supabase
                    .from('publicaciones_meli')
                    .select('id_inventario')
                    .eq('sku', prod.sku)
                    .single();
                if (data) inventoryId = data.id_inventario;
            }
            productosConInventory.push({
                ...prod,
                inventory_id: inventoryId,
                // Cargar cantidad escaneada del progreso guardado si existe
                cantidad_escaneada: progresoMap[prod.sku] || 0
            });
        }

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
                            <h3 class="text-lg font-bold text-gray-800">
                                <i class="fas fa-box-open text-yellow-500 mr-2"></i>
                                Preparando: ${envio.id_envio}
                            </h3>
                            <p class="text-sm text-gray-500">Escanea los productos o usa los botones +/-</p>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="moduloEnviosCreados.cancelarPreparacion()"
                                    class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                                <i class="fas fa-times mr-1"></i>Cancelar
                            </button>
                            <button id="btn-guardar-salir"
                                    onclick="moduloEnviosCreados.accionBotonGuardarSalir()"
                                    class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                                <i class="fas fa-save mr-1"></i>Guardar y Continuar
                            </button>
                            <button onclick="moduloEnviosCreados.finalizarPreparacion()"
                                    class="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors">
                                <i class="fas fa-check-circle mr-1"></i>Finalizar
                            </button>
                        </div>
                    </div>
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
        `;

        // Enfocar input y actualizar estado del botón
        setTimeout(() => {
            document.getElementById('input-escaner')?.focus();
            moduloEnviosCreados.actualizarBotonGuardar();
        }, 100);
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
        prod.cantidad_escaneada = (prod.cantidad_escaneada || 0) + 1;
        moduloEnviosCreados.ultimoSkuFoco = prod.sku;

        // Marcar que hay cambios pendientes
        moduloEnviosCreados.cambiosPendientes = true;
        moduloEnviosCreados.actualizarBotonGuardar();

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
        prod.cantidad_escaneada = Math.max(0, (prod.cantidad_escaneada || 0) + delta);

        // Marcar que hay cambios pendientes
        moduloEnviosCreados.cambiosPendientes = true;
        moduloEnviosCreados.actualizarBotonGuardar();

        moduloEnviosCreados.actualizarUIPreparacion(idx);
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
    // GUARDAR PROGRESO: Guarda en preparacion_en_curso para continuar después
    // ============================================
    guardarProgresoPreparacion: async () => {
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

            // Marcar que no hay cambios pendientes
            moduloEnviosCreados.cambiosPendientes = false;
            moduloEnviosCreados.actualizarBotonGuardar();

            mostrarNotificacion('Progreso guardado. Podés continuar después.', 'success');

        } catch (error) {
            console.error('Error guardando progreso:', error);
            mostrarNotificacion('Error al guardar progreso', 'error');
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
    // BOTÓN DINÁMICO: Guardar/Salir
    // ============================================
    actualizarBotonGuardar: () => {
        const btn = document.getElementById('btn-guardar-salir');
        if (!btn) return;

        if (moduloEnviosCreados.cambiosPendientes) {
            // Hay cambios sin guardar → mostrar "Guardar"
            btn.innerHTML = '<i class="fas fa-save mr-1"></i>Guardar y Continuar';
            btn.className = 'px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors';
        } else {
            // Todo guardado → mostrar "Salir"
            btn.innerHTML = '<i class="fas fa-sign-out-alt mr-1"></i>Salir';
            btn.className = 'px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors';
        }
    },

    accionBotonGuardarSalir: async () => {
        if (moduloEnviosCreados.cambiosPendientes) {
            // Hay cambios → guardar
            await moduloEnviosCreados.guardarProgresoPreparacion();
        } else {
            // Ya guardado → salir sin confirmación
            await moduloEnviosCreados.salirPreparacion();
        }
    },

    salirPreparacion: async () => {
        // Salir sin pedir confirmación (ya guardó)
        moduloEnviosCreados.preparacionActiva = null;
        moduloEnviosCreados.productosPreparacion = [];
        moduloEnviosCreados.ultimoSkuFoco = null;
        moduloEnviosCreados.cambiosPendientes = false;

        // Volver a la lista
        const contenedor = document.getElementById('app-content');
        await moduloEnviosCreados.render(contenedor);
    },

    cancelarPreparacion: async () => {
        // Solo pedir confirmación si hay cambios sin guardar
        if (moduloEnviosCreados.cambiosPendientes) {
            const confirmado = await confirmarAccion(
                'Cancelar preparación',
                '¿Seguro que querés cancelar? Se perderá el progreso de escaneo no guardado.',
                'warning',
                'Sí, Cancelar'
            );

            if (!confirmado) return;
        }

        moduloEnviosCreados.preparacionActiva = null;
        moduloEnviosCreados.productosPreparacion = [];
        moduloEnviosCreados.ultimoSkuFoco = null;
        moduloEnviosCreados.cambiosPendientes = false;

        // Volver a la lista
        const contenedor = document.getElementById('app-content');
        await moduloEnviosCreados.render(contenedor);
    },

    finalizarPreparacion: async () => {
        const envio = moduloEnviosCreados.preparacionActiva;
        if (!envio) return;

        // Verificar si está todo completo
        const todosCompletos = moduloEnviosCreados.productosPreparacion.every(
            p => (p.cantidad_escaneada || 0) >= (p.cantidad_enviada || 0)
        );

        if (!todosCompletos) {
            const continuar = await confirmarAccion(
                'Preparación incompleta',
                'No todos los productos están completos. ¿Querés finalizar igual?',
                'warning',
                'Sí, Finalizar'
            );
            if (!continuar) return;
        }

        try {
            // Cambiar estado a "Despachado"
            const { error } = await supabase
                .from('registro_envios_full')
                .update({ estado: 'Despachado' })
                .eq('id_envio', envio.id_envio);

            if (error) throw error;

            // Limpiar progreso guardado ya que se completó
            await supabase
                .from('preparacion_en_curso')
                .delete()
                .eq('id_envio', envio.id_envio);

            mostrarNotificacion('Preparación finalizada. Envío marcado como Despachado.', 'success');

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
    }
};

// Exponer en window para el HTML
window.moduloEnviosCreados = moduloEnviosCreados;
