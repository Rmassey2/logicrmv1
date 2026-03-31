import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    // Check if user is admin
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', user_id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ role: 'rep', members: [] })
    }

    if (membership.role !== 'admin') {
      return NextResponse.json({ role: 'rep', members: [] })
    }

    // Get all org members
    const { data: members } = await supabase
      .from('organization_members')
      .select('user_id, role')
      .eq('org_id', membership.org_id)

    if (!members || members.length === 0) {
      return NextResponse.json({ role: 'admin', members: [], userIds: [] })
    }

    const userIds = members.map(m => m.user_id)

    // Get display names from auth.users via admin API
    const repList: { user_id: string; name: string; role: string }[] = []
    for (const m of members) {
      const { data: authUser } = await supabase.auth.admin.getUserById(m.user_id)
      const name = authUser?.user?.user_metadata?.display_name
        || authUser?.user?.email?.split('@')[0]
        || m.user_id.slice(0, 8)
      repList.push({ user_id: m.user_id, name, role: m.role })
    }

    // Fetch all leads for all org members
    const { data: leads } = await supabase
      .from('leads')
      .select('id, title, stage_id, value, contact_id, created_at, user_id, contact:contacts(first_name, last_name, company)')
      .in('user_id', userIds)

    // Fetch activities for last_activity_at
    const { data: activities } = await supabase
      .from('activities')
      .select('contact_id, created_at')
      .in('user_id', userIds)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      role: 'admin',
      members: repList,
      userIds,
      leads: leads ?? [],
      activities: activities ?? [],
    })
  } catch (err) {
    console.error('Org deals error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
