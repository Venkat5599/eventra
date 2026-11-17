"use client"

// Eventra data layer.
//
// Server mode: every action is one call to the Java API (JDBC + MySQL) at /api,
// which enforces the rules (capacity -> waitlist, duplicate checks, promotion on
// cancel, check-in only when confirmed, no room clashes) inside a transaction.
// Offline mode (API unreachable): the same rules run in the browser on a local copy.
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { seed } from "./seed"

export type EventStatus = "draft" | "open" | "closed" | "completed"
export type RegStatus = "confirmed" | "waitlisted" | "cancelled" | "checked_in"

export interface EventItem {
  id: string
  code: string
  name: string
  category: string
  venue: string
  description: string
  startDate: string // YYYY-MM-DD
  endDate: string
  capacity: number
  status: EventStatus
  organizer: string
}

export interface Participant {
  id: string
  name: string
  email: string
  phone: string
  organization: string
  department: string
  createdAt: string // ISO
}

export interface Session {
  id: string
  eventId: string
  title: string
  speaker: string
  room: string
  date: string // YYYY-MM-DD
  start: string // HH:MM
  end: string
}

export interface Registration {
  id: string
  eventId: string
  participantId: string
  status: RegStatus
  registeredAt: string // ISO
  checkedInAt?: string
  ticketCode: string
  notes: string
}

export interface Db {
  events: EventItem[]
  participants: Participant[]
  sessions: Session[]
  registrations: Registration[]
}

export type Result<T = void> = { ok: true; value: T; message: string } | { ok: false; message: string }

// ------------------------------------------------------------------ helpers
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m }

export function activeCount(db: Db, eventId: string) {
  return db.registrations.filter((r) => r.eventId === eventId && (r.status === "confirmed" || r.status === "checked_in")).length
}

export function sessionClashes(db: Db, s: Pick<Session, "id" | "room" | "date" | "start" | "end">) {
  return db.sessions.filter(
    (o) => o.id !== s.id && o.room.trim().toLowerCase() === s.room.trim().toLowerCase() && o.date === s.date &&
      toMin(o.start) < toMin(s.end) && toMin(s.start) < toMin(o.end),
  )
}

// ------------------------------------------------------------------ store
interface Actions {
  // POST /api/events, PUT /api/events/{id}
  saveEvent: (e: Omit<EventItem, "id"> & { id?: string }) => Result<EventItem>
  // DELETE /api/events/{id}
  deleteEvent: (id: string) => Result
  // POST /api/participants, PUT /api/participants/{id}
  saveParticipant: (p: Omit<Participant, "id" | "createdAt"> & { id?: string }) => Result<Participant>
  // DELETE /api/participants/{id}
  deleteParticipant: (id: string) => Result
  // POST /api/registrations
  register: (eventId: string, participantId: string, notes?: string) => Result<Registration>
  // POST /api/registrations/{id}/cancel
  cancel: (id: string) => Result
  // POST /api/registrations/{id}/check-in
  checkIn: (id: string) => Result
  // POST /api/sessions, PUT /api/sessions/{id}
  saveSession: (s: Omit<Session, "id"> & { id?: string }) => Result<Session>
  // DELETE /api/sessions/{id}
  deleteSession: (id: string) => Result
  resetSample: () => void
  importDb: (db: Db) => Result
}

