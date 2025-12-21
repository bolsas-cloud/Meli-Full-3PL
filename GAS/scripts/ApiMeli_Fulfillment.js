// ============================================================================
// --- ARCHIVO: ApiMeli_Fulfillment.gs ---
// ============================================================================
// Descripción: Funciones para interactuar con los endpoints de la API de
//              Mercado Libre relacionados con Fulfillment (Full).
// ============================================================================

/**
 * Obtiene datos de Fulfillment para un ítem específico, incluyendo SKU si está disponible.
 * NO escribe en la hoja, solo devuelve los datos.
 * @param {string} token - El token de acceso OAuth2.
 * @param {string} itemId - El ID del ítem de Mercado Libre.
 * @return {object|null} Objeto con datos de fulfillment o null si el ítem no usa Full o hay error.
 * Ej: { tieneFullFillment, stockDisponible, stockReservado, stockEnTransito, stockTotal, sku, ultimaActualizacion, inventoryId }
 */
function obtenerDatosFulfillmentItem(token, itemId) {
  if (!itemId) {
    Logger.log("Error en obtenerDatosFulfillmentItem: itemId es nulo o vacío.");
    return null;
  }

  try {
    // Primero, intentar obtener el inventory_id y si usa Full desde el endpoint del item.
    const itemUrl = `${MELI_API_BASE_URL}/items/${itemId}?attributes=inventory_id,shipping`;
    const itemDetails = makeApiCall(itemUrl, token);

    let inventoryId = null;
    let usaFullViaItemDetails = false;

    if (itemDetails) {
        inventoryId = itemDetails.inventory_id || null; // Puede ser null o no existir
        if (itemDetails.shipping && itemDetails.shipping.mode === 'me2' && itemDetails.shipping.logistic_type === 'fulfillment') {
            usaFullViaItemDetails = true;
        }
        // Si el item tiene inventory_id, asumimos que usa Full, incluso si el logistic_type no lo dice (puede ser un estado intermedio)
        if (inventoryId) {
            usaFullViaItemDetails = true;
        }
    }


    // Si no se pudo determinar por itemDetails o no se obtuvo inventory_id, intentar endpoint de /fulfillment
    // Este endpoint puede ser más directo para saber si usa Full y obtener inventory_id si lo tiene ahí.
    if (!inventoryId && !usaFullViaItemDetails) {
        try {
            const fulfillmentUrl = `${MELI_API_BASE_URL}/items/${itemId}/fulfillment`;
            const fulfillmentData = makeApiCall(fulfillmentUrl, token); // makeApiCall maneja 404 como null

            if (fulfillmentData && fulfillmentData.status === "enabled") { // "enabled" suele indicar que está en Full
                usaFullViaItemDetails = true; // Confirmado que usa Full
                if (fulfillmentData.inventory_id) {
                    inventoryId = fulfillmentData.inventory_id;
                }
                // Si no tiene inventory_id aquí, podría ser un problema o un item recién agregado a Full.
            } else if (fulfillmentData === null) {
                // 404 en /fulfillment usualmente significa que NO usa Full.
                usaFullViaItemDetails = false;
            }
        } catch (e) {
            Logger.log(`Excepción consultando /items/${itemId}/fulfillment: ${e.message}. Asumiendo que no usa Full por esta vía.`);
            usaFullViaItemDetails = false; // Asumir no Full si hay error aquí.
        }
    }


    // Si después de las verificaciones no usa Full, devolver info limitada.
    if (!usaFullViaItemDetails) {
      let availableQtyNoFull = 0;
      let skuNoFull = "";
      if (itemDetails && itemDetails.available_quantity !== undefined) {
        availableQtyNoFull = itemDetails.available_quantity;
      }
      if (itemDetails && itemDetails.attributes) { // Intentar obtener SKU de atributos si no usa Full
          const skuAttr = itemDetails.attributes.find(attr => attr.id === "SELLER_SKU");
          if (skuAttr && skuAttr.value_name) skuNoFull = skuAttr.value_name;
      }

      return {
        itemId: itemId,
        inventoryId: null,
        tieneFullFillment: false,
        stockDisponible: availableQtyNoFull,
        stockReservado: 0,
        stockEnTransito: 0,
        stockTotal: availableQtyNoFull,
        sku: skuNoFull,
        ultimaActualizacion: new Date() // Fecha actual ya que no hay datos de Full
      };
    }

    // Si usa Full pero no pudimos obtener un inventory_id por ninguna vía.
    if (usaFullViaItemDetails && !inventoryId) {
        Logger.log(`WARN: Ítem ${itemId} parece usar Fulfillment pero no se encontró inventory_id.`);
        // Devolver que usa Full pero con stock 0, ya que no podemos consultar el inventario específico.
        return {
            itemId: itemId,
            inventoryId: null,
            tieneFullFillment: true, // Marcado como que sí usa, pero con problemas para obtener ID
            stockDisponible: 0,
            stockReservado: 0,
            stockEnTransito: 0,
            stockTotal: 0,
            sku: itemDetails && itemDetails.attributes ? (itemDetails.attributes.find(attr => attr.id === "SELLER_SKU") || {}).value_name || "" : "",
            ultimaActualizacion: new Date(),
            error: "No se encontró inventory_id"
        };
    }

    // Si llegamos aquí, usa Full y TENEMOS un inventoryId. Consultar stock específico.
    const stockFullData = consultarStockFulfillment(token, inventoryId); // Esta función ya existe en el script original.

    if (stockFullData && stockFullData.inventory) {
      const inventory = stockFullData.inventory;
      return {
        itemId: itemId,
        inventoryId: inventoryId, // Devolver el inventory_id encontrado
        tieneFullFillment: true,
        stockDisponible: inventory.available_quantity || 0,
        stockReservado: inventory.reserved_quantity || 0,
        stockEnTransito: inventory.inbound_quantity || 0,
        stockTotal: (inventory.available_quantity || 0) + (inventory.reserved_quantity || 0) + (inventory.inbound_quantity || 0),
        sku: inventory.seller_sku || (itemDetails && itemDetails.attributes ? (itemDetails.attributes.find(attr => attr.id === "SELLER_SKU") || {}).value_name || "" : ""),
        ultimaActualizacion: inventory.updated_at ? new Date(inventory.updated_at) : new Date()
      };
    } else {
      Logger.log(`WARN: No se pudo obtener stock para inventory_id ${inventoryId} (item ${itemId}), aunque se esperaba. Respuesta: ${JSON.stringify(stockFullData).substring(0,100)}`);
      // Devolver que usa Full pero con stock 0 si la consulta de stock falla.
      return {
        itemId: itemId,
        inventoryId: inventoryId,
        tieneFullFillment: true,
        stockDisponible: 0,
        stockReservado: 0,
        stockEnTransito: 0,
        stockTotal: 0,
        sku: itemDetails && itemDetails.attributes ? (itemDetails.attributes.find(attr => attr.id === "SELLER_SKU") || {}).value_name || "" : "",
        ultimaActualizacion: new Date(),
        error: "Fallo al consultar stock del inventory_id"
      };
    }

  } catch (error) {
    Logger.log(`Error crítico en obtenerDatosFulfillmentItem para ítem ${itemId}: ${error.message}. Stack: ${error.stack}`);
    return null;
  }
}

