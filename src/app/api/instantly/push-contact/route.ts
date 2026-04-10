import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY
const INSTANTLY_BASE = 'https://api.instantly.ai/api/v2'

export async function POST(req: NextRequest) {
  try {
    const { contact_id, instantly_campaign_id } = await req.json()

    console.log('[push-contact] Input:', { contact_id, instantly_campaign_id })

    if (!contact_id || !instantly_campaign_id) {
      return NextResponse.json({ error: 'contact_id and instantly_campaign_id are required' }, { status: 400 })
    }

    if (!INSTANTLY_API_KEY) {
      return NextResponse.json({ error: 'INSTANTLY_API_KEY not configured' }, { status: 500 })
    }

    const { data: contact, error: fetchErr } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, email2, phone, cell_phone, company')
      .eq('id', contact_id)
      .single()

    if (fetchErr || !contact) {
      console.error('[push-contact] Contact fetch failed:', fetchErr)
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const email = contact.email?.trim()
    if (!email) {
      return NextResponse.json({
        error: 'Cannot add to Instantly — contact has no email address. Add an email to this contact first.',
      }, { status: 400 })
    }

    // Instantly v2 POST /leads expects a flat lead object with campaign_id
    const payload = {
      email: email,
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      company_name: contact.company || '',
      company: contact.company || '',
      phone: contact.phone || contact.cell_phone || '',
      campaign: instantly_campaign_id,
    }

    console.log('[push-contact] Sending to Instantly:', JSON.stringify(payload))

    const instantlyRes = await fetch(`${INSTANTLY_BASE}/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INSTANTLY_API_KEY}`,
      },
      body: JSON.stringify(payload),
    })

    const responseText = await instantlyRes.text()
    console.log('[push-contact] Instantly response status:', instantlyRes.status)
    console.log('[push-contact] Instantly response body:', responseText)

    if (!instantlyRes.ok) {
      // Try the batch format as fallback
      console.log('[push-contact] Single format failed, trying batch format...')
      const batchPayload = {
        campaign_id: instantly_campaign_id,
        leads: [{ email, first_name: contact.first_name || '', last_name: contact.last_name || '', company_name: contact.company || '' }],
      }
      console.log('[push-contact] Batch payload:', JSON.stringify(batchPayload))

      const batchRes = await fetch(`${INSTANTLY_BASE}/leads/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${INSTANTLY_API_KEY}`,
        },
        body: JSON.stringify(batchPayload),
      })

      const batchText = await batchRes.text()
      console.log('[push-contact] Batch response status:', batchRes.status)
      console.log('[push-contact] Batch response body:', batchText)

      if (!batchRes.ok) {
        return NextResponse.json({
          error: `Instantly API error: single=${instantlyRes.status} batch=${batchRes.status} — ${batchText || responseText}`,
        }, { status: 500 })
      }

      let batchData = null
      try { batchData = JSON.parse(batchText) } catch { /* ok */ }
      return NextResponse.json({ success: true, method: 'batch', instantly_response: batchData })
    }

    let responseData = null
    try { responseData = JSON.parse(responseText) } catch { /* ok */ }
    console.log('[push-contact] Success:', responseData)
    return NextResponse.json({ success: true, method: 'single', instantly_response: responseData })
  } catch (err) {
    console.error('[push-contact] Unhandled error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
