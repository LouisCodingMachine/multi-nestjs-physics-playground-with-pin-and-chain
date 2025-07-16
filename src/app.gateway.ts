import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import Matter from 'matter-js';
import { createObjectCsvWriter } from 'csv-writer';
import { join } from 'path';

  // ─────────────────────────────────────────────────────────
  // 1) CollisionCategoryPool 클래스 정의
  // ─────────────────────────────────────────────────────────
  class CollisionCategoryPool {
    private available: Set<number>;

    constructor(categories: number[]) {
      // Set에 모든 카테고리를 초기화
      this.available = new Set(categories);
    }

    /** 단순히 "다음 카테고리"를 하나 확인만 (Set에서 제거하지 않음) */
    peek(): number | null {
      // Set 순회 시 첫 번째 항목을 반환한다 (보장된 순서는 없지만, 일반적으로 삽입 순서)
      for (const cat of this.available) {
        return cat; // 여기서 remove 하지 않음
      }
      return null;
    }

    /**
     * 사용 가능한 카테고리를 하나 꺼내서 반환 (Set에서 제거)
     * 없으면 null을 반환
     */
    acquire(): number | null {
      for (const cat of this.available) {
        this.available.delete(cat);
        return cat;
      }
      return null;
    }

    /**
     * 이미 쓰고 있던 카테고리를 다시 풀에 반납 (재사용 가능)
     */
    release(cat: number) {
      this.available.add(cat);
    }

    /**
     * 모든 카테고리를 다시 초기화하고 싶다면,
     * 필요에 맞게 함수를 추가해 재설정 가능
     */
    reset(categories: number[]) {
      this.available = new Set(categories);
    }

    // 풀 내부 상태를 보기 쉽게 문자열로 만드는 헬퍼
    getAvailableAsHexString(): string {
      console.log("this.available: ", this.available)
      return Array.from(this.available)
        .map(c => '0x' + c.toString(16))
        .join(', ');
    }
  }
  
  @WebSocketGateway(3001, { cors: { origin: '*' } }) // WebSocket 서버 초기화, CORS 설정
  export class AppGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
  {
    @WebSocketServer()
    server: Server; // Socket.IO 서버 인스턴스

    // private nextCollisionCategory = 0x0002; // 초기 카테고리 설정
    // 사용할 카테고리 목록 (0x0002 ~ 0x8000)
    private categories = [
      0x0002, 0x0004, 0x0008, 0x0010,
      0x0020, 0x0040, 0x0080, 0x0100,
      0x0200, 0x0400, 0x0800, 0x1000,
      0x2000, 0x4000, 0x8000,
    ];
    // 카테고리 풀 생성
    private pool = new CollisionCategoryPool(this.categories);
    private nextGroupNumber = -1; // 초기 Group 값 설정
    // nail 정보를 저장하는 Map (key: customId)
    //  → category, groupNumber 등 함께 저장
    private nails = new Map<
      string,
      {
        centerX: number;
        centerY: number;
        radius: number;
        category: number;
        groupNumber: number;
      }
    >();

    private currentTurn: string = 'player1'; // 초기 턴 설정

    // "두 플레이어가 공유하는" 완료된 레벨 전역 세트
    private completedLevels = new Set<number>([1, 2, 3]);

    // 초기화 이벤트 한 번만 발동하기 위한 플래그
    private didTriggerOnce = false;

    private lastPushTime: number = 0;

    private pushPermanentLock = false
  
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
        { id: 'group_number', title: 'group_number' },
        { id: 'category', title: 'category' },
        { id: 'nails_id_string', title: 'nails_id_string' },
        { id: 'target_body_custom_id', title: 'target_body_custom_id' },
        { id: 'pins_id_string', title: 'pins_id_string' },
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

    private async logAction(playerId: string, type: string, currentLevel: number, objectCustomId?: string, objectVector?: Matter.Vector[], tool?: string, direction?: string, newLevel?: number, groupNumber?: number, category?: number, nailsIdString?: string, targetBodyCustomId?: string, pinsIdString?: string) {
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
          group_number: groupNumber || '',
          category: category || '',
          nails_id_string: nailsIdString || '',
          target_body_custom_id: targetBodyCustomId || '',
          pins_id_string: pinsIdString || '',
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
    async handleDrawShape(client: Socket, payload: { points: Matter.Vector[]; playerId: string; customId: string; currentLevel: number; nailsIdString?: string; collisionCategory?: number; groupNumber?: number }) {
        console.log("payload: ", JSON.stringify(payload))
        // client.broadcast.emit('drawShape', payload);
        
        await this.logAction(payload.playerId, 'drawShape', payload.currentLevel, payload.customId, payload.points, undefined, undefined, undefined, payload.groupNumber, payload.collisionCategory, payload.nailsIdString);
        this.server.emit('drawShape', payload);
    }

    // drawPin 이벤트 처리
    // @SubscribeMessage('drawPin')
    // handleDrawPin(client: any, data: { centerX: number; centerY: number; radius: number; playerId: string; customId: string; currentLevel: number, nailGroupNumber, nailCategory }) {
    //   let collisionCategory = data.nailCategory;
    //   let groupNumber = data.nailGroupNumber;

    //   if(!data.nailCategory) {
    //     // 고유한 충돌 카테고리 생성
    //     collisionCategory = this.nextCollisionCategory;
    //     this.nextCollisionCategory <<= 1; // 다음 카테고리로 증가
    //   }    

    //   if(!data.nailGroupNumber) {
    //     groupNumber = this.nextGroupNumber;
    //     this.nextGroupNumber -= 1;
    //   }

    //   // nail 데이터 저장
    //   this.nails.set(data.customId, {
    //     centerX: data.centerX,
    //     centerY: data.centerY,
    //     radius: data.radius,
    //     category: collisionCategory,
    //     groupNumber: groupNumber,
    //   });

    //   console.log(`Nail ${data.customId} created with category ${collisionCategory}`);

    //   // 클라이언트에 브로드캐스트
    //   this.server.emit('drawPin', {
    //     customId: data.customId,
    //     centerX: data.centerX,
    //     centerY: data.centerY,
    //     radius: data.radius,
    //     category: collisionCategory,
    //     groupNumber: groupNumber,
    //     playerId: data.playerId,
    //     currentLevel: data.currentLevel,
    //   });
    // }
    // ─────────────────────────────────────────────────────────
  // Pin(nail) 생성
  // ─────────────────────────────────────────────────────────
    @SubscribeMessage('drawPin')
    async handleDrawPin(
      client: Socket,
      data: {
        centerX: number;
        centerY: number;
        radius: number;
        points: Matter.Vector[];
        playerId: string;
        customId: string;
        currentLevel: number;
        targetBodyCustomId: string;
        nailGroupNumber?: number;
        nailCategory?: number;
      },
    ) {
      // 카테고리 (풀 사용)
      let collisionCategory = data.nailCategory; // 만약 클라이언트에서 직접 주면 그걸 사용
      if (!collisionCategory) {
        // 풀에서 하나를 대여(acquire)
        const acquired = this.pool.acquire();
        if (acquired == null) {
          // 카테고리가 더 이상 없으면 에러 처리 or 디폴트?
          console.warn('No available collision categories in the pool!');
          collisionCategory = 0x0002; // 임시 디폴트
        } else {
          collisionCategory = acquired;
        }
      }

      // groupNumber (기존 로직 유지)
      let groupNumber = data.nailGroupNumber;
      if (!groupNumber) {
        groupNumber = this.nextGroupNumber;
        this.nextGroupNumber -= 1;
      }

      // nail 데이터 저장
      this.nails.set(data.customId, {
        centerX: data.centerX,
        centerY: data.centerY,
        radius: data.radius,
        category: collisionCategory,
        groupNumber: groupNumber,
      });

      console.log("sdfsdffds")

      console.log(
        `Nail ${data.customId} created with category ${collisionCategory.toString(
          16,
        )}`,
      );
      console.log("sdfsdffsd")

      // 1) 풀에 현재 남아있는 카테고리 확인
      console.log(
        'Remaining categories after drawPin:',
        this.pool.getAvailableAsHexString()
      );

      await this.logAction(data.playerId, 'drawPin', data.currentLevel, data.customId, data.points, undefined, undefined, undefined, groupNumber, collisionCategory, undefined, data.targetBodyCustomId);

      // 모든 클라이언트에 브로드캐스트
      this.server.emit('drawPin', {
        customId: data.customId,
        centerX: data.centerX,
        centerY: data.centerY,
        radius: data.radius,
        category: collisionCategory,
        groupNumber: groupNumber,
        playerId: data.playerId,
        currentLevel: data.currentLevel,
      });
    }

    @SubscribeMessage('createChain')
    async handleCreateChain(
      client: Socket,
      payload: {
        playerId: string,
        customId: string,
        pinAId: string,
        pinBId: string,
        stiffness: number,
        damping: number,
        length: number,
        currentLevel: number,
      }
    ) {
      console.log('createChain from client:', payload);

      const pinsIDString = payload.pinAId + ';' + payload.pinBId;

      await this.logAction(payload.playerId, 'drawChain', payload.currentLevel, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, pinsIDString);
      this.server.emit('createChain', payload);
    }

    @SubscribeMessage('changeHingePosition')
      handleChangeHingePosition(
        @MessageBody() data: { level: number; hingePosIndex: 0|1|2; playerId: string },
        @ConnectedSocket() client: Socket,
      ) {
        // 보낸 클라이언트를 제외한 모두에게 재전파
        client.broadcast.emit('changeHingePosition', data);
      }


    @SubscribeMessage('releaseCategory')
    async handleReleaseCategory(client: Socket, payload: { playerId: string; currentLevel: number; category: number }) {
        console.log("payload: ", payload)
        if(payload.category) {
          this.pool.release(payload.category);
        }
    }

    @SubscribeMessage('resetLevel')
    async handleResetLevel(client: Socket, payload: { playerId: string; level: number }) {
        // 다른 클라이언트에게 브로드캐스트
        console.log("payload: ", payload);
        // client.broadcast.emit('resetLevel', payload);
        // this.nextCollisionCategory = 0x0002;
        this.pool.reset(this.categories);
        this.nails.clear();
        this.pushPermanentLock = false;
        

        await this.logAction(payload.playerId, 'resetLevel', payload.level);
        this.server.emit('resetLevel', payload);
    }

    @SubscribeMessage('erase')
    async handleErase(client: Socket, payload: { customId: string; playerId: string; currentLevel: number; isFall?: boolean }) {
        console.log("payload: ", payload)
        // client.broadcast.emit('erase', payload);

        // 1) nail Map에서 customId에 해당하는 nail 조회
        const nailData = this.nails.get(payload.customId);
        
        if (nailData) {
          console.log("nailData: ", nailData);
          // if(payload.isFall) {
          //   // 2) nail이 사용 중인 category를 pool에 반납
          //   this.pool.release(nailData.category);
          // }

          // 3) nail Map에서 해당 nail 삭제
          this.nails.delete(payload.customId);

          console.log(`Nail [${payload.customId}] removed and category [${nailData.category.toString(16)}] released to pool`);
        }

        // 2) 풀에 현재 남아있는 카테고리 확인
        console.log(
          'Remaining categories after erase:',
          this.pool.getAvailableAsHexString()
        );

        if (payload.isFall) {
          await this.logAction(payload.playerId, 'fall', payload.currentLevel, payload.customId);
        } else {
          await this.logAction(payload.playerId, 'erase', payload.currentLevel, payload.customId);
        }
        
        this.server.emit('erase', payload);
    }

    @SubscribeMessage('push')
    async handlePush(client: Socket, payload: { force: { x: number; y: number }; playerId: string; currentLevel: number }) {
        // 다른 클라이언트에게 브로드캐스트
        // client.broadcast.emit('push', payload);
        
        if(payload.currentLevel === 19 && this.pushPermanentLock) {
          await this.logAction(payload.playerId, payload.force.x > 0 ? 'left_push_notworking' : 'right_push_notworking', payload.currentLevel);
          console.log(payload.playerId, payload.force.x > 0 ? 'left_push_notworking' : 'right_push_notworking')
          return ;
        }

        const now = Date.now();
        const COOLDOWN_MS = 6000;
        const timeSinceLastPush = now - this.lastPushTime;

        if (timeSinceLastPush >= COOLDOWN_MS) {
          // 모든 클라이언트에게 브로드캐스트
          await this.logAction(payload.playerId, payload.force.x > 0 ? 'left_push' : 'right_push', payload.currentLevel);
          this.server.emit('push', payload);

          this.lastPushTime = now;

          // chage turn
          this.currentTurn = payload.playerId === 'player1' ? 'player2' : 'player1'; // 현재 턴 업데이트
          this.server.emit('updateTurn', { currentTurn: this.currentTurn }); // 전체 클라이언트에 브로드캐스트

          if(payload.currentLevel === 19 && !this.pushPermanentLock) {
            this.pushPermanentLock = true;
          }
          return ;
        }
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

        // // “딱 한 번만” 발생해야 하는 로직
        // if (!this.didTriggerOnce && payload.level === 7) {
        //   // 1) "4, 5, 6" 중 하나라도 this.completedLevels에 들어있으면
        //   const levelsToCheck = [4, 5, 6];
        //   const foundAny = levelsToCheck.some(l => this.completedLevels.has(l));

        //   if (foundAny) {
        //     // 2) 4, 5, 6을 모두 클리어 해제 (Set에서 제거)
        //     levelsToCheck.forEach(l => this.completedLevels.delete(l));

        //     // 3) 레벨을 4로 강제
        //     payload.level = 4;

        //     // 4) 이 로직이 다시 실행되지 않도록 플래그 설정
        //     this.didTriggerOnce = true;

        //     console.log(
        //       'Triggered once → forcing level to 4, removed [4,5,6] from completedLevels'
        //     );

        //     // (선택) completedLevels가 변경되었으니 전체 클라이언트에 알림
        //     this.server.emit('completedLevelsUpdated', {
        //       levels: Array.from(this.completedLevels),
        //     });
        //     payload.currentLevel = 4;
        //     this.server.emit('changeLevel', payload);
            
        //     // TODO: 초기화 이벤트 로그
        //     this.logAction(payload.playerId, 'reset_event', 7, undefined, undefined, undefined, undefined, 4, undefined, undefined, undefined, undefined, undefined)

        //     return ;
        //   }
        // }

        this.pool.reset(this.categories);
        this.nails.clear();
        this.pushPermanentLock = false;

        await this.logAction(payload.playerId, 'changeLevel', payload.currentLevel, undefined, undefined, undefined, payload.direction, payload.level);
        this.server.emit('changeLevel', payload);
    }

    @SubscribeMessage('resetEvent')
    async handleResetEvent(client: Socket, payload: { currentLevel: number; level: number }) {

      // // 1) "4, 5, 6, 7, 8, 9, 10" 중 하나라도 this.completedLevels에 들어있으면
      // const levelsToCheck = [4, 5, 6, 7, 8, 9, 10];
      // const foundAny = levelsToCheck.some(l => this.completedLevels.has(l));

      // if (foundAny) {
      //   // 2) 4, 5, 6을 모두 클리어 해제 (Set에서 제거)
      //   levelsToCheck.forEach(l => this.completedLevels.delete(l));

      //   console.log(
      //     `Triggered once → forcing level to ${payload.level}, removed [4,5,6,7,8,9,10] from completedLevels`
      //   );

      //   // (선택) completedLevels가 변경되었으니 전체 클라이언트에 알림
      //   this.server.emit('completedLevelsUpdated', {
      //     levels: Array.from(this.completedLevels),
      //   });
        
      //   const changeLevelPayload = {
      //     level: payload.level, 
      //     direction: '',
      //     playerId: 'system',
      //   }
        
      //   this.server.emit('changeLevel', changeLevelPayload);
        
      //   // TODO: 초기화 이벤트 로그
      //   this.logAction('system', 'reset_event', payload.currentLevel, undefined, undefined, undefined, undefined, payload.level, undefined, undefined, undefined, undefined, undefined);

      //   return ;
      // }
      return;
    }

    @SubscribeMessage('completeLevel')
    async handleCompleteLevel(client: Socket, payload: { completedLevel:number; playerId: string }) {
        await this.logAction(payload.playerId, 'completeLevel', payload.completedLevel, undefined, undefined, undefined, undefined, undefined);

        // 2) 전역 Set에 해당 레벨을 추가
        this.completedLevels.add(payload.completedLevel);
        console.log(
          `Player [${payload.playerId}] completed level ${payload.completedLevel}. Current completed set:`,
          this.completedLevels
        );

        // 3) 전체 클라이언트에 브로드캐스트 (선택)
        //    모든 클라이언트가 "이 레벨이 완료됨"을 알 수 있음
        this.server.emit('completeLevel', payload);

        // 4) 만약 "클라이언트가 자동으로 현재 completedLevels를 갱신"하도록 하려면,
        //    아래 같이 전체 클라이언트에 "completedLevelsUpdated" 같은 이벤트로 전송해도 됨:
        this.server.emit('completedLevelsUpdated', {
          levels: Array.from(this.completedLevels),
        });
    }

    // ─────────────────────────────────────────────────────────
    // getCompletedLevels: 현재까지 완료된 레벨 목록을 조회
    // ─────────────────────────────────────────────────────────
    @SubscribeMessage('getCompletedLevels')
    handleGetCompletedLevels(client: Socket) {
      const levelsArray = Array.from(this.completedLevels);
      // 현재까지 클리어된 레벨을 요청자에게만 전달
      client.emit('completedLevelsResponse', { levels: levelsArray });
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

    @SubscribeMessage('registerPin')
    handleRegisterPin(
      client: Socket,
      data: {
        centerX: number;
        centerY: number;
        radius: number;
        playerId: string;
        customId: string;
        currentLevel: number;
        nailGroupNumber?: number;
        nailCategory?: number;
      },
    ) {
      if(this.nails.get(data.customId)) return ;
      // 카테고리 (풀 사용)
      let collisionCategory = data.nailCategory; // 만약 클라이언트에서 직접 주면 그걸 사용
      if (!collisionCategory) {
        // 풀에서 하나를 대여(acquire)
        const acquired = this.pool.acquire();
        if (acquired == null) {
          // 카테고리가 더 이상 없으면 에러 처리 or 디폴트?
          console.warn('No available collision categories in the pool!');
          collisionCategory = 0x0002; // 임시 디폴트
        } else {
          collisionCategory = acquired;
        }
      }

      // groupNumber (기존 로직 유지)
      let groupNumber = data.nailGroupNumber;
      if (!groupNumber) {
        groupNumber = this.nextGroupNumber;
        this.nextGroupNumber -= 1;
      }

      // nail 데이터 저장
      this.nails.set(data.customId, {
        centerX: data.centerX,
        centerY: data.centerY,
        radius: data.radius,
        category: collisionCategory,
        groupNumber: groupNumber,
      });

      console.log(
        `Nail ${data.customId} created with category ${collisionCategory.toString(
          16,
        )}`,
      );

      // 1) 풀에 현재 남아있는 카테고리 확인
      console.log(
        'Remaining categories after drawPin:',
        this.pool.getAvailableAsHexString()
      );
    }

    @SubscribeMessage('getNextCategory')
    handleGetNextCategory(client: Socket, payload: { playerId: string; currentLevel: number; }) {
      // 풀에서 '다음 카테고리'가 무엇인지 확인만 (remove X)
      const peeked = this.pool.peek();
      if (peeked == null) {
        // 풀이 비어 있는 경우
        client.emit('nextCategoryResponse', {
          success: false,
          message: 'No categories left in pool',
        });
        return;
      }

      // 풀 상태는 그대로 유지
      console.log(`Player [${payload.playerId}] peeked next category -> 0x${peeked.toString(16)}`);
      client.emit('nextCategoryResponse', {
        success: true,
        category: peeked,
      });
    }
  }