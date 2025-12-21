# **Memoria Técnica: Sistema de Gestión Mercado Libre**

## **1\. Visión General y Propósito**

Propósito: Esta aplicación es una solución ERP/OMS (Order Management System) ligera y personalizada, construida sobre el ecosistema de Google (Apps Script y Sheets).

Objetivo: Centralizar, automatizar y optimizar la operación de una cuenta de ventas en Mercado Libre, superando las limitaciones del panel nativo de ML en cuanto a análisis masivo, logística predictiva y gestión de depósitos externos.

---

## **2\. Arquitectura del Sistema**

La aplicación sigue una arquitectura **Serverless** basada en eventos, utilizando el patrón **MVC (Modelo-Vista-Controlador)** adaptado a Google Apps Script.

* **Frontend (Vista):** HTML5, CSS3 y Vanilla JavaScript. Se sirve como una *Web App* mediante HtmlService. Todo reside en un archivo principal (Dashboard.html) con inyección de CSS y JS, más plantillas HTML para reportes.  
* **Backend (Controlador):** Google Apps Script (.gs). Maneja la lógica de negocio, cronogramas (triggers) y la comunicación HTTP.  
* **Base de Datos (Modelo):** Google Sheets. Actúa como base de datos relacional y log de auditoría.  
* **Almacenamiento de Archivos:** Google Drive (para guardar PDFs generados).

---

## **3\. Estructura del Backend (Archivos .gs)**

El código del servidor está modularizado para facilitar la escalabilidad:

1. **Main.gs:** Punto de entrada (doGet). Maneja la carga inicial y el menú en la hoja de cálculo (onOpen).  
2. **Auth.gs:** **Crítico.** Maneja el flujo OAuth2.  
   * *Flujo:* Verifica si hay un Access Token válido en las Propiedades del Script. Si no, usa el Refresh Token para solicitar uno nuevo a la API de MeLi (POST /oauth/token).  
3. **ApiMeli\_Core.gs:** Contiene la función makeApiCall(). Es un wrapper que envuelve UrlFetchApp, maneja cabeceras, reintentos por errores de red y parseo de JSON.  
4. **WebApp\_Providers.gs:** La API interna. Contiene todas las funciones expuestas al cliente (google.script.run) que preparan los datos para la interfaz.  
5. **Logistica\_Full.gs:** Motor matemático. Calcula la proyección de demanda basada en variables ($Tt$, $Fe$, $Z$).  
6. **TareasSecuenciales.gs:** Sistema de colas para actualizaciones masivas. Evita el *TimeOut* de 6 minutos de Google ejecutando la sincronización en "pasos" (lotes).  
7. **Gestion\_3PL.gs:** Lógica específica para el depósito externo (generación de PDFs, registro de envíos).

---

## **4\. Módulos y Funcionalidades Detalladas**

### **A. Dashboard (KPIs)**

* **Funcionamiento:** Consume datos agregados de ventas, publicidad y visitas.  
* **Visualización:** Usa *Google Charts* (ColumnChart apilado) para cruzar Ventas Netas vs. Inversión en Publicidad.  
* **Lógica:** Calcula tendencias comparando períodos (Mes actual vs. Mes anterior).

### **B. Calculadora de Envíos (Full)**

* **Objetivo:** Evitar quiebres de stock y costos por almacenamiento prolongado.  
* **Inputs:** Tiempo de Tránsito ($Tt$), Frecuencia de Envío ($Fe$), Nivel de Servicio ($Z$ \- Desviación estándar para cubrir demanda al 95-99%).  
* **Output:** Sugerencia de envío por SKU.  
* **Interacción:** Permite editar manualmente la cantidad a enviar y genera una orden de traspaso interna.

### **C. Gestión de Precios**

* **Carga:** Trae costos, comisiones e impuestos de la Hoja Maestra.  
* **Lógica Cliente (JS):**  
  * **Calculadora Masiva:** Aplica cambios por % o monto fijo.  
  * **Redondeo Psicológico:** Implementa una función que fuerza la terminación del precio a **3, 5, 7 o 9** (ej: $1541 \\to 1543$).  
  * **Previsualización:** Pinta celdas en amarillo/rojo antes de guardar.  
* **Guardado:** Envía solo los *deltas* (cambios) al servidor. El servidor itera y hace PUT /items/{id} a la API. Si falla, devuelve el error al cliente sin recargar la tabla para permitir corrección.

### **D. Seguimiento de Stock**

* **Visión:** Unifica el stock de *Fulfillment* (API) y *Depósito Local* (Manual/API).  
* **Switches:** Permite activar/desactivar **Mercado Envíos Flex** y pausar/activar publicaciones directamente desde la tabla.

### **E. Gestión Depósito 3PL (Módulo Avanzado)**

