'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Check,
  CheckSquare,
  Square,
  Users,
  Mail,
  FileText,
  Eye,
  Sparkles,
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Contact {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  company: string | null
}

interface Template {
  id: string
  name: string
  subject: string
  body: string
}

const STEPS = [
  { num: 1, label: 'Details', icon: FileText },
  { num: 2, label: 'Recipients', icon: Users },
  { num: 3, label: 'Compose', icon: Mail },
  { num: 4, label: 'Review', icon: Eye },
]

const MERGE_TAGS = [
  { tag: '{{first_name}}', label: 'First Name' },
  { tag: '{{last_name}}', label: 'Last Name' },
  { tag: '{{company}}', label: 'Company' },
  { tag: '{{email}}', label: 'Email' },
  { tag: '{{title}}', label: 'Title' },
  { tag: '{{city}}', label: 'City' },
  { tag: '{{state}}', label: 'State' },
]

export default function NewCampaignPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1
  const [campaignName, setCampaignName] = useState('')
  const [subject, setSubject] = useState('')

  // Step 2
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [contactSearch, setContactSearch] = useState('')

  // Step 3
  const [body, setBody] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)

  // Load contacts + templates once
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [contactsRes, templatesRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, first_name, last_name, email, company')
          .eq('user_id', user.id)
          .order('first_name', { ascending: true }),
        supabase
          .from('email_templates')
          .select('id, name, subject, body')
          .eq('user_id', user.id)
          .order('name', { ascending: true }),
      ])
      // Deduplicate contacts by email (keep first occurrence, which is alphabetical)
      const raw = contactsRes.data ?? []
      const seen = new Set<string>()
      const deduped: Contact[] = []
      for (const c of raw) {
        const key = c.email?.toLowerCase()
        if (!key || !seen.has(key)) {
          if (key) seen.add(key)
          deduped.push(c)
        }
      }
      setContacts(deduped)
      setTemplates(templatesRes.data ?? [])
      setContactsLoading(false)
    }
    load()
  }, [])

  // Filter contacts by search
  const filtered = useMemo(() => {
    if (!contactSearch.trim()) return contacts
    const q = contactSearch.toLowerCase()
    return contacts.filter((c) => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').toLowerCase()
      return (
        name.includes(q) ||
        (c.email?.toLowerCase().includes(q)) ||
        (c.company?.toLowerCase().includes(q))
      )
    })
  }, [contacts, contactSearch])

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))

  function toggleContact(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const c of filtered) next.delete(c.id)
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const c of filtered) if (c.email) next.add(c.id)
        return next
      })
    }
  }

  function insertMergeTag(tag: string) {
    const textarea = document.getElementById('campaign-body') as HTMLTextAreaElement | null
    if (!textarea) { setBody((b) => b + tag); return }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = body.slice(0, start)
    const after = body.slice(end)
    setBody(before + tag + after)
    setTimeout(() => {
      textarea.focus()
      textarea.selectionStart = textarea.selectionEnd = start + tag.length
    }, 0)
  }

  function previewBody(contact: Contact) {
    return body
      .replace(/\{\{first_name\}\}/g, contact.first_name ?? '')
      .replace(/\{\{last_name\}\}/g, contact.last_name ?? '')
      .replace(/\{\{company\}\}/g, contact.company ?? '')
      .replace(/\{\{email\}\}/g, contact.email ?? '')
      .replace(/\{\{title\}\}/g, '')
      .replace(/\{\{city\}\}/g, '')
      .replace(/\{\{state\}\}/g, '')
  }

  function canProceed() {
    if (step === 1) return campaignName.trim() && subject.trim()
    if (step === 2) return selectedIds.size > 0
    if (step === 3) return body.trim()
    return true
  }

  async function handleSave() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // 1. Insert campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .insert({
        user_id: user.id,
        name: campaignName.trim(),
        subject: subject.trim(),
        body: body.trim(),
        recipient_count: selectedIds.size,
        status: 'draft',
      })
      .select('id')
      .single()

    if (campaignError || !campaign) {
      console.error('Campaign insert failed:', campaignError)
      toast.error(`Failed to save campaign: ${campaignError?.message ?? 'unknown error'}`)
      setSaving(false)
      return
    }

    // 2. Insert campaign_contacts rows in batches
    const contactRows = Array.from(selectedIds).map((contact_id) => ({
      campaign_id: campaign.id,
      contact_id,
      status: 'enrolled',
    }))

    const BATCH = 100
    for (let i = 0; i < contactRows.length; i += BATCH) {
      const batch = contactRows.slice(i, i + BATCH)
      const { error } = await supabase.from('campaign_contacts').insert(batch)
      if (error) {
        console.error('Campaign contacts insert failed:', error)
        toast.error(`Saved campaign but failed to link some contacts: ${error.message}`)
        break
      }
    }

    toast.success('Campaign saved as draft!')
    router.push('/campaigns')
  }

  const selectedContacts = contacts.filter((c) => selectedIds.has(c.id))
  const previewContact = selectedContacts[0] || { id: '', first_name: 'John', last_name: 'Doe', email: 'john@example.com', company: 'Acme Freight' }

  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1.5'

  return (
    <div className="px-8 py-10 max-w-5xl">
      {/* Back */}
      <button
        onClick={() => router.push('/campaigns')}
        className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Campaigns
      </button>

      <h2 className="text-2xl font-bold text-white mb-1">New Campaign</h2>
      <p className="text-blue-300 text-sm mb-8">Create and save an email campaign.</p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => {
          const isActive = s.num === step
          const isDone = s.num < step
          return (
            <div key={s.num} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className="w-8 h-px hidden sm:block"
                  style={{ backgroundColor: isDone ? '#d4930e' : 'rgba(255,255,255,0.1)' }}
                />
              )}
              <button
                onClick={() => { if (isDone) setStep(s.num) }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  isActive
                    ? 'text-white'
                    : isDone
                      ? 'text-blue-300 hover:text-white cursor-pointer'
                      : 'text-blue-300/40 cursor-default'
                }`}
                style={isActive ? { backgroundColor: 'rgba(212,147,14,0.15)', color: '#d4930e' } : undefined}
              >
                {isDone ? (
                  <Check className="w-3.5 h-3.5" style={{ color: '#d4930e' }} />
                ) : (
                  <s.icon className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            </div>
          )
        })}
      </div>

      {/* Step 1: Details */}
      {step === 1 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 space-y-5">
          <div>
            <label className={labelClass}>Campaign Name</label>
            <input
              type="text"
              placeholder="Q1 Carrier Outreach"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className={inputClass}
            />
            <p className="text-blue-300/40 text-xs mt-1">Internal name — recipients won&apos;t see this.</p>
          </div>
          <div>
            <label className={labelClass}>Subject Line</label>
            <input
              type="text"
              placeholder="Bid Genie AI - Let's partner on your next lane"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* Step 2: Recipients */}
      {step === 2 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          {/* Search + select all header */}
          <div className="px-5 py-3 border-b border-white/10 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300 pointer-events-none" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 transition-colors"
              />
            </div>
            <div className="flex items-center gap-3 text-sm shrink-0">
              <button
                onClick={toggleAll}
                className="flex items-center gap-1.5 text-blue-300 hover:text-white transition-colors"
              >
                {allFilteredSelected ? (
                  <CheckSquare className="w-4 h-4" style={{ color: '#d4930e' }} />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                {allFilteredSelected ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-blue-300/40">|</span>
              <span className="text-blue-300/60">
                {selectedIds.size} selected
              </span>
            </div>
          </div>

          {/* Contact list */}
          <div className="max-h-80 overflow-y-auto">
            {contactsLoading ? (
              <p className="px-5 py-12 text-center text-blue-300/60 text-sm">Loading contacts...</p>
            ) : filtered.length === 0 ? (
              <p className="px-5 py-12 text-center text-blue-300/60 text-sm">
                {contactSearch ? 'No contacts match your search.' : 'No contacts found. Add contacts first.'}
              </p>
            ) : (
              filtered.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed'
                const checked = selectedIds.has(c.id)
                const noEmail = !c.email
                return (
                  <button
                    key={c.id}
                    onClick={() => { if (!noEmail) toggleContact(c.id) }}
                    disabled={noEmail}
                    className={`w-full flex items-center gap-3 px-5 py-3 border-b border-white/5 text-left transition-colors ${
                      noEmail ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5 cursor-pointer'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare className="w-4 h-4 shrink-0" style={{ color: '#d4930e' }} />
                    ) : (
                      <Square className="w-4 h-4 shrink-0 text-blue-300/40" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white font-medium truncate">{name}</p>
                      <p className="text-xs text-blue-300/60 truncate">
                        {c.email || 'No email'}{c.company ? ` · ${c.company}` : ''}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Step 3: Compose */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Template picker */}
          {templates.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowTemplatePicker((v) => !v)}
                className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" style={{ color: '#d4930e' }} />
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Load from Template</p>
                </div>
                <span className="text-blue-300/40 text-xs">
                  {showTemplatePicker ? 'Hide' : `${templates.length} available`}
                </span>
              </button>
              {showTemplatePicker && (
                <div className="border-t border-white/10 max-h-48 overflow-y-auto">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSubject(t.subject)
                        setBody(t.body)
                        setShowTemplatePicker(false)
                        toast.success(`Loaded template: ${t.name}`)
                      }}
                      className="w-full px-5 py-3 border-b border-white/5 text-left hover:bg-white/5 transition-colors"
                    >
                      <p className="text-sm text-white font-medium">{t.name}</p>
                      <p className="text-xs text-blue-300/50 mt-0.5 truncate">Subject: {t.subject}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Merge tags bar */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <Sparkles className="w-4 h-4" style={{ color: '#d4930e' }} />
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Merge Tags</p>
              <span className="text-blue-300/30 text-xs ml-1">— click to insert at cursor</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {MERGE_TAGS.map((m) => (
                <button
                  key={m.tag}
                  onClick={() => insertMergeTag(m.tag)}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono bg-white/5 border border-white/10 text-blue-200 hover:text-white hover:border-yellow-500/40 transition-colors"
                >
                  {m.tag}
                </button>
              ))}
            </div>
          </div>

          {/* Editor + Live Preview side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Editor */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <label className={labelClass}>Email Body</label>
              <textarea
                id="campaign-body"
                rows={14}
                placeholder={"Hi {{first_name}},\n\nI wanted to reach out about potential freight partnerships with {{company}}...\n\nBest regards,\nBid Genie AI"}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className={`${inputClass} resize-none font-mono`}
              />
            </div>

            {/* Live preview */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col">
              <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5" style={{ color: '#d4930e' }} />
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Live Preview</p>
                </div>
                <p className="text-blue-300/40 text-xs truncate ml-2">
                  {[previewContact.first_name, previewContact.last_name].filter(Boolean).join(' ')}
                </p>
              </div>
              <div className="p-5 flex-1 overflow-y-auto">
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-wide text-blue-300/40 mb-0.5">Subject</p>
                  <p className="text-sm text-white font-medium">{subject}</p>
                </div>
                <div className="border-t border-white/10 pt-3">
                  {body.trim() ? (
                    <p className="text-sm text-blue-200 whitespace-pre-wrap leading-relaxed">
                      {previewBody(previewContact)}
                    </p>
                  ) : (
                    <p className="text-sm text-blue-300/30 italic">
                      Start typing to see a preview...
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="space-y-5">
          {/* Summary card */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">Campaign Summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-blue-300/60 text-xs uppercase tracking-wide mb-0.5">Campaign Name</p>
                <p className="text-white font-medium">{campaignName}</p>
              </div>
              <div>
                <p className="text-blue-300/60 text-xs uppercase tracking-wide mb-0.5">Subject Line</p>
                <p className="text-white font-medium">{subject}</p>
              </div>
              <div>
                <p className="text-blue-300/60 text-xs uppercase tracking-wide mb-0.5">Recipients</p>
                <p className="text-white font-medium">{selectedIds.size} contact{selectedIds.size !== 1 && 's'}</p>
              </div>
              <div>
                <p className="text-blue-300/60 text-xs uppercase tracking-wide mb-0.5">Status</p>
                <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-400">Draft</span>
              </div>
            </div>

            {/* Body snippet */}
            <div className="border-t border-white/10 pt-4 mt-4">
              <p className="text-blue-300/60 text-xs uppercase tracking-wide mb-1">Email Body Preview</p>
              <p className="text-sm text-blue-200 leading-relaxed">
                {body.trim().length > 100 ? body.trim().slice(0, 100) + '...' : body.trim()}
              </p>
            </div>
          </div>

          {/* Email preview */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">Email Preview</h3>
              <p className="text-blue-300/40 text-xs">
                Showing for: {[previewContact.first_name, previewContact.last_name].filter(Boolean).join(' ')}
              </p>
            </div>
            <div className="p-5">
              <div className="mb-3">
                <p className="text-xs text-blue-300/50 mb-0.5">Subject</p>
                <p className="text-sm text-white font-medium">{subject}</p>
              </div>
              <div className="border-t border-white/10 pt-3">
                <p className="text-sm text-blue-200 whitespace-pre-wrap leading-relaxed">
                  {previewBody(previewContact)}
                </p>
              </div>
            </div>
          </div>

          {/* Recipients list */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/10">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">
                Recipients ({selectedContacts.length})
              </h3>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {selectedContacts.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed'
                return (
                  <div key={c.id} className="px-5 py-2.5 border-b border-white/5 flex items-center justify-between">
                    <p className="text-sm text-white">{name}</p>
                    <p className="text-xs text-blue-300/60">{c.email}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between mt-8">
        <button
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors ${
            step === 1 ? 'invisible' : ''
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {step < 4 ? (
          <button
            onClick={() => {
              if (!canProceed()) {
                if (step === 1) toast.error('Enter a campaign name and subject line.')
                if (step === 2) toast.error('Select at least one recipient.')
                if (step === 3) toast.error('Write the email body.')
                return
              }
              setStep((s) => s + 1)
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 transition-colors"
            style={{ backgroundColor: '#d4930e' }}
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
            style={{ backgroundColor: '#d4930e' }}
          >
            {saving ? 'Saving...' : 'Save Campaign'}
          </button>
        )}
      </div>
    </div>
  )
}
