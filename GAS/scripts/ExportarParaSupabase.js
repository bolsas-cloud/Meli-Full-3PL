// ============================================================================
// EXPORTADOR DE DATOS PARA SUPABASE
// ============================================================================
// Este script normaliza los datos de las hojas de cálculo y genera archivos
// CSV listos para importar en Supabase via Dashboard > Table Editor > Import
// ============================================================================

/**
 * Agrega menú personalizado al abrir la hoja
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📤 Exportar a Supabase')
    .addItem('🏷️ Exportar Publicaciones (Hoja 1)', 'exportarPublicaciones')
    .addItem('📦 Exportar Órdenes', 'exportarOrdenes')
    .addItem('⚙️ Exportar Config Logística', 'exportarConfigLogistica')
    .addItem('🚚 Exportar Registro Envíos Full', 'exportarEnviosFull')
    .addItem('📋 Exportar Detalle Envíos Full', 'exportarDetalleEnviosFull')
    .addItem('📊 Exportar Costos Publicidad', 'exportarCostosPublicidad')
    .addItem('📦 Exportar Preparación En Curso', 'exportarPreparacionEnCurso')
    .addItem('💰 Exportar Historial Precios', 'exportarHistorialPrecios')
    .addItem('📈 Exportar Sugerencias Envío', 'exportarSugerenciasEnvio')
    .addSeparator()
    .addItem('📁 Exportar TODO a carpeta', 'exportarTodo')
    .addToUi();
}

// ============================================================================
// FUNCIONES DE NORMALIZACIÓN
// ============================================================================

/**
 * Normaliza una fecha al formato ISO (YYYY-MM-DD HH:MM:SS)
 * Supabase espera: 2025-12-20T10:30:00 o 2025-12-20
 */
function normalizarFecha(valor) {
  if (!valor || valor === '' || valor === '(vacío)') return null;

  try {
    let fecha;

    // Si ya es un objeto Date
    if (valor instanceof Date) {
      fecha = valor;
    }
    // Si es string con formato DD/MM/YYYY o similar
    else if (typeof valor === 'string') {
      // Intentar parsear diferentes formatos
      if (valor.includes('/')) {
        const partes = valor.split(/[\s\/]/);
        if (partes.length >= 3) {
          // Formato: DD/MM/YYYY o DD/MM/YYYY HH:MM:SS
          const dia = parseInt(partes[0]);
          const mes = parseInt(partes[1]) - 1;
          const anio = parseInt(partes[2]);

          if (partes.length >= 4 && partes[3].includes(':')) {
            const tiempo = partes[3].split(':');
            fecha = new Date(anio, mes, dia, parseInt(tiempo[0]), parseInt(tiempo[1]), parseInt(tiempo[2] || 0));
          } else {
            fecha = new Date(anio, mes, dia);
          }
        }
      } else {
        // Intentar parse directo
        fecha = new Date(valor);
      }
    } else {
      return null;
    }

    if (isNaN(fecha.getTime())) return null;

    // Formato ISO sin zona horaria
    return fecha.toISOString().replace('Z', '').split('.')[0];

  } catch (e) {
    Logger.log('Error parseando fecha: ' + valor + ' - ' + e.message);
    return null;
  }
}

/**
 * Normaliza un número (quita símbolos de moneda, puntos de miles, etc.)
 * Supabase espera: 12345.67 (punto decimal, sin separador de miles)
 */
function normalizarNumero(valor, decimales = 2) {
  if (valor === null || valor === undefined || valor === '' || valor === '(vacío)') return null;

  try {
    let num;

    if (typeof valor === 'number') {
      num = valor;
    } else if (typeof valor === 'string') {
      // Quitar símbolos de moneda y espacios
      let limpio = valor.replace(/[$€\s]/g, '');

      // Detectar formato argentino (1.234,56) vs americano (1,234.56)
      // Si tiene coma seguida de 2 dígitos al final, es decimal argentino
      if (/,\d{2}$/.test(limpio)) {
        // Formato argentino: quitar puntos de miles, cambiar coma por punto
        limpio = limpio.replace(/\./g, '').replace(',', '.');
      } else if (/,\d{3}/.test(limpio)) {
        // Tiene comas como separador de miles (formato americano)
        limpio = limpio.replace(/,/g, '');
      }

      // Quitar porcentaje si existe
      limpio = limpio.replace('%', '');

      num = parseFloat(limpio);
    } else {
      return null;
    }

    if (isNaN(num)) return null;

    return Math.round(num * Math.pow(10, decimales)) / Math.pow(10, decimales);

  } catch (e) {
    Logger.log('Error parseando número: ' + valor + ' - ' + e.message);
    return null;
  }
}

