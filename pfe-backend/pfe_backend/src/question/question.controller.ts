import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  requesterFrom,
  type AuthenticatedRequest,
} from 'src/auth/authenticated-request';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { RoleGuard } from 'src/role/role.guard';
import { QuestionService } from './question.service';
import { CreateQuestionDto, UpdateQuestionDto } from './dto/question.dto';

@ApiTags('questions')
@UseGuards(AuthGuard, RoleGuard)
@ApiBearerAuth('access-token')
@Controller('questions')
export class QuestionController {
  constructor(private readonly questionService: QuestionService) {}

  @Get()
  findAll() {
    return this.questionService.findAll();
  }

  @Get('quiz/:quizId')
  findByQuiz(@Param('quizId', ParseIntPipe) quizId: number) {
    return this.questionService.findByQuiz(quizId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.questionService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateQuestionDto, @Request() req: AuthenticatedRequest) {
    const requester = requesterFrom(req);
    return this.questionService.create(dto, requester.id, requester.role);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuestionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.questionService.update(id, dto, requester.id, requester.role);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.questionService.remove(id, requester.id, requester.role);
  }
}
