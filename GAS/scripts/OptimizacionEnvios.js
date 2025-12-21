// OptimizacionEnvios.gs

function calcularOptimizacionEnvios() {
  // Constantes fijas (ajusta si necesitas)
  const Z = 1.65; // 95% servicio
  const TT_DEFAULT = 3; // Si no en Config_Logistica
  const DIAS_EVALUACION = 30; // Para V y σ
  const FE_A = 7; // Días para alta rotación
  const FE_B = 14;
  const FE_C = 30;
  
  // Pilar 2: Caché para productos en Fulfillment
  var cache = CacheService.getScriptCache();
  var cachedProductos = cache.get('productosFulfillment');
  var productos = [];
  if (cachedProductos) {
    productos = JSON.parse(cachedProductos);
  } else {
    // Obtener de API (usa existentes)
    var itemIds = getAllMyItemIds(); // De ApiMeli_Items.gs
    for (var i = 0; i < itemIds.length; i++) {
      var details = obtenerDatosFulfillmentItem(itemIds[i]); // De ApiMeli_Fulfillment.gs
      if (details && details.inventory_id) {
        var stock = consultarStockFulfillment(details.inventory_id); // De ApiMeli_Fulfillment.gs
        productos.push({
          sku: details.variations ? details.variations[0].seller_custom_field : itemIds[i], // SKU o ID
          title: details.title,
          sml: stock.available_quantity || 0
        });
      }
    }
    cache.put('productosFulfillment', JSON.stringify(productos), 3600); // Cache 1 hora
  }
  
  // Obtener Tt de Config_Logistica
  var configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config_Logistica');
  var tt = configSheet ? parseInt(configSheet.getRange('B2').getValue()) || TT_DEFAULT : TT_DEFAULT;
  
  // Cargar ventas históricas de Meli_Ordenes_Detalle (pilar 1: carga única)
  var ordersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Meli_Ordenes_Detalle');
  var ordersData = ordersSheet.getDataRange().getValues();
  var ventasPorSkuDia = {}; // {sku: {fecha: cantidad}}
  
  for (var row = 1; row < ordersData.length; row++) {
    var fecha = new Date(ordersData[row][1]); // Fecha Creación Orden (col B)
    var sku = ordersData[row][4]; // ID Item (col E, asume SKU o ID)
    var cantidad = ordersData[row][6]; // Cantidad (col G)
    if (fecha >= new Date(new Date().setDate(new Date().getDate() - DIAS_EVALUACION))) {
      if (!ventasPorSkuDia[sku]) ventasPorSkuDia[sku] = {};
      var fechaKey = fecha.toISOString().split('T')[0];
      ventasPorSkuDia[sku][fechaKey] = (ventasPorSkuDia[sku][fechaKey] || 0) + cantidad;
    }
  }
  
  // Calcular por producto (pilar 4: en memoria)
  var resultados = [];
  productos.forEach(function(prod) {
    var sku = prod.sku;
    var title = prod.title;
    var sml = prod.sml;
    var ventasDiarias = ventasPorSkuDia[sku] ? Object.values(ventasPorSkuDia[sku]) : [];
    var v = ventasDiarias.length > 0 ? ventasDiarias.reduce((a, b) => a + b, 0) / ventasDiarias.length : 0;
    
    // σ: Desvío estándar
    if (ventasDiarias.length > 1) {
      var mean = v;
      var variance = ventasDiarias.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (ventasDiarias.length - 1);
      var sigma = Math.sqrt(variance);
    } else {
      var sigma = 0;
    }
    
    // Clasificación
    var clasif = v >= 5 ? 'A' : (v >= 1 ? 'B' : 'C');
    var fe = clasif === 'A' ? FE_A : (clasif === 'B' ? FE_B : FE_C);
    var l = fe + tt;
    var ss = Z * sigma * Math.sqrt(l);
    var cantidadEnviar = Math.round((v * l) + ss - sml);
    var cobertura = v > 0 ? sml / v : 0;
    
    resultados.push([
      sku, title, v.toFixed(2), sigma.toFixed(2), clasif, sml, tt, fe, l, ss.toFixed(0), 
      cantidadEnviar > 0 ? cantidadEnviar : 'No enviar', cobertura.toFixed(1)
    ]);
  });
  
  // Escribir en hoja (pilar 5: servidor escribe)
  var optimSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Meli_Optimizacion_Envios');
  if (!optimSheet) {
    optimSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Meli_Optimizacion_Envios');
  }
  optimSheet.clear();
  optimSheet.getRange(1, 1, 1, 12).setValues([['SKU', 'Título', 'V', 'σ', 'Clasificación', 'Sml', 'Tt', 'Fe', 'L', 'Ss', 'Cantidad a enviar', 'Cobertura']]);
  if (resultados.length > 0) {
    optimSheet.getRange(2, 1, resultados.length, 12).setValues(resultados);
  }
  
  // Pilar 3: Invalidar caché si hay cambios (aquí no escribe, pero si agregas escritura, invalida cache.remove('productosFulfillment'))
}