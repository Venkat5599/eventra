// Eventra data layer.
//
// Every read and write is one call to the Java API (JDBC + MySQL) at /api. The API
// enforces the rules (capacity -> waitlist, duplicate checks, promotion on cancel,
// check-in only when confirmed, no room clashes) inside a transaction. There is no
// local copy: if the server can't be reached the dashboard says so and shows nothing.
import { create } from "zustand"

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

// ------------------------------------------------------------------ helpers (read-only views)
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

// ------------------------------------------------------------------ API client
export const API = "/api"

export interface Reply<T = unknown> { status: number; ms: number; ok: boolean; body: T | null; error?: string }

/** Raw request, used by the store and by the API console on the Backend page. */
// The server shares a busy machine: reads usually answer in about a second, writes in a few seconds.
export async function request<T = unknown>(method: string, path: string, body?: unknown, timeoutMs = method === "GET" ? 30000 : 60000): Promise<Reply<T>> {
  const t0 = performance.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(API + path, {
      method,
      cache: "no-store",
      signal: ctl.signal,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const type = res.headers.get("content-type") ?? ""
    const data = type.includes("application/json") ? ((await res.json().catch(() => null)) as T | null) : null
    return { status: res.status, ms: Math.round(performance.now() - t0), ok: res.ok && data !== null, body: data }
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError"
    return { status: 0, ms: Math.round(performance.now() - t0), ok: false, body: null, error: aborted ? `No answer within ${Math.round(timeoutMs / 1000)} s` : "Network error" }
  } finally {
    clearTimeout(timer)
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  const r = await request<{ value?: T; message?: string }>(method, path, body)
  if (r.status === 0) return { ok: false, message: "Can't reach the Eventra server. Check your connection and try again." }
  if (!r.ok) return { ok: false, message: r.body?.message ?? `The server answered ${r.status}.` }
  return { ok: true, value: r.body?.value as T, message: r.body?.message ?? "Done." }
}

// ------------------------------------------------------------------ store
export type Mode = "connecting" | "server" | "down"

interface State extends Db {
  mode: Mode
  lastSync: number | null
  lastError: string | null
  refresh: () => Promise<void>
  saveEvent: (e: Omit<EventItem, "id"> & { id?: string }) => Promise<Result<EventItem>>
  deleteEvent: (id: string) => Promise<Result>
  saveParticipant: (p: Omit<Participant, "id" | "createdAt"> & { id?: string }) => Promise<Result<Participant>>
  deleteParticipant: (id: string) => Promise<Result>
  register: (eventId: string, participantId: string, notes?: string) => Promise<Result<Registration>>
  cancel: (id: string) => Promise<Result>
  checkIn: (id: string) => Promise<Result>
  saveSession: (s: Omit<Session, "id"> & { id?: string }) => Promise<Result<Session>>
  deleteSession: (id: string) => Promise<Result>
}

const empty: Db = { events: [], participants: [], sessions: [], registrations: [] }
const pick = (s: Db): Db => ({ events: s.events, participants: s.participants, sessions: s.sessions, registrations: s.registrations })
const strip = <T extends { id?: string }>(x: T) => { const { id: _id, ...rest } = x; return rest }

export const useDb = create<State>()((set, get) => {
  // after a write, re-read the database so every page shows what MySQL holds
  const write = async <T,>(r: Promise<Result<T>>): Promise<Result<T>> => {
    const out = await r
    if (out.ok) await get().refresh()
    return out
  }
  return {
    ...empty,
    mode: "connecting",
    lastSync: null,
    lastError: null,

    refresh: async () => {
      const r = await request<Db>("GET", "/db")
      if (r.ok && r.body) set({ ...pick(r.body), mode: "server", lastSync: Date.now(), lastError: null })
      else if (get().mode !== "server") set({ mode: "down", lastError: r.error ?? `HTTP ${r.status}` })
      // when already live, a single failed poll keeps the last good read; the next poll retries
    },

    saveEvent: (e) => write(call<EventItem>(e.id ? "PUT" : "POST", e.id ? `/events/${e.id}` : "/events", strip(e))),
    deleteEvent: (id) => write(call("DELETE", `/events/${id}`)),
    saveParticipant: (p) => write(call<Participant>(p.id ? "PUT" : "POST", p.id ? `/participants/${p.id}` : "/participants", strip(p))),
    deleteParticipant: (id) => write(call("DELETE", `/participants/${id}`)),
    register: (eventId, participantId, notes = "") => write(call<Registration>("POST", "/registrations", { eventId, participantId, notes })),
    cancel: (id) => write(call("POST", `/registrations/${id}/cancel`)),
    checkIn: (id) => write(call("POST", `/registrations/${id}/check-in`)),
    saveSession: (s) => write(call<Session>(s.id ? "PUT" : "POST", s.id ? `/sessions/${s.id}` : "/sessions", strip(s))),
    deleteSession: (id) => write(call("DELETE", `/sessions/${id}`)),
  }
})

let poll: ReturnType<typeof setInterval> | null = null

/** Read the database once; then poll every 20 s while the tab is visible. */
export async function connect() {
  useDb.setState({ mode: "connecting" })
  await useDb.getState().refresh()
  if (!poll) poll = setInterval(() => { if (document.visibilityState === "visible") useDb.getState().refresh() }, 20000)
}

export function exportDb(): Db {
  return pick(useDb.getState())
}
