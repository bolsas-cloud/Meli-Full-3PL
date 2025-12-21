// ============================================================================
// --- ARCHIVO: WebApp_Providers.gs ---
// ============================================================================
// Descripción: Funciones que actúan como puente entre la Web App (frontend)
//              y la lógica del script (backend).
// ============================================================================

/**
 * *** VERSIÓN MEJORADA ***
 * Recibe los parámetros desde la Web App, los guarda en la hoja de configuración
 * y luego ejecuta el cálculo principal de sugerencias.
 * @param {object} parametros - Un objeto con {tt, fe, z, fechaColecta} desde la interfaz.
 * @returns {boolean} - Devuelve true si la ejecución fue exitosa.
 */
function actualizarYCalcularSugerencias(parametros) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName(CONFIG_LOGISTICA_SHEET_NAME);
    
    if (!configSheet) {
      throw new Error(`La hoja "${CONFIG_LOGISTICA_SHEET_NAME}" no existe.`);
    }
    
    // Actualizamos los valores en la hoja con los que nos envía el usuario
    configSheet.getRange("B2").setValue(parametros.tt);
    configSheet.getRange("B3").setValue(parametros.fe);
    configSheet.getRange("B4").setValue(parametros.z);
    
    // Ahora que la configuración está actualizada, llamamos a la función principal
    // pasándole TODOS los parámetros, incluyendo la fecha de colecta.
    calcularSugerenciasDeEnvio(parametros); // De Logistica_Full.gs
    
    return true; // Indicamos que el proceso se inició correctamente
  } catch (e) {
    Logger.log("Error en actualizarYCalcularSugerencias: " + e.message);
    throw new Error("No se pudo ejecutar el cálculo: " + e.message);
  }
}



/**
 * Lee los resultados desde la hoja de sugerencias y los envía a la Web App.
 * @returns {Array<Array<any>>} - Un array de arrays con los datos de la tabla.
 */
function obtenerSugerenciasParaWebapp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sugerenciasSheet = ss.getSheetByName("Sugerencias_Envio_Full");
  
  if (!sugerenciasSheet || sugerenciasSheet.getLastRow() < 2) {
    return [['SKU', 'Título', 'Ventas/Día', 'Stock Full', 'En Tránsito', 'Stock Seg.', 'Cobertura', 'A ENVIAR', 'Riesgo']];
  }
  
  const data = sugerenciasSheet.getDataRange().getValues();
  return data;
}



/**
 * *** VERSIÓN NORMALIZADA ***
 * Guarda la información del envío en dos hojas separadas: una para el maestro
 * y otra para el detalle de productos.
 * @param {Array<Object>} productosSeleccionados - Un array de objetos, ej: [{sku: 'SKU-01', cantidad: 50}]
 * @param {string} fechaColectaStr - La fecha de colecta en formato string 'YYYY-MM-DD'.
 * @returns {string} - Un mensaje de confirmación.
 */
// --- Archivo: WebApp_Providers.gs ---
// REEMPLAZA ESTA FUNCIÓN
function registrarEnvio(productosSeleccionados, fechaColectaStr) {
  if (!productosSeleccionados || productosSeleccionados.length === 0) { throw new Error("No se seleccionó ningún producto."); }
  if (!fechaColectaStr) { throw new Error("No se proporcionó una fecha de colecta."); }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const enviosSheet = ss.getSheetByName('Registro_Envios_Full');
  const detalleSheet = ss.getSheetByName('Detalle_Envios_Full');

  if (!enviosSheet || !detalleSheet) { throw new Error("Asegúrate de que existan las hojas de registro."); }
  
  const idEnvio = "ENV-" + new Date().getTime();
  const fechaCreacion = new Date();
  const estadoInicial = "En Preparación";
  const fechaColecta = new Date(fechaColectaStr + "T12:00:00Z");
  
  const config = leerConfiguracionLogistica();
  const diasTransito = config ? config.tiempoTransito : 3;
  const fechaIngresoEstimada = new Date(fechaColecta);
  fechaIngresoEstimada.setDate(fechaColecta.getDate() + diasTransito);

  // Le pasamos la lista de productos (que ya tiene el título) a la función del PDF
  const linkPdf = generarPdfDeEnvio(idEnvio, fechaColecta, productosSeleccionados);

  enviosSheet.appendRow([ idEnvio, '', estadoInicial, fechaCreacion, fechaColecta, fechaIngresoEstimada, linkPdf, '' ]);
  
  const filasDetalle = productosSeleccionados.map(p => [ idEnvio, p.sku, p.cantidad ]);
  detalleSheet.getRange(detalleSheet.getLastRow() + 1, 1, filasDetalle.length, 3).setValues(filasDetalle);
  
  return `¡Envío ${idEnvio} registrado con éxito!`;
}



/**
 * *** VERSIÓN CORREGIDA (con Títulos) ***
 * Genera un PDF simple con la lista de productos, incluyendo el título,
 * y lo guarda en Google Drive.
 * @param {string} idEnvio - El ID de nuestro envío.
 * @param {Date} fechaColecta - La fecha de colecta.
 * @param {Array<Object>} productos - La lista de productos (con SKU, Título y Cantidad).
 * @returns {string} - El link al PDF generado.
 */
function generarPdfDeEnvio(idEnvio, fechaColecta, productos) {
  try {
    const nombreArchivo = `Envio_Full_${idEnvio}.pdf`;
    let html = `<h1>Remito de Envío a Full - ${idEnvio}</h1>`;
    html += `<p><b>Fecha de Colecta:</b> ${Utilities.formatDate(fechaColecta, Session.getScriptTimeZone(), 'dd/MM/yyyy')}</p>`;
    html += '<hr>';
    html += '<table style="width:100%; border-collapse: collapse; font-family: Arial, sans-serif;">';
    // --- CORRECCIÓN: Añadimos la columna Título ---
    html += '<thead><tr><th style="border: 1px solid black; padding: 8px; text-align: left;">SKU</th><th style="border: 1px solid black; padding: 8px; text-align: left;">Título</th><th style="border: 1px solid black; padding: 8px; text-align: right;">Cantidad</th></tr></thead><tbody>';
    
    productos.forEach(p => {
      // --- CORRECCIÓN: Añadimos la celda para p.titulo ---
      html += `<tr><td style="border: 1px solid black; padding: 5px;">${p.sku}</td><td style="border: 1px solid black; padding: 5px;">${p.titulo}</td><td style="border: 1px solid black; padding: 5px; text-align: right;">${p.cantidad}</td></tr>`;
    });
    
    html += '</tbody></table>';

    let carpeta;
    const carpetas = DriveApp.getFoldersByName("Envios_Full_PDF");
    if (carpetas.hasNext()) {
      carpeta = carpetas.next();
    } else {
      carpeta = DriveApp.createFolder("Envios_Full_PDF");
    }
    
    const blob = Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF).setName(nombreArchivo);
    const archivoPdf = carpeta.createFile(blob);
    
    Logger.log(`PDF generado: ${archivoPdf.getUrl()}`);
    return archivoPdf.getUrl();
  } catch (e) {
    Logger.log("Error al generar PDF: " + e.message);
    return "Error al generar PDF";
  }
}



/**
 * Actualiza los datos principales de un envío y devuelve un mensaje de éxito.
 * @param {Object} datos - Objeto con {idEnvio, nuevoEstado, nuevaFechaColecta, idMeli, notas}.
 * @returns {string} - Un mensaje de confirmación.
 */
function actualizarDatosEnvio(datos) {
  const { idEnvio, nuevoEstado, nuevaFechaColecta, idMeli, notas } = datos;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const enviosSheet = ss.getSheetByName('Registro_Envios_Full');
  const rangoIds = enviosSheet.getRange("A2:A" + enviosSheet.getLastRow()).getValues();

  for (let i = 0; i < rangoIds.length; i++) {
    if (rangoIds[i][0] === idEnvio) {
      const fila = i + 2;
      enviosSheet.getRange(fila, 2).setValue(idMeli);
      enviosSheet.getRange(fila, 3).setValue(nuevoEstado);
      
      const fechaColecta = new Date(nuevaFechaColecta + "T12:00:00Z");
      enviosSheet.getRange(fila, 5).setValue(fechaColecta);

      const config = leerConfiguracionLogistica();
      const diasTransito = config ? config.tiempoTransito : 3;
      const fechaIngresoEstimada = new Date(fechaColecta);
      fechaIngresoEstimada.setDate(fechaColecta.getDate() + diasTransito);
      enviosSheet.getRange(fila, 6).setValue(fechaIngresoEstimada);
      
      enviosSheet.getRange(fila, 8).setValue(notas);

      Logger.log(`Datos del envío ${idEnvio} actualizados.`);
      return `Los datos del envío ${idEnvio} se actualizaron correctamente.`; // <-- MENSAJE DE VUELTA
    }
  }
  throw new Error(`No se encontró el envío con ID ${idEnvio} para actualizar.`);
}


/**
 * *** VERSIÓN CON TÍTULOS ***
 * Además de unir las hojas de envío, busca el título de cada SKU en la Hoja 1.
 * @returns {Array<Object>} Un array de envíos con sus productos (incluyendo el título).
 * *** VERSIÓN CON TÍTULOS E INVENTORY_ID ***
 * Además de unir las hojas de envío, busca el título y el inventory_id
 * de cada SKU en la Hoja 1 para enviarlos a la interfaz.
 */
function obtenerEnviosRegistrados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const enviosSheet = ss.getSheetByName('Registro_Envios_Full');
  const detalleSheet = ss.getSheetByName('Detalle_Envios_Full');
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
  
  if (!enviosSheet || enviosSheet.getLastRow() < 2) { return []; }

  // Creamos mapas de SKU -> Título y SKU -> Inventory ID para un acceso rápido
  const skuInfoMap = {};
  if (targetSheet && targetSheet.getLastRow() > 1) {
    // Leemos desde la Col A (SKU) hasta la H (Inventory_ID)
    const targetData = targetSheet.getRange("A2:H" + targetSheet.getLastRow()).getValues();
    targetData.forEach(row => {
      const sku = row[0];
      if (sku) {
        skuInfoMap[sku] = {
          titulo: row[1] || 'Título no encontrado', // Col B
          inventory_id: row[7] || null // Col H
        };
      }
    });
  }

  const productosPorEnvio = {};
  if (detalleSheet && detalleSheet.getLastRow() > 1) {
    const detalleData = detalleSheet.getRange("A2:C" + detalleSheet.getLastRow()).getValues();
    detalleData.forEach(row => {
      const idEnvio = row[0];
      const sku = row[1];
      const cantidad = row[2];
      if (!productosPorEnvio[idEnvio]) { productosPorEnvio[idEnvio] = []; }
      
      const info = skuInfoMap[sku] || { titulo: 'Título no encontrado', inventory_id: null };
      
      productosPorEnvio[idEnvio].push({
        sku: sku,
        titulo: info.titulo,
        inventory_id: info.inventory_id, // <-- DATO AÑADIDO
        cantidad: cantidad
      });
    });
  }

  const enviosData = enviosSheet.getRange("A2:H" + enviosSheet.getLastRow()).getValues();
  
  const resultadoFinal = enviosData.map(row => {
    const idEnvio = row[0];
    if (!idEnvio) return null;
    const fechaCreacion = row[3];
    const fechaColecta = row[4];
    return {
      id: idEnvio, idML: row[1] || '-', estado: row[2],
      fechaCreacion: fechaCreacion instanceof Date ? fechaCreacion.toISOString() : fechaCreacion,
      fechaColecta: fechaColecta instanceof Date ? fechaColecta.toISOString() : fechaColecta,
      linkPdf: row[6], notas: row[7] || '',
      productos: productosPorEnvio[idEnvio] || [] 
    };
  }).filter(e => e);
  
  resultadoFinal.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
  return resultadoFinal;
}



/**
 * Modifica un envío existente y FUSIONA los cambios con el progreso de
 * preparación actual, sin resetear a cero lo ya escaneado.
 * @param {string} idEnvio - El ID del envío a modificar.
 * @param {Array<Object>} nuevosProductos - La nueva lista completa de productos.
 */
function modificarEnvio(idEnvio, nuevosProductos) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const enviosSheet = ss.getSheetByName('Registro_Envios_Full');
  const detalleSheet = ss.getSheetByName('Detalle_Envios_Full');
  const prepSheet = ss.getSheetByName('Preparacion_En_Curso');
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);

  // --- Verificación de estado no cambia ---
  let filaEnvio = -1;
  const rangoIds = enviosSheet.getRange("A2:A" + enviosSheet.getLastRow()).getValues();
  for (let i = 0; i < rangoIds.length; i++) {
    if (rangoIds[i][0] === idEnvio) { filaEnvio = i + 2; break; }
  }
  if (filaEnvio === -1) throw new Error("El envío no fue encontrado.");
  const estadoActual = enviosSheet.getRange(filaEnvio, 3).getValue();
  if (estadoActual !== 'En Preparación') {
    throw new Error(`No se puede modificar un envío en estado '${estadoActual}'.`);
  }

  // --- LÓGICA DE FUSIÓN INTELIGENTE ---
  // 1. Leemos el progreso actual de preparación, si existe.
  const mapaProgresoActual = {};
  if (prepSheet.getLastRow() > 1) {
    prepSheet.getDataRange().getValues().slice(1).forEach(row => {
      if (row[0] === idEnvio) {
        mapaProgresoActual[row[1]] = { // La clave es el SKU
          cantidad_escaneada: row[5]
        };
      }
    });
  }

  // 2. Leemos la info completa de Hoja 1 para tener títulos e Inv. IDs
  const skuInfoMap = {};
  if (targetSheet.getLastRow() > 1) {
    targetSheet.getRange("A2:H" + targetSheet.getLastRow()).getValues().forEach(row => {
      skuInfoMap[row[0]] = { titulo: row[1], inventory_id: row[7] };
    });
  }

  // 3. Creamos la nueva lista de preparación fusionando los datos
  const nuevaListaDePreparacion = nuevosProductos.map(p => {
    const progreso = mapaProgresoActual[p.sku];
    const info = skuInfoMap[p.sku] || { titulo: 'N/A', inventory_id: 'N/A' };
    
    return [
      idEnvio,
      p.sku,
      info.inventory_id,
      info.titulo,
      p.cantidad, // La nueva cantidad requerida
      progreso ? progreso.cantidad_escaneada : 0 // Mantenemos la cantidad escaneada si existía
    ];
  });
  
  // 4. Actualizamos la hoja Preparacion_En_Curso
  const prepData = prepSheet.getDataRange().getValues();
  const filasAEliminar = [];
  for (let i = prepData.length - 1; i >= 1; i--) {
    if (prepData[i][0] === idEnvio) {
      filasAEliminar.push(i + 1);
    }
  }
  filasAEliminar.forEach(numFila => prepSheet.deleteRow(numFila));
  
  if (nuevaListaDePreparacion.length > 0) {
    prepSheet.getRange(prepSheet.getLastRow() + 1, 1, nuevaListaDePreparacion.length, 6).setValues(nuevaListaDePreparacion);
  }

  // --- El resto de la lógica (actualizar Detalle_Envios y PDF) no cambia ---
  const todosLosProductos = detalleSheet.getLastRow() > 1 ? detalleSheet.getRange("A2:C" + detalleSheet.getLastRow()).getValues() : [];
  const productosDeOtrosEnvios = todosLosProductos.filter(row => row[0] !== idEnvio);
  const filasEnvioActual = nuevosProductos.map(p => [idEnvio, p.sku, p.cantidad]);
  
  detalleSheet.getRange("A2:C" + detalleSheet.getMaxRows()).clearContent();
  if (productosDeOtrosEnvios.length > 0) {
    detalleSheet.getRange(2, 1, productosDeOtrosEnvios.length, 3).setValues(productosDeOtrosEnvios);
  }
  if (filasEnvioActual.length > 0) {
    detalleSheet.getRange(detalleSheet.getLastRow() + 1, 1, filasEnvioActual.length, 3).setValues(filasEnvioActual);
  }

  const fechaColecta = enviosSheet.getRange(filaEnvio, 5).getValue();
  const nuevoLinkPdf = generarPdfDeEnvio(idEnvio, fechaColecta, nuevosProductos);
  enviosSheet.getRange(filaEnvio, 7).setValue(nuevoLinkPdf);

  return `Envío ${idEnvio} modificado. El progreso de preparación ha sido actualizado.`;
}




