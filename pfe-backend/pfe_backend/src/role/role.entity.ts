import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { User } from 'src/users/user.entity';
import { IsString, IsNotEmpty } from 'class-validator';

@Entity()
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @IsString()
  @IsNotEmpty()
  name: string;

  @OneToMany(() => User, (user) => user.role)
  users: User[];
}
