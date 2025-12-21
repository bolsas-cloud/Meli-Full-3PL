## **Sección 1: Dashboard de Ventas**

### **Propósito y Funcionamiento (Guía de Usuario)**

**¿Para qué sirve?** 🧐Esta es tu pantalla principal, el \&quot;tablero de control\&quot; de tu negocio. Su propósito es darte una visión rápida y clara de **cómo están tus ventas** y el rendimiento general de tu cuenta en un período de tiempo que tú elijas. Te ayuda a responder preguntas como: *“¿Estoy vendiendo más o menos que el mes pasado?”* o *“¿Mi inversión en publicidad está dando frutos?”*.

**¿Cómo funciona?** ⏯️

1. **Elige un Período:** Utiliza los **botones de filtro rápido** (Hoy, Ayer, Mes Actual, etc.) o selecciona un rango de fechas personalizado con los calendarios y presiona **\&quot;Aplicar\&quot;**.  
2. **Analiza los Indicadores (KPIs):** Las tarjetas superiores se actualizarán automáticamente. Cada una te muestra un dato clave (Ventas Netas, Órdenes, Visitas, etc.) para el período que elegiste. La flecha y el porcentaje debajo te indican si has **mejorado o empeorado** en comparación con el período anterior equivalente.  
3. **Visualiza la Tendencia:** El **gráfico de barras** te muestra la evolución día a día. Cada barra representa un día, donde el segmento más grande (azul) son tus ventas y el segmento más pequeño (celeste) es tu inversión en publicidad. Esto te permite ver visualmente si los días que más inviertes son los días que más vendes.

### **Detalles Técnicos (Funciones Involucradas)**

* **Frontend (Dashboard.html):**  
  * handleFiltroClick()  
  * y actualizarDashboard(): Capturan la selección de fechas del usuario, calculan el período actual y el período de comparación, y orquestan las llamadas al servidor para obtener los datos de ambos.  
  * renderizarDatosDashboard()  
  * : Recibe los datos de los dos períodos (actual y de comparación), actualiza el contenido de las tarjetas de KPIs y calcula el indicador de tendencia (setTrendIndicator).  
  * drawDashboardChart()  
  * : Recibe los datos diarios del período y utiliza la librería **Google Charts** para dibujar el gráfico de barras apiladas.  
  * actualizarFechaUltimoDato()  
  * : Se ejecuta al cargar la página para mostrar los timestamps de la última sincronización.  
* **Backend (WebApp\_Providers.gs):**  
  * obtenerDatosDashboard(rangoFechas)  
  * : Es la función principal de esta sección. Recibe un rango de fechas desde el cliente, lee las hojas Meli\_Ordenes\_Detalle, Meli\_Visitas\_Diarias y Meli\_Costos\_Publicidad, realiza todos los cálculos (suma de ventas, conteo de órdenes, visitas, proyección de publicidad) y devuelve un objeto consolidado con los KPIs y los datos para el gráfico.  
  * obtenerEstadoActualizacion()  
  * : Consulta la \&quot;memoria\&quot; del script (PropertiesService) para obtener las fechas de \&quot;Último Intento\&quot; y \&quot;Último Éxito\&quot; de la sincronización y las devuelve a la interfaz.

## **Sección 2: Calculadora de Envíos a Full**

### **Propósito y Funcionamiento (Guía de Usuario)**

**¿Para qué sirve?** 🧐Esta es tu central de logística proactiva. Su objetivo es eliminar las conjeturas y ayudarte a decidir **qué productos, en qué cantidad y cuándo enviarlos** a las bodegas de Mercado Libre. Evita dos problemas costosos: quedarte sin stock (pérdida de ventas) o enviar demasiado (costos de almacenamiento).

**¿Cómo funciona?** ⏯️

1. **Ajusta tus Parámetros:** En la parte superior, puedes configurar las variables clave de tu operación:  
   * **Tiempo Tránsito (Tt):** ¿Cuántos días tarda tu envío en llegar y ser procesado por Mercado Libre?  
   * **Frecuencia Envío (Fe):** ¿Cada cuántos días planeas hacer un envío?  
   * **Nivel de Servicio (Z):** ¿Qué tan protegido quieres estar contra picos de venta inesperados? (95% es un buen estándar).  
   * **Incremento por Evento (%):** Puedes añadir un aumento de demanda manual si sabes que se viene una campaña que el sistema no detecta.  
