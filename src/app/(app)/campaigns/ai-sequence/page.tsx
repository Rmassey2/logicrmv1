'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
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
  Pencil,
  X,
  RefreshCw,
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

// Title case: capitalize first letter of each word, skip small words unless first
const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'in', 'of', 'is'])
function titleCase(str: string): string {
  return str.replace(/\w\S*/g, (word, index) => {
    if (index > 0 && SMALL_WORDS.has(word.toLowerCase())) return word.toLowerCase()
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  })
}

const SEGMENTS = [
  'All Shippers (general)',
  'Manufacturers & Producers',
  'Distributors & Wholesalers',
  'Retailers & E-Commerce',
  'Construction & Industrial',
  'Food & Beverage',
  'Chemical & Hazmat',
  'Automotive & Parts',
  'Healthcare & Medical Supplies',
  'Agricultural & Farm Products',
  'Custom',
]

const TONES = [
  'Direct & No-Nonsense',
  'Friendly & Conversational',
  'Confident & Authoritative',
  'Empathetic',
  'Urgent',
  'Humorous',
  'Professional & Formal',
  'Persistent & Tenacious',
  'Custom',
] as const

const TONE_DESCRIPTIONS: Record<string, string> = {
  'Direct & No-Nonsense': 'Get to the point in the first sentence. No warm-up. Short sentences. No filler words.',
  'Friendly & Conversational': "Write like you're emailing someone you've met once at a conference. Warm but professional.",
  'Confident & Authoritative': "Project expertise. Use specific freight knowledge. Don't hedge.",
  'Empathetic': 'Acknowledge their challenges first. Show you understand before pitching anything.',
  'Urgent': 'Create a reason to act now. Reference timing, market conditions, or limited availability.',
  'Humorous': 'One light joke or unexpected observation per email max. Never forced. Must still be professional.',
  'Professional & Formal': 'Formal tone, complete sentences, no contractions, respectful and measured.',
  'Persistent & Tenacious': "Acknowledge you've reached out before. Unapologetic about following up. Brief.",
}

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
  const [campaignName, setCampaignName] = useState('')
  const [segment, setSegment] = useState(SEGMENTS[0])
  const [customSegment, setCustomSegment] = useState('')
  const [contactTitle, setContactTitle] = useState('')
  const [painPoint, setPainPoint] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [senderName, setSenderName] = useState('')
  const [senderCompany, setSenderCompany] = useState('')
  const [tone, setTone] = useState<string>(TONES[0])
  const [customTone, setCustomTone] = useState('')

  // Output
  const [generatedTone, setGeneratedTone] = useState('')
  const [sequence, setSequence] = useState<TouchEmail[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [signaturePreview, setSignaturePreview] = useState('')

  // Per-card edit state
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [modifiedSet, setModifiedSet] = useState<Set<number>>(new Set())
  const [rewriteIdx, setRewriteIdx] = useState<number | null>(null)
  const [rewritePrompt, setRewritePrompt] = useState('')
  const [rewriting, setRewriting] = useState(false)
  const [perEmailTone, setPerEmailTone] = useState<Record<number, string>>({})
  const [toneOverrideIdx, setToneOverrideIdx] = useState<number | null>(null)

  // ── Load signature profile data on mount ────────────────────────────────
  const [sigProfile, setSigProfile] = useState<{ name: string; company: string; phone: string; email: string; website: string }>({ name: '', company: '', phone: '', email: '', website: '' })

  useEffect(() => {
    async function loadSig() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // Set sender fields from user profile
      const displayName = user.user_metadata?.display_name || ''
      if (displayName) setSenderName(displayName)
      // Load company info from organizations via API
      const res = await fetch(`/api/settings?userId=${user.id}`)
      const data = await res.json()
      const c = data.company || {}
      if (c.company_name) setSenderCompany(c.company_name)
      setSigProfile({
        name: displayName,
        company: c.company_name || '',
        phone: c.company_phone || '',
        email: user.email || '',
        website: c.company_website || '',
      })
    }
    loadSig()
  }, [])

  // Rebuild signature: Name, Company, Phone, Email, Website
  useEffect(() => {
    const name = sigProfile.name || senderName
    const company = sigProfile.company || senderCompany
    const lines = [name, company, sigProfile.phone, sigProfile.email, sigProfile.website].filter(Boolean)
    setSignaturePreview(lines.join('\n'))
  }, [sigProfile, senderName, senderCompany])

  // ── Generate ───────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!campaignName.trim()) { toast.error('Enter a campaign name.'); return }
    if (!contactTitle.trim()) { toast.error('Enter a contact title.'); return }
    if (!painPoint.trim()) { toast.error('Enter a pain point.'); return }
    const effectiveSegment = segment === 'Custom' ? customSegment.trim() : segment
    if (!effectiveSegment) { toast.error('Enter a custom segment.'); return }
    const effectiveTone = tone === 'Custom' ? customTone.trim() : tone
    const toneDesc = tone === 'Custom' ? customTone.trim() : TONE_DESCRIPTIONS[tone] || tone
    if (tone === 'Custom' && !customTone.trim()) { toast.error('Enter a custom tone.'); return }

    setGenerating(true)
    setSequence([])
    setEditingIdx(null)
    setModifiedSet(new Set())
    setRewriteIdx(null)
    setRewritePrompt('')
    setPerEmailTone({})
    setToneOverrideIdx(null)

    try {
      const res = await fetch('/api/ai/sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segment: effectiveSegment,
          contactTitle: contactTitle.trim(),
          painPoint: painPoint.trim(),
          companyName: companyName.trim(),
          senderName: senderName.trim(),
          senderCompany: senderCompany.trim(),
          tone: effectiveTone,
          toneDescription: toneDesc,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        console.error('AI sequence error:', data)
        toast.error(data.error ?? 'Failed to generate sequence')
      } else {
        // Apply title case to subject lines
        const seq = (data.sequence as TouchEmail[]).map(t => ({
          ...t,
          subject: titleCase(t.subject),
        }))
        setSequence(seq)
        setGeneratedTone(effectiveTone)
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

  function handleEditSave(idx: number) {
    setModifiedSet(prev => new Set(prev).add(idx))
    setEditingIdx(null)
    setRewriteIdx(null)
    setRewritePrompt('')
    toast.success(`Touch ${idx + 1} saved`)
  }

  async function handleRewrite(idx: number) {
    if (!rewritePrompt.trim()) { toast.error('Enter rewrite instructions'); return }
    setRewriting(true)

    try {
      const touch = sequence[idx]
      const emailTone = perEmailTone[idx] || generatedTone
      const emailToneDesc = TONE_DESCRIPTIONS[emailTone] || emailTone
      const res = await fetch('/api/ai/rewrite-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: touch.subject,
          body: touch.body,
          instructions: rewritePrompt.trim(),
          tone: emailTone,
          toneDescription: emailToneDesc,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? 'Failed to rewrite')
      } else {
        updateTouch(idx, 'subject', titleCase(data.email.subject))
        updateTouch(idx, 'body', data.email.body)
        setModifiedSet(prev => new Set(prev).add(idx))
        setRewriteIdx(null)
        setRewritePrompt('')
        toast.success(`Touch ${idx + 1} rewritten!`)
      }
    } catch {
      toast.error('Failed to rewrite email')
    }

    setRewriting(false)
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

    // Build signature from profile
    const sigName = user.user_metadata?.display_name || senderName
    const compRes = await fetch(`/api/settings?userId=${user.id}`)
    const compData = await compRes.json()
    const c = compData.company || {}
    const sigCompany = c.company_name || senderCompany
    const sigPhone = c.company_phone || ''
    const sigEmail = user.email || ''
    const sigWebsite = c.company_website || ''
    const sigLines = [sigName, sigCompany, sigPhone, sigEmail, sigWebsite].filter(Boolean)
    const signature = '\n\n' + sigLines.join('\n')

    // Combine all touches into the campaign body with clear separators
    const combinedBody = sequence.map(t =>
      `--- Touch ${t.touch} (Day ${t.day}): ${t.label} ---\nSubject: ${t.subject}\n\n${t.body}${signature}`
    ).join('\n\n')

    const { error } = await supabase.from('email_campaigns').insert({
      user_id: user.id,
      name: campaignName.trim(),
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
        <div>
          <label className={labelClass}>Campaign Name</label>
          <input
            type="text"
            placeholder="e.g. April Shippers — Dry Van"
            value={campaignName}
            onChange={e => setCampaignName(e.target.value)}
            className={inputClass}
          />
        </div>

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
            {segment === 'Custom' && (
              <input
                type="text"
                placeholder="e.g. Pharmaceutical cold chain"
                value={customSegment}
                onChange={e => setCustomSegment(e.target.value)}
                className={`${inputClass} mt-2`}
              />
            )}
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
          <label className={labelClass}>Campaign Tone</label>
          <select
            value={tone}
            onChange={e => setTone(e.target.value)}
            className={inputClass}
          >
            {TONES.map(t => (
              <option key={t} value={t} className="bg-[#0f1c35]">{t}</option>
            ))}
          </select>
          {tone === 'Custom' && (
            <input
              type="text"
              placeholder='e.g. "Casual but data-driven, like a smart friend giving advice"'
              value={customTone}
              onChange={e => setCustomTone(e.target.value)}
              className={`${inputClass} mt-2`}
            />
          )}
          {tone !== 'Custom' && TONE_DESCRIPTIONS[tone] && (
            <p className="text-blue-300/40 text-xs mt-1.5">{TONE_DESCRIPTIONS[tone]}</p>
          )}
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
            <div>
              <h3 className="text-lg font-semibold text-white">Your 7-Touch Sequence</h3>
              {generatedTone && (
                <p className="text-xs text-blue-300/50 mt-1">
                  Sequence tone: <span className="text-blue-300">{generatedTone}</span>
                </p>
              )}
            </div>
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
            {sequence.map((touch, idx) => {
              const isEditing = editingIdx === idx
              const isModified = modifiedSet.has(idx)
              const showRewrite = rewriteIdx === idx
              const emailTone = perEmailTone[idx] || generatedTone
              const showToneOverride = toneOverrideIdx === idx

              return (
                <div
                  key={idx}
                  className={`bg-white/5 border rounded-2xl overflow-hidden ${isEditing ? 'border-[#d4930e]/40' : 'border-white/10'}`}
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
                      {isModified && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/15 text-purple-400 uppercase tracking-wide">
                          Modified
                        </span>
                      )}
                      {perEmailTone[idx] && perEmailTone[idx] !== generatedTone && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 uppercase tracking-wide">
                          {perEmailTone[idx]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
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
                      {!isEditing ? (
                        <button
                          onClick={() => { setEditingIdx(idx); setRewriteIdx(null); setRewritePrompt('') }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      ) : (
                        <button
                          onClick={() => { setEditingIdx(null); setRewriteIdx(null); setRewritePrompt('') }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400/70 border border-white/10 hover:text-red-400 hover:border-red-400/30 transition-colors"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-5 space-y-3">
                    {isEditing ? (
                      <>
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
                            rows={6}
                            value={touch.body}
                            onChange={e => updateTouch(idx, 'body', e.target.value)}
                            className={`${inputClass} resize-none font-mono text-xs leading-relaxed`}
                          />
                        </div>

                        {/* Edit action buttons */}
                        <div className="flex items-center gap-3 pt-1">
                          <button
                            onClick={() => handleEditSave(idx)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white hover:brightness-110 transition-colors"
                            style={{ backgroundColor: '#d4930e' }}
                          >
                            <Check className="w-3 h-3" /> Save
                          </button>
                          <button
                            onClick={() => setRewriteIdx(showRewrite ? null : idx)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" /> Rewrite with AI
                          </button>
                        </div>

                        {/* Rewrite prompt */}
                        {showRewrite && (
                          <div className="mt-3 bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3">
                            <label className="block text-xs font-medium text-blue-300">
                              What should be different about this email?
                            </label>
                            <input
                              type="text"
                              value={rewritePrompt}
                              onChange={e => setRewritePrompt(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !rewriting) handleRewrite(idx) }}
                              placeholder='e.g. "make it shorter" or "add more urgency" or "focus on dry van capacity"'
                              className={inputClass}
                              disabled={rewriting}
                            />
                            <button
                              onClick={() => handleRewrite(idx)}
                              disabled={rewriting}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60 transition-colors"
                              style={{ backgroundColor: '#d4930e' }}
                            >
                              {rewriting ? (
                                <><Loader2 className="w-3 h-3 animate-spin" /> Rewriting...</>
                              ) : (
                                <><Sparkles className="w-3 h-3" /> Rewrite</>
                              )}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-blue-300/50 mb-1">
                            Subject Line
                          </label>
                          <p className="text-sm text-white">{touch.subject}</p>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-blue-300/50 mb-1">
                            Email Body
                          </label>
                          <p className="text-xs text-blue-200 whitespace-pre-wrap leading-relaxed font-mono">{touch.body}{signaturePreview ? '\n\n' + signaturePreview : ''}</p>
                        </div>
                        <div className="pt-1">
                          <button
                            onClick={() => setToneOverrideIdx(showToneOverride ? null : idx)}
                            className="text-[11px] text-blue-300/50 hover:text-blue-300 transition-colors"
                          >
                            Tone: {emailTone} · Change
                          </button>
                          {showToneOverride && (
                            <div className="mt-2 flex items-center gap-2">
                              <select
                                value={perEmailTone[idx] || ''}
                                onChange={e => {
                                  const val = e.target.value
                                  setPerEmailTone(prev => val ? { ...prev, [idx]: val } : (() => { const next = { ...prev }; delete next[idx]; return next })())
                                  setToneOverrideIdx(null)
                                }}
                                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                              >
                                <option value="" className="bg-[#0f1c35]">Use sequence tone ({generatedTone})</option>
                                {TONES.filter(t => t !== 'Custom').map(t => (
                                  <option key={t} value={t} className="bg-[#0f1c35]">{t}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
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
