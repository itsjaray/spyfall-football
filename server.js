const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ตัวแปรสำหรับเก็บประวัติรอบที่แล้วและสรุปเกม
let previousRoundSecret = null;
let previousRoundDecoy = null;
let roundCount = 0; // ตัวแปรนับรอบเกม

let lastGameSummary = {
    secret: null,
    secretPos: null,
    decoy: null,
    decoyPos: null
};

app.use(express.static('public'));

// โหลดฐานข้อมูลนักเตะจากไฟล์ players.json อัตโนมัติ
let footballers = [];
try {
    const rawData = fs.readFileSync(path.join(__dirname, 'players.json'), 'utf8');
    footballers = JSON.parse(rawData);
    console.log(`โหลดรายชื่อนักเตะสำเร็จทั้งหมด: ${footballers.length} คน`);
} catch (error) {
    console.error("ไม่สามารถโหลดไฟล์ players.json ได้:", error);
    // กรณีหาไฟล์ไม่เจอ ให้ใช้ค่าสำรองกันเว็บพัง
    footballers = [
        { name: "Lionel Messi", position: "RW/AM", foot: "Left" },
        { name: "Cristiano Ronaldo", position: "ST", foot: "Right" }
    ];
}

let players = [];
let gameState = {
    isStarted: false,
    secretFootballer: null,
    spyId: null,
    votes: {},
    votedPlayers: new Set()
};

let gameTimer = null;
let timeRemaining = 180;

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ฟังก์ชันคำนวณ Levenshtein Distance ตรวจคำสะกดใกล้เคียง
function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[a.length][b.length];
}

// ฟังก์ชันตรวจว่าคำตอบของ SPY ใกล้เคียงคำตอบจริงหรือไม่
function isFlexibleMatch(input, target) {
    const cleanInput = input.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (!cleanInput) return false;

    // ถ้ามีส่วนหนึ่งตรงกันเป๊ะ เช่น พิมพ์นามสกุล "messi" หรือชื่อ "lionel"
    const targetParts = target.toLowerCase().split(' ').map(p => p.replace(/[^a-z0-9]/g, ''));
    if (cleanTarget.includes(cleanInput) || targetParts.some(part => part.length >= 3 && cleanInput.includes(part))) {
        return true;
    }

    // ตรวจระยะความต่างของอักขระ (ยอมให้สะกดผิดได้เล็กน้อย)
    const distance = levenshteinDistance(cleanInput, cleanTarget);
    const maxAllowedDiff = Math.max(2, Math.floor(cleanTarget.length * 0.35));
    return distance <= maxAllowedDiff;
}

function startTimer() {
    clearInterval(gameTimer);
    timeRemaining = 180;
    io.emit('timerUpdate', timeRemaining);

    gameTimer = setInterval(() => {
        timeRemaining--;
        io.emit('timerUpdate', timeRemaining);

        if (timeRemaining <= 0) {
            clearInterval(gameTimer);
            io.emit('timeUp');
        }
    }, 1000);
}

