# Book collections

## What it is

A collection is an ordered list of books, stored as references and never
copies. It starts private. Making it public publishes the owner's private
books in it, so other signed-in users can see the collection and every book
in it. A book that its owner makes private later stays in the collection as a
ghost for the owner only, and it returns when the book is public again.

## How to use it in the UI

1. On `/library`, open the **Collections** tab and create a collection.
2. On a book page, use **Add to collection**. On a collection page, use
   **Add books**, then reorder or remove books with the row controls.
3. On a collection page, **Make public** lists the private books it will
   publish first. The toggle stays disabled until every book is `READY`.
4. The **Community** tab's **Collections** view lists public collections.
   **Save** adds one to your library; if its owner makes it private, your
   copy shows as a ghost with its last known title and a remove action.

## What happens underneath

- `Collection` is `PRIVATE` by default. `CollectionBook` holds ordered
  `(collectionId, bookId)` references, unique per pair.
- `PATCH /collections/:collectionId/visibility` to `PUBLIC` publishes the
  owner's private books in the same transaction, and rejects a non-`READY`
  one with `COLLECTION_BOOKS_NOT_READY`. Going private leaves books public.
- Adding a private book to a public collection requires `makePublic: true`,
  otherwise the request fails with `COLLECTION_BOOK_NOT_PUBLIC`.
- Ghosts are computed on read. Only the owner sees a ghost book. Other viewers
  see only public books, and `containsBook` is true only for a book the viewer
  can read or a collection the viewer owns.
- `CollectionLibraryEntry` saves another user's public collection, storing a
  title snapshot that a ghost shows.
- Deleting a book removes its collection references, so no ghost remains.

## Contributing commits, checked by actual change

- Backend: `b3fae68` (spec and plan), `3256595` (tables and error codes),
  `a613aea` (ghosts for saved references), `72676b4` (reads, creation,
  deletion), `536b5ed` (add, remove, reorder), `4e5e5fb` (publish and saved
  collections), `3d65e8f` (controller routes), `64ffa72` (guidance).
- Frontend: `8d340b9` (plan), `6bba5c1` (client exports and translations),
  `b9d72e0` (ghost books in the library), `f6f0bed` (Collections tab and
  Community browsing), `504b484` (collection page), `1dd49e5` (add-to-collection
  with the publish warning), `32c5920` (guidance).
