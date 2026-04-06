import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const contactId = searchParams.get('contactId')

  if (!contactId) return NextResponse.json({ error: 'Missing contactId' }, { status: 400 })

  // Fetch campaign_contacts with campaign names
  const { data: enrollments, error: enrollErr } = await supabase
    .from('campaign_contacts')
    .select('id, status, created_at, campaign_id')
    .eq('contact_id', contactId)
    .neq('status', 'removed')

  if (enrollErr) return NextResponse.json({ error: enrollErr.message }, { status: 500 })
  if (!enrollments || enrollments.length === 0) return NextResponse.json({ data: [] })

  // Fetch campaign names
  const campIds = Array.from(new Set(enrollments.map(e => e.campaign_id)))
  const { data: camps } = await supabase
    .from('email_campaigns')
    .select('id, name, status')
    .in('id', campIds)

  const campMap = new Map((camps ?? []).map(c => [c.id, c]))

  const data = enrollments.map(e => ({
    id: e.id,
    campaign_id: e.campaign_id,
    status: e.status,
    created_at: e.created_at,
    campaign_name: campMap.get(e.campaign_id)?.name || 'Unknown',
    campaign_status: campMap.get(e.campaign_id)?.status || 'draft',
  }))

  return NextResponse.json({ data })
}
