import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) return NextResponse.json({ connected: false, email: '' })

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    console.log('[outlook/status] userId:', userId, 'hasServiceKey:', !!serviceKey)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase
      .from('outlook_connections')
      .select('email')
      .eq('user_id', userId)
      .maybeSingle()

    console.log('[outlook/status] query result:', { data, error: error?.message })

    return NextResponse.json({
      connected: !!data?.email,
      email: data?.email || '',
    })
  } catch (err) {
    console.error('[outlook/status] Error:', err)
    return NextResponse.json({ connected: false, email: '' })
  }
}
