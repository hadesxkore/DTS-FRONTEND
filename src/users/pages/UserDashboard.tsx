type UserDashboardProps = {
  user?: {
    username: string
    role: string
  }
}

export default function UserDashboard({ user }: UserDashboardProps) {
  return (
    <div className="w-full space-y-6 px-4 py-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          Welcome back, {user?.username || "User"}!
        </h1>
        <p className="text-sm text-slate-600">
          This is your personal dashboard. Here you can track your documents and view updates.
        </p>
      </header>

      {/* Stats Cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm transition-shadow hover:shadow">
          <div className="absolute inset-0 bg-sky-500 opacity-10" />
          <div className="relative flex flex-col space-y-1.5 p-6 pb-2">
            <div className="text-sm font-medium text-slate-600">Office Requests</div>
            <div className="text-3xl font-semibold leading-none tracking-tight">12</div>
          </div>
          <div className="relative p-6 pt-0 text-sm text-muted-foreground">
            Total documents created
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm transition-shadow hover:shadow">
          <div className="absolute inset-0 bg-emerald-500 opacity-10" />
          <div className="relative flex flex-col space-y-1.5 p-6 pb-2">
            <div className="text-sm font-medium text-slate-600">In Progress</div>
            <div className="text-3xl font-semibold leading-none tracking-tight">5</div>
          </div>
          <div className="relative p-6 pt-0 text-sm text-muted-foreground">
            Documents being processed
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm transition-shadow hover:shadow">
          <div className="absolute inset-0 bg-amber-500 opacity-10" />
          <div className="relative flex flex-col space-y-1.5 p-6 pb-2">
            <div className="text-sm font-medium text-slate-600">Pending</div>
            <div className="text-3xl font-semibold leading-none tracking-tight">3</div>
          </div>
          <div className="relative p-6 pt-0 text-sm text-muted-foreground">
            Awaiting approval
          </div>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm">
        <div className="flex items-center justify-between gap-4 p-6">
          <div>
            <div className="font-semibold leading-none tracking-tight">Recent Activity</div>
            <div className="text-sm text-muted-foreground">Latest updates on your documents</div>
          </div>
        </div>
        <div className="p-6 pt-0">
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <div className="mt-0.5 size-2 rounded-full bg-emerald-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Document PR-2024-001 approved</p>
                <p className="text-xs text-slate-500">2 hours ago</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <div className="mt-0.5 size-2 rounded-full bg-sky-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">New document submitted: OBR-2024-015</p>
                <p className="text-xs text-slate-500">Yesterday</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <div className="mt-0.5 size-2 rounded-full bg-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Document PR-2024-008 returned for revision</p>
                <p className="text-xs text-slate-500">3 days ago</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
