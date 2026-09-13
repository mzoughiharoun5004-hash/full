import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Scenario } from 'src/scenario/scenario.entity';
import { Sequence } from 'src/sequence/sequence.entity';
import { Ressource } from 'src/ressource/ressource.entity';

@Entity()
export class CourseModule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  titre: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 0 })
  ordre: number;

  @Column({ nullable: true })
  duree: number;

  @ManyToOne(() => Scenario, (scenario) => scenario.modules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'scenarioId' })
  scenario: Scenario;

  @OneToMany(() => Sequence, (sequence) => sequence.module, { cascade: true })
  sequences: Sequence[];

  @OneToMany(() => Ressource, (ressource) => ressource.module, {
    cascade: true,
  })
  ressources: Ressource[];
}
