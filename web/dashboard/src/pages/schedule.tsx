import { useState } from "react"
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { sessionClashes, useDb, type Session } from "@/lib/db"
import { fmtDay, notify, plural } from "@/lib/format"
import { PageHeader } from "@/components/bits"
import { ConfirmDialog, SessionDialog } from "@/components/forms"

const COLORS = ["#2563eb", "#7c3aed", "#0f766e", "#ea580c", "#db2777", "#ca8a04", "#111827"]

export function SchedulePage() {
  const db = useDb()
  const [ev, setEv] = useState("all")
  const [edit, setEdit] = useState<{ open: boolean; s?: Session }>({ open: false })
  const [del, setDel] = useState<Session | null>(null)
  const color = (eid: string) => COLORS[Math.max(0, db.events.findIndex((e) => e.id === eid)) % COLORS.length]
  const sessions = db.sessions.filter((s) => ev === "all" || s.eventId === ev).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  const days = [...new Set(sessions.map((s) => s.date))]
  const clashes = db.sessions.filter((s) => sessionClashes(db, s).length).length

  return (
    <div className="grid gap-6">
      <PageHeader title="Schedule" description="Event schedules by day. Rooms can’t be double-booked.">
        <NativeSelect value={ev} onChange={(e) => setEv(e.target.value)}>
          <NativeSelectOption value="all">All events</NativeSelectOption>
          {db.events.map((e) => <NativeSelectOption key={e.id} value={e.id}>{e.name}</NativeSelectOption>)}
        </NativeSelect>
        <Button onClick={() => setEdit({ open: true })}><Plus /> Add session</Button>
      </PageHeader>

      {clashes ? (
        <div className="flex items-center gap-2 rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-4 py-3 text-[14px] text-[#92400e]">
          <AlertTriangle className="size-4" /> {plural(clashes, "session")} share a room at the same time. Edit one of them to clear the clash.
        </div>
      ) : null}

      {days.map((d) => (
        <Card key={d} className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{fmtDay(d)}</CardTitle>
            <span className="text-[13px] text-muted-foreground">{plural(sessions.filter((s) => s.date === d).length, "session")}</span>
          </CardHeader>
          <CardContent className="grid gap-2">
            {sessions.filter((s) => s.date === d).map((s) => {
              const e = db.events.find((x) => x.id === s.eventId)
              const clash = sessionClashes(db, s)
              return (
                <div key={s.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-xl border p-3 sm:grid-cols-[110px_1fr_auto]">
                  <div className="num text-[14px] font-medium">{s.start}<span className="text-muted-foreground">–{s.end}</span></div>
                  <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-3 sm:col-span-1 sm:row-start-auto">
                    <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: color(s.eventId) }} />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-medium">{s.title}</p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        <a className="hover:underline" href={`#/events/${s.eventId}`}>{e?.name}</a>{[s.speaker, s.room].filter(Boolean).map((x) => ` · ${x}`).join("")}
                      </p>
                      {clash.length ? <p className="mt-0.5 text-[12px] font-medium text-[#b45309]">Clashes with “{clash[0].title}” in {s.room}</p> : null}
                    </div>
                  </div>
                  <div className="col-start-2 row-start-1 flex gap-1 sm:col-start-auto sm:row-start-auto">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.title}`} onClick={() => setEdit({ open: true, s })}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${s.title}`} onClick={() => setDel(s)}><Trash2 /></Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}
      {!days.length ? <p className="py-10 text-center text-muted-foreground">No sessions scheduled yet.</p> : null}

      <SessionDialog open={edit.open} session={edit.s} eventId={ev !== "all" ? ev : undefined} onOpenChange={(o) => setEdit((x) => ({ ...x, open: o }))} />
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`Remove ${del?.title}?`} action="Remove session"
        body="The session is taken off the event schedule." onConfirm={() => del && notify(db.deleteSession(del.id))} />
    </div>
  )
}
