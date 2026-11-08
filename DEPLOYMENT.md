# Farmiqo Free Cloud Deployment Guide

This guide details how to deploy Farmiqo on **100% free cloud services** with a **free HTTPS domain** and a **free MongoDB Atlas replica set**.

---

## 1. Cloud Host Comparison (Free Tiers)

Farmiqo requires:
- A persistent Node.js / Express process that serves `/api` and the static `dist/` web client.
- **WebSockets / Socket.IO** support for real-time notifications, orders, and cart updates.
- Outbound connectivity to MongoDB Atlas.

| Provider | Free Plan Details | WebSockets | Free Domain | Sleep / Inactivity |
|---|---|---|---|---|
| **Render.com** (Recommended) | 100% Free Web Service (512 MB RAM, 0.1 vCPU). No credit card required. | ✅ Full support | `https://<app>.onrender.com` (Free auto SSL) | Spins down after 15 min idle; wakes in ~30s on request |
| **Koyeb** | Free Eco tier (512 MB RAM, 0.1 vCPU). | ✅ Full support | `https://<app>.koyeb.app` (Free auto SSL) | 24/7 (No idle spin-down) |
| **Hugging Face Spaces** | Free Docker SDK (16 GB RAM, 2 vCPU). | ✅ Full support | `https://<user>-<space>.hf.space` (Free auto SSL) | Sleeps when inactive |
| **Railway** | $5 one-time credit, then trial ends / workloads stop. | ✅ Full support | `*.up.railway.app` | Paid after credit expires |

---

## 2. Free Domain Options

1. **Built-in Cloud Subdomains (Zero setup, 100% Free):**
   - **Render:** `https://your-farmiqo-app.onrender.com`
   - **Koyeb:** `https://your-farmiqo-app.koyeb.app`
   - Both include automatic SSL/TLS certificates and renew permanently without cost.

2. **Free Community Developer Domains:**
   - **is-a.dev:** Free `yourname.is-a.dev` subdomain for open-source and personal projects via a simple GitHub PR ([is-a.dev](https://www.is-a.dev/)).
   - **js.org:** Free `yourname.js.org` subdomain for JavaScript projects ([js.org](https://js.org/)).

3. **Custom Domains:**
   - You can buy a low-cost domain (~$1–$3/year for `.xyz`, `.site`, `.top` on Porkbun or Namecheap) and point a CNAME to your Render/Koyeb service with free SSL.

---

## 3. Step-by-Step Deployment Instructions

### Step 1 — Free Database (MongoDB Atlas M0)
1. Go to **[mongodb.com/atlas](https://www.mongodb.com/atlas)** and sign in.
2. Click **Create Cluster** → Choose **M0 Free** (pick any region near your users, e.g. Mumbai `ap-south-1`).
   > *Note: Atlas M0 is a 3-node replica set, which is required because Farmiqo's checkout and bulk fulfilment use ACID transactions.*
3. Under **Security → Database Access**, create a user (e.g. `farmiqo_admin`) with a secure password.
4. Under **Security → Network Access**, click **Add IP Address** → Choose **Allow Access from Anywhere (`0.0.0.0/0`)**. This allows Render/Koyeb instances to reach the database.
5. In **Clusters**, click **Connect** → **Drivers** (Node.js) → Copy the connection string:
   ```text
   mongodb+srv://<user>:<password>@cluster0.xxxx.mongodb.net/farmiqo?retryWrites=true&w=majority
   ```

---

### Step 2 — Deploy on Render.com (Recommended)

#### Option A: Quick Blueprint Deploy (One Click)
1. Go to **[render.com](https://render.com)** and sign in with GitHub.
2. Click **New +** → **Blueprint**.
3. Select your repository `farmiqo-app`.
4. Render will detect `render.yaml` and prompt you for the required environment variables:
   - `MONGODB_URI`: Paste your Atlas URI from Step 1.
   - `APP_ORIGIN`: Enter `https://<service-name>.onrender.com`.
5. Click **Apply**. Render will install packages, build the frontend (`npm run build`), and start the Express server.

#### Option B: Manual Web Service Setup
1. Click **New +** → **Web Service**.
2. Connect your GitHub repository.
3. Configure the following fields:
   - **Name:** `farmiqo-app` (or your chosen name)
   - **Language:** `Node`
   - **Branch:** `main`
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
4. Under **Health Check Path**, enter: `/api/ready`
5. Under **Environment Variables**, add:

| Key | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Enables production caching and optimizations |
| `MONGODB_URI` | `mongodb+srv://...` | Your Atlas connection string from Step 1 |
| `JWT_SECRET` | *(Random 32+ character string)* | Sign token (e.g. `openssl rand -base64 32`) |
| `APP_ORIGIN` | `https://<your-render-subdomain>.onrender.com` | Your public Render domain |
| `DELIVERY_FEE_PERCENT` | `5` | Delivery fee percentage |
| `BREVO_API_KEY` | *(Optional)* | Enables password reset emails via Brevo |
| `RESET_FROM_EMAIL` | *(Optional)* | Verified Brevo sender address |
| `CLOUDINARY_CLOUD_NAME` | *(Optional)* | For Cloudinary photo uploads |
| `CLOUDINARY_API_KEY` | *(Optional)* | For Cloudinary photo uploads |
| `CLOUDINARY_API_SECRET` | *(Optional)* | For Cloudinary photo uploads |

6. Click **Create Web Service**. Once deployed, your app will be live at:
   `https://<your-service-name>.onrender.com`

---

### Step 3 — Verification

Once deployed, run these quick health checks in your browser or terminal:

1. **Liveness Probe:**
   ```
   https://<your-domain>/api/ready
   ```
   *Expected:* `{"ok":true,"service":"farmiqo-backend","ready":true}`

2. **Database Connectivity:**
   ```
   https://<your-domain>/api/health
   ```
   *Expected:* `{"ok":true,"service":"farmiqo-backend","database":"connected"}`

3. **Web Application:**
   Open `https://<your-domain>/` — you should see the Farmiqo marketplace splash screen with Telugu and English language options.

---

### Step 4 — Mobile / PWA App Configuration
When building the Capacitor mobile apps (Android APK/AAB or iOS IPA) or publishing the PWA:
1. In GitHub repo **Settings → Secrets and variables → Actions → Variables**, update `FARMIQO_API_ORIGIN` with your new production domain:
   ```text
   FARMIQO_API_ORIGIN=https://<your-domain>.onrender.com
   ```
2. Run the **Mobile Builds** workflow to generate release-ready Android APKs wired to your new free cloud backend.