io.on('connection', (socket) => {
    // 1. ดึงชื่อที่แนบมากับ query ตอนเชื่อมต่อ
    const clientName = socket.handshake.query.name;
    const initialName = (clientName && clientName.trim() !== '') ? clientName.trim() : 'ผู้เล่น';

    // 2. ป้องกันเคสรีเฟรชแล้วไอดีค้างซ้อนกัน
    players = players.filter(p => p.id !== socket.id);

    // 3. เพิ่มผู้เล่นเข้ามาด้วยชื่อเดิม (หรือ 'ผู้เล่น' ถ้ายังไม่เคยตั้ง) ตั้งแต่ทีแรกเลย
    players.push({
        id: socket.id,
        name: initialName,
        role: null,
        score: 0
    });

    io.emit('updatePlayers', players);

    // 2. ย้าย Event ของ socket ทั้งหมดมาไว้ข้างในนี้
    socket.on('disconnect', () => {
        const index = players.findIndex(p => p.id === socket.id);
        if (index !== -1) {
            players.splice(index, 1);
            io.emit('updatePlayers', players);
        }
    });

    socket.on('setName', (name) => {
        const player = players.find(p => p.id === socket.id);
        if (player && name) {
            player.name = name.trim() || 'ผู้เล่น';
            io.emit('updatePlayers', players);
        }
    });

    // รับคำสั่งรีเซ็ตห้องจากปุ่ม Home
    socket.on('resetRoom', () => {
        // เคลียร์บทบาทและสถานะเกมของผู้เล่นทุกคน แต่คงคะแนนไว้
        players.forEach(player => {
            player.role = null; 
        });

        // ส่งสัญญาณบอกทุกคนในห้องให้รีเซ็ตหน้าจอและเวลาพร้อมกัน
        io.emit('gameReset', players);
    });

    socket.on('sendChatMessage', (message) => {
        const player = players.find(p => p.id === socket.id);
        const senderName = player ? player.name : 'Unknown';
        
        const timestamp = new Date().toLocaleTimeString('th-TH', {
            timeZone: 'Asia/Bangkok',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }) + ' น.';

        io.emit('newChatMessage', {
            sender: senderName,
            message: message,
            timestamp: timestamp
        });
    });


    // แจ้งเตือนคนอื่นว่ากำลังพิมพ์อยู่
    socket.on('typing', (data) => {
    // ส่งชื่อคนที่กำลังพิมพ์ไปบอกทุกคน ยกเว้นคนที่พิมพ์อยู่เอง
    socket.broadcast.emit('displayTyping', { senderName: data.senderName });
    });

    socket.on('stopTyping', () => {
    socket.broadcast.emit('hideTyping');
    });

    socket.on('startGame', (data) => {
    const requestedSpyCount = data && data.spyCount ? parseInt(data.spyCount) : 1;
    const maxAllowedSpies = players.length - 2;

    if (players.length < 3 || requestedSpyCount > maxAllowedSpies) {
        socket.emit('errorMsg', `ไม่สามารถเลือก Spy ${requestedSpyCount} คนได้ (มีผู้เล่น ${players.length} คน เลือกสปายได้สูงสุด ${Math.max(1, maxAllowedSpies)} คนครับ)`);
        return;
    }

        // 1. นำข้อมูลของรอบปัจจุบัน (ก่อนจะสุ่มใหม่) ไปเก็บไว้เป็น "รอบที่แล้ว"
    if (gameState.secretFootballer && gameState.secretFootballer.name) {
        previousRoundSecret = gameState.secretFootballer;
        previousRoundDecoy = gameState.decoyFootballer;
    }

    roundCount++; // นับเพิ่ม 1 รอบ

    gameState.isStarted = true;
    gameState.votes = {};
    gameState.votedPlayers.clear();

        

        const selectedTarget = footballers[Math.floor(Math.random() * footballers.length)];
    gameState.secretFootballer = selectedTarget;

    const shuffledPlayers = [...players].sort(() => 0.5 - Math.random());
    const spyCountInput = data && data.spyCount ? data.spyCount : 1;
    const spies = shuffledPlayers.slice(0, spyCountInput);
    const spyIds = new Set(spies.map(p => p.id));
    
    gameState.spyIds = Array.from(spyIds);

        // ฟังก์ชันช่วยดึงตำแหน่งหลัก (เช่น "CM / RM", "MF", "CB" ตัดเอาคำแรก)
    const getPrimaryPos = (posStr) => {
        if (!posStr) return "";
        return posStr.split(/[\/\s-,]+/)[0].toUpperCase();
    };

    const targetPrimaryPos = getPrimaryPos(selectedTarget.position);
    const targetFoot = selectedTarget.foot ? selectedTarget.foot.trim().toLowerCase() : "";

    // 1. ค้นหาคนที่ "ตำแหน่งหลักตรงกันเป๊ะๆ" ก่อนเป็นอันดับแรก
    let validDecoys = footballers.filter(f => {
        if (f.name === selectedTarget.name) return false;
        const fPrimaryPos = getPrimaryPos(f.position);
        return targetPrimaryPos && fPrimaryPos && (targetPrimaryPos === fPrimaryPos);
    });

    // 2. ถ้าไม่มีตำแหน่งเดียวกันจริงๆ ค่อยผ่อนปรนให้หาคนที่มี "เท้าที่ถนัดข้างเดียวกัน"
    if (validDecoys.length === 0) {
        validDecoys = footballers.filter(f => {
            if (f.name === selectedTarget.name) return false;
            const fFoot = f.foot ? f.foot.trim().toLowerCase() : "";
            return targetFoot && fFoot && (targetFoot === fFoot);
        });
    }

    // 3. ถ้ายังหาไม่ได้อีก เอาใครก็ได้ที่ไม่ใช่คนเดิม
    if (validDecoys.length === 0) {
        validDecoys = footballers.filter(f => f.name !== selectedTarget.name);
    }

    const selectedDecoy = validDecoys[Math.floor(Math.random() * validDecoys.length)];
    gameState.decoyFootballer = selectedDecoy;

// สุ่มหรือตรวจสอบไอดี SPY ให้แน่ใจว่ามีอยู่จริงก่อนแจกบทบาท
    if (!gameState.spyIds || gameState.spyIds.length === 0) {
        const randomSpy = players[Math.floor(Math.random() * players.length)];
        gameState.spyIds = [randomSpy.id];
    }

       
        
       players.forEach(p => {
    if (spyIds.has(p.id)) {
        p.role = 'SPY';
        io.to(p.id).emit('assignRole', {
            role: 'SPY',
            decoyName: selectedDecoy ? selectedDecoy.name : '???',
            position: selectedDecoy ? selectedDecoy.position : '???',
            foot: selectedDecoy ? selectedDecoy.foot : '???'
        });
    } else {
        p.role = 'PLAYER';
        io.to(p.id).emit('assignRole', {
            role: 'PLAYER',
            name: selectedTarget.name,
            position: targetPrimaryPos, 
            foot: targetFoot        
        });
    }
});

        const playOrder = shuffleArray(players);

// จัดเตรียมข้อมูลสรุปของรอบที่แล้วจากตัวแปรสำรอง
    let summaryToSend = { secret: "", secretPos: "", decoy: "", decoyPos: "" };
    if (previousRoundSecret) {
        summaryToSend.secret = previousRoundSecret.name;
        summaryToSend.secretPos = previousRoundSecret.position || "";
        summaryToSend.decoy = previousRoundDecoy ? previousRoundDecoy.name : "";
        summaryToSend.decoyPos = previousRoundDecoy ? previousRoundDecoy.position : "";
    }
    
    io.emit('gameStarted', { 
        playOrder: playOrder,
        lastGame: summaryToSend,
        roundCount: roundCount
    });

    setTimeout(() => {
        startTimer();
    }, 3000);
        
    });

    socket.on('castVote', (targetId) => {
    if (!gameState.isStarted || gameState.votedPlayers.has(socket.id)) return;

    gameState.votedPlayers.add(socket.id);
    gameState.votes[targetId] = (gameState.votes[targetId] || 0) + 1;

    // เพิ่มบรรทัดนี้เพื่อเช็กข้อมูลใน Terminal/Log ของ Server
    console.log(`[VOTE] ผู้เล่น ${socket.id} โหวตให้ targetId: ${targetId} | Spy ตัวจริงคือ: ${gameState.spyIds}`);

    io.emit('voteUpdated', gameState.votedPlayers.size, players.length);

        if (gameState.votedPlayers.size === players.length) {
        clearInterval(gameTimer);
        let maxVotes = -1;
        let suspectedId = null;

        for (const [pid, count] of Object.entries(gameState.votes)) {
            if (count > maxVotes) {
                maxVotes = count;
                suspectedId = pid;
            }
        }

        const spyPlayer = players.find(p => p.id === gameState.spyIds);

        // โหวตจับ SPY ถูกตัวหรือไม่?
        if (gameState.spyIds && gameState.spyIds.includes(suspectedId)) {
            // โหวตถูก -> ให้ SPY ได้โอกาสสุดท้ายในการพิมพ์ทายคำตอบ
            io.to(gameState.spyIds).emit('spyMustGuess');

            players.forEach(p => {
                if (p.id !== gameState.spyIds) {
                    io.to(p.id).emit('waitingForSpyGuess');
                }
            });
       } else {
        // โหวตผิดตัว -> SPY ชนะทันที (+2 คะแนน)
        const spyPlayers = players.filter(p => gameState.spyIds && gameState.spyIds.includes(p.id));
        spyPlayers.forEach(sp => sp.score += 2);
        const spyNamesStr = spyPlayers.map(p => p.name).join(', ');

        const suspectedPlayer = players.find(p => p.id === suspectedId);

        io.emit('finalResult', {
            winner: 'SPY',
            reason: 'voteWrong',
            suspectedName: suspectedPlayer ? suspectedPlayer.name : 'ไม่มี',
            spyName: spyNamesStr, // <--- ใช้ตัวแปรนี้แทน จะแสดงชื่อ/เลขของ Spy จริงๆ เช่น "2"
            secretFootballer: gameState.secretFootballer.name,
            decoyFootballer: gameState.decoyFootballer.name
        });

            gameState.isStarted = false;
            io.emit('updatePlayers', players);
        }
    }
    });

    socket.on('spyGuess', (guessedName) => {
        if (!gameState.isStarted || !gameState.spyIds.includes(socket.id)) return;

        // ป้องกันกรณีไม่ได้พิมพ์มา หรือค่าว่าง ให้ถือว่าทายผิดทันที
        const trimmedGuess = guessedName ? guessedName.trim() : '';
        const isCorrect = trimmedGuess !== '' && isFlexibleMatch(trimmedGuess, gameState.secretFootballer.name);
        const spyPlayer = players.find(p => gameState.spyIds.includes(p.id));

        if (isCorrect) {
            // SPY พิมพ์ทายถูก -> SPY พลิกกลับมาชนะ (+2 คะแนน)
            if (spyPlayer) spyPlayer.score += 2;
            io.emit('finalResult', {
                winner: 'SPY',
                reason: 'spyGuessedCorrect',
                spyName: spyPlayer ? spyPlayer.name : 'SPY',
                secretFootballer: gameState.secretFootballer.name,
                decoyFootballer: gameState.decoyFootballer.name,
                spyGuess: guessedName
            });
        } else {
            // SPY พิมพ์ทายผิด -> ฝั่งคนธรรมดาชนะ (+1 คะแนนทุกคน)
            players.forEach(p => {
                if (!gameState.spyIds.includes(p.id)) p.score += 1;
            });
            io.emit('finalResult', {
                winner: 'PLAYERS',
                reason: 'spyGuessedWrong',
                spyName: spyPlayer ? spyPlayer.name : 'SPY',
                secretFootballer: gameState.secretFootballer.name,
                decoyFootballer: gameState.decoyFootballer.name,
                spyGuess: guessedName
            });
        }

        gameState.isStarted = false;
        io.emit('updatePlayers', players);
    });

    socket.on('resetScores', () => {
        players.forEach(p => p.score = 0);
        io.emit('updatePlayers', players);
    });

    socket.on('kickPlayer', (targetId) => {
        players = players.filter(p => p.id !== targetId);
        io.to(targetId).emit('kicked');
        io.emit('updatePlayers', players);
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('updatePlayers', players);
    });

// รับคำสั่งเมื่อผู้เล่นกดขอผลสรุปเกมรอบที่แล้ว
    socket.on('getLastGameResult', () => {
        if (!lastGameSummary.secret) {
            socket.emit('errorMsg', 'ยังไม่มีประวัติการเล่นในรอบนี้');
            return;
        }
        
        socket.emit('lastGameResultResponse', {
            secret: lastGameSummary.secret,
            secretPos: lastGameSummary.secretPos,
            decoy: lastGameSummary.decoy,
            decoyPos: lastGameSummary.decoyPos
        });
    });
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
