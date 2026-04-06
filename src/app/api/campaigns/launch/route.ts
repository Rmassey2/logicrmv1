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

    // 4b. Fetch and push email sequences to Instantly
    const { data: sequences, error: seqError } = await supabase
      .from('email_sequences')
      .select('touch_number, day_number, subject, body, label')
      .eq('campaign_id', campaign_id)
      .order('touch_number', { ascending: true })

    console.log('[launch] Step 4b - Sequences:', {
      count: sequences?.length,
      error: seqError?.message,
    })

    if (sequences && sequences.length > 0) {
      // Also try parsing from campaign.body if no sequences table rows
      for (let i = 0; i < sequences.length; i++) {
        const seq = sequences[i]
        // Calculate delay: day difference from previous step (0 for first)
        const delay = i === 0 ? 0 : (seq.day_number ?? 0) - (sequences[i - 1]?.day_number ?? 0)

        const seqPayload = {
          campaign_id: instantlyCampaignId,
          sequence_number: i + 1,
          subject: seq.subject || `Touch ${seq.touch_number}`,
          body: seq.body || '',
          delay: Math.max(delay, 0),
        }

        console.log(`[launch] Pushing sequence step ${i + 1}:`, seqPayload)

        try {
          const seqRes = await fetch('https://api.instantly.ai/api/v2/campaigns/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.INSTANTLY_API_KEY}`,
            },
            body: JSON.stringify(seqPayload),
          })
          const seqText = await seqRes.text()
          console.log(`[launch] Sequence step ${i + 1} response:`, seqRes.status, seqText)
        } catch (err) {
          console.error(`[launch] Sequence step ${i + 1} failed:`, err)
        }
      }
    } else if (campaign.body) {
      // Fallback: parse concatenated body into touches and push each
      const touches = campaign.body.split(/---\s*Touch\s+/).filter(Boolean)
      let stepNum = 0
      const daySchedule = [1, 3, 5, 8, 12, 16, 21]
      for (const block of touches) {
        const headerMatch = block.match(/^(\d+)\s*\(Day\s*(\d+)\):\s*(.+?)\s*---\s*\n/)
        if (!headerMatch) continue
        const rest = block.slice(headerMatch[0].length)
        const subjectMatch = rest.match(/^Subject:\s*(.+)\n\n/)
        const subject = subjectMatch ? subjectMatch[1].trim() : `Touch ${headerMatch[1]}`
        const bodyText = subjectMatch ? rest.slice(subjectMatch[0].length).trim() : rest.trim()
        const delay = stepNum === 0 ? 0 : (daySchedule[stepNum] ?? 3) - (daySchedule[stepNum - 1] ?? 0)
        stepNum++

        const seqPayload = {
          campaign_id: instantlyCampaignId,
          sequence_number: stepNum,
          subject,
          body: bodyText,
          delay: Math.max(delay, 0),
        }

        console.log(`[launch] Pushing parsed sequence step ${stepNum}:`, seqPayload)

        try {
          const seqRes = await fetch('https://api.instantly.ai/api/v2/campaigns/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.INSTANTLY_API_KEY}`,
            },
            body: JSON.stringify(seqPayload),
          })
          const seqText = await seqRes.text()
          console.log(`[launch] Parsed sequence step ${stepNum} response:`, seqRes.status, seqText)
        } catch (err) {
          console.error(`[launch] Parsed sequence step ${stepNum} failed:`, err)
        }
      }
    }

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
