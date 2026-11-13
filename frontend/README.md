# CorpTalk frontend

The client uses React, Vite, React Router, Zustand and Tailwind CSS 4.

## Development

```powershell
npm install
npm run dev
```

Set `VITE_API_URL` and `VITE_SOCKET_URL` in `.env` when the backend is not running on
`http://localhost:5000`. These values are public client configuration; never put secrets in `VITE_*`
variables.

## Direct chat

The authenticated chat page is available at `/chat`. Users can search exact usernames, send/accept/
reject/cancel friend requests, and manage friends and blocked users from the sidebar. Accepted
friendships create a direct conversation; unfriend preserves history but prevents new messages, while
blocking denies access to that history. Chat history is loaded in pages of 30, with text/media message
delivery receipts and retryable optimistic sends.

Media uploads use Cloudinary configured in `backend/.env`; images are limited to 10 MB and other
supported media to 50 MB. Offline notifications require Firebase Cloud Messaging:

- Configure the public Firebase web-app values and VAPID key in `frontend/.env` using the
  `VITE_FIREBASE_*` and `VITE_FCM_VAPID_KEY` entries in `.env.example`.
- Configure `FCM_PROJECT_ID` and Application Default Credentials through
  `GOOGLE_APPLICATION_CREDENTIALS` in the backend environment.
- Serve the app over HTTPS in production (localhost is allowed for development), sign in, and select
  the notification bell in the chat sidebar to grant browser permission.

## Theme

The brand palette is defined in `src/index.css` using Tailwind CSS 4 `@theme` tokens and CSS
variables. Shared color tokens are available as utilities such as `bg-brand-primary`,
`text-heading`, `bg-surface`, and `text-text-muted`. Light mode is the default, dark mode follows
the operating-system preference, and adding the `dark` class to the root element selects the dark
palette explicitly.

Run `npm run lint`, `npm run format:check`, and `npm run build` to validate the client.
