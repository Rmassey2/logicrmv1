import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCampaignAnalytics, getCampaignLeads } from '@/lib/instantly'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

    const instantlyId = campaign.instantly_campaign_id

    // Fetch campaign-level analytics
    const analyticsRes = await getCampaignAnalytics(instantlyId)
    console.log('[sync] Analytics response:', JSON.stringify(analyticsRes))

    let sentCount = 0
    let openCount = 0
    let replyCount = 0
    let totalLeads = 0

    if (analyticsRes.ok && analyticsRes.data) {
      // Response is an array — first item is our campaign
      const stats = Array.isArray(analyticsRes.data) ? analyticsRes.data[0] : analyticsRes.data
      if (stats) {
        sentCount = stats.sent ?? stats.leads_contacted ?? 0
        openCount = stats.unique_open ?? stats.open ?? 0
        replyCount = stats.unique_reply ?? stats.reply ?? 0
        totalLeads = stats.total_leads ?? 0
      }
    }

    // Update campaign stats
    const updates: Record<string, number> = {
      sent_count: sentCount,
      open_count: openCount,
      reply_count: replyCount,
    }
    if (totalLeads > 0) updates.recipient_count = totalLeads

    await supabase.from('email_campaigns').update(updates).eq('id', campaign_id)

    // Fetch per-lead status and update campaign_contacts
    const leadsRes = await getCampaignLeads(instantlyId)
    console.log('[sync] Leads response ok:', leadsRes.ok, 'count:', leadsRes.data?.items?.length)

    let contactsUpdated = 0
    if (leadsRes.ok && leadsRes.data?.items) {
      for (const lead of leadsRes.data.items) {
        if (!lead.email) continue

        // Determine status from lead data
        let status = 'enrolled'
        if (lead.email_reply_count && lead.email_reply_count > 0) status = 'replied'
        else if (lead.email_open_count && lead.email_open_count > 0) status = 'opened'
        else if (lead.lead_status === 'Completed' || lead.lead_status === 'Active') status = 'sent'
        else if (lead.lead_status === 'Bounced') status = 'bounced'
        else if (lead.lead_status === 'Unsubscribed') status = 'unsubscribed'

        // Find the contact by email and update their campaign_contacts status
        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', lead.email)
          .limit(1)
          .maybeSingle()

        if (contact) {
          await supabase
            .from('campaign_contacts')
            .update({ status })
            .eq('campaign_id', campaign_id)
            .eq('contact_id', contact.id)
          contactsUpdated++
        }
      }
    }

    console.log('[sync] Updated campaign stats:', updates, 'contacts updated:', contactsUpdated)

    return NextResponse.json({
      success: true,
      ...updates,
      contacts_updated: contactsUpdated,
    })
  } catch (err) {
    console.error('[sync] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
