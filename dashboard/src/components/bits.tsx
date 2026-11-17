import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { EventStatus, RegStatus } from "@/lib/db"
import { initials } from "@/lib/format"

const REG: Record<RegStatus, [string, string]> = {
  confirmed: ["Confirmed", "bg-[#2563eb]/10 text-[#2b4ea6]"],
  checked_in: ["Checked in", "bg-[#34c759]/15 text-[#1a7a32]"],
  waitlisted: ["Waitlist", "bg-[#f59e0b]/15 text-[#92400e]"],
  cancelled: ["Cancelled", "bg-black/[0.06] text-[#62626d]"],
}
const EVT: Record<EventStatus, [string, string]> = {
  open: ["Open", "bg-[#34c759]/15 text-[#1a7a32]"],
  draft: ["Draft", "bg-black/[0.06] text-[#62626d]"],
  closed: ["Closed", "bg-[#f59e0b]/15 text-[#92400e]"],
  completed: ["Completed", "bg-[#2563eb]/10 text-[#2b4ea6]"],
}

export function RegBadge({ status }: { status: RegStatus }) {
  const [l, c] = REG[status]
  return <Badge className={cn("rounded-full border-0", c)}>{l}</Badge>
}
export function EventBadge({ status }: { status: EventStatus }) {
  const [l, c] = EVT[status]
  return <Badge className={cn("rounded-full border-0", c)}>{l}</Badge>
}

const HUES = ["#dbeafe:#1e3a8a", "#fce7f3:#831843", "#dcfce7:#14532d", "#fef3c7:#78350f", "#ede9fe:#4c1d95", "#ccfbf1:#134e4a"]
export function Initials({ name, className }: { name: string; className?: string }) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const [bg, fg] = HUES[h % HUES.length].split(":")
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", className)} style={{ background: bg, color: fg }}>
      {initials(name)}
    </span>
  )
}

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 19 19" className={cn("h-[18px] w-auto", className)} aria-hidden>
      <path fill="currentColor" d="M2 1h15a2 2 0 0 1 0 4H2a2 2 0 0 1 0-4zM2 7.5h9a2 2 0 0 1 0 4H2a2 2 0 0 1 0-4zM2 14h13a2 2 0 0 1 0 4H2a2 2 0 0 1 0-4z" />
    </svg>
  )
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-[15px] text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}
