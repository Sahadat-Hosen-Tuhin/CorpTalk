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

## Theme

The brand palette is defined in `src/index.css` using Tailwind CSS 4 `@theme` tokens and CSS
variables. Shared color tokens are available as utilities such as `bg-brand-primary`,
`text-heading`, `bg-surface`, and `text-text-muted`. Light mode is the default, dark mode follows
the operating-system preference, and adding the `dark` class to the root element selects the dark
palette explicitly.

Run `npm run lint`, `npm run format:check`, and `npm run build` to validate the client.