/**
 * Elimina un envío por completo de ambas hojas.
 * @param {string} idEnvio - El ID del envío a eliminar.
 */
function eliminarEnvio(idEnvio) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const enviosSheet = ss.getSheetByName('Registro_Envios_Full');
  const detalleSheet = ss.getSheetByName('Detalle_Envios_Full');

  // Eliminar de la hoja maestra
  const rangoIdsMaestra = enviosSheet.getRange("A2:A" + enviosSheet.getLastRow()).getValues();
  for (let i = rangoIdsMaestra.length - 1; i >= 0; i--) {
    if (rangoIdsMaestra[i][0] === idEnvio) {
      enviosSheet.deleteRow(i + 2);
      break; // Suponemos IDs únicos
    }
  }
  
  // Eliminar de la hoja de detalle
  const detalleData = detalleSheet.getDataRange().getValues();
  const filasAEliminar = [];
  for (let i = detalleData.length - 1; i >= 1; i--) {
    if (detalleData[i][0] === idEnvio) {
      filasAEliminar.push(i + 1);
    }
  }
  filasAEliminar.forEach(numFila => detalleSheet.deleteRow(numFila));

  return `Envío ${idEnvio} ha sido eliminado.`;
}



/**
 * *** VERSIÓN FINAL Y ROBUSTA DEL DASHBOARD (v3.0) ***
 * Calcula todos los KPIs y datos para gráficos, aplicando la normalización
 * a UTC para garantizar la máxima precisión en los rangos de fechas.
 * @param {object} rangoFechas - Un objeto con { inicio: "YYYY-MM-DD", fin: "YYYY-MM-DD" }.
 * @returns {object} Un objeto con los datos procesados para el dashboard.
 */
function obtenerDatosDashboard(rangoFechas) {
  Logger.log(`Obteniendo datos de dashboard para el rango: ${rangoFechas.inicio} al ${rangoFechas.fin}`);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(ORDERS_DETAIL_SHEET_NAME);
  const visitsSheet = ss.getSheetByName(DAILY_VISITS_SHEET_NAME);
  const adsSheet = ss.getSheetByName('Meli_Costos_Publicidad');

  // Forzamos las fechas a ser interpretadas como UTC para evitar desfases de zona horaria
  const fechaInicioFiltro = new Date(rangoFechas.inicio + 'T00:00:00Z');
  const fechaFinFiltro = new Date(rangoFechas.fin + 'T23:59:59Z'); // Usamos el final del día para incluirlo completo

  const resultado = {
    kpis: { totalVentasNetas: 0, totalOrdenes: 0, totalVisitas: 0, totalItemsVendidos: 0, totalCostoPublicidad: 0, acos: 0, conversion: 0 },
    chartData: []
  };

  const orderIds = new Set();
  const ventasPorDia = {};

  // 1. Procesamos las órdenes
  if (ordersSheet && ordersSheet.getLastRow() > 1) {
    // Leemos desde la columna A para incluir el ID de la Orden
    const orderData = ordersSheet.getRange("A2:K" + ordersSheet.getLastRow()).getValues();
    orderData.forEach(row => {
      const orderId = row[0]; // Columna A
      const fechaPago = row[2]; // Columna C
      if (fechaPago instanceof Date && fechaPago >= fechaInicioFiltro && fechaPago <= fechaFinFiltro) {
        resultado.kpis.totalItemsVendidos += parseFloat(row[6]) || 0; // Columna G: Cantidad
        const neto = parseFloat(row[10]) || 0; // Columna K: Neto Recibido
        resultado.kpis.totalVentasNetas += neto;
        orderIds.add(orderId);
        
        const diaStr = Utilities.formatDate(fechaPago, "GMT", "yyyy-MM-dd");
        ventasPorDia[diaStr] = (ventasPorDia[diaStr] || 0) + neto;
      }
    });
  }
  resultado.kpis.totalOrdenes = orderIds.size;

  // 2. Procesamos las visitas
  if (visitsSheet && visitsSheet.getLastRow() > 1) {
    const visitData = visitsSheet.getRange("B2:C" + visitsSheet.getLastRow()).getValues();
    visitData.forEach(row => {
      const fechaVisita = row[0]; // Columna B
      if (fechaVisita instanceof Date && fechaVisita >= fechaInicioFiltro && fechaVisita <= fechaFinFiltro) {
        resultado.kpis.totalVisitas += parseFloat(row[1]) || 0; // Columna C
      }
    });
  }
  
  // 3. Procesamos los costos de publicidad con proyección
  let ultimoCostoFiable = 0;
  let ultimaFechaFiable = null;
  const costosMap = {};

  if (adsSheet && adsSheet.getLastRow() > 1) {
    const adsData = adsSheet.getRange("A2:B" + adsSheet.getLastRow()).getValues().sort((a, b) => b[0] - a[0]);
    adsData.forEach(fila => {
      if (fila[0] instanceof Date) {
        const fechaStr = Utilities.formatDate(fila[0], "GMT", "yyyy-MM-dd");
        costosMap[fechaStr] = parseFloat(fila[1]) || 0;
      }
    });
    for (const row of adsData) {
      if (row[0] instanceof Date && (parseFloat(row[1]) || 0) > 0) {
        ultimaFechaFiable = row[0];
        ultimoCostoFiable = parseFloat(row[1]);
        break;
      }
    }
  }

  // 4. Construimos los datos para el gráfico día por día
  let fechaIteradora = new Date(fechaInicioFiltro);
  const datosGrafico = [];

  while (fechaIteradora <= fechaFinFiltro) {
    const diaStr = Utilities.formatDate(fechaIteradora, "GMT", "yyyy-MM-dd");
    const diaLabel = Utilities.formatDate(fechaIteradora, "GMT", "dd/MM"); // Usamos GMT para la etiqueta para evitar desfases
    let costoDelDia = costosMap[diaStr] || 0;

    if (ultimaFechaFiable && fechaIteradora > ultimaFechaFiable) {
        costoDelDia = ultimoCostoFiable;
    }
    
    resultado.kpis.totalCostoPublicidad += costoDelDia;
    datosGrafico.push([diaLabel, ventasPorDia[diaStr] || 0, costoDelDia]);
    fechaIteradora.setUTCDate(fechaIteradora.getUTCDate() + 1);
  }
  
  resultado.chartData = [['Día', 'Ventas ($)', 'Publicidad ($)'], ...datosGrafico];

  // 5. Calculamos KPIs finales
  if (resultado.kpis.totalVisitas > 0) {
    resultado.kpis.conversion = (resultado.kpis.totalOrdenes / resultado.kpis.totalVisitas) * 100;
  }
  if (resultado.kpis.totalVentasNetas > 0) {
    resultado.kpis.acos = (resultado.kpis.totalCostoPublicidad / resultado.kpis.totalVentasNetas) * 100;
  }
  
  return resultado;
}





/**
 * Obtiene la fecha de la última orden registrada en la hoja de detalles.
 * @returns {string} La fecha de la última orden en formato ISO o un mensaje si no hay datos.
 */
function obtenerFechaUltimaOrden() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(ORDERS_DETAIL_SHEET_NAME);

  if (ordersSheet && ordersSheet.getLastRow() > 1) {
    // Como la hoja está ordenada por fecha descendente, la última orden está en la fila 2.
    // La columna de Fecha de Pago es la C.
    const ultimaFecha = ordersSheet.getRange("C2").getValue();
    if (ultimaFecha instanceof Date) {
      return ultimaFecha.toISOString();
    }
  }
  return "No hay datos de órdenes.";
}



/**
 * *** VERSIÓN FINAL Y DEFINITIVA BASADA EN EVIDENCIA (v6.0) ***
 * Utiliza los endpoints que los logs han confirmado que funcionan:
 * - /items/{id} para obtener el ESTADO en tiempo real.
 * - /items/{id}/prices para obtener la ESTRUCTURA DE PRECIOS.
 * Se ajusta el parseo a la estructura de respuesta conocida.
 */
function obtenerDesgloseDeCargos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!targetSheet || targetSheet.getLastRow() < 2) { return []; }
  
  const token = getMeliService().getToken();
  if (!token) { throw new Error("Token no válido."); }

  const range = targetSheet.getRange("A2:R" + targetSheet.getLastRow());
  const sheetData = range.getValues();
  
  const datosCompletos = sheetData.map(row => {
    const itemId = row[6];
    if (!itemId) return null;

    const precioDeListaHoja = parseFloat(String(row[8]).replace(/[^\d,.-]/g, '').replace(',', '.')) || null;

    let producto = {
      item_id: itemId, sku: row[0], titulo: row[1],
      tiene_promo: false, precio_lista: precioDeListaHoja, precio_promo: null,
      neto_lista: null, neto_promo: null, comision: null, cargo_fijo: null,
      costo_envio: parseFloat(row[13]) || 0, impuestos: null, estado_publicacion: 'desconocido'
    };

    try {
      // --- PASO 1: Usamos los dos endpoints que sabemos que funcionan ---
      const itemUrl = `${MELI_API_BASE_URL}/items/${itemId}?attributes=status,permalink`;
      const pricesUrl = `${MELI_API_BASE_URL}/items/${itemId}/prices`; // <-- LA URL QUE SÍ FUNCIONA
      
      const [itemResponse, pricesResponse] = UrlFetchApp.fetchAll([
        { url: itemUrl, headers: { 'Authorization': `Bearer ${token}` }, muteHttpExceptions: true },
        { url: pricesUrl, headers: { 'Authorization': `Bearer ${token}` }, muteHttpExceptions: true }
      ]);

      const itemData = JSON.parse(itemResponse.getContentText());
      const pricesData = JSON.parse(pricesResponse.getContentText());

      // Asignamos el estado en tiempo real (sabemos que esto funciona)
      if (itemData && itemData.status) {
        if (itemData.status === 'active') {
          producto.estado_publicacion = itemData.permalink ? 'active' : 'paused';
        } else {
          producto.estado_publicacion = itemData.status;
        }
      }
      
      // --- PASO 2: Leemos la estructura de precios que SÍ nos responde la API ---
      // (Buscamos la lista 'prices' dentro del objeto 'pricesData')
      if (pricesData && pricesData.prices && Array.isArray(pricesData.prices)) {
        const standardPriceObject = pricesData.prices.find(p => p.type === 'standard');
        const promotionPriceObject = pricesData.prices.find(p => p.type === 'promotion' && (!p.conditions.context_restrictions || !p.conditions.context_restrictions.some(c => c.includes('buyer_loyalty'))));
        
        if (standardPriceObject) {
          producto.precio_lista = standardPriceObject.amount;
        }
        
        if (promotionPriceObject && promotionPriceObject.amount < producto.precio_lista) {
          producto.tiene_promo = true;
          producto.precio_promo = promotionPriceObject.amount;
        }
      }
      
      // --- PASO 3: Calculamos todos los costos y netos ---
      const categoriaId = row[9];
      const tipoPublicacion = row[10];
      
      if (categoriaId && tipoPublicacion && producto.precio_lista > 0) {
        const siteId = categoriaId.substring(0, 3);
        
        const urlCargosBase = `${MELI_API_BASE_URL}/sites/${siteId}/listing_prices?price=${producto.precio_lista}&listing_type_id=${tipoPublicacion}&category_id=${categoriaId}`;
        const feeDataBase = makeApiCall(urlCargosBase, token);
        if (feeDataBase && feeDataBase.sale_fee_details) {
          producto.cargo_fijo = feeDataBase.sale_fee_details.fixed_fee || 0;
          producto.comision = (feeDataBase.sale_fee_amount || 0) - producto.cargo_fijo;
          producto.impuestos = feeDataBase.taxes_amount || 0;
        }
        producto.neto_lista = producto.precio_lista - (producto.comision || 0) - (producto.cargo_fijo || 0) - (producto.costo_envio || 0) - (producto.impuestos || 0);

        if (producto.tiene_promo && producto.precio_promo > 0) {
          const urlCargosPromo = `${MELI_API_BASE_URL}/sites/${siteId}/listing_prices?price=${producto.precio_promo}&listing_type_id=${tipoPublicacion}&category_id=${categoriaId}`;
          const feeDataPromo = makeApiCall(urlCargosPromo, token);
          let comisionPromo = 0, cargoFijoPromo = 0;
          if (feeDataPromo && feeDataPromo.sale_fee_details) {
              cargoFijoPromo = feeDataPromo.sale_fee_details.fixed_fee || 0;
              comisionPromo = (feeDataPromo.sale_fee_amount || 0) - cargoFijoPromo;
          }
          producto.neto_promo = producto.precio_promo - comisionPromo - cargoFijoPromo - (producto.costo_envio || 0) - (producto.impuestos || 0);
        }
      }
    } catch (e) {
      Logger.log(`Error al procesar item ${itemId}: ${e.message}`);
    }
    
    return producto;
  }).filter(p => p);
  
  return datosCompletos;
}






/**
 * *** VERSIÓN CON ÍNDICES CORREGIDOS ***
 * Actualiza precios en lote y modifica la Hoja 1 apuntando a las columnas correctas.
 * *** VERSIÓN CON ÍNDICES CORREGIDOS (Precio en Columna I) ***
 * Actualiza precios en lote y modifica la Hoja 1 apuntando a las columnas correctas.
 */
