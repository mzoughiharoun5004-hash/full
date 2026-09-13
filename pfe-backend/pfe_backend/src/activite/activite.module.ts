import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activite } from './activite.entity';
import { Sequence } from 'src/sequence/sequence.entity';
import { ActiviteService } from './activite.service';
import { ActiviteController } from './activite.controller';
import { AuthModule } from 'src/auth/auth.module';
import { ScenarioModule } from 'src/scenario/scenario.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Activite, Sequence]),
    AuthModule,
    ScenarioModule,
  ],
  controllers: [ActiviteController],
  providers: [ActiviteService],
  exports: [ActiviteService, TypeOrmModule],
})
export class ActiviteModule {}
