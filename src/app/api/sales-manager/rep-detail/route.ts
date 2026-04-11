import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company')
      .eq('user_id', userId)
      .order('first_name')

    // Deals with stages
    const { data: rawDeals } = await supabase
      .from('leads')
      .select('id, title, value, contact_id, created_at, pipeline_stages(name, color)')
      .eq('user_id', userId)

    // Last activity per contact for deals
    const contactIds = (rawDeals || []).filter(d => d.contact_id).map(d => d.contact_id)
    const { data: dealActs } = contactIds.length > 0
      ? await supabase.from('activities').select('contact_id, created_at').in('contact_id', contactIds).order('created_at', { ascending: false })
      : { data: [] }

    const lastActMap: Record<string, string> = {}
    for (const a of (dealActs || [])) {
      if (a.contact_id && !lastActMap[a.contact_id]) lastActMap[a.contact_id] = a.created_at
    }

    const deals = (rawDeals || []).map(d => {
      const ps = d.pipeline_stages
      const stage = ps ? (Array.isArray(ps) ? ps[0] : ps) : null
      const lastAct = d.contact_id ? lastActMap[d.contact_id] || null : null
      const daysInactive = lastAct ? Math.floor((Date.now() - new Date(lastAct).getTime()) / 86400000) : 999
      return {
        id: d.id,
        title: d.title,
        value: d.value,
        stageName: (stage as { name?: string } | null)?.name || 'Unknown',
        stageColor: (stage as { color?: string } | null)?.color || '#6b7280',
        daysInactive,
      }
    })

    // Activities (last 30)
    const { data: rawActivities } = await supabase
      .from('activities')
      .select('id, type, subject, contact_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)

    const contactMap = new Map((contacts || []).map(c => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim()]))

    const activities = (rawActivities || []).map(a => ({
      id: a.id,
      type: a.type,
      subject: a.subject,
      contactName: a.contact_id ? contactMap.get(a.contact_id) || '' : '',
      createdAt: a.created_at,
    }))

    // Campaigns with enrolled contact count
    const { data: campContacts } = await supabase
      .from('campaign_contacts')
      .select('campaign_id')
      .eq('user_id', userId)
      .eq('status', 'active')

    const campCounts: Record<string, number> = {}
    for (const cc of (campContacts || [])) {
      campCounts[cc.campaign_id] = (campCounts[cc.campaign_id] || 0) + 1
    }

    const campIds = Object.keys(campCounts)
    let campaigns: { id: string; name: string; status: string; enrolled: number }[] = []
    if (campIds.length > 0) {
      const { data: camps } = await supabase
        .from('email_campaigns')
        .select('id, name, status')
        .in('id', campIds)
      campaigns = (camps || []).map(c => ({
        id: c.id,
        name: c.name,
        status: c.status || 'draft',
        enrolled: campCounts[c.id] || 0,
      }))
    }

    return NextResponse.json({ contacts: contacts || [], deals, activities, campaigns })
  } catch (err) {
    console.error('[rep-detail] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
