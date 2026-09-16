import { Download, FileText, Search, Plus, History, RotateCcw } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "../../lib/toast"
import NewRequestModal, { type NewRequestPayload } from "../components/NewRequestModal"
import ObrTemplatePreview, { type ObrTemplateModel } from "../../components/ObrTemplatePreview"
import ObrTemplatePdf from "../../components/ObrTemplatePdf"
import { pdf } from "@react-pdf/renderer"
import PrTemplatePreview from "../../components/PrTemplatePreview"
import DvTemplatePreview, { type DvTemplateModel } from "../../components/DvTemplatePreview"
import PoTemplatePreview, { type PoTemplateModel, type PoItem } from "../../components/PoTemplatePreview"
import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"
import { useDocumentSocket } from "../../hooks/useSocket"
import PreValidationTab from "../components/tabs/PreValidationTab"
import OngoingTab from "../components/tabs/OngoingTab"
import CompletedTab from "../components/tabs/CompletedTab"
import DiscontinuedTab from "../components/tabs/DiscontinuedTab"
import { formatLogRemarks } from "../../utils/formatLogRemarks"
import RoutingSlipModal from "../components/RoutingSlipModal"
import { getSubDocAmount, getMainDocSupplierInfo } from "../types/documentTypes"

type TabType = "pre-validation" | "ongoing" | "completed" | "discontinued"

type DocumentParticular = {
  label: string
  color: string
}

type DocumentLog = {
  label: string
  color: string
  byOffice?: string
  byUser?: string
  createdAt?: string
}

type DocumentRow = {
  id: string
  trackingNo: string
  timestamp: string
  createdBy: string
  office?: string
  fund?: string
  section?: string
  fpp?: string
  department?: string
  contactNumber?: string
  responsibilityCenter?: string
  accountCode?: string
  email?: string
  requestedByName?: string
  requestedByDesignation?: string
  cashAvailabilityName?: string
  cashAvailabilityDesignation?: string
  approvedByName?: string
  approvedByDesignation?: string
  certifiedAName?: string
  certifiedAPosition?: string
  certifiedBName?: string
  certifiedBPosition?: string
  driveLink?: string
  prItems?: Array<{
    itemNo: string
    unit: string
    description: string
    quantity: string
    unitCost: string
    totalCost: string
  }>
  purpose: string
  notes?: string
  particulars: DocumentParticular[]
  amount: string
  supplierAmount?: string
  supplier?: string
  logs: DocumentLog[]
  action: string
  status: string
  prNo?: string
  obrNo?: string
  gsoRoutingSlip?: string
  returnToApprovalsRequested?: boolean
  returnToApprovalsReason?: string
  subDocuments?: Array<{
    trackingNo: string
    purpose: string
    amount: string
    supplier?: string
    status: string
    logs: DocumentLog[]
  }>
}

type PreviewType = "PR" | "OBR" | "DV" | "PO"

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