2. **Calcula las Sugerencias:** Haz clic en el botón **\&quot;Calcular Sugerencias\&quot;**. Se abrirá una ventana para que elijas la **fecha de colecta** de tu próximo envío.  
3. **¡Inteligencia Automática\!** Al confirmar, el sistema hace dos cosas en segundo plano:  
   * Revisa si tu envío se cruza con una **fecha especial** (como el Día de la Madre) y, si es así, busca en tu configuración el % de incremento y lo aplica automáticamente a los cálculos.  
   * Analiza tus ventas históricas, tu stock actual en Full y los envíos que ya están en camino.  
4. **Analiza la Tabla:** En segundos, aparecerá una tabla con una fila por cada uno de tus productos en Full. Las columnas más importantes son:  
   * **A ENVIAR (Editable):** La cantidad que el sistema te sugiere enviar. ¡Puedes editar este número\!  
   * **Riesgo:** Te alerta si un producto está en nivel CRÍTICO (muy poco stock) o en RIESGO.  
   * **Cobertura:** Te dice cuántos días de venta te quedan con tu stock actual.  
5. **Filtra y Selecciona:** Usa los **botones de filtro** (Crítico, Riesgo) o el **buscador de texto** para encontrar rápidamente los productos que te interesan. Luego, marca con el **checkbox** de la izquierda todos los productos que finalmente vas a incluir en tu envío.  
6. **Registra tu Envío:** Una vez que estés conforme con tu selección, haz clic en **\&quot;Registrar Envío\&quot;**. Esto guardará un registro permanente en la sección \&quot;Envíos Creados\&quot; y generará un **borrador en PDF** que puedes descargar para guiar el empaquetado.

### **Detalles Técnicos (Funciones Involucradas)**

* **Frontend (Dashboard.html):**  
  * handleCalcularClick()  
  * : Orquesta todo el proceso en el cliente. Abre el modal de fecha, recopila todos los parámetros de los inputs (Tt, Fe, Z, incrementoManual, fechaColecta) y los envía a la función principal del servidor.  
  * drawSugerenciasTable(sugerencias)  
  * : Recibe la lista de sugerencias calculadas por el servidor. Utiliza **Google Charts** para dibujar la tabla, creando dinámicamente los campos de input para la columna \&quot;A ENVIAR\&quot; y los checkbox de selección.  
  * filtrarTablaSugerencias()  
  * : Filtra la tabla ya dibujada basándose en los valores de los filtros de riesgo y el buscador de texto, sin necesidad de volver a consultar al servidor.  
  * handleRegistrarEnvioClick()  
  * y handleDescargarBorradorClick(): Recolectan los datos de las filas seleccionadas (SKU, título y la cantidad *editable* del input) y llaman a las funciones correspondientes en el backend.  
* **Backend (Servidor):**  
  * **WebApp\_Providers.gs**  
  * **\-\> actualizarYCalcularSugerencias(parametros):** Es el punto de entrada principal desde el cliente.  
    * **Guarda la configuración:** Actualiza los valores de Tt, Fe y Z en la hoja Config\_Logistica.  
    * **Detecta eventos:** Llama a la API de Fechas Especiales de ML (/special\_dates), la cruza con tu hoja Config\_Eventos y determina si debe aplicar un multiplicador por evento estacional.  
    * **Delega el cálculo:** Llama a la función calcularSugerenciasDeEnvio pasándole todos los parámetros y el multiplicador calculado.  
    * **Devuelve el resultado:** Empaqueta las sugerencias, la notificación del evento (si la hay) y el porcentaje sugerido, y lo devuelve al cliente.  
  * **Logistica\_Full.gs**  
  * **\-\> calcularSugerenciasDeEnvio(parametros, multiplicador): Es el motor de cálculo matemático.**  
    * **Recopila datos:** Llama a funciones auxiliares (procesarVentasHistoricas, obtenerStockFullPorSku, obtenerStockEnTransitoPorSku) para obtener las variables necesarias (V, σ, Sml, etc.).  
    * **Aplica la fórmula:** Itera sobre cada producto y aplica las fórmulas de gestión de inventario, ajustando la velocidad de ventas (V) y el desvío estándar (σ) con el multiplicador de evento.  
    * **Retorna los datos crudos:** Devuelve un array con las sugerencias calculadas.  
  * **WebApp\_Providers.gs**  
  * **\-\> registrarEnvio() y generarPdfBorrador():** Funciones finales que reciben la lista de productos y cantidades del cliente para crear los registros en las hojas Registro\_Envios\_Full y Detalle\_Envios\_Full, y generar el archivo PDF en Google Drive.

