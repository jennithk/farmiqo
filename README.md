# Farmiqo

Farmiqo is a mobile-first farmer-to-consumer marketplace. The existing Figma-derived interface is served by Vite; the Express API and MongoDB database are the source of truth for accounts, listings, carts, inventory, and orders. Socket.IO delivers account-scoped order and notification events.

## Requirements

- Node.js 20+
- Java 21 and Android SDK Platform 35 for native builds
- MongoDB Atlas (or another MongoDB replica set; checkout uses transactions for atomic inventory reservation)
- An HTTPS origin for public PWA installation

## Local setup

```bash
npm install
npm run setup:local
```

`setup:local` creates an untracked `.env` and a persistent cryptographically random `JWT_SECRET`. Set `MONGODB_URI` directly in that local file to a MongoDB replica-set connection string before using marketplace data. Do not paste credentials into chat or commit `.env`. Set `APP_ORIGIN` to the browser origin when it is not `http://localhost:5173`.

Start the API and UI together:

```bash
npm run dev
```

Open <http://localhost:5173>. If MongoDB is not configured, the UI still loads, but the API health endpoint and marketplace data routes return HTTP 503; no local or fabricated marketplace writes are accepted.

## Scripts

```bash
npm run dev       # API and Vite development servers
npm run api       # Express + Socket.IO API only
npm run ui        # Vite only
npm run build     # production frontend build
npm run preview   # preview the production frontend
npm run cap:sync  # sync web build into Capacitor platforms
npm run android   # open the Android project in Android Studio
npm run android:debug   # build an installable debug APK
npm run android:install # build and install on a connected device/emulator
npm run android:release # build a signed release APK
npm run android:aab     # build a signed Google Play bundle
```

API defaults to port 3000. Vite proxies `/api` and `/socket.io` to it. Configure `API_PORT`, `APP_ORIGIN`, `MONGODB_URI`, `JWT_SECRET`, and optional `DELIVERY_FEE` in the backend environment. `VITE_API_URL` and `VITE_SOCKET_URL` are build-time frontend settings; never put private secrets in `VITE_*` variables.

## Current API

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/listings`, `GET /api/listings/:id`, and authenticated farmer create/update/delete routes
- Authenticated consumer cart read/add/update/remove routes
- `POST /api/orders`, consumer order history/detail, and farmer order listing/status routes
- `GET /api/notifications`
- `GET /api/health`

Passwords are bcrypt-hashed and account access uses JWT. Order creation validates all listing stock on the server and uses MongoDB transactions and conditional stock decrements to prevent overselling. Prices are snapshotted into orders. COD is recorded as pending and marked paid when the farmer records delivery; UPI is explicitly a mock choice. Socket.IO requires a valid session token and emits listing, order, and notification events.

## MongoDB Atlas

1. Create a MongoDB Atlas cluster and database user.
2. Allow the deployment server's outbound IP in Atlas Network Access. Avoid `0.0.0.0/0` in production where possible.
3. Set `MONGODB_URI` and `JWT_SECRET` in the backend host's secret manager.
4. Ensure the chosen MongoDB deployment supports transactions (Atlas replica sets do).
5. Set `APP_ORIGIN` to the public HTTPS frontend origin and configure the frontend socket URL to the public API origin if frontend and API are hosted separately.

## Public deployment

The repository includes `render.yaml` for a single-origin deployment. Push this project to a GitHub repository, then in Render choose **New > Blueprint**, connect that repository, and apply the blueprint. The `starter` web-service plan is paid; review Render's current pricing before confirming. Render generates the production `JWT_SECRET`; enter the MongoDB Atlas URI when prompted for `MONGODB_URI`. The resulting HTTPS service hosts the UI, REST API, and Socket.IO endpoint at one public URL. The API uses Render's assigned URL plus the Capacitor origins for CORS.

Before launching Render, create a MongoDB Atlas replica-set cluster and database user. In Atlas Network Access, allow the Render service to connect; for initial setup, Atlas may require `0.0.0.0/0` because Render's outbound IPs are not fixed on this plan. Use a unique database user/password and keep its URI only in Render's `MONGODB_URI` secret field. The readiness check returns HTTP 503 until Atlas accepts the connection.

After deployment, set the GitHub repository **variable** `FARMIQO_API_ORIGIN` to the service's public HTTPS origin (for example, `https://farmiqo-marketplace.onrender.com`). The `Mobile Builds` workflow runs manually or on version tags and publishes an Android debug APK plus an iOS Simulator app as workflow artifacts. Once the workflow completes, download the APK from the run's **Artifacts** section. No connected phone or developer computer is needed to produce these artifacts.

