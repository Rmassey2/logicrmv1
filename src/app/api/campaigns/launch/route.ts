import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createCampaign, addLeadsToCampaign, launchCampaign, type InstantlyLead } from '@/lib/instantly'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { campaign_id, action } = await req.json()
    if (!campaign_id) {
      return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
    }

    // Load campaign
    const { data: campaign, error: campError } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single()

    if (campError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Handle pause action
    if (action === 'pause') {
      if (!campaign.instantly_campaign_id) {
        return NextResponse.json({ error: 'Campaign not linked to Instantly' }, { status: 400 })
      }

      const { pauseCampaign } = await import('@/lib/instantly')
      const pauseRes = await pauseCampaign(campaign.instantly_campaign_id)
      if (!pauseRes.ok) {
        return NextResponse.json({ error: `Pause failed: ${pauseRes.error}` }, { status: 500 })
      }

      await supabase
        .from('email_campaigns')
        .update({ status: 'paused' })
        .eq('id', campaign_id)

      return NextResponse.json({ success: true, status: 'paused' })
    }

    // ── Launch flow ──────────────────────────────────────────────────────

    // Load enrolled contacts
    const { data: enrollments } = await supabase
      .from('campaign_contacts')
      .select('contact_id')
      .eq('campaign_id', campaign_id)

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ error: 'No contacts enrolled' }, { status: 400 })
    }

    const contactIds = enrollments.map(e => e.contact_id)
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company')
      .in('id', contactIds)

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts found' }, { status: 400 })
    }

    // 1. Create campaign in Instantly
    const createRes = await createCampaign(
      campaign.name,
      campaign.subject,
      campaign.body ?? ''
    )

    if (!createRes.ok || !createRes.data?.id) {
      return NextResponse.json({ error: `Instantly create failed: ${createRes.error}` }, { status: 500 })
    }

    const instantlyCampaignId = createRes.data.id

    // 2. Add leads
    const leads: InstantlyLead[] = contacts
      .filter(c => c.email)
      .map(c => ({
        email: c.email!,
        firstName: c.first_name ?? undefined,
        lastName: c.last_name ?? undefined,
        companyName: c.company ?? undefined,
      }))

    if (leads.length > 0) {
      const leadsRes = await addLeadsToCampaign(instantlyCampaignId, leads)
      if (!leadsRes.ok) {
        console.error('Failed to add leads to Instantly:', leadsRes.error)
      }
    }

    // 3. Launch
    const launchRes = await launchCampaign(instantlyCampaignId)
    if (!launchRes.ok) {
      return NextResponse.json({ error: `Instantly launch failed: ${launchRes.error}` }, { status: 500 })
    }

    // 4. Update campaign in Supabase
    await supabase
      .from('email_campaigns')
      .update({
        status: 'active',
        instantly_campaign_id: instantlyCampaignId,
      })
      .eq('id', campaign_id)

    return NextResponse.json({
      success: true,
      instantly_campaign_id: instantlyCampaignId,
      leads_added: leads.length,
    })
  } catch (err) {
    console.error('Campaign launch error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
