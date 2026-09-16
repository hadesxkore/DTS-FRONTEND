import { Fragment } from "react"
import { FileText, History, ChevronDown, ChevronRight, Printer } from "lucide-react"
import { type DocumentRow, type DocumentLog, getSubDocAmount, getMainDocSupplierInfo } from "../../types/documentTypes"

type Props = {
  docs: DocumentRow[]
  expandedRows: Set<string>
  onToggleRow: (id: string) => void
  onPreviewPR: (doc: DocumentRow) => void
  onPreviewOBR: (doc: DocumentRow) => void
  onPreviewDV?: (doc: DocumentRow) => void
  onRoutingSlip?: (doc: DocumentRow) => void
  onHistoryModal: (doc: DocumentRow) => void
  onOpenLogsPreview: (doc: DocumentRow) => void
  formatPeso: (raw: string) => string
  formatLogLabelCompact: (log: DocumentLog) => string
}

export default function CompletedTab({
  docs,
  expandedRows,
  onToggleRow,
  onPreviewPR,
  onPreviewOBR,
  onPreviewDV,
  onRoutingSlip,
  onHistoryModal,
  onOpenLogsPreview,
  formatPeso,
  formatLogLabelCompact,
}: Props) {
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
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Logs</th>
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.map((doc) => {
              const isExpanded = expandedRows.has(doc.id)
              const hasSubDocs = Array.isArray(doc.subDocuments) && doc.subDocuments.length > 0

              return (
                <Fragment key={doc.id}>
                  <tr
                    className={`hover:bg-slate-50 ${hasSubDocs ? "cursor-pointer" : ""}`}
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
                        <div className="truncate text-xs font-semibold text-slate-900">{doc.trackingNo}</div>
                      </div>
                    </td>
                    <td className="border-r border-slate-200 px-3 py-3 text-xs font-medium text-slate-900">{doc.createdBy}</td>
                    <td className="border-r border-slate-200 px-3 py-3 text-xs text-slate-600 max-w-xs">
                      <p className="line-clamp-3">{doc.purpose}</p>
                    </td>
                    <td className="border-r border-slate-200 px-3 py-3">
                      <div className="flex flex-wrap gap-1">
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
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white transition ${hasRoutingSlip ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-400 hover:bg-slate-500"}`}
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
                      {/* Completed docs: view history only, no mutations */}
                      <button type="button" onClick={() => onHistoryModal(doc)} className="inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-amber-600">
                        <History className="size-3" />
                        History
                      </button>
                    </td>
                  </tr>

                  {isExpanded && doc.subDocuments?.map((sub, sidx) => {
                    const subDocRow: DocumentRow = {
                      ...doc,
                      trackingNo: sub.trackingNo,
                      purpose: sub.purpose,
                      amount: sub.amount,
                      supplier: sub.supplier,
                      status: sub.status,
                      logs: sub.logs,
                      subDocuments: [],
                    }

                    return (
                      <tr key={`${doc.id}-sub-${sidx}`} className="bg-emerald-50">
                        <td className="border-r border-emerald-200 px-3 py-2 text-[10px] font-semibold text-emerald-700">SUB-DOCUMENT ({sidx + 1})</td>
                        <td className="border-r border-slate-200 px-3 py-2">
                          <div className="flex items-center gap-2 pl-4">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span className="text-xs font-medium text-slate-700">{sub.trackingNo}</span>
                          </div>
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs text-slate-500 whitespace-nowrap">Same as parent</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs text-slate-600 italic">{sub.purpose}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs text-slate-500">-</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">₱ {formatPeso(getSubDocAmount(doc, sidx))}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-xs font-medium text-slate-700" title={sub.supplier || ""}>{sub.supplier || "-"}</td>
                        <td className="border-r border-slate-200 px-3 py-2">
                          <div className="flex flex-col gap-1">
                            {(sub.logs || []).slice(0, 3).map((log, lidx) => (
                              <span key={lidx} title={(sub.logs || []).map((l) => l.label).filter(Boolean).join("\n")} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium text-white ${log.color || "bg-sky-500"}`}>
                                {formatLogLabelCompact(log)}
                              </span>
                            ))}
                            {(sub.logs || []).length > 3 ? (
                              <button type="button" onClick={(e) => { e.stopPropagation(); onOpenLogsPreview(subDocRow) }} className="text-left text-[10px] font-medium text-slate-500 hover:text-slate-700">
                                +{(sub.logs || []).length - 3} more
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); onHistoryModal(subDocRow) }} className="inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-amber-600">
                            <History className="size-3" />
                            History
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
            {docs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">No documents found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
