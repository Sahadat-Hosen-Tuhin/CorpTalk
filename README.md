# CorpTalk

CorpTalk is a MERN chat and video-calling application. This repository currently has a MongoDB/Mongoose backend foundation with independently maintained models.

## Backend database foundation

### Requirements

- Node.js compatible with the installed backend dependencies
- MongoDB (MongoDB Atlas is the planned production database)

### Configure the database

The backend environment files are `backend/.env` (local, ignored by Git) and `backend/.env.example` (safe template). Start the backend with `backend/` as the working directory and load dotenv before reading environment variables. Keep credentials in `.env` or your deployment secret manager; never commit production credentials.

```env
# Fill MONGODB_URI in backend/.env before connecting.
```

The shared connection helper is `backend/src/config/db.js`:

```js
require('dotenv').config();
const { connectDB, disconnectDB } = require('./src/config/db');

async function startServer() {
  await connectDB();
  // Start accepting HTTP and Socket.IO traffic only after the connection succeeds.
}
```

`MONGODB_URI` is the only setting currently consumed by the database connection helper; `NODE_ENV` controls its development/production index behavior. `connectDB()` fails explicitly if `MONGODB_URI` is missing or MongoDB cannot be reached. Automatic index creation is disabled when `NODE_ENV=production`; production index changes should be reviewed and applied as a deployment/migration operation. `disconnectDB()` is available for graceful shutdown and tests.

If Atlas reports `MongooseServerSelectionError`, confirm the cluster is running, the URI credentials are correct and URL-encoded, Atlas Network Access allows the machine's current public IP, and outbound MongoDB traffic is not blocked by a firewall.

### Run the Phase 0 foundation

Install dependencies from each package directory:

```powershell
cd backend
npm install
npm run dev
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

The backend listens on `PORT` (default `5000`) after MongoDB connects. Check `GET /api/health`. After signing in, use the frontend dashboard to test HTTP and authenticated Socket.IO connectivity. The Socket.IO smoke-test event is `health:ping`; the acknowledgement returns `health:pong`. Frontend public URLs can be overridden in `frontend/.env` using the keys in `frontend/.env.example`. Do not put secrets in `VITE_*` variables.

Run backend tests and checks with `npm test`, `npm run lint`, and `npm run format:check` from `backend/`. Run the frontend checks with `npm run lint`, `npm run format:check`, and `npm run build` from `frontend/`.

Redis/BullMQ, FCM, LiveKit, TURN/STUN, AI, and monitoring values in `backend/.env.example` are reserved for their later phases. For production, set `COOKIE_SECURE=true`, use strong unique JWT secrets, and supply credentials through the hosting provider's secret manager. `GOOGLE_APPLICATION_CREDENTIALS` should point to a Firebase service-account file kept outside version control.

### Model layout

Every model has its own file under `backend/src/models/`. Edit the model responsible for a collection instead of maintaining a single large schema file. `backend/src/models/index.js` is the central export when an application entry point needs all models.

| Model file | Collection purpose |
| --- | --- |
| `user.js` | Account, profile, username, privacy and application preferences |
| `otp.js` | Hashed, expiring email/phone verification and password-reset codes |
| `refreshSession.js` | Hashed, revocable refresh-token sessions and rotation families |
| `friendship.js` | One relationship/request per normalized user pair, including rejection cooldown data |
| `block.js` | Directional user blocks, kept separate to avoid an ever-growing user document |
| `conversation.js` | Direct/group membership, group permissions, last-message preview and pinned messages |
| `message.js` | Chat content, media metadata, delivery/read receipts, reactions and deletion state |
| `call.js` | 1-to-1 voice/video call history |
| `meeting.js` | Scheduled meeting configuration, invite list and access settings |
| `meetingJoinRequest.js` | Meeting join decisions and rejection count, stored separately for scalable queries |
| `story.js` | Expiring image/video stories and viewer records |
| `report.js` | User/content reports and moderation status |

Models use timestamps, strict schema validation and explicit indexes for uniqueness, lookups, cursor pagination and TTL cleanup. Stories default to a 24-hour lifetime. TTL deletion is asynchronous in MongoDB: application queries must still filter expired OTPs and stories by `expiresAt`.

### Data and application rules

- Store only normalized email/username values and a password hash; never store a plaintext password or OTP. `passwordHash` and `codeHash` are excluded from normal query results.
- Username is optional during the initial account phase and has a unique, lowercase index when supplied. Friend-request services should normalize user IDs into `pairLow`/`pairHigh` before creating a friendship.
- Direct conversation creation must compute the deterministic `directKey` as the two lowercase, sorted 24-character ObjectId hex strings separated by `:` (for example, `id1:id2`). Group conversations do not use `directKey`.
- Message history should use `{ conversationId, createdAt, _id }` cursor pagination; avoid loading an entire conversation. Persist media metadata/URLs, not binary uploads, in MongoDB.
- Membership, friendship, block status, meeting access, and group permissions must be checked by backend services on every operation; schema validation alone is not authorization.
- MongoDB writes that must update multiple documents consistently (for example accepting a friend request and creating a direct conversation) should use transactions on a replica set/Atlas deployment.
- `meetingJoinRequest.js` is separate rather than embedded in a meeting, so pending-request checks, per-user rejection limits, and meeting cancellation do not grow the meeting document without bound.
- Do not enable message encryption, server-side search, link previews, or AI processing without deciding how those features interact; end-to-end encrypted content cannot be inspected by server-side features.

## Phase 1 authentication and profile

The backend now provides email-verified account creation, 6-digit email codes, password login and recovery, rotating refresh sessions, protected profile APIs, avatar uploads, and authenticated Socket.IO presence. Passwords and OTP codes are stored as hashes; refresh tokens are stored as hashes and only returned in an `HttpOnly` cookie. Access tokens stay in frontend memory and are sent in the `Authorization` header.

### Configure Phase 1 services

Fill the authentication, SMTP, and Cloudinary values in `backend/.env`; never put these credentials in frontend `VITE_*` variables. JWT signing secrets must each contain at least 32 characters. `BCRYPT_SALT_ROUNDS` must be between 10 and 14. In production, set `COOKIE_SECURE=true`, configure the appropriate `COOKIE_SAME_SITE`/`COOKIE_DOMAIN`, and set the exact frontend origins in `CORS_ORIGINS`.

The email delivery integration uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. Cloudinary avatar storage uses `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. Avatar uploads accept JPEG, PNG, or WebP up to 5 MB.