## **Sección 3: Gestión y Preparación de Envíos**

### **Propósito y Funcionamiento (Guía de Usuario)**

**¿Para qué sirve?** 🧐Esta sección es tu **centro de control logístico**. Una vez que has decidido qué enviar usando la \&quot;Calculadora\&quot;, aquí es donde gestionas y rastreas cada envío, desde que es un plan hasta que es recibido por Mercado Libre. También es donde accedes a la herramienta estrella: el **\&quot;Modo Preparación\&quot;** para empaquetar tus productos sin errores.

**¿Cómo funciona?** ⏯️

1. **Visualización por Tarjetas:** Cada envío que registras aparece como una **tarjeta individual**. El color del borde te indica su estado de un vistazo: **amarillo** para \&quot;En Preparación\&quot;, **azul** para \&quot;Despachado\&quot; y **verde** para \&quot;Recibido\&quot;. En el centro de cada tarjeta, verás la información más importante: la fecha de creación, la fecha de colecta y el total de bultos.  
2. **Gestión y Actualización:** En la parte inferior de cada tarjeta tienes varios controles para mantener la información al día:  
   * Puedes cambiar el **Estado** del envío a medida que avanza.  
   * Puedes registrar el **ID de Envío ML** que te proporciona Mercado Libre.  
   * Puedes ajustar la **Fecha de Colecta** si cambia.  
   * Puedes añadir **Notas** importantes.  
   * Después de hacer cambios, presiona el botón de **Guardar** (💾) para que queden registrados.  
3. **Editar la Lista de Productos (✏️):** Si un envío todavía está \&quot;En Preparación\&quot;, puedes usar el botón del lápiz para **modificar la lista de productos**: añadir nuevos artículos, quitar otros o cambiar las cantidades. El sistema es inteligente y fusionará tus cambios con cualquier progreso de empaquetado que ya hayas hecho.  
4. **¡A Preparar el Envío\! (📦):** El botón **\&quot;Preparar\&quot;** es la puerta de entrada al modo de escaneo. Al hacer clic, te lleva a una pantalla completa donde:  
   * Verás la lista de productos a empaquetar.  
   * Puedes usar un **lector de código de barras** (o el teclado) para escanear el inventory\_id de cada producto.  
   * La pantalla se actualiza en tiempo real, mostrando cuántas unidades de cada producto has escaneado y marcando las que ya están completas.  
   * Tu progreso **se guarda automáticamente**, por lo que puedes pausar y continuar la tarea en otro momento.  
   * Al finalizar, el sistema verifica si hay discrepancias y te pide confirmación antes de cerrar el envío.  
5. **Otras Acciones:**  
   * **Resetear (🔄):** Si cometiste un error, este botón te permite borrar todo el progreso de escaneo de un envío para empezar de cero.  
   * **Eliminar (🗑️):** Borra permanentemente un envío que ya no necesitas.  
