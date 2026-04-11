'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import toast from 'react-hot-toast'
import { RefreshCw, Loader2, TrendingUp, AlertTriangle, Users, BarChart3, DollarSign } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface RepData {
  name: string
  calls: number
  emails: number
  notes: number
  lastActivity: string | null
  deals: number
  pipelineValue: number
  campaignReplies: number
  campaignSent: number
}

interface ColdDeal {
  title: string
  rep: string
  value: number | null
  stage: string
  daysSinceActivity: number
}

interface CampaignData {
  id: string
  name: string
  repName: string
  recipient_count: number | null
  sent_count: number | null
  open_count: number | null
  reply_count: number | null
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const hrs = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  if (hrs < 1) return 'Just now'
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function statusBadge(lastActivity: string | null) {
  if (!lastActivity) return { label: 'Cold', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
  const hrs = (Date.now() - new Date(lastActivity).getTime()) / 3600000
  if (hrs < 24) return { label: 'Hot', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' }
  if (hrs < 72) return { label: 'Active', color: '#d4930e', bg: 'rgba(212,147,14,0.12)' }
  return { label: 'Cold', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
}

export default function SalesManagerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [briefing, setBriefing] = useState('')
  const [reps, setReps] = useState<RepData[]>([])
  const [coldDeals, setColdDeals] = useState<ColdDeal[]>([])
  const [campaigns, setCampaigns] = useState<CampaignData[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')

  const loadData = useCallback(async (showToast = false) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // Verify admin
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (!membership) { router.push('/dashboard'); return }

    setRefreshing(true)
    try {
      const res = await fetch('/api/sales-manager/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
      const data = await res.json()
      if (data.briefing) setBriefing(data.briefing)
      if (data.reps) setReps(data.reps)
      if (data.coldDeals) setColdDeals(data.coldDeals)
      if (data.campaigns) setCampaigns(data.campaigns)
      setLastUpdated(new Date().toLocaleTimeString())
      if (showToast) toast.success('Briefing refreshed')
    } catch (err) {
      console.error('Failed to load briefing:', err)
    }
    setRefreshing(false)
    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: '#d4930e' }} />
          <p className="text-blue-300/60 text-sm">Loading Sales Manager Portal...</p>
        </div>
      </div>
    )
  }

  const totalPipeline = reps.reduce((s, r) => s + r.pipelineValue, 0)
  const totalDeals = reps.reduce((s, r) => s + r.deals, 0)

  return (
    <div className="px-8 py-10 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-6 h-6" style={{ color: '#d4930e' }} />
            Sales Manager Portal
          </h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-sm text-blue-300">{reps.length} rep{reps.length !== 1 ? 's' : ''}</span>
            <span className="text-sm" style={{ color: '#d4930e' }}><DollarSign className="w-3.5 h-3.5 inline" />${totalPipeline.toLocaleString()} pipeline</span>
            <span className="text-sm text-blue-300">{totalDeals} deal{totalDeals !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* ── AI Briefing ── */}
      <div className="rounded-2xl p-6 mb-6" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(212,147,14,0.2)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#d4930e' }}>AI Sales Manager Briefing</h3>
          <div className="flex items-center gap-3">
            {lastUpdated && <span className="text-[10px] text-blue-300/40">Updated {lastUpdated}</span>}
            <button onClick={() => loadData(true)} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-300 border border-white/10 hover:text-white transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
        {refreshing && !briefing ? (
          <div className="flex items-center gap-3 py-8 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4930e' }} />
            <p className="text-sm text-blue-300/60">Analyzing team performance...</p>
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none text-blue-200 text-sm leading-relaxed sm-briefing">
            <ReactMarkdown>{briefing}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* ── Rep Scorecards ── */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300 mb-3">Rep Scorecards</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reps.map(rep => {
            const badge = statusBadge(rep.lastActivity)
            return (
              <div key={rep.name} className="rounded-xl p-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}>
                      {rep.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{rep.name}</p>
                      <p className="text-[10px] text-blue-300/40">{timeAgo(rep.lastActivity)}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: badge.bg, color: badge.color }}>{badge.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-lg font-bold text-white">{rep.calls}</p>
                    <p className="text-[9px] text-blue-300/40 uppercase">Calls</p>
                  </div>
                  <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-lg font-bold text-white">{rep.emails}</p>
                    <p className="text-[9px] text-blue-300/40 uppercase">Emails</p>
                  </div>
                  <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-lg font-bold text-white">{rep.deals}</p>
                    <p className="text-[9px] text-blue-300/40 uppercase">Deals</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="text-blue-300/50">Pipeline: <span className="font-semibold" style={{ color: '#d4930e' }}>${rep.pipelineValue.toLocaleString()}</span></span>
                  <span className="text-blue-300/50">Replies: <span className="font-semibold text-white">{rep.campaignReplies}</span></span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Three Panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Pipeline by Rep */}
        <div className="rounded-xl p-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" style={{ color: '#d4930e' }} /> Pipeline by Rep</h3>
          <div className="space-y-2">
            {[...reps].sort((a, b) => b.pipelineValue - a.pipelineValue).map(rep => (
              <div key={rep.name} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <span className="text-xs text-white">{rep.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-blue-300/40">{rep.deals} deals</span>
                  <span className="text-xs font-semibold" style={{ color: '#d4930e' }}>${rep.pipelineValue.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cold Deals */}
        <div className="rounded-xl p-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-400" /> Cold Deals</h3>
          {coldDeals.length === 0 ? (
            <p className="text-xs text-blue-300/40 text-center py-4">No cold deals</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {coldDeals.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity).slice(0, 10).map((deal, i) => (
                <div key={i} className="px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-white truncate">{deal.title}</p>
                    <span className="text-[10px] text-orange-400 shrink-0">{deal.daysSinceActivity}d inactive</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-blue-300/40">{deal.rep}</span>
                    {deal.value != null && deal.value > 0 && <span className="text-[10px]" style={{ color: '#d4930e' }}>${deal.value.toLocaleString()}</span>}
                    <span className="text-[10px] text-blue-300/30">{deal.stage}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campaign Performance */}
        <div className="rounded-xl p-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Users className="w-4 h-4" style={{ color: '#d4930e' }} /> Campaign Performance</h3>
          {campaigns.length === 0 ? (
            <p className="text-xs text-blue-300/40 text-center py-4">No campaigns</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {campaigns.sort((a, b) => {
                const rateA = (a.sent_count || 0) > 0 ? (a.reply_count || 0) / (a.sent_count || 1) : 0
                const rateB = (b.sent_count || 0) > 0 ? (b.reply_count || 0) / (b.sent_count || 1) : 0
                return rateB - rateA
              }).map(c => {
                const replyRate = (c.sent_count || 0) > 0 ? Math.round(((c.reply_count || 0) / (c.sent_count || 1)) * 100) : 0
                return (
                  <Link key={c.id} href={`/campaigns/${c.id}`} className="block px-3 py-2 rounded-lg hover:opacity-80 transition-opacity" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-white truncate">{c.name}</p>
                      <span className={`text-[10px] font-bold ${replyRate >= 5 ? 'text-emerald-400' : 'text-blue-300/50'}`}>{replyRate}% reply</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-blue-300/40">{c.repName}</span>
                      <span className="text-[10px] text-blue-300/30">{c.sent_count || 0} sent · {c.open_count || 0} opens · {c.reply_count || 0} replies</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Markdown styles */}
      <style jsx global>{`
        .sm-briefing h1, .sm-briefing h2, .sm-briefing h3 { font-weight: 600; color: #fff; margin: 0.5em 0 0.25em; }
        .sm-briefing h2 { font-size: 0.95em; }
        .sm-briefing h3 { font-size: 0.9em; }
        .sm-briefing p { margin: 0.35em 0; }
        .sm-briefing ul, .sm-briefing ol { margin: 0.35em 0; padding-left: 1.25em; }
        .sm-briefing li { margin: 0.15em 0; }
        .sm-briefing strong { color: #d4930e; font-weight: 600; }
      `}</style>
    </div>
  )
}
