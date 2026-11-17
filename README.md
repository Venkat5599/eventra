<div align="center">

# EVENTRA

### Event Registration Management System. JavaFX, event handling, JDBC, MySQL.

[![Project](https://img.shields.io/badge/GitHub-Venkat5599%2Feventra-181717)](https://github.com/Venkat5599/eventra)
[![Website](https://img.shields.io/badge/Website-eventra--five--nu.vercel.app-000000)](https://eventra-five-nu.vercel.app/)
[![Stack](https://img.shields.io/badge/JavaFX%2021%20·%20JDBC%20·%20MySQL%208-14151a)](backend/pom.xml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

**[ Website ↗ ](https://eventra-five-nu.vercel.app/)** · **[ Open the repo ↗ ](https://github.com/Venkat5599/eventra)** · **[ Run it ↓ ](#run-it)** · **[ Event handling ↓ ](#event-handling)**

</div>

Eventra manages event details, participant registration, event schedules, and participant records. The desk is a JavaFX window. Every button, search box, double-click, and key press is an event handler. Every saved row is a JDBC write to MySQL. The database starts empty. Nothing in this repo inserts sample people.

```
CONFIRMED ≠ WAITLISTED ≠ CHECKED IN
```

## What it covers

| Record | What you manage |
|---|---|
| Events | Name, code, dates, venue, capacity, status |
| Participants | Name, email, phone, college, department |
| Registrations | Confirmed until the room is full, then waitlisted. Cancel promotes the next person. Check in by ticket code |
| Schedule | Sessions inside the event dates. The same room cannot overlap |

## Event handling

| Gesture | Handler | Where |
|---|---|---|
| Nav button | `setOnAction` | `backend/src/main/java/com/eventra/ui/Desk.java` |
| Search as you type | `textProperty().addListener` | `backend/src/main/java/com/eventra/ui/EventsPane.java` |
| Double-click a row | `setOnMouseClicked`, click count 2 | `backend/src/main/java/com/eventra/ui/EventsPane.java` |
| Enter in the ticket field | `setOnKeyPressed` | `backend/src/main/java/com/eventra/ui/RegsPane.java` |
| Ctrl+N, Ctrl+F, Delete | `scene.getAccelerators()`, `setOnKeyPressed` | `backend/src/main/java/com/eventra/ui/Desk.java` |
| Select a participant | `selectedItemProperty().addListener` | `backend/src/main/java/com/eventra/ui/PeoplePane.java` |
| Invalid email | `textProperty().addListener` paints the field red | `backend/src/main/java/com/eventra/ui/PeoplePane.java` |
| Delete | `Alert` confirmation, then the service | each pane |
| Database work | `javafx.concurrent.Task` off the UI thread | `backend/src/main/java/com/eventra/ui/Desk.java` |

## Rules

The rules live in `backend/src/main/java/com/eventra/Service.java`, not in the window.

- Register only while the event is open.
- Confirmed plus checked-in cannot pass capacity. The next person is waitlisted.
- The capacity check locks the event row, so two people cannot both take the last seat.
- Cancel is refused after check-in. A confirmed cancel promotes the earliest waitlisted person.
- Email is unique. A room clash on the same date is refused.
- JDBC uses `PreparedStatement`. SQL is not built by concatenating input.

## Run it

MySQL 8 on localhost, database `eventra`, a user that can write to it. Then:

```bash
cd backend
mvn javafx:run
```

The first window asks for the JDBC URL, user, and password, and saves them in `db.properties` next to where you launched it. That file is gitignored. You can also pass `DB_URL`, `DB_USER`, and `DB_PASSWORD` in the environment.

The tables are created on connect if they are missing. They are empty until you add a row in the desk.

Project link: https://github.com/Venkat5599/eventra

Website: https://eventra-five-nu.vercel.app/

## Layout

| Path | What |
|---|---|
| `backend/src/main/java/com/eventra/App.java` | JavaFX entry |
| `backend/src/main/java/com/eventra/ui/` | Screens and event handlers |
| `backend/src/main/java/com/eventra/Service.java` | Rules, one transaction per write |
| `backend/src/main/java/com/eventra/Db.java` | JDBC |
| `backend/src/main/resources/schema.sql` | MySQL tables |
| `backend/pom.xml` | JavaFX 21, MySQL Connector/J |

## License

[MIT](LICENSE).
