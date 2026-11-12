import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

type User = { id: string; name?: string; email?: string; provider: string; payer_id?: string; ship_to?: any; mcp_token?: string; paypal_linked_at?: number };
const Ctx = createContext<{ user: User | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> }>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try { setUser(await api<User>("/auth/me")); } catch { setUser(null); }
    setLoading(false);
  };
  const logout = async () => { await api("/auth/logout", { method: "POST" }); setUser(null); window.location.href = "/login"; };
  useEffect(() => {
    refresh();
    const h = () => setUser(null);
    window.addEventListener("mandate:unauthorized", h);
    return () => window.removeEventListener("mandate:unauthorized", h);
  }, []);
  return <Ctx.Provider value={{ user, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
