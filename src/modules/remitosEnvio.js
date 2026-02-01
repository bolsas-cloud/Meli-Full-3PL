// ============================================
// MÓDULO: Remitos para Envíos 3PL
// ============================================
// Genera remitos oficiales para envíos a depósitos externos,
// insertándolos en la tabla de remitos de VentasApp-Cosiditas
// para mantener numeración correlativa unificada.
// ============================================

import { supabase, supabaseVentas, supabaseProduccion, supabaseRRHH } from '../config.js';
import { mostrarNotificacion, generarId } from '../utils.js';

// Cache de transportes y productos empaque
let transportesCache = [];
let productosEmpaqueCache = [];

/**
 * Carga la lista de transportes desde VentasApp
 * @returns {Promise<Array>}
 */
export async function cargarTransportes() {
    if (transportesCache.length > 0) {
        return transportesCache;
    }

    try {
        const { data, error } = await supabaseVentas
            .from('transportes')
            .select('id, nombre, direccion, telefono')
            .eq('activo', true)
            .order('nombre');

        if (error) throw error;
        transportesCache = data || [];
        return transportesCache;
    } catch (err) {
        console.error('Error cargando transportes:', err);
        mostrarNotificacion('Error al cargar transportes', 'error');
        return [];
    }
}

/**
 * Carga productos tipo EMPAQUE desde ProduccionTextilApp
 * @returns {Promise<Array>}
 */
export async function cargarProductosEmpaque() {
    if (productosEmpaqueCache.length > 0) {
        return productosEmpaqueCache;
    }

    try {
        const { data, error } = await supabaseProduccion
            .from('productos')
            .select('id_producto, sku, nombre_producto')
            .eq('tipo', 'EMPAQUE')
            .eq('activo', true)
            .order('nombre_producto');

        if (error) throw error;
        productosEmpaqueCache = data || [];
        return productosEmpaqueCache;
    } catch (err) {
        console.error('Error cargando productos empaque:', err);
        return [];
    }
}

/**
 * Genera un remito 3PL completo:
 * 1. Crea/actualiza preparación en RRHH (con consumibles)
 * 2. Crea remito en VentasApp
 * 3. Crea bultos en remito_bultos
 *
 * @param {Object} envio - Datos del envío
 * @param {Object} destino - Datos del depósito destino
 * @param {number} transporteId - ID del transporte
 * @param {Array} bultosDetalle - [{medidas, peso_kg, contenido}]
 * @param {number} valorDeclarado - Valor declarado
 * @param {string} notas - Notas adicionales
 * @param {Array} consumibles - [{id_producto, nombre, sku, cantidad}]
 * @returns {Promise<Object>}
 */
