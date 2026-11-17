# Eventra backend guide

**Status:** the landing page, the dashboard and the Java API are built. The API (`backend/`) is Java 21 + JDBC on MySQL 8. The dashboard reads and writes it through `/api` when that server answers, and keeps an offline copy in the browser when it does not. Still to build for the course mark: the **JavaFX desktop app** (section 7), on the same database and the same rules.

This file says what to build for the backend, locally, as the Java project for **Event Registration Management System – Manage event details, participant registration, event schedules, and participant records.**

---

## 1. Pick the stack (marks)

| Option | Stack | Max marks |
|---|---|---|
| A | Event handling + AWT + JDBC with **SQLite** | 12 |
| B | Event handling + Swing + JDBC with **Oracle / MySQL** | 14 |
| C | Event handling + **JavaFX** + JDBC with **Oracle / MySQL** | **15** |

**Build option C: JavaFX + JDBC + MySQL.** It carries the highest mark, and the dashboard screens map one-to-one onto JavaFX views. Sections 9 and 10 list what changes for B and A.

For development, everything below runs on your own machine. The deployed API (section 8) is the reference implementation of the database layer and the rules.

---

## 2. Install (local only)

| Tool | Version | Check |
|---|---|---|
| JDK | 21 (Temurin or Oracle) | `java -version` |
| Maven | 3.9+ | `mvn -v` |
| MySQL Server | 8.x, running on `localhost:3306` | `mysql --version` |
| IDE | IntelliJ IDEA Community or VS Code + Java pack | — |

You don't install JavaFX or the MySQL driver by hand. Maven downloads both (section 4).

---

## 3. Database (MySQL)

Log in with `mysql -u root -p` and run this once:

```sql
CREATE DATABASE IF NOT EXISTS eventra CHARACTER SET utf8mb4;
CREATE USER IF NOT EXISTS 'eventra'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT ALL PRIVILEGES ON eventra.* TO 'eventra'@'localhost';
```

The tables are in `backend/src/main/resources/schema.sql`. The API applies that file on start, so pointing the API at an empty database creates them. For the JavaFX app, use the same file so both programs share one database. IDs are short strings (`evt_…`, `prt_…`, `reg_…`, `ses_…`), and `registrations.seq` numbers the tickets.

```sql
CREATE TABLE IF NOT EXISTS events (
  id           VARCHAR(40)  NOT NULL PRIMARY KEY,
  code         VARCHAR(8)   NOT NULL UNIQUE,
  name         VARCHAR(120) NOT NULL,
  category     VARCHAR(40)  NOT NULL,
  venue        VARCHAR(120) NOT NULL DEFAULT '',
  description  TEXT,
  start_date   DATE         NOT NULL,
  end_date     DATE         NOT NULL,
  capacity     INT          NOT NULL,
  status       ENUM('draft','open','closed','completed') NOT NULL DEFAULT 'draft',
  organizer    VARCHAR(80)  NOT NULL DEFAULT '',
  CONSTRAINT chk_event_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_event_capacity CHECK (capacity > 0)
);

CREATE TABLE IF NOT EXISTS participants (
  id            VARCHAR(40)  NOT NULL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(120) NOT NULL UNIQUE,
  phone         VARCHAR(20)  NOT NULL DEFAULT '',
  organization  VARCHAR(120) NOT NULL DEFAULT '',
  department    VARCHAR(80)  NOT NULL DEFAULT '',
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS sessions (
  id            VARCHAR(40)  NOT NULL PRIMARY KEY,
  event_id      VARCHAR(40)  NOT NULL,
  title         VARCHAR(120) NOT NULL,
  speaker       VARCHAR(100) NOT NULL DEFAULT '',
  room          VARCHAR(60)  NOT NULL,
  session_date  DATE         NOT NULL,
  start_time    TIME         NOT NULL,
  end_time      TIME         NOT NULL,
  CONSTRAINT chk_session_time CHECK (end_time > start_time),
  CONSTRAINT fk_session_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  INDEX idx_session_room (room, session_date)
);

CREATE TABLE IF NOT EXISTS registrations (
  id              VARCHAR(40)  NOT NULL PRIMARY KEY,
  seq             INT          NOT NULL AUTO_INCREMENT UNIQUE,
  event_id        VARCHAR(40)  NOT NULL,
  participant_id  VARCHAR(40)  NOT NULL,
  status          ENUM('confirmed','waitlisted','cancelled','checked_in') NOT NULL,
  ticket_code     VARCHAR(20)  NOT NULL UNIQUE,
  notes           VARCHAR(200) NOT NULL DEFAULT '',
  registered_at   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  checked_in_at   TIMESTAMP(3) NULL,
  CONSTRAINT fk_reg_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_reg_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  INDEX idx_reg_event_status (event_id, status)
);
```

