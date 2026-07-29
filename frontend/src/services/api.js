import axios from 'axios'

// All requests go through the Vite dev proxy → /api/* → backend
const api = axios.create({ timeout: 120_000 })

/**
 * Parse an Axios error into a safe, user-facing message.
 * Never exposes status codes, server internals, or raw JSON.
 * @param {unknown} err
 * @returns {string}
 */
function parseApiError(err) {
  if (err?.response?.data?.message) return err.response.data.message
  if (err?.code === 'ERR_NETWORK' || err?.message?.includes('Network Error'))
    return 'Cannot reach the server. Make sure the backend is running on port 3000.'
  if (err?.code === 'ECONNABORTED') return 'The request timed out. Please try again.'
  return 'Something went wrong. Please try again.'
}

/** Fetch guest usage + limit from the server. */
export async function getGuestStatus() {
  try {
    const response = await api.get('/api/legal/guest-status')
    return response.data
  } catch (err) {
    throw new Error(parseApiError(err))
  }
}

/**
 * Ask a legal question or send a casual message.
 * @param {string} question
 * @param {{ token?: string }} opts
 * @returns {Promise<object>} Server response data
 */
export async function askLegalQuestion(question, opts = {}) {
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`

    const response = await api.post(
      '/api/legal/ask',
      { question },
      { headers }
    )
    return response.data
  } catch (err) {
    throw new Error(parseApiError(err))
  }
}

export default api