export async function generarRemito3PL(envio, destino, transporteId, bultosDetalle, valorDeclarado, notas, consumibles) {
    try {
        const cantidadBultos = bultosDetalle?.length || 1;

        // =====================================================
        // 1. CREAR/ACTUALIZAR PREPARACIÓN EN RRHH (consumibles)
        // =====================================================
        const preparacionData = {
            tipo: 'ENVIO_MELI',
            id_origen: envio.id_envio,
            destino_nombre: destino.nombre,
            destino_tipo: destino.tipo || 'externo',
            total_items: envio.productos?.length || 0,
            total_unidades: envio.productos?.reduce((sum, p) => sum + (p.cantidad_enviada || 0), 0) || 0,
            codigo_visible: envio.id_envio,
            estado: 'COMPLETADO',
            fecha_fin: new Date().toISOString(),
            consumibles_utilizados: consumibles || [],
            cantidad_bultos: cantidadBultos
        };

        // Upsert: si ya existe preparación para este envío, actualizar
        const { data: preparacion, error: prepError } = await supabaseRRHH
            .from('preparaciones')
            .upsert(preparacionData, {
                onConflict: 'tipo,id_origen',
                ignoreDuplicates: false
            })
            .select()
            .single();

        if (prepError) {
            console.error('Error creando preparación:', prepError);
            // Continuar aunque falle la preparación
        } else {
            console.log('Preparación creada/actualizada:', preparacion?.id);
        }

        // =====================================================
        // 2. OBTENER NÚMERO DE REMITO
        // =====================================================
        const { data: nextId, error: rpcError } = await supabaseVentas
            .rpc('get_next_remito_id', { p_sucursal: '0001' });

        if (rpcError) {
            throw new Error(`Error obteniendo número de remito: ${rpcError.message}`);
        }

        console.log('Número de remito obtenido:', nextId);

        // =====================================================
        // 3. CREAR REMITO EN VENTAS
        // =====================================================
        const remitoData = {
            id_remito_original: nextId,
            tipo_remito: 'ENVIO_3PL',
            id_envio_3pl: envio.id_envio,
            id_destino_3pl: destino.id_destino,
            nombre_destino_3pl: destino.nombre,
            id_transporte: transporteId,
            tipo_envio: 'A Domicilio',
            bultos: cantidadBultos,
            valor_declarado: valorDeclarado || 0,
            notas: notas || `Envío a ${destino.nombre}`,
            fecha_emision: new Date().toISOString(),
            estado: 'Despachado'
        };

        const { data: remito, error: insertError } = await supabaseVentas
            .from('remitos')
            .insert(remitoData)
            .select()
            .single();

        if (insertError) {
            throw new Error(`Error creando remito: ${insertError.message}`);
        }

        console.log('Remito creado:', remito.id);

        // =====================================================
        // 4. CREAR DETALLES DEL REMITO (productos)
        // =====================================================
        const detalles = envio.productos.map(p => ({
            id_remito: remito.id,
            sku: p.sku,
            descripcion: p.titulo || p.sku,
            cantidad_enviada: p.cantidad_enviada || 0
        }));

        const { error: detallesError } = await supabaseVentas
            .from('remito_detalles')
            .insert(detalles);

        if (detallesError) {
            console.error('Error insertando detalles:', detallesError);
        }

        // =====================================================
        // 5. CREAR BULTOS EN remito_bultos
        // =====================================================
        if (bultosDetalle && bultosDetalle.length > 0) {
            const bultosData = bultosDetalle.map((b, idx) => ({
                id_remito: remito.id,
                numero: idx + 1,
                medidas: b.medidas || null,
                peso_kg: b.peso_kg || null,
                contenido: b.contenido || null
            }));

            const { error: bultosError } = await supabaseVentas
                .from('remito_bultos')
                .insert(bultosData);

            if (bultosError) {
                console.error('Error insertando bultos:', bultosError);
            } else {
                console.log(`${bultosData.length} bultos insertados`);
            }
        }

        // =====================================================
        // 6. ACTUALIZAR ENVÍO CON REFERENCIA AL REMITO
        // =====================================================
        const { error: updateError } = await supabase
            .from('registro_envios')
            .update({
                link_remito: remito.id,
                notas: `${envio.notas || ''}\nRemito: ${nextId}`.trim()
            })
            .eq('id_envio', envio.id_envio);

        if (updateError) {
            console.error('Error actualizando envío:', updateError);
        }

        return {
            id: remito.id,
            numero: nextId,
            preparacion_id: preparacion?.id,
            ...remitoData
        };

    } catch (err) {
        console.error('Error generando remito 3PL:', err);
        throw err;
    }
}

/**
 * Abre el modal para generar remito de un envío 3PL
 * @param {string} idEnvio - ID del envío
 */
