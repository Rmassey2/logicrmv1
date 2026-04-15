import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function DELETE(req: NextRequest) {
  try {
    const { callerId, contactIds } = await req.json()

    if (!callerId) {
      return NextResponse.json({ error: 'callerId required' }, { status: 401 })
    }
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ error: 'contactIds must be a non-empty array' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    const { data: caller, error: callerErr } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', callerId)
      .maybeSingle()

    if (callerErr || !caller) {
      return NextResponse.json({ error: 'Caller not in organization' }, { status: 403 })
    }
    if (caller.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can bulk delete contacts' }, { status: 403 })
    }

    const { error: delErr, count } = await supabase
      .from('contacts')
      .delete({ count: 'exact' })
      .in('id', contactIds)

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: count ?? contactIds.length })
  } catch (err) {
    console.error('[contacts/bulk-delete] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