/**
 * Consulta el stock de un inventory_id específico en Fulfillment.
 * @param {string} token - El token de acceso OAuth2.
 * @param {string} inventoryId - El ID de inventario de Mercado Libre.
 * @return {object|null} Datos de stock o null si hay error o no se encuentra.
 */
function consultarStockFulfillment(token, inventoryId) {
  if (!inventoryId) {
    Logger.log("consultarStockFulfillment: inventoryId no proporcionado.");
    return null;
  }
  try {
    // El endpoint /stock/fulfillment es más común para obtener el stock general de un inventory_id
    // El endpoint /inventories/{inventory_id}/stock es más detallado si se necesita.
    // Usaremos el que estaba en el código original que parece ser /inventories/{inventory_id}/stock
    // pero el otro es una opción: `${MELI_API_BASE_URL}/inventories/${inventoryId}/stock/fulfillment?include_attributes=conditions`
    
    const url = `${MELI_API_BASE_URL}/inventories/${inventoryId}/stock`; // Endpoint usado en el código original
    // const url = `${MELI_API_BASE_URL}/inventories/${inventoryId}/stock/fulfillment?include_attributes=conditions`; // Alternativa más detallada
    const stockData = makeApiCall(url, token);

    // La estructura de respuesta esperada es { inventory: { available_quantity, ... } }
    // O si es el endpoint /stock/fulfillment, la estructura es directamente el objeto de stock.
    if (stockData && stockData.inventory) { // Para /inventories/{inventory_id}/stock
        return stockData; // Devuelve el objeto completo que contiene `inventory`
    } else if (stockData && stockData.available_quantity !== undefined) { // Para /inventories/{inventory_id}/stock/fulfillment
        return { inventory: stockData }; // Adaptar para que sea consistente si se cambia el endpoint
    } else if (stockData === null && url.includes('/stock/fulfillment')) {
        // El endpoint de fulfillment puede dar 404 si el inventory_id no es de Full, lo cual makeApiCall devuelve como null.
        Logger.log(`INFO: No se encontró stock en Fulfillment para inventory_id ${inventoryId} (puede no ser de Full o no tener stock).`);
        return null;
    }
     else {
        Logger.log(`WARN: Respuesta inesperada o sin datos de inventario para inventory_id ${inventoryId}. Respuesta: ${JSON.stringify(stockData).substring(0,100)}`);
        return null;
    }
  } catch (error) {
    Logger.log(`Error consultando stock de Fulfillment para inventory_id ${inventoryId}: ${error.message}`);
    throw error; // Propagar el error para que la función que llama lo maneje.
  }
}


