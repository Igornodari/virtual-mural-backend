import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateChatMessageDto {
  @IsUUID()
  @IsNotEmpty()
  appointmentId: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}
