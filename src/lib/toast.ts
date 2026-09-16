type ToastVariant = "success" | "error" | "info"

type ToastEventDetail = {
  message: string
  variant: ToastVariant
  durationMs?: number
}

const EVENT_NAME = "app-toast"

function emit(detail: ToastEventDetail) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<ToastEventDetail>(EVENT_NAME, { detail }))
}

export const toast = {
  success(message: string, durationMs?: number) {
    emit({ message, variant: "success", durationMs })
  },
  error(message: string, durationMs?: number) {
    emit({ message, variant: "error", durationMs })
  },
  info(message: string, durationMs?: number) {
    emit({ message, variant: "info", durationMs })
  },
  _eventName: EVENT_NAME,
}
