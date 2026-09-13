import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Scenario } from 'src/scenario/scenario.entity';
import { User } from 'src/users/user.entity';

@Entity()
export class ScenarioActivityLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  action!: string;

  @Column({ type: 'varchar', nullable: true })
  targetType!: string | null;

  @Column({ type: 'varchar', nullable: true })
  targetId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  before!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Scenario, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'scenarioId' })
  scenario!: Scenario;

  @ManyToOne(() => User, { onDelete: 'SET NULL', eager: false, nullable: true })
  @JoinColumn({ name: 'actorId' })
  actor!: User | null;
}
