#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${APP_ANDROID_JAR:?Set path to android.jar}"
: "${APP_BUILD_TOOLS:?Set path to Android build tools}"
: "${APP_ECJ_JAR:?Set path to Eclipse Java compiler}"
: "${APP_SIGN_KEYSTORE:?Set path to an APK signing keystore}"
: "${APP_SIGN_PASSWORD:?Set signing keystore password}"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/classes" "$stage/dex" release
java -jar "$APP_ECJ_JAR" -proc:none -source 8 -target 8 -bootclasspath "$APP_ANDROID_JAR:$APP_BUILD_TOOLS/core-lambda-stubs.jar" -d "$stage/classes" src/tw/notes/phonesync/*.java
mapfile -t classes < <(find "$stage/classes" -name '*.class' -type f | sort)
"$APP_BUILD_TOOLS/d8" --min-api 26 --lib "$APP_ANDROID_JAR" --output "$stage/dex" "${classes[@]}"
"$APP_BUILD_TOOLS/aapt2" link -I "$APP_ANDROID_JAR" --manifest AndroidManifest.xml -o "$stage/base.apk"
(cd "$stage/dex" && zip -q "$stage/base.apk" classes.dex)
"$APP_BUILD_TOOLS/zipalign" -f 4 "$stage/base.apk" "$stage/aligned.apk"
"$APP_BUILD_TOOLS/apksigner" sign --ks "$APP_SIGN_KEYSTORE" --ks-pass env:APP_SIGN_PASSWORD --out release/phone-calendar-sync.apk "$stage/aligned.apk"
"$APP_BUILD_TOOLS/apksigner" verify --verbose release/phone-calendar-sync.apk
rm -f release/phone-calendar-sync.apk.idsig
