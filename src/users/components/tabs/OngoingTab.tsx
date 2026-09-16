import { Fragment } from "react"
import { FileText, History, ChevronDown, ChevronRight, Printer, RotateCcw } from "lucide-react"
import { type DocumentRow, getSubDocAmount, getMainDocSupplierInfo } from "../../types/documentTypes"

/**
 * Returns true when a sub-document should be visible to the end user.
 *
 * Two cases:
 * A) Sub-doc was individually returned via "Transferred to END USER" log
 *    → show once parent has "Received by End User" log
 * B) Parent doc was returned wholesale (status: "returned") and end user
 *    received it — sub-docs have no individual transfer log in this case
 *    → show if parent has "Received by End User" log OR parent status is "returned"
 */
function isSubDocReceivedByEndUser(
  subLogs: Array<{ label?: string; byOffice?: string; createdAt?: string }> | undefined,
  parentLogs: Array<{ label?: string; byOffice?: string; createdAt?: string }> | undefined,
  parentStatus?: string
): boolean {
  const sLogs = Array.isArray(subLogs) ? subLogs : []
  const pLogs = Array.isArray(parentLogs) ? parentLogs : []
  const _pStatus = String(parentStatus || "").trim().toLowerCase()
  void _pStatus

  const isReceivedByEndUserLog = (l: any) => {
    const label = String(l?.label || "").trim().toLowerCase()
    if (!label) return false
    // Prefer explicit end-user receipt
    if (label.startsWith("received by end user")) return true
    // Accept other common variants
    if (label === "received" && String(l?.byOffice || "").trim().toLowerCase().includes("end user")) return true
    if (label.startsWith("received") && label.includes("end user")) return true
    return false
  }

  // Parent-level receipt: only show sub-docs once the END USER actually received it.
  const parentHasReceivedByEndUser = pLogs.some(isReceivedByEndUserLog)
  if (parentHasReceivedByEndUser) return true

  // Individual sub-doc return: sub-doc has its own "Transferred to END USER" log
  const wasTransferredToEndUser = sLogs.some((l) =>
    String(l?.label || "").trim().toLowerCase().startsWith("transferred to end user")
  )
  if (!wasTransferredToEndUser) return false

  // Sub-doc's own received-by-end-user log (fallback)
  return sLogs.some(isReceivedByEndUserLog)
}

type TransferTask = { taskId?: number; task?: string; duration?: string; status?: string }

type Props = {
  docs: DocumentRow[]
  expandedRows: Set<string>
  actionBusyId: string | null
  transferTasksByOffice: Record<string, TransferTask[]>
  onToggleRow: (id: string) => void
  onPreviewPR: (doc: DocumentRow) => void
  onPreviewOBR: (doc: DocumentRow) => void
  onPreviewDV?: (doc: DocumentRow) => void
  onPreviewPO?: (doc: DocumentRow) => void
  onRoutingSlip?: (doc: DocumentRow) => void
  onHistoryModal: (doc: DocumentRow) => void
  onEditDoc: (doc: DocumentRow) => void
  onEditMainSupplier: (doc: DocumentRow) => void
  onEditSubDoc: (parentDoc: DocumentRow, index: number, sub: NonNullable<DocumentRow["subDocuments"]>[number]) => void
  onCancelDoc: (doc: DocumentRow) => void
  onReprocessDoc: (doc: DocumentRow) => void
  onReprocessSubDoc: (parentDoc: DocumentRow, index: number, sub: any) => void
  onRequestReturnToApprovals?: (doc: DocumentRow) => void
  formatPeso: (raw: string) => string
  parseDurationToMs: (s: string) => number
  formatElapsedShort: (ms: number) => string
}

