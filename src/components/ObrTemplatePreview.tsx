import Barcode from "react-barcode"

export type ObrTemplateModel = {
  payee: string
  office: string
  address: string
  obrNo: string
  trackingNo?: string
  fund?: string
  date?: string
  responsibilityCenter?: string
  particulars?: string
  notes?: string
  fpp?: string
  accountCode?: string
  amount?: string
  preparedByName?: string
  certifiedAName: string
  certifiedAPosition: string
  certifiedBName: string
  certifiedBPosition: string
  status?: string
  logs?: Array<{ label?: string; byOffice?: string;[key: string]: any }>
  hasPr?: boolean
  hasObr?: boolean
}



function shouldShowBarcode(model: ObrTemplateModel): boolean {
  const logs = Array.isArray(model.logs) ? model.logs : []
  const statusLower = String(model.status || '').trim().toLowerCase()

  // Always show once the document has reached Budget or PTO (admin approval path)
  if (statusLower === 'in-budget' || statusLower === 'in-pto') return true

  // Also show if any log indicates a transfer to Budget or PTO (covers legacy labels too)
  const hasTransferToBudgetOrPto = logs.some((l) => {
    const label = String(l?.label || '').trim().toLowerCase()
    return (
      label.includes('transferred to budget') ||
      label.includes('transferred to pto') ||
      // legacy: "Approved: Transferred to Budget (...)"
      /approved[:\s]+transferred\s+to\s+(budget|pto)/i.test(label)
    )
  })
  if (hasTransferToBudgetOrPto) return true

  // Helper to check if an office has approved
  const hasApproved = (officeNeedle: string) => {
    const needle = officeNeedle.toLowerCase()
    return logs.some((l) => {
      const label = String(l?.label || '').trim().toLowerCase()
      const byOffice = String(l?.byOffice || '').trim().toLowerCase()
      if (!label.startsWith('approved')) return false
      return byOffice.includes(needle) || label.includes(needle)
    })
  }

  // OBR only: need BAC approval
  if (model.hasObr && !model.hasPr) {
    return hasApproved('bac')
  }

  // PR only or PR+OBR: need both GSO and BAC approval
  if (model.hasPr) {
    return hasApproved('gso') && hasApproved('bac')
  }

  // Default: show if document is approved/completed
  return statusLower === 'approved' || statusLower === 'completed'
}


type ObrTemplatePreviewProps = {
  model: ObrTemplateModel
  className?: string
}

