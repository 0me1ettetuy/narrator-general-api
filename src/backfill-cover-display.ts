import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { storeCoverDisplay } from './books/book-cover-display.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { temporalNow } from './prisma/temporal.js';
import { StorageModule } from './storage/storage.module.js';
import { StorageService } from './storage/storage.service.js';

const MAX_ORIGINAL_COVER_BYTES = 50 * 1024 * 1024;

// One-off: `node dist/backfill-cover-display.js`. Safe to re-run; a book whose
// cover cannot be resized is skipped and keeps serving the original.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
  ],
})
class BackfillModule {}

const logger = new Logger('BackfillCoverDisplay');

async function backfill(): Promise<void> {
  const app = await NestFactory.createApplicationContext(BackfillModule);

  try {
    const prisma = app.get(PrismaService);
    const storage = app.get(StorageService);
    const books = await prisma.db.orm.public.Book.where({
      coverDisplayObjectKey: null,
      deletedAt: null,
    }).all();
    let created = 0;
    let skipped = 0;

    for (const book of books) {
      if (!book.coverObjectKey) {
        continue;
      }

      try {
        const displayObjectKey = await storeCoverDisplay(
          storage,
          book.userId,
          book.id,
          await storage.getObjectBytes(
            book.coverObjectKey,
            MAX_ORIGINAL_COVER_BYTES,
          ),
        );

        if (!displayObjectKey) {
          skipped += 1;
          continue;
        }

        await prisma.db.orm.public.Book.where({ id: book.id }).update({
          coverDisplayObjectKey: displayObjectKey,
          updatedAt: temporalNow(),
        });
        created += 1;
      } catch {
        skipped += 1;
        logger.warn(`Skipped book ${book.id}`);
      }
    }

    logger.log(`Display covers created: ${created}, skipped: ${skipped}`);
  } finally {
    await app.close();
  }
}

void backfill().catch((error: unknown) => {
  logger.error(
    'Cover display backfill failed',
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
