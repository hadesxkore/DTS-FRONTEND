/**
 * apiFetch
 *
 * A thin wrapper around fetch() that:
 * 1. Attaches the JWT token from localStorage automatically
 * 2. On 401 or 403 (invalid/expired token), clears auth storage and
 *    fires a global "auth:logout" event so App.tsx can react.
 */

const RAW_API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'
const API_URL = RAW_API_URL.replace(/\/$/, '').endsWith('/api')
    ? RAW_API_URL.replace(/\/$/, '')
    : `${RAW_API_URL.replace(/\/$/, '')}/api`

export default API_URL

export async function apiFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')

    const headers = new Headers(init.headers)
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
    }

    const response = await fetch(input, { ...init, headers })

    if (response.status === 401 || response.status === 403) {
        // Token is missing, invalid, or expired — force logout
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        sessionStorage.removeItem('token')
        sessionStorage.removeItem('user')
        window.dispatchEvent(new CustomEvent('auth:logout'))
    }

    return response
}
