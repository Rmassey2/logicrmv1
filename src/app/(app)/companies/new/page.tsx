'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const INDUSTRIES = [
  'Manufacturing', 'Distribution/Wholesale', 'Retail/CPG', 'Construction',
  'Agriculture', 'Automotive', 'Food & Beverage', 'Chemical', 'Pharmaceutical',
  'E-Commerce', 'Industrial', 'Other',
]

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

export default function NewCompanyPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', website: '', industry: '', city: '', state: '', notes: '' })

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Company name is required.'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { error } = await supabase.from('companies').insert({
      user_id: user.id,
      name: form.name.trim(),
      website: form.website.trim() || null,
      industry: form.industry || null,
      city: form.city.trim() || null,
      state: form.state || null,
      notes: form.notes.trim() || null,
    })

    if (error) {
      console.error('Company insert failed:', error)
      toast.error(`Failed to save: ${error.message}`)
      setSaving(false)
      return
    }
    toast.success('Company added!')
    router.push('/companies')
  }

  const inputClass = 'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1.5'

  return (
    <div className="px-8 py-10 max-w-3xl">
      <button onClick={() => router.push('/companies')} className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Companies
      </button>
      <h2 className="text-2xl font-bold text-white mb-1">Add Company</h2>
      <p className="text-blue-300 text-sm mb-8">Add a new company to your network.</p>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 space-y-5">
        <div>
          <label className={labelClass}>Company Name</label>
          <input type="text" placeholder="Acme Manufacturing" value={form.name} onChange={e => update('name', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Website</label>
          <input type="url" placeholder="https://acme.com" value={form.website} onChange={e => update('website', e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>Industry</label>
            <select value={form.industry} onChange={e => update('industry', e.target.value)} className={`${inputClass} ${!form.industry ? 'text-blue-300/40' : ''}`}>
              <option value="" className="bg-[#0f1c35]">Select industry...</option>
              {INDUSTRIES.map(i => <option key={i} value={i} className="bg-[#0f1c35]">{i}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>City</label>
              <input type="text" placeholder="Memphis" value={form.city} onChange={e => update('city', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>State</label>
              <select value={form.state} onChange={e => update('state', e.target.value)} className={`${inputClass} ${!form.state ? 'text-blue-300/40' : ''}`}>
                <option value="" className="bg-[#0f1c35]">--</option>
                {US_STATES.map(s => <option key={s} value={s} className="bg-[#0f1c35]">{s}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <textarea rows={3} placeholder="Key info about this company..." value={form.notes} onChange={e => update('notes', e.target.value)} className={`${inputClass} resize-none`} />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors" style={{ backgroundColor: '#d4930e' }}>
            {saving ? 'Saving...' : 'Save Company'}
          </button>
          <button onClick={() => router.push('/companies')} className="px-6 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
