'use client'

import { useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CONTACT_FIELDS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'lead_contact_name', label: 'Lead Contact Name → First + Last' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'title', label: 'Title' },
  { key: 'role', label: 'Role' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'location', label: 'Location → City + State' },
] as const

const DB_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'company', 'title', 'role', 'city', 'state'] as const

type Step = 'upload' | 'map' | 'preview' | 'importing' | 'done'

// Parse email field — take first email, return secondary if present
function parseEmail(raw: string | null): { primary: string | null; secondary: string | null } {
  if (!raw) return { primary: null, secondary: null }
  const trimmed = raw.trim()
  if (!trimmed) return { primary: null, secondary: null }

  // Split on comma, semicolon, or slash
  const parts = trimmed.split(/[,;\/]/).map(s => s.trim()).filter(s => s.includes('@'))
  if (parts.length === 0) return { primary: null, secondary: null }
  if (parts.length === 1) return { primary: parts[0], secondary: null }
  return { primary: parts[0], secondary: parts[1] }
}

// Check if a row is entirely empty
function isRowEmpty(row: Record<string, string | null>): boolean {
  for (const key of DB_FIELDS) {
    if (row[key] && row[key]!.trim()) return false
  }
  return true
}

export default function ImportContactsPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importedCount, setImportedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [skipReasons, setSkipReasons] = useState<string[]>([])
  const [errorCount, setErrorCount] = useState(0)

  function autoMap(fileHeaders: string[]) {
    const auto: Record<string, string> = {}
    const lower = fileHeaders.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''))

    const leadContactIdx = lower.findIndex((h) => h === 'leadcontactname')
    if (leadContactIdx !== -1) auto['lead_contact_name'] = fileHeaders[leadContactIdx]

    const locationIdx = lower.findIndex((h) => h === 'location')
    if (locationIdx !== -1) auto['location'] = fileHeaders[locationIdx]

    for (const field of CONTACT_FIELDS) {
      if (field.key === 'lead_contact_name' || field.key === 'location') continue
      if ((field.key === 'first_name' || field.key === 'last_name') && auto['lead_contact_name']) continue
      if ((field.key === 'city' || field.key === 'state') && auto['location']) continue

      const fieldNorm = field.key.replace(/_/g, '')
      const idx = lower.findIndex((h) =>
        h === fieldNorm || h === field.key || h.includes(fieldNorm) ||
        (field.key === 'first_name' && (h === 'firstname' || h === 'first')) ||
        (field.key === 'last_name' && (h === 'lastname' || h === 'last')) ||
        (field.key === 'phone' && (h.includes('phone') || h.includes('tel'))) ||
        (field.key === 'email' && h.includes('email')) ||
        (field.key === 'company' && (h.includes('company') || h.includes('organization') || h.includes('org'))) ||
        (field.key === 'city' && h.includes('city')) ||
        (field.key === 'state' && (h === 'state' || h === 'st' || h === 'province'))
      )
      if (idx !== -1) auto[field.key] = fileHeaders[idx]
    }
    return auto
  }

  function parseFile(file: File) {
    setFileName(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase()

    // .xlsb warning
    if (ext === 'xlsb') {
      toast.error('Please open this file in Excel and Save As .xlsx before importing.')
      return
    }

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete(results) {
          const data = results.data as Record<string, string>[]
          if (data.length === 0) { toast.error('No data found in CSV.'); return }
          const h = Object.keys(data[0])
          setHeaders(h)
          setRows(data)
          setMapping(autoMap(h))
          setStep('map')
        },
        error() { toast.error('Failed to parse CSV file.') },
      })
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = (e) => {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })
        if (data.length === 0) { toast.error('No data found in spreadsheet.'); return }
        const h = Object.keys(data[0])
        setHeaders(h)
        setRows(data)
        setMapping(autoMap(h))
        setStep('map')
      }
      reader.readAsArrayBuffer(file)
    } else {
      toast.error('Please upload a .csv or .xlsx file.')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  function getMappedRows(): { row: Record<string, string | null>; notes: string | null; fallbackUsed: string | null }[] {
    return rows.map((row) => {
      const mapped: Record<string, string | null> = {}
      const extraNotes: string[] = []
      let fallbackUsed: string | null = null

      // Direct field mappings
      for (const field of DB_FIELDS) {
        const srcCol = mapping[field]
        mapped[field] = srcCol ? (String(row[srcCol]).trim() || null) : null
      }

      // "Lead Contact Name" → split on first space
      const nameCol = mapping['lead_contact_name']
      if (nameCol) {
        const fullName = String(row[nameCol]).trim()
        if (fullName) {
          const spaceIdx = fullName.indexOf(' ')
          if (spaceIdx === -1) {
            mapped['first_name'] = fullName
            mapped['last_name'] = null
          } else {
            mapped['first_name'] = fullName.slice(0, spaceIdx)
            mapped['last_name'] = fullName.slice(spaceIdx + 1).trim() || null
          }
        }
      }

      // FIRST_NAME FALLBACK — try raw row columns if still null
      if (!mapped['first_name'] || !mapped['first_name'].trim()) {
        // Try common raw column names directly from the spreadsheet
        const rawName = (
          row['Lead Contact Name'] || row['Name'] || row['name'] ||
          row['Contact Name'] || row['contact_name'] || row['Full Name'] ||
          row['first_name'] || row['FirstName'] || row['First Name'] || ''
        ).toString().trim()

        if (rawName) {
          const nameParts = rawName.split(/\s+/)
          mapped['first_name'] = nameParts[0]
          mapped['last_name'] = nameParts.slice(1).join(' ') || null
          fallbackUsed = `raw name column: "${rawName}"`
        } else {
          // Fall back to company
          const rawCompany = (
            mapped['company'] ||
            row['Company'] || row['company'] || row['Company Name'] ||
            row['companyName'] || row['Organization'] || ''
          ).toString().trim()

          if (rawCompany) {
            mapped['first_name'] = rawCompany
            mapped['last_name'] = null
            fallbackUsed = `company name: "${rawCompany}"`
          } else {
            mapped['first_name'] = 'Unknown'
            mapped['last_name'] = null
            fallbackUsed = 'no name or company found'
          }
        }
      }

      // "Location" → split on comma
      const locCol = mapping['location']
      if (locCol) {
        const location = String(row[locCol]).trim()
        if (location) {
          const commaIdx = location.lastIndexOf(',')
          if (commaIdx === -1) {
            mapped['city'] = location
            mapped['state'] = null
          } else {
            mapped['city'] = location.slice(0, commaIdx).trim() || null
            mapped['state'] = location.slice(commaIdx + 1).trim() || null
          }
        }
      }

      // Email handling — take first, store second in notes
      if (mapped['email']) {
        const { primary, secondary } = parseEmail(mapped['email'])
        mapped['email'] = primary
        if (secondary) {
          extraNotes.push(`Secondary email: ${secondary}`)
        }
      }

      return { row: mapped, notes: extraNotes.length > 0 ? extraNotes.join('; ') : null, fallbackUsed }
    })
  }

  async function handleImport() {
    setStep('importing')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const allMapped = getMappedRows()
    const BATCH_SIZE = 100
    let success = 0
    let errors = 0
    let skipped = 0
    const reasons: string[] = []

    // Filter and prepare rows
    const toImport: Record<string, string | null>[] = []
    for (let i = 0; i < allMapped.length; i++) {
      const { row, notes, fallbackUsed } = allMapped[i]

      // Skip only if entire row is empty
      if (isRowEmpty(row)) {
        skipped++
        reasons.push(`Row ${i + 2}: entirely empty`)
        continue
      }

      const clean: Record<string, string | null> = { user_id: user.id }
      for (const key of DB_FIELDS) clean[key] = row[key] ?? null

      // Log fallback usage
      if (fallbackUsed) {
        reasons.push(`Row ${i + 2}: used fallback for first_name (${fallbackUsed})`)
      }

      // Append secondary email to notes if present
      if (notes) {
        clean['notes'] = notes
      }

      toImport.push(clean)
    }

    // Batch insert
    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
      const batch = toImport.slice(i, i + BATCH_SIZE)
      const { error, data } = await supabase.from('contacts').insert(batch).select('id')
      if (error) {
        errors += batch.length
        reasons.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
      } else {
        success += data?.length ?? batch.length
      }
    }

    setImportedCount(success)
    setSkippedCount(skipped)
    setSkipReasons(reasons)
    setErrorCount(errors)
    setStep('done')
  }

  const previewData = getMappedRows().slice(0, 5)
  const mappedFieldCount = Object.values(mapping).filter(Boolean).length

  const activeDbFields = DB_FIELDS.filter((f) => {
    if (mapping[f]) return true
    if ((f === 'first_name' || f === 'last_name') && mapping['lead_contact_name']) return true
    if ((f === 'city' || f === 'state') && mapping['location']) return true
    return false
  })

  const selectClass =
    'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'

  return (
    <div className="px-8 py-10 max-w-4xl">
      <button
        onClick={() => router.push('/contacts')}
        className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Contacts
      </button>

      <h2 className="text-2xl font-bold text-white mb-1">Import Contacts</h2>
      <p className="text-blue-300 text-sm mb-8">Upload a CSV or Excel file to bulk-add contacts.</p>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="bg-white/5 border-2 border-dashed border-white/15 rounded-2xl p-16 text-center cursor-pointer hover:border-yellow-500/40 transition-colors"
        >
          <Upload className="w-10 h-10 mx-auto mb-4" style={{ color: '#d4930e' }} />
          <p className="text-white font-medium mb-1">
            Drag & drop your file here, or click to browse
          </p>
          <p className="text-blue-300/60 text-sm">Supports .csv and .xlsx files</p>
          <p className="text-blue-300/30 text-xs mt-2">Note: .xlsb files must be saved as .xlsx first</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) parseFile(e.target.files[0]) }}
          />
        </div>
      )}

      {/* Step: Map Columns */}
      {step === 'map' && (
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <FileSpreadsheet className="w-5 h-5" style={{ color: '#d4930e' }} />
              <div>
                <p className="text-white font-medium text-sm">{fileName}</p>
                <p className="text-blue-300/60 text-xs">{rows.length} rows &middot; {headers.length} columns</p>
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-blue-300 mb-3">
              Map your columns
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {CONTACT_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="block text-xs text-blue-300/70 mb-1">{field.label}</label>
                  <select
                    value={mapping[field.key] || ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="" className="bg-[#0f1c35]">— Skip —</option>
                    {headers.map((h) => (
                      <option key={h} value={h} className="bg-[#0f1c35]">{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { if (mappedFieldCount > 0) setStep('preview'); else toast.error('Map at least one column.') }}
              className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              Preview Import
            </button>
            <button
              onClick={() => { setStep('upload'); setRows([]); setHeaders([]) }}
              className="px-6 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/10">
              <p className="text-white font-medium text-sm">
                Preview — first {Math.min(5, rows.length)} of {rows.length} rows
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    {activeDbFields.map((f) => (
                      <th key={f} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-blue-300 whitespace-nowrap">
                        {f.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map(({ row }, i) => (
                    <tr key={i} className="border-b border-white/5">
                      {activeDbFields.map((f) => (
                        <td key={f} className="px-4 py-3 text-sm text-blue-200 whitespace-nowrap">
                          {row[f] || <span className="text-blue-300/30">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              Import {rows.length} Contact{rows.length !== 1 && 's'}
            </button>
            <button
              onClick={() => setStep('map')}
              className="px-6 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
            >
              Back to Mapping
            </button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
          <div className="w-12 h-12 rounded-full border-4 border-white/10 border-t-[#d4930e] animate-spin mx-auto mb-4" />
          <p className="text-white font-medium">Importing contacts...</p>
          <p className="text-blue-300/60 text-sm mt-1">This may take a moment.</p>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12">
          <div className="text-center">
            {errorCount === 0 ? (
              <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-yellow-400" />
            )}
            <p className="text-white font-bold text-lg mb-1">Import Complete</p>
            <p className="text-blue-300 text-sm mb-1">
              <span className="text-emerald-400 font-semibold">{importedCount}</span> contact{importedCount !== 1 ? 's' : ''} imported
              {skippedCount > 0 && (
                <>, <span className="text-yellow-400 font-semibold">{skippedCount}</span> skipped</>
              )}
            </p>
            {errorCount > 0 && (
              <p className="text-red-400 text-sm">
                {errorCount} row{errorCount !== 1 ? 's' : ''} failed to import.
              </p>
            )}
          </div>

          {/* Skip/error reasons */}
          {skipReasons.length > 0 && (
            <div className="mt-4 bg-white/[0.03] border border-white/5 rounded-xl p-4 max-h-32 overflow-y-auto">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-300/50 mb-2">Details</p>
              {skipReasons.map((r, i) => (
                <p key={i} className="text-xs text-blue-300/40">{r}</p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => router.push('/contacts')}
              className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              View Contacts
            </button>
            <button
              onClick={() => { setStep('upload'); setRows([]); setHeaders([]); setMapping({}); setSkipReasons([]) }}
              className="px-6 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
            >
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