export default function OngoingTab({
  docs,
  expandedRows,
  actionBusyId,
  transferTasksByOffice,
  onToggleRow,
  onPreviewPR,
  onPreviewOBR,
  onPreviewDV,
  onPreviewPO,
  onRoutingSlip,
  onHistoryModal,
  onEditDoc,
  onEditMainSupplier,
  onEditSubDoc,
  onCancelDoc,
  onReprocessDoc,
  onReprocessSubDoc,
  onRequestReturnToApprovals,
  formatPeso,
  parseDurationToMs,
  formatElapsedShort,
}: Props) {
  const inferOfficeFromStatus = (statusRaw: string) => {
    const s = String(statusRaw || '').trim().toLowerCase()
    if (!s) return ''
    if (s === 'in-budget' || s.includes('budget')) return 'BUDGET'
    if (s === 'in-pto' || s.includes('pto') || s.includes('treasurer')) return 'PTO'
    if (s === 'pending-gso' || s.includes('gso')) return 'GSO'
    if (s === 'pending-bac' || s.includes('bac')) return 'BAC'
    if (s === 'returned') return 'END USER'
    return ''
  }

  const getLatestMovementFromLogs = (logs: any[] | undefined) => {
    const list = Array.isArray(logs) ? logs : []
    if (list.length === 0) return { kind: '', office: '' }

    const normalized = list
      .map((l, idx) => {
        const createdAtRaw = l?.createdAt
        const ts = createdAtRaw ? new Date(String(createdAtRaw)).getTime() : NaN
        return {
          label: String(l?.label || '').trim(),
          byOffice: String(l?.byOffice || '').trim(),
          ts: Number.isFinite(ts) ? ts : null,
          idx,
        }
      })
      .filter((x) => Boolean(x.label))

    if (normalized.length === 0) return { kind: '', office: '' }

    normalized.sort((a, b) => {
      const ta = a.ts
      const tb = b.ts
      if (ta != null && tb != null && ta !== tb) return tb - ta
      if (ta != null && tb == null) return -1
      if (ta == null && tb != null) return 1
      // fallback to original order: later items are newer
      return b.idx - a.idx
    })

    // Find the most recent *movement* log.
    // Some logs are informational (e.g. "Updated Sub-Document") and should NOT drive the current label.
    for (const it of normalized) {
      const label = it.label
      const labelLower = label.toLowerCase()
      const byOfficeUpper = String(it.byOffice || '').trim().toUpperCase()

      if (labelLower.includes('completed')) return { kind: 'completed', office: '' }
      if (labelLower.includes('returned')) return { kind: 'returned', office: 'END USER' }

      const mReceived = label.match(/received\s+by\s+([^(:]+?)(?:\(|:|$)/i)
      if (mReceived?.[1]) return { kind: 'received', office: String(mReceived[1]).trim().toUpperCase() }
      if (labelLower.startsWith('received by end user')) return { kind: 'received', office: 'END USER' }

      // Some labels are simply "Received" / "Received for ..."; fall back to byOffice.
      if (labelLower.startsWith('received') && byOfficeUpper) {
        return { kind: 'received', office: byOfficeUpper }
      }

      const mTransferred = label.match(/transferred\s+to\s+([^(:]+?)(?:\(|:|$)/i)
      if (mTransferred?.[1]) return { kind: 'transferred', office: String(mTransferred[1]).trim().toUpperCase() }
      if (labelLower.startsWith('transferred to end user')) return { kind: 'transferred', office: 'END USER' }
    }

    return { kind: '', office: '' }
  }

  const getSubDocActionLabel = (sub: any) => {
    const latest = getLatestMovementFromLogs(sub?.logs)
    if (latest.kind === 'completed') return 'Completed'
    if (latest.kind === 'returned') return 'Transferred to END USER'
    if (latest.kind === 'received' && latest.office) return `Received by ${latest.office}`
    if (latest.kind === 'transferred' && latest.office) return `Transferred to ${latest.office}`
    if (!latest.kind && latest.office) return `Transferred to ${latest.office}`

    const officeFromStatus = inferOfficeFromStatus(String(sub?.status || ''))
    return officeFromStatus ? `Transferred to ${officeFromStatus}` : 'Transferred'
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse border border-slate-200 [&_th]:border [&_th]:border-blue-700 [&_td]:border [&_td]:border-slate-200">
          <thead className="bg-blue-600 text-white">
            <tr className="border-b border-blue-700">
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Timestamp</th>
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Tracking #</th>
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Created By</th>
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Purpose</th>
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Documents</th>
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Amount</th>
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Supplier</th>
              {/* Ongoing tab: no Logs column */}
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.map((doc) => {
              const isExpanded = expandedRows.has(doc.id)
              const hasSubDocs = Array.isArray(doc.subDocuments) && doc.subDocuments.length > 0
              const docStatus = String(doc?.status || "").toLowerCase()

              const deadlineStatus = (() => {
                const logs = Array.isArray(doc.logs) ? [...(doc.logs as any[])].reverse() : []
                const latestMovementLog = logs.find((l) => {
                  const label = String(l?.label || "").toLowerCase()
                  return (
                    label.startsWith("received") || label.startsWith("transferred") || label.startsWith("approved") ||
                    label.startsWith("completed") || label.includes("returned") || label.startsWith("discontinued")
                  )
                })
                if (!latestMovementLog || !String(latestMovementLog.label || "").toLowerCase().startsWith("received")) {
                  return { isExceeded: false, elapsedText: "", taskFromLabel: "", officeOfTask: "" }
                }
                const officeOfTask = String(latestMovementLog.byOffice || "").toUpperCase()
                const label = String(latestMovementLog.label || "")
                const taskFromLabel =
                  (() => { const m = label.match(/received\s*(?:for\s*)?(.*)$/i); return String(m?.[1] || "").trim() })() ||
                  (() => { const match = label.match(/\(([^)]+)\)\s*$/); return match?.[1] ? String(match[1]).trim() : "" })()
                const startTime = new Date(String(latestMovementLog.createdAt)).getTime()
                const hasStartTime = Number.isFinite(startTime)
                const elapsedMs = hasStartTime ? Date.now() - startTime : 0
                const elapsedText = hasStartTime ? formatElapsedShort(elapsedMs) : ""
                if (officeOfTask && taskFromLabel) {
                  const officeTasks = transferTasksByOffice[officeOfTask] || []
                  const taskInfo = officeTasks.find((t) => String(t?.task || "").trim() === taskFromLabel)
                  if (taskInfo?.duration) {
                    const durationMs = parseDurationToMs(taskInfo.duration)
                    if (durationMs > 0 && hasStartTime) {
                      return { isExceeded: Date.now() > startTime + durationMs, elapsedText, taskFromLabel, officeOfTask }
                    }
                  }
                }
                return { isExceeded: false, elapsedText, taskFromLabel, officeOfTask }
              })()

              const rowClass = deadlineStatus.isExceeded ? "bg-rose-50" : ""
              const hasReprocessed = doc.logs.some((l) => String(l?.label || "").toLowerCase().includes("reprocess"))
              const allSubDocsTransferred =
                hasSubDocs &&
                Array.isArray(doc.subDocuments) &&
                doc.subDocuments.every((sub) => sub.status !== "returned" && sub.status !== "ongoing")
              const showActions =
                docStatus === "ongoing" && !hasReprocessed && (!hasSubDocs || allSubDocsTransferred)

              return (
                <Fragment key={doc.id}>
                  <tr
                    className={`hover:bg-slate-50 ${rowClass} ${hasSubDocs ? "cursor-pointer" : ""}`}
                    onClick={() => hasSubDocs && onToggleRow(doc.id)}
                  >
                    <td className="border-r border-slate-200 px-3 py-3 text-xs text-slate-600 whitespace-pre-line">{doc.timestamp}</td>
                    <td className="border-r border-slate-200 px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {hasSubDocs && (
                          <button type="button" className="rounded p-0.5 hover:bg-slate-200 transition-colors" onClick={(e) => { e.stopPropagation(); onToggleRow(doc.id) }}>
                            {isExpanded ? <ChevronDown className="size-3 text-slate-500" /> : <ChevronRight className="size-3 text-slate-500" />}
                          </button>
                        )}
                        <FileText className="size-3.5 text-slate-400" />
                        <div className={`truncate text-xs font-semibold ${deadlineStatus.isExceeded ? "text-rose-600" : "text-slate-900"}`} title={`${doc.trackingNo}${deadlineStatus.isExceeded ? " (EXCEEDED DEADLINE)" : ""}`}>
                          {doc.trackingNo}
                          {deadlineStatus.elapsedText && <span className="ml-1 text-[10px] opacity-60 font-normal">({deadlineStatus.elapsedText})</span>}
                          {deadlineStatus.isExceeded && <span className="ml-1 animate-pulse">⚠️</span>}
                        </div>
                      </div>
                    </td>
                    <td className="border-r border-slate-200 px-3 py-3 text-xs font-medium text-slate-900">{doc.createdBy}</td>
                    <td className="border-r border-slate-200 px-3 py-3 text-xs text-slate-600 max-w-xs">
                      <p className="line-clamp-3">{doc.purpose}</p>
                    </td>
                    <td className="border-r border-slate-200 px-3 py-3">
                      <div className="flex items-center gap-1 flex-nowrap overflow-x-auto">
                        {doc.particulars.map((p, idx) =>
                          p.label === "PR" ? (
                            <button key={idx} type="button" onClick={() => onPreviewPR(doc)} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${p.color} hover:opacity-90 focus:outline-none`}>{p.label}</button>
                          ) : p.label === "OBR" ? (
                            <button key={idx} type="button" onClick={() => onPreviewOBR(doc)} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${p.color} hover:opacity-90 focus:outline-none`}>{p.label}</button>
                          ) : (
                            <span key={idx} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${p.color}`}>{p.label}</span>
                          )
                        )}
                        {Boolean(getMainDocSupplierInfo(doc).supplier) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onPreviewDV?.(doc) }}
                            className="inline-flex items-center rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-purple-700 focus:outline-none shadow-sm transition"
                            title="Preview DV"
                          >
                            DV
                          </button>
                        )}
                        {/* <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onPreviewPO?.(doc) }}
                          className="inline-flex items-center rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-700 focus:outline-none shadow-sm transition"
                          title="Preview PO"
                        >
                          PO
                        </button> */}
                        {(() => {
                          const href = String(doc.driveLink || "").trim()
                          if (!href) return null
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                              title="Open link"
                            >
                              Link
                            </a>
                          )
                        })()}
                        {(doc.status === "completed" || doc.status === "approved" || doc.status === "in-budget" || doc.status === "in-pto" || doc.status === "pending-gso" || doc.status === "pending-bac" || doc.status === "ongoing" || doc.status === "returned") && (
                          (() => {
                            const hasRoutingSlip = Boolean(String(doc.gsoRoutingSlip || "").trim())
                            return (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onRoutingSlip?.(doc) }}
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap transition ${hasRoutingSlip ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-400 hover:bg-slate-500"}`}
                                title={hasRoutingSlip ? `Routing Slip: ${doc.gsoRoutingSlip}` : "No routing slip assigned yet"}
                              >
                                <Printer className="size-3" />
                                Routing Slip
                              </button>
                            )
                          })()
                        )}
                      </div>
                    </td>
                    <td className="border-r border-slate-200 px-3 py-3 text-xs font-medium text-slate-900">₱ {formatPeso(doc.amount)}</td>
                    <td className="border-r border-slate-200 px-3 py-3 text-xs font-medium text-slate-900 whitespace-normal wrap-break-word">
                      {(() => {
                        const { supplier, amount: amt } = getMainDocSupplierInfo(doc)
                        if (supplier) {
                          return amt ? `${supplier} - ₱ ${formatPeso(amt)}` : supplier
                        }
                        if (amt) {
                          return `₱ ${formatPeso(amt)}`
                        }
                        if (!hasSubDocs) return "-"
                        const filled = (doc.subDocuments || []).filter((s) => s.supplier && String(s.supplier).trim() !== "").length
                        return `${filled}/${(doc.subDocuments || []).length}`
                      })()}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-nowrap items-center gap-1 overflow-x-auto">
                        <button type="button" onClick={() => onHistoryModal(doc)} className="inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-amber-600">
                          <History className="size-3" />
                          History
                        </button>
                        <button
                          type="button"
                          disabled={doc.returnToApprovalsRequested || actionBusyId === doc.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            onRequestReturnToApprovals?.(doc)
                          }}
                          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition ${doc.returnToApprovalsRequested
                            ? 'bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed'
                            : 'bg-amber-600 text-white hover:bg-amber-700'
                            }`}
                          title={doc.returnToApprovalsRequested ? `Return requested: ${doc.returnToApprovalsReason || 'Pending Admin review'}` : 'Request to return this document back to Approvals'}
                        >
                          <RotateCcw className="size-3" />
                          {doc.returnToApprovalsRequested ? 'Return Requested' : 'Request Return'}
                        </button>
                        {docStatus === "ongoing" && !hasReprocessed && (
                          <>
                            <button type="button" onClick={() => onEditDoc(doc)} className="inline-flex items-center gap-1 rounded bg-sky-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-sky-700">Update</button>
                            <button
                              type="button"
                              disabled={hasSubDocs && !allSubDocsTransferred}
                              onClick={() => onEditMainSupplier(doc)}
                              className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                              title={hasSubDocs && !allSubDocsTransferred ? "Transfer all sub-documents to next office first" : ""}
                            >
                              Edit Details
                            </button>
                            <button
                              type="button"
                              disabled={actionBusyId === doc.id || (hasSubDocs && !allSubDocsTransferred)}
                              onClick={() => onReprocessDoc(doc)}
                              className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                              title={hasSubDocs && !allSubDocsTransferred ? "Transfer all sub-documents to next office first" : ""}
                            >
                              Reprocess
                            </button>
                            <button type="button" disabled={actionBusyId === doc.id} onClick={() => onCancelDoc(doc)} className="inline-flex items-center gap-1 rounded bg-rose-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {isExpanded && doc.subDocuments?.map((sub, sidx) => {
                    const subStatus = String(sub?.status || "").trim().toLowerCase()

                    const subReceived =
                      subStatus === "completed" ||
                      isSubDocReceivedByEndUser(sub.logs as any, doc.logs as any, doc.status)
                    if (!subReceived) return null

                    const previousSubDocs = (doc.subDocuments || []).slice(0, sidx)
                    const prevAllTransferred = previousSubDocs.every((prev) => {
                      const ps = String(prev?.status || "").trim().toLowerCase()
                      return ps !== "returned" && ps !== "ongoing"
                    })
                    const isLocked = !prevAllTransferred

                    return (
                      <tr
                        key={`${doc.id}-sub-${sidx}`}
                        className={subStatus === "completed" ? "bg-emerald-50" : "bg-slate-50/50"}
                      >
                        <td
                          className={
                            subStatus === "completed"
                              ? "border-r border-emerald-200 px-3 py-2 text-[10px] font-semibold text-emerald-700"
                              : "border-r border-slate-200 px-3 py-2 text-[10px] text-slate-400"
                          }
                        >
                          SUB-DOCUMENT ({sidx + 1})
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2">
                          <div className="flex items-center gap-2 pl-4">
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                            <span className="text-xs font-medium text-slate-700">{sub.trackingNo}</span>
                          </div>
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs text-slate-500 whitespace-nowrap">Same as parent</td>
                        <td
                          className="border-r border-slate-200 px-3 py-2 text-xs italic text-slate-600 whitespace-normal wrap-break-word"
                          title={String(sub.purpose || "")}
                        >
                          {sub.purpose}
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs text-slate-500">-</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">₱ {formatPeso(getSubDocAmount(doc, sidx))}</td>
                        <td
                          className="border-r border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 whitespace-normal wrap-break-word"
                          title={sub.supplier || ""}
                        >
                          {sub.supplier || "-"}
                        </td>
                        <td className="px-3 py-2 text-[10px] text-slate-400 italic">
                          {doc.status !== "approved" && doc.status !== "completed" && doc.status !== "discontinued" ? (
                            <div className="flex flex-wrap gap-1">
                              {subStatus === "completed" ? null : (
                                <button
                                  type="button"
                                  disabled={isLocked}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onEditSubDoc(doc, sidx, sub)
                                  }}
                                  className="inline-flex h-6 items-center rounded bg-emerald-600 px-2 text-[10px] font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                                  title={isLocked ? "Complete the previous sub-document first" : ""}
                                >
                                  Edit Details
                                </button>
                              )}

                              {sub.status === "returned" || sub.status === "ongoing" ? (
                                <button
                                  type="button"
                                  disabled={isLocked}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onReprocessSubDoc(doc, sidx, sub)
                                  }}
                                  className="inline-flex h-6 items-center rounded bg-sky-600 px-2 text-[10px] font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                                  title={isLocked ? "Complete the previous sub-document first" : ""}
                                >
                                  {isLocked ? "🔒 Locked" : "Transfer to Next Office"}
                                </button>
                              ) : (
                                <span
                                  className="inline-flex h-6 max-w-[200px] items-center truncate rounded border border-sky-200 bg-sky-100 px-2 text-[10px] font-medium text-sky-700"
                                  title={getSubDocActionLabel(sub)}
                                >
                                  {getSubDocActionLabel(sub)}
                                </span>
                              )}
                            </div>
                          ) : (
                            "Locked"
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
            {docs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">No documents found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}