/**
 * Normaliza un entero
 */
function normalizarEntero(valor) {
  const num = normalizarNumero(valor, 0);
  return num !== null ? Math.round(num) : null;
}

/**
 * Normaliza una fecha solo (YYYY-MM-DD, sin hora)
 * Para tablas como costos_publicidad donde la clave es DATE
 */
function normalizarFechaSolo(valor) {
  if (!valor || valor === '' || valor === '(vacío)') return null;

  try {
    let fecha;

    if (valor instanceof Date) {
      fecha = valor;
    } else if (typeof valor === 'string') {
      // Intentar parsear formato YYYY-MM-DD directamente
      if (/^\d{4}-\d{2}-\d{2}/.test(valor)) {
        return valor.substring(0, 10); // Ya está en formato correcto
      }
      // Formato DD/MM/YYYY
      if (valor.includes('/')) {
        const partes = valor.split(/[\s\/]/);
        if (partes.length >= 3) {
          const dia = parseInt(partes[0]).toString().padStart(2, '0');
          const mes = parseInt(partes[1]).toString().padStart(2, '0');
          const anio = partes[2];
          return `${anio}-${mes}-${dia}`;
        }
      }
      fecha = new Date(valor);
    } else {
      return null;
    }

    if (isNaN(fecha.getTime())) return null;

    // Formato YYYY-MM-DD
    const anio = fecha.getFullYear();
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const dia = fecha.getDate().toString().padStart(2, '0');
    return `${anio}-${mes}-${dia}`;

  } catch (e) {
    Logger.log('Error parseando fecha solo: ' + valor + ' - ' + e.message);
    return null;
  }
}

/**
 * Normaliza un booleano
 */
function normalizarBooleano(valor) {
  if (valor === null || valor === undefined || valor === '') return false;

  if (typeof valor === 'boolean') return valor;

  const str = String(valor).toLowerCase().trim();
  return str === 'sí' || str === 'si' || str === 'yes' || str === 'true' || str === '1';
}

/**
 * Normaliza texto (trim y null si vacío)
 */
function normalizarTexto(valor) {
  if (valor === null || valor === undefined) return null;
  const str = String(valor).trim();
  return str === '' || str === '(vacío)' ? null : str;
}

/**
 * Escapa valores para CSV
 */
function escaparCSV(valor) {
  if (valor === null || valor === undefined) return '';

  let str = String(valor);

  // Si contiene comas, comillas o saltos de línea, envolver en comillas
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }

  return str;
}

// ============================================================================
// EXPORTADORES ESPECÍFICOS
// ============================================================================

/**
 * Exporta la Hoja 1 (Publicaciones) normalizada
 */
