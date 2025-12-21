// ============================================================================
// --- ARCHIVO: Sheet_ItemStates.gs ---
// ============================================================================
// Descripción: Funciones para manejar la hoja de historial de estados de
//              publicaciones, incluyendo el registro diario y análisis.
// ============================================================================

/**
 * Procesa el historial de cambios de un ítem para calcular días activos/pausados.
 * Este es un análisis basado en los datos obtenidos de `obtenerHistorialCambiosItem`.
 * @param {object} historialData - Objeto devuelto por `obtenerHistorialCambiosItem`.
 * Debe contener { itemId, estadoActual, cambios, fechaUltimaActualizacion, ... }.
 * @param {Date} fechaInicioPeriodo - Fecha de inicio del período de análisis.
 * @param {Date} fechaFinPeriodo - Fecha de fin del período de análisis.
 * @return {object} Objeto con el análisis: { itemId, estadoActual, diasActivos, diasPausados, ultimoCambioRegistrado }.
 */
function procesarHistorialItem(historialData, fechaInicioPeriodo, fechaFinPeriodo) {
  const itemId = historialData.itemId;
  const analisis = {
    itemId: itemId,
    estadoActualCalculado: historialData.estadoActual || "desconocido", // El estado actual según la API del item
    diasActivos: 0,
    diasPausados: 0,
    diasOtroEstado: 0, // Para estados no 'active' ni 'paused'
    ultimoCambioRegistrado: null // Fecha del último cambio de estado DENTRO del período
  };

  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  // Si tenemos un historial de cambios detallado desde la API de /changes
  if (historialData.cambios && historialData.cambios.length > 0 && !historialData.cambiosAlternativos) {
    const cambiosRelevantes = historialData.cambios
      .filter(c => c.attribute === "status" && c.value && c.date_created) // Solo cambios de estado con valor y fecha
      .map(c => ({
        estado: c.value.toLowerCase(), // Normalizar a minúsculas
        fecha: new Date(c.date_created)
      }))
      .sort((a, b) => a.fecha - b.fecha); // Ordenar por fecha ascendente

    let fechaReferencia = new Date(fechaInicioPeriodo);
    let estadoPrevio = null; // Necesitamos saber el estado *antes* del primer cambio en el período.

    // Intentar determinar el estado al inicio del período.
    // Si el primer cambio es posterior al inicio del período, necesitamos el estado anterior a ese cambio.
    // Esto es complejo sin un snapshot del estado al inicio. Por ahora, si no hay cambio al inicio,
    // asumimos que el estado era el opuesto al primer cambio, o el estado actual si no hay cambios.
    if (cambiosRelevantes.length > 0 && cambiosRelevantes[0].fecha > fechaInicioPeriodo) {
        // Para simplificar, si el primer cambio es, por ejemplo, a 'active', asumimos que antes estaba 'paused'
        // O podríamos usar el 'estadoActual' del item si el último cambio es muy anterior.
        // Esta lógica puede necesitar refinamiento si se requiere alta precisión del estado inicial.
        estadoPrevio = (cambiosRelevantes[0].estado === 'active') ? 'paused' : 'active'; // Suposición simple
    } else if (cambiosRelevantes.length === 0) {
        estadoPrevio = historialData.estadoActual.toLowerCase(); // Sin cambios en período, usar estado actual para todo.
    }


    for (const cambio of cambiosRelevantes) {
      if (cambio.fecha < fechaInicioPeriodo) { // Si el cambio es anterior al período, solo actualiza el estado previo y la fecha de referencia
        estadoPrevio = cambio.estado;
        fechaReferencia = cambio.fecha; // La fecha de referencia se mueve con el último cambio ANTES del período
        continue;
      }

      if (cambio.fecha > fechaFinPeriodo) break; // Ignorar cambios posteriores al período

      // Calcular duración en el estado previo (estadoPrevio)
      if (estadoPrevio) { // Solo si teníamos un estado anterior conocido
        const diffMs = cambio.fecha - fechaReferencia;
        const diasEnEstado = Math.round(diffMs / MS_PER_DAY);

        if (estadoPrevio === 'active') analisis.diasActivos += diasEnEstado;
        else if (estadoPrevio === 'paused') analisis.diasPausados += diasEnEstado;
        else analisis.diasOtroEstado += diasEnEstado;
      }
      estadoPrevio = cambio.estado;
      fechaReferencia = cambio.fecha;
      analisis.ultimoCambioRegistrado = cambio.fecha;
    }

    // Calcular duración del último estado hasta el final del período
    if (estadoPrevio) { // Si hubo al menos un estado relevante
      const diffMsFinal = fechaFinPeriodo - fechaReferencia;
      const diasEnEstadoFinal = Math.round(diffMsFinal / MS_PER_DAY);

      if (estadoPrevio === 'active') analisis.diasActivos += diasEnEstadoFinal;
      else if (estadoPrevio === 'paused') analisis.diasPausados += diasEnEstadoFinal;
      else analisis.diasOtroEstado += diasEnEstadoFinal;
    }
    analisis.estadoActualCalculado = estadoPrevio || historialData.estadoActual.toLowerCase();


  } else { // Método alternativo: usar estadoActual y fechaUltimaActualizacion/disponibleDesde
    Logger.log(`Usando método alternativo para análisis de historial de ${itemId} (sin datos de /changes).`);
    const estadoActualItem = (historialData.estadoActual || "desconocido").toLowerCase();
    let fechaDeReferenciaEstadoActual = historialData.fechaUltimaActualizacion ? new Date(historialData.fechaUltimaActualizacion) : null;

    // Si la fecha de última actualización no es válida o es muy antigua, usar la fecha de inicio de publicación
    if (!fechaDeReferenciaEstadoActual || fechaDeReferenciaEstadoActual < new Date("2000-01-01")) { // Chequeo de validez
        if (historialData.disponibleDesde) {
            fechaDeReferenciaEstadoActual = new Date(historialData.disponibleDesde);
        }
    }
    
    analisis.ultimoCambioRegistrado = fechaDeReferenciaEstadoActual; // Puede ser null

    if (fechaDeReferenciaEstadoActual && fechaDeReferenciaEstadoActual >= fechaInicioPeriodo && fechaDeReferenciaEstadoActual <= fechaFinPeriodo) {
      // El "cambio" (o la última actualización conocida) ocurrió DENTRO del período.
      const diasAntesDelCambio = Math.round((fechaDeReferenciaEstadoActual - fechaInicioPeriodo) / MS_PER_DAY);
      const diasDespuesDelCambio = Math.round((fechaFinPeriodo - fechaDeReferenciaEstadoActual) / MS_PER_DAY);

      // Asumimos que el estado *antes* de fechaDeReferenciaEstadoActual era el opuesto (simplificación)
      if (estadoActualItem === 'active') {
        analisis.diasActivos = diasDespuesDelCambio;
        analisis.diasPausados = diasAntesDelCambio; // Suposición
      } else if (estadoActualItem === 'paused') {
        analisis.diasPausados = diasDespuesDelCambio;
        analisis.diasActivos = diasAntesDelCambio; // Suposición
      } else {
        analisis.diasOtroEstado = diasDespuesDelCambio + diasAntesDelCambio; // Si es otro estado
      }
      analisis.estadoActualCalculado = estadoActualItem;

    } else if (fechaDeReferenciaEstadoActual && fechaDeReferenciaEstadoActual < fechaInicioPeriodo) {
      // El último cambio conocido fue ANTES del período, así que el estado actual se aplica a todo el período.
      const diasTotalesPeriodo = Math.round((fechaFinPeriodo - fechaInicioPeriodo) / MS_PER_DAY);
      if (estadoActualItem === 'active') analisis.diasActivos = diasTotalesPeriodo;
      else if (estadoActualItem === 'paused') analisis.diasPausados = diasTotalesPeriodo;
      else analisis.diasOtroEstado = diasTotalesPeriodo;
      analisis.estadoActualCalculado = estadoActualItem;

    } else { // No hay fecha de referencia o es posterior al período (improbable pero posible)
      // Asumir estado actual para todo el período si no hay mejor info.
      const diasTotalesPeriodo = Math.round((fechaFinPeriodo - fechaInicioPeriodo) / MS_PER_DAY);
       if (estadoActualItem === 'active') analisis.diasActivos = diasTotalesPeriodo;
       else if (estadoActualItem === 'paused') analisis.diasPausados = diasTotalesPeriodo;
       else analisis.diasOtroEstado = diasTotalesPeriodo;
       analisis.estadoActualCalculado = estadoActualItem;
    }
  }
  // Asegurar que los días no sean negativos
  analisis.diasActivos = Math.max(0, analisis.diasActivos);
  analisis.diasPausados = Math.max(0, analisis.diasPausados);
  analisis.diasOtroEstado = Math.max(0, analisis.diasOtroEstado);
  
  return analisis;
}