6. **Detalles Técnicos (Funciones Involucradas)**  
   * **Frontend (Dashboard.html):**  
     * cargarVistaDeEnvios()  
     * : Llama a la función del servidor obtenerEnviosRegistrados() para obtener la lista completa de envíos.  
     * displayEnvios(envios)  
     * : Recibe la lista y genera dinámicamente el código HTML para cada tarjeta, incluyendo los inputs, selectores y botones con sus atributos data-id y data-action.  
     * handleAccionDeEnvioClick(e)  
     * : Es el **controlador de eventos principal** de esta sección. Detecta en qué botón se hizo clic (Guardar, Editar, Eliminar, Preparar, Resetear) y llama a la función de JavaScript correspondiente.  
     * abrirModalEdicion(idEnvio)  
     * : Gestiona la ventana emergente para añadir o quitar productos de un envío, llamando a modificarEnvio() en el servidor al guardar.  
     * iniciarModoPreparacion(envio)  
     * : Cambia la vista a la pantalla de preparación y llama a iniciarOReanudarPreparacion() en el servidor para cargar la lista de productos.  
     * setupScannerListener()  
     * y funciones asociadas: Contienen toda la lógica del cliente para el \&quot;Modo Preparación\&quot;, incluyendo la **cola de guardado optimista** y el **cooldown** para evitar sobrecargar el servidor.  
   * **Backend (Servidor):**  
     * **WebApp\_Providers.gs**  
     * **\-\> obtenerEnviosRegistrados():** Lee las hojas Registro\_Envios\_Full y Detalle\_Envios\_Full, une los datos y los enriquece con información de Hoja 1 (títulos e inventory\_id) antes de enviarlos al cliente.  
     * **WebApp\_Providers.gs**  
     * **\-\> actualizarDatosEnvio(), modificarEnvio(), eliminarEnvio(), resetearProgresoDeEnvio():** Son las funciones que reciben las órdenes del cliente para modificar los datos en las hojas de Google Sheets correspondientes. La función modificarEnvio contiene la lógica de \&quot;fusión inteligente\&quot;.  
     * **WebApp\_Providers.gs**  
     * **\-\> iniciarOReanudarPreparacion(idEnvio):** Prepara los datos para el \&quot;Modo Preparación\&quot;. Revisa si ya existe un progreso en la hoja Preparacion\_En\_Curso; si no, lo crea a partir de Detalle\_Envios\_Full.  
     * **WebApp\_Providers.gs**  
     * **\-\> registrarEscaneoDeProducto() y ajustarCantidadEscaneada():** Son el corazón del escaneo en tiempo real. Reciben cada acción de escaneo o clic en \+/- y actualizan la Cantidad\_Escaneada en la hoja Preparacion\_En\_Curso, protegidas por LockService para evitar errores.  
     * **WebApp\_Providers.gs**  
     * **\-\> verificarYFinalizarPreparacion() y confirmarFinalizacionConDiscrepancias():** Orquestan el proceso de finalización, verificando discrepancias y actualizando el estado final del envío.

## **Sección 4: Gestión de Precios y Rentabilidad**

### **Propósito y Funcionamiento (Guía de Usuario)**

**¿Para qué sirve?** 🧐Esta es tu **central de finanzas y estrategia de precios**. Su objetivo es mostrarte con total transparencia la **rentabilidad real** de cada uno de tus productos después de todas las comisiones, costos de envío e impuestos de Mercado Libre. Te permite tomar decisiones informadas sobre tus precios y actualizarlos de forma masiva y segura.

**¿Cómo funciona?** ⏯️

1. **Carga Automática:** Al entrar en esta sección, el sistema consulta en tiempo real a Mercado Libre para traerte los datos más actualizados de precios, costos, promociones y el estado (activo/pausado) de cada publicación.  
2. **Tabla Interactiva:** Toda la información se presenta en una gran tabla. Las columnas más importantes son:  
   * **Título:** Junto al título, un **círculo de color** te indica el estado de la publicación (**verde** para activa, **amarillo** para pausada).  
   * **Precio Lista (Editable):** Esta celda es un campo editable. Puedes hacer clic y **modificar el precio** directamente. Si un producto tiene una promoción activa, este campo se bloqueará, ya que Mercado Libre no permite cambiarlo.  
   * **Columnas de Rentabilidad:** Verás un desglose completo de los costos (Comisión, Cargo Fijo, Costo Envío) y el **Neto Estimado** que recibirías.  
   * **Columnas de Promoción:** Si un producto está en oferta, se activarán las columnas **Promo Activa**, **Precio Promo** y **Neto c/Promo** para que veas el rendimiento con el descuento.  
