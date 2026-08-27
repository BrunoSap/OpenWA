import { IsEmail, IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * SignupDto - Self-service tenant signup request
 * Phase 09 Plan 04: Tenant onboarding
 */
export class SignupDto {
  @ApiProperty({ description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ description: 'Company name (becomes tenant name)' })
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @ApiPropertyOptional({ description: 'Plan tier (free, starter, pro, enterprise)', default: 'free' })
  @IsString()
  @IsOptional()
  plan?: string;

  @ApiPropertyOptional({ description: 'Seed example knowledge base documents', default: false })
  @IsBoolean()
  @IsOptional()
  seedExamples?: boolean;
}
