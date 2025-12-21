// ============================================================================
// --- ARCHIVO: Auth.gs ---
// ============================================================================
// Descripción: Maneja la autenticación OAuth2 con Mercado Libre,
//              incluyendo obtención, almacenamiento y refresco de tokens.
// ============================================================================

/**
 * Obtiene el servicio de autenticación de Mercado Libre.
 * Lee la configuración desde la hoja CONFIG_SHEET_NAME.
 * Incluye logging detallado para diagnóstico.
 * @return {Object|null} Objeto del servicio OAuth2 configurado, o null si hay un error crítico.
 */
function getMeliService() {
  Logger.log("--- PASO A: INICIANDO 'getMeliService' ---"); // Log inicial de la función
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log("getMeliService: ERROR CRÍTICO - SpreadsheetApp.getActiveSpreadsheet() devolvió null.");
    // No se puede mostrar UI si el contexto del spreadsheet no está disponible.
    throw new Error("Contexto del Spreadsheet no disponible en getMeliService.");
  }
  Logger.log("PASO B: getActiveSpreadsheet() OK. Nombre Hoja Config Esperado: " + CONFIG_SHEET_NAME); // CONFIG_SHEET_NAME de Constantes.gs

  const hoja = ss.getSheetByName(CONFIG_SHEET_NAME);
  
  if (!hoja) {
    Logger.log(`PASO C: ¡ERROR CRÍTICO! No se encontró la hoja de configuración llamada "${CONFIG_SHEET_NAME}".`);
    try {
      SpreadsheetApp.getUi().alert("Error de Configuración Muy Crítico", `La hoja de configuración esencial llamada "${CONFIG_SHEET_NAME}" NO EXISTE. El script no puede funcionar. Por favor, créala y configúrala según la documentación (celdas B1 a B9 para configuración y tokens).`, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (uiError) {
      Logger.log("Error al intentar mostrar alerta de hoja no encontrada: " + uiError.toString());
    }
    throw new Error(`Hoja "${CONFIG_SHEET_NAME}" no encontrada. Proceso detenido en getMeliService.`);
  }
  Logger.log(`PASO D: Hoja "${CONFIG_SHEET_NAME}" encontrada correctamente.`);

  // Definición de las celdas esperadas en la hoja 'Config'
  const cfg = {
    AUTH_URL_CELL: 'B1',      // Celda para URL de Autorización
    TOKEN_URL_CELL: 'B2',     // Celda para URL de Token
    CLIENT_ID_CELL: 'B3',     // Celda para Client ID
    CLIENT_SECRET_CELL: 'B4', // Celda para Client Secret
    REDIRECT_URI_CELL: 'B5',  // Celda para Redirect URI
    SCOPES_CELL: 'B6',        // Celda para Scopes
    ACCESS_TOKEN_CELL: 'B7',  // Celda para Access Token (guardado por el script)
    REFRESH_TOKEN_CELL: 'B8', // Celda para Refresh Token (guardado por el script)
    TOKEN_EXPIRES_CELL: 'B9'  // Celda para Timestamp de expiración (guardado por el script)
  };
  Logger.log("PASO E: Definición de celdas de configuración (cfg) completada.");

  // Leer valores de la hoja de configuración
  let authUrlFromSheet, tokenUrlFromSheet, clientIdFromSheet, clientSecretFromSheet, redirectUriFromSheet, scopesFromSheet;
  try {
    authUrlFromSheet = hoja.getRange(cfg.AUTH_URL_CELL).getValue();
    tokenUrlFromSheet = hoja.getRange(cfg.TOKEN_URL_CELL).getValue();
    clientIdFromSheet = hoja.getRange(cfg.CLIENT_ID_CELL).getValue();
    clientSecretFromSheet = hoja.getRange(cfg.CLIENT_SECRET_CELL).getValue();
    redirectUriFromSheet = hoja.getRange(cfg.REDIRECT_URI_CELL).getValue();
    scopesFromSheet = hoja.getRange(cfg.SCOPES_CELL).getValue();
    Logger.log("PASO F: Lectura de valores de configuración de la hoja 'Config' completada.");
  } catch (readError) {
    Logger.log(`PASO F: ¡ERROR CRÍTICO! Al leer valores de la hoja 'Config': ${readError.toString()}`);
    SpreadsheetApp.getUi().alert("Error de Lectura en 'Config'", `No se pudieron leer los valores de configuración de la hoja "${CONFIG_SHEET_NAME}". Verifique que la hoja no esté protegida de forma inesperada o dañada. Error: ${readError.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw new Error(`Error leyendo de la hoja Config: ${readError.message}`);
  }

  // Logging detallado de los valores leídos
  Logger.log(`DEBUG getMeliService - Auth URL (de ${cfg.AUTH_URL_CELL}): "${authUrlFromSheet}" (Tipo: ${typeof authUrlFromSheet})`);
  Logger.log(`DEBUG getMeliService - Token URL (de ${cfg.TOKEN_URL_CELL}): "${tokenUrlFromSheet}" (Tipo: ${typeof tokenUrlFromSheet})`);
  Logger.log(`DEBUG getMeliService - Client ID (de ${cfg.CLIENT_ID_CELL}): "${clientIdFromSheet}" (Tipo: ${typeof clientIdFromSheet})`);
  Logger.log(`DEBUG getMeliService - Client Secret (de ${cfg.CLIENT_SECRET_CELL}): "${clientSecretFromSheet ? 'Presente (longitud: ' + String(clientSecretFromSheet).length + ')' : 'AUSENTE o Vacío'}" (Tipo: ${typeof clientSecretFromSheet})`);
  Logger.log(`DEBUG getMeliService - Redirect URI (de ${cfg.REDIRECT_URI_CELL}): "${redirectUriFromSheet}" (Tipo: ${typeof redirectUriFromSheet})`);
  Logger.log(`DEBUG getMeliService - Scopes (de ${cfg.SCOPES_CELL}): "${scopesFromSheet}" (Tipo: ${typeof scopesFromSheet})`);

  const serviceConfig = {
    AUTH_URL: authUrlFromSheet || 'https://auth.mercadolibre.com.ar/authorization',
    TOKEN_URL: tokenUrlFromSheet || 'https://api.mercadolibre.com/oauth/token',
    CLIENT_ID: clientIdFromSheet,
    CLIENT_SECRET: clientSecretFromSheet,
    REDIRECT_URI: redirectUriFromSheet,
    SCOPES: scopesFromSheet || 'read write offline_access'
  };
  Logger.log("PASO G: Objeto serviceConfig creado con valores de la hoja (o defaults).");
  Logger.log(`DEBUG getMeliService - serviceConfig.CLIENT_ID: "${serviceConfig.CLIENT_ID}"`);
  Logger.log(`DEBUG getMeliService - serviceConfig.CLIENT_SECRET: "${serviceConfig.CLIENT_SECRET ? 'Presente' : 'AUSENTE'}"`);
  Logger.log(`DEBUG getMeliService - serviceConfig.REDIRECT_URI: "${serviceConfig.REDIRECT_URI}"`);


  if (!serviceConfig.CLIENT_ID || !serviceConfig.CLIENT_SECRET || !serviceConfig.REDIRECT_URI) {
    Logger.log('PASO H: ¡ERROR! Faltan CLIENT_ID, CLIENT_SECRET o REDIRECT_URI en serviceConfig.');
    const missingFields = [];
    if (!serviceConfig.CLIENT_ID) missingFields.push(`Client ID (celda ${cfg.CLIENT_ID_CELL})`);
    if (!serviceConfig.CLIENT_SECRET) missingFields.push(`Client Secret (celda ${cfg.CLIENT_SECRET_CELL})`);
    if (!serviceConfig.REDIRECT_URI) missingFields.push(`Redirect URI (celda ${cfg.REDIRECT_URI_CELL})`);
    
    const alertMessage = `Faltan credenciales críticas en la hoja "${CONFIG_SHEET_NAME}": ${missingFields.join(', ')}. Por favor, verifica que los valores estén en las celdas correctas y no estén vacíos.`;
    SpreadsheetApp.getUi().alert('Error de Configuración de Credenciales', alertMessage, SpreadsheetApp.getUi().ButtonSet.OK);
    throw new Error(`Faltan credenciales en la hoja "Config": ${missingFields.join(', ')}.`);
  }
  Logger.log("PASO I: Verificación de credenciales CLIENT_ID, CLIENT_SECRET, REDIRECT_URI completada (están presentes).");

  if (!String(serviceConfig.REDIRECT_URI).includes('/exec')) { // Convertir a String por si acaso es null o undefined y evitar error en .includes
    Logger.log(`PASO J: ¡ERROR! redirect_uri ("${serviceConfig.REDIRECT_URI}") en "Config" es inválido. Debe ser la URL /exec del script desplegado.`);
    SpreadsheetApp.getUi().alert('Error de Configuración de Redirect URI', `El Redirect URI en la hoja "${CONFIG_SHEET_NAME}" (celda ${cfg.REDIRECT_URI_CELL}) es inválido. Debe ser la URL pública de la aplicación web implementada (terminada en /exec). Valor actual: "${serviceConfig.REDIRECT_URI}"`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw new Error('redirect_uri inválido. Debe ser la URL pública /exec.');
  }
  Logger.log("PASO K: Verificación de formato de REDIRECT_URI completada (contiene '/exec').");


  // --- Funciones internas para el manejo de tokens (anidadas para encapsulamiento) ---
  function buildQueryString(params) {
    return Object.keys(params).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&');
  }

  function guardarToken(tokenData) {
    Logger.log("guardarToken: Intentando guardar tokens...");
    try {
      hoja.getRange(cfg.ACCESS_TOKEN_CELL).setValue(tokenData.access_token);
      hoja.getRange(cfg.REFRESH_TOKEN_CELL).setValue(tokenData.refresh_token || '');
      const expiresAt = Date.now() + (tokenData.expires_in * 1000) - (5 * 60 * 1000); // Margen de 5 min
      hoja.getRange(cfg.TOKEN_EXPIRES_CELL).setValue(expiresAt);
      Logger.log('✅ Token guardado en hoja Config. Access Token (primeros 10): ' + String(tokenData.access_token).substring(0,10) + '..., Expira aprox: ' + new Date(expiresAt).toLocaleString());
    } catch (e) {
      Logger.log("Error CRÍTICO guardando token en hoja Config: " + e.toString());
      SpreadsheetApp.getUi().alert("Error Guardando Token", "No se pudo guardar el token en la hoja 'Config'. Verifica permisos y que la hoja no esté protegida. Error: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
      // No lanzar error aquí para permitir que el flujo continúe si el token ya está en memoria,
      // pero el usuario está advertido.
    }
  }

  function obtenerTokenAlmacenado() { return hoja.getRange(cfg.ACCESS_TOKEN_CELL).getValue() || null; }
  function obtenerRefreshTokenAlmacenado() { return hoja.getRange(cfg.REFRESH_TOKEN_CELL).getValue() || null; }
  function tokenExpirado() {
    const expira = Number(hoja.getRange(cfg.TOKEN_EXPIRES_CELL).getValue() || 0);
    return !expira || Date.now() >= expira;
  }
  function borrarTokensLocales() {
    Logger.log("borrarTokensLocales: Intentando borrar tokens de la hoja Config...");
    try {
      hoja.getRange(cfg.ACCESS_TOKEN_CELL).clearContent();
      hoja.getRange(cfg.REFRESH_TOKEN_CELL).clearContent();
      hoja.getRange(cfg.TOKEN_EXPIRES_CELL).clearContent();
      Logger.log('Tokens locales borrados de la hoja "Config".');
    } catch (e) {
      Logger.log("Error borrando tokens de la hoja 'Config': " + e.toString());
    }
  }

  function refrescarToken() {
    Logger.log("refrescarToken: Iniciando intento de refresco de token...");
    const refreshToken = obtenerRefreshTokenAlmacenado();
    if (!refreshToken) {
      Logger.log('refrescarToken: No hay refresh token almacenado para intentar el refresco.');
      return false;
    }
    Logger.log('refrescarToken: Refresh token encontrado. Procediendo a llamar a la API de token...');
    const payload = {
      grant_type: 'refresh_token', client_id: serviceConfig.CLIENT_ID,
      client_secret: serviceConfig.CLIENT_SECRET, refresh_token: refreshToken
    };
    const options = {
      method: 'post', contentType: 'application/x-www-form-urlencoded',
      payload: buildQueryString(payload), muteHttpExceptions: true
    };
    let responseTextDebug;
    try {
      const response = UrlFetchApp.fetch(serviceConfig.TOKEN_URL, options);
      const responseCode = response.getResponseCode();
      responseTextDebug = response.getContentText();
      if (responseCode !== 200) {
        Logger.log(`refrescarToken: Error (${responseCode}) al refrescar token. Respuesta: ${responseTextDebug.substring(0, 500)}`);
        if (responseCode === 400 || responseCode === 401) {
          Logger.log('refrescarToken: Refresh token inválido o revocado. Se borrarán los tokens locales.');
          borrarTokensLocales();
        }
        return false;
      }
      const tokenData = JSON.parse(responseTextDebug);
      guardarToken(tokenData);
      Logger.log('✅ refrescarToken: Token refrescado y guardado exitosamente.');
      return true;
    } catch (e) {
      Logger.log(`refrescarToken: Excepción durante el refresco: ${e.message}. Respuesta API (si hubo): ${responseTextDebug || 'N/A (sin respuesta de texto)'}`);
      return false;
    }
  }

  function obtenerTokenValido() {
    Logger.log("obtenerTokenValido: Verificando token actual...");
    const token = obtenerTokenAlmacenado();
    const expirado = tokenExpirado();
    Logger.log(`obtenerTokenValido: Token actual: ${token ? 'Presente' : 'Ausente'}. Expirado: ${expirado}`);
    if (!token || expirado) {
      Logger.log(`obtenerTokenValido: Token necesita refresco (Ausente: ${!token}, Expirado: ${expirado}). Intentando refrescar...`);
      if (!refrescarToken()) {
        Logger.log('obtenerTokenValido: FALLO CRÍTICO al obtener token válido. El refresco falló.');
        return null;
      }
      Logger.log("obtenerTokenValido: Refresco exitoso, obteniendo token nuevamente.");
      return obtenerTokenAlmacenado();
    }
    Logger.log("obtenerTokenValido: Token actual es válido y no está expirado.");
    return token;
  }
  // --- Fin de funciones internas para manejo de tokens ---

  Logger.log("PASO L: Funciones internas de manejo de token definidas.");
  const service = {
    getAuthUrl() {
      Logger.log("service.getAuthUrl: Construyendo URL de autorización...");
      const params = {
        response_type: 'code', client_id: serviceConfig.CLIENT_ID,
        redirect_uri: serviceConfig.REDIRECT_URI, scope: serviceConfig.SCOPES
      };
      const baseUrl = serviceConfig.AUTH_URL;
      const fullAuthUrl = `${baseUrl}?${buildQueryString(params)}`;
      Logger.log("service.getAuthUrl: URL construida: " + fullAuthUrl);
      return fullAuthUrl;
    },
    exchange(code) {
      Logger.log("service.exchange: Intercambiando código de autorización por token...");
      const params = {
        grant_type: 'authorization_code', client_id: serviceConfig.CLIENT_ID,
        client_secret: serviceConfig.CLIENT_SECRET, code: code, redirect_uri: serviceConfig.REDIRECT_URI
      };
      const options = {
        method: 'post', contentType: 'application/x-www-form-urlencoded',
        payload: buildQueryString(params), muteHttpExceptions: true
      };
      const response = UrlFetchApp.fetch(serviceConfig.TOKEN_URL, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      Logger.log(`service.exchange: Respuesta del intercambio de código: ${responseCode}, Cuerpo (primeros 500 chars): ${responseText.substring(0, 500)}`);
      if (responseCode !== 200) {
        Logger.log(`service.exchange: Error en el intercambio. Código: ${responseCode}`);
        return { success: false, error: `Error ${responseCode}: ${responseText}` };
      }
      try {
        const tokenData = JSON.parse(responseText);
        guardarToken(tokenData); // Guardar el nuevo set de tokens
        Logger.log("service.exchange: Intercambio exitoso y tokens guardados.");
        return { success: true, access_token: tokenData.access_token };
      } catch (e) {
        Logger.log(`service.exchange: Error parseando respuesta del token: ${e.message}. Respuesta: ${responseText}`);
        return { success: false, error: 'Error procesando la respuesta del token: ' + responseText };
      }
    },
    getToken() {
      Logger.log("service.getToken: Solicitando token válido...");
      const validToken = obtenerTokenValido();
      Logger.log("service.getToken: Token obtenido de obtenerTokenValido(): " + (validToken ? "Presente" : "Ausente/Nulo"));
      return validToken;
    },
    revoke() {
      Logger.log("service.revoke: Solicitando borrado de tokens locales...");
      borrarTokensLocales();
      // Idealmente, aquí también se haría una llamada a la API de Meli para invalidar el token en su servidor,
      // pero Meli no tiene un endpoint estándar de revocación de token OAuth2 fácilmente accesible para todos los tipos de apps.
      // Borrarlo localmente es el paso principal para que el script deje de tener acceso.
      Logger.log("service.revoke: Tokens locales borrados.");
      return true;
    }
  };
  Logger.log("--- PASO Z: 'getMeliService' FINALIZANDO CORRECTAMENTE. Devolviendo objeto service. ---");
  return service;
}










/**
 * Inicia el proceso de autorización OAuth2.
 * Muestra un diálogo modal con el enlace para autorizar.
 */
// En Auth.gs
function iniciarAutorizacion() {
  Logger.log("--- PASO 1: INICIANDO 'iniciarAutorizacion' ---"); // Log más visible
  try {
    Logger.log("PASO 2: Intentando llamar a getMeliService()...");
    const service = getMeliService();
    Logger.log("PASO 3: getMeliService() ejecutado. ¿Servicio obtenido?: " + (service ? "Sí" : "No, es null o undefined"));

    if (!service) {
        Logger.log("ERROR CRÍTICO en iniciarAutorizacion: getMeliService() no devolvió un objeto de servicio válido.");
        SpreadsheetApp.getUi().alert("Error de Servicio", "No se pudo inicializar el servicio de autenticación (getMeliService devolvió nulo). Revise los logs.", SpreadsheetApp.getUi().ButtonSet.OK);
        return; // Detener si el servicio no se pudo crear
    }

    Logger.log("PASO 4: Intentando llamar a service.getAuthUrl()...");
    const authUrl = service.getAuthUrl();
    Logger.log("PASO 5: service.getAuthUrl() ejecutado. URL: " + authUrl);

    if (!authUrl || authUrl.trim() === "") {
        Logger.log("ERROR CRÍTICO en iniciarAutorizacion: service.getAuthUrl() no devolvió una URL válida.");
        SpreadsheetApp.getUi().alert("Error de URL", "No se pudo generar la URL de autorización. Verifique la configuración del Client ID y Redirect URI en la hoja 'Config' y los logs.", SpreadsheetApp.getUi().ButtonSet.OK);
        return; // Detener si la URL no es válida
    }

    const htmlContent = // ... (tu código HTML para el diálogo, asegúrate que esté aquí)
      `<div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
         <h3>Autorizar Acceso a Mercado Libre</h3>
         <p>Se abrirá una nueva ventana para autorizar el acceso a tus datos.</p>
         <p>Si la ventana no se abre, asegúrate de que tu navegador no esté bloqueando pop-ups.</p>
         <a href="${authUrl}" target="_blank" onclick="google.script.host.close()" style="display: inline-block; margin-top: 15px; padding: 12px 20px; background-color: #3483FA; color: white; text-decoration: none; font-size: 16px; border-radius: 6px; box-shadow: 0 2px 4px 0 rgba(0,0,0,0.2);">
           <b>Hacer clic aquí para Autorizar</b>
         </a>
         <p style="margin-top: 20px; font-size: 12px; color: #666;">
           Luego de completar la autorización en la página de Mercado Libre, cierra esa página. El token se guardará automáticamente.
         </p>
       </div>`;
    Logger.log("PASO 6: Creando HtmlOutput para el diálogo...");
    const html = HtmlService.createHtmlOutput(htmlContent)
      .setWidth(500)
      .setHeight(350);
    
    Logger.log("PASO 7: Mostrando ModalDialog...");
    SpreadsheetApp.getUi().showModalDialog(html, 'Paso 1: Conectar con Mercado Libre');
    Logger.log("--- PASO 8: 'iniciarAutorizacion' COMPLETADO (ModalDialog debería estar visible) ---");

  } catch (e) {
    Logger.log("--- ERROR CATASTRÓFICO en 'iniciarAutorizacion' (bloque catch) ---");
    Logger.log("Mensaje de Error: " + e.toString());
    Logger.log("Stack del Error: " + e.stack);
    // Mostrar un error más genérico si la UI falla, pero el log es clave
    try {
        SpreadsheetApp.getUi().alert("Error Crítico en Autorización", "Ocurrió un error inesperado: " + e.message + ". Por favor, revisa los logs del script (Ejecuciones) para más detalles.", SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (uiError) {
        Logger.log("Error incluso al intentar mostrar la alerta de error de UI: " + uiError.toString());
    }
  }
}





/**
 * Verifica el estado de la autenticación con MercadoLibre.
 * Intenta obtener el User ID como prueba.
 * @return {Object} Objeto con el estado de autenticación y mensajes.
 */
function verificarAutenticacion() {
  Logger.log("Verificando autenticación...");
  try {
    const service = getMeliService(); // Asegura que la configuración base esté bien
    const token = service.getToken();

    if (token) {
      Logger.log("Token obtenido. Probando llamada a API para obtener User ID...");
      // Probar una llamada simple a la API para confirmar validez del token
      try {
        const userId = getUserId(token); // Asume que getUserId está en ApiMeli_Core.gs
        Logger.log(`Prueba de API exitosa. User ID: ${userId}`);
        return {
          autenticado: true,
          userId: userId,
          mensaje: "Autenticación correcta. User ID: " + userId
        };
      } catch (e) {
        Logger.log(`Error al probar el token con getUserId: ${e.message}`);
        return {
          autenticado: false,
          error: e.message,
          mensaje: "Se obtuvo un token, pero falló la prueba de API (getUserId): " + e.message + ". El token podría estar expirado o ser inválido."
        };
      }
    } else {
      Logger.log("No se pudo obtener un token válido (getToken devolvió null).");
      return {
        autenticado: false,
        mensaje: "No hay token válido. Necesitas autorizar la aplicación."
      };
    }
  } catch (e) {
    Logger.log(`Error durante la verificación de autenticación (posiblemente en getMeliService): ${e.message}`);
    return {
      autenticado: false,
      error: e.message,
      mensaje: "Error en la configuración o servicio de autenticación: " + e.message
    };
  }
}

/**
 * Genera un diagnóstico de la URL de redirección y otros parámetros de configuración.
 * Escribe los resultados en la hoja DIAG_URL_SHEET_NAME.
 */
function diagnosticoURLRedirect() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logsSheet = ss.getSheetByName(DIAG_URL_SHEET_NAME);
  if (!logsSheet) {
    logsSheet = ss.insertSheet(DIAG_URL_SHEET_NAME);
  } else {
    logsSheet.clear();
  }
  logsSheet.appendRow(['Parámetro', 'Valor', 'Fecha: ' + new Date().toLocaleString()]);
  logsSheet.appendRow(['--- Script Info ---', '---']);
  try {
    logsSheet.appendRow(['URL Web App (Deployment URL for /exec)', ScriptApp.getService().getUrl()]);
  } catch (e) {
    logsSheet.appendRow(['URL Web App', 'Error: ' + e.message + ' (Probablemente no hay deployment activo o es un error de permisos)']);
  }
  logsSheet.appendRow(['ID Script', ScriptApp.getScriptId()]);
  logsSheet.appendRow(['Usuario Efectivo (quien ejecuta el trigger/función)', Session.getEffectiveUser().getEmail()]);
  logsSheet.appendRow(['Usuario Activo (quien tiene la hoja abierta)', Session.getActiveUser().getEmail()]);

  logsSheet.appendRow(['--- Hoja "Config" ---', '---']);
  const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (configSheet) {
    const cfgCells = { // Usando las celdas definidas en getMeliService
      AUTH_URL: 'B1', TOKEN_URL: 'B2', CLIENT_ID: 'B3', CLIENT_SECRET: 'B4',
      REDIRECT_URI: 'B5', SCOPES: 'B6', ACCESS_TOKEN: 'B7', REFRESH_TOKEN: 'B8', TOKEN_EXPIRES: 'B9'
    };
    logsSheet.appendRow([`Auth URL (${cfgCells.AUTH_URL})`, configSheet.getRange(cfgCells.AUTH_URL).getValue()]);
    logsSheet.appendRow([`Token URL (${cfgCells.TOKEN_URL})`, configSheet.getRange(cfgCells.TOKEN_URL).getValue()]);
    logsSheet.appendRow([`Client ID (${cfgCells.CLIENT_ID})`, configSheet.getRange(cfgCells.CLIENT_ID).getValue()]);
    logsSheet.appendRow([`Client Secret (${cfgCells.CLIENT_SECRET})`, configSheet.getRange(cfgCells.CLIENT_SECRET).getValue() ? 'OK (Presente)' : 'NO ENCONTRADO']);
    logsSheet.appendRow([`Redirect URI (${cfgCells.REDIRECT_URI})`, configSheet.getRange(cfgCells.REDIRECT_URI).getValue()]);
    logsSheet.appendRow([`Scopes (${cfgCells.SCOPES})`, configSheet.getRange(cfgCells.SCOPES).getValue()]);
    logsSheet.appendRow([`Access Token (${cfgCells.ACCESS_TOKEN})`, configSheet.getRange(cfgCells.ACCESS_TOKEN).getValue() ? 'Sí (Presente)' : 'No']);
    logsSheet.appendRow([`Refresh Token (${cfgCells.REFRESH_TOKEN})`, configSheet.getRange(cfgCells.REFRESH_TOKEN).getValue() ? 'Sí (Presente)' : 'No']);
    const expiresTs = configSheet.getRange(cfgCells.TOKEN_EXPIRES).getValue();
    const expiresDate = expiresTs && !isNaN(expiresTs) ? new Date(Number(expiresTs)).toLocaleString() : 'N/A o Inválido';
    logsSheet.appendRow([`Token Expira (${cfgCells.TOKEN_EXPIRES})`, expiresDate]);

    // Verificación específica del Redirect URI
    const redirectUriConfig = configSheet.getRange(cfgCells.REDIRECT_URI).getValue();
    let scriptUrl = "";
    try { scriptUrl = ScriptApp.getService().getUrl(); } catch (err) {/* ignore */ }

    if (redirectUriConfig) {
      if (!redirectUriConfig.includes('/exec')) {
        logsSheet.appendRow(['VERIFICACIÓN Redirect URI', 'FALLIDA: No contiene "/exec".']);
      } else if (scriptUrl && redirectUriConfig !== scriptUrl) {
        logsSheet.appendRow(['VERIFICACIÓN Redirect URI', `ADVERTENCIA: El Redirect URI en Config ("${redirectUriConfig}") es diferente a la URL del script desplegado ("${scriptUrl}"). Deben coincidir EXACTAMENTE.`]);
      } else if (!scriptUrl) {
        logsSheet.appendRow(['VERIFICACIÓN Redirect URI', 'ADVERTENCIA: No se pudo obtener la URL del script desplegado. Asegúrate de que el script esté implementado como Aplicación Web.']);
      }
      else {
        logsSheet.appendRow(['VERIFICACIÓN Redirect URI', 'OK: Coincide con la URL del script desplegado (o no se pudo verificar la URL del script).']);
      }
    } else {
      logsSheet.appendRow(['VERIFICACIÓN Redirect URI', 'FALLIDA: Redirect URI no está configurado en la hoja Config.']);
    }

  } else {
    logsSheet.appendRow([`Hoja "${CONFIG_SHEET_NAME}"`, `No encontrada!`]);
  }
  logsSheet.autoResizeColumns(1, 2);
  SpreadsheetApp.getUi().alert('Diagnóstico Completado', `Se ha generado un informe en la hoja "${DIAG_URL_SHEET_NAME}".`, SpreadsheetApp.getUi().ButtonSet.OK);
}


// En Auth.gs

/**
 * Función de callback para el flujo OAuth2.
 * Se ejecuta cuando Mercado Libre redirige después de la autorización.
 * @param {Object} e - Evento de doGet con parámetros de callback.
 * @return {HtmlService.HtmlOutput} Salida HTML para el usuario.
 */
function authCallback(e) { // <<<--- VERIFICA ESTE NOMBRE Y SINTAXIS
  Logger.log("--- authCallback: INICIO --- Parámetros (e.parameter): " + JSON.stringify(e.parameter));
  try {
    Logger.log("authCallback: Llamando a getMeliService()...");
    const service = getMeliService();
    Logger.log("authCallback: getMeliService() OK. Llamando a service.exchange()...");

    if (!e || !e.parameter || !e.parameter.code) {
        const errorMsgNoCode = "authCallback: ERROR - El parámetro 'code' no fue recibido en el callback.";
        Logger.log(errorMsgNoCode);
        return HtmlService.createHtmlOutput(
            `<div style="font-family: Arial, sans-serif; padding: 20px; text-align: center; color: #F44336;">
             <h3>Error de Autorización</h3>
             <p>No se recibió el código de autorización necesario desde Mercado Libre.</p>
             <p>Por favor, intente el proceso de autorización nuevamente.</p>
             </div>`
        );
    }

    const exchangeResult = service.exchange(e.parameter.code);
    Logger.log("authCallback: service.exchange() ejecutado. Resultado: " + JSON.stringify(exchangeResult));

    if (exchangeResult.success) {
      Logger.log("authCallback: Intercambio de código EXITOSO. Access token (parcial): " + (exchangeResult.access_token ? String(exchangeResult.access_token).substring(0,15) + "..." : "N/A"));
      return HtmlService.createHtmlOutput(
        '<div style="font-family: Arial, sans-serif; padding: 20px; text-align: center; color: #4CAF50;">' +
        '<h3>¡Autorización Exitosa!</h3>' +
        '<p>El acceso a Mercado Libre ha sido autorizado correctamente.</p>' +
        '<p>Los tokens han sido guardados en la hoja \'Config\'. Puedes cerrar esta ventana y volver a la hoja de cálculo.</p>' +
        '<script>setTimeout(function(){ try { window.close(); } catch(e){} try { google.script.host.close(); } catch(e){} }, 4000);</script>' +
        '</div>'
      );
    } else {
      const errorDetail = exchangeResult.error ? JSON.stringify(exchangeResult.error) : "Error desconocido durante el intercambio de código.";
      Logger.log('authCallback: ERROR en el intercambio de código: ' + errorDetail);
      return HtmlService.createHtmlOutput(
        `<div style="font-family: Arial, sans-serif; padding: 20px; text-align: center; color: #F44336;">
         <h3>Error de Autorización</h3>
         <p>Hubo un problema al intentar obtener el token de acceso desde Mercado Libre:</p>
         <p style="font-family: monospace; background-color: #f0f0f0; padding: 10px; border-radius: 4px; word-break: break-all;">${errorDetail}</p>
         <p>Por favor, intenta autorizar nuevamente. Si el problema persiste, verifica la configuración de Redirect URI y las credenciales en tu aplicación de Mercado Libre y en la hoja Config.</p>
         </div>`
      );
    }
  } catch (err) {
    Logger.log('--- authCallback: ERROR CATCH (error crítico dentro de authCallback) ---');
    Logger.log('Error crítico en authCallback: ' + err.toString());
    Logger.log('Stack de error en authCallback: ' + err.stack);
    return HtmlService.createHtmlOutput(
        `<div style="font-family: Arial, sans-serif; padding: 20px; text-align: center; color: #F44336;">
         <h3>Error Crítico en el Callback de Autorización</h3>
         <p>Ocurrió un error inesperado durante el proceso de autorización:</p>
         <p style="font-family: monospace; background-color: #f0f0f0; padding: 10px; border-radius: 4px; word-break: break-all;">${err.toString()}</p>
         <p>Revisa los logs del script para más detalles.</p>
         </div>`
    );
  }
}