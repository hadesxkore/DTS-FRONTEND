import { Fragment, useState } from "react"
import { FileText, History, ChevronDown, ChevronRight, Printer } from "lucide-react"
import { type DocumentRow, type DocumentParticular, type DocumentLog, getSubDocAmount, getMainDocSupplierInfo } from "../../types/documentTypes"

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
  onOpenLogsModal: (doc: DocumentRow) => void
  onOpenLogsPreview: (doc: DocumentRow) => void
  onEditDoc: (doc: DocumentRow) => void
  onCancelDoc: (doc: DocumentRow) => void
  onTransfer: (doc: DocumentRow) => void
  onRoutingSlip: (doc: DocumentRow) => void
  formatPeso: (raw: string) => string
  formatLogLabelCompact: (log: DocumentLog) => string
  hasTransferredLog: (doc: DocumentRow) => boolean
  hasApprovedByOffice: (doc: DocumentRow, office: string) => boolean
  parseDurationToMs: (s: string) => number
  formatElapsedShort: (ms: number) => string
}

const ROUTING_SLIP_OPTIONS = [
  "IT AND EQUIPMENT",
  "MEALS AND EVENTS",
  "GOODS & SERVICES",
  "REPAIR & MAINTENANCE OF MOTOR VEHICLES AND EQUIPMENT",
]

