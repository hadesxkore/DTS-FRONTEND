type PlaceholderPanelProps = {
  title: string
  description: string
}

export default function PlaceholderPanel({ title, description }: PlaceholderPanelProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-base font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{description}</div>
    </div>
  )
}
