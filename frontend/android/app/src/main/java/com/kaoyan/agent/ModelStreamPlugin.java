package com.kaoyan.agent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

@CapacitorPlugin(name = "ModelStream")
public class ModelStreamPlugin extends Plugin {
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @PluginMethod
    public void start(PluginCall call) {
        String id = call.getString("id");
        String endpoint = call.getString("url");
        String body = call.getString("body");
        JSObject headers = call.getObject("headers");
        if (id == null || id.isEmpty() || endpoint == null || body == null) {
            call.reject("缺少模型请求参数");
            return;
        }
        try {
            URL url = new URL(endpoint);
            if (!url.getProtocol().equals("http") && !url.getProtocol().equals("https")) throw new IllegalArgumentException("不支持的接口地址");
            call.resolve();
            executor.execute(() -> stream(id, url, headers, body));
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    private void emit(String id, String type, String data) {
        JSObject event = new JSObject();
        event.put("id", id);
        event.put("type", type);
        event.put("data", data);
        notifyListeners("streamEvent", event);
    }

    private void stream(String id, URL url, JSONObject headers, String body) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(90000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "text/event-stream, application/json");
            if (headers != null) {
                Iterator<String> names = headers.keys();
                while (names.hasNext()) {
                    String name = names.next();
                    connection.setRequestProperty(name, headers.optString(name));
                }
            }
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                String detail = readText(connection.getErrorStream(), 500);
                emit(id, "error", "模型接口返回 " + status + (detail.isEmpty() ? "" : "：" + detail));
                return;
            }
            String contentType = connection.getContentType();
            if (contentType != null && contentType.toLowerCase().contains("text/event-stream")) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    StringBuilder eventData = new StringBuilder();
                    while ((line = reader.readLine()) != null) {
                        if (line.isEmpty()) {
                            if (eventData.length() > 0) emit(id, "data", eventData.toString());
                            eventData.setLength(0);
                        } else if (line.startsWith("data:")) {
                            if (eventData.length() > 0) eventData.append('\n');
                            eventData.append(line.substring(5).trim());
                        }
                    }
                    if (eventData.length() > 0) emit(id, "data", eventData.toString());
                }
            } else {
                emit(id, "json", readText(connection.getInputStream(), 2_000_000));
            }
            emit(id, "done", "");
        } catch (Exception error) {
            emit(id, "error", error.getMessage() == null ? "模型连接中断" : error.getMessage());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String readText(InputStream input, int limit) throws Exception {
        if (input == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            StringBuilder text = new StringBuilder();
            char[] buffer = new char[2048];
            int count;
            while ((count = reader.read(buffer)) >= 0 && text.length() < limit) text.append(buffer, 0, Math.min(count, limit - text.length()));
            return text.toString();
        }
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
