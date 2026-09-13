import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { Scenario } from 'src/scenario/scenario.entity';
import { ScenarioShare } from 'src/scenario-share/scenario-share.entity';
import { ScenarioCollaborationGateway } from './scenario-collaboration.gateway';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Scenario, ScenarioShare])],
  providers: [ScenarioCollaborationGateway],
})
export class ScenarioCollaborationModule {}
