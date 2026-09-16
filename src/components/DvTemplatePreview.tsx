export type DvTemplateModel = {
  /** Top-right fields */
  fund?: string
  dvNo?: string
  date?: string

  /** Payee section */
  payee?: string
  address?: string
  idNoTin?: string
  obrNo?: string
  responsibilityCenter?: string

  /** Particulars / amount */
  particulars?: string
  amount?: string
  amountDue?: string

  /** Section A */
  certifiedAName?: string
  certifiedAPosition?: string

  /** Section B */
  certifiedBName?: string
  certifiedBPosition?: string

  /** Section C */
  certifiedCName?: string
  certifiedCPosition?: string

  /** Section D */
  approvedForPaymentName?: string
  approvedForPaymentPosition?: string

  /** Section F */
  preparedByName?: string
  certifiedCorrectName?: string
  certifiedCorrectPosition?: string

  /** General status & tracking */
  trackingNo?: string
  status?: string
  logs?: Array<{ label?: string; byOffice?: string; [key: string]: any }>
  hasPr?: boolean
  hasObr?: boolean
}

type DvTemplatePreviewProps = {
  model: DvTemplateModel
  className?: string
}

function SectionBadge({ letter }: { letter: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      className="inline-block shrink-0"
      style={{
        width: "15px",
        height: "15px",
        verticalAlign: "middle",
        marginRight: "5px",
        display: "inline-block",
      }}
    >
      <rect
        x="0.5"
        y="0.5"
        width="14"
        height="14"
        fill="#ffffff"
        stroke="#000000"
        strokeWidth="1"
      />
      <text
        x="7.5"
        y="10.5"
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="bold"
        fontFamily="Arial, Helvetica, sans-serif"
        fill="#000000"
      >
        {letter}
      </text>
    </svg>
  )
}

