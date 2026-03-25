'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Users, TrendingUp, Mail, Upload, Loader2 } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const AGENTS = [
  { id: 'jordan', name: 'Jordan', role: 'Sales Coach', emoji: '🎯', color: '#f59e0b', bgColor: 'rgba(245,158,11,0.15)' },
  { id: 'maya', name: 'Maya', role: 'Email Strategist', emoji: '📧', color: '#8b5cf6', bgColor: 'rgba(139,92,246,0.15)' },
  { id: 'rex', name: 'Rex', role: 'Market Analyst', emoji: '📊', color: '#10b981', bgColor: 'rgba(16,185,129,0.15)' },
  { id: 'alex', name: 'Alex', role: 'Content Writer', emoji: '✍️', color: '#3b82f6', bgColor: 'rgba(59,130,246,0.15)' },
]

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ contacts: 0, deals: 0, campaigns: 0 })
  const [greeting, setGreeting] = useState<{ agent: typeof AGENTS[0]; text: string } | null>(null)
  const [greetingLoading, setGreetingLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [contactsRes, leadsRes, campaignsRes] = await Promise.all([
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('email_campaigns').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ])

      setStats({
        contacts: contactsRes.count ?? 0,
        deals: leadsRes.count ?? 0,
        campaigns: campaignsRes.count ?? 0,
      })
      setLoading(false)

      // Pick random agent and fetch greeting
      const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)]
      try {
        const res = await fetch('/api/marketing-team/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: agent.id, userId: user.id }),
        })
        const data = await res.json()
        if (res.ok && data.insight) {
          setGreeting({ agent, text: data.insight })
        }
      } catch { /* silent */ }
      setGreetingLoading(false)
    }
    init()
  }, [])

  const statCards = [
    { label: 'Total Contacts', value: stats.contacts, icon: Users },
    { label: 'Pipeline Deals', value: stats.deals, icon: TrendingUp },
    { label: 'Campaigns', value: stats.campaigns, icon: Mail },
  ]

  const quickActions = [
    { label: 'All Contacts', icon: Users, href: '/contacts' },
    { label: 'View Pipeline', icon: TrendingUp, href: '/pipeline' },
    { label: 'Campaigns', icon: Mail, href: '/campaigns' },
    { label: 'Import Contacts', icon: Upload, href: '/contacts/import' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <p className="text-blue-300 text-sm">Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="px-8 py-10 max-w-5xl">
      {/* Welcome */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-blue-300 text-sm mt-1">Welcome back — here&apos;s your overview.</p>
      </div>

      {/* Agent Greeting */}
      {greetingLoading ? (
        <div className="mb-8 rounded-2xl p-5 flex items-center gap-3" style={{ backgroundColor: 'rgba(212,147,14,0.06)', border: '1px solid rgba(212,147,14,0.15)' }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4930e' }} />
          <p className="text-sm text-blue-300/50">Your AI team is checking in...</p>
        </div>
      ) : greeting ? (
        <Link
          href="/marketing-team"
          className="block mb-8 rounded-2xl p-5 transition-colors hover:brightness-105"
          style={{ backgroundColor: 'rgba(212,147,14,0.06)', border: '1px solid rgba(212,147,14,0.2)' }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: greeting.agent.bgColor }}
            >
              {greeting.agent.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-white">{greeting.agent.name}</p>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: greeting.agent.color, backgroundColor: greeting.agent.bgColor }}>
                  {greeting.agent.role}
                </span>
              </div>
              <p className="text-sm text-blue-200/80 leading-relaxed">{greeting.text}</p>
            </div>
          </div>
        </Link>
      ) : null}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center gap-4"
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: '#d4930e' }}
            >
              <card.icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-3xl font-bold text-white">{card.value}</p>
              <p className="text-blue-300 text-sm">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-10">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => router.push(action.href)}
              className="bg-white/5 border border-white/10 hover:border-yellow-500/50 rounded-2xl p-5 text-center transition-colors group"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3"
                style={{ backgroundColor: 'rgba(212,147,14,0.15)' }}
              >
                <action.icon className="w-5 h-5" style={{ color: '#d4930e' }} />
              </div>
              <span className="text-sm font-medium text-blue-200 group-hover:text-white transition-colors">
                {action.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-blue-400/50 text-xs mt-16">
        2026 Bid Genie AI · LogiCRM
      </p>
    </div>
  )
}
