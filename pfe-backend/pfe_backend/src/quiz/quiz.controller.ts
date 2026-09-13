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
import { QuizService } from './quiz.service';
import { CreateQuizDto, UpdateQuizDto } from './dto/quiz.dto';

@ApiTags('quiz')
@UseGuards(AuthGuard, RoleGuard)
@ApiBearerAuth('access-token')
@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get()
  findAll() {
    return this.quizService.findAll();
  }

  @Get('activite/:activiteId')
  findByActivite(@Param('activiteId', ParseIntPipe) activiteId: number) {
    return this.quizService.findByActivite(activiteId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.quizService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateQuizDto, @Request() req: AuthenticatedRequest) {
    const requester = requesterFrom(req);
    return this.quizService.create(dto, requester.id, requester.role);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuizDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.quizService.update(id, dto, requester.id, requester.role);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.quizService.remove(id, requester.id, requester.role);
  }
}
