'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { Users, TrendingUp, Mail, Clock } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface RepStats {
  user_id: string
  email: string
  role: string
  contacts_total: number
  contacts_this_week: number
  deals_total: number
  deals_by_stage: { stage: string; count: number }[]
  campaigns_total: number
}

interface ActivityItem {
  type: 'contact' | 'deal' | 'campaign'
  label: string
  user_email: string
  created_at: string
}

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [orgName, setOrgName] = useState('')
  const [reps, setReps] = useState<RepStats[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Verify admin
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle()

    if (!membership) { router.push('/dashboard'); return }

    const orgId = membership.org_id

    // Org name
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single()
    setOrgName(org?.name ?? '')

    // All members
    const { data: members } = await supabase
      .from('organization_members')
      .select('user_id, role')
      .eq('org_id', orgId)

    if (!members || members.length === 0) { setLoading(false); return }

    const userIds = members.map((m) => m.user_id)
    const memberMap = new Map(members.map((m) => [m.user_id, m.role]))

    // Get emails via auth — we'll use contacts/leads as proxy since we can't query auth.users
    // Instead, fetch each user's email from their data
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Fetch all contacts, leads, campaigns for org members
    const [contactsRes, leadsRes, campaignsRes, stagesRes] = await Promise.all([
      supabase.from('contacts').select('id, user_id, created_at').in('user_id', userIds),
      supabase.from('leads').select('id, title, user_id, stage_id, created_at').in('user_id', userIds),
      supabase.from('email_campaigns').select('id, name, user_id, created_at').in('user_id', userIds),
      supabase.from('pipeline_stages').select('id, name').in('user_id', userIds),
    ])

    const contacts = contactsRes.data ?? []
    const leads = leadsRes.data ?? []
    const campaigns = campaignsRes.data ?? []
    const stageMap = new Map((stagesRes.data ?? []).map((s) => [s.id, s.name]))

    // We need user emails — get them from user_settings or auth metadata
    // Simplest: use supabase.auth.admin won't work client-side, so we store emails in a lookup
    // We'll derive emails from the member list using an RPC or from contacts
    // For now, let's get emails from the organization_members join approach
    // We'll use a workaround: fetch from a user_emails view or just show user_id
    // Actually the best approach: query each user's email from their own data
    // Let's use the Supabase auth admin list — but that requires service role
    // Pragmatic approach: store email in organization_members or look up from contacts
    // For now we'll show what we can and use a map

    // Build email map from user metadata (the current user knows their own)
    const emailMap = new Map<string, string>()
    emailMap.set(user.id, user.email ?? '')

    // For other members, try to find their email from contacts they created
    // or from campaign data — this is a limitation of client-side auth
    // We'll label unknown emails with a short ID
    for (const uid of userIds) {
      if (!emailMap.has(uid)) {
        emailMap.set(uid, uid.slice(0, 8) + '...')
      }
    }

    // Build rep stats
    const repStats: RepStats[] = userIds.map((uid) => {
      const userContacts = contacts.filter((c) => c.user_id === uid)
      const userLeads = leads.filter((l) => l.user_id === uid)
      const userCampaigns = campaigns.filter((c) => c.user_id === uid)

      // Deals by stage
      const stageCount = new Map<string, number>()
      for (const lead of userLeads) {
        const name = stageMap.get(lead.stage_id) ?? 'Unknown'
        stageCount.set(name, (stageCount.get(name) ?? 0) + 1)
      }

      return {
        user_id: uid,
        email: emailMap.get(uid) ?? uid.slice(0, 8),
        role: memberMap.get(uid) ?? 'rep',
        contacts_total: userContacts.length,
        contacts_this_week: userContacts.filter((c) => c.created_at >= weekAgo).length,
        deals_total: userLeads.length,
        deals_by_stage: Array.from(stageCount.entries()).map(([stage, count]) => ({ stage, count })),
        campaigns_total: userCampaigns.length,
      }
    })

    setReps(repStats)

    // Recent activity feed (last 20 items across all members)
    const activityItems: ActivityItem[] = [
      ...contacts.map((c) => ({
        type: 'contact' as const,
        label: 'Added a contact',
        user_email: emailMap.get(c.user_id) ?? '',
        created_at: c.created_at,
      })),
      ...leads.map((l) => ({
        type: 'deal' as const,
        label: `Created deal: ${l.title}`,
        user_email: emailMap.get(l.user_id) ?? '',
        created_at: l.created_at,
      })),
      ...campaigns.map((c) => ({
        type: 'campaign' as const,
        label: `Created campaign: ${c.name}`,
        user_email: emailMap.get(c.user_id) ?? '',
        created_at: c.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)

    setActivity(activityItems)
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const iconMap = {
    contact: Users,
    deal: TrendingUp,
    campaign: Mail,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <p className="text-blue-300 text-sm">Loading team dashboard...</p>
      </div>
    )
  }

  return (
    <div className="px-8 py-10 max-w-5xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Team Dashboard</h2>
        <p className="text-blue-300 text-sm mt-1">{orgName} &middot; {reps.length} member{reps.length !== 1 && 's'}</p>
      </div>

      {/* Rep Cards */}
      <div className="space-y-4 mb-10">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">Team Members</h3>
        {reps.map((rep) => (
          <div
            key={rep.user_id}
            className="bg-white/5 border border-white/10 rounded-2xl p-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-white font-medium">{rep.email}</p>
                <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                  rep.role === 'admin'
                    ? 'bg-yellow-500/10 text-yellow-400'
                    : 'bg-blue-500/10 text-blue-400'
                }`}>
                  {rep.role}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-2xl font-bold text-white">{rep.contacts_total}</p>
                <p className="text-[10px] uppercase tracking-wide text-blue-300/50">Contacts</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{rep.contacts_this_week}</p>
                <p className="text-[10px] uppercase tracking-wide text-blue-300/50">Added This Week</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{rep.deals_total}</p>
                <p className="text-[10px] uppercase tracking-wide text-blue-300/50">Deals</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{rep.campaigns_total}</p>
                <p className="text-[10px] uppercase tracking-wide text-blue-300/50">Campaigns</p>
              </div>
            </div>

            {rep.deals_by_stage.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-2">
                {rep.deals_by_stage.map((s) => (
                  <span
                    key={s.stage}
                    className="px-2.5 py-1 rounded-lg text-xs bg-white/5 border border-white/10 text-blue-200"
                  >
                    {s.stage}: <span className="font-semibold text-white">{s.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Activity Feed */}
      <div className="mb-10">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300 mb-4">Recent Activity</h3>
        {activity.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <Clock className="w-8 h-8 mx-auto mb-3 text-blue-300/30" />
            <p className="text-blue-300/60 text-sm">No recent activity.</p>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {activity.map((item, i) => {
              const Icon = iconMap[item.type]
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-5 py-3 border-b border-white/5 last:border-0"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(212,147,14,0.1)' }}
                  >
                    <Icon className="w-4 h-4" style={{ color: '#d4930e' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{item.label}</p>
                    <p className="text-xs text-blue-300/50">{item.user_email}</p>
                  </div>
                  <span className="text-xs text-blue-300/40 shrink-0">{timeAgo(item.created_at)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-center text-blue-400/50 text-xs mt-16">
        2026 Maco Logistics · LogiCRM
      </p>
    </div>
  )
}
