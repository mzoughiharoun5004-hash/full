import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateReponseDto {
  @ApiProperty({ example: 'string' })
  @IsString()
  @IsNotEmpty()
  texte: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  estCorrect: boolean;

  @ApiPropertyOptional({
    example: 'En TypeScript, string est le type primitif.',
  })
  @IsString()
  @IsOptional()
  feedback?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  ordre?: number;

  @ApiProperty({ example: 1, description: 'ID de la question parente' })
  @IsNumber()
  questionId: number;
}

export class UpdateReponseDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  texte?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  estCorrect?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  feedback?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  ordre?: number;
}
