'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { Loader2, Users, DollarSign, ClipboardList, AlertTriangle, Clock, RefreshCw } from 'lucide-react'

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
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')

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
            <ReactMarkdown>{briefing}</ReactMarkdown>
          </div>
        )}
      </div>

      <style jsx global>{`
        .sm-brief strong { color: #d4930e; font-weight: 600; }
        .sm-brief h1, .sm-brief h2, .sm-brief h3 { color: #fff; font-weight: 600; margin: 0.4em 0 0.2em; font-size: 0.95em; }
        .sm-brief p { margin: 0.3em 0; }
        .sm-brief ul, .sm-brief ol { margin: 0.3em 0; padding-left: 1.2em; }
        .sm-brief li { margin: 0.15em 0; }
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
                <Link href={`/sales-manager/reps/${r.userId}`} className="text-xs font-medium px-2 py-1 rounded-lg" style={{ color: '#d4930e', backgroundColor: 'rgba(212,147,14,0.08)' }}>View</Link>
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
    </div>
  )
}
