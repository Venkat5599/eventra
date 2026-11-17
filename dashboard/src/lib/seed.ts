import type { Db, EventItem, Participant, Registration, RegStatus, Session } from "./db"

// Sample data set: loaded into an empty database once (and used by the offline mode).
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const FIRST = ["Arun", "Anika", "Neel", "Riya", "Amit", "Jay", "Priya", "Arjun", "Kavya", "Rahul", "Ananya", "Vikram", "Sneha", "Rohan", "Meera", "Aditya", "Isha", "Karan", "Divya", "Nikhil", "Pooja", "Siddharth", "Tanvi", "Varun", "Neha", "Harsh", "Diya", "Kabir", "Aarav", "Zoya", "Ishaan", "Lakshmi", "Farhan", "Nisha", "Dev", "Ritu", "Omar", "Leela", "Yash", "Sara"]
const LAST = ["Kulkarni", "Chawla", "Patel", "Banerjee", "Desai", "Lal", "Sharma", "Iyer", "Nair", "Gupta", "Reddy", "Menon", "Rao", "Kapoor", "Das", "Pillai", "Bose", "Mehta", "Joshi", "Verma"]
const ORGS = ["SRM Institute", "Anna University", "VIT Chennai", "IIT Madras", "Loyola College", "PSG Tech", "Amrita University", "Christ University"]
const DEPTS = ["Computer Science", "Information Technology", "Electronics", "Mechanical", "Commerce", "Design", "Management", "Physics"]

const BASE = Date.UTC(2026, 9, 20, 4, 30) // 2026-10-20 10:00 IST

