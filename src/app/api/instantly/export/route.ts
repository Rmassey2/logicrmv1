import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createCampaign, addLeadsToCampaign, type InstantlyLead } from '@/lib/instantly'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { contact_ids, campaign_name } = await req.json()

    if (!contact_ids || contact_ids.length === 0) {
      return NextResponse.json({ error: 'No contacts selected' }, { status: 400 })
    }

    // Fetch contacts
    const { data: contacts, error: fetchErr } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, company')
      .in('id', contact_ids)

    if (fetchErr || !contacts) {
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
    }

    const withEmail = contacts.filter(c => c.email && c.email.trim() !== '')
    if (withEmail.length === 0) {
      return NextResponse.json({ error: 'No contacts have email addresses. Instantly requires an email to add a lead.' }, { status: 400 })
    }
    console.log('[export] Valid contacts with email:', withEmail.length, 'of', contacts.length)

    // Create draft campaign in Instantly
    const name = campaign_name || `LogiCRM Export — ${new Date().toLocaleDateString()}`
    const createRes = await createCampaign(name, 'Draft subject', 'Draft body')

    if (!createRes.ok || !createRes.data?.id) {
      console.error('Instantly create failed:', createRes.error)
      return NextResponse.json({ error: `Instantly error: ${createRes.error}` }, { status: 500 })
    }

    const campaignId = createRes.data.id

    // Add leads
    const leads: InstantlyLead[] = withEmail.map(c => ({
      email: c.email!,
      firstName: c.first_name ?? undefined,
      lastName: c.last_name ?? undefined,
      companyName: c.company ?? undefined,
    }))

    const leadsRes = await addLeadsToCampaign(campaignId, leads)
    if (!leadsRes.ok) {
      console.error('Instantly leads failed:', leadsRes.error)
    }

    return NextResponse.json({
      success: true,
      instantly_campaign_id: campaignId,
      leads_exported: leads.length,
      campaign_name: name,
    })
  } catch (err) {
    console.error('Instantly export error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
