import { useEffect, useState } from "react"
import { Check, Copy, Download, Loader2, Play, RefreshCw, X } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { API, connect, exportDb, request, useDb, type EventItem, type Participant, type Registration, type Session } from "@/lib/db"
import { downloadJson, fmtDateTime } from "@/lib/format"
import { PageHeader } from "@/components/bits"
import { cn } from "@/lib/utils"

const REPO = "https://github.com/Venkat5599/eventra"

// ------------------------------------------------------------------ small pieces
function CopyLine({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className={cn("group flex min-w-0 items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2", className)}>
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[12.5px] leading-relaxed whitespace-pre">{text}</code>
      <button type="button" aria-label="Copy" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200) })}>
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}

function Dot({ state }: { state: "ok" | "bad" | "wait" }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", state === "ok" ? "bg-[#34c759]" : state === "bad" ? "bg-[#ef4444]" : "bg-black/25 animate-pulse")} />
}

// ------------------------------------------------------------------ live status
function Status() {
  const db = useDb()
  const [health, setHealth] = useState<{ state: "ok" | "bad" | "wait"; ms?: number; note?: string; at?: number }>({ state: "wait" })
  const ping = async () => {
    setHealth({ state: "wait" })
    const r = await request<{ ok?: boolean }>("GET", "/health")
    setHealth(r.ok && r.body?.ok ? { state: "ok", ms: r.ms, at: Date.now() } : { state: "bad", ms: r.ms, note: r.error ?? `HTTP ${r.status}`, at: Date.now() })
    if (r.ok && db.mode !== "server") connect()
  }
  useEffect(() => { ping() }, []) // eslint-disable-line
  const counts = [["Events", db.events.length], ["Participants", db.participants.length], ["Sessions", db.sessions.length], ["Registrations", db.registrations.length]] as const
  const live = db.mode === "server"

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Server status</CardTitle>
          <CardDescription>Checked from this browser, through the same <code className="font-mono">/api</code> path every page uses.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { ping(); db.refresh() }}><RefreshCw /> Check again</Button>
          <Button size="sm" variant="outline" disabled={!live} onClick={() => downloadJson("eventra-export.json", exportDb())}><Download /> Export JSON</Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border p-3">
            <Dot state={health.state} />
            <div className="min-w-0">
              <p className="text-[14px] font-medium">API {health.state === "ok" ? "answering" : health.state === "bad" ? "not answering" : "checking…"}</p>
              <p className="truncate text-[12.5px] text-muted-foreground">
                GET /api/health{health.ms !== undefined ? ` · ${health.ms} ms` : ""}{health.note ? ` · ${health.note}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border p-3">
            <Dot state={live ? "ok" : db.mode === "down" ? "bad" : "wait"} />
            <div className="min-w-0">
              <p className="text-[14px] font-medium">MySQL {live ? "read OK" : db.mode === "down" ? "not read" : "reading…"}</p>
              <p className="truncate text-[12.5px] text-muted-foreground">
                {db.lastSync ? `Last read ${fmtDateTime(new Date(db.lastSync).toISOString())} · refreshes every 20 s` : "GET /api/db"}
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {counts.map(([k, v]) => (
            <div key={k} className="rounded-xl border p-3">
              <p className="num text-[22px] font-semibold">{live ? v : "—"}</p>
              <p className="text-[12px] text-muted-foreground">{k}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------------ rule check (runs against the real API, then cleans up)
type Step = { label: string; expect: string; state: "wait" | "run" | "pass" | "fail"; got?: string; ms?: number }

const PLAN: Pick<Step, "label" | "expect">[] = [
  { label: "Create a test event with 1 seat", expect: "saved" },
  { label: "Add two test participants", expect: "saved" },
  { label: "Add a third with the same email", expect: "refused" },
  { label: "Register person A", expect: "confirmed" },
  { label: "Register person B (event is full)", expect: "waitlisted" },
  { label: "Register person B again", expect: "refused" },
  { label: "Cancel A’s seat", expect: "B promoted to confirmed" },
  { label: "Check in B", expect: "checked in" },
  { label: "Check in B a second time", expect: "refused" },
  { label: "Cancel B after check-in", expect: "refused" },
  { label: "Book Room R1, 10:00–11:00", expect: "saved" },
  { label: "Book Room R1, 10:30–11:30 (overlap)", expect: "refused" },
  { label: "Session ending before it starts", expect: "refused" },
  { label: "Delete the test event and people", expect: "cleaned up" },
]

function RuleCheck() {
  const [steps, setSteps] = useState<Step[]>(PLAN.map((p) => ({ ...p, state: "wait" })))
  const [running, setRunning] = useState(false)
  const [ran, setRan] = useState<number | null>(null)

  const run = async () => {
    setRunning(true)
    const s: Step[] = PLAN.map((p) => ({ ...p, state: "wait" }))
    const show = () => setSteps([...s])
    show()
    const tag = Math.random().toString(36).slice(2, 6).toUpperCase()
    const day = new Date().toISOString().slice(0, 10)
    let ev: EventItem | null = null
    const people: Participant[] = []
    let i = 0
    const step = async (fn: () => Promise<{ pass: boolean; got: string; ms: number }>) => {
      s[i].state = "run"; show()
      try { const r = await fn(); Object.assign(s[i], { state: r.pass ? "pass" : "fail", got: r.got, ms: r.ms }) }
      catch (e) { Object.assign(s[i], { state: "fail", got: (e as Error).message }) }
      show(); i++
      return s[i - 1].state === "pass"
    }
    type V<T> = { value?: T; message?: string }
    const msg = (r: { body: V<unknown> | null; status: number; error?: string }) => r.body?.message ?? r.error ?? `HTTP ${r.status}`
    const refused = (r: { status: number; body: V<unknown> | null; ms: number; error?: string }) =>
      ({ pass: r.status >= 400 && r.status < 500, got: msg(r), ms: r.ms })

    try {
      const okEv = await step(async () => {
        const r = await request<V<EventItem>>("POST", "/events", { code: `RC${tag}`, name: `Rule check ${tag}`, category: "Workshop", venue: "Test hall", description: "Temporary, removed by the rule check.", startDate: day, endDate: day, capacity: 1, status: "open", organizer: "Rule check" })
        ev = r.body?.value ?? null
        return { pass: r.ok && !!ev, got: msg(r), ms: r.ms }
      })
      if (!okEv || !ev) throw new Error("stop")
      const e = ev as EventItem
      const okP = await step(async () => {
        let ms = 0
        for (const n of ["A", "B"]) {
          const r = await request<V<Participant>>("POST", "/participants", { name: `Rule check ${n} ${tag}`, email: `rule-${tag.toLowerCase()}-${n.toLowerCase()}@eventra.test`, phone: "", organization: "", department: "" })
          ms += r.ms
          if (!r.ok || !r.body?.value) return { pass: false, got: msg(r), ms }
          people.push(r.body.value)
        }
        return { pass: true, got: "Added A and B.", ms }
      })
      if (!okP) throw new Error("stop")
      const [A, B] = people
      await step(async () => refused(await request("POST", "/participants", { name: "Copy of A", email: A.email, phone: "", organization: "", department: "" })))
      let regA: Registration | undefined, regB: Registration | undefined
      await step(async () => {
        const r = await request<V<Registration>>("POST", "/registrations", { eventId: e.id, participantId: A.id, notes: "" })
        regA = r.body?.value
        return { pass: regA?.status === "confirmed", got: msg(r), ms: r.ms }
      })
      await step(async () => {
        const r = await request<V<Registration>>("POST", "/registrations", { eventId: e.id, participantId: B.id, notes: "" })
        regB = r.body?.value
        return { pass: regB?.status === "waitlisted", got: msg(r), ms: r.ms }
      })
      await step(async () => refused(await request("POST", "/registrations", { eventId: e.id, participantId: B.id, notes: "" })))
      await step(async () => {
        if (!regA || !regB) return { pass: false, got: "Earlier step failed.", ms: 0 }
        const r = await request<V<unknown>>("POST", `/registrations/${regA.id}/cancel`)
        const db = await request<{ registrations: Registration[] }>("GET", "/db")
        const now = db.body?.registrations.find((x) => x.id === regB!.id)?.status
        return { pass: r.ok && now === "confirmed", got: `${msg(r)} B is now ${now ?? "unknown"}.`, ms: r.ms + db.ms }
      })
      await step(async () => {
        if (!regB) return { pass: false, got: "Earlier step failed.", ms: 0 }
        const r = await request<V<unknown>>("POST", `/registrations/${regB.id}/check-in`)
        return { pass: r.ok, got: msg(r), ms: r.ms }
      })
      await step(async () => regB ? refused(await request("POST", `/registrations/${regB.id}/check-in`)) : { pass: false, got: "Earlier step failed.", ms: 0 })
      await step(async () => regB ? refused(await request("POST", `/registrations/${regB.id}/cancel`)) : { pass: false, got: "Earlier step failed.", ms: 0 })
      const room = `R1-${tag}`
      await step(async () => {
        const r = await request<V<Session>>("POST", "/sessions", { eventId: e.id, title: "Talk one", speaker: "", room, date: day, start: "10:00", end: "11:00" })
        return { pass: r.ok, got: msg(r), ms: r.ms }
      })
      await step(async () => refused(await request("POST", "/sessions", { eventId: e.id, title: "Talk two", speaker: "", room, date: day, start: "10:30", end: "11:30" })))
      await step(async () => refused(await request("POST", "/sessions", { eventId: e.id, title: "Backwards", speaker: "", room: `R2-${tag}`, date: day, start: "12:00", end: "11:00" })))
    } catch { /* a setup step failed; the rest stay unchecked */ }
    // Always clean up. Look the test rows up by their tag, so a write that timed out
    // on this side but still landed on the server is removed too.
    i = PLAN.length - 1
    await step(async () => {
      const snap = await request<{ events: EventItem[]; participants: Participant[] }>("GET", "/db")
      if (!snap.ok || !snap.body) return { pass: false, got: "Couldn’t read the database to clean up. Run the check again to retry.", ms: snap.ms }
      const evs = snap.body.events.filter((x) => x.code === `RC${tag}`)
      const ppl = snap.body.participants.filter((x) => x.email.startsWith(`rule-${tag.toLowerCase()}-`) && x.email.endsWith("@eventra.test"))
      let ms = snap.ms, ok = true
      for (const x of evs) { const r = await request("DELETE", `/events/${x.id}`); ms += r.ms; ok &&= r.ok }
      for (const x of ppl) { const r = await request("DELETE", `/participants/${x.id}`); ms += r.ms; ok &&= r.ok }
      const n = evs.length + ppl.length
      return { pass: ok, got: !n ? "Nothing was created, nothing to remove." : ok ? `Removed ${evs.length} test event and ${ppl.length} test people (with their sessions and registrations).` : "Some test rows could not be removed. Run the check again to retry.", ms }
    })
    await useDb.getState().refresh()
    setRan(Date.now())
    setRunning(false)
  }

  const passed = steps.filter((x) => x.state === "pass").length
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Rule check</CardTitle>
          <CardDescription>
            Runs every business rule against the live server: capacity and waitlist, promotion on cancel, duplicate refusals, check-in guards and room clashes.
            It creates one temporary event and two test people, then deletes them.
          </CardDescription>
        </div>
        <Button className="shrink-0" onClick={run} disabled={running}>{running ? <Loader2 className="animate-spin" /> : <Play />} {running ? "Running…" : "Run rule check"}</Button>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        {ran ? <p className="mb-1 text-[13px] font-medium">{passed} of {steps.length} passed · {fmtDateTime(new Date(ran).toISOString())}</p> : null}
        {steps.map((x, n) => (
          <div key={n} className="grid grid-cols-[18px_1fr] gap-x-2.5 rounded-lg border px-3 py-2 sm:grid-cols-[18px_1fr_auto]">
            <span className="mt-0.5">
              {x.state === "pass" ? <Check className="size-4 text-[#1a7a32]" /> : x.state === "fail" ? <X className="size-4 text-[#dc2626]" />
                : x.state === "run" ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <span className="mt-1.5 block size-1.5 rounded-full bg-black/20" />}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{x.label}</p>
              {x.got ? <p className="text-[12.5px] break-words text-muted-foreground">{x.got}</p> : null}
            </div>
            <span className="col-start-2 text-[12px] text-muted-foreground sm:col-start-3 sm:text-right">
              Expect: {x.expect}{x.ms !== undefined ? ` · ${x.ms} ms` : ""}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------------ API console
const ENDPOINTS: { m: string; p: string; what: string; body?: string }[] = [
  { m: "GET", p: "/api/health", what: "Is the server up and can it read MySQL" },
  { m: "GET", p: "/api/db", what: "Every event, participant, session and registration" },
  { m: "POST", p: "/api/events", what: "Create an event", body: '{"code":"TF26","name":"TechFest","category":"Technical fest","venue":"Main hall","startDate":"2026-12-20","endDate":"2026-12-21","capacity":120,"status":"open","organizer":"Student Council","description":""}' },
  { m: "PUT", p: "/api/events/{id}", what: "Edit an event (capacity can't drop below seats taken)" },
  { m: "DELETE", p: "/api/events/{id}", what: "Delete an event with its sessions and registrations" },
  { m: "POST", p: "/api/participants", what: "Add a participant (email must be unique)", body: '{"name":"Riya Patel","email":"riya@college.edu","phone":"+91 98765 43210","organization":"","department":""}' },
  { m: "PUT · DELETE", p: "/api/participants/{id}", what: "Edit or remove a participant; freed seats go to the waitlist" },
  { m: "POST", p: "/api/registrations", what: "Register: confirmed, or waitlisted once full", body: '{"eventId":"evt_…","participantId":"prt_…","notes":""}' },
  { m: "POST", p: "/api/registrations/{id}/cancel", what: "Cancel and promote the earliest waitlisted person" },
  { m: "POST", p: "/api/registrations/{id}/check-in", what: "Check in a confirmed registration (once)" },
  { m: "POST · PUT · DELETE", p: "/api/sessions[/{id}]", what: "Schedule a session; a room clash is refused" },
]

function Console() {
  const [out, setOut] = useState<Record<string, { text: string; status: number; ms: number } | "busy">>({})
  const base = typeof window !== "undefined" ? window.location.origin : ""
  const send = async (p: string) => {
    setOut((o) => ({ ...o, [p]: "busy" }))
    const r = await request("GET", p.replace(/^\/api/, ""))
    const text = r.body ? JSON.stringify(r.body, null, 2) : (r.error ?? "No JSON body")
    setOut((o) => ({ ...o, [p]: { text: text.length > 4000 ? text.slice(0, 4000) + "\n…" : text, status: r.status, ms: r.ms } }))
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">API</CardTitle>
        <CardDescription>
          JSON in, JSON out. Refusals come back as 400/404/409 with a plain-language <code className="font-mono">message</code>. Base URL: <code className="font-mono break-all">{base}{API}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {ENDPOINTS.map((e) => {
          const res = out[e.p]
          const curl = e.body
            ? `curl -X ${e.m} ${base}${e.p} \\\n  -H 'Content-Type: application/json' \\\n  -d '${e.body}'`
            : e.m === "GET" ? `curl ${base}${e.p}` : null
          return (
            <div key={e.p + e.m} className="grid gap-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11.5px] font-semibold">{e.m}</span>
                <code className="min-w-0 font-mono text-[13px] break-all">{e.p}</code>
                {e.m === "GET" ? (
                  <Button size="sm" variant="outline" className="ms-auto" onClick={() => send(e.p)} disabled={res === "busy"}>
                    {res === "busy" ? <Loader2 className="animate-spin" /> : <Play />} Send
                  </Button>
                ) : null}
              </div>
              <p className="text-[13px] text-muted-foreground">{e.what}</p>
              {curl ? <CopyLine text={curl} /> : null}
              {res && res !== "busy" ? (
                <div className="grid gap-1">
                  <p className="text-[12px] text-muted-foreground">HTTP {res.status || "—"} · {res.ms} ms</p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-[#0b0b0c] p-3 font-mono text-[12px] leading-relaxed text-white/90">{res.text}</pre>
                </div>
              ) : null}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------------ reference
const RULES: [string, string][] = [
  ["Register", "Event must be open. One active registration per person per event. Confirmed while seats are free, waitlisted once full. The event row is locked (SELECT … FOR UPDATE) so two people can’t take the last seat."],
  ["Cancel", "Not allowed after check-in. The freed seat goes to the earliest waitlisted person."],
  ["Check in", "Only a confirmed registration, and only once. Works by ticket code."],
  ["Participants", "Name required, valid email, email unique, phone digits/spaces/+/-. Deleting someone promotes each waitlist they leave."],
  ["Events", "Code 2–8 letters or digits and unique. End date not before start. Capacity ≥ 1 and never below the seats already taken; raising it promotes the waitlist."],
  ["Schedule", "Title and room required. End after start, date inside the event. The same room can’t hold two overlapping sessions on one day."],
]

const TABLES: [string, string][] = [
  ["events", "id, code (unique), name, category, venue, description, start_date, end_date, capacity, status, organizer"],
  ["participants", "id, name, email (unique), phone, organization, department, created_at"],
  ["sessions", "id, event_id → events, title, speaker, room, session_date, start_time, end_time"],
  ["registrations", "id, seq, event_id → events, participant_id → participants, status, ticket_code (unique), notes, registered_at, checked_in_at"],
]

function Reference() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rules the server enforces</CardTitle>
          <CardDescription>Each write runs in one JDBC transaction. The website and the desktop app share this code and this database.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {RULES.map(([k, v]) => (
            <div key={k} className="grid gap-0.5 sm:grid-cols-[110px_1fr] sm:gap-3">
              <p className="text-[14px] font-medium">{k}</p>
              <p className="text-[13.5px] text-muted-foreground">{v}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">MySQL tables</CardTitle>
            <CardDescription>Created on first start from <code className="font-mono">schema.sql</code>.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {TABLES.map(([t, cols]) => (
              <div key={t} className="rounded-lg border p-3">
                <p className="font-mono text-[13px] font-semibold">{t}</p>
                <p className="mt-0.5 font-mono text-[12px] break-words text-muted-foreground">{cols}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Desktop app (JavaFX)</CardTitle>
            <CardDescription>The same records in a JavaFX window over JDBC. Needs JDK 21 and Maven.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <CopyLine text={`git clone ${REPO}.git\ncd eventra/backend`} />
            <CopyLine text={`export DB_URL='jdbc:mysql://127.0.0.1:3306/eventra'\nexport DB_USER=eventra DB_PASSWORD='…'\nmvn javafx:run`} />
            <p className="text-[13px] text-muted-foreground">
              Event handling in the app: button <code className="font-mono">setOnAction</code>, live search listeners, double-click to open, Enter to check in, Ctrl+N / Ctrl+F / Delete shortcuts.
              Source: <a className="font-medium text-[#2b4ea6] hover:underline" href={REPO} target="_blank" rel="noreferrer">github.com/Venkat5599/eventra</a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function BackendPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Backend" description="Java 21 · JDBC · MySQL 8. Check the live server, run the rules against it, and call the API." />
      <Status />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <RuleCheck />
        <Console />
      </div>
      <Reference />
    </div>
  )
}
