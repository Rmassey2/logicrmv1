import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get user profile
    const { data: authUser } = await supabase.auth.admin.getUserById(userId)
    const displayName = authUser?.user?.user_metadata?.display_name || ''

    // Get org
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    const orgId = membership?.org_id

    // Check instantly API key
    let hasInstantlyKey = false
    let plan: string | null = null
    let memberCount = 0
    if (orgId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('instantly_api_key, plan, company_phone')
        .eq('id', orgId)
        .single()
      hasInstantlyKey = !!(org?.instantly_api_key)
      plan = org?.plan || null
      const { count } = await supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
      memberCount = count ?? 0
    }

    // Count contacts
    const { count: contactCount } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    // Count campaigns
    const { count: campaignCount } = await supabase
      .from('email_campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    // Check profile: has display_name AND phone
    const { data: orgForPhone } = orgId ? await supabase
      .from('organizations')
      .select('company_phone')
      .eq('id', orgId)
      .single() : { data: null }

    const hasProfile = !!(displayName && orgForPhone?.company_phone)

    return NextResponse.json({
      checklist: {
        hasProfile,
        hasInstantlyKey,
        hasContacts: (contactCount ?? 0) > 0,
        hasCampaign: (campaignCount ?? 0) > 0,
        hasTeamMember: memberCount > 1,
      },
      plan,
      displayName,
    })
  } catch (err) {
    console.error('[onboarding] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST — save Instantly API key
export async function POST(req: NextRequest) {
  try {
    const { user_id, instantly_api_key } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user_id)
      .limit(1)
      .maybeSingle()

    if (!membership) return NextResponse.json({ error: 'No organization found' }, { status: 400 })

    const { error } = await supabase
      .from('organizations')
      .update({ instantly_api_key })
      .eq('id', membership.org_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[onboarding] POST Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
