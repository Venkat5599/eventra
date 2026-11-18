package com.eventra.ui;

import com.eventra.Models.EventItem;
import com.eventra.Models.Session;
import com.eventra.Models.SessionInput;
import com.eventra.Models.Snapshot;
import javafx.collections.FXCollections;
import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.DatePicker;
import javafx.scene.control.Dialog;
import javafx.scene.control.Label;
import javafx.scene.control.TableColumn;
import javafx.scene.control.TableView;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;

import java.time.LocalDate;

/** Schedule. End time is checked when the field loses focus. A room clash comes back from the service. */
public final class SchedulePane {
    private final Desk desk;
    private final VBox root = new VBox(8);
    private final ComboBox<String> eventFilter = new ComboBox<>();
    private final TableView<Session> table = new TableView<>();

    private boolean filling;

    public SchedulePane(Desk desk) {
        this.desk = desk;
        eventFilter.setOnAction(ev -> { if (!filling) render(desk.snap()); });
        Button add = new Button("Add");
        add.setOnAction(ev -> edit(null));
        Button edit = new Button("Edit");
        edit.setOnAction(ev -> { Session s = table.getSelectionModel().getSelectedItem(); if (s != null) edit(s); });
        Button delete = new Button("Delete");
        delete.setOnAction(ev -> deleteSelected());
        col("Date", Session::date);
        col("Start", Session::start);
        col("End", Session::end);
        col("Room", Session::room);
        col("Title", Session::title);
        col("Event", s -> Desk.eventName(desk.snap(), s.eventId()));
        root.setPadding(new Insets(16));
        root.getChildren().addAll(new HBox(8, eventFilter, add, edit, delete), table);
    }

    public VBox root() { return root; }

    public void render(Snapshot s) {
        filling = true;
        try {
            String keep = eventFilter.getValue();
            eventFilter.getItems().clear();
            eventFilter.getItems().add("all");
            for (EventItem e : s.events()) eventFilter.getItems().add(e.id() + " " + e.name());
            if (keep != null && eventFilter.getItems().contains(keep)) eventFilter.setValue(keep);
            else eventFilter.setValue("all");
        } finally {
            filling = false;
        }
        String ev = eventFilter.getValue();
        String eventId = ev == null || "all".equals(ev) ? "" : ev.split(" ")[0];
        var list = FXCollections.<Session>observableArrayList();
        for (Session x : s.sessions()) if (eventId.isEmpty() || eventId.equals(x.eventId())) list.add(x);
        table.setItems(list);
    }

    public void deleteSelected() {
        Session s = table.getSelectionModel().getSelectedItem();
        if (s == null) return;
        if (!desk.confirm("Remove " + s.title() + "?", "The room is freed for that time.")) return;
        desk.run("delete-session", () -> desk.service().deleteSession(s.id()));
    }

    private void edit(Session existing) {
        Dialog<SessionInput> dialog = new Dialog<>();
        dialog.setTitle(existing == null ? "Add session" : "Edit session");
        dialog.getDialogPane().getButtonTypes().addAll(javafx.scene.control.ButtonType.OK, javafx.scene.control.ButtonType.CANCEL);
        ComboBox<EventItem> ev = new ComboBox<>(FXCollections.observableArrayList(desk.snap().events()));
        ev.setConverter(new javafx.util.StringConverter<>() {
            public String toString(EventItem e) { return e == null ? "" : e.name(); }
            public EventItem fromString(String s) { return null; }
        });
        if (existing != null) ev.setValue(Desk.event(desk.snap(), existing.eventId()));
        TextField title = new TextField(existing == null ? "" : existing.title());
        TextField speaker = new TextField(existing == null ? "" : existing.speaker());
        TextField room = new TextField(existing == null ? "" : existing.room());
        DatePicker date = new DatePicker(existing == null ? LocalDate.now() : LocalDate.parse(existing.date()));
        TextField start = new TextField(existing == null ? "09:00" : existing.start());
        TextField end = new TextField(existing == null ? "10:00" : existing.end());
        title.setAccessibleText("Session title");
        room.setAccessibleText("Session room");
        start.setAccessibleText("Session start");
        end.setAccessibleText("Session end");
        Label warn = new Label();
        end.focusedProperty().addListener((obs, was, focused) -> {
            if (!focused && !endAfter(start.getText(), end.getText())) warn.setText("End time must be after the start time.");
            else if (!focused) warn.setText("");
        });
        javafx.scene.layout.GridPane g = new javafx.scene.layout.GridPane();
        g.setHgap(8);
        g.setVgap(8);
        g.addRow(0, new Label("Event"), ev);
        g.addRow(1, new Label("Title"), title);
        g.addRow(2, new Label("Speaker"), speaker);
        g.addRow(3, new Label("Room"), room);
        g.addRow(4, new Label("Date"), date);
        g.addRow(5, new Label("Start"), start);
        g.addRow(6, new Label("End"), end);
        g.add(warn, 1, 7);
        dialog.getDialogPane().setContent(g);
        ((javafx.scene.control.Button) dialog.getDialogPane().lookupButton(javafx.scene.control.ButtonType.OK)).setAccessibleText("Save session");
        dialog.setResultConverter(btn -> {
            if (btn != javafx.scene.control.ButtonType.OK || ev.getValue() == null) return null;
            return new SessionInput(ev.getValue().id(), title.getText(), speaker.getText(), room.getText(),
                    date.getValue() == null ? "" : date.getValue().toString(), start.getText(), end.getText());
        });
        dialog.showAndWait().ifPresent(v -> desk.run("save-session", () -> desk.service().saveSession(existing == null ? null : existing.id(), v)));
    }

    private static boolean endAfter(String start, String end) {
        try { return java.time.LocalTime.parse(end).isAfter(java.time.LocalTime.parse(start)); }
        catch (Exception e) { return false; }
    }

    private void col(String title, java.util.function.Function<Session, String> get) {
        TableColumn<Session, String> c = new TableColumn<>(title);
        c.setCellValueFactory(cd -> new javafx.beans.property.SimpleStringProperty(get.apply(cd.getValue())));
        table.getColumns().add(c);
    }
}
