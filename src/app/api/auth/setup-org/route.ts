import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const MACO_DOMAIN = '@macotransport.com'
const MACO_OWNER_EMAIL = 'rmassey@macotransport.com'

async function findMacoOrgId(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const owner = users?.users?.find(u => u.email?.toLowerCase() === MACO_OWNER_EMAIL.toLowerCase())
    if (!owner) return null
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', owner.id)
      .maybeSingle()
    return org?.id ?? null
  } catch (err) {
    console.error('[setup-org] findMacoOrgId failed:', err)
    return null
  }
}

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

    // MACO domain auto-routing: drop them into the canonical MACO org as a rep
    if (email.toLowerCase().endsWith(MACO_DOMAIN)) {
      const macoOrgId = await findMacoOrgId(supabase)
      if (macoOrgId) {
        const { error: memErr } = await supabase
          .from('organization_members')
          .insert({ org_id: macoOrgId, user_id, role: 'rep' })
        if (memErr) {
          console.error('[setup-org] MACO membership insert failed:', memErr)
          return NextResponse.json({ error: memErr.message }, { status: 500 })
        }
        console.log('[setup-org] Joined MACO org:', macoOrgId, 'for user:', user_id)
        return NextResponse.json({ status: 'joined_maco', org_id: macoOrgId })
      }
      console.warn('[setup-org] @macotransport.com signup but canonical MACO org not found; falling through to default flow')
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
