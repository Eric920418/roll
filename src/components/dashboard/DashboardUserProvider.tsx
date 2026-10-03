"use client";
import { createContext, useContext } from "react";
const UserContext = createContext<string | null>(null);
export function useDashboardUser() { return useContext(UserContext); }
export default function DashboardUserProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  return <UserContext.Provider value={userId}>{children}</UserContext.Provider>;
}
