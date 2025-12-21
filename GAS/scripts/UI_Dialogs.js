// ============================================================================
// --- ARCHIVO: UI_Dialogs.gs ---
// ============================================================================
// Descripción: Funciones para mostrar diálogos modales y barras laterales
//              en la interfaz de Google Sheets, generalmente usando HTML Service.
// ============================================================================

/**
 * Muestra un diálogo para la selección de período para el análisis de ventas por SKU.
 */
function mostrarDialogoSeleccionPeriodo() {
  const ui = SpreadsheetApp.getUi();
  const htmlOutput = HtmlService
    .createHtmlOutput(
      `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 350px; margin: auto;">
         <h3 style="color: #1a73e8; border-bottom: 1px solid #dadce0; padding-bottom: 8px;">Análisis de Ventas por SKU</h3>
         <p style="font-size: 14px; color: #3c4043;">Seleccione el período histórico para analizar las ventas y generar proyecciones:</p>
         <select id="diasHistoricos" style="width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid #dadce0; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
           <option value="30">Últimos 30 días</option>
           <option value="60">Últimos 60 días</option>
           <option value="90" selected>Últimos 90 días</option>
           <option value="180">Últimos 180 días</option>
         </select>
         <div style="text-align: right;">
           <button onclick="google.script.host.close()" style="margin-right: 10px; padding: 8px 16px; font-size: 14px; border: 1px solid #dadce0; border-radius: 4px; background-color: #ffffff; color: #1a73e8; cursor: pointer;">Cancelar</button>
           <button onclick="ejecutarAnalisis()" style="padding: 8px 16px; font-size: 14px; border: none; border-radius: 4px; background-color: #1a73e8; color: white; cursor: pointer;">Iniciar Análisis</button>
         </div>
         <div id="status-message" style="margin-top: 15px; font-size: 13px; color: #5f6368;"></div>
         <script>
           function ejecutarAnalisis() {
             document.getElementById('status-message').innerText = 'Procesando análisis... Esto puede tardar unos momentos.';
             var dias = parseInt(document.getElementById('diasHistoricos').value);
             google.script.run
               .withSuccessHandler(function() { 
                 google.script.host.close(); 
                 // No necesitamos un toast aquí si la función llamada (analizarVentasPorSKU) ya lo hace.
               })
               .withFailureHandler(function(err) {
                 document.getElementById('status-message').innerText = 'Error: ' + err.message;
                 // No cerrar automáticamente en caso de error para que el usuario vea el mensaje.
               })
               .analizarVentasPorSKU(dias); // Asume que analizarVentasPorSKU está en Sheet_SalesAnalysis.gs
           }
         </script>
       </div>`
    )
    .setWidth(400) // Ancho del modal
    .setHeight(280); // Alto del modal
  ui.showModalDialog(htmlOutput, 'Configurar Análisis de Ventas');
}


/**
 * Muestra un diálogo para configurar el análisis avanzado de publicaciones.
 */
function mostrarDialogoAnalisisAvanzado() {
  const ui = SpreadsheetApp.getUi();
  const htmlOutput = HtmlService
    .createHtmlOutput(
      `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 400px; margin: auto;">
         <h3 style="color: #1a73e8; border-bottom: 1px solid #dadce0; padding-bottom: 8px;">Análisis Avanzado de Publicaciones</h3>
         <p style="font-size: 14px; color: #3c4043;">Este análisis puede incluir historial de estados, stock en Fulfillment y estimaciones de ventas de Mercado Libre.</p>
         <p style="font-size: 14px; color: #3c4043;">Seleccione el período histórico a analizar (para historial de estados):</p>
         <select id="diasHistorial" style="width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid #dadce0; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
           <option value="30">Últimos 30 días</option>
           <option value="60">Últimos 60 días</option>
           <option value="90" selected>Últimos 90 días</option>
           <option value="180">Últimos 180 días</option>
         </select>
         <div style="text-align: right;">
           <button onclick="google.script.host.close()" style="margin-right: 10px; padding: 8px 16px; font-size: 14px; border: 1px solid #dadce0; border-radius: 4px; background-color: #ffffff; color: #1a73e8; cursor: pointer;">Cancelar</button>
           <button onclick="ejecutarAnalisis()" style="padding: 8px 16px; font-size: 14px; border: none; border-radius: 4px; background-color: #1a73e8; color: white; cursor: pointer;">Iniciar Análisis</button>
         </div>
         <div id="status-message" style="margin-top: 15px; font-size: 13px; color: #5f6368;"></div>
         <script>
           function ejecutarAnalisis() {
             document.getElementById('status-message').innerText = 'Procesando análisis avanzado... Esto puede tardar varios minutos.';
             var dias = parseInt(document.getElementById('diasHistorial').value);
             google.script.run
               .withSuccessHandler(function() { 
                 google.script.host.close();
               })
               .withFailureHandler(function(err) {
                 document.getElementById('status-message').innerText = 'Error: ' + err.message;
               })
               .realizarAnalisisAvanzadoPublicaciones(dias); // Asume que está en Main.gs o similar
           }
         </script>
       </div>`
    )
    .setWidth(450)
    .setHeight(380);
  ui.showModalDialog(htmlOutput, 'Configurar Análisis Avanzado');
}

