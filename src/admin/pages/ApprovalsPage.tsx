import { Download, History, Pencil, Plus } from "lucide-react"
import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ObrTemplatePreview, { type ObrTemplateModel } from "../../components/ObrTemplatePreview"
import ObrTemplatePdf from "../../components/ObrTemplatePdf"
import { pdf } from "@react-pdf/renderer"
import PrTemplatePreview from "../../components/PrTemplatePreview"
import DvTemplatePreview, { type DvTemplateModel } from "../../components/DvTemplatePreview"
import PoTemplatePreview, { type PoTemplateModel, type PoItem } from "../../components/PoTemplatePreview"
import EditPoModal from "../../components/EditPoModal"
import { useDocumentSocket } from "../../hooks/useSocket"
import { toast } from "../../lib/toast"
import { getSubDocAmount, getMainDocSupplierInfo } from "../../users/types/documentTypes"
import { formatLogRemarks } from "../../utils/formatLogRemarks"
import NewRequestModal, { type NewRequestPayload } from "../../users/components/NewRequestModal"

type ApprovalRow = {
  timestamp: string
  trackingNo: string
  requestor: string
  references: {
    pr: string
    obr: string
  }
  referenceNos: {
    prNo: string
    obrNo: string
  }
  createdBy: string
  purpose: string
  attachments: {
    pr?: string
    obr?: string
    driveLink?: string
  }
  routingSlip: {
    label: string
    checked: boolean
  }[]
  logs: {
    label: string
    tone: "ok" | "warn" | "info" | "danger" | "muted"
  }[]
  sourceOfFund: string
  gsoRoutingSlip: string
  amount: string
  status: "pending" | "for-revision" | "approved" | "returned" | "reprocessed"

  // new fields for sub-doc handling
  isSubDocument?: boolean
  subDocIndex?: number
  parentTrackingNo?: string
  parentDocId?: string
  supplier?: string
  rawLogs: any[]
  currentStatus: string

  doc: ApiDocument
}

function inferCurrentLocation(
  statusRaw: string,
  officeRaw: string,
  logs?: Array<{ label?: string }> | null
) {
  const s = String(statusRaw || "").toLowerCase()
  if (s === "in-budget") return "BUDGET"
  if (s === "in-pto") return "PTO"
  if (s === "pending-bac" || s.includes("bac")) return "BAC"
  if (s === "pending-gso" || s.includes("gso")) return "GSO"
  if (s === "ready-transfer") return "PROCUREMENT"
  if (s === "returned") return "RETURNED"
  if (s === "completed" || s === "approved") return "COMPLETED"

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

  const office = String(officeRaw || "").trim()
  return office ? office.toUpperCase() : "N/A"
}

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

type ApiDocument = {
  _id: string
  trackingNo: string
  createdBy: string
  office?: string
  fund?: string
  gsoRoutingSlip?: string
  section?: string
  fpp?: string
  department?: string
  contactNumber?: string
  responsibilityCenter?: string
  accountCode?: string
  email?: string
  requestedByName?: string
  requestedByDesignation?: string
  prItems?: Array<{
    itemNo?: string
    unit?: string
    description?: string
    quantity?: string
    unitCost?: string
    totalCost?: string
  }>
  purpose: string
  notes?: string
  amount?: string
  status?: string
  driveLink?: string
  prEnabled?: boolean
  obrEnabled?: boolean
  prNo?: string
  obrNo?: string
  logs?: Array<{ label?: string; color?: string; byOffice?: string; byUser?: string; createdAt?: string | number | Date }>
  createdAt?: string
  subDocuments?: Array<{
    trackingNo: string
    purpose: string
    amount: string
    supplier?: string
    status: string
    logs?: Array<{ label?: string; color?: string; byOffice?: string; byUser?: string; createdAt?: string | number | Date }>
  }>
}

function mapLogToneFromColor(raw: string): ApprovalRow["logs"][number]["tone"] {
  const c = String(raw || "").toLowerCase()
  if (c.includes("rose") || c.includes("red")) return "danger"
  if (c.includes("amber") || c.includes("yellow")) return "warn"
  if (c.includes("emerald") || c.includes("green")) return "ok"
  if (c.includes("slate") || c.includes("gray") || c.includes("grey")) return "muted"
  return "info"
}