3. **Modificación en Lote:** En la parte superior, tienes una herramienta para aplicar cambios a varios productos a la vez. Simplemente:  
   * **Selecciona** las filas que quieras con los checkboxes.  
   * Elige si quieres aplicar un cambio por **%** o un monto **$** fijo.  
   * Ingresa el valor y haz clic en **\&quot;Previsualizar\&quot;**. Verás cómo se actualizan los precios en la tabla.  
4. **Guardado Seguro:** Después de editar precios (ya sea manualmente o en lote), ningún cambio es permanente hasta que haces clic en **\&quot;Guardar Cambios en ML\&quot;**. Esto te da la oportunidad de revisar todo antes de confirmarlo.  
5. **Otras Acciones:**  
   * **Resetear:** Si no te gustan los cambios previsualizados, este botón revierte todo a los precios originales.  
   * **Buscador:** Te permite filtrar la tabla por SKU o título para encontrar productos rápidamente.  
6. **Detalles Técnicos (Funciones Involucradas)**  
   * **Frontend (Dashboard.html):**  
     * cargarVistaDePrecios()  
     * : Inicia el proceso llamando a la función principal del servidor, obtenerDesgloseDeCargos().  
     * drawPreciosTable(data)  
     * : Es la función clave de renderizado. Recibe el array de objetos del servidor y utiliza **Google Charts** para construir la tabla. Es responsable de crear los campos de input editables, los indicadores visuales de estado y promoción, y deshabilitar los precios de productos en oferta.  
     * handleAplicarPreciosClick()  
     * : Lógica para la herramienta de **previsualización** en lote. Lee los productos seleccionados y modifica los valores de los input en la tabla, basándose en el precio original guardado en la caché (cachePrecios).  
     * handleGuardarPreciosClick()  
     * : Recorre todos los input de precios en la tabla, los compara con los valores originales en caché y construye una lista solo con los que han cambiado. Luego, llama a actualizarPreciosEnLote() en el servidor.  
     * filtrarTablaPrecios()  
     * : Lógica de filtrado de la tabla por estado y por texto, que se ejecuta directamente en el cliente sin necesidad de volver a consultar al servidor.  
   * **Backend (Servidor):**  
     * **WebApp\_Providers.gs**  
     * **\-\> obtenerDesgloseDeCargos():** Es una de las funciones más complejas de la aplicación. Para cada producto, realiza múltiples consultas a la API para consolidar toda la información:  
       * Llama a GET /items/{itemId}?attributes=status,permalink para obtener el **estado real** en el marketplace (diferenciando de Mercado Shops).  
       * Llama a GET /prices/items/{itemId} para obtener la **estructura de precios oficial** (precio de lista y precio de promoción).  
       * Si detecta un precio (de lista o promo), llama a GET /sites/.../listing\_prices para **calcular los costos** (comisión, cargo fijo, impuestos) para ese valor.  
       * Construye y devuelve el objeto final con todos los datos (precio\_lista, precio\_promo, neto\_lista, neto\_promo, estado\_publicacion, etc.), siguiendo un \&quot;contrato de datos\&quot; estricto.  
     * **WebApp\_Providers.gs**  
     * **\-\> actualizarPreciosEnLote(productos):** Recibe la lista de productos con sus nuevos precios desde el cliente. Ejecuta una llamada PUT /items/{itemId} a la API de Mercado Libre para cada producto para actualizar el precio y luego modifica el valor en la Hoja 1 y registra el cambio en Historial\_Cambio\_Precios.

## **1\. Sección: \&quot;Seguimiento de Stock\&quot;**

### **Propósito y Funcionamiento (Guía de Usuario)**

**¿Para qué sirve?** 🧐Esta sección es tu **torre de control de inventario en tiempo real**. Su objetivo es mostrarte en una única pantalla el stock de **todas** tus publicaciones, diferenciando claramente el inventario que está en tu **depósito (Flex/Normal)** del que está en las bodegas de **Full**.

Además, te permite realizar **cambios rápidos** de stock y estado directamente en Mercado Libre sin tener que ir publicación por publicación.

**¿Cómo funciona?** ⏯️

