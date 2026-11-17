# Eventra

Event registration, in one place. Create an event, take registrations up to capacity, keep a waitlist, check people in, and schedule sessions without double-booking a room.

**Live site:** coming up in the deploy step. The dashboard is at `/dashboard/`.

## Contents

- [What you can do](#what-you-can-do)
- [Run it locally](#run-it-locally)
- [The backend](#the-backend)
- [Layout](#layout)

## What you can do

| Area | Does |
|---|---|
| Events | Name, code, dates, venue, capacity, status (draft / open / closed / completed) |
| Participants | Name, email, phone, college, department. Email is unique |
| Registrations | Confirmed until the event is full, then waitlisted. Cancel promotes the next person. Check-in by ticket code |
| Schedule | Sessions inside the event dates. The same room cannot overlap on the same day |

The dashboard header says **Live · MySQL database** when the API answers, and **Offline copy** when it does not. Offline mode keeps the same rules in the browser.

## Run it locally

The built site is in `site/`.

```bash
python3 serve.py
```

Open <http://localhost:4611/>. Dashboard: <http://localhost:4611/dashboard/>.

Without the API running, the dashboard uses the offline copy and says so.

To work on the dashboard:

```bash
cd dashboard
npm install
npm run dev
```

That serves the dashboard source on port 5180.

## The backend

Java 21, JDBC, MySQL 8. Source is in `backend/`. The course write-up, the schema, the rules, and the JavaFX desktop app still to build are in [BACKEND.md](BACKEND.md).

```bash
cd backend
mvn -q package
DB_URL='jdbc:mysql://127.0.0.1:3306/eventra' \
DB_USER=eventra \
DB_PASSWORD='your-password' \
SEED_FILE=deploy/seed.json \
java -jar target/eventra-backend.jar
```

`GET http://127.0.0.1:8796/api/health` should return `{"ok":true,"service":"eventra-api"}`.

The dashboard calls `/api` on the same host. A full event puts the next person on the waitlist. A cancel moves the earliest waitlisted person into the free seat. A room already booked for that time is refused.

## Layout

| Path | What |
|---|---|
| `site/` | Built website. Landing at `/`, dashboard at `/dashboard/` |
| `dashboard/` | Dashboard source (Vite, React, Tailwind) |
| `backend/` | Java API and the host install files in `backend/deploy/` |
| `BACKEND.md` | Course backend guide (JavaFX + JDBC + MySQL, 15 marks) |
| `serve.py` | Local static server for `site/` |