function inferCurrentLocation(
  statusRaw: string,
  officeRaw: string,
  logs?: Array<{ label?: string }> | null
) {
  const s = String(statusRaw || '').trim().toLowerCase()
  if (s === 'in-budget') return 'BUDGET'
  if (s === 'in-pto') return 'PTO'
  if (s === 'pending-gso') return 'GSO'
  if (s === 'pending-bac') return 'BAC'
  if (s === 'completed' || s === 'approved') return 'COMPLETED'

  // Scan logs for the last transfer destination
  const rawLogs = Array.isArray(logs) ? logs : []
  const prefix = 'transferred to'
  for (let i = rawLogs.length - 1; i >= 0; i--) {
    const label = String(rawLogs[i]?.label || '').trim().toLowerCase()
    if (label.startsWith(prefix)) {
      const after = label.slice(prefix.length).trim()
      const match = after.match(/^([^(:]+)/)
      const dest = String(match ? match[1] : after).trim().toUpperCase()
      if (dest) return dest
    }
    const legacy = label.match(/approved[:\s]+transferred\s+to\s+([^(:]+)/i)
    if (legacy) {
      const dest = String(legacy[1]).trim().toUpperCase()
      if (dest) return dest
    }
  }

  return String(officeRaw || '').trim() || '-'
}

type UserDocumentsProps = {
  showAll?: boolean
  onBadgeCountChange?: (count: number) => void
  hideReviewLogsButton?: boolean
}

export default function UserDocuments({ showAll = false, onBadgeCountChange, hideReviewLogsButton }: UserDocumentsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("pre-validation")
  const [searchQuery, setSearchQuery] = useState("")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [requestReturnDoc, setRequestReturnDoc] = useState<DocumentRow | null>(null)
  const [requestReturnReason, setRequestReturnReason] = useState("")
  const [requestReturnBusy, setRequestReturnBusy] = useState(false)
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null)
  const [preview, setPreview] = useState<{ type: PreviewType; doc: DocumentRow } | null>(null)
  const [prActivePage, setPrActivePage] = useState(0)
  const [logsModalDoc, setLogsModalDoc] = useState<DocumentRow | null>(null)
  const [logsPreviewDoc, setLogsPreviewDoc] = useState<DocumentRow | null>(null)
  const [logsPreviewPage, setLogsPreviewPage] = useState(0)
  const [logsModalPage, setLogsModalPage] = useState(0)
  const [historyModalDoc, setHistoryModalDoc] = useState<DocumentRow | null>(null)
  const [historyTab, setHistoryTab] = useState<"prevalidation" | "transactions" | "subdocuments">("transactions")
  const [transferModalDoc, setTransferModalDoc] = useState<DocumentRow | null>(null)
  const [transferModalDest, setTransferModalDest] = useState<"BUDGET" | "PTO">("BUDGET")
  const [updateSuccess, setUpdateSuccess] = useState<{ trackingNo: string } | null>(null)
  const [transferSuccess, setTransferSuccess] = useState<{ trackingNo: string; dest: "BUDGET" | "PTO" } | null>(null)
  const [remarkText, setRemarkText] = useState("")
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [prPdfBusy, setPrPdfBusy] = useState(false)
  const [obrPdfBusy, setObrPdfBusy] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(timer)
  }, [])

  const [transferTasksByOffice, setTransferTasksByOffice] = useState<
    Record<
      string,
      Array<{ taskId?: number; task?: string; duration?: string; status?: string }>
    >
  >({})

  const [cancelConfirmDoc, setCancelConfirmDoc] = useState<DocumentRow | null>(null)
  const [returnedModalOpen, setReturnedModalOpen] = useState(false)
  const [returnedReceiveConfirmDoc, setReturnedReceiveConfirmDoc] = useState<DocumentRow | null>(null)
  const [reprocessConfirmDoc, setReprocessConfirmDoc] = useState<DocumentRow | null>(null)
  const [reprocessConfirmSubDoc, setReprocessConfirmSubDoc] = useState<{ parentDoc: DocumentRow; index: number; subDoc: any } | null>(null)
  const [reprocessDest, setReprocessDest] = useState<string>("")
  const [reprocessTask, setReprocessTask] = useState<string>("")
  const [routingSlipDoc, setRoutingSlipDoc] = useState<DocumentRow | null>(null)

  const [reviewLogsOpen, setReviewLogsOpen] = useState(false)
  const [reviewLogsLastRead, setReviewLogsLastRead] = useState(0)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [editingSubDoc, setEditingSubDoc] = useState<{ parentId: string; index: number; trackingNo: string; purpose: string; amount: string; supplier?: string } | null>(null)
  const [editingMainDoc, setEditingMainDoc] = useState<{ id: string; trackingNo: string; supplier: string; supplierAmount: string } | null>(null)
  const [subDocActionBusy, setSubDocActionBusy] = useState(false)
  const [mainDocActionBusy, setMainDocActionBusy] = useState(false)
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [hasDraft, setHasDraft] = useState(false)

  const checkDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem("user")
      const parsed = raw ? (JSON.parse(raw) as { username?: string } | null) : null
      const uname = String(parsed?.username || "").trim()
      const key = `new_request_draft:${uname || "_"}`
      const draft = localStorage.getItem(key)
      setHasDraft(!!draft)
    } catch {
      setHasDraft(false)
    }
  }, [])

  useEffect(() => {
    checkDraft()
    window.addEventListener("dts:draft_changed", checkDraft)
    window.addEventListener("storage", checkDraft)
    return () => {
      window.removeEventListener("dts:draft_changed", checkDraft)
      window.removeEventListener("storage", checkDraft)
    }
  }, [checkDraft])

  useEffect(() => {
    if (preview) {
      const updatedDoc = documents.find((d) => d.id === preview.doc.id)
      if (updatedDoc && updatedDoc !== preview.doc) {
        setPreview({ ...preview, doc: updatedDoc })
      }
    }
  }, [documents, preview])

  useEffect(() => {
    setLogsPreviewPage(0)
  }, [logsPreviewDoc?.id])

  useEffect(() => {
    setLogsModalPage(0)
  }, [logsModalDoc?.id])

  const [_loading, setLoading] = useState(false)
  const [_error, setError] = useState<string | null>(null)

  const autoRefreshInFlightRef = useRef(false)

  const userContext = useMemo(() => {
    try {
      const userRaw = localStorage.getItem("user")
      const parsedUser = userRaw
        ? (JSON.parse(userRaw) as { username?: string; fullName?: string; office?: string } | null)
        : null
      return {
        username: parsedUser?.username || "",
        fullName: parsedUser?.fullName || "",
        office: parsedUser?.office || "",
      }

    } catch {
      return { username: "", fullName: "", office: "" }
    }
  }, [])

  const prCaptureRef = useRef<HTMLDivElement | null>(null)
  const obrCaptureRef = useRef<HTMLDivElement | null>(null)
  const obrVisibleRef = useRef<HTMLDivElement | null>(null)

  const capturePrPreviewToPdf = async () => {
    const root = prCaptureRef.current
    if (!root) return

    try {
      setPrPdfBusy(true)

      // Open a blank tab synchronously to avoid popup blockers (we'll navigate it after PDF is ready)
      const previewTab = window.open("about:blank", "_blank")
      if (!previewTab) {
        window.alert('Please allow pop-ups to preview the PDF.')
        return
      }

      // Ensure layout is fully painted before capture
      await new Promise((r) => setTimeout(r, 50))

      const pages = Array.from(root.querySelectorAll<HTMLElement>(".print-page"))
      if (pages.length === 0) return

      // Letter size in points: 612 x 792
      const pdfDoc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" })

      for (let i = 0; i < pages.length; i++) {
        const el = pages[i]
        const canvas = await html2canvas(el, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          width: 816,
          height: 1056,
          onclone: (clonedDoc) => {
            clonedDoc.querySelectorAll('style').forEach((s) => {
              if (s.textContent) {
                s.textContent = s.textContent
                  .replace(/oklch\([^\)]+\)/gi, '#000000')
                  .replace(/oklab\([^\)]+\)/gi, '#000000')
                  .replace(/color\([^\)]+\)/gi, '#000000')
              }
            })
            clonedDoc.querySelectorAll('[style]').forEach((el) => {
              const styleAttr = el.getAttribute('style')
              if (styleAttr && /(oklch|oklab|color\()/i.test(styleAttr)) {
                el.setAttribute('style', styleAttr
                  .replace(/oklch\([^\)]+\)/gi, '#000000')
                  .replace(/oklab\([^\)]+\)/gi, '#000000')
                  .replace(/color\([^\)]+\)/gi, '#000000')
                )
              }
            })
          },
        })

        const imgData = canvas.toDataURL("image/png")
        const pageW = pdfDoc.internal.pageSize.getWidth()
        const pageH = pdfDoc.internal.pageSize.getHeight()

        if (i > 0) pdfDoc.addPage("letter", "portrait")
        pdfDoc.addImage(imgData, "PNG", 0, 0, pageW, pageH)
      }

      const blob = pdfDoc.output("blob")
      const url = URL.createObjectURL(blob)

      // 1) Navigate preview tab (if it was allowed)
      try {
        previewTab.location.href = url
        previewTab.addEventListener?.("beforeunload", () => URL.revokeObjectURL(url))
      } catch {
        URL.revokeObjectURL(url)
      }
    } finally {
      setPrPdfBusy(false)
    }
  }

  const captureObrPreviewToPdf = async () => {
    const root = obrVisibleRef.current || obrCaptureRef.current
    if (!root) return

    let previewTab: Window | null = null
    try {
      setObrPdfBusy(true)

      previewTab = window.open("about:blank", "_blank")
      if (!previewTab) {
        window.alert('Please allow pop-ups to preview the PDF.')
        return
      }

      await new Promise((r) => setTimeout(r, 150))

      const pageEl = root.querySelector<HTMLElement>(".print-page") || root.querySelector<HTMLElement>(".print-area") || (root.classList.contains("print-page") ? root : null) || (root.firstElementChild as HTMLElement) || root
      if (!pageEl) {
        if (previewTab) previewTab.close()
        return
      }

      const pdfDoc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" })

      const canvas = await html2canvas(pageEl, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: 816,
        height: 1056,
        windowWidth: 816,
        windowHeight: 1056,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        onclone: (clonedDoc) => {
          clonedDoc.querySelectorAll('style').forEach((s) => {
            if (s.textContent) {
              s.textContent = s.textContent
                .replace(/oklch\([^\)]+\)/gi, '#000000')
                .replace(/oklab\([^\)]+\)/gi, '#000000')
                .replace(/color\([^\)]+\)/gi, '#000000')
            }
          })
          clonedDoc.querySelectorAll('[style]').forEach((el) => {
            const styleAttr = el.getAttribute('style')
            if (styleAttr && /(oklch|oklab|color\()/i.test(styleAttr)) {
              el.setAttribute('style', styleAttr
                .replace(/oklch\([^\)]+\)/gi, '#000000')
                .replace(/oklab\([^\)]+\)/gi, '#000000')
                .replace(/color\([^\)]+\)/gi, '#000000')
              )
            }
          })
        },
      })

      const imgData = canvas.toDataURL("image/png")
      const pageW = pdfDoc.internal.pageSize.getWidth()
      const pageH = pdfDoc.internal.pageSize.getHeight()

      pdfDoc.addImage(imgData, "PNG", 0, 0, pageW, pageH)

      const blob = pdfDoc.output("blob")
      const url = URL.createObjectURL(blob)

      try {
        previewTab.location.href = url
        previewTab.addEventListener?.("beforeunload", () => URL.revokeObjectURL(url))
      } catch {
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error("Failed to generate OBR PDF", err)
      if (previewTab) previewTab.close()
    } finally {
      setObrPdfBusy(false)
    }
  }

  const [dvPdfBusy, setDvPdfBusy] = useState(false)
  const dvVisibleRef = useRef<HTMLDivElement | null>(null)
  const dvCaptureRef = useRef<HTMLDivElement | null>(null)

  const [poPdfBusy, setPoPdfBusy] = useState(false)
  const poVisibleRef = useRef<HTMLDivElement | null>(null)
  const poCaptureRef = useRef<HTMLDivElement | null>(null)

  const capturePoPreviewToPdf = async () => {
    const root = poVisibleRef.current || poCaptureRef.current
    if (!root) return

    let previewTab: Window | null = null
    try {
      setPoPdfBusy(true)
      previewTab = window.open("about:blank", "_blank")
      if (!previewTab) {
        window.alert("Please allow pop-ups to preview the PDF.")
        return
      }
      await new Promise((r) => setTimeout(r, 150))
      const pages = Array.from(root.querySelectorAll<HTMLElement>(".print-page"))
      if (pages.length === 0) {
        const singlePage = root.classList.contains("print-page") ? root : null
        if (singlePage) pages.push(singlePage)
      }
      if (pages.length === 0) {
        if (previewTab) previewTab.close()
        return
      }
      const pdfDoc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" })

      for (let i = 0; i < pages.length; i++) {
        const el = pages[i]
        const canvas = await html2canvas(el, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
          allowTaint: false,
          width: 816,
          height: 1056,
          windowWidth: 816,
          windowHeight: 1056,
          scrollX: 0,
          scrollY: 0,
          x: 0,
          y: 0,
          onclone: (clonedDoc) => {
            clonedDoc.querySelectorAll('style').forEach((s) => {
              if (s.textContent) {
                s.textContent = s.textContent
                  .replace(/oklch\([^\)]+\)/gi, '#000000')
                  .replace(/oklab\([^\)]+\)/gi, '#000000')
                  .replace(/color\([^\)]+\)/gi, '#000000')
              }
            })
            clonedDoc.querySelectorAll('[style]').forEach((elem) => {
              const styleAttr = elem.getAttribute('style')
              if (styleAttr && /(oklch|oklab|color\()/i.test(styleAttr)) {
                elem.setAttribute('style', styleAttr
                  .replace(/oklch\([^\)]+\)/gi, '#000000')
                  .replace(/oklab\([^\)]+\)/gi, '#000000')
                  .replace(/color\([^\)]+\)/gi, '#000000')
                )
              }
            })
          },
        })
        const imgData = canvas.toDataURL("image/png")
        const pageW = pdfDoc.internal.pageSize.getWidth()
        const pageH = pdfDoc.internal.pageSize.getHeight()
        if (i > 0) pdfDoc.addPage("letter", "portrait")
        pdfDoc.addImage(imgData, "PNG", 0, 0, pageW, pageH)
      }

      const blob = pdfDoc.output("blob")
      const url = URL.createObjectURL(blob)
      try {
        previewTab.location.href = url
        previewTab.addEventListener?.("beforeunload", () => URL.revokeObjectURL(url))
      } catch {
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error("Failed to generate PO PDF", err)
      if (previewTab) previewTab.close()
    } finally {
      setPoPdfBusy(false)
    }
  }

  const captureDvPreviewToPdf = async () => {
    const root = dvVisibleRef.current || dvCaptureRef.current
    if (!root) return

    let previewTab: Window | null = null
    try {
      setDvPdfBusy(true)

      previewTab = window.open("about:blank", "_blank")
      if (!previewTab) {
        window.alert('Please allow pop-ups to preview the PDF.')
        return
      }

      await new Promise((r) => setTimeout(r, 150))

      const pageEl = root.querySelector<HTMLElement>(".print-page") || (root.classList.contains("print-page") ? root : null)
      if (!pageEl) {
        if (previewTab) previewTab.close()
        return
      }

      const pdfDoc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" })

      const canvas = await html2canvas(pageEl, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: 816,
        height: 1056,
        windowWidth: 816,
        windowHeight: 1056,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        onclone: (clonedDoc) => {
          clonedDoc.querySelectorAll('style').forEach((s) => {
            if (s.textContent) {
              s.textContent = s.textContent
                .replace(/oklch\([^\)]+\)/gi, '#000000')
                .replace(/oklab\([^\)]+\)/gi, '#000000')
                .replace(/color\([^\)]+\)/gi, '#000000')
            }
          })
          clonedDoc.querySelectorAll('[style]').forEach((el) => {
            const styleAttr = el.getAttribute('style')
            if (styleAttr && /(oklch|oklab|color\()/i.test(styleAttr)) {
              el.setAttribute('style', styleAttr
                .replace(/oklch\([^\)]+\)/gi, '#000000')
                .replace(/oklab\([^\)]+\)/gi, '#000000')
                .replace(/color\([^\)]+\)/gi, '#000000')
              )
            }
          })
        },
      })

      const imgData = canvas.toDataURL("image/png")
      const pageW = pdfDoc.internal.pageSize.getWidth()
      const pageH = pdfDoc.internal.pageSize.getHeight()

      pdfDoc.addImage(imgData, "PNG", 0, 0, pageW, pageH)

      const blob = pdfDoc.output("blob")
      const url = URL.createObjectURL(blob)

      try {
        previewTab.location.href = url
        previewTab.addEventListener?.("beforeunload", () => URL.revokeObjectURL(url))
      } catch {
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error("Failed to generate DV PDF", err)
      if (previewTab) previewTab.close()
    } finally {
      setDvPdfBusy(false)
    }
  }

  const parseDurationToMs = (durationStr: string): number => {
    const s = String(durationStr || '').toLowerCase().trim()
    if (!s) return 0
    const match = s.match(/^(\d+(?:\.\d+)?)\s*(day|days|hour|hours|hr|hrs|min|mins|minute|minutes|sec|secs|second|seconds)$/)
    if (!match) return 0
    const value = parseFloat(match[1])
    const unit = match[2]
    if (unit.startsWith('day')) return value * 24 * 60 * 60 * 1000
    if (unit.startsWith('hour') || unit === 'hr' || unit === 'hrs') return value * 60 * 60 * 1000
    if (unit.startsWith('min')) return value * 60 * 1000
    if (unit.startsWith('sec')) return value * 1000
    return 0
  }

  const formatLogDate = (raw?: string) => {
    const dt = new Date(String(raw || '').trim())
    if (!Number.isFinite(dt.getTime())) return '-'
    return dt.toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const formatElapsedShort = (ms: number) => {
    const min = Math.floor(Math.max(0, ms) / 60000);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ${min % 60}m`;
    const days = Math.floor(hr / 24);
    return `${days}d ${hr % 24}h`;
  }

  const formatDuration = (ms: number) => {
    const totalMinutes = Math.max(0, Math.floor(ms / (1000 * 60)))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours} hour(s) ${minutes} minute(s)`
  }

  const formatDays = (ms: number) => {
    const days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
    return `${days} day(s)`
  }

  const computePrPageCount = (prItems: any[]) => {
    if (!prItems || prItems.length === 0) return 1
    const firstPageCapacity = 30
    const nextPageCapacity = 30
    const PR_PAGE_BREAK_MARKER = "__PR_PAGE_BREAK__"
    const hasMarkers = prItems.some((it) => String(it?.description || "").trim() === PR_PAGE_BREAK_MARKER)
    if (hasMarkers) {
      let pageCount = 1
      for (const it of prItems) {
        if (String(it?.description || "").trim() === PR_PAGE_BREAK_MARKER) {
          pageCount++
        }
      }
      return pageCount
    }
    if (prItems.length <= firstPageCapacity) return 1
    return 1 + Math.ceil((prItems.length - firstPageCapacity) / nextPageCapacity)
  }

  const splitActionAndRemarks = (labelRaw: string, byOfficeProp?: string) => {
    const label = String(labelRaw || '').trim()
    if (!label) return { action: '-', remarks: '-' }

    const labelLower = label.toLowerCase()
    const taskFromParens = (() => {
      const match = label.match(/\(([^)]+)\)\s*$/)
      return match?.[1] ? String(match[1]).trim() : ''
    })()

    const taskFromColon = (() => {
      const idx = label.indexOf(':')
      if (idx < 0) return ''
      return String(label.slice(idx + 1)).trim()
    })()

    if (labelLower.startsWith('received')) {
      // Primary: parse office from label text (e.g. "Received by BUDGET ...")
      const officeFromLabel = (() => {
        const m = label.match(/received\s+by\s+([^(:]+?)(?:\(|:|$)/i)
        return String(m?.[1] || '').trim()
      })()
      // Fallback: use the log's byOffice field (the office that actually received it)
      const office = officeFromLabel || String(byOfficeProp || '').trim()

      const task = (() => {
        const mFor = label.match(/^received\s*(?:for\s*)?(.*)$/i)
        return String(mFor?.[1] || '').trim()
      })()
      const remarksRaw = task || taskFromParens || taskFromColon || '-'
      return {
        action: office ? `Received by ${office.toUpperCase()}` : 'Received',
        remarks: formatLogRemarks(remarksRaw),
      }
    }

    if (labelLower.includes('transferred to')) {
      const afterTransfer = (() => {
        const m = label.match(/transferred\s+to\s+(.+)$/i)
        return String(m?.[1] || '').trim()
      })()

      const { dest, taskFromFor } = (() => {
        const forSplit = afterTransfer.split(/\s+for\s+/i)
        if (forSplit.length >= 2) {
          return { dest: String(forSplit[0] || '').trim(), taskFromFor: String(forSplit.slice(1).join(' for ') || '').trim() }
        }
        return { dest: afterTransfer, taskFromFor: '' }
      })()

      const destClean = (() => {
        const d = String(dest || '').trim()
        if (!d) return ''
        const cut = d.match(/^([^(:]+?)(?:\(|:|$)/)
        return String(cut?.[1] || d).trim()
      })()

      const remarksRaw = taskFromParens || taskFromColon || taskFromFor || '-'
      return {
        action: destClean ? `Transferred to ${destClean.toUpperCase()}` : 'Transferred',
        remarks: formatLogRemarks(remarksRaw),
      }
    }

    const cleaned = formatLogRemarks(label)
    const actionMatched = (() => {
      if (labelLower.startsWith('returned') || labelLower.includes('returned')) return 'Returned'
      if (labelLower.startsWith('approved') || labelLower.includes('approved')) return 'Approved'
      if (labelLower.startsWith('submitted')) return 'Submitted'
      if (labelLower.startsWith('discontinued')) return 'Discontinued'
      return ''
    })()

    if (actionMatched) {
      return {
        action: actionMatched,
        remarks: cleaned !== actionMatched ? cleaned : '-',
      }
    }

    const parts = label.split(':')
    if (parts.length >= 2) {
      const action = String(parts[0] || '').trim()
      const remarks = formatLogRemarks(parts.slice(1).join(':').trim())
      return { action: action || '-', remarks: remarks || '-' }
    }

    return { action: label, remarks: '-' }
  }

  const actorMeta = useMemo(() => {
    let byOffice = ""
    let byUser = ""
    try {
      const raw = localStorage.getItem('user')
      const parsed = raw ? (JSON.parse(raw) as { fullName?: string; username?: string; office?: string } | null) : null
      byOffice = String(parsed?.office || '').trim()
      byUser = String(parsed?.fullName || parsed?.username || '').trim()
    } catch {
      byOffice = ""
      byUser = ""
    }
    return { byOffice, byUser }
  }, [])

  const getReturnedTimestamp = (doc: DocumentRow) => {
    const rawLogs = Array.isArray(doc?.logs) ? doc.logs : []
    const returnedLog = rawLogs.find((l) => {
      const label = String(l?.label || '').trim().toLowerCase()
      const color = String(l?.color || '').trim().toLowerCase()
      return label.startsWith('returned') || color.includes('rose')
    })

    const rawDate = String(returnedLog?.createdAt || '').trim()
    if (!rawDate) return "-"
    const dt = new Date(rawDate)
    if (!Number.isFinite(dt.getTime())) return "-"
    return dt.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const inferQueueStatusFromOffice = (byOfficeRaw: string) => {
    const officeLower = String(byOfficeRaw || '').trim().toLowerCase()
    if (!officeLower) return 'pending'
    if (officeLower.includes('budget')) return 'in-budget'
    if (officeLower.includes('pto')) return 'in-pto'
    if (officeLower.includes('bac') || officeLower.includes('bids') || officeLower.includes('awards')) return 'pending-bac'
    if (officeLower.includes('gso')) return 'pending-gso'
    return 'pending'
  }

  const getLastReturnedByOffice = (doc: DocumentRow) => {
    const rawLogs = Array.isArray(doc?.logs) ? doc.logs : []
    for (let i = rawLogs.length - 1; i >= 0; i -= 1) {
      const l = rawLogs[i]
      const label = String(l?.label || '').trim().toLowerCase()
      const color = String(l?.color || '').trim().toLowerCase()
      if (label.startsWith('returned') || label.includes('returned') || color.includes('rose')) {
        // First check byOffice field
        const byOffice = String(l?.byOffice || '').trim()
        if (byOffice) return byOffice

        // If byOffice is empty, try to infer from label content
        // Look for office names in the label
        if (label.includes('pto') || label.includes('pr signing')) return 'PTO'
        if (label.includes('budget') || label.includes('obr signing')) return 'BUDGET'
        if (label.includes('bac') || label.includes('bids') || label.includes('awards')) return 'BAC'
        if (label.includes('gso') || label.includes('general services')) return 'GSO'

        return ''
      }
    }
    return ''
  }

  const getAvailableReprocessDestinations = (doc: DocumentRow | null): Array<{ label: string; value: string; status: string }> => {
    if (!doc) return []

    // Always show all main offices for flexibility
    const allDestinations: Array<{ label: string; value: string; status: string }> = [
      { label: 'GSO', value: 'GSO', status: 'pending-gso' },
      { label: 'BAC', value: 'BAC', status: 'pending-bac' },
      { label: 'BUDGET', value: 'BUDGET', status: 'in-budget' },
      { label: 'PTO', value: 'PTO', status: 'in-pto' },
      { label: 'PGO', value: 'PGO', status: 'pending' },
      { label: 'ACCOUNTING', value: 'ACCOUNTING', status: 'pending' },
    ]

    return allDestinations
  }

  const getAvailableReprocessDestinationsForSubDoc = (doc: DocumentRow | null) => {
    const allowed = new Set(["BUDGET", "ACCOUNTING"])
    return getAvailableReprocessDestinations(doc).filter((d) => allowed.has(String(d.value || "").toUpperCase()))
  }

  useEffect(() => {
    if (reprocessConfirmDoc) {
      const destinations = getAvailableReprocessDestinations(reprocessConfirmDoc)
      setReprocessDest(destinations[0]?.value || "")
      setReprocessTask("")
    } else if (reprocessConfirmSubDoc) {
      const { parentDoc, subDoc } = reprocessConfirmSubDoc
      const dummyDoc = { ...parentDoc, logs: subDoc.logs } as any
      const destinations = getAvailableReprocessDestinationsForSubDoc(dummyDoc)
      setReprocessDest(destinations[0]?.value || "")
      setReprocessTask("")
    }
  }, [reprocessConfirmDoc, reprocessConfirmSubDoc])

  const receiveReturnedDocument = async (doc: DocumentRow) => {
    try {
      setActionBusyId(doc.id)
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/documents/${doc.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'ongoing',
          addLog: { label: 'Received by End User', color: 'bg-emerald-600', byOffice: actorMeta.byOffice, byUser: actorMeta.byUser },
        }),
      })
      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || 'Failed to receive document')
      }

      await fetchDocuments()
      setActiveTab('ongoing')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to receive document')
    } finally {
      setActionBusyId(null)
    }
  }

  const cancelPrevalidationDocument = (doc: DocumentRow) => {
    setCancelConfirmDoc(doc)
  }

  const executeCancelDocument = async (doc: DocumentRow) => {
    let byOffice = ""
    let byUser = ""
    try {
      const raw = localStorage.getItem('user')
      const parsed = raw ? (JSON.parse(raw) as { fullName?: string; username?: string; office?: string } | null) : null
      byOffice = String(parsed?.office || '').trim()
      byUser = String(parsed?.fullName || parsed?.username || '').trim()
    } catch {
      byOffice = ""
      byUser = ""
    }

    try {
      setActionBusyId(doc.id)
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/documents/${doc.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'discontinued',
          addLog: { label: 'Discontinued', color: 'bg-rose-500', byOffice, byUser },
        }),
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || 'Failed to cancel request')
      }

      await fetchDocuments()
      setActiveTab('discontinued')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel request')
    } finally {
      setActionBusyId(null)
    }
  }

  const reprocessReturnedDocument = async (doc: DocumentRow, destOffice: string, remarkOverride?: string) => {
    const remark = String(remarkOverride ?? "").trim()
    const destinations = getAvailableReprocessDestinations(doc)
    const selectedDest = destinations.find(d => d.value === destOffice) || destinations[0]
    const nextStatus = selectedDest?.status || inferQueueStatusFromOffice(destOffice)

    try {
      setActionBusyId(doc.id)
      const token = localStorage.getItem('token')
      await fetch(`${API_URL}/documents/${doc.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: nextStatus,
          addLog: { label: remark ? `Transferred to ${destOffice}: ${remark}` : `Transferred to ${destOffice} (Reprocessed)`, color: 'bg-sky-500', byOffice: actorMeta.byOffice, byUser: actorMeta.byUser },
        }),
      })
      await fetchDocuments()
      setReturnedModalOpen(false)
      setReprocessDest("")
      setRemarkText("")
    } finally {
      setActionBusyId(null)
    }
  }

  const reprocessReturnedSubDocument = async (parentDoc: DocumentRow, index: number, destOffice: string, remarkOverride?: string) => {
    const remark = String(remarkOverride ?? "").trim()
    if (!parentDoc.subDocuments) return
    const rawSubDoc = parentDoc.subDocuments[index]
    const dummyDoc = { ...parentDoc, logs: rawSubDoc.logs || [] } as any
    const destinations = getAvailableReprocessDestinationsForSubDoc(dummyDoc)
    const selectedDest = destinations.find((d) => d.value === destOffice) || destinations[0]
    const nextStatus = selectedDest?.status || inferQueueStatusFromOffice(destOffice)

    try {
      setActionBusyId(`${parentDoc.id}-sub-${index}`)
      const nextSubDocs = [...parentDoc.subDocuments]
      const currentLogs = Array.isArray(nextSubDocs[index].logs) ? nextSubDocs[index].logs : []
      nextSubDocs[index] = {
        ...nextSubDocs[index],
        status: nextStatus,
        logs: [
          ...currentLogs,
          {
            label: remark ? `Transferred to ${destOffice}: ${remark}` : `Transferred to ${destOffice} (Reprocessed)`,
            color: 'bg-sky-500',
            byOffice: actorMeta.byOffice,
            byUser: actorMeta.byUser,
            createdAt: new Date().toISOString(),
          },
        ],
      }

      const token = localStorage.getItem('token')
      const res = await fetch(`${API_URL}/documents/${parentDoc.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subDocuments: nextSubDocs,
        }),
      })

      if (!res.ok) throw new Error('Failed to transfer sub-document')

      await fetchDocuments()
      setReprocessConfirmSubDoc(null)
      setReprocessDest("")
      setRemarkText("")
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transfer failed')
    } finally {
      setActionBusyId(null)
    }
  }

  const transferDocument = async (doc: DocumentRow, dest: "BUDGET" | "PTO") => {
    const nextStatus = dest === 'BUDGET' ? 'in-budget' : 'in-pto'

    try {
      setActionBusyId(doc.id)
      const token = localStorage.getItem('token')
      await fetch(`${API_URL}/documents/${doc.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: nextStatus,
          addLog: { label: `Transferred to ${dest}`, color: 'bg-sky-500', byOffice: actorMeta.byOffice, byUser: actorMeta.byUser },
        }),
      })
      await fetchDocuments()
      setActiveTab('ongoing')
    } finally {
      setActionBusyId(null)
    }
  }

  const deptHeadContext = useMemo(() => {
    const username = String(userContext.username || "").trim()
    if (!username) return { deptHead: "$DEPARTMENTHEAD", deptHeadDesignation: "$designation" }

    try {
      const raw = localStorage.getItem(`user_profile_settings:${username}`)
      const parsed = raw
        ? (JSON.parse(raw) as { deptHead?: string; deptHeadDesignation?: string } | null)
        : null

      return {
        deptHead: typeof parsed?.deptHead === "string" && parsed.deptHead.trim() ? parsed.deptHead : "$DEPARTMENTHEAD",
        deptHeadDesignation:
          typeof parsed?.deptHeadDesignation === "string" && parsed.deptHeadDesignation.trim()
            ? parsed.deptHeadDesignation
            : "$designation",
      }
    } catch {
      return { deptHead: "$DEPARTMENTHEAD", deptHeadDesignation: "$designation" }
    }
  }, [userContext.username])

  const formatPeso = (raw: string) => {
    const s = String(raw || "").trim()
    if (!s) return ""

    const cleaned = s.replace(/[^0-9.,-]/g, "").replace(/,/g, "")
    const n = Number.parseFloat(cleaned)
    if (!Number.isFinite(n)) return s.replace(/^₱\s*/i, "")

    return new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  }

  const formatPesoInput = (raw: string, finalize: boolean = false) => {
    const s = String(raw || '').replace(/₱/g, '').trim()
    if (!s) return ''

    const isNegative = s.startsWith('-')
    const cleaned = s.replace(/,/g, '').replace(/[^0-9.]/g, '')
    if (!cleaned) return ''

    const parts = cleaned.split('.')
    const intPartRaw = parts[0]
    const decPartRaw = parts.length > 1 ? parts.slice(1).join('') : null

    const intPart = intPartRaw.replace(/^0+(?=\d)/, '') || (intPartRaw ? '0' : '')
    const formattedInt = intPart
      ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(intPart))
      : '0'

    const sign = isNegative ? '-' : ''

    if (!finalize) {
      if (decPartRaw !== null) {
        const nextDec = decPartRaw.slice(0, 2)
        return `₱ ${sign}${formattedInt}.${nextDec}`
      }
      return `₱ ${sign}${formattedInt}`
    }

    const n = Number.parseFloat(cleaned)
    if (!Number.isFinite(n)) return ''
    const finalVal = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)
    return `₱ ${sign}${finalVal}`
  }

  const formatLogLabel = (log: DocumentLog) => {
    return formatLogRemarks(log?.label)
  }

  const formatLogLabelCompact = (log: DocumentLog) => {
    const rawLabel = String(log?.label || "").trim()
    const byOffice = String(log?.byOffice || "").trim()
    if (!byOffice) return rawLabel

    const match = rawLabel.match(/^(Approved|Returned)\b/i)
    const typeLabel = match?.[1] ? String(match[1]).trim() : ""
    if (!typeLabel) return rawLabel
    return `${byOffice}: ${typeLabel.toUpperCase()}`
  }

  const hasTransferredLog = (doc: DocumentRow) => {
    const rawLogs = Array.isArray(doc?.logs) ? doc.logs : []
    return rawLogs.some((l) => String(l?.label || '').trim().toLowerCase().includes('transferred to'))
  }

  const hasApprovedByOffice = (doc: DocumentRow, officeNeedle: string) => {
    const rawLogs = Array.isArray(doc?.logs) ? doc.logs : []
    const needle = String(officeNeedle || '').trim().toLowerCase()
    if (!needle) return false
    return rawLogs.some((l) => {
      const label = String(l?.label || '').trim().toLowerCase()
      const byOffice = String(l?.byOffice || '').trim().toLowerCase()
      if (!label.startsWith('approved')) return false
      return byOffice.includes(needle) || label.includes(needle)
    })
  }

  async function fetchDocuments({ silent = false }: { silent?: boolean } = {}) {
    try {
      if (!silent) setLoading(true)
      if (!silent) setError(null)
      const token = localStorage.getItem('token')

      const params = new URLSearchParams()
      if (!showAll) {
        // Filter by office only so all end-users from the same office
        // can see each other's documents (not just their own).
        if (userContext.office) params.set('office', userContext.office)
      }

      const response = await fetch(`${API_URL}/documents?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }

      const data = (await response.json()) as { documents: any[] }
      const mapped = (data.documents || []).map((d) => {
        const createdAt = d.createdAt ? new Date(d.createdAt) : null
        const pad2 = (n: number) => String(n).padStart(2, "0")
        const hour12From = (dt: Date) => dt.getHours() % 12 || 12
        const timestamp = createdAt
          ? `${createdAt.getFullYear()}/${pad2(createdAt.getMonth() + 1)}/${pad2(createdAt.getDate())}\n${pad2(
            hour12From(createdAt)
          )}:${pad2(createdAt.getMinutes())}:${pad2(createdAt.getSeconds())}`
          : ""

        const particulars: DocumentParticular[] = [
          ...(d.prEnabled === false ? [] : [{ label: 'PR', color: 'bg-blue-500' }]),
          ...(d.obrEnabled === false ? [] : [{ label: 'OBR', color: 'bg-amber-500' }]),
        ]

        const logs: DocumentLog[] = Array.isArray(d.logs)
          ? [...d.logs].reverse().map((l: any) => ({
            label: String(l?.label || ''),
            color: String(l?.color || 'bg-sky-500'),
            byOffice: String(l?.byOffice || ''),
            byUser: String(l?.byUser || ''),
            createdAt: l?.createdAt ? String(l.createdAt) : "",
          }))
          : []

        return {
          id: String(d._id || d.trackingNo),
          trackingNo: String(d.trackingNo || ''),
          timestamp,
          createdBy: String(d.createdBy || '').trim().toLowerCase() === 'admin' ? 'System Administrator' : String(d.createdBy || ''),
          office: d.office ? String(d.office) : "",
          fund: d.fund ? String(d.fund) : "",
          section: d.section ? String(d.section) : "",
          fpp: d.fpp ? String(d.fpp) : "",
          department: d.department ? String(d.department) : "",
          contactNumber: d.contactNumber ? String(d.contactNumber) : "",
          responsibilityCenter: d.responsibilityCenter ? String(d.responsibilityCenter) : "",
          accountCode: d.accountCode ? String(d.accountCode) : "",
          email: d.email ? String(d.email) : "",
          requestedByName: d.requestedByName ? String(d.requestedByName) : "",
          requestedByDesignation: d.requestedByDesignation ? String(d.requestedByDesignation) : "",
          cashAvailabilityName: d.cashAvailabilityName ? String(d.cashAvailabilityName) : "",
          cashAvailabilityDesignation: d.cashAvailabilityDesignation ? String(d.cashAvailabilityDesignation) : "",
          approvedByName: d.approvedByName ? String(d.approvedByName) : "",
          approvedByDesignation: d.approvedByDesignation ? String(d.approvedByDesignation) : "",
          certifiedAName: d.certifiedAName ? String(d.certifiedAName) : "",
          certifiedAPosition: d.certifiedAPosition ? String(d.certifiedAPosition) : "",
          certifiedBName: d.certifiedBName ? String(d.certifiedBName) : "",
          certifiedBPosition: d.certifiedBPosition ? String(d.certifiedBPosition) : "",
          driveLink: d.driveLink ? String(d.driveLink) : "",
          prItems: Array.isArray(d.prItems)
            ? d.prItems.map((it: any) => ({
              itemNo: String(it?.itemNo || ''),
              unit: String(it?.unit || ''),
              description: String(it?.description || ''),
              quantity: String(it?.quantity || ''),
              unitCost: String(it?.unitCost || ''),
              totalCost: String(it?.totalCost || ''),
            }))
            : [],
          purpose: String(d.purpose || ''),
          notes: d.notes ? String(d.notes) : "",
          particulars,
          amount: String(d.amount || ''),
          supplierAmount: String(d.supplierAmount || ''),
          supplier: String(d.supplier || ''),
          logs,
          subDocuments: Array.isArray(d.subDocuments)
            ? d.subDocuments.map((sub: any) => ({
              trackingNo: String(sub?.trackingNo || ''),
              purpose: String(sub?.purpose || ''),
              amount: String(sub?.amount || ''),
              supplier: String(sub?.supplier || ''),
              status: String(sub?.status || 'returned'),
              logs: Array.isArray(sub?.logs)
                ? [...sub.logs].reverse().map((l: any) => ({
                  label: String(l?.label || ''),
                  color: String(l?.color || 'bg-sky-500'),
                  byOffice: String(l?.byOffice || ''),
                  byUser: String(l?.byUser || ''),
                  createdAt: l?.createdAt ? String(l.createdAt) : "",
                }))
                : []
            }))
            : [],
          action: 'pending',
          status: String(d.status || 'pending'),
          prNo: String(d.prNo || ''),
          obrNo: String(d.obrNo || ''),
          gsoRoutingSlip: String(d.gsoRoutingSlip || ''),
          returnToApprovalsRequested: Boolean((d as any).returnToApprovalsRequested),
          returnToApprovalsReason: String((d as any).returnToApprovalsReason || ''),
        } satisfies DocumentRow
      })

      setDocuments(mapped)
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to fetch documents')
    } finally {
      if (!silent) setLoading(false)
    }
  }
  // Real-time document updates handler
  const handleDocumentChange = useCallback((action: 'created' | 'updated' | 'deleted' | 'return_requested', data: any) => {
    console.log(`Document ${action}:`, data.document?.trackingNo || data.documentId);

    // For created/updated documents, refresh the list
    if (action === 'created' || action === 'updated') {
      // Check if this document belongs to the current user/office
      const doc = data.document;
      const docCreatedBy = String(doc?.createdBy || '').trim().toLowerCase()
      const docOffice = String(doc?.office || '').trim().toLowerCase()
      const userFullName = String(userContext.fullName || '').trim().toLowerCase()
      const userOffice = String(userContext.office || '').trim().toLowerCase()

      const shouldShow =
        showAll ||
        (docCreatedBy && userFullName && docCreatedBy === userFullName) ||
        (docOffice && userOffice && (docOffice === userOffice || docOffice.includes(userOffice) || userOffice.includes(docOffice)))

      if (shouldShow) {
        // Refresh documents silently to get latest data
        void fetchDocuments({ silent: true });
      }
    } else if (action === 'deleted') {
      // Remove deleted document from local state
      setDocuments((prev) => prev.filter((d) => d.id !== data.documentId));
    }
  }, [showAll, userContext.fullName, userContext.office]);

  // Initialize Socket.IO for real-time updates
  useDocumentSocket(
    {
      userId: userContext.fullName,
      office: userContext.office,
      role: 'viewer',
    },
    handleDocumentChange
  );

  useEffect(() => {
    fetchDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll, userContext.fullName, userContext.office])

  useEffect(() => {
    let intervalId: number | null = null

    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      if (autoRefreshInFlightRef.current) return
      autoRefreshInFlightRef.current = true
      try {
        await fetchDocuments({ silent: true })
      } finally {
        autoRefreshInFlightRef.current = false
      }
    }

    const start = () => {
      if (intervalId != null) return
      intervalId = window.setInterval(tick, 60000)
    }

    const stop = () => {
      if (intervalId == null) return
      window.clearInterval(intervalId)
      intervalId = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void tick()
        start()
      } else {
        stop()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    onVisibility()

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll, userContext.fullName, userContext.office])

  const tabCounts = useMemo(() => {
    const safeDocs = Array.isArray(documents) ? documents : []
    const counts: Record<TabType, number> = {
      "pre-validation": 0,
      ongoing: 0,
      completed: 0,
      discontinued: 0,
    }

    for (const d of safeDocs) {
      const status = String(d?.status || "").toLowerCase()
      const alreadyTransferred = hasTransferredLog(d)
      if (
        status === "pending" ||
        status === "pending-gso" ||
        status === "pending-bac" ||
        status === "ready-transfer" ||
        status === "for-validation" ||
        status === "pre-validation" ||
        status === "for-revision"
      ) {
        if (alreadyTransferred) counts.ongoing += 1
        else counts["pre-validation"] += 1
      } else if (status === "ongoing" || status === "in-budget" || status === "in-pto" || status === "returned") {
        counts.ongoing += 1
      } else if (status === "approved" || status === "completed") {
        counts.completed += 1
      } else if (status === "discontinued") {
        counts.discontinued += 1
      }
    }

    return counts
  }, [documents])

  const tabs = useMemo(
    () => [
      { id: "pre-validation" as TabType, label: "Document Pre-validation", count: tabCounts["pre-validation"] },
      { id: "ongoing" as TabType, label: "On Going", count: tabCounts.ongoing },
      { id: "completed" as TabType, label: "Completed", count: tabCounts.completed },
      { id: "discontinued" as TabType, label: "Discontinued", count: tabCounts.discontinued },
    ],
    [tabCounts]
  )

  const activeTabLabel = useMemo(() => {
    return tabs.find((t) => t.id === activeTab)?.label ?? "Requests"
  }, [activeTab, tabs])

  const returnedCount = useMemo(() => {
    return documents.filter((d) => String(d?.status || "").toLowerCase() === "returned").length
  }, [documents])

  const returnedDocs = useMemo(() => {
    return documents.filter((d) => String(d?.status || "").toLowerCase() === "returned")
  }, [documents])

  const activeTabDocs = useMemo(() => {
    const safeDocs = Array.isArray(documents) ? documents : []

    const isPrevalidationStatus = (status: string) => {
      const s = String(status || '').trim().toLowerCase()
      return (
        s === "pending" ||
        s === "pending-gso" ||
        s === "pending-bac" ||
        s === "ready-transfer" ||
        s === "for-validation" ||
        s === "pre-validation" ||
        s === "for-revision"
      )
    }

    return safeDocs.filter((d) => {
      const status = String(d?.status || "").toLowerCase()
      const alreadyTransferred = hasTransferredLog(d)

      if (activeTab === "pre-validation") {
        return isPrevalidationStatus(status) && !alreadyTransferred
      }

      if (activeTab === "ongoing") {
        // Show ongoing, in-budget, in-pto, and returned documents
        if (status === "ongoing" || status === "in-budget" || status === "in-pto" || status === "returned") return true
        return isPrevalidationStatus(status) && alreadyTransferred
      }

      if (activeTab === "completed") {
        return status === "approved" || status === "completed"
      }

      return status === "discontinued"
    })
  }, [activeTab, documents])

  const closePreview = () => setPreview(null)
  const closeLogsModal = () => {
    setLogsModalDoc(null)
    setRemarkText("")
  }

  const closeLogsPreviewModal = () => {
    setLogsPreviewDoc(null)
  }

  const closeHistoryModal = () => {
    setHistoryModalDoc(null)
  }

  const closeTransferModal = () => {
    setTransferModalDoc(null)
  }

  const openNewRequest = () => {
    setEditDoc(null)
    setIsModalOpen(true)
  }

  const filteredDocs = useMemo(() => {
    const searchLower = searchQuery.trim().toLowerCase()
    if (!searchLower) return activeTabDocs

    return activeTabDocs.filter((doc) => {
      return (
        String(doc.trackingNo || "").toLowerCase().includes(searchLower) ||
        String(doc.createdBy || "").toLowerCase().includes(searchLower) ||
        String(doc.purpose || "").toLowerCase().includes(searchLower)
      )
    })
  }, [activeTabDocs, searchQuery])

  const reviewLogsStorageKey = useMemo(() => {
    try {
      const userRaw = localStorage.getItem("user")
      const parsedUser = userRaw ? (JSON.parse(userRaw) as { username?: string } | null) : null
      const username = String(parsedUser?.username || "").trim()
      return `review_logs_last_read:${username || "_"}`
    } catch {
      return "review_logs_last_read:_"
    }
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(reviewLogsStorageKey)
      const n = raw ? Number(raw) : 0
      setReviewLogsLastRead(Number.isFinite(n) ? n : 0)
    } catch {
      setReviewLogsLastRead(0)
    }
  }, [reviewLogsStorageKey])

  const latestReviewLogs = useMemo(() => {
    const items: Array<{
      key: string
      trackingNo: string
      label: string
      byOffice: string
      byUser: string
      createdAt: string
      createdAtMs: number
    }> = []

    for (const d of Array.isArray(documents) ? documents : []) {
      const trackingNo = String(d?.trackingNo || "").trim()
      const logs = Array.isArray(d?.logs) ? d.logs : []
      for (let i = 0; i < logs.length; i++) {
        const l = logs[i]
        const label = String(l?.label || "").trim()
        if (!label) continue

        // Only show reviewer responses (Returned / Approved) in the Review Logs badge.
        // The end user's own "Remarks:" submissions should NOT count — the badge
        // is meant to notify the end user that the reviewer has replied.
        const labelLower = label.toLowerCase()
        const isReviewerResponse =
          labelLower.startsWith("returned") ||
          labelLower.startsWith("approved")
        if (!isReviewerResponse) continue

        const createdAt = String(l?.createdAt || "").trim()
        const createdAtMs = createdAt ? new Date(createdAt).getTime() : NaN
        items.push({
          key: `${trackingNo}-${createdAt}-${i}`,
          trackingNo,
          label,
          byOffice: String(l?.byOffice || "").trim(),
          byUser: String(l?.byUser || "").trim(),
          createdAt,
          createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
        })
      }
    }

    items.sort((a, b) => b.createdAtMs - a.createdAtMs)
    return items.slice(0, 20)
  }, [documents])

  useEffect(() => {
    ; (async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(`${API_URL}/offices`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        if (!response.ok) return
        const data = (await response.json()) as {
          offices?: Array<{
            name?: string;
            status?: string;
            type?: string;
            tasks?: Array<{ taskId?: number; task?: string; duration?: string; status?: string }>
          }>
        }
        const offices = Array.isArray(data?.offices) ? data.offices : []

        const tasksByOffice: Record<
          string,
          Array<{ taskId?: number; task?: string; duration?: string; status?: string }>
        > = {}
        for (const o of offices) {
          const name = String(o?.name || '').trim().toUpperCase()
          if (!name) continue
          const tasksRaw = Array.isArray(o?.tasks) ? o.tasks : []
          tasksByOffice[name] = tasksRaw
            .filter((t) => String(t?.status || '').toLowerCase() !== 'archived')
            .map((t) => ({
              taskId: t?.taskId,
              task: String(t?.task || '').trim(),
              duration: String(t?.duration || '').trim(),
              status: t?.status,
            }))
        }
        setTransferTasksByOffice(tasksByOffice)
      } catch {
        // ignore
      }
    })()
  }, [])

  const reviewLogsUnreadCount = useMemo(() => {
    if (!reviewLogsLastRead) return latestReviewLogs.length
    return latestReviewLogs.filter((it) => it.createdAtMs > reviewLogsLastRead).length
  }, [latestReviewLogs, reviewLogsLastRead])

  // Push badge count up to parent (UserDashboardPage sidebar) whenever it changes
  useEffect(() => {
    onBadgeCountChange?.(reviewLogsUnreadCount)
  }, [reviewLogsUnreadCount, onBadgeCountChange])

  const markAllReviewLogsAsRead = () => {
    const ts = Date.now()
    try {
      localStorage.setItem(reviewLogsStorageKey, String(ts))
    } catch {
      toast.error("Failed to mark review logs as read.")
      return
    }
    setReviewLogsLastRead(ts)
    toast.success("Review logs marked as read.")
  }

  return (
    <div className="w-full space-y-5 px-4 py-6 lg:px-8 font-sans">
      {/* Header with Title and Action Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">User Portal</div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Office Requests</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Manage and track your office purchase and obligation requests</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {!hideReviewLogsButton && (
            <button
              type="button"
              onClick={() => setReviewLogsOpen(true)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-emerald-700 hover:shadow-sm focus:outline-none"
              title="Review Logs"
            >
              <History className="size-3.5" />
              Review Logs
              <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                {reviewLogsUnreadCount}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setReturnedModalOpen(true)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-rose-600 px-3.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-rose-700 hover:shadow-sm focus:outline-none"
            title="Returned Documents"
          >
            <FileText className="size-3.5" />
            Returned Documents
            <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">{returnedCount}</span>
          </button>
          <button
            type="button"
            onClick={openNewRequest}
            className="relative inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white shadow-xs transition-all hover:bg-blue-700 hover:shadow-sm focus:outline-none"
            title={hasDraft ? "New Request (Draft available)" : "New Request"}
          >
            <Plus className="size-3.5" />
            New Request
            {hasDraft && (
              <span
                className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-extrabold text-white shadow-sm ring-2 ring-white animate-pulse"
                title="Saved Draft Available"
              >
                1
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200/90">
        <nav className="-mb-px flex space-x-2 sm:space-x-4 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative whitespace-nowrap px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-150 rounded-t-lg ${activeTab === tab.id
                ? "border-b-[3px] border-blue-600 bg-blue-50/60 text-blue-700 font-bold"
                : "border-b-[3px] border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                }`}
            >
              {tab.label}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${activeTab === tab.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Section Title & Search Bar Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <h2 className="text-base font-bold text-slate-900">{activeTabLabel}</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              aria-label="Search documents"
              title="Search documents"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tracking no, purpose..."
              className="h-9 w-64 sm:w-72 rounded-lg border border-slate-200/80 border-l-[3px] border-l-blue-500 bg-slate-50/80 pl-3 pr-8 text-xs text-slate-800 placeholder:text-slate-400 shadow-xs transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <Search className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      </div>

      {transferSuccess ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
            <div className="text-sm font-semibold text-slate-900">Transfer Successful</div>
            <div className="mt-2 text-sm text-slate-600">
              <span className="font-medium">{transferSuccess.trackingNo}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {transferSuccess.dest === 'BUDGET' ? 'Transfer to Budget (For OBR Signing)' : 'Transfer to PTO (For PR Signing)'}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setTransferSuccess(null)}
                className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reviewLogsOpen ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setReviewLogsOpen(false)
          }}
        >
          <div className="min-h-full w-full">
            <div className="flex min-h-full items-start justify-center py-6">
              <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-900">Review Logs</div>
                    <div className="truncate text-xs text-slate-600">Latest updates across your requests</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={markAllReviewLogsAsRead}
                      className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 focus:outline-none focus-visible:outline-none"
                    >
                      Mark all as read
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto bg-slate-50 p-4">
                  <div className="space-y-3">
                    {latestReviewLogs.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
                        No logs yet.
                      </div>
                    ) : (
                      latestReviewLogs.map((it) => {
                        const isUnread = it.createdAtMs > (reviewLogsLastRead || 0)
                        const meta = it.byOffice || it.byUser || "-"
                        const dateText = it.createdAtMs ? new Date(it.createdAtMs).toLocaleString() : "-"

                        return (
                          <div
                            key={it.key}
                            className={`rounded-xl border bg-white p-4 shadow-sm transition ${isUnread ? "border-emerald-200 ring-1 ring-emerald-100" : "border-slate-200"
                              }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-slate-900">{it.trackingNo}</div>
                                <div className="mt-1 text-sm text-slate-700">{it.label}</div>
                              </div>
                              {isUnread ? (
                                <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                  New
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                                {meta}
                              </span>
                              <span className="text-slate-500">{dateText}</span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs text-slate-600">Showing {latestReviewLogs.length} latest review logs</div>
                  <button
                    type="button"
                    onClick={() => setReviewLogsOpen(false)}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Documents Table — rendered by per-tab components */}
      {activeTab === "pre-validation" && (
        <PreValidationTab
          docs={filteredDocs}
          expandedRows={expandedRows}
          actionBusyId={actionBusyId}
          transferTasksByOffice={transferTasksByOffice}
          onToggleRow={(id) => {
            setExpandedRows((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }}
          onPreviewPR={(doc) => setPreview({ type: "PR", doc })}
          onPreviewOBR={(doc) => setPreview({ type: "OBR", doc })}
          onPreviewDV={(doc) => setPreview({ type: "DV", doc })}
              onPreviewPO={(doc) => setPreview({ type: "PO", doc })}
          onOpenLogsModal={(doc) => setLogsModalDoc(doc)}
          onOpenLogsPreview={(doc) => setLogsPreviewDoc(doc)}
          onEditDoc={(doc) => { setEditDoc(doc); setIsModalOpen(true) }}
          onCancelDoc={cancelPrevalidationDocument}
          onTransfer={(doc) => {
            const prEnabled = doc.particulars.some((p: any) => p.label === "PR")
            const obrEnabled = doc.particulars.some((p: any) => p.label === "OBR")
            const fundLower = String(doc.fund || "").trim().toLowerCase()
            const isTrustFund = Boolean(fundLower) && fundLower.includes("trust")
            const gsoApproved = hasApprovedByOffice(doc, "gso")
            const alreadyTransferred = hasTransferredLog(doc)
            // Trust Fund → PTO only; General/other funds → both BUDGET and PTO
            const canBudget = !alreadyTransferred && !isTrustFund && gsoApproved
            const canPto = !alreadyTransferred && gsoApproved
            // Default selection: trust fund pre-selects PTO; others pre-select BUDGET
            setTransferModalDest(isTrustFund ? "PTO" : (obrEnabled ? "BUDGET" : "PTO"))
            setTransferModalDoc(doc)
          }}
          onRoutingSlip={(doc) => setRoutingSlipDoc(doc)}
          formatPeso={formatPeso}
          formatLogLabelCompact={formatLogLabelCompact}
          hasTransferredLog={hasTransferredLog}
          hasApprovedByOffice={hasApprovedByOffice}
          parseDurationToMs={parseDurationToMs}
          formatElapsedShort={formatElapsedShort}
        />
      )}

      {activeTab === "ongoing" && (
        <OngoingTab
          docs={filteredDocs}
          expandedRows={expandedRows}
          actionBusyId={actionBusyId}
          transferTasksByOffice={transferTasksByOffice}
          onToggleRow={(id) => {
            setExpandedRows((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }}
          onPreviewPR={(doc) => setPreview({ type: "PR", doc })}
          onPreviewOBR={(doc) => setPreview({ type: "OBR", doc })}
          onPreviewDV={(doc) => setPreview({ type: "DV", doc })}
          onRoutingSlip={(doc) => setRoutingSlipDoc(doc)}
          onHistoryModal={(doc) => setHistoryModalDoc(doc)}
          onEditDoc={(doc) => { setEditDoc(doc); setIsModalOpen(true) }}
          onEditMainSupplier={(doc) => {
            const { supplier: calculatedSupplier, amount: calculatedAmount } = getMainDocSupplierInfo(doc)
            const initialSupplier = calculatedSupplier
            const initialAmount = calculatedAmount || (doc as any).supplierAmount || doc.amount

            setEditingMainDoc({
              id: doc.id,
              trackingNo: doc.trackingNo,
              supplier: initialSupplier,
              supplierAmount: formatPesoInput(initialAmount, true),
            })
          }}
          onEditSubDoc={(parentDoc, index, sub) => setEditingSubDoc({ parentId: parentDoc.id, index, trackingNo: sub.trackingNo, purpose: sub.purpose, amount: formatPesoInput(getSubDocAmount(parentDoc, index), true), supplier: sub.supplier || "" })}
          onCancelDoc={cancelPrevalidationDocument}
          onReprocessDoc={(doc) => setReprocessConfirmDoc(doc)}
          onReprocessSubDoc={(parentDoc, index, sub) => setReprocessConfirmSubDoc({ parentDoc, index, subDoc: sub })}
          onRequestReturnToApprovals={(doc) => {
            setRequestReturnDoc(doc)
            setRequestReturnReason("")
          }}
          formatPeso={formatPeso}
          parseDurationToMs={parseDurationToMs}
          formatElapsedShort={formatElapsedShort}
        />
      )}

      {activeTab === "completed" && (
        <CompletedTab
          docs={filteredDocs}
          expandedRows={expandedRows}
          onToggleRow={(id) => {
            setExpandedRows((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }}
          onPreviewPR={(doc) => setPreview({ type: "PR", doc })}
          onPreviewOBR={(doc) => setPreview({ type: "OBR", doc })}
          onPreviewDV={(doc) => setPreview({ type: "DV", doc })}
          onRoutingSlip={(doc) => setRoutingSlipDoc(doc)}
          onHistoryModal={(doc) => setHistoryModalDoc(doc)}
          onOpenLogsPreview={(doc) => setLogsPreviewDoc(doc)}
          formatPeso={formatPeso}
          formatLogLabelCompact={formatLogLabelCompact}
        />
      )}

      {activeTab === "discontinued" && (
        <DiscontinuedTab
          docs={filteredDocs}
          onOpenLogsPreview={(doc) => setLogsPreviewDoc(doc)}
          formatPeso={formatPeso}
          formatLogLabelCompact={formatLogLabelCompact}
          getReturnedTimestamp={getReturnedTimestamp}
        />
      )}
      {/* New Request Modal */}
      <NewRequestModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditDoc(null)
        }}
        title={editDoc ? "Update Request" : "New Request"}
        submitLabel={editDoc ? "Update" : "Submit Request"}
        initialPayload={
          editDoc
            ? {
              fund: editDoc.fund || "",
              section: editDoc.section || "",
              fpp: editDoc.fpp || "",
              department: editDoc.department || "",
              amount: editDoc.amount || "",
              contactNumber: editDoc.contactNumber || "",
              responsibilityCenter: editDoc.responsibilityCenter || "",
              accountCode: editDoc.accountCode || "",
              email: editDoc.email || "",
              requestedByName: (editDoc as any).requestedByName || "",
              requestedByDesignation: (editDoc as any).requestedByDesignation || "",
              cashAvailabilityName: (editDoc as any).cashAvailabilityName || "",
              cashAvailabilityDesignation: (editDoc as any).cashAvailabilityDesignation || "",
              approvedByName: (editDoc as any).approvedByName || "",
              approvedByDesignation: (editDoc as any).approvedByDesignation || "",
              certifiedAName: (editDoc as any).certifiedAName || "",
              certifiedAPosition: (editDoc as any).certifiedAPosition || "",
              certifiedBName: (editDoc as any).certifiedBName || "",
              certifiedBPosition: (editDoc as any).certifiedBPosition || "",
              driveLink: editDoc.driveLink || "",
              purpose: editDoc.purpose || "",
              notes: editDoc.notes || "",
              prItems: editDoc.prItems || [],
              prEnabled: editDoc.particulars.some((p) => p.label === "PR"),
              obrEnabled: editDoc.particulars.some((p) => p.label === "OBR"),
            }
            : undefined
        }
        onSubmit={(payload: NewRequestPayload) => {
          if (editDoc) {
            ; (async () => {
              try {
                setActionBusyId(editDoc.id)
                setError(null)
                const token = localStorage.getItem('token')
                const response = await fetch(`${API_URL}/documents/${editDoc.id}`, {
                  method: 'PATCH',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    fund: payload.fund,
                    section: payload.section,
                    fpp: payload.fpp,
                    department: payload.department,
                    contactNumber: payload.contactNumber,
                    responsibilityCenter: payload.responsibilityCenter,
                    accountCode: payload.accountCode,
                    email: payload.email,
                    requestedByName: payload.requestedByName,
                    requestedByDesignation: payload.requestedByDesignation,
                    cashAvailabilityName: payload.cashAvailabilityName,
                    cashAvailabilityDesignation: payload.cashAvailabilityDesignation,
                    approvedByName: payload.approvedByName,
                    approvedByDesignation: payload.approvedByDesignation,
                    certifiedAName: payload.certifiedAName,
                    certifiedAPosition: payload.certifiedAPosition,
                    certifiedBName: payload.certifiedBName,
                    certifiedBPosition: payload.certifiedBPosition,
                    driveLink: payload.driveLink,
                    prItems: payload.prItems,
                    purpose: payload.purpose,
                    notes: payload.notes,
                    particulars: [
                      ...(payload.prEnabled ? [{ label: 'PR', color: 'bg-blue-500' }] : []),
                      ...(payload.obrEnabled ? [{ label: 'OBR', color: 'bg-amber-500' }] : []),
                    ],
                    prEnabled: payload.prEnabled,
                    obrEnabled: payload.obrEnabled,
                    amount: payload.amount,
                  }),
                })

                if (!response.ok) {
                  const msg = await response.text().catch(() => "")
                  throw new Error(msg || "Failed to update document")
                }

                await fetchDocuments()
                setIsModalOpen(false)
                setUpdateSuccess({ trackingNo: editDoc.trackingNo })
                setEditDoc(null)
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to update document")
              } finally {
                setActionBusyId(null)
              }
            })()
            return
          }

          const now = new Date()
          const pad2 = (n: number) => String(n).padStart(2, "0")
          const hour12 = now.getHours() % 12 || 12
          const timestamp = `${now.getFullYear()}/${pad2(now.getMonth() + 1)}/${pad2(now.getDate())}\n${pad2(
            hour12
          )}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`

          const yyyymmdd = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
          const hhmmss = `${pad2(hour12)}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
          const rand5 = Math.floor(Math.random() * 100000)
            .toString()
            .padStart(5, "0")
          const trackingNo = `${yyyymmdd}-${hhmmss}-${rand5}`

          const userRaw = localStorage.getItem("user")
          const parsedUser = userRaw
            ? (JSON.parse(userRaw) as { username?: string; fullName?: string; office?: string } | null)
            : null
          const createdBy = parsedUser?.fullName || ""
          const office = parsedUser?.office || ""

          const enabledParticulars = [
            ...(payload.prEnabled ? [{ label: "PR", color: "bg-blue-500" }] : []),
            ...(payload.obrEnabled ? [{ label: "OBR", color: "bg-amber-500" }] : []),
          ]

          const requestedByName = String(deptHeadContext.deptHead || '').trim()
          const requestedByDesignation = String(deptHeadContext.deptHeadDesignation || '').trim()

          const newDoc: DocumentRow = {
            id: trackingNo,
            trackingNo,
            timestamp,
            createdBy: createdBy || "—",
            office,
            requestedByName: payload.requestedByName || requestedByName,
            requestedByDesignation: payload.requestedByDesignation || requestedByDesignation,
            purpose: payload.purpose,
            particulars: enabledParticulars,
            amount: payload.amount,
            logs: [{ label: "Submitted", color: "bg-sky-500" }],
            action: "pending",
            status: "pending-gso",
          }

          setDocuments((prev) => [newDoc, ...prev])

            ; (async () => {
              try {
                setLoading(true)
                setError(null)
                const token = localStorage.getItem('token')
                const response = await fetch(`${API_URL}/documents`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    trackingNo,
                    createdBy: createdBy || "—",
                    office,
                    fund: payload.fund,
                    section: payload.section,
                    fpp: payload.fpp,
                    department: payload.department,
                    contactNumber: payload.contactNumber,
                    responsibilityCenter: payload.responsibilityCenter,
                    accountCode: payload.accountCode,
                    email: payload.email,
                    requestedByName: payload.requestedByName || requestedByName,
                    requestedByDesignation: payload.requestedByDesignation || requestedByDesignation,
                    cashAvailabilityName: payload.cashAvailabilityName,
                    cashAvailabilityDesignation: payload.cashAvailabilityDesignation,
                    approvedByName: payload.approvedByName,
                    approvedByDesignation: payload.approvedByDesignation,
                    certifiedAName: payload.certifiedAName,
                    certifiedAPosition: payload.certifiedAPosition,
                    certifiedBName: payload.certifiedBName,
                    certifiedBPosition: payload.certifiedBPosition,
                    driveLink: payload.driveLink,
                    prItems: payload.prItems,
                    purpose: payload.purpose,
                    notes: payload.notes,
                    particulars: [
                      ...(payload.prEnabled ? [{ label: 'PR', color: 'bg-blue-500' }] : []),
                      ...(payload.obrEnabled ? [{ label: 'OBR', color: 'bg-amber-500' }] : []),
                    ],
                    prEnabled: payload.prEnabled,
                    obrEnabled: payload.obrEnabled,
                    amount: payload.amount,
                  }),
                })

                if (!response.ok) {
                  const msg = await response.text().catch(() => "")
                  throw new Error(msg || 'Failed to submit request')
                }

                await fetchDocuments()
                try {
                  const rawUser = localStorage.getItem("user")
                  const parsedU = rawUser ? (JSON.parse(rawUser) as { username?: string } | null) : null
                  const uname = String(parsedU?.username || "").trim()
                  localStorage.removeItem(`new_request_draft:${uname || "_"}`)
                  window.dispatchEvent(new CustomEvent("dts:draft_changed"))
                } catch {
                  // ignore
                }
                setIsModalOpen(false)
                toast.success(`Request submitted successfully! Tracking No: ${trackingNo}`)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to submit request')
              } finally {
                setLoading(false)
              }
            })()
        }}
      />

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) closePreview()
          }}
        >
          <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-slate-900">
                  Preview: {preview.type === "PR" ? "Purchase Request" : preview.type === "OBR" ? "Obligation Request" : "Disbursement Voucher"}
                </div>
                <div className="truncate text-xs text-slate-600">
                  Tracking No: {preview.doc.trackingNo}
                </div>
              </div>

              {preview.type === "PR" && computePrPageCount(preview.doc.prItems || []) > 1 && (
                <div className="flex items-center gap-1 mr-2">
                  <button
                    type="button"
                    onClick={() => setPrActivePage((p) => Math.max(0, p - 1))}
                    disabled={prActivePage === 0}
                    className="px-2 py-1 text-xs bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <span className="text-xs font-medium px-2">
                    Page {prActivePage + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPrActivePage((p) => p + 1)}
                    className="px-2 py-1 text-xs bg-white border border-slate-200 rounded hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              )}

              {preview.type === "PR" && (
                <button
                  type="button"
                  onClick={() => capturePrPreviewToPdf()}
                  disabled={prPdfBusy}
                  className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none disabled:opacity-50"
                  title="Download PDF"
                >
                  {prPdfBusy ? "..." : <Download className="size-4" />}
                </button>
              )}

              {preview.type === "OBR" && (
                <button
                  type="button"
                  onClick={() => captureObrPreviewToPdf()}
                  disabled={obrPdfBusy}
                  className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none disabled:opacity-50"
                  title="Download PDF"
                >
                  {obrPdfBusy ? "..." : <Download className="size-4" />}
                </button>
              )}

              {preview.type === "DV" && (
                <button
                  type="button"
                  onClick={() => captureDvPreviewToPdf()}
                  disabled={dvPdfBusy}
                  className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none disabled:opacity-50"
                  title="Download PDF"
                >
                  {dvPdfBusy ? "..." : <Download className="size-4" />}
                </button>
              )}

              {preview.type === "PO" && (
                <button
                  type="button"
                  onClick={() => capturePoPreviewToPdf()}
                  disabled={poPdfBusy}
                  className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none disabled:opacity-50"
                  title="Download PDF"
                >
                  {poPdfBusy ? "..." : <Download className="size-4" />}
                </button>
              )}

              <button
                type="button"
                onClick={closePreview}
                className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50 p-4">
              {preview.type === "PR" ? (
                <>
                  {/* Hidden capture container for PDF */}
                  <div
                    ref={prCaptureRef}
                    style={{
                      position: "fixed",
                      left: -10000,
                      top: 0,
                      width: 900,
                      height: "auto",
                      overflow: "visible",
                      background: "white",
                    }}
                    aria-hidden="true"
                  >
                    <div className="print-area">
                      <PrTemplatePreview
                        forceShowAllPages
                        model={{
                          trackingNo: preview.doc.trackingNo,
                          items: preview.doc.prItems || [],
                          fund: preview.doc.fund || "",
                          department: preview.doc.department || "",
                          section: preview.doc.section || "",
                          prNo: preview.doc.prNo || "",
                          date: "",
                          fpp: preview.doc.fpp || "",
                          purpose: preview.doc.purpose || "",
                          requestedByName:
                            String(preview.doc.requestedByName || "").trim() || String(deptHeadContext.deptHead || "").trim(),
                          requestedByDesignation:
                            String(preview.doc.requestedByDesignation || "").trim() ||
                            String(deptHeadContext.deptHeadDesignation || "").trim(),
                          cashAvailabilityName: String(preview.doc.cashAvailabilityName || "").trim() || "ALICIA R. MAGPANTAY",
                          cashAvailabilityDesignation: String(preview.doc.cashAvailabilityDesignation || "").trim() || "Provincial Treasurer",
                          approvedByName: String(preview.doc.approvedByName || "").trim() || "JOSE ENRIQUE S. GARCIA III",
                          approvedByDesignation: String(preview.doc.approvedByDesignation || "").trim() || "Provincial Governor",
                          status: preview.doc.status,
                          logs: preview.doc.logs,
                          hasPr: preview.doc.particulars?.some((p: any) => p.label === "PR"),
                          hasObr: preview.doc.particulars?.some((p: any) => p.label === "OBR"),
                        }}
                      />
                    </div>
                  </div>

                  {/* Visible PR Preview */}
                  <div className="print-area mx-auto w-[816px]">
                    <PrTemplatePreview
                      activePage={prActivePage}
                      model={{
                        trackingNo: preview.doc.trackingNo,
                        items: preview.doc.prItems || [],
                        fund: preview.doc.fund || "",
                        department: preview.doc.department || "",
                        section: preview.doc.section || "",
                        prNo: String(preview.doc.prNo || "").trim(),
                        date: "",
                        fpp: preview.doc.fpp || "",
                        purpose: preview.doc.purpose || "",
                        requestedByName:
                          String(preview.doc.requestedByName || "").trim() || String(deptHeadContext.deptHead || "").trim(),
                        requestedByDesignation:
                          String(preview.doc.requestedByDesignation || "").trim() ||
                          String(deptHeadContext.deptHeadDesignation || "").trim(),
                        cashAvailabilityName: String(preview.doc.cashAvailabilityName || "").trim() || "ALICIA R. MAGPANTAY",
                        cashAvailabilityDesignation: String(preview.doc.cashAvailabilityDesignation || "").trim() || "Provincial Treasurer",
                        approvedByName: String(preview.doc.approvedByName || "").trim() || "JOSE ENRIQUE S. GARCIA III",
                        approvedByDesignation: String(preview.doc.approvedByDesignation || "").trim() || "Provincial Governor",
                        status: preview.doc.status,
                        logs: preview.doc.logs,
                        hasPr: preview.doc.particulars?.some((p: any) => p.label === "PR"),
                        hasObr: preview.doc.particulars?.some((p: any) => p.label === "OBR"),
                      }}
                    />
                  </div>
                </>
              ) : preview.type === "DV" ? (
                <>
                  {/* Visible DV Preview */}
                  <div ref={dvVisibleRef} className="print-area mx-auto w-[816px]">
                    <DvTemplatePreview
                      model={{
                        payee: String(preview.doc.supplier || (preview.doc as any)?.doc?.supplier || "").trim() || "PR",
                        address: String((preview.doc as any)?.supplierAddress || "N/A"),
                        trackingNo: preview.doc.trackingNo,
                        fund: preview.doc.fund || "",
                        dvNo: String((preview.doc as any)?.dvNo || "").trim(),
                        date: (preview.doc as any)?.date || "",
                        obrNo: String(preview.doc.obrNo || "").trim(),
                        responsibilityCenter: preview.doc.responsibilityCenter || "",
                        particulars: preview.doc.purpose || "",
                        amount: preview.doc.supplierAmount || preview.doc.amount || "",
                        amountDue: preview.doc.supplierAmount || preview.doc.amount || "",
                        preparedByName: preview.doc.createdBy || "",
                        certifiedAName:
                          String(preview.doc.certifiedAName || "").trim() ||
                          String(preview.doc.requestedByName || "").trim() ||
                          String(deptHeadContext.deptHead || "").trim(),
                        certifiedAPosition:
                          String(preview.doc.certifiedAPosition || "").trim() ||
                          String(preview.doc.requestedByDesignation || "").trim() ||
                          String(deptHeadContext.deptHeadDesignation || "").trim(),
                        certifiedBName: String(preview.doc.certifiedBName || "").trim(),
                        certifiedBPosition: String(preview.doc.certifiedBPosition || "").trim(),
                        status: preview.doc.status,
                        logs: preview.doc.logs,
                        hasPr: preview.doc.particulars?.some((p: any) => p.label === "PR"),
                        hasObr: preview.doc.particulars?.some((p: any) => p.label === "OBR"),
                      } satisfies DvTemplateModel}
                    />
                  </div>

                  {/* Hidden capture container for PDF */}
                  <div
                    ref={dvCaptureRef}
                    style={{
                      position: "fixed",
                      left: -10000,
                      top: 0,
                      width: 816,
                      height: "auto",
                      overflow: "visible",
                      background: "white",
                    }}
                    aria-hidden="true"
                  >
                    <div className="print-area">
                      <DvTemplatePreview
                        model={{
                          payee: String(preview.doc.supplier || (preview.doc as any)?.doc?.supplier || "").trim() || "PR",
                          address: String((preview.doc as any)?.supplierAddress || "N/A"),
                          trackingNo: preview.doc.trackingNo,
                          fund: preview.doc.fund || "",
                          dvNo: String((preview.doc as any)?.dvNo || "").trim(),
                          date: (preview.doc as any)?.date || "",
                          obrNo: String(preview.doc.obrNo || "").trim(),
                          responsibilityCenter: preview.doc.responsibilityCenter || "",
                          particulars: preview.doc.purpose || "",
                          amount: preview.doc.supplierAmount || preview.doc.amount || "",
                          amountDue: preview.doc.supplierAmount || preview.doc.amount || "",
                          preparedByName: preview.doc.createdBy || "",
                          certifiedAName:
                            String(preview.doc.certifiedAName || "").trim() ||
                            String(preview.doc.requestedByName || "").trim() ||
                            String(deptHeadContext.deptHead || "").trim(),
                          certifiedAPosition:
                            String(preview.doc.certifiedAPosition || "").trim() ||
                            String(preview.doc.requestedByDesignation || "").trim() ||
                            String(deptHeadContext.deptHeadDesignation || "").trim(),
                          certifiedBName: String(preview.doc.certifiedBName || "").trim(),
                          certifiedBPosition: String(preview.doc.certifiedBPosition || "").trim(),
                          status: preview.doc.status,
                          logs: preview.doc.logs,
                          hasPr: preview.doc.particulars?.some((p: any) => p.label === "PR"),
                          hasObr: preview.doc.particulars?.some((p: any) => p.label === "OBR"),
                        } satisfies DvTemplateModel}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Visible OBR Preview */}
                  <div ref={obrVisibleRef} className="print-area mx-auto w-[816px]">
                    <ObrTemplatePreview
                      model={
                        {
                          payee: "PR",
                          office: "N/A",
                          address: "N/A",
                          trackingNo: preview.doc.trackingNo,
                          fund: preview.doc.fund || "",
                          obrNo: String(preview.doc.obrNo || "").trim(),
                          responsibilityCenter: preview.doc.responsibilityCenter || "",
                          particulars: preview.doc.purpose || "",
                          notes: preview.doc.notes || "",
                          fpp: preview.doc.fpp || "",
                          accountCode: preview.doc.accountCode || "",
                          amount: preview.doc.amount || "",
                          preparedByName: preview.doc.createdBy || "",
                          certifiedAName:
                            String(preview.doc.certifiedAName || "").trim() ||
                            String(preview.doc.requestedByName || "").trim() ||
                            String(deptHeadContext.deptHead || "").trim(),
                          certifiedAPosition:
                            String(preview.doc.certifiedAPosition || "").trim() ||
                            String(preview.doc.requestedByDesignation || "").trim() ||
                            String(deptHeadContext.deptHeadDesignation || "").trim(),
                          certifiedBName: String(preview.doc.certifiedBName || "").trim(),
                          certifiedBPosition: String(preview.doc.certifiedBPosition || "").trim(),
                          status: preview.doc.status,
                          logs: preview.doc.logs,
                          hasPr: preview.doc.particulars?.some((p: any) => p.label === "PR"),
                          hasObr: preview.doc.particulars?.some((p: any) => p.label === "OBR"),
                        } satisfies ObrTemplateModel
                      }
                    />
                  </div>

                  {/* Hidden capture container for PDF */}
                  <div
                    ref={obrCaptureRef}
                    style={{
                      position: "fixed",
                      left: -10000,
                      top: 0,
                      width: 816,
                      height: "auto",
                      overflow: "visible",
                      background: "white",
                    }}
                    aria-hidden="true"
                  >
                    <div className="print-area">
                      <ObrTemplatePreview
                        model={
                          {
                            payee: "PR",
                            office: "N/A",
                            address: "N/A",
                            trackingNo: preview.doc.trackingNo,
                            fund: preview.doc.fund || "",
                            obrNo: String(preview.doc.obrNo || "").trim(),
                            responsibilityCenter: preview.doc.responsibilityCenter || "",
                            particulars: preview.doc.purpose || "",
                            notes: preview.doc.notes || "",
                            fpp: preview.doc.fpp || "",
                            accountCode: preview.doc.accountCode || "",
                            amount: preview.doc.amount || "",
                            preparedByName: preview.doc.createdBy || "",
                            certifiedAName:
                              String(preview.doc.certifiedAName || "").trim() ||
                              String(preview.doc.requestedByName || "").trim() ||
                              String(deptHeadContext.deptHead || "").trim(),
                            certifiedAPosition:
                              String(preview.doc.certifiedAPosition || "").trim() ||
                              String(preview.doc.requestedByDesignation || "").trim() ||
                              String(deptHeadContext.deptHeadDesignation || "").trim(),
                            certifiedBName: String(preview.doc.certifiedBName || "").trim(),
                            certifiedBPosition: String(preview.doc.certifiedBPosition || "").trim(),
                            status: preview.doc.status,
                            logs: preview.doc.logs,
                            hasPr: preview.doc.particulars?.some((p: any) => p.label === "PR"),
                            hasObr: preview.doc.particulars?.some((p: any) => p.label === "OBR"),
                          } satisfies ObrTemplateModel
                        }
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {historyModalDoc ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) closeHistoryModal()
          }}
        >
          <div className="min-h-full w-full">
            <div className="flex min-h-full items-start justify-center py-6">
              <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-900">
                      Transaction History of {historyModalDoc.trackingNo}
                    </div>
                    <div className="truncate text-xs text-slate-600">
                      Document Current Location: {inferCurrentLocation(String(historyModalDoc.status || ''), String(historyModalDoc.office || ''), historyModalDoc.logs)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHistoryModalDoc(null)}
                    className="ml-2 shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:outline-none"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex-1 overflow-auto bg-slate-50 p-4">
                  <div className="print-area w-full bg-white">
                    <div className="border-b border-slate-200 px-6 py-5 text-center">
                      <div className="text-2xl font-semibold text-slate-900">Bataan Capitol Document Tracking System</div>
                      <div className="text-base text-slate-700">Transaction History</div>
                    </div>

                    <div className="space-y-3 px-6 py-5 text-sm text-slate-800">
                      <div className="text-sm font-semibold">
                        Document Current Location: {inferCurrentLocation(String(historyModalDoc.status || ''), String(historyModalDoc.office || ''), historyModalDoc.logs)}
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <span className="font-semibold">Tracking Number:</span> {historyModalDoc.trackingNo}
                        </div>
                        <div>
                          <span className="font-semibold">Requestor:</span> {historyModalDoc.office || ''}
                        </div>
                        <div>
                          <span className="font-semibold">PR Number:</span>{' '}
                          {historyModalDoc.particulars.some((p) => p.label === 'PR') ? 'Available' : 'N/A'}
                        </div>
                        <div>
                          <span className="font-semibold">OBR Number:</span>{' '}
                          {historyModalDoc.particulars.some((p) => p.label === 'OBR') ? 'Available' : 'N/A'}
                        </div>
                        <div className="md:col-span-2">
                          <span className="font-semibold">Purpose:</span> {historyModalDoc.purpose || ''}
                        </div>
                        <div className={Array.isArray((historyModalDoc as any)?.subDocuments) && (historyModalDoc as any).subDocuments.length > 0 ? "md:col-span-2" : ""}>
                          <span className="font-semibold">Supplier:</span>{' '}
                          {(() => {
                            const subs = Array.isArray((historyModalDoc as any)?.subDocuments)
                              ? ((historyModalDoc as any).subDocuments as any[])
                              : []
                            if (subs.length > 0) {
                              const { supplier: mainSupplier, amount: mainAmt } = getMainDocSupplierInfo(historyModalDoc)
                              const list = [
                                {
                                  name: mainSupplier || 'Not Updated',
                                  amount: mainAmt ? `₱ ${formatPeso(mainAmt)}` : '',
                                },
                                ...subs.map((s: any, sidx: number) => ({
                                  name: String(s?.supplier || '').trim() || 'Not Updated',
                                  amount: (() => {
                                    const a = s?.amount || getSubDocAmount(historyModalDoc, sidx)
                                    return a ? `₱ ${formatPeso(a)}` : ''
                                  })(),
                                })),
                              ]
                              return (
                                <div className="mt-1 space-y-0.5 pl-3 text-xs">
                                  {list.map((it, idx) => (
                                    <div key={idx} className="text-slate-800">
                                      <span className="font-medium">{idx + 1}. {it.name}</span>
                                      {it.amount ? <span className="text-slate-600 font-medium"> - {it.amount}</span> : ''}
                                    </div>
                                  ))}
                                </div>
                              )
                            }

                            const { supplier, amount: amt } = getMainDocSupplierInfo(historyModalDoc)
                            if (supplier && amt) return `${supplier} - ₱ ${formatPeso(amt)}`
                            if (supplier) return supplier
                            if (amt) return `₱ ${formatPeso(amt)}`
                            return 'N/A'
                          })()}
                        </div>
                        <div>
                          <span className="font-semibold">Source of Fund:</span> {historyModalDoc.fund || ''}
                        </div>
                        <div>
                          <span className="font-semibold">Amount:</span> {historyModalDoc.amount || ''}
                        </div>
                        <div>
                          <span className="font-semibold">Email:</span> {historyModalDoc.email || ''}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 px-6 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">
                          {historyTab === 'transactions' ? 'Transaction Logs' : historyTab === 'subdocuments' ? 'Sub-Document Transactions' : 'Pre-Validation'}
                        </div>
                        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
                          <button
                            type="button"
                            onClick={() => setHistoryTab('transactions')}
                            className={`h-8 rounded px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${historyTab === 'transactions'
                              ? 'bg-slate-900 text-white'
                              : 'bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                              }`}
                          >
                            Transactions
                          </button>
                          {Array.isArray((historyModalDoc as any)?.subDocuments) && (historyModalDoc as any)?.subDocuments.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setHistoryTab('subdocuments')}
                              className={`h-8 rounded px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${historyTab === 'subdocuments'
                                ? 'bg-slate-900 text-white'
                                : 'bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                              Sub-Documents
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setHistoryTab('prevalidation')}
                            className={`h-8 rounded px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${historyTab === 'prevalidation'
                              ? 'bg-slate-900 text-white'
                              : 'bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                              }`}
                          >
                            Pre-Validation
                          </button>
                        </div>
                      </div>

                      {historyTab === 'subdocuments' ? (
                        <div className="mt-4 space-y-6">
                          {Array.isArray((historyModalDoc as any)?.subDocuments) && (historyModalDoc as any)?.subDocuments.map((sub: any, sIdx: number) => {
                            const subLogs = Array.isArray(sub.logs) ? [...sub.logs].reverse() : []
                            return (
                              <div key={sIdx} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                                  <div className="font-semibold text-slate-800 text-sm">Tracking #: {sub.trackingNo}</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <span className="font-medium">Amount:</span> ₱ {sub.amount ? String(sub.amount).replace(/[^0-9.,-]/g, '').trim() : '-'}
                                  </div>
                                  <div className="text-xs text-slate-600 mt-0.5">
                                    <span className="font-medium">Supplier:</span> {sub.supplier || '-'}
                                  </div>
                                  <div className="text-xs text-slate-600 mt-0.5">
                                    <span className="font-medium">Purpose:</span> {sub.purpose || '-'}
                                  </div>
                                </div>
                                <table className="w-full text-left text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
                                  <thead className="bg-blue-600 text-white">
                                    <tr className="border-b border-blue-700">
                                      <th className="px-3 py-2 text-xs font-semibold text-white">Date</th>
                                      <th className="px-3 py-2 text-xs font-semibold text-white">Processed By</th>
                                      <th className="px-3 py-2 text-xs font-semibold text-white">Action</th>
                                      <th className="px-3 py-2 text-xs font-semibold text-white">Remarks</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200">
                                    {subLogs.length > 0 ? subLogs.map((l: any, i: number) => {
                                      const date = l.createdAt ? new Date(l.createdAt).toLocaleString() : '-'
                                      const processedBy = String(l.byUser || l.byOffice || '-')
                                      const { action, remarks } = splitActionAndRemarks(String(l.label || ''), String(l.byOffice || ''))
                                      return (
                                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                          <td className="px-3 py-2 text-xs">{date}</td>
                                          <td className="px-3 py-2 text-xs whitespace-pre-line">{processedBy}</td>
                                          <td className="px-3 py-2 text-xs font-medium">{action}</td>
                                          <td className="px-3 py-2 text-xs">{remarks}</td>
                                        </tr>
                                      )
                                    }) : (
                                      <tr>
                                        <td className="px-3 py-4 text-center text-sm text-slate-500" colSpan={4}>No logs found</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                          <table className="w-full text-left text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
                            <thead className="bg-blue-600 text-white">
                              <tr className="border-b border-blue-700">
                                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">Date</th>
                                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">Processed By</th>
                                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">Action</th>
                                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">Remarks</th>
                                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">Days</th>
                                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">Duration</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {(() => {
                                const raw = Array.isArray(historyModalDoc.logs) ? [...historyModalDoc.logs] : []
                                const sorted = raw
                                  .filter((l) => {
                                    const label = String(l?.label || '').trim().toLowerCase()
                                    return label !== 'updated' && !label.includes('updated')
                                  })
                                  .map((l) => ({
                                    label: String(l?.label || ''),
                                    byOffice: String(l?.byOffice || ''),
                                    byUser: String(l?.byUser || ''),
                                    createdAt: String(l?.createdAt || ''),
                                  }))
                                  .sort((a, b) => {
                                    const ta = new Date(a.createdAt).getTime()
                                    const tb = new Date(b.createdAt).getTime()
                                    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0)
                                  })

                                const isTransactionsStartLog = (labelRaw: string) => {
                                  const labelLower = String(labelRaw || '').trim().toLowerCase()
                                  if (!labelLower) return false
                                  if (labelLower.includes('transferred to')) return true
                                  if (labelLower === 'completed' || labelLower.includes('completed')) return true
                                  if (labelLower === 'cancelled' || labelLower === 'canceled' || labelLower.includes('cancel')) return true
                                  if (labelLower === 'discontinued' || labelLower.includes('discontinued')) return true
                                  return false
                                }

                                const firstTransferIdx = sorted.findIndex((l) =>
                                  isTransactionsStartLog(String(l?.label || ''))
                                )

                                const prevalidationAsc = firstTransferIdx >= 0 ? sorted.slice(0, firstTransferIdx) : sorted
                                const transactionsAsc = firstTransferIdx >= 0 ? sorted.slice(firstTransferIdx) : []
                                const selectedAsc = historyTab === 'transactions' ? transactionsAsc : prevalidationAsc

                                const transferNeedle = 'transferred to'
                                const isTransferLog = (labelRaw: string) =>
                                  String(labelRaw || '').trim().toLowerCase().includes(transferNeedle)
                                const isReceivedLog = (labelRaw: string) => {
                                  const labelLower = String(labelRaw || '').trim().toLowerCase()
                                  return labelLower.startsWith('received') || labelLower.includes('received')
                                }
                                const isTerminalActionLog = (labelRaw: string) => {
                                  const labelLower = String(labelRaw || '').trim().toLowerCase()
                                  return (
                                    labelLower.includes('approved') ||
                                    labelLower.includes('returned') ||
                                    labelLower.includes('completed') ||
                                    labelLower.includes('discontinued') ||
                                    labelLower.includes('cancelled') ||
                                    labelLower.includes('canceled')
                                  )
                                }
                                const isStageEndLog = (labelRaw: string) => {
                                  return isTransferLog(labelRaw) || isTerminalActionLog(labelRaw)
                                }

                                const timestamps = selectedAsc.map((l) => new Date(l.createdAt).getTime())
                                const spanByStartIdx = new Map<number, { rowSpan: number; durationMs: number }>()
                                const coveredIdx = new Set<number>()
                                const exceededIndices = new Set<number>()

                                for (let i = 0; i < selectedAsc.length; i += 1) {
                                  if (coveredIdx.has(i)) continue
                                  const current = selectedAsc[i]
                                  if (!isReceivedLog(String(current?.label || ''))) continue

                                  let endIdx = -1
                                  for (let j = i + 1; j < selectedAsc.length; j += 1) {
                                    if (isStageEndLog(String(selectedAsc[j]?.label || ''))) {
                                      endIdx = j
                                      break
                                    }
                                  }

                                  if (endIdx < 0) continue
                                  const startTs = timestamps[i]
                                  const endTs = timestamps[endIdx]
                                  const durationMs =
                                    Number.isFinite(startTs) && Number.isFinite(endTs) ? Math.max(0, endTs - startTs) : 0

                                  // Check if this specific stage (From Received to Transfer/Completion) is exceeded
                                  const isStageExceeded = (() => {
                                    const receivedLog = selectedAsc[i]
                                    const offKey = String(receivedLog.byOffice || '').trim().toUpperCase()
                                    const lbl = String(receivedLog.label || '')
                                    const taskName = (() => {
                                      const mFor = lbl.match(/received(?:\s+by\s+[^(:]+)?\s+for\s+([^(:)]+)/i)
                                      if (mFor?.[1]) return mFor[1].trim()
                                      const mParens = lbl.match(/\(([^)]+)\)\s*$/)
                                      if (mParens?.[1]) return mParens[1].trim()
                                      const parts = lbl.split(':')
                                      if (parts.length >= 2) return parts.slice(1).join(':').trim()
                                      return ''
                                    })()
                                    if (offKey && taskName) {
                                      const officeTasks = (transferTasksByOffice[offKey] || []).filter(t => !String(t?.status || '').toLowerCase().includes('archived'))
                                      let task = officeTasks.find(t => String(t?.task || '').trim().toLowerCase() === taskName.toLowerCase())
                                      if (!task && taskName.length > 2) {
                                        task = officeTasks.find(t => {
                                          const tName = String(t?.task || '').trim().toLowerCase()
                                          const rName = taskName.toLowerCase()
                                          return tName.includes(rName) || rName.includes(tName)
                                        })
                                      }
                                      if (!task && officeTasks.length === 1) task = officeTasks[0]
                                      if (task?.duration) {
                                        const limit = parseDurationToMs(task.duration)
                                        if (limit > 0 && durationMs > limit) return true
                                      }
                                    }
                                    return false
                                  })()

                                  spanByStartIdx.set(i, { rowSpan: endIdx - i + 1, durationMs })
                                  if (isStageExceeded) {
                                    for (let k = i; k <= endIdx; k++) exceededIndices.add(k)
                                  }
                                  for (let k = i + 1; k <= endIdx; k += 1) {
                                    coveredIdx.add(k)
                                  }
                                }

                                const totalMinutesSum = Array.from(spanByStartIdx.values()).reduce(
                                  (sum, it) => sum + Math.max(0, Math.floor(it.durationMs / (1000 * 60))),
                                  0
                                )
                                const totalMs = totalMinutesSum * 1000 * 60
                                const count = selectedAsc.filter((l) => Boolean(String(l?.label || '').trim())).length
                                if (count === 0) {
                                  return (
                                    <tr>
                                      <td className="px-3 py-6 text-center text-sm text-slate-600" colSpan={6}>
                                        No Record Found
                                      </td>
                                    </tr>
                                  )
                                }

                                return (
                                  <>
                                    {selectedAsc.map((l, idx) => {
                                      const processedBy = String(l.byUser || l.byOffice || '-')
                                      const { action, remarks } = splitActionAndRemarks(l.label, l.byOffice)
                                      const span = spanByStartIdx.get(idx)
                                      const isCovered = coveredIdx.has(idx)

                                      const isExceededProcessed = exceededIndices.has(idx)
                                      const isTerminalAction = (() => {
                                        const labelLower = String(l.label || '').toLowerCase()
                                        return labelLower.includes('approved') ||
                                          labelLower.includes('returned') ||
                                          labelLower.includes('completed') ||
                                          labelLower.includes('transferred to')
                                      })()

                                      return (
                                        <tr
                                          key={`${l.createdAt}-${idx}`}
                                          className={`${isExceededProcessed ? 'bg-rose-600 text-white' : (idx % 2 === 0 ? 'bg-white text-slate-700' : 'bg-slate-50 text-slate-700')}`}
                                        >
                                          <td className={`px-3 py-2 text-xs ${isExceededProcessed ? 'font-medium' : ''}`}>
                                            {formatLogDate(l.createdAt)}
                                          </td>
                                          <td className={`px-3 py-2 text-xs whitespace-pre-line ${isExceededProcessed ? 'font-semibold' : ''}`}>
                                            {processedBy}
                                          </td>
                                          <td className="px-3 py-2 text-xs">
                                            <div className="flex items-center gap-2">
                                              <span className={isExceededProcessed ? 'font-bold' : ''}>{action}</span>
                                              {isExceededProcessed && isTerminalAction && (
                                                <span className="inline-flex items-center rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold text-white ring-1 ring-inset ring-white/50">
                                                  EXCEEDED
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          <td className={`px-3 py-2 text-xs ${isExceededProcessed ? 'font-medium italic' : ''}`}>
                                            {remarks}
                                          </td>
                                          {isCovered ? null : span ? (
                                            <td className={`px-3 py-2 text-xs font-semibold ${isExceededProcessed ? 'bg-rose-700/50' : ''}`} rowSpan={span.rowSpan}>
                                              {formatDays(span.durationMs)}
                                            </td>
                                          ) : (
                                            <td className="px-3 py-2 text-xs">-</td>
                                          )}
                                          {isCovered ? null : span ? (
                                            <td className={`px-3 py-2 text-xs font-semibold ${isExceededProcessed ? 'bg-rose-700/50' : ''}`} rowSpan={span.rowSpan}>
                                              {formatDuration(span.durationMs)}
                                            </td>
                                          ) : (
                                            <td className="px-3 py-2 text-xs">-</td>
                                          )}
                                        </tr>
                                      )
                                    })}
                                    <tr className="bg-emerald-600">
                                      <td className="px-3 py-3 text-right text-sm font-semibold text-white" colSpan={5}>
                                        Total Duration
                                      </td>
                                      <td className="px-3 py-3 text-sm font-semibold text-white">{formatDuration(totalMs)}</td>
                                    </tr>
                                  </>
                                )
                              })()}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {
        logsPreviewDoc ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) closeLogsPreviewModal()
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-6">
                <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Review Logs</div>
                      <div className="truncate text-xs text-slate-600">{logsPreviewDoc.trackingNo}</div>
                    </div>
                    <button
                      type="button"
                      onClick={closeLogsPreviewModal}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:outline-none"
                      aria-label="Close"
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex-1 overflow-auto p-4">
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full text-left text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
                        <thead className="bg-blue-600 text-white">
                          <tr className="border-b border-blue-700">
                            <th className="w-40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">User</th>
                            <th className="w-40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {(() => {
                            const pageSize = 10
                            const raw = Array.isArray(logsPreviewDoc.logs) ? [...logsPreviewDoc.logs] : []
                            const items = raw.reverse()
                            if (items.length === 0) {
                              return (
                                <tr>
                                  <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={2}>
                                    No logs yet.
                                  </td>
                                </tr>
                              )
                            }

                            const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
                            const safePage = Math.min(Math.max(0, logsPreviewPage), pageCount - 1)
                            const start = safePage * pageSize
                            const pageItems = items.slice(start, start + pageSize)

                            return pageItems.map((l: DocumentLog, idx) => (
                              <tr key={`${start + idx}`} className="align-top">
                                <td className="px-3 py-2 text-xs text-slate-700">{l.byUser || l.byOffice || "-"}</td>
                                <td className="px-3 py-2">
                                  <div className="flex items-start gap-2">
                                    <span
                                      className={`mt-0.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${l.color || "bg-sky-500"}`}
                                    >
                                      {String(l.color || "")
                                        .toLowerCase()
                                        .includes("emerald")
                                        ? "Approved"
                                        : String(l.color || "")
                                          .toLowerCase()
                                          .includes("rose")
                                          ? "Returned"
                                          : "Info"}
                                    </span>
                                    <span className="text-xs text-slate-700">{formatLogLabel(l)}</span>
                                  </div>
                                </td>
                              </tr>
                            ))
                          })()}
                          {Array.isArray(logsPreviewDoc.logs) && logsPreviewDoc.logs.length === 0 ? (
                            <tr>
                              <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={2}>
                                No logs yet.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const pageSize = 10
                        const total = Array.isArray(logsPreviewDoc.logs) ? logsPreviewDoc.logs.length : 0
                        const pageCount = Math.max(1, Math.ceil(total / pageSize))
                        const safePage = Math.min(Math.max(0, logsPreviewPage), pageCount - 1)
                        if (pageCount <= 1) return null
                        return (
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <button
                              type="button"
                              onClick={() => setLogsPreviewPage((p) => Math.max(0, p - 1))}
                              disabled={safePage === 0}
                              className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 font-semibold shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Prev
                            </button>
                            <span className="tabular-nums">Page {safePage + 1} / {pageCount}</span>
                            <button
                              type="button"
                              onClick={() => setLogsPreviewPage((p) => p + 1)}
                              disabled={safePage >= pageCount - 1}
                              className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 font-semibold shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Next
                            </button>
                          </div>
                        )
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={closeLogsPreviewModal}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      }

      {
        logsModalDoc ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) closeLogsModal()
            }}
          >
            <div className="flex min-h-full items-center justify-center">
              <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <History className="size-4 text-emerald-600" />
                      <h3 className="truncate text-base font-bold text-slate-900">Review Logs</h3>
                    </div>
                    <div className="mt-0.5 truncate text-xs font-medium text-slate-500">
                      Tracking No: <span className="text-slate-900">{logsModalDoc.trackingNo}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeLogsModal}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none"
                    aria-label="Close"
                  >
                    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Body (Logs Table) */}
                <div className="flex-1 overflow-auto p-5">
                  <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                    <table className="w-full text-left text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
                      <thead className="bg-blue-600 text-white border-b border-blue-700">
                        <tr>
                          <th className="w-32 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white">Timestamp</th>
                          <th className="w-40 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white">User</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white">Remarks</th>
                          <th className="w-24 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white text-right">Office</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {(() => {
                          const pageSize = 10
                          const raw = Array.isArray(logsModalDoc.logs) ? [...logsModalDoc.logs] : []
                          const items = raw.reverse()
                          if (items.length === 0) {
                            return (
                              <tr>
                                <td className="px-4 py-10 text-center text-sm text-slate-400" colSpan={4}>
                                  No activity logs found for this document.
                                </td>
                              </tr>
                            )
                          }

                          const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
                          const safePage = Math.min(Math.max(0, logsModalPage), pageCount - 1)
                          const start = safePage * pageSize
                          const pageItems = items.slice(start, start + pageSize)

                          return pageItems.map((l: DocumentLog, idx) => {
                            const bg = String(l.color || 'bg-sky-500')
                            const dateRaw = l.createdAt ? new Date(l.createdAt) : null
                            const dateText = dateRaw && Number.isFinite(dateRaw.getTime())
                              ? dateRaw.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                              : "-"
                            const timeText = dateRaw && Number.isFinite(dateRaw.getTime())
                              ? dateRaw.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })
                              : "-"

                            return (
                              <tr
                                key={`${l.createdAt}-${idx}`}
                                className={`${bg} text-white`}
                              >
                                <td className="px-4 py-3 align-top">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-bold tracking-tight">{dateText}</span>
                                    <span className="text-[10px] opacity-80 font-medium uppercase">{timeText}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <div className="text-xs font-bold leading-tight uppercase">{String(l.byUser || '-')}</div>
                                </td>
                                <td className="px-4 py-3 align-top text-xs font-medium leading-relaxed">
                                  {formatLogLabel(l)}
                                </td>
                                <td className="px-4 py-3 align-top text-right">
                                  <span className="inline-flex rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                                    {String(l.byOffice || '-').toUpperCase()}
                                  </span>
                                </td>
                              </tr>
                            )
                          })
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {(() => {
                    const pageSize = 10
                    const total = Array.isArray(logsModalDoc.logs) ? logsModalDoc.logs.length : 0
                    const pageCount = Math.max(1, Math.ceil(total / pageSize))
                    const safePage = Math.min(Math.max(0, logsModalPage), pageCount - 1)
                    if (pageCount <= 1) return null
                    return (
                      <div className="mt-4 flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setLogsModalPage((p) => Math.max(0, p - 1))}
                          disabled={safePage === 0}
                          className="inline-flex h-8 px-3 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
                        >
                          PREV
                        </button>
                        <span className="text-[11px] font-bold tracking-widest text-slate-400">PAGE {safePage + 1} OF {pageCount}</span>
                        <button
                          type="button"
                          onClick={() => setLogsModalPage((p) => p + 1)}
                          disabled={safePage >= pageCount - 1}
                          className="inline-flex h-8 px-3 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
                        >
                          NEXT
                        </button>
                      </div>
                    )
                  })()}

                  {/* Legends */}
                  <div className="mt-6 flex items-center justify-end gap-5 border-t border-slate-100 pt-4">
                    <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span className="size-2.5 rounded-full bg-emerald-600" />
                      Approved
                    </div>
                    <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span className="size-2.5 rounded-full bg-rose-600" />
                      Returned
                    </div>
                    <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span className="size-2.5 rounded-full bg-sky-600" />
                      Process
                    </div>
                  </div>
                </div>

                {/* Footer / Reply Section */}
                <div className="border-t border-slate-200 bg-slate-50 p-5">
                  <div className="space-y-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Add Remark / Reply</div>
                    <div className="flex gap-2">
                      <input
                        value={remarkText}
                        onChange={(e) => setRemarkText(e.target.value)}
                        placeholder="Type your response here..."
                        className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none placeholder:text-slate-400"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && remarkText.trim() && !actionBusyId) {
                            // Trigger submit logic (DRY later if needed)
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setLogsModalDoc(null)}
                        className="h-10 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 active:scale-95"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        disabled={actionBusyId === logsModalDoc.id || !remarkText.trim()}
                        onClick={async () => {
                          if (!logsModalDoc) return
                          const remark = remarkText.trim()
                          if (!remark) return
                          try {
                            setActionBusyId(logsModalDoc.id)
                            const token = localStorage.getItem('token')
                            const res = await fetch(`${API_URL}/documents/${logsModalDoc.id}`, {
                              method: 'PATCH',
                              headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                addLog: {
                                  label: `Remarks: ${remark}`,
                                  color: 'bg-sky-600',
                                  byOffice: userContext.office,
                                  byUser: userContext.fullName || userContext.username,
                                },
                              }),
                            })
                            if (!res.ok) throw new Error('Failed to submit remark')
                            await fetchDocuments()
                            setRemarkText("")
                            closeLogsModal()
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : 'Failed to submit remark')
                          } finally {
                            setActionBusyId(null)
                          }
                        }}
                        className="h-10 rounded-xl bg-emerald-600 px-6 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-95 disabled:scale-100 disabled:opacity-50"
                      >
                        {actionBusyId === logsModalDoc.id ? 'Sending...' : 'Submit'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      }

      {
        transferModalDoc ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) closeTransferModal()
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-6">
                <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Confirm Transfer</div>
                      <div className="truncate text-xs text-slate-600">{transferModalDoc.trackingNo}</div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
                    {/* Destination choice */}
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Select Destination</div>
                      <div className="flex flex-col gap-2">
                        {(() => {
                          const doc = transferModalDoc
                          const prEnabled = doc.particulars.some((p: any) => p.label === "PR")
                          const obrEnabled = doc.particulars.some((p: any) => p.label === "OBR")
                          const fundLower = String(doc.fund || "").trim().toLowerCase()
                          const isTrustFund = Boolean(fundLower) && fundLower.includes("trust")
                          const isGeneralFund = Boolean(fundLower) && fundLower.includes("general")
                          const gsoApproved = hasApprovedByOffice(doc, "gso")
                          const alreadyTransferred = hasTransferredLog(doc)

                          // Smart routing logic
                          let canBudget = false
                          let canPto = false
                          let budgetNote = "For OBR Signing"
                          let ptoNote = "For PR Signing"
                          let autoHighlight: "BUDGET" | "PTO" | null = null

                          // Check if document can be transferred (not already transferred and approved)
                          const canTransfer = !alreadyTransferred && gsoApproved

                          if (canTransfer) {
                            if (isTrustFund) {
                              // Trust Fund → PTO only
                              canBudget = false
                              canPto = true
                              budgetNote = "Not available - Trust Fund documents go to PTO"
                              ptoNote = "For PR Signing (Trust Fund)"
                              autoHighlight = "PTO"
                            } else if (obrEnabled) {
                              // Has OBR (any fund) → BUDGET only
                              canBudget = true
                              canPto = false
                              budgetNote = "For OBR Signing (Document has OBR)"
                              ptoNote = "Not available - Document already has OBR"
                              autoHighlight = "BUDGET"
                            } else {
                              // No OBR (PR only) → PTO only
                              canBudget = false
                              canPto = true
                              budgetNote = "Not available - No OBR assigned yet"
                              ptoNote = "For PR Signing (Document has no OBR)"
                              autoHighlight = "PTO"
                            }
                          } else {
                            // Cannot transfer (already transferred or not approved)
                            canBudget = false
                            canPto = false
                          }

                          // Auto-select the highlighted option
                          if (autoHighlight && transferModalDest !== autoHighlight) {
                            setTransferModalDest(autoHighlight)
                          }

                          const options: { value: "BUDGET" | "PTO"; label: string; sub: string; enabled: boolean; highlight: boolean }[] = [
                            { value: "BUDGET", label: "BUDGET", sub: budgetNote, enabled: canBudget, highlight: autoHighlight === "BUDGET" },
                            { value: "PTO", label: "PTO", sub: ptoNote, enabled: canPto, highlight: autoHighlight === "PTO" },
                          ]

                          return options.map(({ value, label, sub, enabled, highlight }) => (
                            <label
                              key={value}
                              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${!enabled
                                ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-40"
                                : highlight
                                  ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400"
                                  : transferModalDest === value
                                    ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500"
                                    : "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/40"
                                }`}
                            >
                              <input
                                type="radio"
                                name="transferDest"
                                value={value}
                                disabled={!enabled}
                                checked={transferModalDest === value}
                                onChange={() => enabled && setTransferModalDest(value)}
                                className="mt-0.5 accent-sky-600"
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-semibold text-slate-900">{label}</div>
                                  {highlight && (
                                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                                      Recommended
                                    </span>
                                  )}
                                </div>
                                <div className={`text-xs ${enabled ? "text-slate-500" : "text-slate-400 italic"}`}>{sub}</div>
                              </div>
                            </label>
                          ))
                        })()}
                      </div>
                    </div>

                    <div className="text-xs text-slate-500">
                      This will move the document to the receiving office queue.
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setTransferModalDoc(null)}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={actionBusyId === transferModalDoc.id}
                      onClick={async () => {
                        const doc = transferModalDoc
                        const dest = transferModalDest
                        closeTransferModal()
                        await transferDocument(doc, dest)
                      }}
                      className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      }

      {
        updateSuccess ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) setUpdateSuccess(null)
            }}
          >
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="text-base font-semibold text-slate-900">Updated Successfully</div>
              </div>
              <div className="px-4 py-4 text-sm text-slate-700">
                Request <span className="font-medium">{updateSuccess.trackingNo}</span> has been updated.
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={() => setUpdateSuccess(null)}
                  className="inline-flex h-9 items-center justify-center rounded bg-sky-600 px-4 text-sm font-medium text-white transition hover:bg-sky-700"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        ) : null
      }

      {
        returnedModalOpen ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) setReturnedModalOpen(false)
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-6">
                <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Returned Documents</div>
                      <div className="truncate text-xs text-slate-600">Review returned items and take action</div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto p-4">
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full text-left text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
                        <thead className="bg-blue-600 text-white">
                          <tr className="border-b border-blue-700">
                            <th className="px-3.5 py-3 text-xs font-bold uppercase tracking-wider text-white">Returned At</th>
                            <th className="px-3.5 py-3 text-xs font-bold uppercase tracking-wider text-white">Tracking #</th>
                            <th className="px-3.5 py-3 text-xs font-bold uppercase tracking-wider text-white">Purpose</th>
                            <th className="px-3.5 py-3 text-xs font-bold uppercase tracking-wider text-white">Amount</th>
                            <th className="px-3.5 py-3 text-xs font-bold uppercase tracking-wider text-white">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {returnedDocs.map((doc) => (
                            <tr key={doc.id} className="align-top hover:bg-slate-50">
                              <td className="px-3 py-2 text-xs text-slate-700">{getReturnedTimestamp(doc)}</td>
                              <td className="px-3 py-2 text-xs font-semibold text-slate-900">{doc.trackingNo}</td>
                              <td className="px-3 py-2 text-xs text-slate-700">
                                <div className="max-w-md whitespace-pre-wrap">{doc.purpose}</div>
                              </td>
                              <td className="px-3 py-2 text-xs font-semibold text-slate-900">₱ {formatPeso(doc.amount)}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={actionBusyId === doc.id}
                                    onClick={() => setReturnedReceiveConfirmDoc(doc)}
                                    className="inline-flex h-7 items-center justify-center rounded bg-emerald-600 px-2 text-[10px] font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Received
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {returnedDocs.length === 0 ? (
                            <tr>
                              <td className="px-3 py-8 text-center text-sm text-slate-500" colSpan={5}>
                                No returned documents.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setReturnedModalOpen(false)}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      }

      {
        returnedReceiveConfirmDoc ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) setReturnedReceiveConfirmDoc(null)
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-6">
                <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Confirm Received</div>
                      <div className="truncate text-xs text-slate-600">{returnedReceiveConfirmDoc.trackingNo}</div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4">
                    {(() => {
                      // Find the return log
                      const rawLogs = Array.isArray(returnedReceiveConfirmDoc?.logs)
                        ? (returnedReceiveConfirmDoc?.logs as any[])
                        : []
                      const isBackToEndUserLog = (l: any) => {
                        const label = String(l?.label || '').trim().toLowerCase()
                        if (!label) return false
                        // Primary signals used by this app
                        if (label.startsWith('transferred to end user')) return true
                        if (label.includes('transferred to end user')) return true
                        if (label.startsWith('transferred to end-user')) return true
                        if (label.includes('transferred to end-user')) return true
                        if (label.startsWith('returned to end user')) return true
                        if (label.includes('returned to end user')) return true
                        return false
                      }

                      const returnLogs = rawLogs.filter(isBackToEndUserLog)

                      const returnLog = (() => {
                        // IMPORTANT: Prefer array order (newest last). Some logs may have missing/invalid createdAt,
                        // so sorting by createdAt can incorrectly pick an older office.
                        for (let i = rawLogs.length - 1; i >= 0; i--) {
                          const l = rawLogs[i]
                          if (isBackToEndUserLog(l)) return l
                        }
                        return null
                      })()

                      if (!returnLog) return null

                      const returnedByOffice = String(returnLog?.byOffice || 'Unknown').trim()
                      const returnedByName = String(returnLog?.byUser || 'Unknown').trim()

                      const subCountRaw = Array.isArray(returnedReceiveConfirmDoc?.subDocuments)
                        ? returnedReceiveConfirmDoc.subDocuments.length
                        : 0
                      const voucherCount = 1 + subCountRaw
                      const voucherLabel = voucherCount === 1 ? 'Voucher' : 'Vouchers'

                      return (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Return Information</div>
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-600">Returned by:</span>
                              <span className="text-sm font-semibold text-slate-900">{returnedByOffice}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-600">Name:</span>
                              <span className="text-sm font-semibold text-slate-900">{returnedByName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-600">{voucherLabel} to process:</span>
                              <span className="text-sm font-semibold text-slate-900">{voucherCount}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Details</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">Mark this document as received?</div>
                      <div className="mt-1 text-xs text-slate-600">This will move it to your Ongoing tab.</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setReturnedReceiveConfirmDoc(null)}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={actionBusyId === returnedReceiveConfirmDoc.id}
                      onClick={async () => {
                        const doc = returnedReceiveConfirmDoc
                        setReturnedReceiveConfirmDoc(null)
                        await receiveReturnedDocument(doc)
                      }}
                      className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      }

      {
        reprocessConfirmDoc ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) setReprocessConfirmDoc(null)
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-6">
                <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Confirm Reprocess</div>
                      <div className="truncate text-xs text-slate-600">{reprocessConfirmDoc.trackingNo}</div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Details</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">Re-process this document?</div>
                      <div className="mt-1 text-xs text-slate-600">Select which office to send the document to:</div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-700">Destination Office</label>
                      <select
                        value={reprocessDest}
                        onChange={(e) => { setReprocessDest(e.target.value); setReprocessTask("") }}
                        title="Select destination office"
                        aria-label="Select destination office"
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      >
                        {getAvailableReprocessDestinations(reprocessConfirmDoc).map((dest) => (
                          <option key={dest.value} value={dest.value}>
                            {dest.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {reprocessDest && (() => {
                      const tasks = transferTasksByOffice[reprocessDest.toUpperCase()] || []
                      if (tasks.length === 0) return null
                      return (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-700">Task</label>
                          <select
                            value={reprocessTask}
                            onChange={(e) => setReprocessTask(e.target.value)}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                          >
                            <option value="">— Select task —</option>
                            {tasks.map((t, i) => (
                              <option key={i} value={t.task || ""}>{t.task}</option>
                            ))}
                            <option value="__others__">Others</option>
                          </select>
                        </div>
                      )
                    })()}

                    {reprocessTask === "__others__" && (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-700">Remarks</label>
                        <input
                          value={remarkText}
                          onChange={(e) => setRemarkText(e.target.value)}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                          placeholder="Enter remarks..."
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                    <button
                      type="button"
                      onClick={() => { setReprocessConfirmDoc(null); setReprocessTask("") }}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={actionBusyId === reprocessConfirmDoc.id || !reprocessDest || (() => {
                        const tasks = transferTasksByOffice[reprocessDest.toUpperCase()] || []
                        if (tasks.length === 0) return false
                        if (!reprocessTask) return true
                        if (reprocessTask === "__others__" && !remarkText.trim()) return true
                        return false
                      })()}
                      onClick={async () => {
                        const doc = reprocessConfirmDoc
                        const finalRemark = reprocessTask === "__others__"
                          ? remarkText.trim()
                          : reprocessTask || remarkText.trim()
                        setReprocessConfirmDoc(null)
                        setReprocessTask("")
                        await reprocessReturnedDocument(doc, reprocessDest, finalRemark)
                      }}
                      className="inline-flex h-9 items-center justify-center rounded bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      }

      {
        reprocessConfirmSubDoc ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) setReprocessConfirmSubDoc(null)
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-6">
                <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Confirm Reprocess Sub-Doc</div>
                      <div className="truncate text-xs text-slate-600">{reprocessConfirmSubDoc.subDoc.trackingNo}</div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Details</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">Re-process this sub-document?</div>
                      <div className="mt-1 text-xs text-slate-600">Select which office to send the sub-document to:</div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-700">Destination Office</label>
                      <select
                        value={reprocessDest}
                        onChange={(e) => { setReprocessDest(e.target.value); setReprocessTask("") }}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      >
                        {getAvailableReprocessDestinationsForSubDoc({ ...reprocessConfirmSubDoc.parentDoc, logs: reprocessConfirmSubDoc.subDoc.logs } as any).map((dest) => (
                          <option key={dest.value} value={dest.value}>
                            {dest.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {reprocessDest && (() => {
                      const tasks = transferTasksByOffice[reprocessDest.toUpperCase()] || []
                      if (tasks.length === 0) return null
                      return (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-700">Task</label>
                          <select
                            value={reprocessTask}
                            onChange={(e) => setReprocessTask(e.target.value)}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                          >
                            <option value="">— Select task —</option>
                            {tasks.map((t, i) => (
                              <option key={i} value={t.task || ""}>{t.task}</option>
                            ))}
                            <option value="__others__">Others</option>
                          </select>
                        </div>
                      )
                    })()}

                    {reprocessTask === "__others__" && (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-700">Remarks</label>
                        <input
                          value={remarkText}
                          onChange={(e) => setRemarkText(e.target.value)}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                          placeholder="Enter remarks..."
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                    <button
                      type="button"
                      onClick={() => { setReprocessConfirmSubDoc(null); setReprocessTask("") }}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={actionBusyId === `${reprocessConfirmSubDoc.parentDoc.id}-sub-${reprocessConfirmSubDoc.index}` || !reprocessDest || (() => {
                        const tasks = transferTasksByOffice[reprocessDest.toUpperCase()] || []
                        if (tasks.length === 0) return false
                        if (!reprocessTask) return true
                        if (reprocessTask === "__others__" && !remarkText.trim()) return true
                        return false
                      })()}
                      onClick={async () => {
                        const { parentDoc, index } = reprocessConfirmSubDoc
                        const finalRemark = reprocessTask === "__others__"
                          ? remarkText.trim()
                          : reprocessTask || remarkText.trim()
                        await reprocessReturnedSubDocument(parentDoc, index, reprocessDest, finalRemark)
                        setReprocessTask("")
                      }}
                      className="inline-flex h-9 items-center justify-center rounded bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      }

      {/* Cancel / Discontinue Confirmation Modal */}
      {
        cancelConfirmDoc ? (
          <div className="fixed inset-0 z-9999 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCancelConfirmDoc(null)} />
            <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 bg-rose-50 px-5 py-4 border-b border-rose-100">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100">
                  <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Discontinue Request</h3>
                  <p className="text-xs text-slate-500 mt-0.5">This action cannot be undone</p>
                </div>
              </div>
              {/* Body */}
              <div className="px-5 py-5">
                <p className="text-sm text-slate-600">
                  Are you sure you want to discontinue tracking number{" "}
                  <span className="font-semibold text-slate-800">{cancelConfirmDoc.trackingNo}</span>?
                </p>
                <p className="mt-1 text-xs text-slate-400">The document will be moved to the <strong>Discontinued</strong> tab.</p>
              </div>
              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setCancelConfirmDoc(null)}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none"
                >
                  Keep Request
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === cancelConfirmDoc.id}
                  onClick={async () => {
                    const doc = cancelConfirmDoc
                    setCancelConfirmDoc(null)
                    await executeCancelDocument(doc)
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none"
                >
                  {actionBusyId === cancelConfirmDoc.id ? 'Processing…' : 'Yes, Discontinue'}
                </button>
              </div>
            </div>
          </div>
        ) : null
      }

      {/* Request Return to Approvals Modal */}
      {requestReturnDoc ? (
        <div className="fixed inset-0 z-9999 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !requestReturnBusy && setRequestReturnDoc(null)} />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50/80 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <RotateCcw className="size-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Request Return to Approvals</h3>
                  <p className="text-xs text-slate-500">{requestReturnDoc.trackingNo}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={requestReturnBusy}
                onClick={() => setRequestReturnDoc(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 p-3 text-xs text-amber-900">
                <p className="font-semibold">Notify Admin</p>
                <p className="mt-0.5 text-amber-700 text-[11px]">
                  This will submit a request to Admin to return this ongoing document back to the Approvals / Pre-Validation stage.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700" htmlFor="returnReasonText">
                  Reason for Return <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="returnReasonText"
                  rows={3}
                  value={requestReturnReason}
                  onChange={(e) => setRequestReturnReason(e.target.value)}
                  placeholder="e.g. Need to adjust items or signatories before proceeding..."
                  className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
              <button
                type="button"
                disabled={requestReturnBusy}
                onClick={() => setRequestReturnDoc(null)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={requestReturnBusy || !requestReturnReason.trim()}
                onClick={async () => {
                  try {
                    setRequestReturnBusy(true)
                    const token = localStorage.getItem("token")
                    const res = await fetch(`${API_URL}/documents/${requestReturnDoc.id}`, {
                      method: "PATCH",
                      headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        requestReturnToApprovals: true,
                        returnReason: requestReturnReason.trim(),
                      }),
                    })
                    if (!res.ok) {
                      const errText = await res.text()
                      throw new Error(errText || "Failed to submit request")
                    }
                    toast.success("Request for return submitted. Admin has been notified.")
                    setRequestReturnDoc(null)
                    setRequestReturnReason("")
                    await fetchDocuments({ silent: true })
                  } catch (err: any) {
                    toast.error(err.message || "Failed to submit request")
                  } finally {
                    setRequestReturnBusy(false)
                  }
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {requestReturnBusy ? "Submitting…" : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Sub-Document Edit Modal */}
      {
        editingSubDoc ? (
          <div className="fixed inset-0 z-10000 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditingSubDoc(null)} />
            <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50">
                <h3 className="text-base font-semibold text-slate-800">Edit Sub-Document Details</h3>
                <button onClick={() => setEditingSubDoc(null)} className="text-slate-400 hover:text-slate-600">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="px-5 py-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Tracking Number</label>
                  <input
                    type="text"
                    value={editingSubDoc.trackingNo}
                    readOnly
                    className="h-10 w-full rounded-md border border-slate-200 bg-slate-100 px-3 text-sm text-slate-700 cursor-not-allowed"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Purpose</label>
                  <textarea
                    value={editingSubDoc.purpose}
                    readOnly
                    className="w-full rounded-md border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700 cursor-not-allowed min-h-[100px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Amount</label>
                  <input
                    type="text"
                    value={editingSubDoc.amount}
                    onChange={(e) => {
                      const val = e.target.value
                      setEditingSubDoc(prev => prev ? { ...prev, amount: formatPesoInput(val, false) } : null)
                    }}
                    onBlur={() => {
                      setEditingSubDoc(prev => prev && prev.amount ? { ...prev, amount: formatPesoInput(prev.amount, true) } : prev)
                    }}
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-sky-500 focus:outline-none"
                    placeholder="Enter amount"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Supplier</label>
                  <input
                    type="text"
                    value={editingSubDoc.supplier || ""}
                    onChange={(e) => setEditingSubDoc(prev => prev ? { ...prev, supplier: e.target.value } : null)}
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-sky-500 focus:outline-none"
                    placeholder="Enter supplier"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setEditingSubDoc(null)}
                  className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={subDocActionBusy}
                  onClick={async () => {
                    try {
                      setSubDocActionBusy(true)
                      const parentDoc = documents.find(d => d.id === editingSubDoc.parentId)
                      if (!parentDoc || !parentDoc.subDocuments) return

                      const nextSubDocs = [...parentDoc.subDocuments]
                      nextSubDocs[editingSubDoc.index] = {
                        ...nextSubDocs[editingSubDoc.index],
                        trackingNo: editingSubDoc.trackingNo,
                        purpose: editingSubDoc.purpose,
                        amount: editingSubDoc.amount,
                        supplier: editingSubDoc.supplier || ''
                      }

                      const parseNum = (val: any) => {
                        const cleaned = String(val || "").replace(/[^0-9.-]/g, "").replace(/,/g, "").trim()
                        const n = Number.parseFloat(cleaned)
                        return Number.isFinite(n) ? n : 0
                      }
                      const parentTotal = parseNum(parentDoc.amount)
                      const mainSupplierAmt = parseNum(parentDoc.supplierAmount)
                      const availableForSubDocs = Math.max(0, parentTotal - mainSupplierAmt)

                      let runningSum = 0
                      for (let i = 0; i < nextSubDocs.length; i++) {
                        const currentAmt = parseNum(nextSubDocs[i].amount)
                        if (i <= editingSubDoc.index) {
                          runningSum += currentAmt
                        } else {
                          const remaining = Math.max(0, availableForSubDocs - runningSum)
                          const subAmt = parseNum(nextSubDocs[i].amount)
                          if (subAmt === availableForSubDocs || subAmt > remaining) {
                            nextSubDocs[i] = {
                              ...nextSubDocs[i],
                              amount: formatPesoInput(String(remaining), true)
                            }
                          }
                          runningSum += parseNum(nextSubDocs[i].amount)
                        }
                      }

                      const token = localStorage.getItem('token')
                      const res = await fetch(`${API_URL}/documents/${editingSubDoc.parentId}`, {
                        method: 'PATCH',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          subDocuments: nextSubDocs,
                          addLog: {
                            label: `Updated Sub-Document #${editingSubDoc.index + 1}`,
                            color: 'bg-sky-600',
                            byOffice: actorMeta.byOffice,
                            byUser: actorMeta.byUser
                          }
                        }),
                      })

                      if (!res.ok) throw new Error('Failed to update sub-document')

                      await fetchDocuments()
                      setEditingSubDoc(null)
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Update failed')
                    } finally {
                      setSubDocActionBusy(false)
                    }
                  }}
                  className="h-9 px-4 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 transition disabled:opacity-50"
                >
                  {subDocActionBusy ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        ) : null
      }

      {/* Main Document Edit Modal */}
      {
        editingMainDoc ? (
          <div className="fixed inset-0 z-10001 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !mainDocActionBusy && setEditingMainDoc(null)} />
            <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Edit Document Details</h3>
                  <div className="text-xs text-slate-500 mt-0.5">{editingMainDoc.trackingNo}</div>
                </div>
                <button
                  onClick={() => !mainDocActionBusy && setEditingMainDoc(null)}
                  className="text-slate-400 hover:text-slate-600"
                  type="button"
                >
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="px-5 py-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Supplier</label>
                  <input
                    type="text"
                    value={editingMainDoc.supplier}
                    onChange={(e) => setEditingMainDoc((prev) => (prev ? { ...prev, supplier: e.target.value } : null))}
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-sky-500 focus:outline-none"
                    placeholder="Enter supplier"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Amount</label>
                  <input
                    type="text"
                    value={editingMainDoc.supplierAmount}
                    onChange={(e) => {
                      const val = e.target.value
                      setEditingMainDoc((prev) => (prev ? { ...prev, supplierAmount: formatPesoInput(val, false) } : null))
                    }}
                    onBlur={() => {
                      setEditingMainDoc((prev) => (prev && prev.supplierAmount ? { ...prev, supplierAmount: formatPesoInput(prev.supplierAmount, true) } : prev))
                    }}
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-sky-500 focus:outline-none"
                    placeholder="Enter amount"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setEditingMainDoc(null)}
                  disabled={mainDocActionBusy}
                  className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={mainDocActionBusy}
                  onClick={async () => {
                    try {
                      setMainDocActionBusy(true)
                      const supplier = String(editingMainDoc.supplier || '').trim()
                      const supplierAmount = String(editingMainDoc.supplierAmount || '').trim()
                      const token = localStorage.getItem('token')
                      const res = await fetch(`${API_URL}/documents/${editingMainDoc.id}`, {
                        method: 'PATCH',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          supplier,
                          supplierAmount,
                          addLog: {
                            label: 'Updated Supplier',
                            color: 'bg-sky-600',
                            byOffice: actorMeta.byOffice,
                            byUser: actorMeta.byUser,
                          },
                        }),
                      })
                      if (!res.ok) {
                        const errText = await res.text().catch(() => '')
                        throw new Error(errText || 'Failed to update supplier')
                      }

                      await fetchDocuments()
                      setEditingMainDoc(null)
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Update failed')
                    } finally {
                      setMainDocActionBusy(false)
                    }
                  }}
                  className="h-9 px-4 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {mainDocActionBusy ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        ) : null
      }

      {/* Routing Slip Modal */}
      <RoutingSlipModal rsDoc={routingSlipDoc} onClose={() => setRoutingSlipDoc(null)} />
    </div>
  )
}