function actualizarPreciosEnLote(productosAActualizar) {
  if (!productosAActualizar || productosAActualizar.length === 0) {
    throw new Error("No se recibieron productos para actualizar.");
  }

  const token = getMeliService().getToken();
  if (!token) { throw new Error("Token no válido."); }

  // Esta parte que se comunica con Mercado Libre funciona bien.
  const requests = productosAActualizar.map(p => ({
    url: `${MELI_API_BASE_URL}/items/${p.itemId}`,
    method: 'put',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ price: p.nuevoPrecio }),
    muteHttpExceptions: true
  }));
  const responses = UrlFetchApp.fetchAll(requests);
  
  const productosExitosos = [], productosFallidos = [];
  let exitos = 0;
  responses.forEach((response, index) => {
    const productoOriginal = productosAActualizar[index];
    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
      exitos++;
      productosExitosos.push(productoOriginal);
    } else {
      let mensajeError = "Error desconocido.";
      try {
        const errorBody = JSON.parse(response.getContentText());
        mensajeError = errorBody.cause && errorBody.cause.length > 0 ? errorBody.cause[0].message : errorBody.message;
      } catch (e) {
        mensajeError = response.getContentText().substring(0, 100);
      }
      productosFallidos.push({ sku: productoOriginal.sku, itemId: productoOriginal.itemId, error: mensajeError });
      Logger.log(`Error actualizando ${productoOriginal.itemId}: ${mensajeError}`);
    }
  });

  // Esta es la parte que necesitaba la corrección.
  if (productosExitosos.length > 0) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
    const historialSheet = ss.getSheetByName('Historial_Cambio_Precios');
    const range = targetSheet.getRange("A2:R" + targetSheet.getLastRow());
    const sheetData = range.getValues();

    const mapaNuevosPrecios = {};
    productosExitosos.forEach(p => { mapaNuevosPrecios[p.itemId] = p.nuevoPrecio; });
    const filasHistorial = [];
    const fechaCambio = new Date();

    for (let i = 0; i < sheetData.length; i++) {
      const itemId = sheetData[i][6]; // Columna G
      if (mapaNuevosPrecios[itemId]) {
        // --- CORRECCIÓN CLAVE AQUÍ ---
        // Leemos el precio anterior de la columna I (índice 8)
        filasHistorial.push([
          fechaCambio,
          itemId,
          sheetData[i][0], // SKU
          sheetData[i][8], // Precio Anterior (Columna I, índice 8)
          mapaNuevosPrecios[itemId]
        ]);
        
        // Escribimos el nuevo precio en la columna I (índice 8)
        sheetData[i][8] = mapaNuevosPrecios[itemId];
        
        // Limpiamos las columnas de rentabilidad para que se recalculen
        sheetData[i][11] = ''; sheetData[i][12] = ''; sheetData[i][13] = '';
        sheetData[i][14] = ''; sheetData[i][15] = '';
      }
    }
    
    range.setValues(sheetData);
    if (historialSheet && filasHistorial.length > 0) {
      historialSheet.getRange(historialSheet.getLastRow() + 1, 1, filasHistorial.length, 5).setValues(filasHistorial);
    }
  }

  return { exitos: exitos, fallidos: productosFallidos };
}



/**
 * Borra el contenido de las columnas de costos en Hoja 1 para forzar un recálculo.
 * @returns {boolean} - True si la operación fue exitosa.
 */
function forzarRecalculoDeCargos() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
    if (targetSheet.getLastRow() > 1) {
      // Columnas K (Comision) a O (Neto). Son 5 columnas en total.
      targetSheet.getRange("K2:O" + targetSheet.getLastRow()).clearContent();
    }
    Logger.log("Columnas de cargos limpiadas para forzar recálculo.");
    return true;
  } catch (e) {
    Logger.log("Error al limpiar columnas para recálculo: " + e.message);
    throw new Error("No se pudieron limpiar las columnas: " + e.message);
  }
}




// ================================ FUNCIONES DIAGNOSTICO ==========================================================






/**
 * *** DIAGNÓSTICO FINAL Y DEFINITIVO ***
 * Ejecuta una simulación de costos completa para el primer producto de la lista
 * usando el endpoint /users/{user_id}/shipping_options/free y muestra
 * la URL exacta y la respuesta completa de la API.
 */
function diagnosticarCargosDeUnProducto() {
  Logger.log("--- INICIO DIAGNÓSTICO DEFINITIVO (SIMULADOR DE VENDEDOR) ---");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (targetSheet.getLastRow() < 2) { Logger.log("Hoja 1 está vacía."); return; }

  const token = getMeliService().getToken();
  if (!token) { Logger.log("No se pudo obtener token."); return; }
  const userId = getUserId(token);

  // Tomamos todos los datos necesarios de la fila 2
  const primerProducto = targetSheet.getRange("A2:P2").getValues()[0];
  const sku = primerProducto[0];
  const itemId = primerProducto[6];
  const precio = parseFloat(primerProducto[7]);
  const categoriaId = primerProducto[8];
  const tipoPublicacion = primerProducto[9];
  const tipoLogistica = primerProducto[15]; // Columna P

  Logger.log(`Datos del producto de prueba (SKU: ${sku}):`);
  Logger.log(`  - User ID: ${userId}`);
  Logger.log(`  - Item ID: ${itemId}`);
  Logger.log(`  - Precio: ${precio}`);
  Logger.log(`  - Category ID: ${categoriaId}`);
  Logger.log(`  - Listing Type ID: ${tipoPublicacion}`);
  Logger.log(`  - Logistic Type: ${tipoLogistica}`);

  if (!precio || !categoriaId || !tipoPublicacion || !tipoLogistica) {
    const msg = "ERROR: Faltan datos en Hoja 1 para la prueba (Precio, Categoría, Tipo Pub o Tipo Logística).";
    Logger.log(msg); SpreadsheetApp.getUi().alert(msg); return;
  }
  
  // --- Diagnóstico de Envío con el Simulador ---
  const params = `item_price=${precio}&listing_type_id=${tipoPublicacion}&logistic_type=${tipoLogistica}&condition=new&verbose=true&category_id=${categoriaId}`;
  const urlEnvio = `${MELI_API_BASE_URL}/users/${userId}/shipping_options/free?${params}`;
  
  Logger.log("URL que se consultará al simulador: " + urlEnvio);
  const shippingData = makeApiCall(urlEnvio, token);
  Logger.log(">>> Respuesta COMPLETA de la API del Simulador de Envíos: " + JSON.stringify(shippingData, null, 2));
  
  Logger.log("--- FIN DIAGNÓSTICO ---");
  SpreadsheetApp.getUi().alert("Diagnóstico finalizado. Por favor, revisa los registros de ejecución.");
}



/**
 * *** FUNCIÓN DE DIAGNÓSTICO ***
 * Revisa las hojas de envío y muestra un reporte detallado de lo que encuentra.
 */
function diagnosticarVistaDeEnvios() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const enviosSheet = ss.getSheetByName('Registro_Envios_Full');
  const detalleSheet = ss.getSheetByName('Detalle_Envios_Full');

  Logger.log("--- INICIO DIAGNÓSTICO DE ENVÍOS CREADOS ---");

  if (!enviosSheet) { Logger.log("ERROR: No se encontró la hoja 'Registro_Envios_Full'"); return; }
  if (!detalleSheet) { Logger.log("ERROR: No se encontró la hoja 'Detalle_Envios_Full'"); return; }

  const lastRowMaestra = enviosSheet.getLastRow();
  const lastRowDetalle = detalleSheet.getLastRow();
  Logger.log(`Hoja Maestra ('Registro_Envios_Full') tiene ${lastRowMaestra} filas.`);
  Logger.log(`Hoja Detalle ('Detalle_Envios_Full') tiene ${lastRowDetalle} filas.`);

  const productosPorEnvio = {};
  if (lastRowDetalle > 1) {
    const detalleData = detalleSheet.getRange("A2:C" + lastRowDetalle).getValues();
    detalleData.forEach(row => {
      const idEnvio = row[0];
      if (!productosPorEnvio[idEnvio]) { productosPorEnvio[idEnvio] = []; }
      productosPorEnvio[idEnvio].push({ sku: row[1], cantidad: row[2] });
    });
  }
  Logger.log("Paso 1 (Detalle): Se agruparon productos para los siguientes IDs: " + Object.keys(productosPorEnvio).join(', '));

  let resultadoFinal = [];
  if (lastRowMaestra > 1) {
    const enviosData = enviosSheet.getRange("A2:H" + lastRowMaestra).getValues();
    Logger.log(`Paso 2 (Maestra): Se encontraron ${enviosData.length} filas de envíos para procesar.`);

    resultadoFinal = enviosData.map(row => {
      const idEnvio = row[0];
      if (!idEnvio) return null;
      return {
        id: idEnvio,
        estado: row[2],
        productos: productosPorEnvio[idEnvio] || []
      };
    }).filter(e => e);
  }
  
  Logger.log(`Paso 3 (Unión): El resultado final contiene ${resultadoFinal.length} envíos.`);
  Logger.log("--- FIN DIAGNÓSTICO ---");
  
  SpreadsheetApp.getUi().alert('Resultado del Diagnóstico',
    `Hoja Maestra tiene: ${lastRowMaestra} filas.\n` +
    `Hoja Detalle tiene: ${lastRowDetalle} filas.\n` +
    `Envíos encontrados y procesados: ${resultadoFinal.length}`,
    SpreadsheetApp.getUi().ButtonSet.OK);
}


/**
 * *** PRUEBA DIRECTA A LA API ***
 * Llama a la API de cargos con datos fijos que sabemos que funcionaron
 * en un diagnóstico anterior para aislar el problema.
 */
function probarApiDeCargos() {
  Logger.log("--- INICIO PRUEBA DIRECTA A API DE CARGOS ---");
  try {
    const token = getMeliService().getToken();
    if (!token) { Logger.log("Error: Token no válido."); return; }

    // Usamos exactamente los mismos datos que funcionaron en el diagnóstico del 26/07.
    const precio = 24550;
    const categoriaId = "MLA417006";
    const tipoPublicacion = "gold_special";
    const siteId = "MLA";

    Logger.log(`Probando con datos fijos: Precio=${precio}, CatID=${categoriaId}, Tipo=${tipoPublicacion}`);

    const url = `${MELI_API_BASE_URL}/sites/${siteId}/listing_prices?price=${precio}&listing_type_id=${tipoPublicacion}&category_id=${categoriaId}`;
    Logger.log("URL de prueba: " + url);

    const feeData = makeApiCall(url, token);

    Logger.log(">>> Respuesta DIRECTA de la API: " + JSON.stringify(feeData, null, 2));

    if (feeData && feeData.sale_fee_details) {
      Logger.log("Diagnóstico: El objeto 'sale_fee_details' FUE encontrado en la respuesta.");
    } else {
      Logger.log("Diagnóstico: El objeto 'sale_fee_details' NO fue encontrado en la respuesta.");
    }
    
  } catch (e) {
    Logger.log("Ocurrió un error catastrófico durante la prueba: " + e.message);
  }
  Logger.log("--- FIN PRUEBA ---");
  SpreadsheetApp.getUi().alert("Prueba directa finalizada. Revisa los logs.");
}


/**
 * *** NUEVA FUNCIÓN ***
 * Recibe una lista de productos y genera un PDF en formato Base64.
 * @param {Array<Object>} productos - Array de {sku, titulo, cantidad}.
 * @returns {Object} Un objeto con los datos del PDF para descargarlo en el navegador.
 */
function generarPdfBorrador(productos) {
  if (!productos || productos.length === 0) {
    throw new Error("No hay productos para generar el PDF.");
  }
  try {
    const fechaHoy = new Date().toLocaleDateString('es-AR');
    // Creamos el contenido del PDF usando HTML
    let html = `<h1>Borrador de Envío a Full</h1><p><b>Fecha de Generación:</b> ${fechaHoy}</p><hr>`;
    html += '<table style="width:100%; border-collapse: collapse; font-family: Arial, sans-serif;">';
    html += '<thead><tr><th style="border: 1px solid black; padding: 8px; text-align: left;">SKU</th><th style="border: 1px solid black; padding: 8px; text-align: left;">Título</th><th style="border: 1px solid black; padding: 8px; text-align: right;">Cantidad a Enviar</th></tr></thead><tbody>';
    
    productos.forEach(p => {
      html += `<tr><td style="border: 1px solid black; padding: 5px;">${p.sku}</td><td style="border: 1px solid black; padding: 5px;">${p.titulo}</td><td style="border: 1px solid black; padding: 5px; text-align: right;">${p.cantidad}</td></tr>`;
    });
    
    html += '</tbody></table>';

    // Convertimos el HTML a un PDF y lo codificamos en Base64 para enviarlo a la web
    const blob = Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF);
    const bytes = blob.getBytes();
    const base64Data = Utilities.base64Encode(bytes);
    
    return {
      data: base64Data,
      filename: `Borrador_Envio_${new Date().getTime()}.pdf`
    };
  } catch (e) {
    Logger.log("Error al generar PDF borrador: " + e.message);
    throw new Error("No se pudo generar el PDF.");
  }
}






/**
 * Obtiene una lista de todos los productos desde Hoja 1.
 * VERSIÓN CORREGIDA: Ahora incluye 'inventory_id' para el escaneo 3PL.
 * @returns {Array<Object>} Un array de objetos {sku, titulo, itemId, inventory_id}.
 */
function obtenerTodosLosProductosParaSelector() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!targetSheet || targetSheet.getLastRow() < 2) {
    return [];
  }
  
  // Leemos hasta la columna H para incluir Inventory_ID
  const data = targetSheet.getRange("A2:H" + targetSheet.getLastRow()).getValues();
  
  return data.map(row => {
      // Aseguramos que los campos existan para evitar errores undefined
      return { 
        sku: String(row[0] || ''), 
        titulo: String(row[1] || ''),
        itemId: String(row[6] || ''),
        inventory_id: String(row[7] || '') // <-- DATO CLAVE AÑADIDO
      };
    })
    // Filtramos solo si tiene al menos SKU o InventoryID para que sea escaneable
    .filter(p => p.sku || p.inventory_id);
}




/**
 * Función robusta que primero limpia las columnas de costos en Hoja 1,
 * y luego ejecuta la lógica de `obtenerDesgloseDeCargos` para rellenarlas
 * con datos frescos de la API, devolviendo el resultado final.
 * @returns {Array<Object>} - Los datos de los productos con los cargos recién calculados.
 */
