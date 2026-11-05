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
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import type { JwtPayload } from '../auth/types/jwt.type.js';
import {
  CollectionDetailResponseDto,
  CollectionSummaryResponseDto,
  CollectionsListResponseDto,
  MyCollectionsListResponseDto,
} from './contracts/collections.openapi.js';
import type {
  CollectionDetailResponse,
  CollectionSummary,
  CollectionsListResponse,
  MyCollectionsListResponse,
} from './contracts/collections.response.js';
import { CollectionBookParamsDto } from './dto/collection-book-params.dto.js';
import { CollectionIdParamsDto } from './dto/collection-id-params.dto.js';
import { AddCollectionBookDto } from './dto/add-collection-book.dto.js';
import { CreateCollectionDto } from './dto/create-collection.dto.js';
import {
  CollectionsListQueryDto,
  PublicCollectionsListQueryDto,
} from './dto/collections-list-query.dto.js';
import { ReorderCollectionBooksDto } from './dto/reorder-collection-books.dto.js';
import { UpdateCollectionDto } from './dto/update-collection.dto.js';
import { UpdateCollectionVisibilityDto } from './dto/update-collection-visibility.dto.js';
import { CollectionsService } from './collections.service.js';

type RequestWithUser = Request & {
  user: JwtPayload;
};

