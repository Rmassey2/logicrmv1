import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { email, org_id, inviter_id } = await req.json()
    if (!email || !org_id) return NextResponse.json({ error: 'email and org_id required' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Check if user already exists
    const { data: users } = await supabase.auth.admin.listUsers()
    const existing = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existing) {
      // User exists — check if already in this org
      const { data: mem } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', existing.id)
        .eq('org_id', org_id)
        .maybeSingle()

      if (mem) return NextResponse.json({ error: 'This user is already in your organization' }, { status: 400 })

      // Add existing user to org
      await supabase.from('organization_members').insert({ org_id, user_id: existing.id, role: 'rep' })
      return NextResponse.json({ success: true, message: `${email} added to your organization` })
    }

    // New user — send invite via Supabase auth
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://logicrmv1.vercel.app'
    const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/auth/login`,
      data: { invited_by: inviter_id, org_id },
    })

    if (inviteErr) {
      console.error('[team/invite] Invite failed:', inviteErr)
      return NextResponse.json({ error: inviteErr.message }, { status: 500 })
    }

    // Pre-create org membership so it's ready when they sign up
    // Use the invited user's future ID — we'll match on email during signup
    // Store the invite in user_settings as a marker
    await supabase.from('user_settings').upsert(
      { user_id: org_id, key: `invite:${email.toLowerCase()}`, value: 'rep' },
      { onConflict: 'user_id,key' }
    )

    return NextResponse.json({ success: true, message: `Invite sent to ${email}` })
  } catch (err) {
    console.error('[team/invite] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
