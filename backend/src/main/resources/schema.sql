-- Eventra schema (MySQL 8). Applied automatically by the server on start (CREATE ... IF NOT EXISTS).

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
