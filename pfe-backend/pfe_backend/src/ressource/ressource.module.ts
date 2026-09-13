import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ressource } from './ressource.entity';
import { RessourceService } from './ressource.service';
import { RessourceController } from './ressource.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Ressource]), AuthModule],
  controllers: [RessourceController],
  providers: [RessourceService],
  exports: [RessourceService, TypeOrmModule],
})
export class RessourceModule {}
