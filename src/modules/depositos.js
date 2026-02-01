// ============================================
// MÓDULO: ABM de Depósitos Externos
// ============================================
// Gestión de destinos de envío (3PL externos)
// El destino "FULL" (MercadoLibre) es fijo y no editable
// ============================================

import { supabase } from '../config.js';
import { mostrarNotificacion } from '../utils.js';

// Estado local del módulo
let depositos = [];
let depositoEditando = null;

export const moduloDepositos = {

    // ============================================
    // RENDER: Dibuja la interfaz
    // ============================================
    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-4xl mx-auto space-y-6">

                <!-- Header -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div class="flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <i class="fas fa-warehouse text-brand"></i>
                                Depósitos de Envío
                            </h3>
                            <p class="text-sm text-gray-500 mt-1">
                                Gestiona los destinos donde envías productos (3PL externos)
                            </p>
                        </div>
                        <button onclick="moduloDepositos.abrirFormulario()"
                                class="bg-brand text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-dark transition-colors flex items-center gap-2">
                            <i class="fas fa-plus"></i>
                            Nuevo Depósito
                        </button>
                    </div>
                </div>

                <!-- Lista de depósitos -->
                <div id="lista-depositos" class="space-y-4">
                    <div class="flex justify-center p-8">
                        <i class="fas fa-spinner fa-spin fa-2x text-gray-300"></i>
                    </div>
                </div>

            </div>

            <!-- Modal de Formulario -->
            <div id="modal-deposito" class="fixed inset-0 z-50 hidden">
                <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onclick="moduloDepositos.cerrarFormulario()"></div>
                <div class="fixed inset-0 flex items-center justify-center p-4">
                    <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">
                        <div class="p-6 border-b border-gray-100">
                            <h3 id="modal-titulo" class="text-lg font-bold text-gray-800">Nuevo Depósito</h3>
                        </div>
                        <form id="form-deposito" class="p-6 space-y-4">

                            <div class="grid grid-cols-2 gap-4">
                                <div class="col-span-2">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        Nombre del Depósito *
                                    </label>
                                    <input type="text" id="dep-nombre" required
                                           placeholder="Ej: Depósito Logística Norte"
                                           class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                </div>

                                <div class="col-span-2">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        ID Corto *
                                    </label>
                                    <input type="text" id="dep-id" required
                                           placeholder="Ej: 3PL-NORTE"
                                           class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent font-mono uppercase"
                                           oninput="this.value = this.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')">
                                    <p class="text-xs text-gray-400 mt-1">Solo letras, números y guiones</p>
                                </div>
                            </div>

                            <hr class="border-gray-200">

                            <div class="grid grid-cols-2 gap-4">
                                <div class="col-span-2">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        Dirección
                                    </label>
                                    <input type="text" id="dep-direccion"
                                           placeholder="Ej: Av. Circunvalación 1234"
                                           class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                </div>

                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        Localidad
                                    </label>
                                    <input type="text" id="dep-localidad"
                                           placeholder="Ej: Rosario"
                                           class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                </div>

                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        Provincia
                                    </label>
                                    <input type="text" id="dep-provincia"
                                           placeholder="Ej: Santa Fe"
                                           class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                </div>

                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        Código Postal
                                    </label>
                                    <input type="text" id="dep-cp"
                                           placeholder="Ej: 2000"
                                           class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                </div>
                            </div>

                            <hr class="border-gray-200">

                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        Contacto
                                    </label>
                                    <input type="text" id="dep-contacto"
                                           placeholder="Ej: Juan Pérez"
                                           class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                </div>

                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        Teléfono
                                    </label>
                                    <input type="text" id="dep-telefono"
                                           placeholder="Ej: 341-555-1234"
                                           class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                </div>

                                <div class="col-span-2">
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        Email
                                    </label>
                                    <input type="email" id="dep-email"
                                           placeholder="Ej: deposito@empresa.com"
                                           class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                </div>
                            </div>

                            <hr class="border-gray-200">

                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        Tiempo Tránsito (días)
                                    </label>
                                    <input type="number" id="dep-transito" min="1" max="30" value="2"
                                           class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand focus:border-transparent">
                                </div>

                                <div class="flex items-end pb-2">
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" id="dep-activo" checked
                                               class="w-4 h-4 text-brand rounded focus:ring-brand">
                                        <span class="text-sm text-gray-700">Activo</span>
                                    </label>
                                </div>
                            </div>

                            <div class="flex items-center gap-4">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="dep-remito" checked
                                           class="w-4 h-4 text-brand rounded focus:ring-brand">
                                    <span class="text-sm text-gray-700">Requiere remito</span>
                                </label>

                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="dep-etiquetas" checked
                                           class="w-4 h-4 text-brand rounded focus:ring-brand">
                                    <span class="text-sm text-gray-700">Requiere etiquetas</span>
                                </label>
                            </div>

                        </form>
                        <div class="p-6 border-t border-gray-100 flex justify-end gap-3">
                            <button onclick="moduloDepositos.cerrarFormulario()"
                                    class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">
                                Cancelar
                            </button>
                            <button onclick="moduloDepositos.guardar()"
                                    class="px-6 py-2 bg-brand text-white rounded-lg font-medium hover:bg-brand-dark transition-colors">
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Cargar depósitos
        await moduloDepositos.cargarDepositos();

        // Exponer en window
        window.moduloDepositos = moduloDepositos;
    },

    // ============================================
    // CARGAR: Obtener depósitos de Supabase
    // ============================================
    cargarDepositos: async () => {
        try {
            const { data, error } = await supabase
                .from('destinos_envio')
                .select('*')
                .order('tipo', { ascending: true })  // 'meli' primero
                .order('nombre');

            if (error) throw error;

            depositos = data || [];
            moduloDepositos.pintarLista();

        } catch (error) {
            console.error('Error cargando depósitos:', error);
            mostrarNotificacion('Error al cargar depósitos', 'error');
        }
    },

    // ============================================
    // PINTAR: Lista de depósitos
    // ============================================
    pintarLista: () => {
        const container = document.getElementById('lista-depositos');

        if (depositos.length === 0) {
            container.innerHTML = `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                    <i class="fas fa-warehouse fa-3x text-gray-300 mb-4"></i>
                    <p class="text-gray-500">No hay depósitos configurados</p>
                    <p class="text-sm text-gray-400 mt-1">Ejecuta la migración SQL primero para crear el destino Full</p>
                </div>
            `;
            return;
        }

        container.innerHTML = depositos.map(d => {
            const esMeli = d.tipo === 'meli';
            const badgeColor = esMeli ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-blue-100 text-blue-800 border-blue-200';
            const badgeIcon = esMeli ? 'fa-brands fa-meli' : 'fa-warehouse';
            const estadoColor = d.activo ? 'text-green-600' : 'text-gray-400';
            const estadoTexto = d.activo ? 'Activo' : 'Inactivo';

            const direccionCompleta = [d.direccion, d.localidad, d.provincia, d.codigo_postal]
                .filter(Boolean)
                .join(', ') || 'Sin dirección';

            return `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-2">
                                <span class="font-mono text-sm font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                                    ${d.id_destino}
                                </span>
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${badgeColor}">
                                    <i class="fas ${badgeIcon}"></i>
                                    ${esMeli ? 'MercadoLibre' : 'Externo'}
                                </span>
                                <span class="inline-flex items-center gap-1 text-xs ${estadoColor}">
                                    <i class="fas fa-circle text-[6px]"></i>
                                    ${estadoTexto}
                                </span>
                            </div>

                            <h4 class="text-lg font-semibold text-gray-800">${d.nombre}</h4>

                            <p class="text-sm text-gray-500 mt-1 flex items-center gap-2">
                                <i class="fas fa-map-marker-alt text-gray-400"></i>
                                ${direccionCompleta}
                            </p>

                            ${d.contacto || d.telefono ? `
                                <p class="text-sm text-gray-500 mt-1 flex items-center gap-2">
                                    <i class="fas fa-user text-gray-400"></i>
                                    ${[d.contacto, d.telefono].filter(Boolean).join(' | ')}
                                </p>
                            ` : ''}

                            <div class="flex items-center gap-4 mt-3 text-xs text-gray-400">
                                <span><i class="fas fa-clock mr-1"></i> ${d.tiempo_transito_default || 0} días tránsito</span>
                                ${d.requiere_remito ? '<span><i class="fas fa-file-alt mr-1"></i> Remito</span>' : ''}
                                ${d.requiere_etiquetas ? '<span><i class="fas fa-tags mr-1"></i> Etiquetas</span>' : ''}
                            </div>
                        </div>

                        <div class="flex items-center gap-2 ml-4">
                            ${!esMeli ? `
                                <button onclick="moduloDepositos.editar('${d.id_destino}')"
                                        class="p-2 text-gray-400 hover:text-brand hover:bg-brand-light rounded-lg transition-colors"
                                        title="Editar">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="moduloDepositos.toggleActivo('${d.id_destino}', ${!d.activo})"
                                        class="p-2 text-gray-400 hover:text-${d.activo ? 'orange' : 'green'}-600 hover:bg-${d.activo ? 'orange' : 'green'}-50 rounded-lg transition-colors"
                                        title="${d.activo ? 'Desactivar' : 'Activar'}">
                                    <i class="fas fa-${d.activo ? 'ban' : 'check-circle'}"></i>
                                </button>
                            ` : `
                                <span class="text-xs text-gray-400 italic">Fijo</span>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // ============================================
    // FORMULARIO: Abrir modal para crear/editar
    // ============================================
    abrirFormulario: (deposito = null) => {
        depositoEditando = deposito;

        const modal = document.getElementById('modal-deposito');
        const titulo = document.getElementById('modal-titulo');
        const idInput = document.getElementById('dep-id');

        if (deposito) {
            titulo.textContent = 'Editar Depósito';
            idInput.value = deposito.id_destino;
            idInput.disabled = true;  // No se puede cambiar el ID
            document.getElementById('dep-nombre').value = deposito.nombre || '';
            document.getElementById('dep-direccion').value = deposito.direccion || '';
            document.getElementById('dep-localidad').value = deposito.localidad || '';
            document.getElementById('dep-provincia').value = deposito.provincia || '';
            document.getElementById('dep-cp').value = deposito.codigo_postal || '';
            document.getElementById('dep-contacto').value = deposito.contacto || '';
            document.getElementById('dep-telefono').value = deposito.telefono || '';
            document.getElementById('dep-email').value = deposito.email || '';
            document.getElementById('dep-transito').value = deposito.tiempo_transito_default || 2;
            document.getElementById('dep-activo').checked = deposito.activo !== false;
            document.getElementById('dep-remito').checked = deposito.requiere_remito !== false;
            document.getElementById('dep-etiquetas').checked = deposito.requiere_etiquetas !== false;
        } else {
            titulo.textContent = 'Nuevo Depósito';
            idInput.disabled = false;
            document.getElementById('form-deposito').reset();
            document.getElementById('dep-activo').checked = true;
            document.getElementById('dep-remito').checked = true;
            document.getElementById('dep-etiquetas').checked = true;
            document.getElementById('dep-transito').value = 2;
        }

        modal.classList.remove('hidden');
    },

    cerrarFormulario: () => {
        document.getElementById('modal-deposito').classList.add('hidden');
        depositoEditando = null;
    },

    // ============================================
    // EDITAR: Cargar depósito en formulario
    // ============================================
    editar: (idDestino) => {
        const deposito = depositos.find(d => d.id_destino === idDestino);
        if (deposito && deposito.tipo !== 'meli') {
            moduloDepositos.abrirFormulario(deposito);
        }
    },

    // ============================================
    // GUARDAR: Crear o actualizar depósito
    // ============================================
    guardar: async () => {
        const idDestino = document.getElementById('dep-id').value.trim().toUpperCase();
        const nombre = document.getElementById('dep-nombre').value.trim();

        if (!idDestino || !nombre) {
            mostrarNotificacion('ID y Nombre son requeridos', 'warning');
            return;
        }

        // Validar que no sea 'FULL' (reservado para MercadoLibre)
        if (!depositoEditando && idDestino === 'FULL') {
            mostrarNotificacion('El ID "FULL" está reservado para MercadoLibre', 'error');
            return;
        }

        const datos = {
            id_destino: idDestino,
            nombre: nombre,
            tipo: 'externo',  // Siempre externo (FULL es fijo)
            direccion: document.getElementById('dep-direccion').value.trim() || null,
            localidad: document.getElementById('dep-localidad').value.trim() || null,
            provincia: document.getElementById('dep-provincia').value.trim() || null,
            codigo_postal: document.getElementById('dep-cp').value.trim() || null,
            contacto: document.getElementById('dep-contacto').value.trim() || null,
            telefono: document.getElementById('dep-telefono').value.trim() || null,
            email: document.getElementById('dep-email').value.trim() || null,
            tiempo_transito_default: parseInt(document.getElementById('dep-transito').value) || 2,
            activo: document.getElementById('dep-activo').checked,
            requiere_remito: document.getElementById('dep-remito').checked,
            requiere_etiquetas: document.getElementById('dep-etiquetas').checked
        };

        try {
            if (depositoEditando) {
                // Actualizar
                const { error } = await supabase
                    .from('destinos_envio')
                    .update(datos)
                    .eq('id_destino', idDestino);

                if (error) throw error;
                mostrarNotificacion('Depósito actualizado', 'success');
            } else {
                // Crear
                const { error } = await supabase
                    .from('destinos_envio')
                    .insert(datos);

                if (error) {
                    if (error.code === '23505') {  // Unique violation
                        mostrarNotificacion('Ya existe un depósito con ese ID', 'error');
                        return;
                    }
                    throw error;
                }
                mostrarNotificacion('Depósito creado', 'success');
            }

            moduloDepositos.cerrarFormulario();
            await moduloDepositos.cargarDepositos();

        } catch (error) {
            console.error('Error guardando depósito:', error);
            mostrarNotificacion('Error al guardar: ' + error.message, 'error');
        }
    },

    // ============================================
    // TOGGLE: Activar/Desactivar depósito
    // ============================================
    toggleActivo: async (idDestino, nuevoEstado) => {
        try {
            const { error } = await supabase
                .from('destinos_envio')
                .update({ activo: nuevoEstado })
                .eq('id_destino', idDestino);

            if (error) throw error;

            mostrarNotificacion(`Depósito ${nuevoEstado ? 'activado' : 'desactivado'}`, 'success');
            await moduloDepositos.cargarDepositos();

        } catch (error) {
            console.error('Error cambiando estado:', error);
            mostrarNotificacion('Error al cambiar estado', 'error');
        }
    }
};

// Exponer en window
window.moduloDepositos = moduloDepositos;
