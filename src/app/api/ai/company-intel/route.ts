import { NextRequest, NextResponse } from 'next/server'

function stripAllTags(s: string) {
  let c = s
  while (/<cite[^>]*>/.test(c)) {
    c = c.replace(/<cite[^>]*>/g, '').replace(/<\/cite>/g, '')
  }
  return c.replace(/<\/?[a-zA-Z][a-zA-Z0-9_]*[^>]*>/g, '').trim()
}

export async function POST(req: NextRequest) {
  try {
    const { companyName, industry, location } = await req.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const systemPrompt = `You are a freight sales intelligence analyst for Maco Logistics, a national freight brokerage. Research companies and generate actionable intelligence briefs for sales reps. Focus on:
- What they manufacture, distribute, or sell
- Estimated shipping volume and freight needs
- Known distribution centers or facilities
- Recent news relevant to freight (expansions, new facilities, acquisitions)
- Supply chain challenges they may be facing
- Key decision makers in logistics/supply chain
Format your response as valid JSON with this exact structure:
{
  "overview": "2-3 sentences about what the company does",
  "freightProfile": "2-3 sentences about their likely freight needs, volume, equipment types, key lanes",
  "recentNews": "2-3 sentences about recent news relevant to freight/logistics",
  "salesAngle": "2-3 sentences on how to position Maco Logistics for this company"
}
Return ONLY the JSON object. No markdown, no code fences.`

    const userPrompt = `Research this company for a freight sales call: ${companyName}.${industry ? ` Industry: ${industry}.` : ''}${location ? ` Location: ${location}.` : ''} Find current information about their business, shipping needs, and any recent news relevant to freight and logistics.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
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

    // Extract text from content blocks (may have tool_use and text blocks)
    let text = ''
    for (const block of result.content ?? []) {
      if (block.type === 'text') {
        text += block.text
      }
    }

    if (!text) {
      return NextResponse.json({ error: 'No text response from AI' }, { status: 500 })
    }

    // Parse JSON from response
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    try {
      const raw = JSON.parse(cleaned)
      const intel = {
        overview: stripAllTags(raw.overview ?? ''),
        freightProfile: stripAllTags(raw.freightProfile ?? ''),
        recentNews: stripAllTags(raw.recentNews ?? ''),
        salesAngle: stripAllTags(raw.salesAngle ?? ''),
      }
      return NextResponse.json({ intel })
    } catch {
      // If JSON parsing fails, try to extract sections from plain text
      return NextResponse.json({
        intel: {
          overview: stripAllTags(cleaned),
          freightProfile: '',
          recentNews: '',
          salesAngle: '',
        }
      })
    }
  } catch (err) {
    console.error('Company intel error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
