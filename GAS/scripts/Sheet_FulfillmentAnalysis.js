// ============================================================================
// --- ARCHIVO: Sheet_FulfillmentAnalysis.gs ---
// ============================================================================
// Descripción: Funciones para la gestión y análisis de stock en Fulfillment (Full),
//              incluyendo la obtención de datos y la creación de informes.
// ============================================================================

/**
 * Obtiene información sobre el stock en Fulfillment (Full) para los items especificados
 * y escribe los resultados en la hoja STOCK_FULL_SHEET_NAME.
 * @param {string} token - El token de acceso OAuth2.
 * @param {Array<string>} itemIds - Un array con los IDs de los ítems.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - La instancia del Spreadsheet activo.
 * @return {boolean} True si la operación fue exitosa, false en caso contrario.
 */
function obtenerStockFulfillment(token, itemIds, ss) {
  const sheetName = STOCK_FULL_SHEET_NAME; // De Constantes.gs
  let fullSheet = ss.getSheetByName(sheetName);
  if (!fullSheet) {
    fullSheet = ss.insertSheet(sheetName);
    Logger.log(`Hoja "${sheetName}" creada.`);
  } else {
    fullSheet.clearContents(); // Limpiar para datos frescos
    Logger.log(`Hoja "${sheetName}" limpiada.`);
  }

  if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
    Logger.log("obtenerStockFulfillment: No hay IDs de ítems para analizar.");
    ss.toast("No hay IDs de publicaciones para analizar stock Full.", "Aviso", 7);
    fullSheet.getRange(1,1).setValue("No se proporcionaron IDs de ítems.");
    return false;
  }

  Logger.log(`Obteniendo datos de stock en Full para ${itemIds.length} items.`);
  ss.toast(`Consultando stock en Full para ${itemIds.length} publicaciones...`, "Stock Full", -1);

  const stockFullDataToWrite = [];
  const headers = ['ID Publicación', 'SKU', 'Usa Full', 'Stock Disponible', 'Stock Reservado', 'Stock en Tránsito', 'Stock Total', 'Última Actualización', 'Inventory ID', 'Error'];
  fullSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

  for (let i = 0; i < itemIds.length; i++) {
    const itemId = itemIds[i];
    if (!itemId) {
        Logger.log(`WARN: Item ID nulo o vacío en la posición ${i}. Saltando.`);
        continue;
    }

    let dataRow;
    try {
      const stockDataItem = obtenerDatosFulfillmentItem(token, itemId); // De ApiMeli_Fulfillment.gs

      if (stockDataItem) {
        dataRow = [
          itemId,
          stockDataItem.sku || "",
          stockDataItem.tieneFullFillment ? "Sí" : "No",
          stockDataItem.stockDisponible || 0,
          stockDataItem.stockReservado || 0,
          stockDataItem.stockEnTransito || 0,
          stockDataItem.stockTotal || 0,
          stockDataItem.ultimaActualizacion ? new Date(stockDataItem.ultimaActualizacion) : null,
          stockDataItem.inventoryId || "",
          stockDataItem.error || ""
        ];
      } else {
        // Si obtenerDatosFulfillmentItem devuelve null (error crítico o item no encontrado)
        dataRow = [itemId, "", "Error", 0, 0, 0, 0, new Date(), "", "Fallo al obtener datos"];
      }
    } catch (itemError) {
      Logger.log(`Error procesando stock Full para ítem ${itemId}: ${itemError.message}`);
      dataRow = [itemId, "", "Error", 0, 0, 0, 0, new Date(), "", itemError.message];
    }
    stockFullDataToWrite.push(dataRow);

    if ((i + 1) % BATCH_SIZE_ITEMS_FOR_LOGGING === 0 || (i + 1) === itemIds.length) {
      ss.toast(`Stock Full: Procesados ${i + 1}/${itemIds.length}...`, "Progreso Stock Full", 5);
    }
    Utilities.sleep(API_CALL_DELAY / 2); // Pausa más corta ya que obtenerDatosFulfillmentItem puede tener sus propias pausas
  }

  if (stockFullDataToWrite.length > 0) {
    fullSheet.getRange(2, 1, stockFullDataToWrite.length, headers.length).setValues(stockFullDataToWrite);
    // Formatear columnas
    fullSheet.getRange(2, 4, stockFullDataToWrite.length, 4).setNumberFormat('#,##0'); // Columnas de Stock
    fullSheet.getRange(2, 8, stockFullDataToWrite.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss'); // Última Actualización

    // Aplicar formato condicional para stock disponible (columna D, índice 3)
    const rangeStockDisp = fullSheet.getRange(2, 4, stockFullDataToWrite.length, 1);
    let rules = fullSheet.getConditionalFormatRules(); // Preservar reglas existentes si las hubiera
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThanOrEqualTo(3).setBackground("#ffccc7").setRanges([rangeStockDisp]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(4, 10).setBackground("#fffbe6").setRanges([rangeStockDisp]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(10).setBackground("#d9f7be").setRanges([rangeStockDisp]).build());
    
    // Formato para columna 'Usa Full' (columna C, índice 2)
    const rangeUsaFull = fullSheet.getRange(2, 3, stockFullDataToWrite.length, 1);
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Sí").setBackground("#e6f7ff").setRanges([rangeUsaFull]).build()); // Azul claro
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("No").setBackground("#f0f0f0").setRanges([rangeUsaFull]).build()); // Gris claro
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Error").setBackground("#ffccc7").setRanges([rangeUsaFull]).build()); // Rojo claro

    fullSheet.setConditionalFormatRules(rules);
    fullSheet.autoResizeColumns(1, headers.length);
    Logger.log(`Análisis de stock en Full completado para ${stockFullDataToWrite.length} ítems. Hoja "${sheetName}" actualizada.`);
  } else {
    fullSheet.getRange(2,1).setValue("No se procesaron datos de stock Full.");
    Logger.log(`No se escribieron datos de stock Full en "${sheetName}".`);
  }
  ss.toast(`Stock en Full actualizado. ${stockFullDataToWrite.length} ítems procesados.`, "Completado", 7);
  return true;
}


