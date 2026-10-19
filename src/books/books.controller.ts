import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiAcceptedResponse,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import type { JwtPayload } from '../auth/types/jwt.type.js';
import {
  BookDetailResponseDto,
  BooksListResponseDto,
  ChapterAudioResponseDto,
  ChapterAudioAccessResponseDto,
  CompleteBookUploadResponseDto,
  CreateBookUploadResponseDto,
  QueueChapterAudioResponseDto,
} from './contracts/books.openapi.js';
import type {
  BookDetailResponse,
  BooksListResponse,
  ChapterAudioResponse,
  ChapterAudioAccessResponse,
  CompleteBookUploadResponse,
  CreateBookUploadResponse,
  QueueChapterAudioResponse,
} from './contracts/books.response.js';
import { BookIdParamsDto } from './dto/book-id-params.dto.js';
import { BooksListQueryDto } from './dto/books-list-query.dto.js';
import { ChapterAudioParamsDto } from './dto/chapter-audio-params.dto.js';
import { CreateBookUploadDto } from './dto/create-book-upload.dto.js';
import { BooksService } from './books.service.js';

type RequestWithUser = Request & {
  user: JwtPayload;
};

@ApiTags('books')
@ApiBearerAuth()
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post('uploads')
  @ApiOperation({ summary: 'Create an EPUB upload intent' })
  @ApiBody({ type: CreateBookUploadDto })
  @ApiCreatedResponse({ type: CreateBookUploadResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid EPUB upload metadata' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @UseGuards(JwtAccessGuard)
  createUpload(
    @Req() request: RequestWithUser,
    @Body() dto: CreateBookUploadDto,
  ): Promise<CreateBookUploadResponse> {
    return this.booksService.createUpload(request.user.sub, dto);
  }

  @Post(':bookId/upload-complete')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Confirm an EPUB upload and queue parsing' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiAcceptedResponse({ type: CompleteBookUploadResponseDto })
  @ApiBadRequestResponse({
    description: 'bookId is invalid or the uploaded EPUB does not match',
  })
  @ApiConflictResponse({
    description: 'Book is not awaiting upload confirmation',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book not found' })
  @UseGuards(JwtAccessGuard)
  completeUpload(
    @Param() params: BookIdParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<CompleteBookUploadResponse> {
    return this.booksService.completeUpload(request.user.sub, params.bookId);
  }

  @Post(':bookId/chapters/:chapterId/audio')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue or resume one chapter audio generation' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiParam({ name: 'chapterId', format: 'uuid' })
  @ApiAcceptedResponse({ type: QueueChapterAudioResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or chapter not found' })
  @UseGuards(JwtAccessGuard)
  queueChapterAudio(
    @Param() params: ChapterAudioParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<QueueChapterAudioResponse> {
    return this.booksService.queueChapterAudio(
      request.user.sub,
      params.bookId,
      params.chapterId,
    );
  }

  @Post(':bookId/chapters/:chapterId/audio/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel queued or processing chapter audio generation',
  })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiParam({ name: 'chapterId', format: 'uuid' })
  @ApiOkResponse({ type: ChapterAudioResponseDto })
  @ApiConflictResponse({
    description: 'Chapter audio is not being generated or is already ready',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or chapter not found' })
  @UseGuards(JwtAccessGuard)
  cancelChapterAudio(
    @Param() params: ChapterAudioParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<ChapterAudioResponse> {
    return this.booksService.cancelChapterAudio(
      request.user.sub,
      params.bookId,
      params.chapterId,
    );
  }

  @Delete(':bookId/chapters/:chapterId/audio')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete generated or in-progress chapter audio and its files',
  })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiParam({ name: 'chapterId', format: 'uuid' })
  @ApiNoContentResponse({
    description: 'Chapter audio and temporary files were removed',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or chapter not found' })
  @UseGuards(JwtAccessGuard)
  async deleteChapterAudio(
    @Param() params: ChapterAudioParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<void> {
    await this.booksService.deleteChapterAudio(
      request.user.sub,
      params.bookId,
      params.chapterId,
    );
  }

  @Get(':bookId/chapters/:chapterId/audio')
  @ApiOperation({
    summary: 'Get signed playback and download URLs for chapter audio',
  })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiParam({ name: 'chapterId', format: 'uuid' })
  @ApiOkResponse({ type: ChapterAudioAccessResponseDto })
  @ApiConflictResponse({ description: 'Chapter audio is not ready' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or chapter not found' })
  @UseGuards(JwtAccessGuard)
  getChapterAudioAccess(
    @Param() params: ChapterAudioParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<ChapterAudioAccessResponse> {
    return this.booksService.getChapterAudioAccess(
      request.user.sub,
      params.bookId,
      params.chapterId,
    );
  }

  @Get()
  @ApiOperation({ summary: "List the authenticated user's books" })
  @ApiQuery({ name: 'limit', required: false, minimum: 1, maximum: 50 })
  @ApiQuery({ name: 'offset', required: false, minimum: 0 })
  @ApiOkResponse({ type: BooksListResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @UseGuards(JwtAccessGuard)
  listBooks(
    @Req() request: RequestWithUser,
    @Query() query: BooksListQueryDto,
  ): Promise<BooksListResponse> {
    return this.booksService.listBooks(request.user.sub, query);
  }

  @Get(':bookId')
  @ApiOperation({ summary: "Get one of the authenticated user's books" })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiOkResponse({ type: BookDetailResponseDto })
  @ApiBadRequestResponse({ description: 'bookId must be a UUID' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book not found' })
  @UseGuards(JwtAccessGuard)
  getBook(
    @Param() params: BookIdParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<BookDetailResponse> {
    return this.booksService.getBook(request.user.sub, params.bookId);
  }
}
