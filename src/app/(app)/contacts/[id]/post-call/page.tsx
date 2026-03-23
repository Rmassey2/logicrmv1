'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { ArrowLeft, Sparkles, Loader2, Copy, Check, Save } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Contact {
  id: string
  first_name: string | null
  last_name: string | null
  company: string | null
}

export default function PostCallPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [contact, setContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const [rawNotes, setRawNotes] = useState('')
  const [summary, setSummary] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)

      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, company')
        .eq('id', id)
        .single()

      if (!data) { toast.error('Contact not found'); router.push('/contacts'); return }
      setContact(data)
      setLoading(false)
    }
    load()
  }, [id, router])

  async function handleGenerate() {
    if (!rawNotes.trim()) { toast.error('Paste your call notes first.'); return }
    if (!contact) return
    setGenerating(true)
    setSummary('')

    try {
      const res = await fetch('/api/ai/post-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: contact.first_name,
          lastName: contact.last_name,
          company: contact.company,
          rawNotes: rawNotes.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to generate summary')
      } else {
        setSummary(data.summary)
        toast.success('Summary generated!')
      }
    } catch {
      toast.error('Failed to generate summary')
    }
    setGenerating(false)
  }

  async function handleSaveActivity() {
    if (!summary.trim() || !userId) return
    setSaving(true)

    const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ')
    const { error } = await supabase.from('activities').insert({
      contact_id: id,
      user_id: userId,
      type: 'call',
      subject: `Call with ${contactName}`,
      notes: summary.trim(),
    })

    if (error) {
      console.error('Activity save failed:', error)
      toast.error(`Failed to save: ${error.message}`)
    } else {
      toast.success('Saved as call activity!')
      router.push(`/contacts/${id}`)
    }
    setSaving(false)
  }

  function handleCopy() {
    navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied to clipboard')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <p className="text-blue-300 text-sm">Loading...</p>
      </div>
    )
  }

  if (!contact) return null

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Contact'

  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'

  return (
    <div className="px-8 py-10 max-w-3xl">
      <button
        onClick={() => router.push(`/contacts/${id}`)}
        className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {fullName}
      </button>

      <div className="flex items-center gap-3 mb-1">
        <Sparkles className="w-6 h-6" style={{ color: '#d4930e' }} />
        <h2 className="text-2xl font-bold text-white">Post-Call Summary</h2>
      </div>
      <p className="text-blue-300 text-sm mb-8">
        Paste your raw call notes and get a clean, structured summary for {fullName}
        {contact.company && ` at ${contact.company}`}.
      </p>

      {/* Raw notes input */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-blue-300 mb-2">
          Raw Call Notes
        </label>
        <textarea
          rows={8}
          value={rawNotes}
          onChange={e => setRawNotes(e.target.value)}
          placeholder="Paste your raw call notes here... e.g. talked to john, they ship about 40 loads/month ftl, mostly memphis to dallas and atlanta, using xpo right now but having issues with friday fallouts, wants to try us on one lane first, follow up thursday with rate on memphis-dallas..."
          className={`${inputClass} resize-none font-mono text-xs leading-relaxed`}
        />

        <button
          onClick={handleGenerate}
          disabled={generating || !rawNotes.trim()}
          className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
          style={{ backgroundColor: '#d4930e' }}
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Formatting...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate Summary</>
          )}
        </button>
      </div>

      {/* Formatted summary output */}
      {summary && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <label className="block text-xs font-semibold uppercase tracking-wide text-blue-300 mb-2">
            Formatted Summary
          </label>
          <textarea
            rows={12}
            value={summary}
            onChange={e => setSummary(e.target.value)}
            className={`${inputClass} resize-none text-xs leading-relaxed`}
          />

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSaveActivity}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save as Call Activity'}
            </button>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
            >
              {copied ? <><Check className="w-4 h-4 text-emerald-400" /> Copied</> : <><Copy className="w-4 h-4" /> Copy to Clipboard</>}
            </button>
          </div>
        </div>
      )}

      <p className="text-center text-blue-400/50 text-xs mt-16">2026 Bid Genie AI · LogiCRM</p>
    </div>
  )
}
