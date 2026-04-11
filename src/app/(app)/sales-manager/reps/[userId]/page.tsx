'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { ArrowLeft, Loader2, DollarSign } from 'lucide-react'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

interface Contact { id: string; first_name: string; last_name: string; email: string | null; company: string | null }
interface Deal { id: string; title: string; value: number | null; stageName: string; stageColor: string }
interface Activity { id: string; type: string; subject: string; created_at: string; contactName: string }

function timeAgo(iso: string): string {
  const hrs = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  if (hrs < 1) return 'Just now'
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function RepDetailPage() {
  const { userId: repId } = useParams<{ userId: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [repName, setRepName] = useState('')
  const [repEmail, setRepEmail] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      // Get rep data via the sales-manager data API
      const res = await fetch('/api/sales-manager/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
      const data = await res.json()
      if (res.status === 403) { router.push('/dashboard'); return }

      const rep = data.reps?.find((r: { userId: string }) => r.userId === repId)
      if (rep) { setRepName(rep.name); setRepEmail(rep.email) }

      // Get contacts for this rep directly
      const { data: repContacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, company')
        .eq('user_id', repId)
        .order('first_name')
      setContacts(repContacts || [])

      // Get deals for this rep
      const repDeals = (data.deals || []).filter((d: { repUserId: string }) => d.repUserId === repId)
      setDeals(repDeals.map((d: { id: string; title: string; value: number | null; stageName: string; stageColor: string }) => ({
        id: d.id, title: d.title, value: d.value, stageName: d.stageName, stageColor: d.stageColor,
      })))

      // Get activities for this rep
      const repActs = (data.recentActivities || []).filter((a: { rep: string }) => a.rep === rep?.name)
      setActivities(repActs.map((a: { id: string; type: string; subject: string; createdAt: string; contactName: string }) => ({
        id: a.id, type: a.type, subject: a.subject, created_at: a.createdAt, contactName: a.contactName,
      })))

      setLoading(false)
    }
    load()
  }, [repId, router])

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin" style={{ color: '#d4930e' }} /></div>

  const filtered = contacts.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)
  })

  return (
    <div className="px-8 py-8 max-w-5xl">
      <Link href="/sales-manager" className="flex items-center gap-1 text-sm text-blue-300 hover:text-white transition-colors mb-4">
        <ArrowLeft size={16} /> Back to Sales Manager
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold" style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}>
          {repName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">{repName}</h2>
          <p className="text-sm text-blue-300/60">{repEmail}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Contacts', value: contacts.length },
          { label: 'Deals', value: deals.length },
          { label: 'Pipeline', value: `$${deals.reduce((s, d) => s + (d.value || 0), 0).toLocaleString()}` },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 text-center" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
            <DollarSign className="w-5 h-5 mx-auto mb-1" style={{ color: '#d4930e' }} />
            <p className="text-xl font-bold text-white">{s.value}</p>
            <p className="text-[10px] text-blue-300/40 uppercase">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contacts */}
        <div className="rounded-xl p-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-sm font-semibold text-white mb-3">Contacts ({contacts.length})</h3>
          <input type="text" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-blue-300/30 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 mb-3" />
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {filtered.map(c => (
              <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{c.first_name} {c.last_name}</p>
                  <p className="text-[10px] text-blue-300/40 truncate">{c.company || ''}{c.email ? ` · ${c.email}` : ''}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Deals + Activities */}
        <div className="space-y-6">
          <div className="rounded-xl p-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 className="text-sm font-semibold text-white mb-3">Deals</h3>
            <div className="space-y-2">
              {deals.length === 0 ? <p className="text-xs text-blue-300/40 text-center py-3">No deals</p> : deals.map(d => (
                <Link key={d.id} href={`/pipeline/${d.id}`} className="block px-3 py-2 rounded-lg hover:opacity-80" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-white truncate">{d.title}</p>
                    {d.value != null && <span className="text-xs font-semibold" style={{ color: '#d4930e' }}>${d.value.toLocaleString()}</span>}
                  </div>
                  <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full mt-1" style={{ backgroundColor: `${d.stageColor}22`, color: d.stageColor }}>{d.stageName}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 className="text-sm font-semibold text-white mb-3">Recent Activity</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {activities.length === 0 ? <p className="text-xs text-blue-300/40 text-center py-3">No recent activity</p> : activities.map(a => (
                <div key={a.id} className="px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-xs text-white truncate">{a.subject}</p>
                  <p className="text-[10px] text-blue-300/40">{a.contactName ? a.contactName + ' · ' : ''}<span className="capitalize">{a.type}</span> · {timeAgo(a.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
