import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { subject, body, instructions } = await req.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const systemPrompt = `You are an expert cold email rewriter for Maco Logistics, a national freight brokerage. You will be given an existing cold email and instructions for how to change it. Rewrite the email following the instructions while keeping it short, conversational, and effective. 3-5 sentences max for the body. Keep the same general structure unless told otherwise.

Return ONLY valid JSON with this structure:
{"subject": "rewritten subject line", "body": "rewritten email body"}
No markdown, no code fences.`

    const userPrompt = `Here is the current email:

Subject: ${subject}

Body:
${body}

Instructions for rewrite: ${instructions}

Rewrite this email following the instructions. Return JSON with "subject" and "body".`

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
    console.error('Rewrite email error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