// Offline engine: the same rules, run in the browser and saved to localStorage.
// Used only when the API can't be reached (e.g. opening the built site without a backend).
const useLocal = create<Db & Actions>()(
  persist(
    (set, get) => ({
      ...seed(),

      saveEvent: (e) => {
        if (!e.name.trim()) return { ok: false, message: "Event name is required." }
        if (!e.code.trim()) return { ok: false, message: "Event code is required." }
        if (e.endDate < e.startDate) return { ok: false, message: "End date cannot be before the start date." }
        if (!(e.capacity > 0)) return { ok: false, message: "Capacity must be at least 1." }
        const db = get()
        if (db.events.some((o) => o.code.toUpperCase() === e.code.trim().toUpperCase() && o.id !== e.id))
          return { ok: false, message: `Another event already uses code ${e.code.toUpperCase()}.` }
        if (e.id) {
          const taken = activeCount(db, e.id)
          if (e.capacity < taken) return { ok: false, message: `Capacity can't go below the ${taken} confirmed seats.` }
          const next = { ...(db.events.find((o) => o.id === e.id) as EventItem), ...e, code: e.code.trim().toUpperCase() } as EventItem
          set({ events: db.events.map((o) => (o.id === e.id ? next : o)) })
          // capacity went up: promote the waitlist in order
          promote(set, get, e.id)
          return { ok: true, value: next, message: `Saved ${next.name}.` }
        }
        const created: EventItem = { ...e, id: uid("evt"), code: e.code.trim().toUpperCase() } as EventItem
        set({ events: [...db.events, created] })
        return { ok: true, value: created, message: `Created ${created.name}.` }
      },

      deleteEvent: (id) => {
        const db = get()
        const ev = db.events.find((e) => e.id === id)
        if (!ev) return { ok: false, message: "Event not found." }
        set({
          events: db.events.filter((e) => e.id !== id),
          sessions: db.sessions.filter((s) => s.eventId !== id),
          registrations: db.registrations.filter((r) => r.eventId !== id),
        })
        return { ok: true, value: undefined, message: `Deleted ${ev.name} with its sessions and registrations.` }
      },

      saveParticipant: (p) => {
        const name = p.name.trim(), email = p.email.trim().toLowerCase()
        if (!name) return { ok: false, message: "Name is required." }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Enter a valid email address." }
        if (p.phone && !/^[+\d][\d\s-]{6,}$/.test(p.phone.trim())) return { ok: false, message: "Enter a valid phone number." }
        const db = get()
        if (db.participants.some((o) => o.email === email && o.id !== p.id))
          return { ok: false, message: `${email} is already registered as a participant.` }
        if (p.id) {
          const next = { ...(db.participants.find((o) => o.id === p.id) as Participant), ...p, name, email }
          set({ participants: db.participants.map((o) => (o.id === p.id ? next : o)) })
          return { ok: true, value: next, message: `Saved ${name}.` }
        }
        const created: Participant = { ...p, id: uid("prt"), name, email, createdAt: new Date().toISOString() }
        set({ participants: [...db.participants, created] })
        return { ok: true, value: created, message: `Added ${name}.` }
      },

      deleteParticipant: (id) => {
        const db = get()
        const p = db.participants.find((x) => x.id === id)
        if (!p) return { ok: false, message: "Participant not found." }
        const touched = new Set(db.registrations.filter((r) => r.participantId === id && r.status !== "cancelled").map((r) => r.eventId))
        set({ participants: db.participants.filter((x) => x.id !== id), registrations: db.registrations.filter((r) => r.participantId !== id) })
        touched.forEach((eid) => promote(set, get, eid))
        return { ok: true, value: undefined, message: `Removed ${p.name} and their registrations.` }
      },

      register: (eventId, participantId, notes = "") => {
        const db = get()
        const ev = db.events.find((e) => e.id === eventId)
        const p = db.participants.find((x) => x.id === participantId)
        if (!ev || !p) return { ok: false, message: "Pick an event and a participant." }
        if (ev.status !== "open") return { ok: false, message: `${ev.name} is ${ev.status}, registrations are not open.` }
        if (db.registrations.some((r) => r.eventId === eventId && r.participantId === participantId && r.status !== "cancelled"))
          return { ok: false, message: `${p.name} is already registered for ${ev.name}.` }
        const full = activeCount(db, eventId) >= ev.capacity
        const n = db.registrations.length + 1
        const reg: Registration = {
          id: uid("reg"), eventId, participantId, status: full ? "waitlisted" : "confirmed",
          registeredAt: new Date().toISOString(), ticketCode: `${ev.code}-${1000 + n}`, notes,
        }
        set({ registrations: [...db.registrations, reg] })
        return { ok: true, value: reg, message: full ? `${ev.name} is full. ${p.name} is on the waitlist.` : `${p.name} is confirmed for ${ev.name} (${reg.ticketCode}).` }
      },

      cancel: (id) => {
        const db = get()
        const reg = db.registrations.find((r) => r.id === id)
        if (!reg) return { ok: false, message: "Registration not found." }
        if (reg.status === "cancelled") return { ok: false, message: "Already cancelled." }
        if (reg.status === "checked_in") return { ok: false, message: "Checked-in registrations can't be cancelled." }
        set({ registrations: db.registrations.map((r) => (r.id === id ? { ...r, status: "cancelled" } : r)) })
        const promoted = promote(set, get, reg.eventId)
        return { ok: true, value: undefined, message: promoted ? `Cancelled. ${promoted} moved up from the waitlist.` : "Registration cancelled." }
      },

      checkIn: (id) => {
        const db = get()
        const reg = db.registrations.find((r) => r.id === id)
        if (!reg) return { ok: false, message: "Registration not found." }
        if (reg.status !== "confirmed") return { ok: false, message: `Only confirmed registrations can check in (this one is ${reg.status.replace("_", " ")}).` }
        set({ registrations: db.registrations.map((r) => (r.id === id ? { ...r, status: "checked_in", checkedInAt: new Date().toISOString() } : r)) })
        const p = db.participants.find((x) => x.id === reg.participantId)
        return { ok: true, value: undefined, message: `${p?.name ?? "Participant"} checked in.` }
      },

      saveSession: (s) => {
        if (!s.title.trim()) return { ok: false, message: "Session title is required." }
        if (!s.room.trim()) return { ok: false, message: "Room is required." }
        if (toMin(s.end) <= toMin(s.start)) return { ok: false, message: "End time must be after the start time." }
        const db = get()
        const ev = db.events.find((e) => e.id === s.eventId)
        if (!ev) return { ok: false, message: "Pick an event." }
        if (s.date < ev.startDate || s.date > ev.endDate) return { ok: false, message: `${ev.name} runs ${ev.startDate} to ${ev.endDate}.` }
        const clash = sessionClashes(db, { id: s.id ?? "", room: s.room, date: s.date, start: s.start, end: s.end })
        if (clash.length) return { ok: false, message: `${s.room} is booked for “${clash[0].title}” (${clash[0].start}–${clash[0].end}).` }
        if (s.id) {
          const next = { ...(db.sessions.find((o) => o.id === s.id) as Session), ...s }
          set({ sessions: db.sessions.map((o) => (o.id === s.id ? next : o)) })
          return { ok: true, value: next, message: `Saved ${next.title}.` }
        }
        const created = { ...s, id: uid("ses") } as Session
        set({ sessions: [...db.sessions, created] })
        return { ok: true, value: created, message: `Added ${created.title} to the schedule.` }
      },

      deleteSession: (id) => {
        const db = get()
        set({ sessions: db.sessions.filter((s) => s.id !== id) })
        return { ok: true, value: undefined, message: "Session removed." }
      },

      resetSample: () => set(seed()),

      importDb: (d) => {
        if (!d || !Array.isArray(d.events) || !Array.isArray(d.participants) || !Array.isArray(d.sessions) || !Array.isArray(d.registrations))
          return { ok: false, message: "That file isn't an Eventra export." }
        set({ events: d.events, participants: d.participants, sessions: d.sessions, registrations: d.registrations })
        return { ok: true, value: undefined, message: `Imported ${d.events.length} events and ${d.participants.length} participants.` }
      },
    }),
    {
      name: "eventra-db-v1",
      partialize: (s) => ({ events: s.events, participants: s.participants, sessions: s.sessions, registrations: s.registrations }),
    },
  ),
)

