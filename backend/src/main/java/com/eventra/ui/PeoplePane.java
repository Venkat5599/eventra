package com.eventra.ui;

import com.eventra.Models.Participant;
import com.eventra.Models.ParticipantInput;
import com.eventra.Models.Registration;
import com.eventra.Models.Snapshot;
import javafx.collections.FXCollections;
import javafx.collections.transformation.FilteredList;
import javafx.geometry.Insets;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ListView;
import javafx.scene.control.TableColumn;
import javafx.scene.control.TableView;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;

/** Participants. Selecting a row loads that person's registrations. An invalid email turns the field red. */
public final class PeoplePane {
    private final Desk desk;
    private final VBox root = new VBox(8);
    private final TextField search = new TextField();
    private final TableView<Participant> table = new TableView<>();
    private final ListView<String> history = new ListView<>();
    private FilteredList<Participant> rows;

    public PeoplePane(Desk desk) {
        this.desk = desk;
        search.setPromptText("Search participants");
        search.textProperty().addListener((obs, old, cur) -> apply());
        Button add = new Button("Add");
        add.setOnAction(ev -> edit(null));
        Button edit = new Button("Edit");
        edit.setOnAction(ev -> { Participant p = table.getSelectionModel().getSelectedItem(); if (p != null) edit(p); });
        Button delete = new Button("Delete");
        delete.setOnAction(ev -> deleteSelected());
        col("Name", Participant::name);
        col("Email", Participant::email);
        col("Phone", Participant::phone);
        col("College", Participant::organization);
        table.getSelectionModel().selectedItemProperty().addListener((obs, old, cur) -> showHistory(cur));
        HBox side = new HBox(12, table, history);
        HBox.setHgrow(table, Priority.ALWAYS);
        history.setPrefWidth(280);
        root.setPadding(new Insets(16));
        root.getChildren().addAll(new HBox(8, search, add, edit, delete), side);
    }

    public VBox root() { return root; }
    public void focusSearch() { search.requestFocus(); }

    public void render(Snapshot s) {
        rows = new FilteredList<>(FXCollections.observableArrayList(s.participants()), x -> true);
        table.setItems(rows);
        apply();
        showHistory(table.getSelectionModel().getSelectedItem());
    }

    private void apply() {
        if (rows == null) return;
        String q = search.getText() == null ? "" : search.getText().trim().toLowerCase();
        rows.setPredicate(p -> q.isEmpty() || p.name().toLowerCase().contains(q) || p.email().toLowerCase().contains(q));
    }

    private void showHistory(Participant p) {
        history.getItems().clear();
        if (p == null) return;
        for (Registration r : desk.snap().registrations()) {
            if (p.id().equals(r.participantId())) {
                history.getItems().add(r.ticketCode() + "  " + r.status() + "  " + Desk.eventName(desk.snap(), r.eventId()));
            }
        }
    }

    public void deleteSelected() {
        Participant p = table.getSelectionModel().getSelectedItem();
        if (p == null) return;
        if (!desk.confirm("Remove " + p.name() + "?", "Their registrations are deleted. Waitlists they free are promoted.")) return;
        desk.run("delete-person", () -> desk.service().deleteParticipant(p.id()));
    }

    private void edit(Participant existing) {
        javafx.scene.control.Dialog<ParticipantInput> dialog = new javafx.scene.control.Dialog<>();
        dialog.setTitle(existing == null ? "Add participant" : "Edit participant");
        dialog.getDialogPane().getButtonTypes().addAll(javafx.scene.control.ButtonType.OK, javafx.scene.control.ButtonType.CANCEL);
        TextField name = new TextField(existing == null ? "" : existing.name());
        TextField email = new TextField(existing == null ? "" : existing.email());
        TextField phone = new TextField(existing == null ? "" : existing.phone());
        TextField org = new TextField(existing == null ? "" : existing.organization());
        TextField dept = new TextField(existing == null ? "" : existing.department());
        email.textProperty().addListener((obs, old, cur) -> {
            boolean ok = cur != null && cur.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
            email.setStyle(ok || cur == null || cur.isBlank() ? "" : "-fx-border-color: #d92d20;");
        });
        javafx.scene.layout.GridPane g = new javafx.scene.layout.GridPane();
        g.setHgap(8);
        g.setVgap(8);
        g.addRow(0, new Label("Name"), name);
        g.addRow(1, new Label("Email"), email);
        g.addRow(2, new Label("Phone"), phone);
        g.addRow(3, new Label("College"), org);
        g.addRow(4, new Label("Department"), dept);
        dialog.getDialogPane().setContent(g);
        dialog.setResultConverter(btn -> btn == javafx.scene.control.ButtonType.OK
                ? new ParticipantInput(name.getText(), email.getText(), phone.getText(), org.getText(), dept.getText())
                : null);
        dialog.showAndWait().ifPresent(v -> desk.run("save-person", () -> desk.service().saveParticipant(existing == null ? null : existing.id(), v)));
    }

    private void col(String title, java.util.function.Function<Participant, String> get) {
        TableColumn<Participant, String> c = new TableColumn<>(title);
        c.setCellValueFactory(cd -> new javafx.beans.property.SimpleStringProperty(get.apply(cd.getValue())));
        table.getColumns().add(c);
    }
}
