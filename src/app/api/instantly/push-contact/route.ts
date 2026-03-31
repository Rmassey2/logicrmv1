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
    console.log('[push-contact] API key exists:', !!INSTANTLY_API_KEY)
    console.log('[push-contact] API key length:', INSTANTLY_API_KEY?.length)

    if (!contact_id || !instantly_campaign_id) {
      return NextResponse.json({ error: 'contact_id and instantly_campaign_id are required' }, { status: 400 })
    }

    if (!INSTANTLY_API_KEY) {
      return NextResponse.json({ error: 'INSTANTLY_API_KEY not configured' }, { status: 500 })
    }

    const { data: contact, error: fetchErr } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company')
      .eq('id', contact_id)
      .single()

    if (fetchErr || !contact) {
      console.error('[push-contact] Contact fetch failed:', fetchErr)
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    if (!contact.email) {
      return NextResponse.json({ error: 'Contact has no email address' }, { status: 400 })
    }

    // Build the exact payload for Instantly v2
    const payload = {
      campaign_id: instantly_campaign_id,
      leads: [
        {
          email: contact.email,
          first_name: contact.first_name || '',
          last_name: contact.last_name || '',
          company_name: contact.company || '',
        },
      ],
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
      return NextResponse.json({
        error: `Instantly API error: ${instantlyRes.status} — ${responseText}`,
      }, { status: 500 })
    }

    // Parse response
    let responseData = null
    try { responseData = JSON.parse(responseText) } catch { /* non-JSON ok */ }

    console.log('[push-contact] Success! Parsed response:', responseData)
    return NextResponse.json({ success: true, instantly_response: responseData })
  } catch (err) {
    console.error('[push-contact] Unhandled error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
