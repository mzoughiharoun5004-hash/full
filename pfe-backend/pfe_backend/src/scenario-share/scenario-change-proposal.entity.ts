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

export type ScenarioProposalTarget = 'course' | 'lesson' | 'module';
export type ScenarioProposalStatus = 'pending' | 'approved' | 'rejected';

@Entity()
export class ScenarioChangeProposal {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'enum', enum: ['course', 'lesson', 'module'] })
  targetType!: ScenarioProposalTarget;

  @Column({ type: 'varchar', nullable: true })
  targetId!: string | null;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ type: 'jsonb', nullable: true })
  patch!: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  status!: ScenarioProposalStatus;

  @Column({ type: 'text', nullable: true })
  decisionNote!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Scenario, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'scenarioId' })
  scenario!: Scenario;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'proposerId' })
  proposer!: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL', eager: false, nullable: true })
  @JoinColumn({ name: 'reviewerId' })
  reviewer!: User | null;
}