Sample rows: `backend/deploy/seed.json`. The API loads it once into an empty database when `SEED_FILE` points at it.

---

## 4. Project setup (Maven)

```
eventra-backend/
├── pom.xml
└── src/main/
    ├── java/com/eventra/
    │   ├── App.java                  # JavaFX entry point
    │   ├── db/Database.java          # JDBC connection
    │   ├── model/                    # Event, Participant, Session, Registration (POJOs)
    │   ├── dao/                      # EventDao, ParticipantDao, SessionDao, RegistrationDao
    │   ├── service/                  # RegistrationService, ScheduleService (business rules)
    │   └── ui/                       # one JavaFX view + controller per screen
    └── resources/
        ├── schema.sql
        ├── db.properties
        └── com/eventra/ui/*.fxml     # optional, if you use Scene Builder
```

`pom.xml` dependencies:

```xml
<properties>
  <maven.compiler.release>21</maven.compiler.release>
  <javafx.version>21.0.5</javafx.version>
</properties>
<dependencies>
  <dependency>
    <groupId>org.openjfx</groupId><artifactId>javafx-controls</artifactId><version>${javafx.version}</version>
  </dependency>
  <dependency>
    <groupId>org.openjfx</groupId><artifactId>javafx-fxml</artifactId><version>${javafx.version}</version>
  </dependency>
  <dependency>
    <groupId>com.mysql</groupId><artifactId>mysql-connector-j</artifactId><version>8.4.0</version>
  </dependency>
</dependencies>
<build>
  <plugins>
    <plugin>
      <groupId>org.openjfx</groupId><artifactId>javafx-maven-plugin</artifactId><version>0.0.8</version>
      <configuration><mainClass>com.eventra.App</mainClass></configuration>
    </plugin>
  </plugins>
</build>
```

Run with `mvn clean javafx:run`.

`src/main/resources/db.properties` (local only; keep it out of git):

```properties
db.url=jdbc:mysql://localhost:3306/eventra
db.user=eventra
db.password=eventra_pw
```

---

## 5. JDBC layer

`Database.java` reads `db.properties` and hands out connections:

```java
public final class Database {
    private static final Properties P = new Properties();
    static {
        try (var in = Database.class.getResourceAsStream("/db.properties")) { P.load(in); }
        catch (IOException e) { throw new IllegalStateException("db.properties missing", e); }
    }
    public static Connection get() throws SQLException {
        return DriverManager.getConnection(P.getProperty("db.url"), P.getProperty("db.user"), P.getProperty("db.password"));
    }
}
```

Rules for every DAO:

- Use `PreparedStatement` with `?` placeholders. Never build SQL by string concatenation.
- Use try-with-resources for `Connection`, `PreparedStatement` and `ResultSet`.
- Each DAO covers one table: `findAll()`, `findById(id)`, `insert(x)`, `update(x)`, `delete(id)`, plus the searches the screens need (`search(text)`, `findByEvent(eventId)`).
- Wrap multi-step operations in a transaction: `con.setAutoCommit(false)` … `commit()`, and `rollback()` in the `catch`.

---

## 6. Business rules (the dashboard already follows these)

Put these in `service/`, not in the UI. The web dashboard (`web/lib/db.ts`) uses the same rules and messages, so you can compare behaviour side by side.

