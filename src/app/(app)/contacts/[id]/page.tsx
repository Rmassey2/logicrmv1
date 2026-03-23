'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Building2,
  Briefcase,
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
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contact {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  company: string | null
  title: string | null
  city: string | null
  state: string | null
  notes: string | null
  created_at: string
}

interface Activity {
  id: string
  contact_id: string
  user_id: string
  type: 'call' | 'email' | 'note' | 'meeting' | 'task'
  subject: string
  notes: string | null
  completed: boolean
  due_date: string | null
  created_at: string
}

interface Lead {
  id: string
  title: string
  value: number | null
  stage_id: string
  pipeline_stages: { name: string; color: string } | null
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

function initials(c: Contact) {
  return `${c.first_name?.[0] ?? ''}${c.last_name?.[0] ?? ''}`.toUpperCase()
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [contact, setContact]     = useState<Contact | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [leads, setLeads]         = useState<Lead[]>([])
  const [loading, setLoading]     = useState(true)
  const [userId, setUserId]       = useState<string | null>(null)

  // Edit state
  const [editing, setEditing]     = useState(false)
  const [editData, setEditData]   = useState<Partial<Contact>>({})

  // Log activity modal
  const [showModal, setShowModal] = useState(false)
  const [activityForm, setActivityForm] = useState({
    type: 'call' as Activity['type'],
    subject: '',
    notes: '',
    due_date: '',
  })
  const [savingActivity, setSavingActivity] = useState(false)
  const [savingContact, setSavingContact]   = useState(false)

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)

