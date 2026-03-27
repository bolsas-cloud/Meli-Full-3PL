// ============================================
// MÓDULO: Base de Conocimiento (RAG)
// CRUD de documentos + chunking + embeddings
// ============================================
import { supabase } from '../config.js';
import { mostrarNotificacion, confirmarAccion } from '../utils.js';

const KP_URL = 'https://cpwsdpzxzhlmozzasnqx.supabase.co/functions/v1/knowledge-processor';

// Estado
let documentos = [];

// Categorías predefinidas
const CATEGORIAS = ['Políticas', 'FAQ', 'Productos', 'Envíos', 'Materiales', 'Empresa'];

export const moduloKnowledgeBase = {

    render: async (contenedor) => {
        contenedor.classList.remove('p-4', 'sm:p-8');
        contenedor.classList.add('p-0');

        contenedor.innerHTML = `
        <div class="h-full flex flex-col">
            <!-- Header -->
            <div class="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
                <div>
                    <h2 class="text-lg font-bold text-gray-800">
                        <i class="fas fa-brain text-brand mr-2"></i>Base de Conocimiento
                    </h2>
                    <p class="text-xs text-gray-500 mt-0.5">Documentos que el agente IA usa para responder consultas</p>
                </div>
                <button onclick="moduloKnowledgeBase.abrirModal()" class="px-4 py-2 bg-brand text-white text-sm rounded-lg hover:bg-brand-dark transition-colors flex items-center gap-2">
                    <i class="fas fa-plus"></i> Agregar Documento
                </button>
            </div>

            <!-- Stats -->
            <div class="bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center gap-6 flex-shrink-0">
                <div class="flex items-center gap-2">
                    <i class="fas fa-file-alt text-brand"></i>
                    <span id="kb-stats-docs" class="text-sm text-gray-600">0 documentos</span>
                </div>
                <div class="flex items-center gap-2">
                    <i class="fas fa-puzzle-piece text-emerald-500"></i>
                    <span id="kb-stats-chunks" class="text-sm text-gray-600">0 chunks indexados</span>
                </div>
            </div>

            <!-- Tabla de documentos -->
            <div class="flex-1 overflow-y-auto">
                <table class="w-full">
                    <thead class="bg-gray-50 sticky top-0">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Título</th>
                            <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Categoría</th>
                            <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Chunks</th>
                            <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Actualización</th>
                            <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="kb-tabla-body" class="divide-y divide-gray-100">
                        <tr><td colspan="5" class="px-6 py-12 text-center text-gray-400">
                            <i class="fas fa-spinner fa-spin fa-2x mb-3"></i>
                            <p class="text-sm">Cargando documentos...</p>
                        </td></tr>
                    </tbody>
                </table>
            </div>

            <!-- Modal crear/editar -->
            <div id="kb-modal" class="fixed inset-0 z-50 hidden" aria-modal="true">
                <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onclick="moduloKnowledgeBase.cerrarModal()"></div>
                <div class="fixed inset-0 z-10 overflow-y-auto p-4 flex items-center justify-center">
                    <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl animate-fade-in">
                        <div class="bg-brand text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
                            <h3 id="kb-modal-titulo" class="font-bold text-lg">Nuevo Documento</h3>
                            <button onclick="moduloKnowledgeBase.cerrarModal()" class="text-white/80 hover:text-white">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        <div class="p-6 space-y-4">
                            <input type="hidden" id="kb-doc-id">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Título</label>
                                <input type="text" id="kb-doc-titulo" placeholder="Ej: Política de envíos"
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                                <div class="flex gap-2">
                                    <select id="kb-doc-categoria" onchange="moduloKnowledgeBase.onCategoriaChange()"
                                        class="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none">
                                        ${CATEGORIAS.map(c => `<option value="${c}">${c}</option>`).join('')}
                                        <option value="__otra__">Otra...</option>
                                    </select>
                                    <input type="text" id="kb-doc-categoria-custom" placeholder="Categoría personalizada"
                                        class="hidden flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none">
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Contenido</label>
                                <textarea id="kb-doc-contenido" rows="12" placeholder="Escribí o pegá el contenido del documento. El sistema lo divide automáticamente en fragmentos y genera embeddings para búsqueda semántica."
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand/30 focus:border-brand outline-none resize-none font-mono"></textarea>
                                <p class="text-[11px] text-gray-400 mt-1">
                                    <i class="fas fa-info-circle mr-1"></i>
                                    Separá secciones con doble salto de línea para mejor chunking. Se generan embeddings con Gemini.
                                </p>
                            </div>
                        </div>
                        <div class="bg-gray-50 px-6 py-4 flex justify-end gap-3 rounded-b-xl">
                            <button onclick="moduloKnowledgeBase.cerrarModal()"
                                class="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm">
                                Cancelar
                            </button>
                            <button onclick="moduloKnowledgeBase.guardarDocumento()" id="kb-btn-guardar"
                                class="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark text-sm flex items-center gap-2">
                                <i class="fas fa-save"></i> Guardar y Procesar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        await moduloKnowledgeBase.cargarDocumentos();
        window.moduloKnowledgeBase = moduloKnowledgeBase;
    },

    // ---- CARGAR DOCUMENTOS ----
    cargarDocumentos: async () => {
        const tbody = document.getElementById('kb-tabla-body');
        try {
            const { data, error } = await supabase
                .from('knowledge_base')
                .select('id, titulo, categoria, chunks_count, created_at, updated_at')
                .order('updated_at', { ascending: false });

            if (error) throw error;
            documentos = data || [];

            // Stats
            const totalChunks = documentos.reduce((acc, d) => acc + (d.chunks_count || 0), 0);
            document.getElementById('kb-stats-docs').textContent = `${documentos.length} documento${documentos.length !== 1 ? 's' : ''}`;
            document.getElementById('kb-stats-chunks').textContent = `${totalChunks} chunks indexados`;

            if (documentos.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400">
                    <i class="fas fa-brain fa-2x mb-3"></i>
                    <p class="text-sm">No hay documentos en la base de conocimiento</p>
                    <p class="text-xs mt-1">Agregá documentos para que el agente IA pueda responder consultas</p>
                </td></tr>`;
                return;
            }

            const badgeColor = (cat) => {
                const map = {
                    'Políticas': 'bg-blue-100 text-blue-700',
                    'FAQ': 'bg-yellow-100 text-yellow-700',
                    'Productos': 'bg-green-100 text-green-700',
                    'Envíos': 'bg-purple-100 text-purple-700',
                    'Materiales': 'bg-orange-100 text-orange-700',
                    'Empresa': 'bg-gray-100 text-gray-700'
                };
                return map[cat] || 'bg-gray-100 text-gray-600';
            };

            const formatFecha = (f) => {
                if (!f) return '-';
                return new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            };

            tbody.innerHTML = documentos.map(d => `
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-6 py-3">
                        <p class="text-sm font-medium text-gray-800">${d.titulo}</p>
                    </td>
                    <td class="px-4 py-3">
                        <span class="text-xs px-2 py-1 rounded-full font-medium ${badgeColor(d.categoria)}">${d.categoria}</span>
                    </td>
                    <td class="px-4 py-3 text-center">
                        <span class="text-sm text-gray-600 font-mono">${d.chunks_count || 0}</span>
                    </td>
                    <td class="px-4 py-3">
                        <span class="text-xs text-gray-500">${formatFecha(d.updated_at)}</span>
                    </td>
                    <td class="px-4 py-3 text-center">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="moduloKnowledgeBase.abrirModal('${d.id}')" title="Editar"
                                class="p-1.5 text-gray-400 hover:text-brand hover:bg-gray-100 rounded-lg transition-colors">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="moduloKnowledgeBase.eliminarDocumento('${d.id}', '${d.titulo.replace(/'/g, "\\'")}')" title="Eliminar"
                                class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');

        } catch (error) {
            console.error('Error cargando KB:', error);
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-red-400">
                <i class="fas fa-exclamation-circle fa-2x mb-3"></i>
                <p class="text-sm">Error al cargar documentos</p>
            </td></tr>`;
        }
    },

    // ---- MODAL CREAR/EDITAR ----
    abrirModal: async (idDoc) => {
        document.getElementById('kb-doc-id').value = idDoc || '';
        document.getElementById('kb-doc-titulo').value = '';
        document.getElementById('kb-doc-categoria').value = CATEGORIAS[0];
        document.getElementById('kb-doc-categoria-custom').classList.add('hidden');
        document.getElementById('kb-doc-contenido').value = '';
        document.getElementById('kb-modal-titulo').textContent = idDoc ? 'Editar Documento' : 'Nuevo Documento';

        if (idDoc) {
            // Cargar documento existente
            const { data, error } = await supabase
                .from('knowledge_base')
                .select('*')
                .eq('id', idDoc)
                .single();

            if (!error && data) {
                document.getElementById('kb-doc-titulo').value = data.titulo;
                document.getElementById('kb-doc-contenido').value = data.contenido;

                if (CATEGORIAS.includes(data.categoria)) {
                    document.getElementById('kb-doc-categoria').value = data.categoria;
                } else {
                    document.getElementById('kb-doc-categoria').value = '__otra__';
                    document.getElementById('kb-doc-categoria-custom').classList.remove('hidden');
                    document.getElementById('kb-doc-categoria-custom').value = data.categoria;
                }
            }
        }

        document.getElementById('kb-modal').classList.remove('hidden');
    },

    cerrarModal: () => {
        document.getElementById('kb-modal').classList.add('hidden');
    },

    onCategoriaChange: () => {
        const select = document.getElementById('kb-doc-categoria');
        const custom = document.getElementById('kb-doc-categoria-custom');
        if (select.value === '__otra__') {
            custom.classList.remove('hidden');
            custom.focus();
        } else {
            custom.classList.add('hidden');
        }
    },

    // ---- GUARDAR DOCUMENTO ----
    guardarDocumento: async () => {
        const idDoc = document.getElementById('kb-doc-id').value || null;
        const titulo = document.getElementById('kb-doc-titulo').value.trim();
        const selectCat = document.getElementById('kb-doc-categoria').value;
        const categoria = selectCat === '__otra__'
            ? document.getElementById('kb-doc-categoria-custom').value.trim()
            : selectCat;
        const contenido = document.getElementById('kb-doc-contenido').value.trim();

        if (!titulo || !categoria || !contenido) {
            mostrarNotificacion('Completá todos los campos', 'warning');
            return;
        }

        const btn = document.getElementById('kb-btn-guardar');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Procesando...';

        try {
            const resp = await fetch(KP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accion: 'procesar',
                    id: idDoc,
                    titulo,
                    categoria,
                    contenido
                })
            });

            const data = await resp.json();

            if (data.error) throw new Error(data.error);

            mostrarNotificacion(`Documento guardado: ${data.chunks_count} chunks generados`, 'success');
            moduloKnowledgeBase.cerrarModal();
            await moduloKnowledgeBase.cargarDocumentos();

        } catch (error) {
            console.error('Error guardando documento:', error);
            mostrarNotificacion('Error al procesar: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Guardar y Procesar';
        }
    },

    // ---- ELIMINAR DOCUMENTO ----
    eliminarDocumento: async (id, titulo) => {
        const ok = await confirmarAccion(
            'Eliminar documento',
            `¿Eliminar "${titulo}" y todos sus chunks?`,
            'danger',
            'Eliminar'
        );
        if (!ok) return;

        try {
            const resp = await fetch(KP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'eliminar', id })
            });

            const data = await resp.json();
            if (data.error) throw new Error(data.error);

            mostrarNotificacion('Documento eliminado', 'success');
            await moduloKnowledgeBase.cargarDocumentos();
        } catch (error) {
            console.error('Error eliminando:', error);
            mostrarNotificacion('Error al eliminar', 'error');
        }
    },

    // ---- CLEANUP ----
    destroy: () => {
        const contenedor = document.getElementById('app-content');
        if (contenedor) {
            contenedor.classList.remove('p-0');
            contenedor.classList.add('p-4', 'sm:p-8', 'overflow-y-auto');
        }
        documentos = [];
    }
};

window.moduloKnowledgeBase = moduloKnowledgeBase;
