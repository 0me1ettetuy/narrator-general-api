import { Injectable } from '@nestjs/common';
import { OnModuleDestroy } from '@nestjs/common';
import { db } from './db';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db = db;

  async onModuleDestroy() {
    await this.db.close();
  }
}
