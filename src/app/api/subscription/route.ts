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

    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ subscription: null })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('subscription_status, plan, trial_ends_at')
      .eq('id', membership.org_id)
      .single()

    return NextResponse.json({ subscription: org })
  } catch (err) {
    console.error('[subscription] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
