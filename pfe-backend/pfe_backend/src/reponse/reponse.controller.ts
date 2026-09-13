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
import { ReponseService } from './reponse.service';
import { CreateReponseDto, UpdateReponseDto } from './dto/reponse.dto';

@ApiTags('reponses')
@UseGuards(AuthGuard, RoleGuard)
@ApiBearerAuth('access-token')
@Controller('reponses')
export class ReponseController {
  constructor(private readonly reponseService: ReponseService) {}

  @Get()
  findAll() {
    return this.reponseService.findAll();
  }

  @Get('question/:questionId')
  findByQuestion(@Param('questionId', ParseIntPipe) questionId: number) {
    return this.reponseService.findByQuestion(questionId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.reponseService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateReponseDto, @Request() req: AuthenticatedRequest) {
    const requester = requesterFrom(req);
    return this.reponseService.create(dto, requester.id, requester.role);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReponseDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.reponseService.update(id, dto, requester.id, requester.role);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.reponseService.remove(id, requester.id, requester.role);
  }
}
