import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TypeQuestion } from 'src/common/enums';
import { Quiz } from 'src/quiz/quiz.entity';
import { Reponse } from 'src/reponse/reponse.entity';

@Entity()
export class Question {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  titre: string;

  @Column({ type: 'enum', enum: TypeQuestion })
  type: TypeQuestion;

  @Column({ type: 'text', nullable: true })
  texte: string;

  @Column({ type: 'float', default: 1 })
  points: number;

  @Column({ default: 0 })
  ordre: number;

  @ManyToOne(() => Quiz, (quiz) => quiz.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quizId' })
  quiz: Quiz;

  @OneToMany(() => Reponse, (reponse) => reponse.question, { cascade: true })
  reponses: Reponse[];
}
