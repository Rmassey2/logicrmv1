import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MACO_OWNER_EMAIL = 'rmassey@macotransport.com'
const BRIAN_EMAIL = 'brian@macotransport.com'

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    // Authorize: caller must be the MACO owner
    const { data: callerData } = await supabase.auth.admin.getUserById(user_id)
    const callerEmail = callerData?.user?.email?.toLowerCase()
    if (callerEmail !== MACO_OWNER_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Find the org owned by the caller
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('id, name, subscription_status, plan, trial_ends_at')
      .eq('owner_id', user_id)
      .maybeSingle()

    if (orgErr || !org) {
      return NextResponse.json({ error: 'No organization owned by caller' }, { status: 404 })
    }

    const before = {
      subscription_status: org.subscription_status,
      plan: org.plan,
      trial_ends_at: org.trial_ends_at,
    }

    // Promote org to exempt + team
    const { error: updateErr } = await supabase
      .from('organizations')
      .update({
        subscription_status: 'exempt',
        plan: 'team',
        trial_ends_at: null,
      })
      .eq('id', org.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Ensure caller's own membership is admin (defensive)
    const { data: ownMem } = await supabase
      .from('organization_members')
      .select('id, role')
      .eq('user_id', user_id)
      .eq('org_id', org.id)
      .maybeSingle()

    if (!ownMem) {
      await supabase.from('organization_members').insert({ org_id: org.id, user_id, role: 'admin' })
    } else if (ownMem.role !== 'admin') {
      await supabase.from('organization_members').update({ role: 'admin' }).eq('id', ownMem.id)
    }

    // Locate Brian and ensure he's a manager of MACO
    const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const brian = users?.users?.find(u => u.email?.toLowerCase() === BRIAN_EMAIL.toLowerCase())

    let brianStatus = 'not_found_invite_him_via_team_invite'
    if (brian) {
      const { data: existingMem } = await supabase
        .from('organization_members')
        .select('id, role, org_id')
        .eq('user_id', brian.id)
        .maybeSingle()

      if (!existingMem) {
        await supabase.from('organization_members').insert({
          org_id: org.id,
          user_id: brian.id,
          role: 'manager',
        })
        brianStatus = 'added_as_manager'
      } else if (existingMem.org_id !== org.id) {
        brianStatus = `in_different_org_${existingMem.org_id}_manual_intervention_needed`
      } else if (existingMem.role !== 'manager' && existingMem.role !== 'admin') {
        await supabase.from('organization_members').update({ role: 'manager' }).eq('id', existingMem.id)
        brianStatus = 'promoted_to_manager'
      } else {
        brianStatus = `already_${existingMem.role}`
      }
    }

    return NextResponse.json({
      success: true,
      org: {
        id: org.id,
        name: org.name,
        before,
        after: { subscription_status: 'exempt', plan: 'team', trial_ends_at: null },
      },
      brian: brianStatus,
    })
  } catch (err) {
    console.error('[seed-maco-org] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