/**
 * Realiza una búsqueda intensiva del inventory_id para un ítem, probando varios endpoints.
 * @param {string} token - El token de acceso.
 * @param {string} itemId - El ID del ítem.
 * @param {number} userId - El ID del vendedor.
 * @return {object} Objeto con { inventoryId, usaFull, metodoEncontrado, detallesAdicionales }.
 */
function buscarInventoryIdIntensivo(token, itemId, userId) {
  const resultado = {
    inventoryId: null,
    usaFull: false, // Asumir que no usa Full hasta que se confirme
    metodoEncontrado: "No encontrado",
    detallesAdicionales: {}
  };

  if (!itemId) return resultado;

  try {
    // MÉTODO 1: Desde el endpoint del ítem principal (atributo inventory_id)
    const itemUrl = `${MELI_API_BASE_URL}/items/${itemId}?attributes=inventory_id,shipping,variations.inventory_id,variations.attributes`;
    const itemDetails = makeApiCall(itemUrl, token);

    if (itemDetails) {
      resultado.detallesAdicionales.itemDetails = itemDetails; // Guardar para debug
      if (itemDetails.inventory_id) {
        resultado.inventoryId = itemDetails.inventory_id;
        resultado.usaFull = true;
        resultado.metodoEncontrado = "item.inventory_id";
        return resultado;
      }
      // Verificar si es Full por el tipo de envío
      if (itemDetails.shipping && itemDetails.shipping.mode === 'me2' && itemDetails.shipping.logistic_type === 'fulfillment') {
        resultado.usaFull = true; // Sabemos que usa Full, pero aún no tenemos el ID
        resultado.metodoEncontrado = "item.shipping.logistic_type=fulfillment";
      }
      // Intentar desde variaciones si existen
      if (!resultado.inventoryId && itemDetails.variations && Array.isArray(itemDetails.variations)) {
        for (const variation of itemDetails.variations) {
          if (variation.inventory_id) {
            resultado.inventoryId = variation.inventory_id;
            resultado.usaFull = true; // Si tiene inventory_id en variación, es Full.
            resultado.metodoEncontrado = "item.variation.inventory_id";
            return resultado;
          }
        }
      }
    }

    // MÉTODO 2: Endpoint de /fulfillment del ítem
    if (!resultado.inventoryId) { // Solo si no lo encontramos antes
      try {
        const fulfillmentUrl = `${MELI_API_BASE_URL}/items/${itemId}/fulfillment`;
        const fulfillmentData = makeApiCall(fulfillmentUrl, token);
        resultado.detallesAdicionales.fulfillmentEndpoint = fulfillmentData; // Guardar para debug

        if (fulfillmentData) { // Puede devolver 404 (null) si no está en Full.
            if (fulfillmentData.status === "enabled" || fulfillmentData.inventory_id) { // "enabled" es una buena señal
                resultado.usaFull = true; // Confirmado que usa Full
                if (fulfillmentData.inventory_id) {
                    resultado.inventoryId = fulfillmentData.inventory_id;
                    resultado.metodoEncontrado = "item_fulfillment.inventory_id";
                    return resultado;
                } else if (resultado.metodoEncontrado === "No encontrado" || !resultado.metodoEncontrado.includes("fulfillment")) {
                    // Si no teníamos un método mejor, actualizamos
                    resultado.metodoEncontrado = "item_fulfillment.status_enabled (sin ID)";
                }
            }
        }
      } catch (e) { Logger.log(`INFO: Excepción en método 2 (fulfillment endpoint) para ${itemId}: ${e.message}. Esto puede ser normal si el ítem no es Full.`); }
    }
    
    // Si ya sabemos que es Full (por el método 1 o 2) pero aún no tenemos ID, intentar otros métodos.
    if (resultado.usaFull && !resultado.inventoryId) {
        // MÉTODO 3: Endpoint de /stock (a veces devuelve inventory_id)
        // Este endpoint es /users/{user_id}/items/{item_id}/stock
        try {
            const stockUserItemUrl = `${MELI_API_BASE_URL}/users/${userId}/items/${itemId}/stock`;
            const stockUserItemData = makeApiCall(stockUserItemUrl, token);
            resultado.detallesAdicionales.stockUserItemEndpoint = stockUserItemData;

            if (stockUserItemData && stockUserItemData.inventory_id) {
                resultado.inventoryId = stockUserItemData.inventory_id;
                resultado.metodoEncontrado = "user_item_stock.inventory_id";
                return resultado;
            }
        } catch (e) { Logger.log(`INFO: Excepción en método 3 (stock endpoint) para ${itemId}: ${e.message}`); }

        // MÉTODO 4: Buscar en órdenes recientes si el ítem tiene inventory_id allí
        // Esto es más costoso, hacerlo como último recurso si otros métodos fallan.
        // (Implementación de búsqueda en órdenes omitida aquí por complejidad y coste,
        //  pero se podría añadir si es crucial y los otros métodos no son suficientes).
        //  Si se añade, se debe ser cuidadoso con los límites de API.
    }

    // Si no se encontró inventory_id, pero se determinó que usa Full,
    // el resultado.usaFull ya es true.
    // Si no se determinó que usa Full, resultado.usaFull sigue false.
    if (!resultado.inventoryId && resultado.usaFull && resultado.metodoEncontrado === "No encontrado") {
        resultado.metodoEncontrado = "Indeterminado (marcado como Full pero sin ID)";
    } else if (!resultado.inventoryId && !resultado.usaFull) {
        resultado.metodoEncontrado = "No usa Full (o no se pudo determinar)";
    }


    return resultado;
  } catch (error) {
    Logger.log(`Error general en búsqueda intensiva de inventory_id para ${itemId}: ${error.message}`);
    resultado.metodoEncontrado = "Error en búsqueda";
    resultado.detallesAdicionales.error = error.message;
    return resultado;
  }
}


