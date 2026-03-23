'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Edit2, Save, X, ExternalLink, Users, TrendingUp,
  Clock, PhoneCall, MailOpen, StickyNote, CalendarDays, CheckSquare,
  Sparkles, Loader2, RefreshCw, Building2, Truck, Newspaper, Target,
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Company {
  id: string
  name: string
  website: string | null
  industry: string | null
  city: string | null
  state: string | null
  notes: string | null
  created_at: string
}

interface ContactRow { id: string; first_name: string | null; last_name: string | null; title: string | null; email: string | null; phone: string | null }
interface DealRow { id: string; title: string; value: number | null; stage_name: string | null }
interface ActivityRow { id: string; type: string; subject: string; notes: string | null; created_at: string; contact_name: string }

const ACTIVITY_ICONS: Record<string, typeof PhoneCall> = {
  call: PhoneCall, email: MailOpen, note: StickyNote, meeting: CalendarDays, task: CheckSquare,
}

function stripTags(text: string) {
  // Remove <cite index="...">text</cite> keeping inner text
  let cleaned = text
  // Loop to handle nested or repeated cite tags
  while (/<cite[^>]*>/.test(cleaned)) {
    cleaned = cleaned.replace(/<cite[^>]*>/g, '').replace(/<\/cite>/g, '')
  }
  // Strip any other XML-style tags (e.g. <source>, <search_result>, etc.)
  cleaned = cleaned.replace(/<\/?[a-zA-Z][a-zA-Z0-9_]*[^>]*>/g, '')
  return cleaned.trim()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<Company | null>(null)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [deals, setDeals] = useState<DealRow[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityRow[]>([])

  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Company>>({})
  const [saving, setSaving] = useState(false)

  // AI Intel
  const [showIntel, setShowIntel] = useState(false)
  const [intelLoading, setIntelLoading] = useState(false)
  const [intel, setIntel] = useState<{ overview: string; freightProfile: string; recentNews: string; salesAngle: string } | null>(null)
  const [savingIntel, setSavingIntel] = useState(false)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: comp } = await supabase.from('companies').select('*').eq('id', id).single()
    if (!comp) { toast.error('Company not found'); router.push('/companies'); return }
    setCompany(comp as Company)
    setEditData(comp)

    // Contacts matching company name
    const { data: contactData } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, title, email, phone')
      .eq('user_id', user.id)
      .ilike('company', comp.name)
      .order('first_name')

    const compContacts = contactData ?? []
    setContacts(compContacts)

    if (compContacts.length > 0) {
      const contactIds = compContacts.map(c => c.id)

      // Deals linked to these contacts
      const { data: leadData } = await supabase
        .from('leads')
        .select('id, title, value, stage_id, pipeline_stages(name)')
        .in('contact_id', contactIds)

      setDeals(
        (leadData ?? []).map(l => ({
          id: l.id,
          title: l.title,
          value: l.value,
          stage_name: (l.pipeline_stages as unknown as { name: string } | null)?.name ?? null,
        }))
      )

      // Recent activities across all contacts
      const { data: actData } = await supabase
        .from('activities')
        .select('id, type, subject, notes, created_at, contact_id')
        .in('contact_id', contactIds)
        .order('created_at', { ascending: false })
        .limit(10)

      const contactNameMap = new Map(compContacts.map(c => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed']))

      setRecentActivity(
        (actData ?? []).map(a => ({
          ...a,
          contact_name: contactNameMap.get(a.contact_id) ?? '',
        }))
      )
    }

    setLoading(false)
  }, [id, router])

  useEffect(() => { loadData() }, [loadData])

  async function saveCompany() {
    if (!company) return
    setSaving(true)
    const { error } = await supabase.from('companies').update({
      name: editData.name?.trim(),
      website: editData.website?.trim() || null,
      industry: editData.industry || null,
      city: editData.city?.trim() || null,
      state: editData.state || null,
      notes: editData.notes?.trim() || null,
    }).eq('id', company.id)

    if (error) { toast.error('Failed to save') }
    else {
      setCompany({ ...company, ...editData } as Company)
      setEditing(false)
      toast.success('Company updated')
    }
    setSaving(false)
  }

  // ── AI Intel ──────────────────────────────────────────────────────────────

  async function handleGetIntel() {
    if (!company) return
    setShowIntel(true)
    setIntelLoading(true)
    setIntel(null)
    try {
      const location = [company.city, company.state].filter(Boolean).join(', ')
      const res = await fetch('/api/ai/company-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: company.name,
          industry: company.industry,
          location,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Intel research failed')
      } else {
        setIntel(data.intel)
      }
    } catch {
      toast.error('Intel research failed')
    }
    setIntelLoading(false)
  }

  async function handleSaveIntel() {
    if (!company || !intel) return
    setSavingIntel(true)
    const intelText = `[AI Intel - ${new Date().toLocaleDateString()}]\n\nOVERVIEW: ${stripTags(intel.overview)}\n\nFREIGHT PROFILE: ${stripTags(intel.freightProfile)}\n\nRECENT NEWS: ${stripTags(intel.recentNews)}\n\nSALES ANGLE: ${stripTags(intel.salesAngle)}`
    const existingNotes = company.notes ? `${company.notes}\n\n---\n\n` : ''
    const newNotes = existingNotes + intelText

    const { error } = await supabase
      .from('companies')
      .update({ notes: newNotes })
      .eq('id', company.id)

    if (error) {
      toast.error('Failed to save intel')
    } else {
      setCompany({ ...company, notes: newNotes })
      setEditData(prev => ({ ...prev, notes: newNotes }))
      toast.success('Intel saved to company notes')
    }
    setSavingIntel(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full min-h-screen"><p className="text-blue-300 text-sm">Loading company...</p></div>
  }
  if (!company) return null

  const location = [company.city, company.state].filter(Boolean).join(', ')
  const totalDealValue = deals.reduce((s, d) => s + (d.value ?? 0), 0)

  const inputClass = 'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1.5'

  return (
    <div className="px-8 py-10 max-w-5xl">
      <button onClick={() => router.push('/companies')} className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Companies
      </button>

      {/* Header card */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 mb-6">
        <div className="flex items-start justify-between gap-4">
          {editing ? (
            <div className="flex-1 space-y-4">
              <div><label className={labelClass}>Name</label><input type="text" value={editData.name ?? ''} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} className={inputClass} /></div>
              <div><label className={labelClass}>Website</label><input type="url" value={editData.website ?? ''} onChange={e => setEditData(d => ({ ...d, website: e.target.value }))} className={inputClass} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className={labelClass}>Industry</label><input type="text" value={editData.industry ?? ''} onChange={e => setEditData(d => ({ ...d, industry: e.target.value }))} className={inputClass} /></div>
                <div><label className={labelClass}>City</label><input type="text" value={editData.city ?? ''} onChange={e => setEditData(d => ({ ...d, city: e.target.value }))} className={inputClass} /></div>
                <div><label className={labelClass}>State</label><input type="text" value={editData.state ?? ''} onChange={e => setEditData(d => ({ ...d, state: e.target.value }))} className={inputClass} /></div>
              </div>
              <div><label className={labelClass}>Notes</label><textarea rows={3} value={editData.notes ?? ''} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} className={`${inputClass} resize-none`} /></div>
            </div>
          ) : (
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">{company.name}</h2>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {company.industry && <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-semibold">{company.industry}</span>}
                {location && <span className="text-xs text-blue-300/50">{location}</span>}
              </div>
              {company.website && (
                <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm mt-2 hover:underline" style={{ color: '#d4930e' }}>
                  {company.website} <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {company.notes && (
                <div className="mt-4 p-3 rounded-lg text-sm text-blue-200/80 italic" style={{ backgroundColor: 'rgba(212,147,14,0.08)', borderLeft: '3px solid #d4930e' }}>{company.notes}</div>
              )}
              <p className="text-xs text-blue-300/30 mt-3">Added {formatDate(company.created_at)}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 shrink-0">
            {editing ? (
              <>
                <button onClick={saveCompany} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60" style={{ backgroundColor: '#d4930e' }}><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}</button>
                <button onClick={() => { setEditData(company); setEditing(false) }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-blue-300 border border-white/10 hover:text-white"><X className="w-4 h-4" /> Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"><Edit2 className="w-4 h-4" /> Edit</button>
                <button
                  onClick={handleGetIntel}
                  disabled={intelLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                  style={{ color: '#d4930e', border: '1px solid rgba(212,147,14,0.4)', backgroundColor: 'rgba(212,147,14,0.08)' }}
                >
                  <Sparkles className="w-4 h-4" /> {intelLoading ? 'Researching...' : 'AI Intel'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/10">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{contacts.length}</p>
            <p className="text-[10px] uppercase tracking-wide text-blue-300/50">Contacts</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{deals.length}</p>
            <p className="text-[10px] uppercase tracking-wide text-blue-300/50">Deals</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-white" style={{ color: '#d4930e' }}>${totalDealValue.toLocaleString()}</p>
            <p className="text-[10px] uppercase tracking-wide text-blue-300/50">Pipeline Value</p>
          </div>
        </div>
      </div>

      {/* AI Intel Panel */}
      {showIntel && (
        <div className="mb-6 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(212,147,14,0.3)', backgroundColor: 'rgba(212,147,14,0.04)' }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(212,147,14,0.15)' }}>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: '#d4930e' }} />
              <p className="text-sm font-semibold" style={{ color: '#d4930e' }}>AI Intelligence Brief</p>
            </div>
            <div className="flex items-center gap-2">
              {intel && (
                <>
                  <button
                    onClick={handleSaveIntel}
                    disabled={savingIntel}
                    className="text-xs px-3 py-1 rounded-lg font-medium text-blue-300 border border-white/10 hover:text-white hover:border-white/20 disabled:opacity-40 transition-colors"
                  >
                    {savingIntel ? 'Saving...' : 'Save Intel'}
                  </button>
                  <button
                    onClick={handleGetIntel}
                    disabled={intelLoading}
                    className="text-xs px-3 py-1 rounded-lg font-medium text-blue-300 border border-white/10 hover:text-white hover:border-white/20 disabled:opacity-40 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 inline mr-1 ${intelLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </>
              )}
              <button onClick={() => setShowIntel(false)} className="text-blue-300/40 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-5">
            {intelLoading ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4930e' }} />
                <p className="text-sm text-blue-300/60">Researching {company.name}...</p>
              </div>
            ) : intel ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Building2 className="w-3.5 h-3.5" style={{ color: '#d4930e' }} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-300/50">Company Overview</p>
                  </div>
                  <p className="text-sm text-blue-200 leading-relaxed">{stripTags(intel.overview)}</p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Truck className="w-3.5 h-3.5" style={{ color: '#d4930e' }} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-300/50">Freight Profile</p>
                  </div>
                  <p className="text-sm text-blue-200 leading-relaxed">{stripTags(intel.freightProfile)}</p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Newspaper className="w-3.5 h-3.5" style={{ color: '#d4930e' }} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-300/50">Recent News</p>
                  </div>
                  <p className="text-sm text-blue-200 leading-relaxed">{stripTags(intel.recentNews)}</p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Target className="w-3.5 h-3.5" style={{ color: '#d4930e' }} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-300/50">Sales Angle</p>
                  </div>
                  <p className="text-sm text-blue-200 leading-relaxed">{stripTags(intel.salesAngle)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-blue-300/40 text-center py-6">No intel generated yet.</p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contacts */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: '#d4930e' }} />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">Contacts ({contacts.length})</h3>
          </div>
          {contacts.length === 0 ? (
            <p className="px-5 py-8 text-center text-blue-300/40 text-sm">No contacts at this company yet.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {contacts.map(c => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed'
                return (
                  <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between px-5 py-3 border-b border-white/5 hover:bg-white/5 transition-colors">
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#d4930e' }}>{name}</p>
                      {c.title && <p className="text-xs text-blue-300/50">{c.title}</p>}
                    </div>
                    <p className="text-xs text-blue-300/40">{c.email}</p>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Deals */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: '#d4930e' }} />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">Deals ({deals.length})</h3>
          </div>
          {deals.length === 0 ? (
            <p className="px-5 py-8 text-center text-blue-300/40 text-sm">No deals linked to contacts at this company.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {deals.map(d => (
                <Link key={d.id} href={`/pipeline/${d.id}`} className="flex items-center justify-between px-5 py-3 border-b border-white/5 hover:bg-white/5 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-white">{d.title}</p>
                    {d.stage_name && <span className="text-xs text-blue-300/50">{d.stage_name}</span>}
                  </div>
                  {d.value != null && d.value > 0 && (
                    <p className="text-sm font-semibold" style={{ color: '#d4930e' }}>${d.value.toLocaleString()}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden mt-6">
        <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
          <Clock className="w-4 h-4" style={{ color: '#d4930e' }} />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">Recent Activity</h3>
        </div>
        {recentActivity.length === 0 ? (
          <p className="px-5 py-8 text-center text-blue-300/40 text-sm">No activity logged for contacts at this company.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {recentActivity.map(a => {
              const Icon = ACTIVITY_ICONS[a.type] ?? StickyNote
              return (
                <div key={a.id} className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
                  <Icon className="w-4 h-4 text-blue-300/40 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{a.subject}</p>
                    <p className="text-xs text-blue-300/40">{a.contact_name} · {formatDate(a.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-center text-blue-400/50 text-xs mt-16">2026 Bid Genie AI · LogiCRM</p>
    </div>
  )
}
