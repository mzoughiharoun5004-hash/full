import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './users/user.module';
import { SeederModule } from './seeder/seeder.module';
import { RoleModule } from './role/role.module';
import { ScenarioModule } from './scenario/scenario.module';
import { CourseModuleModule } from './course-module/course-module.module';
import { SequenceModule } from './sequence/sequence.module';
import { RessourceModule } from './ressource/ressource.module';
import { ActiviteModule } from './activite/activite.module';
import { QuizModule } from './quiz/quiz.module';
import { QuestionModule } from './question/question.module';
import { ReponseModule } from './reponse/reponse.module';
import { RapportModule } from './rapport/rapport.module';
import { ScenarioShareModule } from './scenario-share/scenario-share.module';
import { MediaModule } from './media/media.module';
import { ScormModule } from './scorm/scorm.module';
import { ScenarioCollaborationModule } from './scenario-collaboration/scenario-collaboration.module';
import { AiCourseModule } from './ai-course/ai-course.module';
import { RoleGuard } from './role/role.guard';
import config from './config/config';
import dbConfig from './config/db.config';

@Module({
  imports: [
    SeederModule,
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [config],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => dbConfig(configService),
    }),
    // Rate limiting — protects auth endpoints and user registration
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: 60_000, limit: 10 }, // 10 req/min per IP
        { name: 'medium', ttl: 600_000, limit: 50 }, // 50 req/10min per IP
      ],
    }),
    // Event bus for cross-module communication (e.g. share.revoked)
    EventEmitterModule.forRoot(),
    AuthModule,
    UserModule,
    RoleModule,
    ScenarioModule,
    CourseModuleModule,
    SequenceModule,
    RessourceModule,
    ActiviteModule,
    QuizModule,
    QuestionModule,
    ReponseModule,
    RapportModule,
    ScenarioShareModule,
    ScenarioCollaborationModule,
    ScormModule,
    MediaModule,
    AiCourseModule,
  ],
  providers: [
    // Apply throttle guard globally — add @SkipThrottle() to non-sensitive GET endpoints
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Apply role guard globally — protect routes with @Roles() decorator
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
  ],
})
export class AppModule {}