      const [contactRes, activitiesRes, leadsRes] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', id).single(),
        supabase.from('activities').select('*').eq('contact_id', id)
          .order('created_at', { ascending: false }),
        supabase.from('leads').select('*, pipeline_stages(name, color)')
          .eq('contact_id', id).order('created_at', { ascending: false }),
      ])

      if (contactRes.error || !contactRes.data) {
        toast.error('Contact not found')
        router.push('/contacts')
        return
      }

      setContact(contactRes.data)
      setEditData(contactRes.data)
      setActivities(activitiesRes.data ?? [])
      setLeads(leadsRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [id, router])

  // ── Save contact edits ─────────────────────────────────────────────────────

  async function saveContact() {
    if (!contact) return
    setSavingContact(true)
    const { error } = await supabase
      .from('contacts')
      .update({
        first_name: editData.first_name,
        last_name:  editData.last_name,
        email:      editData.email,
        phone:      editData.phone,
        company:    editData.company,
        title:      editData.title,
        city:       editData.city,
        state:      editData.state,
        notes:      editData.notes,
      })
      .eq('id', contact.id)

    if (error) {
      toast.error('Failed to save changes')
    } else {
      setContact({ ...contact, ...editData } as Contact)
      setEditing(false)
      toast.success('Contact updated')
    }
    setSavingContact(false)
  }

  function cancelEdit() {
    setEditData(contact ?? {})
    setEditing(false)
  }

  // ── Log activity ───────────────────────────────────────────────────────────

  async function logActivity() {
    if (!activityForm.subject.trim()) {
      toast.error('Subject is required')
      return
    }
    setSavingActivity(true)

    const { data, error } = await supabase.from('activities').insert({
      contact_id: id,
      user_id:    userId,
      type:       activityForm.type,
      subject:    activityForm.subject.trim(),
      notes:      activityForm.notes.trim() || null,
      due_date:   activityForm.due_date || null,
      completed:  false,
    }).select().single()

    if (error) {
      toast.error('Failed to log activity')
    } else {
      setActivities(prev => [data, ...prev])
      setShowModal(false)
      setActivityForm({ type: 'call', subject: '', notes: '', due_date: '' })
      toast.success('Activity logged')
    }
    setSavingActivity(false)
  }

  // ── Toggle task complete ───────────────────────────────────────────────────

  async function toggleComplete(activity: Activity) {
    const newVal = !activity.completed
    const { error } = await supabase
      .from('activities')
      .update({ completed: newVal })
      .eq('id', activity.id)

    if (!error) {
      setActivities(prev =>
        prev.map(a => a.id === activity.id ? { ...a, completed: newVal } : a)
      )
    }
  }

  // ── Delete activity ────────────────────────────────────────────────────────

  async function deleteActivity(activityId: string) {
    const { error } = await supabase.from('activities').delete().eq('id', activityId)
    if (!error) {
      setActivities(prev => prev.filter(a => a.id !== activityId))
      toast.success('Activity deleted')
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f1c35' }}>
        <div className="text-white opacity-60">Loading contact...</div>
      </div>
    )
  }

  if (!contact) return null

  const fullName = `${contact.first_name} ${contact.last_name}`

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ backgroundColor: '#0a1628', color: '#e2e8f0' }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/contacts')}
          className="flex items-center gap-1 text-sm opacity-60 hover:opacity-100 transition-opacity"
        >
          <ArrowLeft size={16} /> Back to Contacts
        </button>
      </div>

      {/* ── Contact Card ── */}
      <div className="rounded-xl p-6" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-start justify-between gap-4">

          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
              style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}
            >
              {initials(contact)}
            </div>

            {editing ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={editData.first_name ?? ''}
                  onChange={e => setEditData(d => ({ ...d, first_name: e.target.value }))}
                  placeholder="First name"
                  className="input-field"
                />
                <input
                  value={editData.last_name ?? ''}
                  onChange={e => setEditData(d => ({ ...d, last_name: e.target.value }))}
                  placeholder="Last name"
                  className="input-field"
                />
                <input
                  value={editData.title ?? ''}
                  onChange={e => setEditData(d => ({ ...d, title: e.target.value }))}
                  placeholder="Job title"
                  className="input-field"
                />
                <input
                  value={editData.company ?? ''}
                  onChange={e => setEditData(d => ({ ...d, company: e.target.value }))}
                  placeholder="Company"
                  className="input-field"
                />
              </div>
            ) : (
              <div>
                <h1 className="text-2xl font-bold text-white">{fullName}</h1>
                {(contact.title || contact.company) && (
                  <p className="text-sm opacity-70 mt-0.5">
                    {[contact.title, contact.company].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="text-xs opacity-40 mt-1">
                  Added {formatShortDate(contact.created_at)}
                </p>
              </div>
            )}
          </div>

          {/* Edit / Save buttons */}
          <div className="flex gap-2 flex-shrink-0">
            {editing ? (
              <>
                <button
                  onClick={saveContact}
                  disabled={savingContact}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
                  style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}
                >
                  <Save size={14} /> {savingContact ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium opacity-60 hover:opacity-100"
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                >
                  <X size={14} /> Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium opacity-70 hover:opacity-100 transition-opacity"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
              >
                <Edit2 size={14} /> Edit
              </button>
            )}
          </div>
        </div>

        {/* Contact info fields */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {editing ? (
            <>
              <InfoFieldEdit
                icon={<Mail size={14} />}
                label="Email"
                value={editData.email ?? ''}
                onChange={v => setEditData(d => ({ ...d, email: v }))}
                placeholder="email@company.com"
              />
              <InfoFieldEdit
                icon={<Phone size={14} />}
                label="Phone"
                value={editData.phone ?? ''}
                onChange={v => setEditData(d => ({ ...d, phone: v }))}
                placeholder="(555) 000-0000"
              />
              <InfoFieldEdit
                icon={<MapPin size={14} />}
                label="City"
                value={editData.city ?? ''}
                onChange={v => setEditData(d => ({ ...d, city: v }))}
                placeholder="City"
              />
              <InfoFieldEdit
                icon={<MapPin size={14} />}
                label="State"
                value={editData.state ?? ''}
                onChange={v => setEditData(d => ({ ...d, state: v }))}
                placeholder="State"
              />
              <div className="sm:col-span-2">
                <label className="block text-xs opacity-50 mb-1">Notes</label>
                <textarea
                  value={editData.notes ?? ''}
                  onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))}
                  placeholder="Pain points, key info (use their exact words)…"
                  rows={3}
                  className="input-field w-full resize-none"
                />
              </div>
            </>
          ) : (
            <>
              {contact.email && (
                <InfoField icon={<Mail size={14} />} label="Email">
                  <a href={`mailto:${contact.email}`} className="hover:underline" style={{ color: '#d4930e' }}>
                    {contact.email}
                  </a>
                </InfoField>
              )}
              {contact.phone && (
                <InfoField icon={<Phone size={14} />} label="Phone">
                  <a href={`tel:${contact.phone}`} className="hover:underline" style={{ color: '#d4930e' }}>
                    {contact.phone}
                  </a>
                </InfoField>
              )}
              {(contact.city || contact.state) && (
                <InfoField icon={<MapPin size={14} />} label="Location">
                  {[contact.city, contact.state].filter(Boolean).join(', ')}
                </InfoField>
              )}
              {contact.company && (
                <InfoField icon={<Building2 size={14} />} label="Company">
                  {contact.company}
                </InfoField>
              )}
              {contact.notes && (
                <div className="sm:col-span-2 p-3 rounded-lg text-sm opacity-80 italic"
                  style={{ backgroundColor: 'rgba(212,147,14,0.08)', borderLeft: '3px solid #d4930e' }}>
                  {contact.notes}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Two-column layout: Activities + Deals ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Activity Feed — 2/3 width */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Activity</h2>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}
            >
              <Plus size={15} /> Log Activity
            </button>
          </div>

          {activities.length === 0 ? (
            <div className="rounded-xl p-10 text-center opacity-40"
              style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.06)' }}>
              <PhoneCall size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No activities yet. Log a call, email, or note to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map(activity => {
                const meta = getActivityMeta(activity.type)
                const Icon = meta.icon
                return (
                  <div
                    key={activity.id}
                    className="rounded-xl p-4 flex gap-4 group"
                    style={{
                      backgroundColor: '#0f1c35',
                      border: '1px solid rgba(255,255,255,0.07)',
                      opacity: activity.completed ? 0.55 : 1,
                    }}
                  >
                    {/* Icon */}
                    <div className={`flex-shrink-0 mt-0.5 ${meta.color}`}>
                      <Icon size={18} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`font-medium text-sm text-white ${activity.completed ? 'line-through' : ''}`}>
                          {activity.subject}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
                            className="text-red-400 hover:text-red-300 opacity-50 hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {activity.notes && (
                        <p className="text-xs opacity-60 mt-1 leading-relaxed">{activity.notes}</p>
                      )}

                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs opacity-40 flex items-center gap-1">
                          <Clock size={11} /> {formatDate(activity.created_at)}
                        </span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded capitalize"
                          style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: '#94a3b8' }}
                        >
                          {activity.type}
                        </span>
                        {activity.due_date && (
                          <span className="text-xs opacity-50 flex items-center gap-1">
                            <CalendarDays size={11} /> Due {formatShortDate(activity.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Deals — 1/3 width */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Deals</h2>

          {leads.length === 0 ? (
            <div className="rounded-xl p-6 text-center opacity-40"
              style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Briefcase size={24} className="mx-auto mb-2 opacity-40" />
              <p className="text-xs">No deals linked yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {leads.map(lead => (
                <div
                  key={lead.id}
                  className="rounded-xl p-4 cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.07)' }}
                  onClick={() => router.push(`/pipeline`)}
                >
                  <p className="text-sm font-medium text-white">{lead.title}</p>
                  {lead.value && (
                    <p className="text-sm font-semibold mt-1" style={{ color: '#d4930e' }}>
                      ${lead.value.toLocaleString()}
                    </p>
                  )}
                  {lead.pipeline_stages && (
                    <span
                      className="inline-block text-xs px-2 py-0.5 rounded-full mt-2"
                      style={{
                        backgroundColor: `${lead.pipeline_stages.color}22`,
                        color: lead.pipeline_stages.color,
                      }}
                    >
                      {lead.pipeline_stages.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Log Activity Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-5"
            style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Log Activity</h3>
              <button onClick={() => setShowModal(false)} className="opacity-50 hover:opacity-100">
                <X size={20} />
              </button>
            </div>

            {/* Activity type picker */}
            <div>
              <label className="block text-xs opacity-50 mb-2">Activity Type</label>
              <div className="grid grid-cols-5 gap-2">
                {ACTIVITY_TYPES.map(t => {
                  const Icon = t.icon
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
                      <Icon size={16} />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs opacity-50 mb-1">Subject *</label>
              <input
                autoFocus
                value={activityForm.subject}
                onChange={e => setActivityForm(f => ({ ...f, subject: e.target.value }))}
                placeholder={
                  activityForm.type === 'call'    ? 'Called re: backup capacity for Q2' :
                  activityForm.type === 'email'   ? 'Sent intro email' :
                  activityForm.type === 'note'    ? 'Pain point: carrier fallout every Friday PM' :
                  activityForm.type === 'meeting' ? 'Discovery call — 30 min' :
                  'Follow up next Tuesday'
                }
                className="input-field w-full"
                onKeyDown={e => { if (e.key === 'Enter') logActivity() }}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs opacity-50 mb-1">Notes</label>
              <textarea
                value={activityForm.notes}
                onChange={e => setActivityForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Details, their exact words, next steps…"
                rows={3}
                className="input-field w-full resize-none"
              />
            </div>

            {/* Due date (tasks only) */}
            {activityForm.type === 'task' && (
              <div>
                <label className="block text-xs opacity-50 mb-1">Due Date</label>
                <input
                  type="date"
                  value={activityForm.due_date}
                  onChange={e => setActivityForm(f => ({ ...f, due_date: e.target.value }))}
                  className="input-field w-full"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={logActivity}
                disabled={savingActivity}
                className="flex-1 py-2.5 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}
              >
                {savingActivity ? 'Saving…' : 'Log Activity'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 rounded-lg text-sm opacity-60 hover:opacity-100"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared input styles */}
      <style jsx global>{`
        .input-field {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 8px 12px;
          color: #e2e8f0;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field:focus {
          border-color: #d4930e;
        }
        .input-field::placeholder {
          color: rgba(226,232,240,0.3);
        }
        input[type="date"].input-field::-webkit-calendar-picker-indicator {
          filter: invert(0.5);
        }
      `}</style>
    </div>
  )
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function InfoField({ icon, label, children }: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 opacity-40">{icon}</span>
      <div>
        <p className="text-xs opacity-40 mb-0.5">{label}</p>
        <div className="text-sm text-white">{children}</div>
      </div>
    </div>
  )
}

function InfoFieldEdit({ icon, label, value, onChange, placeholder }: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs opacity-50 mb-1 flex items-center gap-1">
        {icon} {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-field w-full"
      />
    </div>
  )
}
