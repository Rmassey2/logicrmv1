import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Look up the sending user's profile for their sending email
    let senderName = from_name || 'LogiCRM'
    let senderEmail = 'jarrett@macoships.com' // fallback

    if (user_id) {
      const { data: authUser } = await supabase.auth.admin.getUserById(user_id)
      if (authUser?.user) {
        senderName = from_name || authUser.user.user_metadata?.display_name || senderName
        senderEmail = authUser.user.user_metadata?.sending_email || authUser.user.email || senderEmail
      }
    }

    console.log('[email/send] From:', senderName, '<' + senderEmail + '>', 'To:', to)

    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: [to],
      subject,
      text: body,
    })

    if (error) {
      console.error('Resend error:', error)
      // If the sending email isn't verified in Resend, fall back to default
      if (error.message?.includes('not verified') || error.message?.includes('not allowed')) {
        console.log('[email/send] Sender not verified, falling back to jarrett@macoships.com')
        const fallback = await resend.emails.send({
          from: `${senderName} <jarrett@macoships.com>`,
          to: [to],
          subject,
          text: body,
        })
        if (fallback.error) {
          return NextResponse.json({ error: `Send failed: ${fallback.error.message}` }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: `Send failed: ${error.message}` }, { status: 500 })
      }
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
