// ============================================================================
// --- ARCHIVO: Main.gs ---
// ============================================================================
// Descripción: Punto de entrada principal. Contiene onOpen para crear el menú
//              y las funciones de orquestación principales.
// ============================================================================

function onOpen() {
  // Solo creamos las hojas que SÍ vamos a usar
  const encabezadosPreparacion = ["ID_Envio", "SKU", "Inventory_ID", "Titulo", "Cantidad_Requerida", "Cantidad_Escaneada"];
  crearHojaSiNoExiste("Preparacion_En_Curso", encabezadosPreparacion);

  // --- NUEVAS HOJAS PARA 3PL ---
  crearHojaSiNoExiste("Registro_Envios_3PL", ["ID_Envio", "Fecha_Creacion", "Estado", "Transporte", "Cant_Bultos", "Valor_Declarado", "Link_Remito", "Link_Etiquetas", "Notas"]);
  crearHojaSiNoExiste("Detalle_Envios_3PL", ["ID_Envio", "SKU", "Titulo", "Cantidad_Enviada", "Cantidad_Recibida_3PL", "Diferencia"]);

  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛒 Mercado Libre')
    .addItem('🔑 Iniciar Autorización', 'iniciarAutorizacion')
    .addSeparator()
    .addItem('🔄 Actualizar TODO (Forzado)', 'dispararActualizacionPorPasos') // Llama a la nueva función de pasos
    .addSeparator()
    .addSubMenu(ui.createMenu('⚙️ Configuración y Diagnóstico')
      .addItem('🧹 Limpiar Toda la Caché', 'clearCache')
      .addItem('🆔 Limpiar Caché de IDs de Ítems', 'borrarCacheItemIds')
      .addItem('🩺 Diagnóstico General del Script', 'ejecutarDiagnosticoCompleto')
      .addItem('Sincronizar Atributos de Full', 'actualizarAtributosDeFull')
      .addSeparator()
      .addItem('🚛 Diagnosticar API de Flex', 'diagnosticarApiFlex')
      .addItem('📦 Diagnosticar Stock Híbrido (Full/Flex)', 'diagnosticarStockHibrido') // <-- AÑADIDO
      .addItem('📄 Regenerar PDF de Envío', 'iniciarRegeneracionDePdf')
    )
    .addSeparator()
    .addItem('❌ Revocar Token Mercado Libre', 'revocarMeli')
    .addToUi();
}

// Función placeholder para el menú
function doNothingPlaceholder() {}


/**
 * Inicia la secuencia de actualizaciones por pasos.
 * Esta es la función que será llamada por el trigger principal y el botón de forzar.
 */
function dispararActualizacionPorPasos() {
  // Guardamos la hora de inicio
  PropertiesService.getScriptProperties().setProperty('ultimaActualizacionInicio', new Date().toISOString());
  
  // Borramos cualquier trigger viejo que haya quedado colgado
  crearSiguienteTrigger(null);
  
  // Ejecutamos la primera tarea de la cadena inmediatamente
  paso1_ActualizarOrdenes();
}



/**
 * Función placeholder para opciones de menú en desarrollo.
 */
function proximamentePlaceholder() {
  SpreadsheetApp.getUi().alert('Funcionalidad en Desarrollo', 'Esta característica estará disponible próximamente.', SpreadsheetApp.getUi().ButtonSet.OK);
}




/**
 * Función de ayuda para crear una hoja si no existe, con sus encabezados.
 * @param {string} nombreHoja - El nombre de la hoja a crear.
 * @param {Array<string>} encabezados - Un array con los títulos de las columnas.
 */
function crearHojaSiNoExiste(nombreHoja, encabezados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) {
    hoja = ss.insertSheet(nombreHoja);
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    Logger.log(`Hoja "${nombreHoja}" creada con éxito.`);
  }
}




/**
 * *** NUEVA FUNCIÓN DE BÚSQUEDA PROFUNDA DE SKU ***
 * Busca el SKU en un objeto de item de la API, siguiendo la jerarquía de
 * precedencia descrita en la documentación de Mercado Libre.
 * @param {Object} item - El objeto de item completo devuelto por la API.
 * @returns {string|null} El SKU encontrado o null si no se encuentra en ningún campo.
 */
