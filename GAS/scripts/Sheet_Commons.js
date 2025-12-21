// ============================================================================
// --- ARCHIVO: Sheet_Commons.gs ---
// ============================================================================
// Descripción: Funciones comunes para la manipulación de hojas de cálculo,
//              como escritura genérica, limpieza, formateo, etc.
// ============================================================================

/**
 * Crea un mapa de datos a partir de una hoja, usando la columna indicada como clave.
 * Salta la primera fila (asume que son encabezados).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - La hoja de la cual leer los datos.
 * @param {number} keyColumnIndex - El índice de la columna (basado en 0) que se usará como clave.
 * @return {object} Un objeto donde las claves son los valores de la columna especificada y
 * los valores son arrays representando las filas completas.
 */
function crearMapaDeDatos(sheet, keyColumnIndex) {
  const mapa = {};
  if (!sheet) {
    Logger.log("crearMapaDeDatos: La hoja proporcionada es nula o indefinida.");
    return mapa;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) { // No hay datos o solo encabezados
    Logger.log(`crearMapaDeDatos: La hoja "${sheet.getName()}" no tiene datos (o solo encabezados).`);
    return mapa;
  }

  // Obtener todos los datos excepto la fila de encabezado
  const datos = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  datos.forEach(fila => {
    const clave = fila[keyColumnIndex];
    if (clave !== null && clave !== undefined && String(clave).trim() !== "") { // Asegurar que la clave sea válida
      mapa[String(clave)] = fila; // Convertir clave a string por consistencia
    }
  });
  Logger.log(`Mapa creado desde la hoja "${sheet.getName()}" con ${Object.keys(mapa).length} entradas.`);
  return mapa;
}


/**
 * Aplica formatos condicionales a la hoja de resumen del análisis avanzado.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - La hoja de resumen a la cual aplicar formatos.
 * @param {number} numFilasDeDatos - El número de filas de datos (excluyendo encabezados).
 */
function aplicarFormatosCondicionalesResumen(sheet, numFilasDeDatos) {
  if (!sheet || numFilasDeDatos <= 0) {
    Logger.log("aplicarFormatosCondicionalesResumen: Hoja no válida o sin filas de datos.");
    return;
  }

  let rules = sheet.getConditionalFormatRules(); // Obtener reglas existentes para no sobrescribir otras si las hubiera

  // Columna G (índice 6 en array, Col 7 en hoja) es 'Disponibilidad %'
  const rangeDisponibilidad = sheet.getRange(2, 7, numFilasDeDatos, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThanOrEqualTo(0.90) // 90%
    .setBackground("#d9f7be") // Verde claro
    .setRanges([rangeDisponibilidad])
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberBetween(0.50, 0.8999) // 50% - 89.99%
    .setBackground("#fffbe6") // Amarillo claro
    .setRanges([rangeDisponibilidad])
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(0.50) // Menos de 50%
    .setBackground("#ffccc7") // Rojo claro
    .setRanges([rangeDisponibilidad])
    .build());

  // Columna H (índice 7 en array, Col 8 en hoja) es 'Stock en Full'
  const rangeStockFull = sheet.getRange(2, 8, numFilasDeDatos, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThanOrEqualTo(3)
    .setBackground("#ffccc7") // Rojo claro (stock bajo)
    .setRanges([rangeStockFull])
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberBetween(4, 10)
    .setBackground("#fffbe6") // Amarillo claro (stock medio)
    .setRanges([rangeStockFull])
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(10)
    .setBackground("#d9f7be") // Verde claro (stock bueno)
    .setRanges([rangeStockFull])
    .build());

  // Columna K (índice 10 en array, Col 11 en hoja) es 'Diferencia %' (Estimación ML vs Nuestra Proyección)
  const rangeDiferencia = sheet.getRange(2, 11, numFilasDeDatos, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0.20) // Estimación ML es >20% más alta
    .setFontColor("#38761d") // Verde oscuro (positivo para ML)
    .setRanges([rangeDiferencia])
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(-0.20) // Estimación ML es >20% más baja
    .setFontColor("#cc0000") // Rojo oscuro (negativo para ML)
    .setRanges([rangeDiferencia])
    .build());

  sheet.setConditionalFormatRules(rules);
  Logger.log(`Formatos condicionales aplicados a la hoja "${sheet.getName()}".`);
}

/**
 * Aplica formatos condicionales a la hoja de análisis de Fulfillment.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - La hoja de análisis Full.
 * @param {number} rowCount - El número de filas de datos (excluyendo encabezados).
 */
function aplicarFormatoCondicionalFull(sheet, rowCount) {
  if (!sheet || rowCount <= 0) {
    Logger.log("aplicarFormatoCondicionalFull: Hoja no válida o sin filas de datos.");
    return;
  }
  let rules = sheet.getConditionalFormatRules();

  // Columna F (índice 5, Col 6) es 'Stock Disponible'
  const rangeStockDisponible = sheet.getRange(2, 6, rowCount, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThanOrEqualTo(3).setBackground("#ffccc7").setRanges([rangeStockDisponible]).build()); // Rojo
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(4, 10).setBackground("#fffbe6").setRanges([rangeStockDisponible]).build()); // Amarillo
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(10).setBackground("#d9f7be").setRanges([rangeStockDisponible]).build()); // Verde

  // Columna Q (índice 16, Col 17) es 'Nivel Crítico'
  const rangeNivelCritico = sheet.getRange(2, 17, rowCount, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Crítico").setBackground("#ff7875").setFontColor("#ffffff").setRanges([rangeNivelCritico]).build()); // Rojo más fuerte
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Advertencia").setBackground("#ffe58f").setRanges([rangeNivelCritico]).build()); // Amarillo más fuerte
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Normal").setBackground("#f6ffed").setRanges([rangeNivelCritico]).build()); // Verde muy claro

  // Columna J (índice 9, Col 10) es 'Dañados Total'
  const rangeDañados = sheet.getRange(2, 10, rowCount, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground("#ffccc7").setRanges([rangeDañados]).build()); // Rojo claro

  // Columna M (índice 12, Col 13) es 'Perdidos'
  const rangePerdidos = sheet.getRange(2, 13, rowCount, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground("#ffccc7").setRanges([rangePerdidos]).build()); // Rojo claro
  
  // Columna E (índice 4, Col 5) es 'Usa Full'
  const rangeUsaFull = sheet.getRange(2, 5, rowCount, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextContains("sin inventory_id").setBackground("#fff1b8").setRanges([rangeUsaFull]).build()); // Naranja claro
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Error").setBackground("#ffccc7").setRanges([rangeUsaFull]).build()); // Rojo claro


  sheet.setConditionalFormatRules(rules);
  Logger.log(`Formatos condicionales aplicados a la hoja de análisis Full "${sheet.getName()}".`);
}


