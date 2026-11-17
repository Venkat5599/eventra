"use client"

import { CalendarDays, ClipboardList, Database, LayoutGrid, Ticket, Users, ArrowUpRight } from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarInset, SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { useRoute } from "@/lib/router"
import { useDb } from "@/lib/db"
import { Mark } from "./bits"

const NAV = [
  { to: "overview", label: "Overview", icon: LayoutGrid },
  { to: "events", label: "Events", icon: Ticket },
  { to: "registrations", label: "Registrations", icon: ClipboardList },
  { to: "schedule", label: "Schedule", icon: CalendarDays },
  { to: "participants", label: "Participants", icon: Users },
]

const TITLES: Record<string, string> = {
  overview: "Overview", events: "Events", registrations: "Registrations", schedule: "Schedule",
  participants: "Participants", data: "Data & backend",
}

export function Shell({ children }: { children: React.ReactNode }) {
  const route = useRoute()
  const waitlisted = useDb((s) => s.registrations.filter((r) => r.status === "waitlisted").length)
  const openEvents = useDb((s) => s.events.filter((e) => e.status === "open").length)
  const counts: Record<string, number | undefined> = { events: openEvents, registrations: waitlisted || undefined }
  const mode = useDb((s) => s.mode)
  const pill = mode === "server"
    ? { dot: "bg-[#34c759]", text: "Live · MySQL database" }
    : mode === "offline"
      ? { dot: "bg-[#f59e0b]", text: "Offline copy · server not reachable" }
      : { dot: "bg-black/30 animate-pulse", text: "Connecting…" }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<a href="/" aria-label="Eventra home page" />}>
                <span className="flex size-8 items-center justify-center rounded-lg bg-[#040404] text-white">
                  <Mark className="h-[15px]" />
                </span>
                <span className="grid text-left leading-tight">
                  <span className="text-[17px] font-semibold tracking-[-0.03em]">Eventra</span>
                  <span className="text-[12px] text-muted-foreground">Event registration</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Manage</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((n) => (
                  <SidebarMenuItem key={n.to}>
                    <SidebarMenuButton isActive={route.page === n.to} tooltip={n.label} render={<a href={`/dashboard/${n.to}`} />}>
                      <n.icon />
                      <span>{n.label}</span>
                    </SidebarMenuButton>
                    {counts[n.to] ? <SidebarMenuBadge>{counts[n.to]}</SidebarMenuBadge> : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>System</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={route.page === "data"} tooltip="Data & backend" render={<a href="/dashboard/data" />}>
                    <Database />
                    <span>Data & backend</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Back to site" render={<a href="/" />}>
                <ArrowUpRight />
                <span>Back to site</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger className="-ms-1" />
          <Separator orientation="vertical" className="mx-1 h-4" />
          <span className="text-sm font-medium">{TITLES[route.page] ?? "Eventra"}</span>
          <a href="/dashboard/data" className="ms-auto inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-[12px] text-muted-foreground hover:text-foreground">
            <span className={"size-1.5 rounded-full " + pill.dot} />
            {pill.text}
          </a>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8">
          {mode === "connecting" ? <p className="py-24 text-center text-muted-foreground">Loading events from the database…</p> : children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
