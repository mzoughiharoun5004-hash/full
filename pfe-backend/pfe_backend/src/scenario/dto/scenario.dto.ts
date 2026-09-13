import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { StatutScenario } from 'src/common/enums';
import type { CourseDocument } from '../course-document.types';
import type { ScenarioDocument } from '../scenario-document.types';

export class CreateScenarioDto {
  @ApiProperty({ example: 'Introduction à TypeScript' })
  @IsString()
  @IsNotEmpty()
  titre: string;

  @ApiPropertyOptional({ example: 'Un scénario pour apprendre TypeScript.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'Maîtriser les bases de TypeScript.' })
  @IsString()
  @IsOptional()
  objectif?: string;

  @ApiPropertyOptional({ example: 'débutant' })
  @IsString()
  @IsOptional()
  niveau?: string;

  @ApiPropertyOptional({ example: 120 })
  @IsNumber()
  @IsOptional()
  dureeScenario?: number;

  @ApiPropertyOptional({
    enum: StatutScenario,
    default: StatutScenario.BROUILLON,
  })
  @IsEnum(StatutScenario)
  @IsOptional()
  statut?: StatutScenario;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  courseDocument?: CourseDocument;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  scenarioDocument?: ScenarioDocument;
}

export class UpdateScenarioDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  titre?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  objectif?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  niveau?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  dureeScenario?: number;

  @ApiPropertyOptional({ enum: StatutScenario })
  @IsEnum(StatutScenario)
  @IsOptional()
  statut?: StatutScenario;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  courseDocument?: CourseDocument;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  scenarioDocument?: ScenarioDocument;
}

export class RejectScenarioDto {
  @ApiPropertyOptional({
    example: 'Please clarify the course objectives before resubmitting.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(4000)
  comment?: string;
}
