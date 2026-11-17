package com.eventra.ui;

import com.eventra.Models.EventItem;
import com.eventra.Models.Registration;
import com.eventra.Models.Snapshot;
import javafx.geometry.Insets;
import javafx.scene.chart.BarChart;
import javafx.scene.chart.CategoryAxis;
import javafx.scene.chart.NumberAxis;
import javafx.scene.chart.XYChart;
import javafx.scene.control.Label;
import javafx.scene.input.MouseButton;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.VBox;

/** Overview. Clicking a bar opens that event. A timeline refreshes the counts. */
public final class OverviewPane {
    private final Desk desk;
    private final VBox root = new VBox(12);
    private final Label events = tile("Events");
    private final Label people = tile("Participants");
    private final Label regs = tile("Registrations");
    private final Label seats = tile("Seats left");
    private final BarChart<String, Number> chart;

    public OverviewPane(Desk desk) {
        this.desk = desk;
        chart = new BarChart<>(new CategoryAxis(), new NumberAxis());
        chart.setLegendVisible(false);
        chart.setAnimated(false);
        chart.setPrefHeight(320);
        GridPane tiles = new GridPane();
        tiles.setHgap(12);
        tiles.setVgap(12);
        tiles.add(events, 0, 0);
        tiles.add(people, 1, 0);
        tiles.add(regs, 2, 0);
        tiles.add(seats, 3, 0);
        root.setPadding(new Insets(16));
        root.getChildren().addAll(new Label("Overview"), tiles, chart);
        javafx.animation.Timeline tick = new javafx.animation.Timeline(
                new javafx.animation.KeyFrame(javafx.util.Duration.seconds(30), ev -> desk.refresh()));
        tick.setCycleCount(javafx.animation.Animation.INDEFINITE);
        tick.play();
    }

    public VBox root() { return root; }

    public void render(Snapshot s) {
        events.setText("Events\n" + s.events().size());
        people.setText("Participants\n" + s.participants().size());
        regs.setText("Registrations\n" + s.registrations().size());
        int left = 0;
        for (EventItem e : s.events()) left += Math.max(0, e.capacity() - taken(s, e.id()));
        seats.setText("Seats left\n" + left);
        XYChart.Series<String, Number> series = new XYChart.Series<>();
        for (EventItem e : s.events()) {
            XYChart.Data<String, Number> bar = new XYChart.Data<>(e.code(), taken(s, e.id()));
            series.getData().add(bar);
        }
        chart.getData().setAll(series);
        for (XYChart.Data<String, Number> bar : series.getData()) {
            if (bar.getNode() == null) continue;
            bar.getNode().setOnMouseClicked(ev -> {
                if (ev.getButton() == MouseButton.PRIMARY) desk.show("events");
            });
        }
    }

    private static int taken(Snapshot s, String eventId) {
        int n = 0;
        for (Registration r : s.registrations()) {
            if (eventId.equals(r.eventId()) && ("confirmed".equals(r.status()) || "checked_in".equals(r.status()))) n++;
        }
        return n;
    }

    private static Label tile(String name) {
        Label l = new Label(name);
        l.setMinSize(140, 64);
        l.setStyle("-fx-border-color: #cccccc; -fx-padding: 8; -fx-font-size: 14;");
        return l;
    }
}
