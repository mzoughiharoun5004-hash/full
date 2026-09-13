import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateUserDTO {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Admin@123' })
  @IsString()
  password!: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName!: string;
  @ApiProperty({ example: 'DOE' })
  @IsString()
  lastName!: string;

  @ApiProperty({ example: new Date() })
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  dateInscription?: string;
}

export class AdminCreateUserDTO extends CreateUserDTO {
  @ApiProperty({
    example: 'EDUCATOR',
    enum: ['EDUCATOR', 'ADMIN'],
    required: false,
  })
  @IsString()
  @IsIn(['EDUCATOR', 'ADMIN', 'educator', 'admin', 'TEACHER', 'teacher'])
  @IsOptional()
  role?: string;
}

export class UpdateUserDTO {
  @ApiProperty({ example: 'John', required: false })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ example: 'DOE', required: false })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ example: 'john@example.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'NewPass123', required: false })
  @IsString()
  @IsOptional()
  password?: string;
}

export class AdminUpdateUserDTO extends UpdateUserDTO {
  @ApiProperty({
    example: 'EDUCATOR',
    enum: ['EDUCATOR', 'ADMIN'],
    required: false,
  })
  @IsString()
  @IsIn(['EDUCATOR', 'ADMIN', 'educator', 'admin', 'TEACHER', 'teacher'])
  @IsOptional()
  role?: string;
}

export class UpdateUserRoleDTO {
  @ApiProperty({ example: 'EDUCATOR', enum: ['EDUCATOR', 'ADMIN'] })
  @IsString()
  @IsIn(['EDUCATOR', 'ADMIN', 'educator', 'admin', 'TEACHER', 'teacher'])
  role!: string;
}
