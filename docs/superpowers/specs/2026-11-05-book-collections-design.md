# Book collections design

Shared spec for both repos. Implementation plans:

- Backend: `narrator-general-api/docs/superpowers/plans/2026-11-05-book-collections-backend.md`
- Frontend: `narrator-fe/docs/superpowers/plans/2026-11-05-book-collections-frontend.md`

## Why

Readers want to group related books, such as the Lord of the Rings trilogy or
the Dune and Harry Potter series, and share those groups through Community.

## Core rules

1. A collection holds references to books. It never copies a book.
2. A book can be in many collections, but only once in each.
3. A new collection is private.
4. A private collection can hold private books, public books, or a mix.
5. Making a collection public makes the owner's private books in it public.
   The owner must confirm a warning first. The change is all or nothing.
6. Other users only ever see public books in a public collection.
7. Community lists public collections that have at least one public book.
8. Making a collection private again leaves its books public.

## Ghosts

A ghost is a reference to something its owner has made private. It keeps a
user's place so the item returns if the owner makes it public again.

- References are kept when an item goes private. Ghost status is calculated on
  each read, so nothing has to be restored when the item goes public.
- A book is a ghost for a viewer if it's `PRIVATE` and the viewer doesn't own
  it. A collection is a ghost under the same rule.
- A ghost exposes only its id and title. It has no cover, chapters, or audio,
  and its URL returns 404.
- Ghost books appear in the viewer's library and in collections the viewer
  owns. Other people viewing a public collection see nothing for that book.
- Ghost collections appear in the viewer's collections list.
- The user can keep a ghost or remove it. Removing it deletes only their
  reference, so the item won't come back for them.

## Adding, removing, and deleting

| Action                 | Who                               | Result                                                     |
| ---------------------- | --------------------------------- | ---------------------------------------------------------- |
| Add book to collection | Collection owner, own/public book | Adds a reference. No library entry is needed.              |
| Remove from collection | Collection owner                  | Deletes that reference only, even for the owner's book.    |
| Remove from library    | Anyone who saved it               | Deletes that user's reference only.                        |
| Remove a ghost         | The person seeing it              | Deletes that user's reference only.                        |
| Delete a book          | Book owner                        | Permanent. All references vanish, with no ghost.           |
| Delete a collection    | Collection owner                  | Permanent. Saved references vanish. Books are not deleted. |

## Edge cases

| Case                                             | Behaviour                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Owner's non-`READY` book blocks going public     | Reject with `COLLECTION_BOOKS_NOT_READY`. Nothing changes.                         |
| Another user's ghost when going public           | Doesn't block. It stays a ghost that only the collection owner sees.               |
| Private book added to a public collection        | Needs confirmation and `makePublic: true`, otherwise `COLLECTION_BOOK_NOT_PUBLIC`. |
| Non-`READY` book added to a public collection    | Reject with `COLLECTION_BOOKS_NOT_READY`.                                          |
| Owner's book goes private in a public collection | Stays in the collection, marked "hidden from others" for the owner.                |
| Public collection has no public books            | Allowed, but hidden from Community.                                                |
| Non-owner opens a private collection             | 404, same as a missing id.                                                         |
| Book is added twice                              | Second add does nothing.                                                           |
| Reorder list doesn't match the collection        | 400. The list must include ghosts.                                                 |
| Collection reaches 500 books                     | Further adds are rejected with `CONFLICT`.                                         |
| Book is copied                                   | The copy doesn't join the original's collections.                                  |
| User saves their own collection                  | Rejected with `CONFLICT`, same as books.                                           |

## Decisions made while planning

- **Permanent deletes leave no ghost.** The user didn't answer this question,
  so this uses the recommended option. `BookDeletionService` already removes
  other users' library entries, so it matches current behaviour.
- **Book ghosts read `Book.title`, with no stored snapshot.** There's no API for
  renaming a book, so its title can't change after it goes private. This drops
  the snapshot mentioned in the earlier chat for books.
- **Collection ghosts use a stored snapshot.** Collections can be renamed, so
  `CollectionLibraryEntry.titleSnapshot` stores the title when the user saves
  it. A rename while private can't leak.
- **Collections reuse the `BookVisibility` enum** rather than adding an
  identical one.
- **Covers are derived.** A collection shows the first readable book's cover.
- **Reordering uses up and down buttons**, matching chapter curation and
  avoiding a drag-and-drop dependency.

## Out of scope

Collaborators, cover uploads, upload-time grouping, notifications when an item
becomes a ghost, and restoring ghosts lost before this ships. Rows that were
already deleted when a book went private can't be recovered.