// Move the earliest waitlisted registrations into free seats. Returns the first promoted name.
function promote(set: (p: Partial<Db>) => void, get: () => Db, eventId: string): string | null {
  const db = get()
  const ev = db.events.find((e) => e.id === eventId)
  if (!ev) return null
  let free = ev.capacity - activeCount(db, eventId)
  if (free <= 0) return null
  const queue = db.registrations.filter((r) => r.eventId === eventId && r.status === "waitlisted")
    .sort((a, b) => a.registeredAt.localeCompare(b.registeredAt))
  const ids = new Set<string>()
  for (const r of queue) { if (free-- <= 0) break; ids.add(r.id) }
  if (!ids.size) return null
  set({ registrations: db.registrations.map((r) => (ids.has(r.id) ? { ...r, status: "confirmed" } : r)) })
  const first = queue.find((r) => ids.has(r.id))
  return db.participants.find((p) => p.id === first?.participantId)?.name ?? null
}

// ------------------------------------------------------------------ public store
export type Mode = "connecting" | "server" | "offline"

type Async<F> = F extends (...a: infer A) => infer R ? (...a: A) => Promise<R> : never
type AsyncActions = { [K in keyof Actions]: Async<Actions[K]> }

interface State extends Db, AsyncActions {
  mode: Mode
  lastSync: number | null
  refresh: () => Promise<void>
}

