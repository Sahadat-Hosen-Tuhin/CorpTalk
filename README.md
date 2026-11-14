# CorpTalk

CorpTalk is a full-stack chat and calling application. It has a React web client and a Node.js/Express API backed by MongoDB, with Socket.IO for realtime features.

## Features

- Email verification, login, password recovery, profile and privacy settings
- Friend requests, blocking, direct and group conversations
- Text and media messages, read receipts, reactions, pins, forwarding and search
- One-to-one voice and video calls using WebRTC
- Scheduled meetings with invite links, access requests and LiveKit video rooms
- Stories, user/content reports and optional push notifications

## Architecture

| Component | Location | Role |
| --- | --- | --- |
| Frontend | `frontend/` | React, Vite, React Router, Zustand and Tailwind CSS |
| Backend | `backend/` | Express API, authentication, business logic and Socket.IO |
| Database | MongoDB | Application data and session records |
| Media | Cloudinary | User avatars, chat media and stories |
| Meeting video | LiveKit | Group meeting media rooms |

The HTTP API is rooted at `/api/v1`. `GET /api/health` is the unauthenticated health check. Socket.IO connects to the backend host.

## Requirements

- Node.js and npm
- MongoDB (MongoDB Atlas is suitable for production)

The following integrations are optional or feature-specific:

- SMTP for verification and password-recovery email
- Cloudinary for avatar, chat-media and story uploads
- LiveKit for scheduled meeting rooms
- TURN for reliable peer-to-peer calls across restrictive networks
- Redis for durable meeting reminders and automatic meeting end
- Firebase Cloud Messaging for browser push notifications
- An AI provider, if AI features are enabled

## Local development

### 1. Create environment files

Copy the example files and fill in the values required by the features you want to run.

PowerShell:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

macOS/Linux:

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

At minimum, configure these backend values:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database>
JWT_ACCESS_SECRET=<long-random-secret>
JWT_REFRESH_SECRET=<different-long-random-secret>
```

For local development, the example values for the application URLs and port can remain:

```env
NODE_ENV=development
PORT=5000
APP_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
```

Do not add spaces around `=` in `.env` values. URL-encode special characters in MongoDB credentials. Keep `.env` files and service-account credentials out of version control.

The browser-facing frontend configuration belongs in `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

`VITE_API_URL` should be the backend origin only; the client adds `/api/v1` itself. Values prefixed with `VITE_` are included in the public frontend build, so never put secrets there.

### 2. Install dependencies and start the backend

In a terminal:

```sh
cd backend
npm install
npm run dev
```

The server connects to MongoDB before accepting HTTP and Socket.IO traffic. Locally it listens on port `5000` by default.

### 3. Start the frontend

In a second terminal:

```sh
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Check the backend at `http://localhost:5000/api/health`.

## Production deployment

Deploy the frontend and backend as separate services:

- The Vite frontend can be deployed to Vercel or another static-site host.
- Deploy the backend to a persistent Node.js service, such as a Render Web Service. This backend starts an HTTP server and uses Socket.IO; a standard serverless function deployment is not suitable for its persistent realtime connections.

For a Render monorepo service, use `backend` as the root directory, `npm ci` as the build command, and `npm start` as the start command. Render supplies the `PORT` environment variable.

### Frontend environment

Set these variables in the frontend hosting provider, using the deployed backend origin:

```env
VITE_API_URL=https://<backend-host>
VITE_SOCKET_URL=https://<backend-host>
```

Do not append `/api/v1` to either URL. Redeploy the frontend after changing build-time environment variables.

### Backend environment

Set production values in the backend hosting provider's environment settings:

```env
NODE_ENV=production
APP_URL=https://<frontend-host>
CORS_ORIGINS=https://<frontend-host>
COOKIE_SECURE=true
```

Also configure `MONGODB_URI`, strong unique JWT secrets, and the credentials for any enabled integrations. `CORS_ORIGINS` accepts a comma-separated list of exact frontend origins, without trailing slashes.

Leave `COOKIE_DOMAIN` empty when the frontend and backend use unrelated hostnames. For cross-site frontend/backend deployments, configure `COOKIE_SAME_SITE=none` with secure cookies. If possible, use custom frontend and API subdomains under the same site to avoid browser restrictions on cross-site cookies.

Use the backend health endpoint to verify deployment:

```text
https://<backend-host>/api/health
```

It should return HTTP `200` with a JSON status of `ok`.

## Optional integrations

Configure only the services required by the features you plan to use. The full list of supported environment keys is in [`backend/.env.example`](./backend/.env.example); public browser settings are in [`frontend/.env.example`](./frontend/.env.example).

- **Email:** Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM`.
- **Cloudinary:** Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`.
- **Firebase push notifications:** Set the public Firebase web-app values and VAPID key in the frontend environment. Configure backend FCM credentials and `FCM_PROJECT_ID` on the server.
- **LiveKit meetings:** Set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` on the backend. Never expose the API secret to the frontend.
- **TURN for calls:** The default STUN server may not establish media paths on restrictive networks. Set `CALL_TURN_URLS`, `CALL_TURN_USERNAME` and `CALL_TURN_CREDENTIAL` on the backend using values from a TURN provider. Do not put TURN credentials in `VITE_*` variables.
- **Redis:** Set `REDIS_URL` to enable durable meeting reminders and automatic meeting end. Without Redis, those background features are disabled.
- **AI:** Set `AI_PROVIDER` and the matching provider API key on the backend only.

Production calls require HTTPS so browsers can grant camera and microphone access. Test calls between different devices and networks; localhost tests do not verify NAT traversal.

## API overview

All application endpoints use the `/api/v1` prefix.

| Feature | Route prefix |
| --- | --- |
| Authentication | `/auth` |
| Users and profiles | `/users` |
| Friends and blocks | `/friends` |
| Conversations and messages | `/conversations`, `/messages` |
| Calls | `/calls` |
| Scheduled meetings | `/meetings` |
| Stories | `/stories` |
| Reports | `/reports` |

Most routes require authentication. The backend validates input and enforces friendship, membership, blocking, privacy and meeting-access rules for protected operations.

## Project structure

```text
backend/
  src/
    config/        Database and service configuration
    controllers/   HTTP request handlers
    middlewares/   Authentication, validation and error handling
    models/        Mongoose models
    routes/        API route definitions
    services/      Business logic and integrations
    sockets/       Socket.IO event handlers
  tests/
frontend/
  src/
    components/    Shared UI and layouts
    features/      Feature-specific UI
    pages/         Route-level screens
    services/      HTTP and Socket.IO clients
    stores/        Client state
```

Each MongoDB model has its own file under `backend/src/models/`. Production startup disables automatic index creation; review and apply index changes as a deployment or migration operation.

## Checks

Run commands from the relevant package directory.

Backend:

```sh
npm test
npm run lint
npm run format:check
```

Frontend:

```sh
npm run lint
npm run format:check
npm run build
```

## Operational notes

- Keep one realtime backend instance until presence and active-call state are moved to shared storage and a Socket.IO adapter is configured.
- Store passwords, verification codes and refresh tokens only as hashes; never log or commit credentials.
- MongoDB TTL deletion is asynchronous. Application queries must still filter expired OTPs and stories by their expiration time.
- Configure MongoDB Atlas network access to allow connections from the backend hosting provider.

For frontend-specific details, see [`frontend/README.md`](./frontend/README.md).
