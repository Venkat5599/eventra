package com.eventra;

import com.eventra.Models.*;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** HTTP API for the Eventra dashboard. JDK HttpServer + JDBC (MySQL). Config comes from the environment only. */
public final class Server {
    private static final ObjectMapper JSON = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private static final int MAX_BODY = 64 * 1024;
    private static final int WRITES_PER_WINDOW = 120;
    private static final long WINDOW_MS = 10 * 60 * 1000;

    private final Db db;
    private final Service svc;
    private final Set<String> corsOrigins;
    private final Map<String, Deque<Long>> writes = new ConcurrentHashMap<>();

    Server(Db db, Set<String> corsOrigins) {
        this.db = db;
        this.svc = new Service(db);
        this.corsOrigins = corsOrigins;
    }

    static String env(String k, String def) {
        String v = System.getenv(k);
        return v == null || v.isBlank() ? def : v;
    }

    static String required(String k) {
        String v = System.getenv(k);
        if (v == null || v.isBlank()) throw new IllegalStateException("Missing environment variable " + k);
        return v;
    }

    public static void main(String[] args) throws Exception {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        Db db = new Db(required("DB_URL"), required("DB_USER"), required("DB_PASSWORD"));
        db.migrate();

        Set<String> cors = new HashSet<>();
        for (String o : env("CORS_ORIGINS", "").split(",")) if (!o.isBlank()) cors.add(o.trim());

        int port = Integer.parseInt(env("PORT", "8796"));
        String host = env("HOST", "127.0.0.1");
        Server s = new Server(db, cors);
        HttpServer http = HttpServer.create(new InetSocketAddress(host, port), 64);
        http.createContext("/", s::handle);
        http.setExecutor(Executors.newFixedThreadPool(8));
        http.start();
        System.out.println("Eventra API listening on http://" + host + ":" + port);
    }

    // ------------------------------------------------------------------ routing
    private static final Pattern EVENT = Pattern.compile("^/api/events/([A-Za-z0-9_-]{1,40})$");
    private static final Pattern PARTICIPANT = Pattern.compile("^/api/participants/([A-Za-z0-9_-]{1,40})$");
    private static final Pattern SESSION = Pattern.compile("^/api/sessions/([A-Za-z0-9_-]{1,40})$");
    private static final Pattern REG_ACTION = Pattern.compile("^/api/registrations/([A-Za-z0-9_-]{1,40})/(cancel|check-in)$");

    private void handle(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod(), path = ex.getRequestURI().getPath();
        try {
            cors(ex);
            if ("OPTIONS".equals(method)) { send(ex, 204, null); return; }
            if (!"GET".equals(method) && !allowWrite(clientIp(ex))) {
                send(ex, 429, Map.of("message", "Too many changes from this address. Wait a few minutes and try again."));
                return;
            }
            Object out = route(ex, method, path);
            if (out == null) send(ex, 404, Map.of("message", "Not found."));
            else send(ex, 200, out);
        } catch (Refused r) {
            send(ex, r.status, Map.of("message", r.getMessage()));
        } catch (com.fasterxml.jackson.core.JsonProcessingException j) {
            send(ex, 400, Map.of("message", "The request body isn't valid JSON."));
        } catch (Exception e) {
            e.printStackTrace();
            send(ex, 500, Map.of("message", "The server hit an error. Try again."));
        } finally {
            ex.close();
        }
    }

    private Object route(HttpExchange ex, String method, String path) throws Exception {
        Matcher m;
        switch (method + " " + path) {
            case "GET /api/health": {
                db.snapshot();
                return Map.of("ok", true, "service", "eventra-api");
            }
            case "GET /api/country": return Map.of("country", "US");
            case "GET /api/db": return db.snapshot();
            case "POST /api/events": return svc.saveEvent(null, body(ex, EventInput.class));
            case "POST /api/participants": return svc.saveParticipant(null, body(ex, ParticipantInput.class));
            case "POST /api/registrations": return svc.register(body(ex, RegisterInput.class));
            case "POST /api/sessions": return svc.saveSession(null, body(ex, SessionInput.class));
            default: break;
        }
        if ((m = EVENT.matcher(path)).matches()) {
            if ("PUT".equals(method)) return svc.saveEvent(m.group(1), body(ex, EventInput.class));
            if ("DELETE".equals(method)) return svc.deleteEvent(m.group(1));
        }
        if ((m = PARTICIPANT.matcher(path)).matches()) {
            if ("PUT".equals(method)) return svc.saveParticipant(m.group(1), body(ex, ParticipantInput.class));
            if ("DELETE".equals(method)) return svc.deleteParticipant(m.group(1));
        }
        if ((m = SESSION.matcher(path)).matches()) {
            if ("PUT".equals(method)) return svc.saveSession(m.group(1), body(ex, SessionInput.class));
            if ("DELETE".equals(method)) return svc.deleteSession(m.group(1));
        }
        if ((m = REG_ACTION.matcher(path)).matches() && "POST".equals(method)) {
            return "cancel".equals(m.group(2)) ? svc.cancel(m.group(1)) : svc.checkIn(m.group(1));
        }
        return null;
    }

    // ------------------------------------------------------------------ helpers
    private <T> T body(HttpExchange ex, Class<T> type) throws IOException {
        try (InputStream in = ex.getRequestBody()) {
            byte[] b = in.readNBytes(MAX_BODY + 1);
            if (b.length > MAX_BODY) throw new Refused(413, "Request body is too large.");
            if (b.length == 0) throw Refused.bad("Request body is empty.");
            return JSON.readValue(b, type);
        }
    }

    private void cors(HttpExchange ex) {
        String origin = ex.getRequestHeaders().getFirst("Origin");
        if (origin != null && corsOrigins.contains(origin)) {
            var h = ex.getResponseHeaders();
            h.set("Access-Control-Allow-Origin", origin);
            h.set("Vary", "Origin");
            h.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            h.set("Access-Control-Allow-Headers", "Content-Type");
        }
    }

    /** The app listens on loopback behind a reverse proxy, so the client is the first X-Forwarded-For entry. */
    private static String clientIp(HttpExchange ex) {
        String remote = ex.getRemoteAddress().getAddress().getHostAddress();
        boolean loopback = ex.getRemoteAddress().getAddress().isLoopbackAddress();
        String xff = ex.getRequestHeaders().getFirst("X-Forwarded-For");
        if (loopback && xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return remote;
    }

    private boolean allowWrite(String ip) {
        long now = System.currentTimeMillis();
        Deque<Long> q = writes.computeIfAbsent(ip, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst() > WINDOW_MS) q.pollFirst();
            if (q.size() >= WRITES_PER_WINDOW) return false;
            q.addLast(now);
            return true;
        }
    }

    private static void send(HttpExchange ex, int status, Object body) throws IOException {
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        if (body == null) {
            ex.sendResponseHeaders(status, -1);
            return;
        }
        byte[] b = JSON.writeValueAsBytes(body);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(status, b.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(b); }
    }

    static { System.setProperty("file.encoding", StandardCharsets.UTF_8.name()); }
}
