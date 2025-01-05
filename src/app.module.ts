import { Module } from '@nestjs/common';
import { LoggerModule } from './logger/logger.module';
import { AppGateway } from './app.gateway';
import { TimerService } from './timer/timer.service';
import { TimerController } from './timer/timer.controller';

@Module({
  controllers: [TimerController],
  imports: [LoggerModule],
  // imports: [LoggerModule],
  providers: [AppGateway, TimerService], // 게이트웨이를 프로바이더로 등록
})
export class AppModule {}