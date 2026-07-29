import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { askLegalQuestion, getGuestStatus } from '../services/api.js'
import * as chatApi from '../services/authApi.js'
const DEFAULT_FREE_LIMIT = 4
const GUEST_COUNT_KEY = 'vl_guestMsgCount'

const ChatContext = createContext(null)

function makeMsg(role, text, extra = {}) {
  return {
    id: Date.now() + Math.random(),
    role,
    text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    ...extra,
  }
}

export function ChatProvider({ children }) {
  const { user, accessToken } = useAuth()

  // ── In-memory message cache: { [session_id]: Message[] } ─────────────────
  // Avoids re-fetching messages from the DB every time the user clicks a chat.
  // Flushed on logout; updated in-place when new messages are sent.
  const messageCache = useRef({})

  // ── Server-side data ───────────────────────────────────────────────────────
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [sessionsLoading, setSessionsLoading] = useState(false)

  // ── Guest usage + server-authoritative FREE_LIMIT ────────────────────────
  const [guestCount, setGuestCount] = useState(() => {
    if (typeof window === 'undefined') return 0
    return parseInt(localStorage.getItem(GUEST_COUNT_KEY) || '0', 10)
  })
  // Starts at a safe default; overwritten by the first server response so
  // the UI always reflects the value the server actually enforces.
  const [FREE_LIMIT, setFreeLimit] = useState(DEFAULT_FREE_LIMIT)

  // ── Sync guest usage AND authoritative limit from server (guests only) ──────
  useEffect(() => {
    if (user) return
    getGuestStatus()
      .then((data) => {
        if (data && typeof data.usage === 'number') {
          setGuestCount(data.usage)
          localStorage.setItem(GUEST_COUNT_KEY, String(data.usage))
        }
        // Server owns the limit — update the client to match
        if (data && typeof data.limit === 'number') {
          setFreeLimit(data.limit)
        }
      })
      .catch(console.error)
  }, [user])

  // ── Load sessions whenever the user logs in; flush cache on logout ──────────
  useEffect(() => {
    if (!accessToken) {
      setSessions([])
      setActiveSession(null)
      messageCache.current = {} // flush all cached messages on logout
      return
    }
    setSessionsLoading(true)
    chatApi.getSessions()
      .then((data) => { if (data.success) setSessions(data.sessions) })
      .catch(console.error)
      .finally(() => setSessionsLoading(false))
  }, [accessToken])

  // ── Load messages whenever the active session changes ─────────────────────
  // Uses in-memory cache: DB is only hit once per session per login.
  useEffect(() => {
    if (!activeSession || !accessToken) {
      setMessages([])
      return
    }

    const sid = activeSession.session_id

    // ── Cache hit: render immediately, skip the network call ──────────────
    if (messageCache.current[sid]) {
      setMessages(messageCache.current[sid])
      return
    }

    // ── Cache miss: fetch from DB, then store in cache ────────────────────
    let cancelled = false

    chatApi.getMessages(sid)
      .then((data) => {
        if (cancelled) return
        if (data.success) {
          const mapped = data.messages.map((m) => ({
            id: m.message_id,
            role: m.role,
            text: m.content,
            time: new Date(m.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          }))
          messageCache.current[sid] = mapped
          setMessages(mapped)
        }
      })
      .catch((err) => { if (!cancelled) console.error(err) })

    return () => { cancelled = true }
  }, [activeSession, accessToken])

  // ── handleNewChat ──────────────────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    setActiveSession(null)
    setMessages([])
  }, [])

  // ── handleSelectSession ────────────────────────────────────────────────────
  const handleSelectSession = useCallback((session) => {
    setActiveSession((prev) =>
      prev?.session_id === session.session_id ? prev : session
    )
    setMessages([]) // clear immediately; the effect above will populate
  }, [])

  // ── handleDeleteSession ────────────────────────────────────────────────────
  const handleDeleteSession = useCallback(async (sessionId) => {
    try {
      await chatApi.deleteSession(sessionId)
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId))
      setActiveSession((prev) => {
        if (prev?.session_id === sessionId) {
          setMessages([])
          return null
        }
        return prev
      })
    } catch (err) {
      console.error('Delete session error:', err)
    }
  }, [])

  // ── sendMessage ────────────────────────────────────────────────────────────
  // Returns { limitReached: true } when the guest cap is hit so the dashboard
  // can show the modal without knowing anything about FREE_LIMIT itself.
  const sendMessage = useCallback(async (inputText) => {
    const trimmed = inputText?.trim()
    if (!trimmed || isLoading) return

    // ── Guest limit guard ──────────────────────────────────────────────────
    if (!user && guestCount >= FREE_LIMIT) {
      return { limitReached: true }
    }

    let currentSession = activeSession

    // ── Create a session on the first message (authenticated only) ─────────
    if (user && accessToken && !currentSession) {
      try {
        const data = await chatApi.createSession(trimmed.slice(0, 50))
        if (data.success) {
          currentSession = data.session
          setActiveSession(data.session)
          setSessions((prev) => [data.session, ...prev])
        }
      } catch (err) {
        console.error('Create session error:', err)
      }
    }

    const userMsg = makeMsg('user', trimmed)
    setMessages((prev) => {
      const updated = [...prev, userMsg]
      // keep cache in sync so switching away and back shows the optimistic msg
      if (currentSession) messageCache.current[currentSession.session_id] = updated
      return updated
    })
    setIsLoading(true)

    // Persist user message (fire-and-forget)
    if (currentSession && accessToken) {
      chatApi.saveMessage(currentSession.session_id, 'user', trimmed).catch(console.error)
    }

    try {
      const resData = await askLegalQuestion(trimmed, { token: accessToken || undefined })

      // Update guest count AND limit from server response
      if (!user && resData.guestUsage !== undefined) {
        setGuestCount(resData.guestUsage)
        localStorage.setItem(GUEST_COUNT_KEY, String(resData.guestUsage))
      }
      if (!user && typeof resData.guestLimit === 'number') {
        setFreeLimit(resData.guestLimit)
      }

      const assistantMsg = makeMsg('assistant', resData.answer)
      setMessages((prev) => {
        const updated = [...prev, assistantMsg]
        // update cache with the assistant reply so re-visits stay fresh
        if (currentSession) messageCache.current[currentSession.session_id] = updated
        return updated
      })

      // Persist assistant message (fire-and-forget)
      if (currentSession && accessToken) {
        chatApi
          .saveMessage(currentSession.session_id, 'assistant', resData.answer)
          .catch(console.error)
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        makeMsg('assistant', err.message || 'Something went wrong. Please try again.', {
          isError: true,
        }),
      ])
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, user, guestCount, activeSession, accessToken])

  // ── Context value ──────────────────────────────────────────────────────────
  const value = {
    // State
    sessions,
    activeSession,
    messages,
    isLoading,
    sessionsLoading,
    guestCount,
    FREE_LIMIT,
    // Actions
    handleNewChat,
    handleSelectSession,
    handleDeleteSession,
    sendMessage,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used inside ChatProvider')
  return ctx
}
