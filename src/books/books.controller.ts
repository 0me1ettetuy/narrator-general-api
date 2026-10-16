import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
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
} from './contracts/books.openapi.js';
import type {
  BookDetailResponse,
  BooksListResponse,
} from './contracts/books.response.js';
import { BookIdParamsDto } from './dto/book-id-params.dto.js';
import { BooksListQueryDto } from './dto/books-list-query.dto.js';
import { BooksService } from './books.service.js';

type RequestWithUser = Request & {
  user: JwtPayload;
};

@ApiTags('books')
@ApiBearerAuth()
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

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
