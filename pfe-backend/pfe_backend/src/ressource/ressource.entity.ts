import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TypeRessource } from 'src/common/enums';
import { Scenario } from 'src/scenario/scenario.entity';
import { CourseModule } from 'src/course-module/course-module.entity';
import { User } from 'src/users/user.entity';

@Entity()
export class Ressource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  titre: string;

  @Column({ type: 'enum', enum: TypeRessource })
  type: TypeRessource;

  @Column({ nullable: true })
  url: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'int', nullable: true })
  taille: number;

  @ManyToOne(() => Scenario, (scenario) => scenario.ressources, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'scenarioId' })
  scenario: Scenario;

  @ManyToOne(() => CourseModule, (module) => module.ressources, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'moduleId' })
  module: CourseModule;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy: User | null;
}