1. **Carga de Datos:** Al entrar a la sección, el sistema consulta en vivo a Mercado Libre y te muestra una tabla con todas tus publicaciones.  
2. **La Tabla:** Verás una fila por cada producto con la siguiente información:  
   * **SKU / Título:** Tus identificadores de producto.  
   * **Estado:** Un interruptor (switch) que te muestra si la publicación está **activa** o pausada.  
   * **Tipo de Envío:** Una etiqueta que resume la logística (ej. \&quot;Full \+ Flex\&quot;, \&quot;Solo Normal\&quot;).  
   * **Stock Depósito:** Un campo **editable** que muestra el stock que tienes en tu depósito (el que usas para Flex).  
   * **Stock Full:** Un número (solo lectura) que muestra el stock que tienes en las bodegas de Mercado Libre.  
   * **Activar Flex:** Un interruptor (switch) que te muestra si esa publicación tiene Envíos Flex activado o no.  
3. **Acciones:**  
   * **Editar:** Puedes cambiar el número en \&quot;Stock Depósito\&quot;, o activar/desactivar los interruptores de \&quot;Estado\&quot; y \&quot;Flex\&quot;.  
   * **Previsualizar:** Al presionar \&quot;Previsualizar Cambios\&quot;, el sistema resalta en amarillo todas las filas que has modificado.  
   * **Guardar:** Al presionar \&quot;Guardar Cambios\&quot;, el sistema toma todas las modificaciones que previsualizaste y las aplica en tu cuenta de Mercado Libre.  
4. **Detalles Técnicos (Lógica y Funciones)**  
   * **Lógica de Lectura:**  
     1. El cliente llama a cargarVistaStock(), que a su vez ejecuta obtenerResumenDeStock() en el servidor.  
     2. obtenerResumenDeStock()  
     3. (en WebApp\_Providers.gs) lee primero tu Hoja 1 para obtener la lista maestra de SKUs e ItemIDs.  
     4. Luego, en lotes, consulta el endpoint GET /items?ids=... para obtener el status (activa/pausada) y el user\_product\_id de cada ítem.  
     5. Para cada ítem, consulta el endpoint de stock distribuido GET /user-products/{user\_product\_id}/stock.  
     6. Lee el array locations, asignando selling\_address a stockDeposito y meli\_facility a stockFull.  
     7. Devuelve esta lista completa al cliente.  
     8. drawTablaStock()  
     9. (en Dashboard.html) dibuja la tabla con los input editables y los switch (toggles).  
   * **Lógica de Escritura:**  
     1. handleGuardarStockClick()  
     2. (en Dashboard.html) recopila todos los cambios de la tabla (stock, estado y flex) que difieren de los datos originales (guardados en window.datosStock).  
     3. Envía esta lista de cambios a actualizarStockYFlexEnLote() en el servidor.  
     4. actualizarStockYFlexEnLote()  
     5. (en WebApp\_Providers.gs) itera sobre cada cambio y usa el endpoint de la API correcto para cada tarea:  
        * **Estado:** PUT /items/{itemId} con el payload {\&quot;status\&quot;: \&quot;active\&quot;}.  
        * **Stock Depósito:** PUT /user-products/{userProductId}/stock con el payload de locations.  
        * **Flex:** POST o DELETE al endpoint /users/{userId}/shipping\_options/self\_service\_in/items/{itemId} (el método que dejamos en diagnóstico).  
   * **Estado Actual:** La lectura de datos y la actualización de **Stock** y **Estado** funcionan. La actualización de **Flex** está **PAUSADA** (debido a los errores 404 de la API que estamos esperando se resuelvan).  
5. **2\. Sección: \&quot;Gestión Depósito 3PL\&quot;**  
   **Propósito y Funcionamiento (Guía de Usuario)**  
   **¿Para qué sirve?** 🧐Este es un módulo nuevo y especializado, diseñado para gestionar la logística con tu **depósito externo (3PL)**. Tiene dos herramientas:  
   * **Reconciliación de Stock (Herramienta 1):** Te permite comparar el inventario que tu 3PL *dice* que tienes (en un archivo Excel) con el inventario que Mercado Libre *cree* que tienes (en tu \&quot;Stock Depósito\&quot;), para encontrar y corregir diferencias al instante.  
   * **Preparación de Envío a 3PL (Herramienta 2):** Te permite armar una caja para enviar *hacia* tu 3PL, escanear los productos y generar el remito y las etiquetas para el transporte (actualmente en desarrollo).  
