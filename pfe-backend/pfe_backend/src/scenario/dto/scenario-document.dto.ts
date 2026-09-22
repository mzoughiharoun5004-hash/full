import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional } from 'class-validator';
import type { ScenarioDocument } from '../scenario-document.types';

export class UpdateScenarioDocumentDto {
  @ApiProperty({
    description:
      'Structured graph document used by the scenario editor, runtime, future AI generation, and future SCORM export.',
    type: Object,
  })
  @IsObject()
  scenarioDocument: ScenarioDocument;

  @ApiPropertyOptional({
    description:
      'Current scenarioDocumentVersion on the client. If provided and stale, the server returns 409 Conflict.',
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  expectedVersion?: number;
}
