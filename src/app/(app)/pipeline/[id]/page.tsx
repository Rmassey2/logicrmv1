'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Edit2,
  Save,
  X,
  Plus,
  PhoneCall,
  MailOpen,
  StickyNote,
  CalendarDays,
  CheckSquare,
  Clock,
  Trash2,
  DollarSign,
  TrendingUp,
  User,
  Sparkles,
  Loader2,
  AlertTriangle,
  Target,
  Zap,
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string
  title: string
  value: number | null
  stage_id: string
  contact_id: string | null
  notes: string | null
  created_at: string
}

interface Stage {
  id: string
  name: string
}

interface ContactOption {
  id: string
  first_name: string | null
  last_name: string | null
  company: string | null
}

interface Activity {
  id: string
  contact_id: string | null
  user_id: string
  type: 'call' | 'email' | 'note' | 'meeting' | 'task'
  subject: string
  notes: string | null
  completed: boolean
  created_at: string
}

interface CoachAdvice {
  summary: string
  actions: string[]
  risk: string
}

const ACTIVITY_TYPES = [
  { value: 'call',    label: 'Call',    icon: PhoneCall,   color: 'text-blue-400' },
  { value: 'email',   label: 'Email',   icon: MailOpen,    color: 'text-purple-400' },
  { value: 'note',    label: 'Note',    icon: StickyNote,  color: 'text-yellow-400' },
  { value: 'meeting', label: 'Meeting', icon: CalendarDays, color: 'text-green-400' },
  { value: 'task',    label: 'Task',    icon: CheckSquare, color: 'text-orange-400' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getActivityMeta(type: Activity['type']) {
  return ACTIVITY_TYPES.find(t => t.value === type) ?? ACTIVITY_TYPES[2]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function contactName(c: ContactOption | null) {
  if (!c) return null
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed'
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [lead, setLead] = useState<Lead | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [linkedContact, setLinkedContact] = useState<ContactOption | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editValue, setEditValue] = useState('')
  const [editStageId, setEditStageId] = useState('')
  const [editContactId, setEditContactId] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [savingDeal, setSavingDeal] = useState(false)

  // Activity modal
  const [showModal, setShowModal] = useState(false)
  const [activityForm, setActivityForm] = useState({
    type: 'note' as Activity['type'],
    subject: '',
    notes: '',
  })
  const [savingActivity, setSavingActivity] = useState(false)

  // AI Coach
  const [showCoach, setShowCoach] = useState(false)
  const [coachLoading, setCoachLoading] = useState(false)
  const [advice, setAdvice] = useState<CoachAdvice | null>(null)

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)

      const [leadRes, stagesRes, contactsRes, activitiesRes] = await Promise.all([
        supabase.from('leads').select('*').eq('id', id).single(),
        supabase.from('pipeline_stages').select('id, name').eq('user_id', user.id).order('position'),
        supabase.from('contacts').select('id, first_name, last_name, company').eq('user_id', user.id).order('first_name'),
        supabase.from('activities').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
      ])

      if (leadRes.error || !leadRes.data) {
        toast.error('Deal not found')
        router.push('/pipeline')
        return
      }

      const deal = leadRes.data as Lead
      setLead(deal)
      setEditTitle(deal.title)
      setEditValue(deal.value?.toString() ?? '')
      setEditStageId(deal.stage_id)
      setEditContactId(deal.contact_id ?? '')
      setEditNotes(deal.notes ?? '')

      setStages(stagesRes.data ?? [])
      setContacts(contactsRes.data ?? [])
      setActivities(activitiesRes.data ?? [])

      if (deal.contact_id) {
        const match = (contactsRes.data ?? []).find(c => c.id === deal.contact_id)
        setLinkedContact(match ?? null)
      }

      setLoading(false)
    }
    load()
  }, [id, router])

  // ── Save deal edits ────────────────────────────────────────────────────────

  async function saveDeal() {
    if (!lead) return
    if (!editTitle.trim()) { toast.error('Title is required'); return }
    setSavingDeal(true)

    const updates = {
      title: editTitle.trim(),
      value: editValue ? parseFloat(editValue) : null,
      stage_id: editStageId,
      contact_id: editContactId || null,
      notes: editNotes.trim() || null,
    }

    const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)

    if (error) {
      console.error('Deal update failed:', error)
      toast.error(`Failed to save: ${error.message}`)
    } else {
      setLead({ ...lead, ...updates })
      const match = contacts.find(c => c.id === updates.contact_id)
      setLinkedContact(match ?? null)
      setEditing(false)
      toast.success('Deal updated')
    }
    setSavingDeal(false)
  }

  function cancelEdit() {
    if (!lead) return
    setEditTitle(lead.title)
    setEditValue(lead.value?.toString() ?? '')
    setEditStageId(lead.stage_id)
    setEditContactId(lead.contact_id ?? '')
    setEditNotes(lead.notes ?? '')
    setEditing(false)
  }

  // ── Log activity ───────────────────────────────────────────────────────────

  async function logActivity() {
    if (!activityForm.subject.trim()) { toast.error('Subject is required'); return }
    setSavingActivity(true)

    const { data, error } = await supabase.from('activities').insert({
      lead_id: id,
      user_id: userId,
      type: activityForm.type,
      subject: activityForm.subject.trim(),
      notes: activityForm.notes.trim() || null,
    }).select().single()

    if (error) {
      console.error('Activity insert failed:', error)
      toast.error(`Failed to log activity: ${error.message}`)
    } else {
      setActivities(prev => [data, ...prev])
      setShowModal(false)
      setActivityForm({ type: 'note', subject: '', notes: '' })
      toast.success('Activity logged')
    }
    setSavingActivity(false)
  }

  async function toggleComplete(activity: Activity) {
    const newVal = !activity.completed
    const { error } = await supabase.from('activities').update({ completed: newVal }).eq('id', activity.id)
    if (!error) {
      setActivities(prev => prev.map(a => a.id === activity.id ? { ...a, completed: newVal } : a))
    }
  }

  async function deleteActivity(activityId: string) {
    const { error } = await supabase.from('activities').delete().eq('id', activityId)
    if (!error) {
      setActivities(prev => prev.filter(a => a.id !== activityId))
      toast.success('Activity deleted')
    }
  }

  // ── AI Deal Coach ──────────────────────────────────────────────────────────

  async function handleGetCoaching() {
    if (!lead) return
    setShowCoach(true)
    setCoachLoading(true)
    setAdvice(null)

    const currentStage = stages.find(s => s.id === lead.stage_id)
    const daysSinceCreated = Math.floor(
      (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    try {
      const res = await fetch('/api/ai/deal-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal: { title: lead.title, value: lead.value },
          stage: currentStage?.name,
          contact: linkedContact ? {
            name: contactName(linkedContact),
            company: linkedContact.company,
          } : null,
          activities: activities.slice(0, 5).map(a => ({
            type: a.type,
            subject: a.subject,
            notes: a.notes,
            created_at: formatShortDate(a.created_at),
          })),
          daysSinceCreated,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        console.error('Deal coach error:', data)
        toast.error(data.error ?? 'Failed to get coaching')
      } else {
        setAdvice(data.advice)
      }
    } catch (err) {
      console.error('Coach error:', err)
      toast.error('Failed to get coaching')
    }

    setCoachLoading(false)
  }

  function handleLogRecommended() {
    if (!advice || advice.actions.length === 0) return
    setActivityForm({
      type: 'task',
      subject: advice.actions[0],
      notes: '',
    })
    setShowCoach(false)
    setShowModal(true)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f1c35' }}>
        <p className="text-blue-300 text-sm">Loading deal...</p>
      </div>
    )
  }

  if (!lead) return null

  const currentStage = stages.find(s => s.id === lead.stage_id)

  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1.5'

  return (
    <div className="px-8 py-10 max-w-4xl">
      {/* Back link */}
      <button
        onClick={() => router.push('/pipeline')}
        className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Pipeline
      </button>

      {/* ── Deal Header Card ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 mb-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          {editing ? (
            <div className="flex-1 space-y-4">
              <div>
                <label className={labelClass}>Deal Title</label>
                <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className={inputClass} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Value ($)</label>
                  <input type="number" placeholder="0" min="0" step="100" value={editValue} onChange={e => setEditValue(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Stage</label>
                  <select value={editStageId} onChange={e => setEditStageId(e.target.value)} className={inputClass}>
                    {stages.map(s => (<option key={s.id} value={s.id} className="bg-[#0f1c35]">{s.name}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>Linked Contact</label>
                <select value={editContactId} onChange={e => setEditContactId(e.target.value)} className={inputClass}>
                  <option value="" className="bg-[#0f1c35]">— None —</option>
                  {contacts.map(c => (<option key={c.id} value={c.id} className="bg-[#0f1c35]">{contactName(c)}{c.company ? ` — ${c.company}` : ''}</option>))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Notes</label>
                <textarea rows={3} value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Lane details, special requirements..." className={`${inputClass} resize-none`} />
              </div>
            </div>
          ) : (
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">{lead.title}</h2>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {currentStage && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-400">
                    <TrendingUp className="w-3 h-3" />
                    {currentStage.name}
                  </span>
                )}
                {lead.value != null && lead.value > 0 && (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: '#d4930e' }}>
                    <DollarSign className="w-4 h-4" />
                    {lead.value.toLocaleString()}
                  </span>
                )}
              </div>
              {linkedContact && (
                <div className="flex items-center gap-2 mt-3">
                  <User className="w-4 h-4 text-blue-300/40" />
                  <Link href={`/contacts/${linkedContact.id}`} className="text-sm hover:underline" style={{ color: '#d4930e' }}>
                    {contactName(linkedContact)}
                  </Link>
                  {linkedContact.company && (
                    <span className="text-sm text-blue-300/50">· {linkedContact.company}</span>
                  )}
                </div>
              )}
              {lead.notes && (
                <div className="mt-4 p-3 rounded-lg text-sm text-blue-200/80 italic" style={{ backgroundColor: 'rgba(212,147,14,0.08)', borderLeft: '3px solid #d4930e' }}>
                  {lead.notes}
                </div>
              )}
              <p className="text-xs text-blue-300/30 mt-3">Created {formatShortDate(lead.created_at)}</p>
            </div>
          )}

          {/* Edit / Save / Coach buttons */}
          <div className="flex flex-col gap-2 shrink-0">
            {editing ? (
              <>
                <button onClick={saveDeal} disabled={savingDeal} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60 transition-colors" style={{ backgroundColor: '#d4930e' }}>
                  <Save className="w-4 h-4" /> {savingDeal ? 'Saving...' : 'Save'}
                </button>
                <button onClick={cancelEdit} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors">
                  <X className="w-4 h-4" /> Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors">
                  <Edit2 className="w-4 h-4" /> Edit
                </button>
                <button
                  onClick={handleGetCoaching}
                  disabled={coachLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                  style={{ color: '#d4930e', border: '1px solid rgba(212,147,14,0.4)', backgroundColor: 'rgba(212,147,14,0.08)' }}
                >
                  <Sparkles className="w-4 h-4" />
                  {coachLoading ? 'Thinking...' : 'What next?'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Coach Panel ── */}
      {showCoach && (
        <div className="mb-6 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(212,147,14,0.3)', backgroundColor: 'rgba(212,147,14,0.04)' }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(212,147,14,0.15)' }}>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: '#d4930e' }} />
              <p className="text-sm font-semibold" style={{ color: '#d4930e' }}>AI Deal Coach</p>
            </div>
            <button onClick={() => setShowCoach(false)} className="text-blue-300/40 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5">
            {coachLoading ? (
              <div className="flex items-center gap-3 py-6 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4930e' }} />
                <p className="text-sm text-blue-300/60">Analyzing deal...</p>
              </div>
            ) : advice ? (
              <div className="space-y-4">
                {/* Summary */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-300/50 mb-1">Where This Deal Stands</p>
                  <p className="text-sm text-white font-medium">{advice.summary}</p>
                </div>

                {/* Actions */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Target className="w-3.5 h-3.5" style={{ color: '#d4930e' }} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-300/50">Next Actions</p>
                  </div>
                  <div className="space-y-2">
                    {advice.actions.map((action, i) => (
                      <div key={i} className="flex items-start gap-2.5 bg-white/5 rounded-lg px-3 py-2.5">
                        <span className="text-xs font-bold mt-0.5 shrink-0" style={{ color: '#d4930e' }}>{i + 1}.</span>
                        <p className="text-sm text-blue-200">{action}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Risk */}
                <div className="flex items-start gap-2.5 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-400/70 mb-0.5">Watch Out</p>
                    <p className="text-sm text-blue-200">{advice.risk}</p>
                  </div>
                </div>

                {/* Log recommended action button */}
                <button
                  onClick={handleLogRecommended}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:brightness-110 transition-colors"
                  style={{ backgroundColor: '#d4930e' }}
                >
                  <Zap className="w-4 h-4" />
                  Log Recommended Action
                </button>
              </div>
            ) : (
              <p className="text-sm text-blue-300/50 text-center py-4">No advice generated yet.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Activity Feed ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Activity</h3>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:brightness-110 transition-colors"
            style={{ backgroundColor: '#d4930e' }}
          >
            <Plus className="w-4 h-4" />
            Log Activity
          </button>
        </div>

        {activities.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <PhoneCall className="w-8 h-8 mx-auto mb-3 text-blue-300/30" />
            <p className="text-blue-300/50 text-sm">No activities yet. Log a call, email, or note.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map(activity => {
              const meta = getActivityMeta(activity.type)
              const Icon = meta.icon
              return (
                <div
                  key={activity.id}
                  className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-4 group"
                  style={{ opacity: activity.completed ? 0.55 : 1 }}
                >
                  <div className={`shrink-0 mt-0.5 ${meta.color}`}>
                    <Icon className="w-[18px] h-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-medium text-sm text-white ${activity.completed ? 'line-through' : ''}`}>
                        {activity.subject}
                      </p>
                      <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {activity.type === 'task' && (
                          <button
                            onClick={() => toggleComplete(activity)}
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: activity.completed ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.08)',
                              color: activity.completed ? '#4ade80' : '#94a3b8',
                            }}
                          >
                            {activity.completed ? 'Done' : 'Mark done'}
                          </button>
                        )}
                        <button
                          onClick={() => deleteActivity(activity.id)}
                          className="text-red-400/50 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {activity.notes && (
                      <p className="text-xs text-blue-300/50 mt-1 leading-relaxed">{activity.notes}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-blue-300/30 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(activity.created_at)}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded capitalize bg-white/5 text-blue-300/50">
                        {activity.type}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Log Activity Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-[#0f1c35] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Log Activity</h3>
              <button onClick={() => setShowModal(false)} className="text-blue-300/50 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs text-blue-300/50 mb-2">Activity Type</label>
              <div className="grid grid-cols-5 gap-2">
                {ACTIVITY_TYPES.map(t => {
                  const TIcon = t.icon
                  const active = activityForm.type === t.value
                  return (
                    <button
                      key={t.value}
                      onClick={() => setActivityForm(f => ({ ...f, type: t.value as Activity['type'] }))}
                      className="flex flex-col items-center gap-1 py-2 rounded-lg text-xs transition-all"
                      style={{
                        backgroundColor: active ? 'rgba(212,147,14,0.2)' : 'rgba(255,255,255,0.05)',
                        border: active ? '1px solid #d4930e' : '1px solid transparent',
                        color: active ? '#d4930e' : '#94a3b8',
                      }}
                    >
                      <TIcon className="w-4 h-4" />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className={labelClass}>Subject *</label>
              <input
                autoFocus
                value={activityForm.subject}
                onChange={e => setActivityForm(f => ({ ...f, subject: e.target.value }))}
                placeholder={
                  activityForm.type === 'call'    ? 'Called re: lane pricing' :
                  activityForm.type === 'email'   ? 'Sent rate confirmation' :
                  activityForm.type === 'note'    ? 'Shipper prefers flatbed' :
                  activityForm.type === 'meeting' ? 'Intro call — 15 min' :
                  'Follow up on quote'
                }
                className={inputClass}
                onKeyDown={e => { if (e.key === 'Enter') logActivity() }}
              />
            </div>

            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                value={activityForm.notes}
                onChange={e => setActivityForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Details, next steps..."
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={logActivity}
                disabled={savingActivity}
                className="flex-1 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
                style={{ backgroundColor: '#d4930e' }}
              >
                {savingActivity ? 'Saving...' : 'Log Activity'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-blue-400/50 text-xs mt-16">
        2026 Bid Genie AI · LogiCRM
      </p>
    </div>
  )
}
