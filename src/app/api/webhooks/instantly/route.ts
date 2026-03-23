import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Map Instantly event types to our status values
const EVENT_TO_STATUS: Record<string, string> = {
  email_sent: 'sent',
  email_opened: 'opened',
  email_replied: 'replied',
  link_clicked: 'opened',
  email_bounced: 'bounced',
  email_unsubscribed: 'unsubscribed',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('Instantly webhook received:', JSON.stringify(body))

    const eventType = body.event_type ?? body.event ?? body.type
    const email = body.email ?? body.lead_email ?? body.data?.email
    const campaignId = body.campaign_id ?? body.data?.campaign_id

    if (!eventType || !email) {
      return NextResponse.json({ ok: true, skipped: 'missing event_type or email' })
    }

    const newStatus = EVENT_TO_STATUS[eventType]
    if (!newStatus) {
      return NextResponse.json({ ok: true, skipped: `unhandled event: ${eventType}` })
    }

    // Find the campaign in our DB by instantly_campaign_id
    let dbCampaignId: string | null = null

    if (campaignId) {
      const { data: camp } = await supabase
        .from('email_campaigns')
        .select('id')
        .eq('instantly_campaign_id', campaignId)
        .maybeSingle()
      dbCampaignId = camp?.id ?? null
    }

    // Find the contact by email
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', email)
      .limit(1)
      .maybeSingle()

    if (!contact) {
      return NextResponse.json({ ok: true, skipped: `contact not found for ${email}` })
    }

    // Update campaign_contacts status
    let query = supabase
      .from('campaign_contacts')
      .update({ status: newStatus })
      .eq('contact_id', contact.id)

    if (dbCampaignId) {
      query = query.eq('campaign_id', dbCampaignId)
    }

    const { error } = await query

    if (error) {
      console.error('Webhook status update failed:', error)
    }

    return NextResponse.json({ ok: true, status: newStatus, contact_id: contact.id })
  } catch (err) {
    console.error('Instantly webhook error:', err)
    return NextResponse.json({ ok: true, error: String(err) })
  }
}