/**
 * Analiza el stock no disponible devuelto por la API de Fulfillment.
 * @param {object} stockData - El objeto de datos de stock de la API (específicamente la respuesta de /inventories/{inventory_id}/stock/fulfillment).
 * @return {object} Un resumen categorizado del stock no disponible.
 */
function analizarStockNoDisponible(stockData) {
  const resumen = {
    dañados: { total: 0, llegadaDañados: 0, dañadosEnFull: 0, otrosDañados: 0 },
    noSoportados: { total: 0, dimensionesExcesivas: 0, problemasCaducidad: 0, empaquetadoInadecuado: 0, inflamable: 0, problemaRegulación: 0, identificadorDuplicado: 0, sinIdentificador: 0, skuMultiple: 0, identificadorInválido: 0, problemaDevolucion: 0, otrosNoSoportados: 0 },
    perdidos: 0,
    reservadosRetiro: 0, // withdrawal
    sinCoberturaFiscal: 0, // noFiscalCoverage
    procesoInterno: 0, // internal_process
    transferencia: 0, // transfer
    otrosNoDisponibles: 0 // Para status no mapeados
  };

  if (!stockData || !stockData.not_available_detail || !Array.isArray(stockData.not_available_detail)) {
    return resumen;
  }

  stockData.not_available_detail.forEach(detail => {
    const quantity = detail.quantity || 0;
    switch (detail.status) {
      case 'damaged':
        resumen.dañados.total += quantity;
        if (detail.conditions && Array.isArray(detail.conditions)) {
          let asignadoACondicionEspecifica = false;
          detail.conditions.forEach(cond => {
            if (cond.condition === 'arrived_damaged') { resumen.dañados.llegadaDañados += cond.quantity || 0; asignadoACondicionEspecifica = true; }
            else if (cond.condition === 'damaged_in_full') { resumen.dañados.dañadosEnFull += cond.quantity || 0; asignadoACondicionEspecifica = true; }
          });
          if (!asignadoACondicionEspecifica && quantity > 0) resumen.dañados.otrosDañados += quantity; // Si hay cantidad pero no coincide con sub-condiciones conocidas
        } else {
          resumen.dañados.otrosDañados += quantity; // No hay 'conditions', sumar a otrosDañados
        }
        break;
      case 'not_supported':
        resumen.noSoportados.total += quantity;
        if (detail.conditions && Array.isArray(detail.conditions)) {
          let asignadoACondicionEspecificaNS = false;
          detail.conditions.forEach(cond => {
            const cq = cond.quantity || 0;
            switch (cond.condition) {
              case 'dimensions_exceeds': resumen.noSoportados.dimensionesExcesivas += cq; asignadoACondicionEspecificaNS = true; break;
              case 'expiration_problem': resumen.noSoportados.problemasCaducidad += cq; asignadoACondicionEspecificaNS = true; break;
              case 'package_problem': resumen.noSoportados.empaquetadoInadecuado += cq; asignadoACondicionEspecificaNS = true; break;
              case 'flammable': resumen.noSoportados.inflamable += cq; asignadoACondicionEspecificaNS = true; break;
              case 'regulation_problem': resumen.noSoportados.problemaRegulación += cq; asignadoACondicionEspecificaNS = true; break;
              case 'multiple_identifier': resumen.noSoportados.identificadorDuplicado += cq; asignadoACondicionEspecificaNS = true; break;
              case 'empty_identifier': resumen.noSoportados.sinIdentificador += cq; asignadoACondicionEspecificaNS = true; break;
              case 'multiple_sku': resumen.noSoportados.skuMultiple += cq; asignadoACondicionEspecificaNS = true; break;
              case 'invalid_identifier': resumen.noSoportados.identificadorInválido += cq; asignadoACondicionEspecificaNS = true; break;
              case 'return_problem': resumen.noSoportados.problemaDevolucion += cq; asignadoACondicionEspecificaNS = true; break;
            }
          });
           if (!asignadoACondicionEspecificaNS && quantity > 0) resumen.noSoportados.otrosNoSoportados += quantity;
        } else {
            resumen.noSoportados.otrosNoSoportados += quantity;
        }
        break;
      case 'lost': resumen.perdidos += quantity; break;
      case 'withdrawal': resumen.reservadosRetiro += quantity; break;
      case 'noFiscalCoverage': resumen.sinCoberturaFiscal += quantity; break;
      case 'internal_process': resumen.procesoInterno += quantity; break;
      case 'transfer': resumen.transferencia += quantity; break;
      default:
        Logger.log(`Stock no disponible con status desconocido: ${detail.status}, Cantidad: ${quantity}`);
        resumen.otrosNoDisponibles += quantity;
        break;
    }
  });
  return resumen;
}

