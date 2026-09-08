const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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
    players.push({
        id: socket.id,
        name: `ผู้เล่น ${players.length + 1}`,
        role: null,
        score: 0
    });

    io.emit('updatePlayers', players);

    socket.on('setName', (name) => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            player.name = name;
            io.emit('updatePlayers', players);
        }
    });

    socket.on('sendChatMessage', (message) => {
        const player = players.find(p => p.id === socket.id);
        const senderName = player ? player.name : 'Unknown';
        io.emit('newChatMessage', { sender: senderName, message: message });
    });

    socket.on('startGame', () => {
        if (players.length < 3) {
            socket.emit('errorMsg', 'ต้องมีผู้เล่นอย่างน้อย 3 คนขึ้นไปถึงจะเริ่มเกมได้');
            return;
        }

        gameState.isStarted = true;
        gameState.votes = {};
        gameState.votedPlayers.clear();

        const selectedTarget = footballers[Math.floor(Math.random() * footballers.length)];
    gameState.secretFootballer = selectedTarget;

    const spyIndex = Math.floor(Math.random() * players.length);
    gameState.spyId = players[spyIndex].id;

    // ฟังก์ชันช่วยดึงตำแหน่งหลัก (เช่น "CM / RM", "MF", "CB" ตัดเอาคำแรก)
    const getPrimaryPos = (posStr) => {
        if (!posStr) return "";
        return posStr.split(/[\/\s-,]+/)[0].toUpperCase();
    };

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
    let spyPlayer = players.find(p => p.id === gameState.spyId);
    if (!spyPlayer && players.length > 0) {
        const randomSpy = players[Math.floor(Math.random() * players.length)];
        gameState.spyId = randomSpy.id;
    }
        
        players.forEach(p => {
            if (p.id === gameState.spyId) {
                p.role = 'SPY';
                io.to(p.id).emit('assignRole', {
                    role: 'SPY',
                    decoyName: selectedDecoy.name,
                    position: selectedDecoy.position,
                    foot: selectedDecoy.foot
                });
            } else {
                p.role = 'PLAYER';
                io.to(p.id).emit('assignRole', {
                    role: 'PLAYER',
                    name: selectedTarget.name
                });
            }
        });

        const playOrder = shuffleArray(players);
        io.emit('gameStarted', { playOrder: playOrder });
        startTimer();
    });

    socket.on('castVote', (targetId) => {
        if (!gameState.isStarted || gameState.votedPlayers.has(socket.id)) return;

        gameState.votedPlayers.add(socket.id);
        gameState.votes[targetId] = (gameState.votes[targetId] || 0) + 1;

        io.emit('voteUpdated', gameState.votedPlayers.size, players.length);

        if (gameState.votedPlayers.size === players.length) {
            clearInterval(gameTimer);
            let maxVotes = 0;
            let suspectedId = null;

            for (const [pId, count] of Object.entries(gameState.votes)) {
                if (count > maxVotes) {
                    maxVotes = count;
                    suspectedId = pId;
                }
            }

            const spyPlayer = players.find(p => p.id === gameState.spyId);

            // โหวตจับ SPY ถูกตัวหรือไม่?
            if (suspectedId === gameState.spyId) {
                // โหวตถูกตัว -> ให้ SPY ได้โอกาสสุดท้ายในการพิมพ์ทายคำตอบ
                io.to(gameState.spyId).emit('spyMustGuess');
                
                players.forEach(p => {
                    if (p.id !== gameState.spyId) {
                        io.to(p.id).emit('waitingForSpyGuess');
                    }
                });
            } else {
                // โหวตผิดตัว -> SPY ชนะทันที (+2 คะแนน)!
                if (spyPlayer) spyPlayer.score += 2;
                const suspectedPlayer = players.find(p => p.id === suspectedId);
                
                io.emit('finalResult', {
                    winner: 'SPY',
                    reason: 'voteWrong',
                    suspectedName: suspectedPlayer ? suspectedPlayer.name : 'ไม่มี',
                    spyName: spyPlayer ? spyPlayer.name : 'SPY',
                    secretFootballer: gameState.secretFootballer.name,
                    decoyFootballer: gameState.decoyFootballer.name
                });

                gameState.isStarted = false;
                io.emit('updatePlayers', players);
            }
        }
    });

    socket.on('spyGuess', (guessedName) => {
        if (!gameState.isStarted || socket.id !== gameState.spyId) return;

        const isCorrect = isFlexibleMatch(guessedName.trim(), gameState.secretFootballer.name);
        const spyPlayer = players.find(p => p.id === gameState.spyId);

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
                if (p.id !== gameState.spyId) p.score += 1;
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
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