export default function ObrTemplatePreview({ model, className }: ObrTemplatePreviewProps) {
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

  const computeTotalFromAmount = (rawAmount: string) => {
    const text = String(rawAmount || '').trim()
    if (!text) return ''
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length <= 1) return text
    const sum = lines.reduce((acc, line) => acc + parseMoney(line), 0)
    if (!Number.isFinite(sum)) return text
    return `₱ ${formatMoney(sum)}`
  }

  const totalAmountText = computeTotalFromAmount(model.amount || '')

  const obrPrefix = model.fund === "SEF" ? "200-26-" : "100-26-"
  const obrRaw = String(model.obrNo || "").trim().replace(/^No\.?\s*/i, "")
  let obrSuffix = obrRaw
  if (obrSuffix.startsWith("100-26-")) {
    obrSuffix = obrSuffix.slice("100-26-".length).trim()
  } else if (obrSuffix.startsWith("200-26-")) {
    obrSuffix = obrSuffix.slice("200-26-".length).trim()
  }

  return (
    <div className={className}>
      <div className="print-page bg-white relative w-[816px] h-[1056px] overflow-hidden mx-auto p-3 print-no-mt">
        <div className="h-full w-full text-[14px] text-black">
          <div
            className="relative h-full border-[3px] border-black flex flex-col px-3 py-2.5"
            style={{ fontFamily: "Arial, sans-serif" }}
          >
            {/* Header: logos + title + barcode */}
            <div className="relative grid grid-cols-[80px_1fr_80px] items-center pt-2 shrink-0 pb-1">
              <div className="flex justify-center">
                <img src="/images/bataan-seal.png" alt="Bataan" className="h-16 w-16 object-contain ml-2" />
              </div>
              <div className="text-center flex flex-col items-center gap-0.5">
                <div className="text-[15px] font-normal leading-tight">Republic of the Philippines</div>
                <div className="text-[20px] font-extrabold leading-tight tracking-wide">PROVINCIAL GOVERNMENT OF BATAAN</div>
                <div className="text-[12px] font-normal leading-tight">
                  The Bunker @ The Capitol Compound, Tenejero, Balanga City, Bataan 2100
                </div>
              </div>
              <div className="flex justify-center">
                <img src="/images/1bataan-logo.png" alt="1Bataan" className="h-16 w-16 object-contain mr-2" />
              </div>

              {shouldShowBarcode(model) ? (
                <div className="absolute top-0.5 right-[80px]" style={{ lineHeight: 0 }}>
                  <Barcode
                    value={String(model.trackingNo || '').trim()}
                    format="CODE128"
                    width={0.6}
                    height={14}
                    displayValue={true}
                    fontSize={7}
                    margin={0}
                  />
                </div>
              ) : null}
            </div>

            {/* Main OBR Box Container */}
            <div className="mt-1 border border-black flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 flex flex-col">
                {/* Title and OBR No */}
                <div className="grid grid-cols-[1fr_220px] h-9 border-b-2 border-black">
                  <div className="flex items-center justify-center font-bold text-[20px] tracking-wide uppercase text-black">
                    OBLIGATION REQUEST
                  </div>
                  <div className="flex items-center px-3 text-[17px] border-l-2 border-black font-semibold text-black">
                    <span>No. {obrPrefix}</span>
                    {obrSuffix ? (
                      <span className="text-blue-600 font-bold ml-1.5">{obrSuffix}</span>
                    ) : null}
                  </div>
                </div>

                {/* Payee, Office, Address */}
                <div className="grid grid-cols-[120px_1fr] h-9 border-b border-black">
                  <div className="border-r border-black px-3 flex items-center justify-center font-bold text-[14px] leading-none">Payee</div>
                  <div className="px-3 flex items-center text-[14px] font-semibold leading-none">{model.payee || ""}</div>
                </div>
                <div className="grid grid-cols-[120px_1fr] h-9 border-b border-black">
                  <div className="border-r border-black px-3 flex items-center justify-center font-bold text-[14px] leading-none">Office</div>
                  <div className="px-3 flex items-center text-[14px] font-semibold leading-none">{model.office || "N/A"}</div>
                </div>
                <div className="grid grid-cols-[120px_1fr] h-9 border-b-2 border-black">
                  <div className="border-r border-black px-3 flex items-center justify-center font-bold text-[14px] leading-none">Address</div>
                  <div className="px-3 flex items-center text-[14px] font-semibold leading-none">{model.address || "N/A"}</div>
                </div>

                {/* Table Header Row */}
                <div className="grid grid-cols-[120px_1fr_80px_120px_110px] h-10 border-b-2 border-black text-center font-bold">
                  <div className="border-r border-black px-1 flex items-center justify-center text-[11px] leading-tight text-center">
                    Responsibility<br />Center
                  </div>
                  <div className="border-r border-black flex items-center justify-center text-[15px] uppercase leading-none">PARTICULARS</div>
                  <div className="border-r border-black flex items-center justify-center text-[13px] leading-none">FPP</div>
                  <div className="border-r border-black flex items-center justify-center text-[13px] leading-none">Account Code</div>
                  <div className="flex items-center justify-center text-[13px] leading-none">Amount</div>
                </div>

                {/* Table Body */}
                <div className="grid grid-cols-[120px_1fr_80px_120px_110px] flex-1 border-b-2 border-black min-h-[290px]">
                  <div className="border-r border-black p-2 flex items-start justify-center text-[14px] text-center pt-2">
                    {model.responsibilityCenter || ""}
                  </div>
                  <div className="border-r border-black p-2 flex items-start text-[14px] whitespace-pre-wrap wrap-break-word pt-2">
                    {model.particulars || ""}{model.notes ? `\n\n${model.notes}` : ""}
                  </div>
                  <div className="border-r border-black p-2 flex items-start justify-center text-[14px] text-center pt-2">
                    {model.fpp || ""}
                  </div>
                  <div className="border-r border-black p-2 flex items-start justify-center text-[14px] text-center pt-2">
                    {model.accountCode || ""}
                  </div>
                  <div className="p-2 flex items-start justify-center text-[14px] whitespace-pre-wrap wrap-break-word tabular-nums text-center pt-2">
                    {model.amount || ""}
                  </div>
                </div>

                {/* Total Row */}
                <div className="grid grid-cols-[120px_1fr_80px_120px_110px] h-8 border-b-2 border-black">
                  <div className="col-span-3" />
                  <div className="border-r border-black flex items-center justify-end px-2 font-bold text-[14px] leading-none">
                    Total
                  </div>
                  <div className="p-1 text-[14px] font-bold tabular-nums text-center flex items-center justify-center whitespace-nowrap leading-none">
                    {totalAmountText}
                  </div>
                </div>

                {/* Certification Section (Box A & Box B) */}
                <div className="grid grid-cols-2 border-b-2 border-black min-h-[110px]">
                  {/* Box A */}
                  <div className="border-r-2 border-black p-2.5 flex flex-col justify-between pb-3">
                    <div className="flex items-center gap-2">
                      <div className="border-2 border-black w-6 h-6 flex items-center justify-center text-[13px] font-bold shrink-0 leading-none">
                        A.
                      </div>
                      <div className="font-bold text-[15px] leading-none">Certified</div>
                    </div>

                    <div className="mt-2 space-y-2 text-[12px] leading-snug pl-8">
                      <div className="flex items-start gap-2.5">
                        <div className="border border-black w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 bg-white">
                          <svg className="w-3 h-3 text-black stroke-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        <div>Charges to appropriation/allotment necessary,lawful and under my direct supervision.</div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="border border-black w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 bg-white">
                          <svg className="w-3 h-3 text-black stroke-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        <div>Supporting documents valid, proper and legal.</div>
                      </div>
                    </div>
                  </div>

                  {/* Box B */}
                  <div className="p-2.5 flex flex-col justify-start pb-3">
                    <div className="flex items-center gap-2">
                      <div className="border-2 border-black w-6 h-6 flex items-center justify-center text-[13px] font-bold shrink-0 leading-none">
                        B.
                      </div>
                      <div className="font-bold text-[15px] leading-none">Certified</div>
                    </div>

                    <div className="mt-3.5 pl-8 text-[12px] leading-snug">
                      <div>Existence of available appropriation.</div>
                    </div>
                  </div>
                </div>

                {/* Signatures Section Grid */}
                <div className="flex flex-col">
                  {/* Signature row */}
                  <div className="grid grid-cols-[110px_1fr_110px_1fr] h-12 border-b border-black">
                    <div className="px-2 flex items-center border-r border-black text-[13px] font-normal leading-none">Signature:</div>
                    <div className="border-r-2 border-black" />
                    <div className="px-2 flex items-center border-r border-black text-[13px] font-normal leading-none">Signature:</div>
                    <div />
                  </div>

                  {/* Printed Name row */}
                  <div className="grid grid-cols-[110px_1fr_110px_1fr] h-10 border-b border-black">
                    <div className="px-2 flex items-center border-r border-black text-[13px] font-normal leading-none">Printed Name:</div>
                    <div className="px-2 flex items-center justify-center text-center text-[15px] font-bold border-r-2 border-black uppercase tracking-wide leading-none">
                      {model.certifiedAName}
                    </div>
                    <div className="px-2 flex items-center border-r border-black text-[13px] font-normal leading-none">Printed Name:</div>
                    <div className="px-2 flex items-center justify-center text-center text-[15px] font-bold uppercase tracking-wide leading-none">
                      {model.certifiedBName}
                    </div>
                  </div>

                  {/* Position row */}
                  <div className="grid grid-cols-[110px_1fr_110px_1fr] min-h-[60px] border-b border-black">
                    <div className="px-2 py-2 flex items-center border-r border-black text-[13px] font-normal leading-none">Position:</div>
                    <div className="px-2 py-2 flex flex-col items-center justify-center text-center border-r-2 border-black">
                      <div className="text-[14px] font-bold uppercase leading-tight">
                        {model.certifiedAPosition}
                      </div>
                      <div className="text-[11px] leading-tight text-slate-700 mt-1">
                        Head Requesting Office/Authorized Representative
                      </div>
                    </div>
                    <div className="px-2 py-2 flex items-center border-r border-black text-[13px] font-normal leading-none">Position:</div>
                    <div className="px-2 py-2 flex flex-col items-center justify-center text-center">
                      <div className="text-[14px] font-bold leading-tight">
                        {model.certifiedBPosition}
                      </div>
                      <div className="text-[11px] leading-tight text-slate-700 mt-1">
                        Head, Budget Unit/Authorized Representative
                      </div>
                    </div>
                  </div>

                  {/* Date row */}
                  <div className="grid grid-cols-[110px_1fr_110px_1fr] h-8">
                    <div className="px-2 flex items-center border-r border-black text-[13px] font-normal leading-none">Date:</div>
                    <div className="border-r-2 border-black" />
                    <div className="px-2 flex items-center border-r border-black text-[13px] font-normal leading-none">Date:</div>
                    <div />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Footer Subtext */}
            <div className="mt-1 flex items-center justify-end font-sans text-[11px] text-black pr-2">
              <div>
                Prepared by: {model.preparedByName ? <span className="underline font-semibold">{model.preparedByName}</span> : "____________________"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
