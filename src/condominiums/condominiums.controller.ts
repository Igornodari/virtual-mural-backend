import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CondominiumsService } from './condominiums.service';
import { CreateCondominiumDto } from './dto/create-condominium.dto';
import { UpdateCondominiumDto } from './dto/update-condominium.dto';

@ApiTags('condominiums')
@ApiBearerAuth('cognito-jwt')
@UseGuards(JwtAuthGuard)
@Controller('condominiums')
export class CondominiumsController {
  constructor(private readonly condominiumsService: CondominiumsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um novo condomínio' })
  create(@Body() dto: CreateCondominiumDto) {
    return this.condominiumsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todos os condomínios ativos' })
  @ApiQuery({ name: 'zipCode', required: false, description: 'Filtra por CEP' })
  findAll(@Query('zipCode') zipCode?: string) {
    if (zipCode) return this.condominiumsService.findByZipCode(zipCode);
    return this.condominiumsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retorna um condomínio pelo ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.condominiumsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza dados de um condomínio' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCondominiumDto,
  ) {
    return this.condominiumsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desativa um condomínio (soft delete)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.condominiumsService.remove(id);
  }
}