function recalcularYObtenerCargos() {
  Logger.log("Iniciando proceso unificado de recálculo de cargos...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
  
  // Paso 1: Limpiar las columnas de costos (L a P)
  if (targetSheet.getLastRow() > 1) {
    // Columnas L(Comision) a P(Neto).
    targetSheet.getRange("L2:P" + targetSheet.getLastRow()).clearContent();
    Logger.log("Columnas de cargos (L:P) limpiadas.");
    // Forzamos a que la hoja guarde los cambios antes de seguir leyendo.
    SpreadsheetApp.flush(); 
  }

  // Paso 2: Ejecutar la lógica de obtención de cargos inmediatamente después.
  // Esta parte es una copia de la lógica de `obtenerDesgloseDeCargos`.
  const token = getMeliService().getToken();
  if (!token) { throw new Error("Token no válido para recálculo."); }
  const userId = getUserId(token);

  const range = targetSheet.getRange("A2:R" + targetSheet.getLastRow());
  const sheetData = range.getValues();
  let seHicieronCambios = false;

  for (let i = 0; i < sheetData.length; i++) {
    const row = sheetData[i];
    const itemId = row[6], precio = parseFloat(row[8]), categoriaId = row[9],
          tipoPublicacion = row[10], tipoLogistica = row[16], tieneEnvioGratis = row[17];

    // La condición ahora es más simple: si hay datos para calcular, procedemos.
    if (itemId && precio && categoriaId && tipoPublicacion) {
      seHicieronCambios = true;
      const siteId = categoriaId.substring(0, 3);
      
      const urlCargos = `${MELI_API_BASE_URL}/sites/${siteId}/listing_prices?price=${precio}&listing_type_id=${tipoPublicacion}&category_id=${categoriaId}`;
      const feeData = makeApiCall(urlCargos, token);
      
      let comision = 0, cargoFijo = 0, impuestos = 0;
      if (feeData && feeData.sale_fee_details) {
        cargoFijo = feeData.sale_fee_details.fixed_fee || 0;
        comision = (feeData.sale_fee_amount || 0) - cargoFijo;
        impuestos = feeData.taxes_amount || 0;
      }
      Utilities.sleep(API_CALL_DELAY / 2);

      let costoEnvio = 0;
      if (tipoLogistica && tieneEnvioGratis === 'Sí') {
        const params = `item_id=${itemId}&item_price=${precio}&listing_type_id=${tipoPublicacion}&logistic_type=${tipoLogistica}&condition=new&verbose=true&category_id=${categoriaId}`;
        const urlEnvio = `${MELI_API_BASE_URL}/users/${userId}/shipping_options/free?${params}`;
        const shippingData = makeApiCall(urlEnvio, token);
        if (shippingData && shippingData.coverage && shippingData.coverage.all_country) {
          costoEnvio = shippingData.coverage.all_country.list_cost || 0;
        }
      }
      
      sheetData[i][11] = comision > 0 ? comision : 0; // L: Comision_ML
      sheetData[i][12] = cargoFijo;                     // M: Cargo_Fijo_ML
      sheetData[i][13] = costoEnvio;                   // N: Costo_Envio_ML
      sheetData[i][14] = impuestos;                    // O: Impuestos_Estimados
      sheetData[i][15] = precio - comision - cargoFijo - costoEnvio - impuestos; // P: Neto_Estimado
    }
  }

  if (seHicieronCambios) {
    range.setValues(sheetData);
    targetSheet.getRange("I:I").setNumberFormat("$#,##0.00");
    targetSheet.getRange("L:P").setNumberFormat("$#,##0.00");
    Logger.log("Nuevos costos escritos en la hoja.");
  }

  // Paso 3: Devolver los datos recién calculados y formateados
  return sheetData.map(row => {
    const safeParseFloat = (val) => parseFloat(val) || 0;
    return {
      itemId: row[6], sku: row[0], titulo: row[1],
      precio: safeParseFloat(row[8]),
      comision: safeParseFloat(row[11]), cargoFijo: safeParseFloat(row[12]),
      costoEnvio: safeParseFloat(row[13]), impuestos: safeParseFloat(row[14]),
      netoEstimado: safeParseFloat(row[15])
    };
  });
}


// ▼▼▼ REEMPLAZA esta función ▼▼▼
function obtenerEstadoActualizacion() {
  const properties = PropertiesService.getScriptProperties();
  const ultimaActualizacionInicio = properties.getProperty('ultimaActualizacionInicio');
  const ultimaActualizacionExitosa = properties.getProperty('ultimaActualizacionExitosa');
  const ultimaOrden = obtenerFechaUltimaOrden();

  return {
    ultimaSincronizacionInicio: ultimaActualizacionInicio,
    ultimaSincronizacionExitosa: ultimaActualizacionExitosa,
    ultimoDato: ultimaOrden
  };
}



// ▼▼▼ AÑADE ESTA NUEVA FUNCIÓN COMPLETA ▼▼▼

/**
 * Herramienta de Diagnóstico: Consulta la API de promociones para un
 * Item ID específico y muestra la respuesta completa en los logs.
 */
function diagnosticarPromocionDeUnItem() {
  // --- IMPORTANTE: Edita esta línea y pon el ID de un producto que SEPAS que tiene una promo activa ---
  const itemIdDePrueba = "MLA1102761457"; 
  
  Logger.log(`--- DIAGNÓSTICO DE PROMOCIÓN PARA EL ITEM: ${itemIdDePrueba} ---`);
  
  const token = getMeliService().getToken();
  if (!token) {
    Logger.log("Error: No se pudo obtener el token.");
    SpreadsheetApp.getUi().alert("Error: No se pudo obtener el token.");
    return;
  }

  try {
    const promoUrl = `${MELI_API_BASE_URL}/seller-promotions/items/${itemIdDePrueba}?app_version=v2`;
    Logger.log("Consultando URL: " + promoUrl);
    
    const promoResponse = makeApiCall(promoUrl, token);
    
    Logger.log("--- RESPUESTA COMPLETA DE LA API ---");
    Logger.log(JSON.stringify(promoResponse, null, 2));
    Logger.log("------------------------------------");

    if (promoResponse && Array.isArray(promoResponse) && promoResponse.length > 0) {
        const promoActiva = promoResponse.find(p => p.status === 'started');
        if (promoActiva) {
            Logger.log("Diagnóstico: ¡Se encontró una promoción activa ('started')!");
            Logger.log(`Precio de Oferta (deal_price) encontrado: ${promoActiva.deal_price}`);
        } else {
            Logger.log("Diagnóstico: Se encontraron promociones, pero ninguna tiene el estado 'started'.");
        }
    } else {
        Logger.log("Diagnóstico: La API no devolvió promociones para este item (respuesta vacía, nula o no es un array).");
    }
    SpreadsheetApp.getUi().alert("Diagnóstico de promoción finalizado. Revisa los logs de ejecución para ver el resultado detallado.");

  } catch (e) {
    Logger.log(`Ocurrió un error crítico durante el diagnóstico: ${e.message}`);
    SpreadsheetApp.getUi().alert(`Ocurrió un error: ${e.message}. Revisa los logs.`);
  }
}

// ▼▼▼ AÑADE ESTA NUEVA FUNCIÓN COMPLETA ▼▼▼

/**
 * Herramienta de Diagnóstico: Consulta la nueva API de Precios para un
 * Item ID específico y muestra la respuesta completa en los logs.
 */
function diagnosticarApiDePrecios() {
  // --- IMPORTANTE: Edita esta línea con el ID de un producto para la prueba ---
  const itemIdDePrueba = "MLA1102761457"; // Usa un ID que SÍ tenga promo ahora
  
  Logger.log(`--- DIAGNÓSTICO DE API DE PRECIOS PARA EL ITEM: ${itemIdDePrueba} ---`);
  
  const token = getMeliService().getToken();
  if (!token) {
    Logger.log("Error: No se pudo obtener el token.");
    SpreadsheetApp.getUi().alert("Error: No se pudo obtener el token.");
    return;
  }

  try {
    const pricesUrl = `${MELI_API_BASE_URL}/items/${itemIdDePrueba}/prices`;
    Logger.log("Consultando URL: " + pricesUrl);
    
    const pricesResponse = makeApiCall(pricesUrl, token);
    
    Logger.log("--- RESPUESTA COMPLETA DE LA API DE PRECIOS ---");
    Logger.log(JSON.stringify(pricesResponse, null, 2));
    Logger.log("---------------------------------------------");

    SpreadsheetApp.getUi().alert("Diagnóstico de precios finalizado. Revisa los logs de ejecución para ver el resultado detallado.");

  } catch (e) {
    Logger.log(`Ocurrió un error crítico durante el diagnóstico: ${e.message}`);
    SpreadsheetApp.getUi().alert(`Ocurrió un error: ${e.message}. Revisa los logs.`);
  }
}




/**
 * Inicia o reanuda la preparación de un envío.
 * Si el envío no está en la hoja 'Preparacion_En_Curso', lo copia desde el detalle original.
 * Si ya está, simplemente lee el progreso guardado.
 * @param {string} idEnvio - El ID del envío a preparar.
 * @returns {Array<Object>} - La lista de productos del envío con su estado de preparación.
 */
function iniciarOReanudarPreparacion(idEnvio) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const prepSheet = ss.getSheetByName("Preparacion_En_Curso");
  const detalleSheet = ss.getSheetByName("Detalle_Envios_Full");
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);

  // Buscamos si el envío ya está en preparación
  const prepData = prepSheet.getDataRange().getValues();
  let productosEnPreparacion = prepData.filter(row => row[0] === idEnvio);

  // CASO 1: Reanudar un envío existente
  if (productosEnPreparacion.length > 0) {
    Logger.log(`Reanudando preparación para el envío: ${idEnvio}`);
    return productosEnPreparacion.map(row => ({
      sku: row[1],
      inventory_id: row[2],
      titulo: row[3],
      cantidad_requerida: row[4],
      cantidad_escaneada: row[5]
    }));
  }

  // CASO 2: Iniciar un nuevo envío
  Logger.log(`Iniciando nueva preparación para el envío: ${idEnvio}`);
  // Obtenemos los productos del envío original
  const detalleData = detalleSheet.getDataRange().getValues();
  const productosDelEnvio = detalleData.filter(row => row[0] === idEnvio);

  // Obtenemos info extra de la Hoja 1
  const targetData = targetSheet.getRange("A2:H" + targetSheet.getLastRow()).getValues();
  const skuInfoMap = {};
  targetData.forEach(row => {
    skuInfoMap[row[0]] = { titulo: row[1], inventory_id: row[7] };
  });

  const nuevasFilasParaGuardar = [];
  const datosParaCliente = [];

  productosDelEnvio.forEach(prod => {
    const sku = prod[1];
    const cantidad = prod[2];
    const info = skuInfoMap[sku] || { titulo: 'N/A', inventory_id: 'N/A' };
    
    // Preparamos la fila para guardar en la hoja de progreso
    nuevasFilasParaGuardar.push([
      idEnvio, sku, info.inventory_id, info.titulo, cantidad, 0 // Escaneados inicializa en 0
    ]);
    
    // Preparamos los datos para enviar de vuelta a la interfaz
    datosParaCliente.push({
      sku: sku,
      inventory_id: info.inventory_id,
      titulo: info.titulo,
      cantidad_requerida: cantidad,
      cantidad_escaneada: 0
    });
  });

  // Guardamos el nuevo estado en la hoja 'Preparacion_En_Curso'
  if (nuevasFilasParaGuardar.length > 0) {
    prepSheet.getRange(prepSheet.getLastRow() + 1, 1, nuevasFilasParaGuardar.length, 6).setValues(nuevasFilasParaGuardar);
  }

  return datosParaCliente;
}


/**
 * Registra un escaneo para un producto de un envío en curso.
 * Incrementa en 1 la cantidad escaneada en la hoja 'Preparacion_En_Curso'.
 * @param {string} idEnvio - El ID del envío que se está preparando.
 * @param {string} inventoryIdEscaneado - El ID de inventario que se escaneó.
 * @returns {Object} - Un objeto con el estado actualizado del producto o un mensaje de error.
 */
function registrarEscaneoDeProducto(idEnvio, inventoryIdEscaneado) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const prepSheet = ss.getSheetByName("Preparacion_En_Curso");
  
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const prepData = prepSheet.getDataRange().getValues();
    for (let i = 1; i < prepData.length; i++) {
      const rowData = prepData[i];
      const inventoryIdHoja = String(rowData[2]).trim().toUpperCase(); // <-- Limpiamos el ID de la hoja
      
      if (rowData[0] === idEnvio && inventoryIdHoja === inventoryIdEscaneado) { // La comparación ahora es segura
        const filaIndex = i + 1;
        const sku = rowData[1];
        const titulo = rowData[3];
        const requeridos = parseInt(rowData[4], 10);
        let escaneados = parseInt(rowData[5], 10);

        if (escaneados >= requeridos) {
          return { success: false, message: `Ya se completó la cantidad para ${sku}.` };
        }

        escaneados++;
        prepSheet.getRange(filaIndex, 6).setValue(escaneados);

        return {
          success: true, sku: sku, titulo: titulo,
          inventory_id: inventoryIdEscaneado,
          requeridos: requeridos, escaneados: escaneados
        };
      }
    }
    return { success: false, message: 'Producto no encontrado en este envío.' };
  } finally {
    lock.releaseLock();
  }
}




/**
 * Función interna de ayuda. No llamar directamente desde el cliente.
 * Actualiza el envío original con los productos finales, regenera el PDF,
 * cambia el estado y limpia la hoja de preparación.
 * @param {string} idEnvio - El ID del envío a finalizar.
 * @param {Array<Array>} productosFinales - Los productos con sus cantidades finales.
 */
function _actualizarEnvioFinalizado(idEnvio, productosFinales) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const enviosSheet = ss.getSheetByName('Registro_Envios_Full');
  const detalleSheet = ss.getSheetByName('Detalle_Envios_Full');
  const prepSheet = ss.getSheetByName("Preparacion_En_Curso");

  // 1. Modificar Detalle_Envios_Full con las cantidades reales
  const todosLosProductosDetalle = detalleSheet.getLastRow() > 1 ? detalleSheet.getRange("A2:C" + detalleSheet.getLastRow()).getValues() : [];
  const otrosEnvios = todosLosProductosDetalle.filter(row => row[0] !== idEnvio);
  const productosParaGuardar = productosFinales.map(p => [idEnvio, p.sku, p.cantidad_escaneada]);
  
  detalleSheet.getRange("A2:C" + detalleSheet.getMaxRows()).clearContent();
  if (otrosEnvios.length > 0) {
    detalleSheet.getRange(2, 1, otrosEnvios.length, 3).setValues(otrosEnvios);
  }
  if (productosParaGuardar.length > 0) {
    detalleSheet.getRange(detalleSheet.getLastRow() + 1, 1, productosParaGuardar.length, 3).setValues(productosParaGuardar);
  }

  // 2. Regenerar PDF y actualizar Registro_Envios_Full
  const enviosData = enviosSheet.getRange("A2:A" + enviosSheet.getLastRow()).getValues();
  for (let i = 0; i < enviosData.length; i++) {
    if (enviosData[i][0] === idEnvio) {
      const filaEnvio = i + 2;
      const fechaColecta = enviosSheet.getRange(filaEnvio, 5).getValue();
      // Mapeamos los productos al formato que necesita la función del PDF
      const productosParaPdf = productosFinales.map(p => ({ sku: p.sku, titulo: p.titulo, cantidad: p.cantidad_escaneada }));
      const nuevoLinkPdf = generarPdfDeEnvio(idEnvio, fechaColecta, productosParaPdf);
      
      enviosSheet.getRange(filaEnvio, 3).setValue("Listo para Despachar"); // Nuevo estado
      enviosSheet.getRange(filaEnvio, 7).setValue(nuevoLinkPdf); // Actualizamos link del PDF
      break;
    }
  }

  // 3. Limpiar de Preparacion_En_Curso
  const prepData = prepSheet.getDataRange().getValues();
  const filasAEliminar = [];
  for (let i = prepData.length - 1; i >= 1; i--) {
    if (prepData[i][0] === idEnvio) {
      filasAEliminar.push(i + 1);
    }
  }
  filasAEliminar.forEach(numFila => prepSheet.deleteRow(numFila));
}





