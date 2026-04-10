import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    console.log('[subscription] userId:', userId, 'keyType:', serviceKey ? 'service_role' : 'anon')

    const supabase = createClient(supabaseUrl!, serviceKey || anonKey!)

    const { data: membership, error: memErr } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    console.log('[subscription] membership:', membership, 'error:', memErr?.message)

    if (!membership) {
      // No org membership — treat as exempt so user isn't blocked
      return NextResponse.json({ subscription: { subscription_status: 'exempt', plan: null, trial_ends_at: null } })
    }

    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('subscription_status, plan, trial_ends_at')
      .eq('id', membership.org_id)
      .single()

    console.log('[subscription] org:', org, 'error:', orgErr?.message)

    if (!org) {
      // Org not found — treat as exempt so user isn't blocked
      return NextResponse.json({ subscription: { subscription_status: 'exempt', plan: null, trial_ends_at: null } })
    }

    return NextResponse.json({ subscription: org })
  } catch (err) {
    console.error('[subscription] Error:', err)
    // On error, don't block the user
    return NextResponse.json({ subscription: { subscription_status: 'exempt', plan: null, trial_ends_at: null } })
  }
}
