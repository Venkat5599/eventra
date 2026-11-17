package com.eventra;

import com.eventra.Models.*;

import java.security.SecureRandom;
import java.sql.*;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Business rules. Every write runs in one transaction; anything that depends on
 * seat counts locks the event row first (SELECT ... FOR UPDATE) so two people
 * registering at the same moment can't both take the last seat.
 */
public final class Service {
    public record Done<T>(String message, T value) {}

    private static final Set<String> EVENT_STATUS = Set.of("draft", "open", "closed", "completed");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern PHONE = Pattern.compile("^[+\\d][\\d\\s-]{6,}$");
    private static final Pattern CODE = Pattern.compile("^[A-Z0-9]{2,8}$");
    private static final SecureRandom RND = new SecureRandom();

    private final Db db;

    public Service(Db db) { this.db = db; }

    static String newId(String prefix) {
        String a = "abcdefghijklmnopqrstuvwxyz0123456789";
        StringBuilder b = new StringBuilder(prefix).append('_');
        for (int i = 0; i < 12; i++) b.append(a.charAt(RND.nextInt(a.length())));
        return b.toString();
    }

    interface Tx<T> { T run(Connection c) throws SQLException; }

    private <T> T tx(Tx<T> body) throws SQLException {
        try (Connection c = db.get()) {
            c.setAutoCommit(false);
            c.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
            try {
                T out = body.run(c);
                c.commit();
                return out;
            } catch (RuntimeException | SQLException e) {
                c.rollback();
                throw e;
            }
        }
    }

    private static int active(Connection c, String eventId) throws SQLException {
        return Db.count(c, "SELECT COUNT(*) FROM registrations WHERE event_id=? AND status IN ('confirmed','checked_in')", eventId);
    }

    private static EventItem lockEvent(Connection c, String id) throws SQLException {
        EventItem e = Db.one(c, "SELECT * FROM events WHERE id=? FOR UPDATE", Db::event, id);
        if (e == null) throw Refused.notFound("Event not found.");
        return e;
    }

    /** Moves the earliest waitlisted registrations into free seats; returns the first promoted name or null. */
    private static String promote(Connection c, String eventId) throws SQLException {
        EventItem e = lockEvent(c, eventId);
        int free = e.capacity() - active(c, eventId);
        if (free <= 0) return null;
        List<Registration> queue = Db.list(c,
                "SELECT * FROM registrations WHERE event_id=? AND status='waitlisted' ORDER BY registered_at, seq LIMIT " + free,
                Db::registration, eventId);
        String first = null;
        for (Registration r : queue) {
            Db.update(c, "UPDATE registrations SET status='confirmed' WHERE id=?", r.id());
            if (first == null)
                first = Db.one(c, "SELECT name FROM participants WHERE id=?", rs -> rs.getString(1), r.participantId());
        }
        return first;
    }

    // ------------------------------------------------------------------ events
    public Done<EventItem> saveEvent(String id, EventInput in) throws SQLException {
        String name = Models.str(in.name()), code = Models.str(in.code()).toUpperCase(Locale.ROOT);
        if (name.isEmpty()) throw Refused.bad("Event name is required.");
        if (code.isEmpty()) throw Refused.bad("Event code is required.");
        if (!CODE.matcher(code).matches()) throw Refused.bad("Event code is 2–8 letters or digits.");
        LocalDate start = Models.date(in.startDate(), "Start date"), end = Models.date(in.endDate(), "End date");
        if (end.isBefore(start)) throw Refused.bad("End date cannot be before the start date.");
        int cap = in.capacity() == null ? 0 : in.capacity();
        if (cap < 1) throw Refused.bad("Capacity must be at least 1.");
        if (cap > 100000) throw Refused.bad("Capacity is too large.");
        String status = Models.str(in.status()).isEmpty() ? "draft" : Models.str(in.status());
        if (!EVENT_STATUS.contains(status)) throw Refused.bad("Unknown event status.");
        String category = Models.str(in.category()).isEmpty() ? "Workshop" : Models.str(in.category());

        return tx(c -> {
            if (Db.count(c, "SELECT COUNT(*) FROM events WHERE code=? AND id<>?", code, id == null ? "" : id) > 0)
                throw Refused.conflict("Another event already uses code " + code + ".");
            if (id != null) {
                lockEvent(c, id);
                int taken = active(c, id);
                if (cap < taken) throw Refused.bad("Capacity can't go below the " + taken + " confirmed seats.");
                Db.update(c, "UPDATE events SET code=?,name=?,category=?,venue=?,description=?,start_date=?,end_date=?,capacity=?,status=?,organizer=? WHERE id=?",
                        code, name, category, Models.str(in.venue()), Models.str(in.description()), Date.valueOf(start),
                        Date.valueOf(end), cap, status, Models.str(in.organizer()), id);
                promote(c, id);
                EventItem saved = Db.one(c, "SELECT * FROM events WHERE id=?", Db::event, id);
                return new Done<>("Saved " + saved.name() + ".", saved);
            }
            String nid = newId("evt");
            Db.update(c, "INSERT INTO events(id,code,name,category,venue,description,start_date,end_date,capacity,status,organizer) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    nid, code, name, category, Models.str(in.venue()), Models.str(in.description()), Date.valueOf(start),
                    Date.valueOf(end), cap, status, Models.str(in.organizer()));
            EventItem saved = Db.one(c, "SELECT * FROM events WHERE id=?", Db::event, nid);
            return new Done<>("Created " + saved.name() + ".", saved);
        });
    }

