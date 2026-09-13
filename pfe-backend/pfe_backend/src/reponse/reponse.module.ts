import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reponse } from './reponse.entity';
import { Question } from 'src/question/question.entity';
import { ReponseService } from './reponse.service';
import { ReponseController } from './reponse.controller';
import { AuthModule } from 'src/auth/auth.module';
import { ScenarioModule } from 'src/scenario/scenario.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reponse, Question]),
    AuthModule,
    ScenarioModule,
  ],
  controllers: [ReponseController],
  providers: [ReponseService],
  exports: [ReponseService, TypeOrmModule],
})
export class ReponseModule {}
