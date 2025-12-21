// ============================================================================
// --- ARCHIVO: Dashboard_Backend.gs ---
// ============================================================================
// Descripción: Lógica del servidor para el Dashboard HTML. Incluye la función
//              `doGet` para servir la Web App y funciones de testeo de datos
//              que podrían ser llamadas desde el cliente para diagnóstico.
// ============================================================================

/**
 * Sirve la Web App o maneja el callback de OAuth2.
 * VERSIÓN FINAL: Utiliza las mejores prácticas de HtmlService y revierte
 * XFrameOptions a ALLOWALL para máxima compatibilidad.
 */
function doGet(e) {
  // Manejo del callback de OAuth2 (sin cambios)
  if (e && e.parameter && e.parameter.code) {
    return authCallback(e);
  }
  
  // Servimos la aplicación usando el modo moderno y seguro,
  // pero con la opción de XFrame que sabemos que es compatible.
  return HtmlService.createHtmlOutputFromFile('Dashboard')
      .setTitle('Dashboard de Gestión')
      // --- LÍNEA CORREGIDA: Volvemos a ALLOWALL ---
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}




// --- Funciones de Testeo para el Dashboard (pueden ser llamadas con google.script.run) ---

/**
 * Prueba la obtención de KPIs para el dashboard.
 * @return {{success: boolean, data?: object, error?: string, message: string, stack?: string}}
 */
function testGetDashboardSummaryKPIs() {
  Logger.log("Iniciando testGetDashboardSummaryKPIs...");
  try {
    const kpis = getDashboardSummaryKPIs(); // De Dashboard_DataProviders.gs
    Logger.log("Resultado de testGetDashboardSummaryKPIs: " + JSON.stringify(kpis));
    return {
      success: true,
      data: kpis,
      message: "KPIs para dashboard obtenidos correctamente."
    };
  } catch (e) {
    Logger.log(`Error en testGetDashboardSummaryKPIs: ${e.message}\nStack: ${e.stack}`);
    return {
      success: false,
      error: e.message,
      stack: e.stack ? String(e.stack) : "No stack disponible",
      message: "Error obteniendo KPIs para dashboard: " + e.message
    };
  }
}

/**
 * Prueba la obtención de datos de progreso diario para el dashboard.
 * @return {{success: boolean, rowCount?: number, columnCount?: number, sampleData?: Array, error?: string, message: string, stack?: string}}
 */
function testGetDailyProgressData() {
  Logger.log("Iniciando testGetDailyProgressData...");
  try {
    const data = getDailyProgressDataForDashboard(); // De Dashboard_DataProviders.gs
    const rowCount = data ? data.length : 0;
    const colCount = data && rowCount > 0 ? (data[0] ? data[0].length : 0) : 0;
    Logger.log(`Resultado de testGetDailyProgressData: ${rowCount} filas, ${colCount} columnas.`);
    return {
      success: true,
      rowCount: rowCount,
      columnCount: colCount,
      sampleData: rowCount > 1 ? data[1] : (rowCount === 1 ? data[0] : []), // Primera fila de datos o encabezados
      message: rowCount > 1 ? "Datos de progreso diario obtenidos." : (rowCount === 1 ? "Solo encabezados obtenidos." : "No hay datos.")
    };
  } catch (e) {
    Logger.log(`Error en testGetDailyProgressData: ${e.message}\nStack: ${e.stack}`);
    return {
      success: false,
      error: e.message,
      stack: e.stack ? String(e.stack) : "No stack disponible",
      message: "Error obteniendo datos de progreso diario: " + e.message
    };
  }
}

/**
 * Prueba la obtención de los productos más vendidos (semanal y mensual) para el dashboard.
 * @return {{success: boolean, weeklyCount?: number, monthlyCount?: number, weeklyFirstItem?: object, monthlyFirstItem?: object, error?: string, message: string, stack?: string}}
 */
function testGetTopSellingProducts() {
  Logger.log("Iniciando testGetTopSellingProducts...");
  try {
    const weeklyData = getTopSellingProductsLastWeek();   // De Dashboard_DataProviders.gs
    const monthlyData = getTopSellingProductsLastMonth(); // De Dashboard_DataProviders.gs
    Logger.log(`Resultado de testGetTopSellingProducts: Semanal=${weeklyData.length}, Mensual=${monthlyData.length}`);
    return {
      success: true,
      weeklyCount: weeklyData ? weeklyData.length : 0,
      monthlyCount: monthlyData ? monthlyData.length : 0,
      weeklyFirstItem: weeklyData && weeklyData.length > 0 ? weeklyData[0] : null,
      monthlyFirstItem: monthlyData && monthlyData.length > 0 ? monthlyData[0] : null,
      message: "Datos de productos más vendidos obtenidos."
    };
  } catch (e) {
    Logger.log(`Error en testGetTopSellingProducts: ${e.message}\nStack: ${e.stack}`);
    return {
      success: false,
      error: e.message,
      stack: e.stack ? String(e.stack) : "No stack disponible",
      message: "Error obteniendo productos más vendidos: " + e.message
    };
  }
}


/**
 * Verifica si las funciones especificadas existen globalmente en el script.
 * Útil para el dashboard para saber si puede llamar a ciertas funciones.
 * @param {Array<string>} functionNames - Lista de nombres de funciones a verificar.
 * @return {Object} Un objeto con {nombreFuncion: boolean} indicando si existe.
 */
function checkFunctionsExist(functionNames) {
  const result = {};
  if (!Array.isArray(functionNames)) {
    Logger.log("checkFunctionsExist: Se esperaba un array de nombres de funciones.");
    return { error: "Input no es un array" };
  }
  functionNames.forEach(functionName => {
    try {
      result[functionName] = typeof this[functionName] === 'function';
    } catch (e) {
      result[functionName] = false; // Si hay error al acceder, asumir que no existe o no es accesible.
    }
  });
  Logger.log("Resultado de checkFunctionsExist: " + JSON.stringify(result));
  return result;
}

/**
 * Devuelve el ID del script actual.
 * @return {string} ID del script.
 */
function getScriptId() { // Esta podría ser la única `getScriptId`
  return ScriptApp.getScriptId();
}

/**
 * Función simplificada para devolver datos básicos de KPI (para debug del dashboard).
 * @return {{success: boolean, message: string, data?: object, error?: string}}
 */
function getBasicKPIs() {
  Logger.log("getBasicKPIs (dashboard debug) llamada.");
  try {
    // Simular datos o llamar a una versión muy simplificada de getDashboardSummaryKPIs si es necesario.
    return {
      success: true,
      message: "Datos básicos de KPI (simulados) obtenidos.",
      data: {
        currentWeekVisits: Math.floor(Math.random() * 1000),
        currentWeekOrders: Math.floor(Math.random() * 100),
        mtdVisits: Math.floor(Math.random() * 5000),
        mtdNetSales: Math.floor(Math.random() * 500000) / 100,
        mtdOrderCount: Math.floor(Math.random() * 500)
      }
    };
  } catch (error) {
    Logger.log("Error en getBasicKPIs: " + error.message);
    return {
      success: false,
      message: "Error obteniendo datos básicos de KPI (simulados).",
      error: error.message
    };
  }
}