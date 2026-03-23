import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { contact, activities } = await req.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const systemPrompt = `You are a freight sales coach preparing a rep for a discovery call. Generate a concise call prep brief for a Maco Logistics sales rep. Maco is a national freight broker — reliability and on-time performance are the differentiators. The discovery call framework is: Open (rapport) → Diagnose (8 questions) → Present → Close. Key diagnostic questions: loads per month, top lanes, equipment types, current broker setup, biggest freight frustration, carrier fallout history, peak season, decision process.

Return ONLY valid JSON with this structure:
{
  "summary": "2-3 sentence quick summary of what we know",
  "painPoints": ["likely pain point 1", "likely pain point 2", "likely pain point 3"],
  "opening": "suggested opening line for rapport",
  "questions": ["key question 1", "key question 2", "key question 3"],
  "close": "suggested close based on what we know"
}
No markdown, no code fences.`

    const activityLog = (activities ?? [])
      .slice(0, 5)
      .map((a: { type: string; subject: string; notes: string | null; created_at: string }) =>
        `- ${a.type}: "${a.subject}"${a.notes ? ` — ${a.notes}` : ''} (${a.created_at})`
      )
      .join('\n')

    const userPrompt = `Prepare a call brief for:
Name: ${contact.name}
Title: ${contact.title ?? 'Unknown'}
Company: ${contact.company ?? 'Unknown'}
Location: ${[contact.city, contact.state].filter(Boolean).join(', ') || 'Unknown'}
Notes: ${contact.notes ?? 'None'}

Recent activity:
${activityLog || 'No previous activities logged.'}

Generate the call prep brief.`

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
    const brief = JSON.parse(cleaned)

    return NextResponse.json({ brief })
  } catch (err) {
    console.error('Call prep error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