export async function abrirModalRemito(idEnvio) {
    // Buscar el envío en el cache o cargar desde BD
    const { data: envio, error } = await supabase
        .from('registro_envios')
        .select('*, destinos_envio(*)')
        .eq('id_envio', idEnvio)
        .single();

    if (error || !envio) {
        mostrarNotificacion('Error al cargar envío', 'error');
        return;
    }

    // Cargar detalles del envío
    const { data: detalles } = await supabase
        .from('detalle_envios')
        .select('sku, cantidad_enviada')
        .eq('id_envio', idEnvio);

    // Obtener títulos de publicaciones
    const skus = (detalles || []).map(d => d.sku);
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

    envio.productos = (detalles || []).map(d => ({
        ...d,
        titulo: titulosMap[d.sku] || d.sku
    }));

    const destino = envio.destinos_envio || { nombre: envio.id_destino, id_destino: envio.id_destino };

    // Verificar si ya tiene remito
    if (envio.link_remito) {
        mostrarNotificacion('Este envío ya tiene un remito generado', 'warning');
        return;
    }

    // Cargar transportes y productos empaque en paralelo
    const [transportes, productosEmpaque] = await Promise.all([
        cargarTransportes(),
        cargarProductosEmpaque()
    ]);

    // Calcular total de unidades
    const totalUnidades = envio.productos.reduce((sum, p) => sum + (p.cantidad_enviada || 0), 0);

    // Crear modal
    const modalHtml = `
        <div id="modal-remito-3pl" class="fixed inset-0 z-50" aria-modal="true">
            <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onclick="moduloRemitosEnvio.cerrarModal()"></div>
            <div class="fixed inset-0 z-10 overflow-y-auto p-4 flex items-center justify-center">
                <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
                    <div class="bg-green-600 text-white px-6 py-4 flex items-center justify-between">
                        <h3 class="font-bold text-lg">
                            <i class="fas fa-file-invoice mr-2"></i>
                            Generar Remito
                        </h3>
                        <button onclick="moduloRemitosEnvio.cerrarModal()" class="text-white/80 hover:text-white">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>

                    <div class="p-6 space-y-4">
                        <!-- Info del envío -->
                        <div class="bg-gray-50 rounded-lg p-4">
                            <div class="flex justify-between items-start">
                                <div>
                                    <p class="text-sm text-gray-500">Envío</p>
                                    <p class="font-bold text-gray-800">${idEnvio}</p>
                                </div>
                                <div class="text-right">
                                    <p class="text-sm text-gray-500">Destino</p>
                                    <p class="font-bold text-blue-600">${destino.nombre}</p>
                                </div>
                            </div>
                            <div class="mt-2 text-sm text-gray-600">
                                ${envio.productos.length} productos • ${totalUnidades} unidades
                            </div>
                        </div>

                        <!-- Transporte -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Transporte <span class="text-red-500">*</span>
                            </label>
                            <select id="remito-transporte" class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent">
                                <option value="">Seleccionar transporte...</option>
                                ${transportes.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('')}
                            </select>
                        </div>

                        <!-- Bultos -->
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <label class="block text-sm font-medium text-gray-700">
                                    <i class="fas fa-boxes text-gray-400 mr-1"></i>
                                    Bultos <span class="text-red-500">*</span>
                                </label>
                                <button type="button" onclick="moduloRemitosEnvio.agregarBulto()"
                                        class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200 transition-colors">
                                    <i class="fas fa-plus mr-1"></i> Agregar
                                </button>
                            </div>
                            <div id="bultos-container" class="space-y-2">
                                <!-- Bulto inicial -->
                                <div id="bulto-1" class="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
                                    <span class="text-xs text-gray-500 w-6">#1</span>
                                    <input type="text" class="bulto-medidas flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                                           placeholder="Medidas (ej: 40x30x20)">
                                    <input type="number" class="bulto-peso w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center"
                                           placeholder="Peso kg" min="0" step="0.1">
                                </div>
                            </div>
                        </div>

                        <!-- Valor declarado -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Valor Declarado ($)
                            </label>
                            <input type="number" id="remito-valor" value="0" min="0" step="100"
                                   class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent">
                        </div>

                        <!-- Consumibles (Empaque) -->
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <label class="block text-sm font-medium text-gray-700">
                                    <i class="fas fa-box text-gray-400 mr-1"></i>
                                    Consumibles (Empaque)
                                </label>
                                <button type="button" onclick="moduloRemitosEnvio.agregarConsumible()"
                                        class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200 transition-colors">
                                    <i class="fas fa-plus mr-1"></i> Agregar
                                </button>
                            </div>
                            <div id="consumibles-container" class="space-y-2">
                                <!-- Consumibles dinámicos se agregan aquí -->
                            </div>
                            ${productosEmpaque.length === 0 ? '<p class="text-xs text-gray-400 italic">No hay productos de empaque cargados</p>' : ''}
                        </div>

                        <!-- Notas -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Notas (opcional)
                            </label>
                            <textarea id="remito-notas" rows="2"
                                      class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                      placeholder="Notas adicionales..."></textarea>
                        </div>
                    </div>

                    <div class="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                        <button onclick="moduloRemitosEnvio.cerrarModal()"
                                class="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors">
                            Cancelar
                        </button>
                        <button onclick="moduloRemitosEnvio.confirmarGenerarRemito('${idEnvio}')"
                                id="btn-confirmar-remito"
                                class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2">
                            <i class="fas fa-check"></i>
                            Generar Remito
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Insertar modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Guardar referencia al envío para usar en confirmar
    window._envioParaRemito = envio;
    window._destinoParaRemito = destino;
}

/**
 * Confirma y genera el remito
 * @param {string} idEnvio - ID del envío
 */
export async function confirmarGenerarRemito(idEnvio) {
    const transporteId = document.getElementById('remito-transporte')?.value;
    const valorDeclarado = parseFloat(document.getElementById('remito-valor')?.value) || 0;
    const notas = document.getElementById('remito-notas')?.value || '';

    if (!transporteId) {
        mostrarNotificacion('Selecciona un transporte', 'warning');
        return;
    }

    // Recopilar bultos
    const bultosDetalle = recopilarBultos();
    if (bultosDetalle.length === 0) {
        mostrarNotificacion('Agrega al menos un bulto', 'warning');
        return;
    }

    // Recopilar consumibles
    const consumibles = recopilarConsumibles();

    const btn = document.getElementById('btn-confirmar-remito');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Generando...';

    try {
        const envio = window._envioParaRemito;
        const destino = window._destinoParaRemito;

        const remito = await generarRemito3PL(
            envio,
            destino,
            parseInt(transporteId),
            bultosDetalle,
            valorDeclarado,
            notas,
            consumibles
        );

        mostrarNotificacion(`Remito ${remito.numero} generado correctamente`, 'success');
        cerrarModal();

        // Recargar la lista de envíos si está disponible
        if (window.moduloEnviosCreados?.cargarEnvios) {
            window.moduloEnviosCreados.cargarEnvios();
        }

    } catch (err) {
        mostrarNotificacion(`Error: ${err.message}`, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Generar Remito';
    }
}

/**
 * Cierra el modal de remito
 */
export function cerrarModal() {
    const modal = document.getElementById('modal-remito-3pl');
    if (modal) {
        modal.remove();
    }
    delete window._envioParaRemito;
    delete window._destinoParaRemito;
}

/**
 * Agrega una fila de consumible al formulario
 */
export function agregarConsumible() {
    const container = document.getElementById('consumibles-container');
    if (!container) return;

    const id = `consumible-${Date.now()}`;
    const optionsHtml = productosEmpaqueCache.map(p =>
        `<option value="${p.id_producto}" data-nombre="${p.nombre_producto}" data-sku="${p.sku}">${p.nombre_producto} (${p.sku || 'S/SKU'})</option>`
    ).join('');

    const html = `
        <div id="${id}" class="flex gap-2 items-center">
            <select class="consumible-producto flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent">
                <option value="">Seleccionar...</option>
                ${optionsHtml}
            </select>
            <input type="number" class="consumible-cantidad w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-green-500"
                   placeholder="Cant." min="1" value="1">
            <button type="button" onclick="document.getElementById('${id}').remove()"
                    class="text-red-500 hover:text-red-700 p-1">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);
}

