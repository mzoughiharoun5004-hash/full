import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import type { ScenarioDocument } from '../scenario-document.types';

export class UpdateScenarioDocumentDto {
  @ApiProperty({
    description:
      'Structured graph document used by the scenario editor, runtime, future AI generation, and future SCORM export.',
    type: Object,
  })
  @IsObject()
  scenarioDocument: ScenarioDocument;
}
