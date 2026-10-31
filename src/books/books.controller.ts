import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Put,
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
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import type { JwtPayload } from '../auth/types/jwt.type.js';
import {
  BatchChapterAudioResponseDto,
  BookCoverAccessResponseDto,
  BookDetailResponseDto,
  BooksListResponseDto,
  ChapterAudioResponseDto,
  ChapterDetailResponseDto,
  ChapterMergeResponseDto,
  RemovedChaptersResponseDto,
  ChapterSelectionResponseDto,
  ChapterAudioAccessResponseDto,
  CompleteBookUploadResponseDto,
  CreateBookCoverUploadResponseDto,
  CreateBookUploadResponseDto,
  QueueChapterAudioResponseDto,
} from './contracts/books.openapi.js';
import type {
  BatchChapterAudioResponse,
  BookCoverAccessResponse,
  BookDetailResponse,
  BooksListResponse,
  ChapterAudioResponse,
  ChapterDetailResponse,
  ChapterMergeResponse,
  RemovedChaptersResponse,
  ChapterSelectionResponse,
  ChapterAudioAccessResponse,
  CompleteBookUploadResponse,
  CreateBookCoverUploadResponse,
  CreateBookUploadResponse,
  QueueChapterAudioResponse,
} from './contracts/books.response.js';
import { BatchChapterAudioDto } from './dto/batch-chapter-audio.dto.js';
import { BookIdParamsDto } from './dto/book-id-params.dto.js';
import { BooksListQueryDto } from './dto/books-list-query.dto.js';
import { ChapterAudioParamsDto } from './dto/chapter-audio-params.dto.js';
import { CreateBookUploadDto } from './dto/create-book-upload.dto.js';
import { CreateBookCoverUploadDto } from './dto/create-book-cover-upload.dto.js';
import { QueueChapterAudioDto } from './dto/queue-chapter-audio.dto.js';
import {
  CreateChapterDto,
  MergeChaptersDto,
  RemoveChapterDto,
  UpdateChapterDto,
  UpdateChapterOrderDto,
  UpdateChapterSelectionDto,
} from './dto/chapter-curation.dto.js';
import { ChapterCurationService } from './chapter-curation.service.js';
import { BooksService } from './books.service.js';

type RequestWithUser = Request & {
  user: JwtPayload;
};

@ApiTags('books')
@ApiBearerAuth()
@Controller('books')
export class BooksController {
  constructor(
    private readonly booksService: BooksService,
    private readonly chapterCurationService: ChapterCurationService,
  ) {}

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

