import {
  CheckCircle2,
  Download,
  ExternalLink,
  History,
  LogOut,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  XCircle,
} from "lucide-react"
import Barcode from "react-barcode"
import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ObrTemplatePreview, { type ObrTemplateModel } from "../../components/ObrTemplatePreview"
import ObrTemplatePdf from "../../components/ObrTemplatePdf"
import { pdf } from "@react-pdf/renderer"
import PrTemplatePreview from "../../components/PrTemplatePreview"
import DvTemplatePreview, { type DvTemplateModel } from "../../components/DvTemplatePreview"
import PoTemplatePreview, { type PoTemplateModel, type PoItem } from "../../components/PoTemplatePreview"
import { useDocumentSocket } from "../../hooks/useSocket"
import { toast } from "../../lib/toast"
import { formatLogRemarks } from "../../utils/formatLogRemarks"
import RoutingSlipModal from "../../users/components/RoutingSlipModal"
import NewRequestModal, { type NewRequestPayload } from "../../users/components/NewRequestModal"
import { getSubDocAmount, getMainDocSupplierInfo, type DocumentRow } from "../../users/types/documentTypes"

type RequestRow = {
  trackingNo: string
  references: string
  purpose: string
  others: string
  sourceOfFund: string
  officeRequestor: string
  amount: string
  duration: string
  status: {
    phase: "ongoing" | "completed" | "returned"
    currentLocation: string
    supplier: Array<{ name: string; amount: string }>
    bacNotes: string
    runningTime: string
  }
  particulars: {
    pr?: string
    obr?: string
    driveLink?: string
  }
  doc: ApiDocument
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
  section?: string
  fpp?: string
  department?: string
  responsibilityCenter?: string
  accountCode?: string
  notes?: string
  contactNumber?: string
  email?: string
  requestedByName?: string
  requestedByDesignation?: string
  driveLink?: string
  prEnabled?: boolean
  obrEnabled?: boolean
  prNo?: string
  obrNo?: string
  supplier?: string
  supplierAmount?: string
  bacNotes?: string
  gsoRoutingSlip?: string
  purpose: string
  amount?: string
  status?: string
  returnToApprovalsRequested?: boolean
  returnToApprovalsReason?: string
  createdAt?: string
  subDocuments?: Array<{
    trackingNo?: string
    purpose?: string
    amount?: string
    supplier?: string
    status?: string
    logs?: Array<{ label?: string; color?: string; byOffice?: string; byUser?: string; createdAt?: string }>
  }>
  prItems?: Array<{
    itemNo?: string
    unit?: string
    description?: string
    quantity?: string
    unitCost?: string
    totalCost?: string
  }>
  logs?: Array<{ label?: string; color?: string; byOffice?: string; byUser?: string; createdAt?: string }>
}

function inferCurrentLocation(
  statusRaw: string,
  officeRaw: string,
  logs?: Array<{ label?: string }> | null
) {
  const s = String(statusRaw || '').trim().toLowerCase()
  if (s === 'in-budget') return 'BUDGET'
  if (s === 'in-pto') return 'PTO'
  if (s === 'pending-bac' || s.includes('bac')) return 'BAC'
  if (s === 'pending-gso' || s.includes('gso')) return 'GSO'
  if (s === 'ready-transfer') return 'PROCUREMENT'
  if (s === 'returned') return 'RETURNED'
  if (s === 'completed' || s === 'approved') return 'COMPLETED'

  // For ongoing/pending statuses that don't map to a specific office,
  // scan the logs for the last "Transferred to OFFICE" entry.
  // This ensures offices like ACCOUNTING, PGO, or any custom office show correctly.
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
    // Legacy: "Approved: Transferred to OFFICE (...)"
    const legacy = label.match(/approved[:\s]+transferred\s+to\s+([^(:]+)/i)
    if (legacy) {
      const dest = String(legacy[1]).trim().toUpperCase()
      if (dest) return dest
    }
  }

  // Final fallback: the requestor's office
  return String(officeRaw || '')
}

function formatRunningTime(createdAtRaw?: string) {
  const raw = String(createdAtRaw || '').trim()
  if (!raw) return 'N/A'
  const createdAt = new Date(raw)
  if (!Number.isFinite(createdAt.getTime())) return 'N/A'
  const diffMs = Date.now() - createdAt.getTime()
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
  return `Running Time: ${diffDays} day(s)`
}

function formatElapsedShort(ms: number) {
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const days = Math.floor(hr / 24);
  return `${days}d ${hr % 24}h`;
}

