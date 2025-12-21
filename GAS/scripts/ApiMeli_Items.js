// ============================================================================
// --- ARCHIVO: ApiMeli_Items.gs ---
// ============================================================================
// Descripción: Funciones para interactuar con los endpoints de la API de
//              Mercado Libre relacionados con Publicaciones/Items.
// ============================================================================

/**
 * Obtiene todos los IDs de los ítems (publicaciones activas y pausadas) del usuario.
 * Implementa caché para los resultados.
 * @param {string} token - El token de acceso OAuth2.
 * @param {number} userId - El ID del usuario de Mercado Libre.
 * @return {Array<string>} - Un array con los IDs de los ítems (ej: ["MLA123", "MLA456"]).
 * @throws {Error} - Si el userId es inválido o si hay un error crítico irrecuperable.
 */
function getAllMyItemIds(token, userId) {
  if (typeof userId !== 'number' || isNaN(userId)) {
    Logger.log(`Error en getAllMyItemIds: User ID inválido - ${userId}`);
    throw new Error(`User ID inválido proporcionado a getAllMyItemIds: ${userId}`);
  }

  const cacheKey = `item_ids_${userId}`;
  const cachedData = getCachedResults(cacheKey); // Asume getCachedResults está en Cache.gs

  if (cachedData && Array.isArray(cachedData)) {
    Logger.log(`getAllMyItemIds: Usando IDs de ítems desde caché para User ID: ${userId} (${cachedData.length} items)`);
    return cachedData;
  }

  Logger.log(`getAllMyItemIds: Iniciando obtención de IDs de ítems para User ID: ${userId} (sin caché)`);
  let allItemIds = [];
  let offset = 0;
  const limit = 50; // Límite por página de la API

  try {
    while (true) {
      const url = `${MELI_API_BASE_URL}/users/${userId}/items/search?limit=${limit}&offset=${offset}&status=active,paused`;
      // Logger.log(`Consultando URL de IDs: ${url}`); // Descomentar para depuración detallada de URLs

      let responseData;
      try {
        responseData = makeApiCall(url, token); // Asume makeApiCall está en ApiMeli_Core.gs
      } catch (apiError) {
        // Si es un error de rate limit o token, se propaga desde makeApiCall.
        // Para otros errores de red o fetch, makeApiCall también propaga.
        // Si makeApiCall devuelve null por error 404 o similar, se manejará abajo.
        Logger.log(`Error en makeApiCall dentro de getAllMyItemIds (offset ${offset}): ${apiError.message}.`);
        // Si ya tenemos algunos IDs, es mejor devolverlos que fallar completamente.
        if (allItemIds.length > 0) {
          Logger.log(`Devolviendo ${allItemIds.length} IDs parciales debido a error en llamada API.`);
          cacheApiResults(cacheKey, allItemIds, CACHE_EXPIRATION_MEDIUM); // Cachear lo que tenemos
          return allItemIds;
        }
        throw apiError; // Propagar el error si no tenemos nada
      }


      if (responseData && responseData.results && Array.isArray(responseData.results)) {
        if (responseData.results.length > 0) {
          allItemIds = allItemIds.concat(responseData.results);
        }
      } else {
        Logger.log(`WARN: Respuesta inesperada o sin resultados desde /users/${userId}/items/search (offset ${offset}). Respuesta: ${JSON.stringify(responseData).substring(0,200)}`);
        // Podría ser el final de la paginación o un error no crítico.
        // Si ya no hay 'paging', asumimos que terminó.
        if (!responseData || !responseData.paging) break;
      }

      const paging = responseData.paging;
      const total = paging ? paging.total : 0;
      const currentOffset = paging ? paging.offset : offset;
      const currentLimit = paging ? paging.limit : limit;

      Logger.log(`Paginación IDs: Página ${Math.floor(currentOffset / currentLimit) + 1}, Items en esta pág: ${responseData.results ? responseData.results.length : 0}, Offset actual: ${currentOffset}, Total de items: ${total}.`);

      // Guardar en caché los resultados parciales después de cada página exitosa
      if (allItemIds.length > 0) {
        cacheApiResults(cacheKey, allItemIds, CACHE_EXPIRATION_MEDIUM); // Guardar en caché por 12 horas (CACHE_EXPIRATION_MEDIUM)
      }

      offset = currentOffset + currentLimit;
      if (offset >= total || (responseData.results && responseData.results.length === 0)) {
        Logger.log('Fin de la paginación para IDs de ítems.');
        break;
      }
      Utilities.sleep(API_CALL_DELAY); // Pausa entre llamadas para no saturar la API
    }

    Logger.log(`getAllMyItemIds: Total de IDs de ítems obtenidos para User ID ${userId}: ${allItemIds.length}`);
    // Guardar en caché el resultado final completo
    if (allItemIds.length > 0) {
      cacheApiResults(cacheKey, allItemIds, CACHE_EXPIRATION_LONG); // Guardar en caché por 24 horas (CACHE_EXPIRATION_LONG)
    } else {
        // Si no hay items, es bueno cachear un array vacío para no reintentar innecesariamente pronto.
        cacheApiResults(cacheKey, [], CACHE_EXPIRATION_SHORT); // Cachear array vacío por 1 hora.
    }
    return allItemIds;

  } catch (e) {
    // Si ocurre un error después de haber obtenido algunos IDs (ej. error de red en una página tardía)
    if (allItemIds.length > 0) {
      Logger.log(`Error en getAllMyItemIds pero se obtuvieron ${allItemIds.length} IDs parciales. Error: ${e.message}. Se devuelven los parciales.`);
      cacheApiResults(cacheKey, allItemIds, CACHE_EXPIRATION_MEDIUM); // Cachear los parciales
      return allItemIds;
    }
    // Si no tenemos nada y ocurre un error, propagar.
    Logger.log(`Error crítico en getAllMyItemIds sin resultados parciales: ${e.message}. Stack: ${e.stack}`);
    throw e; // Propagar el error si es grave y no se recuperó nada.
  }
}

