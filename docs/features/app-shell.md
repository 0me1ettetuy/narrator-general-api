# Application shell, navigation, and preferences

## What it is

Narrator has separate public and authenticated shells rather than a collection
of unrelated pages. The public header changes from sign-in actions to the
signed-in user's badge when a session exists. The private workspace has a
collapsible sidebar, header breadcrumbs, and route-level error/404 handling.

## How to use it in the UI

- Use the sidebar to open **Home**, **Library**, and **Models**. The button at
  the top of the sidebar expands or collapses it.
- The header breadcrumb shows the active route hierarchy, for example
  `Library › Book`; use **Library** there to navigate back.
- Use the theme and language controls at the bottom of the expanded sidebar.
  When collapsed, the settings button opens the same controls in a dropdown.

## What happens underneath

- TanStack Router file routes compose public and protected layouts. The
  protected layout owns the access-token check, avoiding duplicated route
  guards in every page.
- The theme provider applies `dark` to the root HTML element and stores the
  selected light/dark value in local storage, so public pages receive the same
  theme on their next mount.
- i18next supplies English and Russian strings. The chosen locale is stored in
  local storage, and all visible UI strings are translated rather than built
  from backend messages.
- Server failures are normalized to stable error codes, translated in the
  frontend, and shown through toasts or page-level error states. Unknown routes
  use a back-navigation 404 page.

## Contributing commits, checked by actual change

- Frontend: `a111cf2`, `a9df164`, and `6a328a8` established router-based
  routing and the current FSD layout (`app → pages → widgets → shared`).
- `64a8c22` added the public/private shells, sidebar, user card, logout,
  breadcrumbs, theme provider, and base pages.
- `318fcfd`, `5aee98a`, `d378f3a`, and `43db021` added localization, localized
  errors/toasts, reusable loading/error/empty states, and the route error page.
- UI primitives came from `fd2bf63`; it is a component-library setup commit,
  not a separate user product feature.
