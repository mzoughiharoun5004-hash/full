import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseModule as CourseModuleEntity } from './course-module.entity';
import { CourseModuleService } from './course-module.service';
import { CourseModuleController } from './course-module.controller';
import { AuthModule } from 'src/auth/auth.module';
import { ScenarioModule } from 'src/scenario/scenario.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CourseModuleEntity]),
    AuthModule,
    ScenarioModule,
  ],
  controllers: [CourseModuleController],
  providers: [CourseModuleService],
  exports: [CourseModuleService, TypeOrmModule],
})
export class CourseModuleModule {}
