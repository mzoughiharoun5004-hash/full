import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { TypeActivite } from 'src/common/enums';

export class CreateActiviteDto {
  @ApiProperty({ example: 'Activité QCM – Les types primitifs' })
  @IsString()
  @IsNotEmpty()
  titre: string;

  @ApiProperty({ enum: TypeActivite, example: TypeActivite.QCM })
  @IsEnum(TypeActivite)
  type: TypeActivite;

  @ApiPropertyOptional({ example: 'Répondez aux questions suivantes.' })
  @IsString()
  @IsOptional()
  consigne?: string;

  @ApiPropertyOptional({ example: 'const x: number = 5;' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  ordre?: number;

  @ApiProperty({ example: 1, description: 'ID de la séquence parent' })
  @IsNumber()
  sequenceId: number;
}

export class UpdateActiviteDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  titre?: string;

  @ApiPropertyOptional({ enum: TypeActivite })
  @IsEnum(TypeActivite)
  @IsOptional()
  type?: TypeActivite;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  consigne?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  ordre?: number;
}