/**
 * Muestra un diálogo para configurar el análisis completo de Fulfillment.
 */
function mostrarDialogoAnalisisFull() {
  const ui = SpreadsheetApp.getUi();
  const htmlOutput = HtmlService
    .createHtmlOutput(
      `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 420px; margin: auto;">
         <h3 style="color: #007bff; border-bottom: 1px solid #dee2e6; padding-bottom: 8px;">Análisis Completo de Fulfillment</h3>
         <p style="font-size: 14px; color: #495057;">Incluye stock, detalles de no disponibles, historial de operaciones y recomendaciones.</p>
         <p style="font-size: 14px; color: #495057;">Seleccione el período histórico para analizar operaciones de stock:</p>
         <select id="diasHistorialFull" style="width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
           <option value="30">Últimos 30 días</option>
           <option value="60">Últimos 60 días</option>
           <option value="90" selected>Últimos 90 días</option>
           <option value="180">Últimos 180 días</option>
         </select>
         <div style="text-align: right;">
           <button onclick="google.script.host.close()" style="margin-right: 10px; padding: 8px 16px; font-size: 14px; border: 1px solid #ced4da; border-radius: 4px; background-color: #f8f9fa; color: #007bff; cursor: pointer;">Cancelar</button>
           <button id="btn-analizar" onclick="ejecutarAnalisisFull()" style="padding: 8px 16px; font-size: 14px; border: none; border-radius: 4px; background-color: #007bff; color: white; cursor: pointer;">Iniciar Análisis</button>
         </div>
         <div id="status-spinner" style="margin-top: 20px; text-align: center; display: none;">
            <div style="border: 4px solid #f3f3f3; border-top: 4px solid #007bff; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: auto;"></div>
            <p style="font-size: 13px; color: #495057; margin-top: 10px;">Procesando... Esto puede tardar varios minutos.</p>
         </div>
         <div id="status-message-full" style="margin-top: 15px; font-size: 13px; color: #5f6368; text-align: center;"></div>
         <style> @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } </style>
         <script>
           function ejecutarAnalisisFull() {
             document.getElementById('status-spinner').style.display = 'block';
             document.getElementById('status-message-full').innerText = '';
             document.getElementById('btn-analizar').disabled = true;
             var dias = parseInt(document.getElementById('diasHistorialFull').value);
             google.script.run
               .withSuccessHandler(function(result) { 
                 document.getElementById('status-spinner').style.display = 'none';
                 document.getElementById('btn-analizar').disabled = false;
                 if(result && result.success) {
                    document.getElementById('status-message-full').innerHTML = '<span style=\\"color: green;\\">✅ Análisis completado. ' + (result.itemsCount || 0) + ' ítems procesados.</span>';
                    setTimeout(function(){ google.script.host.close(); }, 2500);
                 } else {
                    document.getElementById('status-message-full').innerHTML = '<span style=\\"color: red;\\">⚠️ Análisis completado con advertencias o fallos: ' + (result.error || 'Error desconocido') + '</span>';
                 }
               })
               .withFailureHandler(function(err) {
                 document.getElementById('status-spinner').style.display = 'none';
                 document.getElementById('btn-analizar').disabled = false;
                 document.getElementById('status-message-full').innerHTML = '<span style=\\"color: red;\\">❌ Error: ' + err.message + '</span>';
               })
               .realizarAnalisisCompletoFulfillment(dias); // Asume que está en Sheet_FulfillmentAnalysis.gs
           }
         </script>
       </div>`
    )
    .setWidth(480)
    .setHeight(450);
  ui.showModalDialog(htmlOutput, 'Análisis Completo de Fulfillment');
}


