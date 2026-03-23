'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  CheckSquare,
  AlertTriangle,
  Clock,
  CalendarDays,
  StickyNote,
  Check,
  X,
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Task {
  id: string
  subject: string
  notes: string | null
  due_date: string | null
  created_at: string
  contact_id: string | null
  contact_name: string | null
  contact_company: string | null
}

type Tab = 'overdue' | 'today' | 'upcoming'

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysDiff(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function TasksPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [tab, setTab] = useState<Tab>('overdue')

  // Inline note form
  const [noteTaskId, setNoteTaskId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  useEffect(() => {
    loadTasks()
  }, [])

  async function loadTasks() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data } = await supabase
      .from('activities')
      .select('id, subject, notes, due_date, created_at, contact_id')
      .eq('user_id', user.id)
      .eq('type', 'task')
      .eq('completed', false)
      .order('due_date', { ascending: true })

    const allTasks = data ?? []

    // Fetch contact info for tasks that have contact_id
    const contactIds = Array.from(new Set(
      allTasks.map(t => t.contact_id).filter(Boolean) as string[]
    ))

    const contactMap = new Map<string, { name: string; company: string | null }>()
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, company')
        .in('id', contactIds)

      for (const c of contacts ?? []) {
        contactMap.set(c.id, {
          name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed',
          company: c.company,
        })
      }
    }

    setTasks(allTasks.map(t => {
      const info = t.contact_id ? contactMap.get(t.contact_id) : null
      return {
        ...t,
        contact_name: info?.name ?? null,
        contact_company: info?.company ?? null,
      }
    }))
    setLoading(false)
  }

  // Categorize tasks
  const now = startOfDay(new Date())
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const overdue: Task[] = []
  const today: Task[] = []
  const upcoming: Task[] = []

  for (const t of tasks) {
    if (!t.due_date) { upcoming.push(t); continue }
    const due = startOfDay(new Date(t.due_date))
    if (due < now) overdue.push(t)
    else if (due.getTime() === now.getTime()) today.push(t)
    else if (due <= weekFromNow) upcoming.push(t)
    else upcoming.push(t)
  }

  const tabData: Record<Tab, { tasks: Task[]; label: string; count: number; color: string; icon: typeof AlertTriangle }> = {
    overdue: { tasks: overdue, label: 'Overdue', count: overdue.length, color: 'text-red-400', icon: AlertTriangle },
    today: { tasks: today, label: 'Due Today', count: today.length, color: 'text-yellow-400', icon: Clock },
    upcoming: { tasks: upcoming, label: 'Upcoming', count: upcoming.length, color: 'text-blue-400', icon: CalendarDays },
  }

  // Auto-select first tab with items
  useEffect(() => {
    if (!loading) {
      if (overdue.length > 0) setTab('overdue')
      else if (today.length > 0) setTab('today')
      else setTab('upcoming')
    }
  }, [loading, overdue.length, today.length])

  async function handleComplete(taskId: string) {
    const { error } = await supabase
      .from('activities')
      .update({ completed: true })
      .eq('id', taskId)

    if (error) {
      toast.error('Failed to complete task')
    } else {
      setTasks(prev => prev.filter(t => t.id !== taskId))
      toast.success('Task completed!')
    }
  }

  async function handleSaveNote(contactId: string) {
    if (!noteText.trim()) return
    setSavingNote(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('activities').insert({
      contact_id: contactId,
      user_id: user.id,
      type: 'note',
      subject: noteText.trim(),
    })

    if (error) {
      toast.error('Failed to save note')
    } else {
      toast.success('Note added')
      setNoteTaskId(null)
      setNoteText('')
    }
    setSavingNote(false)
  }

  const openCount = tasks.length

  return (
    <div className="px-8 py-10 max-w-4xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Tasks</h2>
        <p className="text-blue-300 text-sm mt-1">{openCount} open task{openCount !== 1 ? 's' : ''}</p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(['overdue', 'today', 'upcoming'] as Tab[]).map(key => {
          const d = tabData[key]
          const Icon = d.icon
          const isActive = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="rounded-2xl p-4 text-center transition-colors"
              style={{
                backgroundColor: isActive ? 'rgba(212,147,14,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isActive ? 'rgba(212,147,14,0.3)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <Icon className={`w-5 h-5 mx-auto mb-1.5 ${d.color}`} />
              <p className="text-2xl font-bold text-white">{d.count}</p>
              <p className="text-[10px] uppercase tracking-wide text-blue-300/50">{d.label}</p>
            </button>
          )
        })}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
          <p className="text-blue-300/60 text-sm">Loading tasks...</p>
        </div>
      ) : tabData[tab].tasks.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
          <CheckSquare className="w-10 h-10 mx-auto mb-4 text-blue-300/30" />
          <p className="text-white font-medium mb-1">
            {tab === 'overdue' ? 'No overdue tasks' : tab === 'today' ? 'Nothing due today' : 'No upcoming tasks'}
          </p>
          <p className="text-blue-300/60 text-sm">
            {tab === 'overdue' ? 'You\'re all caught up!' : 'Tasks with due dates will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tabData[tab].tasks.map(task => {
            const dueDate = task.due_date ? startOfDay(new Date(task.due_date)) : null
            const diff = dueDate ? daysDiff(now, dueDate) : null
            let dueLabel = ''
            let dueColor = 'text-blue-300/40'
            if (diff !== null) {
              if (diff > 0) { dueLabel = `${diff}d overdue`; dueColor = 'text-red-400' }
              else if (diff === 0) { dueLabel = 'Due today'; dueColor = 'text-yellow-400' }
              else { dueLabel = `In ${Math.abs(diff)}d`; dueColor = 'text-blue-400' }
            }

            return (
              <div key={task.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  {/* Complete button */}
                  <button
                    onClick={() => handleComplete(task.id)}
                    className="mt-0.5 w-5 h-5 rounded border border-white/20 flex items-center justify-center shrink-0 hover:border-emerald-400 hover:bg-emerald-400/10 transition-colors group"
                  >
                    <Check className="w-3 h-3 text-transparent group-hover:text-emerald-400 transition-colors" />
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{task.subject}</p>

                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      {task.contact_name && task.contact_id && (
                        <Link
                          href={`/contacts/${task.contact_id}`}
                          className="text-xs font-medium hover:underline"
                          style={{ color: '#d4930e' }}
                        >
                          {task.contact_name}
                        </Link>
                      )}
                      {task.contact_company && (
                        <span className="text-xs text-blue-300/40">{task.contact_company}</span>
                      )}
                      {task.due_date && (
                        <span className="text-xs text-blue-300/40">{formatDate(task.due_date)}</span>
                      )}
                      {dueLabel && (
                        <span className={`text-xs font-semibold ${dueColor}`}>{dueLabel}</span>
                      )}
                    </div>

                    {task.notes && (
                      <p className="text-xs text-blue-300/40 mt-1 truncate">{task.notes}</p>
                    )}

                    {/* Inline note form */}
                    {noteTaskId === task.id ? (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          autoFocus
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && task.contact_id) handleSaveNote(task.contact_id) }}
                          placeholder="Quick note..."
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-blue-300/40 focus:outline-none focus:ring-1 focus:ring-yellow-500/50"
                        />
                        <button
                          onClick={() => { if (task.contact_id) handleSaveNote(task.contact_id) }}
                          disabled={savingNote || !noteText.trim()}
                          className="text-xs px-2.5 py-1.5 rounded-lg font-semibold text-white disabled:opacity-40 transition-colors"
                          style={{ backgroundColor: '#d4930e' }}
                        >
                          {savingNote ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setNoteTaskId(null); setNoteText('') }}
                          className="text-blue-300/40 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      task.contact_id && (
                        <button
                          onClick={() => { setNoteTaskId(task.id); setNoteText('') }}
                          className="flex items-center gap-1 text-xs text-blue-300/40 hover:text-blue-300 mt-1.5 transition-colors"
                        >
                          <StickyNote className="w-3 h-3" /> Add note
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-center text-blue-400/50 text-xs mt-16">2026 Bid Genie AI · LogiCRM</p>
    </div>
  )
}
