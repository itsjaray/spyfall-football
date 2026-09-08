const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const playersList = [
    "ลิโอเนล เมสซี่", "คริสเตียโน โรนัลโด", "คีเลียน เอ็มบัปเป้", 
    "เออร์ลิง ฮาแลนด์", "เนย์มาร์", "โมฮาเหม็ด ซาลาห์", 
    "จู๊ด เบลลิงแฮม", "เควิน เดอ บรอยน์", "ซน ฮึง-มิน", "โรเบิร์ต เลวานดอฟสกี้",
    "วินิซิอุส จูเนียร์", "แฮร์รี่ เคน", "ลูก้า โมดริช", "บรูโน่ แฟร์นันเดส"
];

let roomPlayers = [];
let timerInterval = null;
let timeLeft = 180;
let spySocketId = null;
let currentSecretPlayer = "";
let votes = {}; // เก็บข้อมูลการโหวต { voterId: targetId }

io.on('connection', (socket) => {
    roomPlayers.push({ id: socket.id, name: `ผู้เล่น #${roomPlayers.length + 1}` });
    io.emit('updatePlayers', roomPlayers);

    socket.on('setName', (name) => {
        const player = roomPlayers.find(p => p.id === socket.id);
        if (player && name.trim() !== '') {
            player.name = name.trim();
            io.emit('updatePlayers', roomPlayers);
        }
    });

    socket.on('startGame', () => {
        if (roomPlayers.length < 3) {
            socket.emit('errorMsg', 'ต้องมีผู้เล่นอย่างน้อย 3 คนขึ้นไปถึงจะเริ่มได้!');
            return;
        }

        clearInterval(timerInterval);
        timeLeft = 180;
        votes = {}; // รีเซ็ตผลโหวต

        currentSecretPlayer = playersList[Math.floor(Math.random() * playersList.length)];
        const spyIndex = Math.floor(Math.random() * roomPlayers.length);
        spySocketId = roomPlayers[spyIndex].id;

        roomPlayers.forEach((p, index) => {
            if (index === spyIndex) {
                io.to(p.id).emit('assignRole', { role: 'SPY', name: '' });
            } else {
                io.to(p.id).emit('assignRole', { role: 'PLAYER', name: currentSecretPlayer });
            }
        });

        io.emit('gameStarted');
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

    // ระบบรับผลโหวต
    socket.on('castVote', (targetId) => {
        votes[socket.id] = targetId;
        
        // ส่งสถานะบอกทุกคนว่ามีคนโหวตเพิ่มแล้ว
        io.emit('voteUpdated', Object.keys(votes).length, roomPlayers.length);

        // ถ้าทุกคนโหวตครบแล้ว ให้คำนวณผลลัพธ์
        if (Object.keys(votes).length === roomPlayers.length) {
            calculateVoteResult();
        }
    });

    socket.on('disconnect', () => {
        roomPlayers = roomPlayers.filter(p => p.id !== socket.id);
        delete votes[socket.id];
        io.emit('updatePlayers', roomPlayers);
    });
});

function calculateVoteResult() {
    const voteCounts = {};
    Object.values(votes).forEach(targetId => {
        voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });

    // หาคนที่ได้คะแนนโหวตมากที่สุด
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

    const isCorrect = mostVotedId === spySocketId;

    io.emit('gameResult', {
        suspectedName: suspectedPlayer ? suspectedPlayer.name : "ไม่มีใคร",
        spyName: spyPlayer ? spyPlayer.name : "ไม่ทราบ",
        secretFootballer: currentSecretPlayer,
        isCorrect: isCorrect
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
