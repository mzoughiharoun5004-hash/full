import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  requesterFrom,
  type AuthenticatedRequest,
} from 'src/auth/authenticated-request';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { RoleGuard } from 'src/role/role.guard';
import { ScenarioShareService } from './scenario-share.service';
import {
  CreateScenarioCommentDto,
  CreateScenarioProposalDto,
  CreateScenarioShareDto,
  ReviewScenarioProposalDto,
  UpdateScenarioCommentDto,
  UpdateScenarioShareDto,
} from './dto/scenario-share.dto';

@ApiTags('scenario-shares')
@UseGuards(AuthGuard, RoleGuard)
@ApiBearerAuth('access-token')
@Controller('scenario-shares')
export class ScenarioShareController {
  constructor(private readonly shareService: ScenarioShareService) {}

  @Get('my')
  @ApiOperation({ summary: 'Scenarios partages avec moi' })
  sharedWithMe(@Request() req: AuthenticatedRequest) {
    const requester = requesterFrom(req);
    return this.shareService.findByUser(requester.id);
  }

  @Get('scenario/:scenarioId')
  @ApiOperation({ summary: "Lister les partages d'un scenario" })
  findByScenario(
    @Param('scenarioId', ParseIntPipe) scenarioId: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.shareService.findByScenario(
      scenarioId,
      requester.id,
      requester.role,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Partager un scenario avec un collaborateur' })
  share(
    @Body() dto: CreateScenarioShareDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.shareService.share(dto, requester.id, requester.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Modifier les droits d'un partage" })
  updatePermission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScenarioShareDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.shareService.updatePermission(
      id,
      dto,
      requester.id,
      requester.role,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoquer un partage' })
  revoke(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.shareService.revoke(id, requester.id, requester.role);
  }

  @Get('scenario/:scenarioId/comments')
  @ApiOperation({ summary: "Commentaires d'un scenario" })
  listComments(
    @Param('scenarioId', ParseIntPipe) scenarioId: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.shareService.listComments(
      scenarioId,
      requester.id,
      requester.role,
    );
  }

  @Post('scenario/:scenarioId/comments')
  @ApiOperation({ summary: 'Ajouter un commentaire de collaboration' })
  createComment(
    @Param('scenarioId', ParseIntPipe) scenarioId: number,
    @Body() dto: CreateScenarioCommentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.shareService.createComment(
      scenarioId,
      dto,
      requester.id,
      requester.role,
    );
  }

  @Put('comments/:id')
  @ApiOperation({ summary: 'Modifier un commentaire' })
  updateComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScenarioCommentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.shareService.updateComment(
      id,
      dto,
      requester.id,
      requester.role,
    );
  }

  @Patch('comments/:id/resolve')
  @ApiOperation({ summary: 'Resoudre un commentaire' })
  resolveComment(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.shareService.resolveComment(id, requester.id, requester.role);
  }

  @Get('scenario/:scenarioId/activity')
  @ApiOperation({ summary: "Journal d'activite d'un scenario" })
  listActivity(
    @Param('scenarioId', ParseIntPipe) scenarioId: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.shareService.listActivity(
      scenarioId,
      requester.id,
      requester.role,
    );
  }

  @Get('scenario/:scenarioId/proposals')
  @ApiOperation({ summary: "Propositions de changements d'un scenario" })
  listProposals(
    @Param('scenarioId', ParseIntPipe) scenarioId: number,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.shareService.listProposals(
      scenarioId,
      requester.id,
      requester.role,
    );
  }

  @Post('scenario/:scenarioId/proposals')
  @ApiOperation({ summary: 'Proposer des changements' })
  createProposal(
    @Param('scenarioId', ParseIntPipe) scenarioId: number,
    @Body() dto: CreateScenarioProposalDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.shareService.createProposal(
      scenarioId,
      dto,
      requester.id,
      requester.role,
    );
  }

  @Patch('proposals/:id/review')
  @ApiOperation({ summary: 'Approuver ou rejeter une proposition' })
  reviewProposal(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewScenarioProposalDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const requester = requesterFrom(req);
    return this.shareService.reviewProposal(
      id,
      dto,
      requester.id,
      requester.role,
    );
  }
}
