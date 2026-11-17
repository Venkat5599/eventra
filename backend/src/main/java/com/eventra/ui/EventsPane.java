package com.eventra.ui;

import com.eventra.Models.EventInput;
import com.eventra.Models.EventItem;
import com.eventra.Models.Snapshot;
import javafx.collections.FXCollections;
import javafx.collections.transformation.FilteredList;
import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.DatePicker;
import javafx.scene.control.Dialog;
import javafx.scene.control.Label;
import javafx.scene.control.Spinner;
import javafx.scene.control.TableColumn;
import javafx.scene.control.TableRow;
import javafx.scene.control.TableView;
import javafx.scene.control.TextField;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;

import java.time.LocalDate;
import java.util.Optional;

/** Events table. Search filters as you type. Double-click edits. Delete asks first. */
public final class EventsPane {
    private final Desk desk;
    private final VBox root = new VBox(8);
    private final TextField search = new TextField();
    private final ComboBox<String> status = new ComboBox<>();
    private final TableView<EventItem> table = new TableView<>();
    private FilteredList<EventItem> rows;

    public EventsPane(Desk desk) {
        this.desk = desk;
        search.setPromptText("Search events");
        search.setOnAction(ev -> applyFilter());
        search.textProperty().addListener((obs, old, cur) -> applyFilter());
        status.getItems().addAll("all", "draft", "open", "closed", "completed");
        status.setValue("all");
        status.setOnAction(ev -> applyFilter());
        Button add = new Button("New");
        add.setOnAction(ev -> newEvent());
        Button edit = new Button("Edit");
        edit.setOnAction(ev -> editSelected());
        Button delete = new Button("Delete");
        delete.setOnAction(ev -> deleteSelected());
        table.setRowFactory(tv -> {
            TableRow<EventItem> row = new TableRow<>();
            row.setOnMouseClicked(ev -> {
                if (ev.getClickCount() == 2 && !row.isEmpty()) edit(row.getItem());
            });
            return row;
        });
        col(table, "Code", EventItem::code);
        col(table, "Name", EventItem::name);
        col(table, "Status", EventItem::status);
        col(table, "Capacity", e -> Integer.toString(e.capacity()));
        col(table, "Start", EventItem::startDate);
        col(table, "End", EventItem::endDate);
        root.setPadding(new Insets(16));
        root.getChildren().addAll(new HBox(8, search, status, add, edit, delete), table);
    }

    public VBox root() { return root; }
    public void focusSearch() { search.requestFocus(); }

    public void render(Snapshot s) {
        rows = new FilteredList<>(FXCollections.observableArrayList(s.events()), x -> true);
        table.setItems(rows);
        applyFilter();
    }

    private void applyFilter() {
        if (rows == null) return;
        String q = search.getText() == null ? "" : search.getText().trim().toLowerCase();
        String st = status.getValue();
        rows.setPredicate(e -> (q.isEmpty() || e.name().toLowerCase().contains(q) || e.code().toLowerCase().contains(q))
                && ("all".equals(st) || st.equals(e.status())));
    }

    public void newEvent() { edit(null); }

    public void deleteSelected() {
        EventItem e = table.getSelectionModel().getSelectedItem();
        if (e == null) return;
        if (!desk.confirm("Delete " + e.name() + "?", "Sessions and registrations for this event are deleted. Participant records stay.")) return;
        desk.run("delete-event", () -> desk.service().deleteEvent(e.id()));
    }

    private void editSelected() {
        EventItem e = table.getSelectionModel().getSelectedItem();
        if (e != null) edit(e);
    }

    private void edit(EventItem existing) {
        Dialog<EventInput> dialog = new Dialog<>();
        dialog.setTitle(existing == null ? "New event" : "Edit event");
        dialog.getDialogPane().getButtonTypes().addAll(javafx.scene.control.ButtonType.OK, javafx.scene.control.ButtonType.CANCEL);
        TextField code = new TextField(existing == null ? "" : existing.code());
        TextField name = new TextField(existing == null ? "" : existing.name());
        TextField category = new TextField(existing == null ? "Workshop" : existing.category());
        TextField venue = new TextField(existing == null ? "" : existing.venue());
        TextField organizer = new TextField(existing == null ? "" : existing.organizer());
        DatePicker start = new DatePicker(existing == null ? LocalDate.now() : LocalDate.parse(existing.startDate()));
        DatePicker end = new DatePicker(existing == null ? LocalDate.now() : LocalDate.parse(existing.endDate()));
        Spinner<Integer> capacity = new Spinner<>(1, 100000, existing == null ? 30 : existing.capacity());
        capacity.setEditable(true);
        ComboBox<String> st = new ComboBox<>();
        st.getItems().addAll("draft", "open", "closed", "completed");
        st.setValue(existing == null ? "draft" : existing.status());
        GridPane g = form(code, name, category, venue, organizer, start, end, capacity, st);
        dialog.getDialogPane().setContent(g);
        dialog.setResultConverter(btn -> btn == javafx.scene.control.ButtonType.OK
                ? new EventInput(code.getText(), name.getText(), category.getText(), venue.getText(), "",
                start.getValue() == null ? "" : start.getValue().toString(),
                end.getValue() == null ? "" : end.getValue().toString(),
                capacity.getValue(), st.getValue(), organizer.getText())
                : null);
        Optional<EventInput> in = dialog.showAndWait();
        in.ifPresent(v -> desk.run("save-event", () -> desk.service().saveEvent(existing == null ? null : existing.id(), v)));
    }

    private static GridPane form(TextField code, TextField name, TextField category, TextField venue, TextField organizer,
                                 DatePicker start, DatePicker end, Spinner<Integer> capacity, ComboBox<String> st) {
        GridPane g = new GridPane();
        g.setHgap(8);
        g.setVgap(8);
        g.setPadding(new Insets(8));
        g.addRow(0, new Label("Code"), code);
        g.addRow(1, new Label("Name"), name);
        g.addRow(2, new Label("Category"), category);
        g.addRow(3, new Label("Venue"), venue);
        g.addRow(4, new Label("Organizer"), organizer);
        g.addRow(5, new Label("Start"), start);
        g.addRow(6, new Label("End"), end);
        g.addRow(7, new Label("Capacity"), capacity);
        g.addRow(8, new Label("Status"), st);
        return g;
    }

    private static void col(TableView<EventItem> table, String title, java.util.function.Function<EventItem, String> get) {
        TableColumn<EventItem, String> c = new TableColumn<>(title);
        c.setCellValueFactory(cd -> new javafx.beans.property.SimpleStringProperty(get.apply(cd.getValue())));
        table.getColumns().add(c);
    }
}