    public Done<Void> deleteEvent(String id) throws SQLException {
        return tx(c -> {
            EventItem e = lockEvent(c, id);
            Db.update(c, "DELETE FROM events WHERE id=?", id);
            return new Done<>("Deleted " + e.name() + " with its sessions and registrations.", null);
        });
    }

    // ------------------------------------------------------------------ participants
    public Done<Participant> saveParticipant(String id, ParticipantInput in) throws SQLException {
        String name = Models.str(in.name()), email = Models.str(in.email()).toLowerCase(Locale.ROOT), phone = Models.str(in.phone());
        if (name.isEmpty()) throw Refused.bad("Name is required.");
        if (!EMAIL.matcher(email).matches()) throw Refused.bad("Enter a valid email address.");
        if (!phone.isEmpty() && !PHONE.matcher(phone).matches()) throw Refused.bad("Enter a valid phone number.");
        return tx(c -> {
            if (Db.count(c, "SELECT COUNT(*) FROM participants WHERE email=? AND id<>?", email, id == null ? "" : id) > 0)
                throw Refused.conflict(email + " is already registered as a participant.");
            if (id != null) {
                if (Db.update(c, "UPDATE participants SET name=?,email=?,phone=?,organization=?,department=? WHERE id=?",
                        name, email, phone, Models.str(in.organization()), Models.str(in.department()), id) == 0)
                    throw Refused.notFound("Participant not found.");
                return new Done<>("Saved " + name + ".", Db.one(c, "SELECT * FROM participants WHERE id=?", Db::participant, id));
            }
            String nid = newId("prt");
            Db.update(c, "INSERT INTO participants(id,name,email,phone,organization,department,created_at) VALUES (?,?,?,?,?,?,?)",
                    nid, name, email, phone, Models.str(in.organization()), Models.str(in.department()), Timestamp.from(Instant.now()));
            return new Done<>("Added " + name + ".", Db.one(c, "SELECT * FROM participants WHERE id=?", Db::participant, nid));
        });
    }

    public Done<Void> deleteParticipant(String id) throws SQLException {
        return tx(c -> {
            Participant p = Db.one(c, "SELECT * FROM participants WHERE id=?", Db::participant, id);
            if (p == null) throw Refused.notFound("Participant not found.");
            List<String> events = Db.list(c,
                    "SELECT DISTINCT event_id FROM registrations WHERE participant_id=? AND status<>'cancelled' ORDER BY event_id",
                    rs -> rs.getString(1), id);
            for (String e : events) lockEvent(c, e);
            Db.update(c, "DELETE FROM participants WHERE id=?", id);
            for (String e : events) promote(c, e);
            return new Done<>("Removed " + p.name() + " and their registrations.", null);
        });
    }

    // ------------------------------------------------------------------ registrations
    public Done<Registration> register(RegisterInput in) throws SQLException {
        String eventId = Models.str(in.eventId()), participantId = Models.str(in.participantId());
        String notes = Models.str(in.notes());
        if (notes.length() > 200) throw Refused.bad("Notes are limited to 200 characters.");
        return tx(c -> {
            EventItem e = Db.one(c, "SELECT * FROM events WHERE id=? FOR UPDATE", Db::event, eventId);
            Participant p = Db.one(c, "SELECT * FROM participants WHERE id=?", Db::participant, participantId);
            if (e == null || p == null) throw Refused.bad("Pick an event and a participant.");
            if (!"open".equals(e.status())) throw Refused.bad(e.name() + " is " + e.status() + ", registrations are not open.");
            if (Db.count(c, "SELECT COUNT(*) FROM registrations WHERE event_id=? AND participant_id=? AND status<>'cancelled'", eventId, participantId) > 0)
                throw Refused.conflict(p.name() + " is already registered for " + e.name() + ".");
            boolean full = active(c, eventId) >= e.capacity();
            String id = newId("reg");
            String temp = "TMP-" + id.substring(4, 16);
            Db.update(c, "INSERT INTO registrations(id,event_id,participant_id,status,ticket_code,notes,registered_at) VALUES (?,?,?,?,?,?,?)",
                    id, eventId, participantId, full ? "waitlisted" : "confirmed", temp, notes, Timestamp.from(Instant.now()));
            int seq = Db.count(c, "SELECT seq FROM registrations WHERE id=?", id);
            String ticket = e.code() + "-" + (1000 + seq);
            Db.update(c, "UPDATE registrations SET ticket_code=? WHERE id=?", ticket, id);
            Registration r = Db.one(c, "SELECT * FROM registrations WHERE id=?", Db::registration, id);
            String msg = full ? e.name() + " is full. " + p.name() + " is on the waitlist."
                    : p.name() + " is confirmed for " + e.name() + " (" + ticket + ").";
            return new Done<>(msg, r);
        });
    }

