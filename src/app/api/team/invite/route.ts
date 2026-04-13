import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { email, org_id, inviter_id } = await req.json()
    console.log('[team/invite] Request:', { email, org_id, inviter_id })

    if (!email || !org_id) return NextResponse.json({ error: 'email and org_id required' }, { status: 400 })

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      console.error('[team/invite] SUPABASE_SERVICE_ROLE_KEY not set')
      return NextResponse.json({ error: 'Server configuration error — contact admin' }, { status: 500 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    // Check if user already exists — search by email efficiently
    const { data: existingUsers, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    console.log('[team/invite] Listed users:', existingUsers?.users?.length, 'error:', listErr?.message)

    const existing = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existing) {
      // Check if already in org
      const { data: mem } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', existing.id)
        .eq('org_id', org_id)
        .maybeSingle()

      if (mem) return NextResponse.json({ error: 'This user is already in your organization' }, { status: 400 })

      // Add existing user to org as rep
      const { error: insertErr } = await supabase.from('organization_members').insert({ org_id, user_id: existing.id, role: 'rep' })
      console.log('[team/invite] Added existing user:', existing.id, 'error:', insertErr?.message)

      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
      return NextResponse.json({ success: true, message: `${email} added to your organization` })
    }

    // New user — send invite
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://logicrmv1.vercel.app'
    console.log('[team/invite] Sending invite to:', email, 'redirect:', `${appUrl}/auth/login`)

    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/auth/login`,
      data: { invited_by: inviter_id, org_id, role: 'rep' },
    })

    console.log('[team/invite] Invite result:', inviteData?.user?.id, 'error:', inviteErr?.message)

    if (inviteErr) {
      return NextResponse.json({ error: inviteErr.message }, { status: 500 })
    }

    // If invite created a user, add them to org immediately
    if (inviteData?.user?.id) {
      const { error: memErr } = await supabase.from('organization_members').insert({
        org_id,
        user_id: inviteData.user.id,
        role: 'rep',
      })
      console.log('[team/invite] Pre-created membership:', memErr?.message || 'success')
    }

    return NextResponse.json({ success: true, message: `Invite sent to ${email}` })
  } catch (err) {
    console.error('[team/invite] Unhandled error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
