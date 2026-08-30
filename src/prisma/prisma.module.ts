import { Module } from '@nestjs/common';

@Module({
  providers: [PrismaModule],
  exports: [PrismaModule],
})
export class PrismaModule {}
