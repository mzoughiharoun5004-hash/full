import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sequence } from './sequence.entity';
import { CourseModule } from 'src/course-module/course-module.entity';
import { SequenceService } from './sequence.service';
import { SequenceController } from './sequence.controller';
import { AuthModule } from 'src/auth/auth.module';
import { ScenarioModule } from 'src/scenario/scenario.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sequence, CourseModule]),
    AuthModule,
    ScenarioModule,
  ],
  controllers: [SequenceController],
  providers: [SequenceService],
  exports: [SequenceService, TypeOrmModule],
})
export class SequenceModule {}
