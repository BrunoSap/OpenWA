import { IsString, IsNotEmpty } from 'class-validator';

export class PredictionRequestDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;
}
