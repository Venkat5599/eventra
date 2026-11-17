"use client"

import { useRef, useState } from "react"
import { Download, ExternalLink, RefreshCw, RotateCcw, Upload } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { exportDb, useDb } from "@/lib/db"
import { downloadJson, fmtDateTime, notify } from "@/lib/format"
import { PageHeader } from "@/components/bits"
import { ConfirmDialog } from "@/components/forms"

const ENDPOINTS: [string, string, string][] = [
  ["GET", "/api/db", "Everything the dashboard shows"],
  ["POST / PUT", "/api/events[/{id}]", "Create or edit an event"],
  ["DELETE", "/api/events/{id}", "Delete event, its sessions and registrations"],
  ["POST / PUT", "/api/participants[/{id}]", "Add or edit a participant (unique email)"],
  ["DELETE", "/api/participants/{id}", "Remove a participant record"],
  ["POST", "/api/registrations", "Register: confirmed, or waitlisted when full"],
  ["POST", "/api/registrations/{id}/cancel", "Cancel and promote the waitlist"],
  ["POST", "/api/registrations/{id}/check-in", "Check in a confirmed registration"],
  ["POST / PUT / DELETE", "/api/sessions[/{id}]", "Event schedule, with room-clash check"],
]

export function DataPage() {
  const db = useDb()
  const file = useRef<HTMLInputElement>(null)
  const [reset, setReset] = useState(false)
  const live = db.mode === "server"
  const counts = [
    ["Events", db.events.length], ["Participants", db.participants.length],
    ["Sessions", db.sessions.length], ["Registrations", db.registrations.length],
  ] as const

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    try { notify(db.importDb(JSON.parse(await f.text()))) } catch { notify({ ok: false, message: "That file isn't valid JSON." }) }
    e.target.value = ""
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Data & backend" description="Where the records live and how the dashboard talks to the Java backend." />
      <div className="grid grid-cols-[1fr_1.4fr] items-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{live ? "MySQL database" : "Offline copy in this browser"}</CardTitle>
            <CardDescription>
              {live
                ? <>Every record comes from the backend’s MySQL database through JDBC. Changes made here are saved there and shown to everyone.{db.lastSync ? ` Last read ${fmtDateTime(new Date(db.lastSync).toISOString())}.` : ""}</>
                : <>The server couldn’t be reached, so the dashboard is running on a local copy saved in this browser (<code className="font-mono">localStorage</code>). The same rules apply.</>}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-4 gap-2">
              {counts.map(([k, v]) => (
                <div key={k} className="rounded-xl border p-3">
                  <p className="num text-[22px] font-semibold">{v}</p>
                  <p className="text-[12px] text-muted-foreground">{k}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => downloadJson("eventra-export.json", exportDb())}><Download /> Export JSON</Button>
              {live ? (
                <Button variant="outline" onClick={() => db.refresh().then(() => notify({ ok: true, value: undefined, message: "Reloaded from the database." }))}><RefreshCw /> Reload</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => file.current?.click()}><Upload /> Import JSON</Button>
                  <Button variant="destructive" onClick={() => setReset(true)}><RotateCcw /> Reset sample data</Button>
                  <input ref={file} type="file" accept="application/json" className="hidden" onChange={onFile} />
                </>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">{live ? "Backend: connected" : "Backend: not reachable"}</CardTitle>
              <CardDescription>Java 21 (JDK HttpServer) + JDBC on MySQL 8. Every write runs in one transaction with the event row locked, so capacity holds when people register at the same time.</CardDescription>
            </div>
            <Button size="sm" variant="outline" render={<a href="/BACKEND.md" target="_blank" rel="noreferrer" />} nativeButton={false}>Backend guide <ExternalLink /></Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Method</TableHead><TableHead>Path</TableHead><TableHead>Used for</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {ENDPOINTS.map(([m, p, u]) => (
                  <TableRow key={p + m}>
                    <TableCell className="font-mono text-[12px]">{m}</TableCell>
                    <TableCell className="font-mono text-[12px]">{p}</TableCell>
                    <TableCell className="text-[13px] whitespace-normal">{u}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog open={reset} onOpenChange={setReset} title="Reset to sample data?" action="Reset"
        body="Every event, participant, session and registration in this browser is replaced with the sample set."
        onConfirm={() => { db.resetSample().then(() => notify({ ok: true, value: undefined, message: "Sample data restored." })) }} />
    </div>
  )
}
