// ============================================================================
// --- ARCHIVO: ApiMeli_Orders.gs ---
// ============================================================================
// Descripción: Funciones para interactuar con los endpoints de la API de
//              Mercado Libre relacionados con Órdenes/Pedidos.
// ============================================================================

/**
 * Obtiene los datos crudos de las órdenes y sus items desde la API de Meli.
 * Esta función se encarga de la paginación y la recolección de datos.
 * @param {string} token - El token de acceso OAuth2.
 * @param {number} sellerId - El ID del vendedor de Mercado Libre.
 * @param {string} dateFromString - Fecha de inicio para la búsqueda en formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ).
 * @param {string} dateToString - Fecha de fin para la búsqueda en formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ).
 * @param {SpreadsheetApp.Spreadsheet} ss - La instancia del Spreadsheet activo (para mostrar toasts).
 * @param {Set<string>} [existingOrderIdsOnSheet=new Set()] - Un Set con los IDs de las órdenes ya existentes en la hoja para evitar reprocesarlas innecesariamente si la lógica de fechas no es suficiente.
 * @return {Array<object>} Un array de objetos, donde cada objeto representa un item de una orden con detalles combinados.
 */
function fetchRawOrderData(token, sellerId, dateFromString, dateToString, ss, existingOrderIdsOnSheet = new Set()) {
  Logger.log(`WorkspaceRawOrderData: Vendedor ${sellerId}, Desde: ${dateFromString}, Hasta: ${dateToString}`);
  if (ss) ss.toast(`Buscando órdenes desde ${dateFromString.substring(0, 10)}...`, "Órdenes API", -1);

  let offset = 0;
  let allNewOrderItemsData = []; // Almacenará los *items* de las órdenes nuevas
  let pagesFetched = 0;
  const MAX_ORDER_PAGES_TO_FETCH = 50; // Límite para evitar bucles infinitos en casos raros

  try {
    while (pagesFetched < MAX_ORDER_PAGES_TO_FETCH) {
      pagesFetched++;
      const ordersUrl = `${MELI_API_BASE_URL}/orders/search?seller=${sellerId}&order.status=paid&order.date_created.from=${dateFromString}&order.date_created.to=${dateToString}&limit=${ORDERS_PAGE_SIZE}&offset=${offset}&sort=date_desc`;
      Logger.log(`Consultando órdenes: ${ordersUrl}`);

      let orderResponse = null;
      let retries = 0;
      const MAX_RETRIES = 3;

      // Reintentos para la llamada API de órdenes
      while (retries < MAX_RETRIES && orderResponse === null) {
        try {
          const apiOptions = { // Forzar datos frescos para esta consulta crítica
            headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' },
            muteHttpExceptions: true
          };
          const httpResponse = UrlFetchApp.fetch(ordersUrl, apiOptions);
          const responseCode = httpResponse.getResponseCode();
          if (responseCode >= 200 && responseCode < 300) {
            orderResponse = JSON.parse(httpResponse.getContentText());
          } else {
            Logger.log(`Error API (${responseCode}) obteniendo órdenes (página ${pagesFetched}, intento ${retries + 1}). Respuesta: ${httpResponse.getContentText().substring(0,200)}`);
            retries++;
            Utilities.sleep(API_CALL_DELAY * (retries + 1)); // Backoff exponencial simple
          }
        } catch (e) {
          retries++;
          Logger.log(`Excepción en intento ${retries} al obtener órdenes (página ${pagesFetched}): ${e.message}`);
          Utilities.sleep(API_CALL_DELAY * (retries + 1));
        }
      }

      if (orderResponse === null) {
        Logger.log(`Fallo al obtener órdenes (offset ${offset}) después de ${MAX_RETRIES} intentos. Se detiene la obtención de esta página.`);
        // Considerar si se debe detener todo o continuar con lo que se tiene.
        // Por ahora, si una página falla repetidamente, rompemos el bucle de paginación.
        break;
      }

      if (orderResponse && orderResponse.results && Array.isArray(orderResponse.results)) {
        const orders = orderResponse.results;
        if (orders.length === 0) {
          Logger.log('No más órdenes nuevas encontradas en esta paginación.');
          break;
        }
        Logger.log(`WorkspaceRawOrderData: Página ${pagesFetched} (${offset}-${offset + orders.length - 1}) tiene ${orders.length} órdenes.`);

        let newOrdersInThisPage = 0;
        for (const order of orders) {
          const orderId = order.id;

          // Si ya tenemos esta orden en la hoja (según el Set pasado), la saltamos.
          // Esto es una doble verificación además del filtro de fechas.
          if (existingOrderIdsOnSheet.has(String(orderId))) {
            // Logger.log(`Orden ${orderId} ya existe en la hoja (según Set), saltando detalles de API.`);
            continue;
          }
          newOrdersInThisPage++;

          const dateCreated = order.date_created ? new Date(order.date_created) : null;
          let datePaid = null;
          if (order.payments && order.payments.length > 0) {
              if (order.payments[0].date_approved) {
                  datePaid = new Date(order.payments[0].date_approved);
              } else if (order.payments[0].date_created) {
                  // Fallback a date_created del pago si date_approved no está.
                  datePaid = new Date(order.payments[0].date_created);
              }
          }


          const orderStatus = order.status;
          const paymentId = (order.payments && order.payments.length > 0) ? order.payments[0].id : null;
          const buyerNickname = (order.buyer && order.buyer.nickname) ? order.buyer.nickname : '';
          let orderNetAmount = null; // Neto total de la orden

          // Obtener detalles de la colección/pago si hay paymentId
          if (paymentId) {
            Utilities.sleep(API_CALL_DELAY); // Pausa antes de la llamada a /collections
            try {
              const collectionUrl = `${MELI_API_BASE_URL}/collections/${paymentId}`;
              const collectionResponse = makeApiCall(collectionUrl, token); // Asume makeApiCall en ApiMeli_Core.gs
              const collectionDetails = collectionResponse ? (collectionResponse.collection || collectionResponse) : null;

              if (collectionDetails) {
                if (collectionDetails.transaction_details && collectionDetails.transaction_details.net_received_amount !== undefined) {
                  orderNetAmount = collectionDetails.transaction_details.net_received_amount;
                } else if (collectionDetails.net_received_amount !== undefined) { // Campo alternativo
                  orderNetAmount = collectionDetails.net_received_amount;
                }
              } else {
                  Logger.log(`WARN: No se obtuvieron detalles de colección para el pago ${paymentId} de la orden ${orderId}.`);
              }
            } catch (e) {
              Logger.log(`Error obteniendo detalles de colección para el pago ${paymentId} (Orden ${orderId}): ${e.message}`);
              // Continuar procesando la orden con la información que se tenga.
            }
          } else {
            Logger.log(`INFO: Orden ${orderId} sin ID de pago (paymentId). No se pueden obtener detalles de colección.`);
          }

          // Procesar items de la orden
          if (order.order_items && Array.isArray(order.order_items) && order.order_items.length > 0) {
            order.order_items.forEach((orderItem) => {
              const itemId = orderItem.item ? orderItem.item.id : null;
              if (!itemId) {
                Logger.log(`WARN: Ítem sin ID en la orden ${orderId}. Datos del ítem: ${JSON.stringify(orderItem).substring(0,100)}`);
                return; // Saltar este ítem si no tiene ID
              }

              const itemTitle = orderItem.item ? orderItem.item.title : '';
              const quantity = orderItem.quantity;
              const unitPrice = orderItem.unit_price || 0; // Precio de lista unitario
              const totalOriginalPrice = quantity * unitPrice; // Total de lista para este ítem

              let itemNetAmountApprox = null;
              let itemMeliCostApprox = null;
              let meliCostPercent = 0;

              // Distribuir el neto de la orden entre los items si hay múltiples items
              // y si se pudo obtener el orderNetAmount.
              if (orderNetAmount !== null && order.total_amount && order.total_amount > 0) {
                  // Usar full_unit_price si está disponible, sino unit_price para calcular la proporción.
                  const priceToUseForProportion = (orderItem.full_unit_price !== undefined && orderItem.full_unit_price !== null) ? orderItem.full_unit_price : unitPrice;
                  const totalItemEffectivePrice = quantity * priceToUseForProportion;
                  const baseTotalForNetProportion = order.total_amount; // Total de la orden

                  if (baseTotalForNetProportion > 0) {
                      const itemValueFraction = totalItemEffectivePrice / baseTotalForNetProportion;
                      // Asegurar que la fracción sea razonable (ej. no negativa o > 1, con un pequeño margen)
                      if (itemValueFraction >= 0 && itemValueFraction <= 1.01) { // Margen de 1% por redondeos
                          itemNetAmountApprox = orderNetAmount * itemValueFraction;
                      } else if (order.order_items.length === 1) {
                          // Si es un solo item en la orden, todo el neto es para él.
                          itemNetAmountApprox = orderNetAmount;
                      } else {
                          Logger.log(`WARN: Fracción de valor de ítem (${itemValueFraction.toFixed(4)}) fuera de rango para orden ${orderId}, item ${itemId}. No se calculará neto proporcional.`);
                      }
                  }
              } else if (order.order_items.length === 1 && orderNetAmount !== null) {
                  // Si es un solo item y tenemos neto de la orden, asignarlo.
                  itemNetAmountApprox = orderNetAmount;
              }


              if (itemNetAmountApprox !== null) {
                itemMeliCostApprox = totalOriginalPrice - itemNetAmountApprox;
              }

              // Calcular porcentaje de costo de Meli
              if (itemMeliCostApprox !== null && totalOriginalPrice > 0) {
                  // Evitar división por cero si el precio original es 0, y manejar netos muy pequeños como 0 costo.
                  if (Math.abs(itemNetAmountApprox) < 0.001 && Math.abs(totalOriginalPrice) < 0.001) { // Ambos son prácticamente cero
                      itemMeliCostApprox = 0;
                      meliCostPercent = 0;
                  } else {
                      meliCostPercent = (itemMeliCostApprox / totalOriginalPrice) * 100;
                  }
              } else if (itemNetAmountApprox === null && totalOriginalPrice > 0) {
                  // No se pudo calcular el neto, así que no se puede calcular el costo.
              }


              allNewOrderItemsData.push({ // Guardar como objeto para facilitar el manejo posterior
                orderId: orderId,
                dateCreated: dateCreated,
                datePaid: datePaid,
                orderStatus: orderStatus,
                itemId: itemId,
                itemTitle: itemTitle,
                quantity: quantity,
                unitPrice: unitPrice,
                totalOriginalPrice: totalOriginalPrice,
                paymentId: paymentId,
                itemNetAmountApprox: itemNetAmountApprox,
                itemMeliCostApprox: itemMeliCostApprox,
                meliCostPercent: meliCostPercent,
                buyerNickname: buyerNickname
              });
            });
          } else {
            Logger.log(`WARN: Orden ${orderId} sin order_items o array vacío.`);
          }
        } // Fin del bucle por órdenes de la página

        if (ss) ss.toast(`Órdenes: Página ${pagesFetched} procesada (${newOrdersInThisPage} nuevas órdenes en esta pág)...`, "Órdenes API", 5);

        // Paginación
        const paging = orderResponse.paging;
        if (paging && paging.total && (paging.offset + orders.length) < paging.total) {
          offset = paging.offset + orders.length; // Avanzar al siguiente offset
          Utilities.sleep(API_CALL_DELAY); // Pausa entre páginas
        } else {
          Logger.log('Fin de la paginación de órdenes.');
          break; // Salir del while(true)
        }
      } else {
        Logger.log(`Respuesta de órdenes inesperada o sin resultados (offset ${offset}).`);
        break; // Salir del while(true)
      }
    } // Fin del while(true) de paginación

    Logger.log(`WorkspaceRawOrderData: Se obtuvieron datos para ${allNewOrderItemsData.length} ítems de órdenes nuevas.`);
    return allNewOrderItemsData;

  } catch (e) {
    Logger.log(`Error CRÍTICO en fetchRawOrderData: ${e.toString()}. Stack: ${e.stack ? e.stack.substring(0,500) : 'N/A'}`);
    if (ss) ss.toast(`Error crítico obteniendo órdenes: ${e.message}`, "Error Órdenes API", 10);
    // Devolver lo que se haya podido recolectar si hubo un error no fatal antes.
    // Si el error es por token o rate limit, makeApiCall ya lo habría lanzado.
    return allNewOrderItemsData.length > 0 ? allNewOrderItemsData : []; // Devolver vacío en error crítico sin datos.
  }
}