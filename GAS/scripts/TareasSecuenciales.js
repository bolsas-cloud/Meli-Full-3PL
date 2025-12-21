/**
 * TAREA 1: Actualiza la hoja de detalles de órdenes.
 * Al terminar, crea un trigger para ejecutar la TAREA 2.
 */
function paso1_ActualizarOrdenes() {
  Logger.log("INICIANDO TAREA 1: Actualización de Órdenes.");
  try {
    const service = getMeliService();
    const token = service.getToken();
    if (!token) { throw new Error("Token no válido para Tarea 1."); }
    const userId = getUserId(token);
    
    populateMeliOrderDetailsSheet(token, userId, ORDERS_LOOKBACK_DAYS);
    
    Logger.log("TAREA 1 COMPLETADA. Creando trigger para Tarea 2...");
    crearSiguienteTrigger('paso2_ActualizarPublicidad');
    
  } catch (e) {
    Logger.log(`Error en TAREA 1: ${e.message}`);
  }
}

/**
 * TAREA 2: Actualiza los costos de publicidad.
 * Al terminar, crea un trigger para ejecutar la TAREA 3.
 */
function paso2_ActualizarPublicidad() {
  Logger.log("INICIANDO TAREA 2: Actualización de Publicidad.");
  try {
    actualizarCostosDePublicidad(); 
    Logger.log("TAREA 2 COMPLETADA. Creando trigger para Tarea 3...");
    crearSiguienteTrigger('paso3_ActualizarInventoryIDs');
  } catch (e) {
    Logger.log(`Error en TAREA 2: ${e.message}`);
  }
}

/**
 * TAREA 3: Ejecuta la búsqueda profunda de Inventory IDs faltantes.
 * Al terminar, crea un trigger para ejecutar la TAREA 4.
 */
function paso3_ActualizarInventoryIDs() {
  Logger.log("INICIANDO TAREA 3: Búsqueda profunda de Inventory IDs.");
  try {
    const service = getMeliService();
    const token = service.getToken();
    if (!token) { throw new Error("Token no válido para Tarea 3."); }
    const userId = getUserId(token);

    obtenerYCompletarInventoryIds(token, userId);
    SpreadsheetApp.flush(); 

    Logger.log("TAREA 3 COMPLETADA. Creando trigger para Tarea 4...");
    crearSiguienteTrigger('paso4_ActualizarHojaPrincipal');

  } catch (e) {
    Logger.log(`Error en TAREA 3: ${e.message}`);
  }
}

/**
 * TAREA 4: Toma todos los datos recolectados y actualiza la Hoja 1.
 * Esta es la última tarea de la cadena.
 */
function paso4_ActualizarHojaPrincipal() {
  Logger.log("INICIANDO TAREA 4: Actualización final de Hoja 1.");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const service = getMeliService();
    const token = service.getToken();
    if (!token) { throw new Error("Token no válido para Tarea 4."); }
    const userId = getUserId(token);

    const allItemIds = getAllMyItemIds(token, userId);
    if (allItemIds.length === 0) {
      Logger.log("No se encontraron publicaciones para actualizar en Hoja 1.");
      crearSiguienteTrigger(null); // Finalizamos la cadena
      return;
    }

    // Calculamos las ventas de los últimos 90 días (desde la hoja de Órdenes)
    const salesMap = {};
    const ordersSheet = ss.getSheetByName(ORDERS_DETAIL_SHEET_NAME);
    const date90daysAgo = new Date();
    date90daysAgo.setDate(date90daysAgo.getDate() - 90);
    if (ordersSheet.getLastRow() > 1) {
      const orderData = ordersSheet.getRange("C2:G" + ordersSheet.getLastRow()).getValues();
      orderData.forEach(row => {
        if (new Date(row[0]) >= date90daysAgo) {
          salesMap[row[2]] = (salesMap[row[2]] || 0) + (parseFloat(row[4]) || 0);
        }
      });
    }

    // Recolectamos los detalles de la API (sin visitas individuales)
    const datosCompletosItems = [];
    for (let i = 0; i < allItemIds.length; i += 20) {
      const chunk = allItemIds.slice(i, i + 20);
      const urlItems = `${MELI_API_BASE_URL}/items?ids=${chunk.join(',')}&attributes=id,title,status,available_quantity,seller_sku,inventory_id,price,category_id,listing_type_id,shipping,variations,attributes`;
      
      const itemsResponse = makeApiCall(urlItems, token);
      if (itemsResponse && Array.isArray(itemsResponse)) {
        for (const itemResult of itemsResponse) {
          if (itemResult.code === 200) {
            const item = itemResult.body;
            const sku = buscarSkuEnItem(item);
            // Ya NO llamamos a la API de visitas aquí
            datosCompletosItems.push({ item: item, visits: 0, sku: sku }); // Ponemos visitas en 0
          }
        }
      }
      Utilities.sleep(API_CALL_DELAY); // Pausa entre lotes
    }

    // Actualizamos la Hoja 1
    const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
    const range = targetSheet.getRange("A2:R" + targetSheet.getLastRow());
    const sheetData = range.getValues();
    
    const newData = sheetData.map(row => {
      const itemId = row[6];
      const datosApi = datosCompletosItems.find(d => d.item.id === itemId);
      if (datosApi) {
        const item = datosApi.item;
        const ventas = salesMap[item.id] || 0;
        
        row[0] = datosApi.sku || row[0];
        row[1] = item.title;
        row[2] = 0; // Columna C (Visitas 90d) -> AHORA ES 0
        row[3] = ventas;
        row[4] = 0; // Columna E (Conversión) -> AHORA ES 0
        row[7] = item.inventory_id || row[7];
        row[8] = item.price;
        row[9] = item.category_id;
        row[10] = item.listing_type_id;
        row[16] = item.shipping ? item.shipping.logistic_type : null;
        row[17] = item.shipping ? (item.shipping.free_shipping ? 'Sí' : 'No') : 'No';
      }
      return row;
    });
    
    range.setValues(newData);
    
    // Ya NO llamamos a registrarEstadoActualPublicaciones ni registrarPromocionesActivas

    Logger.log("TAREA 4 COMPLETADA. Fin de la secuencia de actualización.");
    crearSiguienteTrigger(null); // null finaliza la cadena y guarda el timestamp de éxito

  } catch (e) {
    Logger.log(`Error en TAREA 4: ${e.message}`);
    crearSiguienteTrigger(null); // Finaliza la cadena incluso si hay error
  }
}


/**
 * Borra todos los triggers de tareas anteriores para evitar duplicados
 * y crea uno nuevo para la siguiente función en la cadena.
 * @param {string} nombreDeLaSiguienteFuncion - El nombre de la próxima función a ejecutar.
 */
function crearSiguienteTrigger(nombreDeLaSiguienteFuncion) {
  const todosLosTriggers = ScriptApp.getProjectTriggers();
  for (const trigger of todosLosTriggers) {
    if (trigger.getHandlerFunction().startsWith('paso')) {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  if (nombreDeLaSiguienteFuncion) {
    ScriptApp.newTrigger(nombreDeLaSiguienteFuncion)
      .timeBased()
      .after(1 * 60 * 1000) // 1 minuto
      .create();
  } else {
    Logger.log("FIN DE LA CADENA DE TAREAS.");
    PropertiesService.getScriptProperties().setProperty('ultimaActualizacionExitosa', new Date().toISOString());
  }
}