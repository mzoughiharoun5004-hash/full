import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { CourseTeamRole, SharePermission } from '../scenario-share.entity';
import type { ScenarioCommentTarget } from '../scenario-comment.entity';
import type { ScenarioProposalTarget } from '../scenario-change-proposal.entity';

const SHARE_PERMISSIONS = ['view', 'edit'] as const;
const TEAM_ROLES = ['co_author', 'reviewer'] as const;
const COLLABORATION_TARGETS = ['course', 'lesson', 'module'] as const;

export class CreateScenarioShareDto {
  @ApiProperty({ example: 1, description: 'ID du scenario a partager' })
  @IsNumber()
  scenarioId: number;

  @ApiPropertyOptional({
    example: 2,
    description: "ID de l'enseignant destinataire",
  })
  @IsNumber()
  @IsOptional()
  sharedWithId?: number;

  @ApiPropertyOptional({
    example: 'educator@example.com',
    description: 'Email du collaborateur',
  })
  @IsEmail()
  @IsString()
  @IsOptional()
  collaboratorEmail?: string;

  @ApiPropertyOptional({
    enum: ['view', 'edit'],
    default: 'view',
    description: 'Permission accordee',
  })
  @IsIn(SHARE_PERMISSIONS)
  @IsOptional()
  permission?: SharePermission;

  @ApiPropertyOptional({
    enum: ['co_author', 'reviewer'],
    default: 'reviewer',
    description: 'Role collaboratif dans le cours',
  })
  @IsIn(TEAM_ROLES)
  @IsOptional()
  role?: CourseTeamRole;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  canEditStructure?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  canEditContent?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  canPublish?: boolean;
}

export class UpdateScenarioShareDto {
  @ApiPropertyOptional({ enum: ['view', 'edit'] })
  @IsIn(SHARE_PERMISSIONS)
  @IsOptional()
  permission?: SharePermission;

  @ApiPropertyOptional({ enum: ['co_author', 'reviewer'] })
  @IsIn(TEAM_ROLES)
  @IsOptional()
  role?: CourseTeamRole;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  canEditStructure?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  canEditContent?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  canPublish?: boolean;
}

export class CreateScenarioCommentDto {
  @ApiProperty({ enum: ['course', 'lesson', 'module'] })
  @IsIn(COLLABORATION_TARGETS)
  targetType: ScenarioCommentTarget;

  @ApiPropertyOptional({ example: 'lesson-123' })
  @IsString()
  @IsOptional()
  targetId?: string;

  @ApiProperty({ example: 'Clarifier cette consigne.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;

  @ApiPropertyOptional({ type: [Number] })
  @IsArray()
  @IsOptional()
  mentions?: number[];
}

export class UpdateScenarioCommentDto {
  @ApiPropertyOptional({ example: 'Commentaire mis a jour.' })
  @IsString()
  @IsOptional()
  @MaxLength(4000)
  body?: string;

  @ApiPropertyOptional({ type: [Number] })
  @IsArray()
  @IsOptional()
  mentions?: number[];
}

export class CreateScenarioProposalDto {
  @ApiProperty({ enum: ['course', 'lesson', 'module'] })
  @IsIn(COLLABORATION_TARGETS)
  targetType: ScenarioProposalTarget;

  @ApiPropertyOptional({ example: 'lesson-123' })
  @IsString()
  @IsOptional()
  targetId?: string;

  @ApiProperty({ example: 'Simplifier le texte de la lecon 2' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  summary: string;

  @ApiPropertyOptional({
    description: 'Patch libre, compare cote frontend ou document revise.',
  })
  @IsObject()
  @IsOptional()
  patch?: Record<string, unknown>;
}

export class ReviewScenarioProposalDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsIn(['approved', 'rejected'])
  status: 'approved' | 'rejected';

  @ApiPropertyOptional({ example: 'Changements acceptes.' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  decisionNote?: string;
}
