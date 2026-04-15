import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    const isAdmin = membership?.role === 'admin' || membership?.role === 'manager'
    let orgUserIds: string[] = [userId]
    if (membership?.org_id) {
      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('org_id', membership.org_id)
      if (members && members.length > 0) {
        orgUserIds = members.map((m) => m.user_id)
      }
    }
    console.log('[campaigns/pending] caller:', userId, 'role:', membership?.role, 'org:', membership?.org_id, 'orgUserIds:', orgUserIds)

    let query = supabase
      .from('email_campaigns')
      .select('id, name, user_id, submitted_at, created_at')
      .eq('approval_status', 'pending')
      .order('submitted_at', { ascending: false })

    // Admins see every pending campaign org-wide; reps are scoped to themselves.
    if (!isAdmin) {
      query = query.in('user_id', orgUserIds)
    }

    const { data: campaigns, error } = await query
    console.log('[campaigns/pending] fetched:', campaigns?.length, 'error:', error?.message)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const userIds = Array.from(new Set((campaigns ?? []).map((c) => c.user_id)))
    const repNames = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: authList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
      for (const u of authList?.users ?? []) {
        if (userIds.includes(u.id)) {
          const meta = u.user_metadata ?? {}
          const name =
            meta.display_name ||
            [meta.first_name, meta.last_name].filter(Boolean).join(' ') ||
            u.email ||
            u.id.slice(0, 8)
          repNames.set(u.id, name)
        }
      }
    }

    const result = (campaigns ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      rep: repNames.get(c.user_id) || 'Unknown',
      user_id: c.user_id,
      submitted_at: c.submitted_at || c.created_at,
    }))

    return NextResponse.json({ pending: result })
  } catch (err) {
    console.error('[campaigns/pending] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
