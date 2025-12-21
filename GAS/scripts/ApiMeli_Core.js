// ============================================================================
// --- ARCHIVO: ApiMeli_Core.gs ---
// ============================================================================
// Descripción: Contiene la función genérica `makeApiCall` para interactuar
//              con la API de Mercado Libre y funciones API muy básicas.
// ============================================================================

/**
 * Realiza una llamada genérica a la API de Mercado Libre.
 * Maneja la autorización, errores comunes y parseo de JSON.
 * @param {string} url - La URL completa del endpoint de la API.
 * @param {string} token - El token de acceso OAuth2.
 * @param {object} [options={}] - Opciones adicionales para UrlFetchApp.fetch().
 * method GET por defecto.
 * @return {object|null} - El objeto JSON parseado de la respuesta, o null en caso de ciertos errores.
 * @throws {Error} - Lanza errores para problemas críticos como token inválido o límites de API.
 */
function makeApiCall(url, token, options = {}) {
  const defaultOptions = {
    headers: { 'Authorization': `Bearer ${token}` },
    muteHttpExceptions: true,
    contentType: 'application/json' // Default contentType
  };

  // Fusionar opciones, permitiendo al usuario sobreescribir headers o contentType
  const finalOptions = { ...defaultOptions, ...options };
  finalOptions.headers = { ...defaultOptions.headers, ...(options.headers || {}) };

  if (!finalOptions.method) {
    finalOptions.method = 'get'; // Default to GET if no method specified
  }
  finalOptions.method = finalOptions.method.toLowerCase();

  // Log de la llamada (opcional, comentar si es muy verboso)
  // Logger.log(`API Call: ${finalOptions.method.toUpperCase()} ${url.substring(0,150)}... Options: ${JSON.stringify(finalOptions)}`);

  let response;
  try {
    response = UrlFetchApp.fetch(url, finalOptions);
  } catch (networkError) {
    Logger.log(`Error de Red/Fetch en la llamada a ${url}: ${networkError.message}. Stack: ${networkError.stack}`);
    // Considerar si lanzar el error o devolver null/objeto de error específico
    throw new Error(`Error de red al contactar la API (${networkError.message})`);
  }

  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode >= 200 && responseCode < 300) {
    if (!responseText) { // Manejar respuestas vacías pero exitosas (ej. 204 No Content)
      Logger.log(`Respuesta exitosa (${responseCode}) pero vacía desde ${url}`);
      return {}; // Devolver objeto vacío para consistencia, en lugar de null
    }
    try {
      return JSON.parse(responseText);
    } catch (e) {
      Logger.log(`Error parseando JSON (${responseCode}) de ${url}: ${e.message}. Respuesta: ${responseText.substring(0, 500)}`);
      // Dependiendo de la criticidad, se podría lanzar un error o devolver null
      // Devolver null permite al código que llama decidir cómo manejar un JSON malformado.
      return null;
    }
  } else if (responseCode === 401 || (responseCode === 403 && responseText.includes("invalid_token"))) {
    Logger.log(`Error de Autenticación (${responseCode}) en ${url}. Respuesta: ${responseText.substring(0, 200)}`);
    // Este error es crítico y usualmente requiere re-autenticación.
    throw new Error(`Token inválido o expirado (${responseCode}). Re-autoriza la aplicación.`);
  } else if (responseCode === 400 && responseText.includes("validation_parameters")) {
    Logger.log(`Error de Parámetros (${responseCode}) en ${url}. Respuesta: ${responseText.substring(0, 200)}`);
    // Usualmente indica un problema con la solicitud, no necesariamente fatal para el script.
    return null;
  } else if (responseCode === 404) {
    Logger.log(`Error 404 No Encontrado en ${url}. Respuesta: ${responseText.substring(0, 200)}`);
    // El recurso no existe.
    return null;
  } else if (responseCode === 429 || (responseCode === 403 && !responseText.includes("invalid_token"))) {
    Logger.log(`Error de Límite de Tasa (Rate Limit) o Prohibido (${responseCode}) en ${url}. Respuesta: ${responseText.substring(0, 200)}`);
    // Este error es crítico y usualmente requiere esperar o ajustar la frecuencia de llamadas.
    throw new Error(`Límite de API alcanzado o Acceso Denegado (${responseCode}). Intenta más tarde.`);
  } else {
    Logger.log(`Error API Genérico (${responseCode}) en ${url}. Respuesta: ${responseText.substring(0, 500)}`);
    // Para otros errores, devolver null permite que el script intente continuar si es posible.
    // Opcionalmente, se podría lanzar un error si se prefiere detener la ejecución:
    // throw new Error(`Error API (${responseCode}): ${responseText.substring(0,200)}`);
    return null;
  }
}

/**
 * Obtiene el ID del usuario autenticado de Mercado Libre.
 * @param {string} token - El token de acceso OAuth2.
 * @return {number|null} - El ID numérico del usuario o null en caso de error.
 * @throws {Error} - Si la API devuelve un error crítico o el ID no es válido.
 */
function getUserId(token) {
  const url = `${MELI_API_BASE_URL}/users/me?attributes=id`;
  Logger.log('Obteniendo User ID desde /users/me...');
  try {
    const responseData = makeApiCall(url, token);
    if (responseData && responseData.id && !isNaN(parseInt(responseData.id))) {
      const userIdNum = parseInt(responseData.id);
      Logger.log(`User ID obtenido exitosamente: ${userIdNum}`);
      return userIdNum;
    } else {
      Logger.log(`Error: Respuesta inesperada o User ID no válido desde /users/me. Respuesta: ${JSON.stringify(responseData)}`);
      throw new Error('Respuesta inesperada o User ID no válido al obtener ID de usuario.');
    }
  } catch (error) {
    Logger.log(`Error crítico llamando a /users/me para obtener User ID: ${error.message}`);
    // Propagar el error porque el User ID es fundamental para muchas operaciones.
    throw new Error(`Fallo al obtener User ID: ${error.message}`);
  }
}