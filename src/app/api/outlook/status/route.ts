import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) return NextResponse.json({ connected: false, email: '' })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    console.log('[outlook/status] userId:', userId)
    console.log('[outlook/status] env:', { hasUrl: !!url, hasServiceKey: !!serviceKey, hasAnonKey: !!anonKey })

    if (!url || (!serviceKey && !anonKey)) {
      return NextResponse.json({ connected: false, email: '', error: 'missing_env' })
    }

    const supabase = createClient(url, serviceKey || anonKey!)

    // Try to get all outlook_connections for this user
    const { data, error } = await supabase
      .from('outlook_connections')
      .select('email, user_id')
      .eq('user_id', userId)

    console.log('[outlook/status] rows:', data?.length, 'error:', error?.message, 'data:', JSON.stringify(data))

    if (error) {
      return NextResponse.json({ connected: false, email: '', error: error.message })
    }

    const row = data?.[0]
    return NextResponse.json({
      connected: !!row?.email,
      email: row?.email || '',
    })
  } catch (err) {
    console.error('[outlook/status] Error:', err)
    return NextResponse.json({ connected: false, email: '', error: String(err) })
  }
}
