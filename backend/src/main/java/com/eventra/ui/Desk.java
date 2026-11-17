package com.eventra.ui;

import com.eventra.App;
import com.eventra.Db;
import com.eventra.Models.EventItem;
import com.eventra.Models.Participant;
import com.eventra.Models.Registration;
import com.eventra.Models.Session;
import com.eventra.Models.Snapshot;
import com.eventra.Service;
import javafx.application.HostServices;
import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.geometry.Insets;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.ButtonType;
import javafx.scene.control.Hyperlink;
import javafx.scene.control.Label;
import javafx.scene.control.Separator;
import javafx.scene.input.KeyCode;
import javafx.scene.input.KeyCodeCombination;
import javafx.scene.input.KeyCombination;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

import java.util.List;

/** Main window. Every navigation button is a real event handler, not a page link. */
public final class Desk {
    public static final String REPO = "https://github.com/Venkat5599/eventra";

    private final Db db;
    private final Service service;
    private final HostServices host;
    private final StackPane cards = new StackPane();
    private final Label status = new Label("Reading the database…");
    private Snapshot snap = new Snapshot(List.of(), List.of(), List.of(), List.of());

    private OverviewPane overview;
    private EventsPane events;
    private RegsPane regs;
    private SchedulePane schedule;
    private PeoplePane people;

    public Desk(Db db, HostServices host) {
        this.db = db;
        this.service = new Service(db);
        this.host = host;
    }

    public void show(Stage stage) {
        overview = new OverviewPane(this);
        events = new EventsPane(this);
        regs = new RegsPane(this);
        schedule = new SchedulePane(this);
        people = new PeoplePane(this);
        cards.getChildren().addAll(overview.root(), events.root(), regs.root(), schedule.root(), people.root());
        show("overview");

        VBox nav = new VBox(6,
                link(),
                new Separator(),
                navButton("Overview", "overview"),
                navButton("Events", "events"),
                navButton("Registrations", "registrations"),
                navButton("Schedule", "schedule"),
                navButton("Participants", "participants"));
        nav.setPadding(new Insets(12));
        nav.setPrefWidth(180);

        BorderPane root = new BorderPane();
        root.setLeft(nav);
        root.setCenter(cards);
        root.setBottom(status);
        BorderPane.setMargin(status, new Insets(8, 12, 8, 12));

        Scene scene = new Scene(root, 1100, 700);
        scene.getAccelerators().put(new KeyCodeCombination(KeyCode.N, KeyCombination.CONTROL_DOWN), () -> events.newEvent());
        scene.getAccelerators().put(new KeyCodeCombination(KeyCode.F, KeyCombination.CONTROL_DOWN), () -> focusSearch());
        scene.setOnKeyPressed(ev -> {
            if (ev.getCode() == KeyCode.DELETE) deleteSelected();
        });
        stage.setTitle("Eventra — Event Registration Management System");
        stage.setScene(scene);
        stage.setOnShown(ev -> refresh());
        stage.show();
    }

    private Hyperlink link() {
        Hyperlink link = new Hyperlink("Project link");
        link.setOnAction(ev -> host.showDocument(REPO));
        return link;
    }

    private Button navButton(String label, String card) {
        Button b = new Button(label);
        b.setMaxWidth(Double.MAX_VALUE);
        b.setOnAction(ev -> show(card));
        return b;
    }

    void show(String card) {
        overview.root().setVisible("overview".equals(card));
        events.root().setVisible("events".equals(card));
        regs.root().setVisible("registrations".equals(card));
        schedule.root().setVisible("schedule".equals(card));
        people.root().setVisible("participants".equals(card));
    }

    private void focusSearch() {
        if (events.root().isVisible()) events.focusSearch();
        else if (people.root().isVisible()) people.focusSearch();
    }

    private void deleteSelected() {
        if (events.root().isVisible()) events.deleteSelected();
        else if (people.root().isVisible()) people.deleteSelected();
        else if (schedule.root().isVisible()) schedule.deleteSelected();
    }

    void refresh() {
        Task<Snapshot> task = new Task<>() {
            @Override
            protected Snapshot call() throws Exception {
                return db.snapshot();
            }
        };
        task.setOnSucceeded(ev -> {
            snap = task.getValue();
            overview.render(snap);
            events.render(snap);
            regs.render(snap);
            schedule.render(snap);
            people.render(snap);
            status.setText(snap.events().size() + " events · " + snap.participants().size() + " participants · "
                    + snap.registrations().size() + " registrations · " + snap.sessions().size() + " sessions");
        });
        task.setOnFailed(ev -> {
            status.setText("Database read failed.");
            App.error(message(task.getException()));
        });
        Thread t = new Thread(task, "eventra-read");
        t.setDaemon(true);
        t.start();
    }

    void run(String doing, java.util.concurrent.Callable<?> work) {
        Task<Object> task = new Task<>() {
            @Override
            protected Object call() throws Exception {
                return work.call();
            }
        };
        task.setOnSucceeded(ev -> {
            Object v = task.getValue();
            if (v instanceof Service.Done<?> done) status.setText(done.message());
            refresh();
        });
        task.setOnFailed(ev -> {
            status.setText("Not saved.");
            App.error(message(task.getException()));
        });
        Thread t = new Thread(task, doing);
        t.setDaemon(true);
        t.start();
    }

    boolean confirm(String title, String body) {
        Alert a = new Alert(Alert.AlertType.CONFIRMATION, body, ButtonType.OK, ButtonType.CANCEL);
        a.setHeaderText(title);
        return a.showAndWait().orElse(ButtonType.CANCEL) == ButtonType.OK;
    }

    void info(String message) {
        Platform.runLater(() -> {
            Alert a = new Alert(Alert.AlertType.INFORMATION);
            a.setHeaderText(null);
            a.setContentText(message);
            a.showAndWait();
        });
    }

    Service service() { return service; }
    Snapshot snap() { return snap; }

    static String message(Throwable e) {
        Throwable c = e;
        while (c.getCause() != null && c.getCause() != c) c = c.getCause();
        return c.getMessage() == null ? c.getClass().getSimpleName() : c.getMessage();
    }

    static String eventName(Snapshot s, String id) {
        for (EventItem e : s.events()) if (e.id().equals(id)) return e.name();
        return id;
    }

    static String personName(Snapshot s, String id) {
        for (Participant p : s.participants()) if (p.id().equals(id)) return p.name();
        return id;
    }

    static EventItem event(Snapshot s, String id) {
        for (EventItem e : s.events()) if (e.id().equals(id)) return e;
        return null;
    }

    static Participant person(Snapshot s, String id) {
        for (Participant p : s.participants()) if (p.id().equals(id)) return p;
        return null;
    }

    static Registration registration(Snapshot s, String id) {
        for (Registration r : s.registrations()) if (r.id().equals(id)) return r;
        return null;
    }

    static Session session(Snapshot s, String id) {
        for (Session x : s.sessions()) if (x.id().equals(id)) return x;
        return null;
    }
}
