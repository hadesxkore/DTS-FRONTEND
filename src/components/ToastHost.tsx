import { useEffect, useRef, useState } from "react"
import { toast as toastApi, type ToastVariant } from "../lib/toast"
import {
  isDesktopNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
} from "../lib/desktopNotification"
import { CheckCircle2, AlertCircle, AlertTriangle, X, Bell, Trash2, Layers } from "lucide-react"

type ToastItem = {
  id: string
  title?: string
  message: string
  variant: ToastVariant
  createdAt: number
  isDismissing?: boolean
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000)
  if (diffSec < 5) return "Just now"
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  return `${Math.floor(diffMin / 60)}h ago`
}

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])
  const [isHovered, setIsHovered] = useState(false)
  const [, setTick] = useState(0)
  const dedupRef = useRef<Map<string, number>>(new Map())

  // Periodic timer for updating relative timestamps
  useEffect(() => {
    if (items.length === 0) return
    const interval = setInterval(() => {
      setTick((t) => t + 1)
    }, 5000)
    return () => clearInterval(interval)
  }, [items.length])

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
      const ce = e as CustomEvent<{
        id?: string
        title?: string
        message: string
        variant: ToastVariant
      }>
      const detail = ce.detail
      if (!detail?.message) return

      // ── Deduplication (within 2 seconds) ──────────────────────────────────
      const dedupKey = `${detail.variant}::${detail.title || ""}::${detail.message}`
      const DEDUP_MS = 2000
      const lastSeen = dedupRef.current.get(dedupKey)
      if (lastSeen && Date.now() - lastSeen < DEDUP_MS) return
      dedupRef.current.set(dedupKey, Date.now())

      for (const [k, ts] of dedupRef.current.entries()) {
        if (Date.now() - ts > DEDUP_MS * 3) dedupRef.current.delete(k)
      }

      const id = detail.id || uid()

      const next: ToastItem = {
        id,
        title: detail.title,
        message: detail.message,
        variant: detail.variant || "info",
        createdAt: Date.now(),
      }

      // Prepend newest item to the front of the stack
      setItems((prev) => {
        const filtered = prev.filter((x) => x.id !== id)
        return [next, ...filtered].slice(0, 10)
      })
    }

    function onDismiss(e: Event) {
      const ce = e as CustomEvent<{ id?: string }>
      if (ce.detail?.id) {
        triggerDismiss(ce.detail.id)
      }
    }

    function onClear() {
      clearAll()
    }

    window.addEventListener(toastApi._eventName, onToast)
    window.addEventListener(toastApi._dismissEventName, onDismiss)
    window.addEventListener(toastApi._clearEventName, onClear)

    return () => {
      window.removeEventListener(toastApi._eventName, onToast)
      window.removeEventListener(toastApi._dismissEventName, onDismiss)
      window.removeEventListener(toastApi._clearEventName, onClear)
    }
  }, [])

  function triggerDismiss(id: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isDismissing: true } : item))
    )
    setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id))
    }, 220)
  }

  function clearAll() {
    setItems((prev) => prev.map((item) => ({ ...item, isDismissing: true })))
    setTimeout(() => {
      setItems([])
    }, 220)
  }

  if (items.length === 0) return null

  const totalCount = items.length

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[9999] flex w-full max-w-sm flex-col items-end sm:right-6 sm:top-6"
      aria-live="polite"
    >
      {/* Container for the Stack */}
      <div
        className="pointer-events-auto relative w-full pt-8 pb-2 transition-all duration-300"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Top Control Bar when multiple items exist */}
        {totalCount > 1 && (
          <div className="mb-2 flex items-center justify-between px-1 transition-all">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-0.5 text-[11px] font-medium text-white shadow-sm backdrop-blur-md">
              <Layers className="size-3 text-blue-400" />
              <span>
                {totalCount} notification{totalCount > 1 ? "s" : ""}
              </span>
              <span className="text-[10px] text-slate-300">
                ({isHovered ? "expanded" : "hover to expand"})
              </span>
            </div>

            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 rounded-full bg-white/90 hover:bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 shadow-sm border border-slate-200/80 backdrop-blur-md transition active:scale-95"
              title="Dismiss all notifications"
            >
              <Trash2 className="size-3 text-rose-500" />
              <span>Clear all</span>
            </button>
          </div>
        )}

        {/* The Stacked Cards Area */}
        <div
          className={`relative w-full transition-all duration-300 ease-out ${
            isHovered && totalCount > 1
              ? "flex flex-col gap-2.5 pt-0"
              : "h-[160px]"
          }`}
        >
          {items.map((t, index) => {
            const isSuccess = t.variant === "success"
            const isError = t.variant === "error"
            const isWarning = t.variant === "warning"

            // Colors
            const accentBg = isSuccess
              ? "bg-emerald-500"
              : isError
                ? "bg-rose-500"
                : isWarning
                  ? "bg-amber-500"
                  : "bg-blue-500"

            const badgeColor = isSuccess
              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/25"
              : isError
                ? "bg-rose-50 text-rose-700 ring-rose-600/25"
                : isWarning
                  ? "bg-amber-50 text-amber-700 ring-amber-600/25"
                  : "bg-blue-50 text-blue-700 ring-blue-600/25"

            const iconBg = isSuccess
              ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25"
              : isError
                ? "bg-rose-500/10 text-rose-600 ring-rose-500/25"
                : isWarning
                  ? "bg-amber-500/10 text-amber-600 ring-amber-500/25"
                  : "bg-blue-500/10 text-blue-600 ring-blue-500/25"

            const isReturnedNotif = isError && t.message.toLowerCase().includes("returned")
            const defaultBadgeText = isSuccess
              ? "SUCCESS"
              : isError
                ? isReturnedNotif
                  ? "RETURNED"
                  : "ACTION REQUIRED"
                : isWarning
                  ? "WARNING"
                  : "NOTIFICATION"

            const badgeText = t.title ? t.title.toUpperCase() : defaultBadgeText
            const parts = t.message.split(/\s*•\s*/).filter(Boolean)

            // Stack calculations when collapsed
            // Front card: index 0 (y: 0, scale: 1, zIndex: 30)
            // 2nd card: index 1 (y: -12px, scale: 0.95, zIndex: 20)
            // 3rd card: index 2 (y: -24px, scale: 0.90, zIndex: 10)
            // 4th+ card: index 3 (y: -34px, scale: 0.85, zIndex: 5)
            const maxVisibleStack = 4
            const isBeyondStack = index >= maxVisibleStack

            let translateY = 0
            let scale = 1
            let opacity = 1
            let zIndex = 30 - index

            if (!isHovered) {
              if (index === 0) {
                translateY = 0
                scale = 1
                opacity = 1
                zIndex = 30
              } else if (index === 1) {
                translateY = -12
                scale = 0.95
                opacity = 0.95
                zIndex = 25
              } else if (index === 2) {
                translateY = -24
                scale = 0.90
                opacity = 0.90
                zIndex = 20
              } else if (index === 3) {
                translateY = -34
                scale = 0.85
                opacity = 0.85
                zIndex = 15
              } else {
                translateY = -42
                scale = 0.80
                opacity = 0
                zIndex = 10
              }
            } else {
              // Expanded view when hovering
              translateY = 0
              scale = 1
              opacity = 1
              zIndex = 30 - index
            }

            const style: React.CSSProperties = isHovered
              ? {
                  position: "relative",
                  transform: t.isDismissing ? "translateX(120%) scale(0.9)" : "none",
                  opacity: t.isDismissing ? 0 : 1,
                  zIndex,
                }
              : {
                  position: index === 0 ? "relative" : "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: t.isDismissing
                    ? "translateX(120%) scale(0.9)"
                    : `translateY(${translateY}px) scale(${scale})`,
                  transformOrigin: "top center",
                  opacity: t.isDismissing ? 0 : isBeyondStack ? 0 : opacity,
                  zIndex,
                  pointerEvents: index === 0 ? "auto" : "none",
                }

            return (
              <div
                key={t.id}
                style={style}
                className={`group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl transition-all duration-300 ease-out`}
                role="status"
              >
                {/* Top Tab Colored Accent Bar (creates the stacked tabs effect) */}
                <div className={`absolute top-0 left-0 right-0 h-2.5 ${accentBg}`} />

                <div className="flex items-start gap-3.5 pt-1">
                  {/* Icon */}
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-105 ${iconBg}`}
                  >
                    {isSuccess ? (
                      <CheckCircle2 className="size-5" />
                    ) : isError ? (
                      <AlertCircle className="size-5" />
                    ) : isWarning ? (
                      <AlertTriangle className="size-5" />
                    ) : (
                      <Bell className="size-5" />
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider ring-1 ring-inset ${badgeColor}`}
                      >
                        {badgeText}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400">
                        {formatRelativeTime(t.createdAt)}
                      </span>
                    </div>

                    {parts.length > 1 ? (
                      <div className="space-y-1">
                        <p className="text-xs font-bold tracking-tight text-slate-900 leading-snug">
                          {parts[0]}
                        </p>
                        <div className="flex flex-wrap gap-1 text-[11px] text-slate-600">
                          {parts.slice(1).map((part, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                            >
                              {part}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs font-semibold leading-relaxed text-slate-800">
                        {t.message}
                      </p>
                    )}
                  </div>

                  {/* Top-right 'X' Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      triggerDismiss(t.id)
                    }}
                    className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition focus:outline-none"
                    aria-label="Close notification"
                    title="Close"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