Add `MONGODB_URI` only to Render's secret environment configuration. Keep the generated JWT secret managed by Render. Never put either secret in GitHub variables or source code. Do not commit `.env`.

## PWA and HTTPS deployment

The web manifest is `public/manifest.webmanifest`; the service worker source is `public/sw.js`. Chromium browsers expose the native install prompt when the app is served over HTTPS and meets their install criteria; the app displays an **Install Farmiqo** action when that prompt is available. On iPhone, open the deployed HTTPS URL in Safari, tap **Share**, then **Add to Home Screen**. The service worker caches the app shell; marketplace actions require a live API and database.

## Android packaging

Capacitor is configured with application ID `com.farmiqo.app` and `webDir: dist`. This project uses Java 21, Gradle 8.9, Android Gradle Plugin 8.7.2, and Android SDK 35. The generated iOS Xcode project lives in `ios/` and is built on macOS by the mobile workflow.

```bash
npm run build
npx cap add android
npm run cap:sync
npm run android
```

The project and SDK are configured locally. `npm run android:debug` creates `android/app/build/outputs/apk/debug/app-debug.apk`; `npm run android:release` creates a signed release APK; `npm run android:aab` creates a signed Play bundle. Android Studio is optional for these Gradle builds.

To create the local release key and persist its signing values in your Windows user environment (the key is stored outside the repository):

```powershell
. .\scripts\setup-android-signing.ps1
```

The script never prints the generated passwords. Back up `%USERPROFILE%\.farmiqo` securely; losing that key prevents updates to the published app. Gradle reads `FARMIQO_KEYSTORE_PATH`, `FARMIQO_KEYSTORE_PASSWORD`, `FARMIQO_KEY_ALIAS`, and `FARMIQO_KEY_PASSWORD` from the environment. Restart terminals after running the setup script to inherit the persistent user variables.

After restarting the terminal to load the persisted signing variables, run `npm run android:release` for a signed APK or `npm run android:aab` for a signed AAB. `npm run android:debug` builds a debug-signed APK without the release key. To install the debug APK over USB, enable developer options and USB debugging, connect the device, verify it with `adb devices`, then run `npm run android:install` or `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

## iOS device distribution

The GitHub workflow produces an iOS Simulator app. The PWA can also be installed on iPhone from Safari without Apple credentials. The signed release workflow produces a native `.ipa` when the repository has an Apple Developer account, an App ID matching `com.farmiqo.app`, an Apple Distribution certificate exported as `.p12`, and an App Store provisioning profile for that App ID. Add these GitHub repository secrets: `IOS_DISTRIBUTION_P12_BASE64`, `IOS_DISTRIBUTION_P12_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, and `IOS_KEYCHAIN_PASSWORD` (a new random password used only for the temporary CI keychain). Team ID and profile name are read from the profile. Do not send certificates, provisioning profiles, passwords, or private keys in chat.

## GitHub release credentials

For signed Android APK/AAB builds, add GitHub repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (value `farmiqo`), and `ANDROID_KEY_PASSWORD`, plus the repository variable `FARMIQO_API_ORIGIN`. To place the existing Android key's base64 in the clipboard without printing it, run this locally and paste the clipboard directly into the matching GitHub secret field:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\.farmiqo\farmiqo-release.p12")) | Set-Clipboard
[Environment]::GetEnvironmentVariable('FARMIQO_KEYSTORE_PASSWORD', 'User') | Set-Clipboard
```

Run the first command for `ANDROID_KEYSTORE_BASE64`; run the second for both password secrets. The alias is `farmiqo`. Trigger the **Signed Mobile Releases** workflow manually after all fields are present; it produces Android APK/AAB and a signed iOS IPA. Never echo, commit, or send these values in chat.

## Branding asset

The official logo shown in the conversation is not available as a file in this workspace. Do not treat the existing generated placeholder SVG icons or extracted reference screenshots as the official mark. Add the exact uploaded logo asset under `public/` before replacing the placeholder favicon, manifest/PWA icons, Android icon, or header branding. Keep its aspect ratio and generate platform sizes from that original file without recoloring or cropping it.

## Known external requirements

A public marketplace becomes ready after the Render Blueprint is applied and Atlas accepts `MONGODB_URI`. GitHub mobile builds require the repository variable `FARMIQO_API_ORIGIN`. Native iOS device distribution requires Apple signing credentials; until then, use the Safari-installed PWA or the iOS Simulator workflow artifact. The official logo file must be added to `public/` before branded platform icons can be generated. UPI remains mock; no payment gateway is connected.