const API = "/api"
const empty: Db = { events: [], participants: [], sessions: [], registrations: [] }
const pick = (s: Db): Db => ({ events: s.events, participants: s.participants, sessions: s.sessions, registrations: s.registrations })

async function call<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(API + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, message: data?.message ?? `The server answered ${res.status}.` }
    return { ok: true, value: data?.value as T, message: data?.message ?? "Done." }
  } catch {
    return { ok: false, message: "Can't reach the Eventra server. Check your connection and try again." }
  }
}

const OFFLINE_ONLY: Result = { ok: false, message: "This only works on a local copy. The live database is shared, so it can't be wiped or replaced from here." }

export const useDb = create<State>()((set, get) => {
  const local = () => useLocal.getState()
  const server = () => get().mode === "server"
  // after a write, re-read the database so every page shows what MySQL holds
  const write = async <T,>(r: Promise<Result<T>>): Promise<Result<T>> => {
    const out = await r
    if (out.ok) await get().refresh()
    return out
  }
  const off = <T,>(r: Result<T>): Promise<Result<T>> => {
    set(pick(local()))
    return Promise.resolve(r)
  }
  const strip = <T extends { id?: string }>(x: T) => { const { id: _id, ...rest } = x; return rest }

  return {
    ...empty,
    mode: "connecting",
    lastSync: null,

    refresh: async () => {
      if (!server()) return
      try {
        const res = await fetch(`${API}/db`, { cache: "no-store" })
        if (!res.ok) throw new Error(String(res.status))
        const d = (await res.json()) as Db
        set({ ...pick(d), lastSync: Date.now() })
      } catch { /* keep the last good copy; the next poll retries */ }
    },

    saveEvent: (e) => server()
      ? write(call<EventItem>(e.id ? "PUT" : "POST", e.id ? `/events/${e.id}` : "/events", strip(e)))
      : off(local().saveEvent(e)),
    deleteEvent: (id) => server() ? write(call("DELETE", `/events/${id}`)) : off(local().deleteEvent(id)),
    saveParticipant: (p) => server()
      ? write(call<Participant>(p.id ? "PUT" : "POST", p.id ? `/participants/${p.id}` : "/participants", strip(p)))
      : off(local().saveParticipant(p)),
    deleteParticipant: (id) => server() ? write(call("DELETE", `/participants/${id}`)) : off(local().deleteParticipant(id)),
    register: (eventId, participantId, notes = "") => server()
      ? write(call<Registration>("POST", "/registrations", { eventId, participantId, notes }))
      : off(local().register(eventId, participantId, notes)),
    cancel: (id) => server() ? write(call("POST", `/registrations/${id}/cancel`)) : off(local().cancel(id)),
    checkIn: (id) => server() ? write(call("POST", `/registrations/${id}/check-in`)) : off(local().checkIn(id)),
    saveSession: (s) => server()
      ? write(call<Session>(s.id ? "PUT" : "POST", s.id ? `/sessions/${s.id}` : "/sessions", strip(s)))
      : off(local().saveSession(s)),
    deleteSession: (id) => server() ? write(call("DELETE", `/sessions/${id}`)) : off(local().deleteSession(id)),
    resetSample: async () => { if (!server()) { local().resetSample(); set(pick(local())) } },
    importDb: (d) => server() ? Promise.resolve(OFFLINE_ONLY) : off(local().importDb(d)),
  }
})

/** Connect to the API once at start; fall back to the offline copy if it can't be reached. */
export async function connect() {
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 8000)
    const res = await fetch(`${API}/db`, { cache: "no-store", signal: ctl.signal })
    clearTimeout(t)
    const type = res.headers.get("content-type") ?? ""
    if (!res.ok || !type.includes("application/json")) throw new Error("no api")
    const d = (await res.json()) as Db
    useDb.setState({ ...pick(d), mode: "server", lastSync: Date.now() })
    setInterval(() => { if (document.visibilityState === "visible") useDb.getState().refresh() }, 20000)
  } catch {
    useDb.setState({ ...pick(useLocal.getState()), mode: "offline" })
  }
}

export function exportDb(): Db {
  const s = useDb.getState()
  return { events: s.events, participants: s.participants, sessions: s.sessions, registrations: s.registrations }
}
