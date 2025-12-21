// ============================================================================
// --- ARCHIVO: Logistica_Full.gs ---
// ============================================================================
// Descripción: Contiene toda la lógica para el cálculo y gestión
//              de envíos a Mercado Libre Fulfillment.
// ============================================================================

/**
 * Lee los parámetros de configuración desde la hoja Config_Logistica.
 * @returns {object|null} Un objeto con los parámetros de configuración o null si hay error.
 */
function leerConfiguracionLogistica() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName(CONFIG_LOGISTICA_SHEET_NAME);

  if (!configSheet) {
    SpreadsheetApp.getUi().alert(`Error: La hoja de configuración logística "${CONFIG_LOGISTICA_SHEET_NAME}" no fue encontrada.`);
    Logger.log(`Error: Hoja "${CONFIG_LOGISTICA_SHEET_NAME}" no encontrada.`);
    return null;
  }

  const data = configSheet.getRange("A2:B" + configSheet.getLastRow()).getValues();
  const configuracion = {};

  data.forEach(row => {
    const parametro = row[0];
    const valor = row[1];
    if (parametro) {
      const parametroLower = parametro.toLowerCase();
      
      if (parametroLower.includes('tránsito') || parametroLower.includes('transito')) {
        configuracion.tiempoTransito = parseFloat(valor) || 0;
      } else if (parametroLower.includes('frecuencia')) {
        configuracion.frecuenciaEnvio = parseFloat(valor) || 0;
      } else if (parametroLower.includes('servicio')) {
        configuracion.nivelServicioZ = parseFloat(valor) || 0;
      }
    }
  });

  Logger.log("Configuración de logística leída: %s", JSON.stringify(configuracion));
  return configuracion;
}


/**
 * Procesa la hoja de órdenes para calcular Ventas Diarias Promedio (V) y Desvío Estándar (σ) por SKU.
 * @param {number} dias - El número de días históricos a analizar.
 * @returns {object} Un objeto donde cada clave es un SKU y el valor es {ventasDiariasPromedio, desvioEstandar, titulo}.
 */
function procesarVentasHistoricas(dias) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(ORDERS_DETAIL_SHEET_NAME);
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);

  if (!ordersSheet || ordersSheet.getLastRow() <= 1) { return {}; }
  if (!targetSheet || targetSheet.getLastRow() <= 1) { return {}; }

  const itemInfoMap = {};
  targetSheet.getRange("A2:G" + targetSheet.getLastRow()).getValues().forEach(row => {
    if (row[6] && row[0]) itemInfoMap[row[6]] = { sku: row[0], titulo: row[1] };
  });

  const ventasPorSkuPorDia = {};
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - dias);

  ordersSheet.getRange("C2:G" + ordersSheet.getLastRow()).getValues().forEach(row => {
    const fechaPago = row[0];
    const itemId = row[2];
    const cantidad = row[4];

    if (fechaPago >= fechaLimite && itemId && cantidad > 0) {
      const info = itemInfoMap[itemId];
      if (info && info.sku) {
        const sku = info.sku;
        const fechaStr = Utilities.formatDate(fechaPago, Session.getScriptTimeZone(), "yyyy-MM-dd");
        if (!ventasPorSkuPorDia[sku]) {
          ventasPorSkuPorDia[sku] = { titulo: info.titulo, ventas: {} };
        }
        ventasPorSkuPorDia[sku].ventas[fechaStr] = (ventasPorSkuPorDia[sku].ventas[fechaStr] || 0) + cantidad;
      }
    }
  });

  const resultados = {};
  for (const sku in ventasPorSkuPorDia) {
    const ventasDiarias = [];
    let totalUnidades = 0;
    for (let i = 0; i < dias; i++) {
      const fechaActual = new Date();
      fechaActual.setDate(fechaActual.getDate() - i);
      const fechaStr = Utilities.formatDate(fechaActual, Session.getScriptTimeZone(), "yyyy-MM-dd");
      const ventasDelDia = ventasPorSkuPorDia[sku].ventas[fechaStr] || 0;
      ventasDiarias.push(ventasDelDia);
      totalUnidades += ventasDelDia;
    }
    const ventasDiariasPromedio = totalUnidades / dias;
    const media = ventasDiariasPromedio;
    const varianza = ventasDiarias.map(x => Math.pow(x - media, 2)).reduce((a, b) => a + b, 0) / dias;
    const desvioEstandar = Math.sqrt(varianza);
    resultados[sku] = {
      titulo: ventasPorSkuPorDia[sku].titulo,
      ventasDiariasPromedio: ventasDiariasPromedio,
      desvioEstandar: desvioEstandar
    };
  }
  Logger.log("Análisis de ventas completado para %s SKUs.", Object.keys(resultados).length);
  return resultados;
}