Este módulo gestiona la logística con un operador logístico externo (Blue Mail).

1. **Herramienta 1: Reconciliación:**  
   * Carga un Excel (.xlsx) en el navegador usando SheetJS.  
   * Cruza los SKUs del Excel contra la API de MeLi (/user-products/{id}/stock).  
   * Detecta diferencias y "Stocks Fantasma". Permite ajuste masivo (PUT a stock).  
2. **Herramienta 2: Modo Preparación (Packing):**  
   * **Escáner:** Input diseñado para lectores de código de barras. Tiene lógica de "Cooldown" para evitar lecturas dobles y cola de guardado (colaDeGuardado) para no saturar el servidor.  
   * **Estado:** Visualiza el progreso (Pendiente \-\> En Progreso \-\> Completado).  
   * **Documentación (Impresora Virtual):**  
     * Al finalizar, toma los datos y los inyecta en plantillas HTML (Modelo\_Remito y Modelo\_Etiqueta).  
     * Usa HtmlService para renderizar el HTML.  
     * Convierte el HTML a **PDF (Blob)**.  
     * Guarda los PDFs en una carpeta específica de Google Drive.  
     * Devuelve las URLs públicas al usuario.

---

## **5\. Flujo de Datos y Seguridad**

1. **Inicio de Sesión:** El usuario accede a la URL del Web App. El script verifica permisos de ejecución (normalmente configurado como "Ejecutar como yo" y acceso a "Cualquiera con cuenta Google" o restringido al dominio).  
2. **Llamadas API MeLi:**  
   * El script busca MELI\_ACCESS\_TOKEN en PropertiesService.  
   * Si expira (error 401 o validación de tiempo), usa MELI\_REFRESH\_TOKEN para obtener uno nuevo y lo guarda.  
   * Esto es transparente para el usuario final.  
3. **Frontend \<-\> Backend:**  
   * Se usa google.script.run.withSuccessHandler(onSuccess).funcionBackend().  
   * Es asíncrono. El frontend muestra "spinners" (iconos de carga) mientras espera.  
   * **Manejo de Errores:** Se implementó un modal global (mostrarModal) para capturar excepciones del servidor y mostrarlas amigablemente.

---

## **6\. Guía para el Desarrollador (Escalabilidad)**

Si tomas este proyecto para escalarlo, ten en cuenta:

1. **Caché del Lado del Cliente:**  
   * Variables como cachePrecios y cacheEnvios en Dashboard.html son vitales. No las elimines. Evitan llamadas innecesarias al servidor al filtrar o buscar.  
2. **Límites de Google Apps Script:**  
   * Tiempo máximo de ejecución: **6 minutos**.  
   * Para procesos largos (ej. actualizar 5000 precios), **NO** uses un bucle simple. Usa la lógica de TareasSecuenciales.gs (procesar por lotes, guardar el puntero, y disparar un trigger para continuar).  
3. **Plantillas HTML:**  
   * Están separadas (Modelo\_Remito.html). No incrustes HTML complejo en cadenas de texto dentro de los .gs. Usa HtmlService.createTemplateFromFile().  
4. **Base de Datos (Sheets):**  
   * Si el volumen de ventas crece exponencialmente (\>50k filas), Google Sheets se volverá lento.  
   * **Siguiente paso recomendado:** Migrar la hoja Meli\_Ordenes\_Detalle y Historial a **Google BigQuery** o una base SQL externa (Cloud SQL), manteniendo Apps Script como conector.

---

### **Resumen de Funciones Clave (Backend)**

| Función | Archivo | Descripción |
| :---- | :---- | :---- |
| makeApiCall(url, method, payload) | ApiMeli\_Core.gs | Puerta de enlace única a MeLi. Maneja Auth. |
| actualizarPreciosEnLote(items) | WebApp\_Providers.gs | Recibe array, itera, valida y actualiza precios. |
| generarDocumentacion3PL(datos, items) | Gestion\_3PL.gs | Orquestador de PDFs. Crea carpeta Drive y archivos. |
| reconciliarStockConAPI(stockExcel) | WebApp\_Providers.gs | Lógica compleja de cruce de datos masivos. |

### **Resumen de Funciones Clave (Frontend)**

| Función | Descripción |
| :---- | :---- |
| redondearPrecioPsicologico(precio) | Algoritmo matemático para terminación 3, 5, 7, 9\. |
| setupScannerListener() | Maneja eventos de teclado/escáner, bloqueo temporal y cola. |
| handleGuardarPreciosClick() | Gestiona la UX de guardado, manejo de errores parciales y recarga opcional. |

Esta memoria documenta el estado actual del sistema al día de hoy. Es una base sólida y modular lista para operación y mantenimiento.

