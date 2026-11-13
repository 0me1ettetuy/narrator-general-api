import type { PrismaService } from '../prisma/prisma.service.js';

// Ids of the given books that have at least one ready chapter audio. Reads
// only ids and statuses, never chapter text, so it is cheap for a page of books.
export async function findBookIdsWithReadyAudio(
  prisma: PrismaService,
  bookIds: string[],
): Promise<Set<string>> {
  if (bookIds.length === 0) {
    return new Set();
  }

  const chapters = (
    await prisma.db.orm.public.Chapter.where((chapter) =>
      chapter.bookId.in(bookIds),
    )
      .select('id', 'bookId', 'removedAt')
      .all()
  ).filter((chapter) => chapter.removedAt === null);

  if (chapters.length === 0) {
    return new Set();
  }

  const readyChapterIds = new Set(
    (
      await prisma.db.orm.public.Audio.where((audio) =>
        audio.chapterId.in(chapters.map((chapter) => chapter.id)),
      )
        .select('chapterId', 'status')
        .all()
    )
      .filter((audio) => audio.status === 'READY')
      .map((audio) => audio.chapterId),
  );

  return new Set(
    chapters
      .filter((chapter) => readyChapterIds.has(chapter.id))
      .map((chapter) => chapter.bookId),
  );
}
