import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VALID_ROLES = ['rep', 'manager', 'admin'] as const
type Role = (typeof VALID_ROLES)[number]

export async function PATCH(req: NextRequest) {
  try {
    const { userId, role, callerId } = await req.json()

    if (!userId || !role) {
      return NextResponse.json({ error: 'userId and role required' }, { status: 400 })
    }
    if (!(VALID_ROLES as readonly string[]).includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    if (!callerId) {
      return NextResponse.json({ error: 'callerId required' }, { status: 401 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    const { data: caller, error: callerErr } = await supabase
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', callerId)
      .maybeSingle()

    if (callerErr || !caller) {
      return NextResponse.json({ error: 'Caller not in organization' }, { status: 403 })
    }
    if (caller.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can change roles' }, { status: 403 })
    }

    const { data: target, error: targetErr } = await supabase
      .from('organization_members')
      .select('id, org_id, role')
      .eq('user_id', userId)
      .eq('org_id', caller.org_id)
      .maybeSingle()

    if (targetErr || !target) {
      return NextResponse.json({ error: 'Target user not in your organization' }, { status: 404 })
    }

    if (callerId === userId && target.role === 'admin' && role !== 'admin') {
      const { count } = await supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', caller.org_id)
        .eq('role', 'admin')
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: 'Cannot demote the last admin' }, { status: 400 })
      }
    }

    const { error: updateErr } = await supabase
      .from('organization_members')
      .update({ role: role as Role })
      .eq('id', target.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[team/update-role] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