function exportarPublicaciones() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Hoja 1');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('No se encontró la hoja "Hoja 1"');
    return;
  }

  ss.toast('Procesando publicaciones...', 'Exportando', -1);

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Mapeo de columnas originales a columnas de Supabase
  const mapeo = {
    'SKU': { nombre: 'sku', tipo: 'texto' },
    'Título': { nombre: 'titulo', tipo: 'texto' },
    'Visitas (90d)': { nombre: 'visitas_90d', tipo: 'entero' },
    'Ventas (90d)': { nombre: 'ventas_90d', tipo: 'entero' },
    'Conversión %': { nombre: 'conversion_pct', tipo: 'numero' },
    'Promo Activa?': { nombre: 'promo_activa', tipo: 'booleano' },
    'ID Publicación': { nombre: 'id_publicacion', tipo: 'texto' },
    'ID Inventario': { nombre: 'id_inventario', tipo: 'texto' },
    'Precio': { nombre: 'precio', tipo: 'numero' },
    'Categoria_ID': { nombre: 'categoria_id', tipo: 'texto' },
    'Tipo_Publicacion': { nombre: 'tipo_publicacion', tipo: 'texto' },
    'Comision_ML': { nombre: 'comision_ml', tipo: 'numero' },
    'Cargo_Fijo_ML': { nombre: 'cargo_fijo_ml', tipo: 'numero' },
    'Costo_Envio_ML': { nombre: 'costo_envio_ml', tipo: 'numero' },
    'Impuestos_Estimados': { nombre: 'impuestos_estimados', tipo: 'numero' },
    'Neto_Estimado': { nombre: 'neto_estimado', tipo: 'numero' },
    'Tipo_Logistica': { nombre: 'tipo_logistica', tipo: 'texto' },
    'Tiene_Envio_Gratis': { nombre: 'tiene_envio_gratis', tipo: 'booleano' },
    'Clasificacion_Full': { nombre: 'clasificacion_full', tipo: 'texto' },
    'Peso_gr': { nombre: 'peso_gr', tipo: 'numero' },
    'Alto_cm': { nombre: 'alto_cm', tipo: 'numero' },
    'Ancho_cm': { nombre: 'ancho_cm', tipo: 'numero' },
    'Largo_cm': { nombre: 'largo_cm', tipo: 'numero' }
  };

  // IMPORTANTE: id_publicacion es la clave primaria (MLA...), NO el SKU
  // El SKU puede repetirse en varias publicaciones
  const resultado = procesarYExportar(data, headers, mapeo, 'publicaciones_meli', 'id_publicacion');

  ss.toast(`Exportado: ${resultado.filas} filas`, 'Completado', 5);
  SpreadsheetApp.getUi().alert(
    '✅ Exportación completada\n\n' +
    `Archivo: ${resultado.archivo}\n` +
    `Filas procesadas: ${resultado.filas}\n` +
    `Filas omitidas (sin ID Publicación): ${resultado.omitidas}\n\n` +
    'El archivo está en tu Google Drive en la carpeta "Exportaciones_Supabase"'
  );
}

/**
 * Exporta las Órdenes normalizadas (con deduplicación por id_orden + id_item)
 */
function exportarOrdenes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Meli_Ordenes_Detalle');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('No se encontró la hoja "Meli_Ordenes_Detalle"');
    return;
  }

  ss.toast('Procesando órdenes...', 'Exportando', -1);

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const mapeo = {
    'ID Orden': { nombre: 'id_orden', tipo: 'texto' },
    'Fecha Creación Orden': { nombre: 'fecha_creacion', tipo: 'fecha' },
    'Fecha de Pago': { nombre: 'fecha_pago', tipo: 'fecha' },
    'Estado Orden': { nombre: 'estado', tipo: 'texto' },
    'ID Item': { nombre: 'id_item', tipo: 'texto' },
    'Titulo Item': { nombre: 'titulo_item', tipo: 'texto' },
    'Cantidad': { nombre: 'cantidad', tipo: 'entero' },
    'Precio Unitario (Lista)': { nombre: 'precio_unitario', tipo: 'numero' },
    'Total Lista': { nombre: 'total_lista', tipo: 'numero' },
    'ID Pago': { nombre: 'id_pago', tipo: 'texto' },
    'Neto Recibido Item (Aprox)': { nombre: 'neto_recibido', tipo: 'numero' },
    'Costo Total Meli (Aprox)': { nombre: 'costo_meli', tipo: 'numero' },
    '% Costo Meli (s/Total Lista)': { nombre: 'pct_costo_meli', tipo: 'numero' },
    'Comprador Nickname': { nombre: 'comprador_nickname', tipo: 'texto' }
  };

  // Usar función especial con deduplicación por clave compuesta
  const resultado = procesarYExportarConDedup(data, headers, mapeo, 'ordenes_meli', ['id_orden', 'id_item']);

  ss.toast(`Exportado: ${resultado.filas} filas`, 'Completado', 5);
  SpreadsheetApp.getUi().alert(
    '✅ Exportación completada\n\n' +
    `Archivo: ${resultado.archivo}\n` +
    `Filas procesadas: ${resultado.filas}\n` +
    `Duplicados eliminados: ${resultado.duplicados}\n\n` +
    'El archivo está en tu Google Drive en la carpeta "Exportaciones_Supabase"'
  );
}

/**
 * Exporta la configuración de logística
 */
