'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { GraduationCap, X, Send, Loader2 } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const WELCOME = "Hey! I'm your LogiCRM assistant. I can help you use the platform, build campaigns, work your pipeline, or answer freight sales questions. What do you need?"

export default function TrainingChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [userContext, setUserContext] = useState<{ name: string; company: string }>({ name: '', company: '' })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const name = user.user_metadata?.display_name || ''
      const res = await fetch(`/api/settings?userId=${user.id}`)
      const data = await res.json()
      setUserContext({ name, company: data.company?.company_name || '' })
    })
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/training-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, userContext }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Try again.' }])
    }

    setLoading(false)
  }

  const displayMessages = messages.length === 0 ? [{ role: 'assistant' as const, content: WELCOME }] : messages

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl hover:brightness-110 transition-all"
          style={{ backgroundColor: '#0f1c35', border: '2px solid #d4930e' }}
        >
          <GraduationCap className="w-6 h-6" style={{ color: '#d4930e' }} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 w-[400px] h-[500px] rounded-2xl flex flex-col shadow-2xl overflow-hidden"
          style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(212,147,14,0.3)' }}
        >
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5" style={{ color: '#d4930e' }} />
              <span className="text-sm font-semibold text-white">LogiCRM Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-blue-300/50 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {displayMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'text-white'
                      : 'text-blue-200'
                  }`}
                  style={{
                    backgroundColor: msg.role === 'user' ? 'rgba(212,147,14,0.2)' : 'rgba(255,255,255,0.05)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <Loader2 className="w-4 h-4 animate-spin text-blue-300/50" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
                placeholder="Ask about LogiCRM, freight sales, or cold outreach..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-blue-300/30 focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="p-2 rounded-lg disabled:opacity-30 hover:brightness-110 transition-colors"
                style={{ backgroundColor: '#d4930e' }}
              >
                <Send className="w-4 h-4" style={{ color: '#0f1c35' }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
