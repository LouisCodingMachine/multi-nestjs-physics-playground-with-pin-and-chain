import { Injectable } from '@nestjs/common';

@Injectable()
export class TimerService {
  private endTime: number | null = null;

  startTimer(durationInSeconds: number): void {
    this.endTime = Date.now() + durationInSeconds * 1000; // 종료 시간 계산
  }

  getTimerStatus(): { isRunning: boolean; timeLeft: number | null } {
    if (this.endTime === null) {
      return { isRunning: false, timeLeft: null };
    }

    const timeLeft = Math.max(0, this.endTime - Date.now());
    const isRunning = timeLeft > 0;

    if (!isRunning) {
      this.endTime = null; // 타이머 종료 후 상태 초기화
    }

    return { isRunning, timeLeft: isRunning ? Math.ceil(timeLeft / 1000) : 0 };
  }
}