package com.eventra.ui;

import com.eventra.Models.EventItem;
import com.eventra.Models.Participant;
import com.eventra.Models.RegisterInput;
import com.eventra.Models.Registration;
import com.eventra.Models.Snapshot;
import javafx.collections.FXCollections;
import javafx.collections.transformation.FilteredList;
import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Dialog;
import javafx.scene.control.Label;
import javafx.scene.control.TableColumn;
import javafx.scene.control.TableView;
import javafx.scene.control.TextField;
import javafx.scene.input.KeyCode;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;

/** Registrations. Enter in the ticket field checks in. Buttons stay disabled until a row is selected. */
public final class RegsPane {
    private final Desk desk;
    private final VBox root = new VBox(8);
    private final ComboBox<String> eventFilter = new ComboBox<>();
    private final ComboBox<String> statusFilter = new ComboBox<>();
    private final TextField ticket = new TextField();
    private final TableView<Registration> table = new TableView<>();
    private final Button cancel = new Button("Cancel");
    private final Button checkIn = new Button("Check in");
    private FilteredList<Registration> rows;

    public RegsPane(Desk desk) {
        this.desk = desk;
        ticket.setPromptText("Ticket code");
        ticket.setOnKeyPressed(ev -> {
            if (ev.getCode() == KeyCode.ENTER) checkInByCode();
        });
        statusFilter.getItems().addAll("all", "confirmed", "waitlisted", "cancelled", "checked_in");
        statusFilter.setValue("all");
        statusFilter.setOnAction(ev -> apply());
        eventFilter.setOnAction(ev -> apply());
        Button register = new Button("Register");
        register.setOnAction(ev -> register());
        checkIn.setOnAction(ev -> {
            Registration r = table.getSelectionModel().getSelectedItem();
            if (r != null) desk.run("check-in", () -> desk.service().checkIn(r.id()));
        });
        cancel.setOnAction(ev -> {
            Registration r = table.getSelectionModel().getSelectedItem();
            if (r == null) return;
            if (!desk.confirm("Cancel " + r.ticketCode() + "?", "A free seat promotes the earliest waitlisted person.")) return;
            desk.run("cancel", () -> desk.service().cancel(r.id()));
        });
        table.getSelectionModel().selectedItemProperty().addListener((obs, old, cur) -> {
            boolean on = cur != null;
            cancel.setDisable(!on);
            checkIn.setDisable(!on);
        });
        cancel.setDisable(true);
        checkIn.setDisable(true);
        col("Ticket", Registration::ticketCode);
        col("Event", r -> Desk.eventName(desk.snap(), r.eventId()));
        col("Participant", r -> Desk.personName(desk.snap(), r.participantId()));
        col("Status", Registration::status);
        root.setPadding(new Insets(16));
        root.getChildren().addAll(new HBox(8, eventFilter, statusFilter, ticket, new Button() {{
            setText("Check in code");
            setOnAction(ev -> checkInByCode());
        }}, register, checkIn, cancel), table);
    }

    public VBox root() { return root; }

    public void render(Snapshot s) {
        String keep = eventFilter.getValue();
        eventFilter.getItems().clear();
        eventFilter.getItems().add("all");
        for (EventItem e : s.events()) eventFilter.getItems().add(e.id() + " " + e.name());
        eventFilter.setValue(keep != null && eventFilter.getItems().contains(keep) ? keep : "all");
        rows = new FilteredList<>(FXCollections.observableArrayList(s.registrations()), x -> true);
        table.setItems(rows);
        apply();
    }

    private void apply() {
        if (rows == null) return;
        String ev = eventFilter.getValue() == null ? "all" : eventFilter.getValue();
        String st = statusFilter.getValue();
        String eventId = "all".equals(ev) ? "" : ev.split(" ")[0];
        rows.setPredicate(r -> (eventId.isEmpty() || eventId.equals(r.eventId())) && ("all".equals(st) || st.equals(r.status())));
    }

    private void checkInByCode() {
        String code = ticket.getText() == null ? "" : ticket.getText().trim();
        if (code.isEmpty()) return;
        for (Registration r : desk.snap().registrations()) {
            if (code.equalsIgnoreCase(r.ticketCode())) {
                desk.run("check-in", () -> desk.service().checkIn(r.id()));
                ticket.clear();
                return;
            }
        }
        desk.info("No registration with ticket " + code + ".");
    }

    private void register() {
        Dialog<RegisterInput> dialog = new Dialog<>();
        dialog.setTitle("Register");
        dialog.getDialogPane().getButtonTypes().addAll(javafx.scene.control.ButtonType.OK, javafx.scene.control.ButtonType.CANCEL);
        ComboBox<EventItem> ev = new ComboBox<>(FXCollections.observableArrayList(desk.snap().events()));
        ev.setConverter(new javafx.util.StringConverter<>() {
            public String toString(EventItem e) { return e == null ? "" : e.code() + " " + e.name(); }
            public EventItem fromString(String s) { return null; }
        });
        ComboBox<Participant> person = new ComboBox<>(FXCollections.observableArrayList(desk.snap().participants()));
        person.setConverter(new javafx.util.StringConverter<>() {
            public String toString(Participant p) { return p == null ? "" : p.name() + " <" + p.email() + ">"; }
            public Participant fromString(String s) { return null; }
        });
        TextField notes = new TextField();
        javafx.scene.layout.GridPane g = new javafx.scene.layout.GridPane();
        g.setHgap(8);
        g.setVgap(8);
        g.addRow(0, new Label("Event"), ev);
        g.addRow(1, new Label("Participant"), person);
        g.addRow(2, new Label("Notes"), notes);
        dialog.getDialogPane().setContent(g);
        dialog.setResultConverter(btn -> btn == javafx.scene.control.ButtonType.OK && ev.getValue() != null && person.getValue() != null
                ? new RegisterInput(ev.getValue().id(), person.getValue().id(), notes.getText())
                : null);
        dialog.showAndWait().ifPresent(v -> desk.run("register", () -> desk.service().register(v)));
    }

    private void col(String title, java.util.function.Function<Registration, String> get) {
        TableColumn<Registration, String> c = new TableColumn<>(title);
        c.setCellValueFactory(cd -> new javafx.beans.property.SimpleStringProperty(get.apply(cd.getValue())));
        table.getColumns().add(c);
    }
}
