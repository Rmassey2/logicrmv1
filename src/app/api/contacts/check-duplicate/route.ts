import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { email, firstName, lastName, company, user_id } = await req.json()
    if (!user_id) return NextResponse.json({ duplicates: [] })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get org members
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user_id)
      .limit(1)
      .maybeSingle()

    if (!membership) return NextResponse.json({ duplicates: [] })

    const { data: members } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('org_id', membership.org_id)

    const orgUserIds = (members || []).map(m => m.user_id)
    if (orgUserIds.length === 0) return NextResponse.json({ duplicates: [] })

    // Check email match
    const duplicates: { id: string; first_name: string; last_name: string; email: string | null; company: string | null; user_id: string; owner_name: string }[] = []

    if (email && email.trim()) {
      const { data: emailMatches } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, company, user_id')
        .in('user_id', orgUserIds)
        .ilike('email', email.trim())
        .limit(5)

      for (const c of (emailMatches || [])) {
        duplicates.push({ ...c, owner_name: '' })
      }
    }

    // Check name + company match (only if not already found by email)
    if (firstName && lastName && company && duplicates.length === 0) {
      const { data: nameMatches } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, company, user_id')
        .in('user_id', orgUserIds)
        .ilike('first_name', firstName.trim())
        .ilike('last_name', lastName.trim())
        .ilike('company', company.trim())
        .limit(5)

      for (const c of (nameMatches || [])) {
        if (!duplicates.find(d => d.id === c.id)) {
          duplicates.push({ ...c, owner_name: '' })
        }
      }
    }

    // Get owner names
    for (const d of duplicates) {
      const { data: u } = await supabase.auth.admin.getUserById(d.user_id)
      d.owner_name = u?.user?.user_metadata?.display_name || u?.user?.email?.split('@')[0] || 'Unknown'
    }

    return NextResponse.json({ duplicates })
  } catch (err) {
    console.error('[check-duplicate] Error:', err)
    return NextResponse.json({ duplicates: [] })
  }
}
