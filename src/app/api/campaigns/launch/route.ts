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
    const effectiveAction = action || 'launch'
    console.log('[launch] Step 1 - Request:', { campaign_id, action: effectiveAction })

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
    if (effectiveAction === 'pause') {
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

    // Handle resume action
    if (effectiveAction === 'resume') {
      if (!campaign.instantly_campaign_id) {
        return NextResponse.json({ error: 'Campaign not linked to Instantly' }, { status: 400 })
      }

      const { launchCampaign: activateCampaign } = await import('@/lib/instantly')
      const resumeRes = await activateCampaign(campaign.instantly_campaign_id)
      if (!resumeRes.ok) {
        return NextResponse.json({ error: `Resume failed: ${resumeRes.error}` }, { status: 500 })
      }

      await supabase
        .from('email_campaigns')
        .update({ status: 'active' })
        .eq('id', campaign_id)

      return NextResponse.json({ success: true, status: 'active' })
    }

    // Handle submit for approval
    if (effectiveAction === 'submit_approval') {
      console.log('[launch] Submit for approval:', campaign_id)
      const { error: submitErr } = await supabase
        .from('email_campaigns')
        .update({ approval_status: 'pending', submitted_at: new Date().toISOString() })
        .eq('id', campaign_id)
      if (submitErr) {
        console.error('[launch] Submit approval failed:', submitErr.message)
        return NextResponse.json({ error: submitErr.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, status: 'pending' })
    }

    // ── New campaign launch flow ──────────────────────────────────────────
    console.log('[launch] Starting new campaign launch for:', campaign.name)

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

    // 4a. Build email signature entirely from the campaign owner's auth metadata (per-user)
    const formatPhone = (raw: string) => {
      const digits = (raw || '').replace(/\D/g, '')
      if (digits.length === 10) return digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
      if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1).replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
      return digits || (raw || '').trim()
    }
    const cleanWebsite = (raw: string) => (raw || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')

    const campaignUserId = campaign.user_id
    let signature = ''
    let sigName = ''
    let sendingEmail = ''
    if (campaignUserId) {
      // Fetch campaign OWNER's profile — must use admin.getUserById with service role
      const { data: ownerUser } = await supabase.auth.admin.getUserById(campaignUserId)
      const meta = ownerUser?.user?.user_metadata ?? {}
      console.log('[launch] Owner user_id:', campaignUserId, 'email:', ownerUser?.user?.email, 'meta keys:', Object.keys(meta))

      sigName = [meta.first_name, meta.last_name].filter(Boolean).join(' ')
      sendingEmail = meta.sending_email || ''
      const sigCompany = meta.company_name || ''
      const sigPhone = formatPhone(meta.phone || '')
      const sigEmail = ownerUser?.user?.email || ''
      const sigWebsite = cleanWebsite(meta.website || '')

      const sigLines = [sigName, sigCompany, sigPhone, sigEmail, sigWebsite].filter(Boolean)
      if (sigLines.length > 0) {
        signature = '\n\n' + sigLines.join('\n') + '\n\n\n'
      }
      console.log('[launch] Signature built from owner:', sigName, '| phone:', sigPhone, '| email:', sigEmail)
    }

    // 4. Create campaign in Instantly.ai (placeholder subject/body — will be overwritten by PATCH with full sequences)
    const createRes = await createCampaign(
      campaign.name,
      'Sequence loading...',
      'This will be replaced by the email sequence.',
      sigName,
      sendingEmail || undefined
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

    // 4b. Fetch email sequences and push to Instantly via PATCH /campaigns/:id
    const { data: sequences, error: seqError } = await supabase
      .from('email_sequences')
      .select('touch_number, day_number, subject, body, label')
      .eq('campaign_id', campaign_id)
      .order('touch_number', { ascending: true })

    console.log('[launch] Step 4b - Sequences from DB:', { count: sequences?.length, error: seqError?.message })

    // Build steps array from email_sequences or fallback to parsing campaign.body
    // Hardcoded delay schedule: days between each touch
    const DELAY_SCHEDULE = [2, 2, 2, 3, 4, 4, 5] // All touches start with 2-day minimum delay
    interface SeqStep { subject: string; body: string; delay: number }
    const steps: SeqStep[] = []

    if (sequences && sequences.length > 0) {
      for (let i = 0; i < sequences.length; i++) {
        const seq = sequences[i]
        // Use day_number diff if available, otherwise use hardcoded schedule
        let delay = DELAY_SCHEDULE[i] ?? 3
        if (i > 0 && seq.day_number && sequences[i - 1]?.day_number) {
          delay = Math.max(seq.day_number - sequences[i - 1].day_number, 1)
        }
        // First touch uses DELAY_SCHEDULE[0] (2 days), not 0
        steps.push({
          subject: seq.subject || `Touch ${seq.touch_number}`,
          body: seq.body || '',
          delay,
        })
      }
    } else if (campaign.body) {
      const touches = campaign.body.split(/---\s*Touch\s+/).filter(Boolean)
      let idx = 0
      for (const block of touches) {
        const headerMatch = block.match(/^(\d+)\s*\(Day\s*(\d+)\):\s*(.+?)\s*---\s*\n/)
        if (!headerMatch) continue
        const rest = block.slice(headerMatch[0].length)
        const subjectMatch = rest.match(/^Subject:\s*(.+)\n\n/)
        const subject = subjectMatch ? subjectMatch[1].trim() : `Touch ${headerMatch[1]}`
        const bodyText = subjectMatch ? rest.slice(subjectMatch[0].length).trim() : rest.trim()
        const delay = DELAY_SCHEDULE[idx] ?? 3
        steps.push({ subject, body: bodyText, delay })
        idx++
      }
    }

    console.log('[launch] Step 4b - Built steps:', steps.length)
    for (let i = 0; i < steps.length; i++) {
      console.log(`[launch] Step ${i + 1}: subject="${steps[i].subject.slice(0, 50)}" delay=${steps[i].delay} bodyLen=${steps[i].body.length}`)
    }

    if (steps.length > 0) {
      // Instantly v2: PATCH /campaigns/:id with sequences array
      // sequences is an array with ONE item containing steps
      const patchPayload = {
        sequences: [
          {
            steps: steps.map((s, i) => ({
              type: 'email',
              delay: DELAY_SCHEDULE[i] ?? s.delay,
              variants: [
                {
                  subject: s.subject,
                  body: s.body.includes(sigName) ? s.body : s.body + signature,
                },
              ],
            })),
          },
        ],
      }

      console.log('[launch] Step 4b - PATCH sequences count:', patchPayload.sequences[0].steps.length)
      console.log('[launch] Step 4b - Step subjects:', patchPayload.sequences[0].steps.map((s, i) => `${i + 1}: ${s.variants[0].subject.slice(0, 40)} (delay: ${s.delay})`))
      console.log('[launch] Step 4b - PATCH payload size:', JSON.stringify(patchPayload).length, 'chars')

      try {
        const patchRes = await fetch(`https://api.instantly.ai/api/v2/campaigns/${instantlyCampaignId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.INSTANTLY_API_KEY}`,
          },
          body: JSON.stringify(patchPayload),
        })
        const patchText = await patchRes.text()
        console.log('[launch] Step 4b - PATCH response status:', patchRes.status)
        console.log('[launch] Step 4b - PATCH response body:', patchText.slice(0, 500))

        if (!patchRes.ok) {
          console.error('[launch] Step 4b - Sequence PATCH failed:', patchRes.status, patchText)
        }
      } catch (err) {
        console.error('[launch] Step 4b - Sequence PATCH error:', err)
      }
    }

    // 5. Add leads to Instantly — ensure merge-tag variables (first_name / last_name / company_name) populate
    const leads: InstantlyLead[] = contacts.map(c => ({
      email: c.email!,
      firstName: (c.first_name || '').trim(),
      lastName: (c.last_name || '').trim(),
      companyName: (c.company || '').trim(),
    }))
    console.log('[launch] Lead payload sample:', leads.slice(0, 3))

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
