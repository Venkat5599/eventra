import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Shell } from "@/components/shell"
import { useRoute } from "@/lib/router"
import { connect } from "@/lib/db"
import { OverviewPage } from "@/pages/overview"
import { EventDetailPage, EventsPage } from "@/pages/events"
import { RegistrationsPage } from "@/pages/registrations"
import { ParticipantsPage } from "@/pages/participants"
import { SchedulePage } from "@/pages/schedule"
import { BackendPage } from "@/pages/backend"

function App() {
  const r = useRoute()
  let page: React.ReactNode
  switch (r.page) {
    case "events": page = r.id ? <EventDetailPage id={r.id} /> : <EventsPage />; break
    case "registrations": page = <RegistrationsPage />; break
    case "participants": page = <ParticipantsPage />; break
    case "schedule": page = <SchedulePage />; break
    case "backend": case "data": page = <BackendPage />; break
    default: page = <OverviewPage />
  }
  return <Shell>{page}</Shell>
}

connect()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Toaster>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </Toaster>
  </StrictMode>,
)
