// ============================================
// MODULO: Etiquetado Masivo
// ============================================
// Genera etiquetas 50x25mm con código de barras
// Code 128 para productos de Mercado Libre.
// Soporta búsqueda manual y escaneo con lector.
// ============================================

import { supabase } from '../config.js';
import { mostrarNotificacion } from '../utils.js';

// Estado local del módulo
let productos = [];
let colaImpresion = [];  // [{sku, titulo, inventory_id, cantidad}]
let resultadosBusqueda = [];

// Buffer para detección de escáner
let bufferEscaneo = '';
let timeoutEscaneo = null;

export const moduloEtiquetas = {

    // ============================================
    // RENDER: Dibuja la interfaz principal
    // ============================================
    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-5xl mx-auto space-y-6">

                <!-- Header con instrucciones -->
                <div class="bg-gradient-to-r from-brand to-brand-dark text-white p-6 rounded-xl shadow-lg">
                    <div class="flex items-center gap-4">
                        <div class="bg-white/20 p-3 rounded-lg">
                            <i class="fas fa-barcode fa-2x"></i>
                        </div>
                        <div>
                            <h2 class="text-xl font-bold">Etiquetado Masivo</h2>
                            <p class="text-white/80 text-sm mt-1">
                                Busca productos o escanea códigos de barras para agregar etiquetas a la cola de impresión.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Panel de búsqueda -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <i class="fas fa-search text-brand"></i>
                        Buscar Productos
                    </h3>

                    <div class="flex gap-4 mb-4">
                        <div class="flex-1 relative">
                            <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                            <input type="text"
                                   id="input-busqueda"
                                   placeholder="Buscar por SKU, nombre o escanear código de barras..."
                                   class="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent text-lg"
                                   autocomplete="off">
                        </div>
                    </div>

                    <!-- Indicador de escaneo -->
                    <div id="indicador-escaneo" class="hidden mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
                        <i class="fas fa-qrcode fa-lg"></i>
                        <span>Escaneando: <strong id="texto-escaneo"></strong></span>
                    </div>

                    <!-- Resultados de búsqueda -->
                    <div id="resultados-busqueda" class="space-y-2 max-h-64 overflow-y-auto">
                        <p class="text-gray-500 text-sm text-center py-4">
                            <i class="fas fa-info-circle mr-1"></i>
                            Escribe al menos 2 caracteres para buscar
                        </p>
                    </div>
                </div>

                <!-- Cola de impresión -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-semibold text-gray-800 flex items-center gap-2">
                            <i class="fas fa-list-check text-brand"></i>
                            Cola de Impresión
                        </h3>
                        <div class="flex items-center gap-2">
                            <span class="text-sm text-gray-500">Total:</span>
                            <span id="total-etiquetas" class="bg-brand text-white px-3 py-1 rounded-full text-sm font-bold">0 etiquetas</span>
                        </div>
                    </div>

                    <!-- Lista de productos en cola -->
                    <div id="lista-cola" class="space-y-2 mb-4 max-h-80 overflow-y-auto">
                        <p class="text-gray-400 text-center py-8">
                            <i class="fas fa-inbox fa-2x mb-2 block"></i>
                            La cola está vacía. Busca o escanea productos para agregar.
                        </p>
                    </div>

                    <!-- Botones de acción -->
                    <div class="flex items-center justify-between pt-4 border-t border-gray-200">
                        <button onclick="moduloEtiquetas.limpiarCola()"
                                id="btn-limpiar"
                                class="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled>
                            <i class="fas fa-trash"></i>
                            Limpiar Cola
                        </button>

                        <button onclick="moduloEtiquetas.generarPDF()"
                                id="btn-generar-pdf"
                                class="px-6 py-3 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors flex items-center gap-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled>
                            <i class="fas fa-file-pdf" id="icon-generar"></i>
                            <span id="texto-btn-generar">Generar PDF</span>
                        </button>
                    </div>
                </div>

                <!-- Notas de configuración -->
                <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <h4 class="font-semibold text-amber-800 flex items-center gap-2 mb-2">
                        <i class="fas fa-exclamation-triangle"></i>
                        Configuración de Impresora
                    </h4>
                    <ul class="text-sm text-amber-700 space-y-1">
                        <li><i class="fas fa-check mr-2"></i>Tamaño de papel: <strong>50 x 25 mm</strong></li>
                        <li><i class="fas fa-check mr-2"></i>Márgenes: <strong>0 mm</strong> (sin márgenes)</li>
                        <li><i class="fas fa-check mr-2"></i>Orientación: <strong>Horizontal (Landscape)</strong></li>
                    </ul>
                </div>

            </div>
        `;

        // Exponer módulo en window para eventos onclick
        window.moduloEtiquetas = moduloEtiquetas;

        // Configurar eventos
        moduloEtiquetas.configurarEventos();

        // Cargar productos
        await moduloEtiquetas.cargarProductos();
    },

    // ============================================
    // CONFIGURAR EVENTOS
    // ============================================
    configurarEventos: () => {
        const inputBusqueda = document.getElementById('input-busqueda');

        // Evento de búsqueda con debounce
        let timeoutBusqueda = null;
        inputBusqueda.addEventListener('input', (e) => {
            clearTimeout(timeoutBusqueda);
            const termino = e.target.value.trim();

            if (termino.length < 2) {
                moduloEtiquetas.mostrarMensajeInicial();
                return;
            }

            timeoutBusqueda = setTimeout(() => {
                moduloEtiquetas.buscarProductos(termino);
            }, 300);
        });

        // Evento Enter para agregar primer resultado
        inputBusqueda.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && resultadosBusqueda.length > 0) {
                moduloEtiquetas.agregarACola(resultadosBusqueda[0].sku, 1);
                inputBusqueda.value = '';
                moduloEtiquetas.mostrarMensajeInicial();
            }
        });

        // Detección de escáner (input rápido)
        document.addEventListener('keypress', moduloEtiquetas.detectarEscaneo);
    },

    // ============================================
    // DETECTAR ESCANEO: Captura input rápido del lector
    // ============================================
    detectarEscaneo: (e) => {
        const inputBusqueda = document.getElementById('input-busqueda');

        // Si el foco está en el input de búsqueda, dejar que funcione normal
        if (document.activeElement === inputBusqueda) return;

        clearTimeout(timeoutEscaneo);

        if (e.key === 'Enter' && bufferEscaneo.length >= 3) {
            // Procesar código escaneado
            const codigo = bufferEscaneo.trim();
            console.log('Código escaneado:', codigo);

            // Buscar producto y agregar a cola
            moduloEtiquetas.buscarYAgregar(codigo);
            bufferEscaneo = '';

            // Ocultar indicador
            document.getElementById('indicador-escaneo')?.classList.add('hidden');
        } else if (e.key !== 'Enter') {
            bufferEscaneo += e.key;

            // Mostrar indicador de escaneo
            const indicador = document.getElementById('indicador-escaneo');
            const textoEscaneo = document.getElementById('texto-escaneo');
            if (indicador && textoEscaneo) {
                indicador.classList.remove('hidden');
                textoEscaneo.textContent = bufferEscaneo;
            }

            // Reset buffer si pasan más de 100ms entre teclas
            timeoutEscaneo = setTimeout(() => {
                bufferEscaneo = '';
                document.getElementById('indicador-escaneo')?.classList.add('hidden');
            }, 100);
        }
    },

    // ============================================
    // BUSCAR Y AGREGAR: Para escaneo rápido
    // ============================================
    buscarYAgregar: (codigo) => {
        // Buscar por SKU o inventory_id
        const producto = productos.find(p =>
            p.sku?.toLowerCase() === codigo.toLowerCase() ||
            p.id_inventario?.toLowerCase() === codigo.toLowerCase()
        );

        if (producto) {
            moduloEtiquetas.agregarACola(producto.sku, 1);
            mostrarNotificacion(`${producto.sku} agregado a la cola`, 'success');
        } else {
            mostrarNotificacion(`Producto no encontrado: ${codigo}`, 'error');
        }
    },

    // ============================================
    // CARGAR PRODUCTOS: Obtiene catálogo de Supabase
    // ============================================
    cargarProductos: async () => {
        try {
            const { data, error } = await supabase
                .from('publicaciones_meli')
                .select('sku, titulo, id_inventario')
                .order('titulo');

            if (error) throw error;

            productos = data || [];
            console.log(`Cargados ${productos.length} productos para etiquetas`);

        } catch (error) {
            console.error('Error cargando productos:', error);
            mostrarNotificacion('Error al cargar productos', 'error');
        }
    },

    // ============================================
    // BUSCAR PRODUCTOS: Filtra por término
    // ============================================
    buscarProductos: (termino) => {
        const terminoLower = termino.toLowerCase();

        // Filtrar por término y excluir los que ya están en la cola
        const skusEnCola = colaImpresion.map(item => item.sku);

        resultadosBusqueda = productos.filter(p =>
            !skusEnCola.includes(p.sku) && (
                (p.sku || '').toLowerCase().includes(terminoLower) ||
                (p.titulo || '').toLowerCase().includes(terminoLower) ||
                (p.id_inventario || '').toLowerCase().includes(terminoLower)
            )
        ).slice(0, 10); // Máximo 10 resultados

        moduloEtiquetas.pintarResultados();
    },

    // ============================================
    // PINTAR RESULTADOS: Muestra resultados de búsqueda (click para agregar)
    // ============================================
    pintarResultados: () => {
        const contenedor = document.getElementById('resultados-busqueda');

        if (resultadosBusqueda.length === 0) {
            contenedor.innerHTML = `
                <p class="text-gray-500 text-sm text-center py-4">
                    <i class="fas fa-search mr-1"></i>
                    No se encontraron productos
                </p>
            `;
            return;
        }

        contenedor.innerHTML = resultadosBusqueda.map(p => {
            const tieneInventoryId = p.id_inventario && p.id_inventario.trim() !== '';

            return `
                <div onclick="${tieneInventoryId ? `moduloEtiquetas.agregarACola('${p.sku}', 1)` : ''}"
                     class="flex items-center p-3 bg-gray-50 rounded-lg transition-colors ${tieneInventoryId ? 'hover:bg-brand/10 cursor-pointer' : 'opacity-50 cursor-not-allowed'}">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-sm font-semibold text-brand">${p.sku || '-'}</span>
                            ${tieneInventoryId
                                ? `<span class="text-xs text-gray-400"><i class="fas fa-barcode mr-1"></i>${p.id_inventario}</span>`
                                : `<span class="text-xs text-red-500"><i class="fas fa-exclamation-triangle mr-1"></i>Sin inventory ID</span>`
                            }
                        </div>
                        <p class="text-sm text-gray-700 truncate" title="${(p.titulo || '').replace(/"/g, '&quot;')}">${p.titulo || '-'}</p>
                    </div>
                    ${tieneInventoryId ? `
                        <div class="ml-4 text-brand">
                            <i class="fas fa-plus-circle fa-lg"></i>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    },

    // ============================================
    // AGREGAR A COLA: Agrega producto con cantidad
    // ============================================
    agregarACola: (sku, cantidad) => {
        const producto = productos.find(p => p.sku === sku);
        if (!producto) {
            mostrarNotificacion('Producto no encontrado', 'error');
            return;
        }

        if (!producto.id_inventario || producto.id_inventario.trim() === '') {
            mostrarNotificacion('Este producto no tiene inventory ID', 'error');
            return;
        }

        // Verificar si ya está en la cola
        const existente = colaImpresion.find(item => item.sku === sku);

        if (existente) {
            existente.cantidad += cantidad;
        } else {
            colaImpresion.push({
                sku: producto.sku,
                titulo: producto.titulo,
                inventory_id: producto.id_inventario,
                cantidad: cantidad
            });
        }

        moduloEtiquetas.pintarCola();
        moduloEtiquetas.pintarResultados(); // Actualizar botones
        mostrarNotificacion(`${cantidad} etiqueta(s) de ${sku} agregadas`, 'success');
    },

    // ============================================
    // PINTAR COLA: Renderiza lista de impresión
    // ============================================
    pintarCola: () => {
        const contenedor = document.getElementById('lista-cola');
        const totalSpan = document.getElementById('total-etiquetas');
        const btnLimpiar = document.getElementById('btn-limpiar');
        const btnGenerar = document.getElementById('btn-generar-pdf');

        // Calcular total de etiquetas
        const totalEtiquetas = colaImpresion.reduce((sum, item) => sum + item.cantidad, 0);
        totalSpan.textContent = `${totalEtiquetas} etiqueta${totalEtiquetas !== 1 ? 's' : ''}`;

        // Habilitar/deshabilitar botones
        btnLimpiar.disabled = colaImpresion.length === 0;
        btnGenerar.disabled = colaImpresion.length === 0;
        document.getElementById('texto-btn-generar').textContent =
            colaImpresion.length > 0 ? `Generar PDF (${totalEtiquetas})` : 'Generar PDF';

        if (colaImpresion.length === 0) {
            contenedor.innerHTML = `
                <p class="text-gray-400 text-center py-8">
                    <i class="fas fa-inbox fa-2x mb-2 block"></i>
                    La cola está vacía. Busca o escanea productos para agregar.
                </p>
            `;
            return;
        }

        contenedor.innerHTML = colaImpresion.map(item => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div class="flex-1 min-w-0">
                    <p class="font-mono text-sm text-brand font-semibold">${item.sku}</p>
                    <p class="text-sm text-gray-700 truncate">${item.titulo}</p>
                    <p class="text-xs text-gray-500"><i class="fas fa-barcode mr-1"></i>${item.inventory_id}</p>
                </div>
                <div class="flex items-center gap-3 ml-4">
                    <button onclick="moduloEtiquetas.actualizarCantidad('${item.sku}', -1)"
                            class="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded transition-colors">
                        <i class="fas fa-minus text-sm"></i>
                    </button>
                    <input type="number"
                           id="cola-cant-${item.sku}"
                           value="${item.cantidad}"
                           min="1"
                           max="999"
                           onchange="moduloEtiquetas.setCantidad('${item.sku}', this.value)"
                           class="w-16 px-2 py-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-brand focus:border-transparent font-bold">
                    <button onclick="moduloEtiquetas.actualizarCantidad('${item.sku}', 1)"
                            class="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded transition-colors">
                        <i class="fas fa-plus text-sm"></i>
                    </button>
                    <button onclick="moduloEtiquetas.eliminarDeCola('${item.sku}')"
                            class="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-50 rounded transition-colors ml-2">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    // ============================================
    // ACTUALIZAR CANTIDAD: Incrementa/decrementa
    // ============================================
    actualizarCantidad: (sku, delta) => {
        const item = colaImpresion.find(i => i.sku === sku);
        if (!item) return;

        item.cantidad = Math.max(1, item.cantidad + delta);
        moduloEtiquetas.pintarCola();
    },

    // ============================================
    // SET CANTIDAD: Establece cantidad directamente
    // ============================================
    setCantidad: (sku, valor) => {
        const item = colaImpresion.find(i => i.sku === sku);
        if (!item) return;

        const cantidad = parseInt(valor) || 1;
        item.cantidad = Math.max(1, Math.min(999, cantidad));
        moduloEtiquetas.pintarCola();
    },

    // ============================================
    // ELIMINAR DE COLA
    // ============================================
    eliminarDeCola: (sku) => {
        colaImpresion = colaImpresion.filter(item => item.sku !== sku);
        moduloEtiquetas.pintarCola();
        moduloEtiquetas.pintarResultados();
    },

    // ============================================
    // LIMPIAR COLA
    // ============================================
    limpiarCola: () => {
        colaImpresion = [];
        moduloEtiquetas.pintarCola();
        moduloEtiquetas.pintarResultados();
        mostrarNotificacion('Cola de impresión vaciada', 'info');
    },

    // ============================================
    // MOSTRAR MENSAJE INICIAL
    // ============================================
    mostrarMensajeInicial: () => {
        const contenedor = document.getElementById('resultados-busqueda');
        resultadosBusqueda = [];
        contenedor.innerHTML = `
            <p class="text-gray-500 text-sm text-center py-4">
                <i class="fas fa-info-circle mr-1"></i>
                Escribe al menos 2 caracteres para buscar
            </p>
        `;
    },

    // ============================================
    // GENERAR PDF: Crea documento con todas las etiquetas
    // ============================================
    generarPDF: async () => {
        if (colaImpresion.length === 0) {
            mostrarNotificacion('La cola de impresión está vacía', 'error');
            return;
        }

        const btnGenerar = document.getElementById('btn-generar-pdf');
        const iconGenerar = document.getElementById('icon-generar');
        const textoBtn = document.getElementById('texto-btn-generar');

        try {
            // UI: mostrar loading
            btnGenerar.disabled = true;
            iconGenerar.classList.remove('fa-file-pdf');
            iconGenerar.classList.add('fa-spinner', 'fa-spin');
            textoBtn.textContent = 'Generando...';

            const { jsPDF } = window.jspdf;

            // Crear documento 50x25mm horizontal
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: [50, 25]
            });

            let paginaActual = 0;
            let totalEtiquetas = colaImpresion.reduce((sum, item) => sum + item.cantidad, 0);

            // Iterar cada producto en la cola
            for (const item of colaImpresion) {
                // Generar código de barras una vez por producto (sin texto incluido)
                const canvasBarcode = await moduloEtiquetas.generarCodigoBarras(item.inventory_id);

                // Repetir según cantidad
                for (let i = 0; i < item.cantidad; i++) {
                    // Agregar página si no es la primera
                    if (paginaActual > 0) {
                        doc.addPage([50, 25], 'landscape');
                    }

                    // ===== LAYOUT DE ETIQUETA (50x25mm) =====
                    // Diseño optimizado:
                    // - Código de barras grande con margen superior
                    // - Inventory ID separado, en negrita
                    // - Título (1-2 líneas)
                    // - SKU en negro

                    // 1. CÓDIGO DE BARRAS (con más margen superior)
                    if (canvasBarcode) {
                        doc.addImage(
                            canvasBarcode.toDataURL('image/png'),
                            'PNG',
                            5,      // X: 5mm margen izquierdo
                            2.5,    // Y: 2.5mm desde arriba (más margen)
                            40,     // Ancho: 40mm
                            8       // Alto: 8mm
                        );
                    }

                    // 2. INVENTORY ID (más separado del código, en negrita)
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7);
                    doc.setTextColor(0, 0, 0);
                    doc.text(item.inventory_id || '', 25, 13, { align: 'center' });

                    // 3. TÍTULO (debajo del inventory ID, puede ser 2 líneas)
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(6);
                    doc.setTextColor(0, 0, 0);
                    const tituloTruncado = item.titulo || '';
                    const lineas = doc.splitTextToSize(tituloTruncado, 46);
                    const lineasMostrar = lineas.slice(0, 2); // Máximo 2 líneas

                    // Calcular posición Y según cantidad de líneas
                    const yTitulo = 15.5;
                    doc.text(lineasMostrar, 25, yTitulo, { align: 'center' });

                    // 4. SKU (pegado debajo del título, en NEGRO)
                    const ySku = lineasMostrar.length > 1 ? 21.5 : 19;
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7);
                    doc.setTextColor(0, 0, 0); // Negro
                    doc.text(`SKU: ${item.sku}`, 25, ySku, { align: 'center' });

                    paginaActual++;
                }
            }

            // Abrir previsualización en nueva pestaña (en lugar de descargar)
            const pdfBlob = doc.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');

            mostrarNotificacion(`PDF generado con ${totalEtiquetas} etiquetas - Previsualización abierta`, 'success');

        } catch (error) {
            console.error('Error generando PDF:', error);
            mostrarNotificacion('Error al generar PDF: ' + error.message, 'error');
        } finally {
            // UI: restaurar botón
            btnGenerar.disabled = false;
            iconGenerar.classList.remove('fa-spinner', 'fa-spin');
            iconGenerar.classList.add('fa-file-pdf');
            const total = colaImpresion.reduce((sum, item) => sum + item.cantidad, 0);
            textoBtn.textContent = `Generar PDF (${total})`;
        }
    },

    // ============================================
    // GENERAR CÓDIGO DE BARRAS: Code 128 con bwip-js
    // ============================================
    generarCodigoBarras: (inventoryId) => {
        return new Promise((resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');

                // Configuración para Code 128
                // SIN texto incluido - lo dibujamos aparte para mejor control
                bwipjs.toCanvas(canvas, {
                    bcid: 'code128',           // Tipo: Code 128
                    text: inventoryId,          // Texto a codificar
                    scale: 4,                   // Escala alta para nitidez
                    height: 10,                 // Altura del código
                    includetext: false          // NO incluir texto (lo ponemos aparte)
                });

                resolve(canvas);
            } catch (error) {
                console.error('Error generando código de barras:', error);
                reject(error);
            }
        });
    }
};

// Exponer en window para el HTML
window.moduloEtiquetas = moduloEtiquetas;
