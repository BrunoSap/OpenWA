import { IsString, IsNotEmpty, IsOptional, IsInt, Min, MaxLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  slug!: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  plan?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  quotaMessages?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  rateLimitPerMinute?: number;
}
