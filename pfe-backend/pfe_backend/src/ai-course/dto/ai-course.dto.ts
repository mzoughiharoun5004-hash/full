import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { CourseDocument } from 'src/scenario/course-document.types';
import type { AiCourseOutline, AiScope } from '../ai-course.types';

export class AiCourseBriefDto {
  @IsString()
  @MaxLength(500)
  topic!: string;

  @IsString()
  @MaxLength(160)
  audience!: string;

  @IsString()
  @MaxLength(64)
  language!: string;

  @IsString()
  @MaxLength(80)
  difficulty!: string;

  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  objectives!: string[];

  @IsInt()
  @Min(5)
  @Max(480)
  estimatedMinutes!: number;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  tone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(24_000)
  sourceMaterial?: string;
}

export class CreateAiCourseDto extends AiCourseBriefDto {
  @IsObject()
  @IsOptional()
  outline?: AiCourseOutline;
}

export class AiScopeDto {
  @IsIn(['course', 'lesson', 'block'])
  type!: AiScope['type'];

  @ValidateIf(
    (value: AiScopeDto) => value.type === 'lesson' || value.type === 'block',
  )
  @IsString()
  @MaxLength(120)
  lessonId?: string;

  @ValidateIf((value: AiScopeDto) => value.type === 'block')
  @IsString()
  @MaxLength(120)
  blockId?: string;
}

export class ProposeAiEditDto {
  @IsString()
  @MaxLength(2_000)
  instruction!: string;

  @Type(() => AiScopeDto)
  @IsObject()
  @ValidateNested()
  scope!: AiScopeDto;

  @IsObject()
  courseDocument!: CourseDocument;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
