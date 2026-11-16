import type { PrismaService } from '../prisma/prisma.service.js';

// Total words per book over its live (not removed) chapters, for the given
// books. Reads only word counts, never chapter text, so it is cheap for a page.
export async function findBookWordCounts(
  prisma: PrismaService,
  bookIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (bookIds.length === 0) {
    return counts;
  }

  const chapters = await prisma.db.orm.public.Chapter.where((chapter) =>
    chapter.bookId.in(bookIds),
  )
    .select('bookId', 'wordCount', 'removedAt')
    .all();

  for (const chapter of chapters) {
    if (chapter.removedAt === null) {
      counts.set(
        chapter.bookId,
        (counts.get(chapter.bookId) ?? 0) + chapter.wordCount,
      );
    }
  }

  return counts;
}
