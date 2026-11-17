package com.eventra;

import com.eventra.ui.Desk;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.TextField;
import javafx.scene.layout.GridPane;
import javafx.stage.Stage;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/** Desktop entry. Connects to MySQL, then opens the desk. No sample rows are inserted. */
public final class App extends Application {
    private static final Path PROPS = Path.of("db.properties");

    public static void main(String[] args) {
        launch(args);
    }

    @Override
    public void start(Stage stage) {
        Properties p = readProps();
        if (p.getProperty("db.url", "").isBlank()) {
            ask(stage, p);
            return;
        }
        open(stage, p);
    }

    private void open(Stage stage, Properties p) {
        Db db = new Db(p.getProperty("db.url"), p.getProperty("db.user"), p.getProperty("db.password"));
        try {
            db.migrate();
            db.get().close();
        } catch (Exception e) {
            fail(stage, p, e.getMessage() == null ? "Could not open MySQL." : e.getMessage());
            return;
        }
        new Desk(db, getHostServices()).show(stage);
    }

    private void fail(Stage stage, Properties p, String message) {
        Label err = new Label(message);
        err.setWrapText(true);
        ask(stage, p, err);
    }

    private void ask(Stage stage, Properties p) {
        ask(stage, p, null);
    }

    private void ask(Stage stage, Properties p, Label error) {
        TextField url = new TextField(p.getProperty("db.url", "jdbc:mysql://127.0.0.1:3306/eventra"));
        TextField user = new TextField(p.getProperty("db.user", "eventra"));
        PasswordField password = new PasswordField();
        password.setText(p.getProperty("db.password", ""));
        Button connect = new Button("Connect");
        GridPane grid = new GridPane();
        grid.setHgap(8);
        grid.setVgap(8);
        grid.setPadding(new Insets(16));
        grid.add(new Label("JDBC URL"), 0, 0);
        grid.add(url, 1, 0);
        grid.add(new Label("User"), 0, 1);
        grid.add(user, 1, 1);
        grid.add(new Label("Password"), 0, 2);
        grid.add(password, 1, 2);
        grid.add(connect, 1, 3);
        if (error != null) grid.add(error, 0, 4, 2, 1);
        connect.setOnAction(ev -> {
            p.setProperty("db.url", url.getText().trim());
            p.setProperty("db.user", user.getText().trim());
            p.setProperty("db.password", password.getText());
            try {
                save(p);
            } catch (IOException e) {
                error("Could not save db.properties: " + e.getMessage());
                return;
            }
            open(stage, p);
        });
        stage.setTitle("Eventra — connect to MySQL");
        stage.setScene(new Scene(grid, 560, error == null ? 180 : 240));
        stage.show();
    }

    private static Properties readProps() {
        Properties p = new Properties();
        String url = System.getenv("DB_URL");
        if (url != null && !url.isBlank()) {
            p.setProperty("db.url", url);
            p.setProperty("db.user", env("DB_USER", "eventra"));
            p.setProperty("db.password", env("DB_PASSWORD", ""));
            return p;
        }
        if (Files.exists(PROPS)) {
            try (InputStream in = Files.newInputStream(PROPS)) {
                p.load(in);
            } catch (IOException ignored) {
                // dialog will ask again
            }
        }
        return p;
    }

    private static void save(Properties p) throws IOException {
        try (OutputStream out = Files.newOutputStream(PROPS)) {
            p.store(out, "Local only. Not committed.");
        }
    }

    private static String env(String k, String def) {
        String v = System.getenv(k);
        return v == null || v.isBlank() ? def : v;
    }

    public static void error(String message) {
        Platform.runLater(() -> {
            javafx.scene.control.Alert a = new javafx.scene.control.Alert(javafx.scene.control.Alert.AlertType.ERROR);
            a.setHeaderText("Not saved");
            a.setContentText(message);
            a.showAndWait();
        });
    }
}
