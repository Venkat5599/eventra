import Link from "next/link"

const STEPS = [
  { n: "01", title: "Open the event", body: "Set the name, dates, venue and how many seats it holds. Draft events stay hidden from registration." },
  { n: "02", title: "Take registrations", body: "A person is confirmed while seats remain. The next one goes on the waitlist. Cancelling a seat moves the earliest waitlisted person up." },
  { n: "03", title: "Run the day", body: "Check people in by ticket code. Schedule sessions so the same room is never booked twice." },
]

const RECORDS = [
  { title: "Events", body: "Code, category, capacity, status, organizer." },
  { title: "Participants", body: "Name, email, phone, college, department. Email is unique." },
  { title: "Registrations", body: "Confirmed, waitlisted, cancelled, or checked in." },
  { title: "Schedule", body: "Sessions inside the event dates, with a room-clash check." },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-[#040404]">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <span className="text-[17px] font-semibold tracking-[-0.03em]">Eventra</span>
        <Link href="/dashboard" className="rounded-full bg-[#040404] px-4 py-2 text-[13px] text-white">
          Open dashboard
        </Link>
      </header>
      <main>
        <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-20 pt-16">
          <p className="text-[13px] font-medium tracking-wide text-[#2b4ea6]">Event registration</p>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.04em] text-balance">
            Manage events, seats, and the people who show up.
          </h1>
          <p className="max-w-xl text-lg text-[#62626d]">
            Event details, participant registration, the schedule, and the record of who attended. One place, with the rules enforced when two people take the last seat.
          </p>
          <div className="flex gap-3 pt-2">
            <Link href="/dashboard" className="rounded-full bg-[#040404] px-5 py-2.5 text-sm text-white">
              Open the dashboard
            </Link>
          </div>
        </section>
        <section className="border-y border-[#04040414] bg-[#f6f6f7]">
          <div className="mx-auto grid max-w-5xl gap-8 px-6 py-16 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="grid gap-2">
                <p className="font-mono text-[12px] text-[#2b4ea6]">{s.n}</p>
                <h2 className="text-xl font-semibold tracking-[-0.03em]">{s.title}</h2>
                <p className="text-[15px] leading-relaxed text-[#62626d]">{s.body}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="mx-auto grid max-w-5xl gap-6 px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">What it keeps</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {RECORDS.map((r) => (
              <div key={r.title} className="rounded-2xl border border-[#04040414] p-5">
                <h3 className="font-semibold">{r.title}</h3>
                <p className="mt-1 text-[14px] text-[#62626d]">{r.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-[#04040414] px-6 py-8 text-center text-[13px] text-[#62626d]">
        Eventra · Event Registration Management System
      </footer>
    </div>
  )
}
