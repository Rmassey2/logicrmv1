import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addLeadsToCampaign, type InstantlyLead } from '@/lib/instantly'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { contact_id, instantly_campaign_id } = await req.json()

    if (!contact_id || !instantly_campaign_id) {
      return NextResponse.json({ error: 'contact_id and instantly_campaign_id are required' }, { status: 400 })
    }

    const { data: contact, error: fetchErr } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company')
      .eq('id', contact_id)
      .single()

    if (fetchErr || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    if (!contact.email) {
      return NextResponse.json({ error: 'Contact has no email address' }, { status: 400 })
    }

    const lead: InstantlyLead = {
      email: contact.email,
      firstName: contact.first_name ?? undefined,
      lastName: contact.last_name ?? undefined,
      companyName: contact.company ?? undefined,
    }

    console.log('[push-contact] Pushing to Instantly:', {
      contact_id,
      instantly_campaign_id,
      email: contact.email,
      name: `${contact.first_name} ${contact.last_name}`,
    })

    const result = await addLeadsToCampaign(instantly_campaign_id, [lead])

    if (!result.ok) {
      console.error('[push-contact] Instantly push failed:', result.error)
      return NextResponse.json({ error: result.error ?? 'Instantly push failed' }, { status: 500 })
    }

    console.log('[push-contact] Success:', result.data)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Push contact error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
