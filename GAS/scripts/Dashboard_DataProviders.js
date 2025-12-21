// ============================================================================
// --- ARCHIVO: Dashboard_DataProviders.gs ---
// ============================================================================
// Descripción: Funciones que preparan y proveen datos específicamente para
//              ser consumidos por el lado cliente del Dashboard (HTML Service).
//              Estas funciones suelen ser llamadas mediante google.script.run.
// ============================================================================

/**
 * Obtiene los datos para el gráfico de líneas de visitas y ventas (cantidad)
 * de la última semana completa procesada (Sábado a Viernes).
 * Lee de la hoja DAILY_PROGRESS_SHEET_NAME.
 * @return {Array<Array<string|number>>} Datos formateados para Google Charts.
 * Formato: [['Día', 'Visitas', 'Ventas (Cant)'], ['Sáb', 100, 10], ...]
 */
function getLineChartDataForLastWeek() {
  Logger.log("getLineChartDataForLastWeek: Iniciando preparación de datos para gráfico...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dailySheet = ss.getSheetByName(DAILY_PROGRESS_SHEET_NAME); // De Constantes.gs

  const errorData = [['Día', 'Visitas', 'Ventas (Cant)'], ['Error', 0, 0]];
  const noData = [['Día', 'Visitas', 'Ventas (Cant)'], ['Sin Datos', 0, 0]];

  if (!dailySheet) {
    Logger.log(`getLineChartDataForLastWeek: Hoja "${DAILY_PROGRESS_SHEET_NAME}" no encontrada.`);
    return errorData;
  }

  const lastRow = dailySheet.getLastRow();
  if (lastRow < 2) { // Fila 1 es encabezado
    Logger.log(`getLineChartDataForLastWeek: No hay suficientes datos en "${DAILY_PROGRESS_SHEET_NAME}".`);
    return noData;
  }

  // Tomar hasta 7 días de datos de la hoja Meli_Progreso_Diario
  // Columnas de interés: B=Día (nombre), C=Visitas Hoy, G=Items Vend Hoy
  // Leemos desde B hasta G (6 columnas)
  const startRow = Math.max(2, lastRow - 6); // Queremos hasta 7 filas de datos (días)
  const numRowsToFetch = lastRow - startRow + 1;

  // Indices en la hoja: Fecha(A,1), Día(B,2), VisitasHoy(C,3), ..., ItemsVendHoy(G,7)
  // Necesitamos leer desde la columna B (Día) hasta la G (Items Vend Hoy)
  const range = dailySheet.getRange(startRow, 2, numRowsToFetch, 6); // Col B a G
  const dailyDataFromSheet = range.getValues();

  let chartData = [['Día', 'Visitas', 'Ventas (Cant)']];
  dailyDataFromSheet.forEach(row => {
    // row[0] = Día (Nombre, ej. Sáb) (Col B)
    // row[1] = Visitas Hoy (Col C)
    // row[5] = Items Vend Hoy (Col G)
    const diaNombre = row[0];
    const visitasHoy = parseFloat(row[1]) || 0; // Visitas Hoy (Col C del rango leído, que es B de la hoja)
    const itemsVendHoy = parseFloat(row[5]) || 0; // Items Vend Hoy (Col G del rango leído)
    chartData.push([diaNombre, visitasHoy, itemsVendHoy]);
  });

  if (chartData.length <=1) { // Solo encabezados
      Logger.log("getLineChartDataForLastWeek: No se pudieron extraer datos válidos del rango leído.");
      return noData;
  }

  Logger.log(`getLineChartDataForLastWeek: Datos para gráfico preparados: ${JSON.stringify(chartData)}`);
  return chartData;
}

/**
 * Obtiene el top 15 de productos más vendidos (por cantidad) en la última semana completa (Sábado-Viernes).
 * Utiliza caché para mejorar el rendimiento.
 * @return {Array<object>} Array de objetos {id, sku, titulo, cantidadVendida}.
 */
function getTopSellingProductsLastWeek() {
  const cacheKey = 'top_selling_products_last_week';
  const cachedData = getCachedResults(cacheKey); // De Cache.gs
  if (cachedData) {
    Logger.log("getTopSellingProductsLastWeek: Usando datos de caché.");
    return cachedData;
  }

  Logger.log("getTopSellingProductsLastWeek: Iniciando cálculo (sin caché)...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(ORDERS_DETAIL_SHEET_NAME); // De Constantes.gs
  const productsSheet = ss.getSheetByName(TARGET_SHEET_NAME);     // De Constantes.gs

  if (!ordersSheet || !productsSheet) {
    Logger.log("getTopSellingProductsLastWeek: Error - Falta la hoja de Órdenes o la hoja Principal de productos.");
    return [];
  }

  // Definir fechas para la última semana completa (Sábado a Viernes)
  // Tomamos como referencia el día de hoy para calcular cuál fue la última semana completa.
  let refDateForLastFullWeek = new Date(); // Hoy
  // Necesitamos el viernes de la semana que ya terminó.
  // Si hoy es Sábado, el viernes fue ayer. Si hoy es Viernes, el viernes es hoy (y la semana termina hoy).
  // Si hoy es Domingo, el viernes fue hace 2 días.
  const todayDay = refDateForLastFullWeek.getDay(); // Dom=0, Vie=5, Sab=6
  let daysToSubtractToGetLastCompletedFriday = (todayDay + 7 - 5) % 7; // Días para llegar al viernes anterior o actual
  // Si hoy es antes de Sábado (ej. Vie, Jue...), y queremos la semana que *terminó* el viernes pasado,
  // necesitamos restar una semana más si hoy es antes de Sábado.
  // Si hoy es Sábado, la semana terminó ayer.
  if (todayDay < 6) { // Si hoy no es Sábado, el viernes de la "semana pasada completa" es el de la semana anterior.
      daysToSubtractToGetLastCompletedFriday = daysToSubtractToGetLastCompletedFriday + 7;
  }


  refDateForLastFullWeek.setDate(refDateForLastFullWeek.getDate() - daysToSubtractToGetLastCompletedFriday);
  // Ahora refDateForLastFullWeek es el Viernes de la última semana completa.
  const { currentWeekStart: lastWeekStart, currentWeekEnd: lastWeekEnd } = getWeekDatesSatToFri(refDateForLastFullWeek);

  Logger.log(`Top Ventas Semanal - Período considerado: ${lastWeekStart.toLocaleDateString()} a ${lastWeekEnd.toLocaleDateString()}`);

  const lastRowOrders = ordersSheet.getLastRow();
  if (lastRowOrders < 2) {
    Logger.log("getTopSellingProductsLastWeek: Hoja de órdenes vacía.");
    cacheApiResults(cacheKey, [], CACHE_EXPIRATION_SHORT); // Cachear resultado vacío
    return [];
  }

  // Leer de Hoja de Órdenes: Fecha Pago (C, idx 2), ID Item (E, idx 4), Cantidad (G, idx 6)
  const orderData = ordersSheet.getRange(2, 1, lastRowOrders - 1, 7).getValues(); // Leer hasta columna G
  const salesMap = {}; // { itemId: cantidadVendida }

  orderData.forEach(row => {
    const paidDateValue = row[2]; // Fecha de Pago
    const itemId = String(row[4]);        // ID Item
    const quantity = parseFloat(row[6]);  // Cantidad

    if (!paidDateValue || !(paidDateValue instanceof Date) || !itemId || isNaN(quantity) || quantity <= 0) return;
    
    // Normalizar fecha de pago a solo día para comparación precisa con inicio/fin de semana (que ya están normalizados)
    const paidDateOnly = new Date(paidDateValue.getFullYear(), paidDateValue.getMonth(), paidDateValue.getDate());

    if (paidDateOnly >= lastWeekStart && paidDateOnly <= lastWeekEnd) {
      if (!salesMap[itemId]) salesMap[itemId] = 0;
      salesMap[itemId] += quantity;
    }
  });
  Logger.log(`getTopSellingProductsLastWeek: Mapa de ventas de la semana procesado con ${Object.keys(salesMap).length} ítems.`);

  // Obtener SKU y Título de Hoja 1 (TARGET_SHEET_NAME)
  const productDetailsMap = {}; // Mapa { itemId: {sku, titulo} }
  if (productsSheet.getLastRow() > 1) {
    // Col A=SKU (idx 0), B=Título (idx 1), G=ID Publicación (idx 6)
    const productInfo = productsSheet.getRange(2, 1, productsSheet.getLastRow() - 1, 7).getValues();
    productInfo.forEach(pRow => {
      const itemIdFromHoja1 = String(pRow[6]);
      if (itemIdFromHoja1) {
        productDetailsMap[itemIdFromHoja1] = { sku: pRow[0] || `SKU_N/A_${itemIdFromHoja1}`, titulo: pRow[1] || `Título N/A_${itemIdFromHoja1}` };
      }
    });
  }

  let topProducts = [];
  for (const itemIdInSales in salesMap) {
    const details = productDetailsMap[itemIdInSales] || { sku: `SKU_NF_${itemIdInSales}`, titulo: `Título NF_${itemIdInSales}` };
    topProducts.push({
      id: itemIdInSales,
      sku: details.sku,
      titulo: details.titulo,
      cantidadVendida: salesMap[itemIdInSales]
    });
  }

  topProducts.sort((a, b) => b.cantidadVendida - a.cantidadVendida);
  const result = topProducts.slice(0, 15); // Top 15

  cacheApiResults(cacheKey, result, CACHE_EXPIRATION_MEDIUM); // Cachear por 12 horas
  Logger.log(`Top 15 productos (última semana) para dashboard: ${result.length} items. Primer item (si existe): ${result.length > 0 ? JSON.stringify(result[0]) : 'Ninguno'}`);
  return result;
}


/**
 * Obtiene el top 15 de productos más vendidos (por cantidad) en los últimos 30 días.
 * Utiliza caché para mejorar el rendimiento.
 * @return {Array<object>} Array de objetos {id, sku, titulo, cantidadVendida}.
 */
function getTopSellingProductsLastMonth() {
  const cacheKey = 'top_selling_products_last_month';
  const cachedData = getCachedResults(cacheKey); // De Cache.gs
  if (cachedData) {
    Logger.log("getTopSellingProductsLastMonth: Usando datos de caché.");
    return cachedData;
  }

  Logger.log("getTopSellingProductsLastMonth: Iniciando cálculo (sin caché)...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(ORDERS_DETAIL_SHEET_NAME);
  const productsSheet = ss.getSheetByName(TARGET_SHEET_NAME);

  if (!ordersSheet || !productsSheet) {
    Logger.log("getTopSellingProductsLastMonth: Error - Falta la hoja de Órdenes o la hoja Principal.");
    return [];
  }

  const today = new Date();
  const dateTo = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999); // Fin del día de hoy
  const dateFrom = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 días atrás
  dateFrom.setHours(0, 0, 0, 0); // Inicio del día

  Logger.log(`Top Ventas Mensual - Período: ${dateFrom.toLocaleDateString()} a ${dateTo.toLocaleDateString()}`);

  const lastRowOrders = ordersSheet.getLastRow();
  if (lastRowOrders < 2) {
    Logger.log("getTopSellingProductsLastMonth: Hoja de órdenes vacía.");
    cacheApiResults(cacheKey, [], CACHE_EXPIRATION_SHORT);
    return [];
  }

  const orderData = ordersSheet.getRange(2, 1, lastRowOrders - 1, 7).getValues(); // Fecha Pago(C,2), ID Item(E,4), Cantidad(G,6)
  const salesMap = {};

  orderData.forEach(row => {
    const paidDateValue = row[2];
    const itemId = String(row[4]);
    const quantity = parseFloat(row[6]);
    if (!paidDateValue || !(paidDateValue instanceof Date) || !itemId || isNaN(quantity) || quantity <= 0) return;
    
    // No es necesario normalizar la hora de paidDate aquí si dateFrom y dateTo cubren días completos.
    if (paidDateValue >= dateFrom && paidDateValue <= dateTo) {
      if (!salesMap[itemId]) salesMap[itemId] = 0;
      salesMap[itemId] += quantity;
    }
  });
  Logger.log(`getTopSellingProductsLastMonth: Mapa de ventas del mes procesado con ${Object.keys(salesMap).length} ítems.`);

  const productDetailsMap = {};
  if (productsSheet.getLastRow() > 1) {
    const productInfo = productsSheet.getRange(2, 1, productsSheet.getLastRow() - 1, 7).getValues();
    productInfo.forEach(pRow => {
      const itemIdFromHoja1 = String(pRow[6]);
      if (itemIdFromHoja1) {
        productDetailsMap[itemIdFromHoja1] = { sku: pRow[0] || `SKU_N/A_${itemIdFromHoja1}`, titulo: pRow[1] || `Título N/A_${itemIdFromHoja1}` };
      }
    });
  }

  let topProducts = [];
  for (const itemIdInSales in salesMap) {
    const details = productDetailsMap[itemIdInSales] || { sku: `SKU_NF_${itemIdInSales}`, titulo: `Título NF_${itemIdInSales}` };
    topProducts.push({
      id: itemIdInSales, sku: details.sku, titulo: details.titulo, cantidadVendida: salesMap[itemIdInSales]
    });
  }

  topProducts.sort((a, b) => b.cantidadVendida - a.cantidadVendida);
  const result = topProducts.slice(0, 15);

  cacheApiResults(cacheKey, result, CACHE_EXPIRATION_MEDIUM);
  Logger.log(`Top 15 productos (último mes) para dashboard: ${result.length} items.`);
  return result;
}


/**
 * Obtiene productos con alta cantidad de visitas pero baja conversión (o cero ventas)
 * en un período específico. Utiliza caché.
 * @param {string} period - Puede ser 'lastWeek' o 'lastMonth'.
 * @param {number} minVisits - El número mínimo de visitas para considerar un producto.
 * @param {number} maxConversionThreshold - El umbral de conversión (ej. 1 para 1%) por debajo del cual se considera "baja". (0 para cero ventas)
 * @return {Array<object>} Array de objetos {id, sku, titulo, visitas, cantidadVendida, conversion}.
 */
function getLowConversionHighVisitProducts(period = 'lastMonth', minVisits = 50, maxConversionThreshold = 1) {
  const cacheKey = `low_conv_high_visit_${period}_${minVisits}_${maxConversionThreshold}`;
  const cachedData = getCachedResults(cacheKey);
  if (cachedData) {
    Logger.log(`getLowConversionHighVisitProducts: Usando datos de caché para período ${period}.`);
    return cachedData;
  }

  Logger.log(`getLowConversionHighVisitProducts: Calculando para período '${period}', minVisits=${minVisits}, maxConv=${maxConversionThreshold}%...`);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(ORDERS_DETAIL_SHEET_NAME);
  const visitsSheet = ss.getSheetByName(DAILY_VISITS_SHEET_NAME);
  const productsSheet = ss.getSheetByName(TARGET_SHEET_NAME);

  if (!ordersSheet || !visitsSheet || !productsSheet) {
    Logger.log("getLowConversionHighVisitProducts: Error - Falta una o más hojas necesarias.");
    return [];
  }

  let dateFrom, dateTo = new Date(); dateTo.setHours(23,59,59,999);

  if (period === 'lastWeek') {
    let refDateForLastFullWeek = new Date();
    const todayDay = refDateForLastFullWeek.getDay();
    let daysToSubtractToGetLastCompletedFriday = (todayDay + 7 - 5) % 7;
    if (todayDay < 6) daysToSubtractToGetLastCompletedFriday += 7;
    refDateForLastFullWeek.setDate(refDateForLastFullWeek.getDate() - daysToSubtractToGetLastCompletedFriday);
    const weekDates = getWeekDatesSatToFri(refDateForLastFullWeek);
    dateFrom = weekDates.currentWeekStart; dateTo = weekDates.currentWeekEnd;
  } else { // 'lastMonth' o default
    dateFrom = new Date(dateTo.getTime() - (30 * 24 * 60 * 60 * 1000));
    dateFrom.setHours(0,0,0,0);
  }
  Logger.log(`Período para 'Peores Productos' (Baja Conversión): ${dateFrom.toLocaleDateString()} a ${dateTo.toLocaleDateString()}`);

  const salesMap = {}; // { itemId: cantidadVendida }
  if (ordersSheet.getLastRow() > 1) {
    ordersSheet.getRange(2, 1, ordersSheet.getLastRow() - 1, 7).getValues().forEach(row => { // C=FechaPago, E=ItemID, G=Cantidad
      const paidDateValue = row[2]; const itemId = String(row[4]); const quantity = parseFloat(row[6]);
      if (paidDateValue instanceof Date && itemId && !isNaN(quantity) && quantity > 0) {
        if (paidDateValue >= dateFrom && paidDateValue <= dateTo) {
          salesMap[itemId] = (salesMap[itemId] || 0) + quantity;
        }
      }
    });
  }

  const visitsMap = {}; // { itemId: totalVisitas }
  if (visitsSheet.getLastRow() > 1) {
    visitsSheet.getRange(2, 1, visitsSheet.getLastRow() - 1, 3).getValues().forEach(row => { // A=ItemID, B=Fecha, C=Visitas
      const itemId = String(row[0]); const visitDateValue = row[1]; const visits = parseFloat(row[2]);
      if (visitDateValue instanceof Date && itemId && !isNaN(visits) && visits > 0) {
        if (visitDateValue >= dateFrom && visitDateValue <= dateTo) {
          visitsMap[itemId] = (visitsMap[itemId] || 0) + visits;
        }
      }
    });
  }

  const productDetailsMap = {};
  if (productsSheet.getLastRow() > 1) {
    productsSheet.getRange(2, 1, productsSheet.getLastRow() - 1, 7).getValues().forEach(pRow => {
      const itemId = String(pRow[6]); if (itemId) productDetailsMap[itemId] = { sku: pRow[0] || "", titulo: pRow[1] || "" };
    });
  }

  let lowConversionProducts = [];
  for (const itemId in visitsMap) {
    const totalVisits = visitsMap[itemId];
    if (totalVisits >= minVisits) {
      const itemsSold = salesMap[itemId] || 0;
      const conversionRate = (totalVisits > 0 && itemsSold > 0) ? (itemsSold / totalVisits) * 100 : 0;
      if (itemsSold === 0 || conversionRate < maxConversionThreshold) {
        const details = productDetailsMap[itemId] || { sku: `SKU_NF_${itemId}`, titulo: `Título NF_${itemId}` };
        lowConversionProducts.push({
          id: itemId, sku: details.sku, titulo: details.titulo,
          visitas: totalVisits, cantidadVendida: itemsSold, conversion: conversionRate
        });
      }
    }
  }

  // Ordenar: primero los que tienen 0 ventas (más visitas primero), luego por menor conversión (más visitas primero).
  lowConversionProducts.sort((a, b) => {
    if (a.cantidadVendida === 0 && b.cantidadVendida > 0) return -1;
    if (a.cantidadVendida > 0 && b.cantidadVendida === 0) return 1;
    if (a.cantidadVendida === 0 && b.cantidadVendida === 0) return b.visitas - a.visitas; // Más visitas primero para los de 0 ventas
    // Ambos tienen ventas (>0), ordenar por conversión (asc) y luego visitas (desc)
    if (a.conversion !== b.conversion) return a.conversion - b.conversion;
    return b.visitas - a.visitas;
  });

  const result = lowConversionProducts.slice(0, 15); // Top 15
  cacheApiResults(cacheKey, result, CACHE_EXPIRATION_MEDIUM);
  Logger.log(`Productos con baja conversión/altas visitas (período '${period}'): ${result.length} items encontrados.`);
  return result;
}


/**
 * Prepara los datos para los cuadros de resumen del dashboard (KPIs).
 * Incluye datos de la semana actual y acumulados del mes en curso (MTD).
 * Utiliza caché.
 * @return {object} Objeto con { currentWeekVisits, currentWeekOrders, mtdVisits, mtdNetSales, mtdOrderCount }.
 */
function getDashboardSummaryKPIs() {
  const cacheKey = 'dashboard_summary_kpis_v2'; // Nueva versión de clave por si la lógica cambia
  const cachedData = getCachedResults(cacheKey);
  if (cachedData) {
    Logger.log("getDashboardSummaryKPIs: Usando datos de KPIs desde caché.");
    return cachedData;
  }

  Logger.log("getDashboardSummaryKPIs: Calculando KPIs para dashboard (sin caché)...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const weeklySheet = ss.getSheetByName(WEEKLY_SUMMARY_SHEET_NAME);
  const ordersSheet = ss.getSheetByName(ORDERS_DETAIL_SHEET_NAME);
  const visitsSheet = ss.getSheetByName(DAILY_VISITS_SHEET_NAME);

  let kpis = { currentWeekVisits: 0, currentWeekOrders: 0, mtdVisits: 0, mtdNetSales: 0, mtdOrderCount: 0, mtdConversion: 0 };

  // 1. Datos de la semana actual desde el Resumen Semanal (fila 2)
  if (weeklySheet && weeklySheet.getLastRow() >= 2) {
    // B=Visitas (idx 1), C=Cant Órdenes (idx 2)
    const weeklyData = weeklySheet.getRange("B2:C2").getValues()[0];
    kpis.currentWeekVisits = parseFloat(weeklyData[0]) || 0; // Visitas
    kpis.currentWeekOrders = parseFloat(weeklyData[1]) || 0; // Órdenes
  } else { Logger.log("getDashboardSummaryKPIs: No se pudieron leer datos del resumen semanal o la hoja está vacía."); }

  // 2. Acumulados del Mes en Curso (MTD)
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1); firstDayOfMonth.setHours(0,0,0,0);
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23,59,59,999);
  Logger.log(`Calculando MTD desde ${firstDayOfMonth.toLocaleDateString()} hasta ${endOfToday.toLocaleDateString()}`);

  // MTD Visitas desde DAILY_VISITS_SHEET_NAME
  if (visitsSheet && visitsSheet.getLastRow() > 1) {
    // Col B=Fecha (idx 1), Col C=VisitasDia (idx 2)
    const visitData = visitsSheet.getRange(2, 2, visitsSheet.getLastRow() - 1, 2).getValues();
    visitData.forEach(row => {
      const visitDateValue = row[0]; const visits = parseFloat(row[1]);
      if (visitDateValue instanceof Date && !isNaN(visits)) {
        const visitDateOnly = new Date(visitDateValue.getFullYear(), visitDateValue.getMonth(), visitDateValue.getDate());
        if (visitDateOnly >= firstDayOfMonth && visitDateOnly <= endOfToday) {
          kpis.mtdVisits += visits;
        }
      }
    });
  }

  // MTD Ventas (Neto) y Cantidad de Órdenes desde ORDERS_DETAIL_SHEET_NAME
  let mtdOrderIdsSet = new Set();
  if (ordersSheet && ordersSheet.getLastRow() > 1) {
    // Col A=ID Orden(0), C=Fecha Pago(2), K=Neto Aprox(10)
    const orderData = ordersSheet.getRange(2, 1, ordersSheet.getLastRow() - 1, 11).getValues(); // Leer hasta K
    orderData.forEach(row => {
      const paidDateValue = row[2]; const orderId = String(row[0]); const netItem = parseFloat(row[10]);
      if (paidDateValue instanceof Date) {
        const paidDateOnly = new Date(paidDateValue.getFullYear(), paidDateValue.getMonth(), paidDateValue.getDate());
        if (paidDateOnly >= firstDayOfMonth && paidDateOnly <= endOfToday) {
          if (!isNaN(netItem)) kpis.mtdNetSales += netItem;
          if (orderId) mtdOrderIdsSet.add(orderId);
        }
      }
    });
  }
  kpis.mtdOrderCount = mtdOrderIdsSet.size;
  kpis.mtdConversion = (kpis.mtdVisits > 0 && kpis.mtdOrderCount > 0) ? (kpis.mtdOrderCount / kpis.mtdVisits) * 100 : 0;


  cacheApiResults(cacheKey, kpis, CACHE_EXPIRATION_SHORT); // Cachear por 1 hora
  Logger.log(`getDashboardSummaryKPIs: Datos de resumen para dashboard: ${JSON.stringify(kpis)}`);
  return kpis;
}


/**
 * Devuelve los datos de la hoja DAILY_PROGRESS_SHEET_NAME para el dashboard.
 * Incluye formateo de números y manejo de caché.
 * @return {Array<Array<string|number|Date>>} Matriz con los datos para la tabla y gráficos.
 */
function getDailyProgressDataForDashboard() {
  const cacheKey = 'daily_progress_data_dashboard_v2';
  const cachedData = getCachedResults(cacheKey);
  if (cachedData) {
    Logger.log("getDailyProgressDataForDashboard: Usando datos de progreso diario desde caché.");
    return cachedData;
  }

  Logger.log("getDailyProgressDataForDashboard: Obteniendo datos de progreso diario (sin caché)...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dailySheet = ss.getSheetByName(DAILY_PROGRESS_SHEET_NAME);

  const defaultHeaders = ['Fecha', 'Día', 'Visitas Hoy', 'Visitas Acum Sem', 'Órdenes Hoy', 'Órdenes Acum Sem', 'Items Vend Hoy', 'Items Vend Acum Sem', 'Neto Hoy', 'Neto Acum Sem', 'Neto Acum Sem Ant (Comp)', 'Conv Diaria (Órdenes/Visitas %)'];

  if (!dailySheet) {
    Logger.log(`getDailyProgressDataForDashboard: Hoja "${DAILY_PROGRESS_SHEET_NAME}" no encontrada.`);
    return [defaultHeaders, ['Error', 'Hoja no encontrada',0,0,0,0,0,0,0,0,0,0]];
  }

  const lastRow = dailySheet.getLastRow();
  if (lastRow < 1) { // Ni siquiera encabezados
    Logger.log(`getDailyProgressDataForDashboard: Hoja "${DAILY_PROGRESS_SHEET_NAME}" vacía.`);
    return [defaultHeaders, ['Sin Datos', '-',0,0,0,0,0,0,0,0,0,0]];
  }
  
  const lastCol = dailySheet.getLastColumn();
  if (lastCol === 0 && lastRow === 1) { // Solo encabezados pero 0 columnas?
     Logger.log(`getDailyProgressDataForDashboard: Hoja "${DAILY_PROGRESS_SHEET_NAME}" parece tener solo encabezados pero 0 columnas con datos.`);
     return [defaultHeaders, ['Sin Datos', '-',0,0,0,0,0,0,0,0,0,0]];
  }


  const data = dailySheet.getRange(1, 1, lastRow, lastCol > 0 ? lastCol : defaultHeaders.length).getValues();

  // Formatear números para Google Charts y asegurar que los tipos sean correctos.
  // Google Charts es sensible a los tipos de datos. Fechas deben ser Date objects o strings parseables.
  // Números deben ser números.
  for (let i = 1; i < data.length; i++) { // Empezar desde la fila 1 (datos, después de encabezados)
    // Col A (idx 0) es Fecha. Intentar convertir a Date si es string, o formatear si ya es Date.
    if (data[i][0] && !(data[i][0] instanceof Date)) { // Si no es Date object
        try { data[i][0] = new Date(data[i][0]); } catch(e) { /* Mantener como está si no parsea */ }
    }
    if (data[i][0] instanceof Date && isNaN(data[i][0].getTime())) { // Fecha inválida
        data[i][0] = null; // o un string como "Fecha Inválida"
    }


    // Columnas numéricas: C(2) a K(10) son métricas, L(11) es conversión %.
    // El índice en el array 'data[i]' va de 2 a 11 para estas columnas.
    for (let j = 2; j < data[i].length && j < defaultHeaders.length; j++) { // Iterar sobre columnas de métricas
      let val = data[i][j];
      if (val === null || val === "") {
        data[i][j] = 0; // Reemplazar null o vacío con 0 para gráficos
      } else if (typeof val === 'string') {
        val = val.replace('%', '').replace('$', '').replace(/,/g, ''); // Limpiar string
        data[i][j] = parseFloat(val) || 0; // Convertir a número, o 0 si falla
      } else if (typeof val !== 'number') {
        data[i][j] = 0; // Si no es string ni número, poner 0
      }
      // Si ya es número, no hacer nada.
    }
  }

  cacheApiResults(cacheKey, data, CACHE_EXPIRATION_SHORT); // Cachear por 1 hora
  Logger.log(`getDailyProgressDataForDashboard: Devolviendo ${data.length} filas de progreso diario.`);
  return data;
}

/**
 * Prepara los datos para el gráfico de tendencias históricas desde la hoja de histórico mensual.
 * Utiliza caché.
 * @return {Array<Array<string|number>>} Datos formateados para Google Charts.
 * Formato: [['Mes', 'Visitas', 'Órdenes', 'Conversión %'], ['Ene 2023', 1000, 50, 5.00], ...]
 */
function getTrendChartData() {
  const cacheKey = 'trend_chart_data_dashboard_v2';
  const cachedData = getCachedResults(cacheKey);
  if (cachedData) {
    Logger.log("getTrendChartData: Usando datos de tendencias históricas desde caché.");
    return cachedData;
  }

  Logger.log("getTrendChartData: Calculando datos de tendencias (sin caché)...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const historicoSheet = ss.getSheetByName(HISTORICO_MENSUAL_SHEET_NAME); // De Constantes.gs

  const errorData = [['Mes', 'Visitas', 'Órdenes', 'Conversión %'], ['Error', 0, 0, 0]];
  const noData = [['Mes', 'Visitas', 'Órdenes', 'Conversión %'], ['Sin Datos Históricos', 0, 0, 0]];

  if (!historicoSheet || historicoSheet.getLastRow() <= 1) {
    Logger.log(`getTrendChartData: Hoja "${HISTORICO_MENSUAL_SHEET_NAME}" no encontrada o vacía.`);
    cacheApiResults(cacheKey, noData, CACHE_EXPIRATION_MEDIUM);
    return noData;
  }

  // Columnas en Meli_Historico_Mensual:
  // B=Mes (1-12, idx 1), C=Año (idx 2), D=Total Visitas (idx 3), E=Total Órdenes (idx 4), J=Conversión % (idx 9)
  const dataFromSheet = historicoSheet.getRange(2, 2, historicoSheet.getLastRow() - 1, 9).getValues(); // Leer desde col B hasta J

  const chartData = [['Mes', 'Visitas', 'Órdenes', 'Conversión %']];
  const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  dataFromSheet.forEach(row => {
    const mesNum = parseInt(row[0]); // Mes (Col B)
    const año = parseInt(row[1]);    // Año (Col C)
    const visitas = parseFloat(row[2]) || 0;  // Total Visitas (Col D)
    const ordenes = parseFloat(row[3]) || 0;  // Total Órdenes (Col E)
    const conversion = parseFloat(String(row[8]).replace('%','')) || 0; // Conversión % (Col J)

    if (!isNaN(mesNum) && !isNaN(año) && mesNum >= 1 && mesNum <= 12) {
      const etiquetaMes = `${nombresMeses[mesNum - 1]} ${String(año).slice(-2)}`; // Ej: "Ene 23"
      chartData.push([etiquetaMes, visitas, ordenes, conversion]);
    }
  });
  
  if (chartData.length <= 1) { // Solo encabezados
      Logger.log("getTrendChartData: No se pudieron extraer datos válidos de la hoja de histórico.");
      cacheApiResults(cacheKey, noData, CACHE_EXPIRATION_MEDIUM);
      return noData;
  }

  cacheApiResults(cacheKey, chartData, CACHE_EXPIRATION_LONG); // Datos históricos cambian lentamente
  Logger.log(`getTrendChartData: Datos para gráfico de tendencias preparados: ${chartData.length -1} meses.`);
  return chartData;
}