/**
 * Verifica el estado de una preparación. Si todo está completo, finaliza el envío.
 * Si hay discrepancias, devuelve un mensaje para que el usuario confirme.
 * @param {string} idEnvio - El ID del envío a verificar.
 * @returns {Object} - Resultado de la verificación.
 * Verifica el estado de una preparación. Si hay discrepancias, devuelve
 * un resumen conciso en lugar de la lista completa.
 * @param {string} idEnvio - El ID del envío a verificar.
 * @returns {Object} - Resultado de la verificación.
 */
function verificarYFinalizarPreparacion(idEnvio) {
  const prepSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Preparacion_En_Curso");
  const prepData = prepSheet.getDataRange().getValues();
  const productosDelEnvio = prepData.filter(row => row[0] === idEnvio);

  const faltantes = [];
  const productosFinales = [];

  productosDelEnvio.forEach(row => {
    const requerido = parseInt(row[4], 10);
    const escaneado = parseInt(row[5], 10);
    if (escaneado < requerido) {
      faltantes.push({ sku: row[1], faltan: requerido - escaneado });
    }
    if (escaneado > 0) {
        productosFinales.push({ sku: row[1], titulo: row[3], cantidad_escaneada: escaneado });
    }
  });

  // --- LÓGICA MODIFICADA PARA EL MENSAJE ---
  if (faltantes.length > 0) {
    const numeroDeProductosFaltantes = faltantes.length;
    const totalUnidadesFaltantes = faltantes.reduce((sum, p) => sum + p.faltan, 0);

    let mensaje = `¡Atención! Hay discrepancias en la preparación:\n\n`;
    mensaje += `- Productos con faltantes: ${numeroDeProductosFaltantes}\n`;
    mensaje += `- Unidades totales faltantes: ${totalUnidadesFaltantes}\n\n`;
    mensaje += `¿Deseas finalizar de todos modos y actualizar el envío con las cantidades reales preparadas?`;
    
    return { necesitaConfirmacion: true, mensaje: mensaje };
  } else {
    _actualizarEnvioFinalizado(idEnvio, productosFinales);
    return { necesitaConfirmacion: false, mensaje: `¡Envío ${idEnvio} preparado correctamente y finalizado!` };
  }
}





/**
 * Finaliza un envío CON discrepancias después de la confirmación del usuario.
 * @param {string} idEnvio - El ID del envío a finalizar.
 * @returns {Object} - Resultado de la operación.
 */
function confirmarFinalizacionConDiscrepancias(idEnvio) {
    const prepSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Preparacion_En_Curso");
    const prepData = prepSheet.getDataRange().getValues();
    const productosDelEnvio = prepData.filter(row => row[0] === idEnvio);

    const productosFinales = [];
    productosDelEnvio.forEach(row => {
        const escaneado = parseInt(row[5], 10);
        if (escaneado > 0) {
            productosFinales.push({ sku: row[1], titulo: row[3], cantidad_escaneada: escaneado });
        }
    });

    _actualizarEnvioFinalizado(idEnvio, productosFinales);
    return { success: true, mensaje: `Envío ${idEnvio} finalizado y actualizado con ${productosFinales.length} productos.` };
}



/**
 * Ajusta la cantidad escaneada de un producto en +/- 1.
 * @param {string} idEnvio - El ID del envío.
 * @param {string} inventoryId - El ID de inventario del producto.
 * @param {number} ajuste - El valor a sumar (1 para sumar, -1 para restar).
 * @returns {Object} - El estado actualizado del producto.
 */
function ajustarCantidadEscaneada(idEnvio, inventoryId, ajuste) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const prepSheet = ss.getSheetByName("Preparacion_En_Curso");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const prepData = prepSheet.getDataRange().getValues();
    for (let i = 1; i < prepData.length; i++) {
      const rowData = prepData[i];
      const inventoryIdHoja = String(rowData[2]).trim().toUpperCase();
      
      if (rowData[0] === idEnvio && inventoryIdHoja === inventoryId) {
        const filaIndex = i + 1;
        const requeridos = parseInt(rowData[4], 10);
        let escaneados = parseInt(rowData[5], 10);

        const nuevaCantidad = escaneados + ajuste;

        if (nuevaCantidad > requeridos) {
          return { success: false, message: "No se puede escanear más de lo requerido." };
        }
        if (nuevaCantidad < 0) {
          return { success: false, message: "La cantidad no puede ser negativa." };
        }

        prepSheet.getRange(filaIndex, 6).setValue(nuevaCantidad);

        return {
          success: true, sku: rowData[1], titulo: rowData[3],
          inventory_id: inventoryId, requeridos: requeridos, escaneados: nuevaCantidad
        };
      }
    }
    return { success: false, message: 'Producto no encontrado.' };
  } finally {
    lock.releaseLock();
  }
}




/**
 * Herramienta de Diagnóstico: Consulta la API de visitas para un lote
 * de items y muestra la respuesta completa en los logs para analizar su estructura.
 */
function diagnosticarApiDeVisitas() {
  Logger.log("--- INICIANDO DIAGNÓSTICO DE API DE VISITAS ---");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (targetSheet.getLastRow() < 2) {
    Logger.log("Hoja 1 no tiene suficientes datos para la prueba.");
    return;
  }
  
  const token = getMeliService().getToken();
  if (!token) {
    Logger.log("Error: No se pudo obtener el token.");
    return;
  }

  try {
    // Tomamos hasta 20 IDs de la Hoja 1 para la prueba
    const numItems = Math.min(20, targetSheet.getLastRow() - 1);
    const itemIds = targetSheet.getRange("G2:G" + (numItems + 1)).getValues().flat();
    const chunk = itemIds.filter(id => id); // Filtramos celdas vacías
    
    Logger.log(`Probando con ${chunk.length} IDs: ${chunk.join(',')}`);

    const date90daysAgo = new Date(); 
    date90daysAgo.setDate(date90daysAgo.getDate() - 90);
    const urlVisits = `${MELI_API_BASE_URL}/items/visits?ids=${chunk.join(',')}&date_from=${Utilities.formatDate(date90daysAgo, "GMT", "yyyy-MM-dd")}&date_to=${Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd")}`;

    Logger.log("Consultando URL: " + urlVisits);
    
    // Hacemos la llamada directa para ver la respuesta sin procesar
    const response = UrlFetchApp.fetch(urlVisits, {
      headers: { 'Authorization': `Bearer ${token}` },
      muteHttpExceptions: true
    });
    const responseText = response.getContentText();
    
    Logger.log("--- RESPUESTA COMPLETA DE LA API DE VISITAS ---");
    try {
      // Intentamos formatear el JSON para que sea más legible
      const jsonResponse = JSON.parse(responseText);
      Logger.log(JSON.stringify(jsonResponse, null, 2));
    } catch(e) {
      // Si no es un JSON válido, mostramos el texto plano
      Logger.log("La respuesta no es un JSON válido. Texto recibido:");
      Logger.log(responseText);
    }
    Logger.log("---------------------------------------------");

    SpreadsheetApp.getUi().alert("Diagnóstico de visitas finalizado. Revisa los logs de ejecución para ver el resultado detallado.");

  } catch (e) {
    Logger.log(`Ocurrió un error crítico durante el diagnóstico: ${e.message}`);
    SpreadsheetApp.getUi().alert(`Ocurrió un error: ${e.message}. Revisa los logs.`);
  }
}


/**
 * Resetea a cero el progreso de preparación de un envío específico.
 * @param {string} idEnvio - El ID del envío a resetear.
 * @returns {string} - Un mensaje de confirmación.
 */
function resetearProgresoDeEnvio(idEnvio) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const prepSheet = ss.getSheetByName('Preparacion_En_Curso');
  
  if (prepSheet.getLastRow() <= 1) return `No había progreso que resetear para ${idEnvio}.`;
  
  const prepData = prepSheet.getDataRange().getValues();
  const filasAEliminar = [];
  let encontrado = false;
  for (let i = prepData.length - 1; i >= 1; i--) {
    if (prepData[i][0] === idEnvio) {
      filasAEliminar.push(i + 1);
      encontrado = true;
    }
  }
  
  if (encontrado) {
    filasAEliminar.forEach(numFila => prepSheet.deleteRow(numFila));
    return `El progreso del envío ${idEnvio} ha sido reseteado a cero.`;
  } else {
    return `No se encontró progreso para el envío ${idEnvio}.`;
  }
}


// ▼▼▼ AÑADE esta nueva función ▼▼▼
/**
 * Herramienta de corrección: Elimina el progreso de preparación de un envío específico.
 * Se debe editar el 'idEnvioACorregir' antes de ejecutar.
 */
