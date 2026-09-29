package com.kaoyan.agent;

import android.graphics.Color;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ThemeBars")
public class ThemeBarsPlugin extends Plugin {
    @PluginMethod
    public void setTheme(PluginCall call) {
        String theme = call.getString("theme", "light");
        int color = Color.parseColor("night".equals(theme) ? "#121e1a" : "paper".equals(theme) ? "#f4f2ea" : "#f7f8f4");
        boolean lightIcons = "night".equals(theme);
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            View content = getActivity().findViewById(android.R.id.content);
            content.setBackgroundColor(color);
            window.setStatusBarColor(color);
            window.setNavigationBarColor(color);
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, content);
            controller.setAppearanceLightStatusBars(!lightIcons);
            controller.setAppearanceLightNavigationBars(!lightIcons);
            call.resolve();
        });
    }
}