@ApiTags('collections')
@ApiBearerAuth()
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a private collection' })
  @ApiBody({ type: CreateCollectionDto })
  @ApiCreatedResponse({ type: CollectionSummaryResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid collection fields' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @UseGuards(JwtAccessGuard)
  createCollection(
    @Req() request: RequestWithUser,
    @Body() dto: CreateCollectionDto,
  ): Promise<CollectionSummary> {
    return this.collectionsService.createCollection(request.user.sub, dto);
  }

  @Get()
  @ApiOperation({
    summary: "List the authenticated user's own and saved collections",
  })
  @ApiQuery({ name: 'limit', required: false, minimum: 1, maximum: 50 })
  @ApiQuery({ name: 'offset', required: false, minimum: 0 })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: ['owned', 'added', 'all'],
    description: 'Default "all" — owned collections plus saved ones',
  })
  @ApiQuery({
    name: 'bookId',
    required: false,
    format: 'uuid',
    description: 'Sets containsBook on each returned collection',
  })
  @ApiOkResponse({ type: MyCollectionsListResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @UseGuards(JwtAccessGuard)
  listCollections(
    @Req() request: RequestWithUser,
    @Query() query: CollectionsListQueryDto,
  ): Promise<MyCollectionsListResponse> {
    return this.collectionsService.listCollections(request.user.sub, query);
  }

  // Registered before ':collectionId' so "public" is never matched as an id.
  @Get('public')
  @ApiOperation({ summary: 'List public collections that have public books' })
  @ApiQuery({ name: 'limit', required: false, minimum: 1, maximum: 50 })
  @ApiQuery({ name: 'offset', required: false, minimum: 0 })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Case-insensitive title substring match',
  })
  @ApiOkResponse({ type: CollectionsListResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @UseGuards(JwtAccessGuard)
  listPublicCollections(
    @Req() request: RequestWithUser,
    @Query() query: PublicCollectionsListQueryDto,
  ): Promise<CollectionsListResponse> {
    return this.collectionsService.listPublicCollections(
      request.user.sub,
      query,
    );
  }

  @Get(':collectionId')
  @ApiOperation({
    summary:
      'Get a collection with its books. Owners also see ghosts for books made private',
  })
  @ApiParam({ name: 'collectionId', format: 'uuid' })
  @ApiOkResponse({ type: CollectionDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Collection not found or not readable' })
  @UseGuards(JwtAccessGuard)
  getCollection(
    @Param() params: CollectionIdParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<CollectionDetailResponse> {
    return this.collectionsService.getCollection(
      request.user.sub,
      params.collectionId,
    );
  }

  @Patch(':collectionId')
  @ApiOperation({ summary: 'Rename a collection or change its description' })
  @ApiParam({ name: 'collectionId', format: 'uuid' })
  @ApiBody({ type: UpdateCollectionDto })
  @ApiOkResponse({ type: CollectionSummaryResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid collection fields' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  @UseGuards(JwtAccessGuard)
  updateCollection(
    @Param() params: CollectionIdParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: UpdateCollectionDto,
  ): Promise<CollectionSummary> {
    return this.collectionsService.updateCollection(
      request.user.sub,
      params.collectionId,
      dto,
    );
  }

  @Patch(':collectionId/visibility')
  @ApiOperation({
    summary:
      "Change collection visibility. Going public publishes the owner's private books in it",
  })
  @ApiParam({ name: 'collectionId', format: 'uuid' })
  @ApiBody({ type: UpdateCollectionVisibilityDto })
  @ApiOkResponse({ type: CollectionSummaryResponseDto })
  @ApiConflictResponse({
    description: 'A book in the collection is not fully parsed yet',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  @UseGuards(JwtAccessGuard)
  updateVisibility(
    @Param() params: CollectionIdParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: UpdateCollectionVisibilityDto,
  ): Promise<CollectionSummary> {
    return this.collectionsService.updateVisibility(
      request.user.sub,
      params.collectionId,
      dto,
    );
  }

  @Delete(':collectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a collection and its references. Books are never deleted',
  })
  @ApiParam({ name: 'collectionId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'The collection was deleted' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  @UseGuards(JwtAccessGuard)
  deleteCollection(
    @Param() params: CollectionIdParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<void> {
    return this.collectionsService.deleteCollection(
      request.user.sub,
      params.collectionId,
    );
  }

  @Post(':collectionId/books')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Add a book to a collection. A private book needs makePublic for a public collection',
  })
  @ApiParam({ name: 'collectionId', format: 'uuid' })
  @ApiBody({ type: AddCollectionBookDto })
  @ApiNoContentResponse({
    description: 'The book was added or already present',
  })
  @ApiConflictResponse({
    description:
      'Collection is full, the book needs confirmation to go public, or it is not fully parsed',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Collection or book not found' })
  @UseGuards(JwtAccessGuard)
  addBook(
    @Param() params: CollectionIdParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: AddCollectionBookDto,
  ): Promise<void> {
    return this.collectionsService.addBook(
      request.user.sub,
      params.collectionId,
      dto,
    );
  }

  @Put(':collectionId/books/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set the order of every book in a collection, including ghosts',
  })
  @ApiParam({ name: 'collectionId', format: 'uuid' })
  @ApiBody({ type: ReorderCollectionBooksDto })
  @ApiNoContentResponse({ description: 'The order was saved' })
  @ApiBadRequestResponse({
    description: 'The list must include every book in the collection once',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  @UseGuards(JwtAccessGuard)
  reorderBooks(
    @Param() params: CollectionIdParamsDto,
    @Req() request: RequestWithUser,
    @Body() dto: ReorderCollectionBooksDto,
  ): Promise<void> {
    return this.collectionsService.reorderBooks(
      request.user.sub,
      params.collectionId,
      dto,
    );
  }

  @Delete(':collectionId/books/:bookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Remove a book reference from a collection. The book is not deleted',
  })
  @ApiParam({ name: 'collectionId', format: 'uuid' })
  @ApiParam({ name: 'bookId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'The reference was removed' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  @UseGuards(JwtAccessGuard)
  removeBook(
    @Param() params: CollectionBookParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<void> {
    return this.collectionsService.removeBook(
      request.user.sub,
      params.collectionId,
      params.bookId,
    );
  }

  @Post(':collectionId/library')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Save a public collection to your library' })
  @ApiParam({ name: 'collectionId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'The collection is saved' })
  @ApiConflictResponse({ description: 'You already own this collection' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Collection not found' })
  @UseGuards(JwtAccessGuard)
  addToLibrary(
    @Param() params: CollectionIdParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<void> {
    return this.collectionsService.addToLibrary(
      request.user.sub,
      params.collectionId,
    );
  }

  @Delete(':collectionId/library')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a collection from your library, including a ghost',
  })
  @ApiParam({ name: 'collectionId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'The saved entry was removed' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @UseGuards(JwtAccessGuard)
  removeFromLibrary(
    @Param() params: CollectionIdParamsDto,
    @Req() request: RequestWithUser,
  ): Promise<void> {
    return this.collectionsService.removeFromLibrary(
      request.user.sub,
      params.collectionId,
    );
  }
}
