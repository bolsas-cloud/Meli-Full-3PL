/**
 * DEBUG: Mostrar valores de V y σ para comparar con Supabase
 * Ejecutar esta función desde el editor de Apps Script
 */
function debugCompararConSupabase() {
  const DIAS = 90;

  // SKUs a comparar (los mismos que muestra Supabase en el debug)
  const skusAComparar = [
    'LAC403000XSLAC010',
    'LAC202000XACCC010',
    'LAC404000XSLAC005',
    'LAC204000XACDC020',
    'LAC504000XSLAC005'
  ];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName('Meli_Ordenes_Detalle');  // Nombre correcto
  const targetSheet = ss.getSheetByName('Hoja 1');

  if (!ordersSheet || !targetSheet) {
    Logger.log('ERROR: No se encontraron las hojas necesarias');
    Logger.log('Hojas buscadas: "Meli_Ordenes_Detalle" y "Hoja 1"');
    return;
  }

  // Crear mapa ItemID → SKU (Hoja 1: A=SKU, G=ID Publicación)
  const itemInfoMap = {};
  targetSheet.getRange("A2:G" + targetSheet.getLastRow()).getValues().forEach(row => {
    if (row[6] && row[0]) itemInfoMap[row[6]] = { sku: row[0], titulo: row[1] };
  });
  Logger.log('Mapa ItemID→SKU creado con ' + Object.keys(itemInfoMap).length + ' productos');

  // Procesar órdenes (Meli_Ordenes_Detalle: C=Fecha Pago, E=ID Item, G=Cantidad)
  const ventasPorSkuPorDia = {};
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - DIAS);

  ordersSheet.getRange("C2:G" + ordersSheet.getLastRow()).getValues().forEach(row => {
    const fechaPago = row[0];   // Columna C
    const itemId = row[2];      // Columna E
    const cantidad = row[4];    // Columna G

    if (fechaPago >= fechaLimite && itemId && cantidad > 0) {
      const info = itemInfoMap[itemId];
      if (info && info.sku) {
        const sku = info.sku;
        const fechaStr = Utilities.formatDate(fechaPago, Session.getScriptTimeZone(), "yyyy-MM-dd");
        if (!ventasPorSkuPorDia[sku]) {
          ventasPorSkuPorDia[sku] = { titulo: info.titulo, ventas: {} };
        }
        ventasPorSkuPorDia[sku].ventas[fechaStr] = (ventasPorSkuPorDia[sku].ventas[fechaStr] || 0) + cantidad;
      }
    }
  });

  // Calcular V y σ para cada SKU
  Logger.log('');
  Logger.log('========================================');
  Logger.log('DEBUG GAS - COMPARAR CON SUPABASE');
  Logger.log('========================================');
  Logger.log('');

  for (const sku of skusAComparar) {
    if (!ventasPorSkuPorDia[sku]) {
      Logger.log(`SKU: ${sku}`);
      Logger.log('  - NO ENCONTRADO EN GAS');
      Logger.log('');
      continue;
    }

    const ventasDiarias = [];
    let totalUnidades = 0;

    for (let i = 0; i < DIAS; i++) {
      const fechaActual = new Date();
      fechaActual.setDate(fechaActual.getDate() - i);
      const fechaStr = Utilities.formatDate(fechaActual, Session.getScriptTimeZone(), "yyyy-MM-dd");
      const ventasDelDia = ventasPorSkuPorDia[sku].ventas[fechaStr] || 0;
      ventasDiarias.push(ventasDelDia);
      totalUnidades += ventasDelDia;
    }

    const ventasDiariasPromedio = totalUnidades / DIAS;
    const media = ventasDiariasPromedio;
    const varianza = ventasDiarias.map(x => Math.pow(x - media, 2)).reduce((a, b) => a + b, 0) / DIAS;
    const desvioEstandar = Math.sqrt(varianza);

    Logger.log(`SKU: ${sku}`);
    Logger.log(`  - Ventas 90d: ${totalUnidades}`);
    Logger.log(`  - V (ventas/día): ${ventasDiariasPromedio.toFixed(4)}`);
    Logger.log(`  - σ (desvío): ${desvioEstandar.toFixed(4)}`);
    Logger.log('');
  }

  Logger.log('========================================');
  Logger.log('Comparar estos valores con la consola de Supabase');
  Logger.log('========================================');
}
