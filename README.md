<div align="center">

# EVENTRA

### Event registration that will not sell a seat it does not have.

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
[![Stack](https://img.shields.io/badge/Next.js%2015%20·%20Java%2021%20·%20MySQL-14151a)](web/package.json)

**[ Run it locally ↓ ](#run-it-locally)** · **[ The rules ↓ ](#the-registration-loop-step-by-step)** · **[ Architecture ↓ ](#architecture)**

</div>

Eventra keeps four records for a college event: the event itself, the people, the schedule, and who actually has a seat. A full event does not take another confirmed registration. The next person waits. A cancellation hands that seat to the person who has been waiting longest.

```
CONFIRMED ≠ WAITLISTED ≠ CHECKED IN
```

A confirmed seat is a promise the room can hold. A waitlisted row is not a seat. A checked-in row is a person who already walked in, and that row cannot be cancelled out from under the door.

## Live status

| Surface | Status | The evidence |
|---|---|---|
| Source | Next.js app on `main` | `web/app` |
| Landing | Static page at `/` | `web/app/page.tsx` |
| Dashboard | Six routes, one of them dynamic | `npm run build` table below |
| API | Java 21 + JDBC, in the repo, not started by `npm run dev` | `backend/src/main/java/com/eventra` |
| Automated tests | None in this repo | no `tests/` directory |

## The 20-second pitch

A registration desk that only counts heads will oversell the room the moment two people hit the last seat together. Eventra treats that as a database problem, not a form problem.

The dashboard writes through `/api`. The Java service locks the event row, counts confirmed and checked-in seats, and only then inserts the registration. If the count is already at capacity, the new row is waitlisted. Cancel a confirmed seat and the earliest waitlisted person moves up, in the same transaction.

```
Person asks for a seat
        |
        v
Lock the event row
        |
        +-- seats left --> confirmed, ticket code
        |
        +-- full -------> waitlisted
        |
        v
Cancel a confirmed seat --> earliest waitlisted person becomes confirmed
```

## Table of contents

- [See it in one command](#see-it-in-one-command)
- [What Eventra is not](#what-eventra-is-not)
- [The problem](#the-problem)
- [What I built](#what-i-built)
- [Architecture](#architecture)
- [The registration loop, step by step](#the-registration-loop-step-by-step)
- [Where the guarantee is enforced](#where-the-guarantee-is-enforced)
- [Engineering decisions](#engineering-decisions)
- [What's real](#whats-real)
- [The app](#the-app)
- [Limitations](#limitations)
- [Security](#security)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Run it locally](#run-it-locally)
- [How I'd deploy it](#how-id-deploy-it)
- [License](#license)

## See it in one command

From `web/`, after `npm install`:

```bash
npm run build
```

This is the tail of that command, run in this repo:

```
✓ Compiled successfully in 1010ms
✓ Generating static pages (10/10)

Route (app)                                 Size  First Load JS
┌ ○ /                                    3.48 kB         106 kB
├ ○ /_not-found                             1 kB         103 kB
├ ○ /dashboard                            115 kB         275 kB
├ ○ /dashboard/data                      2.85 kB         163 kB
├ ○ /dashboard/events                      253 B         165 kB
├ ƒ /dashboard/events/[id]                 281 B         165 kB
├ ○ /dashboard/participants              3.67 kB         164 kB
├ ○ /dashboard/registrations             2.51 kB         163 kB
└ ○ /dashboard/schedule                  2.02 kB         162 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

`/` and the dashboard routes prerender. `/dashboard/events/[id]` stays dynamic because the id comes from the URL.

## What Eventra is not

- Not a static HTML site. The pages are a Next.js app under `web/`.
- Not a spreadsheet with a form in front of it. Capacity, the waitlist, and room clashes are refused in code, not left to the person at the desk.
- Not a desktop JavaFX app. That UI is not in this repo. The Java piece here is the HTTP API.

## The problem

An event has a room and a number. Once that number is reached, the next registration is a different kind of row. If you only decrement a counter in the browser, two people can both see "1 seat left" and both walk away confirmed.

The same mess shows up on the schedule. Two sessions, one room, overlapping times. The form will accept both unless something checks.

## What I built

A Next.js app and a Java API that share one set of rules.

The landing page says what the system keeps. The dashboard is where you actually do the work: events, registrations, the schedule, participants, and a data page that says whether the browser is talking to MySQL or to a local copy.

When `/api` answers, the header reads **Live · MySQL database**. When it does not, the same screens run on a copy in the browser and the header says so. The offline copy is for opening the app without the server. It is not the shared database.

## Architecture

| Piece | Where | Does |
|---|---|---|
| Landing | `web/app/page.tsx` | The front page |
| Dashboard routes | `web/app/dashboard` | One folder per screen |
| Screens | `web/components/pages` | Tables, forms, the check-in field |
| Client store | `web/lib/db.ts` | Calls `/api`, or the offline rules if the call fails |
| Sample rows | `web/lib/seed.ts` | Loaded once into an empty database |
| HTTP API | `backend/src/main/java/com/eventra/Server.java` | Routes, JSON, a write limit per address |
| Rules | `backend/src/main/java/com/eventra/Service.java` | One transaction per write |
| JDBC | `backend/src/main/java/com/eventra/Db.java` | Schema, mapping, the one-time seed |
| Schema | `backend/src/main/resources/schema.sql` | Four tables |

The browser never opens MySQL. It talks to `/api`. Set `EVENTRA_API_ORIGIN` when that API is on another host. The Next.js rewrite in `web/next.config.mjs` forwards `/api/:path*` there. With the variable unset, the dashboard falls back to the offline copy.

| Method | Path | Does |
|---|---|---|
| GET | `/api/health` | Touches the database |
| GET | `/api/db` | Every event, participant, session, and registration |
| POST / PUT | `/api/events[/{id}]` | Create or edit an event |
| DELETE | `/api/events/{id}` | Deletes the event, its sessions, and its registrations |
| POST / PUT | `/api/participants[/{id}]` | Add or edit a person. Email is unique |
| DELETE | `/api/participants/{id}` | Removes the person and promotes any waitlist they freed |
| POST | `/api/registrations` | Register. Body: `eventId`, `participantId`, `notes` |
| POST | `/api/registrations/{id}/cancel` | Cancel, then promote |
| POST | `/api/registrations/{id}/check-in` | Only a confirmed row |
| POST / PUT / DELETE | `/api/sessions[/{id}]` | Schedule, with the room check |

A refusal comes back as `400`, `404`, or `409` with `{"message":"..."}`. The dashboard shows that message.

## The registration loop, step by step

1. The event must be `open`. Draft, closed, and completed events refuse new registrations.
2. The person must exist, and they must not already have a non-cancelled row for that event.
3. The service locks the event row (`SELECT ... FOR UPDATE`) and counts rows in `confirmed` or `checked_in`.
4. Under capacity, the new row is `confirmed` and gets a ticket code: `<event code>-<number>`, starting at 1001.
5. At capacity, the new row is `waitlisted`. Same ticket code scheme, different status.
6. Cancel is refused once the row is `checked_in`. A confirmed cancel sets `cancelled`, then promotes the earliest waitlisted row for that event.
7. Check-in is refused unless the row is `confirmed`. The second check-in is refused too.
8. A session must sit inside the event dates, end after it starts, and must not overlap another session in the same room on the same date.

Deleting an event deletes its sessions and registrations. The participant records stay. Deleting a participant deletes their registrations and then promotes each event they freed a seat in.

## Where the guarantee is enforced

| Guarantee | Module | How you can see it |
|---|---|---|
| No seat past capacity | `backend/src/main/java/com/eventra/Service.java` | Full event returns a waitlisted row, not a confirmed one |
| Two writers cannot both take the last seat | `SELECT ... FOR UPDATE` on the event row, one transaction | `backend/src/main/java/com/eventra/Service.java` |
| Waitlist order | `ORDER BY registered_at, seq` | Cancel promotes the earliest row |
| One email, one participant | Unique column, plus the service check | `backend/src/main/resources/schema.sql`, `Service.saveParticipant` |
| No double-booked room | Overlap query on room + date | `backend/src/main/java/com/eventra/Service.java` |
| Checked-in stays checked-in | Status guard before cancel | `backend/src/main/java/com/eventra/Service.java` |

There is no test suite asserting these. The enforcement is the Java code, and the dashboard repeats the same refusals when it is offline. Read the method, or run the API and try the case.

## Engineering decisions

The dashboard and the API use the same field names (`startDate`, `ticketCode`, `participantId`) so a row from MySQL drops into the table without a second mapping layer.

IDs are short strings (`evt_…`, `prt_…`, `reg_…`, `ses_…`), not database-generated integers. The ticket number is a separate `seq` column so the code can be `<EVENT>-1001` without depending on the string id.

Offline mode exists because the page has to open when the API is down. It is labelled in the header. Import and reset are hidden while the live database is connected, so a browser cannot wipe the shared tables.

## What's real

| Item | Status | Proof |
|---|---|---|
| Next.js landing and dashboard | In the repo, builds | `npm run build` route table above |
| Registration rules in Java | In the repo | `backend/src/main/java/com/eventra/Service.java` |
| MySQL schema | In the repo | `backend/src/main/resources/schema.sql` |
| Sample data | In the repo | `backend/deploy/seed.json`, `web/lib/seed.ts` |
| Automated tests | Not in this repo | — |
| JavaFX desktop screens | Not in this repo | — |

## The app

| Route | Screen |
|---|---|
| `/` | Landing |
| `/dashboard` | Overview: open events, seats, recent registrations |
| `/dashboard/events` | Event list, create, edit |
| `/dashboard/events/[id]` | One event |
| `/dashboard/registrations` | Register, cancel, check in by ticket code |
| `/dashboard/schedule` | Sessions, room clash refused |
| `/dashboard/participants` | People, unique email |
| `/dashboard/data` | Live or offline, row counts, the endpoint list |

Buttons you will actually see: **Open dashboard**, **New event**, **Register**, **Check in**, **Cancel**. A refused action shows the server message in a toast, not a blank failure.

## Limitations

- No automated tests. A refusal you have not clicked is a claim about the source, not a recorded run.
- The web app does not start MySQL or the Java process. Those are separate commands.
- Offline mode is one browser. It does not sync back when the server returns.
- The JavaFX desktop UI from the course brief is not here.

## Security

- SQL uses placeholders. The service does not build queries by concatenating input.
- The API reads `DB_URL`, `DB_USER`, and `DB_PASSWORD` from the environment. They are not in the repo.
- Writes are capped at 120 per address per 10 minutes.
- The sample passwords in the run instructions are placeholders. Generate a real one on the machine that runs MySQL.

## Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js 15, React 19, TypeScript, Tailwind |
| API | Java 21, JDK `HttpServer`, Jackson, MySQL Connector/J |
| Database | MySQL 8, JDBC |
| Build | `npm run build` in `web/`, `mvn -q package` in `backend/` |

## Project layout

```
web/                  Next.js app
  app/page.tsx        landing
  app/dashboard/      one route per screen
  components/         shell, forms, tables
  lib/db.ts           API client and offline rules
  lib/seed.ts         sample rows
backend/              Java API
  src/main/java/com/eventra/
  src/main/resources/schema.sql
  deploy/             host install files and seed.json
LICENSE
```

## Run it locally

Web app, no database required. It will say the server is not reachable and use the offline copy.

```bash
cd web
npm install
npm run dev
```

Open <http://localhost:3000/>. Dashboard: <http://localhost:3000/dashboard>.

API, against a MySQL you already have running, with a database named `eventra` and a user that can write to it:

```bash
cd backend
mvn -q package
DB_URL='jdbc:mysql://127.0.0.1:3306/eventra' \
DB_USER=eventra \
DB_PASSWORD='your-password' \
SEED_FILE=deploy/seed.json \
java -jar target/eventra-backend.jar
```

`GET http://127.0.0.1:8796/api/health` returns `{"ok":true,"service":"eventra-api"}` when the process is up and the database answered.

Point the web app at it with `EVENTRA_API_ORIGIN=http://127.0.0.1:8796` and restart `npm run dev`. The header should switch to **Live · MySQL database**.

## How I'd deploy it

The web app is a normal Next.js project: `npm run build`, then `npm run start`, or any host that runs Next.js. The API is a single jar. It should listen on loopback and sit behind a reverse proxy. MySQL stays on localhost. The password lives in an env file on that machine, not in git.

`backend/deploy/` has the host scripts for that layout. They are not run by the web app.

## License

[MIT](LICENSE).
