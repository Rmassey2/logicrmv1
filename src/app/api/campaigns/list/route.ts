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
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    let orgUserIds: string[] = [userId]
    let orgId: string | null = null
    if (membership?.org_id) {
      orgId = membership.org_id
      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('org_id', membership.org_id)
      if (members && members.length > 0) {
        orgUserIds = members.map((m) => m.user_id)
      }
    }

    console.log('[campaigns/list] user:', userId, 'org:', orgId, 'orgUserIds:', orgUserIds)

    const { data, error } = await supabase
      .from('email_campaigns')
      .select('id, name, status, approval_status, recipient_count, sent_count, open_count, reply_count, created_at, user_id')
      .in('user_id', orgUserIds)
      .order('created_at', { ascending: false })

    console.log('[campaigns/list] fetched:', data?.length, 'error:', error?.message)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ campaigns: data ?? [], orgUserIds, orgId })
  } catch (err) {
    console.error('[campaigns/list] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