function parseLogActionAndRemarks(labelRaw: string, byOfficeRaw: string) {
  const label = String(labelRaw || '').trim()
  const labelLower = label.toLowerCase()
  const byOffice = String(byOfficeRaw || '').trim()

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
    const officeFromLabel = (() => {
      const m = label.match(/received\s+by\s+([^(:]+?)(?:\(|:|$)/i)
      return String(m?.[1] || '').trim()
    })()
    const office = officeFromLabel || byOffice

    const task = (() => {
      // Only parse "Received for ..." as task. If label is "Received by ..." then don't treat it as remarks.
      const m = label.match(/^received\s+for\s+(.*)$/i)
      return String(m?.[1] || '').trim()
    })()

    const officeUpper = (() => {
      const raw = String(office || '').trim()
      if (!raw) return ''
      const upper = raw.toUpperCase()
      if (upper.includes('END USER') || upper.includes('END USERS')) return 'END USER'
      return upper
    })()

    const remarksRaw = task || taskFromParens || taskFromColon || '-'
    return {
      action: officeUpper ? `Received by ${officeUpper}` : 'Received',
      remarks: formatLogRemarks(remarksRaw),
    }
  }

  if (labelLower.includes('transferred to')) {
    const dest = (() => {
      const m = label.match(/transferred\s+to\s+([^(:]+?)(?:\(|:|$)/i)
      return String(m?.[1] || '').trim()
    })()

    const remarksRaw = taskFromParens || taskFromColon || '-'

    if (!dest) return { action: 'Transferred', remarks: formatLogRemarks(remarksRaw) }
    const destUpper = dest.toUpperCase()
    const isEndUser = destUpper.includes('END USER') || destUpper.includes('END USERS')
    return { action: isEndUser ? 'Transferred to END USER' : `Transferred to ${destUpper}`, remarks: formatLogRemarks(remarksRaw) }
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
    return {
      action: String(parts[0] || '').trim() || '-',
      remarks: formatLogRemarks(parts.slice(1).join(':').trim()) || '-',
    }
  }

  return { action: label || '-', remarks: '-' }
}


function parseDurationToMs(durationStr: string): number {
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

function formatElapsedShort(ms: number) {
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const days = Math.floor(hr / 24);
  return `${days}d ${hr % 24}h`;
}

function LogBar({ label, tone }: { label: string; tone: ApprovalRow["logs"][number]["tone"] }) {
  const className = useMemo(() => {
    switch (tone) {
      case "ok":
        return "bg-emerald-600 text-white"
      case "danger":
        return "bg-rose-500 text-white"
      case "warn":
        return "bg-amber-400 text-slate-900"
      case "muted":
        return "bg-slate-200 text-slate-900"
      default:
        return "bg-sky-500 text-white"
    }
  }, [tone])

  return (
    <div
      className={`w-full rounded px-2 py-1 text-center text-[10px] font-semibold leading-none ${className}`}
      title={label}
    >
      <span className="block truncate">{label}</span>
    </div>
  )
}

type ApprovalsPageProps = {
  title?: string
  actionMode?: "full" | "logsOnly"
  filterReceivedOnly?: boolean
  filterTransferredToCurrentOfficeOnly?: boolean
  filterTransferredPendingOnly?: boolean
  logsOnlyActionMode?: "full" | "reviewLogsOnly" | "historyOnly" | "viewOnly"
  officePrivileges?: string[]
  excludeApprovalProcessed?: boolean
  restrictToCurrentOfficeScope?: boolean
  requireTransferLog?: boolean
  excludeTransferPending?: boolean
  filterRecentlyTransferredOnly?: boolean
  excludeTerminalStatuses?: boolean
}

type PreviewType = "OBR" | "PR" | "DV" | "PO" | "PO"

export default function ApprovalsPage({
  title = "Approvals",
  actionMode = "full",
  filterReceivedOnly = false,
  filterTransferredToCurrentOfficeOnly = false,
  filterTransferredPendingOnly = false,
  logsOnlyActionMode = "full" as "full" | "reviewLogsOnly" | "historyOnly" | "viewOnly",
  officePrivileges,
  excludeApprovalProcessed = false,
  restrictToCurrentOfficeScope = false,
  requireTransferLog = false,
  excludeTransferPending = false,
  filterRecentlyTransferredOnly = false,
  excludeTerminalStatuses = false,
}: ApprovalsPageProps) {
  const [rows, setRows] = useState<ApprovalRow[]>([])
  const [routingSlipMap, setRoutingSlipMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [pageSize, setPageSize] = useState(10)
  const [preview, setPreview] = useState<{ type: PreviewType; row: ApprovalRow } | null>(null)
  const [prActivePage, setPrActivePage] = useState(0)
  const [prPdfBusy, setPrPdfBusy] = useState(false)
  const [obrPdfBusy, setObrPdfBusy] = useState(false)
  const [isEditPoModalOpen, setIsEditPoModalOpen] = useState(false)
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false)
  const [hasDraft, setHasDraft] = useState(false)

  const checkDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem("user")
      const parsed = raw ? (JSON.parse(raw) as { username?: string } | null) : null
      const uname = String(parsed?.username || "").trim()
      setHasDraft(!!localStorage.getItem(`new_request_draft:${uname || "_"}`))
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

  const handleCreateNewRequest = async (payload: NewRequestPayload) => {
    try {
      setLoading(true)
      setError(null)
      const now = new Date()
      const pad2 = (n: number) => String(n).padStart(2, "0")
      const hour12 = now.getHours() % 12 || 12
      const yyyymmdd = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
      const hhmmss = `${pad2(hour12)}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
      const rand5 = Math.floor(Math.random() * 100000).toString().padStart(5, "0")
      const trackingNo = `${yyyymmdd}-${hhmmss}-${rand5}`

      const userRaw = localStorage.getItem("user")
      const parsedUser = userRaw
        ? (JSON.parse(userRaw) as { username?: string; fullName?: string; office?: string } | null)
        : null
      const createdBy =
        (parsedUser as any)?.role === "admin" ||
        (parsedUser as any)?.role === "superadmin" ||
        String(parsedUser?.username || "").toLowerCase() === "admin"
          ? "System Administrator"
          : parsedUser?.fullName || parsedUser?.username || "System Administrator"
      const office = payload.department || parsedUser?.office || "ADMIN"
      const token = localStorage.getItem("token")

      const response = await fetch(`${API_URL}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingNo, createdBy, office,
          fund: payload.fund, section: payload.section, fpp: payload.fpp,
          department: payload.department, contactNumber: payload.contactNumber,
          responsibilityCenter: payload.responsibilityCenter, accountCode: payload.accountCode,
          email: payload.email, requestedByName: payload.requestedByName,
          requestedByDesignation: payload.requestedByDesignation,
          cashAvailabilityName: payload.cashAvailabilityName,
          cashAvailabilityDesignation: payload.cashAvailabilityDesignation,
          approvedByName: payload.approvedByName, approvedByDesignation: payload.approvedByDesignation,
          certifiedAName: payload.certifiedAName, certifiedAPosition: payload.certifiedAPosition,
          certifiedBName: payload.certifiedBName, certifiedBPosition: payload.certifiedBPosition,
          driveLink: payload.driveLink, prItems: payload.prItems,
          purpose: payload.purpose, notes: payload.notes,
          particulars: [
            ...(payload.prEnabled ? [{ label: "PR", color: "bg-blue-500" }] : []),
            ...(payload.obrEnabled ? [{ label: "OBR", color: "bg-amber-500" }] : []),
          ],
          prEnabled: payload.prEnabled, obrEnabled: payload.obrEnabled, amount: payload.amount,
        }),
      })

      if (!response.ok) {
        const msg = await response.text().catch(() => "")
        throw new Error(msg || "Failed to submit request")
      }

      await fetchRows()
      try {
        const uname = String(parsedUser?.username || "").trim()
        localStorage.removeItem(`new_request_draft:${uname || "_"}`)
        window.dispatchEvent(new CustomEvent("dts:draft_changed"))
      } catch { /* ignore */ }
      setIsNewRequestModalOpen(false)
      toast.success(`Request submitted! Tracking No: ${trackingNo}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit request")
      toast.error(e instanceof Error ? e.message : "Failed to submit request")
    } finally {
      setLoading(false)
    }
  }

  const [editPrPreviewOpen, setEditPrPreviewOpen] = useState(false)
  const [editPrPreviewBusy, setEditPrPreviewBusy] = useState(false)
  const [editPrPreviewError, setEditPrPreviewError] = useState<string | null>(null)
  const [editPrPreviewDraft, setEditPrPreviewDraft] = useState<{
    department: string
    section: string
    prNo: string
    prDate: string
    fpp: string
    purpose: string
    prItems: Array<{ unit?: string; description?: string; quantity?: string; unitCost?: string; totalCost?: string }>
    requestedByName: string
    requestedByDesignation: string
    cashAvailabilityName: string
    cashAvailabilityDesignation: string
    approvedByName: string
    approvedByDesignation: string
  } | null>(null)

  const [logsRow, setLogsRow] = useState<ApprovalRow | null>(null)
  const [historyTab, setHistoryTab] = useState<"prevalidation" | "transactions" | "subdocuments">("transactions")

  const [receiveConfirmRow, setReceiveConfirmRow] = useState<ApprovalRow | null>(null)
  const [receiveConfirmMessage, setReceiveConfirmMessage] = useState("")
  const [receiveTask, setReceiveTask] = useState<string>("")

  const [completeConfirmRow, setCompleteConfirmRow] = useState<ApprovalRow | null>(null)
  const [completeConfirmRemarks, setCompleteConfirmRemarks] = useState("")

  const [cancelTransferConfirmRow, setCancelTransferConfirmRow] = useState<ApprovalRow | null>(null)

  const [transferRow, setTransferRow] = useState<ApprovalRow | null>(null)
  const [transferDest, setTransferDest] = useState<string>("")
  const [transferOfficeOptions, setTransferOfficeOptions] = useState<string[]>(["GSO", "BAC", "BUDGET", "PTO"])
  const [transferTask, setTransferTask] = useState<string>("")
  const [transferTasksByOffice, setTransferTasksByOffice] = useState<
    Record<
      string,
      Array<{ taskId?: number; task?: string; duration?: string; status?: string }>
    >
  >({})
  const [officeHeads, setOfficeHeads] = useState<Record<string, { head: string; designation: string }>>({})
  const [transferRemarks, setTransferRemarks] = useState("")
  const [subDocCount, setSubDocCount] = useState<number>(0)
  const [subDocItems, setSubDocItems] = useState<Array<{ trackingNo: string; purpose: string; amount: string }>>([])

  const [returnConfirmRow, setReturnConfirmRow] = useState<ApprovalRow | null>(null)
  const [returnConfirmMessage, setReturnConfirmMessage] = useState("")
  const [returnConfirmRemarks, setReturnConfirmRemarks] = useState("")

  const [rowActionBusy, setRowActionBusy] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(timer)
  }, [])

  const [reviewRemarksType, setReviewRemarksType] = useState<"return" | "approve">("return")
  const [reviewRemarks, setReviewRemarks] = useState("")

  const [approveRow, setApproveRow] = useState<ApprovalRow | null>(null)
  const [approveDestOffice, setApproveDestOffice] = useState<string>("BUDGET")

  const [editObrRow, setEditObrRow] = useState<ApprovalRow | null>(null)
  const [editObrValue, setEditObrValue] = useState("")
  const [editObrBusy, setEditObrBusy] = useState(false)

  const actionOfficeLower = useMemo(() => {
    try {
      const raw = localStorage.getItem('user')
      const parsed = raw ? (JSON.parse(raw) as { office?: string } | null) : null
      return String(parsed?.office || '').trim().toLowerCase()
    } catch {
      return ""
    }
  }, [])

  const actionUserLabel = useMemo(() => {
    try {
      const raw = localStorage.getItem('user')
      const parsed = raw ? (JSON.parse(raw) as { fullName?: string; username?: string } | null) : null
      return String(parsed?.fullName || parsed?.username || '').trim()
    } catch {
      return ""
    }
  }, [])

  const actionIsAdmin = useMemo(() => {
    try {
      const raw = localStorage.getItem('user')
      const parsed = raw ? (JSON.parse(raw) as { role?: string } | null) : null
      const r = String(parsed?.role || '').trim().toLowerCase()
      return r === 'admin' || r === 'superadmin'
    } catch {
      return false
    }
  }, [])

  const actionIsBudget = actionOfficeLower.includes('budget')
  const actionIsPto = actionOfficeLower.includes('pto') || actionOfficeLower.includes('treasurer')
  const actionIsGso = actionOfficeLower.includes('gso') || actionOfficeLower.includes('general services')
  const actionIsBac =
    actionOfficeLower.includes('bac') || actionOfficeLower.includes('bids') || actionOfficeLower.includes('awards')

  const hasPrivilege = (name: string) => {
    const needle = String(name || "").trim().toLowerCase()
    if (!needle) return false
    const list = Array.isArray(officePrivileges) ? officePrivileges : []
    return list.some((p) => String(p || "").trim().toLowerCase() === needle)
  }

  const canEditObrNo = actionIsBudget && hasPrivilege("Update CAFOA")

  const hasApprovalLogByCurrentOffice = (doc: { logs?: any[] } | null | undefined) => {
    const logs = Array.isArray(doc?.logs) ? doc!.logs! : []
    if (logs.length === 0) return false

    const officeNeedle = String(actionOfficeLower || '').trim().toLowerCase()
    const officeKeyNeedle = String(currentOfficeKey || '').trim().toLowerCase()

    // Loop from newest to oldest. If we see a "remarks:" log before any approval log,
    // then the office hasn't approved the NEW resubmission yet.
    for (let i = logs.length - 1; i >= 0; i--) {
      const l = logs[i]
      const labelLower = String(l?.label || '').trim().toLowerCase()
      if (!labelLower) continue

      // If there are remarks after the last approval, it means it's back for review!
      if (labelLower.startsWith('remarks:') || labelLower.startsWith('remarks ')) {
        return false
      }

      const isApprovalLog = labelLower.includes('approved') || labelLower.includes('returned')
      if (!isApprovalLog) continue

      const byOfficeLower = String(l?.byOffice || '').trim().toLowerCase()
      // If no office field, check fallback if office name is in the label
      if (!byOfficeLower) {
        if (officeNeedle && (labelLower.startsWith(`${officeNeedle}:`) || labelLower.startsWith(`${officeNeedle} `))) return true
        if (officeKeyNeedle && (labelLower.startsWith(`${officeKeyNeedle.toLowerCase()}:`) || labelLower.startsWith(`${officeKeyNeedle.toLowerCase()} `))) return true
        continue
      }

      if (officeNeedle && (byOfficeLower === officeNeedle || byOfficeLower.includes(officeNeedle) || officeNeedle.includes(byOfficeLower))) {
        return true
      }
      if (officeKeyNeedle && (byOfficeLower === officeKeyNeedle || byOfficeLower.includes(officeKeyNeedle) || officeKeyNeedle.includes(byOfficeLower))) {
        return true
      }
    }

    return false
  }

  const currentOfficeKey = useMemo(() => {
    if (actionIsBudget) return 'BUDGET'
    if (actionIsPto) return 'PTO'
    if (actionIsGso) return 'GSO'
    if (actionIsBac) return 'BAC'
    return String(actionOfficeLower || '').trim().toUpperCase()
  }, [actionIsBac, actionIsBudget, actionIsGso, actionIsPto, actionOfficeLower])

  const currentOfficeTasks = useMemo(() => {
    const tasks = transferTasksByOffice[String(currentOfficeKey || '').toUpperCase()] || []
    return tasks.filter((t) => String(t?.task || '').trim().toLowerCase() !== 'received')
  }, [currentOfficeKey, transferTasksByOffice])

  const returnedLabelForOffice = useMemo(() => {
    if (actionIsBudget) return "Transferred to End User (OBR Signing)"
    if (actionIsPto) return "Transferred to End User (PR Signing)"
    return "Transferred to End User"
  }, [actionIsBudget, actionIsPto])

  const statusForTransferDest = (destRaw: string) => {
    const dest = String(destRaw || '').trim().toUpperCase()
    switch (dest) {
      case "GSO":
        return "pending-gso"
      case "BAC":
        return "pending-bac"
      case "BUDGET":
        return "in-budget"
      case "PTO":
        return "in-pto"
      case "RETURNED":
        return "returned"
      default:
        return "pending"
    }
  }

  const socketRole = useMemo(() => {
    try {
      const raw = localStorage.getItem('user')
      const parsed = raw ? (JSON.parse(raw) as { role?: string } | null) : null
      const roleLower = String(parsed?.role || '').trim().toLowerCase()
      return roleLower || 'admin'
    } catch {
      return 'admin'
    }
  }, [])

  const fetchRowsRef = useRef(fetchRows)
  useEffect(() => {
    fetchRowsRef.current = fetchRows
  }, [fetchRows])

  const openEditPrPreview = (p: NonNullable<typeof preview>) => {
    setEditPrPreviewError(null)
    setEditPrPreviewOpen(true)
    setEditPrPreviewDraft({
      department: String((p.row.doc as any)?.department || '').trim(),
      section: String((p.row.doc as any)?.section || '').trim(),
      prNo: String((p.row.doc as any)?.prNo || '').trim(),
      prDate: String((p.row.doc as any)?.prDate || '').trim(),
      fpp: String((p.row.doc as any)?.fpp || '').trim(),
      purpose: String((p.row.doc as any)?.purpose || '').trim(),
      prItems: Array.isArray((p.row.doc as any)?.prItems) ? (p.row.doc as any).prItems : [],
      requestedByName:
        String((p.row.doc as any)?.requestedByName || '').trim() ||
        officeHeads[p.row.doc.office?.toUpperCase() || '']?.head ||
        'DEPARTMENT HEAD',
      requestedByDesignation:
        String((p.row.doc as any)?.requestedByDesignation || '').trim() ||
        officeHeads[p.row.doc.office?.toUpperCase() || '']?.designation ||
        'Department Head',
      cashAvailabilityName: String((p.row.doc as any)?.cashAvailabilityName || '').trim(),
      cashAvailabilityDesignation: String((p.row.doc as any)?.cashAvailabilityDesignation || '').trim(),
      approvedByName: String((p.row.doc as any)?.approvedByName || '').trim(),
      approvedByDesignation: String((p.row.doc as any)?.approvedByDesignation || '').trim(),
    })
  }

  const closeEditPrPreview = () => {
    setEditPrPreviewOpen(false)
    setEditPrPreviewBusy(false)
    setEditPrPreviewError(null)
    setEditPrPreviewDraft(null)
  }

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleDocumentChange = useCallback(() => {
    if (refreshTimerRef.current) return
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      void fetchRowsRef.current?.()
    }, 300)
  }, [])

  useDocumentSocket(
    {
      userId: socketRole,
      office: 'ADMIN',
      role: socketRole,
    },
    handleDocumentChange
  )

  useEffect(() => {
    ; (async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(`${API_URL}/offices`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (!response.ok) return
        const data = (await response.json()) as {
          offices?: Array<{
            name?: string
            type?: string
            status?: string
            head?: string
            headDesignation?: string
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
          const statusLower = String(o?.status || '').trim().toLowerCase()
          const typeLower = String(o?.type || '').trim().toLowerCase()
          if (!name) continue
          if (statusLower === 'archived') continue
          if (typeLower === 'viewing') continue
          const tasksRaw = Array.isArray(o?.tasks) ? o.tasks : []
          tasksByOffice[name] = tasksRaw
            .filter((t) => String(t?.status || '').toLowerCase() !== 'archived')
            .map((t) => ({
              taskId: t?.taskId,
              task: String(t?.task || '').trim(),
              duration: String(t?.duration || '').trim(),
              status: t?.status,
            }))
            .filter((t) => Boolean(t.task))
        }
        const opts = offices
          .filter((o) => String(o?.status || '').toLowerCase() !== 'archived')
          .filter((o) => String(o?.type || '').toLowerCase() !== 'viewing')
          .map((o) => String(o?.name || '').trim())
          .filter(Boolean)
          .map((n) => n.toUpperCase())
          .sort((a, b) => a.localeCompare(b))

        if (opts.length) {
          const headsMap: Record<string, { head: string; designation: string }> = {}
          for (const o of offices) {
            const n = String(o?.name || '').trim().toUpperCase()
            if (n) {
              headsMap[n] = {
                head: String(o?.head || '').trim(),
                designation: String(o?.headDesignation || '').trim(),
              }
            }
          }
          setOfficeHeads(headsMap)
          setTransferTasksByOffice(tasksByOffice)
          setTransferOfficeOptions(opts)
          setTransferDest((current) => {
            const cur = String(current || '').trim().toUpperCase()
            if (!cur) return ""
            return opts.includes(cur) ? cur : ""
          })
        }
      } catch {
        // ignore
      }
    })()
  }, [])

  useEffect(() => {
    setTransferTask("")
  }, [transferDest])

  useEffect(() => {
    if (!receiveConfirmRow) return
    const firstTask = String(currentOfficeTasks?.[0]?.task || '').trim()
    setReceiveTask((current) => {
      const cur = String(current || '').trim()
      if (!cur) return firstTask
      const stillExists = currentOfficeTasks.some((t) => String(t?.task || '').trim() === cur)
      return stillExists ? cur : firstTask
    })
  }, [currentOfficeTasks, receiveConfirmRow])

  const getLastTransferTimeToOffice = (rawLogs: any[], officeKey: string) => {
    const officeNeedle = String(officeKey || '').trim().toLowerCase()
    if (!officeNeedle) return null
    const prefix = 'transferred to'

    for (let i = rawLogs.length - 1; i >= 0; i -= 1) {
      const labelLower = String(rawLogs[i]?.label || '').trim().toLowerCase()
      if (!labelLower.startsWith(prefix)) continue

      const afterPrefix = labelLower.slice(prefix.length).trim()
      if (!afterPrefix) continue

      const officeMatch = afterPrefix.match(/^([^(:]+)/)
      const destOffice = String(officeMatch ? officeMatch[1] : afterPrefix)
        .trim()
        .toLowerCase()
      if (!destOffice) continue

      if (!(destOffice === officeNeedle || destOffice.includes(officeNeedle))) continue

      const ts = new Date(String(rawLogs[i]?.createdAt || '')).getTime()
      return Number.isFinite(ts) ? ts : null
    }

    return null
  }

  const getLastTransferredOffice = (rawLogs: any[]) => {
    const logs = Array.isArray(rawLogs) ? rawLogs : []
    const prefix = 'transferred to'
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      const labelLower = String(logs[i]?.label || '').trim().toLowerCase()
      // Primary match: label starts with "transferred to"
      if (labelLower.startsWith(prefix)) {
        const afterPrefix = labelLower.slice(prefix.length).trim()
        if (!afterPrefix) continue
        const officeMatch = afterPrefix.match(/^([^(:]+)/)
        const destOffice = String(officeMatch ? officeMatch[1] : afterPrefix).trim().toLowerCase()
        if (destOffice) return destOffice
      }
      // Legacy back-compat: "Approved: Transferred to OFFICE (...)" format
      // used by the first version of the admin Approve handler
      const legacyMatch = labelLower.match(/approved[:\s]+transferred\s+to\s+([^(:]+)/i)
      if (legacyMatch) {
        const destOffice = String(legacyMatch[1]).trim().toLowerCase()
        if (destOffice) return destOffice
      }
    }
    return null
  }

  const hasReceivedForCurrentOffice = (row: ApprovalRow) => {
    const rawLogs = Array.isArray(row.rawLogs) ? row.rawLogs : []
    const currentOffice = String(actionOfficeLower || '').trim().toLowerCase()
    if (!currentOffice) return false

    const lastTransferTs = getLastTransferTimeToOffice(rawLogs, currentOfficeKey)

    // Only count as received if the 'Received' log happened after the most recent
    // transfer to the current office. This avoids old 'Received' logs making a
    // newly reprocessed transfer appear already received.
    return rawLogs.some((l) => {
      const label = String(l?.label || '').trim().toLowerCase()
      const byOffice = String(l?.byOffice || '').trim().toLowerCase()
      if (!label.startsWith('received')) return false
      if (byOffice !== currentOffice) return false

      if (lastTransferTs == null) return true
      const receivedTs = new Date(String(l?.createdAt || '')).getTime()
      if (!Number.isFinite(receivedTs)) return false
      return receivedTs >= lastTransferTs
    })
  }

  const hasTransferredToCurrentOffice = (row: ApprovalRow) => {
    const officeNeedle = String(currentOfficeKey || '').trim().toLowerCase()
    if (!officeNeedle) return false
    const rawLogs = Array.isArray(row.rawLogs) ? row.rawLogs : []
    const lastDest = getLastTransferredOffice(rawLogs)
    return lastDest ? (lastDest === officeNeedle || lastDest.includes(officeNeedle)) : false
  }

  const hasTransferredFromCurrentOffice = (row: ApprovalRow) => {
    const rawLogs = Array.isArray(row.rawLogs) ? row.rawLogs : []
    const currentOffice = String(actionOfficeLower || '').trim().toLowerCase()
    if (!currentOffice) return false

    const lastTransferToUsTs = getLastTransferTimeToOffice(rawLogs, currentOfficeKey)

    return rawLogs.some((l) => {
      const label = String(l?.label || '').trim().toLowerCase()
      const byOffice = String(l?.byOffice || '').trim().toLowerCase()
      if (!label.startsWith('transferred to')) return false
      if (byOffice !== currentOffice) return false

      if (lastTransferToUsTs == null) return true
      const transferredTs = new Date(String(l?.createdAt || '')).getTime()
      if (!Number.isFinite(transferredTs)) return false
      return transferredTs >= lastTransferToUsTs
    })
  }

  const isRecentlyTransferredFromCurrentOffice = (row: ApprovalRow) => {
    const rawLogs = Array.isArray(row.rawLogs) ? row.rawLogs : []
    if (rawLogs.length === 0) return false

    const currentOffice = String(actionOfficeLower || '').trim().toLowerCase()
    const officeKey = String(currentOfficeKey || '').trim().toLowerCase()
    if (!currentOffice && !officeKey) return false

    // Scan all logs in reverse to find the most recent "transferred to" log
    // sent by the current office. We don't restrict to the very last log
    // because subsequent logs (e.g. "Received" by the destination) would
    // otherwise hide the document from this view.
    for (let i = rawLogs.length - 1; i >= 0; i--) {
      const log = rawLogs[i]
      const label = String(log?.label || '').toLowerCase().trim()
      if (!label.startsWith('transferred to')) continue

      const byOffice = String(log?.byOffice || '').toLowerCase().trim()
      if (!byOffice) continue

      const matchesByName = currentOffice
        ? (byOffice === currentOffice || byOffice.includes(currentOffice) || currentOffice.includes(byOffice))
        : false
      const matchesByKey = officeKey
        ? (byOffice === officeKey || byOffice.includes(officeKey) || officeKey.includes(byOffice))
        : false

      if (matchesByName || matchesByKey) return true
    }

    return false
  }

  const isTransferReceivedByDestination = (row: ApprovalRow) => {
    const rawLogs = Array.isArray(row.rawLogs) ? row.rawLogs : []
    const currentOffice = String(actionOfficeLower || '').trim().toLowerCase()
    const officeKey = String(currentOfficeKey || '').trim().toLowerCase()

    if (!currentOffice && !officeKey) return false

    // Scan backwards to find the most recent transfer from *this* office
    for (let i = rawLogs.length - 1; i >= 0; i--) {
      const log = rawLogs[i]
      const label = String(log?.label || '').toLowerCase().trim()
      const byOffice = String(log?.byOffice || '').toLowerCase().trim()

      if (!label.startsWith('transferred to')) continue

      const matchesByName = currentOffice
        ? (byOffice === currentOffice || byOffice.includes(currentOffice) || currentOffice.includes(byOffice))
        : false
      const matchesByKey = officeKey
        ? (byOffice === officeKey || byOffice.includes(officeKey) || officeKey.includes(byOffice))
        : false

      if (matchesByName || matchesByKey) {
        // Found the last transfer from us. Now check logs AFTER this transfer.
        for (let j = i + 1; j < rawLogs.length; j++) {
          const nextLogLabel = String(rawLogs[j]?.label || '').toLowerCase().trim()
          // Any receive, return, or complete log means it was processed by the receiving end
          if (
            nextLogLabel.startsWith('receive') ||
            nextLogLabel.startsWith('return') ||
            nextLogLabel.startsWith('complete') ||
            nextLogLabel.startsWith('approve') ||
            nextLogLabel.startsWith('accomplish')
          ) {
            return true
          }
        }
        return false // Found the transfer, but no received log after it
      }
    }

    return false
  }

  const isTerminalStatus = (statusRaw: string) => {
    const s = String(statusRaw || '').trim().toLowerCase()
    return s === 'completed' || s === 'returned' || s === 'discontinued' || s === 'cancelled' || s === 'canceled'
  }

  const isInCurrentOfficeScope = (docStatus: string) => {
    const s = String(docStatus || '').trim().toLowerCase()
    if (actionIsBudget) return s === 'in-budget'
    if (actionIsPto) return s === 'in-pto'
    if (actionIsGso) return s === 'pending' || s === 'pending-gso'
    if (actionIsBac)
      return (
        s === 'pending' ||
        s === 'pending-gso' ||
        s === 'pending-bac' ||
        s === 'for-validation' ||
        s === 'pre-validation'
      )
    return true
  }

  async function fetchRows() {
    try {
      setError(null)
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/documents`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }

      const data = (await response.json()) as { documents: ApiDocument[] }

      let procurementOffice = ""
      let actorRole = ""
      try {
        const raw = localStorage.getItem('user')
        const parsed = raw ? (JSON.parse(raw) as { office?: string; role?: string } | null) : null
        procurementOffice = String(parsed?.office || '').trim()
        actorRole = String(parsed?.role || '').trim()
      } catch {
        procurementOffice = ""
        actorRole = ""
      }

      const actorRoleLower = actorRole.toLowerCase()
      const isAdminRole = actorRoleLower === 'admin' || actorRoleLower === 'superadmin'

      const isReviewList = String(title || '').trim().toLowerCase() === 'review'

      const procurementOfficeLower = procurementOffice.toLowerCase()
      const isGso = procurementOfficeLower.includes('gso')
      const isBac =
        procurementOfficeLower.includes('bac') ||
        procurementOfficeLower.includes('bids') ||
        procurementOfficeLower.includes('awards')
      const isBudget = procurementOfficeLower.includes('budget')
      const isPto = procurementOfficeLower.includes('pto')

      const hasAnyTransferredLog = (doc: { logs?: any[], subDocuments?: any[] } | null | undefined) => {
        const rawLogs = Array.isArray(doc?.logs) ? (doc?.logs as any[]) : []
        const hasMain = rawLogs.some((l) => String(l?.label || '').trim().toLowerCase().includes('transferred to'))
        if (hasMain) return true
        if (Array.isArray(doc?.subDocuments)) {
          return doc.subDocuments.some((sub) => {
            const subLogs = Array.isArray(sub?.logs) ? sub.logs : []
            return subLogs.some((l: any) => String(l?.label || '').trim().toLowerCase().includes('transferred to'))
          })
        }
        return false
      }

      const isForApproval = (d: any) => {
        const checkStatus = (rawStatus: string) => {
          const s = String(rawStatus || '').toLowerCase()
          if (isAdminRole) {
            return (
              s === 'pending' ||
              s === 'pending-gso' ||
              s === 'pending-bac' ||
              s === 'for-validation' ||
              s === 'pre-validation' ||
              s === 'for-revision' ||
              s === 'reprocessed'
            )
          }
          if (actionMode === "logsOnly") {
            // 'for-revision' must be included for ALL offices so that when a reviewer
            // returns a doc (sets status to 'for-revision'), it stays visible to the
            // reviewer after the end user resubmits remarks — enabling back-and-forth flow.
            if (isGso) return s === 'pending' || s === 'pending-gso' || s === 'for-revision'
            if (isBac)
              return (
                s === 'pending' ||
                s === 'pending-gso' ||
                s === 'pending-bac' ||
                s === 'for-validation' ||
                s === 'pre-validation' ||
                s === 'for-revision'
              )
            if (isBudget) return s === 'in-budget' || s === 'for-revision'
            if (isPto) return s === 'in-pto' || s === 'for-revision'
            return s === 'pending' || s === 'pending-gso' || s === 'pending-bac' || s === 'for-revision'
          }
          return (
            s === 'pending' ||
            s === 'pending-gso' ||
            s === 'pending-bac' ||
            s === 'for-validation' ||
            s === 'pre-validation' ||
            s === 'for-revision' ||
            s === 'reprocessed'
          )
        }

        if (checkStatus(d?.status || 'pending')) return true
        if (Array.isArray(d?.subDocuments)) {
          if (d.subDocuments.some((sub: any) => checkStatus(sub?.status || 'pending'))) return true
        }
        // Fallback: check if the last "Transferred to X" log on the main doc
        // points to this office — handles reprocessed docs whose status field is stale
        if (isBudget || isPto) {
          const mainLogs = Array.isArray(d?.logs) ? d.logs : []
          const targetOffice = isBudget ? 'budget' : 'pto'
          for (let i = mainLogs.length - 1; i >= 0; i--) {
            const label = String(mainLogs[i]?.label || '').trim().toLowerCase()
            if (label.startsWith('transferred to')) {
              const after = label.slice('transferred to'.length).trim()
              const match = after.match(/^([^(:]+)/)
              const dest = String(match ? match[1] : after).trim().toLowerCase()
              return dest === targetOffice || dest.includes(targetOffice)
            }
          }
        }
        return false
      }

      const mapped = (data.documents || [])
        .filter((d) => {
          const parentStatusLower = String(d?.status || '').trim().toLowerCase()
          if (parentStatusLower === 'discontinued' || parentStatusLower === 'cancelled' || parentStatusLower === 'canceled') {
            return false
          }

          if (filterReceivedOnly || filterRecentlyTransferredOnly) return true

          if (actionMode === 'logsOnly' && logsOnlyActionMode === 'historyOnly') {
            return hasApprovalLogByCurrentOffice(d)
          }

          if (!isForApproval(d)) return false
          if (isAdminRole) {
            return !hasAnyTransferredLog(d)
          }

          if (isReviewList) {
            const parentStatusLower = String(d?.status || '').trim().toLowerCase()
            const allowedParentStatuses = new Set([
              'pending',
              'pending-gso',
              'pending-bac',
              'for-validation',
              'pre-validation',
              'for-revision',
              'reprocessed',
            ])
            if (!allowedParentStatuses.has(parentStatusLower)) return false
          }

          return true
        })
        .flatMap((d) => {
          const parentStatusLower = String(d?.status || '').trim().toLowerCase()

          // Procurement Review list should not show sub-document rows, but it must still
          // include parent documents that are part of the back-and-forth review cycle
          // (e.g. for-revision after a return + end-user remarks). Filtering of what is
          // in the review queue is handled by the existing isForApproval(...) / office
          // scope logic above.

          const createdAt = d.createdAt ? new Date(d.createdAt) : null
          const timestamp = createdAt
            ? createdAt.toLocaleString(undefined, {
              year: 'numeric',
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
            : ''

          const rowsToYield: ApprovalRow[] = []

          const createRow = (item: any, isSub: boolean, index: number): ApprovalRow => {
            const statusLower = String(item.status || '').toLowerCase()
            const status: ApprovalRow['status'] =
              statusLower === 'returned'
                ? 'returned'
                : statusLower === 'approved' || statusLower === 'completed'
                  ? 'approved'
                  : statusLower === 'for-revision'
                    ? 'for-revision'
                    : statusLower === 'reprocessed'
                      ? 'reprocessed'
                      : 'pending'

            const itemLogs = Array.isArray(item.logs) ? item.logs : []
            const logs = [...itemLogs]
              .reverse()
              .map((l: any) => ({
                label: (() => {
                  const rawLabel = String(l?.label || '').trim()
                  const byOffice = String(l?.byOffice || '').trim()
                  if (!byOffice) return rawLabel

                  const match = rawLabel.match(/^(Approved|Returned)\b/i)
                  const typeLabel = match?.[1] ? match[1] : ""
                  if (!typeLabel) return rawLabel
                  return `${byOffice}: ${typeLabel.toUpperCase()}`
                })(),
                tone: mapLogToneFromColor(String(l?.color || '')),
              }))
              .filter((l) => Boolean(l.label))

            return {
              timestamp,
              trackingNo: isSub ? item.trackingNo : d.trackingNo,
              parentTrackingNo: isSub ? d.trackingNo : undefined,
              parentDocId: isSub ? d._id : undefined,
              isSubDocument: isSub,
              subDocIndex: isSub ? index : undefined,
              requestor: d.office || '',
              references: {
                pr: d.prEnabled === false ? 'PR: Not Available' : 'PR: Available',
                obr: d.obrEnabled === false ? 'OBR: Not Available' : 'OBR: Available',
              },
              referenceNos: {
                prNo: String(d.prNo || ''),
                obrNo: String(d.obrNo || ''),
              },
              createdBy: String(d.createdBy || '').trim().toLowerCase() === 'admin' ? 'System Administrator' : (d.createdBy || '—'),
              purpose: isSub ? (item.purpose || d.purpose) : d.purpose,
              supplier: isSub ? (item.supplier || '') : String((d as any)?.supplier || ''),
              attachments: { pr: '#', obr: '#', driveLink: d.driveLink || '#' },
              routingSlip: [],
              gsoRoutingSlip: String((d as any).gsoRoutingSlip || ''),
              logs,
              rawLogs: itemLogs,
              sourceOfFund: d.fund || '',
              amount: (() => {
                const rawAmt = isSub ? getSubDocAmount(d, index) : (item.amount || d.amount || '')
                const cleaned = String(rawAmt)
                  .replace(/[^0-9.,-]/g, '')
                  .trim()
                return cleaned ? `₱ ${cleaned}` : ''
              })(),
              currentStatus: String(item.status || ''),
              status,
              doc: d,
            }
          }

          if (isReviewList) {
            // Review: always yield only the parent document row.
            rowsToYield.push(createRow(d, false, -1))
          } else if (Array.isArray(d.subDocuments) && d.subDocuments.length > 0) {
            // Also emit the main document row if the main doc itself qualifies
            // for the current office (by status or by a transfer log pointing here).
            // This handles the case where the main doc has in-budget/in-pto status
            // while its sub-documents have different statuses.
            const mainDocQualifies = isInCurrentOfficeScope(d?.status || '') || (() => {
              if (isBudget || isPto) {
                const mainLogs = Array.isArray(d?.logs) ? d.logs : []
                const targetOffice = isBudget ? 'budget' : 'pto'
                for (let i = mainLogs.length - 1; i >= 0; i--) {
                  const label = String(mainLogs[i]?.label || '').trim().toLowerCase()
                  if (label.startsWith('transferred to')) {
                    const after = label.slice('transferred to'.length).trim()
                    const match = after.match(/^([^(:]+)/)
                    const dest = String(match ? match[1] : after).trim().toLowerCase()
                    return dest === targetOffice || dest.includes(targetOffice)
                  }
                }
              }
              return false
            })()

            if (mainDocQualifies) {
              const parentStatusLower = String(d?.status || '').trim().toLowerCase()
              if (parentStatusLower !== 'discontinued' && parentStatusLower !== 'cancelled' && parentStatusLower !== 'canceled') {
                rowsToYield.push(createRow(d, false, -1))
              }
            }
            d.subDocuments.forEach((sub, subIdx) => {
              const subStatusLower = String(sub?.status || '').trim().toLowerCase()
              if (subStatusLower !== 'discontinued' && subStatusLower !== 'cancelled' && subStatusLower !== 'canceled') {
                rowsToYield.push(createRow(sub, true, subIdx))
              }
            })
          } else {
            rowsToYield.push(createRow(d, false, -1))
          }

          return rowsToYield
        })

      const filteredMapped = (filterReceivedOnly || filterRecentlyTransferredOnly)
        ? mapped.filter((row) => {
          const statusLower = String(row.currentStatus || '').trim().toLowerCase()
          const parentStatusLower = String(row.doc?.status || '').trim().toLowerCase()
          if (
            statusLower === 'discontinued' || statusLower === 'cancelled' || statusLower === 'canceled' ||
            parentStatusLower === 'discontinued' || parentStatusLower === 'cancelled' || parentStatusLower === 'canceled'
          ) {
            return false
          }

          const transferredToOffice = hasTransferredToCurrentOffice(row)
          const receivedByOffice = hasReceivedForCurrentOffice(row)
          const transferredFromOffice = hasTransferredFromCurrentOffice(row)

          const rawLogs = Array.isArray(row.rawLogs) ? row.rawLogs : []
          const hasAnyTransferLog = rawLogs.some((l) => {
            const labelLower = String(l?.label || '').trim().toLowerCase()
            return labelLower.startsWith('transferred') || labelLower.includes('transferred to')
          })

          const matchesReceivedOrTransferred = transferredToOffice || receivedByOffice || transferredFromOffice
          const matchesTransferPendingOnly = transferredToOffice && !receivedByOffice

          const matchesTransferredOnly = transferredToOffice

          const matchesEntry = filterRecentlyTransferredOnly
            ? isRecentlyTransferredFromCurrentOffice(row)
            : filterTransferredPendingOnly
              ? matchesTransferPendingOnly
              : filterTransferredToCurrentOfficeOnly
                ? matchesTransferredOnly
                : matchesReceivedOrTransferred

          const matchesScope =
            !restrictToCurrentOfficeScope ||
            (!isTerminalStatus(row.currentStatus) && isInCurrentOfficeScope(row.currentStatus))

          const matchesApprovalProcessing = !excludeApprovalProcessed || !hasApprovalLogByCurrentOffice({ logs: row.rawLogs })

          const matchesTransferRequirement = !requireTransferLog || hasAnyTransferLog

          const matchesPendingExclusion =
            !excludeTransferPending ||
            // if it was transferred TO us but not received yet, hide it
            !(transferredToOffice && !receivedByOffice)

          const matchesTerminalExclusion = !excludeTerminalStatuses || !isTerminalStatus(row.currentStatus)

          return (
            matchesEntry &&
            matchesScope &&
            matchesApprovalProcessing &&
            matchesTransferRequirement &&
            matchesPendingExclusion &&
            matchesTerminalExclusion
          )
        })
        : excludeApprovalProcessed
          ? mapped.filter((row) => !hasApprovalLogByCurrentOffice({ logs: row.rawLogs }))
          : mapped

      setRows(filteredMapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionMode, filterReceivedOnly, logsOnlyActionMode])

  useEffect(() => {
    if (!logsRow || actionMode !== "logsOnly") return
    setHistoryTab("transactions")
  }, [actionMode, logsRow])

  useEffect(() => {
    if (!logsRow) return
    setReviewRemarksType("return")
    setReviewRemarks("")
  }, [logsRow])

  const isLogsOpen = logsRow !== null

  const logsModalItems = useMemo(() => {
    if (!logsRow) return []
    const raw = logsRow.doc?.logs
    if (!Array.isArray(raw)) return []
    return [...raw]
      .reverse()
      .map((l: any) => ({
        label: String(l?.label || '').trim(),
        color: String(l?.color || '').trim(),
        byUser: String(l?.byUser || '').trim(),
        byOffice: String(l?.byOffice || '').trim(),
      }))
      .filter((l) => Boolean(l.label))
  }, [logsRow])

  async function submitRowLog(
    row: ApprovalRow,
    log: { label: string; color: string },
    status?: string,
    extraUpdates?: {
      prEnabled?: boolean
      obrEnabled?: boolean
      prNo?: string
      obrNo?: string
      subDocuments?: Array<{
        trackingNo: string
        purpose: string
        amount: string
        status?: string
        logs?: any[]
      }>
    }
  ) {
    let byOffice = ""
    let byUser = ""
    try {
      const raw = localStorage.getItem('user')
      const parsed = raw ? (JSON.parse(raw) as { office?: string; fullName?: string; username?: string } | null) : null
      byOffice = String(parsed?.office || '').trim()
      byUser = String(parsed?.fullName || parsed?.username || '').trim()
    } catch {
      byOffice = ""
      byUser = ""
    }

    try {
      setError(null)
      setRowActionBusy(String(row.doc._id))
      const token = localStorage.getItem('token')

      if (row.isSubDocument) {
        const parent = row.doc
        const currentSubs = Array.isArray((parent as any)?.subDocuments)
          ? ([...(parent as any).subDocuments] as any[])
          : []

        let subIdx = typeof row.subDocIndex === 'number' ? row.subDocIndex : -1
        const trackingNeedle = String(row.trackingNo || '').trim()

        if (subIdx < 0 || subIdx >= currentSubs.length) {
          if (trackingNeedle) {
            subIdx = currentSubs.findIndex((s) => String(s?.trackingNo || '').trim() === trackingNeedle)
          }
        }

        if (subIdx < 0 || subIdx >= currentSubs.length) {
          throw new Error('Sub-document not found')
        }

        const target = { ...(currentSubs[subIdx] || {}) }
        const currentLogs = Array.isArray(target.logs) ? [...target.logs] : []
        target.logs = [
          ...currentLogs,
          {
            label: log.label,
            color: log.color,
            byOffice,
            byUser,
            createdAt: new Date().toISOString(),
          },
        ]
        if (typeof status === 'string' && status.trim()) {
          target.status = status.trim()
        }
        currentSubs[subIdx] = target

        const response = await fetch(`${API_URL}/documents/${row.doc._id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subDocuments: currentSubs,
            ...extraUpdates,
          }),
        })

        if (!response.ok) {
          const msg = await response.text()
          throw new Error(msg || 'Failed to update')
        }

        await fetchRows()
        return
      }

      const response = await fetch(`${API_URL}/documents/${row.doc._id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
          addLog: { label: log.label, color: log.color, byOffice, byUser },
          ...extraUpdates,
        }),
      })

      if (!response.ok) {
        const msg = await response.text()
        throw new Error(msg || 'Failed to update')
      }

      await fetchRows()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update'
      setError(msg)
      window.alert(msg)
      throw e
    } finally {
      setRowActionBusy(null)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      return (
        r.trackingNo.toLowerCase().includes(q) ||
        r.requestor.toLowerCase().includes(q) ||
        r.createdBy.toLowerCase().includes(q) ||
        r.purpose.toLowerCase().includes(q) ||
        String(r.supplier || '').toLowerCase().includes(q)
      )
    })
  }, [query, rows])

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize])

  const prCaptureRef = useRef<HTMLDivElement | null>(null)
  const obrCaptureRef = useRef<HTMLDivElement | null>(null)
  const obrVisibleRef = useRef<HTMLDivElement | null>(null)

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

  const capturePrPreviewToPdf = async (_row: ApprovalRow) => {
    const root = prCaptureRef.current
    if (!root) return

    try {
      setPrPdfBusy(true)

      const previewTab = window.open("about:blank", "_blank")
      if (!previewTab) {
        window.alert('Please allow pop-ups to preview the PDF.')
        return
      }

      await new Promise((r) => setTimeout(r, 50))

      const pages = Array.from(root.querySelectorAll<HTMLElement>(".print-page"))
      if (pages.length === 0) return

      const pdfDoc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" })

      for (let i = 0; i < pages.length; i++) {
        const el = pages[i]
        const canvas = await html2canvas(el, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
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
    } finally {
      setPrPdfBusy(false)
    }
  }

  const [dvPdfBusy, setDvPdfBusy] = useState(false)
  const dvVisibleRef = useRef<HTMLDivElement | null>(null)
  const dvCaptureRef = useRef<HTMLDivElement | null>(null)

  const captureDvPreviewToPdf = async (row: ApprovalRow) => {
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
      console.error("Failed to generate DV PDF", err)
      if (previewTab) previewTab.close()
    } finally {
      setDvPdfBusy(false)
    }
  }

  const captureObrPreviewToPdf = async (_row: ApprovalRow) => {
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

  const isPreviewOpen = preview !== null

  useEffect(() => {
    if (preview) {
      const updatedRow = rows.find((r) => r.doc._id === preview.row.doc._id)
      if (updatedRow && updatedRow !== preview.row) {
        setPreview({ ...preview, row: updatedRow })
      }
    }
  }, [rows, preview])

  const [poPdfBusy, setPoPdfBusy] = useState(false)
  const poVisibleRef = useRef<HTMLDivElement | null>(null)
  const poCaptureRef = useRef<HTMLDivElement | null>(null)

  const capturePoPreviewToPdf = async (_row: ApprovalRow) => {
    const root = poVisibleRef.current || poCaptureRef.current
    if (!root) return

    let previewTab: Window | null = null
    try {
      setPoPdfBusy(true)
      previewTab = window.open("about:blank", "_blank")
      if (!previewTab) {
        window.alert('Please allow pop-ups to preview the PDF.')
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

  const handleSavePo = async (data: Partial<PoTemplateModel> & { poItems?: PoItem[]; supplierAddress?: string; poDate?: string }) => {
    if (!preview || preview.type !== 'PO') return
    const docId = preview.row.doc._id
    const token = localStorage.getItem('token')

    try {
      const rawList = data.poItems || data.items || []
      const sanitizedPrItems = rawList.map((it, idx) => ({
        itemNo: String(it.stockPropertyNo || idx + 1),
        unit: String(it.unit || ''),
        description: String(it.description || ''),
        quantity: it.quantity !== undefined && it.quantity !== null && it.quantity !== '' ? String(it.quantity) : '',
        unitCost: it.unitCost !== undefined && it.unitCost !== null && it.unitCost !== '' ? String(it.unitCost) : '',
        totalCost: it.amount !== undefined && it.amount !== null && it.amount !== '' ? String(it.amount) : '',
      }))

      const sanitizedPoItems = rawList.map((it, idx) => ({
        stockPropertyNo: String(it.stockPropertyNo || idx + 1),
        unit: String(it.unit || ''),
        description: String(it.description || ''),
        quantity: it.quantity !== undefined && it.quantity !== null && it.quantity !== '' ? String(it.quantity) : '',
        unitCost: it.unitCost !== undefined && it.unitCost !== null && it.unitCost !== '' ? String(it.unitCost) : '',
        amount: it.amount !== undefined && it.amount !== null && it.amount !== '' ? String(it.amount) : '',
      }))

      const response = await fetch(`${API_URL}/documents/${docId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supplier: data.supplier ?? '',
          supplierAddress: data.supplierAddress || data.address || '',
          address: data.supplierAddress || data.address || '',
          tin: data.tin ?? '',
          poNo: data.poNo ?? '',
          poDate: data.poDate || data.date || '',
          date: data.poDate || data.date || '',
          modeOfProcurement: data.modeOfProcurement ?? '',
          prNo: data.prNo ?? '',
          placeOfDelivery: data.placeOfDelivery ?? '',
          dateOfDelivery: data.dateOfDelivery ?? '',
          deliveryTerm: data.deliveryTerm ?? '',
          paymentTerm: data.paymentTerm ?? '',
          prItems: sanitizedPrItems,
          poItems: sanitizedPoItems,
          approvedByName: data.approvedByName ?? '',
          approvedByDesignation: data.approvedByDesignation ?? '',
          conformeSupplierName: data.conformeSupplierName ?? '',
          conformeDate: data.conformeDate ?? '',
          sanggunianResolutionNo: data.sanggunianResolutionNo ?? '',
          secretaryName: data.secretaryName ?? '',
          secretaryDate: data.secretaryDate ?? '',
        }),
      })

      if (!response.ok) {
        let errorMsg = 'Failed to update PO'
        try {
          const errData = await response.json()
          errorMsg = errData.message || errorMsg
        } catch {
          const txt = await response.text().catch(() => '')
          if (txt) errorMsg = txt
        }
        throw new Error(errorMsg)
      }

      setPreview((prev) => {
        if (!prev || prev.type !== 'PO') return prev
        const newDoc = {
          ...prev.row.doc,
          ...data,
          supplier: data.supplier || prev.row.doc.supplier,
          address: data.supplierAddress || data.address,
          supplierAddress: data.supplierAddress || data.address,
          poNo: data.poNo,
          poDate: data.poDate || data.date,
          prItems: sanitizedPrItems,
          poItems: sanitizedPoItems,
        }
        return {
          ...prev,
          row: {
            ...prev.row,
            supplier: data.supplier || prev.row.supplier,
            doc: newDoc as any,
          },
        }
      })

      await fetchRows()
      toast.success('PO updated successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update PO')
      throw err
    }
  }

  const previewPoModel = useMemo<PoTemplateModel | null>(() => {
    if (!preview || preview.type !== 'PO') return null
    const doc = preview.row.doc
    const row = preview.row
    const prItems = Array.isArray(doc?.prItems) ? doc.prItems : []
    const items: PoItem[] = prItems.length > 0
      ? prItems
          .filter((it: any) => String(it?.description || "").trim() !== "__PR_PAGE_BREAK__")
          .map((it: any, idx: number) => ({
            stockPropertyNo: String(it?.itemNo || idx + 1),
            unit: String(it?.unit || ""),
            description: String(it?.description || ""),
            quantity: it?.quantity || "",
            unitCost: it?.unitCost || "",
            amount: it?.totalCost || (Number(it?.quantity || 0) * Number(it?.unitCost || 0)) || "",
          }))
      : [
          {
            stockPropertyNo: "1",
            unit: "lot",
            description: doc?.purpose || row?.purpose || "",
            quantity: 1,
            unitCost: doc?.amount || row?.amount || "",
            amount: doc?.amount || row?.amount || "",
          },
        ]

    const supp = String(row.supplier || (doc as any)?.supplier || "").trim()

    return {
      supplier: supp,
      address: String((doc as any)?.supplierAddress || (doc as any)?.address || "").trim(),
      tin: String((doc as any)?.tin || "").trim(),
      poNo: String((doc as any)?.poNo || "").trim(),
      date: String((doc as any)?.poDate || (doc as any)?.prDate || (doc?.createdAt ? new Date(doc.createdAt).toISOString().split('T')[0] : "")).trim(),
      modeOfProcurement: String((doc as any)?.modeOfProcurement || doc?.section || "SVP").trim(),
      prNo: String(row.referenceNos?.prNo || (doc as any)?.prNo || "").trim(),
      placeOfDelivery: String((doc as any)?.placeOfDelivery || doc?.department || doc?.office || "PG-BATAAN").trim(),
      dateOfDelivery: String((doc as any)?.dateOfDelivery || "").trim(),
      deliveryTerm: String((doc as any)?.deliveryTerm || "").trim(),
      paymentTerm: String((doc as any)?.paymentTerm || "").trim(),
      items,
      approvedByName: String((doc as any)?.approvedByName || "JOSE ENRIQUE S. GARCIA III").trim(),
      approvedByDesignation: String((doc as any)?.approvedByDesignation || "PROVINCIAL GOVERNOR").trim(),
      conformeSupplierName: String((doc as any)?.conformeSupplierName || supp).trim(),
      conformeDate: String((doc as any)?.conformeDate || "").trim(),
      sanggunianResolutionNo: String((doc as any)?.sanggunianResolutionNo || "").trim(),
      secretaryName: String((doc as any)?.secretaryName || "").trim(),
      secretaryDate: String((doc as any)?.secretaryDate || "").trim(),
      trackingNo: String(row.trackingNo || doc?.trackingNo || "").trim(),
      status: doc?.status,
      logs: doc?.logs,
    }
  }, [preview])

  const previewDvModel = useMemo<DvTemplateModel | null>(() => {
    if (!preview || preview.type !== 'DV') return null
    const doc = preview.row.doc
    const row = preview.row
    const supp = String(row.supplier || (doc as any)?.supplier || "").trim()
    return {
      payee: supp || "PR",
      address: String((doc as any)?.supplierAddress || "N/A"),
      trackingNo: row.trackingNo || doc?.trackingNo || "",
      fund: doc?.fund || "",
      dvNo: String((doc as any)?.dvNo || "").trim(),
      date: (doc as any)?.date || "",
      obrNo: String(row.referenceNos?.obrNo || (doc as any)?.obrNo || "").trim(),
      responsibilityCenter: (doc as any)?.responsibilityCenter || "",
      particulars: doc?.purpose || row.purpose || "",
      amount: (doc as any)?.supplierAmount || doc?.amount || row.amount || "",
      amountDue: (doc as any)?.supplierAmount || doc?.amount || row.amount || "",
      preparedByName: doc?.createdBy || row.createdBy || "",
      certifiedAName:
        String((doc as any)?.certifiedAName || "").trim() ||
        officeHeads[doc?.office?.toUpperCase() || ""]?.head ||
        String((doc as any)?.requestedByName || "").trim() ||
        "ENGR. FERNANDO E. TANCIONGCO",
      certifiedAPosition:
        String((doc as any)?.certifiedAPosition || "").trim() ||
        officeHeads[doc?.office?.toUpperCase() || ""]?.designation ||
        String((doc as any)?.requestedByDesignation || "").trim() ||
        "OIC-PGSO",
      certifiedBName: String((doc as any)?.certifiedBName || "").trim() || "EDUARDO D. BANZON",
      certifiedBPosition: String((doc as any)?.certifiedBPosition || "").trim() || "Provincial Budget Officer",
      status: doc?.status,
      logs: doc?.logs,
      hasPr: doc?.prEnabled,
      hasObr: doc?.obrEnabled,
    }
  }, [officeHeads, preview])

  const previewPrItems = useMemo(() => {
    const raw = preview?.row?.doc?.prItems
    if (!Array.isArray(raw)) return []
    return raw.map((it) => ({
      itemNo: String(it?.itemNo || ""),
      unit: String(it?.unit || ""),
      description: String(it?.description || ""),
      quantity: String(it?.quantity || ""),
      unitCost: String(it?.unitCost || ""),
      totalCost: String(it?.totalCost || ""),
    }))
  }, [preview])

  const shouldShowHeader = Boolean(String(title || "").trim())

  return (
    <div className="w-full space-y-4">
      {shouldShowHeader ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10">
                The Bunker &bull; Bataan Capitol DTS
              </span>
            </div>
            <div className="mt-1 text-lg font-bold tracking-tight text-slate-900">{title}</div>
            <div className="text-xs text-slate-500">Official document approvals & workflow queue</div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {actionIsAdmin && (
              <button
                type="button"
                onClick={() => setIsNewRequestModalOpen(true)}
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
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500" htmlFor="entries">
                Show
              </label>
              <select
                id="entries"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-9 rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-2.5 text-xs font-semibold text-slate-800 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-xs font-medium text-slate-500">entries</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500" htmlFor="search">
                Search:
              </label>
              <input
                id="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 w-full min-w-56 rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-900 placeholder:text-slate-400 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Tracking, requestor, purpose..."
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500" htmlFor="entries">
              Show
            </label>
            <select
              id="entries"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-9 rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-2.5 text-xs font-semibold text-slate-800 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="text-xs font-medium text-slate-500">entries</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500" htmlFor="search">
              Search:
            </label>
            <input
              id="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full min-w-56 rounded-lg border border-slate-200 border-l-[3px] border-l-blue-500 bg-slate-50/80 px-3 text-xs text-slate-900 placeholder:text-slate-400 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Tracking, requestor, purpose..."
            />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="overflow-auto">
          {error ? <div className="p-4 text-center text-sm text-rose-600">Error: {error}</div> : null}
          {loading ? <div className="p-4 text-center text-sm text-slate-600">Loading documents...</div> : null}
          <table className="w-full min-w-[1200px] table-auto text-left text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
            <thead className="sticky top-0 z-10 bg-blue-600 text-white [&_th]:text-center">
              <tr className="border-b border-blue-700">
                <th className="w-[120px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Timestamp</th>
                <th className="w-[140px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Tracking #</th>
                <th className="w-[90px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Requestor</th>
                <th className="w-[90px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">References</th>
                <th className="w-[110px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Created By</th>
                <th className="w-[190px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Purpose</th>
                <th className="w-[140px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Supplier</th>
                <th className="w-[90px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Attachments</th>
                <th className="w-[110px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Source of Fund</th>
                {(actionIsGso || actionIsAdmin) ? (
                  <th className="w-[200px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Routing Slip</th>
                ) : null}
                <th className="w-[90px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Amount</th>
                {actionMode === "logsOnly" ? null : (
                  <th className="w-[140px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Logs</th>
                )}
                <th className="w-[110px] px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visible.map((r) => {
                const deadlineStatus = (() => {
                  const logs = Array.isArray(r.doc?.logs) ? [...(r.doc.logs as any[])].reverse() : [];
                  const officeLower = String(currentOfficeKey || '').trim().toLowerCase();

                  // Look for terminal actions for the current office
                  const terminalActionLog = logs.find(l => {
                    const labelLower = String(l?.label || '').trim().toLowerCase();
                    const byOfficeLower = String(l?.byOffice || '').trim().toLowerCase();
                    const isTerminal = labelLower.includes('approved') ||
                      labelLower.includes('returned') ||
                      labelLower.includes('completed') ||
                      labelLower.includes('transferred to');
                    // Check if either byOffice matches or label contains current office identifier
                    if (byOfficeLower === officeLower) return isTerminal;
                    if (labelLower.includes(officeLower)) return isTerminal;
                    return false;
                  });

                  // If already processed, check if that stage was exceeded
                  if (terminalActionLog) {
                    const terminalIdx = logs.findIndex(l => l === terminalActionLog);
                    const logsBefore = logs.slice(terminalIdx + 1);
                    const receivedLog = logsBefore.find(l => String(l?.label || '').toLowerCase().startsWith('received'));
                    if (receivedLog) {
                      const offKey = String(receivedLog.byOffice || '').trim().toUpperCase();
                      const lbl = String(receivedLog.label || '');
                      const taskName = (() => {
                        const mFor = lbl.match(/received(?:\s+by\s+[^(:]+)?\s+for\s+([^(:)]+)/i);
                        if (mFor?.[1]) return mFor[1].trim();
                        const mParens = lbl.match(/\(([^)]+)\)\s*$/);
                        return mParens?.[1] ? mParens[1].trim() : '';
                      })();

                      const start = new Date(String(receivedLog.createdAt)).getTime();
                      const end = new Date(String(terminalActionLog.createdAt)).getTime();
                      const durationMs = (Number.isFinite(start) && Number.isFinite(end)) ? end - start : 0;

                      if (offKey && taskName) {
                        const officeTasks = (transferTasksByOffice[offKey] || []).filter(t => !String(t?.status || '').toLowerCase().includes('archived'));
                        let task = officeTasks.find(t => String(t?.task || '').trim().toLowerCase() === taskName.toLowerCase());
                        if (!task && taskName.length > 2) {
                          task = officeTasks.find(t => {
                            const tName = String(t?.task || '').trim().toLowerCase();
                            const rName = taskName.toLowerCase();
                            return tName.includes(rName) || rName.includes(tName);
                          });
                        }
                        if (!task && officeTasks.length === 1) task = officeTasks[0];
                        if (task?.duration) {
                          const limit = parseDurationToMs(task.duration);
                          if (limit > 0 && durationMs > limit) {
                            return { isExceeded: true, elapsedText: formatElapsedShort(durationMs), taskFromLabel: taskName, officeOfTask: offKey };
                          }
                        }
                      }
                      return { isExceeded: false, elapsedText: formatElapsedShort(durationMs), taskFromLabel: taskName, officeOfTask: offKey };
                    }
                  }

                  // Fallback to current ongoing logic if not processed or matched
                  const latestMovementLog = logs.find(l => {
                    const label = String(l?.label || '').toLowerCase();
                    return label.startsWith('received') ||
                      label.startsWith('transferred') ||
                      label.startsWith('approved') ||
                      label.startsWith('completed') ||
                      label.includes('returned') ||
                      label.startsWith('discontinued');
                  });

                  if (!latestMovementLog || !String(latestMovementLog.label || '').toLowerCase().startsWith('received')) {
                    return { isExceeded: false, elapsedText: '' };
                  }

                  const lastReceivedLog = latestMovementLog;
                  const officeOfTask = String(lastReceivedLog.byOffice || '').toUpperCase();
                  if (!officeOfTask) return { isExceeded: false, elapsedText: '' };

                  const label = String(lastReceivedLog.label || '');
                  const taskFromLabel = (() => {
                    const mFor = label.match(/received(?:\s+by\s+[^(:]+)?\s+for\s+([^(:)]+)/i);
                    if (mFor?.[1]) return mFor[1].trim();
                    const mParens = label.match(/\(([^)]+)\)\s*$/);
                    return mParens?.[1] ? mParens[1].trim() : '';
                  })();

                  if (!taskFromLabel) return { isExceeded: false, elapsedText: '' };

                  const officeTasks = (transferTasksByOffice[officeOfTask] || []).filter(t => !String(t?.status || '').toLowerCase().includes('archived'));
                  let taskInfo = officeTasks.find(t => String(t?.task || '').trim().toLowerCase() === taskFromLabel.toLowerCase());
                  if (!taskInfo && taskFromLabel.length > 2) {
                    taskInfo = officeTasks.find(t => {
                      const tName = String(t?.task || '').trim().toLowerCase();
                      const rName = taskFromLabel.toLowerCase();
                      return tName.includes(rName) || rName.includes(tName);
                    });
                  }
                  if (!taskInfo && officeTasks.length === 1) taskInfo = officeTasks[0];

                  const startTime = new Date(String(lastReceivedLog.createdAt)).getTime();
                  if (!Number.isFinite(startTime)) return { isExceeded: false, elapsedText: '' };

                  const elapsedMs = Date.now() - startTime;
                  const elapsedText = formatElapsedShort(elapsedMs);

                  if (taskInfo?.duration) {
                    const durationMs = parseDurationToMs(taskInfo.duration);
                    if (durationMs > 0) {
                      const deadline = startTime + durationMs;
                      const isExceeded = Date.now() > deadline;
                      return { isExceeded, elapsedText, taskFromLabel, officeOfTask };
                    }
                  }

                  return { isExceeded: false, elapsedText };
                })();

                const isProcurementUser = actionIsGso || actionIsBac || actionIsBudget || actionIsPto;
                const rowClass = (deadlineStatus.isExceeded && isProcurementUser)
                  ? "bg-rose-600 text-white transition-colors"
                  : "hover:bg-slate-50 transition-colors";

                return (
                  <tr key={r.trackingNo} className={rowClass}>
                    <td className={`px-3 py-3 align-top text-xs whitespace-pre-line ${deadlineStatus.isExceeded ? 'text-white' : 'text-slate-700'}`}>{r.timestamp}</td>
                    <td className="px-3 py-3 align-top text-xs font-medium">
                      <div
                        className={`truncate ${deadlineStatus.isExceeded ? 'text-white font-bold' : 'text-slate-900'}`}
                        title={`${r.trackingNo}${deadlineStatus.isExceeded ? ' (EXCEEDED DEADLINE)' : ''}${deadlineStatus.taskFromLabel ? ` - Task: ${deadlineStatus.taskFromLabel} at ${deadlineStatus.officeOfTask}` : ''}`}
                      >
                        {r.trackingNo}
                        {deadlineStatus.elapsedText && (
                          <span className={`ml-1 text-[10px] opacity-80 font-normal ${deadlineStatus.isExceeded ? 'text-white' : ''}`}>({deadlineStatus.elapsedText})</span>
                        )}
                        {deadlineStatus.isExceeded && (
                          <span className="ml-1 inline-flex items-center rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold text-white ring-1 ring-inset ring-white/50 animate-pulse">
                            EXCEEDED
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-3 py-3 align-top text-xs ${deadlineStatus.isExceeded ? 'text-white' : 'text-slate-700'}`}>
                      <div className="truncate" title={r.requestor}>
                        {r.requestor}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="space-y-1 text-[11px]">
                        <div className={`truncate font-medium ${deadlineStatus.isExceeded ? 'text-white' : 'text-slate-900'}`} title={r.references.pr}>
                          {r.references.pr}
                        </div>
                        <div className="flex items-center gap-1">
                          <div
                            className={`min-w-0 truncate font-medium ${deadlineStatus.isExceeded ? 'text-white' : 'text-slate-900'}`}
                            title={r.references.obr}
                          >
                            {r.referenceNos.obrNo.trim() ? `OBR No: ${r.referenceNos.obrNo}` : r.references.obr}
                          </div>
                          {canEditObrNo && hasReceivedForCurrentOffice(r) ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!hasReceivedForCurrentOffice(r)) return
                                setEditObrRow(r)
                                setEditObrValue(String(r.referenceNos.obrNo || '').trim())
                              }}
                              className={`inline-flex items-center ${deadlineStatus.isExceeded ? 'text-white hover:text-rose-100' : 'text-slate-600 hover:text-slate-900'} focus:outline-none focus-visible:outline-none`}
                              title="Edit OBR No"
                            >
                              <Pencil className="size-3" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className={`px-3 py-3 align-top text-xs ${deadlineStatus.isExceeded ? 'text-white' : 'text-slate-700'}`}>
                      <div className="truncate" title={r.createdBy}>
                        {r.createdBy}
                      </div>
                    </td>
                    <td className={`px-3 py-3 align-top text-xs ${deadlineStatus.isExceeded ? 'text-white' : 'text-slate-700'}`}>
                      <div className="whitespace-pre-wrap break-words min-w-[200px]" title={r.purpose}>
                        {r.purpose}
                      </div>
                    </td>
                    <td className={`px-3 py-3 align-top text-xs ${deadlineStatus.isExceeded ? 'text-white' : 'text-slate-700'}`}>
                      <div
                        className="whitespace-pre-wrap break-words min-w-[160px]"
                        title={String(r.supplier || (r.doc as any)?.supplier || '-')}
                      >
                        {String(r.supplier || (r.doc as any)?.supplier || '-')}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex w-[72px] flex-col gap-2">
                        {r.doc?.obrEnabled === false ? null : (
                          <button
                            type="button"
                            onClick={() => setPreview({ type: "OBR", row: r })}
                            className={`inline-flex h-7 w-full items-center justify-center rounded text-[11px] font-semibold transition focus:outline-none focus-visible:outline-none ${deadlineStatus.isExceeded ? 'bg-white text-rose-600 hover:bg-rose-50' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                            title="Preview OBR"
                          >
                            OBR
                          </button>
                        )}
                        {r.doc?.prEnabled === false ? null : (
                          <button
                            type="button"
                            onClick={() => setPreview({ type: "PR", row: r })}
                            className={`inline-flex h-7 w-full items-center justify-center rounded text-[11px] font-semibold transition focus:outline-none focus-visible:outline-none ${deadlineStatus.isExceeded ? 'bg-white text-rose-600 hover:bg-rose-50' : 'bg-sky-600 text-white hover:bg-sky-700'}`}
                            title="Preview PR"
                          >
                            PR
                          </button>
                        )}
                        {Boolean(String(r.supplier || (r.doc as any)?.supplier || '').trim()) && (
                          <button
                            type="button"
                            onClick={() => setPreview({ type: "DV", row: r })}
                            className={`inline-flex h-7 w-full items-center justify-center rounded text-[11px] font-semibold transition focus:outline-none focus-visible:outline-none ${deadlineStatus.isExceeded ? 'bg-white text-rose-600 hover:bg-rose-50' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
                            title="Preview DV"
                          >
                            DV
                          </button>
                        )}
                        {(actionIsGso || actionIsAdmin || Boolean(String(r.supplier || (r.doc as any)?.supplier || '').trim())) && (
                          <button
                            type="button"
                            onClick={() => setPreview({ type: "PO", row: r })}
                            className={`inline-flex h-7 w-full items-center justify-center rounded text-[11px] font-semibold transition focus:outline-none focus-visible:outline-none ${deadlineStatus.isExceeded ? 'bg-white text-rose-600 hover:bg-rose-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                            title="Preview PO"
                          >
                            PO
                          </button>
                        )}
                        <a
                          href={r.attachments.driveLink ?? "#"}
                          className={`inline-flex h-7 w-full items-center justify-center rounded text-[11px] font-semibold transition focus:outline-none focus-visible:outline-none ${deadlineStatus.isExceeded ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'bg-amber-400 text-slate-900 hover:bg-amber-300'}`}
                        >
                          Link
                        </a>
                      </div>
                    </td>
                    <td className={`px-3 py-3 align-top text-xs ${deadlineStatus.isExceeded ? 'text-white' : 'text-slate-700'}`}>
                      <div className="truncate" title={r.sourceOfFund}>
                        {r.sourceOfFund}
                      </div>
                    </td>
                    {(actionIsGso || actionIsAdmin) ? (
                      <td className="px-3 py-3 align-top">
                        <select
                          value={routingSlipMap[r.doc._id] ?? r.gsoRoutingSlip ?? ""}
                          onChange={async (e) => {
                            const val = e.target.value
                            const prevVal = routingSlipMap[r.doc._id] ?? r.gsoRoutingSlip ?? ""
                            setRoutingSlipMap((prev) => ({ ...prev, [r.doc._id]: val }))
                            try {
                              const token = localStorage.getItem('token')
                              const response = await fetch(`${API_URL}/documents/${r.doc._id}`, {
                                method: 'PATCH',
                                headers: {
                                  Authorization: `Bearer ${token}`,
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ gsoRoutingSlip: val }),
                              })
                              if (!response.ok) {
                                const msg = await response.text().catch(() => "")
                                setRoutingSlipMap((prev) => ({ ...prev, [r.doc._id]: prevVal }))
                                toast.error(`Failed to update routing slip: ${msg || response.statusText}`)
                              } else {
                                toast.success("Routing slip updated")
                                r.gsoRoutingSlip = val
                                if (r.doc) r.doc.gsoRoutingSlip = val
                              }
                            } catch {
                              setRoutingSlipMap((prev) => ({ ...prev, [r.doc._id]: prevVal }))
                              toast.error("Network error updating routing slip")
                            }
                          }}
                          className="h-8 w-full min-w-[180px] rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:outline-none focus-visible:outline-none"
                        >
                          <option value="">— Select —</option>
                          <option value="IT AND EQUIPMENT">IT AND EQUIPMENT</option>
                          <option value="MEALS AND EVENTS">MEALS AND EVENTS</option>
                          <option value="GOODS & SERVICES">GOODS &amp; SERVICES</option>
                          <option value="REPAIR & MAINTENANCE OF MOTOR VEHICLES AND EQUIPMENT">REPAIR &amp; MAINTENANCE OF MOTOR VEHICLES AND EQUIPMENT</option>
                        </select>
                      </td>
                    ) : null}
                    <td className={`px-3 py-3 align-top text-right text-xs tabular-nums ${deadlineStatus.isExceeded ? 'text-white' : 'text-slate-700'}`}>{r.amount}</td>
                    {actionMode === "logsOnly" ? null : (
                      <td className="px-3 py-3 align-top">
                        <div className="w-full space-y-1">
                          {r.logs.slice(0, 3).map((l, idx) => (
                            <LogBar key={`${r.trackingNo}-${idx}`} label={l.label} tone={deadlineStatus.isExceeded ? 'ok' : l.tone} />
                          ))}
                          {r.logs.length > 3 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setLogsRow(r)
                              }}
                              className={`text-left text-[11px] font-medium ${deadlineStatus.isExceeded ? 'text-rose-100 hover:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                              +{r.logs.length - 3} more
                            </button>
                          ) : null}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        {actionMode === "logsOnly" ? (
                          <>
                            {logsOnlyActionMode === "historyOnly" ? (
                              (() => {
                                const needles = [String(actionOfficeLower || '').trim().toLowerCase(), String(currentOfficeKey || '').trim().toLowerCase()].filter(Boolean)
                                const matchedLog = Array.isArray(r.doc?.logs) ? [...r.doc.logs].reverse().find(l => {
                                  const labelLower = String(l?.label || '').trim().toLowerCase()
                                  const byOfficeLower = String(l?.byOffice || '').trim().toLowerCase()
                                  const isApprovalLabel = labelLower.includes('approved') || labelLower.includes('returned')
                                  if (!isApprovalLabel) return false;
                                  if (byOfficeLower) {
                                    return needles.some((n) => byOfficeLower === n || byOfficeLower.includes(n) || n.includes(byOfficeLower))
                                  }
                                  return needles.some((n) => {
                                    if (labelLower.startsWith(`${n}:`)) return true
                                    const startsWithOffice = labelLower.startsWith(`${n} `)
                                    const hasActionAfter = labelLower.includes('approved') || labelLower.includes('returned')
                                    const isTransferLabel = labelLower.startsWith('transferred to')
                                    return startsWithOffice && hasActionAfter && !isTransferLabel
                                  })
                                }) : null

                                const isExceededProcessed = (() => {
                                  if (!matchedLog) return false;
                                  const logs = Array.isArray(r.doc?.logs) ? (r.doc.logs as any[]) : [];
                                  const logIndex = logs.findIndex(l => l === matchedLog);
                                  if (logIndex <= 0) return false;

                                  const logsBefore = logs.slice(0, logIndex).reverse();
                                  const receivedLog = logsBefore.find(l => String(l?.label || '').toLowerCase().startsWith('received'));
                                  if (!receivedLog) return false;

                                  const offKey = String(receivedLog.byOffice || '').trim().toUpperCase();
                                  const lbl = String(receivedLog.label || '');
                                  const taskName = (() => {
                                    const m1 = lbl.match(/received\s*(?:for\s*)?(.*)$/i);
                                    if (m1?.[1]) return m1[1].trim();
                                    const m2 = lbl.match(/\(([^)]+)\)\s*$/);
                                    return m2?.[1] ? m2[1].trim() : '';
                                  })();

                                  if (offKey && taskName) {
                                    const officeTasks = transferTasksByOffice[offKey] || [];
                                    const task = officeTasks.find(t =>
                                      String(t?.task || '').trim().toLowerCase() === taskName.toLowerCase()
                                    );
                                    if (task?.duration) {
                                      const ms = parseDurationToMs(task.duration);
                                      const start = new Date(String(receivedLog.createdAt || '')).getTime();
                                      const end = new Date(String(matchedLog.createdAt || '')).getTime();
                                      if (ms > 0 && Number.isFinite(start) && Number.isFinite(end)) {
                                        return (end - start) > ms;
                                      }
                                    }
                                  }
                                  return false;
                                })();

                                let approvalRemark = matchedLog ? String(matchedLog.label || '') : null
                                let approvedBy = matchedLog ? String(matchedLog.byUser || '') : null

                                const isReturn = approvalRemark?.toLowerCase().includes('returned')

                                return (
                                  <>
                                    {approvalRemark ? (
                                      <div className="flex w-full flex-col gap-1">
                                        <div
                                          className={`w-full rounded px-2 py-1 text-center text-[10px] font-semibold leading-tight ${isReturn ? 'bg-rose-500 text-white' : isExceededProcessed ? 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-400' : 'bg-emerald-600 text-white'
                                            }`}
                                          title={approvalRemark}
                                        >
                                          <span className="line-clamp-2" title={approvalRemark}>
                                            {approvalRemark}
                                          </span>
                                        </div>
                                        {approvedBy ? (
                                          <div className={`w-full truncate text-center text-[9px] italic leading-tight ${deadlineStatus.isExceeded ? 'text-rose-100' : 'text-slate-500'}`} title={`by: ${approvedBy}`}>
                                            by: {approvedBy}
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <span className={`text-[10px] font-medium italic ${deadlineStatus.isExceeded ? 'text-rose-100' : 'text-slate-400'}`}>No remarks</span>
                                    )}
                                  </>
                                )
                              })()
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLogsRow(r)
                                    setHistoryTab("prevalidation")
                                  }}
                                  className={`inline-flex h-8 items-center justify-center rounded-md border text-xs font-semibold shadow-sm transition focus:outline-none focus-visible:outline-none ${deadlineStatus.isExceeded ? 'border-white/40 bg-white/20 text-white hover:bg-white/30' : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'}`}
                                >
                                  {logsOnlyActionMode === "reviewLogsOnly" ? "Review Logs" : "History"}
                                </button>
                                {(logsOnlyActionMode === "reviewLogsOnly" || logsOnlyActionMode === "viewOnly") ? null : (
                                  <>
                                    {hasPrivilege("Complete Request") &&
                                      hasReceivedForCurrentOffice(r) &&
                                      String(r.doc?.status || '').trim().toLowerCase() !== 'completed' &&
                                      String(r.doc?.status || '').trim().toLowerCase() !== 'accomplished' ? (
                                      <button
                                        type="button"
                                        disabled={rowActionBusy === String(r.doc._id) || hasTransferredFromCurrentOffice(r)}
                                        onClick={async () => {
                                          setCompleteConfirmRow(r)
                                          setCompleteConfirmRemarks("")
                                        }}
                                        className="inline-flex h-8 items-center justify-center rounded-md bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        Complete
                                      </button>
                                    ) : null}
                                    {filterRecentlyTransferredOnly ? (
                                      <button
                                        type="button"
                                        disabled={rowActionBusy === String(r.doc._id) || isTransferReceivedByDestination(r)}
                                        onClick={async () => {
                                          setCancelTransferConfirmRow(r)
                                        }}
                                        className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none bg-amber-500 text-white hover:bg-amber-600`}
                                        title={isTransferReceivedByDestination(r) ? "Cannot cancel. Document already received or processed by destination." : "Cancel Transfer"}
                                      >
                                        Cancel Transfer
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={rowActionBusy === String(r.doc._id) || hasTransferredFromCurrentOffice(r)}
                                        onClick={() => {
                                          if (hasReceivedForCurrentOffice(r)) {
                                            setTransferRow(r)
                                             setTransferDest("")
                                             setTransferTask("")
                                             setTransferRemarks("")
                                            setSubDocCount(0)
                                            setSubDocItems([])
                                            return
                                          }
                                          setReceiveConfirmRow(r)
                                          setReceiveConfirmMessage(`Mark ${r.trackingNo} as received?`)
                                        }}
                                        className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none ${deadlineStatus.isExceeded
                                          ? 'bg-white text-rose-600 hover:bg-rose-50'
                                          : hasReceivedForCurrentOffice(r)
                                            ? 'bg-sky-600 text-white hover:bg-sky-700'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                          }`}
                                      >
                                        {hasTransferredFromCurrentOffice(r) ? "Transferred" : hasReceivedForCurrentOffice(r) ? "Transfer" : "Received"}
                                      </button>
                                    )}
                                  </>
                                )}
                              </>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setLogsRow(r)
                            }}
                            className={`inline-flex h-8 items-center justify-center rounded-md border text-xs font-semibold shadow-sm transition focus:outline-none focus-visible:outline-none ${deadlineStatus.isExceeded ? 'border-white/40 bg-white/20 text-white hover:bg-white/30' : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'}`}
                          >
                            Review Logs
                          </button>
                        )}
                        {actionMode === "full" ? (
                          <>
                            <button
                              type="button"
                              disabled={rowActionBusy === String(r.doc._id)}
                              onClick={() => {
                                setApproveRow(r)
                                setApproveDestOffice("BUDGET")
                              }}
                              className={`inline-flex h-8 items-center justify-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none`}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={rowActionBusy === String(r.doc._id)}
                              onClick={() => {
                                setReturnConfirmRow(r)
                                setReturnConfirmMessage("Returned")
                                setReturnConfirmRemarks("")
                              }}
                              className={`inline-flex h-8 items-center justify-center rounded-md bg-rose-600 px-3 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none`}
                            >
                              Return
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {visible.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-600" colSpan={actionMode === "logsOnly" ? ((actionIsGso || actionIsAdmin) ? 12 : 11) : ((actionIsGso || actionIsAdmin) ? 13 : 12)}>
                    No results.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {isPreviewOpen && preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setPreview(null)
              setPrActivePage(0)
              closeEditPrPreview()
            }
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {preview.type} Preview - {preview.row.trackingNo}
                </div>
              </div>
              <div className="flex items-center gap-2 no-print">
                {preview.type === 'PR' && computePrPageCount(preview.row.doc.prItems || []) > 1 ? (
                  <div className="mr-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPrActivePage((p) => Math.max(0, p - 1))}
                      disabled={prActivePage === 0}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <span className="px-2 text-xs font-medium">Page {prActivePage + 1}</span>
                    <button
                      type="button"
                      onClick={() => setPrActivePage((p) => p + 1)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      Next
                    </button>
                  </div>
                ) : null}

                {preview.type === 'PR' ? (
                  <button
                    type="button"
                    onClick={() => capturePrPreviewToPdf(preview.row)}
                    disabled={prPdfBusy}
                    className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none disabled:opacity-50"
                    title="Download PDF"
                  >
                    {prPdfBusy ? '...' : <Download className="size-4" />}
                  </button>
                ) : null}

                {preview.type === 'OBR' ? (
                  <button
                    type="button"
                    onClick={() => captureObrPreviewToPdf(preview.row)}
                    disabled={obrPdfBusy}
                    className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none disabled:opacity-50"
                    title="Download PDF"
                  >
                    {obrPdfBusy ? '...' : <Download className="size-4" />}
                  </button>
                ) : null}

                {preview.type === 'DV' ? (
                  <button
                    type="button"
                    onClick={() => captureDvPreviewToPdf(preview.row)}
                    disabled={dvPdfBusy}
                    className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none disabled:opacity-50"
                    title="Download PDF"
                  >
                    {dvPdfBusy ? '...' : <Download className="size-4" />}
                  </button>
                ) : null}

                {preview.type === 'PO' ? (
                  <>
                    {(actionIsGso || actionIsAdmin || hasPrivilege("PO Preparation") || hasPrivilege("Update PO") || hasPrivilege("Edit PO")) ? (
                      <button
                        type="button"
                        onClick={() => setIsEditPoModalOpen(true)}
                        className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                        title="Edit PO"
                      >
                        <Pencil className="size-4 text-blue-600" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => capturePoPreviewToPdf(preview.row)}
                      disabled={poPdfBusy}
                      className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none disabled:opacity-50"
                      title="Download PDF"
                    >
                      {poPdfBusy ? '...' : <Download className="size-4" />}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50 p-4">
              {preview.type === 'PR' ? (
                <div
                  ref={prCaptureRef}
                  style={{
                    position: 'fixed',
                    left: -10000,
                    top: 0,
                    width: 900,
                    height: 'auto',
                    overflow: 'visible',
                    background: 'white',
                  }}
                  aria-hidden="true"
                >
                  <div className="print-area">
                    <PrTemplatePreview
                      forceShowAllPages
                      model={{
                        trackingNo: preview.row.doc.trackingNo,
                        items: previewPrItems,
                        fund: preview.row.doc.fund || '',
                        department: preview.row.doc.department || '',
                        section: preview.row.doc.section || '',
                        prNo: String((preview.row.doc as any)?.prNo || '').trim(),
                        date: String((preview.row.doc as any)?.prDate || '').trim(),
                        fpp: preview.row.doc.fpp || '',
                        purpose: preview.row.doc.purpose || '',
                        requestedByName:
                          officeHeads[preview.row.doc.office?.toUpperCase() || '']?.head ||
                          preview.row.doc.requestedByName ||
                          'DEPARTMENT HEAD',
                        requestedByDesignation:
                          officeHeads[preview.row.doc.office?.toUpperCase() || '']?.designation ||
                          preview.row.doc.requestedByDesignation ||
                          'Department Head',
                        cashAvailabilityName: String((preview.row.doc as any)?.cashAvailabilityName || '').trim() || 'ALICIA R. MAGPANTAY',
                        cashAvailabilityDesignation: String((preview.row.doc as any)?.cashAvailabilityDesignation || '').trim() || 'Provincial Treasurer',
                        approvedByName: String((preview.row.doc as any)?.approvedByName || '').trim() || 'JOSE ENRIQUE S. GARCIA III',
                        approvedByDesignation: String((preview.row.doc as any)?.approvedByDesignation || '').trim() || 'Provincial Governor',
                        status: preview.row.doc.status,
                        logs: preview.row.doc.logs,
                        hasPr: preview.row.doc.prEnabled,
                        hasObr: preview.row.doc.obrEnabled,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {preview.type === 'OBR' ? (
                <>
                  <div ref={obrVisibleRef} className="print-area mx-auto w-[816px]">
                    <ObrTemplatePreview
                      model={
                        {
                          payee: 'PR',
                          office: 'N/A',
                          address: 'N/A',
                          trackingNo: preview.row.doc.trackingNo,
                          fund: preview.row.doc.fund || '',
                          obrNo:
                            String((preview.row.doc as any)?.obrNo || '').trim() ||
                            (preview.row.doc.fund === 'SEF' ? '200-26-' : '100-26-'),
                          responsibilityCenter: String((preview.row.doc as any)?.responsibilityCenter || '').trim(),
                          particulars:
                            String((preview.row.doc as any)?.obrParticulars || '').trim() ||
                            preview.row.doc.purpose ||
                            '',
                          notes: preview.row.doc.notes || '',
                          fpp: String((preview.row.doc as any)?.fpp || '').trim(),
                          accountCode: String((preview.row.doc as any)?.accountCode || '').trim(),
                          amount: preview.row.doc.amount || '',
                          preparedByName:
                            String((preview.row.doc as any)?.preparedByName || '').trim() ||
                            preview.row.doc.createdBy ||
                            '',
                          certifiedAName:
                            String((preview.row.doc as any)?.certifiedAName || '').trim() ||
                            officeHeads[preview.row.doc.office?.toUpperCase() || '']?.head ||
                            String((preview.row.doc as any)?.requestedByName || '').trim() ||
                            'ENGR. FERNANDO E. TANCIONGCO',
                          certifiedAPosition:
                            String((preview.row.doc as any)?.certifiedAPosition || '').trim() ||
                            officeHeads[preview.row.doc.office?.toUpperCase() || '']?.designation ||
                            String((preview.row.doc as any)?.requestedByDesignation || '').trim() ||
                            'OIC-PGSO',
                          certifiedBName:
                            String((preview.row.doc as any)?.certifiedBName || '').trim() ||
                            'EDUARDO D. BANZON',
                          certifiedBPosition:
                            String((preview.row.doc as any)?.certifiedBPosition || '').trim() ||
                            'Provincial Budget Officer',
                          status: preview.row.doc.status,
                          logs: preview.row.doc.logs,
                          hasPr: preview.row.doc.prEnabled,
                          hasObr: preview.row.doc.obrEnabled,
                        } satisfies ObrTemplateModel
                      }
                    />
                  </div>
                  <div
                    ref={obrCaptureRef}
                    style={{
                      position: 'fixed',
                      left: -10000,
                      top: 0,
                      width: 816,
                      height: 'auto',
                      overflow: 'visible',
                      background: 'white',
                    }}
                    aria-hidden="true"
                  >
                    <div className="print-area">
                      <ObrTemplatePreview
                        model={
                          {
                            payee: 'PR',
                            office: 'N/A',
                            address: 'N/A',
                            trackingNo: preview.row.doc.trackingNo,
                            fund: preview.row.doc.fund || '',
                            obrNo:
                              String((preview.row.doc as any)?.obrNo || '').trim() ||
                              (preview.row.doc.fund === 'SEF' ? '200-26-' : '100-26-'),
                            responsibilityCenter: String((preview.row.doc as any)?.responsibilityCenter || '').trim(),
                            particulars:
                              String((preview.row.doc as any)?.obrParticulars || '').trim() ||
                              preview.row.doc.purpose ||
                              '',
                            notes: preview.row.doc.notes || '',
                            fpp: String((preview.row.doc as any)?.fpp || '').trim(),
                            accountCode: String((preview.row.doc as any)?.accountCode || '').trim(),
                            amount: preview.row.doc.amount || '',
                            preparedByName:
                              String((preview.row.doc as any)?.preparedByName || '').trim() ||
                              preview.row.doc.createdBy ||
                              '',
                            certifiedAName:
                              String((preview.row.doc as any)?.certifiedAName || '').trim() ||
                              officeHeads[preview.row.doc.office?.toUpperCase() || '']?.head ||
                              String((preview.row.doc as any)?.requestedByName || '').trim() ||
                              'ENGR. FERNANDO E. TANCIONGCO',
                            certifiedAPosition:
                              String((preview.row.doc as any)?.certifiedAPosition || '').trim() ||
                              officeHeads[preview.row.doc.office?.toUpperCase() || '']?.designation ||
                              String((preview.row.doc as any)?.requestedByDesignation || '').trim() ||
                              'OIC-PGSO',
                            certifiedBName:
                              String((preview.row.doc as any)?.certifiedBName || '').trim() ||
                              'EDUARDO D. BANZON',
                            certifiedBPosition:
                              String((preview.row.doc as any)?.certifiedBPosition || '').trim() ||
                              'Provincial Budget Officer',
                            status: preview.row.doc.status,
                            logs: preview.row.doc.logs,
                            hasPr: preview.row.doc.prEnabled,
                            hasObr: preview.row.doc.obrEnabled,
                          } satisfies ObrTemplateModel
                        }
                      />
                    </div>
                  </div>
                </>
              ) : preview.type === 'DV' ? (
                <>
                  {previewDvModel && (
                    <div ref={dvVisibleRef} className="print-area mx-auto w-[816px]">
                      <DvTemplatePreview model={previewDvModel} />
                    </div>
                  )}
                  {previewDvModel && (
                    <div
                      ref={dvCaptureRef}
                      style={{
                        position: 'fixed',
                        left: -10000,
                        top: 0,
                        width: 816,
                        height: 'auto',
                        overflow: 'visible',
                        background: 'white',
                      }}
                      aria-hidden="true"
                    >
                      <div className="print-area">
                        <DvTemplatePreview model={previewDvModel} />
                      </div>
                    </div>
                  )}
                </>
              ) : preview.type === 'PO' ? (
                <>
                  {previewPoModel && (
                    <div ref={poVisibleRef} className="print-area mx-auto w-[816px]">
                      <PoTemplatePreview model={previewPoModel} />
                    </div>
                  )}
                  {previewPoModel && (
                    <div
                      ref={poCaptureRef}
                      style={{
                        position: 'fixed',
                        left: -10000,
                        top: 0,
                        width: 816,
                        height: 'auto',
                        overflow: 'visible',
                        background: 'white',
                      }}
                      aria-hidden="true"
                    >
                      <div className="print-area">
                        <PoTemplatePreview model={previewPoModel} />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="print-area mx-auto w-[816px]">
                  <PrTemplatePreview
                    activePage={prActivePage}
                    model={{
                      trackingNo: preview.row.doc.trackingNo,
                      items: previewPrItems,
                      fund: preview.row.doc.fund || '',
                      department: preview.row.doc.department || '',
                      section: preview.row.doc.section || '',
                      prNo: String((preview.row.doc as any)?.prNo || '').trim(),
                      date: String((preview.row.doc as any)?.prDate || '').trim(),
                      fpp: preview.row.doc.fpp || '',
                      purpose: preview.row.doc.purpose || '',
                      requestedByName: preview.row.doc.requestedByName || 'DEPARTMENT HEAD',
                      requestedByDesignation: preview.row.doc.requestedByDesignation || 'Department Head',
                      cashAvailabilityName: String((preview.row.doc as any)?.cashAvailabilityName || '').trim() || 'ALICIA R. MAGPANTAY',
                      cashAvailabilityDesignation: String((preview.row.doc as any)?.cashAvailabilityDesignation || '').trim() || 'Provincial Treasurer',
                      approvedByName: String((preview.row.doc as any)?.approvedByName || '').trim() || 'JOSE ENRIQUE S. GARCIA III',
                      approvedByDesignation: String((preview.row.doc as any)?.approvedByDesignation || '').trim() || 'Provincial Governor',
                      status: preview.row.doc.status,
                      logs: preview.row.doc.logs,
                      hasPr: preview.row.doc.prEnabled,
                      hasObr: preview.row.doc.obrEnabled,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {preview && preview.type === 'PR' && editPrPreviewOpen && editPrPreviewDraft ? (
        <div
          className="fixed inset-0 z-60 flex items-start justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) closeEditPrPreview()
          }}
        >
          <div className="mt-10 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">Edit PR Fields</div>
                <div className="truncate text-xs text-slate-600">{preview.row.trackingNo}</div>
              </div>
              <button
                type="button"
                onClick={closeEditPrPreview}
                className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {editPrPreviewError ? (
                <div className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{editPrPreviewError}</div>
              ) : null}

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="prDepartment">Department</label>
                    <input
                      id="prDepartment"
                      value={editPrPreviewDraft.department}
                      onChange={(e) => setEditPrPreviewDraft((p) => (p ? { ...p, department: e.target.value } : p))}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="prSection">Section</label>
                    <input
                      id="prSection"
                      value={editPrPreviewDraft.section}
                      onChange={(e) => setEditPrPreviewDraft((p) => (p ? { ...p, section: e.target.value } : p))}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="prNo">PR No</label>
                    <input
                      id="prNo"
                      value={editPrPreviewDraft.prNo}
                      onChange={(e) => setEditPrPreviewDraft((p) => (p ? { ...p, prNo: e.target.value } : p))}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      placeholder="Enter PR No"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="prDate">Date</label>
                    <input
                      id="prDate"
                      value={editPrPreviewDraft.prDate}
                      onChange={(e) => setEditPrPreviewDraft((p) => (p ? { ...p, prDate: e.target.value } : p))}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      placeholder="e.g. 03/19/2026"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="prFpp">FPP</label>
                    <input
                      id="prFpp"
                      value={editPrPreviewDraft.fpp}
                      onChange={(e) => setEditPrPreviewDraft((p) => (p ? { ...p, fpp: e.target.value } : p))}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">Items</div>
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="w-full min-w-[720px] border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
                      <thead className="bg-blue-600 text-white">
                        <tr className="text-left text-[11px] font-semibold text-white">
                          <th className="border-b border-blue-700 px-2 py-2">Unit</th>
                          <th className="border-b border-blue-700 px-2 py-2">Description</th>
                          <th className="border-b border-blue-700 px-2 py-2">Qty</th>
                          <th className="border-b border-blue-700 px-2 py-2">Unit Cost</th>
                          <th className="border-b border-blue-700 px-2 py-2">Total Cost</th>
                          <th className="border-b border-blue-700 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {(editPrPreviewDraft.prItems || []).map((it, idx) => (
                          <tr key={idx} className="text-sm">
                            <td className="border-b border-slate-200 px-2 py-1 align-top">
                              <input
                                value={String(it?.unit || '')}
                                onChange={(e) =>
                                  setEditPrPreviewDraft((p) => {
                                    if (!p) return p
                                    const next = [...(p.prItems || [])]
                                    next[idx] = { ...next[idx], unit: e.target.value }
                                    return { ...p, prItems: next }
                                  })
                                }
                                className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm focus:outline-none focus-visible:outline-none"
                              />
                            </td>
                            <td className="border-b border-slate-200 px-2 py-1 align-top">
                              <input
                                value={String(it?.description || '')}
                                onChange={(e) =>
                                  setEditPrPreviewDraft((p) => {
                                    if (!p) return p
                                    const next = [...(p.prItems || [])]
                                    next[idx] = { ...next[idx], description: e.target.value }
                                    return { ...p, prItems: next }
                                  })
                                }
                                className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm focus:outline-none focus-visible:outline-none"
                              />
                            </td>
                            <td className="border-b border-slate-200 px-2 py-1 align-top">
                              <input
                                value={String(it?.quantity || '')}
                                onChange={(e) =>
                                  setEditPrPreviewDraft((p) => {
                                    if (!p) return p
                                    const next = [...(p.prItems || [])]
                                    next[idx] = { ...next[idx], quantity: e.target.value }
                                    return { ...p, prItems: next }
                                  })
                                }
                                className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm focus:outline-none focus-visible:outline-none"
                              />
                            </td>
                            <td className="border-b border-slate-200 px-2 py-1 align-top">
                              <input
                                value={String(it?.unitCost || '')}
                                onChange={(e) =>
                                  setEditPrPreviewDraft((p) => {
                                    if (!p) return p
                                    const next = [...(p.prItems || [])]
                                    next[idx] = { ...next[idx], unitCost: e.target.value }
                                    return { ...p, prItems: next }
                                  })
                                }
                                className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm focus:outline-none focus-visible:outline-none"
                              />
                            </td>
                            <td className="border-b border-slate-200 px-2 py-1 align-top">
                              <input
                                value={String(it?.totalCost || '')}
                                onChange={(e) =>
                                  setEditPrPreviewDraft((p) => {
                                    if (!p) return p
                                    const next = [...(p.prItems || [])]
                                    next[idx] = { ...next[idx], totalCost: e.target.value }
                                    return { ...p, prItems: next }
                                  })
                                }
                                className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm focus:outline-none focus-visible:outline-none"
                              />
                            </td>
                            <td className="border-b border-slate-200 px-2 py-1 align-top">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditPrPreviewDraft((p) => {
                                    if (!p) return p
                                    const next = [...(p.prItems || [])]
                                    next.splice(idx, 1)
                                    return { ...p, prItems: next }
                                  })
                                }
                                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                title="Remove row"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditPrPreviewDraft((p) => {
                        if (!p) return p
                        return { ...p, prItems: [...(p.prItems || []), { unit: '', description: '', quantity: '', unitCost: '', totalCost: '' }] }
                      })
                    }
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Add Row
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="prPurpose">Purpose</label>
                  <textarea
                    id="prPurpose"
                    value={editPrPreviewDraft.purpose}
                    onChange={(e) => setEditPrPreviewDraft((p) => (p ? { ...p, purpose: e.target.value } : p))}
                    className="min-h-20 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                  />
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <div className="mb-3 text-sm font-bold text-slate-800 uppercase tracking-wide">Signatories</div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="requestedByName">Requested By (Name)</label>
                      <input
                        id="requestedByName"
                        value={editPrPreviewDraft.requestedByName}
                        onChange={(e) => setEditPrPreviewDraft((p) => (p ? { ...p, requestedByName: e.target.value } : p))}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="requestedByDesignation">Requested By (Designation)</label>
                      <input
                        id="requestedByDesignation"
                        value={editPrPreviewDraft.requestedByDesignation}
                        onChange={(e) => setEditPrPreviewDraft((p) => (p ? { ...p, requestedByDesignation: e.target.value } : p))}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="cashAvailabilityName">Cash Availability (Name)</label>
                      <input
                        id="cashAvailabilityName"
                        value={editPrPreviewDraft.cashAvailabilityName}
                        onChange={(e) => setEditPrPreviewDraft((p) => (p ? { ...p, cashAvailabilityName: e.target.value } : p))}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="cashAvailabilityDesignation">Cash Availability (Designation)</label>
                      <input
                        id="cashAvailabilityDesignation"
                        value={editPrPreviewDraft.cashAvailabilityDesignation}
                        onChange={(e) => setEditPrPreviewDraft((p) => (p ? { ...p, cashAvailabilityDesignation: e.target.value } : p))}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="approvedByName">Approved By (Name)</label>
                      <input
                        id="approvedByName"
                        value={editPrPreviewDraft.approvedByName}
                        onChange={(e) => setEditPrPreviewDraft((p) => (p ? { ...p, approvedByName: e.target.value } : p))}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="approvedByDesignation">Approved By (Designation)</label>
                      <input
                        id="approvedByDesignation"
                        value={editPrPreviewDraft.approvedByDesignation}
                        onChange={(e) => setEditPrPreviewDraft((p) => (p ? { ...p, approvedByDesignation: e.target.value } : p))}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                onClick={closeEditPrPreview}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editPrPreviewBusy}
                onClick={async () => {
                  if (!preview || !editPrPreviewDraft) return
                  try {
                    setEditPrPreviewBusy(true)
                    setEditPrPreviewError(null)

                    const nextDepartment = editPrPreviewDraft.department.trim()
                    const nextSection = editPrPreviewDraft.section.trim()
                    const nextPrNo = editPrPreviewDraft.prNo.trim()
                    const nextPrDate = editPrPreviewDraft.prDate.trim()
                    const nextFpp = editPrPreviewDraft.fpp.trim()
                    const nextPurpose = editPrPreviewDraft.purpose.trim()
                    const nextPrItems = Array.isArray(editPrPreviewDraft.prItems) ? editPrPreviewDraft.prItems : []
                    const nextRequestedByName = editPrPreviewDraft.requestedByName.trim()
                    const nextRequestedByDesignation = editPrPreviewDraft.requestedByDesignation.trim()
                    const nextCashAvailabilityName = editPrPreviewDraft.cashAvailabilityName.trim()
                    const nextCashAvailabilityDesignation = editPrPreviewDraft.cashAvailabilityDesignation.trim()
                    const nextApprovedByName = editPrPreviewDraft.approvedByName.trim()
                    const nextApprovedByDesignation = editPrPreviewDraft.approvedByDesignation.trim()

                    const token = localStorage.getItem('token')
                    const response = await fetch(`${API_URL}/documents/${preview.row.doc._id}`, {
                      method: 'PATCH',
                      headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        department: nextDepartment,
                        section: nextSection,
                        prNo: nextPrNo,
                        prDate: nextPrDate,
                        fpp: nextFpp,
                        purpose: nextPurpose,
                        prItems: nextPrItems,
                        requestedByName: nextRequestedByName,
                        requestedByDesignation: nextRequestedByDesignation,
                        cashAvailabilityName: nextCashAvailabilityName,
                        cashAvailabilityDesignation: nextCashAvailabilityDesignation,
                        approvedByName: nextApprovedByName,
                        approvedByDesignation: nextApprovedByDesignation,
                      }),
                    })
                    if (!response.ok) {
                      const msg = await response.text().catch(() => '')
                      throw new Error(msg || 'Failed to update PR fields')
                    }

                    setPreview((prev) => {
                      if (!prev || prev.type !== 'PR') return prev
                      return {
                        ...prev,
                        row: {
                          ...prev.row,
                          doc: {
                            ...prev.row.doc,
                            department: nextDepartment,
                            section: nextSection,
                            prNo: nextPrNo,
                            prDate: nextPrDate,
                            fpp: nextFpp,
                            purpose: nextPurpose,
                            prItems: nextPrItems,
                            requestedByName: nextRequestedByName,
                            requestedByDesignation: nextRequestedByDesignation,
                            cashAvailabilityName: nextCashAvailabilityName,
                            cashAvailabilityDesignation: nextCashAvailabilityDesignation,
                            approvedByName: nextApprovedByName,
                            approvedByDesignation: nextApprovedByDesignation,
                          },
                        },
                      }
                    })

                    await fetchRowsRef.current?.()
                    closeEditPrPreview()
                  } catch (e) {
                    setEditPrPreviewError(e instanceof Error ? e.message : 'Failed to update PR fields')
                  } finally {
                    setEditPrPreviewBusy(false)
                  }
                }}
                className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLogsOpen ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setLogsRow(null)
            }
          }}
        >
          <div className="min-h-full w-full">
            <div className="flex min-h-full items-start justify-center py-6">
              {actionMode === "logsOnly" ? (
                logsOnlyActionMode === "reviewLogsOnly" ? (
                  <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <History className="size-4 text-emerald-600" />
                          <h3 className="truncate text-base font-bold text-slate-900">Review Logs</h3>
                        </div>
                        <div className="mt-0.5 truncate text-xs font-medium text-slate-500">
                          Tracking No: <span className="text-slate-900">{logsRow?.trackingNo}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLogsRow(null)}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none"
                        aria-label="Close"
                      >
                        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

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
                              const items = Array.isArray(logsRow?.doc?.logs) ? [...(logsRow?.doc?.logs as any[])] : []
                              const visibleItems = items
                                .map((l) => ({
                                  createdAt: l?.createdAt,
                                  byUser: String(l?.byUser || '').trim(),
                                  byOffice: String(l?.byOffice || '').trim(),
                                  label: String(l?.label || '').trim(),
                                  color: String(l?.color || 'bg-sky-500'),
                                }))
                                .filter((l) => Boolean(l.label))
                                .reverse()

                              if (visibleItems.length === 0) {
                                return (
                                  <tr>
                                    <td className="px-4 py-10 text-center text-sm text-slate-400" colSpan={4}>
                                      No activity logs found.
                                    </td>
                                  </tr>
                                )
                              }

                              return visibleItems.map((l, idx) => {
                                const processedBy = l.byUser || l.byOffice || "-"
                                const dateRaw = l.createdAt ? new Date(l.createdAt as any) : null
                                const dateText = dateRaw && Number.isFinite(dateRaw.getTime())
                                  ? dateRaw.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                  : "-"
                                const timeText = dateRaw && Number.isFinite(dateRaw.getTime())
                                  ? dateRaw.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })
                                  : "-"

                                return (
                                  <tr key={`${l.label}-${idx}`} className={`${l.color} text-white`}>
                                    <td className="px-4 py-3 align-top">
                                      <div className="flex flex-col gap-0.5">
                                        <span className="font-bold tracking-tight">{dateText}</span>
                                        <span className="text-[10px] opacity-80 font-medium uppercase">{timeText}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                      <div className="text-xs font-bold leading-tight uppercase">{processedBy}</div>
                                    </td>
                                    <td className="px-4 py-3 align-top text-xs font-medium leading-relaxed">
                                      {formatLogRemarks(l.label)}
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

                      {/* Action Section */}
                      <div className="mt-8 space-y-6 border-t border-slate-100 pt-6">
                        <div className="grid gap-6 md:grid-cols-2">
                          <div className="space-y-2">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Remarks Type</div>
                            <select
                              value={reviewRemarksType}
                              onChange={(e) => setReviewRemarksType(e.target.value as any)}
                              aria-label="Remarks Type"
                              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                            >
                              <option value="return">Return to End-User</option>
                              <option value="approve">Approve Document</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Remarks</div>
                            <input
                              value={reviewRemarks}
                              onChange={(e) => setReviewRemarks(e.target.value)}
                              aria-label="Remarks"
                              placeholder="Enter remarks..."
                              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none placeholder:text-slate-400"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 p-5">
                      <button
                        type="button"
                        onClick={() => setLogsRow(null)}
                        className="h-10 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 active:scale-95"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        disabled={!logsRow || rowActionBusy === String(logsRow?.doc?._id || "")}
                        onClick={async () => {
                          if (!logsRow) return

                          const trimmed = reviewRemarks.trim()
                          const prefix = reviewRemarksType === "approve" ? "Approved" : "Returned"
                          const label = trimmed ? `${prefix}: ${trimmed}` : prefix
                          const color = reviewRemarksType === "approve" ? "bg-emerald-600" : "bg-rose-600"

                          const shouldUpdateStatus = logsOnlyActionMode !== "reviewLogsOnly"
                          const nextStatus = shouldUpdateStatus
                            ? reviewRemarksType === "approve"
                              ? actionIsGso
                                ? "pending-bac"
                                : actionIsBac
                                  ? "ready-transfer"
                                  : undefined
                              : "returned"
                            : reviewRemarksType === "return"
                              ? "for-revision"
                              : reviewRemarksType === "approve"
                                ? actionIsGso
                                  ? "pending-bac"
                                  : actionIsBac
                                    ? "ready-transfer"
                                    : undefined
                                : undefined

                          await submitRowLog(logsRow, { label, color }, nextStatus)
                          setReviewRemarks("")
                        }}
                        className="h-10 rounded-xl bg-emerald-600 px-8 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-95 disabled:scale-100 disabled:opacity-50"
                      >
                        {rowActionBusy === String(logsRow?.doc?._id || "") ? "Submitting…" : "Submit Action"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-slate-900">
                          Transaction History of {logsRow?.trackingNo}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          Document Current Location: {inferCurrentLocation(String(logsRow?.doc?.status || ""), String(logsRow?.doc?.office || ""), logsRow?.doc?.logs)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLogsRow(null)}
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
                            Document Current Location: {inferCurrentLocation(String(logsRow?.doc?.status || ""), String(logsRow?.doc?.office || ""), logsRow?.doc?.logs)}
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <div>
                              <span className="font-semibold">Tracking Number:</span> {logsRow?.trackingNo}
                            </div>
                            <div>
                              <span className="font-semibold">Requestor:</span> {String(logsRow?.doc?.office || '-')}
                            </div>
                            <div>
                              <span className="font-semibold">PR Number:</span>{' '}
                              {logsRow?.doc?.prEnabled === false ? 'Not Available' : 'Available'}
                            </div>
                            <div>
                              <span className="font-semibold">OBR Number:</span>{' '}
                              {logsRow?.doc?.obrEnabled === false ? 'Not Available' : 'Available'}
                            </div>
                            <div className="md:col-span-2">
                              <span className="font-semibold">Purpose:</span> {String(logsRow?.doc?.purpose || '-')}
                            </div>
                            <div className={Array.isArray((logsRow?.doc as any)?.subDocuments) && (logsRow?.doc as any).subDocuments.length > 0 ? "md:col-span-2" : ""}>
                              <span className="font-semibold">Supplier:</span>{' '}
                              {(() => {
                                const d = logsRow?.doc as any
                                if (!d) return '-'
                                const subs = Array.isArray(d?.subDocuments) ? (d.subDocuments as any[]) : []
                                if (subs.length > 0) {
                                  const { supplier: mainSupplier, amount: mainAmt } = getMainDocSupplierInfo(d)
                                  const list = [
                                    {
                                      name: mainSupplier || 'Not Updated',
                                      amount: mainAmt ? `₱ ${mainAmt}` : '',
                                    },
                                    ...subs.map((s: any, sidx: number) => ({
                                      name: String(s?.supplier || '').trim() || 'Not Updated',
                                      amount: (() => {
                                        const a = s?.amount || getSubDocAmount(d, sidx)
                                        return a ? `₱ ${a}` : ''
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
                                const { supplier, amount: amt } = getMainDocSupplierInfo(d)
                                if (supplier && amt) return `${supplier} - ₱ ${amt}`
                                return supplier || String(d?.supplier || '-')
                              })()}
                            </div>
                            <div>
                              <span className="font-semibold">Source of Fund:</span> {String(logsRow?.doc?.fund || '-')}
                            </div>
                            <div>
                              <span className="font-semibold">Amount:</span>{' '}
                              {(() => {
                                const cleaned = String(logsRow?.doc?.amount || '')
                                  .replace(/[^0-9.,-]/g, '')
                                  .trim()
                                return cleaned ? `₱ ${cleaned}` : '-'
                              })()}
                            </div>
                            <div>
                              <span className="font-semibold">Email:</span> {String(logsRow?.doc?.email || '-')}
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-slate-200 px-6 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-slate-900">
                              {historyTab === "transactions" ? "Transaction Logs" : historyTab === "subdocuments" ? "Sub-Document Transactions" : "Pre-Validation"}
                            </div>
                            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
                              <button
                                type="button"
                                onClick={() => setHistoryTab("transactions")}
                                className={`h-8 rounded px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${historyTab === "transactions"
                                  ? "bg-slate-900 text-white"
                                  : "bg-transparent text-slate-700 hover:bg-slate-100"
                                  }`}
                              >
                                Transactions
                              </button>
                              {Array.isArray((logsRow?.doc as any)?.subDocuments) && (logsRow?.doc as any)?.subDocuments.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setHistoryTab("subdocuments")}
                                  className={`h-8 rounded px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${historyTab === "subdocuments"
                                    ? "bg-slate-900 text-white"
                                    : "bg-transparent text-slate-700 hover:bg-slate-100"
                                    }`}
                                >
                                  Sub-Documents
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setHistoryTab("prevalidation")}
                                className={`h-8 rounded px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${historyTab === "prevalidation"
                                  ? "bg-slate-900 text-white"
                                  : "bg-transparent text-slate-700 hover:bg-slate-100"
                                  }`}
                              >
                                Pre-Validation
                              </button>
                            </div>
                          </div>
                          {historyTab === 'subdocuments' ? (
                            <div className="mt-4 space-y-6">
                              {Array.isArray((logsRow?.doc as any)?.subDocuments) && (logsRow?.doc as any)?.subDocuments.map((sub: any, sIdx: number) => {
                                const subLogs = Array.isArray(sub.logs)
                                  ? [...sub.logs]
                                    .map((l: any, originalIndex: number) => {
                                      const ts = new Date(String(l?.createdAt || '')).getTime()
                                      const time = Number.isFinite(ts) ? ts : null
                                      return { l, originalIndex, time }
                                    })
                                    .sort((a, b) => {
                                      const aHasTime = typeof a.time === 'number'
                                      const bHasTime = typeof b.time === 'number'

                                      // Prefer valid timestamps (newest first)
                                      if (aHasTime && bHasTime && a.time !== b.time) return (b.time as number) - (a.time as number)
                                      if (aHasTime && !bHasTime) return -1
                                      if (!aHasTime && bHasTime) return 1

                                      // Fallback: use original array order (later items are newer)
                                      return b.originalIndex - a.originalIndex
                                    })
                                    .map((x) => x.l)
                                  : []
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
                                          const processedBy = l.byUser || l.byOffice || '-'
                                          const parsed = parseLogActionAndRemarks(String(l.label || ''), String(l.byOffice || ''))
                                          const action = parsed.action
                                          const remarks = parsed.remarks
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
                                            <td className="px-3 py-4 text-center text-xs text-slate-500" colSpan={4}>No logs found</td>
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
                                    <th className="px-3 py-2 text-xs font-semibold text-white">Date</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-white">Processed By</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-white">Action</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-white">Remarks</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-white">Days</th>
                                    <th className="px-3 py-2 text-xs font-semibold text-white">Duration</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {(() => {
                                    const rawAsc = Array.isArray(logsRow?.doc?.logs) ? [...(logsRow?.doc?.logs as any[])] : []
                                    const isTransactionsStartLog = (labelRaw: string) => {
                                      const labelLower = String(labelRaw || '').toLowerCase()
                                      if (!labelLower) return false
                                      if (labelLower.includes('transferred to')) return true
                                      if (labelLower === 'completed' || labelLower.includes('completed')) return true
                                      if (labelLower === 'cancelled' || labelLower === 'canceled' || labelLower.includes('cancel')) return true
                                      if (labelLower === 'discontinued' || labelLower.includes('discontinued')) return true
                                      return false
                                    }

                                    const firstTransferIdx = rawAsc.findIndex((l) =>
                                      isTransactionsStartLog(String(l?.label || ''))
                                    )

                                    const prevalidationAsc = firstTransferIdx >= 0 ? rawAsc.slice(0, firstTransferIdx) : rawAsc
                                    const transactionsAsc = firstTransferIdx >= 0 ? rawAsc.slice(firstTransferIdx) : []

                                    const selectedAsc = historyTab === "transactions" ? transactionsAsc : prevalidationAsc
                                    const selected = selectedAsc
                                      .map((l) => ({
                                        label: String(l?.label || '').trim(),
                                        byUser: String(l?.byUser || '').trim(),
                                        byOffice: String(l?.byOffice || '').trim(),
                                        createdAt: String(l?.createdAt || '').trim(),
                                      }))
                                      .filter((l) => Boolean(l.label))

                                    const officeScopedSelected = (() => {
                                      return selected
                                    })()

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
                                        labelLower.includes('discontinued')
                                      )
                                    }
                                    const isStageEndLog = (labelRaw: string) => {
                                      return isTransferLog(labelRaw) || isTerminalActionLog(labelRaw)
                                    }

                                    const transactionFilteredSelected =
                                      historyTab === 'transactions'
                                        ? officeScopedSelected.filter(
                                          (l) => {
                                            const lbl = String(l?.label || '')
                                            return isTransferLog(lbl) || isReceivedLog(lbl) || isTerminalActionLog(lbl)
                                          }
                                        )
                                        : officeScopedSelected

                                    const timestamps = transactionFilteredSelected.map((l) => new Date(l.createdAt).getTime())
                                    const spanByStartIdx = new Map<number, { rowSpan: number; durationMs: number }>()
                                    const coveredIdx = new Set<number>()
                                    const exceededIndices = new Set<number>()

                                    for (let i = 0; i < transactionFilteredSelected.length; i += 1) {
                                      if (coveredIdx.has(i)) continue
                                      const current = transactionFilteredSelected[i]
                                      if (!isReceivedLog(String(current?.label || ''))) continue

                                      let endIdx = -1
                                      for (let j = i + 1; j < transactionFilteredSelected.length; j += 1) {
                                        if (isStageEndLog(String(transactionFilteredSelected[j]?.label || ''))) {
                                          endIdx = j
                                          break
                                        }
                                      }

                                      if (endIdx < 0) continue

                                      const startTs = timestamps[i]
                                      const endTs = timestamps[endIdx]
                                      const durationMs =
                                        Number.isFinite(startTs) && Number.isFinite(endTs) ? Math.max(0, endTs - startTs) : 0

                                      // Check if this specific stage (From Received to Transfer) is exceeded
                                      const isStageExceeded = (() => {
                                        const receivedLog = transactionFilteredSelected[i]
                                        const offKey = String(receivedLog.byOffice || '').trim().toUpperCase()
                                        const lbl = String(receivedLog.label || '')
                                        const taskName = (() => {
                                          const mFor = lbl.match(/received(?:\s+by\s+[^(:]+)?\s+for\s+([^(:]+)\s*\)?/)
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

                                    if (!transactionFilteredSelected.length) {
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
                                        {transactionFilteredSelected.map((l, idx) => {
                                          const processedBy = l.byUser || l.byOffice || "-"
                                          const label = String(l.label || '').trim()
                                          const parsed = parseLogActionAndRemarks(label, String(l.byOffice || ''))

                                          const isExceededProcessed = exceededIndices.has(idx)
                                          const isTerminalAction = (() => {
                                            const labelLower = String(l.label || '').toLowerCase()
                                            return labelLower.includes('approved') ||
                                              labelLower.includes('returned') ||
                                              labelLower.includes('completed') ||
                                              labelLower.includes('transferred to')
                                          })()

                                          const action = parsed.action
                                          const remarks = parsed.remarks
                                          const span = spanByStartIdx.get(idx)
                                          const isCovered = coveredIdx.has(idx)

                                          return (
                                            <tr
                                              key={`${l.label}-${idx}`}
                                              className={`${isExceededProcessed ? 'bg-rose-600 text-white font-medium' : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}`}
                                            >
                                              <td className="px-3 py-2 text-xs">{l.createdAt ? new Date(l.createdAt).toLocaleString() : '-'}</td>
                                              <td className="px-3 py-2 text-xs whitespace-pre-line">{processedBy}</td>
                                              <td className="px-3 py-2 text-xs">
                                                <div className="flex items-center gap-2">
                                                  <span className={isExceededProcessed ? 'font-bold' : ''}>{action || '-'}</span>
                                                  {isExceededProcessed && isTerminalAction && (
                                                    <span className="inline-flex items-center rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold text-white ring-1 ring-inset ring-white/50">
                                                      EXCEEDED
                                                    </span>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="px-3 py-2 text-xs">{remarks || '-'}</td>
                                              {isCovered ? null : span ? (
                                                <td className={`px-3 py-2 text-xs font-semibold ${isExceededProcessed ? 'bg-rose-700/50' : ''}`} rowSpan={span.rowSpan}>
                                                  {(() => {
                                                    const days = Math.max(0, Math.floor(span.durationMs / (1000 * 60 * 60 * 24)))
                                                    return `${days} day(s)`
                                                  })()}
                                                </td>
                                              ) : (
                                                <td className="px-3 py-2 text-xs text-slate-700">-</td>
                                              )}
                                              {isCovered ? null : span ? (
                                                <td className={`px-3 py-2 text-xs font-semibold ${isExceededProcessed ? 'bg-rose-700/50' : ''}`} rowSpan={span.rowSpan}>
                                                  {(() => {
                                                    const totalMinutes = Math.max(0, Math.floor(span.durationMs / (1000 * 60)))
                                                    const hours = Math.floor(totalMinutes / 60)
                                                    const minutes = totalMinutes % 60
                                                    return `${hours} hour(s) ${minutes} minute(s)`
                                                  })()}
                                                </td>
                                              ) : (
                                                <td className="px-3 py-2 text-xs text-slate-700">-</td>
                                              )}
                                            </tr>
                                          )
                                        })}
                                        <tr className="bg-emerald-600">
                                          <td className="px-3 py-3 text-right text-sm font-semibold text-white" colSpan={5}>
                                            Total Duration
                                          </td>
                                          <td className="px-3 py-3 text-sm font-semibold text-white">
                                            {(() => {
                                              const totalMinutes = Math.max(0, Math.floor(totalMs / (1000 * 60)))
                                              const hours = Math.floor(totalMinutes / 60)
                                              const minutes = totalMinutes % 60
                                              return `${hours} hour(s) ${minutes} minute(s)`
                                            })()}
                                          </td>
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
                )
              ) : (
                <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Review Logs</div>
                      <div className="truncate text-sm text-slate-600">{logsRow?.trackingNo}</div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto p-4">
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full text-left text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
                        <thead className="bg-blue-600 text-white">
                          <tr className="border-b border-blue-700">
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">User</th>
                            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {logsModalItems.map((l, idx) => {
                            const tone = mapLogToneFromColor(l.color)
                            const badge =
                              tone === "ok"
                                ? "bg-emerald-600 text-white"
                                : tone === "danger"
                                  ? "bg-rose-600 text-white"
                                  : tone === "warn"
                                    ? "bg-amber-400 text-slate-900"
                                    : tone === "muted"
                                      ? "bg-slate-200 text-slate-900"
                                      : "bg-sky-600 text-white"

                            const userLabel = l.byUser || l.byOffice || "-"

                            return (
                              <tr key={`${l.label}-${idx}`} className="align-top">
                                <td className="px-4 py-3 text-xs text-slate-700">{userLabel}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-start gap-3">
                                    <span
                                      className={`mt-0.5 inline-flex shrink-0 rounded px-2 py-1 text-[10px] font-semibold ${badge}`}
                                    >
                                      {tone === "ok" ? "Approved" : tone === "danger" ? "Returned" : "Info"}
                                    </span>
                                    <div className="min-w-0 text-sm text-slate-700">{formatLogRemarks(l.label)}</div>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                          {logsModalItems.length === 0 ? (
                            <tr>
                              <td className="px-4 py-10 text-center text-sm text-slate-600" colSpan={2}>
                                No Record Found
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
                      onClick={() => {
                        setLogsRow(null)
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {receiveConfirmRow ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setReceiveConfirmRow(null)
            }
          }}
        >
          <div className="min-h-full w-full">
            <div className="flex min-h-full items-start justify-center py-6">
              <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-900">Confirm Received</div>
                    <div className="truncate text-xs text-slate-600">{receiveConfirmRow.trackingNo}</div>
                  </div>
                </div>

                <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Document Details</div>
                    <div className="mt-2 grid gap-1 text-xs text-slate-700">
                      <div>
                        <span className="font-semibold">Supplier:</span> {String(receiveConfirmRow.supplier || (receiveConfirmRow.doc as any)?.supplier || '-')}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Task</div>
                    <select
                      value={receiveTask}
                      onChange={(e) => setReceiveTask(e.target.value)}
                      aria-label="Task"
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    >
                      {currentOfficeTasks.length ? (
                        currentOfficeTasks.map((t, idx) => {
                          const taskText = String(t?.task || '').trim()
                          if (!taskText) return null
                          return (
                            <option key={String(t?.taskId ?? idx)} value={taskText}>
                              {taskText}
                            </option>
                          )
                        })
                      ) : (
                        <option value="">No tasks</option>
                      )}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setReceiveConfirmRow(null)}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={rowActionBusy === String(receiveConfirmRow.doc._id)}
                    onClick={async () => {
                      const row = receiveConfirmRow
                      const pickedTask = String(receiveTask || '').trim()
                      const label = pickedTask ? `Received for ${pickedTask}` : receiveConfirmMessage
                      setReceiveConfirmRow(null)
                      await submitRowLog(row, { label, color: 'bg-sky-600' })
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {completeConfirmRow ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setCompleteConfirmRow(null)
            }
          }}
        >
          <div className="mx-auto w-full max-w-lg">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-slate-900">Confirm Complete</div>
                  <div className="truncate text-xs text-slate-600">{completeConfirmRow.trackingNo}</div>
                </div>
              </div>

              <div className="space-y-3 p-4">
                <div className="text-sm text-slate-700">Mark this request as completed?</div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Document Details</div>
                  <div className="mt-2 grid gap-1 text-xs text-slate-700">
                    <div>
                      <span className="font-semibold">Supplier:</span> {String(completeConfirmRow.supplier || (completeConfirmRow.doc as any)?.supplier || '-')}
                    </div>
                    <div>
                      <span className="font-semibold">Purpose:</span> {String(completeConfirmRow.purpose || '-')}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Remarks</label>
                  <textarea
                    rows={3}
                    value={completeConfirmRemarks}
                    onChange={(e) => setCompleteConfirmRemarks(e.target.value)}
                    placeholder="(Optional)"
                    className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={() => setCompleteConfirmRow(null)}
                  disabled={rowActionBusy === String(completeConfirmRow.doc._id)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rowActionBusy === String(completeConfirmRow.doc._id)}
                  onClick={async () => {
                    const row = completeConfirmRow
                    const remarks = String(completeConfirmRemarks || '').trim()
                    const label = remarks ? `Completed: ${remarks}` : 'Completed'
                    try {
                      await submitRowLog(row, { label, color: 'bg-emerald-600' }, 'completed')
                      setCompleteConfirmRow(null)
                      setCompleteConfirmRemarks("")
                    } catch {
                      // submitRowLog already reports error; keep modal open so user can retry.
                    }
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                >
                  Complete
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {cancelTransferConfirmRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setCancelTransferConfirmRow(null)
            }
          }}
        >
          <div className="w-full max-w-sm mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="font-semibold text-slate-900">Cancel Transfer</div>
            </div>
            <div className="p-4 text-sm text-slate-700">
              Are you sure you want to cancel the transfer for <span className="font-semibold">{cancelTransferConfirmRow.trackingNo}</span>?
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                onClick={() => setCancelTransferConfirmRow(null)}
                disabled={rowActionBusy === String(cancelTransferConfirmRow.doc._id)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                Keep Request
              </button>
              <button
                type="button"
                disabled={rowActionBusy === String(cancelTransferConfirmRow.doc._id)}
                onClick={async () => {
                  let prevStatus = "pending"
                  if (actionIsGso) prevStatus = "pending-gso"
                  else if (actionIsBac) prevStatus = "pending-bac"
                  else if (actionOfficeLower.includes('procurement')) prevStatus = "ready-transfer"
                  else if (actionIsBudget) prevStatus = "in-budget"
                  else if (actionIsPto) prevStatus = "in-pto"

                  try {
                    setRowActionBusy(String(cancelTransferConfirmRow.doc._id))
                    const token = localStorage.getItem('token')
                    const response = await fetch(`${API_URL}/documents/${cancelTransferConfirmRow.doc._id}`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({
                        cancelTransfer: true,
                        status: prevStatus
                      }),
                    })
                    if (!response.ok) {
                      const errData = await response.json().catch(() => null)
                      throw new Error(errData?.message || 'Failed to cancel transfer.')
                    }
                    await fetchRows()
                    setCancelTransferConfirmRow(null)
                  } catch (error) {
                    alert(error instanceof Error ? error.message : 'Error cancelling transfer')
                  } finally {
                    setRowActionBusy(null)
                  }
                }}
                className="inline-flex h-9 items-center justify-center rounded-md bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
              >
                Yes, Discontinue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {transferRow ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setTransferRow(null)
              setTransferTask("")
              setTransferRemarks("")
            }
          }}
        >
          <div className="min-h-full w-full">
            <div className="flex min-h-full items-start justify-center py-6">
              <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-900">Transfer Document</div>
                    <div className="truncate text-xs text-slate-600">{transferRow.trackingNo}</div>
                  </div>
                </div>

                <div className="space-y-3 px-4 py-4">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">Destination Office</div>
                    <select
                      value={transferDest}
                      onChange={(e) => setTransferDest(e.target.value as any)}
                      aria-label="Destination Office"
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    >
                      <option value="" disabled>
                        Select destination office
                      </option>
                      {transferOfficeOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                      <option value="RETURNED">Transferred to End Users</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-sm font-semibold text-slate-700">Task / Remarks</div>
                    {(() => {
                      const DEFAULT_TASKS = [
                        "For PR number",
                        "For OBR signing",
                        "For PR / OBR signing",
                        "For PR signing / approval",
                        "For canvassing / resolution signing",
                        "For PO number",
                        "For PO signing",
                        "For supplier (signing) / inspection & delivery / voucher preparation / signing of end user",
                        "For voucher signing",
                        "For check preparation",
                        "For signing of checks & voucher",
                        "For counter signing of checks",
                        "For check advice",
                        "For releasing of checks",
                      ]
                      const officeTasks = (transferDest.toUpperCase() === 'RETURNED'
                        ? (transferTasksByOffice[currentOfficeKey] || [])
                        : (transferTasksByOffice[String(transferDest || '').toUpperCase()] || [])
                      ).map((t) => String(t?.task || '').trim()).filter(Boolean)
                      // Merge: office-specific tasks first, then defaults — case-insensitive dedup
                      const seen = new Set<string>()
                      const taskList: string[] = []
                      for (const t of [...officeTasks, ...DEFAULT_TASKS]) {
                        if (!seen.has(t.toLowerCase())) {
                          seen.add(t.toLowerCase())
                          taskList.push(t)
                        }
                      }

                      return (
                        <div className="space-y-2">
                          <select
                            id="transfer-task-select"
                            value={transferTask}
                            onChange={(e) => setTransferTask(e.target.value)}
                            disabled={!String(transferDest || '').trim()}
                            aria-label="Task / Remarks"
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60"
                          >
                            <option value="">Select Task / Remarks</option>
                            {taskList.map((t, i) => (
                              <option key={i} value={t}>
                                {t}
                              </option>
                            ))}
                            <option value="__others__">Others / Custom Remarks</option>
                          </select>

                          {transferTask === "__others__" && (
                            <input
                              type="text"
                              value={transferRemarks}
                              onChange={(e) => setTransferRemarks(e.target.value)}
                              placeholder="Enter custom remarks..."
                              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                              autoFocus
                            />
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {currentOfficeKey === 'GSO' && transferDest.toUpperCase() === 'RETURNED' && (
                    <div className="space-y-3 p-3 border border-slate-200 rounded-md bg-slate-50">
                      <div className="text-sm font-semibold text-slate-800">Split into Sub-Documents</div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-slate-600">Number of Sub-Documents</div>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={subDocCount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0
                            setSubDocCount(val)
                            setSubDocItems((prev) => {
                              const next = [...prev]
                              if (val > next.length) {
                                for (let i = next.length; i < val; i++) {
                                  next.push({
                                    trackingNo: transferRow?.doc.trackingNo || "",
                                    purpose: transferRow?.doc.purpose || "",
                                    amount: transferRow?.doc.amount || ""
                                  })
                                }
                              } else {
                                next.length = val
                              }
                              return next
                            })
                          }}
                          className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                        />
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                        {subDocItems.map((item, idx) => (
                          <div key={idx} className="p-2 border border-slate-200 rounded bg-white space-y-2 shadow-sm opacity-80">
                            <div className="text-[10px] font-bold text-slate-400">SUB-DOCUMENT #{idx + 1}</div>
                            <input
                              type="text"
                              disabled
                              placeholder="Tracking Number"
                              value={item.trackingNo}
                              className="h-8 w-full rounded border border-slate-200 bg-slate-50 px-2 text-xs cursor-not-allowed"
                            />
                            <input
                              type="text"
                              disabled
                              placeholder="Purpose"
                              value={item.purpose}
                              className="h-8 w-full rounded border border-slate-200 bg-slate-50 px-2 text-xs cursor-not-allowed"
                            />
                            <input
                              type="text"
                              disabled
                              placeholder="Amount"
                              value={item.amount}
                              className="h-8 w-full rounded border border-slate-200 bg-slate-50 px-2 text-xs cursor-not-allowed"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}


                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={() => { setTransferRow(null); setTransferTask(""); setTransferRemarks(""); }}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={rowActionBusy === String(transferRow.doc._id) || !String(transferDest || '').trim()}
                    onClick={async () => {
                      const row = transferRow
                      const dest = transferDest
                      const task = transferTask === "__others__" ? String(transferRemarks || "").trim() : String(transferTask || "").trim()
                      setTransferRow(null)
                      setTransferTask("")
                      setTransferRemarks("")

                      // Handle RETURNED option
                      if (dest.toUpperCase() === 'RETURNED') {
                        const label = task
                          ? `Transferred to End User (${task})`
                          : returnedLabelForOffice

                        await submitRowLog(
                          row,
                          { label, color: 'bg-sky-600' },
                          'returned',
                          {
                            subDocuments: (currentOfficeKey === 'GSO' && subDocItems.length > 0)
                              ? subDocItems.filter(i => i.trackingNo.trim()).map(item => ({
                                ...item,
                                status: 'returned',
                                logs: [{
                                  label: `Transferred by ${currentOfficeKey}`,
                                  color: 'bg-rose-600',
                                  byOffice: currentOfficeKey,
                                  byUser: ''
                                }]
                              }))
                              : undefined
                          }
                        )
                      } else {
                        const isDvChecking = task.toLowerCase().includes('dv checking')
                        const effectiveDest = isDvChecking ? 'BUDGET' : dest
                        const effectiveStatus = statusForTransferDest(effectiveDest)

                        const label = isDvChecking
                          ? 'Transferred to BUDGET: for DV checking'
                          : (task ? `Transferred to ${effectiveDest} (${task})` : `Transferred to ${effectiveDest}`)

                        await submitRowLog(
                          row,
                          { label, color: 'bg-sky-600' },
                          effectiveStatus
                        )
                      }
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                  >
                    {transferDest.toUpperCase() === 'RETURNED' ? 'Confirm Transfer' : 'Transfer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {
        returnConfirmRow ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) {
                setReturnConfirmRow(null)
                setReturnConfirmRemarks("")
              }
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-6">
                <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Confirm Transfer</div>
                      <div className="truncate text-xs text-slate-600">{returnConfirmRow.trackingNo}</div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Return Details</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{returnConfirmMessage}</div>
                      <div className="mt-2 grid gap-1 text-xs text-slate-700">
                        <div>
                          <span className="font-semibold">Return to Office:</span> {String(returnConfirmRow?.doc?.office || "").trim() || "-"}
                        </div>
                        <div>
                          <span className="font-semibold">Processed By:</span> {actionUserLabel || "-"}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">This will send the document back to the end user.</div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-700">Remarks</div>
                      <input
                        value={returnConfirmRemarks}
                        onChange={(e) => setReturnConfirmRemarks(e.target.value)}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        placeholder="Enter remarks..."
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setReturnConfirmRow(null)
                        setReturnConfirmRemarks("")
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={rowActionBusy === String(returnConfirmRow.doc._id)}
                      onClick={async () => {
                        const row = returnConfirmRow
                        const remarks = returnConfirmRemarks.trim()
                        const label = remarks ? `${returnConfirmMessage}: ${remarks}` : returnConfirmMessage
                        setReturnConfirmRow(null)
                        setReturnConfirmRemarks("")
                        await submitRowLog(row, { label, color: 'bg-rose-600' }, 'returned')
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-md bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                    >
                      Confirm Transfer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      }

      {
        approveRow ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) {
                setApproveRow(null)
              }
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-6">
                <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  {/* Header */}
                  <div className="flex items-center gap-3 border-b border-slate-200 bg-emerald-600 px-4 py-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20">
                      <svg className="size-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold text-white">Approve Document</div>
                      <div className="truncate text-xs text-emerald-100">{approveRow.trackingNo}</div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="space-y-4 px-4 py-5">
                    {/* Document info summary */}
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Document Details</div>
                      <div className="grid gap-1 text-xs text-slate-700">
                        <div>
                          <span className="font-semibold">Tracking No:</span> {approveRow.trackingNo}
                        </div>
                        <div>
                          <span className="font-semibold">Requestor:</span> {approveRow.requestor || "-"}
                        </div>
                        <div>
                          <span className="font-semibold">Purpose:</span> {approveRow.purpose || "-"}
                        </div>
                        <div>
                          <span className="font-semibold">Amount:</span> {approveRow.amount || "-"}
                        </div>
                      </div>
                    </div>

                    {/* Office selection */}
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-700">Transfer To Office</div>
                      <p className="text-xs text-slate-500">Select which office will receive this approved document.</p>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => setApproveDestOffice("BUDGET")}
                          className={`relative flex flex-col gap-1.5 rounded-lg border-2 p-3 text-left transition focus:outline-none focus-visible:outline-none ${approveDestOffice === "BUDGET"
                            ? "border-emerald-600 bg-emerald-50"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            }`}
                        >
                          {approveDestOffice === "BUDGET" ? (
                            <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-emerald-600">
                              <svg className="size-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          ) : null}
                          <div className="flex size-8 items-center justify-center rounded-md bg-sky-100">
                            <svg className="size-4 text-sky-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 6h18M9 14h6M9 18h6" />
                            </svg>
                          </div>
                          <div className="text-xs font-bold text-slate-900">Budget Office</div>
                          <div className="text-[10px] leading-snug text-slate-500">For OBR Signing</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setApproveDestOffice("PTO")}
                          className={`relative flex flex-col gap-1.5 rounded-lg border-2 p-3 text-left transition focus:outline-none focus-visible:outline-none ${approveDestOffice === "PTO"
                            ? "border-emerald-600 bg-emerald-50"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            }`}
                        >
                          {approveDestOffice === "PTO" ? (
                            <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-emerald-600">
                              <svg className="size-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          ) : null}
                          <div className="flex size-8 items-center justify-center rounded-md bg-violet-100">
                            <svg className="size-4 text-violet-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="text-xs font-bold text-slate-900">PTO</div>
                          <div className="text-[10px] leading-snug text-slate-500">For PR Signing</div>
                        </button>
                      </div>
                    </div>

                    {/* Selected summary */}
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-emerald-800">
                        <svg className="size-3.5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>
                          Document will be <strong>approved</strong> and transferred to{" "}
                          <strong>{approveDestOffice === "BUDGET" ? "Budget Office (For OBR Signing)" : "PTO (For PR Signing)"}</strong>.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setApproveRow(null)}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={rowActionBusy === String(approveRow.doc._id)}
                      onClick={async () => {
                        const row = approveRow
                        const dest = approveDestOffice
                        setApproveRow(null)

                        // Label must start with "Transferred to <OFFICE>" so that
                        // getLastTransferredOffice() / hasTransferredToCurrentOffice()
                        // in procurement users' views detect it correctly.
                        // NEVER include "approved" in the transfer label  —
                        // hasApprovalLogByCurrentOffice() searches for that word and would
                        // falsely mark the doc as already processed by Budget/PTO.
                        const taskLabel = dest === "BUDGET" ? "For OBR Signing" : "For PR Signing"
                        const transferLabel = `Transferred to ${dest} (${taskLabel})`
                        const newStatus = statusForTransferDest(dest)

                        let byOffice = ""
                        let byUser = ""
                        try {
                          const raw = localStorage.getItem('user')
                          const parsed = raw ? (JSON.parse(raw) as { office?: string; fullName?: string; username?: string } | null) : null
                          byOffice = String(parsed?.office || '').trim()
                          byUser = String(parsed?.fullName || parsed?.username || '').trim()
                        } catch { /* ignore */ }

                        try {
                          setRowActionBusy(String(row.doc._id))
                          const token = localStorage.getItem('token')
                          const headers = {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                          }

                          // PATCH 1: Add "Approved" log (no status change yet)
                          const r1 = await fetch(`${API_URL}/documents/${row.doc._id}`, {
                            method: 'PATCH',
                            headers,
                            body: JSON.stringify({
                              addLog: { label: 'Approved', color: 'bg-emerald-600', byOffice, byUser },
                            }),
                          })
                          if (!r1.ok) throw new Error(await r1.text() || 'Failed to log approval')

                          // PATCH 2: Add transfer log + set status in ONE call (no fetchRows between)
                          const r2 = await fetch(`${API_URL}/documents/${row.doc._id}`, {
                            method: 'PATCH',
                            headers,
                            body: JSON.stringify({
                              status: newStatus,
                              addLog: { label: transferLabel, color: 'bg-sky-600', byOffice, byUser },
                            }),
                          })
                          if (!r2.ok) throw new Error(await r2.text() || 'Failed to transfer')

                          // Refresh UI only once after both patches complete
                          await fetchRows()
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Failed to approve')
                        } finally {
                          setRowActionBusy(null)
                        }
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                    >
                      Confirm Approval
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      }

      {
        editObrRow ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) {
                setEditObrRow(null)
                setEditObrValue("")
              }
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-10">
                <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Edit OBR No</div>
                      <div className="truncate text-xs text-slate-600">{editObrRow.trackingNo}</div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="obrNo">
                        OBR No
                      </label>
                      <input
                        id="obrNo"
                        value={editObrValue}
                        onChange={(e) => setEditObrValue(e.target.value)}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        placeholder="Enter OBR No"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditObrRow(null)
                        setEditObrValue("")
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={editObrBusy}
                      onClick={async () => {
                        if (!editObrRow) return
                        if (!hasReceivedForCurrentOffice(editObrRow)) return
                        try {
                          setEditObrBusy(true)
                          const token = localStorage.getItem('token')
                          const response = await fetch(`${API_URL}/documents/${editObrRow.doc._id}`, {
                            method: 'PATCH',
                            headers: {
                              Authorization: `Bearer ${token}`,
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ obrNo: editObrValue.trim() }),
                          })

                          if (!response.ok) {
                            const msg = await response.text().catch(() => '')
                            throw new Error(msg || 'Failed to update OBR No')
                          }

                          await fetchRows()
                          setEditObrRow(null)
                          setEditObrValue("")
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Failed to update OBR No')
                        } finally {
                          setEditObrBusy(false)
                        }
                      }}
                      className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:outline-none"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      }

      {/* New Request Modal */}
      <NewRequestModal
        isOpen={isNewRequestModalOpen}
        onClose={() => setIsNewRequestModalOpen(false)}
        onSubmit={handleCreateNewRequest}
      />

      {/* Edit PO Modal */}
      {isEditPoModalOpen && preview && preview.type === 'PO' && previewPoModel ? (
        <EditPoModal
          isOpen={isEditPoModalOpen}
          onClose={() => setIsEditPoModalOpen(false)}
          initialData={previewPoModel}
          onSave={handleSavePo}
        />
      ) : null}
    </div >
  )
}
