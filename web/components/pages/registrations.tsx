"use client"

import { useState } from "react"
import { Plus, ScanLine } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDb, type RegStatus } from "@/lib/db"
import { downloadCsv, fmtDateTime, notify } from "@/lib/format"
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
        <form onSubmit={checkInByTicket} className="flex items-center gap-2">
          <Input className="w-44 font-mono" placeholder="Ticket, e.g. TF26-1003" value={ticket} onChange={(e) => setTicket(e.target.value)} />
          <Button type="submit" variant="outline"><ScanLine /> Check in</Button>
        </form>
        <Button onClick={() => setReg(true)}><Plus /> Register participant</Button>
      </PageHeader>
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Input className="max-w-xs" placeholder="Search name, email or ticket" value={q} onChange={(e) => setQ(e.target.value)} />
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
          <span className="ms-auto text-[13px] text-muted-foreground">{rows.length > shown.length ? `First ${shown.length} of ${rows.length}` : `${rows.length} registrations`}</span>
          <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">Participant</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Ticket</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pe-4 text-right">Actions</TableHead>
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
                      <div><p className="font-medium">{p?.name}</p><p className="text-[12px] text-muted-foreground">{p?.email}</p></div>
                    </div>
                  </TableCell>
                  <TableCell><a className="text-[13px] font-medium hover:underline" href={`/dashboard/events/${r.eventId}`}>{e?.name}</a></TableCell>
                  <TableCell className="font-mono text-[12.5px]">{r.ticketCode}</TableCell>
                  <TableCell className="text-[13px]">{fmtDateTime(r.registeredAt)}{r.checkedInAt ? <span className="block text-[12px] text-muted-foreground">in at {fmtDateTime(r.checkedInAt)}</span> : null}</TableCell>
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
            {!shown.length ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No registrations match.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Card>
      <RegisterDialog open={reg} onOpenChange={setReg} eventId={ev !== "all" ? ev : undefined} />
    </div>
  )
}
