package com.eventra;

import com.eventra.Models.*;

import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/** JDBC access: a small connection pool, the schema, and row mapping. */
public final class Db {
    private static final int KEEP_OPEN = 4;
    private final String url, user, password;
    private final ArrayDeque<Connection> idle = new ArrayDeque<>();

    public Db(String url, String user, String password) {
        this.url = url; this.user = user; this.password = password;
    }

    /**
     * Hands out a connection. Opening one costs a full MySQL handshake, so up to four are kept open
     * and reused: close() on the returned connection puts it back instead of closing it.
     */
    public Connection get() throws SQLException {
        Connection real = null;
        synchronized (idle) {
            while (!idle.isEmpty()) {
                Connection c = idle.pollFirst();
                if (c.isValid(2)) { real = c; break; }
                try { c.close(); } catch (SQLException ignored) { }
            }
        }
        if (real == null) real = DriverManager.getConnection(url, user, password);
        return lease(real);
    }

    private Connection lease(Connection real) {
        boolean[] returned = {false};
        return (Connection) Proxy.newProxyInstance(Db.class.getClassLoader(), new Class<?>[]{Connection.class}, (proxy, m, args) -> {
            switch (m.getName()) {
                case "close" -> {
                    if (returned[0]) return null;
                    returned[0] = true;
                    giveBack(real);
                    return null;
                }
                case "isClosed" -> { return returned[0] || real.isClosed(); }
                case "unwrap", "isWrapperFor" -> { /* fall through to the real connection */ }
                default -> { if (returned[0]) throw new SQLException("Connection already returned to the pool."); }
            }
            try {
                return m.invoke(real, args);
            } catch (InvocationTargetException e) {
                throw e.getCause();
            }
        });
    }

    private void giveBack(Connection real) {
        try {
            if (real.isClosed()) return;
            if (!real.getAutoCommit()) { real.rollback(); real.setAutoCommit(true); }
            real.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
            synchronized (idle) {
                if (idle.size() < KEEP_OPEN) { idle.addLast(real); return; }
            }
            real.close();
        } catch (SQLException e) {
            try { real.close(); } catch (SQLException ignored) { }
        }
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
}