function exportarConfigLogistica() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config_Logistica');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('No se encontró la hoja "Config_Logistica"');
    return;
  }

  ss.toast('Procesando configuración...', 'Exportando', -1);

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const mapeo = {
    'Parametro': { nombre: 'parametro', tipo: 'texto' },
    'Valor': { nombre: 'valor', tipo: 'texto' }
  };

  const resultado = procesarYExportar(data, headers, mapeo, 'config_logistica', 'parametro');

  ss.toast(`Exportado: ${resultado.filas} filas`, 'Completado', 5);
  SpreadsheetApp.getUi().alert(
    '✅ Exportación completada\n\n' +
    `Archivo: ${resultado.archivo}\n` +
    `Filas procesadas: ${resultado.filas}\n\n` +
    'El archivo está en tu Google Drive en la carpeta "Exportaciones_Supabase"'
  );
}

/**
 * Exporta el registro de envíos a Full
 */
function exportarEnviosFull() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Registro_Envios_Full');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('No se encontró la hoja "Registro_Envios_Full"');
    return;
  }

  ss.toast('Procesando envíos...', 'Exportando', -1);

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const mapeo = {
    'ID_Envio': { nombre: 'id_envio', tipo: 'texto' },
    'ID_Envio_ML': { nombre: 'id_envio_ml', tipo: 'texto' },
    'Estado': { nombre: 'estado', tipo: 'texto' },
    'Fecha_Creacion': { nombre: 'fecha_creacion', tipo: 'fecha' },
    'Fecha_Colecta': { nombre: 'fecha_colecta', tipo: 'fecha' },
    'Fecha_Ingreso_Estimada': { nombre: 'fecha_ingreso_estimada', tipo: 'fecha' },
    'Link_PDF': { nombre: 'link_pdf', tipo: 'texto' },
    'Notas': { nombre: 'notas', tipo: 'texto' }
  };

  const resultado = procesarYExportar(data, headers, mapeo, 'registro_envios_full', 'id_envio');

  ss.toast(`Exportado: ${resultado.filas} filas`, 'Completado', 5);
  SpreadsheetApp.getUi().alert(
    '✅ Exportación completada\n\n' +
    `Archivo: ${resultado.archivo}\n` +
    `Filas procesadas: ${resultado.filas}\n\n` +
    'El archivo está en tu Google Drive en la carpeta "Exportaciones_Supabase"'
  );
}

/**
 * Exporta el detalle de envíos a Full (productos por envío)
 */
function exportarDetalleEnviosFull() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Detalle_Envios_Full');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('No se encontró la hoja "Detalle_Envios_Full"');
    return;
  }

  ss.toast('Procesando detalle de envíos...', 'Exportando', -1);

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const mapeo = {
    'ID_Envio': { nombre: 'id_envio', tipo: 'texto' },
    'SKU': { nombre: 'sku', tipo: 'texto' },
    'Cantidad_Enviada': { nombre: 'cantidad_enviada', tipo: 'entero' }
  };

  // Clave compuesta: id_envio + sku
  const resultado = procesarYExportarConDedup(data, headers, mapeo, 'detalle_envios_full', ['id_envio', 'sku']);

  ss.toast(`Exportado: ${resultado.filas} filas`, 'Completado', 5);
  SpreadsheetApp.getUi().alert(
    '✅ Exportación completada\n\n' +
    `Archivo: ${resultado.archivo}\n` +
    `Filas procesadas: ${resultado.filas}\n` +
    `Duplicados eliminados: ${resultado.duplicados}\n\n` +
    'El archivo está en tu Google Drive en la carpeta "Exportaciones_Supabase"'
  );
}

/**
 * Exporta los costos de publicidad diarios (para Dashboard)
 */
function exportarCostosPublicidad() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Meli_Costos_Publicidad');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('No se encontró la hoja "Meli_Costos_Publicidad"');
    return;
  }

  ss.toast('Procesando costos de publicidad...', 'Exportando', -1);

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const mapeo = {
    'Fecha': { nombre: 'fecha', tipo: 'fechaSolo' },  // Solo fecha, sin hora
    'Costo_Diario': { nombre: 'costo_diario', tipo: 'numero' }
  };

  const resultado = procesarYExportar(data, headers, mapeo, 'costos_publicidad', 'fecha');

  ss.toast(`Exportado: ${resultado.filas} filas`, 'Completado', 5);
  SpreadsheetApp.getUi().alert(
    '✅ Exportación completada\n\n' +
    `Archivo: ${resultado.archivo}\n` +
    `Filas procesadas: ${resultado.filas}\n\n` +
    'El archivo está en tu Google Drive en la carpeta "Exportaciones_Supabase"'
  );
}

