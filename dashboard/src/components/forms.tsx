import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { activeCount, useDb, type EventItem, type EventStatus, type Participant, type Session } from "@/lib/db"
import { notify } from "@/lib/format"

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[13px]">{label}</Label>
      {children}
      {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

type Open = { open: boolean; onOpenChange: (o: boolean) => void }

// ------------------------------------------------------------------ event
const EMPTY_EVENT: Omit<EventItem, "id"> = {
  code: "", name: "", category: "Workshop", venue: "", description: "",
  startDate: "2026-12-20", endDate: "2026-12-20", capacity: 50, status: "open", organizer: "",
}
export function EventDialog({ open, onOpenChange, event }: Open & { event?: EventItem }) {
  const saveEvent = useDb((s) => s.saveEvent)
  const [f, setF] = useState<Omit<EventItem, "id">>(EMPTY_EVENT)
  useEffect(() => { if (open) setF(event ? { ...event } : EMPTY_EVENT) }, [open, event])
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    notify(saveEvent({ ...f, id: event?.id, capacity: Number(f.capacity) })).then((r) => r.ok && onOpenChange(false))
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg">{event ? "Edit event" : "New event"}</DialogTitle>
            <DialogDescription>Event details shown to participants and used for capacity checks.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Row label="Event name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="TechFest 2026" autoFocus /></Row>
            <Row label="Code"><Input value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="TF26" maxLength={8} /></Row>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Category">
              <NativeSelect className="w-full" value={f.category} onChange={(e) => set("category", e.target.value)}>
                {["Technical fest", "Workshop", "Competition", "Conference", "Cultural", "Sports", "Career", "Seminar"].map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
              </NativeSelect>
            </Row>
            <Row label="Organizer"><Input value={f.organizer} onChange={(e) => set("organizer", e.target.value)} placeholder="Student Council" /></Row>
          </div>
          <Row label="Venue"><Input value={f.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Main Auditorium" /></Row>
          <div className="grid grid-cols-4 gap-3">
            <Row label="Starts"><Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></Row>
            <Row label="Ends"><Input type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} /></Row>
            <Row label="Capacity"><Input type="number" min={1} value={f.capacity} onChange={(e) => set("capacity", Number(e.target.value))} /></Row>
            <Row label="Status">
              <NativeSelect className="w-full" value={f.status} onChange={(e) => set("status", e.target.value as EventStatus)}>
                {(["draft", "open", "closed", "completed"] as const).map((s) => <NativeSelectOption key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</NativeSelectOption>)}
              </NativeSelect>
            </Row>
          </div>
          <Row label="Description"><Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} /></Row>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{event ? "Save changes" : "Create event"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------------ participant
const EMPTY_P = { name: "", email: "", phone: "", organization: "", department: "" }
export function ParticipantDialog({ open, onOpenChange, participant, onSaved }: Open & { participant?: Participant; onSaved?: (p: Participant) => void }) {
  const save = useDb((s) => s.saveParticipant)
  const [f, setF] = useState(EMPTY_P)
  useEffect(() => { if (open) setF(participant ? { ...participant } : EMPTY_P) }, [open, participant])
  const set = (k: keyof typeof EMPTY_P, v: string) => setF((x) => ({ ...x, [k]: v }))
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    notify(save({ ...f, id: participant?.id })).then((r) => { if (r.ok) { onOpenChange(false); onSaved?.(r.value) } })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg">{participant ? "Edit participant" : "New participant"}</DialogTitle>
            <DialogDescription>Personal details kept in the participant record. Email must be unique.</DialogDescription>
          </DialogHeader>
          <Row label="Full name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Row>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Email"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="name@college.edu" /></Row>
            <Row label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" /></Row>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Row label="College / organization"><Input value={f.organization} onChange={(e) => set("organization", e.target.value)} /></Row>
            <Row label="Department"><Input value={f.department} onChange={(e) => set("department", e.target.value)} /></Row>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{participant ? "Save changes" : "Add participant"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------------ registration
export function RegisterDialog({ open, onOpenChange, eventId }: Open & { eventId?: string }) {
  const db = useDb()
  const openEvents = db.events.filter((e) => e.status === "open")
  const [ev, setEv] = useState("")
  const [pid, setPid] = useState("")
  const [q, setQ] = useState("")
  const [notes, setNotes] = useState("")
  const [newOpen, setNewOpen] = useState(false)
  useEffect(() => { if (open) { setEv(eventId ?? openEvents[0]?.id ?? ""); setPid(""); setQ(""); setNotes("") } }, [open]) // eslint-disable-line
  const taken = useMemo(() => new Set(db.registrations.filter((r) => r.eventId === ev && r.status !== "cancelled").map((r) => r.participantId)), [db.registrations, ev])
  const matches = db.participants
    .filter((p) => !q || (p.name + " " + p.email).toLowerCase().includes(q.toLowerCase()))
    .slice(0, 6)
  const sel = db.events.find((e) => e.id === ev)
  const used = sel ? activeCount(db, sel.id) : 0
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    notify(db.register(ev, pid, notes)).then((r) => r.ok && onOpenChange(false))
  }
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle className="text-lg">Register a participant</DialogTitle>
              <DialogDescription>Confirmed while seats are free. Once the event is full, new registrations join the waitlist.</DialogDescription>
            </DialogHeader>
            <Row label="Event" hint={sel ? `${used} of ${sel.capacity} seats taken${used >= sel.capacity ? " — will be waitlisted" : ""}` : undefined}>
              <NativeSelect className="w-full" value={ev} onChange={(e) => setEv(e.target.value)}>
                {openEvents.map((e) => <NativeSelectOption key={e.id} value={e.id}>{e.name}</NativeSelectOption>)}
              </NativeSelect>
            </Row>
            <Row label="Participant">
              <Input value={q} onChange={(e) => { setQ(e.target.value); setPid("") }} placeholder="Search by name or email" />
              <div className="mt-1 grid max-h-56 gap-1 overflow-y-auto">
                {matches.map((p) => {
                  const dup = taken.has(p.id)
                  return (
                    <button type="button" key={p.id} disabled={dup} onClick={() => { setPid(p.id); setQ(p.name) }}
                      className={"flex items-center justify-between rounded-lg border px-3 py-2 text-left text-[13px] transition-colors disabled:opacity-50 " + (pid === p.id ? "border-[#2563eb] bg-[#2563eb]/5" : "hover:bg-muted")}>
                      <span><span className="font-medium">{p.name}</span> <span className="text-muted-foreground">· {p.email}</span></span>
                      {dup ? <span className="text-[11px] text-muted-foreground">Already registered</span> : null}
                    </button>
                  )
                })}
                {!matches.length ? <p className="text-[13px] text-muted-foreground">No participant matches “{q}”.</p> : null}
              </div>
              <button type="button" className="mt-1 w-fit text-[13px] font-medium text-[#2b4ea6] hover:underline" onClick={() => setNewOpen(true)}>
                + Add a new participant
              </button>
            </Row>
            <Row label="Notes (optional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Veg lunch, needs parking…" /></Row>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={!ev || !pid}>Register</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ParticipantDialog open={newOpen} onOpenChange={setNewOpen} onSaved={(p) => { setPid(p.id); setQ(p.name) }} />
    </>
  )
}

// ------------------------------------------------------------------ session
export function SessionDialog({ open, onOpenChange, session, eventId }: Open & { session?: Session; eventId?: string }) {
  const events = useDb((s) => s.events)
  const save = useDb((s) => s.saveSession)
  const blank = (eid: string): Omit<Session, "id"> => {
    const e = events.find((x) => x.id === eid) ?? events[0]
    return { eventId: e?.id ?? "", title: "", speaker: "", room: "", date: e?.startDate ?? "", start: "10:00", end: "11:00" }
  }
  const [f, setF] = useState<Omit<Session, "id">>(blank(eventId ?? ""))
  useEffect(() => { if (open) setF(session ? { ...session } : blank(eventId ?? events[0]?.id ?? "")) }, [open, session]) // eslint-disable-line
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const ev = events.find((e) => e.id === f.eventId)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    notify(save({ ...f, id: session?.id })).then((r) => r.ok && onOpenChange(false))
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg">{session ? "Edit session" : "Add to schedule"}</DialogTitle>
            <DialogDescription>Rooms can’t be double-booked. A clash with another session is refused.</DialogDescription>
          </DialogHeader>
          <Row label="Event">
            <NativeSelect className="w-full" value={f.eventId} onChange={(e) => { const x = events.find((y) => y.id === e.target.value); setF((o) => ({ ...o, eventId: e.target.value, date: x?.startDate ?? o.date })) }}>
              {events.map((e) => <NativeSelectOption key={e.id} value={e.id}>{e.name}</NativeSelectOption>)}
            </NativeSelect>
          </Row>
          <Row label="Session title"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Opening keynote" autoFocus /></Row>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Speaker / host"><Input value={f.speaker} onChange={(e) => set("speaker", e.target.value)} /></Row>
            <Row label="Room"><Input value={f.room} onChange={(e) => set("room", e.target.value)} placeholder="Hall A" /></Row>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Row label="Date" hint={ev ? `${ev.startDate} → ${ev.endDate}` : undefined}>
              <Input type="date" min={ev?.startDate} max={ev?.endDate} value={f.date} onChange={(e) => set("date", e.target.value)} />
            </Row>
            <Row label="Starts"><Input type="time" value={f.start} onChange={(e) => set("start", e.target.value)} /></Row>
            <Row label="Ends"><Input type="time" value={f.end} onChange={(e) => set("end", e.target.value)} /></Row>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{session ? "Save changes" : "Add session"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------------ confirm
export function ConfirmDialog({ open, onOpenChange, title, body, action, onConfirm }: Open & { title: string; body: string; action: string; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep</Button>
          <Button variant="destructive" onClick={() => { onConfirm(); onOpenChange(false) }}>{action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
