package com.kingdoms.game;

import android.app.Activity;
import org.json.JSONObject;

/**
 * Point d'intégration Google Play Billing.
 *
 * Implémentation de production : remplacer create() par une classe utilisant
 * BillingClient (queryProductDetailsAsync, launchBillingFlow, queryPurchasesAsync,
 * consumeAsync / acknowledgePurchase) — squelette fourni dans docs/ANDROID.md.
 * Les jetons d'achat sont TOUJOURS validés par le serveur (/iap/verify) avant
 * attribution ; le client n'accorde jamais de contenu payant lui-même.
 */
public abstract class PlayBilling {
    public interface Callback { void ok(String json); void fail(String code, String message); }

    public abstract boolean isReady();
    public abstract void handle(String method, JSONObject args, Callback cb);

    /** Retourne null tant que la bibliothèque Billing n'est pas intégrée. */
    static PlayBilling create(Activity a) {
        try {
            Class<?> impl = Class.forName("com.kingdoms.game.PlayBillingImpl");
            return (PlayBilling) impl.getConstructor(Activity.class).newInstance(a);
        } catch (Throwable t) {
            return null;
        }
    }
}
