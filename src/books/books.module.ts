import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { BooksController } from './books.controller.js';
import { BooksService } from './books.service.js';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [BooksController],
  providers: [BooksService],
})
export class BooksModule {}
