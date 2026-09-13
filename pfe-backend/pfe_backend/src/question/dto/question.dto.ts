import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { TypeQuestion } from 'src/common/enums';

export class CreateQuestionDto {
  @ApiProperty({ example: 'Quel est le type de base pour les chaînes ?' })
  @IsString()
  @IsNotEmpty()
  titre: string;

  @ApiProperty({ enum: TypeQuestion, example: TypeQuestion.QCM })
  @IsEnum(TypeQuestion)
  type: TypeQuestion;

  @ApiPropertyOptional({ example: 'Choisissez la bonne réponse.' })
  @IsString()
  @IsOptional()
  texte?: string;

  @ApiPropertyOptional({ example: 2.0 })
  @IsNumber()
  @IsOptional()
  points?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  ordre?: number;

  @ApiProperty({ example: 1, description: 'ID du quiz parent' })
  @IsNumber()
  quizId: number;
}

export class UpdateQuestionDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  titre?: string;

  @ApiPropertyOptional({ enum: TypeQuestion })
  @IsEnum(TypeQuestion)
  @IsOptional()
  type?: TypeQuestion;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  texte?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  points?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  ordre?: number;
}