export default function PreValidationTab({
  docs,
  expandedRows,
  actionBusyId,
  transferTasksByOffice,
  onToggleRow,
  onPreviewPR,
  onPreviewOBR,
  onPreviewDV,
  onPreviewPO,
  onOpenLogsModal,
  onOpenLogsPreview,
  onEditDoc,
  onCancelDoc,
  onTransfer,
  onRoutingSlip,
  formatPeso,
  formatLogLabelCompact,
  hasTransferredLog,
  hasApprovedByOffice,
  parseDurationToMs,
  formatElapsedShort,
}: Props) {
  const handleOpenRoutingSlip = (doc: DocumentRow) => {
    onRoutingSlip(doc)
  }

  return (
    <>
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
                <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Source of Funds</th>
                <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Amount</th>
                <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Supplier</th>
                <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Logs</th>
                <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.map((doc) => {
                const isExpanded = expandedRows.has(doc.id)
                const hasSubDocs = Array.isArray(doc.subDocuments) && doc.subDocuments.length > 0

                // Deadline status computation
                const deadlineStatus = (() => {
                  const logs = Array.isArray(doc.logs) ? [...(doc.logs as any[])].reverse() : []
                  const latestMovementLog = logs.find((l) => {
                    const label = String(l?.label || "").toLowerCase()
                    return (
                      label.startsWith("received") ||
                      label.startsWith("transferred") ||
                      label.startsWith("approved") ||
                      label.startsWith("completed") ||
                      label.includes("returned") ||
                      label.startsWith("discontinued")
                    )
                  })
                  if (!latestMovementLog || !String(latestMovementLog.label || "").toLowerCase().startsWith("received")) {
                    return { isExceeded: false, elapsedText: "", taskFromLabel: "", officeOfTask: "" }
                  }
                  const officeOfTask = String(latestMovementLog.byOffice || "").toUpperCase()
                  const label = String(latestMovementLog.label || "")
                  const taskFromLabel =
                    (() => {
                      const m = label.match(/received\s*(?:for\s*)?(.*)$/i)
                      return String(m?.[1] || "").trim()
                    })() ||
                    (() => {
                      const match = label.match(/\(([^)]+)\)\s*$/)
                      return match?.[1] ? String(match[1]).trim() : ""
                    })()
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
                        const deadline = startTime + durationMs
                        return { isExceeded: Date.now() > deadline, elapsedText, taskFromLabel, officeOfTask }
                      }
                    }
                  }
                  return { isExceeded: false, elapsedText, taskFromLabel, officeOfTask }
                })()

                const rowClass = deadlineStatus.isExceeded ? "bg-rose-50" : ""

                const prEnabled = doc.particulars.some((p) => p.label === "PR")
                const obrEnabled = doc.particulars.some((p) => p.label === "OBR")
                const fundLower = String(doc.fund || "").trim().toLowerCase()
                const isTrustFund = Boolean(fundLower) && fundLower.includes("trust")
                const gsoApproved = hasApprovedByOffice(doc, "gso")
                const alreadyTransferred = hasTransferredLog(doc)

                const canTransferBudget =
                  !alreadyTransferred && !isTrustFund && obrEnabled && gsoApproved

                const canTransferPto =
                  !alreadyTransferred && gsoApproved && (isTrustFund || !obrEnabled)

                const hasRoutingSlip = Boolean(String(doc.gsoRoutingSlip || "").trim())

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
                            <button
                              type="button"
                              className="rounded p-0.5 hover:bg-slate-200 transition-colors"
                              onClick={(e) => { e.stopPropagation(); onToggleRow(doc.id) }}
                            >
                              {isExpanded ? <ChevronDown className="size-3 text-slate-500" /> : <ChevronRight className="size-3 text-slate-500" />}
                            </button>
                          )}
                          <FileText className="size-3.5 text-slate-400" />
                          <div
                            className={`truncate text-xs font-semibold ${deadlineStatus.isExceeded ? "text-rose-600" : "text-slate-900"}`}
                            title={`${doc.trackingNo}${deadlineStatus.isExceeded ? " (EXCEEDED DEADLINE)" : ""}${deadlineStatus.taskFromLabel ? ` - Task: ${deadlineStatus.taskFromLabel} at ${deadlineStatus.officeOfTask}` : ""}`}
                          >
                            {doc.trackingNo}
                            {deadlineStatus.elapsedText && (
                              <span className="ml-1 text-[10px] opacity-60 font-normal">({deadlineStatus.elapsedText})</span>
                            )}
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
                          {doc.particulars.map((p: DocumentParticular, idx: number) =>
                            p.label === "PR" ? (
                              <button key={idx} type="button" onClick={() => onPreviewPR(doc)} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${p.color} hover:opacity-90 focus:outline-none`} title="Preview PR">{p.label}</button>
                            ) : p.label === "OBR" ? (
                              <button key={idx} type="button" onClick={() => onPreviewOBR(doc)} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${p.color} hover:opacity-90 focus:outline-none`} title="Preview OBR">{p.label}</button>
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
                          {/* Routing Slip button in particulars column */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleOpenRoutingSlip(doc) }}
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap transition ${hasRoutingSlip ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-400 hover:bg-slate-500"}`}
                            title={hasRoutingSlip ? `Routing Slip: ${doc.gsoRoutingSlip}` : "No routing slip assigned yet"}
                          >
                            <Printer className="size-3" />
                            Routing Slip
                          </button>
                        </div>
                      </td>
                      <td className="border-r border-slate-200 px-3 py-3 text-xs text-slate-700">
                        {String(doc.fund || "").trim() || <span className="text-slate-400">—</span>}
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
                          const total = (doc.subDocuments || []).length
                          return `${filled}/${total}`
                        })()}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-3">
                        <div className="flex flex-col gap-1">
                          {doc.logs.slice(0, 3).map((log: DocumentLog, idx: number) => (
                            <span key={idx} title={doc.logs.map((l) => l.label).filter(Boolean).join("\n")} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${log.color}`}>
                              {formatLogLabelCompact(log)}
                            </span>
                          ))}
                          {doc.logs.length > 3 ? (
                            <button type="button" onClick={() => onOpenLogsPreview(doc)} className="text-left text-[10px] font-medium text-slate-500 hover:text-slate-700">
                              +{doc.logs.length - 3} more
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {(canTransferBudget || canTransferPto) && (
                            <button type="button" disabled={actionBusyId === doc.id} onClick={() => onTransfer(doc)} className="inline-flex items-center gap-1 rounded bg-sky-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
                              Transfer
                            </button>
                          )}
                          <button type="button" onClick={() => onOpenLogsModal(doc)} className="inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-amber-600">
                            <History className="size-3" />
                            Review Logs
                          </button>
                          {!alreadyTransferred && (
                            <button type="button" onClick={() => onEditDoc(doc)} className="inline-flex items-center gap-1 rounded bg-sky-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-sky-700">
                              Update
                            </button>
                          )}
                          {!alreadyTransferred && !hasApprovedByOffice(doc, "gso") && (
                            <button type="button" disabled={actionBusyId === doc.id} onClick={() => onCancelDoc(doc)} className="inline-flex items-center gap-1 rounded bg-rose-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Sub-document rows */}
                    {isExpanded && doc.subDocuments?.map((sub, sidx) => (
                      <tr
                        key={`${doc.id}-sub-${sidx}`}
                        className={String(sub?.status || "").trim().toLowerCase() === "completed" ? "bg-emerald-50" : "bg-slate-50/50"}
                      >
                        <td className={String(sub?.status || "").trim().toLowerCase() === "completed" ? "border-r border-emerald-200 px-3 py-2 text-[10px] font-semibold text-emerald-700" : "border-r border-slate-200 px-3 py-2 text-[10px] text-slate-400"}>
                          SUB-DOCUMENT ({sidx + 1})
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2">
                          <div className="flex items-center gap-2 pl-4">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            <span className="text-xs font-medium text-slate-700">{sub.trackingNo}</span>
                          </div>
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs text-slate-500 whitespace-nowrap">Same as parent</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs text-slate-600 italic">{sub.purpose}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs text-slate-500">-</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">₱ {formatPeso(getSubDocAmount(doc, sidx))}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 whitespace-normal wrap-break-word" title={sub.supplier || ""}>{sub.supplier || "-"}</td>
                        <td className="border-r border-slate-200 px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {(sub.logs || []).slice(0, 1).map((log, lidx) => (
                              <span key={lidx} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium text-white ${log.color || "bg-sky-500"}`}>{log.label}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[10px] text-slate-400 italic">
                          <span className="text-slate-400">—</span>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
              {docs.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-500">No documents found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Redundant Routing Slip Modal removed - handled by parent */}
    </>
  )
}