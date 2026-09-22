import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { ScenarioModule } from 'src/scenario/scenario.module';
import { AiChangeSet } from './ai-change-set.entity';
import { AiCourseController } from './ai-course.controller';
import { AiCourseService } from './ai-course.service';
import { GroqCourseProvider } from './groq-course.provider';
import { PexelsMediaProvider } from './pexels-media.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiChangeSet]),
    AuthModule,
    ScenarioModule,
  ],
  controllers: [AiCourseController],
  providers: [AiCourseService, GroqCourseProvider, PexelsMediaProvider],
})
export class AiCourseModule {}
