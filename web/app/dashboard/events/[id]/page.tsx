"use client"

import { useParams } from "next/navigation"
import { EventDetailPage } from "@/components/pages/events"

export default function Page() {
  const params = useParams<{ id: string }>()
  return <EventDetailPage id={params.id} />
}
