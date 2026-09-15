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

export type AiChangeSetStatus = 'proposed' | 'applied' | 'rejected' | 'cancelled' | 'failed';

@Entity()
export class AiChangeSet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: AiChangeSetStatus;

  @Column({ type: 'varchar', length: 32 })
  kind!: 'creation' | 'edit';

  @Column({ type: 'text' })
  instruction!: string;

  @Column({ type: 'int' })
  courseDocumentVersion!: number;

  @Column({ type: 'jsonb' })
  proposal!: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Scenario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scenarioId' })
  scenario!: Scenario;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestedById' })
  requestedBy!: User;
}