/**
 * Registra el estado actual de todas las publicaciones en la hoja de historial.
 * Esta versión se enfoca en obtener el estado actual y algunos detalles básicos.
 * @return {boolean} True si la operación fue exitosa, false en caso contrario.
 */
function registrarEstadosPublicacionesDiario() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Iniciando registro diario de estados de publicaciones...');
  ss.toast('Iniciando registro diario de estados...', 'Registro Estados', -1);

  try {
    const service = getMeliService(); // De Auth.gs
    const token = service.getToken();
    if (!token) {
      Logger.log('Error: No hay token válido para el registro diario de estados.');
      ss.toast('Error: No hay token válido. Realice autorización.', 'Error Autenticación', 10);
      return false;
    }

    const userId = getUserId(token); // De ApiMeli_Core.gs
    if (!userId) {
      Logger.log('Error: No se pudo obtener User ID para el registro diario.');
      ss.toast('Error: No se pudo obtener User ID.', 'Error User ID', 10);
      return false;
    }

    // Obtener SKUs e IDs desde la hoja principal (TARGET_SHEET_NAME) para enriquecer.
    const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
    const itemInfoFromTargetSheet = {}; // Mapa de itemId a {sku, titulo}
    if (targetSheet) {
        const targetData = targetSheet.getRange(2, 1, targetSheet.getLastRow() -1, 7).getValues(); // A=SKU, B=Titulo, G=ItemID
        targetData.forEach(row => {
            const itemId = row[6];
            if (itemId) {
                itemInfoFromTargetSheet[String(itemId)] = { sku: row[0] || "", titulo: row[1] || ""};
            }
        });
        Logger.log(`Información de ${Object.keys(itemInfoFromTargetSheet).length} ítems cargada desde ${TARGET_SHEET_NAME}.`);
    }


    const allItemIds = getAllMyItemIds(token, userId); // De ApiMeli_Items.gs
    if (!allItemIds || allItemIds.length === 0) {
      Logger.log('No se encontraron publicaciones (activas o pausadas) para registrar.');
      ss.toast('No se encontraron publicaciones para registrar.', 'Aviso', 7);
      return true; // No es un error, simplemente no hay nada que hacer.
    }
    Logger.log(`Se encontraron ${allItemIds.length} publicaciones para registrar estados.`);
    ss.toast(`Procesando ${allItemIds.length} publicaciones para registro de estados...`, 'Registro Estados', -1);

    let historialSheet = ss.getSheetByName(ESTADOS_HISTORIAL_SHEET_NAME); // De Constantes.gs
    if (!historialSheet) {
      historialSheet = ss.insertSheet(ESTADOS_HISTORIAL_SHEET_NAME);
      const headers = ['Fecha', 'ID Publicación', 'SKU', 'Título', 'Estado', 'Cantidad Disponible', 'Precio'];
      historialSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      historialSheet.setFrozenRows(1);
      Logger.log(`Hoja "${ESTADOS_HISTORIAL_SHEET_NAME}" creada con encabezados.`);
    }

    const fechaRegistro = new Date();
    const fechaStr = Utilities.formatDate(fechaRegistro, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const registrosHoy = [];
    let itemsConError = 0;

    for (let i = 0; i < allItemIds.length; i++) {
      const itemId = allItemIds[i];
      if (!itemId) continue; // Saltar si el ID es inválido por alguna razón

      let itemDetalles = null;
      let intentos = 0;
      const MAX_INTENTOS_DETALLES = 2;

      while (intentos < MAX_INTENTOS_DETALLES && !itemDetalles) {
          try {
            // Usar la información de fallback de la Hoja 1
            itemDetalles = obtenerDetallesItemMejorado(token, itemId, itemInfoFromTargetSheet[String(itemId)]); // De ApiMeli_Items.gs
            if (!itemDetalles) { // Si la API falla y no hay fallback útil.
                intentos++;
                Logger.log(`Intento ${intentos} fallido para obtener detalles de ${itemId}. Reintentando...`);
                if (intentos < MAX_INTENTOS_DETALLES) Utilities.sleep(API_CALL_DELAY * (intentos + 1));
            }
          } catch (e) {
            intentos++;
            Logger.log(`Excepción en intento ${intentos} para obtener detalles de ${itemId}: ${e.message}.`);
            if (intentos < MAX_INTENTOS_DETALLES) Utilities.sleep(API_CALL_DELAY * (intentos + 1));
          }
      }


      if (itemDetalles) {
        registrosHoy.push([
          fechaStr,
          itemId,
          itemDetalles.sku || (itemInfoFromTargetSheet[String(itemId)] ? itemInfoFromTargetSheet[String(itemId)].sku : ""),
          itemDetalles.titulo || (itemInfoFromTargetSheet[String(itemId)] ? itemInfoFromTargetSheet[String(itemId)].titulo : `Título para ${itemId} no encontrado`),
          itemDetalles.estado || 'desconocido',
          itemDetalles.cantidadDisponible !== null ? itemDetalles.cantidadDisponible : 0,
          itemDetalles.precio !== null ? itemDetalles.precio : 0
        ]);
      } else {
        itemsConError++;
        Logger.log(`No se pudieron obtener detalles para ${itemId} después de ${MAX_INTENTOS_DETALLES} intentos. Registrando con 'error'.`);
        registrosHoy.push([
          fechaStr, itemId,
          (itemInfoFromTargetSheet[String(itemId)] ? itemInfoFromTargetSheet[String(itemId)].sku : `SKU_ERR_${itemId}`),
          (itemInfoFromTargetSheet[String(itemId)] ? itemInfoFromTargetSheet[String(itemId)].titulo : `TITULO_ERR_${itemId}`),
          'error_al_obtener', 0, 0
        ]);
      }

      if ((i + 1) % BATCH_SIZE_ITEMS_FOR_LOGGING === 0 || (i + 1) === allItemIds.length) {
        ss.toast(`Estados: Procesados ${i + 1}/${allItemIds.length} ítems...`, 'Registro Estados', 5);
        Utilities.sleep(API_CALL_DELAY); // Pausa adicional en lotes grandes
      }
       Utilities.sleep(API_CALL_DELAY / 2); // Pausa más corta entre cada item
    }

    if (registrosHoy.length > 0) {
      const ultimaFilaConDatos = historialSheet.getLastRow();
      historialSheet.getRange(ultimaFilaConDatos + 1, 1, registrosHoy.length, registrosHoy[0].length).setValues(registrosHoy);
      // Formatear las nuevas filas añadidas
      const newRowsRangeStart = ultimaFilaConDatos + 1;
      historialSheet.getRange(newRowsRangeStart, 1, registrosHoy.length, 1).setNumberFormat("yyyy-mm-dd"); // Fecha
      historialSheet.getRange(newRowsRangeStart, 6, registrosHoy.length, 1).setNumberFormat('#,##0'); // Cantidad
      historialSheet.getRange(newRowsRangeStart, 7, registrosHoy.length, 1).setNumberFormat('$#,##0.00'); // Precio

      Logger.log(`Registro diario de estados completado. Se añadieron ${registrosHoy.length} registros. ${itemsConError} ítems con error.`);
      ss.toast(`Registro de estados completado. ${registrosHoy.length} registros añadidos. ${itemsConError > 0 ? itemsConError + ' con error.' : ''}`, "Completado", 7);

      // Opcional: ordenar la hoja completa por Fecha (desc) y luego ID Publicación (asc)
      // Esto puede ser costoso si la hoja es muy grande. Considerar si es realmente necesario aquí.
      // if (historialSheet.getLastRow() > 1) {
      //   const dataRange = historialSheet.getRange(2, 1, historialSheet.getLastRow() - 1, historialSheet.getLastColumn());
      //   dataRange.sort([{ column: 1, ascending: false }, { column: 2, ascending: true }]);
      //   Logger.log("Hoja de historial de estados ordenada.");
      // }

    } else {
      Logger.log('No se generaron nuevos registros de estado (posiblemente todos los ítems fallaron).');
      ss.toast('No se generaron nuevos registros de estado.', 'Advertencia', 7);
    }
    return true;

  } catch (error) {
    Logger.log(`Error CRÍTICO en registrarEstadosPublicacionesDiario: ${error.message}. Stack: ${error.stack}`);
    ss.toast(`Error crítico en registro de estados: ${error.message}`, 'Error Fatal', 10);
    return false;
  }
}

