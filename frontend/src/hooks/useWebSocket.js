import { useEffect, useRef, useState, useCallback } from 'react'
import { wsURL } from '../api'

/**
 * Resilient WebSocket hook with automatic reconnection (exponential backoff).
 * Returns the rolling list of agent events and the live connection status.
 */
export function useWebSocket(onEvent) {
  const [events, setEvents] = useState([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const retryRef = useRef(0)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const connect = useCallback(() => {
    let ws
    try {
      ws = new WebSocket(wsURL())
    } catch {
      scheduleReconnect()
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      retryRef.current = 0
    }
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data)
        setEvents((prev) => [...prev.slice(-199), data])
        onEventRef.current?.(data)
      } catch {
        /* ignore malformed frames */
      }
    }
    ws.onclose = () => {
      setConnected(false)
      scheduleReconnect()
    }
    ws.onerror = () => ws.close()
  }, [])

  const scheduleReconnect = useCallback(() => {
    const delay = Math.min(1000 * 2 ** retryRef.current, 10000)
    retryRef.current += 1
    setTimeout(() => connect(), delay)
  }, [connect])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  return { events, connected }
}
