// Edge Function: sync-meli
// Sincroniza datos desde la API de Mercado Libre a Supabase
// Deploy: supabase functions deploy sync-meli

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
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

    const { action, fechaDesde, productos, cambiosStock } = await req.json()

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

      case 'sync-ads':
        return await syncAds(supabase, accessToken)

      case 'update-stock':
        return await updateStock(supabase, accessToken, cambiosStock)

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
// SINCRONIZAR INVENTARIO (Stock Full + Depósito + Flex)
// Replica la lógica de GAS: obtenerResumenDeStock()
// - Usa /items con user_product_id para obtener el ID de producto
// - Usa /user-products/{id}/stock para obtener stock distribuido
// - Detecta Flex via shipping.tags (self_service_in)
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
    // ============================================
    // PASO 0: Obtener IDs existentes en Supabase para detectar huérfanas
    // Solo las que tienen estado active/paused (no las ya marcadas como no_encontrada)
    // ============================================
    const { data: existingPubs } = await supabase
      .from('publicaciones_meli')
      .select('id_publicacion')
      .in('estado', ['active', 'paused'])

    const idsEnSupabase = new Set((existingPubs || []).map((p: any) => p.id_publicacion))
    const idsEncontradosEnML = new Set<string>()

    console.log(`Publicaciones en Supabase (active/paused): ${idsEnSupabase.size}`)

    // ============================================
    // Obtener TODOS los items activos y pausados (no solo fulfillment)
    // Esto replica la lógica de GAS que lee de Hoja 1
    // ============================================
    while (true) {
      const response = await fetch(
        `${ML_API_BASE}/users/${sellerId}/items/search?status=active,paused&offset=${offset}&limit=${limit}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      )

      if (!response.ok) break

      const data = await response.json()
      const itemIds = data.results || []

      if (itemIds.length === 0) break

      // ============================================
      // BATCH REQUESTS: Obtener items en grupos de 20
      // Incluimos user_product_id y shipping para detectar Flex
      // ============================================
      for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
        const batchIds = itemIds.slice(i, i + BATCH_SIZE)

        try {
          // Multiget con atributos específicos (igual que GAS)
          const batchResponse = await fetch(
            `${ML_API_BASE}/items?ids=${batchIds.join(',')}&attributes=id,title,price,status,shipping,user_product_id,seller_custom_field,attributes,variations,inventory_id,available_quantity`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          )

          if (!batchResponse.ok) continue

          const batchResults = await batchResponse.json()

          // Procesar cada item del batch
          for (const itemResult of batchResults) {
            if (itemResult.code !== 200 || !itemResult.body) continue

            const item = itemResult.body

            // Registrar que este ID fue encontrado en ML
            idsEncontradosEnML.add(item.id)

            // ============================================
            // Extraer SKU (igual que antes)
            // ============================================
            let skuFromApi = null

            if (item.seller_custom_field) {
              skuFromApi = item.seller_custom_field
            }

            if (!skuFromApi && item.attributes && Array.isArray(item.attributes)) {
              const skuAttr = item.attributes.find((attr: any) => attr.id === "SELLER_SKU")
              if (skuAttr && skuAttr.value_name) {
                skuFromApi = skuAttr.value_name
              }
            }

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

            // ============================================
            // Detectar tipo logística y Flex (igual que GAS)
            // ============================================
            const shipping = item.shipping || {}
            const tipoLogistica = shipping.logistic_type || 'desconocido'
            const shippingTags = shipping.tags || []
            const tieneFlex = shippingTags.includes('self_service_in')

            // ============================================
            // Obtener stock distribuido via user_product_id
            // Endpoint: /user-products/{user_product_id}/stock
            // Tipos de ubicación:
            //   - meli_facility: Stock en Full (bodega ML)
            //   - selling_address: Stock en tu depósito
            // ============================================
            let stockFull = 0
            let stockDeposito = 0
            let stockTransito = 0
            const userProductId = item.user_product_id

            if (userProductId) {
              try {
                const stockResponse = await fetch(
                  `${ML_API_BASE}/user-products/${userProductId}/stock`,
                  { headers: { 'Authorization': `Bearer ${accessToken}` } }
                )

                if (stockResponse.ok) {
                  const stockData = await stockResponse.json()

                  if (stockData.locations && Array.isArray(stockData.locations)) {
                    for (const loc of stockData.locations) {
                      if (loc.type === 'meli_facility') {
                        stockFull += loc.quantity || 0
                      } else if (loc.type === 'selling_address') {
                        stockDeposito += loc.quantity || 0
                      }
                    }
                  }
                }
              } catch (stockErr) {
                console.log(`Error obteniendo stock distribuido para ${item.id}:`, stockErr)
              }
            }

            // Fallback: Si no hay user_product_id, usar available_quantity
            if (!userProductId || (stockFull === 0 && stockDeposito === 0)) {
              // Para items fulfillment, available_quantity suele ser stock Full
              if (tipoLogistica === 'fulfillment') {
                stockFull = item.available_quantity || 0
              } else {
                // Para otros tipos, es stock en depósito
                stockDeposito = item.available_quantity || 0
              }
            }

            // Stock en tránsito (solo para fulfillment)
            const inventoryId = item.inventory_id
            if (inventoryId && tipoLogistica === 'fulfillment') {
              try {
                const transitResponse = await fetch(
                  `${ML_API_BASE}/inventories/${inventoryId}/stock/fulfillment`,
                  { headers: { 'Authorization': `Bearer ${accessToken}` } }
                )

                if (transitResponse.ok) {
                  const transitData = await transitResponse.json()
                  stockTransito = transitData.in_transit_quantity || 0
                }
              } catch (transitErr) {
                // Ignorar error de tránsito
              }
            }

            // ============================================
            // Preservar datos existentes si el nuevo valor es null
            // ============================================
            const { data: existingRecord } = await supabase
              .from('publicaciones_meli')
              .select('sku, id_inventario')
              .eq('id_publicacion', item.id)
              .single()

            const finalSku = skuFromApi || existingRecord?.sku || null
            const finalInventoryId = inventoryId || existingRecord?.id_inventario || null

            // ============================================
            // Actualizar en Supabase con todos los campos
            // ============================================
            const { error } = await supabase
              .from('publicaciones_meli')
              .upsert({
                id_publicacion: item.id,
                sku: finalSku,
                titulo: item.title,
                stock_full: stockFull,
                stock_deposito: stockDeposito,
                stock_transito: stockTransito,
                tiene_flex: tieneFlex,
                user_product_id: userProductId || null,
                id_inventario: finalInventoryId,
                tipo_logistica: tipoLogistica,
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

    // ============================================
    // PASO FINAL: Marcar publicaciones huérfanas
    // Las que estaban en Supabase pero NO aparecieron en ML
    // ============================================
    const idsHuerfanas: string[] = []
    for (const id of idsEnSupabase) {
      if (!idsEncontradosEnML.has(id)) {
        idsHuerfanas.push(id)
      }
    }

    let marcadasHuerfanas = 0
    if (idsHuerfanas.length > 0) {
      console.log(`Publicaciones huérfanas detectadas: ${idsHuerfanas.length}`)
      console.log(`IDs: ${idsHuerfanas.join(', ')}`)

      // Marcar como "no_encontrada" en Supabase
      const { error: updateError } = await supabase
        .from('publicaciones_meli')
        .update({
          estado: 'no_encontrada',
          ultima_sync: new Date().toISOString()
        })
        .in('id_publicacion', idsHuerfanas)

      if (!updateError) {
        marcadasHuerfanas = idsHuerfanas.length
      } else {
        console.error('Error marcando huérfanas:', updateError)
      }
    }

    console.log(`Sync completado - Actualizadas: ${updated}, Huérfanas: ${marcadasHuerfanas}`)

    return {
      success: true,
      updated,
      huerfanas: marcadasHuerfanas,
      totalEnML: idsEncontradosEnML.size
    }

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
// OPTIMIZADO: usa batch multiget (20 items) + Promise.all para fees
// ============================================
async function syncPrices(supabase: any, accessToken: string, sellerId: string) {
  let updated = 0
  let offset = 0
  const limit = 50
  const BATCH_SIZE = 20  // ML multiget soporta hasta 20 items

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

      // ============================================
      // BATCH MULTIGET: Procesar items en grupos de 20
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

          // Filtrar items válidos
          const validItems = batchResults
            .filter((r: any) => r.code === 200 && r.body)
            .map((r: any) => r.body)

          // ============================================
          // PARALELO: Obtener fees de todos los items a la vez
          // ============================================
          const feesPromises = validItems.map(async (item: any) => {
            const updateData: any = {
              id_publicacion: item.id,
              precio: item.price,
              estado: item.status,
              categoria_id: item.category_id,
              tipo_publicacion: item.listing_type_id,
              ultima_sync: new Date().toISOString()
            }

            // Obtener comisiones si tenemos los datos necesarios
            if (item.category_id && item.listing_type_id && item.price > 0) {
              const siteId = item.category_id.substring(0, 3)
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
                    updateData.neto_estimado = item.price - comision - cargoFijo - impuestos
                  }
                }
              } catch (feeError) {
                // Continuar sin fees
              }
            }

            return updateData
          })

          // Esperar todas las llamadas de fees en paralelo
          const updatesData = await Promise.all(feesPromises)

          // ============================================
          // BATCH UPSERT: Actualizar todos en Supabase de una vez
          // ============================================
          if (updatesData.length > 0) {
            const { error } = await supabase
              .from('publicaciones_meli')
              .upsert(updatesData, { onConflict: 'id_publicacion' })

            if (!error) {
              updated += updatesData.length
            } else {
              console.error('Error en batch upsert:', error)
            }
          }

        } catch (batchError) {
          console.error('Error procesando batch de precios:', batchError)
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

// ============================================
// SINCRONIZAR COSTOS DE PUBLICIDAD (Ads)
// Replica la lógica de GAS: ApiMeli_Ads.js
// - Obtiene advertiser_id
// - Consulta costos diarios de campañas
// - Aplica IVA (1.21)
// - Rellena días faltantes con último valor (API tiene delay de ~2 días)
// ============================================
async function syncAds(supabase: any, accessToken: string) {
  const result = await syncAdsInternal(supabase, accessToken)
  return new Response(
    JSON.stringify(result),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function syncAdsInternal(supabase: any, accessToken: string) {
  try {
    // ============================================
    // PASO 1: Obtener Advertiser ID
    // Endpoint: /advertising/advertisers?product_id=PADS
    // ============================================

    // Primero intentar obtener de cache (config_meli)
    const { data: cachedAdvertiser } = await supabase
      .from('config_meli')
      .select('valor')
      .eq('clave', 'advertiser_id')
      .single()

    let advertiserId = cachedAdvertiser?.valor

    if (!advertiserId) {
      const advertiserResponse = await fetch(
        `${ML_API_BASE}/advertising/advertisers?product_id=PADS`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'api-version': '1'
          }
        }
      )

      if (!advertiserResponse.ok) {
        console.error('Error obteniendo advertiser_id:', await advertiserResponse.text())
        return { success: false, error: 'No se pudo obtener advertiser_id' }
      }

      const advertiserData = await advertiserResponse.json()

      if (advertiserData.advertisers && advertiserData.advertisers.length > 0 && advertiserData.advertisers[0].advertiser_id) {
        advertiserId = advertiserData.advertisers[0].advertiser_id

        // Guardar en cache
        await supabase
          .from('config_meli')
          .upsert({ clave: 'advertiser_id', valor: String(advertiserId) }, { onConflict: 'clave' })
      } else {
        return { success: false, error: 'No se encontró advertiser_id en la respuesta' }
      }
    }

    console.log(`Advertiser ID: ${advertiserId}`)

    // ============================================
    // PASO 2: Obtener costos (INCREMENTAL)
    // - Si hay datos, consultar desde última fecha - 5 días
    // - Si no hay datos, consultar últimos 90 días
    // ============================================
    const hoy = new Date()
    let fechaDesde: Date

    // Buscar última fecha guardada
    const { data: ultimoCosto } = await supabase
      .from('costos_publicidad')
      .select('fecha')
      .order('fecha', { ascending: false })
      .limit(1)
      .single()

    if (ultimoCosto?.fecha) {
      // Sync incremental: desde última fecha - 5 días de margen
      fechaDesde = new Date(ultimoCosto.fecha)
      fechaDesde.setDate(fechaDesde.getDate() - 5)
      console.log(`Sync incremental desde: ${fechaDesde.toISOString().split('T')[0]} (última fecha - 5 días)`)
    } else {
      // Primera vez: últimos 90 días
      fechaDesde = new Date()
      fechaDesde.setDate(hoy.getDate() - 89)
      console.log('Primera sincronización: últimos 90 días')
    }

    const dateFrom = fechaDesde.toISOString().split('T')[0]
    const dateTo = hoy.toISOString().split('T')[0]

    const costsUrl = `${ML_API_BASE}/advertising/advertisers/${advertiserId}/product_ads/campaigns?date_from=${dateFrom}&date_to=${dateTo}&metrics=cost&aggregation_type=DAILY`

    const costsResponse = await fetch(costsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'api-version': '2'
      }
    })

    if (!costsResponse.ok) {
      console.error('Error obteniendo costos de ads:', await costsResponse.text())
      return { success: false, error: 'No se pudieron obtener los costos de publicidad' }
    }

    const costsData = await costsResponse.json()

    if (!costsData.results || costsData.results.length === 0) {
      console.log('La API de Ads no devolvió resultados de costos')
      return { success: true, updated: 0, message: 'Sin datos de publicidad' }
    }

    // ============================================
    // PASO 3: Procesar costos y aplicar IVA
    // ============================================
    const costosMap: { [fecha: string]: number } = {}

    for (const dia of costsData.results) {
      const costoSinIva = parseFloat(dia.cost) || 0
      const costoConIva = costoSinIva * 1.21
      costosMap[dia.date] = Math.round(costoConIva * 100) / 100
    }

    // ============================================
    // PASO 4: Rellenar días faltantes con último valor conocido
    // La API de ML tiene delay de ~2 días, usamos el último valor disponible
    // ============================================
    const fechasConDatos = Object.keys(costosMap).sort()

    if (fechasConDatos.length > 0) {
      const ultimaFechaConDatos = fechasConDatos[fechasConDatos.length - 1]

      // Generar todos los días desde fechaDesde hasta hoy
      const todasLasFechas: string[] = []
      const fechaActual = new Date(fechaDesde)

      while (fechaActual <= hoy) {
        todasLasFechas.push(fechaActual.toISOString().split('T')[0])
        fechaActual.setDate(fechaActual.getDate() + 1)
      }

      // Rellenar días sin datos con el último valor conocido
      let ultimoValorConocido = 0
      for (const fecha of todasLasFechas) {
        if (costosMap[fecha] !== undefined) {
          ultimoValorConocido = costosMap[fecha]
        } else if (fecha > ultimaFechaConDatos) {
          // Solo rellenar días POSTERIORES al último dato real
          costosMap[fecha] = ultimoValorConocido
          console.log(`Día ${fecha} sin datos, usando último valor: ${ultimoValorConocido}`)
        }
      }
    }

    // ============================================
    // PASO 5: Guardar en Supabase (upsert)
    // ============================================
    let updated = 0

    for (const [fecha, costo] of Object.entries(costosMap)) {
      const { error } = await supabase
        .from('costos_publicidad')
        .upsert(
          { fecha: fecha, costo_diario: costo },
          { onConflict: 'fecha' }
        )

      if (!error) updated++
    }

    console.log(`Sincronizados ${updated} registros de costos de publicidad`)

    return {
      success: true,
      updated,
      fechaDesde: dateFrom,
      fechaHasta: dateTo,
      diasConDatosReales: costsData.results.length
    }

  } catch (error) {
    console.error('Error en syncAds:', error)
    return { success: false, error: (error as Error).message }
  }
}

// ============================================
// ACTUALIZAR STOCK (Enviar cambios de stock a ML)
// Replica la lógica de GAS: actualizarStockYFlexEnLote()
// - Actualiza stock en depósito via /user-products/{id}/stock
// - Actualiza estado (pausar/activar) via /items/{id}
// - Actualiza Flex via shipping configuration
// ============================================
interface CambioStock {
  itemId: string
  sku: string
  userProductId: string
  stockCambiado: boolean
  nuevoStock: number
  flexCambiado: boolean
  nuevoFlex: boolean
  estadoCambiado: boolean
  nuevoEstado: string
}

async function updateStock(supabase: any, accessToken: string, cambios: CambioStock[]) {
  if (!cambios || cambios.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No se recibieron cambios para procesar' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const resultados = {
    exitosos: [] as { itemId: string, sku: string }[],
    fallidos: [] as { itemId: string, sku: string, error: string }[]
  }

  console.log(`Iniciando actualización de stock para ${cambios.length} items...`)

  for (const cambio of cambios) {
    try {
      // ============================================
      // Tarea 1: Actualizar Estado (Activa/Pausada)
      // ============================================
      if (cambio.estadoCambiado) {
        console.log(`Actualizando estado para ${cambio.itemId}: ${cambio.nuevoEstado}`)

        const estadoResponse = await fetch(`${ML_API_BASE}/items/${cambio.itemId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: cambio.nuevoEstado })
        })

        if (!estadoResponse.ok) {
          const errorData = await estadoResponse.json()
          throw new Error(`Error actualizando estado: ${errorData.message || 'Error desconocido'}`)
        }
      }

      // ============================================
      // Tarea 2: Actualizar Stock del Depósito
      // Endpoint: PUT /user-products/{userProductId}/stock
      // ============================================
      if (cambio.stockCambiado && cambio.userProductId) {
        console.log(`Actualizando stock para ${cambio.itemId}: ${cambio.nuevoStock} unidades`)

        const stockResponse = await fetch(`${ML_API_BASE}/user-products/${cambio.userProductId}/stock`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            locations: [{ type: 'selling_address', quantity: cambio.nuevoStock }]
          })
        })

        if (!stockResponse.ok) {
          const errorData = await stockResponse.json()
          throw new Error(`Error actualizando stock: ${errorData.message || 'Error desconocido'}`)
        }

        // Actualizar en Supabase
        await supabase
          .from('publicaciones_meli')
          .update({ stock_deposito: cambio.nuevoStock })
          .eq('id_publicacion', cambio.itemId)
      }

      // ============================================
      // Tarea 3: Actualizar Flex
      // Requiere leer shipping actual y modificar tags
      // ============================================
      if (cambio.flexCambiado) {
        console.log(`Actualizando Flex para ${cambio.itemId}: ${cambio.nuevoFlex}`)

        // Leer configuración actual del shipping
        const itemResponse = await fetch(
          `${ML_API_BASE}/items/${cambio.itemId}?attributes=shipping`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        )

        if (itemResponse.ok) {
          const itemData = await itemResponse.json()
          const shippingOriginal = itemData.shipping || {}
          let tags = shippingOriginal.tags || []

          // Agregar o quitar el tag de Flex
          if (cambio.nuevoFlex && !tags.includes('self_service_in')) {
            tags.push('self_service_in')
          } else if (!cambio.nuevoFlex) {
            tags = tags.filter((t: string) => t !== 'self_service_in')
          }

          // Enviar actualización
          const flexResponse = await fetch(`${ML_API_BASE}/items/${cambio.itemId}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              shipping: { ...shippingOriginal, tags }
            })
          })

          if (flexResponse.ok) {
            // Actualizar en Supabase
            await supabase
              .from('publicaciones_meli')
              .update({ tiene_flex: cambio.nuevoFlex })
              .eq('id_publicacion', cambio.itemId)
          }
        }
      }

      resultados.exitosos.push({ itemId: cambio.itemId, sku: cambio.sku })

    } catch (error) {
      console.error(`Error procesando ${cambio.itemId}:`, error)
      resultados.fallidos.push({
        itemId: cambio.itemId,
        sku: cambio.sku,
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
