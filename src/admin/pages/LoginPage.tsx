import { useMemo, useState } from "react"
import { Eye, EyeOff, Lock, User } from "lucide-react"
import { toast } from "../../lib/toast"

type LoginPageProps = {
  onLoginSuccess: (params: { username: string; role: string; token: string; fullName?: string; office?: string }) => void
}

const RAW_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api"
const API_URL = RAW_API_URL.replace(/\/$/, "").endsWith("/api")
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api`

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keepMeSignedIn, setKeepMeSignedIn] = useState(true)

  const canSubmit = useMemo(() => {
    return username.trim().length > 0 && password.length > 0
  }, [username, password])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    
    const loginEndpoint = `${API_URL}/auth/login`
    console.log("[LOGIN] Environment VITE_API_URL:", import.meta.env.VITE_API_URL)
    console.log("[LOGIN] Resolved API_URL:", API_URL)
    console.log("[LOGIN] Sending POST to:", loginEndpoint, { username: username.trim() })

    try {
      const response = await fetch(loginEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password,
        }),
      })

      console.log("[LOGIN] Server Response:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: response.url,
      })

      const data = await response.json()
      console.log("[LOGIN] Parsed Response Data:", data)

      if (!response.ok) {
        console.error("[LOGIN] Login request failed with status:", response.status, data)
        setError(data.message || 'Login failed.')
        toast.error(data.message || 'Login failed.')
        return
      }

      // Store in selected storage
      const storage = keepMeSignedIn ? localStorage : sessionStorage
      storage.setItem('token', data.token)
      storage.setItem('user', JSON.stringify(data.user))

      console.log("[LOGIN] Login successful for user:", data.user)
      onLoginSuccess({
        username: data.user.username,
        role: data.user.role,
        token: data.token,
        fullName: data.user.fullName,
        office: data.user.office,
      })
      toast.success('Login successful.')
      setPassword('')
    } catch (err) {
      console.error("[LOGIN] Catch error during login fetch:", err)
      setError('Login failed. Please try again.')
      toast.error('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row font-sans">
      {/* Left Pane - Background image from public/images */}
      <div 
        className="relative flex w-full flex-col justify-center overflow-hidden lg:w-[65%] p-10 lg:p-20 z-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/background.jpg')" }}
      >
        {/* Blue color block overlay so it still matches the modern theme and white font remains visible */}
        <div className="absolute inset-0 z-[-2] bg-blue-600/50" />

        {/* CSS Background Grid */}
        <div 
          className="absolute inset-0 z-[-1] opacity-20"
          style={{
            backgroundImage: "linear-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.5) 1px, transparent 1px)",
            backgroundSize: "40px 40px"
          }}
        />

        {/* Top Wave Decoration */}
        <svg className="absolute left-0 right-0 top-0 z-[-1] w-full h-auto text-blue-400 opacity-60" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path fill="currentColor" fillOpacity="1" d="M0,160L48,138.7C96,117,192,75,288,64C384,53,480,75,576,117.3C672,160,768,224,864,224C960,224,1056,160,1152,144C1248,128,1344,160,1392,176L1440,192L1440,0L1392,0C1344,0,1248,0,1152,0C1056,0,960,0,864,0C768,0,672,0,576,0C480,0,384,0,288,0C192,0,96,0,48,0L0,0Z"></path>
        </svg>
        <svg className="absolute left-0 right-0 top-0 z-[-1] w-full h-[400px] text-blue-600 opacity-40 mix-blend-multiply" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path fill="currentColor" fillOpacity="1" d="M0,64L80,101.3C160,139,320,213,480,224C640,235,800,181,960,154.7C1120,128,1280,128,1360,128L1440,128L1440,0L1360,0C1280,0,1120,0,960,0C800,0,640,0,480,0C320,0,160,0,80,0L0,0Z"></path>
        </svg>

        {/* Bottom Wave Decoration */}
        <svg className="absolute bottom-0 left-0 right-0 z-[-1] w-full h-[250px] text-blue-700 opacity-80" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path fill="currentColor" fillOpacity="1" d="M0,288L80,266.7C160,245,320,203,480,197.3C640,192,800,224,960,240C1120,256,1280,256,1360,256L1440,256L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z"></path>
        </svg>

        {/* Geometric connections (Circles and lines) */}
        <div className="absolute top-20 right-20 w-12 h-12 rounded-full border-2 border-white/30 flex items-center justify-center -z-10">
          <div className="w-8 h-8 rounded-full bg-white/20"></div>
        </div>
        <div className="absolute bottom-32 right-32 w-16 h-16 rounded-full border border-white/30 flex items-center justify-center -z-10">
          <div className="w-8 h-8 rounded-full bg-white/30"></div>
        </div>
        <div className="absolute top-1/4 left-10 w-16 h-16 rounded-full border border-white/20 flex items-center justify-center -z-10">
          <div className="w-6 h-6 rounded-full bg-white/10"></div>
        </div>
        <svg className="absolute inset-0 w-full h-full -z-10 opacity-30 pointer-events-none">
          <line x1="10%" y1="80%" x2="50%" y2="20%" stroke="white" strokeWidth="1" />
          <line x1="30%" y1="10%" x2="70%" y2="40%" stroke="white" strokeWidth="1" />
          <circle cx="50%" cy="20%" r="4" fill="white" />
          <circle cx="70%" cy="40%" r="3" fill="white" />
          <circle cx="10%" cy="80%" r="5" fill="white" />
        </svg>

        <div className="mx-auto w-full max-w-xl text-center text-white z-10 px-4 mt-8 lg:mt-0">
          <img src="/images/Bataan.png" alt="Bataan Logo" className="w-24 h-24 mx-auto mb-6 object-contain drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)]" />
          <p className="text-lg font-bold tracking-wide mb-2 uppercase text-sm [text-shadow:_0_2px_4px_rgb(0_0_0_/_80%)]">THE BUNKER</p>
          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-wider mb-6 leading-tight [text-shadow:_0_4px_8px_rgb(0_0_0_/_80%)]">DOCUMENT TRACKING SYSTEM</h1>
          <div className="w-16 h-1.5 bg-white mx-auto mb-8 rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.8)]"></div>
          <p className="text-sm font-medium leading-relaxed max-w-md mx-auto [text-shadow:_0_2px_4px_rgb(0_0_0_/_80%)]">
            Secure, fast, and organized document tracking system for the Capitol. Sign in to access your dashboard, monitor requests, and manage workflow efficiently.
          </p>
        </div>
      </div>

      {/* Right Pane - White Form Area */}
      <div className="flex w-full flex-col justify-center items-center bg-white lg:w-[35%] p-8 lg:p-16">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-blue-600 tracking-tight mb-4">Login Account</h2>
            <p className="text-xs text-slate-400 font-light leading-relaxed px-4">
              Enter your credentials to start your session. If you experience issues, please contact the system administrator.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-5">
              <div className="relative">
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-12 w-full bg-slate-50 border-l-[3px] border-l-blue-500 pl-4 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:bg-slate-100"
                  placeholder="Username"
                />
              </div>

              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 w-full bg-slate-50 border-l-[3px] border-l-blue-500 pl-4 pr-10 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:bg-slate-100"
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-slate-400 transition hover:text-slate-600 focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error ? (
              <div className="px-3 py-2 text-sm text-rose-600 text-center font-medium bg-red-50 rounded">
                {error}
              </div>
            ) : null}

            <div className="flex items-center justify-between mt-2 pt-2 px-1">
              <button
                type="button"
                onClick={() => setKeepMeSignedIn(!keepMeSignedIn)}
                className="flex items-center gap-2 cursor-pointer group focus:outline-none"
              >
                <div className={`flex items-center justify-center w-4 h-4 rounded border transition-colors ${keepMeSignedIn ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
                  {keepMeSignedIn && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-xs font-medium text-slate-500">Keep me signed in</span>
              </button>
            </div>

            <div className="pt-6">
              <button
                className="h-12 w-full flex items-center justify-center rounded-full bg-blue-500 font-bold tracking-widest text-white shadow-md hover:bg-blue-600 transition-colors hover:shadow-lg disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-blue-500/30"
                type="submit"
                disabled={!canSubmit || loading}
              >
                {loading ? "AUTHENTICATING..." : "LOGIN"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
