# Farmiqo Mobile Installation Guide

## Android (APK for testing)

CI is the supported path (no local SDK needed):

1. On GitHub, open the repository → **Actions** → **Mobile Builds**.
2. Click **Run workflow** (or push a `v*` tag), wait for the `Android APK` job.
3. Download the **farmiqo-android-debug-apk** artifact, unzip it.
4. On the phone: enable install-from-unknown-sources if asked, then open
   `app-debug.apk` to install.
5. Open Farmiqo, register/log in, and confirm the startup screen loads data
   (this proves the baked production API origin works and the laptop is offline).

Local alternative (Windows, needs Java 21 + Android SDK 35):

```powershell
$env:JAVA_HOME='C:\Users\<you>\.jdks\temurin-21\jdk-21.0.12.1+1'
npm run build
npx cap sync android
npm run android:debug   # -> android/app/build/outputs/apk/debug/app-debug.apk
npm run android:install # installs on a USB-connected device (USB debugging on)
```

Signed release (Play): run the **Signed Mobile Releases** workflow after adding
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD` secrets. Produces signed APK + AAB. Never commit the keystore.

## iOS

- Simulator (no signing): run **Mobile Builds** → download **farmiqo-ios-simulator**,
  unzip on a Mac, drag `App.app` onto an iOS Simulator.
- Physical iPhone: requires an **Apple Developer account** (paid membership),
  an Apple Distribution certificate (`.p12`), and an App Store provisioning
  profile for `com.farmiqo.app`, stored as `IOS_DISTRIBUTION_P12_BASE64`,
  `IOS_DISTRIBUTION_P12_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`,
  `IOS_KEYCHAIN_PASSWORD` secrets. Then run **Signed Mobile Releases** and
  distribute the IPA via TestFlight/App Store Connect.
- Without signing: use the PWA — open the production URL in Safari →
  **Share → Add to Home Screen**.

## Production API verification (do this first on any install)

1. With the laptop switched off, open the app on mobile data.
2. Register a consumer, browse the marketplace, place a COD order.
3. Log in as a farmer (different account), accept the order, advance it.
4. If data flows both ways, the install is correctly pointed at production.

## Permissions the app will request (and why)

- Location (while in use): delivery-map pin only; search/manual pin works if denied.
- Camera / photos (Android) and camera/photo-library (iOS): farmer produce photos only.
