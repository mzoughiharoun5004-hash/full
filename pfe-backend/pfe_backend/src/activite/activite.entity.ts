import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TypeActivite } from 'src/common/enums';
import { Sequence } from 'src/sequence/sequence.entity';
import { Quiz } from 'src/quiz/quiz.entity';

@Entity()
export class Activite {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  titre: string;

  @Column({ type: 'enum', enum: TypeActivite })
  type: TypeActivite;

  @Column({ type: 'text', nullable: true })
  consigne: string;

  @Column({ type: 'text', nullable: true })
  code: string;

  @Column({ default: 0 })
  ordre: number;

  @ManyToOne(() => Sequence, (sequence) => sequence.activites, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sequenceId' })
  sequence: Sequence;

  @OneToOne(() => Quiz, (quiz) => quiz.activite, {
    cascade: true,
    nullable: true,
    eager: false,
  })
  @JoinColumn({ name: 'quizId' })
  quiz: Quiz;
}
