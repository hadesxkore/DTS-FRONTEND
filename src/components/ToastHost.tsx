import { useEffect, useRef, useState } from "react"
import { toast as toastApi } from "../lib/toast"
import {
  isDesktopNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
} from "../lib/desktopNotification"
import { CheckCircle2, AlertCircle, Info, X, Bell } from "lucide-react"

type ToastItem = {
  id: string
  message: string
  variant: "success" | "error" | "info"
  durationMs: number
  createdAt: number
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])
  const timeoutsRef = useRef<Record<string, number>>({})
  const dedupRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    // ── Auto-trigger Native Browser Notification Prompt ───────────────────
    if (isDesktopNotificationSupported() && getNotificationPermission() === "default") {
      void requestNotificationPermission()

      const triggerNativePrompt = () => {
        if (getNotificationPermission() === "default") {
          void requestNotificationPermission()
        }
      }

      window.addEventListener("click", triggerNativePrompt, { once: true })
      window.addEventListener("keydown", triggerNativePrompt, { once: true })
      window.addEventListener("focusin", triggerNativePrompt, { once: true })

      return () => {
        window.removeEventListener("click", triggerNativePrompt)
        window.removeEventListener("keydown", triggerNativePrompt)
        window.removeEventListener("focusin", triggerNativePrompt)
      }
    }
  }, [])

  useEffect(() => {
    function onToast(e: Event) {
      const ce = e as CustomEvent<{ message: string; variant: ToastItem["variant"]; durationMs?: number }>
      const detail = ce.detail
      if (!detail?.message) return

      // ── Deduplication ──────────────────────────────────────────────────────
      const dedupKey = `${detail.variant}::${detail.message}`
      const DEDUP_MS = 2000
      const lastSeen = dedupRef.current.get(dedupKey)
      if (lastSeen && Date.now() - lastSeen < DEDUP_MS) return
      dedupRef.current.set(dedupKey, Date.now())

      for (const [k, ts] of dedupRef.current.entries()) {
        if (Date.now() - ts > DEDUP_MS * 3) dedupRef.current.delete(k)
      }

      const id = uid()
      const duration = typeof detail.durationMs === "number" ? detail.durationMs : 4500

      const next: ToastItem = {
        id,
        message: detail.message,
        variant: detail.variant,
        durationMs: duration,
        createdAt: Date.now(),
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

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex w-full max-w-sm flex-col gap-2.5 sm:right-6 sm:top-6">
      {items.map((t) => {
        const isSuccess = t.variant === "success"
        const isError = t.variant === "error"

        const badgeColor = isSuccess
          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
          : isError
            ? "bg-rose-50 text-rose-700 ring-rose-600/20"
            : "bg-blue-50 text-blue-700 ring-blue-600/20"

        const iconBg = isSuccess
          ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
          : isError
            ? "bg-rose-500/10 text-rose-600 ring-rose-500/20"
            : "bg-blue-500/10 text-blue-600 ring-blue-500/20"

        const progressBg = isSuccess
          ? "bg-emerald-500"
          : isError
            ? "bg-rose-500"
            : "bg-blue-500"

        const isReturnedNotif = isError && t.message.toLowerCase().includes('returned')
        const badgeText = isSuccess ? "Success" : isError ? (isReturnedNotif ? "Returned" : "System Alert") : "Notification"

        // Split message if it contains '•' dividers for clean formatted layout
        const parts = t.message.split(/\s*•\s*/).filter(Boolean)

        return (
          <div
            key={t.id}
            className="pointer-events-auto group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl transition-all duration-300 animate-toast-in"
            role="status"
          >
            <div className="flex items-start gap-3.5">
              {/* Icon Container */}
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-105 ${iconBg}`}
              >
                {isSuccess ? (
                  <CheckCircle2 className="size-5" />
                ) : isError ? (
                  <AlertCircle className="size-5" />
                ) : (
                  <Bell className="size-5" />
                )}
              </div>

              {/* Message Details */}
              <div className="min-w-0 flex-1 space-y-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${badgeColor}`}
                  >
                    {badgeText}
                  </span>
                </div>

                {parts.length > 1 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-bold tracking-tight text-slate-900">{parts[0]}</p>
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                      {parts.slice(1).map((part, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded-md bg-slate-100/80 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                        >
                          {part}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-semibold leading-relaxed text-slate-800">{t.message}</p>
                )}
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none"
                aria-label="Dismiss notification"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Bottom Progress Timer Line */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
              <div
                className={`h-full ${progressBg} transition-all duration-100 ease-linear`}
                style={{
                  animation: `toast-progress ${t.durationMs}ms linear forwards`,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
