# Farmiqo Mobile Builds

Stack retained per `ARCHITECTURE.md`: **Capacitor 7** shells around the Vite web app
(`webDir: dist`), not an Expo rewrite. One codebase ships to web, Android, and iOS.

## Identity (both platforms)

- Name: **Farmiqo** · App id: **`com.farmiqo.app`** · Version: **1.0 (build 1)**
  (Android `versionCode 1`/`versionName "1.0"`; iOS `MARKETING_VERSION 1.0`/`CURRENT_PROJECT_VERSION 1`).
- Bump all four on every store release. Branding placeholder icons are generated —
  replace with the official logo asset (see `README.md`) before store submission.

## The one critical rule

Native bundles contain **no dev server**: `services/api.js` throws
`API_URL_NOT_CONFIGURED` unless built with `VITE_API_URL=https://<api>/api`.
CI enforces this (`FARMIQO_API_ORIGIN` repo variable must be `https:`). Never bake
`localhost`/LAN IPs into a native build — the app would be bricked off-device.

## Android

- Config: `android/` (namespace `com.farmiqo.app`, SDK 35, Java 21, Gradle 8.9, AGP 8.7.2),
  minimal permissions (`INTERNET` only), `androidScheme: https`.
- Local: `npm run build` → `npx cap sync` (`npm run cap:sync`) → `npm run android`
  (Android Studio) or `npm run android:debug` (→ `android/app/build/outputs/apk/debug/app-debug.apk`;
  install via `npm run android:install` / `adb install -r …`). Needs Java 21 + SDK 35 —
  note: this machine currently has Java 27, so prefer CI for builds.
- Release: create the key once with `.\scripts\setup-android-signing.ps1` (stored outside the
  repo at `%USERPROFILE%\.farmiqo`; back it up — losing it blocks updates), restart the
  terminal, then `npm run android:release` (APK) / `npm run android:aab` (Play bundle).
- CI (`Mobile Builds` workflow, manual or `v*` tags): debug APK artifact. `Signed Mobile
  Releases` workflow (needs `ANDROID_KEYSTORE_*` secrets + `FARMIQO_API_ORIGIN`): signed APK + AAB.

## iOS

- Config: `ios/` (bundle `com.farmiqo.app`, display name Farmiqo, launch storyboard, portrait+landscape).
  Check item: `UIRequiredDeviceCapabilities` still lists legacy `armv7` (Capacitor default) —
  confirm with the installed-Xcode validation before App Store submission.
- No local macOS build on this machine: use CI. `Mobile Builds` produces an **iOS Simulator
  app** (no signing; for Simulator testing only). `Signed Mobile Releases` produces a signed
  **IPA** for App Store Connect (needs Apple Developer account + `IOS_DISTRIBUTION_P12_*`,
  `IOS_PROVISIONING_PROFILE_*`, `IOS_KEYCHAIN_PASSWORD` secrets; Team ID/profile name are
  read from the provisioning profile).
- iPhone users without the native app: install the PWA from Safari (Share → Add to Home Screen) over HTTPS.

## GitHub secrets/variables checklist

Variable: `FARMIQO_API_ORIGIN` — set to exactly `https://farmiqo-production.up.railway.app`
(page: repo **Settings → Secrets and variables → Actions → Variables**). Both mobile workflows
bake `<origin>/api` into the app and refuse non-`https:` values, so the APK/AAB/IPA talk to
production with the laptop off. Secrets (signed releases only):
`ANDROID_KEYSTORE_BASE64/_PASSWORD/_ALIAS/_KEY_PASSWORD`, `IOS_DISTRIBUTION_P12_BASE64/_PASSWORD`,
`IOS_PROVISIONING_PROFILE_BASE64`, `IOS_KEYCHAIN_PASSWORD`. Never echo or commit these.
