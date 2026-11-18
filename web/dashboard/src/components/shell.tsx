import { CalendarDays, ClipboardList, Server, LayoutGrid, Ticket, Users, ArrowUpRight, RefreshCw, CloudOff } from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarInset, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { useRoute } from "@/lib/router"
import { connect, useDb } from "@/lib/db"
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
  participants: "Participants", backend: "Backend",
}

// Close the mobile drawer after picking a page.
function NavLink({ href, children, onClick, ...rest }: React.ComponentProps<"a">) {
  const { isMobile, setOpenMobile } = useSidebar()
  return <a {...rest} href={href} onClick={(e) => { onClick?.(e); if (isMobile) setOpenMobile(false) }}>{children}</a>
}

function Down() {
  const err = useDb((s) => s.lastError)
  return (
    <div className="mx-auto grid max-w-md justify-items-center gap-3 py-20 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted"><CloudOff className="size-5" /></span>
      <h1 className="text-[22px] font-semibold">Can’t reach the database</h1>
      <p className="text-[15px] text-muted-foreground">
        The Eventra server didn’t answer{err ? ` (${err})` : ""}. Nothing is shown until it does: this page never invents or caches records.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => connect()}><RefreshCw /> Try again</Button>
        <Button variant="outline" render={<a href="#/backend" />} nativeButton={false}>Server status</Button>
      </div>
    </div>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  const r0 = useRoute()
  const route = r0.page === "data" ? { ...r0, page: "backend" } : r0
  const waitlisted = useDb((s) => s.registrations.filter((r) => r.status === "waitlisted").length)
  const openEvents = useDb((s) => s.events.filter((e) => e.status === "open").length)
  const counts: Record<string, number | undefined> = { events: openEvents || undefined, registrations: waitlisted || undefined }
  const mode = useDb((s) => s.mode)
  const pill = mode === "server"
    ? { dot: "bg-[#34c759]", text: "Live · MySQL database", short: "Live" }
    : mode === "down"
      ? { dot: "bg-[#ef4444]", text: "Server not reachable", short: "Offline" }
      : { dot: "bg-black/30 animate-pulse", text: "Connecting…", short: "…" }
  // the Backend page works (and is most useful) while the server is down
  const body = route.page === "backend" ? children
    : mode === "connecting" ? <p className="py-24 text-center text-muted-foreground">Loading from the database…</p>
    : mode === "down" ? <Down /> : children

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
                    <SidebarMenuButton isActive={route.page === n.to} tooltip={n.label} render={<NavLink href={`#/${n.to}`} />}>
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
                  <SidebarMenuButton isActive={route.page === "backend"} tooltip="Backend" render={<NavLink href="#/backend" />}>
                    <Server />
                    <span>Backend</span>
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
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-4">
          <SidebarTrigger className="-ms-1" />
          <Separator orientation="vertical" className="mx-1 h-4" />
          <span className="truncate text-sm font-medium">{TITLES[route.page] ?? "Eventra"}</span>
          <a href="#/backend" className="ms-auto inline-flex shrink-0 items-center gap-2 rounded-full border bg-card px-3 py-1 text-[12px] text-muted-foreground hover:text-foreground">
            <span className={"size-1.5 rounded-full " + pill.dot} />
            <span className="hidden sm:inline">{pill.text}</span>
            <span className="sm:hidden">{pill.short}</span>
          </a>
        </header>
        <main className="mx-auto w-full max-w-[1280px] min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {body}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
