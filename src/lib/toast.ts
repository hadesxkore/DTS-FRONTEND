export type ToastVariant = "success" | "error" | "info" | "warning"

export type ToastOptions = {
  durationMs?: number
  persistent?: boolean
  title?: string
}

export type ToastEventDetail = {
  id?: string
  message: string
  variant: ToastVariant
  durationMs?: number
  persistent?: boolean
  title?: string
}

const EVENT_NAME = "app-toast"
const DISMISS_EVENT_NAME = "app-toast-dismiss"
const CLEAR_EVENT_NAME = "app-toast-clear"

function parseOptions(durationOrOptions?: number | ToastOptions): ToastOptions {
  if (typeof durationOrOptions === "number") {
    return { durationMs: durationOrOptions }
  }
  return durationOrOptions || {}
}

function emit(detail: ToastEventDetail) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<ToastEventDetail>(EVENT_NAME, { detail }))
}

export const toast = {
  success(message: string, durationOrOptions?: number | ToastOptions) {
    const opts = parseOptions(durationOrOptions)
    emit({ message, variant: "success", ...opts })
  },
  error(message: string, durationOrOptions?: number | ToastOptions) {
    const opts = parseOptions(durationOrOptions)
    emit({ message, variant: "error", ...opts })
  },
  info(message: string, durationOrOptions?: number | ToastOptions) {
    const opts = parseOptions(durationOrOptions)
    emit({ message, variant: "info", ...opts })
  },
  warning(message: string, durationOrOptions?: number | ToastOptions) {
    const opts = parseOptions(durationOrOptions)
    emit({ message, variant: "warning", ...opts })
  },
  // Explicit persistent notification method (stays until dismissed by user)
  persistent(message: string, variant: ToastVariant = "info", options?: Omit<ToastOptions, "persistent">) {
    emit({ message, variant, persistent: true, ...options })
  },
  dismiss(id: string) {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent(DISMISS_EVENT_NAME, { detail: { id } }))
  },
  clear() {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent(CLEAR_EVENT_NAME))
  },
  _eventName: EVENT_NAME,
  _dismissEventName: DISMISS_EVENT_NAME,
  _clearEventName: CLEAR_EVENT_NAME,
}
