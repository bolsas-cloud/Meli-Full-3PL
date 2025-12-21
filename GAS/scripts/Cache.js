 // ============================================================================
// --- ARCHIVO: Cache.gs ---
// ============================================================================
// Descripción: Funciones para gestionar el almacenamiento en caché de resultados
//              de API y otros datos procesados, usando PropertiesService.
// ============================================================================

/**
 * Guarda resultados en caché con tiempo de expiración.
 * @param {string} key - Identificador único para el dato en caché.
 * @param {object|array|string|number|boolean} data - Datos a guardar en caché.
 * @param {number} [expirationMinutes=CACHE_EXPIRATION_MEDIUM] - Tiempo en minutos antes de que expire. Usa CACHE_EXPIRATION_MEDIUM por defecto.
 */
function cacheApiResults(key, data, expirationMinutes = CACHE_EXPIRATION_MEDIUM) {
  if (!key || data === undefined) {
    Logger.log(`⚠️ Intento de guardar en caché con clave vacía o datos undefined. Clave: ${key}`);
    return;
  }
  try {
    const cache = PropertiesService.getScriptProperties();
    const expirationTime = new Date().getTime() + (expirationMinutes * 60 * 1000);
    const cacheObject = {
      data: data,
      expiration: expirationTime
    };
    // PropertiesService tiene límites de tamaño, considerar alternativas para datos muy grandes.
    cache.setProperty(key, JSON.stringify(cacheObject));
    Logger.log(`✅ Datos guardados en caché con clave: ${key}, expira en ${expirationMinutes} minutos.`);
  } catch (e) {
    Logger.log(`❌ Error guardando en caché para clave "${key}": ${e.message}. Tamaño de datos: ${JSON.stringify(data).length} bytes.`);
    // Si el error es por tamaño, se podría implementar una fragmentación o usar CacheService (que tiene expiración más corta)
    if (e.message.includes("value too large")) {
        Logger.log(`El valor para la clave "${key}" es demasiado grande para PropertiesService. Considere reducir los datos o usar otra estrategia de caché.`);
    }
  }
}

/**
 * Recupera resultados de caché si están disponibles y no han expirado.
 * @param {string} key - Identificador único para el dato en caché.
 * @return {object|array|string|number|boolean|null} - Datos guardados o null si no existe, está expirado o hay error.
 */
function getCachedResults(key) {
  if (!key) {
    Logger.log(`⚠️ Intento de obtener de caché con clave vacía.`);
    return null;
  }
  try {
    const cache = PropertiesService.getScriptProperties();
    const cachedJson = cache.getProperty(key);
    if (!cachedJson) {
      Logger.log(`ℹ️ No se encontró caché para clave: ${key}`);
      return null;
    }

    const cacheObject = JSON.parse(cachedJson);
    if (new Date().getTime() >= cacheObject.expiration) {
      Logger.log(`⏳ Caché expirado para clave: ${key}. Se procederá a borrar.`);
      cache.deleteProperty(key); // Limpiar caché expirado
      return null;
    }
    Logger.log(`👍 Datos recuperados de caché para clave: ${key}`);
    return cacheObject.data;
  } catch (e) {
    Logger.log(`❌ Error recuperando o parseando caché para clave "${key}": ${e.message}. Se borrará la entrada corrupta.`);
    try { PropertiesService.getScriptProperties().deleteProperty(key); } catch (delErr) { /* no hacer nada */ }
    return null;
  }
}

/**
 * Limpia toda la caché de PropertiesService o una entrada específica.
 * @param {string} [key] - Si se proporciona, limpia solo esta clave. Si no, limpia todas las propiedades del script.
 */
function clearCache(key) {
  const cache = PropertiesService.getScriptProperties();
  if (key) {
    cache.deleteProperty(key);
    Logger.log(`🧹 Caché limpiado para clave específica: ${key}`);
    SpreadsheetApp.getActiveSpreadsheet().toast(`Caché para "${key}" limpiado.`, "Limpieza de Caché", 5);
  } else {
    cache.deleteAllProperties();
    Logger.log(`🧹 Toda la caché del script ha sido limpiada.`);
    SpreadsheetApp.getActiveSpreadsheet().toast("Toda la caché ha sido limpiada.", "Limpieza de Caché", 5);
  }
}


/**
 * Función complementaria para borrar la caché de Items IDs y forzar su actualización.
 * Esta función es específica para la clave que usa `getAllMyItemIds`.
 */
function borrarCacheItemIds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("Intentando borrar caché de IDs de ítems...");

  // Es necesario conocer el `userId` para construir la clave de caché exacta.
  // Intentaremos obtenerlo. Si no es posible, no podremos borrar la caché específica.
  let userId;
  try {
    const service = getMeliService();
    const token = service.getToken();
    if (token) {
      userId = getUserId(token); // Asume que getUserId está disponible
    }
  } catch (e) {
    Logger.log(`No se pudo obtener User ID para borrar caché de ítems: ${e.message}`);
    SpreadsheetApp.getActiveSpreadsheet().toast("No se pudo obtener User ID para borrar caché de ítems.", "Error Caché", 7);
    return false;
  }

  if (userId) {
    const cacheKey = `item_ids_${userId}`;
    try {
      PropertiesService.getScriptProperties().deleteProperty(cacheKey);
      Logger.log(`Caché de item_ids borrada para la clave: ${cacheKey}.`);
      SpreadsheetApp.getActiveSpreadsheet().toast(`Caché de IDs de ítems para usuario ${userId} borrada.`, "Caché Limpiado", 7);
      return true;
    } catch (e) {
      Logger.log(`Error borrando la clave de caché ${cacheKey}: ${e.message}`);
      SpreadsheetApp.getActiveSpreadsheet().toast(`Error borrando caché de IDs: ${e.message}`, "Error Caché", 7);
      return false;
    }
  } else {
    Logger.log('No se proporcionó User ID o no se pudo obtener, no se puede borrar caché específica de item_ids.');
    SpreadsheetApp.getActiveSpreadsheet().toast("No se pudo determinar User ID. No se borró caché de IDs.", "Advertencia Caché", 7);
    return false;
  }
}