import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatutScenario } from 'src/common/enums';
import { User } from 'src/users/user.entity';
import { CourseModule } from 'src/course-module/course-module.entity';
import { Ressource } from 'src/ressource/ressource.entity';
import { Rapport } from 'src/rapport/rapport.entity';
import { ScenarioShare } from 'src/scenario-share/scenario-share.entity';
import { CourseDocument } from './course-document.types';
import { ScenarioDocument } from './scenario-document.types';

@Entity()
export class Scenario {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  titre!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  objectif!: string | null;

  @Column({ type: 'varchar', nullable: true })
  niveau!: string | null;

  @Column({ type: 'int', nullable: true })
  dureeScenario!: number | null;

  @Column({
    type: 'enum',
    enum: StatutScenario,
    default: StatutScenario.BROUILLON,
  })
  statut!: StatutScenario;

  @Column({ type: 'jsonb', nullable: true })
  courseDocument!: CourseDocument | null;

  @Column({ default: 1 })
  courseDocumentVersion!: number;

  @Column({ type: 'jsonb', nullable: true })
  scenarioDocument!: ScenarioDocument | null;

  @Column({ default: 1 })
  scenarioDocumentVersion!: number;

  @Column({ type: 'varchar', nullable: true })
  tone!: string | null;

  @Column({ type: 'varchar', nullable: true })
  audience!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt!: Date | null;

  @ManyToOne(() => User, (user) => user.scenarios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @OneToMany(() => CourseModule, (module) => module.scenario, { cascade: true })
  modules!: CourseModule[];

  @OneToMany(() => Ressource, (ressource) => ressource.scenario, {
    cascade: true,
  })
  ressources!: Ressource[];

  @OneToMany(() => Rapport, (rapport) => rapport.scenario, { cascade: true })
  rapports!: Rapport[];

  @OneToMany(() => ScenarioShare, (share) => share.scenario, { cascade: true })
  shares!: ScenarioShare[];
}