/**
 * Exporta la preparación en curso (escaneo de productos)
 */
function exportarPreparacionEnCurso() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Preparacion_En_Curso');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('No se encontró la hoja "Preparacion_En_Curso"');
    return;
  }

  ss.toast('Procesando preparación en curso...', 'Exportando', -1);

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const mapeo = {
    'ID_Envio': { nombre: 'id_envio', tipo: 'texto' },
    'SKU': { nombre: 'sku', tipo: 'texto' },
    'Inventory_ID': { nombre: 'inventory_id', tipo: 'texto' },
    'Titulo': { nombre: 'titulo', tipo: 'texto' },
    'Cantidad_Requerida': { nombre: 'cantidad_requerida', tipo: 'entero' },
    'Cantidad_Escaneada': { nombre: 'cantidad_escaneada', tipo: 'entero' }
  };

  // Clave compuesta: id_envio + sku
  const resultado = procesarYExportarConDedup(data, headers, mapeo, 'preparacion_en_curso', ['id_envio', 'sku']);

  ss.toast(`Exportado: ${resultado.filas} filas`, 'Completado', 5);
  SpreadsheetApp.getUi().alert(
    '✅ Exportación completada\n\n' +
    `Archivo: ${resultado.archivo}\n` +
    `Filas procesadas: ${resultado.filas}\n` +
    `Duplicados eliminados: ${resultado.duplicados}\n\n` +
    'El archivo está en tu Google Drive en la carpeta "Exportaciones_Supabase"'
  );
}

/**
 * Exporta el historial de cambios de precios
 */
function exportarHistorialPrecios() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Historial_Cambio_Precios');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('No se encontró la hoja "Historial_Cambio_Precios"');
    return;
  }

  ss.toast('Procesando historial de precios...', 'Exportando', -1);

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const mapeo = {
    'Fecha_Cambio': { nombre: 'fecha_cambio', tipo: 'fecha' },
    'ItemID': { nombre: 'item_id', tipo: 'texto' },
    'SKU': { nombre: 'sku', tipo: 'texto' },
    'Precio_Anterior': { nombre: 'precio_anterior', tipo: 'numero' },
    'Precio_Nuevo': { nombre: 'precio_nuevo', tipo: 'numero' }
  };

  // Sin clave primaria específica (usa ID auto-incremental en Supabase)
  const resultado = procesarYExportarSinClave(data, headers, mapeo, 'historial_cambio_precios');

  ss.toast(`Exportado: ${resultado.filas} filas`, 'Completado', 5);
  SpreadsheetApp.getUi().alert(
    '✅ Exportación completada\n\n' +
    `Archivo: ${resultado.archivo}\n` +
    `Filas procesadas: ${resultado.filas}\n\n` +
    'El archivo está en tu Google Drive en la carpeta "Exportaciones_Supabase"'
  );
}

/**
 * Exporta las sugerencias de envío calculadas
 */
function exportarSugerenciasEnvio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Sugerencias_Envio_Full');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('No se encontró la hoja "Sugerencias_Envio_Full"');
    return;
  }

  ss.toast('Procesando sugerencias de envío...', 'Exportando', -1);

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const mapeo = {
    'SKU': { nombre: 'sku', tipo: 'texto' },
    'Título': { nombre: 'titulo', tipo: 'texto' },
    'Ventas/Día (V)': { nombre: 'ventas_dia', tipo: 'numero' },
    'Stock Actual Full (Sml)': { nombre: 'stock_actual_full', tipo: 'entero' },
    'Stock en Tránsito': { nombre: 'stock_en_transito', tipo: 'entero' },
    'Stock de Seguridad (Ss)': { nombre: 'stock_seguridad', tipo: 'entero' },
    'Días de Cobertura Actual': { nombre: 'dias_cobertura', tipo: 'numero' },
    'Cantidad a Enviar': { nombre: 'cantidad_a_enviar', tipo: 'entero' },
    'Nivel de Riesgo': { nombre: 'nivel_riesgo', tipo: 'texto' }
  };

  const resultado = procesarYExportar(data, headers, mapeo, 'sugerencias_envio_full', 'sku');

  ss.toast(`Exportado: ${resultado.filas} filas`, 'Completado', 5);
  SpreadsheetApp.getUi().alert(
    '✅ Exportación completada\n\n' +
    `Archivo: ${resultado.archivo}\n` +
    `Filas procesadas: ${resultado.filas}\n\n` +
    'El archivo está en tu Google Drive en la carpeta "Exportaciones_Supabase"'
  );
}

