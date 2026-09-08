const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// รายชื่อนักเตะ 50 คนแบบระบบเดิม
const playersList = [
    "ลิโอเนล เมสซี่", "คริสเตียโน โรนัลโด", "คีเลียน เอ็มบัปเป้", 
    "เออร์ลิง ฮาแลนด์", "เนย์มาร์", "โมฮาเหม็ด ซาลาห์", 
    "จู๊ด เบลลิงแฮม", "เควิน เดอ บรอยน์", "ซน ฮึง-มิน", "โรเบิร์ต เลวานดอฟสกี้",
    "วินิซิอุส จูเนียร์", "แฮร์รี่ เคน", "ลูก้า โมดริช", "บรูโน่ แฟร์นันเดส",
    "โรดรี้", "ลามีน ยามาล", "ฟิล โฟเด้น", "บูกาโย ซากา", "เฟเดริโก วัลเวร์เด",
    "โฟลเรียน เวียร์ตซ์", "โคล พาลเมอร์", "เพดรี", "จามัล มูเซียล่า", "อลิสซอน เบ็คเกอร์",
    "โอนาน่า", "แวร์จิล ฟาน ไดจ์ค", "วิกเตอร์ โอซิมเฮน", "เลาตาโร มาร์ติเนซ",
    "อองตวน กรีซมันน์", "เฟรงกี้ เดอ ยอง", "ซีเนดีน ซีดาน", "โรนัลดินโญ่", 
    "โรนัลโด้ (R9)", "ดิเอโก้ มาราโดน่า", "เปเล่", "เดวิด เบ็คแฮม", 
    "สตีเวน เจอร์ราร์ด", "แฟรงค์ แลมพาร์ด", "เธียร์รี่ อองรี", "กาก้า", 
    "อันเดรียส อิเนียสต้า", "ชาบี เอร์นานเดซ", "อันเดรีย ปีร์โล่", "จิอันลุยจิ บุฟฟอน", 
    "อิเกร์ กาซียาส", "เวย์น รูนีย์", "เซร์คิโอ รามอส", "มิชาเอล บัลลัค", 
    "ปาทริค วิเอร่า", "หลุยส์ ฟิโก้"
];

let roomPlayers = [];
let timerInterval = null;
let timeLeft = 180;
let spySocketId = null;
let currentSecretPlayer = "";
let votes = {};

function shuffleArray(array) {
    let shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

io.on('connection', (socket) => {
    roomPlayers.push({ id: socket.id, name: `ผู้เล่น #${roomPlayers.length + 1}`, score: 0 });
    io.emit('updatePlayers', roomPlayers);

    socket.on('setName', (name) => {
        const player = roomPlayers.find(p => p.id === socket.id);
        if (player && name.trim() !== '') {
            player.name = name.trim();
            io.emit('updatePlayers', roomPlayers);
        }
    });

    socket.on('sendChatMessage', (msg) => {
        const player = roomPlayers.find(p => p.id === socket.id);
        if (player && msg.trim() !== '') {
            io.emit('newChatMessage', {
                sender: player.name,
                message: msg.trim()
            });
        }
    });

    socket.on('startGame', () => {
        if (roomPlayers.length < 3) {
            socket.emit('errorMsg', 'ต้องมีผู้เล่นอย่างน้อย 3 คนขึ้นไปถึงจะเริ่มได้!');
            return;
        }

        clearInterval(timerInterval);
        timeLeft = 180;
        votes = {};

        currentSecretPlayer = playersList[Math.floor(Math.random() * playersList.length)];
        const spyIndex = Math.floor(Math.random() * roomPlayers.length);
        spySocketId = roomPlayers[spyIndex].id;

        const playOrder = shuffleArray(roomPlayers);

        roomPlayers.forEach((p, index) => {
            if (index === spyIndex) {
                io.to(p.id).emit('assignRole', { role: 'SPY', name: '' });
            } else {
                io.to(p.id).emit('assignRole', { role: 'PLAYER', name: currentSecretPlayer });
            }
        });

        io.emit('gameStarted', { playOrder: playOrder });
        io.emit('timerUpdate', timeLeft);
        timerInterval = setInterval(() => {
            timeLeft--;
            io.emit('timerUpdate', timeLeft);

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                io.emit('timeUp');
            }
        }, 1000);
    });

    socket.on('castVote', (targetId) => {
        votes[socket.id] = targetId;
        io.emit('voteUpdated', Object.keys(votes).length, roomPlayers.length);

        if (Object.keys(votes).length === roomPlayers.length) {
            calculateVoteResult();
        }
    });

    // ระบบให้ SPY พิมพ์ส่งคำตอบ
    socket.on('spyGuess', (guessedName) => {
        if (socket.id !== spySocketId) return;

        clearInterval(timerInterval);
        const isCorrect = guessedName.trim().toLowerCase() === currentSecretPlayer.toLowerCase();
        const spyPlayer = roomPlayers.find(p => p.id === spySocketId);

        if (isCorrect) {
            if (spyPlayer) spyPlayer.score += 2;
        } else {
            roomPlayers.forEach(p => {
                if (p.id !== spySocketId) p.score += 1;
            });
        }

        io.emit('updatePlayers', roomPlayers);
        io.emit('finalResult', {
            winner: isCorrect ? 'SPY' : 'PLAYERS',
            spyName: spyPlayer ? spyPlayer.name : 'SPY',
            secretFootballer: currentSecretPlayer,
            spyGuess: guessedName,
            isCorrect: isCorrect,
            reason: 'spyGuessed'
        });
    });

    socket.on('resetScores', () => {
        roomPlayers.forEach(p => p.score = 0);
        io.emit('updatePlayers', roomPlayers);
    });

    socket.on('disconnect', () => {
        roomPlayers = roomPlayers.filter(p => p.id !== socket.id);
        delete votes[socket.id];
        io.emit('updatePlayers', roomPlayers);
    });
});

function calculateVoteResult() {
    clearInterval(timerInterval);
    const voteCounts = {};
    Object.values(votes).forEach(targetId => {
        voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });

    let maxVotes = 0;
    let mostVotedId = null;
    for (const [targetId, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
            maxVotes = count;
            mostVotedId = targetId;
        }
    }

    const suspectedPlayer = roomPlayers.find(p => p.id === mostVotedId);
    const spyPlayer = roomPlayers.find(p => p.id === spySocketId);
    const isVoteCorrect = mostVotedId === spySocketId;

    if (isVoteCorrect) {
        roomPlayers.forEach(p => {
            if (p.id !== spySocketId) p.score += 1;
        });
        io.emit('updatePlayers', roomPlayers);

        io.emit('finalResult', {
            winner: 'PLAYERS',
            suspectedName: suspectedPlayer ? suspectedPlayer.name : '',
            spyName: spyPlayer ? spyPlayer.name : '',
            secretFootballer: currentSecretPlayer,
            reason: 'voteCorrect'
        });
    } else {
        io.to(spySocketId).emit('spyMustGuess');
        
        roomPlayers.forEach(p => {
            if (p.id !== spySocketId) {
                io.to(p.id).emit('waitingForSpyGuess', {
                    suspectedName: suspectedPlayer ? suspectedPlayer.name : ''
                });
            }
        });
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
