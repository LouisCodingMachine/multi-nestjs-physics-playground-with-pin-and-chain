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
  
  @WebSocketGateway(3001, { cors: { origin: '*' } }) // WebSocket 서버 초기화, CORS 설정
  export class AppGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
  {
    @WebSocketServer()
    server: Server; // Socket.IO 서버 인스턴스

    private currentTurn: string = 'player1'; // 초기 턴 설정
  
    private clients: Map<string, string> = new Map(); // 클라이언트 ID를 저장하는 맵
  
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
  
    // 특정 메시지를 처리하는 데코레이터
    @SubscribeMessage('mouseMove') // 'mouseMove' 이벤트를 수신
    handleMouseMove(client: Socket, payload: { x: number; y: number; playerId: string }) {
      console.log(`Mouse Move from ${client.id}:`, payload);
      // 다른 모든 클라이언트에게 브로드캐스트
      client.broadcast.emit('mouseMove', payload);
    }

    @SubscribeMessage('drawShape')
    handleDrawShape(client: Socket, payload: { points: Matter.Vector[]; playerId: string; customId: string }) {
        console.log("payload: ", payload)
        // client.broadcast.emit('drawShape', payload);

        this.server.emit('drawShape', payload);
    }

    @SubscribeMessage('resetLevel')
    handleResetLevel(client: Socket, payload: { level: number }) {
        // 다른 클라이언트에게 브로드캐스트
        console.log("payload: ", payload)
        // client.broadcast.emit('resetLevel', payload);

        this.server.emit('resetLevel', payload);
    }

    @SubscribeMessage('erase')
    handleErase(client: Socket, payload: { customId: string; playerId: string }) {
        console.log("payload: ", payload)
        // client.broadcast.emit('erase', payload);

        this.server.emit('erase', payload);
    }

    @SubscribeMessage('push')
    handlePush(client: Socket, payload: { force: { x: number; y: number }; playerId: string}) {
        // 다른 클라이언트에게 브로드캐스트
        // client.broadcast.emit('push', payload);
        
        // 모든 클라이언트에게 브로드캐스트
        this.server.emit('push', payload);
    }
    
    @SubscribeMessage('changeTool')
    handleChangeTool(client: Socket, payload: { tool: string; playerId: string }) {
        // 다른 클라이언트에게 tool 변경 정보 브로드캐스트
        client.broadcast.emit('changeTool', payload);
    }

    @SubscribeMessage('changeLevel')
    handleChangeLevel(client: Socket, payload: { level: number; direction: string; playerId: string }) {
        // 다른 클라이언트에게 브로드캐스트
        // client.broadcast.emit('changeLevel', payload);

        this.server.emit('changeLevel', payload);
    }

    // 클라이언트에서 턴 변경 요청 처리
    @SubscribeMessage('changeTurn')
    handleChangeTurn(client: Socket, payload: { nextPlayerId: string }) {
      console.log("payload: ", payload);
      this.currentTurn = payload.nextPlayerId; // 현재 턴 업데이트
      this.server.emit('updateTurn', { currentTurn: this.currentTurn }); // 전체 클라이언트에 브로드캐스트
    }

    // 클라이언트에서 현재 턴 조회 요청 처리
    @SubscribeMessage('getTurn')
    handleGetTurn(client: Socket) {
      console.log("this.currentTurn: ", this.currentTurn)
      client.emit('updateTurn', { currentTurn: this.currentTurn }); // 요청한 클라이언트에 턴 정보 전송
    }
  }