function StatusBlock({
  status,
  readOnly = false,
  canEditSupplier = false,
  canEditBacNotes = false,
  onEditSupplier,
  onEditBacNotes,
}: {
  status: RequestRow["status"]
  readOnly?: boolean
  canEditSupplier?: boolean
  canEditBacNotes?: boolean
  onEditSupplier?: () => void
  onEditBacNotes?: () => void
}) {
  const phaseClass = useMemo(() => {
    switch (status.phase) {
      case "completed":
        return "bg-emerald-600 shadow-xs"
      case "returned":
        return "bg-rose-600 shadow-xs"
      default:
        return "bg-blue-600 shadow-xs"
    }
  }, [status.phase])

  return (
    <div className="w-64 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex h-5 items-center rounded-full px-2.5 text-[10px] font-bold uppercase tracking-wider text-white ${phaseClass}`}>
          {status.phase === "completed" ? "completed" : status.phase === "returned" ? "returned" : "ongoing"}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs">
          <span className="truncate">Current Location: {status.currentLocation}</span>
          <ExternalLink className="size-3 shrink-0" />
        </div>

        <div className="text-xs text-slate-900">
          <div className="flex items-start justify-between gap-2">
            <span className="font-bold text-slate-700">Supplier:</span>
            {readOnly || !canEditSupplier ? null : (
              <button
                type="button"
                onClick={onEditSupplier}
                className="ml-1 inline-flex items-center rounded p-0.5 text-blue-500 hover:bg-blue-50 hover:text-blue-700 transition-colors focus:outline-none focus-visible:outline-none"
                title="Edit supplier"
              >
                <Pencil className="size-3" />
              </button>
            )}
          </div>

          <div className="mt-1 space-y-0.5">
            {(Array.isArray(status.supplier) && status.supplier.length > 0
              ? status.supplier
              : [{ name: 'Not Updated', amount: '' }]
            ).map((it, idx) => (
              <div key={idx} className="flex items-start justify-between gap-2">
                <div className="min-w-0 whitespace-normal break-words text-slate-800">
                  {idx + 1}. {it.name}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  {it.amount}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-slate-900">
          <span className="font-semibold">BAC Notes:</span> {status.bacNotes}
          {readOnly || !canEditBacNotes ? null : (
            <button
              type="button"
              onClick={onEditBacNotes}
              className="ml-1 inline-flex items-center text-slate-700 hover:text-slate-900 focus:outline-none focus-visible:outline-none"
              title="Edit BAC notes"
            >
              <Pencil className="size-3" />
            </button>
          )}
        </div>

        <div className="text-[11px] text-slate-600">Nothing to show</div>
        <div className="text-[11px] text-slate-900">{status.runningTime}</div>
      </div>
    </div>
  )
}

type AllDocumentsPageProps = {
  title?: string
  readOnly?: boolean
  officePrivileges?: string[]
}

export default function AllDocumentsPage({ title = "All Documents", readOnly = false, officePrivileges }: AllDocumentsPageProps) {
  const [rows, setRows] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [pageSize, setPageSize] = useState(10)
  const [officeOptions, setOfficeOptions] = useState<string[]>([])
  const [prActivePage, setPrActivePage] = useState(0)
  const [prPdfBusy, setPrPdfBusy] = useState(false)
  const [obrPdfBusy, setObrPdfBusy] = useState(false)
  const [fundTab, setFundTab] = useState<string>('General Fund')
  const [availableFunds, setAvailableFunds] = useState<string[]>([])
  const [phaseFilter, setPhaseFilter] = useState<'all' | 'ongoing' | 'returned' | 'completed'>('all')
  const [preview, setPreview] = useState<{ type: "PR" | "OBR" | "DV" | "PO"; row: RequestRow } | null>(null)
  const [routingSlipDoc, setRoutingSlipDoc] = useState<ApiDocument | null>(null)
  const [logsDoc, setLogsDoc] = useState<RequestRow | null>(null)
  const [historyTab, setHistoryTab] = useState<"prevalidation" | "transactions" | "subdocuments">("transactions")
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false)
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

  const handleCreateNewRequest = async (payload: NewRequestPayload) => {
    try {
      setLoading(true)
      setError(null)
      const now = new Date()
      const pad2 = (n: number) => String(n).padStart(2, "0")
      const hour12 = now.getHours() % 12 || 12

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
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackingNo,
          createdBy,
          office,
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
            ...(payload.prEnabled ? [{ label: "PR", color: "bg-blue-500" }] : []),
            ...(payload.obrEnabled ? [{ label: "OBR", color: "bg-amber-500" }] : []),
          ],
          prEnabled: payload.prEnabled,
          obrEnabled: payload.obrEnabled,
          amount: payload.amount,
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
      } catch {
        // ignore
      }
      setIsNewRequestModalOpen(false)
      toast.success(`Request submitted successfully! Tracking No: ${trackingNo}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit request")
      toast.error(e instanceof Error ? e.message : "Failed to submit request")
    } finally {
      setLoading(false)
    }
  }
  const [editPreviewOpen, setEditPreviewOpen] = useState(false)
  const [editPreviewBusy, setEditPreviewBusy] = useState(false)
  const [editPreviewError, setEditPreviewError] = useState<string | null>(null)
  const [editPreviewDraft, setEditPreviewDraft] = useState<{
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
    obrNo: string
    responsibilityCenter: string
    obrParticulars: string
    accountCode: string
    amount: string
    certifiedAName: string
    certifiedAPosition: string
    certifiedBName: string
    certifiedBPosition: string
    preparedByName: string
  } | null>(null)
  const [deleteLogConfirmOpen, setDeleteLogConfirmOpen] = useState(false)
  const [commentDoc, setCommentDoc] = useState<RequestRow | null>(null)
  const [commentText, setCommentText] = useState("")
  const [editSupplierRow, setEditSupplierRow] = useState<RequestRow | null>(null)
  const [editSupplierValue, setEditSupplierValue] = useState("")
  const [editSubDocSuppliers, setEditSubDocSuppliers] = useState<string[]>([])
  const [editSupplierBusy, setEditSupplierBusy] = useState(false)
  const [editBacNotesRow, setEditBacNotesRow] = useState<RequestRow | null>(null)
  const [editBacNotesValue, setEditBacNotesValue] = useState("")
  const [editBacNotesBusy, setEditBacNotesBusy] = useState(false)
  const [editRefsRow, setEditRefsRow] = useState<RequestRow | null>(null)
  const [editPrNoValue, setEditPrNoValue] = useState("")
  const [editObrNoValue, setEditObrNoValue] = useState("")
  const [editRefsBusy, setEditRefsBusy] = useState(false)
  const [editFundRow, setEditFundRow] = useState<RequestRow | null>(null)
  const [editFundValue, setEditFundValue] = useState("")
  const [editFundBusy, setEditFundBusy] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(timer)
  }, [])
  const [editOfficeRow, setEditOfficeRow] = useState<RequestRow | null>(null)
  const [editOfficeValue, setEditOfficeValue] = useState("")
  const [editOfficeBusy, setEditOfficeBusy] = useState(false)
  const [editAmountRow, setEditAmountRow] = useState<RequestRow | null>(null)
  const [editAmountValue, setEditAmountValue] = useState("")
  const [editAmountBusy, setEditAmountBusy] = useState(false)

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
  const [statusConfirm, setStatusConfirm] = useState<
    | { kind: 'discontinue' | 'continue'; row: RequestRow }
    | null
  >(null)

  const [returnToApprovalsConfirm, setReturnToApprovalsConfirm] = useState<RequestRow | null>(null)
  const [returnToApprovalsRemarks, setReturnToApprovalsRemarks] = useState("")
  const [returnToApprovalsBusy, setReturnToApprovalsBusy] = useState(false)

  const [printRow, setPrintRow] = useState<RequestRow | null>(null)
  const barcodeRef = useRef<HTMLDivElement | null>(null)

  const [transferTasksByOffice, setTransferTasksByOffice] = useState<
    Record<
      string,
      Array<{ taskId?: number; task?: string; duration?: string; status?: string }>
    >
  >({})
  const [officeHeads, setOfficeHeads] = useState<Record<string, { head: string; designation: string }>>({})

  const closeLogs = () => setLogsDoc(null)
  const closeComment = () => {
    setCommentDoc(null)
    setCommentText("")
  }

  const closeStatusConfirm = () => {
    setStatusConfirm(null)
  }

  const isAdminRole = useMemo(() => {
    try {
      const raw = localStorage.getItem('user')
      const parsed = raw ? (JSON.parse(raw) as { role?: string } | null) : null
      const roleLower = String(parsed?.role || '').trim().toLowerCase()
      return roleLower === 'admin' || roleLower === 'superadmin'
    } catch {
      return false
    }
  }, [])

  const isProcurementRole = useMemo(() => {
    try {
      const raw = localStorage.getItem('user')
      const parsed = raw ? (JSON.parse(raw) as { role?: string } | null) : null
      const roleLower = String(parsed?.role || '').trim().toLowerCase()
      return roleLower === 'procurement'
    } catch {
      return false
    }
  }, [])

  const hasPrivilege = (name: string) => {
    if (isAdminRole) return true
    const needle = String(name || '').trim().toLowerCase()
    if (!needle) return false
    const list = Array.isArray(officePrivileges) ? officePrivileges : []
    return list.some((p) => String(p || '').trim().toLowerCase() === needle)
  }

  const patchDocument = async (docId: string, body: any) => {
    const token = localStorage.getItem('token')
    const response = await fetch(`${API_URL}/documents/${docId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const msg = await response.text().catch(() => '')
      throw new Error(msg || 'Failed to update document')
    }
  }

  const openEditPreview = (p: NonNullable<typeof preview>) => {
    setEditPreviewError(null)
    setEditPreviewOpen(true)
    setEditPreviewDraft({
      department: String((p.row.doc as any)?.department || '').trim(),
      section: String((p.row.doc as any)?.section || '').trim(),
      prNo: String((p.row.doc as any)?.prNo || '').trim(),
      prDate: String((p.row.doc as any)?.prDate || '').trim(),
      fpp: String((p.row.doc as any)?.fpp || '').trim(),
      purpose: String((p.row.doc as any)?.purpose || '').trim(),
      prItems: Array.isArray((p.row.doc as any)?.prItems) ? (p.row.doc as any).prItems : [],
      requestedByName: String((p.row.doc as any)?.requestedByName || '').trim(),
      requestedByDesignation: String((p.row.doc as any)?.requestedByDesignation || '').trim(),
      cashAvailabilityName: String((p.row.doc as any)?.cashAvailabilityName || '').trim(),
      cashAvailabilityDesignation: String((p.row.doc as any)?.cashAvailabilityDesignation || '').trim(),
      approvedByName: String((p.row.doc as any)?.approvedByName || '').trim(),
      approvedByDesignation: String((p.row.doc as any)?.approvedByDesignation || '').trim(),
      obrNo: String((p.row.doc as any)?.obrNo || '').trim(),
      responsibilityCenter: String((p.row.doc as any)?.responsibilityCenter || '').trim(),
      obrParticulars:
        String((p.row.doc as any)?.obrParticulars || '').trim() ||
        String((p.row.doc as any)?.purpose || '').trim(),
      accountCode: String((p.row.doc as any)?.accountCode || '').trim(),
      certifiedAName: String((p.row.doc as any)?.certifiedAName || '').trim(),
      certifiedAPosition: String((p.row.doc as any)?.certifiedAPosition || '').trim(),
      certifiedBName: String((p.row.doc as any)?.certifiedBName || '').trim(),
      certifiedBPosition: String((p.row.doc as any)?.certifiedBPosition || '').trim(),
      amount: String((p.row.doc as any)?.amount || '').trim(),
      preparedByName: String((p.row.doc as any)?.preparedByName || (p.row.doc as any)?.createdBy || '').trim(),
    })
  }

  const closeEditPreview = () => {
    setEditPreviewOpen(false)
    setEditPreviewBusy(false)
    setEditPreviewError(null)
    setEditPreviewDraft(null)
  }

  const removeLastLog = async (docId: string) => {
    await patchDocument(docId, { removeLastLog: true })
  }

  const fetchRows = async () => {
    try {
      setLoading(true)
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
      const prevalidationStatuses = new Set([
        'pending',
        'pending-gso',
        'pending-bac',
        'ready-transfer',
        'for-validation',
        'pre-validation',
        'for-revision',
      ])

      const hasTransferredLog = (doc: ApiDocument) => {
        const logs = Array.isArray(doc?.logs) ? doc.logs : []
        return logs.some((l) => String(l?.label || '').trim().toLowerCase().includes('transferred to'))
      }

      const mapped = (data.documents || [])
        .filter((d) => {
          const s = String(d?.status || '').trim().toLowerCase()
          if (!prevalidationStatuses.has(s)) return true
          return hasTransferredLog(d)
        })
        .map((d) => {
          const statusLower = String(d.status || '').toLowerCase()
          const phase: RequestRow['status']['phase'] =
            statusLower === 'returned' ? 'returned' : statusLower === 'approved' || statusLower === 'completed' ? 'completed' : 'ongoing'

          const prNo = String((d as any)?.prNo || '').trim()
          const obrNo = String((d as any)?.obrNo || '').trim()
          const contactNumber = String(d.contactNumber || '').trim()

          const referencesParts = [
            d.prEnabled === false ? 'PR: Not Available' : prNo ? `PR No: ${prNo}` : 'PR: Available',
            d.obrEnabled === false ? 'OBR: Not Available' : obrNo ? `OBR No: ${obrNo}` : 'OBR: Available',
            contactNumber ? `Contact Number: ${contactNumber}` : '',
          ].filter(Boolean)

          const othersParts = [
            String(d.notes || '').trim() ? `Notes: ${String(d.notes || '').trim()}` : '',
          ].filter(Boolean)

          return {
            trackingNo: d.trackingNo,
            references: referencesParts.join('\n'),
            purpose: d.purpose,
            others: othersParts.join('\n'),
            sourceOfFund: String(d.fund || ''),
            officeRequestor: d.office || '',
            amount: (() => {
              const rawText = String(d.amount || '').trim()
              if (!rawText) return ''
              const parseMoney = (raw: string) => {
                const cleaned = String(raw || '')
                  .replace(/[^0-9.,-]/g, '')
                  .replace(/,/g, '')
                  .trim()
                if (!cleaned) return 0
                const n = Number.parseFloat(cleaned)
                return Number.isFinite(n) ? n : 0
              }
              const formatMoney = (n: number) =>
                new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

              const lines = rawText
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)

              if (lines.length <= 1) {
                const cleanedSingle = rawText.replace(/[^0-9.,-]/g, '').trim()
                return cleanedSingle ? `₱ ${cleanedSingle}` : ''
              }

              const sum = lines.reduce((acc, line) => acc + parseMoney(line), 0)
              if (!Number.isFinite(sum) || sum <= 0) {
                const cleanedFallback = rawText.replace(/[^0-9.,-]/g, '').trim()
                return cleanedFallback ? `₱ ${cleanedFallback}` : ''
              }
              return `₱ ${formatMoney(sum)}`
            })(),
            duration: 'N/A',
            status: {
              phase,
              currentLocation: inferCurrentLocation(String(d.status || ''), String(d.office || ''), d.logs),
              supplier: (() => {
                const parseNum = (val: any) => {
                  const cleaned = String(val || '').replace(/[^0-9.-]/g, '').replace(/,/g, '').trim()
                  const n = Number.parseFloat(cleaned)
                  return Number.isFinite(n) ? n : 0
                }

                const toPeso = (raw: any) => {
                  const cleaned = String(raw || '').replace(/[^0-9.,-]/g, '').trim()
                  if (!cleaned) return ''
                  const n = Number.parseFloat(cleaned.replace(/,/g, ''))
                  if (!Number.isFinite(n)) return `₱ ${cleaned}`
                  return `₱ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                }

                const subs = Array.isArray((d as any).subDocuments) ? ((d as any).subDocuments as any[]) : []
                const { supplier: mainSupplier, amount: mainAmtRaw } = getMainDocSupplierInfo(d as any)

                if (subs.length > 0) {
                  return [
                    {
                      name: mainSupplier || 'Not Updated',
                      amount: toPeso(mainAmtRaw),
                    },
                    ...subs.map((s: any, sidx: number) => ({
                      name: String(s?.supplier || '').trim() || 'Not Updated',
                      amount: toPeso(s?.amount || getSubDocAmount(d as any, sidx)),
                    })),
                  ]
                }

                return [
                  {
                    name: mainSupplier || 'Not Updated',
                    amount: toPeso(mainAmtRaw || (d as any)?.amount),
                  },
                ]
              })(),
              bacNotes: String(d.bacNotes || '-'),
              runningTime: formatRunningTime(d.createdAt),
            },
            particulars: {
              pr: d.prEnabled === false ? undefined : '#',
              obr: d.obrEnabled === false ? undefined : '#',
              driveLink: (() => {
                const raw = String(d.driveLink || '').trim()
                return raw ? raw : undefined
              })(),
            },
            doc: d,
          } satisfies RequestRow
        })

      setRows(mapped)
      return mapped
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents')
      return null
    } finally {
      setLoading(false)
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

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleDocumentChange = useCallback((action?: string, data?: any) => {
    if (action === 'return_requested') {
      const tracking = data?.trackingNo || data?.document?.trackingNo || ''
      const user = data?.requestedBy || ''
      toast.info(`🔔 Return to Approvals requested for #${tracking}${user ? ` by ${user}` : ''}`)
    }
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
    fetchRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            head?: string;
            headDesignation?: string;
            tasks?: Array<{ taskId?: number; task?: string; duration?: string; status?: string }>
          }>
        }
        const offices = Array.isArray(data?.offices) ? data.offices : []

        const tasksByOffice: Record<
          string,
          Array<{ taskId?: number; task?: string; duration?: string; status?: string }>
        > = {}
        const headsMap: Record<string, { head: string; designation: string }> = {}
        for (const o of offices) {
          const name = String(o?.name || '').trim().toUpperCase()
          if (!name) continue

          headsMap[name] = {
            head: String(o?.head || '').trim(),
            designation: String(o?.headDesignation || '').trim(),
          }

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
        setOfficeHeads(headsMap)
        setTransferTasksByOffice(tasksByOffice)

        const names = offices
          .map((o) => String(o?.name || '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
        setOfficeOptions(names)
      } catch {
        // ignore
      }
    })()
  }, [])

  useEffect(() => {
    ; (async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_URL}/source-of-funds`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          const names = (data.sourceOfFunds || [])
            .filter((s: any) => s.status !== 'archived')
            .map((s: any) => String(s.name || '').trim())
            .filter(Boolean)

          setAvailableFunds(names)
          if (names.length > 0 && !fundTab) {
            setFundTab(names[0])
          }
        }
      } catch {
        // ignore
      }
    })()
  }, [])

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

  useEffect(() => {
    if (!logsDoc) return
    setHistoryTab('transactions')
  }, [logsDoc])

  const normalizedFundKey = (fundRaw: string) => {
    const f = String(fundRaw || '').trim().toLowerCase()
    if (!f) return ''

    // Check dynamic funds first
    for (const af of availableFunds) {
      if (f === af.toLowerCase()) return af
    }

    // Fallbacks for common names
    if (f === 'general' || f.includes('general fund')) return 'General Fund'
    if (f === 'trust' || f.includes('trust fund')) return 'Trust Fund'
    if (f === 'sef' || f.includes('sef fund')) return 'SEF Fund'
    if (f.includes('20%') && f.includes('development')) return '20% Development Fund'
    if (f.includes('ldrrm') || f.includes('5%')) return '5% LDRRM Fund'

    return fundRaw
  }

  const filteredByTab = useMemo(() => {
    const statusIsDiscontinued = (r: RequestRow) => String(r.doc?.status || '').trim().toLowerCase() === 'discontinued'
    if (fundTab === 'discontinued') {
      return rows.filter((r) => statusIsDiscontinued(r))
    }

    const fundFiltered = rows.filter((r) => {
      if (statusIsDiscontinued(r)) return false
      const key = normalizedFundKey(String(r.doc?.fund || r.sourceOfFund || ''))
      return key === fundTab
    })

    if (phaseFilter === 'all') return fundFiltered
    return fundFiltered.filter((r) => {
      const phase = String(r.status?.phase || '').trim().toLowerCase()
      if (phaseFilter === 'completed') return phase === 'completed'
      if (phaseFilter === 'returned') return phase === 'returned'
      // ongoing
      return phase !== 'completed' && phase !== 'returned'
    })
  }, [fundTab, isAdminRole, phaseFilter, rows])

  const fundCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const statusIsDiscontinued = (r: RequestRow) => String(r.doc?.status || '').trim().toLowerCase() === 'discontinued'

    // Count discontinued
    counts['discontinued'] = rows.filter(r => statusIsDiscontinued(r)).length

    // Count for each fund - respecting the phase filter
    availableFunds.forEach(fund => {
      counts[fund] = rows.filter(r => {
        if (statusIsDiscontinued(r)) return false
        const key = normalizedFundKey(String(r.doc?.fund || r.sourceOfFund || ''))
        if (key !== fund) return false

        // Apply phase filter
        if (phaseFilter === 'all') return true
        const phase = String(r.status?.phase || '').trim().toLowerCase()
        if (phaseFilter === 'completed') return phase === 'completed'
        if (phaseFilter === 'returned') return phase === 'returned'
        // ongoing
        return phase !== 'completed' && phase !== 'returned'
      }).length
    })

    return counts
  }, [rows, availableFunds, phaseFilter])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return filteredByTab
    return filteredByTab.filter((r) => {
      const supplierText = Array.isArray(r.status?.supplier)
        ? r.status.supplier
          .map((s: any) => `${String(s?.name || '')} ${String(s?.amount || '')}`.trim())
          .join(' ')
        : ''

      const haystack = [
        r.trackingNo,
        r.references,
        r.purpose,
        r.others,
        r.sourceOfFund,
        r.officeRequestor,
        r.amount,
        r.duration,
        String(r.status?.phase || ''),
        String(r.status?.currentLocation || ''),
        String(r.status?.bacNotes || ''),
        String(r.status?.runningTime || ''),
        supplierText,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(q)
    })
  }, [filteredByTab, query])

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

  const splitActionAndRemarks = (labelRaw: string, byOfficeProp?: string) => {
    const label = String(labelRaw || '').trim()
    if (!label) return { action: '-', remarks: '-' }

    const labelLower = label.toLowerCase()
    const taskFromParens = (() => {
      const match = label.match(/\(([^)]+)\)\s*$/)
      return match?.[1] ? String(match[1]).trim() : ''
    })()

    if (labelLower.startsWith('received')) {
      // Primary: try to parse office name from label text (e.g. "Received by BUDGET ...")
      const officeFromLabel = (() => {
        const m = label.match(/received\s+by\s+([^(:]+?)(?:\(|:|$)/i)
        return String(m?.[1] || '').trim()
      })()

      // Fallback: use the log's byOffice field (the actual office that received it)
      const office = officeFromLabel || String(byOfficeProp || '').trim()

      const task = (() => {
        const mBy = label.match(/received\s+by\s+[^(:]+?[:\-]\s*(.*)$/i)
        if (mBy?.[1]) return String(mBy[1]).trim()
        const mFor = label.match(/^received\s*(?:for\s*)?(.*)$/i)
        const raw = String(mFor?.[1] || '').trim()
        if (officeFromLabel && raw.toLowerCase().startsWith(officeFromLabel.toLowerCase())) {
          return String(raw.slice(officeFromLabel.length)).trim()
        }
        return raw
      })()
      const remarksRaw = taskFromParens || task || '-'
      return {
        action: office ? `Received by ${office.toUpperCase()}` : 'Received',
        remarks: formatLogRemarks(remarksRaw),
      }
    }

    if (labelLower.includes('transferred to')) {
      const dest = (() => {
        const m = label.match(/transferred\s+to\s+([^(:]+?)(?:\(|:|$)/i)
        return String(m?.[1] || '').trim()
      })()
      const remarksRaw = taskFromParens || '-'
      return {
        action: dest ? `Transferred to ${dest.toUpperCase()}` : 'Transferred',
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

  const capturePrPreviewToPdf = async (_row: RequestRow) => {
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

        // Use a cleaner capture strategy to prevent text baseline shifts
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

  const captureDvPreviewToPdf = async (row: RequestRow) => {
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

  const captureObrPreviewToPdf = async (_row: RequestRow) => {
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

  const [poPdfBusy, setPoPdfBusy] = useState(false)
  const poVisibleRef = useRef<HTMLDivElement | null>(null)
  const poCaptureRef = useRef<HTMLDivElement | null>(null)

  const capturePoPreviewToPdf = async (_row: RequestRow) => {
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

    const supp = String((row as any).supplier || (doc as any)?.supplier || row.status?.supplier?.[0]?.name || "").trim()

    return {
      supplier: supp,
      address: String((doc as any)?.supplierAddress || (doc as any)?.address || "").trim(),
      tin: String((doc as any)?.tin || "").trim(),
      poNo: String((doc as any)?.poNo || "").trim(),
      date: String((doc as any)?.poDate || (doc as any)?.prDate || (doc?.createdAt ? new Date(doc.createdAt).toISOString().split('T')[0] : "")).trim(),
      modeOfProcurement: String((doc as any)?.modeOfProcurement || doc?.section || "SVP").trim(),
      prNo: String((doc as any)?.prNo || "").trim(),
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
    const supp = String((row as any).supplier || (doc as any)?.supplier || row.status?.supplier?.[0]?.name || "").trim()
    return {
      payee: supp || "PR",
      address: String((doc as any)?.supplierAddress || "N/A"),
      trackingNo: row.trackingNo || doc?.trackingNo || "",
      fund: doc?.fund || "",
      dvNo: String((doc as any)?.dvNo || "").trim(),
      date: (doc as any)?.date || "",
      obrNo: String((doc as any)?.obrNo || "").trim(),
      responsibilityCenter: (doc as any)?.responsibilityCenter || "",
      particulars: doc?.purpose || row.purpose || "",
      amount: doc?.supplierAmount || doc?.amount || row.amount || "",
      amountDue: doc?.supplierAmount || doc?.amount || row.amount || "",
      preparedByName: doc?.createdBy || "",
      certifiedAName:
        String((doc as any)?.certifiedAName || "").trim() ||
        String((doc as any)?.requestedByName || "").trim() ||
        "ENGR. FERNANDO E. TANCIONGCO",
      certifiedAPosition:
        String((doc as any)?.certifiedAPosition || "").trim() ||
        String((doc as any)?.requestedByDesignation || "").trim() ||
        "OIC-PGSO",
      certifiedBName: String((doc as any)?.certifiedBName || "").trim() || "EDUARDO D. BANZON",
      certifiedBPosition: String((doc as any)?.certifiedBPosition || "").trim() || "Provincial Budget Officer",
      status: doc?.status,
      logs: doc?.logs,
      hasPr: doc?.prEnabled,
      hasObr: doc?.obrEnabled,
    }
  }, [preview])

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

  useEffect(() => {
    if (fundTab === 'discontinued' && phaseFilter !== 'all') {
      setPhaseFilter('all')
    }
  }, [fundTab, phaseFilter])

  useEffect(() => {
    setPreview((prev) => {
      if (!prev) return prev
      // Find the updated row in filtered items in case data was refreshed
      const updatedRow = filtered.find((r) => r.doc._id === prev.row.doc._id)
      if (!updatedRow || updatedRow === prev.row) return prev
      return { ...prev, row: updatedRow }
    })
  }, [filtered])

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10">
              The Bunker &bull; Bataan Capitol DTS
            </span>
          </div>
          <div className="mt-1 text-lg font-bold tracking-tight text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">Master database of all provincial documents & transaction logs</div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* <button
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
            </button>*/}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {availableFunds.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setFundTab(name)}
              className={`h-8 rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none inline-flex items-center gap-1.5 ${fundTab === name
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200'
                }`}
            >
              <span>{name}</span>
              <span className={`inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${fundTab === name ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {fundCounts[name] || 0}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (fundTab === 'discontinued') {
                setFundTab(availableFunds[0] || 'General Fund')
              }
              setPhaseFilter('all')
            }}
            className={`h-8 rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${fundTab !== 'discontinued' && phaseFilter === 'all'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200'
              }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => {
              if (fundTab === 'discontinued') {
                setFundTab(availableFunds[0] || 'General Fund')
              }
              setPhaseFilter('ongoing')
            }}
            className={`h-8 rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${fundTab !== 'discontinued' && phaseFilter === 'ongoing'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200'
              }`}
          >
            Ongoing
          </button>

          <button
            type="button"
            onClick={() => {
              if (fundTab === 'discontinued') {
                setFundTab(availableFunds[0] || 'General Fund')
              }
              setPhaseFilter('completed')
            }}
            className={`h-8 rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${fundTab !== 'discontinued' && phaseFilter === 'completed'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200'
              }`}
          >
            Completed
          </button>
          <button
            type="button"
            onClick={() => setFundTab('discontinued')}
            className={`h-8 rounded-lg px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none inline-flex items-center gap-1.5 ${fundTab === 'discontinued'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200'
              }`}
          >
            <span>Discontinued</span>
            <span className={`inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${fundTab === 'discontinued' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {fundCounts['discontinued'] || 0}
            </span>
          </button>
        </div>
      </div>

      {printRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setPrintRow(null)
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">Download Barcode</div>
                <div className="truncate text-xs text-slate-600">{printRow.trackingNo}</div>
              </div>
            </div>

            <div className="px-4 py-4">
              <div ref={barcodeRef} className="flex justify-center bg-transparent">
                <Barcode
                  value={String(printRow.trackingNo || '').trim()}
                  format="CODE128"
                  width={1.35}
                  height={60}
                  displayValue={true}
                  fontSize={12}
                  margin={0}
                  background="rgba(0,0,0,0)"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
              <button
                type="button"
                onClick={async () => {
                  const el = barcodeRef.current
                  if (!el) return
                  try {
                    const canvas = await html2canvas(el, {
                      scale: 2,
                      backgroundColor: null,
                      useCORS: true,
                    })
                    const url = canvas.toDataURL('image/png')
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${String(printRow.trackingNo || 'barcode').trim() || 'barcode'}.png`
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Failed to download barcode')
                  }
                }}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus-visible:outline-none"
              >
                <Download className="size-4" />
                Download Barcode
              </button>
              <button
                type="button"
                onClick={() => setPrintRow(null)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {statusConfirm ? (
        <div
          className="fixed inset-0 z-60 overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) closeStatusConfirm()
          }}
        >
          <div className="min-h-full w-full">
            <div className="flex min-h-full items-start justify-center py-10">
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-900">Confirmation</div>
                    <div className="truncate text-xs text-slate-600">{statusConfirm.row.trackingNo}</div>
                  </div>
                </div>

                <div className="space-y-2 px-4 py-4 text-sm text-slate-700">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Action</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {statusConfirm.kind === 'discontinue'
                        ? 'Discontinue this document?'
                        : 'Continue this document back to ongoing?'}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {statusConfirm.kind === 'discontinue'
                        ? 'This will move the document to Discontinued.'
                        : 'This will move the document back to Ongoing.'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={closeStatusConfirm}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={actionBusyId === String(statusConfirm.row.doc._id)}
                    onClick={async () => {
                      const row = statusConfirm.row
                      const kind = statusConfirm.kind
                      closeStatusConfirm()
                      try {
                        setActionBusyId(String(row.doc._id))
                        await patchDocument(String(row.doc._id),
                          kind === 'discontinue'
                            ? { status: 'discontinued', addLog: { label: 'Discontinued', color: 'bg-rose-600' } }
                            : { status: 'ongoing', addLog: { label: 'Continued', color: 'bg-sky-600' } }
                        )
                        await fetchRows()
                        if (kind === 'continue') setFundTab('general')
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Failed to update')
                      } finally {
                        setActionBusyId(null)
                      }
                    }}
                    className={`inline-flex h-9 items-center justify-center rounded px-4 text-sm font-semibold text-white transition focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${statusConfirm.kind === 'discontinue' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {returnToApprovalsConfirm ? (
        <div
          className="fixed inset-0 z-60 overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target && !returnToApprovalsBusy) {
              setReturnToApprovalsConfirm(null)
              setReturnToApprovalsRemarks("")
            }
          }}
        >
          <div className="min-h-full w-full">
            <div className="flex min-h-full items-start justify-center py-10">
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-900">Return to Approvals</div>
                    <div className="truncate text-xs text-slate-600">{returnToApprovalsConfirm.trackingNo}</div>
                  </div>
                </div>

                <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Action</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      Return this document back to Approvals?
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      This will revoke active office transfers and move the document back to the <strong>Approvals / Pre-Validation</strong> stage.
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700" htmlFor="returnApprovalsRemarks">
                      Remarks / Reason (optional)
                    </label>
                    <textarea
                      id="returnApprovalsRemarks"
                      value={returnToApprovalsRemarks}
                      onChange={(e) => setReturnToApprovalsRemarks(e.target.value)}
                      placeholder="Enter remarks or reason for returning..."
                      className="min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    disabled={returnToApprovalsBusy}
                    onClick={() => {
                      setReturnToApprovalsConfirm(null)
                      setReturnToApprovalsRemarks("")
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium shadow-sm transition-colors hover:bg-slate-50 focus:outline-none disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={returnToApprovalsBusy}
                    onClick={async () => {
                      const row = returnToApprovalsConfirm
                      if (!row) return
                      try {
                        setReturnToApprovalsBusy(true)
                        setActionBusyId(String(row.doc._id))
                        await patchDocument(String(row.doc._id), {
                          returnToApprovals: true,
                          returnRemarks: returnToApprovalsRemarks.trim(),
                        })
                        toast.success(`Document ${row.trackingNo} returned to Approvals`)
                        setReturnToApprovalsConfirm(null)
                        setReturnToApprovalsRemarks("")
                        await fetchRows()
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Failed to return to approvals')
                      } finally {
                        setReturnToApprovalsBusy(false)
                        setActionBusyId(null)
                      }
                    }}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {returnToApprovalsBusy ? "Returning…" : "Confirm Return"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            placeholder="Tracking, purpose, office..."
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div>
          {error ? <div className="p-4 text-center text-sm text-rose-600">Error: {error}</div> : null}
          {loading ? <div className="p-4 text-center text-sm text-slate-600">Loading documents...</div> : null}

          <div className="space-y-3 p-4 sm:hidden">
            {visible.length === 0 && !loading ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
                No documents found.
              </div>
            ) : null}

            {visible.map((r) => {
              const phaseClass =
                r.status.phase === "completed"
                  ? "bg-emerald-600"
                  : r.status.phase === "returned"
                    ? "bg-rose-600"
                    : "bg-sky-600"

              return (
                <div key={r.trackingNo} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-600">Tracking #</div>
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {(() => {
                          const logs = Array.isArray(r.doc?.logs) ? [...(r.doc.logs as any[])].reverse() : [];
                          const lastReceivedLog = logs.find(l => {
                            const label = String(l?.label || '').toLowerCase();
                            return label.startsWith('received');
                          });

                          if (lastReceivedLog) {
                            const officeOfTask = String(lastReceivedLog.byOffice || '').toUpperCase();
                            const label = String(lastReceivedLog.label || '');
                            const taskFromLabel = (() => {
                              const m = label.match(/received\s*(?:for\s*)?(.*)$/i);
                              return String(m?.[1] || '').trim();
                            })() || (() => {
                              const match = label.match(/\(([^)]+)\)\s*$/);
                              return match?.[1] ? String(match[1]).trim() : '';
                            })();

                            if (officeOfTask && taskFromLabel) {
                              const officeTasks = transferTasksByOffice[officeOfTask] || [];
                              const taskInfo = officeTasks.find(t => String(t?.task || '').trim() === taskFromLabel);

                              if (taskInfo?.duration) {
                                const durationMs = parseDurationToMs(taskInfo.duration);
                                const startTime = new Date(String(lastReceivedLog.createdAt)).getTime();

                                if (durationMs > 0 && Number.isFinite(startTime)) {
                                  const deadline = startTime + durationMs;
                                  const isExceeded = Date.now() > deadline;

                                  if (isExceeded) {
                                    return (
                                      <div
                                        className="text-rose-600 font-bold"
                                        title={`EXCEEDED DEADLINE for ${officeOfTask}: ${taskFromLabel}`}
                                      >
                                        {r.trackingNo}
                                        <span className="ml-1 animate-pulse">⚠️</span>
                                      </div>
                                    );
                                  }
                                }
                              }
                            }
                          }

                          return r.trackingNo;
                        })()}
                      </div>
                    </div>
                    <span className={`inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-semibold text-white ${phaseClass}`}>
                      {r.status.phase}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2 text-sm">
                    <div>
                      <div className="text-xs font-semibold text-slate-600">Purpose</div>
                      <div className="text-slate-900">{r.purpose || "—"}</div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-600">Source of Fund</div>
                        <div className="text-slate-900">{r.sourceOfFund || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-600">Office (Requestor)</div>
                        <div className="text-slate-900">{r.officeRequestor || "—"}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-600">Current Location</div>
                      <div className="text-slate-900">{r.status.currentLocation || "—"}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLogsDoc(r)}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Logs
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryTab("transactions")
                        setLogsDoc(r)
                      }}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      History
                    </button>
                    {r.particulars.pr ? (
                      <button
                        type="button"
                        onClick={() => setPreview({ type: "PR", row: r })}
                        className="inline-flex h-8 items-center justify-center rounded-md bg-sky-600 px-3 text-xs font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus-visible:outline-none"
                      >
                        PR
                      </button>
                    ) : null}
                    {r.particulars.obr ? (
                      <button
                        type="button"
                        onClick={() => setPreview({ type: "OBR", row: r })}
                        className="inline-flex h-8 items-center justify-center rounded-md bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:outline-none"
                      >
                        OBR
                      </button>
                    ) : null}
                    {Boolean(String((r as any).supplier || (r.doc as any)?.supplier || r.status?.supplier?.[0]?.name || '').trim()) && (
                      <button
                        type="button"
                        onClick={() => setPreview({ type: "DV", row: r })}
                        className="inline-flex h-8 items-center justify-center rounded-md bg-purple-600 px-3 text-xs font-semibold text-white transition hover:bg-purple-700 focus:outline-none focus-visible:outline-none"
                        title="Preview DV"
                      >
                        DV
                      </button>
                    )}
                    {r.particulars.driveLink ? (
                      <button
                        type="button"
                        onClick={() => {
                          const url = String(r.particulars.driveLink || '').trim()
                          if (!url) return
                          window.open(url, '_blank', 'noopener,noreferrer')
                        }}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:outline-none"
                        title="Open Drive Link"
                      >
                        <ExternalLink className="size-3.5" />
                        Link
                      </button>
                    ) : null}
                    {Boolean(String(r.doc.gsoRoutingSlip || "").trim()) && (
                      <button
                        type="button"
                        onClick={() => setRoutingSlipDoc(r.doc)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:outline-none"
                      >
                        <Printer className="size-3.5" />
                        Routing Slip
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="hidden overflow-auto sm:block">
            <table className="w-full min-w-[1200px] text-left text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
              <thead className="bg-blue-600 text-white [&_th]:text-center">
                <tr className="border-b border-blue-700">
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-white first:text-left first:pl-5">Tracking #</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-white">References</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Purpose</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Source of Fund</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Office (Requestor)</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Documents</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Amount</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Duration</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Status</th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-white last:text-center last:pr-5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r) => {
                  const canEditSupplier = !readOnly && (isAdminRole || (isProcurementRole && hasPrivilege('Update Supplier')))
                  const canEditBacNotes = !readOnly && (isAdminRole || (isProcurementRole && hasPrivilege('BAC Notes')))
                  const canEditReferences = !readOnly && isAdminRole
                  const canEditFund = !readOnly && isAdminRole
                  const canEditOfficeRequestor = !readOnly && isAdminRole
                  const canEditAmount = !readOnly && isAdminRole

                  const prNo = String((r.doc as any)?.prNo || '').trim()
                  const obrNo = String((r.doc as any)?.obrNo || '').trim()

                  // Common deadline calculation logic for both grid and table views
                  const logs = Array.isArray(r.doc?.logs) ? [...(r.doc.logs as any[])].reverse() : [];
                  const latestMovementLog = logs.find(l => {
                    const label = String(l?.label || '').toLowerCase();
                    return label.startsWith('received') ||
                      label.startsWith('transferred') ||
                      label.startsWith('approved') ||
                      label.startsWith('completed') ||
                      label.includes('returned') ||
                      label.startsWith('discontinued');
                  });

                  const deadlineStatus = (() => {
                    if (!latestMovementLog || !String(latestMovementLog.label || '').toLowerCase().startsWith('received')) {
                      return { isExceeded: false, elapsedText: '', taskFromLabel: '', officeOfTask: '' };
                    }
                    const lastReceivedLog = latestMovementLog;
                    const officeOfTask = String(lastReceivedLog.byOffice || '').toUpperCase();
                    const label = String(lastReceivedLog.label || '');
                    const taskFromLabel = (() => {
                      const m = label.match(/received\s*(?:for\s*)?(.*)$/i);
                      return String(m?.[1] || '').trim();
                    })() || (() => {
                      const match = label.match(/\(([^)]+)\)\s*$/);
                      return match?.[1] ? String(match[1]).trim() : '';
                    })();
                    const startTime = new Date(String(lastReceivedLog.createdAt)).getTime();
                    const hasStartTime = Number.isFinite(startTime);
                    const elapsedMs = hasStartTime ? Date.now() - startTime : 0;
                    const elapsedText = hasStartTime ? formatElapsedShort(elapsedMs) : '';
                    if (officeOfTask && taskFromLabel) {
                      const officeTasks = transferTasksByOffice[officeOfTask] || [];
                      const taskInfo = officeTasks.find(t => String(t?.task || '').trim() === taskFromLabel);
                      if (taskInfo?.duration) {
                        const durationMs = parseDurationToMs(taskInfo.duration);
                        if (durationMs > 0 && hasStartTime) {
                          const deadline = startTime + durationMs;
                          return { isExceeded: Date.now() > deadline, elapsedText, taskFromLabel, officeOfTask };
                        }
                      }
                    }
                    return { isExceeded: false, elapsedText, taskFromLabel: '', officeOfTask: '' };
                  })();

                  const isPrivileged = isAdminRole || isProcurementRole;
                  const rowOverdueClass = (deadlineStatus.isExceeded && isPrivileged) ? "bg-rose-50" : "";

                  return (
                    <tr key={r.trackingNo} className={`hover:bg-slate-50 ${rowOverdueClass}`}>
                      <td className="px-4 py-3 align-top font-medium text-slate-900">
                        <div
                          className={`truncate text-base font-semibold ${deadlineStatus.isExceeded ? 'text-rose-600' : 'text-slate-900'}`}
                          title={`${r.trackingNo}${deadlineStatus.isExceeded ? ' (EXCEEDED DEADLINE)' : ''}${deadlineStatus.taskFromLabel ? ` - Task: ${deadlineStatus.taskFromLabel} at ${deadlineStatus.officeOfTask}` : ''}`}
                        >
                          {r.trackingNo}
                          {deadlineStatus.elapsedText && <span className="ml-1 text-[10px] opacity-60 font-normal">({deadlineStatus.elapsedText})</span>}
                          {deadlineStatus.isExceeded && <span className="ml-1 animate-pulse">⚠️</span>}
                        </div>
                        {Boolean(r.doc.returnToApprovalsRequested) && (
                          <div
                            className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-300"
                            title={`Reason: ${r.doc.returnToApprovalsReason || 'No reason provided'}`}
                          >
                            <span>⚠️</span> Return Requested
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-slate-700">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <button
                              type="button"
                              onClick={() => setPreview({ type: 'PR', row: r })}
                              className="block w-full text-left text-xs font-semibold text-sky-700 hover:underline focus:outline-none focus-visible:outline-none"
                              title="Preview PR"
                            >
                              PR No: <span className="font-normal text-slate-900">{prNo || '—'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreview({ type: 'OBR', row: r })}
                              className="block w-full text-left text-xs font-semibold text-slate-900 hover:underline focus:outline-none focus-visible:outline-none"
                              title="Preview OBR"
                            >
                              OBR No: <span className="font-normal text-slate-900">{obrNo || '—'}</span>
                            </button>
                            {(() => {
                              const contactNum = String(r.doc?.contactNumber || '').trim()
                              if (!contactNum) return null
                              return (
                                <>
                                  <div className="h-1"></div>
                                  <div className="h-1"></div>
                                  <div className="h-1"></div>
                                  <div className="text-xs text-slate-900">
                                    <span className="font-semibold">Contact:</span> {contactNum}
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                          {canEditReferences ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditRefsRow(r)
                                setEditPrNoValue(String((r.doc as any)?.prNo || '').trim())
                                setEditObrNoValue(String((r.doc as any)?.obrNo || '').trim())
                              }}
                              className="mt-0.5 inline-flex items-center text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:outline-none"
                              title="Edit references"
                            >
                              <Pencil className="size-3" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-700">{r.purpose}</td>
                      <td className="px-4 py-3 align-top text-slate-700">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 truncate" title={r.sourceOfFund}>
                            {r.sourceOfFund}
                          </div>
                          {canEditFund ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditFundRow(r)
                                setEditFundValue(String(r.doc?.fund || '').trim())
                              }}
                              className="mt-0.5 inline-flex items-center text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:outline-none"
                              title="Edit source of fund"
                            >
                              <Pencil className="size-3" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-700">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 truncate" title={r.officeRequestor}>
                            {r.officeRequestor}
                          </div>
                          {canEditOfficeRequestor ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditOfficeRow(r)
                                setEditOfficeValue(String(r.doc?.office || '').trim())
                              }}
                              className="mt-0.5 inline-flex items-center text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:outline-none"
                              title="Edit office requestor"
                            >
                              <Pencil className="size-3" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {r.particulars.pr ? (
                            <button
                              type="button"
                              onClick={() => setPreview({ type: "PR", row: r })}
                              className="inline-flex h-6 items-center justify-center rounded-lg bg-blue-600 px-2.5 text-[11px] font-bold text-white shadow-xs transition-all hover:bg-blue-700 active:scale-95 focus:outline-none"
                            >
                              PR
                            </button>
                          ) : null}
                          {r.particulars.obr ? (
                            <button
                              type="button"
                              onClick={() => setPreview({ type: "OBR", row: r })}
                              className="inline-flex h-6 items-center justify-center rounded-lg bg-slate-900 px-2.5 text-[11px] font-bold text-white shadow-xs transition-all hover:bg-slate-800 active:scale-95 focus:outline-none"
                            >
                              OBR
                            </button>
                          ) : null}
                          {Boolean(String((r as any).supplier || (r.doc as any)?.supplier || r.status?.supplier?.[0]?.name || '').trim()) && (
                            <button
                              type="button"
                              onClick={() => setPreview({ type: "DV", row: r })}
                              className="inline-flex h-6 items-center justify-center gap-1 rounded-lg bg-purple-600 px-2.5 text-[11px] font-bold text-white shadow-xs transition-all hover:bg-purple-700 active:scale-95 focus:outline-none"
                              title="Preview DV"
                            >
                              DV
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPreview({ type: "PO", row: r })}
                            className="inline-flex h-6 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-bold text-white shadow-xs transition-all hover:bg-emerald-700 active:scale-95 focus:outline-none"
                            title="Preview PO"
                          >
                            PO
                          </button>
                          {r.particulars.driveLink ? (
                            <button
                              type="button"
                              onClick={() => {
                                const url = String(r.particulars.driveLink || '').trim()
                                if (!url) return
                                window.open(url, '_blank', 'noopener,noreferrer')
                              }}
                              className="inline-flex h-6 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-bold text-white shadow-xs transition-all hover:bg-emerald-700 active:scale-95 focus:outline-none"
                              title="Open Drive Link"
                            >
                              <ExternalLink className="size-3" />
                              Link
                            </button>
                          ) : null}
                          {Boolean(String(r.doc.gsoRoutingSlip || "").trim()) && (
                            <button
                              type="button"
                              onClick={() => setRoutingSlipDoc(r.doc)}
                              className="inline-flex h-6 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-teal-600 px-2.5 text-[11px] font-bold text-white shadow-xs transition-all hover:bg-teal-700 active:scale-95 focus:outline-none"
                            >
                              Routing Slip
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-700">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 truncate font-semibold text-slate-900" title={r.amount}>
                            {r.amount}
                          </div>
                          {canEditAmount ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditAmountRow(r)
                                setEditAmountValue(formatPesoInput(String(r.doc?.amount || '').trim(), true))
                              }}
                              className="mt-0.5 inline-flex items-center rounded p-0.5 text-blue-500 hover:bg-blue-50 hover:text-blue-700 transition-colors focus:outline-none"
                              title="Edit amount"
                            >
                              <Pencil className="size-3" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-700 whitespace-pre-line font-medium">{r.duration}</td>
                      <td className="px-4 py-3 align-top">
                        <StatusBlock
                          status={r.status}
                          readOnly={readOnly}
                          canEditSupplier={canEditSupplier}
                          canEditBacNotes={canEditBacNotes}
                          onEditSupplier={() => {
                            if (!canEditSupplier) return
                            setEditSupplierRow(r)
                            const { supplier: resolvedMainSupplier } = getMainDocSupplierInfo(r.doc as any)
                            setEditSupplierValue(String(r.doc?.supplier || '').trim() || resolvedMainSupplier)
                            setEditSubDocSuppliers(Array.isArray(r.doc?.subDocuments) ? r.doc.subDocuments.map((s: any) => String(s?.supplier || '').trim()) : [])
                          }}
                          onEditBacNotes={() => {
                            if (!canEditBacNotes) return
                            setEditBacNotesRow(r)
                            setEditBacNotesValue(String(r.doc?.bacNotes || '').trim())
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        {readOnly ? (
                          <button
                            type="button"
                            onClick={() => setLogsDoc(r)}
                            className="inline-flex h-7 w-32 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-50 hover:border-slate-300 hover:text-blue-600 focus:outline-none"
                          >
                            <History className="size-3.5" />
                            History
                          </button>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {isAdminRole && fundTab === 'discontinued' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setLogsDoc(r)}
                                  className="inline-flex h-7 w-32 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-50 hover:border-slate-300 hover:text-blue-600 focus:outline-none"
                                >
                                  <History className="size-3.5" />
                                  History
                                </button>
                                <button
                                  type="button"
                                  disabled={actionBusyId === String(r.doc._id)}
                                  onClick={async () => {
                                    setStatusConfirm({ kind: 'continue', row: r })
                                  }}
                                  className="inline-flex h-7 w-32 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white shadow-xs transition-all hover:bg-emerald-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <CheckCircle2 className="size-3.5" />
                                  Continue
                                </button>
                              </>
                            ) : null}

                            {isAdminRole && fundTab === 'discontinued' ? null : r.status.phase === 'completed' ? (
                              <button
                                type="button"
                                onClick={() => setLogsDoc(r)}
                                className="inline-flex h-7 w-32 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-50 hover:border-slate-300 hover:text-blue-600 focus:outline-none"
                              >
                                <History className="size-3.5" />
                                History
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={actionBusyId === String(r.doc._id)}
                                  onClick={() => setPrintRow(r)}
                                  className="inline-flex h-7 w-32 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white shadow-xs transition-all hover:bg-blue-700 focus:outline-none disabled:opacity-60"
                                >
                                  <Printer className="size-3.5" />
                                  Print
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setLogsDoc(r)}
                                  className="inline-flex h-7 w-32 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-50 hover:border-slate-300 hover:text-blue-600 focus:outline-none"
                                >
                                  <History className="size-3.5" />
                                  History
                                </button>
                                {isAdminRole ? (
                                  <button
                                    type="button"
                                    disabled={!r.doc.returnToApprovalsRequested || actionBusyId === String(r.doc._id)}
                                    onClick={() => {
                                      if (!r.doc.returnToApprovalsRequested) return
                                      setReturnToApprovalsConfirm(r)
                                      setReturnToApprovalsRemarks(String(r.doc.returnToApprovalsReason || ''))
                                    }}
                                    className={`inline-flex h-7 w-32 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-semibold shadow-xs transition-all focus:outline-none ${r.doc.returnToApprovalsRequested
                                      ? 'bg-amber-600 text-white ring-2 ring-amber-400 ring-offset-1 hover:bg-amber-700 animate-pulse cursor-pointer'
                                      : 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                                      }`}
                                    title={
                                      r.doc.returnToApprovalsRequested
                                        ? `Return Requested by End User: ${r.doc.returnToApprovalsReason || 'Click to process return'}`
                                        : 'No return request from End User'
                                    }
                                  >
                                    <RotateCcw className="size-3.5" />
                                    Return to Approvals
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={actionBusyId === String(r.doc._id)}
                                  onClick={async () => {
                                    if (!window.confirm('Mark this document as completed?')) return
                                    try {
                                      setActionBusyId(String(r.doc._id))
                                      await patchDocument(String(r.doc._id), {
                                        status: 'completed',
                                        addLog: { label: 'Completed', color: 'bg-emerald-600' },
                                      })
                                      await fetchRows()
                                    } catch (e) {
                                      setError(e instanceof Error ? e.message : 'Failed to update')
                                    } finally {
                                      setActionBusyId(null)
                                    }
                                  }}
                                  className="inline-flex h-7 w-32 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white shadow-xs transition-all hover:bg-emerald-700 focus:outline-none disabled:opacity-60"
                                >
                                  <CheckCircle2 className="size-3.5" />
                                  Completed
                                </button>
                                <button
                                  type="button"
                                  disabled={actionBusyId === String(r.doc._id)}
                                  onClick={async () => {
                                    setStatusConfirm({ kind: 'discontinue', row: r })
                                  }}
                                  className="inline-flex h-7 w-32 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-rose-600 px-3 text-xs font-semibold text-white shadow-xs transition-all hover:bg-rose-700 focus:outline-none disabled:opacity-60"
                                >
                                  <LogOut className="size-3.5 rotate-180" />
                                  Discontinue
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}

                {visible.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-slate-600" colSpan={11}>
                      No results.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) {
              setPreview(null)
              setPrActivePage(0)
              closeEditPreview()
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
                <button
                  type="button"
                  onClick={() => openEditPreview(preview)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                  title="Edit PR/OBR fields"
                >
                  <Pencil className="size-4" />
                  Edit
                </button>
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
                  <button
                    type="button"
                    onClick={() => capturePoPreviewToPdf(preview.row)}
                    disabled={poPdfBusy}
                    className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none disabled:opacity-50"
                    title="Download PDF"
                  >
                    {poPdfBusy ? '...' : <Download className="size-4" />}
                  </button>
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
                          String((preview.row.doc as any)?.requestedByName || '').trim() ||
                          officeHeads[preview.row.doc.office?.toUpperCase() || '']?.head ||
                          'DEPARTMENT HEAD',
                        requestedByDesignation:
                          String((preview.row.doc as any)?.requestedByDesignation || '').trim() ||
                          officeHeads[preview.row.doc.office?.toUpperCase() || '']?.designation ||
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
                          certifiedBName: String((preview.row.doc as any)?.certifiedBName || '').trim(),
                          certifiedBPosition: String((preview.row.doc as any)?.certifiedBPosition || '').trim(),
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
                            certifiedBName: String((preview.row.doc as any)?.certifiedBName || '').trim(),
                            certifiedBPosition: String((preview.row.doc as any)?.certifiedBPosition || '').trim(),
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

      {preview && editPreviewOpen && editPreviewDraft ? (
        <div
          className="fixed inset-0 z-60 flex items-start justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) closeEditPreview()
          }}
        >
          <div className="mt-10 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">Edit {preview.type} Fields</div>
                <div className="truncate text-xs text-slate-600">{preview.row.trackingNo}</div>
              </div>
              <button
                type="button"
                onClick={closeEditPreview}
                className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {editPreviewError ? <div className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{editPreviewError}</div> : null}

              {preview.type === 'PR' ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="prDepartment">Department</label>
                      <input
                        id="prDepartment"
                        value={editPreviewDraft.department}
                        onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, department: e.target.value } : p))}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="prSection">Section</label>
                      <input
                        id="prSection"
                        value={editPreviewDraft.section}
                        onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, section: e.target.value } : p))}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="prNo">PR No</label>
                      <input
                        id="prNo"
                        value={editPreviewDraft.prNo}
                        onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, prNo: e.target.value } : p))}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        placeholder="Enter PR No"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="prDate">Date</label>
                      <input
                        id="prDate"
                        value={editPreviewDraft.prDate}
                        onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, prDate: e.target.value } : p))}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        placeholder="e.g. 03/19/2026"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="prFpp">FPP</label>
                      <input
                        id="prFpp"
                        value={editPreviewDraft.fpp}
                        onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, fpp: e.target.value } : p))}
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
                          {(editPreviewDraft.prItems || []).map((it, idx) => (
                            <tr key={idx} className="text-sm">
                              <td className="border-b border-slate-200 px-2 py-1 align-top">
                                <input
                                  value={String(it?.unit || '')}
                                  onChange={(e) =>
                                    setEditPreviewDraft((p) => {
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
                                    setEditPreviewDraft((p) => {
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
                                    setEditPreviewDraft((p) => {
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
                                    setEditPreviewDraft((p) => {
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
                                    setEditPreviewDraft((p) => {
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
                                    setEditPreviewDraft((p) => {
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
                        setEditPreviewDraft((p) => {
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
                      value={editPreviewDraft.purpose}
                      onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, purpose: e.target.value } : p))}
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
                          value={editPreviewDraft.requestedByName}
                          onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, requestedByName: e.target.value } : p))}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700" htmlFor="requestedByDesignation">Requested By (Designation)</label>
                        <input
                          id="requestedByDesignation"
                          value={editPreviewDraft.requestedByDesignation}
                          onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, requestedByDesignation: e.target.value } : p))}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700" htmlFor="cashAvailabilityName">Cash Availability (Name)</label>
                        <input
                          id="cashAvailabilityName"
                          value={editPreviewDraft.cashAvailabilityName}
                          onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, cashAvailabilityName: e.target.value } : p))}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700" htmlFor="cashAvailabilityDesignation">Cash Availability (Designation)</label>
                        <input
                          id="cashAvailabilityDesignation"
                          value={editPreviewDraft.cashAvailabilityDesignation}
                          onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, cashAvailabilityDesignation: e.target.value } : p))}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700" htmlFor="approvedByName">Approved By (Name)</label>
                        <input
                          id="approvedByName"
                          value={editPreviewDraft.approvedByName}
                          onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, approvedByName: e.target.value } : p))}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700" htmlFor="approvedByDesignation">Approved By (Designation)</label>
                        <input
                          id="approvedByDesignation"
                          value={editPreviewDraft.approvedByDesignation}
                          onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, approvedByDesignation: e.target.value } : p))}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* OBR No */}
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="obrNo">OBR No</label>
                    <div className="flex overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center border-r border-slate-200 bg-slate-100 px-3 text-sm font-bold text-slate-700">
                        NO.
                      </div>
                      <input
                        id="obrNo"
                        value={editPreviewDraft.obrNo}
                        onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, obrNo: e.target.value } : p))}
                        className="h-10 w-full bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        placeholder="e.g. 100-26-"
                      />
                    </div>
                  </div>

                  {/* Responsibility Center */}
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="responsibilityCenter">Responsibility Center</label>
                    <input
                      id="responsibilityCenter"
                      value={editPreviewDraft.responsibilityCenter}
                      onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, responsibilityCenter: e.target.value } : p))}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                    />
                  </div>

                  {/* Particulars */}
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="obrParticulars">Particulars</label>
                    <textarea
                      id="obrParticulars"
                      value={editPreviewDraft.obrParticulars}
                      onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, obrParticulars: e.target.value } : p))}
                      className="min-h-32 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      placeholder="Enter particulars..."
                      style={{ minHeight: '128px' }}
                    />
                  </div>

                  {/* FPP and Account Code side by side */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-slate-700" htmlFor="fpp">FPP</label>
                      <textarea
                        id="fpp"
                        value={editPreviewDraft.fpp}
                        onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, fpp: e.target.value } : p))}
                        className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        placeholder="One per line"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-slate-700" htmlFor="accountCode">Account Code</label>
                      <textarea
                        id="accountCode"
                        value={editPreviewDraft.accountCode}
                        onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, accountCode: e.target.value } : p))}
                        className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        placeholder="One per line"
                      />
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="amount">Amount</label>
                    <textarea
                      id="amount"
                      value={editPreviewDraft.amount}
                      onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, amount: e.target.value } : p))}
                      className="min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      placeholder="One per line; TOTAL will be computed"
                    />
                  </div>

                  {/* Section: Signatories */}
                  <div className="border-t border-slate-200 pt-4">
                    <div className="mb-3 text-sm font-bold text-slate-800 uppercase tracking-wide">Signatories</div>

                    {/* Department Head */}
                    <div className="mb-3">
                      <div className="mb-2 text-xs font-semibold text-slate-500">Department Head (Certified A)</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs text-slate-600" htmlFor="certifiedAName">Name</label>
                          <input
                            id="certifiedAName"
                            value={editPreviewDraft.certifiedAName}
                            onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, certifiedAName: e.target.value } : p))}
                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-slate-600" htmlFor="certifiedAPosition">Position</label>
                          <input
                            id="certifiedAPosition"
                            value={editPreviewDraft.certifiedAPosition}
                            onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, certifiedAPosition: e.target.value } : p))}
                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Provincial Budget Officer (Eduardo) */}
                    <div className="mb-3">
                      <div className="mb-2 text-xs font-semibold text-slate-500">Provincial Budget Officer (Certified B)</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs text-slate-600" htmlFor="certifiedBName">Name</label>
                          <input
                            id="certifiedBName"
                            value={editPreviewDraft.certifiedBName}
                            onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, certifiedBName: e.target.value } : p))}
                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-slate-600" htmlFor="certifiedBPosition">Position</label>
                          <input
                            id="certifiedBPosition"
                            value={editPreviewDraft.certifiedBPosition}
                            onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, certifiedBPosition: e.target.value } : p))}
                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Prepared By */}
                    <div className="space-y-1">
                      <label className="text-sm font-semibold text-slate-700" htmlFor="preparedByName">Prepared By</label>
                      <input
                        id="preparedByName"
                        value={editPreviewDraft.preparedByName}
                        onChange={(e) => setEditPreviewDraft((p) => (p ? { ...p, preparedByName: e.target.value } : p))}
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                onClick={closeEditPreview}
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editPreviewBusy}
                onClick={async () => {
                  if (!preview || !editPreviewDraft) return
                  try {
                    setEditPreviewBusy(true)
                    setEditPreviewError(null)

                    if (preview.type === 'PR') {
                      const nextDepartment = editPreviewDraft.department.trim()
                      const nextSection = editPreviewDraft.section.trim()
                      const nextPrNo = editPreviewDraft.prNo.trim()
                      const nextPrDate = editPreviewDraft.prDate.trim()
                      const nextFpp = editPreviewDraft.fpp.trim()
                      const nextPurpose = editPreviewDraft.purpose.trim()
                      const nextPrItems = Array.isArray(editPreviewDraft.prItems) ? editPreviewDraft.prItems : []
                      const nextRequestedByName = editPreviewDraft.requestedByName.trim()
                      const nextRequestedByDesignation = editPreviewDraft.requestedByDesignation.trim()
                      const nextCashAvailabilityName = editPreviewDraft.cashAvailabilityName.trim()
                      const nextCashAvailabilityDesignation = editPreviewDraft.cashAvailabilityDesignation.trim()
                      const nextApprovedByName = editPreviewDraft.approvedByName.trim()
                      const nextApprovedByDesignation = editPreviewDraft.approvedByDesignation.trim()

                      await patchDocument(preview.row.doc._id, {
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
                      })

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
                    } else {
                      const nextObrNo = editPreviewDraft.obrNo.trim()
                      const nextResponsibilityCenter = editPreviewDraft.responsibilityCenter.trim()
                      const nextObrParticulars = editPreviewDraft.obrParticulars.trim()
                      const nextFpp = editPreviewDraft.fpp.trim()
                      const nextAccountCode = editPreviewDraft.accountCode.trim()
                      const nextAmount = editPreviewDraft.amount.trim()
                      const nextCertifiedAName = editPreviewDraft.certifiedAName.trim()
                      const nextCertifiedAPosition = editPreviewDraft.certifiedAPosition.trim()
                      const nextCertifiedBName = editPreviewDraft.certifiedBName.trim()
                      const nextCertifiedBPosition = editPreviewDraft.certifiedBPosition.trim()
                      const nextPreparedByName = editPreviewDraft.preparedByName.trim()

                      await patchDocument(preview.row.doc._id, {
                        obrNo: nextObrNo,
                        responsibilityCenter: nextResponsibilityCenter,
                        obrParticulars: nextObrParticulars,
                        purpose: nextObrParticulars,
                        fpp: nextFpp,
                        accountCode: nextAccountCode,
                        amount: nextAmount,
                        certifiedAName: nextCertifiedAName,
                        certifiedAPosition: nextCertifiedAPosition,
                        certifiedBName: nextCertifiedBName,
                        certifiedBPosition: nextCertifiedBPosition,
                        preparedByName: nextPreparedByName,
                      })

                      setPreview((prev) => {
                        if (!prev || prev.type !== 'OBR') return prev
                        return {
                          ...prev,
                          row: {
                            ...prev.row,
                            doc: {
                              ...prev.row.doc,
                              obrNo: nextObrNo,
                              responsibilityCenter: nextResponsibilityCenter,
                              obrParticulars: nextObrParticulars,
                              purpose: nextObrParticulars,
                              fpp: nextFpp,
                              accountCode: nextAccountCode,
                              amount: nextAmount,
                              certifiedAName: nextCertifiedAName,
                              certifiedAPosition: nextCertifiedAPosition,
                              certifiedBName: nextCertifiedBName,
                              certifiedBPosition: nextCertifiedBPosition,
                              preparedByName: nextPreparedByName,
                            },
                          },
                        }
                      })
                    }

                    await fetchRowsRef.current?.()
                    closeEditPreview()
                  } catch (e) {
                    setEditPreviewError(e instanceof Error ? e.message : 'Failed to update preview fields')
                  } finally {
                    setEditPreviewBusy(false)
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

      {deleteLogConfirmOpen && logsDoc ? (
        <div
          className="fixed inset-0 z-60 overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setDeleteLogConfirmOpen(false)
          }}
        >
          <div className="min-h-full w-full">
            <div className="flex min-h-full items-start justify-center py-6">
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-900">Delete last history row?</div>
                    <div className="truncate text-xs text-slate-600">{logsDoc.trackingNo}</div>
                  </div>
                </div>

                <div className="px-4 py-4 text-sm text-slate-700">
                  This will delete only the most recent history entry. Deletion must start from the last row.
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setDeleteLogConfirmOpen(false)}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={actionBusyId === String(logsDoc.doc._id)}
                    onClick={async () => {
                      try {
                        setActionBusyId(String(logsDoc.doc._id))
                        setDeleteLogConfirmOpen(false)
                        await removeLastLog(String(logsDoc.doc._id))
                        const nextRows = await fetchRows()
                        setLogsDoc((prev) => {
                          if (!prev) return prev
                          const list = Array.isArray(nextRows) ? nextRows : []
                          const next = list.find((r) => String(r?.doc?._id) === String(prev?.doc?._id))
                          return next || prev
                        })
                      } finally {
                        setActionBusyId(null)
                      }
                    }}
                    className="inline-flex h-9 items-center justify-center rounded bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {logsDoc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) closeLogs()
          }}
        >
          <div className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <History className="size-4 text-emerald-600" />
                  <h3 className="truncate text-base font-bold text-slate-900">Transaction History</h3>
                </div>
                <div className="mt-0.5 truncate text-xs font-medium text-slate-500">
                  Tracking No: <span className="text-slate-900">{logsDoc.trackingNo}</span> — <span className="text-slate-700">{logsDoc.officeRequestor}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeLogs}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none"
                aria-label="Close"
              >
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-auto p-6">
              {/* Overview card */}
              <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-sm">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Purpose</div>
                      <div className="mt-1 text-sm font-bold text-slate-900 leading-relaxed uppercase">
                        {String(logsDoc.doc.purpose || '-')}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Supplier</div>
                      <div className="mt-0.5 text-sm font-bold text-emerald-700 uppercase">
                        {String(logsDoc.doc.supplier || '-')}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fund</div>
                        <div className="mt-0.5 text-xs font-bold text-slate-700">{String(logsDoc.doc.fund || '-')}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount</div>
                        <div className="mt-0.5 text-sm font-black text-slate-900">
                          {(() => {
                            const cleaned = String(logsDoc.doc.amount || '').replace(/[^0-9.,-]/g, '').trim()
                            return cleaned ? `₱ ${cleaned}` : '-'
                          })()}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Location</div>
                      <div className="mt-1">
                        <span className="inline-flex rounded bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          {inferCurrentLocation(String(logsDoc.doc.status || ''), String(logsDoc.doc.office || ''), logsDoc.doc.logs)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-lg font-semibold text-slate-900">
                    {historyTab === 'transactions' ? 'Transaction Logs' : historyTab === 'subdocuments' ? 'Sub-Document Transactions' : 'Pre-Validation'}
                  </div>
                  <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setHistoryTab('transactions')}
                      className={`h-8 rounded px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${historyTab === 'transactions'
                        ? 'bg-slate-900 text-white'
                        : 'bg-transparent text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                      Transactions
                    </button>
                    {Array.isArray((logsDoc.doc as any)?.subDocuments) && (logsDoc.doc as any)?.subDocuments.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setHistoryTab('subdocuments')}
                        className={`h-8 rounded px-3 text-xs font-semibold transition focus:outline-none focus-visible:outline-none ${historyTab === 'subdocuments'
                          ? 'bg-slate-900 text-white'
                          : 'bg-transparent text-slate-700 hover:bg-slate-100'
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
                        : 'bg-transparent text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                      Pre-Validation
                    </button>
                  </div>
                </div>

                {historyTab === 'subdocuments' ? (
                  <div className="mt-4 space-y-6">
                    {Array.isArray((logsDoc.doc as any)?.subDocuments) && (logsDoc.doc as any)?.subDocuments.map((sub: any, sIdx: number) => {
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
                                const date = formatLogDate(l.createdAt)
                                const processedBy = String(l.byUser || l.byOffice || '-')
                                const { action, remarks } = splitActionAndRemarks(String(l.label || ''), l.byOffice)
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
                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
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
                          const logs = Array.isArray(logsDoc.doc.logs) ? [...logsDoc.doc.logs] : []
                          const sorted = logs
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

                          const selectedAsc =
                            historyTab === 'transactions'
                              ? transactionsAsc.filter((l) =>
                                isTransferLog(String(l?.label || '')) ||
                                isReceivedLog(String(l?.label || '')) ||
                                isTerminalActionLog(String(l?.label || ''))
                              )
                              : prevalidationAsc

                          const canDeleteSelected = isAdminRole && historyTab === 'transactions'
                          const lastSelectedIdx = selectedAsc.length ? selectedAsc.length - 1 : -1

                          const timestamps = selectedAsc.map((l) => new Date(l.createdAt).getTime())
                          const spanByStartIdx = new Map<number, { rowSpan: number; durationMs: number }>()
                          const coveredIdx = new Set<number>()

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
                            spanByStartIdx.set(i, { rowSpan: endIdx - i + 1, durationMs })

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
                                <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={6}>
                                  No logs yet.
                                </td>
                              </tr>
                            )
                          }

                          return (
                            <>
                              {selectedAsc.map((l, idx) => {
                                const processedBy = String(l.byUser || l.byOffice || '-')
                                const { action, remarks } = splitActionAndRemarks(l.label, l.byOffice)
                                const allowDeleteThisLog =
                                  canDeleteSelected &&
                                  idx === lastSelectedIdx &&
                                  !readOnly &&
                                  !isTransferLog(String(l?.label || ''))

                                const span = spanByStartIdx.get(idx)
                                const isCovered = coveredIdx.has(idx)

                                return (
                                  <tr key={`${l.createdAt}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                    <td className="px-3 py-2 text-xs text-slate-700">{formatLogDate(l.createdAt)}</td>
                                    <td className="px-3 py-2 text-xs text-slate-700 whitespace-pre-line">{processedBy}</td>
                                    <td className="px-3 py-2 text-xs text-slate-700">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="min-w-0">{action}</span>
                                        {allowDeleteThisLog ? (
                                          <button
                                            type="button"
                                            disabled={actionBusyId === String(logsDoc.doc._id)}
                                            onClick={() => setDeleteLogConfirmOpen(true)}
                                            className="inline-flex h-6 items-center justify-center rounded bg-rose-600 px-2 text-[10px] font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                                          >
                                            Delete
                                          </button>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-700">{remarks}</td>
                                    {isCovered ? null : span ? (
                                      <td className="px-3 py-2 text-xs text-slate-700" rowSpan={span.rowSpan}>
                                        {formatDays(span.durationMs)}
                                      </td>
                                    ) : (
                                      <td className="px-3 py-2 text-xs text-slate-700">-</td>
                                    )}
                                    {isCovered ? null : span ? (
                                      <td className="px-3 py-2 text-xs text-slate-700" rowSpan={span.rowSpan}>
                                        {formatDuration(span.durationMs)}
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
      ) : null}

      {commentDoc ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) closeComment()
          }}
        >
          <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                    <History className="size-4" />
                  </div>
                  <h3 className="truncate text-base font-bold text-slate-900">Add Remark</h3>
                </div>
                <div className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Tracking No: <span className="text-slate-600 font-medium">{commentDoc.trackingNo}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeComment}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none"
                aria-label="Close"
              >
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 space-y-4 overflow-auto p-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="comment-text">
                  Your Remark
                </label>
                <textarea
                  id="comment-text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="min-h-32 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                  placeholder="Enter any additional notes or details here..."
                />
                <p className="text-[10px] text-slate-400 italic font-medium leading-relaxed">
                  This remark will be added to the transaction history for tracking purposes.
                </p>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/80 px-6 py-4">
              <button
                type="button"
                onClick={closeComment}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-slate-600 shadow-sm border border-slate-200 ring-1 ring-slate-200/50 transition hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!commentText.trim() || actionBusyId === String(commentDoc.doc._id)}
                onClick={async () => {
                  const trimmed = commentText.trim()
                  if (!trimmed) return
                  try {
                    setActionBusyId(String(commentDoc.doc._id))
                    await patchDocument(String(commentDoc.doc._id), {
                      addLog: { label: `Remark: ${trimmed}`, color: 'bg-sky-700' },
                    })
                    await fetchRows()
                    closeComment()
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Failed to save remark')
                  } finally {
                    setActionBusyId(null)
                  }
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionBusyId === String(commentDoc.doc._id) ? (
                  <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : null}
                Save Remark
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {
        editSupplierRow ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) {
                setEditSupplierRow(null)
                setEditSupplierValue("")
              }
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-10">
                <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Edit Supplier</div>
                      <div className="truncate text-xs text-slate-600">{editSupplierRow.trackingNo}</div>
                    </div>
                  </div>

                  <div className="space-y-4 px-4 py-4 max-h-[60vh] overflow-y-auto">
                    {Array.isArray(editSupplierRow.doc?.subDocuments) && editSupplierRow.doc.subDocuments.length > 0 ? (
                      <>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-700" htmlFor="supplier-main">
                            1. Main Document Supplier
                          </label>
                          <input
                            id="supplier-main"
                            value={editSupplierValue}
                            onChange={(e) => setEditSupplierValue(e.target.value)}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                            placeholder="Enter main document supplier"
                          />
                        </div>
                        {editSupplierRow.doc.subDocuments.map((s: any, idx: number) => (
                          <div key={idx} className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700" htmlFor={`supplier-sub-${idx}`}>
                              {idx + 2}. Sub-Document #{idx + 1} Supplier ({s?.trackingNo || `Item ${idx + 2}`})
                            </label>
                            <input
                              id={`supplier-sub-${idx}`}
                              value={editSubDocSuppliers[idx] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setEditSubDocSuppliers((prev) => {
                                  const copy = [...prev]
                                  copy[idx] = val
                                  return copy
                                })
                              }}
                              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                              placeholder={`Enter supplier for Sub-Document #${idx + 1}`}
                            />
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700" htmlFor="supplier">
                          Supplier
                        </label>
                        <input
                          id="supplier"
                          value={editSupplierValue}
                          onChange={(e) => setEditSupplierValue(e.target.value)}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                          placeholder="Enter supplier"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditSupplierRow(null)
                        setEditSupplierValue("")
                        setEditSubDocSuppliers([])
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={editSupplierBusy}
                      onClick={async () => {
                        if (!editSupplierRow) return
                        try {
                          setEditSupplierBusy(true)
                          const nextSubDocs = Array.isArray(editSupplierRow.doc?.subDocuments) && editSupplierRow.doc.subDocuments.length > 0
                            ? editSupplierRow.doc.subDocuments.map((s: any, idx: number) => ({
                              ...s,
                              supplier: (editSubDocSuppliers[idx] ?? s?.supplier ?? '').trim(),
                            }))
                            : undefined

                          await patchDocument(String(editSupplierRow.doc._id), {
                            supplier: editSupplierValue.trim(),
                            ...(nextSubDocs ? { subDocuments: nextSubDocs } : {}),
                          })
                          await fetchRows()
                          setEditSupplierRow(null)
                          setEditSupplierValue("")
                          setEditSubDocSuppliers([])
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Failed to update')
                        } finally {
                          setEditSupplierBusy(false)
                        }
                      }}
                      className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

      {
        editBacNotesRow ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) {
                setEditBacNotesRow(null)
                setEditBacNotesValue("")
              }
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-10">
                <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Edit BAC Notes</div>
                      <div className="truncate text-xs text-slate-600">{editBacNotesRow.trackingNo}</div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="bacNotes">
                        BAC Notes
                      </label>
                      <textarea
                        id="bacNotes"
                        value={editBacNotesValue}
                        onChange={(e) => setEditBacNotesValue(e.target.value)}
                        className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        placeholder="Enter BAC notes"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditBacNotesRow(null)
                        setEditBacNotesValue("")
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={editBacNotesBusy}
                      onClick={async () => {
                        if (!editBacNotesRow) return
                        try {
                          setEditBacNotesBusy(true)
                          await patchDocument(String(editBacNotesRow.doc._id), {
                            bacNotes: editBacNotesValue.trim(),
                          })
                          await fetchRows()
                          setEditBacNotesRow(null)
                          setEditBacNotesValue("")
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Failed to update')
                        } finally {
                          setEditBacNotesBusy(false)
                        }
                      }}
                      className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

      {
        editRefsRow ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) {
                setEditRefsRow(null)
                setEditPrNoValue("")
                setEditObrNoValue("")
              }
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-10">
                <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Edit References</div>
                      <div className="truncate text-xs text-slate-600">{editRefsRow.trackingNo}</div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="prNo">
                        PR No
                      </label>
                      <input
                        id="prNo"
                        value={editPrNoValue}
                        onChange={(e) => setEditPrNoValue(e.target.value)}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        placeholder="Enter PR No"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="obrNo">
                        OBR No
                      </label>
                      <input
                        id="obrNo"
                        value={editObrNoValue}
                        onChange={(e) => setEditObrNoValue(e.target.value)}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        placeholder="Enter OBR No"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditRefsRow(null)
                        setEditPrNoValue("")
                        setEditObrNoValue("")
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={editRefsBusy}
                      onClick={async () => {
                        if (!editRefsRow) return
                        try {
                          setEditRefsBusy(true)
                          await patchDocument(String(editRefsRow.doc._id), {
                            prNo: editPrNoValue.trim(),
                            obrNo: editObrNoValue.trim(),
                          })
                          await fetchRows()
                          setEditRefsRow(null)
                          setEditPrNoValue("")
                          setEditObrNoValue("")
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Failed to update')
                        } finally {
                          setEditRefsBusy(false)
                        }
                      }}
                      className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

      {
        editFundRow ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) {
                setEditFundRow(null)
                setEditFundValue("")
              }
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-10">
                <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Edit Source of Fund</div>
                      <div className="truncate text-xs text-slate-600">{editFundRow.trackingNo}</div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="fund">
                        Source of Fund
                      </label>
                      <select
                        id="fund"
                        value={editFundValue}
                        onChange={(e) => setEditFundValue(e.target.value)}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      >
                        {[
                          'General Fund',
                          'Trust Fund',
                          'SEF Fund',
                          '20% Development Fund',
                          '5% LDRRM Fund',
                        ].map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                        {editFundValue &&
                          ![
                            'General Fund',
                            'Trust Fund',
                            'SEF Fund',
                            '20% Development Fund',
                            '5% LDRRM Fund',
                          ].includes(editFundValue) ? (
                          <option value={editFundValue}>{editFundValue}</option>
                        ) : null}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditFundRow(null)
                        setEditFundValue("")
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={editFundBusy}
                      onClick={async () => {
                        if (!editFundRow) return
                        try {
                          setEditFundBusy(true)
                          await patchDocument(String(editFundRow.doc._id), { fund: editFundValue.trim() })
                          await fetchRows()
                          setEditFundRow(null)
                          setEditFundValue("")
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Failed to update')
                        } finally {
                          setEditFundBusy(false)
                        }
                      }}
                      className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

      {
        editOfficeRow ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) {
                setEditOfficeRow(null)
                setEditOfficeValue("")
              }
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-10">
                <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Edit Office Requestor</div>
                      <div className="truncate text-xs text-slate-600">{editOfficeRow.trackingNo}</div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="office">
                        Office (Requestor)
                      </label>
                      <select
                        id="office"
                        value={editOfficeValue}
                        onChange={(e) => setEditOfficeValue(e.target.value)}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                      >
                        {officeOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                        {editOfficeValue && !officeOptions.includes(editOfficeValue) ? (
                          <option value={editOfficeValue}>{editOfficeValue}</option>
                        ) : null}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditOfficeRow(null)
                        setEditOfficeValue("")
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={editOfficeBusy}
                      onClick={async () => {
                        if (!editOfficeRow) return
                        try {
                          setEditOfficeBusy(true)
                          await patchDocument(String(editOfficeRow.doc._id), { office: editOfficeValue.trim() })
                          await fetchRows()
                          setEditOfficeRow(null)
                          setEditOfficeValue("")
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Failed to update')
                        } finally {
                          setEditOfficeBusy(false)
                        }
                      }}
                      className="inline-flex h-9 items-center justify-center rounded bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

      {
        editAmountRow ? (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) {
                setEditAmountRow(null)
                setEditAmountValue("")
              }
            }}
          >
            <div className="min-h-full w-full">
              <div className="flex min-h-full items-start justify-center py-10">
                <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">Edit Amount</div>
                      <div className="truncate text-xs text-slate-600">{editAmountRow.trackingNo}</div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700" htmlFor="amount">
                        Amount
                      </label>
                      <input
                        id="amount"
                        value={editAmountValue}
                        onChange={(e) => setEditAmountValue(formatPesoInput(e.target.value, false))}
                        onBlur={() => setEditAmountValue((prev) => formatPesoInput(prev, true))}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:outline-none"
                        placeholder="Enter amount"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditAmountRow(null)
                        setEditAmountValue("")
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:outline-none"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={editAmountBusy}
                      onClick={async () => {
                        if (!editAmountRow) return
                        try {
                          setEditAmountBusy(true)
                          await patchDocument(String(editAmountRow.doc._id), { amount: editAmountValue.trim() })
                          await fetchRows()
                          setEditAmountRow(null)
                          setEditAmountValue("")
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Failed to update amount')
                        } finally {
                          setEditAmountBusy(false)
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

      {/* Routing Slip Modal */}
      <RoutingSlipModal rsDoc={routingSlipDoc as unknown as DocumentRow} onClose={() => setRoutingSlipDoc(null)} />

      {/* New Request Modal */}
      <NewRequestModal
        isOpen={isNewRequestModalOpen}
        onClose={() => setIsNewRequestModalOpen(false)}
        onSubmit={handleCreateNewRequest}
      />
    </div >
  )
}