/**
 * Exporta todas las hojas a la vez
 */
function exportarTodo() {
  const ui = SpreadsheetApp.getUi();
  const respuesta = ui.alert(
    'Exportar Todo',
    '¿Deseas exportar todas las hojas a archivos CSV?\n\nSe crearán varios archivos en la carpeta "Exportaciones_Supabase" de tu Drive.',
    ui.ButtonSet.YES_NO
  );

  if (respuesta !== ui.Button.YES) return;

  const exportaciones = [
    { nombre: 'Publicaciones', fn: exportarPublicaciones },
    { nombre: 'Órdenes', fn: exportarOrdenes },
    { nombre: 'Config Logística', fn: exportarConfigLogistica },
    { nombre: 'Registro Envíos Full', fn: exportarEnviosFull },
    { nombre: 'Detalle Envíos Full', fn: exportarDetalleEnviosFull },
    { nombre: 'Costos Publicidad', fn: exportarCostosPublicidad },
    { nombre: 'Preparación En Curso', fn: exportarPreparacionEnCurso },
    { nombre: 'Historial Precios', fn: exportarHistorialPrecios },
    { nombre: 'Sugerencias Envío', fn: exportarSugerenciasEnvio }
  ];

  let exitosos = 0;
  let errores = [];

  exportaciones.forEach(exp => {
    try {
      exp.fn();
      exitosos++;
    } catch (e) {
      Logger.log(`Error exportando ${exp.nombre}: ${e.message}`);
      errores.push(exp.nombre);
    }
  });

  let mensaje = `✅ Exportación completa\n\nExitosos: ${exitosos}/${exportaciones.length}`;
  if (errores.length > 0) {
    mensaje += `\n\n⚠️ Con errores: ${errores.join(', ')}`;
  }
  mensaje += '\n\nRevisa la carpeta "Exportaciones_Supabase" en tu Google Drive.';

  ui.alert(mensaje);
}

// ============================================================================
// FUNCIÓN PRINCIPAL DE PROCESAMIENTO
// ============================================================================

/**
 * Procesa los datos y genera el archivo CSV
 */
function procesarYExportar(data, headers, mapeo, nombreTabla, clavePrimaria) {
  // Encontrar índices de columnas
  const indices = {};
  Object.keys(mapeo).forEach(headerOriginal => {
    const idx = headers.indexOf(headerOriginal);
    if (idx >= 0) {
      indices[headerOriginal] = idx;
    }
  });

  // Generar headers del CSV (columnas de Supabase)
  const headersCSV = Object.keys(mapeo)
    .filter(h => indices[h] !== undefined)
    .map(h => mapeo[h].nombre);

  // Procesar filas
  const filasCSV = [];
  let omitidas = 0;

  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const registro = {};
    let tieneClave = false;

    Object.keys(mapeo).forEach(headerOriginal => {
      const idx = indices[headerOriginal];
      if (idx === undefined) return;

      const config = mapeo[headerOriginal];
      const valorOriginal = fila[idx];
      let valorNormalizado;

      switch (config.tipo) {
        case 'fecha':
          valorNormalizado = normalizarFecha(valorOriginal);
          break;
        case 'fechaSolo':
          valorNormalizado = normalizarFechaSolo(valorOriginal);
          break;
        case 'numero':
          valorNormalizado = normalizarNumero(valorOriginal);
          break;
        case 'entero':
          valorNormalizado = normalizarEntero(valorOriginal);
          break;
        case 'booleano':
          valorNormalizado = normalizarBooleano(valorOriginal);
          break;
        default:
          valorNormalizado = normalizarTexto(valorOriginal);
      }

      registro[config.nombre] = valorNormalizado;

      // Verificar si tiene clave primaria
      if (config.nombre === clavePrimaria && valorNormalizado) {
        tieneClave = true;
      }
    });

    // Solo incluir filas con clave primaria válida
    if (tieneClave) {
      const filaCSV = headersCSV.map(h => escaparCSV(registro[h]));
      filasCSV.push(filaCSV.join(','));
    } else {
      omitidas++;
    }
  }

  // Crear contenido CSV
  const contenidoCSV = headersCSV.join(',') + '\n' + filasCSV.join('\n');

  // Guardar archivo
  const nombreArchivo = `${nombreTabla}_${Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyyMMdd_HHmmss')}.csv`;
  const archivo = guardarCSV(nombreArchivo, contenidoCSV);

  return {
    archivo: nombreArchivo,
    filas: filasCSV.length,
    omitidas: omitidas,
    url: archivo.getUrl()
  };
}

