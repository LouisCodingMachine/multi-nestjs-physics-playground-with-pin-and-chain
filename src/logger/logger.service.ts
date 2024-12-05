import { Injectable } from '@nestjs/common';
import { createObjectCsvWriter } from 'csv-writer';
import { join } from 'path';
import { LogInfoDto } from './dto/log-info.dto';

@Injectable()
export class LoggerService {
  private readonly csvWriter;

  constructor() {
    this.csvWriter = createObjectCsvWriter({
      path: join(process.cwd(), 'player_log.csv'),
      header: [
        { id: 'player_number', title: 'player_number' },
        { id: 'type', title: 'type' },
        { id: 'timestamp', title: 'timestamp' },
      ],
      append: true,
    });
  }

  async appendLog(logInfo: LogInfoDto): Promise<void> {
    await this.csvWriter.writeRecords([{
      player_number: logInfo.player_number,
      type: logInfo.type,
      timestamp: logInfo.timestamp,
    }]);
  }
}