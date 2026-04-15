import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { touchNumber, firstName, company, painPoint } = await req.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const systemPrompt = `You are an expert cold email writer for Maco Logistics, a national freight brokerage. Write short, conversational cold emails that get replies. No buzzwords, no fluff. 3-5 sentences max. Always include a soft CTA. Use the contact's first name and company. Write for freight industry decision makers — Transportation Managers, Procurement leads. The sender is Jarrett Bailey at Maco Logistics.

The 7-touch cadence:
Touch 1: Quick question / pattern interrupt
Touch 2: Pain point validation
Touch 3: Social proof story
Touch 4: The "one lane" offer
Touch 5: Market insight / rate trends
Touch 6: Case study or result
Touch 7: Graceful goodbye email. Warm, professional, no pressure. Appreciate them reading your emails, say you'll circle back when timing is better, wish them well. Do NOT say "closing your file", "breaking up", or anything negative. Example: "I appreciate you taking the time to read my emails. I'll circle back in a few months — timing is everything in freight. Wishing you smooth shipping in the meantime." You may end with Maco's tagline: "We don't book loads we can't cover. All 48 states." — but do NOT add a signature block.

IMPORTANT: Do NOT include a signature, sign-off name, company, phone, email, website, or "--" divider at the end of the body. The system appends the sender's signature automatically. End the body with the CTA/closing line only (e.g. "Thanks," or "Talk soon,") — no name after it.

Return ONLY valid JSON with this structure:
{"subject": "subject line here", "body": "email body here"}
No markdown, no code fences.`

    const userPrompt = `Write Touch ${touchNumber} email for ${firstName} at ${company}. Their pain point is: ${painPoint}. Include subject line and email body. Do not add a signature — the system will append one automatically.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Anthropic API error:', response.status, errBody)
      return NextResponse.json({ error: `API error: ${response.status}` }, { status: 500 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const email = JSON.parse(cleaned)

    return NextResponse.json({ email })
  } catch (err) {
    console.error('Write email error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
