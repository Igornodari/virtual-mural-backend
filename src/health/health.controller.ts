import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Verifica saúde da aplicação e dependências' })
  @ApiResponse({ status: 200, description: 'Serviço operacional (ok ou degraded)' })
  @ApiResponse({ status: 503, description: 'Serviço indisponível (banco fora)' })
  async check(@Res() res: Response): Promise<void> {
    const report = await this.healthService.check();

    // 503 apenas se o banco estiver fora — Railway usa para decidir reiniciar
    const httpStatus =
      report.status === 'error'
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.OK;

    res.status(httpStatus).json(report);
  }
}
