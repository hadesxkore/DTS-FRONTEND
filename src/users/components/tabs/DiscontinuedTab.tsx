import type { DocumentRow, DocumentLog } from "../../types/documentTypes"
import { getMainDocSupplierInfo } from "../../types/documentTypes"

type Props = {
  docs: DocumentRow[]
  onOpenLogsPreview: (doc: DocumentRow) => void
  formatPeso: (raw: string) => string
  formatLogLabelCompact: (log: DocumentLog) => string
  getReturnedTimestamp: (doc: DocumentRow) => string
}

export default function DiscontinuedTab({
  docs,
  onOpenLogsPreview,
  formatPeso,
  formatLogLabelCompact,
  getReturnedTimestamp,
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
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Discontinued At</th>
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Logs</th>
              <th className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-wider text-white">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.map((doc) => {
              const hasSubDocs = Array.isArray(doc.subDocuments) && doc.subDocuments.length > 0

              return (
                <tr key={doc.id} className="hover:bg-slate-50 opacity-80">
                  <td className="border-r border-slate-200 px-3 py-3 text-xs text-slate-600 whitespace-pre-line">{doc.timestamp}</td>
                  <td className="border-r border-slate-200 px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="text-xs font-semibold text-slate-500 line-through">{doc.trackingNo}</div>
                    </div>
                  </td>
                  <td className="border-r border-slate-200 px-3 py-3 text-xs font-medium text-slate-600">{doc.createdBy}</td>
                  <td className="border-r border-slate-200 px-3 py-3 text-xs text-slate-500 max-w-xs">
                    <p className="line-clamp-3">{doc.purpose}</p>
                  </td>
                  <td className="border-r border-slate-200 px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {doc.particulars.map((p, idx) => (
                        <span key={idx} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white opacity-60 ${p.color}`}>{p.label}</span>
                      ))}
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
                    </div>
                  </td>
                  <td className="border-r border-slate-200 px-3 py-3 text-xs font-medium text-slate-600">₱ {formatPeso(doc.amount)}</td>
                  <td className="border-r border-slate-200 px-3 py-3 text-xs font-medium text-slate-600 whitespace-normal wrap-break-word">
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
                  <td className="border-r border-slate-200 px-3 py-3 text-xs text-slate-500">{getReturnedTimestamp(doc)}</td>
                  <td className="border-r border-slate-200 px-3 py-3">
                    <div className="flex flex-col gap-1">
                      {doc.logs.slice(0, 3).map((log: DocumentLog, idx: number) => (
                        <span key={idx} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white opacity-80 ${log.color}`}>
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
                    <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-semibold text-rose-700">
                      Discontinued
                    </span>
                  </td>
                </tr>
              )
            })}
            {docs.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-500">No discontinued documents.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
