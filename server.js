const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let previousRoundSecret = null;
let previousRoundDecoy = null;
let roundCount = 0;

let lastGameSummary = {
    secret: null,
    secretPos: null,
    decoy: null,
    decoyPos: null
};

app.use(express.static('public'));

let footballers = [];
try {
    const rawData = fs.readFileSync(path.join(__dirname, 'players.json'), 'utf8');
    footballers = JSON.parse(rawData);
    console.log(`โหลดรายชื่อนักเตะสำเร็จทั้งหมด: ${footballers.length} คน`);
} catch (error) {
    console.error("ไม่สามารถโหลดไฟล์ players.json ได้:", error);
    footballers = [
        { name: "Lionel Messi", position: "RW/AM", nationality: "Argentina", foot: "Left", current_team: "Inter Miami", image: "" },
        { name: "Mohamed Salah", position: "RW", nationality: "Egypt", foot: "Left", current_team: "Liverpool", image: "" }
    ];
}

let recentSpies = new Set(); // เก็บรายชื่อ ID ของคนที่เพิ่งเป็น Spy ในตาก่อนหน้า

// เพิ่มตัวแปรเก็บประวัตินักเตะที่เพิ่งออกไป (ใส่ไว้บนสุดของไฟล์หรือแถวที่มีตัวแปร gameState)
let recentTargets = [];
let recentDecoys = [];

