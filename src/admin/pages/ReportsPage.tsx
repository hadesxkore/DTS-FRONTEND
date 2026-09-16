import { Wrench } from "lucide-react"

export default function ReportsPage({ title = "Reports" }: { title?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] select-none">
      {/* Animated gear icon */}
      <div className="relative mb-8">
        <div className="w-28 h-28 rounded-full bg-slate-100 flex items-center justify-center shadow-inner">
          <Wrench
            className="w-14 h-14 text-slate-400"
            style={{ animation: "spin 4s linear infinite" }}
          />
        </div>
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full bg-slate-200 opacity-40 animate-ping" />
      </div>

      <h1 className="text-3xl font-bold text-slate-800 tracking-tight mb-2">
        Under Maintenance
      </h1>
      <p className="text-slate-500 text-base text-center max-w-md leading-relaxed">
        The <span className="font-semibold text-slate-700">{title}</span> section
        is currently under maintenance. Please check back later. We apologize for
        the inconvenience.
      </p>

      <div className="mt-8 flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-5 py-2.5 text-sm font-medium text-amber-700 shadow-sm">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        We are working on it — coming soon!
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
