# Account, session, and protected workspace

## What it is

Users can create an account, sign in, stay signed in after a refresh, and sign
out. Book, audio, model-key, and chapter-curation data are scoped to the
authenticated user.

## How to use it in the UI

1. Open **Create account** or **Sign in** from the public header.
2. Submit an email and password. Forms validate input before submission and
   show localized field or server errors.
3. On success, the app routes to `/home`; the private sidebar shows the signed
   in email and offers **Log out**.
4. Opening `/login` or `/register` while signed in routes to `/home` instead.
   Opening a private route while signed out routes to `/login`.

## What happens underneath

- The backend stores a password hash, never a password. A new login creates a
  database `Session` record containing a hash of the refresh token.
- The short-lived access JWT is returned to the frontend and kept only in its
  in-memory session store. The longer-lived refresh JWT is an HttpOnly cookie;
  JavaScript cannot read it.
- `POST /auth/refresh` rotates the refresh token. Reuse of an old refresh token
  revokes the session, which prevents a copied stale token from continuing to
  work.
- A double-submit CSRF cookie/token protects browser mutations. The frontend
  requests a fresh token at bootstrap, after login/register, after refresh,
  and after logout; it adds the token header to non-read requests.
- The API client makes one shared refresh attempt after an authenticated `401`,
  then retries the original request with the new access JWT. Parallel failed
  requests share one refresh promise instead of rotating the cookie repeatedly.
- Each protected endpoint uses the access-token guard and looks up the book or
  other resource through the current user's ID; a client-supplied user ID is
  never trusted.

## Contributing commits, checked by actual change

- Backend: `ae1c3ff`, `4cd97e9`, `2b5e3a1`, `053cc50`, `b80fa30`, `832e7e5`,
  `2d72f29`, and `e5c8227`. Together these added the user/session schema,
  password and JWT services, guards and strategies, CSRF endpoint/middleware,
  safe error codes, OpenAPI contracts, and the correction that invalid CSRF is
  a `403` rather than a server `500`.
- Frontend: `92bcd21`, `64a8c22`, and `fc12396`. These added the generated API
  transport, memory session, CSRF/refresh lifecycle, protected/public layouts,
  forms, and redirects.
