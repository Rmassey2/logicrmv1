import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createCampaign, addLeadsToCampaign, launchCampaign, type InstantlyLead } from '@/lib/instantly'

// Use service role key to bypass RLS in server-side API routes.
// Falls back to anon key if service role key is not set.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // 1. Read campaign_id from request body
    const body = await req.json()
    const { campaign_id, action } = body
    console.log('[launch] Step 1 - Request body:', { campaign_id, action })

    if (!campaign_id) {
      return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
    }

    // 2. Query email_campaigns where id = campaign_id
    const { data: campaign, error: campError } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single()

    console.log('[launch] Step 2 - Campaign query:', {
      found: !!campaign,
      name: campaign?.name,
      error: campError?.message,
      code: campError?.code,
    })

    if (campError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found', details: campError?.message, code: campError?.code },
        { status: 404 }
      )
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

    // 3. Query campaign_contacts joined with contacts
    const { data: enrollments, error: enrollError } = await supabase
      .from('campaign_contacts')
      .select('contact_id, contacts(id, first_name, last_name, email, company)')
      .eq('campaign_id', campaign_id)

    console.log('[launch] Step 3 - Enrollments:', {
      count: enrollments?.length,
      error: enrollError?.message,
    })

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json(
        { error: 'No contacts enrolled', details: enrollError?.message },
        { status: 400 }
      )
    }

    // Flatten joined contacts
    const contacts = enrollments
      .map(e => {
        const c = e.contacts as unknown as {
          id: string
          first_name: string | null
          last_name: string | null
          email: string | null
          company: string | null
        } | null
        return c
      })
      .filter((c): c is NonNullable<typeof c> => !!c && !!c.email)

    console.log('[launch] Step 3 - Contacts with email:', contacts.length)

    if (contacts.length === 0) {
      return NextResponse.json({ error: 'No contacts with email found' }, { status: 400 })
    }

    // 4. Create campaign in Instantly.ai
    const createRes = await createCampaign(
      campaign.name,
      campaign.subject,
      campaign.body ?? ''
    )

    console.log('[launch] Step 4 - Instantly create:', {
      ok: createRes.ok,
      id: createRes.data?.id,
      error: createRes.error,
    })

    if (!createRes.ok || !createRes.data?.id) {
      return NextResponse.json({ error: `Instantly create failed: ${createRes.error}` }, { status: 500 })
    }

    const instantlyCampaignId = createRes.data.id

    // 5. Add leads to Instantly
    const leads: InstantlyLead[] = contacts.map(c => ({
      email: c.email!,
      firstName: c.first_name ?? undefined,
      lastName: c.last_name ?? undefined,
      companyName: c.company ?? undefined,
    }))

    const leadsRes = await addLeadsToCampaign(instantlyCampaignId, leads)
    console.log('[launch] Step 5 - Instantly leads:', {
      ok: leadsRes.ok,
      error: leadsRes.error,
      count: leads.length,
    })

    // Activate campaign
    const activateRes = await launchCampaign(instantlyCampaignId)
    console.log('[launch] Step 5 - Instantly activate:', {
      ok: activateRes.ok,
      error: activateRes.error,
    })

    if (!activateRes.ok) {
      return NextResponse.json({ error: `Instantly launch failed: ${activateRes.error}` }, { status: 500 })
    }

    // 6. Update email_campaigns with status and instantly_campaign_id
    const { error: updateError } = await supabase
      .from('email_campaigns')
      .update({
        status: 'active',
        instantly_campaign_id: instantlyCampaignId,
      })
      .eq('id', campaign_id)

    console.log('[launch] Step 6 - Update campaign:', {
      instantly_campaign_id: instantlyCampaignId,
      updateError: updateError?.message,
    })

    return NextResponse.json({
      success: true,
      instantly_campaign_id: instantlyCampaignId,
      leads_added: leads.length,
    })
  } catch (err) {
    console.error('[launch] Unhandled error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
