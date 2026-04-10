import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { user_id, settings } = await req.json()
    if (!user_id || !settings) {
      return NextResponse.json({ error: 'user_id and settings required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const errors: string[] = []
    for (const { key, value } of settings as { key: string; value: string }[]) {
      // Delete existing then insert (avoids unique constraint issues)
      await supabase.from('user_settings').delete().eq('user_id', user_id).eq('key', key)
      const { error } = await supabase.from('user_settings').insert({ user_id, key, value })
      if (error) {
        console.error('[settings] Failed to save', key, error.message)
        errors.push(key)
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: `Failed to save: ${errors.join(', ')}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[settings] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