function corregirPreparacionEnCurso() {
  // --- ¡IMPORTANTE! Edita esta línea con el ID del envío que quieres corregir ---
  const idEnvioACorregir = "ENV-1756313225869"; 
  
  if (idEnvioACorregir === "") {
    SpreadsheetApp.getUi().alert("Error", "Debes editar el script y especificar el ID del envío a corregir.", SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const prepSheet = ss.getSheetByName('Preparacion_En_Curso');
  
  if (prepSheet.getLastRow() <= 1) {
    SpreadsheetApp.getUi().alert("Información", "La hoja de preparación está vacía. No hay nada que corregir.", SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  const prepData = prepSheet.getDataRange().getValues();
  const filasAEliminar = [];
  let encontrado = false;
  for (let i = prepData.length - 1; i >= 1; i--) {
    if (prepData[i][0] === idEnvioACorregir) {
      filasAEliminar.push(i + 1);
      encontrado = true;
    }
  }
  
  if (encontrado) {
    filasAEliminar.forEach(numFila => prepSheet.deleteRow(numFila));
    SpreadsheetApp.getUi().alert("Éxito", `Se ha corregido y reseteado el progreso del envío ${idEnvioACorregir}.`, SpreadsheetApp.getUi().ButtonSet.OK);
  } else {
    SpreadsheetApp.getUi().alert("Información", `No se encontró ningún progreso guardado para el envío ${idEnvioACorregir}.`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}


// ▼▼▼ AÑADE ESTA NUEVA FUNCIÓN COMPLETA ▼▼▼

/**
 * Herramienta de Diagnóstico para PropertiesService.
 * Lee los timestamps de actualización y realiza una prueba de escritura/lectura.
 */
function diagnosticarPropiedadesDelScript() {
  Logger.log("--- INICIANDO DIAGNÓSTICO DE PROPIEDADES ---");
  
  const properties = PropertiesService.getScriptProperties();
  
  // 1. Leemos los valores actuales
  const inicio = properties.getProperty('ultimaActualizacionInicio');
  const exito = properties.getProperty('ultimaActualizacionExitosa');
  
  Logger.log(`Valor actual de 'ultimaActualizacionInicio': ${inicio}`);
  Logger.log(`Valor actual de 'ultimaActualizacionExitosa': ${exito}`);
  
  // 2. Hacemos una prueba de escritura
  const ahora = new Date().toISOString();
  properties.setProperty('pruebaDeEscritura', ahora);
  Logger.log(`Intentando escribir valor de prueba: ${ahora}`);
  
  // 3. Leemos inmediatamente el valor que acabamos de escribir
  const lecturaDePrueba = properties.getProperty('pruebaDeEscritura');
  Logger.log(`Leyendo valor de prueba inmediatamente después: ${lecturaDePrueba}`);
  
  let mensaje = "Resultados del Diagnóstico de Memoria:\n\n";
  mensaje += `Fecha de Inicio guardada: ${inicio || 'No encontrada'}\n`;
  mensaje += `Fecha de Éxito guardada: ${exito || 'No encontrada'}\n\n`;
  
  if (lecturaDePrueba === ahora) {
    mensaje += "✅ PRUEBA DE ESCRITURA/LECTURA: ¡EXITOSA!";
    Logger.log("Diagnóstico: La escritura y lectura de propiedades funciona correctamente.");
  } else {
    mensaje += "❌ PRUEBA DE ESCRITURA/LECTURA: ¡FALLIDA!";
    Logger.log("Diagnóstico: Hay un problema al escribir o leer propiedades.");
  }
  
  SpreadsheetApp.getUi().alert("Diagnóstico de Memoria", mensaje, SpreadsheetApp.getUi().ButtonSet.OK);
}


// ▼▼▼ AÑADE ESTA NUEVA FUNCIÓN COMPLETA ▼▼▼

/**
 * Herramienta de Diagnóstico Definitiva: Consulta los 3 endpoints clave
 * (Items, Prices, Promotions) para un Item ID específico y muestra
 * las respuestas completas en los logs para un análisis detallado.
 */
function diagnosticoCompletoDeItem() {
  // --- IMPORTANTE: Edita esta línea con el ID de un producto para la prueba ---
  const itemIdDePrueba = "MLA1377389338"; // Cambia este ID
  
  Logger.log(`--- DIAGNÓSTICO COMPLETO PARA EL ITEM: ${itemIdDePrueba} ---`);
  
  const token = getMeliService().getToken();
  if (!token) {
    Logger.log("Error: No se pudo obtener el token.");
    return;
  }

  try {
    // 1. Consulta al endpoint de ITEMS (para el 'status')
    const itemUrl = `${MELI_API_BASE_URL}/items/${itemIdDePrueba}?attributes=id,status,price,original_price`;
    Logger.log("\n--- 1. RESPUESTA DE LA API DE ITEMS ---");
    const itemResponse = makeApiCall(itemUrl, token);
    Logger.log(JSON.stringify(itemResponse, null, 2));

    // 2. Consulta al endpoint de PRICES (para la estructura de precios)
    const pricesUrl = `${MELI_API_BASE_URL}/items/${itemIdDePrueba}/prices`;
    Logger.log("\n--- 2. RESPUESTA DE LA API DE PRECIOS ---");
    const pricesResponse = makeApiCall(pricesUrl, token);
    Logger.log(JSON.stringify(pricesResponse, null, 2));

    // 3. Consulta al endpoint de PROMOTIONS (para la info de campañas)
    const promoUrl = `${MELI_API_BASE_URL}/seller-promotions/items/${itemIdDePrueba}?app_version=v2`;
    Logger.log("\n--- 3. RESPUESTA DE LA API DE PROMOCIONES ---");
    const promoResponse = makeApiCall(promoUrl, token);
    Logger.log(JSON.stringify(promoResponse, null, 2));

    Logger.log("\n--- FIN DEL DIAGNÓSTICO ---");
    SpreadsheetApp.getUi().alert("Diagnóstico completo finalizado. Revisa los logs de ejecución para ver los 3 resultados.");

  } catch (e) {
    Logger.log(`Ocurrió un error crítico durante el diagnóstico: ${e.message}`);
    SpreadsheetApp.getUi().alert(`Ocurrió un error: ${e.message}. Revisa los logs.`);
  }
}





/**
 * *** VERSIÓN 2.0 - ESTRATEGIA "PLAN B" ***
 * Busca en Mercado Libre publicaciones basadas en el título de un producto de referencia (q=...),
 * ya que la búsqueda por seller_id de terceros está bloqueada (403).
 * Filtra los resultados para excluir las publicaciones del propio usuario.
 * @param {string} tituloProducto - El título del producto a buscar.
 * @returns {Array<Object>} - Una lista de publicaciones de competidores.
 */
function buscarPublicacionesDeCompetencia(tituloProducto) {
  if (!tituloProducto) {
    throw new Error("Se debe proporcionar un título de producto para buscar.");
  }
  
  const token = getMeliService().getToken();
  if (!token) { throw new Error("Token no válido."); }
  const userId = getUserId(token);

  // Limpiamos y codificamos el título para que sea un buen término de búsqueda
  const query = encodeURIComponent(tituloProducto);
  
  // Usamos el endpoint de búsqueda general con el parámetro 'q'
  const url = `${MELI_API_BASE_URL}/sites/MLA/search?q=${query}&limit=50`;
  
  Logger.log("Consultando competencia con URL: " + url);

  // Volvemos a usar la autenticación en el header, que es la práctica estándar
  const response = makeApiCall(url, token);

  if (!response || !response.results || !Array.isArray(response.results)) {
    Logger.log("La búsqueda de competencia no devolvió resultados válidos. Respuesta: " + JSON.stringify(response));
    return [];
  }

  const competidores = response.results
    .filter(item => item.seller && item.seller.id !== userId) // Quitamos nuestros propios resultados
    .map(item => {
      return {
        id: item.id,
        titulo: item.title,
        nickname_vendedor: item.seller.nickname,
        seller_id: item.seller.id,
        precio: item.price,
        vendidos: item.sold_quantity,
        stock: item.available_quantity,
        link: item.permalink
      };
    });

  Logger.log(`Búsqueda por "${tituloProducto}" encontró ${competidores.length} competidores.`);
  return competidores;
}



/**
 * *** VERSIÓN FINAL Y COMPLETA (v2.5) ***
 * Recopila todo el historial de una publicación para un período dinámico,
 * incluyendo los datos para colorear los intervalos de promoción y de pausa en el gráfico.
 */
function obtenerDatosHistoricosDePublicacion(itemId, diasAAnalizar) {
  diasAAnalizar = diasAAnalizar || 90;
  let respuesta = {
    kpis: { ventas: 0, facturacionNeta: 0, visitas: 0, conversion: 0, estado: 'Desconocido' },
    datosGrafico: [],
    eventos: []
  };

  try {
    const itemIdStr = String(itemId);
    if (!itemIdStr) { throw new Error("Se requiere un ID de publicación para el análisis."); }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ordersSheet = ss.getSheetByName(ORDERS_DETAIL_SHEET_NAME);
    const visitsSheet = ss.getSheetByName(DAILY_VISITS_SHEET_NAME);
    const statusSheet = ss.getSheetByName(ESTADOS_HISTORIAL_SHEET_NAME);
    const pricesSheet = ss.getSheetByName('Historial_Cambio_Precios');
    const promosSheet = ss.getSheetByName('Meli_Historial_Promociones');

    const hoy = new Date();
    const fechaInicio = new Date();
    fechaInicio.setDate(hoy.getDate() - diasAAnalizar);

    const ventasPorDia = {}, visitasPorDia = {}, eventos = [];
    let estadoActual = 'Desconocido', totalFacturacionNeta = 0;

    // 1. Recopilar Ventas y Facturación
    if (ordersSheet && ordersSheet.getLastRow() > 1) {
      const orderData = ordersSheet.getRange("C2:K" + ordersSheet.getLastRow()).getValues(); 
      orderData.forEach(row => {
        if (String(row[2]) === itemIdStr && new Date(row[0]) >= fechaInicio) {
          const fechaStr = Utilities.formatDate(new Date(row[0]), "GMT", "yyyy-MM-dd");
          ventasPorDia[fechaStr] = (ventasPorDia[fechaStr] || 0) + (parseFloat(row[4]) || 0);
          totalFacturacionNeta += parseFloat(row[8]) || 0;
        }
      });
    }

    // 2. Recopilar Visitas
    if (visitsSheet && visitsSheet.getLastRow() > 1) {
      const visitData = visitsSheet.getRange("A2:C" + visitsSheet.getLastRow()).getValues();
      visitData.forEach(row => {
        if (String(row[0]) === itemIdStr && new Date(row[1]) >= fechaInicio) {
          const fechaStr = Utilities.formatDate(new Date(row[1]), "GMT", "yyyy-MM-dd");
          visitasPorDia[fechaStr] = (visitasPorDia[fechaStr] || 0) + (parseFloat(row[2]) || 0);
        }
      });
    }
    
    // 3. Recopilar Historial de Pausas y Eventos de Estado
    const pausasEnPeriodo = new Set();
    if (statusSheet && statusSheet.getLastRow() > 1) {
      const statusData = statusSheet.getDataRange().getValues();
      let estadoAnterior = null;
      for (let i = statusData.length - 1; i >= 1; i--) {
        if (String(statusData[i][1]) === itemIdStr) {
          estadoActual = statusData[i][4];
          break;
        }
      }
      statusData.forEach(row => {
        const fechaEstado = new Date(row[0]);
        if (String(row[1]) === itemIdStr && fechaEstado >= fechaInicio) {
          const estadoFila = row[4];
          if (estadoAnterior && estadoFila !== estadoAnterior) {
            eventos.push({ fecha: fechaEstado, tipo: 'Estado', descripcion: `Cambió a '${estadoFila}'` });
          }
          if (estadoFila === 'paused') {
            pausasEnPeriodo.add(Utilities.formatDate(fechaEstado, "GMT", "yyyy-MM-dd"));
          }
          estadoAnterior = estadoFila;
        }
      });
    }

    // 4. Recopilar Eventos de Cambio de Precio
    if (pricesSheet && pricesSheet.getLastRow() > 1) {
      const priceData = pricesSheet.getRange("A2:E" + pricesSheet.getLastRow()).getValues();
      priceData.forEach(row => {
        if (String(row[1]) === itemIdStr && new Date(row[0]) >= fechaInicio) {
          const precioAnterior = parseFloat(row[3]).toFixed(2);
          const precioNuevo = parseFloat(row[4]).toFixed(2);
          eventos.push({ fecha: new Date(row[0]), tipo: 'Precio', descripcion: `Cambió de $${precioAnterior} a $${precioNuevo}` });
        }
      });
    }

    // 5. Recopilar Historial de Promociones
    const promosActivasEnPeriodo = new Set();
    if (promosSheet && promosSheet.getLastRow() > 1) {
      const promoData = promosSheet.getRange("A2:B" + promosSheet.getLastRow()).getValues();
      promoData.forEach(row => {
        const fechaPromo = new Date(row[0]);
        if (String(row[1]) === itemIdStr && fechaPromo >= fechaInicio) {
          promosActivasEnPeriodo.add(Utilities.formatDate(fechaPromo, "GMT", "yyyy-MM-dd"));
        }
      });
    }
    
    // 6. Consolidar datos para el gráfico y calcular KPIs
    const datosGrafico = [];
    let totalVentas = 0, totalVisitas = 0;
    const diasSemana = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
    let maximoEjeY = 1;

    // Pre-calculamos el máximo para la altura del área
    for (let i = 0; i < diasAAnalizar; i++) {
      let fechaIteradora = new Date(fechaInicio);
      fechaIteradora.setUTCDate(fechaIteradora.getUTCDate() + i);
      const fechaStr = Utilities.formatDate(fechaIteradora, "GMT", "yyyy-MM-dd");
      const ventasDelDia = ventasPorDia[fechaStr] || 0;
      const visitasDelDia = visitasPorDia[fechaStr] || 0;
      if (visitasDelDia > maximoEjeY) maximoEjeY = visitasDelDia;
      if (ventasDelDia > maximoEjeY) maximoEjeY = ventasDelDia;
    }

    for (let i = 0; i < diasAAnalizar; i++) {
      let fechaIteradora = new Date(fechaInicio);
      fechaIteradora.setUTCDate(fechaIteradora.getUTCDate() + i);
      const fechaStr = Utilities.formatDate(fechaIteradora, "GMT", "yyyy-MM-dd");
      const diaTxt = diasSemana[fechaIteradora.getUTCDay()];
      const fechaTxt = Utilities.formatDate(fechaIteradora, "GMT", "dd/MM");
      const diaLabel = `${diaTxt} ${fechaTxt}`;
      const ventasDelDia = ventasPorDia[fechaStr] || 0;
      const visitasDelDia = visitasPorDia[fechaStr] || 0;
      
      const valorPromo = promosActivasEnPeriodo.has(fechaStr) ? maximoEjeY : null;
      const valorPausa = pausasEnPeriodo.has(fechaStr) ? maximoEjeY : null;
      
      datosGrafico.push([diaLabel, ventasDelDia, visitasDelDia, valorPromo, valorPausa]);
      totalVentas += ventasDelDia;
      totalVisitas += visitasDelDia;
    }

    eventos.sort((a, b) => a.fecha - b.fecha);
    respuesta = {
      kpis: { ventas: totalVentas, facturacionNeta: totalFacturacionNeta, visitas: totalVisitas, conversion: totalVisitas > 0 ? (totalVentas / totalVisitas) * 100 : 0, estado: estadoActual },
      datosGrafico: datosGrafico,
      eventos: eventos.map(e => ({...e, fecha: e.fecha.toISOString()}))
    };

  } catch (e) {
    Logger.log(`Error en obtenerDatosHistoricosDePublicacion para ${itemId}: ${e.message}`);
  }
  
  return respuesta;
}



/**
 * Obtiene un resumen de rendimiento para todas las publicaciones en un período determinado.
 * @param {number} dias - El número de días hacia atrás para analizar.
 * @returns {Array<Object>} Un array de objetos, donde cada objeto es una publicación con sus KPIs.
 */
function obtenerResumenDeRendimiento(dias) {
  Logger.log(`--- INICIANDO Resumen de Rendimiento para ${dias} días ---`);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
  const ordersSheet = ss.getSheetByName(ORDERS_DETAIL_SHEET_NAME);
  const visitsSheet = ss.getSheetByName(DAILY_VISITS_SHEET_NAME);
  const statusSheet = ss.getSheetByName(ESTADOS_HISTORIAL_SHEET_NAME);

  const fechaInicio = new Date();
  fechaInicio.setDate(new Date().getDate() - dias);

  const ventasMap = {};
  const visitsMap = {};
  const ultimoEstadoMap = {};

  if (ordersSheet.getLastRow() > 1) {
    ordersSheet.getRange("C2:K" + ordersSheet.getLastRow()).getValues().forEach(row => {
      const fechaPago = new Date(row[0]);
      if (fechaPago >= fechaInicio) {
        const itemId = String(row[2]);
        const fechaStr = Utilities.formatDate(fechaPago, "GMT", "yyyy-MM-dd");
        if (!ventasMap[itemId]) ventasMap[itemId] = { ventas: 0, facturacion: 0, diasDeVenta: new Set() };
        ventasMap[itemId].ventas += parseFloat(row[4]) || 0;
        ventasMap[itemId].facturacion += parseFloat(row[8]) || 0;
        ventasMap[itemId].diasDeVenta.add(fechaStr);
      }
    });
  }
  
  if (visitsSheet.getLastRow() > 1) {
    visitsSheet.getRange("A2:C" + visitsSheet.getLastRow()).getValues().forEach(row => {
      const fechaVisita = new Date(row[1]);
      if (fechaVisita >= fechaInicio) {
        const itemId = String(row[0]);
        const fechaStr = Utilities.formatDate(fechaVisita, "GMT", "yyyy-MM-dd");
        if (!visitsMap[itemId]) visitsMap[itemId] = { visitas: 0, diasDeVisita: new Set() };
        visitsMap[itemId].visitas += parseFloat(row[2]) || 0;
        visitsMap[itemId].diasDeVisita.add(fechaStr);
      }
    });
  }

  if (statusSheet.getLastRow() > 1) {
    const statusData = statusSheet.getDataRange().getValues();
    for (let i = statusData.length - 1; i >= 1; i--) {
      const itemId = String(statusData[i][1]);
      if (!ultimoEstadoMap[itemId]) {
        ultimoEstadoMap[itemId] = statusData[i][4];
      }
    }
  }
  
  const productosData = targetSheet.getRange("A2:G" + targetSheet.getLastRow()).getValues();
  const resumenFinal = productosData.map(row => {
    const sku = row[0];
    const titulo = row[1];
    const itemId = String(row[6]);

    const ventasData = ventasMap[itemId] || { ventas: 0, facturacion: 0, diasDeVenta: new Set() };
    const visitasData = visitsMap[itemId] || { visitas: 0, diasDeVisita: new Set() };
    const conversion = visitasData.visitas > 0 ? (ventasData.ventas / visitasData.visitas) * 100 : 0;
    
    return {
      sku: sku,
      titulo: titulo,
      visitas: visitasData.visitas,
      ventas: ventasData.ventas,
      facturacion: ventasData.facturacion,
      conversion: conversion,
      estadoActual: ultimoEstadoMap[itemId] || 'desconocido',
      diasConVentas: ventasData.diasDeVenta.size,
      diasConVisitas: visitasData.diasDeVisita.size
    };
  });

  return resumenFinal;
}



// ▼▼▼ AÑADE ESTE BLOQUE COMPLETO DE TRES FUNCIONES ▼▼▼

/**
 * Función principal que genera la documentación de todas las hojas.
 */
function generarDocumentacionDeHojas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  ss.toast("Iniciando generación de documentación...", "Procesando", -1);
  Logger.log("Iniciando la documentación de las hojas...");

  let documentacionTXT = "MEMORIA TÉCNICA DE HOJAS - PROYECTO GESTOR ML\n";
  documentacionTXT += `Generado el: ${new Date().toLocaleString('es-AR')}\n`;
  documentacionTXT += "==================================================\n\n";

  const hojas = ss.getSheets();
  
  hojas.forEach(hoja => {
    const nombreHoja = hoja.getName();
    Logger.log(`Procesando hoja: ${nombreHoja}`);
    documentacionTXT += `HOJA: "${nombreHoja}"\n`;
    documentacionTXT += "--------------------------------------------------\n";

    if (hoja.getLastRow() === 0) {
      documentacionTXT += "Esta hoja está vacía.\n\n";
      return; // Pasamos a la siguiente hoja
    }

    const ultimaColumna = hoja.getLastColumn();
    const encabezados = hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0];
    
    let datosFila2 = [];
    if (hoja.getLastRow() > 1) {
      datosFila2 = hoja.getRange(2, 1, 1, ultimaColumna).getValues()[0];
    } else {
      datosFila2 = new Array(ultimaColumna).fill(""); // Si solo hay encabezado, creamos un array vacío
    }

    documentacionTXT += "Indice | Letra | Nombre Columna (Fila 1) | Tipo de Dato (basado en Fila 2)\n";
    
    for (let i = 0; i < ultimaColumna; i++) {
      const letraColumna = columnaALetra(i + 1);
      const nombreColumna = encabezados[i] || "(Columna Vacía)";
      const datoEjemplo = datosFila2[i];
      const tipoDato = detectarTipoDeDato(datoEjemplo);
      
      documentacionTXT += `${i + 1} | ${letraColumna} | ${nombreColumna} | ${tipoDato}\n`;
    }
    documentacionTXT += "\n==================================================\n\n";
  });

  try {
    const nombreArchivo = `Documentacion_AppMeli_${new Date().toISOString().split('T')[0]}.txt`;
    DriveApp.createFile(nombreArchivo, documentacionTXT, MimeType.PLAIN_TEXT);
    Logger.log("Archivo de documentación creado en Google Drive.");
    ss.toast("¡Éxito! Se ha creado el archivo " + nombreArchivo + " en tu Google Drive.", "Completado", 10);
  } catch (e) {
    Logger.log(`Error al crear el archivo TXT: ${e.message}`);
    ui.alert("Error al crear el archivo. Asegúrate de tener permisos para crear archivos en Google Drive.");
  }
}

/**
 * Función de ayuda para detectar el tipo de dato de una celda.
 * @param {*} valor - El valor de la celda.
 * @returns {string} - El tipo de dato detectado.
 */
function detectarTipoDeDato(valor) {
  if (valor === null || valor === "") {
    return "Vacío";
  }
  if (valor instanceof Date) {
    return "Fecha / Hora";
  }
  if (typeof valor === 'number') {
    return "Número";
  }
  if (typeof valor === 'boolean') {
    return "Booleano (Verdadero/Falso)";
  }
  if (typeof valor === 'string') {
    if (valor.startsWith('http')) {
      return "URL (Texto)";
    }
    if (valor.startsWith('=')) {
      return "Fórmula";
    }
    return "Texto";
  }
  return "Desconocido";
}

/**
 * Función de ayuda para convertir un índice de columna a su letra (ej. 1 -> A, 27 -> AA).
 * @param {number} columna - El índice de la columna (base 1).
 * @returns {string} - La letra de la columna.
 */
function columnaALetra(columna) {
  let letra = "", temp;
  while (columna > 0) {
    temp = (columna - 1) % 26;
    letra = String.fromCharCode(temp + 65) + letra;
    columna = (columna - temp - 1) / 26;
  }
  return letra;
}

// ▼▼▼ AÑADE ESTA NUEVA FUNCIÓN COMPLETA ▼▼▼

/**
 * Herramienta de Diagnóstico: Consulta la API de /items pidiendo todos los atributos
 * clave de stock y envío para una publicación híbrida (Full + Flex).
 */
function diagnosticarStockHibrido() {
  const ui = SpreadsheetApp.getUi();
  
  // --- ¡IMPORTANTE! Edita esta línea con el ID de un producto que tenga FULL y FLEX activos ---
  const itemIdDePrueba = "MLA1597516148"; 
  
  if (itemIdDePrueba === "MLA_DE_PRUEBA_AQUI") {
    ui.alert("Por favor, edita el script 'diagnosticarStockHibrido' y pon un ID de publicación (MLA...) que tenga Full y Flex activos.");
    return;
  }
  
  Logger.log(`--- DIAGNÓSTICO DE STOCK HÍBRIDO PARA: ${itemIdDePrueba} ---`);
  
  const token = getMeliService().getToken();
  if (!token) {
    Logger.log("Error: No se pudo obtener el token.");
    return;
  }

  try {
    // Pedimos todos los atributos que nos interesan:
    // - shipping: Para ver el logistic_type y los 'tags' (como 'self_service_in' de Flex)
    // - available_quantity: El stock principal (generalmente el de tu depósito)
    // - variations: El stock de Full suele estar aquí dentro
    // - attributes: Para el SKU
    const atributos = "id,title,seller_sku,status,shipping,available_quantity,variations,attributes";
    const url = `${MELI_API_BASE_URL}/items/${itemIdDePrueba}?attributes=${atributos}`;
    
    Logger.log("Consultando URL: " + url);
    const response = makeApiCall(url, token);
    
    Logger.log("--- RESPUESTA COMPLETA DE LA API ---");
    Logger.log(JSON.stringify(response, null, 2)); // Imprimimos el JSON formateado
    Logger.log("------------------------------------");

    ui.alert("Diagnóstico finalizado. Revisa los logs de ejecución (en el editor de Apps Script) para ver la respuesta completa de la API.");

  } catch (e) {
    Logger.log(`Ocurrió un error crítico durante el diagnóstico: ${e.message}`);
    ui.alert(`Ocurrió un error: ${e.message}. Revisa los logs.`);
  }
}



// ▼▼▼ REEMPLAZA esta función ▼▼▼
function obtenerResumenDeStock() {
  Logger.log("--- Iniciando obtenerResumenDeStock (v4.1 - Con Estado) ---");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
  
  const token = getMeliService().getToken();
  if (!token) { throw new Error("Token no válido."); }
  const userId = getUserId(token);

  const itemsParaProcesar = [];
  if (targetSheet.getLastRow() > 1) {
    targetSheet.getRange("A2:G" + targetSheet.getLastRow()).getValues().forEach(row => {
      if (row[6]) { itemsParaProcesar.push({ itemId: row[6], sku: row[0], titulo: row[1] }); }
    });
  }
  Logger.log(`Se procesarán ${itemsParaProcesar.length} publicaciones desde Hoja 1.`);

  const datosStock = [];
  const CHUNK_SIZE = 20;

  for (let i = 0; i < itemsParaProcesar.length; i += CHUNK_SIZE) {
    const chunkDeItems = itemsParaProcesar.slice(i, i + CHUNK_SIZE);
    const itemIds = chunkDeItems.map(p => p.itemId);
    
    // Pedimos el estado, el user_product_id y el shipping
    const atributos = "id,status,shipping,user_product_id"; 
    const urlItems = `${MELI_API_BASE_URL}/items?ids=${itemIds.join(',')}&attributes=${atributos}`;
    
    try {
      const itemsResponse = makeApiCall(urlItems, token);
      
      if (itemsResponse && Array.isArray(itemsResponse)) {
        for (const itemResult of itemsResponse) {
          if (itemResult.code === 200 && itemResult.body) {
            const item = itemResult.body;
            const infoHoja1 = chunkDeItems.find(p => p.itemId === item.id);

            let stockDeposito = 0;
            let stockFull = 0;
            let tieneFlex = (item.shipping && item.shipping.tags && item.shipping.tags.includes('self_service_in'));
            let tipoLogistica = (item.shipping && item.shipping.logistic_type) ? item.shipping.logistic_type : 'desconocido';

            // Usamos el user_product_id para consultar el stock distribuido
            if (item.user_product_id) {
              const urlStock = `${MELI_API_BASE_URL}/user-products/${item.user_product_id}/stock`;
              const stockResponse = makeApiCall(urlStock, token);

              if (stockResponse && stockResponse.locations && Array.isArray(stockResponse.locations)) {
                stockResponse.locations.forEach(loc => {
                  if (loc.type === 'meli_facility') {
                    stockFull += loc.quantity || 0;
                  } else if (loc.type === 'selling_address') {
                    stockDeposito += loc.quantity || 0;
                  }
                });
              }
            }

            datosStock.push({
              itemId: item.id,
              sku: infoHoja1.sku,
              titulo: infoHoja1.titulo,
              estado: item.status, // <-- Dato añadido
              tipoLogistica: tipoLogistica,
              stockDeposito: stockDeposito,
              stockFull: stockFull,
              tieneFlex: tieneFlex
            });
            Utilities.sleep(200);
          }
        }
      }
    } catch (e) {
      Logger.log(`Error procesando lote de stock: ${e.message}`);
    }
    Utilities.sleep(API_CALL_DELAY);
  }
  return datosStock;
}



// ▼▼▼ REEMPLAZA esta función ▼▼▼

/**
 * Recibe un lote de cambios de stock, estado (pausa) y Flex, y los aplica
 * usando los métodos correctos de la API.
 * VERSIÓN FINAL (Payload Limpio): Construye un objeto 'shipping' limpio
 * solo con los campos modificables.
 */
function actualizarStockYFlexEnLote(cambios) {
  if (!cambios || cambios.length === 0) {
    throw new Error("No se recibieron cambios para procesar.");
  }
  
  const token = getMeliService().getToken();
  if (!token) { throw new Error("Token no válido."); }
  const userId = getUserId(token);

  const exitosos = [];
  const fallidos = [];

  Logger.log(`Iniciando actualización en lote para ${cambios.length} items...`);

  for (const cambio of cambios) {
    const itemId = cambio.itemId;
    let sku = cambio.sku;

    try {
      // --- Tarea 1: Actualizar Estado (Activa/Pausada) ---
      if (cambio.estadoCambiado) {
        Logger.log(`Actualizando estado para ${itemId}. Nuevo estado: ${cambio.nuevoEstado}`);
        const urlEstado = `${MELI_API_BASE_URL}/items/${itemId}`;
        const payloadEstado = { status: cambio.nuevoEstado };
        makeApiCall(urlEstado, token, { method: 'put', payload: JSON.stringify(payloadEstado) });
        Utilities.sleep(API_CALL_DELAY);
      }

      // --- Tarea 2: Actualizar Stock del Depósito ---
      if (cambio.stockCambiado) {
        Logger.log(`Actualizando stock para ${itemId}. Nuevo stock: ${cambio.nuevoStock}`);
        const urlStock = `${MELI_API_BASE_URL}/user-products/${cambio.userProductId}/stock`;
        const payloadStock = {
          locations: [{ type: "selling_address", quantity: cambio.nuevoStock }]
        };
        makeApiCall(urlStock, token, { method: 'put', payload: JSON.stringify(payloadStock) });
        Utilities.sleep(API_CALL_DELAY);
      }

      // --- Tarea 3: Actualizar Estado de Flex (LÓGICA CORREGIDA) ---
      if (cambio.flexCambiado) {
        Logger.log(`Actualizando Flex para ${itemId}. Nuevo estado: ${cambio.nuevoFlex}`);
        
        // 1. LEEMOS la configuración de envío actual
        const itemData = makeApiCall(`${MELI_API_BASE_URL}/items/${itemId}?attributes=shipping`, token);
        if (!itemData || !itemData.shipping) throw new Error("No se pudo leer el envío para modificar Flex.");
        
        const shippingOriginal = itemData.shipping;
        
        // 2. Convertimos logistic_type a un array de strings simple
        let logisticTypesRaw = shippingOriginal.logistic_type || [];
        let logisticTypes = [];
        if (Array.isArray(logisticTypesRaw)) {
          logisticTypes = logisticTypesRaw.map(lt => (typeof lt === 'object') ? lt.logistic_type : lt);
        } else if (typeof logisticTypesRaw === 'object' && logisticTypesRaw.logistic_type) {
          logisticTypes = [logisticTypesRaw.logistic_type];
        } else if (typeof logisticTypesRaw === 'string') {
          logisticTypes = [logisticTypesRaw];
        }

        // 3. Modificamos el array de logistic_type
        if (cambio.nuevoFlex) {
          if (!logisticTypes.includes('self_service')) logisticTypes.push('self_service');
        } else {
          logisticTypes = logisticTypes.filter(lt => lt !== 'self_service');
        }

        // 4. --- CORRECCIÓN CLAVE: Creamos un payload LIMPIO ---
        // Incluimos solo los campos que SÍ podemos modificar
        const payloadLimpio = {
          shipping: {
            mode: shippingOriginal.mode,
            local_pick_up: shippingOriginal.local_pick_up,
            free_shipping: shippingOriginal.free_shipping,
            logistic_type: logisticTypes
            // Omitimos 'dimensions', 'store_pick_up', 'tags', etc.
          }
        };

        // 5. ENVIAMOS el objeto shipping LIMPIO Y MODIFICADO
        const urlUpdate = `${MELI_API_BASE_URL}/items/${itemId}`;
        Logger.log(`Enviando payload de Flex: ${JSON.stringify(payloadLimpio)}`);
        
        makeApiCall(urlUpdate, token, { method: 'put', payload: JSON.stringify(payloadLimpio) });
        Utilities.sleep(API_CALL_DELAY);
      }

      exitosos.push(itemId);

    } catch (e) {
      Logger.log(`Error al procesar ${itemId}: ${e.message}`);
      fallidos.push({ itemId: itemId, sku: sku, error: e.message });
    }
  }

  return { exitosos: exitosos, fallidos: fallidos };
}

// ▼▼▼ REEMPLAZA esta función ▼▼▼

/**
 * Herramienta de Diagnóstico v4: Prueba DUAL de activación y desactivación de Flex
 * usando los endpoints POST y DELETE correctos.
 */
function diagnosticarApiFlex() {
  const ui = SpreadsheetApp.getUi();
  
  // --- ¡IMPORTANTE! Edita estas dos líneas ---
  const itemParaACTIVAR = "MLA900492814"; // Un item Normal (drop_off) que NO tenga Flex
  const itemParaDESACTIVAR = "MLA900493199"; // Un item que SÍ tenga Flex activo
  
  if (itemParaACTIVAR === "MLA_SIN_FLEX_AQUI" || itemParaDESACTIVAR === "MLA_CON_FLEX_AQUI") {
    ui.alert("Por favor, edita el script 'diagnosticarApiFlex' y define los dos IDs de prueba.");
    return;
  }
  
  Logger.log(`--- DIAGNÓSTICO DE API FLEX (v4 - Prueba Dual) ---`);
  
  const token = getMeliService().getToken();
  if (!token) { Logger.log("Error: No se pudo obtener el token."); return; }
  const userId = getUserId(token);

  try {
    // --- PRUEBA 1: ACTIVAR FLEX (POST) ---
    Logger.log(`\n--- PRUEBA 1: Intentando ACTIVAR Flex para ${itemParaACTIVAR} ---`);
    const urlPost = `${MELI_API_BASE_URL}/users/${userId}/shipping_options/self_service_in/items/${itemParaACTIVAR}`;
    const optionsPost = { method: 'post', headers: { 'Authorization': `Bearer ${token}` }, muteHttpExceptions: true };
    
    const responsePost = UrlFetchApp.fetch(urlPost, optionsPost);
    Logger.log(`POST a ${urlPost} -> Código: ${responsePost.getResponseCode()}`);
    Logger.log(`Respuesta (POST): ${responsePost.getContentText()}`);
    
    Utilities.sleep(1000); // Pausa

    // --- PRUEBA 2: DESACTIVAR FLEX (DELETE) ---
    Logger.log(`\n--- PRUEBA 2: Intentando DESACTIVAR Flex para ${itemParaDESACTIVAR} ---`);
    const urlDelete = `${MELI_API_BASE_URL}/users/${userId}/shipping_options/self_service_in/items/${itemParaDESACTIVAR}`;
    const optionsDelete = { method: 'delete', headers: { 'Authorization': `Bearer ${token}` }, muteHttpExceptions: true };
    
    const responseDelete = UrlFetchApp.fetch(urlDelete, optionsDelete);
    Logger.log(`DELETE a ${urlDelete} -> Código: ${responseDelete.getResponseCode()}`);
    Logger.log(`Respuesta (DELETE): ${responseDelete.getContentText()}`);
    
    Logger.log("\n--- FIN DEL DIAGNÓSTICO DUAL ---");
    ui.alert("Prueba Dual de Flex Finalizada", "Se intentó activar y desactivar Flex. Por favor, revisa los logs de ejecución para ver los códigos de respuesta de la API.", ui.ButtonSet.OK);

  } catch (e) {
    Logger.log(`Ocurrió un error crítico durante el diagnóstico: ${e.message}`);
    ui.alert(`Ocurrió un error: ${e.message}. Revisa los logs.`);
  }
}


//=========================== Gestion deposito Externo ==============
 

/**
 * VERSIÓN 3.2: Reconciliación Completa.
 * Obtiene el stock de depósito (usando user-products) Y TAMBIÉN el user_product_id,
 * que es necesario para la función de guardado/ajuste.
 * @param {Object} stockExcel - Un objeto ej: {"SKU1": 50, "SKU2": 33}
 * @returns {Array<Object>} Un array con los datos comparados.
 */
function reconciliarStockConAPI(stockExcel) {
  Logger.log(`Iniciando reconciliación (v3.2) para ${Object.keys(stockExcel).length} SKUs.`);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
  
  const token = getMeliService().getToken();
  if (!token) { throw new Error("Token no válido."); }

  // 1. Obtenemos nuestra lista maestra de productos desde Hoja 1
  const itemsParaProcesar = [];
  if (targetSheet.getLastRow() > 1) {
    targetSheet.getRange("A2:G" + targetSheet.getLastRow()).getValues().forEach(row => {
      const sku = String(row[0]).trim().toUpperCase();
      if (stockExcel[sku] !== undefined) {
        itemsParaProcesar.push({
          itemId: row[6], sku: sku, titulo: row[1]
        });
      }
    });
  }
  Logger.log(`Se encontraron ${itemsParaProcesar.length} productos coincidentes en Hoja 1.`);

  const datosReconciliados = [];
  const CHUNK_SIZE = 20;

  for (let i = 0; i < itemsParaProcesar.length; i += CHUNK_SIZE) {
    const chunkDeItems = itemsParaProcesar.slice(i, i + CHUNK_SIZE);
    const itemIds = chunkDeItems.map(p => p.itemId);
    
    // Paso A: Consultamos /items para obtener el user_product_id y el estado
    const atributos = "id,status,user_product_id";
    const urlItems = `${MELI_API_BASE_URL}/items?ids=${itemIds.join(',')}&attributes=${atributos}`;
    
    try {
      const itemsResponse = makeApiCall(urlItems, token);
      
      if (itemsResponse && Array.isArray(itemsResponse)) {
        itemsResponse.forEach(itemResult => {
          if (itemResult.code === 200 && itemResult.body) {
            const item = itemResult.body;
            const infoHoja1 = chunkDeItems.find(p => p.itemId === item.id);

            let stockDepositoAPI = 0;
            const estadoAPI = item.status || 'desconocido';

            // Paso B: Usamos el user_product_id para consultar el stock distribuido
            if (item.user_product_id) {
              const urlStock = `${MELI_API_BASE_URL}/user-products/${item.user_product_id}/stock`;
              const stockResponse = makeApiCall(urlStock, token);
              if (stockResponse && stockResponse.locations && Array.isArray(stockResponse.locations)) {
                const locacionDeposito = stockResponse.locations.find(loc => loc.type === 'selling_address');
                if (locacionDeposito) {
                  stockDepositoAPI = locacionDeposito.quantity || 0;
                }
              }
            }
            
            const estaEnExcel = (stockExcel[infoHoja1.sku] !== undefined);
            const tieneStockEnML = (stockDepositoAPI > 0 && estadoAPI === 'active');
            
            if (estaEnExcel || tieneStockEnML) {
              const stockExcelFinal = stockExcel[infoHoja1.sku] || 0;
              const diferencia = stockDepositoAPI - stockExcelFinal;

              datosReconciliados.push({
                itemId: item.id,
                userProductId: item.user_product_id, // <-- DATO CRÍTICO AÑADIDO
                sku: infoHoja1.sku,
                titulo: infoHoja1.titulo,
                stockExcel: estaEnExcel ? stockExcel[infoHoja1.sku] : null,
                stockAPI: stockDepositoAPI,
                diferencia: diferencia
              });
            }
            Utilities.sleep(200);
          }
        });
      }
    } catch (e) {
      Logger.log(`Error procesando lote de reconciliación: ${e.message}`);
    }
    Utilities.sleep(API_CALL_DELAY);
  }

  datosReconciliados.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
  Logger.log(`--- Fin de Reconciliación. Se procesaron ${datosReconciliados.length} items ---`);
  return datosReconciliados;
}


/**
 * Recibe una lista de productos con discrepancias y ajusta el stock
 * en ML (solo el de 'selling_address') para que coincida con el stock del Excel.
 * @param {Array<Object>} productosParaAjustar - Lista de productos filtrada por el cliente.
 * @returns {Object} - Un resumen de {exitosos: [], fallidos: []}
 */
function ajustarStockDesdeExcel(productosParaAjustar) {
  if (!productosParaAjustar || productosParaAjustar.length === 0) {
    throw new Error("No se recibieron productos para ajustar.");
  }
  
  const token = getMeliService().getToken();
  if (!token) { throw new Error("Token no válido."); }

  const exitosos = [];
  const fallidos = [];

  Logger.log(`Iniciando ajuste de stock desde Excel para ${productosParaAjustar.length} items...`);

  for (const producto of productosParaAjustar) {
    const { itemId, sku, userProductId, nuevoStock } = producto;

    try {
      // Validamos que tengamos los datos necesarios
      if (!userProductId) {
        throw new Error("No se encontró el user_product_id para este item.");
      }
      if (isNaN(nuevoStock)) {
        throw new Error("El stock del Excel no es un número válido.");
      }

      Logger.log(`Ajustando stock para ${itemId} (SKU: ${sku}). Nuevo stock: ${nuevoStock}`);
      
      // Usamos el endpoint de /user-products para actualizar el stock de 'selling_address'
      const urlStock = `${MELI_API_BASE_URL}/user-products/${userProductId}/stock`;
      const payloadStock = {
        locations: [{
          type: "selling_address",
          quantity: nuevoStock
        }]
      };
      
      makeApiCall(urlStock, token, { method: 'put', payload: JSON.stringify(payloadStock) });

      exitosos.push(itemId);

    } catch (e) {
      Logger.log(`Error al ajustar ${itemId}: ${e.message}`);
      fallidos.push({ itemId: itemId, sku: sku, error: e.message });
    }
    Utilities.sleep(API_CALL_DELAY); // Pausa obligatoria entre cada item
  }

  Logger.log(`Ajuste finalizado. Éxitos: ${exitosos.length}, Fallidos: ${fallidos.length}`);
  return { exitosos: exitosos, fallidos: fallidos };
}


// ▼▼▼ AÑADE ESTE BLOQUE DE FUNCIONES AL FINAL ▼▼▼

/**
 * Guarda el estado actual de la preparación 3PL en una hoja temporal.
 * Sobrescribe cualquier borrador anterior.
 */
function guardarBorrador3PL(productos) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = "Temporal_3PL";
  let tempSheet = ss.getSheetByName(sheetName);
  
  if (!tempSheet) {
    tempSheet = ss.insertSheet(sheetName);
    // La ocultamos para que no moleste visualmente
    tempSheet.hideSheet();
  }
  
  tempSheet.clear(); // Borramos lo anterior

  if (productos && productos.length > 0) {
    // Preparamos los datos para guardar: SKU, Título, Cantidad, InventoryID
    const dataToSave = productos.map(p => [p.sku, p.titulo, p.cantidad, p.inventory_id || '']);
    // Añadimos encabezado por claridad
    dataToSave.unshift(["SKU", "Título", "Cantidad", "Inventory_ID"]);
    
    tempSheet.getRange(1, 1, dataToSave.length, 4).setValues(dataToSave);
    return `Progreso guardado: ${productos.length} productos.`;
  } else {
    return "Borrador vacío (se eliminó el progreso anterior).";
  }
}

/**
 * Verifica si existe un borrador 3PL guardado y lo devuelve.
 */
function cargarBorrador3PL() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tempSheet = ss.getSheetByName("Temporal_3PL");
  
  if (!tempSheet || tempSheet.getLastRow() < 2) {
    return []; // No hay borrador
  }
  
  // Leemos desde la fila 2
  const data = tempSheet.getRange(2, 1, tempSheet.getLastRow() - 1, 4).getValues();
  
  // Convertimos de vuelta al formato de objeto
  return data.map(row => ({
    sku: String(row[0]),
    titulo: String(row[1]),
    cantidad: parseInt(row[2]),
    inventory_id: String(row[3])
  }));
}

/**
 * Borra la hoja temporal (se usa al finalizar un envío).
 */
function eliminarBorrador3PL() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tempSheet = ss.getSheetByName("Temporal_3PL");
  if (tempSheet) {
    tempSheet.clear();
  }
}



/**
 * Registra un nuevo envío a 3PL en las hojas correspondientes.
 * @param {Object} datosEnvio - { transporte, bultos, valorDeclarado, notas }
 * @param {Array} productos - Lista de productos escaneados [{sku, titulo, cantidad}]
 */
function registrarEnvio3PL(datosEnvio, productos) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const registroSheet = ss.getSheetByName('Registro_Envios_3PL');
  const detalleSheet = ss.getSheetByName('Detalle_Envios_3PL');

  if (!registroSheet || !detalleSheet) { throw new Error("Faltan las hojas de registro 3PL."); }

  const idEnvio = "3PL-" + new Date().getTime(); // Generamos un ID único
  const fechaCreacion = new Date();
  const estadoInicial = "Enviado";

  // 1. Guardar Cabecera
  registroSheet.appendRow([
    idEnvio,
    fechaCreacion,
    estadoInicial,
    datosEnvio.transporte,
    datosEnvio.bultos,
    datosEnvio.valorDeclarado,
    '', // Placeholder para Link Remito (lo haremos luego)
    '', // Placeholder para Link Etiquetas (lo haremos luego)
    datosEnvio.notas
  ]);

  // 2. Guardar Detalle
  const filasDetalle = productos.map(p => [
    idEnvio,
    p.sku,
    p.titulo,
    p.cantidad,
    0, // Recibido 3PL (inicialmente 0 o vacío)
    0  // Diferencia
  ]);
  
  if (filasDetalle.length > 0) {
    detalleSheet.getRange(detalleSheet.getLastRow() + 1, 1, filasDetalle.length, 6).setValues(filasDetalle);
  }

  return { success: true, idEnvio: idEnvio, message: `Envío ${idEnvio} registrado correctamente.` };
}


