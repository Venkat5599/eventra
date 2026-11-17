import { useState } from "react"
import { Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDb, type Participant } from "@/lib/db"
import { downloadCsv, fmtDate, fmtDateTime, notify } from "@/lib/format"
import { Initials, PageHeader, RegBadge } from "@/components/bits"
import { ConfirmDialog, ParticipantDialog } from "@/components/forms"

export function ParticipantsPage() {
  const db = useDb()
  const [q, setQ] = useState("")
  const [edit, setEdit] = useState<{ open: boolean; p?: Participant }>({ open: false })
  const [view, setView] = useState<string | null>(null)
  const [del, setDel] = useState<Participant | null>(null)
  const regsOf = (id: string) => db.registrations.filter((r) => r.participantId === id)
  const rows = db.participants
    .filter((p) => !q || `${p.name} ${p.email} ${p.phone} ${p.organization} ${p.department}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  const viewing = db.participants.find((p) => p.id === view)

  const exportCsv = () => downloadCsv("participants.csv", [
    ["ID", "Name", "Email", "Phone", "Organization", "Department", "Registrations", "Created"],
    ...rows.map((p) => [p.id, p.name, p.email, p.phone, p.organization, p.department, regsOf(p.id).length, p.createdAt]),
  ])

  return (
    <div className="grid gap-6">
      <PageHeader title="Participants" description="Participant records: personal details and every event they registered for.">
        <Button onClick={() => setEdit({ open: true })}><Plus /> New participant</Button>
      </PageHeader>
      <Card className="gap-0 py-0">
        <div className="flex items-center gap-2 border-b p-3">
          <Input className="max-w-sm" placeholder="Search name, email, phone, college" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="ms-auto text-[13px] text-muted-foreground">{rows.length} of {db.participants.length}</span>
          <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>College / organization</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Events</TableHead>
              <TableHead className="pe-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const n = regsOf(p.id).filter((r) => r.status !== "cancelled").length
              return (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setView(p.id)}>
                  <TableCell className="ps-4">
                    <div className="flex items-center gap-2.5">
                      <Initials name={p.name} />
                      <div><p className="font-medium">{p.name}</p><p className="text-[12px] text-muted-foreground">{p.email}</p></div>
                    </div>
                  </TableCell>
                  <TableCell className="num text-[13px]">{p.phone || "—"}</TableCell>
                  <TableCell className="text-[13px]">{p.organization || "—"}</TableCell>
                  <TableCell className="text-[13px]">{p.department || "—"}</TableCell>
                  <TableCell className="num text-[13px]">{n}</TableCell>
                  <TableCell className="pe-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => setEdit({ open: true, p })}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${p.name}`} onClick={() => setDel(p)}><Trash2 /></Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {!rows.length ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No participants match.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!viewing} onOpenChange={(o) => !o && setView(null)}>
        <SheetContent className="w-[440px] sm:max-w-[440px]">
          {viewing ? (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <Initials name={viewing.name} className="size-11 text-[14px]" />
                  <div>
                    <SheetTitle className="text-lg">{viewing.name}</SheetTitle>
                    <SheetDescription>{viewing.organization} · {viewing.department}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="grid gap-2 px-4 text-[14px]">
                <p className="flex items-center gap-2"><Mail className="size-4 text-muted-foreground" /> {viewing.email}</p>
                <p className="flex items-center gap-2"><Phone className="size-4 text-muted-foreground" /> {viewing.phone || "—"}</p>
                <p className="text-[12.5px] text-muted-foreground">Record created {fmtDate(viewing.createdAt.slice(0, 10))} · {viewing.id}</p>
              </div>
              <div className="grid gap-2 overflow-y-auto px-4 pb-4">
                <p className="mt-2 text-[13px] font-semibold">Registration history</p>
                {regsOf(viewing.id).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt)).map((r) => {
                  const e = db.events.find((x) => x.id === r.eventId)
                  return (
                    <a key={r.id} href={`#/events/${r.eventId}`} onClick={() => setView(null)} className="flex items-center justify-between rounded-xl border p-3 hover:bg-muted/60">
                      <div>
                        <p className="text-[14px] font-medium">{e?.name}</p>
                        <p className="text-[12px] text-muted-foreground">{r.ticketCode} · {fmtDateTime(r.registeredAt)}</p>
                      </div>
                      <RegBadge status={r.status} />
                    </a>
                  )
                })}
                {!regsOf(viewing.id).length ? <p className="text-[13px] text-muted-foreground">No registrations yet.</p> : null}
                <Button variant="outline" className="mt-2" onClick={() => setEdit({ open: true, p: viewing })}><Pencil /> Edit details</Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ParticipantDialog open={edit.open} participant={edit.p} onOpenChange={(o) => setEdit((x) => ({ ...x, open: o }))} />
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`Delete ${del?.name}?`} action="Delete participant"
        body="This removes the participant record and all their registrations. Freed seats go to the next person on each waitlist."
        onConfirm={() => del && notify(db.deleteParticipant(del.id))} />
    </div>
  )
}
