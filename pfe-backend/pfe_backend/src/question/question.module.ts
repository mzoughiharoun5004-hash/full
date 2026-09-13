import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from './question.entity';
import { Quiz } from 'src/quiz/quiz.entity';
import { QuestionService } from './question.service';
import { QuestionController } from './question.controller';
import { AuthModule } from 'src/auth/auth.module';
import { ScenarioModule } from 'src/scenario/scenario.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Question, Quiz]),
    AuthModule,
    ScenarioModule,
  ],
  controllers: [QuestionController],
  providers: [QuestionService],
  exports: [QuestionService, TypeOrmModule],
})
export class QuestionModule {}