/**
 * Realiza un análisis completo del stock en Fulfillment para todos los productos.
 * Combina información de stock, operaciones y detalles del producto.
 * Escribe los resultados en la hoja ANALISIS_FULL_SHEET_NAME.
 * @param {number} diasHistorialOps - Días hacia atrás para analizar operaciones de stock.
 * @return {object} Objeto con el resultado del análisis: { success, itemsCount, ... }.
 */
function realizarAnalisisCompletoFulfillment(diasHistorialOps = 90) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Iniciando Análisis Completo de Fulfillment...", "Análisis Full", -1);

  try {
    const service = getMeliService();
    const token = service.getToken();
    if (!token) {
      ss.toast("Error: No hay token. Autoriza la aplicación.", "Error Auth", 10);
      return { success: false, error: "No hay token válido" };
    }
    const userId = getUserId(token);
    if (!userId) {
      ss.toast("Error: No se pudo obtener User ID.", "Error User ID", 10);
      return { success: false, error: "No se pudo obtener User ID" };
    }

    let fullAnalysisSheet = ss.getSheetByName(ANALISIS_FULL_SHEET_NAME);
    if (!fullAnalysisSheet) {
      fullAnalysisSheet = ss.insertSheet(ANALISIS_FULL_SHEET_NAME);
    }
    fullAnalysisSheet.clear();
    const headers = [
      'ID Publicación', 'SKU', 'Título', 'Inventory ID', 'Usa Full', 'Stock Disp.', 'Stock No Disp.', 'Stock Total',
      'Reserv. Retiro', 'Dañados Total', 'Lleg. Dañados', 'Dañados Full', 'Otros Dañados', 'Perdidos', 'Sin Cob. Fiscal',
      'Días desde 1er Ingreso', 'Última Op.', 'Nivel Crítico', 'Recomendación', /*'Prioridad Oculta',*/ 'Método Detección ID'
    ];
    // Ajustar el número de encabezados si se omite la columna de prioridad
    fullAnalysisSheet.getRange(1, 1, 1, headers.length /*-1 si se quita prioridad*/).setValues([headers.slice(0, headers.length /*-1*/)]).setFontWeight('bold');


    const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
    const itemInfoGlobalMap = {}; // Mapa itemId -> {sku, titulo}
    if (targetSheet && targetSheet.getLastRow() > 1) {
        targetSheet.getRange(2, 1, targetSheet.getLastRow() - 1, 7).getValues().forEach(row => {
            if (row[6]) itemInfoGlobalMap[String(row[6])] = { sku: row[0] || "", titulo: row[1] || "" };
        });
    }
    ss.toast(`Cargados ${Object.keys(itemInfoGlobalMap).length} SKUs/Títulos de Hoja Principal.`, "Análisis Full", 5);

    const allItemIds = getAllMyItemIds(token, userId);
    if (!allItemIds || allItemIds.length === 0) {
      ss.toast("No hay publicaciones para analizar.", "Análisis Full", 7);
      fullAnalysisSheet.getRange(2,1).setValue("No se encontraron publicaciones activas o pausadas.");
      return { success: true, itemsCount: 0, message: "No items to analyze" };
    }
    ss.toast(`Analizando ${allItemIds.length} publicaciones para Fulfillment...`, "Análisis Full", -1);

    const analysisData = [];
    const dateToOps = new Date();
    const dateFromOps = new Date(dateToOps.getTime() - (diasHistorialOps * 24 * 60 * 60 * 1000));
    const dateFromStr = Utilities.formatDate(dateFromOps, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const dateToStr = Utilities.formatDate(dateToOps, Session.getScriptTimeZone(), "yyyy-MM-dd");

    for (let i = 0; i < allItemIds.length; i++) {
      const itemId = allItemIds[i];
      const fallbackInfo = itemInfoGlobalMap[String(itemId)] || {sku: "", titulo: ""};
      let sku = fallbackInfo.sku;
      let titulo = fallbackInfo.titulo;

      const idSearchResult = buscarInventoryIdIntensivo(token, itemId, userId); // De ApiMeli_Fulfillment.gs
      const inventoryId = idSearchResult.inventoryId;
      const usaFull = idSearchResult.usaFull;
      const metodoDeteccion = idSearchResult.metodoEncontrado;
      
      let rowData = [itemId, sku, titulo, inventoryId || "N/A", usaFull ? "Sí" : "No", 0,0,0,0,0,0,0,0,0,0,0,"N/A","Normal","", /*prioridad*/ metodoDeteccion];

      if (usaFull && inventoryId) {
        const stockDetails = consultarStockFulfillment(token, inventoryId); // De ApiMeli_Fulfillment.gs
        if (stockDetails && stockDetails.inventory) {
          const inv = stockDetails.inventory;
          rowData[5] = inv.available_quantity || 0; // Stock Disp
          rowData[7] = inv.total || ((inv.available_quantity || 0) + (inv.not_available_quantity || 0)); // Stock Total
          
          // Para stock no disponible, necesitamos el endpoint que devuelve not_available_detail
          const detailedStockUrl = `${MELI_API_BASE_URL}/inventories/${inventoryId}/stock/fulfillment?include_attributes=conditions`;
          const detailedStockData = makeApiCall(detailedStockUrl, token);
          if (detailedStockData) {
              rowData[6] = detailedStockData.not_available_quantity || 0; // Stock No Disp
              const resumenNoDisp = analizarStockNoDisponible(detailedStockData); // Esta función necesita la respuesta con not_available_detail
              rowData[8] = resumenNoDisp.reservadosRetiro;
              rowData[9] = resumenNoDisp.dañados.total;
              rowData[10] = resumenNoDisp.dañados.llegadaDañados;
              rowData[11] = resumenNoDisp.dañados.dañadosEnFull;
              rowData[12] = resumenNoDisp.dañados.otrosDañados;
              rowData[13] = resumenNoDisp.perdidos;
              rowData[14] = resumenNoDisp.sinCoberturaFiscal;
          } else {
              rowData[6] = inv.not_available_quantity || 0; // Si falla el detallado, usar el general
              Logger.log(`WARN: No se pudo obtener el detalle de stock no disponible para ${inventoryId}`);
          }


          const operaciones = obtenerOperacionesStock(token, inventoryId, userId, dateFromStr, dateToStr); // De ApiMeli_Fulfillment.gs
          if (operaciones && operaciones.length > 0) {
            operaciones.sort((a,b) => new Date(a.date_created) - new Date(b.date_created)); // Más antiguo primero
            const primerIngreso = operaciones.find(op => op.type === "INBOUND_RECEPTION");
            if (primerIngreso) {
              rowData[15] = Math.round((new Date() - new Date(primerIngreso.date_created)) / (1000*60*60*24)); // Días desde 1er Ingreso
            }
            rowData[16] = Utilities.formatDate(new Date(operaciones[operaciones.length - 1].date_created), Session.getScriptTimeZone(), "yyyy-MM-dd"); // Última Op.
          }
        } else {
            rowData[4] = "Sí (Error Stock)"; // Usa Full pero no se pudo leer el stock
        }
      } else if (usaFull && !inventoryId) {
          rowData[4] = "Sí (Sin Inv. ID)";
      } else if (!usaFull) {
          // Si no usa Full, obtener stock disponible del item principal
          const itemDetailsNoFull = makeApiCall(`${MELI_API_BASE_URL}/items/${itemId}?attributes=available_quantity,title,seller_sku`, token);
          if (itemDetailsNoFull) {
              rowData[5] = itemDetailsNoFull.available_quantity || 0;
              rowData[7] = itemDetailsNoFull.available_quantity || 0; // Total es igual a disponible
              if (!sku && itemDetailsNoFull.seller_sku) rowData[1] = itemDetailsNoFull.seller_sku;
              if (!titulo && itemDetailsNoFull.title) rowData[2] = itemDetailsNoFull.title;
          }
      }
      
      // Lógica de Nivel Crítico y Recomendación (simplificada)
      let prioridad = 900; // Default baja prioridad
      if (usaFull) {
          if (rowData[5] === 0 && rowData[7] > 0) { rowData[17] = "Crítico"; rowData[18] = "Todo stock no disponible"; prioridad = 100; }
          else if (rowData[5] <= 3 && rowData[5] > 0) { rowData[17] = "Crítico"; rowData[18] = "Reponer Urgente"; prioridad = 100 + rowData[5]; }
          else if (rowData[5] <= 10) { rowData[17] = "Advertencia"; rowData[18] = "Reponer Pronto"; prioridad = 200 + rowData[5]; }
          else if (rowData[9] > 0 && (rowData[9] / rowData[7] > 0.1)) { rowData[17] = "Advertencia"; rowData[18] = "Alto % Dañados"; prioridad = 300;}
          else if (rowData[13] > 0) { rowData[17] = "Advertencia"; rowData[18] = "Productos Perdidos"; prioridad = 350;}
          else { prioridad = 400 + Math.min(rowData[5],100); }
      }
      // rowData[19] = prioridad; // Si se usa la columna oculta
      analysisData.push(rowData.slice(0, headers.length /*-1 si se quita prioridad*/));

      if ((i + 1) % (BATCH_SIZE_ITEMS_FOR_LOGGING / 2) === 0 || (i + 1) === allItemIds.length) {
        ss.toast(`Análisis Full: Procesados ${i + 1}/${allItemIds.length}...`, "Progreso", 5);
      }
       Utilities.sleep(API_CALL_DELAY / 2); // Pausa entre items
    }

    // analysisData.sort((a,b) => a[19] - b[19]); // Ordenar por prioridad si se usa la columna oculta
    
    if (analysisData.length > 0) {
      fullAnalysisSheet.getRange(2, 1, analysisData.length, analysisData[0].length).setValues(analysisData);
      fullAnalysisSheet.getRange(2, 6, analysisData.length, 11).setNumberFormat("#,##0"); // Columnas de stock y días
      aplicarFormatoCondicionalFull(fullAnalysisSheet, analysisData.length); // De Sheet_Commons.gs
      fullAnalysisSheet.autoResizeColumns(1, analysisData[0].length);
    }
    const itemsConFull = analysisData.filter(r => r[4].startsWith("Sí")).length;
    Logger.log(`Análisis Completo de Fulfillment finalizado. ${itemsConFull} ítems en Full. Hoja "${ANALISIS_FULL_SHEET_NAME}" actualizada.`);
    ss.toast(`Análisis Full completado. ${itemsConFull} ítems en Full.`, "Completado", 10);
    return { success: true, itemsCount: analysisData.length, withFull: itemsConFull };

  } catch (error) {
    Logger.log(`Error CRÍTICO en realizarAnalisisCompletoFulfillment: ${error.message}. Stack: ${error.stack}`);
    ss.toast(`Error crítico en Análisis Full: ${error.message}`, "Error Fatal", 10);
    return { success: false, error: error.message };
  }
}

