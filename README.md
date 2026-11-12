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

The backend listens on `PORT` (default `5000`) after MongoDB connects. Check `GET /api/health`, then use the frontend dashboard to test HTTP and Socket.IO connectivity. The Socket.IO smoke-test event is `health:ping`; the acknowledgement returns `health:pong`. Frontend public URLs can be overridden in `frontend/.env` using the keys in `frontend/.env.example`. Do not put secrets in `VITE_*` variables.

Run backend tests and checks with `npm test`, `npm run lint`, and `npm run format:check` from `backend/`. Run the frontend checks with `npm run lint`, `npm run format:check`, and `npm run build` from `frontend/`.

The remaining variables in `backend/.env.example` are reserved for the PRD's planned auth, Redis/BullMQ, SMTP, file storage, FCM, LiveKit, TURN/STUN, AI, and monitoring integrations. They are intentionally blank until those features are configured. For production, set `COOKIE_SECURE=true`, use strong unique JWT secrets, and supply credentials through the hosting provider's secret manager. `GOOGLE_APPLICATION_CREDENTIALS` should point to a Firebase service-account file kept outside version control.

### Model layout

Every model has its own file under `backend/src/models/`. Edit the model responsible for a collection instead of maintaining a single large schema file. `backend/src/models/index.js` is the central export when an application entry point needs all models.

| Model file | Collection purpose |
| --- | --- |
| `user.js` | Account, profile, username, privacy and application preferences |
| `otp.js` | Hashed, expiring email/phone verification and password-reset codes |
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

## Backend dependencies

The backend entry point is `backend/src/server.js`; it connects MongoDB before accepting HTTP/Socket.IO traffic and closes both cleanly on shutdown. Feature routes and services can be added incrementally without combining database models.
