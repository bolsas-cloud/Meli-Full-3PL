// ============================================
// MÓDULO: API de Mercado Libre
// ============================================
// Maneja llamadas a la API de ML y datos almacenados en Supabase

import { supabase, MELI_CONFIG } from '../config.js';
import { moduloAuth } from './auth.js';
import { mostrarNotificacion } from '../utils.js';

export const apiMeli = {

    // ============================================
    // OBTENER: Todos los productos con Full
    // ============================================
    obtenerProductosFull: async () => {
        try {
            const { data, error } = await supabase
                .from('publicaciones_meli')
                .select('*')
                .eq('tipo_logistica', 'fulfillment')
                .order('ventas_90d', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error obteniendo productos Full:', error);
            return [];
        }
    },

    // ============================================
    // OBTENER: Stock de Full por ID de publicación (preferido) o SKU
    // ============================================
    obtenerStockFull: async (idPublicacion, sku = null) => {
        try {
            let query = supabase
                .from('publicaciones_meli')
                .select('id_publicacion, sku, stock_full, stock_reservado, stock_transito, id_inventario');

            // Buscar por id_publicacion (MLA...) si está disponible
            if (idPublicacion) {
                query = query.eq('id_publicacion', idPublicacion).single();
            } else if (sku) {
                // Fallback: buscar por SKU (puede haber múltiples, devuelve el primero)
                query = query.eq('sku', sku).limit(1).single();
            } else {
                return null;
            }

            const { data, error } = await query;
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error obteniendo stock Full:', error);
            return null;
        }
    },

    // ============================================
    // OBTENER: Ventas históricas por producto
    // ============================================
    obtenerVentasHistoricas: async (diasAtras = 90) => {
        try {
            const fechaDesde = new Date();
            fechaDesde.setDate(fechaDesde.getDate() - diasAtras);

            const { data, error } = await supabase
                .from('ordenes_meli')
                .select('sku, cantidad, fecha_orden')
                .gte('fecha_orden', fechaDesde.toISOString())
                .order('fecha_orden', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error obteniendo ventas:', error);
            return [];
        }
    },

    // ============================================
    // CALCULAR: Ventas diarias promedio por SKU
    // ============================================
    calcularVentasDiarias: async (diasEvaluacion = 30) => {
        const ventas = await apiMeli.obtenerVentasHistoricas(diasEvaluacion);

        // Agrupar por SKU
        const ventasPorSku = {};
        ventas.forEach(v => {
            if (!ventasPorSku[v.sku]) {
                ventasPorSku[v.sku] = { total: 0, dias: new Set() };
            }
            ventasPorSku[v.sku].total += v.cantidad;
            ventasPorSku[v.sku].dias.add(v.fecha_orden.split('T')[0]);
        });

        // Calcular promedio diario y desviación
        const resultado = {};
        Object.keys(ventasPorSku).forEach(sku => {
            const datos = ventasPorSku[sku];
            const ventasPorDia = [];

            // Calcular ventas por día
            datos.dias.forEach(dia => {
                const ventasDelDia = ventas
                    .filter(v => v.sku === sku && v.fecha_orden.startsWith(dia))
                    .reduce((sum, v) => sum + v.cantidad, 0);
                ventasPorDia.push(ventasDelDia);
            });

            const promedio = ventasPorDia.length > 0
                ? ventasPorDia.reduce((a, b) => a + b, 0) / diasEvaluacion
                : 0;

            // Calcular desviación estándar
            let desviacion = 0;
            if (ventasPorDia.length > 1) {
                const varianza = ventasPorDia.reduce((sum, v) =>
                    sum + Math.pow(v - promedio, 2), 0) / (ventasPorDia.length - 1);
                desviacion = Math.sqrt(varianza);
            }

            resultado[sku] = {
                ventasDiarias: promedio,
                desviacion: desviacion,
                totalVentas: datos.total
            };
        });

        return resultado;
    },

    // ============================================
    // OBTENER: Configuración de logística
    // ============================================
    obtenerConfigLogistica: async () => {
        try {
            const { data, error } = await supabase
                .from('config_logistica')
                .select('*');

            if (error) throw error;

            // Convertir array a objeto
            const config = {};
            (data || []).forEach(row => {
                config[row.parametro] = parseFloat(row.valor) || row.valor;
            });

            return {
                tiempoTransito: config.tiempoTransito || 3,
                frecuenciaEnvio: config.frecuenciaEnvio || 7,
                nivelServicio: config.nivelServicio || 1.65,
                incrementoEvento: config.incrementoEvento || 0
            };
        } catch (error) {
            console.error('Error obteniendo config:', error);
            return {
                tiempoTransito: 3,
                frecuenciaEnvio: 7,
                nivelServicio: 1.65,
                incrementoEvento: 0
            };
        }
    },

    // ============================================
    // GUARDAR: Configuración de logística
    // ============================================
    guardarConfigLogistica: async (config) => {
        try {
            const parametros = [
                { parametro: 'tiempoTransito', valor: String(config.tiempoTransito) },
                { parametro: 'frecuenciaEnvio', valor: String(config.frecuenciaEnvio) },
                { parametro: 'nivelServicio', valor: String(config.nivelServicio) },
                { parametro: 'incrementoEvento', valor: String(config.incrementoEvento) }
            ];

            for (const param of parametros) {
                const { error } = await supabase
                    .from('config_logistica')
                    .upsert(param, { onConflict: 'parametro' });

                if (error) throw error;
            }

            mostrarNotificacion('Configuración guardada', 'success');
            return true;
        } catch (error) {
            console.error('Error guardando config:', error);
            mostrarNotificacion('Error guardando configuración', 'error');
            return false;
        }
    },

    // ============================================
    // REGISTRAR: Envío a Full
    // ============================================
    registrarEnvioFull: async (productos) => {
        try {
            const idEnvio = `ENV-${Date.now()}`;

            // Crear registro principal
            const { error: errorRegistro } = await supabase
                .from('registro_envios_full')
                .insert({
                    id_envio: idEnvio,
                    estado: 'Pendiente',
                    fecha_creacion: new Date().toISOString(),
                    notas: `${productos.length} productos`
                });

            if (errorRegistro) throw errorRegistro;

            // Crear detalles (incluye id_publicacion como clave única)
            const detalles = productos.map(p => ({
                id_envio: idEnvio,
                id_publicacion: p.id_publicacion || null,
                sku: p.sku,
                cantidad_enviada: p.cantidad
            }));

            const { error: errorDetalles } = await supabase
                .from('detalle_envios_full')
                .insert(detalles);

            if (errorDetalles) throw errorDetalles;

            mostrarNotificacion(`Envío ${idEnvio} registrado`, 'success');
            return idEnvio;
        } catch (error) {
            console.error('Error registrando envío:', error);
            mostrarNotificacion('Error registrando envío', 'error');
            return null;
        }
    },

    // ============================================
    // OBTENER: Historial de envíos
    // ============================================
    obtenerHistorialEnvios: async (limite = 20) => {
        try {
            const { data, error } = await supabase
                .from('registro_envios_full')
                .select('*, detalle_envios_full(*)')
                .order('fecha_creacion', { ascending: false })
                .limit(limite);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error obteniendo historial:', error);
            return [];
        }
    },

    // ============================================
    // SINCRONIZAR: Datos desde API de ML (via Edge Function)
    // ============================================
    sincronizarDesdeML: async () => {
        try {
            mostrarNotificacion('Sincronizando con Mercado Libre...', 'info');

            // Verificar autenticación
            const conectado = await moduloAuth.verificarSesion();
            if (!conectado) {
                mostrarNotificacion('Primero debes conectar con ML', 'error');
                return false;
            }

            // Llamar Edge Function de Supabase (si existe)
            const { data, error } = await supabase.functions.invoke('sync-meli', {
                body: { action: 'sync-products' }
            });

            if (error) {
                // Si no hay Edge Function, mostrar mensaje
                console.warn('Edge Function no disponible:', error);
                mostrarNotificacion('Usa el script de migración para sincronizar datos', 'info');
                return false;
            }

            mostrarNotificacion('Sincronización completada', 'success');
            return true;
        } catch (error) {
            console.error('Error sincronizando:', error);
            mostrarNotificacion('Error de sincronización', 'error');
            return false;
        }
    },

    // ============================================
    // OBTENER: IDs de órdenes existentes en Supabase
    // Se usa para identificar qué órdenes son nuevas al sincronizar
    // ============================================
    obtenerIdsOrdenesExistentes: async () => {
        try {
            const { data, error } = await supabase
                .from('ordenes_meli')
                .select('id_orden');

            if (error) throw error;

            // Retornar Set para búsqueda O(1)
            const idsSet = new Set();
            (data || []).forEach(row => idsSet.add(String(row.id_orden)));

            console.log(`Órdenes existentes en DB: ${idsSet.size}`);
            return idsSet;
        } catch (error) {
            console.error('Error obteniendo IDs de órdenes:', error);
            return new Set();
        }
    },

    // ============================================
    // SINCRONIZAR: Órdenes desde API de ML
    // Identifica y guarda solo las nuevas
    // ============================================
    sincronizarOrdenes: async (diasAtras = 30) => {
        try {
            mostrarNotificacion('Sincronizando órdenes...', 'info');

            // 1. Obtener IDs existentes para comparar
            const ordenesExistentes = await apiMeli.obtenerIdsOrdenesExistentes();
            console.log(`IDs existentes antes de sync: ${ordenesExistentes.size}`);

            // 2. Verificar autenticación
            const conectado = await moduloAuth.verificarSesion();
            if (!conectado) {
                mostrarNotificacion('Primero debes conectar con ML', 'error');
                return { nuevas: 0, existentes: ordenesExistentes.size };
            }

            // 3. Llamar Edge Function para traer órdenes
            const fechaDesde = new Date();
            fechaDesde.setDate(fechaDesde.getDate() - diasAtras);

            const { data, error } = await supabase.functions.invoke('sync-meli', {
                body: {
                    action: 'sync-orders',
                    fechaDesde: fechaDesde.toISOString(),
                    ordenesExistentes: Array.from(ordenesExistentes)
                }
            });

            if (error) {
                console.warn('Edge Function no disponible:', error);
                mostrarNotificacion('Usa GAS/Migración para traer órdenes nuevas', 'info');
                return { nuevas: 0, existentes: ordenesExistentes.size };
            }

            // 4. Reportar resultado
            const nuevas = data?.nuevas || 0;
            const total = data?.total || 0;

            if (nuevas > 0) {
                mostrarNotificacion(`${nuevas} órdenes nuevas sincronizadas`, 'success');
            } else {
                mostrarNotificacion('No hay órdenes nuevas', 'info');
            }

            return { nuevas, existentes: ordenesExistentes.size, total };
        } catch (error) {
            console.error('Error sincronizando órdenes:', error);
            mostrarNotificacion('Error al sincronizar órdenes', 'error');
            return { nuevas: 0, existentes: 0 };
        }
    },

    // ============================================
    // INSERTAR: Órdenes nuevas (para uso desde migración)
    // Filtra las que ya existen antes de insertar
    // ============================================
    insertarOrdenesNuevas: async (ordenes) => {
        if (!ordenes || ordenes.length === 0) {
            return { insertadas: 0, duplicadas: 0 };
        }

        try {
            // Obtener IDs existentes
            const existentes = await apiMeli.obtenerIdsOrdenesExistentes();

            // Filtrar solo las nuevas
            const nuevas = ordenes.filter(o => !existentes.has(String(o.id_orden)));
            const duplicadas = ordenes.length - nuevas.length;

            if (nuevas.length === 0) {
                console.log('No hay órdenes nuevas para insertar');
                return { insertadas: 0, duplicadas };
            }

            // Insertar en lotes de 100
            const BATCH_SIZE = 100;
            let insertadas = 0;

            for (let i = 0; i < nuevas.length; i += BATCH_SIZE) {
                const lote = nuevas.slice(i, i + BATCH_SIZE);
                const { error } = await supabase
                    .from('ordenes_meli')
                    .insert(lote);

                if (error) {
                    console.error('Error insertando lote:', error);
                } else {
                    insertadas += lote.length;
                }
            }

            console.log(`Órdenes insertadas: ${insertadas}, duplicadas omitidas: ${duplicadas}`);
            return { insertadas, duplicadas };
        } catch (error) {
            console.error('Error insertando órdenes:', error);
            return { insertadas: 0, duplicadas: 0 };
        }
    }
};

// Exponer en window
window.apiMeli = apiMeli;
