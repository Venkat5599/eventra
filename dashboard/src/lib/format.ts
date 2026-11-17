import { toast } from "@/components/ui/toast"
import type { Result } from "./db"

export const fmtDate = (d: string) =>
  new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
export const fmtDay = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
export const fmtRange = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`)
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

/** Show a toast for an action result (sync or async) and pass the result on. */
export async function notify<T>(p: Result<T> | Promise<Result<T>>): Promise<Result<T>> {
  const r = await p
  toast.add({ title: r.ok ? "Done" : "Not saved", description: r.message, type: r.ok ? "success" : "error" })
  return r
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