  @Post(':bookId/cover/upload')
  @ApiOperation({
    summary: 'Create a signed upload URL to replace a book cover',
  })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiBody({ type: CreateBookCoverUploadDto })
  @ApiCreatedResponse({ type: CreateBookCoverUploadResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid cover image metadata' })
  @ApiConflictResponse({ description: 'Book is not ready for a cover update' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book not found' })
  @UseGuards(JwtAccessGuard)
  createBookCoverUpload(
    @Param() params: BookIdParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: CreateBookCoverUploadDto,
  ): Promise<CreateBookCoverUploadResponse> {
    return this.booksService.createBookCoverUpload(
      request.user.sub,
      params.bookId,
      dto,
    );
  }

  @Post(':bookId/cover/upload-complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirm a replaced book cover upload' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiBody({ type: CreateBookCoverUploadDto })
  @ApiNoContentResponse({ description: 'Book cover was replaced' })
  @ApiBadRequestResponse({
    description: 'Uploaded cover does not match its metadata',
  })
  @ApiConflictResponse({ description: 'Book is not ready for a cover update' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book not found' })
  @UseGuards(JwtAccessGuard)
  async completeBookCoverUpload(
    @Param() params: BookIdParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: CreateBookCoverUploadDto,
  ): Promise<void> {
    await this.booksService.completeBookCoverUpload(
      request.user.sub,
      params.bookId,
      dto,
    );
  }

  @Post(':bookId/chapters/:chapterId/audio')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue or resume one chapter audio generation' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiParam({ name: 'chapterId', format: 'uuid' })
  @ApiBody({ type: QueueChapterAudioDto, required: false })
  @ApiAcceptedResponse({ type: QueueChapterAudioResponseDto })
  @ApiConflictResponse({
    description:
      'The requested model is unavailable or this audio uses another model',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or chapter not found' })
  @UseGuards(JwtAccessGuard)
  queueChapterAudio(
    @Param() params: ChapterAudioParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: QueueChapterAudioDto,
  ): Promise<QueueChapterAudioResponse> {
    return this.booksService.queueChapterAudio(
      request.user.sub,
      params.bookId,
      params.chapterId,
      dto?.modelId ?? null,
    );
  }

  @Post(':bookId/audio')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue or resume audio for selected chapters' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiBody({ type: BatchChapterAudioDto })
  @ApiAcceptedResponse({ type: BatchChapterAudioResponseDto })
  @ApiBadRequestResponse({ description: 'chapterIds must be unique UUIDs' })
  @ApiConflictResponse({
    description:
      'The selected model is unavailable or a chapter uses another model',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or selected chapter not found' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseGuards(JwtAccessGuard)
  queueSelectedChapterAudio(
    @Param() params: BookIdParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: BatchChapterAudioDto,
  ): Promise<BatchChapterAudioResponse> {
    return this.booksService.queueSelectedChapterAudio(
      request.user.sub,
      params.bookId,
      dto.chapterIds,
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

  @Post(':bookId/audio/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop audio generation for selected chapters' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiBody({ type: BatchChapterAudioDto })
  @ApiOkResponse({ type: BatchChapterAudioResponseDto })
  @ApiBadRequestResponse({ description: 'chapterIds must be unique UUIDs' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or selected chapter not found' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseGuards(JwtAccessGuard)
  cancelSelectedChapterAudio(
    @Param() params: BookIdParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: BatchChapterAudioDto,
  ): Promise<BatchChapterAudioResponse> {
    return this.booksService.cancelSelectedChapterAudio(
      request.user.sub,
      params.bookId,
      dto.chapterIds,
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

  @Post(':bookId/chapters')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a user-created chapter to a book outline' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiBody({ type: CreateChapterDto })
  @ApiCreatedResponse({ type: ChapterDetailResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid chapter content' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or insertion chapter not found' })
  @UseGuards(JwtAccessGuard)
  createChapter(
    @Param() params: BookIdParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: CreateChapterDto,
  ): Promise<ChapterDetailResponse> {
    return this.chapterCurationService.createChapter(
      request.user.sub,
      params.bookId,
      dto,
    );
  }

  @Patch(':bookId/chapters/selection')
  @ApiOperation({
    summary: 'Set role or default narration inclusion for selected chapters',
  })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiBody({ type: UpdateChapterSelectionDto })
  @ApiOkResponse({ type: ChapterSelectionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid chapter selection change' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or selected chapter not found' })
  @UseGuards(JwtAccessGuard)
  updateChapterSelection(
    @Param() params: BookIdParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: UpdateChapterSelectionDto,
  ): Promise<ChapterSelectionResponse> {
    return this.chapterCurationService.updateSelection(
      request.user.sub,
      params.bookId,
      dto,
    );
  }

  @Post(':bookId/chapters/merge')
  @ApiOperation({ summary: 'Merge adjacent chapters into one chapter' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiBody({ type: MergeChaptersDto })
  @ApiOkResponse({ type: ChapterMergeResponseDto })
  @ApiBadRequestResponse({ description: 'Chapters must be adjacent' })
  @ApiConflictResponse({
    description: 'Audio must be stopped or deletion confirmed first',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or chapter not found' })
  @UseGuards(JwtAccessGuard)
  mergeChapters(
    @Param() params: BookIdParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: MergeChaptersDto,
  ): Promise<ChapterMergeResponse> {
    return this.chapterCurationService.mergeChapters(
      request.user.sub,
      params.bookId,
      dto,
    );
  }

  @Put(':bookId/chapters/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set the complete active chapter order' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiBody({ type: UpdateChapterOrderDto })
  @ApiNoContentResponse({ description: 'The active chapter order was saved' })
  @ApiBadRequestResponse({
    description: 'chapterIds must contain every active chapter once',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book not found' })
  @UseGuards(JwtAccessGuard)
  async reorderChapters(
    @Param() params: BookIdParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: UpdateChapterOrderDto,
  ): Promise<void> {
    await this.chapterCurationService.reorderChapters(
      request.user.sub,
      params.bookId,
      dto,
    );
  }

  @Get(':bookId/chapters/removed')
  @ApiOperation({
    summary: 'List individually removed chapters available to restore',
  })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiOkResponse({ type: RemovedChaptersResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book not found' })
  @UseGuards(JwtAccessGuard)
  listRemovedChapters(
    @Param() params: BookIdParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<RemovedChaptersResponse> {
    return this.chapterCurationService.listRemovedChapters(
      request.user.sub,
      params.bookId,
    );
  }

  @Get(':bookId/chapters/:chapterId')
  @ApiOperation({ summary: 'Get a chapter with its editable text' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiParam({ name: 'chapterId', format: 'uuid' })
  @ApiOkResponse({ type: ChapterDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or active chapter not found' })
  @UseGuards(JwtAccessGuard)
  getChapter(
    @Param() params: ChapterAudioParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<ChapterDetailResponse> {
    return this.chapterCurationService.getChapter(
      request.user.sub,
      params.bookId,
      params.chapterId,
    );
  }

  @Patch(':bookId/chapters/:chapterId')
  @ApiOperation({ summary: 'Edit one active chapter' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiParam({ name: 'chapterId', format: 'uuid' })
  @ApiBody({ type: UpdateChapterDto })
  @ApiOkResponse({ type: ChapterDetailResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid chapter change' })
  @ApiConflictResponse({
    description: 'Audio must be stopped or deletion confirmed first',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or active chapter not found' })
  @UseGuards(JwtAccessGuard)
  updateChapter(
    @Param() params: ChapterAudioParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: UpdateChapterDto,
  ): Promise<ChapterDetailResponse> {
    return this.chapterCurationService.updateChapter(
      request.user.sub,
      params.bookId,
      params.chapterId,
      dto,
    );
  }

  @Delete(':bookId/chapters/:chapterId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove one chapter from the active outline' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiParam({ name: 'chapterId', format: 'uuid' })
  @ApiBody({ type: RemoveChapterDto })
  @ApiNoContentResponse({ description: 'The chapter was removed' })
  @ApiConflictResponse({
    description: 'Audio must be stopped or deletion confirmed first',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or active chapter not found' })
  @UseGuards(JwtAccessGuard)
  async removeChapter(
    @Param() params: ChapterAudioParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: RemoveChapterDto,
  ): Promise<void> {
    await this.chapterCurationService.removeChapter(
      request.user.sub,
      params.bookId,
      params.chapterId,
      dto,
    );
  }

  @Post(':bookId/chapters/:chapterId/restore')
  @ApiOperation({ summary: 'Restore a removed non-merged chapter' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiParam({ name: 'chapterId', format: 'uuid' })
  @ApiOkResponse({ type: ChapterDetailResponseDto })
  @ApiConflictResponse({
    description: 'A merged chapter must be undone as a merge operation',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or removed chapter not found' })
  @UseGuards(JwtAccessGuard)
  restoreChapter(
    @Param() params: ChapterAudioParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<ChapterDetailResponse> {
    return this.chapterCurationService.restoreChapter(
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

  @Get(':bookId/cover')
  @ApiOperation({ summary: 'Get a signed URL for an EPUB cover image' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiOkResponse({ type: BookCoverAccessResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Book or book cover not found' })
  @UseGuards(JwtAccessGuard)
  getBookCoverAccess(
    @Param() params: BookIdParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<BookCoverAccessResponse> {
    return this.booksService.getBookCoverAccess(
      request.user.sub,
      params.bookId,
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