/**
 * Obtiene detalles (SKU), visitas (90d) y verifica si una promoción está activa para UN SOLO ítem.
 * @param {string} itemId - El ID del ítem de Mercado Libre (ej: "MLA123456").
 * @param {string} token - El token de acceso OAuth2.
 * @return {object} Un objeto con los datos del ítem:
 * { id, title, sku, visits_90d, isInActivePromotion, hasError, errorMessage }
 */
function fetchSingleItemDetailsAndVisits(itemId, token) {
  // const functionVersion = "v3.1_with_promo_check"; // Versión original de tu función
  let itemData = {
    id: itemId,
    title: `Error obteniendo título para ${itemId}`,
    sku: '',
    visits_90d: 0,
    isInActivePromotion: false,
    hasError: false,
    errorMessage: ''
  };

  try {
    // 1. Obtener detalles del ítem (incluyendo SKU de atributos o variaciones)
    const detailsUrl = `${MELI_API_BASE_URL}/items/${itemId}?include_attributes=all`;
    const itemDetailsApiResponse = makeApiCall(detailsUrl, token);

    if (itemDetailsApiResponse && itemDetailsApiResponse.id === itemId) {
      itemData.title = itemDetailsApiResponse.title || `Título no disponible para ${itemId}`;
      let skuValor = '';
      // Buscar SKU en atributos principales
      if (itemDetailsApiResponse.attributes && Array.isArray(itemDetailsApiResponse.attributes)) {
        const skuAttr = itemDetailsApiResponse.attributes.find(attr => attr.id === "SELLER_SKU");
        if (skuAttr && skuAttr.value_name) {
          skuValor = skuAttr.value_name;
        }
      }
      // Si no se encontró y hay variaciones, buscar SKU en la primera variación que lo tenga
      if (!skuValor && itemDetailsApiResponse.variations && itemDetailsApiResponse.variations.length > 0) {
        for (const variation of itemDetailsApiResponse.variations) {
          if (variation.attributes && Array.isArray(variation.attributes)) {
            const skuAttrVar = variation.attributes.find(attr => attr.id === "SELLER_SKU");
            if (skuAttrVar && skuAttrVar.value_name) {
              skuValor = skuAttrVar.value_name;
              break; // Encontrado, salir del bucle de variaciones
            }
          }
        }
      }
      itemData.sku = skuValor;
    } else {
      itemData.errorMessage += `Error obteniendo detalles del ítem. `;
      itemData.hasError = true;
      Logger.log(`WARN: No se obtuvieron detalles válidos para ${itemId}. Respuesta API: ${JSON.stringify(itemDetailsApiResponse).substring(0, 200)}`);
    }

    Utilities.sleep(API_CALL_DELAY); // Pausa

    // 2. Obtener visitas de los últimos 90 días
    const today = new Date();
    const endingDate = today.toISOString().split('T')[0]; // Formato YYYY-MM-DD
    const visitsUrl = `${MELI_API_BASE_URL}/items/${itemId}/visits/time_window?last=${VISIT_TIME_WINDOW_LAST}&unit=${VISIT_TIME_WINDOW_UNIT}&ending=${endingDate}`;
    const visitResultApiResponse = makeApiCall(visitsUrl, token);

    if (visitResultApiResponse && (visitResultApiResponse.item_id === itemId || visitResultApiResponse.id === itemId) && typeof visitResultApiResponse.total_visits === 'number') {
      itemData.visits_90d = visitResultApiResponse.total_visits;
    } else if (visitResultApiResponse && typeof visitResultApiResponse.total === 'number') { // Algunos endpoints devuelven 'total' en lugar de 'total_visits'
        itemData.visits_90d = visitResultApiResponse.total;
    }
    else {
      itemData.errorMessage += `Error obteniendo visitas. `;
      // No marcamos hasError como true aquí necesariamente, puede que el item no tenga visitas.
      Logger.log(`WARN: No se obtuvieron visitas válidas para ${itemId} o el formato de respuesta fue inesperado. Respuesta API: ${JSON.stringify(visitResultApiResponse).substring(0, 200)}`);
    }

    Utilities.sleep(API_CALL_DELAY); // Pausa

    // 3. Verificar promociones activas
    const promoUrl = `${MELI_API_BASE_URL}/seller-promotions/items/${itemId}?app_version=v2`;
    try {
      const promoResponse = makeApiCall(promoUrl, token);
      // La API puede devolver un array vacío si no hay promos, o un array de objetos si las hay.
      // O puede devolver un error 404 si el item nunca tuvo promos, lo cual es manejado por makeApiCall devolviendo null.
      if (promoResponse && Array.isArray(promoResponse)) {
        itemData.isInActivePromotion = promoResponse.some(p => p.status === 'started');
      }
    } catch (promoError) {
      // Si makeApiCall lanza un error (ej. token inválido), se captura aquí o en el catch general.
      // Si devuelve null (ej. 404), no entra al if y isInActivePromotion queda false, que es correcto.
      Logger.log(`Error consultando promociones para ${itemId}: ${promoError.message}. Esto puede ser normal si el item no tiene promociones.`);
      // No se considera un error fatal para los datos del ítem.
    }

  } catch (e) {
    Logger.log(`Error CRÍTICO durante fetchSingleItemDetailsAndVisits para ${itemId}: ${e.toString()}`);
    itemData.errorMessage += `Excepción general durante la obtención de datos: ${e.message}. `;
    itemData.hasError = true; // Marcar error si hay una excepción no controlada
  }

  Logger.log(`Resultado para ${itemId} -> SKU:'${itemData.sku}', Título:'${itemData.title.substring(0,30)}...', Visitas:${itemData.visits_90d}, Promo:${itemData.isInActivePromotion}, Error:${itemData.hasError}, Msg: ${itemData.errorMessage}`);
  return itemData;
}


