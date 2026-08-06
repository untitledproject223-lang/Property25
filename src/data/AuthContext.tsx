import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  acceptInvite as apiAcceptInvite,
  fetchMe,
  getToken,
  login as apiLogin,
  setToken,
  signup as apiSignup,
  type AuthUser,
} from './api'

type AuthState = {
  user: AuthUser | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  signup: (input: {
    role: 'agent' | 'landlord'
    fullName: string
    email: string
    password: string
    phone?: string
    agencyName?: string
  }) => Promise<void>
  acceptInvite: (input: {
    token: string
    fullName: string
    password: string
  }) => Promise<void>
  logout: () => void
  setUser: (user: AuthUser | null) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      if (!getToken()) {
        if (!cancelled) setLoading(false)
        return
      }
      try {
        const me = await fetchMe()
        if (!cancelled) setUser(me.data)
      } catch {
        setToken(null)
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    const result = await apiLogin(email, password)
    setUser(result.user)
  }, [])

  const signup = useCallback(
    async (input: {
      role: 'agent' | 'landlord'
      fullName: string
      email: string
      password: string
      phone?: string
      agencyName?: string
    }) => {
      setError(null)
      const result = await apiSignup(input)
      setUser(result.user)
    },
    [],
  )

  const acceptInvite = useCallback(
    async (input: { token: string; fullName: string; password: string }) => {
      setError(null)
      const result = await apiAcceptInvite(input)
      setUser(result.user)
    },
    [],
  )

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, error, login, signup, acceptInvite, logout, setUser }),
    [user, loading, error, login, signup, acceptInvite, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
