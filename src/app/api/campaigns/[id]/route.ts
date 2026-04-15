import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id
    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign id required' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    await supabase.from('email_sequences').delete().eq('campaign_id', campaignId)
    await supabase.from('campaign_contacts').delete().eq('campaign_id', campaignId)

    const { error } = await supabase
      .from('email_campaigns')
      .delete()
      .eq('id', campaignId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[campaigns/[id] DELETE] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