function buscarSkuEnItem(item) {
  // Prioridad 1: Atributo SELLER_SKU dentro de las variaciones
  if (item.variations && item.variations.length > 0) {
    for (const variation of item.variations) {
      if (variation.attributes) {
        const skuAttr = variation.attributes.find(attr => attr.id === 'SELLER_SKU');
        if (skuAttr && skuAttr.value_name) {
          return skuAttr.value_name; // Encontrado, es la máxima prioridad
        }
      }
    }
    // Si ninguna variación tiene SELLER_SKU, buscamos en el campo heredado de la primera variación
    if (item.variations[0].seller_custom_field) {
      return item.variations[0].seller_custom_field;
    }
  }

  // Prioridad 2: Atributo SELLER_SKU a nivel de la publicación
  if (item.attributes) {
    const skuAttr = item.attributes.find(attr => attr.id === 'SELLER_SKU');
    if (skuAttr && skuAttr.value_name) {
      return skuAttr.value_name;
    }
  }
  
  // Prioridad 3: Campo heredado seller_custom_field a nivel de la publicación
  if (item.seller_custom_field) {
    return item.seller_custom_field;
  }

  return null; // No se encontró en ningún lado
}




/**
 * Función unificada para ejecutar varias pruebas de diagnóstico.
 */
function ejecutarDiagnosticoCompleto() {
  Logger.log("Ejecutando diagnóstico completo del script...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Ejecutando diagnóstico...", "Diagnóstico", -1);

  const resultado = {
    timestamp: new Date().toISOString(),
    autenticacion: verificarAutenticacion(), // De Auth.gs
  };

  const ui = SpreadsheetApp.getUi();
  let mensajeDialogo = `Diagnóstico Completado:\n\nAutenticación: ${resultado.autenticacion.autenticado ? '✅ OK' : '❌ Fallida'}\n\n`;
  if(!resultado.autenticacion.autenticado){
      mensajeDialogo += `Mensaje: ${resultado.autenticacion.mensaje}\n\n`;
  }
  mensajeDialogo += "Consulta los logs (Menú Extensiones > Apps Script > Ejecuciones) para más detalles técnicos.";
  ui.alert("Resultado del Diagnóstico", mensajeDialogo, ui.ButtonSet.OK);
  
  ss.toast("Diagnóstico completado.", "Diagnóstico", 10);
  return resultado;
}



/**
 * *** FUNCIÓN DE INVESTIGACIÓN AVANZADA DE SKU ***
 * Consulta 3 endpoints diferentes para un Item ID específico para encontrar
 * dónde almacena Mercado Libre el dato del SKU.
 */
function investigarSkuAvanzado() {
  const itemId = "MLA1589621722"; // El ID de la publicación que nos interesa
  Logger.log(`--- INICIO INVESTIGACIÓN AVANZADA DE SKU para ${itemId} ---`);
  
  const token = getMeliService().getToken();
  if (!token) { Logger.log("No se pudo obtener token."); return; }

  // --- 1. Consulta al endpoint principal /items/{itemId} ---
  try {
    Logger.log(`\n--- 1. Consultando endpoint: /items/${itemId} ---`);
    const url1 = `${MELI_API_BASE_URL}/items/${itemId}`;
    const response1 = makeApiCall(url1, token);
    Logger.log(">>> Respuesta de /items: " + JSON.stringify(response1, null, 2));
  } catch (e) {
    Logger.log("Error consultando /items: " + e.message);
  }
  
  Utilities.sleep(500); // Pausa

  // --- 2. Consulta al endpoint de variaciones /items/{itemId}/variations ---
  try {
    Logger.log(`\n--- 2. Consultando endpoint: /items/${itemId}/variations ---`);
    const url2 = `${MELI_API_BASE_URL}/items/${itemId}/variations`;
    const response2 = makeApiCall(url2, token);
    Logger.log(">>> Respuesta de /variations: " + JSON.stringify(response2, null, 2));
  } catch (e) {
    Logger.log("Error consultando /variations: " + e.message);
  }

  Utilities.sleep(500); // Pausa

  // --- 3. Consulta al endpoint de marketplace /marketplace/items/{itemId} ---
  // Este endpoint a veces contiene información privada del vendedor que otros no tienen.
  try {
    Logger.log(`\n--- 3. Consultando endpoint: /marketplace/items/${itemId} ---`);
    const url3 = `${MELI_API_BASE_URL}/marketplace/items/${itemId}`;
    const response3 = makeApiCall(url3, token);
    Logger.log(">>> Respuesta de /marketplace/items: " + JSON.stringify(response3, null, 2));
  } catch (e) {
    Logger.log("Error consultando /marketplace/items: " + e.message);
  }

  Logger.log("\n--- FIN DE LA INVESTIGACIÓN ---");
  SpreadsheetApp.getUi().alert("Investigación de SKU finalizada. Por favor, revisa los logs.");
}


