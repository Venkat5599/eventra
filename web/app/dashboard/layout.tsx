"use client"

import { useEffect } from "react"
import { Shell } from "@/components/shell"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { connect } from "@/lib/db"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    connect()
  }, [])
  return (
    <Toaster>
      <TooltipProvider>
        <Shell>{children}</Shell>
      </TooltipProvider>
    </Toaster>
  )
}
