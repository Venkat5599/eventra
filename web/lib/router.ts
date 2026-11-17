"use client"

import { usePathname } from "next/navigation"

export function useRoute() {
  const path = usePathname() || "/dashboard"
  const rest = path.replace(/^\/dashboard\/?/, "")
  const parts = rest.split("/").filter(Boolean)
  return {
    page: parts[0] || "overview",
    id: parts[1] ? decodeURIComponent(parts[1]) : undefined,
  }
}

export function go(to: string) {
  const path = to.startsWith("/") ? to : `/${to}`
  window.location.assign(`/dashboard${path}`)
}
