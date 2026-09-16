/**
 * useScheduleGuard
 *
 * Polls the backend schedule + special dates every minute.
 * - Holidays (no from/to): auto-logout immediately
 * - Half-days / special hours: auto-logout once time passes the "to" window
 * - Normal days: auto-logout outside the configured working hours
 *
 * Admins are never auto-logged-out.
 */
import { useEffect, useRef } from 'react'
import { toast } from '../lib/toast'

const RAW_API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'
const API_URL = RAW_API_URL.replace(/\/$/, '').endsWith('/api')
  ? RAW_API_URL.replace(/\/$/, '')
  : `${RAW_API_URL.replace(/\/$/, '')}/api`

type DaySchedule = { enabled: boolean; from: string; to: string }
type WeekdayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
type Schedule = Record<WeekdayKey, DaySchedule>
type SpecialDate = {
  id: string
  date: string          // "YYYY-MM-DD" or "MM-DD"
  from: string | null
  to: string | null
  description: string
  section: 'recurrent' | 'non-recurrent'
}

const DAYS: WeekdayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function getNowParts() {
  const now = new Date()
  const dayKey = DAYS[now.getDay()]
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const hhmm = `${hh}:${min}`
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const todayFull = `${yyyy}-${mm}-${dd}` // "2026-03-24"
  const todayMmDd = `${mm}-${dd}`          // "03-24"
  return { dayKey, hhmm, todayFull, todayMmDd }
}

function findSpecialToday(specialDates: SpecialDate[], todayFull: string, todayMmDd: string): SpecialDate | undefined {
  return specialDates.find((sd) => {
    if (sd.section === 'non-recurrent') return sd.date === todayFull
    const storedMmDd = sd.date.length === 10 ? sd.date.slice(5) : sd.date
    return storedMmDd === todayMmDd
  })
}

/** Returns true if the user should currently be allowed in */
function isAllowed(schedule: Schedule, specialDates: SpecialDate[]): boolean {
  const { dayKey, hhmm, todayFull, todayMmDd } = getNowParts()

  const specialToday = findSpecialToday(specialDates, todayFull, todayMmDd)

  if (specialToday) {
    // Holiday — no working hours at all
    if (!specialToday.from || !specialToday.to) return false
    // Special hours window
    return hhmm >= specialToday.from && hhmm < specialToday.to
  }

  // Normal schedule
  const sched = schedule[dayKey]
  if (!sched?.enabled) return false
  return hhmm >= sched.from && hhmm < sched.to
}

async function fetchSettings(): Promise<{ schedule: Schedule | null; specialDates: SpecialDate[] }> {
  try {
    const [schedRes, specialRes] = await Promise.all([
      fetch(`${API_URL}/settings/schedule`),
      fetch(`${API_URL}/settings/special-dates`),
    ])
    const schedData = schedRes.ok ? await schedRes.json() : null
    const specialData = specialRes.ok ? await specialRes.json() : null
    return {
      schedule: schedData?.defaultSchedule ?? null,
      specialDates: specialData?.specialDates ?? [],
    }
  } catch {
    return { schedule: null, specialDates: [] }
  }
}

export function useScheduleGuard(role: string | undefined, onLogout: () => void) {
  const onLogoutRef = useRef(onLogout)
  useEffect(() => {
    onLogoutRef.current = onLogout
  }, [onLogout])

  useEffect(() => {
    // Admins are exempt
    if (!role || role === 'admin' || role === 'superadmin') return

    let cancelled = false

    async function check() {
      if (cancelled) return
      const { schedule, specialDates } = await fetchSettings()
      if (cancelled) return

      // If we can't reach the API, do nothing (fail-open)
      if (!schedule) return

      if (!isAllowed(schedule, specialDates)) {
        toast.error('Your session has ended because office hours are over. You have been logged out.')
        onLogoutRef.current()
      }
    }

    // Check immediately on mount, then every 60 seconds
    check()
    const interval = setInterval(check, 60_000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [role])
}

