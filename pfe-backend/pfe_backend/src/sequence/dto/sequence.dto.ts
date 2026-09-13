import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateSequenceDto {
  @ApiProperty({ example: 'Séquence 1 – Variables et Types' })
  @IsString()
  @IsNotEmpty()
  titre: string;

  @ApiPropertyOptional({ example: 'Contenu textuel de la séquence.' })
  @IsString()
  @IsOptional()
  texte?: string;

  @ApiPropertyOptional({ example: 'Description de la séquence.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsNumber()
  @IsOptional()
  duree?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  ordre?: number;

  @ApiProperty({ example: 1, description: 'ID du module parent' })
  @IsNumber()
  moduleId: number;
}

export class UpdateSequenceDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  titre?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  texte?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  duree?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  ordre?: number;
}
