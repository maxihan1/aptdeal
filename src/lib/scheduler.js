/**
 * 서버 내장 스케줄러
 * 
 * node-cron으로 데이터 동기화를 자동 실행합니다.
 * child_process.fork()로 별도 프로세스에서 실행하여 메인 서버에 영향 없음.
 * 
 * 스케줄:
 *   - 서버 시작 시: 즉시 daily sync 1회 실행
 *   - 매일 새벽 4시 (KST): daily sync (최근 3개월)
 *   - 매주 월요일 새벽 3시 (KST): weekly sync (최근 6개월 + 보완 작업)
 */

import cron from 'node-cron';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 동기화 스크립트 경로
const SYNC_SCRIPT = path.join(__dirname, '..', 'scripts', 'data-loader', '06_daily_sync.js');

// 동기화 상태 관리
const syncState = {
  isRunning: false,
  currentMode: null,
  lastRun: {
    daily: null,
    weekly: null,
  },
  lastResult: {
    daily: null,
    weekly: null,
  },
  schedulerStartedAt: null,
  nextScheduled: {
    daily: '매일 04:00 KST',
    weekly: '매주 월요일 03:00 KST',
  },
};

/**
 * 동기화 스크립트를 별도 프로세스로 실행
 * @param {'daily' | 'weekly'} mode - 실행 모드
 * @returns {Promise<void>}
 */
function runSync(mode) {
  return new Promise((resolve, reject) => {
    // 이미 실행 중이면 건너뜀
    if (syncState.isRunning) {
      console.log(`[Scheduler] ⚠️ 동기화 이미 실행 중 (${syncState.currentMode}), ${mode} 건너뜀`);
      resolve();
      return;
    }

    syncState.isRunning = true;
    syncState.currentMode = mode;
    const startTime = new Date();

    console.log(`[Scheduler] 🚀 ${mode} 동기화 시작 (${startTime.toISOString()})`);

    const child = fork(SYNC_SCRIPT, [`--mode=${mode}`], {
      cwd: path.join(__dirname, '..', '..'),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    // 자식 프로세스 stdout/stderr를 서버 로그에 출력
    child.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) console.log(`[Sync:${mode}] ${line}`);
      });
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) console.error(`[Sync:${mode}] ${line}`);
      });
    });

    child.on('close', (code) => {
      const endTime = new Date();
      const elapsed = ((endTime - startTime) / 60000).toFixed(1);
      
      syncState.isRunning = false;
      syncState.currentMode = null;
      syncState.lastRun[mode] = endTime.toISOString();
      syncState.lastResult[mode] = code === 0 ? 'success' : `failed (exit code: ${code})`;

      if (code === 0) {
        console.log(`[Scheduler] ✅ ${mode} 동기화 완료 (${elapsed}분)`);
      } else {
        console.error(`[Scheduler] ❌ ${mode} 동기화 실패 (exit code: ${code}, ${elapsed}분)`);
      }

      resolve();
    });

    child.on('error', (err) => {
      syncState.isRunning = false;
      syncState.currentMode = null;
      syncState.lastResult[mode] = `error: ${err.message}`;
      console.error(`[Scheduler] ❌ ${mode} 동기화 프로세스 오류:`, err.message);
      reject(err);
    });
  });
}

/**
 * 스케줄러 초기화 및 시작
 * @param {object} options
 * @param {boolean} options.runOnStartup - 서버 시작 시 즉시 실행 여부 (기본: true)
 * @param {number} options.startupDelay - 시작 시 실행 전 대기 시간 ms (기본: 10초, 서버 준비 대기)
 */
export function initScheduler(options = {}) {
  const { runOnStartup = true, startupDelay = 10000 } = options;

  syncState.schedulerStartedAt = new Date().toISOString();

  console.log('[Scheduler] 📅 스케줄러 초기화');
  console.log('[Scheduler]    - Daily: 매일 04:00 KST (최근 3개월 동기화)');
  console.log('[Scheduler]    - Weekly: 매주 월요일 03:00 KST (최근 6개월 + 보완)');

  // 매일 새벽 4시 (KST = UTC+9, so UTC 19:00 = KST 04:00)
  // node-cron은 시스템 시간대를 따르므로, 서버가 UTC면 19시로 설정
  // AppPass 컨테이너가 UTC 기준이면 timezone 옵션 사용
  cron.schedule('0 4 * * *', async () => {
    console.log('[Scheduler] ⏰ Daily sync cron triggered');
    try {
      await runSync('daily');
    } catch (err) {
      console.error('[Scheduler] Daily sync error:', err.message);
    }
  }, {
    timezone: 'Asia/Seoul',
  });

  // 매주 월요일 새벽 3시 (KST)
  cron.schedule('0 3 * * 1', async () => {
    console.log('[Scheduler] ⏰ Weekly sync cron triggered');
    try {
      await runSync('weekly');
    } catch (err) {
      console.error('[Scheduler] Weekly sync error:', err.message);
    }
  }, {
    timezone: 'Asia/Seoul',
  });

  console.log('[Scheduler] ✅ Cron 스케줄 등록 완료');

  // 서버 시작 시 즉시 실행
  if (runOnStartup) {
    console.log(`[Scheduler] 🔄 ${startupDelay / 1000}초 후 즉시 daily sync 실행...`);
    setTimeout(async () => {
      try {
        await runSync('daily');
      } catch (err) {
        console.error('[Scheduler] Startup sync error:', err.message);
      }
    }, startupDelay);
  }
}

/**
 * 동기화 상태 반환 (API 엔드포인트용)
 */
export function getSyncStatus() {
  return {
    ...syncState,
    serverTime: new Date().toISOString(),
  };
}
