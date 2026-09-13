import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCourseModuleDto {
  @ApiProperty({ example: 'Module 1 – Fondamentaux' })
  @IsString()
  @IsNotEmpty()
  titre: string;

  @ApiPropertyOptional({ example: 'Introduction aux fondamentaux.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  ordre?: number;

  @ApiPropertyOptional({ example: 90 })
  @IsNumber()
  @IsOptional()
  duree?: number;

  @ApiProperty({ example: 1, description: 'ID du scénario parent' })
  @IsNumber()
  scenarioId: number;
}

export class UpdateCourseModuleDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  titre?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  ordre?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  duree?: number;
}