### Auth API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/signup` | Create an unverified account and send an email code |
| `POST` | `/api/v1/auth/verify-otp` | Verify the 6-digit code (5-minute expiry; locked after 3 wrong attempts) |
| `POST` | `/api/v1/auth/resend-otp` | Resend a code after the 60-second cooldown |
| `POST` | `/api/v1/auth/login` | Sign in, issue a 15-minute access token and an HttpOnly 7-day refresh cookie |
| `POST` | `/api/v1/auth/refresh` | Rotate the refresh session and issue a new access token |
| `POST` | `/api/v1/auth/logout` | Revoke the current refresh session and clear its cookie |
| `POST` | `/api/v1/auth/forgot-password` | Request a password-reset code without revealing account existence |
| `POST` | `/api/v1/auth/reset-password` | Verify a reset code, change the password and revoke active sessions |
| `GET` | `/api/v1/users/me` | Return the authenticated user's profile |
| `PATCH` | `/api/v1/users/me` | Update name, phone, and bio |
| `POST` | `/api/v1/users/me/avatar` | Upload an authenticated user's avatar as multipart field `avatar` |

Auth routes use input validation and IP-based rate limits. Socket.IO connections require an access token in the handshake `auth.token` field. Authenticated clients receive `presence:update` events when visible users come online or go offline. Presence connections are currently tracked in one backend process; run a single realtime instance until a Redis Socket.IO adapter/shared presence store is configured for horizontal scaling. On startup, stale database presence flags are reset.

The frontend keeps each screen and shared auth UI element in its own JSX file: `Login.jsx`, `Signup.jsx`, `VerifyEmail.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, and `Profile.jsx`, with reusable auth form, header, and route-guard components. Refresh tokens are not stored in local storage.

Run backend tests and checks with `npm test`, `npm run lint`, and `npm run format:check` from `backend/`. Run the frontend checks with `npm run lint`, `npm run format:check`, and `npm run build` from `frontend/`.

## Backend dependencies

The backend entry point is `backend/src/server.js`; it connects MongoDB before accepting HTTP/Socket.IO traffic and closes both cleanly on shutdown. Feature routes and services can be added incrementally without combining database models.

## Frontend theme

The client theme uses the supplied orange/charcoal palette. Tailwind CSS 4 tokens and the light/dark CSS variables live in `frontend/src/index.css`; see [frontend/README.md](./frontend/README.md) for the utility names and mode behavior.