/**
 * Obtiene el historial de operaciones de stock para un inventory_id específico.
 * @param {string} token - El token de acceso OAuth2.
 * @param {string} inventoryId - El ID de inventario.
 * @param {number} sellerId - El ID del vendedor.
 * @param {string} dateFrom - Fecha de inicio para la búsqueda (YYYY-MM-DD).
 * @param {string} dateTo - Fecha de fin para la búsqueda (YYYY-MM-DD).
 * @return {Array|null} Un array con las operaciones o null si hay error.
 */
function obtenerOperacionesStock(token, inventoryId, sellerId, dateFrom, dateTo) {
  if (!inventoryId || !sellerId) {
    Logger.log("obtenerOperacionesStock: inventoryId o sellerId no proporcionados.");
    return null;
  }
  try {
    // El endpoint es /stock/fulfillment/operations/search
    const url = `${MELI_API_BASE_URL}/stock/fulfillment/operations/search?seller_id=${sellerId}&inventory_id=${inventoryId}&date_from=${dateFrom}&date_to=${dateTo}&limit=200`; // Aumentar límite si es necesario y permitido
    const operationsData = makeApiCall(url, token);

    if (operationsData && operationsData.results && Array.isArray(operationsData.results)) {
      return operationsData.results;
    } else {
      Logger.log(`No se encontraron operaciones o respuesta inesperada para inventory_id ${inventoryId}. Respuesta: ${JSON.stringify(operationsData)}`);
      return []; // Devolver array vacío si no hay resultados
    }
  } catch (error) {
    Logger.log(`Error obteniendo operaciones de stock para inventory_id ${inventoryId}: ${error.message}`);
    throw error; // Propagar para que la función que llama decida
  }
}


