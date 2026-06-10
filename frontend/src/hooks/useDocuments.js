import { useCallback, useEffect, useState } from 'react'
import { getDocuments } from '../api'

/** Loads documents (grouped by title with version chains) and exposes a refresh. */
export function useDocuments() {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setDocuments(await getDocuments())
    } catch {
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { documents, loading, refresh }
}
