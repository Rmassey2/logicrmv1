import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const contactId = searchParams.get('contactId')

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  // Debug: check env vars
  if (!serviceKey || !supabaseUrl) {
    return Response.json({
      error: 'Missing env vars',
      hasServiceKey: !!serviceKey,
      hasSupabaseUrl: !!supabaseUrl,
    })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // Query 1: All campaign_contacts (no filter) — see what's in the table
  const { data: allRows, error: allErr } = await supabase
    .from('campaign_contacts')
    .select('id, contact_id, campaign_id, status, user_id, created_at')
    .limit(10)

  // Query 2: If contactId provided, filter by it
  let filtered = null
  let filteredErr = null
  if (contactId) {
    const res = await supabase
      .from('campaign_contacts')
      .select('id, contact_id, campaign_id, status, user_id, created_at')
      .eq('contact_id', contactId)
    filtered = res.data
    filteredErr = res.error
  }

  // Query 3: All campaign_contacts count
  const { count } = await supabase
    .from('campaign_contacts')
    .select('id', { count: 'exact', head: true })

  return Response.json({
    contactId,
    totalRows: count,
    first10Rows: allRows,
    first10Error: allErr?.message ?? null,
    filteredByContact: filtered,
    filteredError: filteredErr?.message ?? null,
    filteredCount: filtered?.length ?? 0,
  })
}
