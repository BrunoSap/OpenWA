import { PartialType } from '@nestjs/mapped-types';
import { CreateTenantDto } from './create-tenant.dto';
import { IsBoolean, IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  stripeCustomerId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  stripeSubscriptionId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  subscriptionStatus?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  paymentStatus?: string;

  @IsDateString()
  @IsOptional()
  gracePeriodEndsAt?: Date | null;

  @IsBoolean()
  @IsOptional()
  allowOverage?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
