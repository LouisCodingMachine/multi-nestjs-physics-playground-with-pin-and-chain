import { Controller, Post, Get, Body } from '@nestjs/common';
import { TimerService } from './timer.service';
import { AppGateway } from 'src/app.gateway';

@Controller('timer')
export class TimerController {
  constructor(
    private readonly timerService: TimerService,
    private readonly appGateway: AppGateway,
  ) {}

  @Post('start')
  startTimerFromHttp(@Body('duration') duration: number): { message: string; duration: number } {
    console.log('Timer started via HTTP');
    this.timerService.startTimer(duration);

    // AppGateway의 공개 메서드를 호출
    this.appGateway.emitToAll('startTimer', { duration });

    return { message: 'Timer started via HTTP', duration };
  }

  @Get('status')
  getTimerStatus(): { isRunning: boolean; timeLeft: number | null } {
    return this.timerService.getTimerStatus();
  }
}