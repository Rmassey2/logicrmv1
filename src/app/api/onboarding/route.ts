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

    // Get user profile from auth metadata
    const { data: authUser } = await supabase.auth.admin.getUserById(userId)
    const meta = authUser?.user?.user_metadata ?? {}
    const hasProfile = !!(meta.first_name && meta.last_name)

    // Check email connections (Gmail or Outlook)
    const [gmailRes, outlookRes] = await Promise.all([
      supabase.from('gmail_connections').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('outlook_connections').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ])
    const hasEmail = ((gmailRes.count ?? 0) + (outlookRes.count ?? 0)) > 0

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

    // Check team members
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    let hasTeamMember = false
    if (membership?.org_id) {
      const { count } = await supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', membership.org_id)
      hasTeamMember = (count ?? 0) > 1
    }

    return NextResponse.json({
      checklist: {
        hasProfile,
        hasEmail,
        hasContacts: (contactCount ?? 0) > 0,
        hasCampaign: (campaignCount ?? 0) > 0,
        hasTeamMember,
      },
    })
  } catch (err) {
    console.error('[onboarding] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
