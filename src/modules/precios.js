// ============================================
// MÓDULO: Gestión de Precios
// ============================================
// Permite visualizar, modificar y actualizar
// precios de publicaciones en Mercado Libre
// ============================================

import { supabase } from '../config.js';
import { mostrarNotificacion, formatearMoneda, confirmarAccion } from '../utils.js';

// Estado local del módulo
let productos = [];
let productosOriginales = [];
let seleccionados = new Set();
let filtros = {
    busqueda: '',
    estado: 'todos'
};
let pctComisionPromedio = 30; // Default 30%, se actualiza con datos reales

export const moduloPrecios = {

    // ============================================
    // RENDER: Dibuja la interfaz
    // ============================================
    render: async (contenedor) => {
        contenedor.innerHTML = `
            <div class="max-w-7xl mx-auto space-y-6">

                <!-- Panel de Acciones -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div class="flex flex-wrap items-center justify-between gap-4">

                        <!-- Búsqueda y Filtros -->
                        <div class="flex flex-wrap items-center gap-4">
                            <div class="relative">
                                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                                <input type="text" id="buscar-producto" placeholder="Buscar por SKU o título..."
                                       class="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent w-64">
                            </div>

                            <div class="flex gap-2">
                                <button class="btn-filtro-estado active px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-estado="todos">
                                    Todos
                                </button>
                                <button class="btn-filtro-estado px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-estado="active">
                                    <span class="w-2 h-2 rounded-full bg-green-500 inline-block mr-1"></span>
                                    Activas
                                </button>
                                <button class="btn-filtro-estado px-3 py-2 rounded-lg text-sm font-medium transition-colors" data-estado="paused">
                                    <span class="w-2 h-2 rounded-full bg-yellow-500 inline-block mr-1"></span>
                                    Pausadas
                                </button>
                            </div>
                        </div>

                        <!-- Info de selección -->
                        <div id="info-seleccion" class="text-sm text-gray-500">
                            <span id="contador-seleccion">0</span> productos seleccionados
                        </div>
                    </div>

                    <!-- Barra de Modificación -->
                    <div class="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-center gap-4">
                        <span class="text-sm font-medium text-gray-700">Modificar seleccionados:</span>

                        <select id="tipo-modificacion" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                            <option value="porcentaje">Porcentaje (%)</option>
                            <option value="fijo">Monto fijo ($)</option>
                        </select>

                        <input type="number" id="valor-modificacion" placeholder="Valor" step="0.01"
                               class="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm">

                        <button onclick="moduloPrecios.previsualizar()"
                                class="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors flex items-center gap-2">
                            <i class="fas fa-eye"></i>
                            Previsualizar
                        </button>

                        <button onclick="moduloPrecios.resetear()"
                                class="bg-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors flex items-center gap-2">
                            <i class="fas fa-undo"></i>
                            Resetear
                        </button>

                        <button onclick="moduloPrecios.guardarEnML()" id="btn-guardar-ml"
                                class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
                            <i class="fas fa-save"></i>
                            Guardar en ML
                        </button>
                    </div>
                </div>

                <!-- Tabla de Productos -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full">
                            <thead class="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th class="px-4 py-3 text-left w-12">
                                        <input type="checkbox" id="seleccionar-todos"
                                               class="rounded border-gray-300 text-brand focus:ring-brand"
                                               onclick="moduloPrecios.toggleTodos(this.checked)">
                                    </th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">SKU</th>
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Producto</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Precio Actual</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Nuevo Precio</th>
                                    <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Neto Est.</th>
                                    <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">+% ML</th>
                                    <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Estado</th>
                                </tr>
                            </thead>
                            <tbody id="tabla-precios" class="divide-y divide-gray-100">
                                <tr>
                                    <td colspan="8" class="px-4 py-12 text-center text-gray-500">
                                        <i class="fas fa-spinner fa-spin fa-2x mb-2"></i>
                                        <p>Sincronizando precios desde Mercado Libre...</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        `;

        // Agregar estilos para los botones de filtro
        const style = document.createElement('style');
        style.textContent = `
            .btn-filtro-estado { background: #f3f4f6; color: #6b7280; }
            .btn-filtro-estado:hover { background: #e5e7eb; }
            .btn-filtro-estado.active { background: #4eab87; color: white; }
        `;
        document.head.appendChild(style);

        // Configurar eventos
        document.getElementById('buscar-producto').addEventListener('input', (e) => {
            filtros.busqueda = e.target.value.toLowerCase();
            moduloPrecios.pintarTabla();
        });

        document.querySelectorAll('.btn-filtro-estado').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-filtro-estado').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filtros.estado = btn.dataset.estado;
                moduloPrecios.pintarTabla();
            });
        });

        // Exponer en window para eventos onclick
        window.moduloPrecios = moduloPrecios;

        // Cargar datos
        await moduloPrecios.cargarProductos();
    },

    // ============================================
    // CARGAR PRODUCTOS: Sync desde ML y cargar de Supabase
    // ============================================
    cargarProductos: async () => {
        try {
            // Primero sincronizamos precios desde ML
            mostrarNotificacion('Sincronizando precios desde ML...', 'info');

            const { data: syncResult, error: syncError } = await supabase.functions.invoke('sync-meli', {
                body: { action: 'sync-prices' }
            });

            if (syncError) {
                console.warn('Error sincronizando precios:', syncError);
                // Continuamos aunque falle el sync
            } else if (syncResult?.updated) {
                console.log(`Sincronizados ${syncResult.updated} precios`);
            }

            // Obtener % promedio de comisión de las últimas órdenes
            const { data: ordenesData } = await supabase
                .from('ordenes_meli')
                .select('pct_costo_meli')
                .not('pct_costo_meli', 'is', null)
                .order('fecha_pago', { ascending: false })
                .limit(100);

            if (ordenesData && ordenesData.length > 0) {
                const suma = ordenesData.reduce((acc, o) => acc + (parseFloat(o.pct_costo_meli) || 0), 0);
                pctComisionPromedio = suma / ordenesData.length;
                console.log(`% Comisión promedio calculado: ${pctComisionPromedio.toFixed(2)}% (de ${ordenesData.length} órdenes)`);
            }

            // Cargar productos desde Supabase
            const { data, error } = await supabase
                .from('publicaciones_meli')
                .select('sku, id_publicacion, titulo, precio, comision_ml, cargo_fijo_ml, costo_envio_ml, impuestos_estimados, neto_estimado, estado, tipo_logistica')
                .order('titulo');

            if (error) throw error;

            productos = data || [];
            productosOriginales = JSON.parse(JSON.stringify(productos)); // Copia profunda para resetear
            seleccionados.clear();

            moduloPrecios.pintarTabla();
            mostrarNotificacion(`${productos.length} productos cargados`, 'success');

        } catch (error) {
            console.error('Error cargando productos:', error);
            mostrarNotificacion('Error al cargar productos', 'error');

            document.getElementById('tabla-precios').innerHTML = `
                <tr>
                    <td colspan="8" class="px-4 py-12 text-center text-red-500">
                        <i class="fas fa-exclamation-circle fa-2x mb-2"></i>
                        <p>Error al cargar productos. Intenta de nuevo.</p>
                    </td>
                </tr>
            `;
        }
    },

    // ============================================
    // PINTAR TABLA: Renderiza los productos filtrados
    // ============================================
    pintarTabla: () => {
        const tbody = document.getElementById('tabla-precios');

        // Aplicar filtros
        let productosFiltrados = productos.filter(p => {
            const matchBusqueda = !filtros.busqueda ||
                (p.sku || '').toLowerCase().includes(filtros.busqueda) ||
                (p.titulo || '').toLowerCase().includes(filtros.busqueda);

            const matchEstado = filtros.estado === 'todos' || p.estado === filtros.estado;

            return matchBusqueda && matchEstado;
        });

        if (productosFiltrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-4 py-12 text-center text-gray-500">
                        <i class="fas fa-inbox fa-2x mb-2"></i>
                        <p>No se encontraron productos</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = productosFiltrados.map(p => {
            const isSelected = seleccionados.has(p.sku);
            const precioOriginal = productosOriginales.find(o => o.sku === p.sku)?.precio || p.precio;
            const precioModificado = p.precioNuevo !== undefined;
            const diferencia = precioModificado ? ((p.precioNuevo - precioOriginal) / precioOriginal * 100).toFixed(1) : null;

            const estadoColor = p.estado === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
            const estadoTexto = p.estado === 'active' ? 'Activa' : 'Pausada';

            // Calcular neto estimado
            // Prioridad 1: usar campos de comisión de la BD (poblados por sync-prices)
            // Prioridad 2: usar % promedio de órdenes como fallback
            const precioParaNeto = precioModificado ? p.precioNuevo : precioOriginal;
            const comision = parseFloat(p.comision_ml) || 0;
            const cargoFijo = parseFloat(p.cargo_fijo_ml) || 0;
            const impuestos = parseFloat(p.impuestos_estimados) || 0;

            let netoEstimado;
            if (comision > 0 || cargoFijo > 0) {
                // Usar comisiones reales de ML
                netoEstimado = precioParaNeto - comision - cargoFijo - impuestos;
            } else {
                // Fallback: usar % promedio de órdenes
                netoEstimado = precioParaNeto * (1 - pctComisionPromedio / 100);
            }

            // Calcular % markup sobre neto (cuánto hay que cargarle al neto para llegar al precio)
            const pctMarkup = netoEstimado > 0 ? ((precioParaNeto - netoEstimado) / netoEstimado * 100).toFixed(1) : 0;

            return `
                <tr class="hover:bg-gray-50 transition-colors ${precioModificado ? 'bg-yellow-50' : ''}">
                    <td class="px-4 py-3">
                        <input type="checkbox"
                               class="rounded border-gray-300 text-brand focus:ring-brand"
                               ${isSelected ? 'checked' : ''}
                               onchange="moduloPrecios.toggleSeleccion('${p.sku}', this.checked)">
                    </td>
                    <td class="px-4 py-3 font-mono text-sm text-gray-600">${p.sku || '-'}</td>
                    <td class="px-4 py-3">
                        <div class="max-w-lg truncate text-sm" title="${(p.titulo || '').replace(/"/g, '&quot;')}">${p.titulo || '-'}</div>
                    </td>
                    <td class="px-4 py-3 text-right font-medium ${precioModificado ? 'line-through text-gray-400' : 'text-gray-800'}">
                        ${formatearMoneda(precioOriginal)}
                    </td>
                    <td class="px-4 py-3 text-right">
                        ${precioModificado ? `
                            <span class="font-bold text-green-600">${formatearMoneda(p.precioNuevo)}</span>
                            <span class="text-xs ${diferencia > 0 ? 'text-green-600' : 'text-red-600'} ml-1">
                                (${diferencia > 0 ? '+' : ''}${diferencia}%)
                            </span>
                        ` : '<span class="text-gray-400">-</span>'}
                    </td>
                    <td class="px-4 py-3 text-right text-gray-600">${netoEstimado > 0 ? formatearMoneda(netoEstimado) : '-'}</td>
                    <td class="px-4 py-3 text-center text-xs font-medium text-orange-600">+${pctMarkup}%</td>
                    <td class="px-4 py-3 text-center">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${estadoColor}">${estadoTexto}</span>
                    </td>
                </tr>
            `;
        }).join('');

        // Actualizar contador
        document.getElementById('contador-seleccion').textContent = seleccionados.size;
    },

    // ============================================
    // TOGGLE SELECCIÓN
    // ============================================
    toggleSeleccion: (sku, checked) => {
        if (checked) {
            seleccionados.add(sku);
        } else {
            seleccionados.delete(sku);
        }
        document.getElementById('contador-seleccion').textContent = seleccionados.size;
    },

    toggleTodos: (checked) => {
        const checkboxes = document.querySelectorAll('#tabla-precios input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = checked;
            const sku = cb.getAttribute('onchange').match(/'([^']+)'/)?.[1];
            if (sku) {
                if (checked) {
                    seleccionados.add(sku);
                } else {
                    seleccionados.delete(sku);
                }
            }
        });
        document.getElementById('contador-seleccion').textContent = seleccionados.size;
    },

    // ============================================
    // REDONDEO PSICOLÓGICO AUTOMÁTICO
    // (Lógica exacta de GAS)
    // ============================================
    redondearPrecioPsicologico: (precio) => {
        // 1. Quitar decimales
        let entero = Math.round(precio);

        // 2. Obtener último dígito
        let ultimoDigito = entero % 10;
        let diferencia = 0;

        // 3. Forzar terminación en 3, 5, 7, 9 (siempre hacia arriba)
        if (ultimoDigito <= 3) {
            diferencia = 3 - ultimoDigito;  // 0,1,2,3 → 3
        } else if (ultimoDigito <= 5) {
            diferencia = 5 - ultimoDigito;  // 4,5 → 5
        } else if (ultimoDigito <= 7) {
            diferencia = 7 - ultimoDigito;  // 6,7 → 7
        } else {
            diferencia = 9 - ultimoDigito;  // 8,9 → 9
        }

        return entero + diferencia;
    },

    // ============================================
    // PREVISUALIZAR: Calcula nuevos precios sin guardar
    // ============================================
    previsualizar: () => {
        if (seleccionados.size === 0) {
            mostrarNotificacion('Selecciona al menos un producto', 'warning');
            return;
        }

        const tipo = document.getElementById('tipo-modificacion').value;
        const valor = parseFloat(document.getElementById('valor-modificacion').value);

        if (isNaN(valor) || valor === 0) {
            mostrarNotificacion('Ingresa un valor válido', 'warning');
            return;
        }

        let modificados = 0;

        productos.forEach(p => {
            if (seleccionados.has(p.sku)) {
                const precioBase = productosOriginales.find(o => o.sku === p.sku)?.precio || p.precio;
                let nuevoPrecio;

                if (tipo === 'porcentaje') {
                    nuevoPrecio = precioBase * (1 + valor / 100);
                } else {
                    nuevoPrecio = precioBase + valor;
                }

                // Aplicar redondeo psicológico automático
                p.precioNuevo = moduloPrecios.redondearPrecioPsicologico(nuevoPrecio);
                modificados++;
            }
        });

        moduloPrecios.pintarTabla();
        mostrarNotificacion(`${modificados} precios calculados con redondeo psicológico`, 'success');
    },

    // ============================================
    // RESETEAR: Vuelve a valores originales
    // ============================================
    resetear: () => {
        productos.forEach(p => {
            delete p.precioNuevo;
        });
        seleccionados.clear();
        document.getElementById('seleccionar-todos').checked = false;
        document.getElementById('valor-modificacion').value = '';
        moduloPrecios.pintarTabla();
        mostrarNotificacion('Cambios descartados', 'info');
    },

    // ============================================
    // GUARDAR EN ML: Envía cambios a Mercado Libre
    // ============================================
    guardarEnML: async () => {
        // Obtener productos con precios modificados
        const productosModificados = productos.filter(p => p.precioNuevo !== undefined);

        if (productosModificados.length === 0) {
            mostrarNotificacion('No hay precios modificados para guardar', 'warning');
            return;
        }

        const confirmar = await confirmarAccion(
            'Confirmar Cambio de Precios',
            `Vas a actualizar ${productosModificados.length} precios en Mercado Libre. Esta acción es inmediata y afectará tus publicaciones.`,
            'warning',
            'Sí, Actualizar'
        );

        if (!confirmar) return;

        const btn = document.getElementById('btn-guardar-ml');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        try {
            // Preparar datos para la Edge Function
            const productosParaActualizar = productosModificados.map(p => ({
                itemId: p.id_publicacion,
                sku: p.sku,
                precioAnterior: productosOriginales.find(o => o.sku === p.sku)?.precio || p.precio,
                nuevoPrecio: p.precioNuevo
            }));

            // Llamar Edge Function
            const { data, error } = await supabase.functions.invoke('sync-meli', {
                body: {
                    action: 'update-prices',
                    productos: productosParaActualizar
                }
            });

            if (error) throw error;

            if (data.success) {
                mostrarNotificacion(`${data.exitos} precios actualizados correctamente`, 'success');

                // Actualizar estado local
                productosModificados.forEach(p => {
                    const original = productosOriginales.find(o => o.sku === p.sku);
                    if (original) {
                        original.precio = p.precioNuevo;
                    }
                    p.precio = p.precioNuevo;
                    delete p.precioNuevo;
                });

                seleccionados.clear();
                moduloPrecios.pintarTabla();

            } else if (data.fallidos && data.fallidos.length > 0) {
                // Algunos fallaron
                const exitosos = data.exitos || 0;
                const errores = data.fallidos.map(f => `${f.sku}: ${f.error}`).join('\n');

                mostrarNotificacion(`${exitosos} exitosos, ${data.fallidos.length} con errores`, 'warning');
                console.error('Errores de actualización:', errores);

                // Actualizar solo los exitosos
                if (exitosos > 0) {
                    await moduloPrecios.cargarProductos();
                }
            }

        } catch (error) {
            console.error('Error guardando precios:', error);
            mostrarNotificacion('Error al guardar precios en ML', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Guardar en ML';
        }
    }
};

// Exponer en window para el HTML
window.moduloPrecios = moduloPrecios;
