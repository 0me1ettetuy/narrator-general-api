import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BooksModule } from '../books/books.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { ParseBookProcessor } from './parse-book.processor.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), BooksModule, JobsModule],
  providers: [ParseBookProcessor],
})
export class WorkerModule {}
