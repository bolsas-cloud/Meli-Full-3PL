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

    const { action, fechaDesde } = await req.json()

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

      // Obtener detalles de cada item
      for (const itemId of itemIds) {
        try {
          // Obtener datos del item
          const itemResponse = await fetch(
            `${ML_API_BASE}/items/${itemId}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          )

          if (!itemResponse.ok) continue

          const item = await itemResponse.json()

          // Obtener stock de Full
          const inventoryId = item.inventory_id
          let stockFull = 0
          let stockTransito = 0

          if (inventoryId) {
            const stockResponse = await fetch(
              `${ML_API_BASE}/inventories/${inventoryId}/stock/fulfillment`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } }
            )

            if (stockResponse.ok) {
              const stockData = await stockResponse.json()
              stockFull = stockData.available_quantity || 0
              stockTransito = stockData.in_transit_quantity || 0
            }
          }

          // Actualizar en Supabase
          const { error } = await supabase
            .from('publicaciones_meli')
            .upsert({
              id_publicacion: item.id,
              sku: item.seller_custom_field || item.seller_sku || null,
              titulo: item.title,
              stock_full: stockFull,
              stock_transito: stockTransito,
              id_inventario: inventoryId,
              tipo_logistica: 'fulfillment',
              precio: item.price,
              estado: item.status,
              ultima_sync: new Date().toISOString()
            }, { onConflict: 'id_publicacion' })

          if (!error) updated++

        } catch (itemError) {
          console.error(`Error procesando item ${itemId}:`, itemError)
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

  // Fecha desde (default: últimos 30 días)
  const desde = fechaDesde
    ? new Date(fechaDesde)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

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

        // Procesar cada item de la orden
        for (const item of order.order_items || []) {
          const orderRecord = {
            id_orden: orderId,
            id_item: item.item?.id || null,
            sku: item.item?.seller_sku || item.item?.seller_custom_field || null,
            titulo: item.item?.title || null,
            cantidad: item.quantity || 1,
            precio_unitario: item.unit_price || 0,
            fecha_orden: order.date_created,
            estado_orden: order.status,
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
