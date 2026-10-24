import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { TtsModelsModule } from '../tts-models/tts-models.module.js';
import { BooksController } from './books.controller.js';
import { BookParsingService } from './book-parsing.service.js';
import { BooksService } from './books.service.js';
import { EpubParserService } from './epub-parser.service.js';

@Module({
  imports: [PrismaModule, StorageModule, JobsModule, TtsModelsModule],
  controllers: [BooksController],
  providers: [BooksService, EpubParserService, BookParsingService],
  exports: [EpubParserService, BookParsingService],
})
export class BooksModule {}