// =========================================
//    MÓDULO DE GESTIÓN 3PL Y GENERACIÓN PDF
// =========================================

// Datos fijos de Blue Mail (Tu destinatario 3PL)
const DESTINATARIO_3PL = {
  razonSocial: "Blue Mail SA",
  cuit: "30-70296910-3",
  domicilio: "Gral Martin de Gainza 801 , Nave 26, 1736 - Moreno - Buenos Aires",
  contacto: "Nicolas Becerra",
  telefono: "+5491122857280"
};

/**
 * VERSIÓN MEJORADA: Registra el envío Y genera los PDFs automáticamente.
 */
function registrarEnvio3PL(datosEnvio, productos) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const registroSheet = ss.getSheetByName('Registro_Envios_3PL');
  const detalleSheet = ss.getSheetByName('Detalle_Envios_3PL');

  if (!registroSheet || !detalleSheet) { throw new Error("Faltan las hojas de registro 3PL."); }

  // 1. Generamos ID y Fecha
  const idEnvio = "3PL-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmm");
  const fechaCreacion = new Date();

  // 2. ¡NUEVO! Generamos los PDFs antes de guardar
  // Preparamos los datos para las plantillas
  const datosParaPDF = {
    idEnvio: idEnvio,
    fecha: Utilities.formatDate(fechaCreacion, Session.getScriptTimeZone(), "dd/MM/yyyy"),
    transporte: datosEnvio.transporte,
    bultos: datosEnvio.bultos,
    totalBultos: parseInt(datosEnvio.bultos), // Aseguramos que sea número para el bucle
    valorDeclarado: datosEnvio.valorDeclarado,
    notas: datosEnvio.notas,
    destinatario: DESTINATARIO_3PL,
    totalUnidades: productos.reduce((sum, p) => sum + p.cantidad, 0)
  };

  // Llamamos a nuestra "impresora virtual"
  const linksPDF = generarDocumentacion3PL(datosParaPDF, productos);

  // 3. Guardamos en la Hoja de Registro (ahora con links reales)
  registroSheet.appendRow([
    idEnvio,
    fechaCreacion,
    "Enviado",
    datosEnvio.transporte,
    datosEnvio.bultos,
    datosEnvio.valorDeclarado,
    linksPDF.remito,   // Link al PDF del Remito
    linksPDF.etiquetas,// Link al PDF de Etiquetas
    datosEnvio.notas
  ]);

  // 4. Guardamos el detalle de productos
  const filasDetalle = productos.map(p => [
    idEnvio,
    p.sku,
    p.titulo,
    p.cantidad,
    0, 0 // Columnas para control posterior (recibido/diferencia)
  ]);
  
  if (filasDetalle.length > 0) {
    detalleSheet.getRange(detalleSheet.getLastRow() + 1, 1, filasDetalle.length, 6).setValues(filasDetalle);
  }

  return { 
    success: true, 
    idEnvio: idEnvio, 
    message: `Envío ${idEnvio} registrado correctamente.`,
    links: linksPDF // Devolvemos los links por si queremos mostrarlos al instante
  };
}

