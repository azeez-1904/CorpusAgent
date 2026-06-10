import axios from 'axios'

// Same-origin relative base: Vite proxies to FastAPI in dev; FastAPI serves
// the built app in production. Override with VITE_API if needed.
const baseURL = import.meta.env.VITE_API || ''

export const api = axios.create({ baseURL })

export async function uploadDocument({ file, title, version, date, sensitive }) {
  const form = new FormData()
  form.append('file', file)
  form.append('title', title)
  form.append('version', version)
  form.append('date', date || '')
  form.append('sensitive', sensitive ? 'true' : 'false')
  const { data } = await api.post('/upload', form)
  return data
}

export async function runQuery(query) {
  const { data } = await api.post('/query', { query })
  return data
}

export const getDocuments = () => api.get('/documents').then((r) => r.data)
export const getPersona = () => api.get('/persona').then((r) => r.data)
export const getAlerts = () => api.get('/alerts').then((r) => r.data)
export const markAlertSeen = (id) => api.post(`/alerts/${id}/seen`).then((r) => r.data)
export const getStatus = () => api.get('/status').then((r) => r.data)

export function wsURL() {
  if (import.meta.env.VITE_API) {
    return import.meta.env.VITE_API.replace(/^http/, 'ws') + '/ws'
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/ws`
}