/**
 * *** NUEVA FUNCIÓN ROBUSTA ***
 * Obtiene y completa los Inventory IDs en la Hoja 1.
 * Primero, intenta obtenerlos desde el endpoint de /items (método rápido).
 * Luego, para los faltantes, busca en el historial de operaciones de Full (método profundo).
 * @param {string} token - El token de acceso OAuth2.
 * @param {number} userId - El ID del vendedor de Mercado Libre.
 * @returns {boolean} - True si el proceso se completó.
 */
function obtenerYCompletarInventoryIds(token, userId) {
  Logger.log("Iniciando búsqueda robusta de Inventory IDs...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!targetSheet || targetSheet.getLastRow() < 2) {
    Logger.log("Hoja 1 no encontrada o vacía. No se puede buscar Inventory IDs.");
    return false;
  }

  const range = targetSheet.getRange("A2:H" + targetSheet.getLastRow()); // Leemos hasta la columna H (Inventory_ID)
  const sheetData = range.getValues();
  const mapaItems = {};
  const itemsSinInventoryId = [];

  sheetData.forEach((row, index) => {
    const itemId = row[6]; // Columna G
    const inventoryIdActual = row[7]; // Columna H
    if (itemId) {
      mapaItems[itemId] = { index: index, sku: row[0] };
      if (!inventoryIdActual) {
        itemsSinInventoryId.push(itemId);
      }
    }
  });

  Logger.log(`Se encontraron ${itemsSinInventoryId.length} items sin Inventory ID para buscar.`);
  if (itemsSinInventoryId.length === 0) {
    Logger.log("Todos los items ya tienen Inventory ID. Proceso finalizado.");
    return true;
  }

  // --- Método Profundo: Búsqueda en Operaciones ---
  try {
    const hoy = new Date();
    const hace180dias = new Date();
    hace180dias.setDate(hoy.getDate() - 180);
    const aISO = date => date.toISOString().split('T')[0];
    const dateFrom = aISO(hace180dias);
    const dateTo = aISO(hoy);
    
    const urlOperaciones = `${MELI_API_BASE_URL}/stock/fulfillment/operations/search?seller_id=${userId}&date_from=${dateFrom}&date_to=${dateTo}&limit=200`;
    const operacionesResponse = makeApiCall(urlOperaciones, token);
    
    let encontrados = 0;
    if (operacionesResponse && operacionesResponse.results && Array.isArray(operacionesResponse.results)) {
      Logger.log(`Se encontraron ${operacionesResponse.results.length} operaciones en los últimos 180 días.`);
      operacionesResponse.results.forEach(op => {
        const itemId = op.item_id;
        const inventoryId = op.inventory_id;
        // Si la operación corresponde a un item que nos falta y tiene un inventoryId...
        if (itemsSinInventoryId.includes(itemId) && inventoryId) {
          const itemEnHoja = mapaItems[itemId];
          if (itemEnHoja) {
            // Actualizamos el valor en nuestro array de datos de la hoja
            sheetData[itemEnHoja.index][7] = inventoryId;
            encontrados++;
            // Lo removemos de la lista de pendientes para no volver a buscarlo
            const indexPendiente = itemsSinInventoryId.indexOf(itemId);
            if (indexPendiente > -1) {
              itemsSinInventoryId.splice(indexPendiente, 1);
            }
          }
        }
      });
    }
    Logger.log(`Método profundo encontró y actualizó ${encontrados} Inventory IDs.`);
  } catch(e) {
    Logger.log(`Error durante la búsqueda profunda de Inventory IDs: ${e.message}`);
  }

  // Escribimos los nuevos IDs encontrados de vuelta en la Hoja 1
  range.setValues(sheetData);
  Logger.log("Hoja 1 actualizada con los nuevos Inventory IDs encontrados.");
  
  return true;
}




/**
 * *** VERSIÓN CORREGIDA 2.1 ***
 * Extrae solo el valor numérico del peso y las dimensiones,
 * guardando números puros en la hoja de cálculo para permitir cálculos.
 */
