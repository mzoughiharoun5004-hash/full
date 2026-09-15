import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Role } from 'src/role/role.entity';
import { User } from 'src/users/user.entity';
import { Scenario } from 'src/scenario/scenario.entity';
import { CourseModule } from 'src/course-module/course-module.entity';
import { Sequence } from 'src/sequence/sequence.entity';
import { Ressource } from 'src/ressource/ressource.entity';
import { Activite } from 'src/activite/activite.entity';
import { Quiz } from 'src/quiz/quiz.entity';
import { Question } from 'src/question/question.entity';
import { Reponse } from 'src/reponse/reponse.entity';
import { Rapport } from 'src/rapport/rapport.entity';
import { ScenarioShare } from 'src/scenario-share/scenario-share.entity';
import { ScenarioActivityLog } from 'src/scenario-share/scenario-activity-log.entity';
import { ScenarioChangeProposal } from 'src/scenario-share/scenario-change-proposal.entity';
import { ScenarioComment } from 'src/scenario-share/scenario-comment.entity';
import { AiChangeSet } from 'src/ai-course/ai-change-set.entity';

export default (configService: ConfigService): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('database.url');

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured');
  }

  const isProduction = process.env.NODE_ENV === 'production';

  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [
      User,
      Role,
      Scenario,
      CourseModule,
      Sequence,
      Ressource,
      Activite,
      Quiz,
      Question,
      Reponse,
      Rapport,
      ScenarioShare,
      ScenarioComment,
      ScenarioActivityLog,
      ScenarioChangeProposal,
      AiChangeSet,
    ],
    synchronize: !isProduction, // NEVER true in production — use migrations instead
    logging: isProduction ? ['error', 'warn'] : ['query', 'error'],
  };
};