/**
 * Genera un informe de productos críticos en Full, filtrando desde la hoja de análisis.
 */
function generarInformeProductosCriticos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Generando informe de productos críticos en Full...", "Informe Críticos", -1);

  try {
    const fullAnalysisSheet = ss.getSheetByName(ANALISIS_FULL_SHEET_NAME);
    if (!fullAnalysisSheet || fullAnalysisSheet.getLastRow() <= 1) {
      ss.toast("Hoja de Análisis Full no encontrada o vacía. Ejecuta primero el Análisis Completo.", "Error", 10);
      // Opcional: ejecutar el análisis si no existe.
      // const analisisResult = realizarAnalisisCompletoFulfillment();
      // if (!analisisResult.success) return;
      // fullAnalysisSheet = ss.getSheetByName(ANALISIS_FULL_SHEET_NAME); // re-obtener la hoja
      // if (!fullAnalysisSheet || fullAnalysisSheet.getLastRow() <=1) return; // Falló de nuevo
      return;
    }

    let criticosSheet = ss.getSheetByName(FULL_CRITICOS_SHEET_NAME);
    if (!criticosSheet) {
      criticosSheet = ss.insertSheet(FULL_CRITICOS_SHEET_NAME);
    }
    criticosSheet.clear();

    const fullAnalysisData = fullAnalysisSheet.getDataRange().getValues();
    const headers = fullAnalysisData[0]; // Tomar los encabezados de la hoja de análisis
    criticosSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

    const nivelCriticoIdx = headers.findIndex(h => h === 'Nivel Crítico');
    if (nivelCriticoIdx === -1) {
      ss.toast("Columna 'Nivel Crítico' no encontrada en el análisis.", "Error Configuración", 10);
      return;
    }

    const productosCriticos = fullAnalysisData.slice(1).filter(row =>
      row[nivelCriticoIdx] === "Crítico" || row[nivelCriticoIdx] === "Advertencia"
    );

    if (productosCriticos.length > 0) {
      // Ordenar por la columna original de prioridad (si existiera y quisiéramos) o por Nivel Crítico y luego Stock Disponible
      productosCriticos.sort((a, b) => {
          const prioridadA = a[nivelCriticoIdx] === "Crítico" ? 1 : (a[nivelCriticoIdx] === "Advertencia" ? 2 : 3);
          const prioridadB = b[nivelCriticoIdx] === "Crítico" ? 1 : (b[nivelCriticoIdx] === "Advertencia" ? 2 : 3);
          if (prioridadA !== prioridadB) return prioridadA - prioridadB;
          return (a[5] || 0) - (b[5] || 0); // Col F (índice 5) es Stock Disponible
      });

      criticosSheet.getRange(2, 1, productosCriticos.length, headers.length).setValues(productosCriticos);
      // Re-aplicar formatos numéricos necesarios
      criticosSheet.getRange(2, 6, productosCriticos.length, 11).setNumberFormat("#,##0");
      // Re-aplicar formatos condicionales
      aplicarFormatoCondicionalFull(criticosSheet, productosCriticos.length); // De Sheet_Commons.gs
      criticosSheet.autoResizeColumns(1, headers.length);
      ss.toast(`Informe de ${productosCriticos.length} productos críticos en Full generado.`, "Completado", 10);
    } else {
      criticosSheet.getRange(2, 1).setValue("No se encontraron productos con nivel crítico o de advertencia en Full.");
      ss.toast("No hay productos críticos en Full.", "Informe", 7);
    }
  } catch (error) {
    Logger.log(`Error generando informe de productos críticos: ${error.message}. Stack: ${error.stack}`);
    ss.toast(`Error generando informe de críticos: ${error.message}`, "Error", 10);
  }
}