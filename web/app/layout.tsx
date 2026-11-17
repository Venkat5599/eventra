import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Eventra | Event Registration Management System",
  description: "Manage event details, participant registration, event schedules, and participant records.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
