import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ressource } from './ressource.entity';
import { CourseModule } from 'src/course-module/course-module.entity';
import { RessourceService } from './ressource.service';
import { RessourceController } from './ressource.controller';
import { AuthModule } from 'src/auth/auth.module';
import { ScenarioModule } from 'src/scenario/scenario.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ressource, CourseModule]),
    AuthModule,
    ScenarioModule,
  ],
  controllers: [RessourceController],
  providers: [RessourceService],
  exports: [RessourceService, TypeOrmModule],
})
export class RessourceModule {}
