import { useEffect, useRef, useState } from "react"
import { toast as toastApi } from "../lib/toast"
import {
  isDesktopNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
} from "../lib/desktopNotification"

type ToastItem = {
  id: string
  message: string
  variant: "success" | "error" | "info"
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])
  const timeoutsRef = useRef<Record<string, number>>({})
  const dedupRef = useRef<Map<string, number>>(new Map())
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false)

  useEffect(() => {
    // Check if permission is still default (not yet prompted by user click)
    if (isDesktopNotificationSupported()) {
      const dismissed = sessionStorage.getItem("notif_prompt_dismissed")
      if (getNotificationPermission() === "default" && !dismissed) {
        setShowPermissionPrompt(true)
      }
    }

    function onToast(e: Event) {
      const ce = e as CustomEvent<{ message: string; variant: ToastItem["variant"]; durationMs?: number }>
      const detail = ce.detail
      if (!detail?.message) return

      // ── Deduplication ──────────────────────────────────────────────────────
      // Multiple page components can each have their own socket connection and
      // independently fire toast() for the same event. Suppress identical
      // message+variant combinations that arrive within a 2-second window.
      const dedupKey = `${detail.variant}::${detail.message}`
      const DEDUP_MS = 2000
      const lastSeen = dedupRef.current.get(dedupKey)
      if (lastSeen && Date.now() - lastSeen < DEDUP_MS) return
      dedupRef.current.set(dedupKey, Date.now())
      // Clean up old dedup entries every time we add one
      for (const [k, ts] of dedupRef.current.entries()) {
        if (Date.now() - ts > DEDUP_MS * 3) dedupRef.current.delete(k)
      }
      // ───────────────────────────────────────────────────────────────────────

      const id = uid()
      const duration = typeof detail.durationMs === "number" ? detail.durationMs : 4000

      const next: ToastItem = {
        id,
        message: detail.message,
        variant: detail.variant,
      }

      setItems((prev) => [...prev, next].slice(-5))

      const t = window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id))
        delete timeoutsRef.current[id]
      }, Math.max(1000, duration))

      timeoutsRef.current[id] = t
    }

    window.addEventListener(toastApi._eventName, onToast)
    return () => {
      window.removeEventListener(toastApi._eventName, onToast)
      for (const id of Object.keys(timeoutsRef.current)) {
        window.clearTimeout(timeoutsRef.current[id])
      }
      timeoutsRef.current = {}
    }
  }, [])

  function dismiss(id: string) {
    const t = timeoutsRef.current[id]
    if (t) {
      window.clearTimeout(t)
      delete timeoutsRef.current[id]
    }
    setItems((prev) => prev.filter((x) => x.id !== id))
  }

  async function handleEnableNotifications() {
    await requestNotificationPermission()
    setShowPermissionPrompt(false)
  }

  function handleDismissPermission() {
    sessionStorage.setItem("notif_prompt_dismissed", "true")
    setShowPermissionPrompt(false)
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-100 flex w-full max-w-sm flex-col gap-2">
      {/* Desktop Notification Permission Prompt Banner */}
      {showPermissionPrompt && (
        <div className="pointer-events-auto flex flex-col gap-2.5 rounded-2xl border border-blue-200 bg-linear-to-br from-blue-500 to-indigo-600 p-4 text-white shadow-xl animate-in fade-in slide-in-from-top-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔔</span>
              <h4 className="text-sm font-semibold tracking-tight">Enable Desktop Notifications</h4>
            </div>
            <button
              type="button"
              onClick={handleDismissPermission}
              className="inline-flex size-6 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-blue-100 leading-relaxed">
            Get instant desktop sound alerts when new requests are submitted, updated, or returned.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleEnableNotifications}
              className="flex-1 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 active:scale-95"
            >
              Enable Notifications
            </button>
            <button
              type="button"
              onClick={handleDismissPermission}
              className="rounded-xl px-2.5 py-1.5 text-xs font-medium text-blue-200 hover:text-white transition"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* Toast Items */}
      {items.map((t) => {
        const variantClass =
          t.variant === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : t.variant === "error"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-slate-200 bg-white text-slate-900"

        const icon = t.variant === "success" ? "✓" : t.variant === "error" ? "!" : "i"

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${variantClass}`}
            role="status"
          >
            <div className="grid size-7 flex-none place-items-center rounded-full border border-current/20">
              <span className="text-sm font-bold leading-none">{icon}</span>
            </div>
            <div className="min-w-0 flex-1 text-sm leading-snug">{t.message}</div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-mr-1 -mt-1 inline-flex size-7 items-center justify-center rounded-md text-current/70 transition hover:bg-black/5 hover:text-current"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