/**
 * *** VERSIÓN CORREGIDA Y MÁS ROBUSTA ***
 * Obtiene el stock actual en Full usando un mapeo de SKU desde Hoja 1 para mayor fiabilidad.
 * @param {string} token - El token de acceso OAuth2.
 * @returns {object} Un objeto donde cada clave es un SKU y el valor es el stock disponible.
 */
function obtenerStockFullPorSku(token) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheet = ss.getSheetByName(TARGET_SHEET_NAME);
  const stockPorSku = {};

  if (!targetSheet || targetSheet.getLastRow() <= 1) {
    Logger.log("No se puede obtener stock por SKU: Hoja 1 está vacía.");
    return {};
  }

  // 1. Creamos un mapa de ItemID -> SKU desde nuestra fuente de verdad (Hoja 1)
  const itemSkuMap = {};
  const targetData = targetSheet.getRange("A2:G" + targetSheet.getLastRow()).getValues();
  targetData.forEach(row => {
    const sku = row[0];
    const itemId = row[6];
    if (itemId && sku) {
      itemSkuMap[itemId] = sku;
    }
  });
  const itemIds = Object.keys(itemSkuMap);

  // 2. Consultamos la API en lotes, como antes
  const CHUNK_SIZE = 20;
  for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
    const chunk = itemIds.slice(i, i + CHUNK_SIZE);
    const url = `${MELI_API_BASE_URL}/items?ids=${chunk.join(',')}&attributes=id,available_quantity,shipping`;
    
    try {
      const response = makeApiCall(url, token);
      if (response && Array.isArray(response)) {
        response.forEach(itemResult => {
          if (itemResult.code === 200 && itemResult.body) {
            const item = itemResult.body;
            // 3. Verificamos si es de Full
            if (item.shipping && item.shipping.logistic_type === 'fulfillment') {
              // 4. USAMOS NUESTRO SKU del mapa, no el de la API, para asegurar consistencia
              const nuestroSku = itemSkuMap[item.id];
              if (nuestroSku) {
                stockPorSku[nuestroSku] = item.available_quantity || 0;
              }
            }
          }
        });
      }
    } catch (e) {
      Logger.log(`Error obteniendo el lote de stock [${chunk.join(',')}]: ${e.message}`);
    }
    Utilities.sleep(API_CALL_DELAY * 2);
  }

  Logger.log("Stock en Full obtenido para %s SKUs.", Object.keys(stockPorSku).length);
  return stockPorSku;
}


/**
 * *** VERSIÓN CORREGIDA PARA DATOS NORMALIZADOS ***
 * Obtiene el stock "En Preparación" o "Despachado" leyendo primero la hoja maestra
 * y luego buscando los productos correspondientes en la hoja de detalle.
 * @returns {object} Un objeto donde cada clave es un SKU y el valor es la cantidad en tránsito.
 */
function obtenerStockEnTransitoPorSku() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const enviosSheet = ss.getSheetByName('Registro_Envios_Full');
  const detalleSheet = ss.getSheetByName('Detalle_Envios_Full');
  const stockEnTransito = {};

  if (!enviosSheet || enviosSheet.getLastRow() < 2 || !detalleSheet || detalleSheet.getLastRow() < 2) {
    return {};
  }
  
  // 1. Encontrar los IDs de los envíos que están activos ('En Preparación' o 'Despachado')
  const enviosActivos = new Set();
  const enviosData = enviosSheet.getRange("A2:C" + enviosSheet.getLastRow()).getValues(); // ID, ID_ML, Estado
  enviosData.forEach(row => {
    const idEnvio = row[0];
    const estado = row[2].toLowerCase();
    if (estado === 'en preparación' || estado === 'despachado') {
      enviosActivos.add(idEnvio);
    }
  });

  // Si no hay envíos activos, no hay nada que sumar.
  if (enviosActivos.size === 0) {
    return {};
  }

  // 2. Sumar las cantidades de los productos que pertenecen a esos envíos activos.
  const detalleData = detalleSheet.getRange("A2:C" + detalleSheet.getLastRow()).getValues(); // ID_Envio, SKU, Cantidad
  detalleData.forEach(row => {
    const idEnvio = row[0];
    const sku = row[1];
    const cantidad = parseFloat(row[2]) || 0;
    
    if (enviosActivos.has(idEnvio)) {
      stockEnTransito[sku] = (stockEnTransito[sku] || 0) + cantidad;
    }
  });

  Logger.log("Stock en tránsito (corregido) calculado para %s SKUs.", Object.keys(stockEnTransito).length);
  return stockEnTransito;
}



