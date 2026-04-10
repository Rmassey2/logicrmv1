import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    await supabase.from('outlook_connections').delete().eq('user_id', user_id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[outlook/disconnect] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
