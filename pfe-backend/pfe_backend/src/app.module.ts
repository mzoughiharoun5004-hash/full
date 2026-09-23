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
import config from './config/config';
import dbConfig from './config/db.config';
import * as Joi from 'joi';

@Module({
  imports: [
    SeederModule,
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [config],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production')
          .default('development'),
        JWT_SECRET: Joi.string().min(32).required(),
        DB_HOST: Joi.string().optional(),
        DATABASE_URL: Joi.string().optional(),
        DB_PORT: Joi.number().default(5432),
        CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
        AI_PROVIDER: Joi.string().valid('groq').default('groq'),
        AI_MODEL: Joi.string().default('openai/gpt-oss-20b'),
        PEXELS_API_KEY: Joi.string().optional(),
        // Socket.IO Redis adapter — omit all of these to run single-process.
        REDIS_ENABLED: Joi.boolean().optional(),
        REDIS_URL: Joi.string().uri().optional(),
        REDIS_HOST: Joi.string().optional(),
        REDIS_PORT: Joi.number().port().default(6379),
        REDIS_PASSWORD: Joi.string().allow('').optional(),
        REDIS_DB: Joi.number().min(0).default(0),
        // SCORM preview upload pruning.
        SCORM_UPLOAD_TTL_HOURS: Joi.number().min(1).default(24),
        SCORM_CLEANUP_INTERVAL_MINUTES: Joi.number().min(0).default(60),
      }),
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
  ],
})
export class AppModule {}