let players = [];
let gameState = {
    isStarted: false,
    isSpyGuessing: false,
    secretFootballer: null,
    decoyFootballer: null,
    spyIds: [],
    spyNames: [],
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

function isFlexibleMatch(input, target) {
    const cleanInput = input.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (!cleanInput) return false;

    const targetParts = target.toLowerCase().split(' ').map(p => p.replace(/[^a-z0-9]/g, ''));
    if (cleanTarget.includes(cleanInput) || targetParts.some(part => part.length >= 3 && cleanInput.includes(part))) {
        return true;
    }

    const distance = levenshteinDistance(cleanInput, cleanTarget);
    const maxAllowedDiff = Math.max(2, Math.floor(cleanTarget.length * 0.35));
    return distance <= maxAllowedDiff;
}

function startTimer() {
    if (gameTimer) clearInterval(gameTimer);
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
    const clientName = socket.handshake.query.name;
    const initialName = (clientName && clientName.trim() !== '') ? clientName.trim() : 'ผู้เล่น';

    players = players.filter(p => p.id !== socket.id);
    players.push({
        id: socket.id,
        name: initialName,
        role: null,
        score: 0
    });

    io.emit('updatePlayers', players);

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('updatePlayers', players);
    });

    socket.on('setName', (name) => {
        const player = players.find(p => p.id === socket.id);
        if (player && name) {
            player.name = name.trim() || 'ผู้เล่น';
            io.emit('updatePlayers', players);
        }
    });

    socket.on('startGame', (data) => {
        if (players.length < 3) {
            socket.emit('errorMsg', 'ไม่สามารถเริ่มเกมได้ ต้องมีผู้เล่นขั้นต่ำ 3 คนขึ้นไป');
            return;
        }

        if (gameState.secretFootballer && gameState.secretFootballer.name) {
            previousRoundSecret = gameState.secretFootballer;
            previousRoundDecoy = gameState.decoyFootballer;
            lastGameSummary = {
                secret: previousRoundSecret.name,
                secretPos: previousRoundSecret.position || "",
                decoy: previousRoundDecoy ? previousRoundDecoy.name : "",
                decoyPos: previousRoundDecoy ? previousRoundDecoy.position : ""
            };
        }

        roundCount++;
        gameState.isStarted = true;
        gameState.votes = {};
        gameState.votedPlayers.clear();

        const playerPool = Array.isArray(footballers) ? footballers : [];
        if (playerPool.length === 0) return;

        // 1. สุ่มนักเตะหลัก (Target) โดยพยายามไม่ให้ซ้ำกับ 3ตาล่าสุด
        let availableTargets = playerPool.filter(f => f && !recentTargets.includes(f.id));
        if (availableTargets.length === 0) {
            recentTargets = []; // ถ้าหมดคลังแล้ว ให้ล้างประวัติเริ่มใหม่
            availableTargets = playerPool;
        }
        const targetPlayer = availableTargets[Math.floor(Math.random() * availableTargets.length)];
        gameState.secretFootballer = targetPlayer;

        // บันทึกประวัติตัวจริง (เก็บไว้กันซ้ำ 3 ตาหลัง)
        recentTargets.push(targetPlayer.id);
        if (recentTargets.length > 3) recentTargets.shift();

        // 2. สุ่มเลือก Spy โดยพยายามหลีกเลี่ยงคนเดิมจากตาก่อนหน้า
        const spyCountInput = data && data.spyCount ? parseInt(data.spyCount) : 1;
        
        let availablePlayersForSpy = players.filter(p => !recentSpies.has(p.id));
        
        if (availablePlayersForSpy.length < spyCountInput) {
            recentSpies.clear();
            availablePlayersForSpy = [...players];
        }

        const shuffledPlayers = [...availablePlayersForSpy].sort(() => 0.5 - Math.random());
        const spies = shuffledPlayers.slice(0, spyCountInput);
        const spyIdsSet = new Set(spies.map(p => p.id));
        gameState.spyIds = Array.from(spyIdsSet);
        gameState.spyNames = spies.map(p => p.name);

        recentSpies.clear();
        spyIdsSet.forEach(id => recentSpies.add(id));

        // 3. สุ่มตัวหลอก (Decoy) ที่มีข้อมูลตรงกันอย่างน้อย 3 จาก 4 อย่าง และไม่ซ้ำกับ 2ตาล่าสุด
        let validDecoys = playerPool.filter(f => {
            if (!f || f.id === targetPlayer.id || recentDecoys.includes(f.id)) return false;
            let match = 0;

            if (f.position && targetPlayer.position && f.position === targetPlayer.position) match++;
            if (f.nationality && targetPlayer.nationality && f.nationality === targetPlayer.nationality) match++;
            if (f.foot && targetPlayer.foot && f.foot === targetPlayer.foot) match++;

            const targetTeam = targetPlayer.current_team || targetPlayer.team;
            const fTeam = f.current_team || f.team;
            if (fTeam && targetTeam && fTeam === targetTeam) match++;

            return match >= 3;
        });

        // กรณีหา 3 ข้อไม่เจอ (หรือติดเงื่อนไขประวัติจนหมด) ให้ผ่อนปรนเหลือ 2 ข้อ
        if (validDecoys.length === 0) {
            validDecoys = playerPool.filter(f => {
                if (!f || f.id === targetPlayer.id) return false;
                let match = 0;
                if (f.position && targetPlayer.position && f.position === targetPlayer.position) match++;
                if (f.nationality && targetPlayer.nationality && f.nationality === targetPlayer.nationality) match++;
                if (f.foot && targetPlayer.foot && f.foot === targetPlayer.foot) match++;
                const targetTeam = targetPlayer.current_team || targetPlayer.team;
                const fTeam = f.current_team || f.team;
                if (fTeam && targetTeam && fTeam === targetTeam) match++;
                return match >= 2;
            });
        }

        if (validDecoys.length === 0) {
            validDecoys = playerPool.filter(f => f && f.id !== targetPlayer.id);
        }

        const selectedDecoy = validDecoys[Math.floor(Math.random() * validDecoys.length)];
        gameState.decoyFootballer = selectedDecoy;

        // บันทึกประวัติตัวหลอก (เก็บไว้กันซ้ำ 2 ตาหลัง)
        recentDecoys.push(selectedDecoy.id);
        if (recentDecoys.length > 2) recentDecoys.shift();
        
        const targetTeam = targetPlayer.current_team || targetPlayer.team || '???';
        const decoyTeam = selectedDecoy ? (selectedDecoy.current_team || selectedDecoy.team || '???') : '???';

        // แจ้งบทบาทให้ผู้เล่นแต่ละคน
        players.forEach(p => {
            if (spyIdsSet.has(p.id)) {
                p.role = 'SPY';
                io.to(p.id).emit('assignRole', {
                    role: 'SPY',
                    decoyName: selectedDecoy ? selectedDecoy.name : '???',
                    position: selectedDecoy ? selectedDecoy.position : '???',
                    nationality: selectedDecoy ? (selectedDecoy.nationality || '???') : '???',
                    foot: selectedDecoy ? selectedDecoy.foot : '???',
                    team: decoyTeam,
                    image: selectedDecoy ? selectedDecoy.image : ''
                });
            } else {
                p.role = 'PLAYER';
                io.to(p.id).emit('assignRole', {
                    role: 'PLAYER',
                    name: targetPlayer.name,
                    position: targetPlayer.position || '???',
                    nationality: targetPlayer.nationality || '???',
                    foot: targetPlayer.foot || '???',
                    team: targetTeam,
                    image: targetPlayer.image || ''
                });
            }
        });

        const playOrder = shuffleArray(players);

        // ** เพิ่มบรรทัดนี้เพื่อเก็บบันทึกลำดับการเล่นไว้บน Server **
        gameState.playOrder = playOrder;

        let summaryToSend = { secret: "", secretPos: "", decoy: "", decoyPos: "" };
        if (previousRoundSecret) {
            summaryToSend = lastGameSummary;
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

    socket.on('requestCurrentRole', () => {
    const player = players.find(p => p.id === socket.id);
    if (!player) return;

    if (gameState.isStarted) {
        // เช็กจากชื่อ (player.name) หรือสถานะใน player ว่าเป็น Spy หรือไม่
        const isCurrentSpy = (gameState.spyNames && gameState.spyNames.includes(player.name)) || 
                               player.role === 'SPY' ||
                               (gameState.spyIds && gameState.spyIds.includes(socket.id));

        // ฟังก์ชันช่วยหาชื่อทีมจากทุกความเป็นไปได้ของฟิลด์ข้อมูล
        const getTeam = (obj) => {
            if (!obj) return '-';
            // ดึงค่าจาก current_team เป็นหลัก
            return obj.current_team || obj.team || obj.club || obj.teamName || obj.currentTeam || obj.squad || obj.t || '-';
        };

        const getNationality = (obj) => {
            if (!obj) return '-';
            return obj.nationality || obj.nation || obj.country || '-';
        };

        if (isCurrentSpy) {
            const decoy = gameState.decoyFootballer;
            socket.emit('assignRole', {
                role: 'SPY',
                decoyName: decoy ? decoy.name : '???',
                position: decoy ? decoy.position : '???',
                foot: decoy ? decoy.foot : '???',
                nationality: getNationality(decoy),
                team: getTeam(decoy),
                image: decoy ? decoy.image : ''
            });
                
            if (gameState.isSpyGuessing) {
                socket.emit('spyMustGuess');
            }
            
        } else {
            const secret = gameState.secretFootballer;
            socket.emit('assignRole', {
                role: 'PLAYER',
                name: secret ? secret.name : '???',
                position: secret ? secret.position : '???',
                foot: secret ? secret.foot : '???',
                nationality: getNationality(secret),
                team: getTeam(secret),
                image: secret ? secret.image : ''
            });

            if (gameState.isSpyGuessing) {
                socket.emit('waitingForSpyGuess');
            }
        }
        
        // ส่งข้อมูลสถานะเกม ลำดับการเล่น และรายชื่อผู้เล่นกลับไปเพื่อให้ Client แสดงกล่องที่หายไป
        socket.emit('restoreGameState', {
            isStarted: gameState.isStarted,
            isSpyGuessing: gameState.isSpyGuessing,
            playOrder: gameState.playOrder || players,
            players: players,
            spyIds: gameState.spyIds
        });
    }
});
    
    socket.on('resetRoom', () => {
        if (gameTimer) {
            clearInterval(gameTimer);
            gameTimer = null;
        }
        io.emit('timerUpdate', '03:00');
        io.emit('hideGameUI');

        players.forEach(player => {
            player.role = null; 
        });

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

    socket.on('typing', (data) => {
        socket.broadcast.emit('displayTyping', { senderName: data.senderName });
    });

    socket.on('stopTyping', () => {
        socket.broadcast.emit('hideTyping');
    });

    socket.on('castVote', (targetId) => {
        if (!gameState.isStarted || gameState.votedPlayers.has(socket.id) || targetId === socket.id) return;

        gameState.votedPlayers.add(socket.id);
        gameState.votes[targetId] = (gameState.votes[targetId] || 0) + 1;

        io.emit('voteUpdated', gameState.votedPlayers.size, players.length);

        if (gameState.votedPlayers.size === players.length) {
            if (gameTimer) clearInterval(gameTimer);
            let maxVotes = -1;
            let suspectedId = null;

            for (const [pid, count] of Object.entries(gameState.votes)) {
                if (count > maxVotes) {
                    maxVotes = count;
                    suspectedId = pid;
                }
            }

            if (gameState.spyIds && gameState.spyIds.includes(suspectedId)) {
                gameState.isSpyGuessing = true;
                gameState.isStarted = true;
                if (gameState.spyIds.length > 0) {
                    io.to(gameState.spyIds[0]).emit('spyMustGuess');
                }
                players.forEach(p => {
                    if (!gameState.spyIds.includes(p.id)) {
                        io.to(p.id).emit('waitingForSpyGuess');
                    }
                });

                gameState.playOrder = [];
                
            } else {
                const spyPlayers = players.filter(p => gameState.spyIds && gameState.spyIds.includes(p.id));
                spyPlayers.forEach(sp => sp.score += 2);
                const spyNamesStr = spyPlayers.map(p => p.name).join(', ');
                const suspectedPlayer = players.find(p => p.id === suspectedId);

                io.emit('finalResult', {
                    winner: 'SPY',
                    reason: 'voteWrong',
                    suspectedName: suspectedPlayer ? suspectedPlayer.name : 'ไม่มี',
                    spyName: spyNamesStr,
                    secretFootballer: gameState.secretFootballer.name,
                    decoyFootballer: gameState.decoyFootballer.name
                });

                gameState.isStarted = false;
                gameState.playOrder = [];
                io.emit('updatePlayers', players);
            }
        }
    });

    socket.on('spyGuess', (guessedName) => {
        // 🔍 ลองใส่ console.log ตรงนี้เพื่อดูว่า Server ได้รับค่าไหม และเราเป็น SPY หรือเปล่า
        console.log("มีคนกดส่งคำตอบมา:", guessedName);
        console.log("เกมเริ่มหรือยัง (isStarted):", gameState.isStarted);
        console.log("ไอดีเราใช่ SPY ไหม:", gameState.spyIds.includes(socket.id));
        
        // เช็กสิทธิ์แบบยืดหยุ่นเพื่อให้มั่นใจว่าจับตัว Spy ได้แน่นอน
        const player = players.find(p => p.id === socket.id);
        const isCurrentSpy = player && (
            player.role === 'SPY' || 
            (gameState.spyIds && gameState.spyIds.includes(socket.id)) ||
            (gameState.spyNames && gameState.spyNames.includes(player.name))
        );

        if (!gameState.isStarted || !isCurrentSpy) {
            console.log("⚠️ ตัดจบ: ไม่ใช่ Spy หรือเกมยังไม่เริ่ม");
            return;
        }

        const trimmedGuess = guessedName ? guessedName.trim() : '';
        const isCorrect = trimmedGuess !== '' && isFlexibleMatch(trimmedGuess, gameState.secretFootballer.name);
        const spyPlayer = players.find(p => gameState.spyIds.includes(p.id));

        if (isCorrect) {
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
        gameState.isSpyGuessing = false;
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
