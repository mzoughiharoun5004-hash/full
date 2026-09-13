import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Scenario } from 'src/scenario/scenario.entity';
import { User } from 'src/users/user.entity';

export type ScenarioCommentTarget = 'course' | 'lesson' | 'module';
export type ScenarioCommentStatus = 'open' | 'resolved';

@Entity()
export class ScenarioComment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'enum', enum: ['course', 'lesson', 'module'] })
  targetType!: ScenarioCommentTarget;

  @Column({ type: 'varchar', nullable: true })
  targetId!: string | null;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'jsonb', nullable: true })
  mentions!: number[] | null;

  @Column({ type: 'enum', enum: ['open', 'resolved'], default: 'open' })
  status!: ScenarioCommentStatus;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Scenario, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'scenarioId' })
  scenario!: Scenario;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'authorId' })
  author!: User;
}