/**
 * Muestra un diálogo para consultar stock específico en Full (interactivo).
 */
function mostrarDialogoConsultaStock() {
  const ui = SpreadsheetApp.getUi();
  const htmlOutput = HtmlService
    .createHtmlOutput(
      `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 380px; margin: auto;">
         <h3 style="color: #007bff; border-bottom: 1px solid #dee2e6; padding-bottom: 8px;">Consulta de Stock en Full</h3>
         <p style="font-size: 14px; color: #495057;">Introduzca el ID de inventario (<code>inventory_id</code>) o el ID de publicación (<code>MLA...</code>):</p>
         <label for="inventoryId" style="font-size:13px; color: #495057;">ID de Inventario:</label>
         <input type="text" id="inventoryId" placeholder="Ej: LCQI05831" style="width: 100%; padding: 10px; margin-top: 4px; margin-bottom: 10px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
         <label for="itemIdFull" style="font-size:13px; color: #495057;">ID de Publicación:</label>
         <input type="text" id="itemIdFull" placeholder="Ej: MLA123456789" style="width: 100%; padding: 10px; margin-top: 4px; margin-bottom: 20px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
         <div style="text-align: right;">
           <button onclick="google.script.host.close()" style="margin-right: 10px; padding: 8px 16px; font-size: 14px; border: 1px solid #ced4da; border-radius: 4px; background-color: #f8f9fa; color: #007bff; cursor: pointer;">Cancelar</button>
           <button id="btn-consultar" onclick="consultarStock()" style="padding: 8px 16px; font-size: 14px; border: none; border-radius: 4px; background-color: #007bff; color: white; cursor: pointer;">Consultar</button>
         </div>
          <div id="status-spinner-stock" style="margin-top: 20px; text-align: center; display: none;">
            <div style="border: 4px solid #f3f3f3; border-top: 4px solid #007bff; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: auto;"></div>
            <p style="font-size: 13px; color: #495057; margin-top: 10px;">Consultando...</p>
         </div>
         <div id="status-message-stock" style="margin-top: 15px; font-size: 13px; color: #5f6368; text-align: center;"></div>
         <style> @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } </style>
         <script>
           function consultarStock() {
             var invId = document.getElementById('inventoryId').value.trim();
             var itId = document.getElementById('itemIdFull').value.trim(); // Renombrado para evitar conflicto con otros dialogs
             if (!invId && !itId) {
               document.getElementById('status-message-stock').innerHTML = '<span style=\\"color: red;\\">Por favor, ingrese un ID de Inventario o de Publicación.</span>';
               return;
             }
             document.getElementById('status-spinner-stock').style.display = 'block';
             document.getElementById('status-message-stock').innerText = '';
             document.getElementById('btn-consultar').disabled = true;

             google.script.run
               .withSuccessHandler(function(result){
                 document.getElementById('status-spinner-stock').style.display = 'none';
                 document.getElementById('btn-consultar').disabled = false;
                 if (result && result.success) {
                    document.getElementById('status-message-stock').innerHTML = '<span style=\\"color: green;\\">✅ Consulta exitosa. Ver hoja \\'Meli_Full_Stock_Detalle\\'.</span>';
                    setTimeout(function(){ google.script.host.close(); }, 2500);
                 } else {
                    document.getElementById('status-message-stock').innerHTML = '<span style=\\"color: red;\\">⚠️ Falló la consulta: ' + (result.error || 'Error desconocido') + '</span>';
                 }
               })
               .withFailureHandler(function(err){
                 document.getElementById('status-spinner-stock').style.display = 'none';
                 document.getElementById('btn-consultar').disabled = false;
                 document.getElementById('status-message-stock').innerHTML = '<span style=\\"color: red;\\">❌ Error: ' + err.message + '</span>';
               })
               .consultarStockFulfillmentInteractivo(invId, itId); // Asume que está en Sheet_FulfillmentAnalysis.gs o similar
           }
         </script>
       </div>`
    )
    .setWidth(420)
    .setHeight(430);
  ui.showModalDialog(htmlOutput, 'Consulta Stock Fulfillment');
}


/**
 * Muestra un diálogo para consultar el historial de operaciones de Full para un ítem.
 */
