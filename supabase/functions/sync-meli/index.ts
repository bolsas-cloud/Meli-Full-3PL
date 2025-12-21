// Edge Function: sync-meli
// Sincroniza datos desde la API de Mercado Libre a Supabase
// Deploy: supabase functions deploy sync-meli

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// URLs de la API de Mercado Libre
const ML_API_BASE = 'https://api.mercadolibre.com'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { action, fechaDesde, productos } = await req.json()

    // Obtener token de ML desde config_meli (donde lo guarda el frontend)
    const { data: tokenData, error: tokenError } = await supabase
      .from('config_meli')
      .select('valor')
      .eq('clave', 'access_token')
      .single()

    if (tokenError || !tokenData?.valor) {
      return new Response(
        JSON.stringify({ error: 'No hay token de ML configurado. Conecta con ML desde Configuración.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const accessToken = tokenData.valor

    // Obtener seller_id desde config_meli
    const { data: sellerData } = await supabase
      .from('config_meli')
      .select('valor')
      .eq('clave', 'user_id')
      .single()

    const sellerId = sellerData?.valor

    if (!sellerId) {
      // Obtener seller_id desde la API de ML
      const userResponse = await fetch(`${ML_API_BASE}/users/me`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!userResponse.ok) {
        return new Response(
          JSON.stringify({ error: 'Token inválido o expirado' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const userData = await userResponse.json()

      // Guardar seller_id para futuras consultas (en config_meli)
      await supabase
        .from('config_meli')
        .upsert({ clave: 'user_id', valor: String(userData.id) }, { onConflict: 'clave' })
    }

    const finalSellerId = sellerId || (await getSellerIdFromToken(accessToken))

    // Ejecutar acción solicitada
    switch (action) {
      case 'sync-inventory':
        return await syncInventory(supabase, accessToken, finalSellerId)

      case 'sync-orders':
        return await syncOrders(supabase, accessToken, finalSellerId, fechaDesde)

      case 'sync-all':
        const invResult = await syncInventoryInternal(supabase, accessToken, finalSellerId)
        const ordResult = await syncOrdersInternal(supabase, accessToken, finalSellerId, fechaDesde)
        return new Response(
          JSON.stringify({
            success: true,
            inventory: invResult,
            orders: ordResult
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      case 'sync-prices':
        return await syncPrices(supabase, accessToken, finalSellerId)

      case 'update-prices':
        return await updatePrices(supabase, accessToken, productos)

      default:
        return new Response(
          JSON.stringify({ error: 'Acción no válida' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

  } catch (error) {
    console.error('Error en sync-meli:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ============================================
// SINCRONIZAR INVENTARIO (Stock Full)
// ============================================
async function syncInventory(supabase: any, accessToken: string, sellerId: string) {
  const result = await syncInventoryInternal(supabase, accessToken, sellerId)
  return new Response(
    JSON.stringify(result),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function syncInventoryInternal(supabase: any, accessToken: string, sellerId: string) {
  let updated = 0
  let offset = 0
  const limit = 50
  const BATCH_SIZE = 20  // ML multiget soporta hasta 20 items por llamada

  try {
    // Obtener todos los items con fulfillment
    while (true) {
      const response = await fetch(
        `${ML_API_BASE}/users/${sellerId}/items/search?status=active&logistics_type=fulfillment&offset=${offset}&limit=${limit}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      )

      if (!response.ok) break

      const data = await response.json()
      const itemIds = data.results || []

      if (itemIds.length === 0) break

      // ============================================
      // BATCH REQUESTS: Obtener items en grupos de 20
      // Usa multiget: /items?ids=ID1,ID2,...
      // ============================================
      for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
        const batchIds = itemIds.slice(i, i + BATCH_SIZE)

        try {
          // Multiget: obtener múltiples items en una sola llamada
          const batchResponse = await fetch(
            `${ML_API_BASE}/items?ids=${batchIds.join(',')}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          )

          if (!batchResponse.ok) continue

          const batchResults = await batchResponse.json()

          // Procesar cada item del batch
          for (const itemResult of batchResults) {
            if (itemResult.code !== 200 || !itemResult.body) continue

            const item = itemResult.body

            // Buscar SKU en múltiples lugares (igual que GAS)
            let skuFromApi = null

            // Prioridad 1: seller_custom_field a nivel item
            if (item.seller_custom_field) {
              skuFromApi = item.seller_custom_field
            }

            // Prioridad 2: SELLER_SKU en atributos principales
            if (!skuFromApi && item.attributes && Array.isArray(item.attributes)) {
              const skuAttr = item.attributes.find((attr: any) => attr.id === "SELLER_SKU")
              if (skuAttr && skuAttr.value_name) {
                skuFromApi = skuAttr.value_name
              }
            }

            // Prioridad 3: SKU en variaciones
            if (!skuFromApi && item.variations && Array.isArray(item.variations) && item.variations.length > 0) {
              for (const variation of item.variations) {
                if (variation.seller_custom_field) {
                  skuFromApi = variation.seller_custom_field
                  break
                }
                if (variation.attributes && Array.isArray(variation.attributes)) {
                  const skuAttrVar = variation.attributes.find((attr: any) => attr.id === "SELLER_SKU")
                  if (skuAttrVar && skuAttrVar.value_name) {
                    skuFromApi = skuAttrVar.value_name
                    break
                  }
                }
              }
            }

            // Obtener stock de Full
            // Método 1: Usar available_quantity del item directamente (como GAS)
            const inventoryId = item.inventory_id
            let stockFull = item.available_quantity || 0
            let stockTransito = 0

            // Método 2: Si hay inventory_id, intentar obtener detalle adicional
            if (inventoryId) {
              try {
                const stockResponse = await fetch(
                  `${ML_API_BASE}/inventories/${inventoryId}/stock/fulfillment`,
                  { headers: { 'Authorization': `Bearer ${accessToken}` } }
                )

                if (stockResponse.ok) {
                  const stockData = await stockResponse.json()
                  // Usar el valor del inventario si está disponible
                  if (stockData.available_quantity !== undefined) {
                    stockFull = stockData.available_quantity
                  }
                  stockTransito = stockData.in_transit_quantity || 0
                }
              } catch (stockErr) {
                // Si falla el endpoint de inventories, ya tenemos stockFull del item
                console.log(`Usando available_quantity del item para ${item.id}`)
              }
            }

            // ============================================
            // LÓGICA GAS: Preservar datos existentes si el nuevo valor es null
            // ============================================
            // Primero obtenemos el registro existente
            const { data: existingRecord } = await supabase
              .from('publicaciones_meli')
              .select('sku, id_inventario')
              .eq('id_publicacion', item.id)
              .single()

            // Usamos el valor nuevo SOLO si no es null, sino preservamos el existente
            // Esto replica: row[0] = datosApi.sku || row[0] de la GAS
            const finalSku = skuFromApi || existingRecord?.sku || null
            const finalInventoryId = inventoryId || existingRecord?.id_inventario || null

            // Actualizar en Supabase
            const { error } = await supabase
              .from('publicaciones_meli')
              .upsert({
                id_publicacion: item.id,
                sku: finalSku,                    // Preserva existente si API devuelve null
                titulo: item.title,
                stock_full: stockFull,
                stock_transito: stockTransito,
                id_inventario: finalInventoryId,  // Preserva existente si API devuelve null
                tipo_logistica: 'fulfillment',
                precio: item.price,
                estado: item.status,
                ultima_sync: new Date().toISOString()
              }, { onConflict: 'id_publicacion' })

            if (!error) updated++
          }

        } catch (batchError) {
          console.error(`Error procesando batch:`, batchError)
        }
      }

      offset += limit
      if (offset >= (data.paging?.total || 0)) break
    }

    return { success: true, updated }

  } catch (error) {
    console.error('Error en syncInventory:', error)
    return { success: false, error: error.message, updated }
  }
}

// ============================================
// SINCRONIZAR ÓRDENES
// ============================================
async function syncOrders(supabase: any, accessToken: string, sellerId: string, fechaDesde?: string) {
  const result = await syncOrdersInternal(supabase, accessToken, sellerId, fechaDesde)
  return new Response(
    JSON.stringify(result),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function syncOrdersInternal(supabase: any, accessToken: string, sellerId: string, fechaDesde?: string) {
  let nuevas = 0
  let total = 0
  let offset = 0
  const limit = 50

  // Obtener IDs de órdenes existentes
  const { data: existingOrders } = await supabase
    .from('ordenes_meli')
    .select('id_orden')

  const existingIds = new Set((existingOrders || []).map((o: any) => String(o.id_orden)))

  // ============================================
  // SYNC INCREMENTAL: Buscar desde última orden existente
  // Si no hay fechaDesde explícita, consultamos la fecha más reciente en Supabase
  // ============================================
  let desde: Date

  if (fechaDesde) {
    desde = new Date(fechaDesde)
  } else {
    // Obtener la fecha de la orden más reciente
    const { data: ultimaOrden } = await supabase
      .from('ordenes_meli')
      .select('fecha_creacion')
      .order('fecha_creacion', { ascending: false })
      .limit(1)
      .single()

    if (ultimaOrden?.fecha_creacion) {
      // Restar 1 hora como margen de seguridad por diferencias de timezone
      desde = new Date(new Date(ultimaOrden.fecha_creacion).getTime() - 60 * 60 * 1000)
      console.log(`Sync incremental desde: ${desde.toISOString()} (última orden + margen)`)
    } else {
      // Primera vez: últimos 30 días
      desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      console.log('Primera sincronización: últimos 30 días')
    }
  }

  try {
    while (true) {
      const url = `${ML_API_BASE}/orders/search?seller=${sellerId}&order.status=paid&order.date_created.from=${desde.toISOString()}&offset=${offset}&limit=${limit}&sort=date_desc`

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!response.ok) break

      const data = await response.json()
      const orders = data.results || []

      if (orders.length === 0) break

      for (const order of orders) {
        const orderId = String(order.id)
        total++

        // Saltar si ya existe
        if (existingIds.has(orderId)) continue

        // Obtener fecha de pago y payment_id
        let datePaid = null
        let paymentId = null
        if (order.payments && order.payments.length > 0) {
          paymentId = order.payments[0].id
          datePaid = order.payments[0].date_approved || order.payments[0].date_created
        }

        // ============================================
        // OBTENER NETO RECIBIDO via /collections/{paymentId}
        // Igual que en GAS (ApiMeli_Orders.js líneas 106-128)
        // ============================================
        let orderNetAmount: number | null = null
        if (paymentId) {
          try {
            const collectionResponse = await fetch(
              `${ML_API_BASE}/collections/${paymentId}`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } }
            )

            if (collectionResponse.ok) {
              const collectionData = await collectionResponse.json()
              const collectionDetails = collectionData.collection || collectionData

              if (collectionDetails?.transaction_details?.net_received_amount !== undefined) {
                orderNetAmount = collectionDetails.transaction_details.net_received_amount
              } else if (collectionDetails?.net_received_amount !== undefined) {
                orderNetAmount = collectionDetails.net_received_amount
              }
            }
          } catch (collError) {
            console.error(`Error obteniendo collection ${paymentId}:`, collError)
          }
        }

        // Procesar cada item de la orden
        const orderItems = order.order_items || []
        const orderTotalAmount = order.total_amount || 0

        for (const orderItem of orderItems) {
          const itemId = orderItem.item?.id || null

          // Buscar SKU en múltiples lugares (igual que GAS)
          let skuFromOrder = null

          // Prioridad 1: seller_sku en el item de la orden
          if (orderItem.item?.seller_sku) {
            skuFromOrder = orderItem.item.seller_sku
          }

          // Prioridad 2: seller_custom_field en el item de la orden
          if (!skuFromOrder && orderItem.item?.seller_custom_field) {
            skuFromOrder = orderItem.item.seller_custom_field
          }

          // Si no tenemos SKU, intentar obtenerlo de publicaciones_meli
          if (!skuFromOrder && itemId) {
            const { data: pubData } = await supabase
              .from('publicaciones_meli')
              .select('sku')
              .eq('id_publicacion', itemId)
              .single()

            if (pubData?.sku) {
              skuFromOrder = pubData.sku
            }
          }

          // Calcular valores para este item
          const quantity = orderItem.quantity || 1
          const unitPrice = orderItem.unit_price || 0
          const totalLista = quantity * unitPrice

          // ============================================
          // Distribuir neto proporcionalmente entre items
          // (igual que GAS líneas 150-171)
          // ============================================
          let itemNetAmount: number | null = null
          let itemMeliCost: number | null = null
          let pctCostoMeli: number | null = null

          if (orderNetAmount !== null && orderTotalAmount > 0) {
            if (orderItems.length === 1) {
              // Un solo item: todo el neto es para él
              itemNetAmount = orderNetAmount
            } else {
              // Múltiples items: distribuir proporcionalmente
              const priceForProportion = orderItem.full_unit_price ?? unitPrice
              const totalItemEffectivePrice = quantity * priceForProportion
              const itemValueFraction = totalItemEffectivePrice / orderTotalAmount

              if (itemValueFraction >= 0 && itemValueFraction <= 1.01) {
                itemNetAmount = orderNetAmount * itemValueFraction
              }
            }
          }

          // Calcular costo de Meli y porcentaje
          if (itemNetAmount !== null && totalLista > 0) {
            itemMeliCost = totalLista - itemNetAmount
            pctCostoMeli = (itemMeliCost / totalLista) * 100
          }

          const orderRecord = {
            id_orden: orderId,
            id_item: itemId,
            sku: skuFromOrder,
            titulo_item: orderItem.item?.title || null,
            cantidad: quantity,
            precio_unitario: unitPrice,
            total_lista: totalLista,
            fecha_creacion: order.date_created,
            fecha_pago: datePaid,
            id_pago: paymentId ? String(paymentId) : null,
            neto_recibido: itemNetAmount !== null ? Math.round(itemNetAmount * 100) / 100 : null,
            costo_meli: itemMeliCost !== null ? Math.round(itemMeliCost * 100) / 100 : null,
            pct_costo_meli: pctCostoMeli !== null ? Math.round(pctCostoMeli * 100) / 100 : null,
            estado: order.status,
            comprador_nickname: order.buyer?.nickname || null
          }

          const { error } = await supabase
            .from('ordenes_meli')
            .insert(orderRecord)

          if (!error) nuevas++
        }

        existingIds.add(orderId)
      }

      offset += limit
      if (offset >= (data.paging?.total || 0)) break
    }

    return { success: true, nuevas, total }

  } catch (error) {
    console.error('Error en syncOrders:', error)
    return { success: false, error: error.message, nuevas, total }
  }
}

// Helper para obtener seller_id desde token
async function getSellerIdFromToken(accessToken: string): Promise<string> {
  const response = await fetch(`${ML_API_BASE}/users/me`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  })
  const data = await response.json()
  return String(data.id)
}

// ============================================
// SINCRONIZAR PRECIOS (Obtener precios y comisiones de ML)
// Replica la lógica de GAS: obtiene precio, categoria, tipo_publicacion
// y luego llama a /sites/MLA/listing_prices para obtener comisiones
// ============================================
async function syncPrices(supabase: any, accessToken: string, sellerId: string) {
  let updated = 0
  let offset = 0
  const limit = 50

  try {
    // Obtener todos los items activos y pausados
    while (true) {
      const response = await fetch(
        `${ML_API_BASE}/users/${sellerId}/items/search?status=active,paused&offset=${offset}&limit=${limit}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      )

      if (!response.ok) break

      const data = await response.json()
      const itemIds = data.results || []

      if (itemIds.length === 0) break

      // Obtener precio y comisiones de cada item
      for (const itemId of itemIds) {
        try {
          const itemResponse = await fetch(
            `${ML_API_BASE}/items/${itemId}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          )

          if (!itemResponse.ok) continue

          const item = await itemResponse.json()

          // Datos base a actualizar
          const updateData: any = {
            precio: item.price,
            estado: item.status,
            categoria_id: item.category_id,
            tipo_publicacion: item.listing_type_id,
            ultima_sync: new Date().toISOString()
          }

          // Obtener comisiones desde /sites/MLA/listing_prices (igual que GAS)
          if (item.category_id && item.listing_type_id && item.price > 0) {
            const siteId = item.category_id.substring(0, 3) // MLA, MLB, etc
            const feesUrl = `${ML_API_BASE}/sites/${siteId}/listing_prices?price=${item.price}&listing_type_id=${item.listing_type_id}&category_id=${item.category_id}`

            try {
              const feesResponse = await fetch(feesUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              })

              if (feesResponse.ok) {
                const feesData = await feesResponse.json()

                if (feesData.sale_fee_details) {
                  const cargoFijo = feesData.sale_fee_details.fixed_fee || 0
                  const comisionTotal = feesData.sale_fee_amount || 0
                  const comision = comisionTotal - cargoFijo
                  const impuestos = feesData.taxes_amount || 0

                  updateData.cargo_fijo_ml = cargoFijo
                  updateData.comision_ml = comision
                  updateData.impuestos_estimados = impuestos

                  // Calcular neto estimado (precio - comision - cargo_fijo - impuestos)
                  // Nota: costo_envio_ml no viene de este endpoint, se deja como está
                  const costoEnvio = 0 // TODO: obtener de shipping si es necesario
                  updateData.neto_estimado = item.price - comision - cargoFijo - costoEnvio - impuestos
                }
              }
            } catch (feeError) {
              console.error(`Error obteniendo fees de ${itemId}:`, feeError)
              // Continuamos sin las comisiones
            }
          }

          // Actualizar en Supabase
          const { error } = await supabase
            .from('publicaciones_meli')
            .update(updateData)
            .eq('id_publicacion', item.id)

          if (!error) updated++

        } catch (itemError) {
          console.error(`Error obteniendo precio de ${itemId}:`, itemError)
        }
      }

      offset += limit
      if (offset >= (data.paging?.total || 0)) break
    }

    return new Response(
      JSON.stringify({ success: true, updated }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error en syncPrices:', error)
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message, updated }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

// ============================================
// ACTUALIZAR PRECIOS (Enviar nuevos precios a ML)
// ============================================
interface ProductoActualizar {
  itemId: string
  sku: string
  precioAnterior: number
  nuevoPrecio: number
}

async function updatePrices(supabase: any, accessToken: string, productos: ProductoActualizar[]) {
  if (!productos || productos.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No se recibieron productos para actualizar' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const resultados = {
    exitosos: [] as { itemId: string, sku: string, nuevoPrecio: number }[],
    fallidos: [] as { itemId: string, sku: string, error: string }[]
  }

  for (const prod of productos) {
    try {
      // Actualizar en Mercado Libre
      const response = await fetch(`${ML_API_BASE}/items/${prod.itemId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ price: prod.nuevoPrecio })
      })

      if (!response.ok) {
        const errorData = await response.json()
        let errorMessage = 'Error desconocido'

        if (errorData.cause && errorData.cause.length > 0) {
          errorMessage = errorData.cause[0].message || errorData.message
        } else if (errorData.message) {
          errorMessage = errorData.message
        }

        resultados.fallidos.push({
          itemId: prod.itemId,
          sku: prod.sku,
          error: errorMessage
        })
        continue
      }

      // Actualizar en Supabase
      await supabase
        .from('publicaciones_meli')
        .update({ precio: prod.nuevoPrecio })
        .eq('id_publicacion', prod.itemId)

      // Guardar en historial
      await supabase
        .from('historial_cambio_precios')
        .insert({
          item_id: prod.itemId,
          sku: prod.sku,
          precio_anterior: prod.precioAnterior,
          precio_nuevo: prod.nuevoPrecio
        })

      resultados.exitosos.push({
        itemId: prod.itemId,
        sku: prod.sku,
        nuevoPrecio: prod.nuevoPrecio
      })

    } catch (error) {
      console.error(`Error actualizando precio de ${prod.itemId}:`, error)
      resultados.fallidos.push({
        itemId: prod.itemId,
        sku: prod.sku,
        error: (error as Error).message
      })
    }
  }

  return new Response(
    JSON.stringify({
      success: resultados.fallidos.length === 0,
      exitos: resultados.exitosos.length,
      fallidos: resultados.fallidos
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
