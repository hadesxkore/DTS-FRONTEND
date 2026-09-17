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
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const todayFull = `${yyyy}-${mm}-${dd}`
  const todayMmDd = `${mm}-${dd}`
  return { dayKey, currentMinutes, todayFull, todayMmDd }
}

function parseTimeToMinutes(rawStr: string | null | undefined, isEndTime = false, referenceFromMinutes = 0): number | null {
  if (!rawStr || typeof rawStr !== 'string') return null
  const str = rawStr.trim().toUpperCase()
  if (!str) return null

  const isPM = str.includes('PM')
  const isAM = str.includes('AM')
  const cleanStr = str.replace(/[^\d:]/g, '')

  const parts = cleanStr.split(':')
  if (!parts[0]) return null
  let hours = parseInt(parts[0], 10)
  let minutes = parts.length > 1 ? parseInt(parts[1], 10) : 0

  if (isNaN(hours)) return null
  if (isNaN(minutes)) minutes = 0

  if (isPM && hours < 12) hours += 12
  if (isAM && hours === 12) hours = 0

  let total = hours * 60 + minutes

  // Handle case where user entered "5:00" or "05:00" instead of "17:00" for 5 PM
  if (isEndTime && referenceFromMinutes > 0 && total <= referenceFromMinutes && hours < 12) {
    total += 720
  }

  return total
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
  const { dayKey, currentMinutes, todayFull, todayMmDd } = getNowParts()

  const specialToday = findSpecialToday(specialDates, todayFull, todayMmDd)

  if (specialToday) {
    // Holiday — no working hours at all
    if (!specialToday.from || !specialToday.to) return false
    // Special hours window
    const specFromMins = parseTimeToMinutes(specialToday.from, false)
    const specToMins = parseTimeToMinutes(specialToday.to, true, specFromMins ?? 0)
    if (specFromMins !== null && specToMins !== null) {
      return currentMinutes >= specFromMins && currentMinutes < specToMins
    }
    return false
  }

  // Normal schedule
  const sched = schedule[dayKey]
  if (!sched?.enabled) return false

  const fromMins = parseTimeToMinutes(sched.from, false)
  const toMins = parseTimeToMinutes(sched.to, true, fromMins ?? 0)

  if (fromMins !== null && toMins !== null) {
    return currentMinutes >= fromMins && currentMinutes < toMins
  }

  return true
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

