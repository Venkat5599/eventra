package com.eventra;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** Rows exchanged with the dashboard. Field names match the frontend JSON exactly. */
public final class Models {
    private Models() {}

    public record EventItem(String id, String code, String name, String category, String venue, String description,
                            String startDate, String endDate, int capacity, String status, String organizer) {}

    public record Participant(String id, String name, String email, String phone, String organization,
                              String department, String createdAt) {}

    public record Session(String id, String eventId, String title, String speaker, String room, String date,
                          String start, String end) {}

    public record Registration(String id, String eventId, String participantId, String status, String registeredAt,
                               String checkedInAt, String ticketCode, String notes) {}

    public record Snapshot(List<EventItem> events, List<Participant> participants, List<Session> sessions,
                           List<Registration> registrations) {}

    // ---- request bodies
    public record EventInput(String code, String name, String category, String venue, String description,
                             String startDate, String endDate, Integer capacity, String status, String organizer) {}

    public record ParticipantInput(String name, String email, String phone, String organization, String department) {}

    public record SessionInput(String eventId, String title, String speaker, String room, String date, String start,
                               String end) {}

    public record RegisterInput(String eventId, String participantId, String notes) {}

    /** A rule refusal: becomes HTTP 400/404/409 with {"message": ...}. */
    public static final class Refused extends RuntimeException {
        public final int status;
        public Refused(int status, String message) { super(message); this.status = status; }
        public static Refused bad(String m) { return new Refused(400, m); }
        public static Refused notFound(String m) { return new Refused(404, m); }
        public static Refused conflict(String m) { return new Refused(409, m); }
    }

    static LocalDate date(String s, String field) {
        try { return LocalDate.parse(s); } catch (Exception e) { throw Refused.bad(field + " must be a date (YYYY-MM-DD)."); }
    }

    static LocalTime time(String s, String field) {
        try { return LocalTime.parse(s); } catch (Exception e) { throw Refused.bad(field + " must be a time (HH:MM)."); }
    }

    static String iso(java.sql.Timestamp t) { return t == null ? null : t.toInstant().toString(); }

    static java.sql.Timestamp ts(String iso) { return iso == null ? null : java.sql.Timestamp.from(Instant.parse(iso)); }

    static String str(String s) { return s == null ? "" : s.trim(); }
}
