import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { firstName, lastName, company, rawNotes } = await req.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const systemPrompt = `You are an expert freight sales assistant for Maco Logistics. You take rough post-call notes from a sales rep and format them into a clean, structured activity log entry. Extract and organize:
- What was discussed
- Their pain points (use their EXACT words if present)
- Lanes and volumes mentioned
- Current carrier/broker setup
- Decision making process
- Next steps agreed upon
- Follow up date if mentioned
Format as a clean summary a rep can save directly to the CRM.
Be concise. Use bullet points for key facts.
Return plain text only — no JSON, no markdown code fences.`

    const contactName = [firstName, lastName].filter(Boolean).join(' ') || 'the contact'
    const companyStr = company ? ` at ${company}` : ''
    const userPrompt = `Format these post-call notes for contact ${contactName}${companyStr}:\n\n${rawNotes}`

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
    const summary = result.content?.[0]?.text ?? ''

    return NextResponse.json({ summary })
  } catch (err) {
    console.error('Post-call summary error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