    public Done<Void> cancel(String id) throws SQLException {
        return tx(c -> {
            Registration r = Db.one(c, "SELECT * FROM registrations WHERE id=?", Db::registration, id);
            if (r == null) throw Refused.notFound("Registration not found.");
            lockEvent(c, r.eventId());
            r = Db.one(c, "SELECT * FROM registrations WHERE id=? FOR UPDATE", Db::registration, id);
            if ("cancelled".equals(r.status())) throw Refused.conflict("Already cancelled.");
            if ("checked_in".equals(r.status())) throw Refused.conflict("Checked-in registrations can't be cancelled.");
            Db.update(c, "UPDATE registrations SET status='cancelled' WHERE id=?", id);
            String promoted = promote(c, r.eventId());
            return new Done<>(promoted != null ? "Cancelled. " + promoted + " moved up from the waitlist." : "Registration cancelled.", null);
        });
    }

    public Done<Void> checkIn(String id) throws SQLException {
        return tx(c -> {
            Registration r = Db.one(c, "SELECT * FROM registrations WHERE id=? FOR UPDATE", Db::registration, id);
            if (r == null) throw Refused.notFound("Registration not found.");
            if (!"confirmed".equals(r.status()))
                throw Refused.conflict("Only confirmed registrations can check in (this one is " + r.status().replace('_', ' ') + ").");
            Db.update(c, "UPDATE registrations SET status='checked_in', checked_in_at=? WHERE id=?", Timestamp.from(Instant.now()), id);
            String name = Db.one(c, "SELECT name FROM participants WHERE id=?", rs -> rs.getString(1), r.participantId());
            return new Done<>((name == null ? "Participant" : name) + " checked in.", null);
        });
    }

    // ------------------------------------------------------------------ sessions
    public Done<Session> saveSession(String id, SessionInput in) throws SQLException {
        String title = Models.str(in.title()), room = Models.str(in.room());
        if (title.isEmpty()) throw Refused.bad("Session title is required.");
        if (room.isEmpty()) throw Refused.bad("Room is required.");
        LocalTime start = Models.time(in.start(), "Start time"), end = Models.time(in.end(), "End time");
        if (!end.isAfter(start)) throw Refused.bad("End time must be after the start time.");
        LocalDate date = Models.date(in.date(), "Date");
        return tx(c -> {
            EventItem e = Db.one(c, "SELECT * FROM events WHERE id=?", Db::event, Models.str(in.eventId()));
            if (e == null) throw Refused.bad("Pick an event.");
            if (date.isBefore(LocalDate.parse(e.startDate())) || date.isAfter(LocalDate.parse(e.endDate())))
                throw Refused.bad(e.name() + " runs " + e.startDate() + " to " + e.endDate() + ".");
            // lock every session in that room on that day, then look for an overlap
            Session clash = Db.one(c,
                    "SELECT * FROM sessions WHERE LOWER(room)=LOWER(?) AND session_date=? AND id<>? AND start_time<? AND ?<end_time ORDER BY start_time LIMIT 1 FOR UPDATE",
                    Db::session, room, Date.valueOf(date), id == null ? "" : id, Time.valueOf(end), Time.valueOf(start));
            if (clash != null)
                throw Refused.conflict(room + " is booked for “" + clash.title() + "” (" + clash.start() + "–" + clash.end() + ").");
            if (id != null) {
                if (Db.update(c, "UPDATE sessions SET event_id=?,title=?,speaker=?,room=?,session_date=?,start_time=?,end_time=? WHERE id=?",
                        e.id(), title, Models.str(in.speaker()), room, Date.valueOf(date), Time.valueOf(start), Time.valueOf(end), id) == 0)
                    throw Refused.notFound("Session not found.");
                return new Done<>("Saved " + title + ".", Db.one(c, "SELECT * FROM sessions WHERE id=?", Db::session, id));
            }
            String nid = newId("ses");
            Db.update(c, "INSERT INTO sessions(id,event_id,title,speaker,room,session_date,start_time,end_time) VALUES (?,?,?,?,?,?,?,?)",
                    nid, e.id(), title, Models.str(in.speaker()), room, Date.valueOf(date), Time.valueOf(start), Time.valueOf(end));
            return new Done<>("Added " + title + " to the schedule.", Db.one(c, "SELECT * FROM sessions WHERE id=?", Db::session, nid));
        });
    }

    public Done<Void> deleteSession(String id) throws SQLException {
        return tx(c -> {
            if (Db.update(c, "DELETE FROM sessions WHERE id=?", id) == 0) throw Refused.notFound("Session not found.");
            return new Done<>("Session removed.", null);
        });
    }
}
