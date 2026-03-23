'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Plus, Building2, Users, TrendingUp } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Company {
  id: string
  name: string
  industry: string | null
  city: string | null
  state: string | null
  contact_count: number
  deal_count: number
}

export default function CompaniesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<Company[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch companies
      const { data: comps } = await supabase
        .from('companies')
        .select('id, name, industry, city, state')
        .eq('user_id', user.id)
        .order('name')

      if (!comps) { setLoading(false); return }

      // Get contact and deal counts per company name
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, company')
        .eq('user_id', user.id)

      const { data: leads } = await supabase
        .from('leads')
        .select('id, contact_id')
        .eq('user_id', user.id)

      const contactsByCompany = new Map<string, string[]>()
      for (const c of contacts ?? []) {
        if (c.company) {
          const key = c.company.toLowerCase()
          const ids = contactsByCompany.get(key) ?? []
          ids.push(c.id)
          contactsByCompany.set(key, ids)
        }
      }

      const enriched: Company[] = comps.map(comp => {
        const key = comp.name.toLowerCase()
        const compContactIds = contactsByCompany.get(key) ?? []
        const dealCount = (leads ?? []).filter(l => compContactIds.includes(l.contact_id)).length
        return {
          ...comp,
          contact_count: compContactIds.length,
          deal_count: dealCount,
        }
      })

      setCompanies(enriched)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = search.trim()
    ? companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : companies

  return (
    <div className="px-8 py-10 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Companies</h2>
          <p className="text-blue-300 text-sm mt-1">{companies.length} compan{companies.length !== 1 ? 'ies' : 'y'}</p>
        </div>
        <button
          onClick={() => router.push('/companies/new')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 transition-colors"
          style={{ backgroundColor: '#d4930e' }}
        >
          <Plus className="w-4 h-4" />
          Add Company
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300 pointer-events-none" />
        <input
          type="text"
          placeholder="Search companies..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors"
        />
      </div>

      {loading ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
          <p className="text-blue-300/60 text-sm">Loading companies...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
          <Building2 className="w-10 h-10 mx-auto mb-4 text-blue-300/30" />
          <p className="text-white font-medium mb-1">{search ? 'No matches' : 'No companies yet'}</p>
          <p className="text-blue-300/60 text-sm mb-6">
            {search ? 'Try a different search.' : 'Add your first company to start organizing contacts.'}
          </p>
          {!search && (
            <button
              onClick={() => router.push('/companies/new')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              <Plus className="w-4 h-4" /> Add Company
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const location = [c.city, c.state].filter(Boolean).join(', ')
            return (
              <Link
                key={c.id}
                href={`/companies/${c.id}`}
                className="block bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/[0.07] transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-white font-medium">{c.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {c.industry && <span className="text-xs text-blue-300/50">{c.industry}</span>}
                      {location && <span className="text-xs text-blue-300/40">{location}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-5 shrink-0">
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{c.contact_count}</p>
                      <p className="text-[10px] uppercase tracking-wide text-blue-300/50 flex items-center gap-1"><Users className="w-3 h-3" /> Contacts</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{c.deal_count}</p>
                      <p className="text-[10px] uppercase tracking-wide text-blue-300/50 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Deals</p>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <p className="text-center text-blue-400/50 text-xs mt-16">2026 Bid Genie AI · LogiCRM</p>
    </div>
  )
}