/**
 * Procesa los datos con deduplicación por clave compuesta y genera el archivo CSV
 * @param {Array} clavesCompuestas - Array de nombres de columnas que forman la clave única
 */
function procesarYExportarConDedup(data, headers, mapeo, nombreTabla, clavesCompuestas) {
  // Encontrar índices de columnas
  const indices = {};
  Object.keys(mapeo).forEach(headerOriginal => {
    const idx = headers.indexOf(headerOriginal);
    if (idx >= 0) {
      indices[headerOriginal] = idx;
    }
  });

  // Generar headers del CSV (columnas de Supabase)
  const headersCSV = Object.keys(mapeo)
    .filter(h => indices[h] !== undefined)
    .map(h => mapeo[h].nombre);

  // Set para trackear claves ya vistas
  const clavesVistas = new Set();
  let duplicados = 0;

  // Procesar filas
  const filasCSV = [];
  let omitidas = 0;

  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const registro = {};
    let tieneTodasLasClaves = true;

    Object.keys(mapeo).forEach(headerOriginal => {
      const idx = indices[headerOriginal];
      if (idx === undefined) return;

      const config = mapeo[headerOriginal];
      const valorOriginal = fila[idx];
      let valorNormalizado;

      switch (config.tipo) {
        case 'fecha':
          valorNormalizado = normalizarFecha(valorOriginal);
          break;
        case 'fechaSolo':
          valorNormalizado = normalizarFechaSolo(valorOriginal);
          break;
        case 'numero':
          valorNormalizado = normalizarNumero(valorOriginal);
          break;
        case 'entero':
          valorNormalizado = normalizarEntero(valorOriginal);
          break;
        case 'booleano':
          valorNormalizado = normalizarBooleano(valorOriginal);
          break;
        default:
          valorNormalizado = normalizarTexto(valorOriginal);
      }

      registro[config.nombre] = valorNormalizado;

      // Verificar si tiene todas las claves de la clave compuesta
      if (clavesCompuestas.includes(config.nombre) && !valorNormalizado) {
        tieneTodasLasClaves = false;
      }
    });

    // Solo incluir filas con todas las claves válidas
    if (tieneTodasLasClaves) {
      // Generar clave compuesta para detectar duplicados
      const claveCompuesta = clavesCompuestas.map(k => registro[k] || '').join('|');

      if (clavesVistas.has(claveCompuesta)) {
        // Duplicado encontrado, saltear
        duplicados++;
      } else {
        clavesVistas.add(claveCompuesta);
        const filaCSV = headersCSV.map(h => escaparCSV(registro[h]));
        filasCSV.push(filaCSV.join(','));
      }
    } else {
      omitidas++;
    }
  }

  // Crear contenido CSV
  const contenidoCSV = headersCSV.join(',') + '\n' + filasCSV.join('\n');

  // Guardar archivo
  const nombreArchivo = `${nombreTabla}_${Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyyMMdd_HHmmss')}.csv`;
  const archivo = guardarCSV(nombreArchivo, contenidoCSV);

  return {
    archivo: nombreArchivo,
    filas: filasCSV.length,
    omitidas: omitidas,
    duplicados: duplicados,
    url: archivo.getUrl()
  };
}

/**
 * Procesa los datos sin requerir clave primaria (para tablas con ID auto-incremental)
 * Útil para historial_cambio_precios donde el ID es SERIAL en Supabase
 */
