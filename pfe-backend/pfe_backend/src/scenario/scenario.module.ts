import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Scenario } from './scenario.entity';
import { ScenarioShare } from 'src/scenario-share/scenario-share.entity';
import { ScenarioActivityLog } from 'src/scenario-share/scenario-activity-log.entity';
import { ScenarioComment } from 'src/scenario-share/scenario-comment.entity';
import { ScenarioService } from './scenario.service';
import { ScenarioController } from './scenario.controller';
import { ScenarioAccessPolicy } from './scenario-access.policy';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Scenario,
      ScenarioShare,
      ScenarioActivityLog,
      ScenarioComment,
    ]),
    AuthModule,
  ],
  controllers: [ScenarioController],
  providers: [ScenarioService, ScenarioAccessPolicy],
  exports: [ScenarioService, ScenarioAccessPolicy, TypeOrmModule],
})
export class ScenarioModule {}
