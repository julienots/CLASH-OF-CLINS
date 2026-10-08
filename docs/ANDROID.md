# Android : APK & AAB

## Construire
```bash
npm install
npm run android        # build/www puis android/build.sh → dist/*.apk et dist/*.aab
```
Toolchain sans Gradle : `aapt2` (ressources, format proto pour l'AAB), `javac -source 8`, `dx`/`d8`, `zipalign`, `apksigner`, `bundletool`, `jarsigner`.
Sous Ubuntu : `apt install aapt apksigner zipalign android-sdk-platform-23 dalvik-exchange` + `bundletool-all.jar` (variable `BUNDLETOOL`).

| Propriété | Valeur |
|---|---|
| Package | `com.kingdoms.game` |
| minSdk / targetSdk | 23 / 35 |
| Orientation | paysage (capteur) |
| ABI | aucune bibliothèque native : APK universel (arm64, armv7, x86…) — IL2CPP sans objet |
| Signature APK | v1 + v2 + v3 |

## Signature
Par défaut, le script génère une clé d'upload locale `android/keystore/release.jks` (non versionnée, mot de passe dans `keystore.properties`). **Sauvegardez-la** ou utilisez la vôtre :
```bash
KS_PATH=ma-cle.jks KS_PASS=... KS_ALIAS=upload VERSION_CODE=2 VERSION_NAME=1.0.1 npm run android
```
`RELEASE=0` produit un build debug (débogage WebView activé, boutique de test).

## Google Play Billing
Le pont `KingdomsBilling` (`BillingBridge.java`) et le flux JS (`purchases/iap.ts` : achat → validation serveur `/iap/verify` → attribution → consommation, restauration, erreurs, achats en attente) sont prêts. La bibliothèque `com.android.billingclient:billing` n'étant distribuée que sur le Maven de Google (inaccessible lors de ce build), `PlayBilling.create()` renvoie `null` et le jeu affiche « Boutique indisponible ».

Pour l'activer : ajouter le jar/aar Billing au classpath et créer `com.kingdoms.game.PlayBillingImpl extends PlayBilling` implémentant `available`, `products` (queryProductDetailsAsync), `purchase` (launchBillingFlow), `owned` (queryPurchasesAsync) et `finish` (consumeAsync pour les consommables, acknowledgePurchase sinon), en répondant au format `{id, price, title}` / `{productId, token, orderId}`. Créer les produits `crystals_small`, `crystals_medium`, `crystals_large`, `starter_pack`, `season_pass`, `special_bundle` dans la Play Console et brancher `verifyGooglePurchase` du serveur sur l'API Google Play Developer.
