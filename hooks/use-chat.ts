import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMessages, sendMessage, type ChatMessage } from '@/services/chat'
import { ChatSocket, type ChatMessageFrame } from '@/services/chat-socket'
import { useAuthStore } from '@/store/auth-store'

// The local user is always the "captain" role in this app; used to align own vs.
// other messages and to know whose read receipt to reflect on our sent bubbles.
const SELF_ROLE = 'captain' as const

export interface UseChat {
  messages: ChatMessage[]
  isLoading: boolean
  /** Non-null when the initial history load failed (e.g. 403 no-captain, 404). */
  loadError: unknown
  hasMore: boolean
  loadOlder: () => void
  isLoadingOlder: boolean
  send: (body: string) => Promise<void>
  isSending: boolean
  sendError: unknown
}

function dedupeSorted(messages: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const m of messages) {
    const prev = byId.get(m.id)
    if (!prev) {
      byId.set(m.id, m)
      continue
    }
    // Merge, but never let a null readAt clobber a real one: the WS self-echo
    // carries readAt=null while a later GET refetch brings the same message with
    // read_at set — whichever order they merge in, the "read" state must stick.
    byId.set(m.id, { ...prev, ...m, readAt: m.readAt ?? prev.readAt })
  }
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * In-ride chat for one trip: paginated history (keyset, walk backwards), a live
 * WS overlay (append new + apply read receipts), and a send mutation. The GET
 * that loads history also marks the counterparty's messages read server-side, so
 * mounting this hook = opening (and reading) the thread.
 */
export function useChat(tripId: string): UseChat {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)

  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([])
  const [readAt, setReadAt] = useState<string | null>(null)

  const key = useMemo(() => ['chat', tripId] as const, [tripId])

  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getMessages(tripId, { before: pageParam, limit: 50 }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.items.length > 0 ? lastPage.items[0].createdAt : undefined,
    enabled: !!tripId && !!token,
    staleTime: Infinity,
    retry: 1,
  })

  const fetchedMessages = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.items),
    [query.data],
  )

  const messages = useMemo(() => {
    const merged = dedupeSorted([...fetchedMessages, ...liveMessages])
    if (!readAt) return merged
    return merged.map((m) =>
      m.senderRole === SELF_ROLE && !m.readAt ? { ...m, readAt } : m,
    )
  }, [fetchedMessages, liveMessages, readAt])

  // --- Live socket ---------------------------------------------------------
  const socketRef = useRef<ChatSocket | null>(null)

  const onMessage = useCallback((f: ChatMessageFrame) => {
    setLiveMessages((prev) => {
      if (prev.some((m) => m.id === f.messageId)) return prev
      return [
        ...prev,
        {
          id: f.messageId,
          tripId: f.tripId,
          senderId: f.senderId,
          senderRole: f.senderRole,
          body: f.body,
          readAt: null,
          createdAt: f.createdAt,
        },
      ]
    })
  }, [])

  useEffect(() => {
    if (!tripId || !token) return
    const socket = new ChatSocket(tripId, {
      onMessage,
      onRead: (f) => {
        // The counterparty (rider) opened the thread → our sent messages are
        // read. Keep readAt monotonic so an out-of-order older frame can't roll
        // the tick back.
        if (f.readerRole !== SELF_ROLE) {
          setReadAt((prev) => (prev && prev >= f.readAt ? prev : f.readAt))
        }
      },
      onOpen: () => {
        void queryClient.invalidateQueries({ queryKey: key, refetchType: 'active' })
      },
    })
    socket.open()
    socketRef.current = socket
    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [tripId, token, onMessage, queryClient, key])

  // --- Send ----------------------------------------------------------------
  const sendM = useMutation({
    mutationFn: (body: string) => sendMessage(tripId, body),
    onSuccess: (msg) => {
      setLiveMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    },
  })

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim()
      if (!trimmed) return
      await sendM.mutateAsync(trimmed)
    },
    [sendM],
  )

  return {
    messages,
    isLoading: query.isLoading,
    loadError: query.isError ? query.error : null,
    hasMore: !!query.hasNextPage,
    loadOlder: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
    },
    isLoadingOlder: query.isFetchingNextPage,
    send,
    isSending: sendM.isPending,
    sendError: sendM.isError ? sendM.error : null,
  }
}
