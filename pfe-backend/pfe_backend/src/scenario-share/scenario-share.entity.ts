import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Scenario } from 'src/scenario/scenario.entity';
import { User } from 'src/users/user.entity';

export type SharePermission = 'view' | 'edit';
export type CourseTeamRole = 'co_author' | 'reviewer';

@Entity()
export class ScenarioShare {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'enum', enum: ['view', 'edit'], default: 'view' })
  permission!: SharePermission;

  @Column({
    type: 'enum',
    enum: ['co_author', 'reviewer'],
    default: 'reviewer',
  })
  role!: CourseTeamRole;

  @Column({ default: false })
  canEditStructure!: boolean;

  @Column({ default: false })
  canEditContent!: boolean;

  @Column({ default: false })
  canPublish!: boolean;

  @CreateDateColumn()
  sharedAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Scenario, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'scenarioId' })
  scenario!: Scenario;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'sharedWithId' })
  sharedWith!: User;
}
