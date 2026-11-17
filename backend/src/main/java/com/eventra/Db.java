package com.eventra;

import com.eventra.Models.*;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/** JDBC access: connections, schema, row mapping, and the one-time sample seed. */
public final class Db {
    private final String url, user, password;

    public Db(String url, String user, String password) {
        this.url = url; this.user = user; this.password = password;
    }

    public Connection get() throws SQLException {
        return DriverManager.getConnection(url, user, password);
    }

    /** Applies schema.sql; every statement is CREATE TABLE IF NOT EXISTS. */
    public void migrate() throws SQLException, IOException {
        String sql;
        try (InputStream in = Db.class.getResourceAsStream("/schema.sql")) {
            sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        sql = sql.replaceAll("(?m)^--.*$", "");
        try (Connection c = get(); Statement st = c.createStatement()) {
            for (String part : sql.split(";")) {
                if (!part.isBlank()) st.execute(part);
            }
        }
    }

    // ------------------------------------------------------------------ mappers
    static EventItem event(ResultSet r) throws SQLException {
        return new EventItem(r.getString("id"), r.getString("code"), r.getString("name"), r.getString("category"),
                r.getString("venue"), r.getString("description"), r.getDate("start_date").toLocalDate().toString(),
                r.getDate("end_date").toLocalDate().toString(), r.getInt("capacity"), r.getString("status"),
                r.getString("organizer"));
    }

    static Participant participant(ResultSet r) throws SQLException {
        return new Participant(r.getString("id"), r.getString("name"), r.getString("email"), r.getString("phone"),
                r.getString("organization"), r.getString("department"), Models.iso(r.getTimestamp("created_at")));
    }

    static Session session(ResultSet r) throws SQLException {
        return new Session(r.getString("id"), r.getString("event_id"), r.getString("title"), r.getString("speaker"),
                r.getString("room"), r.getDate("session_date").toLocalDate().toString(),
                r.getTime("start_time").toLocalTime().toString(), r.getTime("end_time").toLocalTime().toString());
    }

    static Registration registration(ResultSet r) throws SQLException {
        return new Registration(r.getString("id"), r.getString("event_id"), r.getString("participant_id"),
                r.getString("status"), Models.iso(r.getTimestamp("registered_at")),
                Models.iso(r.getTimestamp("checked_in_at")), r.getString("ticket_code"), r.getString("notes"));
    }

    interface Mapper<T> { T map(ResultSet r) throws SQLException; }

    static <T> List<T> list(Connection c, String sql, Mapper<T> m, Object... args) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, args);
            try (ResultSet rs = ps.executeQuery()) {
                List<T> out = new ArrayList<>();
                while (rs.next()) out.add(m.map(rs));
                return out;
            }
        }
    }

    static <T> T one(Connection c, String sql, Mapper<T> m, Object... args) throws SQLException {
        List<T> l = list(c, sql, m, args);
        return l.isEmpty() ? null : l.get(0);
    }

    static int count(Connection c, String sql, Object... args) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, args);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getInt(1); }
        }
    }

    static int update(Connection c, String sql, Object... args) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, args);
            return ps.executeUpdate();
        }
    }

    static void bind(PreparedStatement ps, Object... args) throws SQLException {
        for (int i = 0; i < args.length; i++) ps.setObject(i + 1, args[i]);
    }

    public Snapshot snapshot() throws SQLException {
        try (Connection c = get()) {
            return new Snapshot(
                    list(c, "SELECT * FROM events ORDER BY start_date, name", Db::event),
                    list(c, "SELECT * FROM participants ORDER BY name", Db::participant),
                    list(c, "SELECT * FROM sessions ORDER BY session_date, start_time", Db::session),
                    list(c, "SELECT * FROM registrations ORDER BY registered_at", Db::registration));
        }
    }

    /** Loads the sample data set once, only into an empty database. */
    public int seedIfEmpty(String seedFile, ObjectMapper json) throws SQLException, IOException {
        if (seedFile == null || seedFile.isBlank() || !Files.exists(Path.of(seedFile))) return 0;
        try (Connection c = get()) {
            if (count(c, "SELECT COUNT(*) FROM events") > 0 || count(c, "SELECT COUNT(*) FROM participants") > 0) return 0;
            Snapshot s = json.readValue(Files.readString(Path.of(seedFile)), Snapshot.class);
            c.setAutoCommit(false);
            try {
                for (EventItem e : s.events())
                    update(c, "INSERT INTO events(id,code,name,category,venue,description,start_date,end_date,capacity,status,organizer) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                            e.id(), e.code(), e.name(), e.category(), e.venue(), e.description(), Date.valueOf(e.startDate()),
                            Date.valueOf(e.endDate()), e.capacity(), e.status(), e.organizer());
                for (Participant p : s.participants())
                    update(c, "INSERT INTO participants(id,name,email,phone,organization,department,created_at) VALUES (?,?,?,?,?,?,?)",
                            p.id(), p.name(), p.email(), p.phone(), p.organization(), p.department(), Models.ts(p.createdAt()));
                for (Session x : s.sessions())
                    update(c, "INSERT INTO sessions(id,event_id,title,speaker,room,session_date,start_time,end_time) VALUES (?,?,?,?,?,?,?,?)",
                            x.id(), x.eventId(), x.title(), x.speaker(), x.room(), Date.valueOf(x.date()),
                            Time.valueOf(x.start() + ":00"), Time.valueOf(x.end() + ":00"));
                for (Registration r : s.registrations()) {
                    String t = r.ticketCode();
                    int seq = Integer.parseInt(t.substring(t.lastIndexOf('-') + 1)) - 1000;
                    update(c, "INSERT INTO registrations(id,seq,event_id,participant_id,status,ticket_code,notes,registered_at,checked_in_at) VALUES (?,?,?,?,?,?,?,?,?)",
                            r.id(), seq, r.eventId(), r.participantId(), r.status(), t, Models.str(r.notes()),
                            Models.ts(r.registeredAt()), Models.ts(r.checkedInAt()));
                }
                c.commit();
            } catch (Exception e) {
                c.rollback();
                throw e;
            }
            return s.events().size() + s.participants().size() + s.sessions().size() + s.registrations().size();
        }
    }
}
