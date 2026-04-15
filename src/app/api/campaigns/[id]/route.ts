import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id
    const callerId = req.nextUrl.searchParams.get('userId')

    if (!campaignId || !callerId) {
      return NextResponse.json({ error: 'campaign id and userId required' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    const { data: campaign, error: campErr } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (campErr || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Authorization: caller must share an org with the campaign owner, or be admin
    const [{ data: callerMem }, { data: ownerMem }] = await Promise.all([
      supabase.from('organization_members').select('org_id, role').eq('user_id', callerId).maybeSingle(),
      supabase.from('organization_members').select('org_id').eq('user_id', campaign.user_id).maybeSingle(),
    ])

    const isOwner = callerId === campaign.user_id
    const isAdmin = callerMem?.role === 'admin'
    const sameOrg = callerMem?.org_id && ownerMem?.org_id && callerMem.org_id === ownerMem.org_id
    if (!isOwner && !isAdmin && !sameOrg) {
      return NextResponse.json({ error: 'Not authorized to view this campaign' }, { status: 403 })
    }

    const [{ data: sequences }, { data: enrollments }] = await Promise.all([
      supabase
        .from('email_sequences')
        .select('touch_number, day_number, label, subject, body')
        .eq('campaign_id', campaignId)
        .order('touch_number', { ascending: true }),
      supabase
        .from('campaign_contacts')
        .select('id, contact_id, status, user_id')
        .eq('campaign_id', campaignId),
    ])

    const activeEnrollments = (enrollments ?? []).filter((e) => e.status !== 'removed')
    let contacts: { id: string; contact_id: string; first_name: string | null; last_name: string | null; company: string | null; email: string | null; status: string }[] = []
    if (activeEnrollments.length > 0) {
      const contactIds = activeEnrollments.map((e) => e.contact_id)
      const { data: contactData } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, company, email')
        .in('id', contactIds)
      const map = new Map((contactData ?? []).map((c) => [c.id, c]))
      contacts = activeEnrollments.map((e) => {
        const c = map.get(e.contact_id)
        return {
          id: e.id,
          contact_id: e.contact_id,
          first_name: c?.first_name ?? null,
          last_name: c?.last_name ?? null,
          company: c?.company ?? null,
          email: c?.email ?? null,
          status: e.status ?? 'enrolled',
        }
      })
    }

    return NextResponse.json({
      campaign,
      sequences: sequences ?? [],
      contacts,
      viewer: { isAdmin, isOwner, sameOrg: !!sameOrg },
    })
  } catch (err) {
    console.error('[campaigns/[id] GET] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id
    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign id required' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    await supabase.from('email_sequences').delete().eq('campaign_id', campaignId)
    await supabase.from('campaign_contacts').delete().eq('campaign_id', campaignId)

    const { error } = await supabase
      .from('email_campaigns')
      .delete()
      .eq('id', campaignId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[campaigns/[id] DELETE] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
