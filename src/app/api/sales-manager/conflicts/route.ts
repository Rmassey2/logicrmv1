import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ conflicts: [] })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get org
    const { data: mem } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user_id)
      .limit(1)
      .maybeSingle()

    if (!mem) return NextResponse.json({ conflicts: [] })

    const { data: members } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('org_id', mem.org_id)

    const orgUserIds = (members || []).map(m => m.user_id)
    if (orgUserIds.length < 2) return NextResponse.json({ conflicts: [] })

    // Get all contacts with company in the org
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, company, user_id')
      .in('user_id', orgUserIds)
      .not('company', 'is', null)

    // Group by company, find companies with contacts from multiple reps
    const companyMap: Record<string, { reps: Set<string>; count: number }> = {}
    for (const c of (contacts || [])) {
      if (!c.company) continue
      const key = c.company.toLowerCase().trim()
      if (!companyMap[key]) companyMap[key] = { reps: new Set(), count: 0 }
      companyMap[key].reps.add(c.user_id)
      companyMap[key].count++
    }

    // Get rep names
    const repNames: Record<string, string> = {}
    for (const uid of orgUserIds) {
      const { data: u } = await supabase.auth.admin.getUserById(uid)
      repNames[uid] = u?.user?.user_metadata?.display_name || u?.user?.email?.split('@')[0] || 'Unknown'
    }

    const conflicts = Object.entries(companyMap)
      .filter(([, v]) => v.reps.size > 1)
      .map(([company, v]) => ({
        company: (contacts || []).find(c => c.company?.toLowerCase().trim() === company)?.company || company,
        reps: Array.from(v.reps).map(uid => repNames[uid] || uid),
        contactCount: v.count,
      }))
      .sort((a, b) => b.contactCount - a.contactCount)

    return NextResponse.json({ conflicts })
  } catch (err) {
    console.error('[conflicts] Error:', err)
    return NextResponse.json({ conflicts: [] })
  }
}
