import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) return NextResponse.json({ connected: false, email: '' })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Check gmail_connections table first
    const { data: gmailConn } = await supabase
      .from('gmail_connections')
      .select('email')
      .eq('user_id', userId)
      .maybeSingle()

    if (gmailConn?.email) {
      return NextResponse.json({ connected: true, email: gmailConn.email })
    }

    // Fallback: check user_settings for gmail_email key
    const { data: setting } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'gmail_email')
      .maybeSingle()

    return NextResponse.json({
      connected: !!setting?.value,
      email: setting?.value || '',
    })
  } catch (err) {
    console.error('[gmail/status] Error:', err)
    return NextResponse.json({ connected: false, email: '' })
  }
}
