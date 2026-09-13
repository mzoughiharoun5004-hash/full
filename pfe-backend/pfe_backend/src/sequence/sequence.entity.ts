import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CourseModule } from 'src/course-module/course-module.entity';
import { Activite } from 'src/activite/activite.entity';

@Entity()
export class Sequence {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  titre: string;

  @Column({ type: 'text', nullable: true })
  texte: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  duree: number;

  @Column({ default: 0 })
  ordre: number;

  @ManyToOne(() => CourseModule, (module) => module.sequences, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'moduleId' })
  module: CourseModule;

  @OneToMany(() => Activite, (activite) => activite.sequence, { cascade: true })
  activites: Activite[];
}