export function seed(): Db {
  const r = rng(20261117)
  const events: EventItem[] = [
    { id: "evt_techfest", code: "TF26", name: "TechFest 2026", category: "Technical fest", venue: "Main Auditorium, Hall A", description: "Two days of talks, demos and project expos across every department.", startDate: "2026-12-12", endDate: "2026-12-13", capacity: 60, status: "open", organizer: "Student Council" },
    { id: "evt_hackathon", code: "HK26", name: "24h Hackathon", category: "Competition", venue: "Lab 2, CS Block", description: "Teams of up to four build for 24 hours. Mentors on site all night.", startDate: "2026-12-12", endDate: "2026-12-13", capacity: 32, status: "open", organizer: "Coding Club" },
    { id: "evt_workshop", code: "WS26", name: "Workshop A: Java & JDBC", category: "Workshop", venue: "Seminar Hall 1", description: "Hands-on: connect a JavaFX app to MySQL with JDBC, from schema to CRUD.", startDate: "2026-12-13", endDate: "2026-12-13", capacity: 24, status: "open", organizer: "Dept. of IT" },
    { id: "evt_career", code: "CF26", name: "Career Fair", category: "Career", venue: "Convention Centre", description: "Meet recruiters from 30 companies. Bring printed resumes.", startDate: "2026-12-14", endDate: "2026-12-14", capacity: 80, status: "open", organizer: "Placement Cell" },
    { id: "evt_music", code: "MN26", name: "Music Night", category: "Cultural", venue: "Open Air Theatre", description: "Live bands and the inter-college battle of bands final.", startDate: "2026-12-14", endDate: "2026-12-14", capacity: 120, status: "open", organizer: "Cultural Committee" },
    { id: "evt_sports", code: "SM26", name: "Sports Meet", category: "Sports", venue: "College Grounds", description: "Track, field and team sports across three days.", startDate: "2027-01-08", endDate: "2027-01-10", capacity: 100, status: "draft", organizer: "Physical Education" },
    { id: "evt_summit", code: "DS26", name: "Design Summit", category: "Conference", venue: "Seminar Hall 2", description: "Talks on product and visual design from alumni working in industry.", startDate: "2026-11-08", endDate: "2026-11-08", capacity: 40, status: "completed", organizer: "Design Society" },
  ]

  const participants: Participant[] = []
  for (let i = 0; i < 64; i++) {
    const f = FIRST[i % FIRST.length]
    const l = LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]
    const handle = `${f}.${l}`.toLowerCase() + (i >= FIRST.length ? i : "")
    participants.push({
      id: `prt_${String(i + 1).padStart(3, "0")}`,
      name: `${f} ${l}`,
      email: `${handle}@example.edu`,
      phone: `+91 9${String(Math.floor(r() * 1e9)).padStart(9, "0")}`,
      organization: ORGS[Math.floor(r() * ORGS.length)],
      department: DEPTS[Math.floor(r() * DEPTS.length)],
      createdAt: new Date(BASE - Math.floor(r() * 40) * 864e5).toISOString(),
    })
  }

  const sessions: Session[] = [
    { id: "ses_01", eventId: "evt_techfest", title: "Opening keynote", speaker: "Dr. Meera Iyer", room: "Hall A", date: "2026-12-12", start: "09:00", end: "10:00" },
    { id: "ses_02", eventId: "evt_techfest", title: "Project expo", speaker: "All departments", room: "Hall B", date: "2026-12-12", start: "10:30", end: "13:00" },
    { id: "ses_03", eventId: "evt_techfest", title: "Panel: building for campus", speaker: "Alumni panel", room: "Hall A", date: "2026-12-12", start: "14:00", end: "15:30" },
    { id: "ses_04", eventId: "evt_techfest", title: "Prize distribution", speaker: "Principal", room: "Hall A", date: "2026-12-13", start: "16:00", end: "17:00" },
    { id: "ses_05", eventId: "evt_hackathon", title: "Hackathon kickoff", speaker: "Coding Club", room: "Lab 2", date: "2026-12-12", start: "11:00", end: "11:30" },
    { id: "ses_06", eventId: "evt_hackathon", title: "Mentor rounds", speaker: "Mentors", room: "Lab 2", date: "2026-12-12", start: "20:00", end: "22:00" },
    { id: "ses_07", eventId: "evt_hackathon", title: "Final demos", speaker: "Judges", room: "Hall B", date: "2026-12-13", start: "11:00", end: "13:00" },
    { id: "ses_08", eventId: "evt_workshop", title: "Schema design in MySQL", speaker: "Prof. Arjun Rao", room: "Seminar Hall 1", date: "2026-12-13", start: "10:00", end: "11:30" },
    { id: "ses_09", eventId: "evt_workshop", title: "JDBC CRUD with JavaFX", speaker: "Prof. Arjun Rao", room: "Seminar Hall 1", date: "2026-12-13", start: "12:00", end: "13:30" },
    { id: "ses_10", eventId: "evt_career", title: "Resume review desk", speaker: "Placement Cell", room: "Placement Office", date: "2026-12-14", start: "09:30", end: "12:30" },
    { id: "ses_11", eventId: "evt_career", title: "Company stalls open", speaker: "30 recruiters", room: "Convention Centre", date: "2026-12-14", start: "10:00", end: "16:00" },
    { id: "ses_12", eventId: "evt_music", title: "Battle of bands", speaker: "8 college bands", room: "Open Air Theatre", date: "2026-12-14", start: "18:00", end: "20:30" },
    { id: "ses_13", eventId: "evt_music", title: "Headline set", speaker: "Guest band", room: "Open Air Theatre", date: "2026-12-14", start: "20:45", end: "22:00" },
    { id: "ses_14", eventId: "evt_summit", title: "Design talks", speaker: "Alumni speakers", room: "Seminar Hall 2", date: "2026-11-08", start: "10:00", end: "13:00" },
  ]

  const registrations: Registration[] = []
  const fill: Record<string, number> = { evt_techfest: 0.97, evt_hackathon: 1.1, evt_workshop: 0.8, evt_career: 0.55, evt_music: 0.42, evt_sports: 0, evt_summit: 0.9 }
  let n = 0
  for (const ev of events) {
    const want = Math.round(ev.capacity * fill[ev.id])
    const pool = [...participants].sort(() => r() - 0.5)
    let confirmed = 0
    for (let k = 0; k < Math.min(want, pool.length); k++) {
      const p = pool[k]
      n++
      const at = BASE + Math.floor(r() * 26 * 864e5) + k * 6e5
      let status: RegStatus = confirmed < ev.capacity ? "confirmed" : "waitlisted"
      if (status === "confirmed") confirmed++
      if (ev.status === "completed" && status === "confirmed") status = r() < 0.85 ? "checked_in" : "confirmed"
      else if (status === "confirmed" && r() < 0.05) { status = "cancelled"; confirmed-- }
      registrations.push({
        id: `reg_${String(n).padStart(4, "0")}`,
        eventId: ev.id,
        participantId: p.id,
        status,
        registeredAt: new Date(at).toISOString(),
        checkedInAt: status === "checked_in" ? `${ev.startDate}T04:${String(10 + Math.floor(r() * 40)).padStart(2, "0")}:00.000Z` : undefined,
        ticketCode: `${ev.code}-${String(1000 + n)}`,
        notes: "",
      })
    }
  }
  return { events, participants, sessions, registrations }
}

