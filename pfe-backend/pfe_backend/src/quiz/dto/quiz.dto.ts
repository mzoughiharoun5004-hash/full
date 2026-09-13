import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateQuizDto {
  @ApiProperty({ example: 'Quiz – Les fondamentaux TypeScript' })
  @IsString()
  @IsNotEmpty()
  titre: string;

  @ApiPropertyOptional({ example: 'Testez vos connaissances.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsNumber()
  @IsOptional()
  tentatives?: number;

  @ApiPropertyOptional({ example: 60.0 })
  @IsNumber()
  @IsOptional()
  scorePourReussir?: number;

  @ApiProperty({ example: 1, description: "ID de l'activité associée" })
  @IsNumber()
  activiteId: number;
}

export class UpdateQuizDto {
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
  tentatives?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  scorePourReussir?: number;
}