| Operation | Rule |
|---|---|
| Save event | Name and code required; code unique; `end_date >= start_date`; capacity ≥ 1; capacity can't drop below the current confirmed + checked-in count. Raising capacity promotes the waitlist. |
| Delete event | Deletes its sessions and registrations (`ON DELETE CASCADE`). Participant records stay. |
| Save participant | Name required; valid email; email unique; phone is digits, spaces, `+` or `-`. |
| Delete participant | Deletes their registrations, then promotes each affected event's waitlist. |
| **Register** | Event must be `open`. Reject when the participant already has a non-cancelled registration for that event. If confirmed + checked-in < capacity, status is `confirmed`; otherwise it is `waitlisted`. Ticket code = `<EVENT CODE>-<number>`. |
| Cancel | Not allowed once checked in. Sets `cancelled`, then promotes the earliest waitlisted registration into the free seat. |
| Check in | Only `confirmed` can become `checked_in`; store `checked_in_at`. Lookup by ticket code works too. |
| Save session | Title and room required; end after start; date inside the event's dates; **no room clash**: the same room on the same date can't overlap another session. |

The capacity check must be safe when two people register at once. Run it in one transaction and lock the event row (`SELECT … FROM events WHERE id=? FOR UPDATE`) before counting seats. `Service.register()` in `backend/src/main/java/com/eventra/Service.java` does exactly this. Copy it into the JavaFX app's service layer rather than rewriting it.

The room-clash check for sessions is one query:

```sql
SELECT title FROM sessions
WHERE room = ? AND session_date = ? AND id <> ?
  AND start_time < ?   -- new end
  AND ? < end_time     -- new start
LIMIT 1;
```

---

## 7. JavaFX screens and event handling

Build one screen per dashboard page. Switch between them from a left `ListView` / `VBox` of buttons inside a `BorderPane`.

| Screen | Controls | Event handling to show in the viva |
|---|---|---|
| **Overview** | 4 `Label` KPI tiles, `AreaChart` (registrations per day), `BarChart` or `ProgressBar` per event | `Timeline` refresh every 30 s; clicking an event row opens Event details |
| **Events** | `TableView<Event>`, search `TextField`, status `ComboBox`, New / Edit / Delete `Button`s, form `Dialog` with `DatePicker`s and a capacity `Spinner` | `setOnAction` on buttons; `textProperty().addListener` filters the `FilteredList` as you type; double-click row (`setOnMouseClicked`, `getClickCount()==2`) opens details; `Alert(CONFIRMATION)` before delete |
| **Registrations** | `TableView<RegistrationRow>`, event and status `ComboBox` filters, ticket `TextField` + **Check in** button, **Register** dialog with a searchable participant list | `setOnKeyPressed` (Enter in the ticket field checks in); `selectedItemProperty` listener enables or disables Cancel / Check in; waitlist promotion shown in an `Alert(INFORMATION)` |
| **Schedule** | `TableView` or `GridPane` grouped by day, event filter, Add / Edit / Delete | Validation on `focusedProperty` (end time after start); clash message from the service shown under the form |
| **Participants** | `TableView<Participant>`, search, Add / Edit / Delete, side panel with the registration history `ListView` | `selectedItemProperty` listener loads that person's history; email field turns red on invalid input (`textProperty` listener + CSS pseudo-class) |

Also:

- Run JDBC calls off the UI thread with `javafx.concurrent.Task`, then update the table in `setOnSucceeded`. The window must not freeze.
- Show every service error in an `Alert` with the same message the dashboard shows.
- Keyboard shortcuts: `Ctrl+N` new, `Ctrl+F` search, `Delete` key on a selected row. Register them with `scene.getAccelerators().put(...)`.
- Export CSV from each table (`FileChooser` → write rows). The dashboard has the same buttons.

---

## 8. The deployed API (`backend/`)

| File | What it does |
|---|---|
| `backend/src/main/java/com/eventra/Server.java` | JDK `HttpServer` on `127.0.0.1:$PORT`: routing, JSON, CORS for local dev, a write limit per client address |
| `backend/src/main/java/com/eventra/Service.java` | Every rule from section 6, each write in one transaction |
| `backend/src/main/java/com/eventra/Db.java` | JDBC: connections, schema, row mapping, one-time seed |
| `backend/src/main/java/com/eventra/Models.java` | Records with the same field names the dashboard uses |
| `backend/deploy/` | Host setup, systemd unit, install script, sample data |

Endpoints (JSON in, JSON out; refusals come back as `400` / `404` / `409` with `{"message": "..."}`, which the dashboard shows in its toast):

