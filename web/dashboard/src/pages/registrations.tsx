import { useState } from "react"
import { Plus, ScanLine } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDb, type RegStatus } from "@/lib/db"
import { downloadCsv, fmtDateTime, notify, plural } from "@/lib/format"
import { Initials, PageHeader, RegBadge } from "@/components/bits"
import { RegisterDialog } from "@/components/forms"

export function RegistrationsPage() {
  const db = useDb()
  const [q, setQ] = useState("")
  const [ev, setEv] = useState("all")
  const [st, setSt] = useState<"all" | RegStatus>("all")
  const [reg, setReg] = useState(false)
  const [ticket, setTicket] = useState("")
  const person = (id: string) => db.participants.find((p) => p.id === id)
  const event = (id: string) => db.events.find((e) => e.id === id)
  const rows = db.registrations
    .filter((r) => ev === "all" || r.eventId === ev)
    .filter((r) => st === "all" || r.status === st)
    .filter((r) => {
      if (!q) return true
      const p = person(r.participantId)
      return `${p?.name} ${p?.email} ${r.ticketCode}`.toLowerCase().includes(q.toLowerCase())
    })
    .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
  const shown = rows.slice(0, 200)

  const checkInByTicket = (e: React.FormEvent) => {
    e.preventDefault()
    const r = db.registrations.find((x) => x.ticketCode.toUpperCase() === ticket.trim().toUpperCase())
    if (!r) { notify({ ok: false, message: `No registration with ticket ${ticket.trim().toUpperCase()}.` }); return }
    notify(db.checkIn(r.id)).then((x) => x.ok && setTicket(""))
  }

  const exportCsv = () => downloadCsv("registrations.csv", [
    ["Ticket", "Event", "Name", "Email", "Status", "Registered at", "Checked in at", "Notes"],
    ...rows.map((r) => [r.ticketCode, event(r.eventId)?.name ?? "", person(r.participantId)?.name ?? "", person(r.participantId)?.email ?? "", r.status, r.registeredAt, r.checkedInAt ?? "", r.notes]),
  ])

  return (
    <div className="grid gap-6">
      <PageHeader title="Registrations" description="Participant registration across every event: confirm, waitlist, cancel and check in.">
        <form onSubmit={checkInByTicket} className="flex w-full items-center gap-2 sm:w-auto">
          <Input className="min-w-0 flex-1 font-mono sm:w-44 sm:flex-none" placeholder="Ticket, e.g. TF26-1003" value={ticket} onChange={(e) => setTicket(e.target.value)} />
          <Button type="submit" variant="outline"><ScanLine /> Check in</Button>
        </form>
        <Button onClick={() => setReg(true)}><Plus /> Register participant</Button>
      </PageHeader>
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Input className="w-full sm:max-w-xs" placeholder="Search name, email or ticket" value={q} onChange={(e) => setQ(e.target.value)} />
          <NativeSelect value={ev} onChange={(e) => setEv(e.target.value)}>
            <NativeSelectOption value="all">All events</NativeSelectOption>
            {db.events.map((e) => <NativeSelectOption key={e.id} value={e.id}>{e.name}</NativeSelectOption>)}
          </NativeSelect>
          <NativeSelect value={st} onChange={(e) => setSt(e.target.value as typeof st)}>
            <NativeSelectOption value="all">Any status</NativeSelectOption>
            <NativeSelectOption value="confirmed">Confirmed</NativeSelectOption>
            <NativeSelectOption value="checked_in">Checked in</NativeSelectOption>
            <NativeSelectOption value="waitlisted">Waitlist</NativeSelectOption>
            <NativeSelectOption value="cancelled">Cancelled</NativeSelectOption>
          </NativeSelect>
          <span className="ms-auto text-[13px] text-muted-foreground">{rows.length > shown.length ? `First ${shown.length} of ${rows.length}` : plural(rows.length, "registration")}</span>
          <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">Participant</TableHead>
              <TableHead className="hidden md:table-cell">Event</TableHead>
              <TableHead className="hidden lg:table-cell">Ticket</TableHead>
              <TableHead className="hidden lg:table-cell">Registered</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pe-4 text-right"><span className="sr-only sm:not-sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => {
              const p = person(r.participantId)
              const e = event(r.eventId)
              return (
                <TableRow key={r.id}>
                  <TableCell className="ps-4">
                    <div className="flex items-center gap-2.5">
                      <Initials name={p?.name ?? "?"} />
                      <div className="min-w-0"><p className="font-medium">{p?.name}</p><p className="truncate text-[12px] text-muted-foreground">{p?.email}</p><p className="text-[12px] text-muted-foreground lg:hidden"><span className="md:hidden">{e?.name} · </span><span className="font-mono">{r.ticketCode}</span></p></div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell"><a className="text-[13px] font-medium hover:underline" href={`#/events/${r.eventId}`}>{e?.name}</a></TableCell>
                  <TableCell className="hidden font-mono text-[12.5px] lg:table-cell">{r.ticketCode}</TableCell>
                  <TableCell className="hidden text-[13px] lg:table-cell">{fmtDateTime(r.registeredAt)}{r.checkedInAt ? <span className="block text-[12px] text-muted-foreground">in at {fmtDateTime(r.checkedInAt)}</span> : null}</TableCell>
                  <TableCell><RegBadge status={r.status} /></TableCell>
                  <TableCell className="pe-4 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {r.status === "confirmed" ? <Button size="sm" variant="secondary" onClick={() => notify(db.checkIn(r.id))}>Check in</Button> : null}
                      {r.status === "confirmed" || r.status === "waitlisted" ? <Button size="sm" variant="ghost" onClick={() => notify(db.cancel(r.id))}>Cancel</Button> : null}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {!shown.length ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No registrations match.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Card>
      <RegisterDialog open={reg} onOpenChange={setReg} eventId={ev !== "all" ? ev : undefined} />
    </div>
  )
}
