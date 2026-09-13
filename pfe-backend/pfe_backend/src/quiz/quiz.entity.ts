import {
  Column,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Question } from 'src/question/question.entity';
import { Activite } from 'src/activite/activite.entity';

@Entity()
export class Quiz {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  titre: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 1 })
  tentatives: number;

  @Column({ type: 'float', default: 50.0 })
  scorePourReussir: number;

  @OneToOne(() => Activite, (activite) => activite.quiz)
  activite: Activite;

  @OneToMany(() => Question, (question) => question.quiz, { cascade: true })
  questions: Question[];
}
