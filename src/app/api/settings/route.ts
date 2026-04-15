import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// GET — load company info from organizations table
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const supabase = getSupabase()

    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    if (!membership) return NextResponse.json({ company: null })

    const { data: org } = await supabase
      .from('organizations')
      .select('name, company_name, company_phone, company_website, company_address')
      .eq('id', membership.org_id)
      .single()

    return NextResponse.json({ company: org || {} })
  } catch (err) {
    console.error('[settings GET] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST — save company info to organizations table
export async function POST(req: NextRequest) {
  try {
    const { user_id, settings } = await req.json()
    if (!user_id || !settings) {
      return NextResponse.json({ error: 'user_id and settings required' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user_id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Build update object from settings array
    const update: Record<string, string> = {}
    for (const { key, value } of settings as { key: string; value: string }[]) {
      update[key] = value
    }

    console.log('[settings POST] Updating org:', membership.org_id, JSON.stringify(update))

    // Only shared company fields live on organizations — personal fields belong in auth.user_metadata
    const safeColumns = ['company_name', 'company_phone', 'company_website', 'company_address', 'name']
    const safeUpdate: Record<string, string> = {}
    for (const [k, v] of Object.entries(update)) {
      if (safeColumns.includes(k)) safeUpdate[k] = v
    }

    console.log('[settings POST] Safe update:', JSON.stringify(safeUpdate))

    const { error } = await supabase
      .from('organizations')
      .update(safeUpdate)
      .eq('id', membership.org_id)
      .select('id')

    if (error) {
      console.error('[settings POST] Update failed:', error.message, error.details, error.hint)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[settings POST] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
