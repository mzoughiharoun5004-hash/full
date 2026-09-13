import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScenarioShare } from './scenario-share.entity';
import { ScenarioActivityLog } from './scenario-activity-log.entity';
import { ScenarioChangeProposal } from './scenario-change-proposal.entity';
import { ScenarioComment } from './scenario-comment.entity';
import { ScenarioShareService } from './scenario-share.service';
import { ScenarioShareController } from './scenario-share.controller';
import { AuthModule } from 'src/auth/auth.module';
import { Scenario } from 'src/scenario/scenario.entity';
import { User } from 'src/users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScenarioShare,
      ScenarioComment,
      ScenarioActivityLog,
      ScenarioChangeProposal,
      Scenario,
      User,
    ]),
    AuthModule,
  ],
  controllers: [ScenarioShareController],
  providers: [ScenarioShareService],
  exports: [ScenarioShareService],
})
export class ScenarioShareModule {}
