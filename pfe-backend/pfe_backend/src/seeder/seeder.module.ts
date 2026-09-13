import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeederService } from './seeder.service';
import { User } from 'src/users/user.entity';
import { Role } from 'src/role/role.entity';
import { Scenario } from 'src/scenario/scenario.entity';
import { CourseModule } from 'src/course-module/course-module.entity';
import { Sequence } from 'src/sequence/sequence.entity';
import { Activite } from 'src/activite/activite.entity';
import { Quiz } from 'src/quiz/quiz.entity';
import { Question } from 'src/question/question.entity';
import { Reponse } from 'src/reponse/reponse.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      Scenario,
      CourseModule,
      Sequence,
      Activite,
      Quiz,
      Question,
      Reponse,
    ]),
  ],
  providers: [SeederService],
})
export class SeederModule {}
