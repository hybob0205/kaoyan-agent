package com.kaoyan.agent;

import android.net.Uri;
import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private long lastBackAt;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ModelStreamPlugin.class);
        registerPlugin(ThemeBarsPlugin.class);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View content = findViewById(android.R.id.content);
        content.setBackgroundColor(Color.rgb(244, 242, 234));
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), content);
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleAppBack();
            }
        });
    }

    private void handleAppBack() {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        String script = "(function(){try{var theme=document.querySelector('.theme-picker[open]');if(theme){theme.open=false;return true;}"
            + "if(document.querySelector('.agent-float-menu.is-open')){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return true;}"
            + "var drawer=document.querySelector('.conversation-drawer[open]');if(drawer){drawer.close();return true;}"
            + "if(window.KAOYAN_ANDROID_BACK&&window.KAOYAN_ANDROID_BACK())return true;"
            + "var dialogs=document.querySelectorAll('dialog[open]');if(dialogs.length){dialogs[dialogs.length-1].close();return true;}"
            + "if(location.hash&&location.hash!=='#home'){history.back();return true;}}catch(e){console.error(e)}return false;})()";
        webView.evaluateJavascript(script, handled -> {
            if ("true".equals(handled)) return;
            Uri current = Uri.parse(webView.getUrl() == null ? "" : webView.getUrl());
            String path = current.getPath();
            if (path != null && !path.equals("/") && !path.equals("/index.html")) {
                webView.loadUrl(current.buildUpon().path("/").clearQuery().fragment(null).build().toString());
                return;
            }
            long now = System.currentTimeMillis();
            if (now - lastBackAt < 2000) moveTaskToBack(true);
            else {
                lastBackAt = now;
                Toast.makeText(this, "再返回一次退出有研在先", Toast.LENGTH_SHORT).show();
            }
        });
    }
}
