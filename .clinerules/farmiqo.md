# Farmiqo — Project Coding Rules

## 1. ARCHITECTURE

- The frontend is a vanilla JavaScript single-page application built with Vite. No frontend framework is used.
- The backend is a Node.js application using Express 5 with Socket.IO for realtime updates.
- The database uses MongoDB accessed through the Mongoose ODM.
- Mobile applications are built with Capacitor 7 (Android/iOS shells plus PWA distribution).
- Do not introduce React, Angular, Vue, or any other frontend framework without explicit permission.

## 2. CODE QUALITY

- Inspect existing code before modifying it.
- Reuse existing functions and components.
- Avoid duplicate code; extend existing patterns rather than adding parallel implementations.
- Maintain existing naming conventions and folder structure.
- Keep frontend and backend API contracts consistent.

## 3. FARMER AND CONSUMER EXPERIENCE

- Preserve separate farmer and consumer workflows.
- Maintain existing authentication and authorization.
- Preserve COD-only checkout unless explicitly instructed otherwise.
- Maintain English and Telugu translations.

## 4. DATABASE AND SECURITY

- Never expose API keys, passwords, JWT secrets, or database credentials.
- Never print `.env` contents.
- Do not change authentication, database schemas, or security middleware without approval.
- Never assume the database environment; inspect configuration safely.

## 5. DESIGN

- Maintain Farmiqo branding.
- Prioritize mobile-first responsive design.
- Maintain consistent colors, spacing, typography, and icons.
- Preserve accessibility and existing functionality.

## 6. DEVELOPMENT SAFETY

- Always explain the proposed changes before implementing them.
- Never delete files or perform destructive operations without approval.
- Never install new dependencies without approval.
- Run relevant existing tests after approved changes.
- Never overwrite working functionality to fix an unrelated issue.

## 7. IMPORTANT USER PREFERENCE

- The long-term requirement is cloud-accessible data.
- Do not introduce new localStorage-based persistence.
- The existing JWT/localStorage implementation must not be changed without a separately reviewed migration plan.

## 8. DEPLOYMENT AND CLOUD CONFIGURATION

- The backend is deployed to Railway via the Dockerfile and `railway.json`; it serves the API and the built frontend (`dist/`) from a single origin.
- The database is MongoDB Atlas (replica set; transactions used for checkout and fulfilment).
- All deployment configuration is supplied through environment variables; never hardcode secrets or commit them to the repository.
- Runtime configuration includes `JWT_SECRET`, `MONGODB_URI`, `PORT`/`API_PORT`, and `APP_ORIGIN`; optional integrations include Brevo for password-reset mail and Cloudinary for product-photo uploads, plus `DELIVERY_FEE_PERCENT`.
- Native mobile builds must target the deployed API origin (`https://...`); localhost origins are rejected for native builds.
- Keep secrets in the host secret manager / GitHub Secrets; never commit `.env` or print its contents.
