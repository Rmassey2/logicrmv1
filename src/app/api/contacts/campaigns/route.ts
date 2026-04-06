import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl) {
      return NextResponse.json({ error: 'SUPABASE_URL not configured' }, { status: 500 })
    }

    // Use service role key if available, fall back to anon key
    const key = serviceKey || anonKey
    if (!key) {
      return NextResponse.json({ error: 'No Supabase key configured' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, key)

    const { searchParams } = new URL(req.url)
    const contactId = searchParams.get('contactId')

    if (!contactId) return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })

    // Count total rows in table
    const { count } = await supabase
      .from('campaign_contacts')
      .select('id', { count: 'exact', head: true })

    // Fetch rows for this contact
    const { data: enrollments, error: enrollErr } = await supabase
      .from('campaign_contacts')
      .select('id, status, created_at, campaign_id')
      .eq('contact_id', contactId)

    console.log('[contacts/campaigns] key type:', serviceKey ? 'service_role' : 'anon')
    console.log('[contacts/campaigns] contactId:', contactId)
    console.log('[contacts/campaigns] total rows in table:', count)
    console.log('[contacts/campaigns] rows for this contact:', enrollments?.length ?? 0)
    console.log('[contacts/campaigns] raw data:', JSON.stringify(enrollments))
    console.log('[contacts/campaigns] error:', enrollErr)

    if (enrollErr) {
      return NextResponse.json({ error: enrollErr.message, debug: { totalRows: count, keyType: serviceKey ? 'service_role' : 'anon' } }, { status: 500 })
    }

    // Filter out 'removed' in JS so NULL status rows are included
    const active = (enrollments ?? []).filter(e => e.status !== 'removed')

    if (active.length === 0) {
      return NextResponse.json({ data: [], debug: { totalRows: count, rawForContact: enrollments?.length ?? 0, keyType: serviceKey ? 'service_role' : 'anon' } })
    }

    // Fetch campaign names
    const campIds = Array.from(new Set(active.map(e => e.campaign_id)))
    const { data: camps } = await supabase
      .from('email_campaigns')
      .select('id, name, status')
      .in('id', campIds)

    const campMap = new Map((camps ?? []).map(c => [c.id, c]))

    const data = active.map(e => ({
      id: e.id,
      campaign_id: e.campaign_id,
      status: e.status,
      created_at: e.created_at,
      campaign_name: campMap.get(e.campaign_id)?.name || 'Unknown',
      campaign_status: campMap.get(e.campaign_id)?.status || 'draft',
    }))

    return NextResponse.json({ data, debug: { totalRows: count, rawForContact: enrollments?.length ?? 0, activeCount: active.length, keyType: serviceKey ? 'service_role' : 'anon' } })
  } catch (err) {
    console.error('[contacts/campaigns] Unhandled error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
