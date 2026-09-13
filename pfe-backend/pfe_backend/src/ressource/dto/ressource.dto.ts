import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { TypeRessource } from 'src/common/enums';

export class CreateRessourceDto {
  @ApiProperty({ example: 'Introduction à TypeScript – Vidéo' })
  @IsString()
  @IsNotEmpty()
  titre: string;

  @ApiProperty({ enum: TypeRessource, example: TypeRessource.VIDEO })
  @IsEnum(TypeRessource)
  type: TypeRessource;

  @ApiPropertyOptional({ example: 'https://example.com/video.mp4' })
  @IsString()
  @IsOptional()
  url?: string;

  @ApiPropertyOptional({ example: 'Description de la ressource.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 1024 })
  @IsNumber()
  @IsOptional()
  taille?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'ID du scénario (optionnel)',
  })
  @IsNumber()
  @IsOptional()
  scenarioId?: number;

  @ApiPropertyOptional({ example: 1, description: 'ID du module (optionnel)' })
  @IsNumber()
  @IsOptional()
  moduleId?: number;
}

export class UpdateRessourceDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  titre?: string;

  @ApiPropertyOptional({ enum: TypeRessource })
  @IsEnum(TypeRessource)
  @IsOptional()
  type?: TypeRessource;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  url?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  taille?: number;
}