/**
 * *** FUNCIÓN DE DIAGNÓSTICO FINAL ***
 * Toma un producto, obtiene TODOS sus atributos desde la API y los escribe
 * en una nueva hoja de cálculo para un análisis detallado.
 */
function investigarAtributosDeProducto() {
  const itemId = "MLA1589621722"; // Usamos el mismo ID de la publicación que sabemos que tiene SKU
  const nombreHojaDiagnostico = "Diagnostico_Atributos";
  Logger.log(`Iniciando inspección de atributos para ${itemId}`);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hojaDiagnostico = ss.getSheetByName(nombreHojaDiagnostico);
  if (hojaDiagnostico) {
    hojaDiagnostico.clear();
  } else {
    hojaDiagnostico = ss.insertSheet(nombreHojaDiagnostico);
  }
  
  hojaDiagnostico.getRange("A1:C1").setValues([['ID del Atributo', 'Nombre del Atributo', 'Valor']]).setFontWeight('bold');

  const token = getMeliService().getToken();
  if (!token) { Logger.log("Token no válido."); return; }

  const url = `${MELI_API_BASE_URL}/items/${itemId}`;
  const itemData = makeApiCall(url, token);

  if (!itemData) {
    hojaDiagnostico.getRange("A2").setValue("No se pudo obtener información para el Item ID.");
    return;
  }
  
  const atributos = itemData.attributes;
  if (atributos && atributos.length > 0) {
    const datosParaHoja = atributos.map(attr => [
      attr.id,
      attr.name,
      attr.value_name
    ]);
    
    hojaDiagnostico.getRange(2, 1, datosParaHoja.length, 3).setValues(datosParaHoja);
    hojaDiagnostico.autoResizeColumns(1, 3);
    Logger.log(`Se escribieron ${datosParaHoja.length} atributos en la hoja '${nombreHojaDiagnostico}'.`);
    SpreadsheetApp.getUi().alert(`Diagnóstico completado. Revisa la nueva hoja '${nombreHojaDiagnostico}' en tu archivo.`);
  } else {
    hojaDiagnostico.getRange("A2").setValue("La API no devolvió ningún atributo para este producto.");
    Logger.log("La API no devolvió atributos.");
  }
}

/**
 * *** DIAGNÓSTICO FINAL DE VARIACIONES ***
 * Lee toda la información de las variaciones de un producto y la vuelca
 * en una nueva hoja para poder inspeccionar cada campo de datos.
 */
function investigarVariacionesDeProducto() {
  const itemId = "MLA1589621722"; // El producto que estamos investigando
  const nombreHojaDiagnostico = "Diagnostico_Variaciones";
  Logger.log(`Iniciando inspección de variaciones para ${itemId}`);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hojaDiagnostico = ss.getSheetByName(nombreHojaDiagnostico);
  if (hojaDiagnostico) {
    hojaDiagnostico.clear();
  } else {
    hojaDiagnostico = ss.insertSheet(nombreHojaDiagnostico);
  }
  
  const token = getMeliService().getToken();
  if (!token) { Logger.log("Token no válido."); return; }

  const url = `${MELI_API_BASE_URL}/items/${itemId}/variations`;
  const variaciones = makeApiCall(url, token);

  if (variaciones && Array.isArray(variaciones) && variaciones.length > 0) {
    const datosParaHoja = [];
    datosParaHoja.push(['ID de la Variación', 'Nombre de la Propiedad', 'Valor']); // Encabezados

    variaciones.forEach(variacion => {
      const idVariacion = variacion.id;
      // Recorremos cada propiedad del objeto de la variación
      for (const propiedad in variacion) {
        let valor = variacion[propiedad];
        // Si el valor es un objeto o array, lo convertimos a texto para poder verlo
        if (typeof valor === 'object' && valor !== null) {
          valor = JSON.stringify(valor, null, 2);
        }
        datosParaHoja.push([idVariacion, propiedad, valor]);
      }
    });
    
    hojaDiagnostico.getRange(1, 1, datosParaHoja.length, 3).setValues(datosParaHoja);
    hojaDiagnostico.autoResizeColumns(1, 3);
    Logger.log(`Se escribieron los datos de ${variaciones.length} variación(es) en la hoja '${nombreHojaDiagnostico}'.`);
    SpreadsheetApp.getUi().alert(`Diagnóstico completado. Revisa la nueva hoja '${nombreHojaDiagnostico}'.`);

  } else {
    SpreadsheetApp.getUi().alert("La API no devolvió ninguna variación para este producto.");
    Logger.log("La API no devolvió variaciones.");
  }
}