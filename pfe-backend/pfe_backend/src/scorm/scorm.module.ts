import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Scenario } from 'src/scenario/scenario.entity';
import { AuthModule } from 'src/auth/auth.module';
import { ScenarioModule } from 'src/scenario/scenario.module';
import { ScormBuildService } from './scorm-build.service';
import { ScormPdfService } from './scorm-pdf.service';
import { ScormService } from './scorm.service';
import { ScormPreviewService } from './scorm-preview.service';
import { ScormCleanupService } from './scorm-cleanup.service';
import { ScormController } from './scorm.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Scenario]), AuthModule, ScenarioModule],
  providers: [
    ScormService,
    ScormBuildService,
    ScormPdfService,
    ScormPreviewService,
    ScormCleanupService,
  ],
  controllers: [ScormController],
  exports: [ScormCleanupService],
})
export class ScormModule {}
