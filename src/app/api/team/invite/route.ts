import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { email, org_id, inviter_id } = await req.json()
    console.log('[team/invite] Request:', { email, org_id, inviter_id })

    if (!email || !org_id) return NextResponse.json({ error: 'email and org_id required' }, { status: 400 })

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://logicrmv1.vercel.app'

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existing = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existing) {
      const { data: mem } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', existing.id)
        .eq('org_id', org_id)
        .maybeSingle()

      if (mem) return NextResponse.json({ error: 'This user is already in your organization' }, { status: 400 })

      await supabase.from('organization_members').insert({ org_id, user_id: existing.id, role: 'rep' })
      return NextResponse.json({ success: true, message: `${email} added to your organization` })
    }

    // New user — send invite with redirect to accept-invite page
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/auth/accept-invite`,
      data: { org_id, role: 'rep', invited_by: inviter_id },
    })

    console.log('[team/invite] Invite result:', inviteData?.user?.id, 'error:', inviteErr?.message)

    if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 })

    // Pre-create org membership
    if (inviteData?.user?.id) {
      await supabase.from('organization_members').insert({ org_id, user_id: inviteData.user.id, role: 'rep' })
      console.log('[team/invite] Created membership for:', inviteData.user.id)
    }

    return NextResponse.json({ success: true, message: `Invite sent to ${email}` })
  } catch (err) {
    console.error('[team/invite] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
