import { useSyncExternalStore } from "react"

// Hash routes: #/overview, #/events, #/events/<id>, #/registrations, #/participants, #/schedule, #/data
function read() {
  const h = window.location.hash.replace(/^#\/?/, "")
  const [path, query = ""] = h.split("?")
  const parts = path.split("/").filter(Boolean)
  return { page: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : undefined, query: new URLSearchParams(query) }
}

let snap = read()
let key = window.location.hash
const subs = new Set<() => void>()
window.addEventListener("hashchange", () => {
  snap = read(); key = window.location.hash
  subs.forEach((f) => f())
  window.scrollTo(0, 0)
})

export function useRoute() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f) },
    () => { if (key !== window.location.hash) { snap = read(); key = window.location.hash } return snap },
  )
}

export const go = (to: string) => { window.location.hash = to }
