'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Sparkles,
  Copy,
  Check,
  Save,
  Loader2,
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface TouchEmail {
  touch: number
  day: number
  label: string
  subject: string
  body: string
}

const SEGMENTS = [
  'Mid-Market Manufacturer',
  'Distributor/Wholesaler',
  'Retailer/CPG',
  'Construction/Industrial',
]

const DAY_COLORS = [
  'text-blue-400',
  'text-purple-400',
  'text-green-400',
  'text-yellow-400',
  'text-orange-400',
  'text-pink-400',
  'text-red-400',
]

export default function AiSequencePage() {
  const router = useRouter()

  // Form
  const [segment, setSegment] = useState(SEGMENTS[0])
  const [contactTitle, setContactTitle] = useState('')
  const [painPoint, setPainPoint] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [senderName, setSenderName] = useState('Randall Massey')
  const [senderCompany, setSenderCompany] = useState('Maco Logistics')

  // Output
  const [sequence, setSequence] = useState<TouchEmail[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  // ── Generate ───────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!contactTitle.trim()) { toast.error('Enter a contact title.'); return }
    if (!painPoint.trim()) { toast.error('Enter a pain point.'); return }

    setGenerating(true)
    setSequence([])

    try {
      const res = await fetch('/api/ai/sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segment,
          contactTitle: contactTitle.trim(),
          painPoint: painPoint.trim(),
          companyName: companyName.trim(),
          senderName: senderName.trim(),
          senderCompany: senderCompany.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        console.error('AI sequence error:', data)
        toast.error(data.error ?? 'Failed to generate sequence')
      } else {
        setSequence(data.sequence)
        toast.success('Sequence generated!')
      }
    } catch (err) {
      console.error('Generate error:', err)
      toast.error('Failed to generate sequence')
    }

    setGenerating(false)
  }

  // ── Edit touch ─────────────────────────────────────────────────────────────

  function updateTouch(idx: number, field: 'subject' | 'body', value: string) {
    setSequence(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t))
  }

  // ── Copy ───────────────────────────────────────────────────────────────────

  function handleCopy(idx: number) {
    const t = sequence[idx]
    const text = `Subject: ${t.subject}\n\n${t.body}`
    navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
    toast.success('Copied to clipboard')
  }

  // ── Save as campaign draft ─────────────────────────────────────────────────

  async function handleSave() {
    if (sequence.length === 0) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // Combine all touches into the campaign body with clear separators
    const combinedBody = sequence.map(t =>
      `--- Touch ${t.touch} (Day ${t.day}): ${t.label} ---\nSubject: ${t.subject}\n\n${t.body}`
    ).join('\n\n')

    const { error } = await supabase.from('email_campaigns').insert({
      user_id: user.id,
      name: `AI Sequence: ${segment} — ${contactTitle}`,
      subject: sequence[0].subject,
      body: combinedBody,
      status: 'draft',
      recipient_count: 0,
    })

    if (error) {
      console.error('Save campaign error:', error)
      toast.error(`Failed to save: ${error.message}`)
    } else {
      toast.success('Saved as campaign draft!')
      router.push('/campaigns')
    }

    setSaving(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1.5'

  return (
    <div className="px-8 py-10 max-w-4xl">
      {/* Back */}
      <button
        onClick={() => router.push('/campaigns')}
        className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Campaigns
      </button>

      <div className="flex items-center gap-3 mb-1">
        <Sparkles className="w-6 h-6" style={{ color: '#d4930e' }} />
        <h2 className="text-2xl font-bold text-white">AI Sequence Builder</h2>
      </div>
      <p className="text-blue-300 text-sm mb-8">Generate a 7-touch cold email cadence using AI.</p>

      {/* ── Input Form ── */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 mb-8 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>Target Segment</label>
            <select
              value={segment}
              onChange={e => setSegment(e.target.value)}
              className={inputClass}
            >
              {SEGMENTS.map(s => (
                <option key={s} value={s} className="bg-[#0f1c35]">{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Contact Title</label>
            <input
              type="text"
              placeholder="Transportation Manager"
              value={contactTitle}
              onChange={e => setContactTitle(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Key Pain Point</label>
          <input
            type="text"
            placeholder="carrier fallout on Friday afternoons"
            value={painPoint}
            onChange={e => setPainPoint(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <label className={labelClass}>Company Name (optional)</label>
            <input
              type="text"
              placeholder="Acme Manufacturing"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Sender Name</label>
            <input
              type="text"
              value={senderName}
              onChange={e => setSenderName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Sender Company</label>
            <input
              type="text"
              value={senderCompany}
              onChange={e => setSenderCompany(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
          style={{ backgroundColor: '#d4930e' }}
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating sequence...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Sequence
            </>
          )}
        </button>
      </div>

      {/* ── Output: 7 Touch Cards ── */}
      {sequence.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-white">Your 7-Touch Sequence</h3>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save as Campaign Draft'}
            </button>
          </div>

          <div className="space-y-4">
            {sequence.map((touch, idx) => (
              <div
                key={idx}
                className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
              >
                {/* Card header */}
                <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: 'rgba(212,147,14,0.15)', color: '#d4930e' }}
                    >
                      {touch.touch}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-white">Touch {touch.touch}</p>
                      <p className={`text-[10px] uppercase tracking-wide ${DAY_COLORS[idx] ?? 'text-blue-300'}`}>
                        Day {touch.day} · {touch.label}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(idx)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
                  >
                    {copiedIdx === idx ? (
                      <><Check className="w-3 h-3 text-emerald-400" /> Copied</>
                    ) : (
                      <><Copy className="w-3 h-3" /> Copy</>
                    )}
                  </button>
                </div>

                {/* Editable fields */}
                <div className="p-5 space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-blue-300/50 mb-1">
                      Subject Line
                    </label>
                    <input
                      type="text"
                      value={touch.subject}
                      onChange={e => updateTouch(idx, 'subject', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-blue-300/50 mb-1">
                      Email Body
                    </label>
                    <textarea
                      rows={5}
                      value={touch.body}
                      onChange={e => updateTouch(idx, 'body', e.target.value)}
                      className={`${inputClass} resize-none font-mono text-xs leading-relaxed`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom save button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save as Campaign Draft'}
            </button>
          </div>
        </>
      )}

      {/* Footer */}
      <p className="text-center text-blue-400/50 text-xs mt-16">
        2026 Bid Genie AI · LogiCRM
      </p>
    </div>
  )
}
