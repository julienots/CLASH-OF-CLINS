package com.kingdoms.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Hôte natif de KINGDOMS : WebView accélérée matériellement, plein écran immersif,
 * assets servis depuis l'APK sous une origine https stable, ponts natifs
 * (sauvegarde fichier, vibration, partage, facturation).
 */
public class MainActivity extends Activity {
    static final String ORIGIN = "https://appassets.kingdoms.game/";
    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            // layoutInDisplayCutoutMode = SHORT_EDGES (API 28) par réflexion : compilé contre l'API 23
            try { WindowManager.LayoutParams lp = w.getAttributes(); lp.getClass().getField("layoutInDisplayCutoutMode").setInt(lp, 1); w.setAttributes(lp); } catch (Exception ignored) { }
        }
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0F1A2E"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        WebView.setWebContentsDebuggingEnabled(!BuildFlags.RELEASE);
        web.addJavascriptInterface(new NativeBridge(this), "KingdomsNative");
        web.addJavascriptInterface(new BillingBridge(this, web), "KingdomsBilling");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new AssetClient());
        setContentView(web);
        hideSystemUi();
        web.loadUrl(ORIGIN + "index.html");
    }

    /** Sert les fichiers de assets/www sous une origine https (stockage local persistant et sûr). */
    private class AssetClient extends WebViewClient {
        private final Map<String, String> mime = new HashMap<>();
        AssetClient() {
            mime.put("html", "text/html"); mime.put("js", "application/javascript"); mime.put("css", "text/css");
            mime.put("png", "image/png"); mime.put("json", "application/json"); mime.put("svg", "image/svg+xml");
        }
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            String url = req.getUrl().toString();
            if (!url.startsWith(ORIGIN)) return null; // réseau normal (serveur de jeu)
            String path = url.substring(ORIGIN.length());
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);
            if (path.isEmpty()) path = "index.html";
            if (path.contains("..")) return notFound();
            try {
                InputStream in = getAssets().open("www/" + path);
                String ext = path.substring(path.lastIndexOf('.') + 1);
                String type = mime.containsKey(ext) ? mime.get(ext) : "application/octet-stream";
                return new WebResourceResponse(type, "utf-8", in);
            } catch (IOException e) {
                return notFound();
            }
        }
        private WebResourceResponse notFound() {
            WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", null);
            r.setStatusCodeAndReasonPhrase(404, "Not Found");
            return r;
        }
        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return !url.startsWith(ORIGIN); // aucune navigation hors du jeu dans la WebView
        }
    }

    private void hideSystemUi() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onPause() {
        // sauvegarde immédiate avant mise en arrière-plan
        web.evaluateJavascript("window.kingdoms && window.kingdoms.save(true)", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemUi();
    }

    @Override
    public void onBackPressed() {
        // ferme d'abord les panneaux ouverts, puis revient au village, sinon quitte
        web.evaluateJavascript("(function(){var k=window.kingdoms;if(!k)return 'exit';if(k.panels.length){k.panels[k.panels.length-1].handle.close();return 'ok';}if(k.scene&&k.scene.name!=='village'){return 'ok';}return 'exit';})()", new android.webkit.ValueCallback<String>() {
            @Override public void onReceiveValue(String value) {
                if (value != null && value.contains("exit")) finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }

    /** Pont natif minimal exposé au jeu. */
    public static class NativeBridge {
        private final Activity act;
        NativeBridge(Activity a) { act = a; }
        private File saveFile() { return new File(act.getFilesDir(), "kingdoms_save.json"); }

        @JavascriptInterface
        public void save(String data) {
            File tmp = new File(act.getFilesDir(), "kingdoms_save.tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(data.getBytes("UTF-8"));
                out.getFD().sync();
            } catch (IOException e) { return; }
            if (!tmp.renameTo(saveFile())) { saveFile().delete(); tmp.renameTo(saveFile()); }
        }

        @JavascriptInterface
        public String load() {
            File f = saveFile();
            if (!f.exists()) return "";
            try (FileInputStream in = new FileInputStream(f)) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192]; int n;
                while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
                return bos.toString("UTF-8");
            } catch (IOException e) { return ""; }
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) act.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) v.vibrate(Math.max(1, Math.min(ms, 400)));
        }

        @JavascriptInterface
        public boolean isRelease() { return BuildFlags.RELEASE; }

        @JavascriptInterface
        public void share(String text) {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, text);
            act.startActivity(Intent.createChooser(i, "KINGDOMS"));
        }

        @JavascriptInterface
        public void exit() { act.runOnUiThread(new Runnable() { @Override public void run() { act.finish(); } }); }
    }
}
