import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  try {
    const { subject, message, userName, userEmail, pageUrl } = await req.json()
    if (!subject || !message) return NextResponse.json({ error: 'Subject and message required' }, { status: 400 })

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Email not configured' }, { status: 500 })

    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: 'LogiCRM Support <jarrett@macoships.com>',
      to: ['rmassey@macotransport.com'],
      subject: `LogiCRM Support: ${subject}`,
      text: `Support request from ${userName || 'Unknown'} (${userEmail || 'no email'})\nPage: ${pageUrl || 'unknown'}\nTime: ${new Date().toISOString()}\n\n${message}`,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[support] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