/**
 * Recopila los consumibles seleccionados del formulario
 * @returns {Array} Lista de consumibles [{id_producto, nombre, sku, cantidad}]
 */
function recopilarConsumibles() {
    const container = document.getElementById('consumibles-container');
    if (!container) return [];

    const consumibles = [];
    const rows = container.querySelectorAll('[id^="consumible-"]');

    rows.forEach(row => {
        const select = row.querySelector('.consumible-producto');
        const cantidadInput = row.querySelector('.consumible-cantidad');

        if (select?.value && cantidadInput?.value) {
            const cantidad = parseInt(cantidadInput.value) || 0;
            if (cantidad > 0) {
                const option = select.options[select.selectedIndex];
                consumibles.push({
                    id_producto: select.value,
                    nombre: option?.dataset?.nombre || '',
                    sku: option?.dataset?.sku || '',
                    cantidad
                });
            }
        }
    });

    return consumibles;
}

/**
 * Agrega una fila de bulto al formulario
 */
export function agregarBulto() {
    const container = document.getElementById('bultos-container');
    if (!container) return;

    const numBultos = container.querySelectorAll('[id^="bulto-"]').length;
    const nuevoNum = numBultos + 1;
    const id = `bulto-${nuevoNum}`;

    const html = `
        <div id="${id}" class="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
            <span class="text-xs text-gray-500 w-6">#${nuevoNum}</span>
            <input type="text" class="bulto-medidas flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                   placeholder="Medidas (ej: 40x30x20)">
            <input type="number" class="bulto-peso w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center"
                   placeholder="Peso kg" min="0" step="0.1">
            <button type="button" onclick="moduloRemitosEnvio.eliminarBulto('${id}')"
                    class="text-red-500 hover:text-red-700 p-1">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);
}

/**
 * Elimina un bulto y renumera los restantes
 */
export function eliminarBulto(idBulto) {
    const container = document.getElementById('bultos-container');
    const bulto = document.getElementById(idBulto);
    if (!bulto || !container) return;

    // No permitir eliminar si es el único
    if (container.querySelectorAll('[id^="bulto-"]').length <= 1) {
        mostrarNotificacion('Debe haber al menos un bulto', 'warning');
        return;
    }

    bulto.remove();

    // Renumerar bultos
    const bultos = container.querySelectorAll('[id^="bulto-"]');
    bultos.forEach((b, idx) => {
        const numSpan = b.querySelector('span');
        if (numSpan) numSpan.textContent = `#${idx + 1}`;
    });
}

/**
 * Recopila los bultos del formulario
 * @returns {Array} Lista de bultos [{medidas, peso_kg, contenido}]
 */
function recopilarBultos() {
    const container = document.getElementById('bultos-container');
    if (!container) return [];

    const bultos = [];
    const rows = container.querySelectorAll('[id^="bulto-"]');

    rows.forEach(row => {
        const medidas = row.querySelector('.bulto-medidas')?.value?.trim() || '';
        const peso = parseFloat(row.querySelector('.bulto-peso')?.value) || 0;

        // Agregar bulto aunque esté vacío (al menos debe haber uno)
        bultos.push({
            medidas: medidas || null,
            peso_kg: peso || null,
            contenido: null
        });
    });

    return bultos;
}

// Exportar módulo para uso global
export const moduloRemitosEnvio = {
    cargarTransportes,
    cargarProductosEmpaque,
    generarRemito3PL,
    abrirModalRemito,
    confirmarGenerarRemito,
    cerrarModal,
    agregarConsumible,
    agregarBulto,
    eliminarBulto
};

// Exponer en window para onclick en HTML
window.moduloRemitosEnvio = moduloRemitosEnvio;
