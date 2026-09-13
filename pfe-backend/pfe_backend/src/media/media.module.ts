import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Ressource } from 'src/ressource/ressource.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ressource]),
    MulterModule.register({ dest: './uploads' }),
    AuthModule,
  ],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
