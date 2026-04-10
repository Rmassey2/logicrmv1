import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { user_id, email, promo_code } = await req.json()
    if (!user_id || !email) {
      return NextResponse.json({ error: 'user_id and email required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Check if user already has an org
    const { data: existing } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', user_id)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ status: 'already_exists' })
    }

    // Create org with trial or exempt status
    const validCodes = ['MACOTEST', 'LOGICRMBETA']
    const isPromoValid = validCodes.includes((promo_code || '').trim().toUpperCase())
    const trialEndsAt = new Date(Date.now() + 14 * 86400000).toISOString()

    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({
        name: `${email.split('@')[0]}'s Organization`,
        owner_id: user_id,
        subscription_status: isPromoValid ? 'exempt' : 'trial',
        trial_ends_at: isPromoValid ? null : trialEndsAt,
      })
      .select('id')
      .single()

    if (orgErr || !org) {
      console.error('[setup-org] Org insert failed:', orgErr)
      return NextResponse.json({ error: orgErr?.message || 'Failed to create organization' }, { status: 500 })
    }

    const { error: memErr } = await supabase.from('organization_members').insert({
      org_id: org.id,
      user_id,
      role: 'admin',
    })

    if (memErr) {
      console.error('[setup-org] Membership insert failed:', memErr)
      return NextResponse.json({ error: memErr.message }, { status: 500 })
    }

    console.log('[setup-org] Created org:', org.id, 'for user:', user_id, 'promo:', isPromoValid ? 'exempt' : 'trial')
    return NextResponse.json({ status: 'created', org_id: org.id })
  } catch (err) {
    console.error('[setup-org] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