function actualizarAtributosDeFull() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Iniciando sincronización de atributos de Full...", "Procesando", -1);
  Logger.log("--- Iniciando actualizarAtributosDeFull (v2.1) ---");

  const token = getMeliService().getToken();
  if (!token) {
    ss.getUi().alert("Error de autenticación.");
    return;
  }

  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (targetSheet.getLastRow() < 2) {
    ss.getUi().alert("No hay productos en la Hoja 1 para procesar.");
    return;
  }

  const range = targetSheet.getRange("A2:W" + targetSheet.getLastRow());
  const sheetData = range.getValues();
  let actualizados = 0;

  for (let i = 0; i < sheetData.length; i++) {
    const itemId = sheetData[i][6];
    const tipoLogistica = sheetData[i][16];

    if (itemId && tipoLogistica === 'fulfillment') {
      try {
        const url = `${MELI_API_BASE_URL}/items/${itemId}?attributes=attributes`;
        const response = makeApiCall(url, token);

        if (response && response.attributes && Array.isArray(response.attributes)) {
          // --- CORRECCIÓN CLAVE AQUÍ ---
          // Función de ayuda que ahora extrae el número con parseFloat()
          const findAttributeNumber = (id) => {
            const attr = response.attributes.find(a => a.id === id);
            // parseFloat es inteligente y tomará solo la parte numérica del texto (ej: "840 g" -> 840)
            return attr ? parseFloat(attr.value_name) : null; 
          };

          const peso = findAttributeNumber('PACKAGE_WEIGHT') || findAttributeNumber('ITEM_WEIGHT');
          const alto = findAttributeNumber('PACKAGE_HEIGHT');
          const ancho = findAttributeNumber('PACKAGE_WIDTH');
          const largo = findAttributeNumber('PACKAGE_LENGTH');

          // La clasificación no la podemos obtener, la dejamos vacía
          sheetData[i][18] = '';   // Col S: Clasificacion_Full
          sheetData[i][19] = peso;   // Col T: Peso_gr
          sheetData[i][20] = alto;   // Col U: Alto_cm
          sheetData[i][21] = ancho;  // Col V: Ancho_cm
          sheetData[i][22] = largo;  // Col W: Largo_cm
          
          actualizados++;
        }
        Utilities.sleep(300);
      } catch (e) {
        Logger.log(`Error al procesar atributos para item ${itemId}: ${e.message}`);
      }
    }
  }

  if (actualizados > 0) {
    range.setValues(sheetData);
    // Aplicamos formato de número a las nuevas columnas
    targetSheet.getRange("T2:W" + targetSheet.getLastRow()).setNumberFormat('0.00');
    Logger.log(`Se actualizaron los atributos de ${actualizados} productos.`);
    ss.toast(`¡Éxito! Se actualizaron los atributos de ${actualizados} productos.`, "Completado", 10);
  } else {
    Logger.log("No se encontraron atributos para actualizar.");
    ss.toast("No se encontraron atributos para actualizar.", "Información", 7);
  }
}




/**
 * Herramienta de Diagnóstico: Consulta la API de inventarios para un
 * Inventory ID específico y muestra la respuesta completa en los logs.
 */
function diagnosticarApiDeInventarios() {
  // --- ¡IMPORTANTE! Edita esta línea y pon un Inventory ID real de tu Hoja 1 ---
  const inventoryIdDePrueba = "SYHC06436"; 
  
  if (inventoryIdDePrueba === "TU_INVENTORY_ID_AQUI") {
    SpreadsheetApp.getUi().alert("Por favor, edita el script 'diagnosticarApiDeInventarios' y pon un Inventory ID real de tu Hoja 1.");
    return;
  }
  
  Logger.log(`--- DIAGNÓSTICO DE API DE INVENTARIOS PARA EL ID: ${inventoryIdDePrueba} ---`);
  
  const token = getMeliService().getToken();
  if (!token) {
    Logger.log("Error: No se pudo obtener el token.");
    return;
  }

  try {
    const url = `${MELI_API_BASE_URL}/inventories/${inventoryIdDePrueba}`;
    Logger.log("Consultando URL: " + url);
    
    const response = makeApiCall(url, token);
    
    Logger.log("--- RESPUESTA COMPLETA DE LA API ---");
    Logger.log(JSON.stringify(response, null, 2));
    Logger.log("------------------------------------");

    SpreadsheetApp.getUi().alert("Diagnóstico finalizado. Revisa los logs de ejecución para ver el resultado detallado.");

  } catch (e) {
    Logger.log(`Ocurrió un error crítico durante el diagnóstico: ${e.message}`);
  }
}