/**
 * Ejecuta el registro de estados manualmente con un informe detallado.
 * Similar a `registrarEstadosPublicacionesDiario` pero pensado para ejecución manual y con más logging.
 */
function ejecutarRegistroEstadosManualDetallado() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Iniciando registro manual detallado de estados...", "Registro Manual", -1);
  Logger.log('--- INICIO ejecutarRegistroEstadosManualDetallado ---');

  // Crear hoja de informe (o limpiarla si existe)
  const informeSheetName = "Informe_Registro_Estados_Manual";
  let informeSheet = ss.getSheetByName(informeSheetName);
  if (informeSheet) {
    informeSheet.clear();
  } else {
    informeSheet = ss.insertSheet(informeSheetName);
  }
  informeSheet.appendRow(["Timestamp", "ID Ítem", "SKU (API)", "Título (API)", "Estado (API)", "Resultado", "Mensaje/Error"]);
  informeSheet.setFrozenRows(1);

  function logToReport(itemId, sku, titulo, estadoApi, resultado, mensaje) {
    informeSheet.appendRow([new Date(), itemId, sku, titulo, estadoApi, resultado, mensaje]);
  }

  try {
    const service = getMeliService();
    const token = service.getToken();
    if (!token) {
      logToReport("", "", "", "", "Error Autenticación", "No hay token válido.");
      ss.toast("Error: No hay token. Revisa la autorización.", "Error", 10);
      return false;
    }

    const userId = getUserId(token);
    if (!userId) {
      logToReport("", "", "", "", "Error User ID", "No se pudo obtener User ID.");
      ss.toast("Error: No se pudo obtener User ID.", "Error", 10);
      return false;
    }
    logToReport("", "", "", "", "Info", `User ID: ${userId}. Iniciando obtención de ítems.`);

    // Obtener SKUs e IDs desde la hoja principal (TARGET_SHEET_NAME) para enriquecer.
    const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
    const itemInfoFromTargetSheet = {};
    if (targetSheet) {
        const targetData = targetSheet.getRange(2, 1, targetSheet.getLastRow() -1, 7).getValues();
        targetData.forEach(row => {
            const itemId = row[6];
            if (itemId) itemInfoFromTargetSheet[String(itemId)] = { sku: row[0] || "", titulo: row[1] || ""};
        });
        logToReport("", "", "", "", "Info", `${Object.keys(itemInfoFromTargetSheet).length} ítems de referencia cargados desde ${TARGET_SHEET_NAME}.`);
    }


    const allItemIds = getAllMyItemIds(token, userId);
    if (!allItemIds || allItemIds.length === 0) {
      logToReport("", "", "", "", "Aviso", "No se encontraron publicaciones.");
      ss.toast("No hay publicaciones para registrar.", "Aviso", 7);
      return true;
    }
    logToReport("", "", "", "", "Info", `${allItemIds.length} publicaciones encontradas para procesar.`);

    let historialSheet = ss.getSheetByName(ESTADOS_HISTORIAL_SHEET_NAME);
    if (!historialSheet) {
      historialSheet = ss.insertSheet(ESTADOS_HISTORIAL_SHEET_NAME);
      const headers = ['Fecha', 'ID Publicación', 'SKU', 'Título', 'Estado', 'Cantidad Disponible', 'Precio'];
      historialSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      historialSheet.setFrozenRows(1);
      logToReport("", "", "", "", "Info", `Hoja de historial "${ESTADOS_HISTORIAL_SHEET_NAME}" creada.`);
    }

    const fechaRegistro = new Date();
    const fechaStr = Utilities.formatDate(fechaRegistro, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const registrosHoy = [];
    let exitos = 0; let errores = 0;

    for (let i = 0; i < allItemIds.length; i++) {
      const itemId = allItemIds[i];
      if (!itemId) {
          logToReport(`INVALID_ID_EN_LISTA_${i}`, "", "", "", "Error", "ID de ítem nulo/vacío en la lista de IDs.");
          errores++;
          continue;
      }

      let itemDetalles = null;
      let errorMsg = "";
      try {
        itemDetalles = obtenerDetallesItemMejorado(token, itemId, itemInfoFromTargetSheet[String(itemId)]);
      } catch (e) {
        errorMsg = `Excepción: ${e.message}`;
        Logger.log(`Excepción al obtener detalles para ${itemId} (manual detallado): ${e.message}`);
      }

      if (itemDetalles) {
        registrosHoy.push([
          fechaStr, itemId, itemDetalles.sku, itemDetalles.titulo,
          itemDetalles.estado, itemDetalles.cantidadDisponible, itemDetalles.precio
        ]);
        logToReport(itemId, itemDetalles.sku, itemDetalles.titulo, itemDetalles.estado, "Éxito", `Stock: ${itemDetalles.cantidadDisponible}, Precio: ${itemDetalles.precio}`);
        exitos++;
      } else {
        const fallbackSku = itemInfoFromTargetSheet[String(itemId)] ? itemInfoFromTargetSheet[String(itemId)].sku : `SKU_ERR_${itemId}`;
        const fallbackTitulo = itemInfoFromTargetSheet[String(itemId)] ? itemInfoFromTargetSheet[String(itemId)].titulo : `TITULO_ERR_${itemId}`;
        registrosHoy.push([
            fechaStr, itemId, fallbackSku, fallbackTitulo,
            'error_api_detalles', 0, 0
        ]);
        logToReport(itemId, fallbackSku, fallbackTitulo, "error_api_detalles", "Error", `No se pudieron obtener detalles. ${errorMsg}`);
        errores++;
      }
      if ((i + 1) % (BATCH_SIZE_ITEMS_FOR_LOGGING / 2) === 0 || (i + 1) === allItemIds.length) { // Actualizar más frecuente
        ss.toast(`Manual: Procesados ${i + 1}/${allItemIds.length}. Éxitos: ${exitos}, Errores: ${errores}`, "Progreso", 5);
         Utilities.sleep(API_CALL_DELAY);
      }
      Utilities.sleep(API_CALL_DELAY / 2);
    }

    if (registrosHoy.length > 0) {
      const ultimaFilaConDatos = historialSheet.getLastRow();
      historialSheet.getRange(ultimaFilaConDatos + 1, 1, registrosHoy.length, registrosHoy[0].length).setValues(registrosHoy);
      // Formatear
      const newRowsRangeStart = ultimaFilaConDatos + 1;
      historialSheet.getRange(newRowsRangeStart, 1, registrosHoy.length, 1).setNumberFormat("yyyy-mm-dd");
      historialSheet.getRange(newRowsRangeStart, 6, registrosHoy.length, 1).setNumberFormat('#,##0');
      historialSheet.getRange(newRowsRangeStart, 7, registrosHoy.length, 1).setNumberFormat('$#,##0.00');

      logToReport("", "", "", "", "Resumen", `${registrosHoy.length} registros añadidos. Éxitos: ${exitos}, Errores: ${errores}.`);
    } else {
      logToReport("", "", "", "", "Resumen", "No se generaron nuevos registros.");
    }
    informeSheet.autoResizeColumns(1, informeSheet.getLastColumn());
    ss.toast(`Registro manual detallado completado. Ver hoja "${informeSheetName}".`, "Completado", 10);
    Logger.log(`--- FIN ejecutarRegistroEstadosManualDetallado. Éxitos: ${exitos}, Errores: ${errores} ---`);
    return true;

  } catch (error) {
    Logger.log(`Error CRÍTICO en ejecutarRegistroEstadosManualDetallado: ${error.message}. Stack: ${error.stack}`);
    const informeSheet = ss.getSheetByName("Informe_Registro_Estados_Manual") || ss.insertSheet("Informe_Registro_Estados_Manual");
    informeSheet.appendRow([new Date(), "CRITICO", "", "", "", "Error Fatal", error.message]);
    ss.toast(`Error crítico en registro manual: ${error.message}`, 'Error Fatal', 10);
    return false;
  }
}


