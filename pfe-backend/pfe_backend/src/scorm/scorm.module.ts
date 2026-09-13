import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Scenario } from 'src/scenario/scenario.entity';
import { AuthModule } from 'src/auth/auth.module';
import { ScenarioModule } from 'src/scenario/scenario.module';
import { ScormService } from './scorm.service';
import { ScormController } from './scorm.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Scenario]), AuthModule, ScenarioModule],
  providers: [ScormService],
  controllers: [ScormController],
})
export class ScormModule {}
