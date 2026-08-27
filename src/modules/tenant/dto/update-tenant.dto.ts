import { PartialType } from '@nestjs/mapped-types';
import { CreateTenantDto } from './create-tenant.dto';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  stripeCustomerId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  stripeSubscriptionId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
