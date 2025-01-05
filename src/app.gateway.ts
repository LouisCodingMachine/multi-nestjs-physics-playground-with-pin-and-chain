import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import Matter from 'matter-js';
import { createObjectCsvWriter } from 'csv-writer';
import { join } from 'path';
  
  @WebSocketGateway(3001, { cors: { origin: '*' } }) // WebSocket 서버 초기화, CORS 설정
  export class AppGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
  {
    @WebSocketServer()
    server: Server; // Socket.IO 서버 인스턴스

    private currentTurn: string = 'player1'; // 초기 턴 설정
  
    private clients: Map<string, string> = new Map(); // 클라이언트 ID를 저장하는 맵

    private csvWriter = createObjectCsvWriter({
      path: join(process.cwd(), 'player_log.csv'),
      header: [
        { id: 'player_number', title: 'player_number' },
        { id: 'type', title: 'type' },
        { id: 'current_level', title: 'current_level' },
        { id: 'object_custom_id', title: 'object_custom_id' },
        { id: 'object_vector', title: 'object_vector' },
        { id: 'tool', title: 'tool' },
        { id: 'direction', title: 'direction' },
        { id: 'new_level', title: 'new_level' },
        { id: 'timestamp', title: 'timestamp' },
      ],
      append: true,
    });
  
    // WebSocket 서버 초기화 시 호출
    afterInit(server: Server) {
      console.log('WebSocket Server Initialized');
    }
  
    // 클라이언트가 연결되었을 때 호출
    handleConnection(client: Socket) {
      console.log(`Client connected: ${client.id}`);
      this.clients.set(client.id, ''); // 클라이언트를 등록 (추후 사용 가능)
    }
  
    // 클라이언트가 연결 해제되었을 때 호출
    handleDisconnect(client: Socket) {
      console.log(`Client disconnected: ${client.id}`);
      this.clients.delete(client.id); // 클라이언트를 맵에서 제거
    }

    // // 타이머 시작 이벤트 처리
    // @SubscribeMessage('startTimer')
    // handleStartTimer(client: Socket) {
    //   console.log(`Timer started by client: ${client.id}`);
    //   // 전체 클라이언트에 타이머 시작 이벤트 전송
    //   this.server.emit('startTimer');
    // }

    emitToAll(event: string, payload: any): void {
      this.server.emit(event, payload);
    }
  
    emitToClient(client: Socket, event: string, payload: any): void {
      client.emit(event, payload);
    }
  
    broadcastToOthers(client: Socket, event: string, payload: any): void {
      client.broadcast.emit(event, payload);
    }

    private async logAction(playerId: string, type: string, currentLevel: number, objectCustomId?: string, objectVector?: Matter.Vector[], tool?: string, direction?: string, newLevel?: number) {
      const timestamp = new Date().toISOString();
      
      // objectVector를 JSON 문자열로 변환
      const objectVectorString = objectVector ? JSON.stringify(objectVector) : '';

      await this.csvWriter.writeRecords([
        {
          player_number: playerId,
          type,
          current_level: currentLevel,
          object_custom_id: objectCustomId || '',
          object_vector: objectVectorString,
          tool: tool || '',
          direction: direction || '',
          new_level: newLevel,
          timestamp,
        },
      ]);
    }
      
    // 특정 메시지를 처리하는 데코레이터
    @SubscribeMessage('mouseMove') // 'mouseMove' 이벤트를 수신
    handleMouseMove(client: Socket, payload: { x: number; y: number; playerId: string }) {
      console.log(`Mouse Move from ${client.id}:`, payload);
      // 다른 모든 클라이언트에게 브로드캐스트
      client.broadcast.emit('mouseMove', payload);
    }

    @SubscribeMessage('drawShape')
    async handleDrawShape(client: Socket, payload: { points: Matter.Vector[]; playerId: string; customId: string; currentLevel: number }) {
        console.log("payload: ", payload)
        // client.broadcast.emit('drawShape', payload);
        
        await this.logAction(payload.playerId, 'drawShape', payload.currentLevel, payload.customId, payload.points);
        this.server.emit('drawShape', payload);
    }

    @SubscribeMessage('resetLevel')
    async handleResetLevel(client: Socket, payload: { playerId: string; level: number }) {
        // 다른 클라이언트에게 브로드캐스트
        console.log("payload: ", payload)
        // client.broadcast.emit('resetLevel', payload);

        await this.logAction(payload.playerId, 'resetLevel', payload.level);
        this.server.emit('resetLevel', payload);
    }

    @SubscribeMessage('erase')
    async handleErase(client: Socket, payload: { customId: string; playerId: string; currentLevel: number }) {
        console.log("payload: ", payload)
        // client.broadcast.emit('erase', payload);

        await this.logAction(payload.playerId, 'erase', payload.currentLevel, payload.customId);
        this.server.emit('erase', payload);
    }

    @SubscribeMessage('push')
    async handlePush(client: Socket, payload: { force: { x: number; y: number }; playerId: string; currentLevel: number }) {
        // 다른 클라이언트에게 브로드캐스트
        // client.broadcast.emit('push', payload);
        
        // 모든 클라이언트에게 브로드캐스트
        await this.logAction(payload.playerId, payload.force.x > 0 ? 'left_push' : 'right_push', payload.currentLevel);
        this.server.emit('push', payload);
    }
    
    @SubscribeMessage('changeTool')
    async handleChangeTool(client: Socket, payload: { tool: string; playerId: string; currentLevel: number }) {
        // 다른 클라이언트에게 tool 변경 정보 브로드캐스트
        await this.logAction(payload.playerId, 'changeTool', payload.currentLevel, undefined, undefined, payload.tool);
        client.broadcast.emit('changeTool', payload);
    }

    @SubscribeMessage('changeLevel')
    async handleChangeLevel(client: Socket, payload: { level: number; currentLevel:number; direction: string; playerId: string }) {
        // 다른 클라이언트에게 브로드캐스트
        // client.broadcast.emit('changeLevel', payload);

        await this.logAction(payload.playerId, 'changeLevel', payload.currentLevel, undefined, undefined, undefined, payload.direction, payload.level);
        this.server.emit('changeLevel', payload);
    }

    // 클라이언트에서 턴 변경 요청 처리
    @SubscribeMessage('changeTurn')
    async handleChangeTurn(client: Socket, payload: { nextPlayerId: string }) {
      console.log("payload: ", payload);
      this.currentTurn = payload.nextPlayerId; // 현재 턴 업데이트
      // await this.logAction(payload.nextPlayerId, 'changeTurn');
      this.server.emit('updateTurn', { currentTurn: this.currentTurn }); // 전체 클라이언트에 브로드캐스트
    }

    // 클라이언트에서 현재 턴 조회 요청 처리
    @SubscribeMessage('getTurn')
    async handleGetTurn(client: Socket) {
      console.log("this.currentTurn: ", this.currentTurn)
      client.emit('updateTurn', { currentTurn: this.currentTurn }); // 요청한 클라이언트에 턴 정보 전송
    }
  }