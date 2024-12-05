import { Controller, Post, Body } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { LogInfoDto } from './dto/log-info.dto';

@Controller('logger')
export class LoggerController {
  constructor(private readonly loggerService: LoggerService) {}

  @Post('log')
  async createLog(@Body() logInfo: LogInfoDto) {
    await this.loggerService.appendLog(logInfo);
    return { message: 'Log entry created successfully' };
  }
}