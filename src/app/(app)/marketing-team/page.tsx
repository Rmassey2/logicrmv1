'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Send,
  Loader2,
  RefreshCw,
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Agent {
  id: string
  name: string
  role: string
  emoji: string
  color: string
  bgColor: string
  description: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const AGENTS: Agent[] = [
  { id: 'jordan', name: 'Jordan', role: 'Sales Coach', emoji: '🎯', color: '#f59e0b', bgColor: 'rgba(245,158,11,0.15)', description: 'Analyzes your pipeline and tells you exactly which deal to call today.' },
  { id: 'maya', name: 'Maya', role: 'Email Strategist', emoji: '📧', color: '#8b5cf6', bgColor: 'rgba(139,92,246,0.15)', description: 'Reviews your campaign performance and recommends what to send next.' },
  { id: 'rex', name: 'Rex', role: 'Market Analyst', emoji: '📊', color: '#10b981', bgColor: 'rgba(16,185,129,0.15)', description: 'Freight market context, rate trends, and timing advice.' },
  { id: 'alex', name: 'Alex', role: 'Content Writer', emoji: '✍️', color: '#3b82f6', bgColor: 'rgba(59,130,246,0.15)', description: 'Writes cold emails, follow-ups, and call scripts in your voice.' },
]

export default function MarketingTeamPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [insights, setInsights] = useState<Record<string, string>>({})
  const [loadingInsights, setLoadingInsights] = useState<Record<string, boolean>>({})

  // Chat state
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)
    }
    init()
  }, [router])

  // Load insights for all agents
  const loadInsight = useCallback(async (agentId: string) => {
    if (!userId) return
    setLoadingInsights(prev => ({ ...prev, [agentId]: true }))
    try {
      const res = await fetch('/api/marketing-team/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userId }),
      })
      const data = await res.json()
      if (res.ok && data.insight) {
        setInsights(prev => ({ ...prev, [agentId]: data.insight }))
      }
    } catch { /* silent */ }
    setLoadingInsights(prev => ({ ...prev, [agentId]: false }))
  }, [userId])

  useEffect(() => {
    if (userId) {
      for (const agent of AGENTS) loadInsight(agent.id)
    }
  }, [userId, loadInsight])

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send chat message with streaming
  async function handleSend() {
    if (!input.trim() || !activeAgent || !userId || streaming) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setStreaming(true)

    // Add empty assistant message to stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/marketing-team/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, agentId: activeAgent.id, userId }),
      })

      if (!res.ok || !res.body) {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong. Try again.' }
          return updated
        })
        setStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        // Parse SSE events
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: fullText }
                return updated
              })
            }
          } catch { /* skip non-JSON lines */ }
        }
      }

      // Ensure final text is set
      if (fullText) {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: fullText }
          return updated
        })
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Connection error. Try again.' }
        return updated
      })
    }

    setStreaming(false)
  }

  function openChat(agent: Agent) {
    setActiveAgent(agent)
    setMessages([])
    setInput('')
  }

  function closeChat() {
    setActiveAgent(null)
    setMessages([])
  }

  // ── Chat View ──
  if (activeAgent) {
    return (
      <div className="flex flex-col h-screen">
        {/* Chat header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-4 shrink-0">
          <button onClick={closeChat} className="text-blue-300 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
            style={{ backgroundColor: activeAgent.bgColor }}
          >
            {activeAgent.emoji}
          </div>
          <div>
            <p className="text-white font-semibold">{activeAgent.name}</p>
            <p className="text-xs" style={{ color: activeAgent.color }}>{activeAgent.role}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl mx-auto mb-4"
                style={{ backgroundColor: activeAgent.bgColor }}
              >
                {activeAgent.emoji}
              </div>
              <p className="text-white font-medium mb-1">Chat with {activeAgent.name}</p>
              <p className="text-blue-300/50 text-sm max-w-md mx-auto">{activeAgent.description}</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                style={msg.role === 'user'
                  ? { backgroundColor: '#d4930e', color: '#0f1c35' }
                  : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)' }
                }
              >
                <p className="whitespace-pre-wrap">{msg.content}{streaming && i === messages.length - 1 && msg.role === 'assistant' ? '▊' : ''}</p>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0">
          <div className="flex gap-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={`Ask ${activeAgent.name}...`}
              disabled={streaming}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={streaming || !input.trim()}
              className="px-4 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40 transition-colors hover:brightness-110"
              style={{ backgroundColor: '#d4930e' }}
            >
              {streaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Dashboard View ──
  return (
    <div className="px-8 py-10 max-w-4xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">AI Marketing Team</h2>
        <p className="text-blue-300 text-sm mt-1">Your AI-powered team members, each with a specialty.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {AGENTS.map(agent => {
          const insight = insights[agent.id]
          const isLoading = loadingInsights[agent.id]
          return (
            <div
              key={agent.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col"
            >
              {/* Agent header */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0"
                  style={{ backgroundColor: agent.bgColor }}
                >
                  {agent.emoji}
                </div>
                <div>
                  <p className="text-white font-semibold">{agent.name}</p>
                  <p className="text-xs font-medium" style={{ color: agent.color }}>{agent.role}</p>
                </div>
              </div>

              <p className="text-xs text-blue-300/50 mb-3">{agent.description}</p>

              {/* Live insight */}
              <div className="flex-1 bg-white/[0.03] border border-white/5 rounded-xl p-3 mb-4 min-h-[60px]">
                {isLoading ? (
                  <div className="flex items-center gap-2 text-blue-300/40 text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                  </div>
                ) : insight ? (
                  <p className="text-xs text-blue-200/80 leading-relaxed">{insight}</p>
                ) : (
                  <p className="text-xs text-blue-300/30 italic">No insight yet</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openChat(agent)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold text-white hover:brightness-110 transition-colors"
                  style={{ backgroundColor: '#d4930e' }}
                >
                  Chat with {agent.name}
                </button>
                <button
                  onClick={() => loadInsight(agent.id)}
                  disabled={isLoading}
                  className="p-2 rounded-lg border border-white/10 text-blue-300/50 hover:text-white hover:border-white/20 disabled:opacity-30 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-center text-blue-400/50 text-xs mt-16">2026 Bid Genie AI · LogiCRM</p>
    </div>
  )
}
