// ============================================================================
// --- ARCHIVO: Sheet_Orders.gs ---
// ============================================================================
// Descripción: Funciones para manejar la hoja de detalles de órdenes,
//              incluyendo la obtención de datos de la API y su escritura.
// ============================================================================

/**
 * Popula la hoja de detalles de órdenes de Meli.
 * Intenta hacer una actualización delta, obteniendo solo órdenes más nuevas que la última registrada.
 * Combina datos de órdenes existentes con nuevas y reescribe la hoja ordenada.
 * @param {string} token - El token de acceso OAuth2.
 * @param {number} sellerId - El ID del vendedor de Mercado Libre.
 * @param {number} daysToFetchFull - Días hacia atrás para buscar si no hay órdenes previas o si la más reciente es muy antigua.
 * @return {boolean} True si la operación fue exitosa, false en caso contrario.
 */
function populateMeliOrderDetailsSheet(token, sellerId, daysToFetchFull) {
  const functionVersion = "v2.0_delta_refactored"; // Versión refactorizada
  Logger.log(`populateMeliOrderDetailsSheet (${functionVersion}): Iniciando para vendedor ${sellerId}. Período full si necesario: ${daysToFetchFull} días.`);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ORDERS_DETAIL_SHEET_NAME); // De Constantes.gs

  if (!sheet) {
    Logger.log(`Error Crítico: Hoja "${ORDERS_DETAIL_SHEET_NAME}" No Encontrada. No se pueden poblar las órdenes.`);
    ss.toast(`Error: Hoja "${ORDERS_DETAIL_SHEET_NAME}" no existe.`, "Error Fatal", 10);
    return false;
  }

  let latestOrderDateInSheet = null;
  let existingOrdersData = []; // Array de arrays [id, created_date, paid_date, ...]
  const existingOrderIdsOnSheet = new Set(); // Set de IDs de órdenes ya en la hoja

  const lastRowInSheet = sheet.getLastRow();
  if (lastRowInSheet > 1) {
    // Leer todas las órdenes existentes para mantenerlas y solo agregar las nuevas.
    // También para encontrar la fecha más reciente.
    existingOrdersData = sheet.getRange(2, 1, lastRowInSheet - 1, sheet.getLastColumn()).getValues();
    existingOrdersData.forEach(row => {
      const orderId = row[0]; // Col A: ID Orden
      const paidDate = row[2]; // Col C: Fecha de Pago

      if (orderId) existingOrderIdsOnSheet.add(String(orderId));

      if (paidDate instanceof Date) {
        if (!latestOrderDateInSheet || paidDate > latestOrderDateInSheet) {
          latestOrderDateInSheet = new Date(paidDate);
        }
      }
    });
  }

  const today = new Date();
  let dateFromToQuery; // Fecha DESDE la cual consultaremos la API

  if (latestOrderDateInSheet) {
    Logger.log(`populateMeliOrderDetailsSheet: Última fecha de pago en hoja: ${latestOrderDateInSheet.toLocaleString()}`);
    // Empezar a buscar desde un poco antes de la última orden por si hubo pagos retrasados o no capturados.
    // Por ejemplo, 1 día antes, pero no más atrás que `daysToFetchFull`.
    const oneDayBeforeLatest = new Date(latestOrderDateInSheet);
    oneDayBeforeLatest.setDate(oneDayBeforeLatest.getDate() - 1);

    const oldestAllowedByFullFetch = new Date(today);
    oldestAllowedByFullFetch.setDate(today.getDate() - daysToFetchFull);
    
    dateFromToQuery = (oneDayBeforeLatest > oldestAllowedByFullFetch) ? oneDayBeforeLatest : oldestAllowedByFullFetch;
    
  } else {
    Logger.log(`populateMeliOrderDetailsSheet: No hay órdenes en la hoja o no se pudo determinar la última fecha. Se usará el período completo de ${daysToFetchFull} días.`);
    dateFromToQuery = new Date(today);
    dateFromToQuery.setDate(today.getDate() - daysToFetchFull);
  }
  // Asegurar que la hora de inicio sea al principio del día para capturar todo.
  dateFromToQuery.setHours(0, 0, 0, 0);


  const dateToToQuery = new Date(today); // Hasta el momento actual
  dateToToQuery.setHours(23,59,59,999); // Asegurar que cubra todo el día de hoy

  // Convertir a ISO String para la API.
  // La API de orders/search espera fechas en UTC.
  const dateFromStringISO = dateFromToQuery.toISOString();
  const dateToStringISO = dateToToQuery.toISOString();

  Logger.log(`Consultando órdenes pagadas desde ${dateFromStringISO} hasta ${dateToStringISO}`);

  // Llamar a la función de ApiMeli_Orders.gs para obtener los datos crudos.
  // Pasamos el Set de IDs existentes para que fetchRawOrderData pueda optimizar si es posible (aunque la lógica principal de filtro de duplicados está aquí).
  const newRawOrderItems = fetchRawOrderData(token, sellerId, dateFromStringISO, dateToStringISO, ss, existingOrderIdsOnSheet);

  if (!newRawOrderItems) { // fetchRawOrderData podría devolver null en caso de error grave de API.
    Logger.log("populateMeliOrderDetailsSheet: No se recibieron datos de fetchRawOrderData o hubo un error irrecuperable.");
    // No se modifica la hoja si hay un error grave al obtener datos.
    return false;
  }

  Logger.log(`Se obtuvieron ${newRawOrderItems.length} nuevas líneas de ítems de órdenes desde la API.`);

  if (newRawOrderItems.length === 0 && existingOrdersData.length > 0) {
    Logger.log("No se encontraron órdenes más nuevas que las ya existentes en la hoja. La hoja está actualizada.");
    ss.toast("Hoja de órdenes ya está actualizada.", "Órdenes", 5);
    // Re-escribir y re-ordenar por si acaso, aunque no haya nuevas.
    // Opcional: podrías retornar true aquí si no quieres re-escribir si no hay cambios.
    // return true;
  }


  // Convertir los datos existentes (de la hoja) a objetos para facilitar la manipulación si fuera necesario,
  // o mantenerlos como arrays si solo vamos a concatenar y ordenar.
  // Por ahora, mantenemos existingOrdersData como array de arrays.

  // Convertir los nuevos datos (objetos) a arrays en el formato de la hoja.
  const newOrderItemsAsArrays = newRawOrderItems.map(item => [
    item.orderId, item.dateCreated, item.datePaid, item.orderStatus,
    item.itemId, item.itemTitle, item.quantity, item.unitPrice,
    item.totalOriginalPrice, item.paymentId, item.itemNetAmountApprox,
    item.itemMeliCostApprox, item.meliCostPercent, item.buyerNickname
  ]);

  // Combinar las órdenes nuevas con las existentes.
  // Es importante evitar duplicados si una orden ya estaba pero se volvió a traer por el rango de fechas.
  // Usaremos el `existingOrderIdsOnSheet` para filtrar las `newOrderItemsAsArrays`
  const uniqueNewOrderItemsArrays = newOrderItemsAsArrays.filter(newRow => !existingOrderIdsOnSheet.has(String(newRow[0])));

  const allOrderItemsData = [...uniqueNewOrderItemsArrays, ...existingOrdersData];
  Logger.log(`Total de líneas de ítems a escribir (nuevas únicas + existentes): ${allOrderItemsData.length}. (${uniqueNewOrderItemsArrays.length} nuevas únicas)`);

  if (allOrderItemsData.length === 0) {
      Logger.log("No hay datos de órdenes para escribir (ni nuevas ni existentes).");
      sheet.clearContents(); // Limpiar la hoja si no hay nada
      const headers = ['ID Orden', 'Fecha Creación Orden', 'Fecha de Pago', 'Estado Orden', 'ID Item', 'Titulo Item', 'Cantidad', 'Precio Unitario (Lista)', 'Total Lista', 'ID Pago', 'Neto Recibido Item (Aprox)', 'Costo Total Meli (Aprox)', '% Costo Meli (s/Total Lista)', 'Comprador Nickname'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.getRange(2,1).setValue("No se encontraron órdenes.");
      return true;
  }


  // Ordenar todos los datos combinados por Fecha de Pago (columna C, índice 2), descendente.
  allOrderItemsData.sort((a, b) => {
    const dateA = a[2] instanceof Date ? a[2] : (a[2] ? new Date(a[2]) : new Date(0)); // Fallback a fecha muy antigua si es null/undefined
    const dateB = b[2] instanceof Date ? b[2] : (b[2] ? new Date(b[2]) : new Date(0));
    return dateB - dateA; // Descendente
  });

  // Escribir en la hoja
  try {
    sheet.clearContents(); // Limpiar la hoja antes de escribir todo (nuevas + existentes ordenadas)
    const headers = ['ID Orden', 'Fecha Creación Orden', 'Fecha de Pago', 'Estado Orden', 'ID Item', 'Titulo Item', 'Cantidad', 'Precio Unitario (Lista)', 'Total Lista', 'ID Pago', 'Neto Recibido Item (Aprox)', 'Costo Total Meli (Aprox)', '% Costo Meli (s/Total Lista)', 'Comprador Nickname'];
    const numColumns = headers.length;
    sheet.getRange(1, 1, 1, numColumns).setValues([headers]).setFontWeight('bold');

    const dataToWrite = allOrderItemsData.map(row => {
      // Asegurar formato numérico correcto y que la fila tenga la longitud correcta
      if (row[10] !== null && !isNaN(parseFloat(row[10]))) row[10] = parseFloat(Number(row[10]).toFixed(2)); else row[10] = null;
      if (row[11] !== null && !isNaN(parseFloat(row[11]))) row[11] = parseFloat(Number(row[11]).toFixed(2)); else row[11] = null;
      if (row[12] !== null && !isNaN(parseFloat(row[12]))) row[12] = parseFloat(Number(row[12]).toFixed(2)); else row[12] = null;
      
      // Rellenar con nulls si la fila es más corta que los encabezados
      while (row.length < numColumns) row.push(null);
      return row.slice(0, numColumns); // Asegurar que no sea más larga
    });

    if (dataToWrite.length > 0) {
        sheet.getRange(2, 1, dataToWrite.length, numColumns).setValues(dataToWrite);
        // Aplicar formatos de número y fecha
        sheet.getRange(2, 2, dataToWrite.length, 2).setNumberFormat("yyyy-mm-dd hh:mm:ss"); // Fechas Creación y Pago
        sheet.getRange(2, 7, dataToWrite.length, 1).setNumberFormat("#,##0"); // Cantidad
        sheet.getRange(2, 8, dataToWrite.length, 2).setNumberFormat("$#,##0.00"); // Precios Unitario y Total Lista
        sheet.getRange(2, 11, dataToWrite.length, 2).setNumberFormat("$#,##0.00"); // Neto y Costo Meli
        sheet.getRange(2, 13, dataToWrite.length, 1).setNumberFormat('0.00"%"');   // % Costo Meli
        Logger.log(`Datos de órdenes escritos y formateados en "${ORDERS_DETAIL_SHEET_NAME}". Total de líneas: ${dataToWrite.length}.`);
    } else {
        Logger.log(`No hay datos finales de órdenes para escribir en "${ORDERS_DETAIL_SHEET_NAME}".`);
        sheet.getRange(2,1).setValue("No se encontraron datos de órdenes.");
    }
    
    ss.toast(`${uniqueNewOrderItemsArrays.length} nuevas líneas de ítems de órdenes agregadas. Hoja actualizada.`, "Órdenes Completado", 7);
    return true;

  } catch (e) {
    Logger.log(`populateMeliOrderDetailsSheet: Error CRÍTICO al escribir en hoja: ${e.toString()}. Stack: ${e.stack ? e.stack.substring(0,500) : 'N/A'}`);
    ss.toast(`Error escribiendo órdenes: ${e.message}`, "Error Fatal Escritura", 10);
    return false;
  }
}