/**
 * *** VERSIÓN FINAL DE PRODUCCIÓN ***
 * Realiza el cálculo de proyección y rellena la hoja de sugerencias con el formato limpio.
 * @param {object} parametros - Objeto con {tt, fe, z, fechaColecta} desde la Web App.
 */
function calcularSugerenciasDeEnvio(parametros) {
  SpreadsheetApp.getActiveSpreadsheet().toast("Iniciando cálculo de envíos... Puede tardar.", "Procesando", -1);
  Logger.log("--- Iniciando cálculo de sugerencias de envío a Full (v Producción) ---");
  
  const service = getMeliService();
  const token = service.getToken();
  if (!token) { throw new Error("Token no válido."); }

  const analisisVentas = procesarVentasHistoricas(90);
  const stockFull = obtenerStockFullPorSku(token);
  const stockEnTransito = obtenerStockEnTransitoPorSku();

  const sugerencias = [];
  const { tt: Tt, fe: Fe, z: Z, fechaColecta: fechaColectaStr } = parametros;
  const L = Fe + Tt;
  
  const hoy = new Date();
  const hoyUTC = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const [year, month, day] = fechaColectaStr.split('-').map(Number);
  const fechaColectaUTC = new Date(Date.UTC(year, month - 1, day));
  const diasHastaColecta = Math.max(0, (fechaColectaUTC - hoyUTC) / (1000 * 60 * 60 * 24));

  for (const sku in analisisVentas) {
    const datosVenta = analisisVentas[sku];
    const V = datosVenta.ventasDiariasPromedio;
    const sigma = datosVenta.desvioEstandar;
    
    if (V >= 0) { // Incluimos productos sin ventas para poder enviar stock si queremos promocionarlos
      const Sml = stockFull[sku] || 0;
      const enTransito = stockEnTransito[sku] || 0;
      
      const consumoProyectado = V * diasHastaColecta;
      const stockProyectadoEnColecta = (Sml + enTransito) - consumoProyectado;
      const Ss = Z * sigma * Math.sqrt(L);
      const cantidadNecesaria = (V * L) + Ss;
      let cantidadAEnviar = Math.ceil(cantidadNecesaria - stockProyectadoEnColecta);
      
      if (cantidadAEnviar < 0) { cantidadAEnviar = 0; }
      
      const coberturaActual = (V > 0) ? Sml / V : Infinity;
      let nivelRiesgo = "Normal";
      if (V > 0) { // Solo calculamos riesgo para productos con ventas
        if (coberturaActual < (L + diasHastaColecta)) { nivelRiesgo = "RIESGO"; }
        if (coberturaActual < (Tt + diasHastaColecta)) { nivelRiesgo = "CRÍTICO"; }
      }

      sugerencias.push([
        sku,
        datosVenta.titulo,
        V,
        Sml,
        enTransito,
        Math.ceil(Ss),
        coberturaActual,
        cantidadAEnviar,
        nivelRiesgo
      ]);
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sugerenciasSheet = ss.getSheetByName("Sugerencias_Envio_Full");
  if (sugerenciasSheet) {
    sugerenciasSheet.getRange("A2:I" + sugerenciasSheet.getMaxRows()).clearContent(); 
    if (sugerencias.length > 0) {
      sugerencias.sort((a, b) => b[7] - a[7]); // Ordenar por CANTIDAD A ENVIAR
      const range = sugerenciasSheet.getRange(2, 1, sugerencias.length, 9);
      range.setValues(sugerencias);
      
      // Aplicar formatos finales
      range.setNumberFormat('@STRING@');
      sugerenciasSheet.getRange(2, 3, sugerencias.length, 1).setNumberFormat('0.00'); // V
      sugerenciasSheet.getRange(2, 4, sugerencias.length, 3).setNumberFormat('#,##0'); // Stocks
      sugerenciasSheet.getRange(2, 7, sugerencias.length, 1).setNumberFormat('0.0'); // Cobertura
      sugerenciasSheet.getRange(2, 8, sugerencias.length, 1).setNumberFormat('#,##0'); // Cant a Enviar
    }
    SpreadsheetApp.getActiveSpreadsheet().toast("¡Cálculo de envíos a Full completado!", "Éxito", 10);
  }
  Logger.log("--- Fin del cálculo de sugerencias de envío (v Producción) ---");
}