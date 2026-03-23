import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCampaignAnalytics } from '@/lib/instantly'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { campaign_id } = await req.json()
    if (!campaign_id) {
      return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
    }

    const { data: campaign } = await supabase
      .from('email_campaigns')
      .select('instantly_campaign_id')
      .eq('id', campaign_id)
      .single()

    if (!campaign?.instantly_campaign_id) {
      return NextResponse.json({ error: 'Campaign not linked to Instantly' }, { status: 400 })
    }

    const res = await getCampaignAnalytics(campaign.instantly_campaign_id)
    if (!res.ok || !res.data) {
      return NextResponse.json({ error: `Analytics fetch failed: ${res.error}` }, { status: 500 })
    }

    const updates = {
      sent_count: res.data.emails_sent ?? 0,
      open_count: res.data.opens ?? 0,
      reply_count: res.data.replies ?? 0,
      recipient_count: res.data.total_leads ?? undefined,
    }

    await supabase
      .from('email_campaigns')
      .update(updates)
      .eq('id', campaign_id)

    return NextResponse.json({ success: true, ...updates })
  } catch (err) {
    console.error('Sync stats error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