/**
 * FUNCIÓN "IMPRESORA": Genera los PDFs y los guarda en Drive.
 */
function generarDocumentacion3PL(datos, productos) {
  try {
    // 1. Conseguir o crear la carpeta en Drive
    const nombreCarpeta = "Remitos 3PL (Automáticos)";
    let carpeta;
    const carpetas = DriveApp.getFoldersByName(nombreCarpeta);
    if (carpetas.hasNext()) {
      carpeta = carpetas.next();
    } else {
      carpeta = DriveApp.createFolder(nombreCarpeta);
    }

    // 2. Generar REMITO
    // Tomamos la plantilla 'Modelo_Remito'
    const templateRemito = HtmlService.createTemplateFromFile('Modelo_Remito');
    templateRemito.datos = datos;         // Pasamos los datos a la plantilla
    templateRemito.productos = productos; // Pasamos los productos

    const blobRemito = templateRemito.evaluate().getBlob();
    const pdfRemito = carpeta.createFile(blobRemito.setName(`Remito_${datos.idEnvio}.pdf`));

    // 3. Generar ETIQUETAS
    // Tomamos la plantilla 'Modelo_Etiqueta'
    const templateEtiquetas = HtmlService.createTemplateFromFile('Modelo_Etiqueta');
    templateEtiquetas.datos = datos; // La plantilla ya tiene el bucle para generar todas las páginas

    const blobEtiquetas = templateEtiquetas.evaluate().getBlob();
    const pdfEtiquetas = carpeta.createFile(blobEtiquetas.setName(`Etiquetas_${datos.idEnvio}.pdf`));

    // 4. Devolver las URLs para poder verlos
    return {
      remito: pdfRemito.getUrl(),
      etiquetas: pdfEtiquetas.getUrl()
    };

  } catch (e) {
    Logger.log("Error generando PDFs: " + e.message);
    // Si falla, devolvemos links vacíos para no romper todo el proceso de registro
    return { remito: "Error al generar", etiquetas: "Error al generar" };
  }
}