function procesarYExportarSinClave(data, headers, mapeo, nombreTabla) {
  // Encontrar índices de columnas
  const indices = {};
  Object.keys(mapeo).forEach(headerOriginal => {
    const idx = headers.indexOf(headerOriginal);
    if (idx >= 0) {
      indices[headerOriginal] = idx;
    }
  });

  // Generar headers del CSV (columnas de Supabase)
  const headersCSV = Object.keys(mapeo)
    .filter(h => indices[h] !== undefined)
    .map(h => mapeo[h].nombre);

  // Procesar filas
  const filasCSV = [];
  let omitidas = 0;

  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const registro = {};
    let tieneAlgunDato = false;

    Object.keys(mapeo).forEach(headerOriginal => {
      const idx = indices[headerOriginal];
      if (idx === undefined) return;

      const config = mapeo[headerOriginal];
      const valorOriginal = fila[idx];
      let valorNormalizado;

      switch (config.tipo) {
        case 'fecha':
          valorNormalizado = normalizarFecha(valorOriginal);
          break;
        case 'fechaSolo':
          valorNormalizado = normalizarFechaSolo(valorOriginal);
          break;
        case 'numero':
          valorNormalizado = normalizarNumero(valorOriginal);
          break;
        case 'entero':
          valorNormalizado = normalizarEntero(valorOriginal);
          break;
        case 'booleano':
          valorNormalizado = normalizarBooleano(valorOriginal);
          break;
        default:
          valorNormalizado = normalizarTexto(valorOriginal);
      }

      registro[config.nombre] = valorNormalizado;

      if (valorNormalizado !== null && valorNormalizado !== '') {
        tieneAlgunDato = true;
      }
    });

    // Incluir filas que tengan al menos algún dato
    if (tieneAlgunDato) {
      const filaCSV = headersCSV.map(h => escaparCSV(registro[h]));
      filasCSV.push(filaCSV.join(','));
    } else {
      omitidas++;
    }
  }

  // Crear contenido CSV
  const contenidoCSV = headersCSV.join(',') + '\n' + filasCSV.join('\n');

  // Guardar archivo
  const nombreArchivo = `${nombreTabla}_${Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyyMMdd_HHmmss')}.csv`;
  const archivo = guardarCSV(nombreArchivo, contenidoCSV);

  return {
    archivo: nombreArchivo,
    filas: filasCSV.length,
    omitidas: omitidas,
    url: archivo.getUrl()
  };
}

/**
 * Guarda el archivo CSV en Google Drive
 */
function guardarCSV(nombreArchivo, contenido) {
  // Buscar o crear carpeta
  const nombreCarpeta = 'Exportaciones_Supabase';
  let carpeta;

  const carpetas = DriveApp.getFoldersByName(nombreCarpeta);
  if (carpetas.hasNext()) {
    carpeta = carpetas.next();
  } else {
    carpeta = DriveApp.createFolder(nombreCarpeta);
  }

  // Crear archivo con BOM para UTF-8 (importante para acentos)
  const bom = '\uFEFF';
  const blob = Utilities.newBlob(bom + contenido, 'text/csv', nombreArchivo);

  // Eliminar archivo anterior si existe
  const archivosExistentes = carpeta.getFilesByName(nombreArchivo);
  while (archivosExistentes.hasNext()) {
    archivosExistentes.next().setTrashed(true);
  }

  return carpeta.createFile(blob);
}

// ============================================================================
// FUNCIONES DE UTILIDAD
// ============================================================================

/**
 * Prueba de normalización (para debug)
 */
function testNormalizacion() {
  Logger.log('=== TEST DE NORMALIZACIÓN ===');

  // Fechas
  Logger.log('Fechas:');
  Logger.log('20/8/2025 -> ' + normalizarFecha('20/8/2025'));
  Logger.log('29/7/2025 10:20:40 -> ' + normalizarFecha('29/7/2025 10:20:40'));
  Logger.log('2025-12-20 -> ' + normalizarFecha('2025-12-20'));
  Logger.log(new Date() + ' -> ' + normalizarFecha(new Date()));

  // Números
  Logger.log('\nNúmeros:');
  Logger.log('$48.513,00 -> ' + normalizarNumero('$48.513,00'));
  Logger.log('1.234,56 -> ' + normalizarNumero('1.234,56'));
  Logger.log('1,234.56 -> ' + normalizarNumero('1,234.56'));
  Logger.log('22,96% -> ' + normalizarNumero('22,96%'));
  Logger.log('420,00 -> ' + normalizarNumero('420,00'));

  // Booleanos
  Logger.log('\nBooleanos:');
  Logger.log('Sí -> ' + normalizarBooleano('Sí'));
  Logger.log('(vacío) -> ' + normalizarBooleano('(vacío)'));
  Logger.log('true -> ' + normalizarBooleano('true'));

  Logger.log('\n=== FIN TEST ===');
}
