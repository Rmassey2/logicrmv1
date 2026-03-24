import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, contact_id, user_id, from_name } = await req.json()

    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }

    const resend = new Resend(apiKey)

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'noreply@logicrm.app'
    const fromField = from_name ? `${from_name} <${fromAddress}>` : fromAddress

    const { data, error } = await resend.emails.send({
      from: fromField,
      to: [to],
      subject,
      text: body,
    })

    if (error) {
      console.error('Resend error:', error)
      return NextResponse.json({ error: `Send failed: ${error.message}` }, { status: 500 })
    }

    // Auto-log as email activity
    if (contact_id && user_id) {
      await supabase.from('activities').insert({
        contact_id,
        user_id,
        type: 'email',
        subject: `Sent: ${subject}`,
        notes: body,
      })
    }

    return NextResponse.json({ success: true, email_id: data?.id })
  } catch (err) {
    console.error('Email send error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
