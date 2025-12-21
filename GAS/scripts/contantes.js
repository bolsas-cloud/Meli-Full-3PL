// ============================================================================
// --- ARCHIVO: Constantes.gs ---
// ============================================================================
// Descripción: Almacena todas las constantes globales del proyecto.
// ============================================================================

// --- NOMBRES DE HOJAS DE CÁLCULO ---
// Hojas de Datos Crudos (NÚCLEO)
const TARGET_SHEET_NAME = 'Hoja 1';
const ORDERS_DETAIL_SHEET_NAME = 'Meli_Ordenes_Detalle';
const CONFIG_SHEET_NAME = 'Config';
const DAILY_VISITS_SHEET_NAME = 'Meli_Visitas_Diarias';
const ESTADOS_HISTORIAL_SHEET_NAME = 'Meli_Historial_Estados';

// Hojas de Logística (NUEVA FUNCIONALIDAD)
const CONFIG_LOGISTICA_SHEET_NAME = 'Config_Logistica';
const REGISTRO_ENVIOS_SHEET_NAME = 'Registro_Envios_Full'; // <-- ¡CORREGIDO!


// --- PARÁMETROS DE LA API Y EL SCRIPT ---
const MELI_API_BASE_URL = 'https://api.mercadolibre.com';
const BATCH_SIZE_ITEMS_FOR_LOGGING = 20;
const VISIT_TIME_WINDOW_LAST = 90;
const SALES_PERIOD_DAYS = 90;
const ORDERS_LOOKBACK_DAYS = SALES_PERIOD_DAYS + 5;
const VISIT_TIME_WINDOW_UNIT = 'day';
const API_CALL_DELAY = 350;
const ORDERS_PAGE_SIZE = 50;

// --- TIEMPOS DE EXPIRACIÓN DE CACHÉ (en minutos) ---
const CACHE_EXPIRATION_SHORT = 60;
const CACHE_EXPIRATION_MEDIUM = 720;
const CACHE_EXPIRATION_LONG = 1440;