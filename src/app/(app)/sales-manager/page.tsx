'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Loader2, Users, DollarSign, ClipboardList, AlertTriangle, Clock, RefreshCw, X, PhoneCall, MailOpen, StickyNote, CalendarDays, CheckSquare } from 'lucide-react'
import toast from 'react-hot-toast'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

interface Rep { userId: string; name: string; email: string; contactsCount: number; dealsCount: number; pipelineValue: number; activitiesThisWeek: number; calls: number; emails: number; campaignContacts: number; lastActivity: string | null }
interface Deal { id: string; title: string; value: number | null; rep: string; repUserId: string; stageName: string; stageColor: string; lastActivity: string | null; daysInactive: number; contactName: string }
interface RecentActivity { id: string; rep: string; type: string; subject: string; contactName: string; createdAt: string }

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const hrs = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  if (hrs < 1) return 'Just now'
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function badge(last: string | null) {
  if (!last) return { l: 'Cold', c: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
  const hrs = (Date.now() - new Date(last).getTime()) / 3600000
  if (hrs < 24) return { l: 'Hot', c: '#22c55e', bg: 'rgba(34,197,94,0.12)' }
  if (hrs < 72) return { l: 'Active', c: '#d4930e', bg: 'rgba(212,147,14,0.12)' }
  return { l: 'Cold', c: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
}

export default function SalesManagerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [reps, setReps] = useState<Rep[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [recent, setRecent] = useState<RecentActivity[]>([])
  const [totals, setTotals] = useState({ reps: 0, contacts: 0, pipelineValue: 0, activitiesThisWeek: 0 })
  const [briefing, setBriefing] = useState('')
  const [campaignReplies, setCampaignReplies] = useState<{ id: string; contact_name: string; company: string; rep: string; notes: string; created_at: string; contact_id: string }[]>([])
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')

  const [conflicts, setConflicts] = useState<{ company: string; reps: string[]; contactCount: number }[]>([])

  // Rep panel
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelRep, setPanelRep] = useState<Rep | null>(null)
  const [panelTab, setPanelTab] = useState<'contacts' | 'pipeline' | 'activity' | 'campaigns'>('contacts')
  const [panelLoading, setPanelLoading] = useState(false)
  const [panelContacts, setPanelContacts] = useState<{ id: string; first_name: string; last_name: string; email: string | null; company: string | null }[]>([])
  const [panelDeals, setPanelDeals] = useState<{ id: string; title: string; value: number | null; stageName: string; stageColor: string; daysInactive: number }[]>([])
  const [panelActivities, setPanelActivities] = useState<{ id: string; type: string; subject: string; contactName: string; createdAt: string }[]>([])
  const [panelCampaigns, setPanelCampaigns] = useState<{ id: string; name: string; status: string; enrolled: number }[]>([])
  const [panelSearch, setPanelSearch] = useState('')
  const [pendingCampaigns, setPendingCampaigns] = useState<{ id: string; name: string; rep: string; submitted_at: string }[]>([])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const res = await fetch('/api/sales-manager/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id }),
    })
    const data = await res.json()
    if (res.status === 403) { router.push('/dashboard'); return }
    if (data.reps) setReps(data.reps)
    if (data.deals) setDeals(data.deals)
    if (data.recentActivities) setRecent(data.recentActivities)
    if (data.totals) setTotals(data.totals)
    setCurrentUserId(user.id)

    // Fetch pending campaigns via service-role endpoint (bypasses RLS so manager sees reps' pending)
    try {
      const pRes = await fetch(`/api/campaigns/pending?userId=${encodeURIComponent(user.id)}`)
      const pData = await pRes.json()
      console.log('[sales-manager] pending:', pData)
      if (pRes.ok && Array.isArray(pData.pending)) {
        setPendingCampaigns(pData.pending)
      }
    } catch (e) {
      console.error('[sales-manager] pending fetch error:', e)
    }

    // Load conflicts
    try {
      const confRes = await fetch('/api/sales-manager/conflicts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.id }) })
      const confData = await confRes.json()
      setConflicts(confData.conflicts || [])
    } catch { /* ignore */ }

    // Fetch campaign replies
    try {
      const { data: replies } = await supabase
        .from('activities')
        .select('id, contact_id, user_id, subject, notes, created_at')
        .like('subject', 'Campaign Reply:%')
        .eq('source', 'instantly')
        .order('created_at', { ascending: false })
        .limit(20)
      if (replies && data.reps) {
        const repMap = new Map((data.reps as Rep[]).map((r: Rep) => [r.userId, r.name]))
        // Get contact names
        const cIds = replies.filter(r => r.contact_id).map(r => r.contact_id)
        let contactMap = new Map<string, { name: string; company: string }>()
        if (cIds.length > 0) {
          const { data: contacts } = await supabase.from('contacts').select('id, first_name, last_name, company').in('id', cIds)
          contactMap = new Map((contacts || []).map(c => [c.id, { name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), company: c.company || '' }]))
        }
        setCampaignReplies(replies.map(r => ({
          id: r.id,
          contact_id: r.contact_id || '',
          contact_name: contactMap.get(r.contact_id)?.name || r.subject?.replace('Campaign Reply: ', '') || 'Unknown',
          company: contactMap.get(r.contact_id)?.company || '',
          rep: repMap.get(r.user_id) || 'Unknown',
          notes: (r.notes || '').slice(0, 100),
          created_at: r.created_at,
        })))
      }
    } catch { /* ignore */ }

    setLoading(false)

    // Load AI briefing in background
    loadBriefing(user.id)
  }, [router])

  async function loadBriefing(uid: string) {
    setBriefingLoading(true)
    try {
      const res = await fetch('/api/sales-manager/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid }),
      })
      const data = await res.json()
      setBriefing(data.briefing || 'Unable to load briefing — click Refresh to try again.')
    } catch (briefErr) {
      console.error('Briefing error:', briefErr)
      setBriefing('Unable to load briefing — click Refresh to try again.')
    }
    setBriefingLoading(false)
  }

  async function openRepPanel(rep: Rep) {
    setPanelRep(rep)
    setPanelTab('contacts')
    setPanelSearch('')
    setPanelOpen(true)
    setPanelLoading(true)
    try {
      const res = await fetch('/api/sales-manager/rep-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: rep.userId }),
      })
      const data = await res.json()
      setPanelContacts(data.contacts || [])
      setPanelDeals(data.deals || [])
      setPanelActivities(data.activities || [])
      setPanelCampaigns(data.campaigns || [])
    } catch (err) { console.error('Panel fetch error:', err) }
    setPanelLoading(false)
  }

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#d4930e' }} />
    </div>
  )

  const coldDeals = deals.filter(d => d.daysInactive >= 7 && d.daysInactive <= 365).sort((a, b) => b.daysInactive - a.daysInactive)

  return (
    <div className="px-8 py-8 max-w-7xl">
      <h2 className="text-2xl font-bold text-white mb-1">Sales Manager Portal</h2>
      <p className="text-blue-300/60 text-sm mb-6">Your team at a glance</p>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { icon: Users, label: 'Total Reps', value: totals.reps },
          { icon: Users, label: 'Total Contacts', value: totals.contacts },
          { icon: DollarSign, label: 'Pipeline Value', value: `$${totals.pipelineValue.toLocaleString()}` },
          { icon: ClipboardList, label: 'Activities This Week', value: totals.activitiesThisWeek },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 text-center" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
            <s.icon className="w-5 h-5 mx-auto mb-2" style={{ color: '#d4930e' }} />
            <p className="text-xl font-bold text-white">{s.value}</p>
            <p className="text-[10px] text-blue-300/40 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Pending Approvals ── */}
      {pendingCampaigns.length > 0 && (
        <div className="rounded-2xl p-5 mb-6 border" style={{ backgroundColor: 'rgba(212,147,14,0.05)', borderColor: 'rgba(212,147,14,0.3)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#d4930e' }}>{pendingCampaigns.length} campaign{pendingCampaigns.length !== 1 ? 's' : ''} pending your approval</h3>
          <div className="space-y-2">
            {pendingCampaigns.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{c.name}</p>
                  <p className="text-[10px] text-blue-300/40">{c.rep} · Submitted {c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/campaigns/${c.id}`} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors">Review</Link>
                  <button
                    onClick={async () => {
                      const res = await fetch('/api/campaigns/approval', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ campaign_id: c.id, action: 'approve', callerId: currentUserId }),
                      })
                      const d = await res.json().catch(() => ({}))
                      if (!res.ok) { toast.error(d.error || 'Approve failed'); return }
                      setPendingCampaigns(prev => prev.filter(p => p.id !== c.id))
                      toast.success(`Approved "${c.name}"`)
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:brightness-110 transition-colors"
                    style={{ backgroundColor: '#059669', color: '#fff' }}
                  >Approve</button>
                  <button
                    onClick={async () => {
                      const notes = typeof window !== 'undefined' ? window.prompt(`Reject "${c.name}" — feedback for the rep (required):`) : null
                      if (notes === null) return
                      if (!notes.trim()) { toast.error('Rejection notes are required'); return }
                      const res = await fetch('/api/campaigns/approval', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ campaign_id: c.id, action: 'reject', callerId: currentUserId, notes }),
                      })
                      const d = await res.json().catch(() => ({}))
                      if (!res.ok) { toast.error(d.error || 'Reject failed'); return }
                      setPendingCampaigns(prev => prev.filter(p => p.id !== c.id))
                      toast.success(`Rejected "${c.name}"`)
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:brightness-110 transition-colors"
                    style={{ backgroundColor: '#dc2626', color: '#fff' }}
                  >Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AI Briefing ── */}
      <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(212,147,14,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#d4930e' }}>AI Sales Manager</h3>
          <button onClick={() => loadBriefing(currentUserId)} disabled={briefingLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-300 border border-white/10 hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${briefingLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        {briefingLoading && !briefing ? (
          <div className="flex items-center gap-3 py-6 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4930e' }} />
            <p className="text-sm text-blue-300/60">Analyzing team performance...</p>
          </div>
        ) : (
          <div className="text-sm text-blue-200/80 leading-relaxed sm-brief">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing}</ReactMarkdown>
          </div>
        )}
      </div>

      <style jsx global>{`
        .sm-brief strong { color: #d4930e; font-weight: 600; }
        .sm-brief h1, .sm-brief h2, .sm-brief h3 { color: #fff; font-weight: 600; margin: 0.4em 0 0.2em; font-size: 0.95em; }
        .sm-brief p { margin: 0.3em 0; }
        .sm-brief ul, .sm-brief ol { margin: 0.3em 0; padding-left: 1.2em; }
        .sm-brief li { margin: 0.15em 0; }
        .sm-brief table { width: 100%; border-collapse: collapse; margin: 0.5em 0; font-size: 0.85em; }
        .sm-brief th, .sm-brief td { border: 1px solid rgba(255,255,255,0.1); padding: 0.4em 0.6em; text-align: left; }
        .sm-brief th { background: rgba(255,255,255,0.05); color: #fff; font-weight: 600; }
        .sm-brief td { color: #94a3b8; }
      `}</style>

      {/* ── Rep Scorecards ── */}
      <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300 mb-3">Rep Scorecards</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {reps.map(r => {
          const b = badge(r.lastActivity)
          return (
            <div key={r.userId} className="rounded-xl p-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}>
                    {r.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{r.name}</p>
                    <p className={`text-[10px] ${r.lastActivity && (Date.now() - new Date(r.lastActivity).getTime()) > 2 * 86400000 ? 'text-red-400' : 'text-blue-300/40'}`}>{timeAgo(r.lastActivity)}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: b.bg, color: b.c }}>{b.l}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="rounded-lg py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-lg font-bold text-white">{r.contactsCount}</p>
                  <p className="text-[8px] text-blue-300/40 uppercase">Contacts</p>
                </div>
                <div className="rounded-lg py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-lg font-bold text-white">{r.dealsCount}</p>
                  <p className="text-[8px] text-blue-300/40 uppercase">Deals</p>
                </div>
                <div className="rounded-lg py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-lg font-bold text-white">{r.activitiesThisWeek}</p>
                  <p className="text-[8px] text-blue-300/40 uppercase">Activity</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-blue-300/50">Pipeline: <span className="font-semibold" style={{ color: '#d4930e' }}>${r.pipelineValue.toLocaleString()}</span></span>
                <button onClick={() => openRepPanel(r)} className="text-xs font-medium px-2 py-1 rounded-lg" style={{ color: '#d4930e', backgroundColor: 'rgba(212,147,14,0.08)' }}>View</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Master Pipeline Table ── */}
      <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300 mb-3">Master Pipeline</h3>
      <div className="rounded-xl overflow-hidden mb-6" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                {['Deal', 'Rep', 'Value', 'Stage', 'Last Activity', 'Days'].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-blue-300/50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...deals].sort((a, b) => b.daysInactive - a.daysInactive).slice(0, 20).map(d => (
                <tr key={d.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${d.daysInactive >= 7 && d.daysInactive <= 365 ? 'bg-red-500/5' : ''}`} onClick={() => router.push(`/pipeline/${d.id}`)}>
                  <td className="px-4 py-2.5 text-xs text-white font-medium">{d.title}</td>
                  <td className="px-4 py-2.5 text-xs text-blue-300/60">{d.rep}</td>
                  <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: '#d4930e' }}>{d.value ? `$${d.value.toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${d.stageColor}22`, color: d.stageColor }}>{d.stageName}</span></td>
                  <td className="px-4 py-2.5 text-xs text-blue-300/40">{timeAgo(d.lastActivity)}</td>
                  <td className={`px-4 py-2.5 text-xs font-medium ${d.daysInactive >= 7 && d.daysInactive <= 365 ? 'text-red-400' : 'text-blue-300/40'}`}>{d.daysInactive > 365 ? '—' : d.daysInactive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bottom Two Columns ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cold Deals */}
        <div className="rounded-xl p-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-400" /> Cold Deals ({coldDeals.length})</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {coldDeals.length === 0 ? <p className="text-xs text-blue-300/40 text-center py-4">No cold deals</p> : coldDeals.slice(0, 10).map(d => (
              <Link key={d.id} href={`/pipeline/${d.id}`} className="block px-3 py-2 rounded-lg hover:opacity-80" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-white truncate">{d.title}</p>
                  <span className="text-[10px] text-red-400 shrink-0 ml-2">{d.daysInactive > 365 ? '—' : `${d.daysInactive}d`}</span>
                </div>
                <p className="text-[10px] text-blue-300/40">{d.rep} · {d.value ? `$${d.value.toLocaleString()}` : 'No value'} · {d.stageName}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Team Activity Feed */}
        <div className="rounded-xl p-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Clock className="w-4 h-4" style={{ color: '#d4930e' }} /> Team Activity</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {recent.length === 0 ? <p className="text-xs text-blue-300/40 text-center py-4">No recent activity</p> : recent.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate"><span className="font-medium">{a.rep}</span> · {a.subject}</p>
                  <p className="text-[10px] text-blue-300/40">{a.contactName ? a.contactName + ' · ' : ''}<span className="capitalize">{a.type}</span> · {timeAgo(a.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Campaign Replies ── */}
      {campaignReplies.length > 0 && (
        <div className="mt-6 rounded-xl p-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(212,147,14,0.2)' }}>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#d4930e' }}>🔥 Campaign Replies ({campaignReplies.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase text-blue-300/50">Contact</th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase text-blue-300/50">Company</th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase text-blue-300/50">Rep</th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase text-blue-300/50">Reply</th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase text-blue-300/50">Time</th>
                </tr>
              </thead>
              <tbody>
                {campaignReplies.map(r => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => r.contact_id && router.push(`/contacts/${r.contact_id}`)}>
                    <td className="px-3 py-2 text-xs font-medium text-white">{r.contact_name}</td>
                    <td className="px-3 py-2 text-xs text-blue-300/60">{r.company}</td>
                    <td className="px-3 py-2 text-xs text-blue-300/60">{r.rep}</td>
                    <td className="px-3 py-2 text-xs text-blue-300/40 max-w-[200px] truncate">{r.notes}</td>
                    <td className="px-3 py-2 text-xs text-blue-300/40">{timeAgo(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Account Conflicts ── */}
      {conflicts.length > 0 && (
        <div className="mt-6 rounded-xl p-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-yellow-400" /> Account Conflicts ({conflicts.length})</h3>
          <p className="text-xs text-blue-300/40 mb-3">Companies where multiple reps have contacts — may need assignment.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase text-blue-300/50">Company</th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase text-blue-300/50">Reps Involved</th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase text-blue-300/50">Contacts</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.slice(0, 15).map((c, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="px-3 py-2 text-xs text-white font-medium">{c.company}</td>
                    <td className="px-3 py-2 text-xs text-blue-300/60">{c.reps.join(', ')}</td>
                    <td className="px-3 py-2 text-xs text-blue-300/40">{c.contactCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ Rep Slide-Out Panel ══ */}
      {panelOpen && (
        <div className="fixed inset-0 z-50" onClick={() => setPanelOpen(false)}>
          <div className="absolute inset-0 bg-black/50 transition-opacity" />
          <div
            className="absolute top-0 right-0 h-full w-[420px] max-w-full flex flex-col shadow-2xl transition-transform"
            style={{ backgroundColor: '#0f1c35', borderLeft: '1px solid rgba(212,147,14,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Panel Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3 shrink-0">
              {panelRep && (
                <>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}>
                    {panelRep.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{panelRep.name}</p>
                    <p className="text-[10px] text-blue-300/40">{panelRep.email}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: badge(panelRep.lastActivity).bg, color: badge(panelRep.lastActivity).c }}>{badge(panelRep.lastActivity).l}</span>
                </>
              )}
              <button onClick={() => setPanelOpen(false)} className="text-blue-300/40 hover:text-white transition-colors shrink-0"><X className="w-5 h-5" /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/10 shrink-0">
              {(['contacts', 'pipeline', 'activity', 'campaigns'] as const).map(t => (
                <button key={t} onClick={() => setPanelTab(t)} className={`flex-1 py-2.5 text-xs font-medium transition-colors ${panelTab === t ? 'border-b-2' : 'text-blue-300/40 hover:text-blue-300'}`} style={panelTab === t ? { color: '#d4930e', borderColor: '#d4930e' } : undefined}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {panelLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#d4930e' }} /></div>
              ) : panelTab === 'contacts' ? (
                <div>
                  <input type="text" value={panelSearch} onChange={e => setPanelSearch(e.target.value)} placeholder="Search contacts..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-blue-300/30 mb-3 focus:outline-none focus:ring-2 focus:ring-yellow-500/50" />
                  <p className="text-[10px] text-blue-300/40 mb-2">{panelContacts.length} contacts</p>
                  <div className="space-y-1">
                    {panelContacts.filter(c => { if (!panelSearch) return true; const q = panelSearch.toLowerCase(); return `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) }).map(c => (
                      <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate">{c.first_name} {c.last_name}</p>
                          <p className="text-[10px] text-blue-300/40 truncate">{[c.company, c.email].filter(Boolean).join(' · ')}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : panelTab === 'pipeline' ? (
                <div>
                  <p className="text-xs text-blue-300/50 mb-3">Total: <span className="font-semibold" style={{ color: '#d4930e' }}>${panelDeals.reduce((s, d) => s + (d.value || 0), 0).toLocaleString()}</span> · {panelDeals.length} deals</p>
                  <div className="space-y-2">
                    {panelDeals.map(d => (
                      <Link key={d.id} href={`/pipeline/${d.id}`} className="block px-3 py-2 rounded-lg hover:bg-white/5 transition-colors" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-white truncate">{d.title}</p>
                          {d.value != null && d.value > 0 && <span className="text-xs font-semibold shrink-0" style={{ color: '#d4930e' }}>${d.value.toLocaleString()}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${d.stageColor}22`, color: d.stageColor }}>{d.stageName}</span>
                          {d.daysInactive <= 365 && <span className={`text-[10px] ${d.daysInactive >= 7 ? 'text-red-400' : 'text-blue-300/40'}`}>{d.daysInactive}d inactive</span>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : panelTab === 'activity' ? (
                <div className="space-y-2">
                  {panelActivities.length === 0 ? <p className="text-xs text-blue-300/40 text-center py-8">No recent activity</p> : panelActivities.map(a => {
                    const icons: Record<string, typeof PhoneCall> = { call: PhoneCall, email: MailOpen, note: StickyNote, meeting: CalendarDays, task: CheckSquare }
                    const ActIcon = icons[a.type] || StickyNote
                    return (
                      <div key={a.id} className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                        <ActIcon className="w-3.5 h-3.5 mt-0.5 text-blue-300/30 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-white truncate">{a.subject}</p>
                          <p className="text-[10px] text-blue-300/40">{a.contactName ? a.contactName + ' · ' : ''}{timeAgo(a.createdAt)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {panelCampaigns.length === 0 ? <p className="text-xs text-blue-300/40 text-center py-8">No campaigns</p> : panelCampaigns.map(c => (
                    <Link key={c.id} href={`/campaigns/${c.id}`} className="block px-3 py-2 rounded-lg hover:bg-white/5 transition-colors" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-white truncate">{c.name}</p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${c.status === 'active' ? 'text-emerald-400 bg-emerald-500/10' : c.status === 'paused' ? 'text-yellow-400 bg-yellow-500/10' : 'text-blue-300/40 bg-white/5'}`}>{c.status}</span>
                      </div>
                      <p className="text-[10px] text-blue-300/40 mt-0.5">{c.enrolled} contacts enrolled</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