/**
 * Obtiene detalles actuales de un ítem específico, enfocado en SKU, título, estado, cantidad y precio.
 * Esta es una versión mejorada y más robusta de obtener detalles.
 * @param {string} token - El token de acceso OAuth2.
 * @param {string} itemId - El ID del ítem de Mercado Libre.
 * @param {object} [fallbackInfo=null] - Información de fallback (ej. {sku, titulo}) si la API falla.
 * @return {object|null} Objeto con {sku, titulo, estado, cantidadDisponible, precio} o null si falla.
 */
function obtenerDetallesItemMejorado(token, itemId, fallbackInfo = null) {
  if (!itemId) {
    Logger.log('Error en obtenerDetallesItemMejorado: itemId es nulo o vacío');
    return null;
  }

  try {
    const itemUrl = `${MELI_API_BASE_URL}/items/${itemId}?include_attributes=attributes,variations`; // Pedir explícitamente variaciones y atributos
    const itemResponse = makeApiCall(itemUrl, token);

    if (!itemResponse) {
      Logger.log(`No se pudo obtener información de la API para el ítem ${itemId}.`);
      if (fallbackInfo) {
        Logger.log(`Usando información de fallback para ${itemId}: SKU=${fallbackInfo.sku}, Título=${fallbackInfo.titulo}`);
        return {
          sku: fallbackInfo.sku || `FALLBACK_SKU_${itemId}`,
          titulo: fallbackInfo.titulo || `FALLBACK_TITLE_${itemId}`,
          estado: 'desconocido_api_fallo',
          cantidadDisponible: 0,
          precio: 0
        };
      }
      return null; // No hay respuesta ni fallback
    }

    let sku = "";
    // 1. Intentar obtener SKU de atributos principales
    if (itemResponse.attributes && Array.isArray(itemResponse.attributes)) {
      const skuAttr = itemResponse.attributes.find(attr => attr.id === "SELLER_SKU");
      if (skuAttr && skuAttr.value_name) {
        sku = skuAttr.value_name;
      }
    }

    // 2. Si no se encontró y hay variaciones, intentar obtener SKU de la primera variación que lo tenga
    if (!sku && itemResponse.variations && Array.isArray(itemResponse.variations) && itemResponse.variations.length > 0) {
      for (const variation of itemResponse.variations) {
        // Las variaciones también tienen un array de `attributes`
        if (variation.attributes && Array.isArray(variation.attributes)) {
          const skuVarAttr = variation.attributes.find(attr => attr.id === "SELLER_SKU");
          if (skuVarAttr && skuVarAttr.value_name) {
            sku = skuVarAttr.value_name;
            break; // Encontrado, salir del bucle de variaciones
          }
        }
        // Algunas variaciones pueden tener `seller_custom_field` directamente
        if (!sku && variation.seller_custom_field) {
            sku = variation.seller_custom_field; // Asumiendo que este es el SKU
            break;
        }
      }
    }
    
    // 3. Si aún no hay SKU, usar el fallback si existe
    if (!sku && fallbackInfo && fallbackInfo.sku) {
        sku = fallbackInfo.sku;
        Logger.log(`SKU para ${itemId} obtenido del fallback: ${sku}`);
    }


    // Obtener título, usando fallback si es necesario
    let titulo = itemResponse.title || (fallbackInfo ? fallbackInfo.titulo : '') || `SIN_TITULO_${itemId}`;


    return {
      sku: sku,
      titulo: titulo,
      estado: itemResponse.status || 'desconocido',
      cantidadDisponible: itemResponse.available_quantity !== undefined ? itemResponse.available_quantity : 0,
      precio: itemResponse.price !== undefined ? itemResponse.price : 0
    };

  } catch (error) {
    Logger.log(`Error crítico obteniendo detalles del ítem ${itemId}: ${error.message}. Stack: ${error.stack}`);
    if (fallbackInfo) {
        Logger.log(`Usando información de fallback debido a error para ${itemId}: SKU=${fallbackInfo.sku}, Título=${fallbackInfo.titulo}`);
        return {
          sku: fallbackInfo.sku || `FALLBACK_SKU_ERROR_${itemId}`,
          titulo: fallbackInfo.titulo || `FALLBACK_TITLE_ERROR_${itemId}`,
          estado: 'error_api',
          cantidadDisponible: 0,
          precio: 0
        };
    }
    return null; // Fallo completo sin fallback
  }
}