| Method | Path | Does |
|---|---|---|
| GET | `/api/health` | Health check (touches the database) |
| GET | `/api/db` | Every event, participant, session and registration |
| POST / PUT | `/api/events[/{id}]` | Create or edit an event |
| DELETE | `/api/events/{id}` | Delete an event with its sessions and registrations |
| POST / PUT | `/api/participants[/{id}]` | Add or edit a participant |
| DELETE | `/api/participants/{id}` | Remove a participant, promote the waitlists they freed |
| POST | `/api/registrations` | Register (`eventId`, `participantId`, `notes`) |
| POST | `/api/registrations/{id}/cancel` | Cancel, promote the waitlist |
| POST | `/api/registrations/{id}/check-in` | Check in a confirmed registration |
| POST / PUT / DELETE | `/api/sessions[/{id}]` | Schedule, with the room-clash check |

Configuration comes from the environment only: `DB_URL`, `DB_USER`, `DB_PASSWORD`, `PORT` (default 8796), `SEED_FILE`, `CORS_ORIGINS`.

Build and run it locally against your own MySQL:

```bash
cd backend
mvn -q package
DB_URL='jdbc:mysql://127.0.0.1:3306/eventra' DB_USER=eventra DB_PASSWORD='choose-a-password' \
  SEED_FILE=deploy/seed.json \
  java -jar target/eventra-backend.jar
curl http://127.0.0.1:8796/api/health
```

Deploying to a Linux server: copy `backend/deploy/setup-host.sh` to the server and run it once as root. It installs MySQL 8 (local-only), creates the database and a generated password in `/etc/eventra/eventra.env`, and unpacks a Java 21 runtime into `/opt/eventra/jre`. Then copy `target/eventra-backend.jar`, `deploy/seed.json` and `deploy/eventra-api.service` to `/tmp/eventra-release/` and run `deploy/install.sh`. The API runs as the `eventra-api` systemd service, behind a reverse proxy that adds HTTPS. The website's host forwards `/api/*` to it, so the browser only ever talks to one origin.

## 9. If you build option B (Swing, 14 marks)

Same database, DAOs and services. Change only the UI layer:

`JFrame` + `CardLayout` for screens, `JTable` with an `AbstractTableModel`, `JTextField` + `DocumentListener` for live search, `JComboBox`, `JSpinner`, `JOptionPane` for confirms and errors. Event handling: `ActionListener`, `ListSelectionListener`, `MouseAdapter` (double-click), `KeyListener` / key bindings. Run DB work in a `SwingWorker`.

## 10. If you build option A (AWT + SQLite, 12 marks)

Use driver `org.xerial:sqlite-jdbc` and URL `jdbc:sqlite:eventra.db`. SQLite has no `ENUM`, so use `TEXT` with `CHECK (status IN (...))`. It has no `FOR UPDATE` either, so start the transaction with `BEGIN IMMEDIATE` instead. Add `PRAGMA foreign_keys = ON;` on every connection. UI: `Frame`, `Panel`, `List`, `TextField`, `Choice`, `Button`, `Dialog`; handlers `ActionListener`, `ItemListener`, `TextListener`, `WindowAdapter` (close).

---

## 11. Done when

- [ ] `schema.sql` creates all four tables on a fresh MySQL.
- [ ] Each screen can create, view, edit, delete and search its records.
- [ ] Registering the (capacity + 1)th person puts them on the waitlist. Cancelling a confirmed seat promotes the earliest waitlisted person.
- [ ] A duplicate registration, a duplicate email and a room clash are each refused with a clear message.
- [ ] Check-in by ticket code works. A cancelled or waitlisted ticket can't check in.
- [ ] Closing and reopening the app shows the same data, read from MySQL.
- [ ] No SQL built by string concatenation (`grep -n "\" +" src/main/java/com/eventra/dao` finds nothing).

---

## Where everything lives

| Path | What |
|---|---|
| `web/` | Next.js app. Landing at `/`, dashboard at `/dashboard` |
| `backend/` | Java API (JDBC + MySQL) and its deploy files |

Run the app with `cd web && npm install && npm run dev`, then open <http://localhost:3000/>. Without a reachable API the dashboard switches to an offline copy kept in the browser and says so in its header.
