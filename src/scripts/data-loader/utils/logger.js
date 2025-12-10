/**
 * 로깅 유틸리티
 * 콘솔 및 파일 로깅 지원
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 로그 디렉토리 생성
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 현재 날짜로 로그 파일명 생성
function getLogFileName(prefix = 'app') {
    const date = new Date().toISOString().split('T')[0];
    return path.join(LOG_DIR, `${prefix}_${date}.log`);
}

/**
 * 타임스탬프 생성
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * 일반 로그
 * @param {...any} args - 로그 메시지
 */
export function log(...args) {
    const timestamp = getTimestamp();
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ');

    console.log(`[${timestamp}]`, ...args);

    // 파일에 기록
    fs.appendFileSync(
        getLogFileName('info'),
        `[${timestamp}] ${message}\n`
    );
}

/**
 * 에러 로그
 * @param {...any} args - 에러 메시지
 */
export function logError(...args) {
    const timestamp = getTimestamp();
    const message = args.map(arg => {
        if (arg instanceof Error) {
            return `${arg.message}\n${arg.stack}`;
        }
        return typeof arg === 'object' ? JSON.stringify(arg) : arg;
    }).join(' ');

    console.error(`[${timestamp}] ❌`, ...args);

    // 파일에 기록
    fs.appendFileSync(
        getLogFileName('error'),
        `[${timestamp}] ${message}\n`
    );
}

/**
 * 진행 상황 로그 (같은 줄에 업데이트)
 * @param {string} message - 진행 메시지
 */
export function logProgress(message) {
    process.stdout.write(`\r${message}                    `);
}

/**
 * 진행 상황 종료 (줄바꿈)
 */
export function logProgressEnd() {
    console.log();
}

/**
 * 성공 로그
 * @param {...any} args - 성공 메시지
 */
export function logSuccess(...args) {
    const timestamp = getTimestamp();
    console.log(`[${timestamp}] ✅`, ...args);

    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ');

    fs.appendFileSync(
        getLogFileName('info'),
        `[${timestamp}] ✅ ${message}\n`
    );
}

/**
 * 경고 로그
 * @param {...any} args - 경고 메시지
 */
export function logWarning(...args) {
    const timestamp = getTimestamp();
    console.warn(`[${timestamp}] ⚠️`, ...args);

    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ');

    fs.appendFileSync(
        getLogFileName('warning'),
        `[${timestamp}] ${message}\n`
    );
}

/**
 * 구분선 출력
 * @param {string} title - 섹션 제목
 */
export function logSection(title) {
    console.log('\n' + '='.repeat(60));
    console.log(`  ${title}`);
    console.log('='.repeat(60) + '\n');
}

/**
 * 통계 로그
 * @param {object} stats - 통계 객체
 */
export function logStats(stats) {
    console.log('\n📊 통계:');
    Object.entries(stats).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
    });
    console.log();
}

export default {
    log,
    logError,
    logProgress,
    logProgressEnd,
    logSuccess,
    logWarning,
    logSection,
    logStats,
};
