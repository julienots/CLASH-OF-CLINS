#!/usr/bin/env bash
# Construit l'APK et l'AAB release signés de KINGDOMS sans Gradle (toolchain SDK directe).
# Prérequis : build/www (npm run build), aapt2, dx/d8, zipalign, apksigner, javac, bundletool.
# Variables : ANDROID_SDK, ANDROID_JAR, BUNDLETOOL, KS_PATH, KS_PASS, KS_ALIAS, VERSION_CODE, VERSION_NAME, RELEASE=1|0
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
SDK=${ANDROID_SDK:-/usr/lib/android-sdk}
BT=${BUILD_TOOLS:-$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)}
ANDROID_JAR=${ANDROID_JAR:-$(ls -d "$SDK"/platforms/android-* | sort -V | tail -1)/android.jar}
BUNDLETOOL=${BUNDLETOOL:-/opt/tools/bundletool.jar}
AAPT2=${AAPT2:-$(command -v aapt2 || echo "$BT/aapt2")}
DX=${DX:-$(command -v d8 || command -v dalvik-exchange || echo "$BT/dx")}
ZIPALIGN=${ZIPALIGN:-$(command -v zipalign || echo "$BT/zipalign")}
APKSIGNER=${APKSIGNER:-$(command -v apksigner || echo "$BT/apksigner")}
VERSION_NAME=${VERSION_NAME:-$(node -p "require('./package.json').version")}
VERSION_CODE=${VERSION_CODE:-1}
RELEASE=${RELEASE:-1}
OUT=android/build
DIST=dist
rm -rf "$OUT"; mkdir -p "$OUT"/{res,gen,classes,assets,proto} "$DIST"

echo "▶ SDK : $ANDROID_JAR"
[ -f build/www/index.html ] || { echo "build/www manquant : lancez npm run build"; exit 1; }

# 1. Assets web
cp -r build/www "$OUT/assets/www"

# 2. Ressources
"$AAPT2" compile --dir android/res -o "$OUT/res/compiled.zip"
LINK_COMMON=(-I "$ANDROID_JAR" --manifest android/AndroidManifest.xml --min-sdk-version 23 --target-sdk-version 35 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" -A "$OUT/assets" "$OUT/res/compiled.zip" --auto-add-overlay)
"$AAPT2" link "${LINK_COMMON[@]}" --java "$OUT/gen" -o "$OUT/base.apk"
"$AAPT2" link "${LINK_COMMON[@]}" --proto-format -o "$OUT/proto/base-proto.apk"

# 3. Java
mkdir -p "$OUT/gen/com/kingdoms/game"
cat > "$OUT/gen/com/kingdoms/game/BuildFlags.java" <<JAVA
package com.kingdoms.game;
public final class BuildFlags { public static final boolean RELEASE = $( [ "$RELEASE" = 1 ] && echo true || echo false ); public static final String VERSION = "$VERSION_NAME"; }
JAVA
javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options -nowarn -bootclasspath "$ANDROID_JAR" -d "$OUT/classes" $(find android/src "$OUT/gen" -name '*.java')

# 4. DEX
if [[ "$DX" == *d8 ]]; then
  "$DX" --release --min-api 23 --lib "$ANDROID_JAR" --output "$OUT" $(find "$OUT/classes" -name '*.class')
else
  "$DX" --dex --min-sdk-version=23 --output="$OUT/classes.dex" "$OUT/classes"
fi

# 5. APK : ajout du dex, alignement, signature
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q -X unsigned.apk classes.dex)
"$ZIPALIGN" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

# Clé de signature (clé d'upload) : fournie par l'environnement ou générée localement (non versionnée)
KS_PATH=${KS_PATH:-android/keystore/release.jks}
KS_ALIAS=${KS_ALIAS:-kingdoms}
if [ -z "${KS_PASS:-}" ]; then
  if [ -f android/keystore/keystore.properties ]; then KS_PASS=$(grep '^password=' android/keystore/keystore.properties | cut -d= -f2-); fi
fi
if [ ! -f "$KS_PATH" ]; then
  KS_PASS=${KS_PASS:-$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)}
  mkdir -p "$(dirname "$KS_PATH")"
  keytool -genkeypair -keystore "$KS_PATH" -alias "$KS_ALIAS" -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" -dname "CN=KINGDOMS, OU=Games, O=Kingdoms, C=FR" >/dev/null 2>&1
  printf 'password=%s\nalias=%s\n' "$KS_PASS" "$KS_ALIAS" > android/keystore/keystore.properties
  echo "▶ Nouvelle clé d'upload générée : $KS_PATH (mot de passe dans android/keystore/keystore.properties — à sauvegarder !)"
fi
APK="$DIST/KINGDOMS-$VERSION_NAME-$( [ "$RELEASE" = 1 ] && echo release || echo debug ).apk"
"$APKSIGNER" sign --ks "$KS_PATH" --ks-key-alias "$KS_ALIAS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --min-sdk-version 23 --out "$APK" "$OUT/aligned.apk"
"$APKSIGNER" verify --min-sdk-version 23 "$APK"
echo "✔ APK : $APK ($(du -h "$APK" | cut -f1))"

# 6. AAB (Android App Bundle) via bundletool
MOD="$OUT/module"; mkdir -p "$MOD"
(cd "$MOD" && unzip -q ../proto/base-proto.apk)
mkdir -p "$MOD/manifest" "$MOD/dex"
mv "$MOD/AndroidManifest.xml" "$MOD/manifest/AndroidManifest.xml"
cp "$OUT/classes.dex" "$MOD/dex/classes.dex"
(cd "$MOD" && zip -q -r -X ../base-module.zip manifest dex res assets resources.pb)
AAB="$DIST/KINGDOMS-$VERSION_NAME-$( [ "$RELEASE" = 1 ] && echo release || echo debug ).aab"
rm -f "$AAB"
java -jar "$BUNDLETOOL" build-bundle --modules="$OUT/base-module.zip" --output="$AAB" --config=android/bundle-config.json
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$KS_PATH" -storepass "$KS_PASS" -keypass "$KS_PASS" "$AAB" "$KS_ALIAS" >/dev/null
java -jar "$BUNDLETOOL" validate --bundle="$AAB" >/dev/null
echo "✔ AAB : $AAB ($(du -h "$AAB" | cut -f1))"
