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

    const { data } = await supabase
      .from('gmail_connections')
      .select('email')
      .eq('user_id', userId)

    if (data?.[0]?.email) return NextResponse.json({ connected: true, email: data[0].email })

    // Fallback: user_settings
    const { data: setting } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'gmail_email')

    const email = setting?.[0]?.value || ''
    return NextResponse.json({ connected: !!email, email })
  } catch (err) {
    console.error('[gmail/status] Error:', err)
    return NextResponse.json({ connected: false, email: '' })
  }
}
