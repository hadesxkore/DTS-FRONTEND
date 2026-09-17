/**
 * useScheduleGuard
 *
 * 1. Fetches schedule + special dates on mount using Asia/Manila timezone.
 * 2. Immediately checks if the user is allowed. If not → logout now.
 * 3. If allowed, calculates the EXACT ms until the schedule window closes in Asia/Manila time
 *    and sets a precise setTimeout → fires and logs the user out right on time.
 * 4. Polls every 10 seconds as a fallback.
 *
 * Admins (admin / superadmin) are exempt from schedule logout.
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

function getPhilippineNowParts() {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const map: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value
  }

  const dayKey = String(map.weekday || '').toLowerCase() as WeekdayKey

  let hour = parseInt(map.hour, 10)
  if (hour === 24) hour = 0
  const minute = parseInt(map.minute, 10)
  const second = parseInt(map.second, 10)

  const currentMinutes = hour * 60 + minute
  const currentSecondsInDay = hour * 3600 + minute * 60 + second

  const yyyy = map.year
  const mm = map.month
  const dd = map.day
  const todayFull = `${yyyy}-${mm}-${dd}`
  const todayMmDd = `${mm}-${dd}`

  return { dayKey, hour, minute, second, currentMinutes, currentSecondsInDay, todayFull, todayMmDd }
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

function evaluateSchedule(
  schedule: Schedule,
  specialDates: SpecialDate[]
): { allowed: boolean; msUntilEnd: number | null } {
  const { dayKey, currentMinutes, currentSecondsInDay, todayFull, todayMmDd } = getPhilippineNowParts()

  const specialToday = findSpecialToday(specialDates, todayFull, todayMmDd)

  if (specialToday) {
    if (!specialToday.from || !specialToday.to) return { allowed: false, msUntilEnd: null }

    const specFromMins = parseTimeToMinutes(specialToday.from, false)
    const specToMins = parseTimeToMinutes(specialToday.to, true, specFromMins ?? 0)

    if (specFromMins !== null && specToMins !== null) {
      const allowed = currentMinutes >= specFromMins && currentMinutes < specToMins
      if (!allowed) return { allowed: false, msUntilEnd: null }

      const endSecondsInDay = specToMins * 60
      const secondsRemaining = endSecondsInDay - currentSecondsInDay
      return { allowed: true, msUntilEnd: Math.max(secondsRemaining * 1000, 0) }
    }
    return { allowed: false, msUntilEnd: null }
  }

  // Normal schedule
  const sched = schedule[dayKey]
  if (!sched?.enabled) return { allowed: false, msUntilEnd: null }

  const fromMins = parseTimeToMinutes(sched.from, false)
  const toMins = parseTimeToMinutes(sched.to, true, fromMins ?? 0)

  if (fromMins !== null && toMins !== null) {
    const allowed = currentMinutes >= fromMins && currentMinutes < toMins
    if (!allowed) return { allowed: false, msUntilEnd: null }

    const endSecondsInDay = toMins * 60
    const secondsRemaining = endSecondsInDay - currentSecondsInDay
    return { allowed: true, msUntilEnd: Math.max(secondsRemaining * 1000, 0) }
  }

  return { allowed: true, msUntilEnd: null }
}

async function fetchSettings(): Promise<{ schedule: Schedule | null; specialDates: SpecialDate[] }> {
  try {
    const timestamp = Date.now()
    const [schedRes, specialRes] = await Promise.all([
      fetch(`${API_URL}/settings/schedule?_t=${timestamp}`, { cache: 'no-store' }),
      fetch(`${API_URL}/settings/special-dates?_t=${timestamp}`, { cache: 'no-store' }),
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

  const preciseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const normalizedRole = String(role || '').trim().toLowerCase()
    // Admins and Superadmins are exempt from schedule logout
    if (!normalizedRole || normalizedRole === 'admin' || normalizedRole === 'superadmin') return

    let cancelled = false

    function forceLogout() {
      if (cancelled) return
      toast.error('Your session has ended because office hours are over. You have been logged out.')
      onLogoutRef.current()
    }

    async function check() {
      if (cancelled) return

      const { schedule, specialDates } = await fetchSettings()
      if (cancelled) return

      if (!schedule) return

      const { allowed, msUntilEnd } = evaluateSchedule(schedule, specialDates)

      if (!allowed) {
        forceLogout()
        return
      }

      if (preciseTimerRef.current) {
        clearTimeout(preciseTimerRef.current)
        preciseTimerRef.current = null
      }

      if (msUntilEnd !== null && msUntilEnd > 0) {
        preciseTimerRef.current = setTimeout(() => {
          if (!cancelled) forceLogout()
        }, msUntilEnd + 500)
      }
    }

    check()
    const interval = setInterval(check, 10_000)

    return () => {
      cancelled = true
      clearInterval(interval)
      if (preciseTimerRef.current) {
        clearTimeout(preciseTimerRef.current)
        preciseTimerRef.current = null
      }
    }
  }, [role])
}
