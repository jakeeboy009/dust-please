// Node.js 내장 모듈 로드 (별도 패키지 설치 없이 작동)
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 포트 번호 설정 (기본 3000번)
const PORT = process.env.PORT || 3000;

// .env.local 파일에서 환경변수 로드 함수
function loadEnvLocal() {
    const envPath = path.join(__dirname, '.env.local');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            // 주석(#)이 아니고 키=값 형태인 줄 파싱
            if (trimmed && !trimmed.startsWith('#')) {
                const equalsIndex = trimmed.indexOf('=');
                if (equalsIndex !== -1) {
                    const key = trimmed.slice(0, equalsIndex).trim();
                    const value = trimmed.slice(equalsIndex + 1).trim();
                    process.env[key] = value;
                }
            }
        });
        console.log('[설정] .env.local 환경변수가 로드되었습니다.');
    } else {
        console.warn('[경고] .env.local 파일이 없습니다.');
    }
}

// 환경변수 초기화
loadEnvLocal();

// api/dust.js 핸들러 불러오기
let dustHandler;
try {
    dustHandler = require('./api/dust.js');
} catch (err) {
    console.error('[오류] api/dust.js 파일을 불러올 수 없습니다:', err);
}

// 파일 확장자에 따른 MIME 타입 매핑
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// HTTP 서버 생성
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // 1. /api/dust 요청 처리 (Vercel 서버리스 함수 모방)
    if (pathname === '/api/dust') {
        if (!dustHandler) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ error: '서버리스 핸들러를 찾을 수 없습니다.' }));
        }

        // Vercel Serverless Function 형태의 req, res 인터페이스 모방
        req.query = parsedUrl.query;

        // res.status(code).json(data) 헬퍼 메서드 추가
        res.status = function(code) {
            this.statusCode = code;
            return this;
        };
        res.json = function(data) {
            this.setHeader('Content-Type', 'application/json; charset=utf-8');
            this.setHeader('Access-Control-Allow-Origin', '*');
            this.end(JSON.stringify(data));
        };

        try {
            await dustHandler(req, res);
        } catch (handlerErr) {
            console.error('[핸들러 에러]', handlerErr);
            if (!res.headersSent) {
                res.status(500).json({ error: handlerErr.message });
            }
        }
        return;
    }

    // 2. 정적 파일 서빙 (index.html, style.css, script.js 등)
    let safePath = pathname === '/' ? '/index.html' : pathname;
    // 상위 디렉터리 접근 방지
    safePath = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(__dirname, safePath);

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('404 Not Found: 요청한 파일을 찾을 수 없습니다.');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    });
});

// 서버 실행
server.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`  대기오염 정보 모니터링 웹앱이 실행되었습니다.`);
    console.log(`  접속 주소: http://localhost:${PORT}`);
    console.log(`=================================================`);
});