function mostrarDialogoHistorialOperaciones() {
  const ui = SpreadsheetApp.getUi();
  const htmlOutput = HtmlService
    .createHtmlOutput(
       `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 400px; margin: auto;">
         <h3 style="color: #007bff; border-bottom: 1px solid #dee2e6; padding-bottom: 8px;">Historial de Operaciones Full</h3>
         <p style="font-size: 14px; color: #495057;">Introduzca ID de Inventario (<code>inventory_id</code>) o ID de Publicación (<code>MLA...</code>):</p>
         <label for="inventoryIdHist" style="font-size:13px; color: #495057;">ID de Inventario:</label>
         <input type="text" id="inventoryIdHist" placeholder="Ej: LCQI05831" style="width: 100%; padding: 10px; margin-top:4px; margin-bottom: 10px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
         <label for="itemIdHist" style="font-size:13px; color: #495057;">ID de Publicación:</label>
         <input type="text" id="itemIdHist" placeholder="Ej: MLA123456789" style="width: 100%; padding: 10px; margin-top:4px; margin-bottom: 10px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
         <label for="diasHistorialOps" style="font-size:13px; color: #495057;">Período de consulta:</label>
         <select id="diasHistorialOps" style="width: 100%; padding: 10px; margin-top:4px; margin-bottom: 20px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
           <option value="30">Últimos 30 días</option>
           <option value="60">Últimos 60 días</option>
           <option value="90" selected>Últimos 90 días</option>
           <option value="180">Últimos 180 días</option>
         </select>
         <div style="text-align: right;">
           <button onclick="google.script.host.close()" style="margin-right: 10px; padding: 8px 16px; font-size: 14px; border: 1px solid #ced4da; border-radius: 4px; background-color: #f8f9fa; color: #007bff; cursor: pointer;">Cancelar</button>
           <button id="btn-historial" onclick="consultarHistorial()" style="padding: 8px 16px; font-size: 14px; border: none; border-radius: 4px; background-color: #007bff; color: white; cursor: pointer;">Consultar</button>
         </div>
         <div id="status-spinner-hist" style="margin-top: 20px; text-align: center; display: none;">
            <div style="border: 4px solid #f3f3f3; border-top: 4px solid #007bff; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: auto;"></div>
            <p style="font-size: 13px; color: #495057; margin-top: 10px;">Consultando historial...</p>
         </div>
         <div id="status-message-hist" style="margin-top: 15px; font-size: 13px; color: #5f6368; text-align: center;"></div>
         <style> @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } </style>
         <script>
           function consultarHistorial() {
             var invId = document.getElementById('inventoryIdHist').value.trim();
             var itId = document.getElementById('itemIdHist').value.trim();
             var dias = parseInt(document.getElementById('diasHistorialOps').value);
             if (!invId && !itId) {
               document.getElementById('status-message-hist').innerHTML = '<span style=\\"color: red;\\">Por favor, ingrese un ID de Inventario o de Publicación.</span>';
               return;
             }
             document.getElementById('status-spinner-hist').style.display = 'block';
             document.getElementById('status-message-hist').innerText = '';
             document.getElementById('btn-historial').disabled = true;

             google.script.run
               .withSuccessHandler(function(result){
                 document.getElementById('status-spinner-hist').style.display = 'none';
                 document.getElementById('btn-historial').disabled = false;
                 if (result && result.success) {
                    document.getElementById('status-message-hist').innerHTML = '<span style=\\"color: green;\\">✅ Consulta exitosa. ' + (result.operationsCount || 0) + ' operaciones encontradas. Ver hoja \\'Meli_Full_Historial_Operaciones\\'.</span>';
                    setTimeout(function(){ google.script.host.close(); }, 3000);
                 } else {
                    document.getElementById('status-message-hist').innerHTML = '<span style=\\"color: red;\\">⚠️ Falló la consulta: ' + (result.error || 'Error desconocido') + '</span>';
                 }
               })
               .withFailureHandler(function(err){
                 document.getElementById('status-spinner-hist').style.display = 'none';
                 document.getElementById('btn-historial').disabled = false;
                 document.getElementById('status-message-hist').innerHTML = '<span style=\\"color: red;\\">❌ Error: ' + err.message + '</span>';
               })
               .consultarHistorialOperacionesFull(invId, itId, dias); // Asume que está en Sheet_FulfillmentAnalysis.gs o similar
           }
         </script>
       </div>`
    )
    .setWidth(450) // Ajustar ancho
    .setHeight(520); // Ajustar alto
  ui.showModalDialog(htmlOutput, 'Historial de Operaciones Fulfillment');
}
