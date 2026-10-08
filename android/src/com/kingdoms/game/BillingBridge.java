package com.kingdoms.game;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;

/**
 * Pont JavaScript ⇄ Google Play Billing.
 *
 * Protocole : le jeu appelle call(méthode, argsJSON, callbackId) et reçoit la réponse
 * via window.__kbCb[callbackId]({"data":...} | {"error":code,"message":...}).
 * Méthodes : available, products, purchase, owned, finish.
 *
 * La bibliothèque com.android.billingclient:billing n'est distribuée que sur le dépôt
 * Maven de Google. Tant qu'elle n'est pas intégrée (voir docs/ANDROID.md), ce pont
 * répond « unavailable » : aucun achat ne peut être simulé dans un build release,
 * et le jeu affiche « Boutique indisponible ». Les cristaux restent gagnables en jeu.
 */
public class BillingBridge {
    private final Activity act;
    private final WebView web;
    private final PlayBilling billing;

    BillingBridge(Activity a, WebView w) {
        act = a; web = w;
        billing = PlayBilling.create(a);
    }

    @JavascriptInterface
    public void call(final String method, final String args, final String cbId) {
        act.runOnUiThread(new Runnable() { @Override public void run() {
            try {
                JSONObject in = new JSONObject(args == null ? "{}" : args);
                if ("available".equals(method)) { reply(cbId, "{\"data\":" + (billing != null && billing.isReady()) + "}"); return; }
                if (billing == null) { error(cbId, "unavailable", "Google Play Billing non intégré"); return; }
                billing.handle(method, in, new PlayBilling.Callback() {
                    @Override public void ok(String json) { reply(cbId, "{\"data\":" + json + "}"); }
                    @Override public void fail(String code, String msg) { error(cbId, code, msg); }
                });
            } catch (Exception e) {
                error(cbId, "unknown", e.getMessage());
            }
        } });
    }

    private void error(String cbId, String code, String msg) {
        try {
            JSONObject o = new JSONObject();
            o.put("error", code);
            o.put("message", msg == null ? "" : msg);
            reply(cbId, o.toString());
        } catch (Exception ignored) { }
    }

    private void reply(String cbId, String json) {
        String safeId = cbId.replaceAll("[^a-zA-Z0-9_]", "");
        String js = "window.__kbCb&&window.__kbCb['" + safeId + "']&&window.__kbCb['" + safeId + "'](" + JSONObject.quote(json) + ")";
        web.evaluateJavascript(js, null);
    }
}