export default function DvTemplatePreview({ model, className }: DvTemplatePreviewProps) {
  const payeeText = model.payee || ""
  const addressText = model.address || ""
  const particularsText = model.particulars || ""
  const amountText = model.amount || ""
  const amountDueText = model.amountDue || model.amount || ""

  const certAName = model.certifiedAName || "JOSE ENRIQUE S. GARCIA III"
  const certAPos = model.certifiedAPosition || "Provincial Governor"

  const certBName = model.certifiedBName || "EDUARDO D. BANZON"
  const certBPos = model.certifiedBPosition || "Provincial Budget Officer"

  const certCName = model.certifiedCName || "ALICIA R. MAGPANTAY"
  const certCPos = model.certifiedCPosition || "Provincial Treasurer"

  const appName = model.approvedForPaymentName || "MA. CRISTINA M. GARCIA"
  const appPos = model.approvedForPaymentPosition || "Acting - Provincial Governor"

  const certCorrectName = model.certifiedCorrectName || "MYRNA B. ROMAN"
  const certCorrectPos = model.certifiedCorrectPosition || "Acting Provincial Accountant"

  return (
    <div className={className}>
      <div
        className="print-page bg-white relative w-[816px] h-[1056px] overflow-hidden mx-auto p-3.5 print-no-mt text-black shadow-lg border border-[#cbd5e1] print:shadow-none print:border-none select-none box-border flex flex-col justify-between"
        style={{ fontFamily: "'Times New Roman', Times, Georgia, serif" }}
      >
        {/* Continuous Printable Box with crisp 2px border matching Short Bond exactly */}
        <div className="w-full h-full border-2 border-black flex flex-col justify-between box-border overflow-hidden bg-white text-black">
          
          {/* Top Section */}
          <div className="shrink-0 flex flex-col">
            {/* 1. Header row */}
            <div className="grid grid-cols-[1fr_220px] border-b-2 border-black">
              {/* Left Header Box (Logos + Titles) */}
              <div className="p-3">
                <table className="w-full border-collapse">
                  <tbody>
                    <tr>
                      <td className="w-[60px] align-middle text-left p-1">
                        <img
                          src="/images/bataan-seal.png"
                          alt="Provincial Seal"
                          className="h-14 w-14 object-contain inline-block"
                        />
                      </td>
                      <td className="align-middle text-center px-2">
                        <div className="text-[17px] font-bold tracking-wider uppercase leading-tight">
                          DISBURSEMENT VOUCHER
                        </div>
                        <div className="text-[12.5px] font-bold leading-tight mt-1">
                          Provincial Government of Bataan
                        </div>
                        <div className="text-[11px] italic leading-tight text-slate-700 mt-0.5">
                          LGU
                        </div>
                      </td>
                      <td className="w-[60px] align-middle text-right p-1">
                        <img
                          src="/images/1bataan-logo.png"
                          alt="1Bataan"
                          className="h-12 w-12 object-contain inline-block"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Right Header Box (Fund, DV No, Date) */}
              <div className="border-l-2 border-black p-2.5 text-[11px]">
                <table className="w-full border-collapse">
                  <tbody>
                    <tr>
                      <td className="w-[50px] font-normal text-slate-700 pb-1.5 pt-0.5 align-middle whitespace-nowrap">Fund:</td>
                      <td className="font-bold text-black pb-1.5 pt-0.5 align-middle break-words">{model.fund || "General Fund"}</td>
                    </tr>
                    <tr>
                      <td className="w-[50px] font-normal text-slate-700 py-1 align-middle whitespace-nowrap">DV No.:</td>
                      <td className="font-bold text-black font-mono py-1 align-middle">{model.dvNo || "\u00A0"}</td>
                    </tr>
                    <tr>
                      <td className="w-[50px] font-normal text-slate-700 pt-1 pb-0.5 align-middle whitespace-nowrap">Date:</td>
                      <td className="font-bold text-black pt-1 pb-0.5 align-middle">{model.date || "\u00A0"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. Blank separator band */}
            <div className="h-[7px] border-b-2 border-black bg-white shrink-0" />

            {/* 3. Payee / Address & OBR / TIN Section */}
            <div className="grid grid-cols-[1fr_220px] border-b-2 border-black">
              {/* Payee & Address */}
              <div className="p-2.5 text-[11px]">
                <table className="w-full border-collapse">
                  <tbody>
                    <tr>
                      <td className="w-[65px] font-normal text-slate-700 pb-1.5 pt-0.5 align-middle whitespace-nowrap">Payee:</td>
                      <td className="font-bold text-[12px] uppercase tracking-wide break-words pb-1.5 pt-0.5 align-middle">{payeeText || "\u00A0"}</td>
                    </tr>
                    <tr>
                      <td className="w-[65px] font-normal text-slate-700 pt-1 pb-0.5 align-middle whitespace-nowrap">Address:</td>
                      <td className="font-bold text-[11.5px] uppercase tracking-wide break-words pt-1 pb-0.5 align-middle">{addressText || "\u00A0"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ID No, OBR No, Responsibility Center */}
              <div className="border-l-2 border-black p-2.5 text-[10.5px]">
                <table className="w-full border-collapse leading-tight">
                  <tbody>
                    <tr>
                      <td className="w-[125px] font-normal text-slate-700 pb-1 align-middle whitespace-nowrap">ID No./TIN:</td>
                      <td className="font-bold text-black pb-1 align-middle text-right">{model.idNoTin || "\u00A0"}</td>
                    </tr>
                    <tr>
                      <td className="w-[125px] font-normal text-slate-700 py-0.5 align-middle whitespace-nowrap">OBR No.:</td>
                      <td className="font-bold text-black font-mono py-0.5 align-middle text-right">{model.obrNo || "\u00A0"}</td>
                    </tr>
                    <tr>
                      <td className="w-[125px] font-normal text-slate-700 pt-1 align-middle whitespace-nowrap">Responsibility Center:</td>
                      <td className="font-bold text-black pt-1 align-middle text-right">{model.responsibilityCenter || "\u00A0"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 4. Particulars & Amount Section (Continuous full-height table without overflow) */}
          <div className="flex-1 flex flex-col min-h-0 border-b-2 border-black overflow-hidden relative bg-white">
            <table className="w-full h-full border-collapse table-fixed text-[11px]">
              <colgroup>
                <col style={{ width: "auto" }} />
                <col style={{ width: "220px" }} />
              </colgroup>
              <thead>
                <tr className="border-b-2 border-black font-bold text-center bg-[#f1f5f9] text-[11.5px]">
                  <th className="border-r-2 border-black py-2 px-3 align-middle font-bold text-center">
                    Particulars
                  </th>
                  <th className="py-2 px-3 align-middle font-bold text-center">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Row 1 with dynamic item particulars */}
                <tr className="border-b border-[#cbd5e1] min-h-[36px]">
                  <td className="border-r-2 border-black px-3.5 py-2 text-[11px] font-normal leading-relaxed break-words whitespace-pre-wrap align-top">
                    {particularsText || "\u00A0"}
                  </td>
                  <td className="px-3.5 py-2 text-right text-[11.5px] font-bold tabular-nums align-top">
                    {amountText || "\u00A0"}
                  </td>
                </tr>

                {/* Empty ledger rows that fill the height evenly */}
                {Array.from({ length: 9 }).map((_, idx) => (
                  <tr key={`empty-row-${idx}`} className="border-b border-[#cbd5e1]">
                    <td className="border-r-2 border-black px-3 py-1 align-top">&nbsp;</td>
                    <td className="px-3 py-1 align-top">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {/* Amount Due / Total Row anchored as tfoot */}
                <tr className="border-t-2 border-black text-[12px] bg-[#f8fafc] font-bold">
                  <td className="border-r-2 border-black text-right pr-6 py-2 font-bold uppercase tracking-wider text-[11px] align-middle">
                    AMOUNT DUE
                  </td>
                  <td className="text-right pr-3.5 py-2 font-bold tabular-nums text-[12px] align-middle">
                    {amountDueText || "\u00A0"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Bottom Section: Certifications, Payment, Accounting Entries */}
          <div className="shrink-0 flex flex-col relative bg-white">
            {/* 5. Certifications Section A, B, C */}
            <div className="grid grid-cols-3 border-b-2 border-black shrink-0 relative bg-white">
              {/* Box A */}
              <div className="border-r-2 border-black p-3.5 pt-3 flex flex-col justify-between min-h-[145px]">
                <div>
                  <div className="flex items-center mb-2">
                    <SectionBadge letter="A" />
                    <span className="font-bold text-[11px] leading-normal">
                      Certified:
                    </span>
                  </div>
                  <div className="text-[9.5px] leading-snug text-slate-800">
                    Expenses/Cash Advances necessary, valid, proper, lawful and incurred under my
                    direct supervision.
                  </div>
                </div>
                <div className="mt-3">
                  <table className="w-[88%] mx-auto border-collapse text-center">
                    <tbody>
                      <tr>
                        <td className="border-b border-black font-bold uppercase text-[10.5px] tracking-wide pb-1 align-bottom">
                          {certAName}
                        </td>
                      </tr>
                      <tr>
                        <td className="text-[9px] text-slate-700 pt-1">
                          {certAPos}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Box B */}
              <div className="border-r-2 border-black p-3.5 pt-3 flex flex-col justify-between min-h-[145px]">
                <div>
                  <div className="flex items-center mb-2">
                    <SectionBadge letter="B" />
                    <span className="font-bold text-[11px] leading-normal">
                      Certified:
                    </span>
                  </div>
                  <div className="text-[9.5px] leading-snug text-slate-800">
                    Completeness and propriety of supporting documents/previous cash advance
                    liquidated/existence of funds held in trust.
                  </div>
                </div>
                <div className="mt-3">
                  <table className="w-[88%] mx-auto border-collapse text-center">
                    <tbody>
                      <tr>
                        <td className="border-b border-black font-bold uppercase text-[10.5px] tracking-wide pb-1 align-bottom">
                          {certBName}
                        </td>
                      </tr>
                      <tr>
                        <td className="text-[9px] text-slate-700 pt-1">
                          {certBPos}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Box C */}
              <div className="p-3.5 pt-3 flex flex-col justify-between min-h-[145px]">
                <div>
                  <div className="flex items-center mb-2">
                    <SectionBadge letter="C" />
                    <span className="font-bold text-[11px] leading-normal">
                      Certified:
                    </span>
                  </div>
                  <div className="text-[9.5px] leading-snug text-slate-800">
                    Funds available for the purpose.
                  </div>
                </div>
                <div className="mt-3">
                  <table className="w-[88%] mx-auto border-collapse text-center">
                    <tbody>
                      <tr>
                        <td className="border-b border-black font-bold uppercase text-[10.5px] tracking-wide pb-1 align-bottom">
                          {certCName}
                        </td>
                      </tr>
                      <tr>
                        <td className="text-[9px] text-slate-700 pt-1">
                          {certCPos}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 6. Section D, Payment details, Section E */}
            <div className="grid grid-cols-3 border-b-2 border-black shrink-0 min-h-[135px]">
              {/* Box D */}
              <div className="border-r-2 border-black p-3.5 pt-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center mb-2">
                    <SectionBadge letter="D" />
                    <span className="font-bold text-[11px] leading-normal">
                      Approved For Payment:&nbsp;P
                    </span>
                    <span className="inline-block border-b border-black w-12 ml-1" />
                  </div>
                </div>
                <div className="mt-3">
                  <table className="w-[88%] mx-auto border-collapse text-center">
                    <tbody>
                      <tr>
                        <td className="border-b border-black font-bold uppercase text-[10.5px] tracking-wide pb-1 align-bottom">
                          {appName}
                        </td>
                      </tr>
                      <tr>
                        <td className="text-[9px] text-slate-700 pt-1">
                          {appPos}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment Arrow Center Box */}
              <div className="border-r-2 border-black p-3 flex items-center justify-center">
                <table className="w-full border-collapse">
                  <tbody>
                    <tr>
                      <td className="w-[28px] align-middle text-center pr-1">
                        <svg
                          className="w-5 h-4 fill-black inline-block"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M2 9h11V4l9 8-9 8v-5H2V9z" />
                        </svg>
                      </td>
                      <td className="align-middle text-[9.5px]">
                        <div className="font-bold text-[10px] mb-1.5">Payment:</div>
                        <table className="w-full border-collapse leading-tight">
                          <tbody>
                            <tr>
                              <td className="font-normal whitespace-nowrap py-1 w-[65px] align-bottom">Check No.</td>
                              <td className="border-b border-black pl-1 align-bottom">&nbsp;</td>
                            </tr>
                            <tr>
                              <td className="font-normal whitespace-nowrap py-1 w-[65px] align-bottom">Bank Name:</td>
                              <td className="border-b border-black pl-1 align-bottom">&nbsp;</td>
                            </tr>
                            <tr>
                              <td className="font-normal whitespace-nowrap py-1 w-[65px] align-bottom">Date:</td>
                              <td className="border-b border-black pl-1 align-bottom">&nbsp;</td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Box E */}
              <div className="flex flex-col justify-between">
                <div className="p-3.5 pt-3 pb-1 flex items-center">
                  <SectionBadge letter="E" />
                  <span className="font-bold text-[11px] leading-normal">
                    Received Payment:
                  </span>
                </div>

                <div className="border-t border-black p-2.5 bg-[#f8fafc]">
                  <div className="text-center text-[9px] text-slate-700 leading-tight">
                    Signature Over Printed Name/Position
                  </div>
                  <div className="mt-2 text-left text-[9.5px]">
                    <table className="w-full border-collapse">
                      <tbody>
                        <tr>
                          <td className="w-[35px] font-normal align-bottom">Date:</td>
                          <td className="border-b border-black align-bottom">&nbsp;</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* 7. Section F - Accounting Entries */}
            <div className="shrink-0 flex flex-col">
              {/* Header Box F */}
              <div className="border-b-2 border-black px-3.5 py-1.5 bg-[#f8fafc] flex items-center">
                <SectionBadge letter="F" />
                <span className="font-bold text-[11px] leading-normal">
                  Accounting Entries
                </span>
              </div>

              {/* Sub-table Headers & Blank Entry Row */}
              <table className="w-full border-collapse table-fixed text-[10px]">
                <colgroup>
                  <col style={{ width: "42%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-black font-bold text-center bg-[#f1f5f9]">
                    <th className="border-r border-black py-1.5 px-2 align-middle font-bold text-center">
                      Particulars
                    </th>
                    <th className="border-r border-black py-1.5 px-1 align-middle font-bold text-center">
                      Account Code
                    </th>
                    <th className="border-r border-black py-1.5 px-1 align-middle font-bold text-center">
                      Debit
                    </th>
                    <th className="py-1.5 px-1 align-middle font-bold text-center">
                      Credit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-black h-[26px]">
                    <td className="border-r border-black px-2 py-1 align-middle">&nbsp;</td>
                    <td className="border-r border-black px-2 py-1 align-middle">&nbsp;</td>
                    <td className="border-r border-black px-2 py-1 align-middle">&nbsp;</td>
                    <td className="px-2 py-1 align-middle">&nbsp;</td>
                  </tr>
                </tbody>
              </table>

              {/* Signatures: Prepared by & Certified Correct Table */}
              <div className="grid grid-cols-[42%_58%] min-h-[60px]">
                {/* Prepared by */}
                <div className="border-r border-black p-2.5 flex flex-col justify-between">
                  <div className="text-[9.5px] font-normal text-slate-700">Prepared by:</div>
                  <div className="mt-2">
                    <table className="w-[85%] mx-auto border-collapse text-center">
                      <tbody>
                        <tr>
                          <td className="border-b border-black text-[9.5px] pb-1 align-bottom">
                            &nbsp;
                          </td>
                        </tr>
                        <tr>
                          <td className="text-[9.5px] text-slate-700 pt-1">
                            Accounting Personnel
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Certified Correct */}
                <div className="p-2.5 flex flex-col justify-between">
                  <div className="text-[9.5px] font-normal text-slate-700">Certified Correct:</div>
                  <div className="mt-1">
                    <table className="w-[85%] mx-auto border-collapse text-center">
                      <tbody>
                        <tr>
                          <td className="border-b border-black font-bold uppercase text-[10.5px] tracking-wide pb-0.5 align-bottom">
                            {certCorrectName}
                          </td>
                        </tr>
                        <tr>
                          <td className="text-[9px] text-slate-700 pt-0.5">
                            {certCorrectPos}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


