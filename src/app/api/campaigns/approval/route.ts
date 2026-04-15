import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type Action = 'submit' | 'approve' | 'reject'

export async function POST(req: NextRequest) {
  try {
    const { campaign_id, action, callerId, notes } = (await req.json()) as {
      campaign_id?: string
      action?: Action
      callerId?: string
      notes?: string
    }

    if (!campaign_id || !action || !callerId) {
      return NextResponse.json({ error: 'campaign_id, action, callerId required' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    const { data: caller } = await supabase
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', callerId)
      .maybeSingle()

    if (!caller) {
      return NextResponse.json({ error: 'Caller not in organization' }, { status: 403 })
    }

    const now = new Date().toISOString()
    let update: Record<string, string | null> = {}

    if (action === 'submit') {
      update = { approval_status: 'pending', submitted_at: now }
    } else if (action === 'approve') {
      if (caller.role !== 'admin') {
        return NextResponse.json({ error: 'Only admins can approve' }, { status: 403 })
      }
      update = { approval_status: 'approved', approved_at: now, approved_by: callerId }
    } else if (action === 'reject') {
      if (caller.role !== 'admin') {
        return NextResponse.json({ error: 'Only admins can reject' }, { status: 403 })
      }
      const trimmed = (notes || '').trim()
      if (!trimmed) {
        return NextResponse.json({ error: 'Rejection notes are required' }, { status: 400 })
      }
      update = {
        approval_status: 'rejected',
        approval_notes: trimmed,
        approved_by: callerId,
        approved_at: now,
      }
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    let { error } = await supabase.from('email_campaigns').update(update).eq('id', campaign_id)

    // If approved_by column isn't in the schema, retry without it
    if (error && error.message?.toLowerCase().includes('approved_by')) {
      const { approved_by: _drop, ...rest } = update as Record<string, string | null>
      void _drop
      const retry = await supabase.from('email_campaigns').update(rest).eq('id', campaign_id)
      error = retry.error
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, action })
  } catch (err) {
    console.error('[campaigns/approval] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
