import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) return NextResponse.json({ connected: false, email: '' })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || (!serviceKey && !anonKey)) {
      return NextResponse.json({ connected: false, email: '', error: 'missing_env' })
    }

    const supabase = createClient(url, serviceKey || anonKey!)

    // Check gmail_connections table
    const { data: gmailConn, error: gmailErr } = await supabase
      .from('gmail_connections')
      .select('email, user_id')
      .eq('user_id', userId)

    console.log('[gmail/status] rows:', gmailConn?.length, 'error:', gmailErr?.message)

    if (gmailConn && gmailConn.length > 0 && gmailConn[0].email) {
      return NextResponse.json({ connected: true, email: gmailConn[0].email })
    }

    // Fallback: check user_settings
    const { data: setting } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'gmail_email')

    const email = setting?.[0]?.value || ''
    return NextResponse.json({ connected: !!email, email })
  } catch (err) {
    console.error('[gmail/status] Error:', err)
    return NextResponse.json({ connected: false, email: '', error: String(err) })
  }
}
