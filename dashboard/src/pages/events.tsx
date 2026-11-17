import { useState } from "react"
import { ArrowLeft, CalendarPlus, MapPin, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { activeCount, sessionClashes, useDb, type EventItem } from "@/lib/db"
import { downloadCsv, fmtDateTime, fmtDay, fmtRange, notify, pct } from "@/lib/format"
import { go } from "@/lib/router"
import { EventBadge, Initials, PageHeader, RegBadge } from "@/components/bits"
import { ConfirmDialog, EventDialog, RegisterDialog, SessionDialog } from "@/components/forms"

export function EventsPage() {
  const db = useDb()
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("all")
  const [edit, setEdit] = useState<{ open: boolean; event?: EventItem }>({ open: false })
  const rows = db.events
    .filter((e) => status === "all" || e.status === status)
    .filter((e) => !q || `${e.name} ${e.code} ${e.venue} ${e.category}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
  return (
    <div className="grid gap-6">
      <PageHeader title="Events" description="Event details, capacity and status. Open an event to manage its registrations and schedule.">
        <Button onClick={() => setEdit({ open: true })}><Plus /> New event</Button>
      </PageHeader>
      <Card className="gap-0 py-0">
        <div className="flex items-center gap-2 border-b p-3">
          <Input className="max-w-xs" placeholder="Search events" value={q} onChange={(e) => setQ(e.target.value)} />
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
            <NativeSelectOption value="all">All statuses</NativeSelectOption>
            {["open", "draft", "closed", "completed"].map((s) => <NativeSelectOption key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</NativeSelectOption>)}
          </NativeSelect>
          <span className="ms-auto text-[13px] text-muted-foreground">{rows.length} of {db.events.length}</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">Event</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead className="w-[220px]">Seats</TableHead>
              <TableHead>Waitlist</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pe-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => {
              const used = activeCount(db, e.id)
              const wait = db.registrations.filter((r) => r.eventId === e.id && r.status === "waitlisted").length
              return (
                <TableRow key={e.id} className="cursor-pointer" onClick={() => go(`/events/${e.id}`)}>
                  <TableCell className="ps-4">
                    <p className="font-medium">{e.name}</p>
                    <p className="text-[12px] text-muted-foreground">{e.code} · {e.category}</p>
                  </TableCell>
                  <TableCell className="text-[13px]">{fmtRange(e.startDate, e.endDate)}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-[13px]">{e.venue}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct(used, e.capacity))}%`, background: used >= e.capacity ? "#f59e0b" : "#2563eb" }} />
                      </div>
                      <span className="num w-14 text-right text-[12.5px] text-muted-foreground">{used}/{e.capacity}</span>
                    </div>
                  </TableCell>
                  <TableCell className="num text-[13px]">{wait || "—"}</TableCell>
                  <TableCell><EventBadge status={e.status} /></TableCell>
                  <TableCell className="pe-4 text-right" onClick={(ev) => ev.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${e.name}`} onClick={() => setEdit({ open: true, event: e })}><Pencil /></Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {!rows.length ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No events match.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Card>
      <EventDialog open={edit.open} event={edit.event} onOpenChange={(o) => setEdit((x) => ({ ...x, open: o }))} />
    </div>
  )
}

export function EventDetailPage({ id }: { id: string }) {
  const db = useDb()
  const e = db.events.find((x) => x.id === id)
  const [edit, setEdit] = useState(false)
  const [del, setDel] = useState(false)
  const [reg, setReg] = useState(false)
  const [ses, setSes] = useState(false)
  const [filter, setFilter] = useState("active")
  if (!e) {
    return (
      <div className="grid gap-4">
        <PageHeader title="Event not found" description="It may have been deleted." />
        <Button className="w-fit" variant="outline" render={<a href="#/events" />} nativeButton={false}><ArrowLeft /> Back to events</Button>
      </div>
    )
  }
  const used = activeCount(db, e.id)
  const regs = db.registrations.filter((r) => r.eventId === e.id)
  const checked = regs.filter((r) => r.status === "checked_in").length
  const wait = regs.filter((r) => r.status === "waitlisted").length
  const shown = regs
    .filter((r) => filter === "all" || (filter === "active" ? r.status === "confirmed" || r.status === "checked_in" : r.status === filter))
    .sort((a, b) => a.registeredAt.localeCompare(b.registeredAt))
  const sessions = db.sessions.filter((s) => s.eventId === e.id).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  const person = (pid: string) => db.participants.find((p) => p.id === pid)

  const exportCsv = () => downloadCsv(`${e.code}-registrations.csv`, [
    ["Ticket", "Name", "Email", "Phone", "Organization", "Status", "Registered at", "Checked in at"],
    ...regs.map((r) => { const p = person(r.participantId); return [r.ticketCode, p?.name ?? "", p?.email ?? "", p?.phone ?? "", p?.organization ?? "", r.status, r.registeredAt, r.checkedInAt ?? ""] }),
  ])

  return (
    <div className="grid gap-6">
      <a href="#/events" className="flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Events</a>
      <PageHeader title={e.name} description={`${e.code} · ${e.category} · organized by ${e.organizer || "—"}`}>
        <Button variant="outline" onClick={() => setEdit(true)}><Pencil /> Edit</Button>
        <Button variant="destructive" onClick={() => setDel(true)}><Trash2 /> Delete</Button>
        <Button onClick={() => setReg(true)} disabled={e.status !== "open"}><UserPlus /> Register participant</Button>
      </PageHeader>

      <div className="grid grid-cols-[1.3fr_1fr] gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Event details</CardTitle>
            <EventBadge status={e.status} />
          </CardHeader>
          <CardContent className="grid gap-3 text-[14px]">
            <p className="text-muted-foreground">{e.description || "No description yet."}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2"><CalendarPlus className="size-4 text-muted-foreground" /> {fmtRange(e.startDate, e.endDate)}</div>
              <div className="flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" /> {e.venue || "—"}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Capacity</CardTitle><CardDescription>{used} of {e.capacity} seats taken</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct(used, e.capacity))}%`, background: used >= e.capacity ? "#f59e0b" : "#2563eb" }} />
            </div>
            <div className="grid grid-cols-3 text-center">
              <div><p className="num text-[22px] font-semibold">{Math.max(0, e.capacity - used)}</p><p className="text-[12px] text-muted-foreground">Seats left</p></div>
              <div><p className="num text-[22px] font-semibold">{checked}</p><p className="text-[12px] text-muted-foreground">Checked in</p></div>
              <div><p className="num text-[22px] font-semibold">{wait}</p><p className="text-[12px] text-muted-foreground">Waitlist</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <div className="flex items-center gap-2 border-b p-3">
          <p className="ps-1 text-[15px] font-semibold">Participants</p>
          <NativeSelect className="ms-3" value={filter} onChange={(x) => setFilter(x.target.value)}>
            <NativeSelectOption value="active">Confirmed + checked in</NativeSelectOption>
            <NativeSelectOption value="waitlisted">Waitlist</NativeSelectOption>
            <NativeSelectOption value="cancelled">Cancelled</NativeSelectOption>
            <NativeSelectOption value="all">Everyone</NativeSelectOption>
          </NativeSelect>
          <span className="ms-auto text-[13px] text-muted-foreground">{shown.length} shown</span>
          <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
        </div>
        <div className="max-h-[460px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-4">Participant</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pe-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => {
                const p = person(r.participantId)
                return (
                  <TableRow key={r.id}>
                    <TableCell className="ps-4">
                      <div className="flex items-center gap-2.5">
                        <Initials name={p?.name ?? "?"} />
                        <div><p className="font-medium">{p?.name}</p><p className="text-[12px] text-muted-foreground">{p?.email}</p></div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[12.5px]">{r.ticketCode}</TableCell>
                    <TableCell className="text-[13px]">{fmtDateTime(r.registeredAt)}</TableCell>
                    <TableCell><RegBadge status={r.status} /></TableCell>
                    <TableCell className="pe-4 text-right">
                      <div className="flex justify-end gap-1">
                        {r.status === "confirmed" ? <Button size="sm" variant="secondary" onClick={() => notify(db.checkIn(r.id))}>Check in</Button> : null}
                        {r.status === "confirmed" || r.status === "waitlisted" ? <Button size="sm" variant="ghost" onClick={() => notify(db.cancel(r.id))}>Cancel</Button> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {!shown.length ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground"><Users className="mx-auto mb-2 size-5" />Nobody here yet.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div><CardTitle className="text-base">Schedule</CardTitle><CardDescription>{sessions.length} sessions</CardDescription></div>
          <Button size="sm" variant="outline" onClick={() => setSes(true)}><Plus /> Add session</Button>
        </CardHeader>
        <CardContent className="grid">
          {sessions.map((s) => {
            const clash = sessionClashes(db, s)
            return (
              <div key={s.id} className="grid grid-cols-[150px_110px_1fr_auto] items-center gap-3 border-b py-2.5 text-[14px] last:border-0">
                <span className="font-medium">{fmtDay(s.date)}</span>
                <span className="num text-muted-foreground">{s.start}–{s.end}</span>
                <span><span className="font-medium">{s.title}</span> <span className="text-muted-foreground">· {s.speaker} · {s.room}</span></span>
                {clash.length ? <span className="text-[12px] font-medium text-[#b45309]">Clashes with {clash[0].title}</span> : <span />}
              </div>
            )
          })}
          {!sessions.length ? <p className="py-6 text-center text-[14px] text-muted-foreground">No sessions scheduled.</p> : null}
        </CardContent>
      </Card>

      <EventDialog open={edit} onOpenChange={setEdit} event={e} />
      <RegisterDialog open={reg} onOpenChange={setReg} eventId={e.id} />
      <SessionDialog open={ses} onOpenChange={setSes} eventId={e.id} />
      <ConfirmDialog open={del} onOpenChange={setDel} title={`Delete ${e.name}?`} action="Delete event"
        body={`This removes the event, its ${sessions.length} sessions and ${regs.length} registrations. Participant records stay.`}
        onConfirm={() => { notify(db.deleteEvent(e.id)).then((r) => r.ok && go("/events")) }} />
    </div>
  )
}