6. **¿Cómo funciona (Herramienta 1)?** ⏯️  
   * **Cargar Excel:** Entras a la sección y arrastras (o seleccionas) el archivo .xls o .xlsx que te envía tu 3PL.  
   * **Cruce de Datos:** La aplicación lee tu Excel (identificando las columnas \&quot;CODIGO DE BARRAS\&quot; y \&quot;STOCK\&quot; en la fila 6\) y, al mismo tiempo, consulta a Mercado Libre para traer el \&quot;Stock Depósito\&quot; de todos tus productos.  
   * **Tabla de Reconciliación:** Se genera una tabla con los resultados:  
     1. **SKU / Título**  
     2. **Stock Real (Excel):** Lo que dice tu 3PL.  
     3. **Stock en ML (API):** Lo que dice Mercado Libre.  
     4. **Diferencia:** El cálculo entre ambas.  
   * **Detección de Errores:**  
     1. Si un producto tiene diferencia (ej. Excel dice 10, ML dice 8), la fila se **resalta en color**.  
     2. Si un producto tiene stock en ML pero **no fue reportado** en el Excel, también aparece resaltado como un \&quot;stock fantasma\&quot;.  
   * **Ajuste Automático:** Al presionar el botón **\&quot;Ajustar Stock en ML\&quot;**, el sistema actualiza automáticamente el stock de tu depósito en Mercado Libre para que coincida con el de tu archivo Excel.  
7. **Detalles Técnicos (Lógica y Funciones)**  
   * **Lógica de Lectura (Cliente):**  
     1. cargarVistaGestion3PL()  
     2. prepara la vista.  
     3. setupEventListeners()  
     4. (en Dashboard.html) activa los listeners para dragover, dragleave, drop y change en la zona de carga.  
     5. procesarArchivoExcel()  
     6. (en Dashboard.html) se activa cuando se carga un archivo. Usa la librería XLSX.js para leer el Excel en el navegador, parsea la estructura de filas/columnas específica de tu 3PL y crea un objeto stock3PL \= {\&quot;SKU\&quot;: stock}.  
     7. Este objeto stock3PL se envía a la función reconciliarStockConAPI() en el servidor.  
   * **Lógica de Cruce (Servidor):**  
     1. reconciliarStockConAPI()  
     2. (en WebApp\_Providers.gs) recibe el stock3PL.  
     3. Obtiene la lista completa de *todos* los productos de Hoja 1\.  
     4. Consulta la API (usando el método de user-products) para obtener el **Stock Depósito** (selling\_address) y el **Estado** de cada producto.  
     5. Construye un array de resultados mostrando solo los productos que (A) estaban en el Excel o (B) tenían stock activo en ML.  
     6. Devuelve este array comparativo al cliente.  
   * **Lógica de Visualización (Cliente):**  
     1. drawTablaReconciliacion()  
     2. (en Dashboard.html) recibe los datos del servidor.  
     3. Crea la tabla de Google Charts, usando una DataView para mostrar \&quot;No Reportado\&quot; en celdas nulas y aplicando ColorFormat para resaltar las diferencias.  
   * **Lógica de Escritura (Ajuste):**  
     1. handleAjustarStockClick()  
     2. (en Dashboard.html) se activa con el botón. Filtra la lista de resultados (window.datosReconciliacion) para encontrar solo los productos con diferencias y los envía a ajustarStockDesdeExcel().  
     3. ajustarStockDesdeExcel()  
     4. (en WebApp\_Providers.gs) recibe la lista de ajustes y, para cada producto, ejecuta una llamada PUT al endpoint /user-products/{userProductId}/stock para actualizar la selling\_address con el nuevo stock del Excel.  
   * **Estado Actual:** La Herramienta 1 (Reconciliación) está **100% implementada y lista para probar. La Herramienta 2 (Preparación de Envío a 3PL) está pendiente de desarrollo.**

