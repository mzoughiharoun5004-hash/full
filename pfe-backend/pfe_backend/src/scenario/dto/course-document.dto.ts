import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, Min } from 'class-validator';
import type { CourseDocument } from '../course-document.types';

export class UpdateCourseDocumentDto {
  @ApiProperty({
    description:
      'Structured, exportable course document used by the editor and SCORM runtime.',
    type: Object,
  })
  @IsObject()
  courseDocument: CourseDocument;

  @ApiPropertyOptional({
    description:
      'Last course document version seen by the editor. Stale saves are rejected.',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  expectedVersion?: number;
}
