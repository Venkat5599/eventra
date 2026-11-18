import { useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { CalendarClock, CheckCircle2, ClipboardList, Hourglass, Plus, Ticket } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { activeCount, useDb } from "@/lib/db"
import { fmtDateTime, fmtDay, pct, plural } from "@/lib/format"
import { EventBadge, Initials, PageHeader, RegBadge } from "@/components/bits"
import { RegisterDialog } from "@/components/forms"

const chartConfig = { count: { label: "Registrations", color: "#2563eb" } } satisfies ChartConfig

export function OverviewPage() {
  const db = useDb()
  const [reg, setReg] = useState(false)
  const live = db.registrations.filter((r) => r.status === "confirmed" || r.status === "checked_in")
  const checked = db.registrations.filter((r) => r.status === "checked_in").length
  const wait = db.registrations.filter((r) => r.status === "waitlisted").length
  const open = db.events.filter((e) => e.status === "open")

  // registrations per day over the 30 days ending at the latest registration
  const series = useMemo(() => {
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const times = db.registrations.map((r) => Date.parse(r.registeredAt)).filter(Number.isFinite)
    if (!times.length) return []
    const end = new Date(Math.max(...times))
    const days: { day: string; count: number }[] = []
    for (let i = 29; i >= 0; i--) days.push({ day: key(new Date(end.getFullYear(), end.getMonth(), end.getDate() - i)), count: 0 })
    const idx = new Map(days.map((d, i) => [d.day, i]))
    for (const r of db.registrations) {
      const i = idx.get(key(new Date(r.registeredAt)))
      if (i !== undefined) days[i].count++
    }
    return days
  }, [db.registrations])

  const upcoming = [...db.sessions]
    .filter((s) => db.events.find((e) => e.id === s.eventId)?.status !== "completed")
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .slice(0, 6)
  const recent = [...db.registrations].sort((a, b) => b.registeredAt.localeCompare(a.registeredAt)).slice(0, 7)
  const pName = (id: string) => db.participants.find((p) => p.id === id)?.name ?? "—"
  const eName = (id: string) => db.events.find((e) => e.id === id)?.name ?? "—"

  const kpis = [
    { label: "Open events", value: open.length, sub: `${plural(db.events.length, "event")} in total`, icon: Ticket },
    { label: "Active registrations", value: live.length, sub: plural(db.participants.length, "participant record"), icon: ClipboardList },
    { label: "Checked in", value: checked, sub: `${pct(checked, live.length)}% of active registrations`, icon: CheckCircle2 },
    { label: "On waitlists", value: wait, sub: wait ? "Promoted automatically when seats free up" : "No one is waiting", icon: Hourglass },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader title="Overview" description="Events, registrations and the schedule at a glance.">
        <Button variant="outline" render={<a href="#/events" />} nativeButton={false}>All events</Button>
        <Button onClick={() => setReg(true)}><Plus /> Register participant</Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="gap-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardDescription className="text-[13px]">{k.label}</CardDescription>
              <k.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="num text-[26px] leading-none font-semibold tracking-[-0.03em] sm:text-[32px]">{k.value.toLocaleString("en-IN")}</p>
              <p className="mt-2 text-[12.5px] text-muted-foreground">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registrations per day</CardTitle>
            <CardDescription>Last 30 days, every status counted on the day it was made.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px] w-full sm:h-[240px]">
              <AreaChart data={series} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="fillReg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28}
                  tickFormatter={(d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
                <YAxis width={28} tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(d) => fmtDay(String(d))} />} />
                <Area dataKey="count" type="monotone" stroke="var(--color-count)" strokeWidth={2} fill="url(#fillReg)" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seats filled</CardTitle>
            <CardDescription>Confirmed and checked-in against capacity.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {db.events.filter((e) => e.status !== "completed").map((e) => {
              const used = activeCount(db, e.id)
              const p = pct(used, e.capacity)
              return (
                <a key={e.id} href={`#/events/${e.id}`} className="group grid gap-1.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium group-hover:underline">{e.name}</span>
                    <span className="num text-muted-foreground">{used}/{e.capacity}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, p)}%`, background: p >= 100 ? "#f59e0b" : "#2563eb" }} />
                  </div>
                </a>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Next on the schedule</CardTitle>
              <CardDescription>Upcoming sessions across all events.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" render={<a href="#/schedule" />} nativeButton={false}>Schedule</Button>
          </CardHeader>
          <CardContent className="grid">
            {upcoming.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border-b py-2.5 last:border-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><CalendarClock className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{s.title}</p>
                  <p className="truncate text-[12.5px] text-muted-foreground">{[eName(s.eventId), s.room].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right text-[12.5px]">
                  <p className="font-medium">{fmtDay(s.date)}</p>
                  <p className="num text-muted-foreground">{s.start}–{s.end}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Latest registrations</CardTitle>
              <CardDescription>Newest first.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" render={<a href="#/registrations" />} nativeButton={false}>All registrations</Button>
          </CardHeader>
          <CardContent className="grid">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b py-2.5 last:border-0">
                <Initials name={pName(r.participantId)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{pName(r.participantId)}</p>
                  <p className="truncate text-[12.5px] text-muted-foreground">{eName(r.eventId)} · {fmtDateTime(r.registeredAt)}</p>
                </div>
                <RegBadge status={r.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open for registration</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {open.map((e) => (
            <a key={e.id} href={`#/events/${e.id}`} className="rounded-xl border p-4 transition-colors hover:bg-muted/60">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-muted-foreground">{e.code} · {e.category}</span>
                <EventBadge status={e.status} />
              </div>
              <p className="mt-2 text-[16px] font-semibold tracking-[-0.02em]">{e.name}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{fmtDay(e.startDate)} · {e.venue}</p>
            </a>
          ))}
        </CardContent>
      </Card>

      <RegisterDialog open={reg} onOpenChange={setReg} />
    </div>
  )
}
