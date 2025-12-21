// ============================================================================
// --- ARCHIVO: ApiMeli_Ads.gs ---
// ============================================================================
// Descripción: Funciones para interactuar con la API de Mercado Ads.
// ============================================================================

/**
 * Obtiene el advertiser_id del usuario y lo guarda en caché.
 * @param {string} token - El token de acceso OAuth2.
 * @returns {string|null} El ID del anunciante o null si no se encuentra.
 */
function obtenerAdvertiserId(token) {
  const cacheKey = "advertiser_id";
  const cachedId = getCachedResults(cacheKey);
  if (cachedId) {
    return cachedId;
  }

  const url = `${MELI_API_BASE_URL}/advertising/advertisers?product_id=PADS`;
  const options = {
    headers: { 'Authorization': `Bearer ${token}`, 'api-version': '1' }
  };
  
  const response = makeApiCall(url, token, options);
  
  // *** CORRECCIÓN: Leemos de 'response.advertisers' y buscamos 'advertiser_id' ***
  if (response && response.advertisers && response.advertisers.length > 0 && response.advertisers[0].advertiser_id) {
    const advertiserId = response.advertisers[0].advertiser_id;
    cacheApiResults(cacheKey, advertiserId, CACHE_EXPIRATION_LONG * 30);
    return advertiserId;
  }
  
  Logger.log("No se pudo obtener el advertiser_id.");
  return null;
}

/**
 * *** VERSIÓN FINAL v2.1 (con IVA y Log de Versión) ***
 */
function actualizarCostosDePublicidad() {
  const version = "v2.1";
  Logger.log(`Iniciando actualización de costos de publicidad (${version})...`);
  const token = getMeliService().getToken();
  if (!token) { return; }

  const advertiserId = obtenerAdvertiserId(token);
  if (!advertiserId) { return; }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Meli_Costos_Publicidad');
  if (!sheet) { return; }

  const hoy = new Date();
  const hace90dias = new Date();
  hace90dias.setDate(hoy.getDate() - 89);
  const aISO = date => date.toISOString().split('T')[0];
  const dateFrom = aISO(hace90dias);
  const dateTo = aISO(hoy);

  const url = `${MELI_API_BASE_URL}/advertising/advertisers/${advertiserId}/product_ads/campaigns?date_from=${dateFrom}&date_to=${dateTo}&metrics=cost&aggregation_type=DAILY`;
  const options = { headers: { 'Authorization': `Bearer ${token}`, 'api-version': '2' } };
  
  const response = makeApiCall(url, token, options);
  
  if (response && response.results && response.results.length > 0) {
    const datosActuales = sheet.getLastRow() > 1 ? sheet.getRange("A2:B" + sheet.getLastRow()).getValues() : [];
    const mapaCostos = datosActuales.reduce((mapa, fila) => {
      mapa[Utilities.formatDate(new Date(fila[0]), "GMT", "yyyy-MM-dd")] = fila[1];
      return mapa;
    }, {});

    response.results.forEach(dia => {
      const costoSinIva = parseFloat(dia.cost) || 0;
      const costoConIva = costoSinIva * 1.21;
      mapaCostos[dia.date] = costoConIva;
    });

    const datosParaEscribir = Object.keys(mapaCostos).map(fecha => [new Date(fecha), mapaCostos[fecha]]);
    datosParaEscribir.sort((a, b) => b[0] - a[0]);

    sheet.getRange("A2:B" + (sheet.getMaxRows() > 1 ? sheet.getMaxRows() : 2)).clearContent();
    sheet.getRange(2, 1, datosParaEscribir.length, 2).setValues(datosParaEscribir);
    sheet.getRange("A:A").setNumberFormat("yyyy-mm-dd");
    sheet.getRange("B:B").setNumberFormat("$#,##0.00");
    Logger.log(`Se actualizaron ${datosParaEscribir.length} registros de costos de publicidad (con IVA).`);
  } else {
    Logger.log("La API de Ads no devolvió resultados de costos.");
  }
}




/**
 * Prueba los dos endpoints de la API de Publicidad paso a paso.
 */
function diagnosticarApiDeAds() {
  Logger.log("--- INICIO DIAGNÓSTICO API DE ADS ---");
  const token = getMeliService().getToken();
  if (!token) { Logger.log("Error: No se pudo obtener el token."); return; }

  Logger.log("\n--- PASO 1: Intentando obtener Advertiser ID ---");
  const urlAdvertiser = `${MELI_API_BASE_URL}/advertising/advertisers?product_id=PADS`;
  const optionsV1 = { headers: { 'Authorization': `Bearer ${token}`, 'api-version': '1' } };
  
  const responseAdvertiser = makeApiCall(urlAdvertiser, token, optionsV1);
  Logger.log(">>> Respuesta COMPLETA de /advertisers: " + JSON.stringify(responseAdvertiser, null, 2));

  let advertiserId = null;
  // *** CORRECCIÓN: Leemos de 'responseAdvertiser.advertisers' y buscamos 'advertiser_id' ***
  if (responseAdvertiser && responseAdvertiser.advertisers && responseAdvertiser.advertisers.length > 0 && responseAdvertiser.advertisers[0].advertiser_id) {
    advertiserId = responseAdvertiser.advertisers[0].advertiser_id;
    Logger.log(`Éxito en Paso 1. Advertiser ID encontrado: ${advertiserId}`);
  } else {
    Logger.log("Fallo en Paso 1. No se pudo encontrar el Advertiser ID en la respuesta.");
    SpreadsheetApp.getUi().alert("Diagnóstico finalizado. No se encontró el Advertiser ID. Revisa los logs.");
    return;
  }
  
  Logger.log(`\n--- PASO 2: Intentando obtener costos para Advertiser ID ${advertiserId} ---`);
  const hoy = new Date();
  const hace90dias = new Date();
  hace90dias.setDate(hoy.getDate() - 89);
  const aISO = date => date.toISOString().split('T')[0];
  const dateFrom = aISO(hace90dias);
  const dateTo = aISO(hoy);
  
  const urlCosts = `${MELI_API_BASE_URL}/advertising/advertisers/${advertiserId}/product_ads/campaigns?date_from=${dateFrom}&date_to=${dateTo}&metrics=cost&aggregation_type=DAILY`;
  const optionsV2 = { headers: { 'Authorization': `Bearer ${token}`, 'api-version': '2' } };
  Logger.log("URL de Costos: " + urlCosts);
  
  const responseCosts = makeApiCall(urlCosts, token, optionsV2);
  Logger.log(">>> Respuesta COMPLETA de /campaigns: " + JSON.stringify(responseCosts, null, 2));

  if (responseCosts && responseCosts.results) {
    Logger.log(`Éxito en Paso 2. Se encontraron ${responseCosts.results.length} registros de costos.`);
  } else {
    Logger.log("Fallo en Paso 2. La respuesta no contiene un array de 'results'.");
  }
  
  Logger.log("--- FIN DIAGNÓSTICO ---");
  SpreadsheetApp.getUi().alert("Diagnóstico de Ads finalizado. Por favor, revisa los logs para ver los detalles.");
}