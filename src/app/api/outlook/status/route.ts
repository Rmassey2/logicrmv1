import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()
    if (!userId) return NextResponse.json({ connected: false, email: '' })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase
      .from('outlook_connections')
      .select('email')
      .eq('user_id', userId)

    if (error) return NextResponse.json({ connected: false, email: '', error: error.message })

    const row = data?.[0]
    return NextResponse.json({ connected: !!row?.email, email: row?.email || '' })
  } catch (err) {
    console.error('[outlook/status] Error:', err)
    return NextResponse.json({ connected: false, email: '' })
  }
}
