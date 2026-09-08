const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// ⚽️ ฐานข้อมูลนักเตะรวม 100+ คน (พร้อมตำแหน่ง และ เท้าที่ถนัด)
const playersDatabase = [
    // --- กองหน้า / ปีก (FW) ---
    { name: "ลิโอเนล เมสซี่", pos: "FW", foot: "L" },
    { name: "คริสเตียโน โรนัลโด", pos: "FW", foot: "R" },
    { name: "คีเลียน เอ็มบัปเป้", pos: "FW", foot: "R" },
    { name: "เออร์ลิง ฮาแลนด์", pos: "FW", foot: "L" },
    { name: "เนย์มาร์", pos: "FW", foot: "R" },
    { name: "โมฮาเหม็ด ซาลาห์", pos: "FW", foot: "L" },
    { name: "โรเบิร์ต เลวานดอฟสกี้", pos: "FW", foot: "R" },
    { name: "วินิซิอุส จูเนียร์", pos: "FW", foot: "R" },
    { name: "แฮร์รี่ เคน", pos: "FW", foot: "R" },
    { name: "ลามีน ยามาล", pos: "FW", foot: "L" },
    { name: "บูกาโย ซากา", pos: "FW", foot: "L" },
    { name: "วิกเตอร์ โอซิมเฮน", pos: "FW", foot: "R" },
    { name: "เลาตาโร มาร์ติเนซ", pos: "FW", foot: "R" },
    { name: "อองตวน กรีซมันน์", pos: "FW", foot: "L" },
    { name: "เวย์น รูนีย์", pos: "FW", foot: "R" },
    { name: "เธียร์รี่ อองรี", pos: "FW", foot: "R" },
    { name: "โรนัลโด้ (R9)", pos: "FW", foot: "R" },
    { name: "หลุยส์ ซัวเรซ", pos: "FW", foot: "R" },
    { name: "คาริม เบนเซม่า", pos: "FW", foot: "R" },
    { name: "ราฟาเอล เลเอา", pos: "FW", foot: "R" },
    { name: "ควิชา ควารัตสเคเลีย", pos: "FW", foot: "R" },
    { name: "โรดรีโก้", pos: "FW", foot: "R" },
    { name: "กาเบรียล เชซุส", pos: "FW", foot: "R" },
    { name: "ดาร์วิน นูเญซ", pos: "FW", foot: "R" },
    { name: "อเล็กซานเดอร์ อิซัค", pos: "FW", foot: "R" },
    { name: "ริชาร์ลิซอน", pos: "FW", foot: "R" },
    { name: "โอลี วัตกินส์", pos: "FW", foot: "R" },
    { name: "ริยาด มาเรซ", pos: "FW", foot: "L" },
    { name: "เจดอน ซานโช่", pos: "FW", foot: "R" },
    { name: "มาร์คัส แรชฟอร์ด", pos: "FW", foot: "R" },
    { name: "หลุยส์ ดิอาซ", pos: "FW", foot: "R" },
    { name: "เปโดร เนโต้", pos: "FW", foot: "L" },
    { name: "ดิเอโก้ มาราโดน่า", pos: "FW", foot: "L" },
    { name: "เปเล่", pos: "FW", foot: "R" },
    { name: "รุด ฟาน นิสเตลรอย", pos: "FW", foot: "R" },
    { name: "ดิเอโก้ ฟอร์ลาน", pos: "FW", foot: "R" },
    { name: "อังเดร เชฟเชนโก้", pos: "FW", foot: "R" },
    { name: "ดิดิเยร์ ดร็อกบา", pos: "FW", foot: "R" },
    { name: "แซมมวล เอโต้", pos: "FW", foot: "R" },
    { name: "ฟรานเชสโก้ ต๊อตติ", pos: "FW", foot: "R" },
    { name: "อเลสซานโดร เดล ปิเอโร่", pos: "FW", foot: "R" },
    { name: "เซร์คิโอ อเกวโร่", pos: "FW", foot: "R" },
    { name: "กาเบรียล บาติสตูต้า", pos: "FW", foot: "R" },
    { name: "โรบิน ฟาน เพอร์ซี่", pos: "FW", foot: "L" },

    // --- กองกลาง (MF) ---
    { name: "จู๊ด เบลลิงแฮม", pos: "MF", foot: "R" },
    { name: "เควิน เดอ บรอยน์", pos: "MF", foot: "R" },
    { name: "ลูก้า โมดริช", pos: "MF", foot: "R" },
    { name: "บรูโน่ แฟร์นันเดส", pos: "MF", foot: "R" },
    { name: "โรดรี้", pos: "MF", foot: "R" },
    { name: "ฟิล โฟเด้น", pos: "MF", foot: "L" },
    { name: "เฟเดริโก วัลเวร์เด", pos: "MF", foot: "R" },
    { name: "โฟลเรียน เวียร์ตซ์", pos: "MF", foot: "R" },
    { name: "โคล พาลเมอร์", pos: "MF", foot: "L" },
    { name: "เพดรี", pos: "MF", foot: "R" },
    { name: "จามัล มูเซียล่า", pos: "MF", foot: "R" },
    { name: "เฟรงกี้ เดอ ยอง", pos: "MF", foot: "R" },
    { name: "ซน ฮึง-มิน", pos: "FW", foot: "R" },
    { name: "มาร์ติน โอเดการ์ด", pos: "MF", foot: "L" },
    { name: "ออเรเลียน ชูอาเมนี", pos: "MF", foot: "R" },
    { name: "เอดูอาร์โด้ คามาแว็งก้า", pos: "MF", foot: "L" },
    { name: "อเล็กซิส แม็ค อัลลิสเตอร์", pos: "MF", foot: "R" },
    { name: "โดมินิค โซโบสไล", pos: "MF", foot: "R" },
    { name: "เดแคลน ไรซ์", pos: "MF", foot: "R" },
    { name: "เอ็นโซ เฟร์นานเดซ", pos: "MF", foot: "R" },
    { name: "มอยเซส ไคเซโด้", pos: "MF", foot: "R" },
    { name: "นิโคโล บาเรลล่า", pos: "MF", foot: "R" },
    { name: "กอนซาโล่ อินาซิโอ", pos: "DF", foot: "L" },
    { name: "ซีเนดีน ซีดาน", pos: "MF", foot: "R" },
    { name: "โรนัลดินโญ่", pos: "MF", foot: "R" },
    { name: "เดวิด เบ็คแฮม", pos: "MF", foot: "R" },
    { name: "สตีเวน เจอร์ราร์ด", pos: "MF", foot: "R" },
    { name: "แฟรงค์ แลมพาร์ด", pos: "MF", foot: "R" },
    { name: "กาก้า", pos: "MF", foot: "R" },
    { name: "อันเดรียส อิเนียสต้า", pos: "MF", foot: "R" },
    { name: "ชาบี เอร์นานเดซ", pos: "MF", foot: "R" },
    { name: "อันเดรีย ปีร์โล่", pos: "MF", foot: "R" },
    { name: "มิชาเอล บัลลัค", pos: "MF", foot: "R" },
    { name: "ปาทริค วิเอร่า", pos: "MF", foot: "R" },
    { name: "หลุยส์ ฟิโก้", pos: "MF", foot: "R" },
    { name: "โคลด มาเกเลเล่", pos: "MF", foot: "R" },
    { name: "บัสเตียน ชไวน์สไตเกอร์", pos: "MF", foot: "R" },
    { name: "พอล สโคลส์", pos: "MF", foot: "R" },
    { name: "รอย คีน", pos: "MF", foot: "R" },
    { name: "เอ็ดการ์ ดาวิดส์", pos: "MF", foot: "L" },

    // --- กองหลัง (DF) ---
    { name: "แวร์จิล ฟาน ไดจ์ค", pos: "DF", foot: "R" },
    { name: "เซร์คิโอ รามอส", pos: "DF", foot: "R" },
    { name: "รูเบน ดิอาส", pos: "DF", foot: "R" },
    { name: "วิลเลียน ซาลิบา", pos: "DF", foot: "R" },
    { name: "ยอสโก้ กวาร์ดิโอล", pos: "DF", foot: "L" },
    { name: "เทรนต์ อเล็กซานเดอร์-อาร์โนลด์", pos: "DF", foot: "R" },
    { name: "อัชราฟ ฮาคิมี", pos: "DF", foot: "R" },
    { name: "อัลฟอนโซ เดวีส์", pos: "DF", foot: "L" },
    { name: "แอนดรูว์ โรเบิร์ตสัน", pos: "DF", foot: "L" },
    { name: "เลโอ บาสโตนี่", pos: "DF", foot: "L" },
    { name: "อันโตนิโอ รูดิเกอร์", pos: "DF", foot: "R" },
    { name: "เอแดร์ มิลิเตา", pos: "DF", foot: "R" },
    { name: "เปเป้", pos: "DF", foot: "R" },
    { name: "เปาโล มัลดินี่", pos: "DF", foot: "L" },
    { name: "ฟาบิโอ คันนาวาโร่", pos: "DF", foot: "R" },
    { name: "คาร์เลส ปูโยล", pos: "DF", foot: "R" },
    { name: "ริโอ เฟอร์ดินานด์", pos: "DF", foot: "R" },
    { name: "เนมานย่า วิดิช", pos: "DF", foot: "R" },
    { name: "เนสต้า", pos: "DF", foot: "R" },
    { name: "คาฟู", pos: "DF", foot: "R" },
    { name: "โรแบร์โต้ คาร์ลอส", pos: "DF", foot: "L" },
    { name: "ฟิลิปป์ ลาห์ม", pos: "DF", foot: "R" },

    // --- ผู้รักษาประตู (GK) ---
    { name: "อลิสซอน เบ็คเกอร์", pos: "GK", foot: "R" },
    { name: "โอนาน่า", pos: "GK", foot: "R" },
    { name: "ติโบต์ กูร์ตัวส์", pos: "GK", foot: "L" },
    { name: "เอแดร์ซอน", pos: "GK", foot: "L" },
    { name: "มาร์ค-อันเดร แทร์ สเตเก้น", pos: "GK", foot: "R" },
    { name: "เอมิเลียโน มาร์ติเนซ", pos: "GK", foot: "R" },
    { name: "ไมค์ เมญอง", pos: "GK", foot: "R" },
    { name: "จิอันลุยจิ ดอนนารุมม่า", pos: "GK", foot: "R" },
    { name: "จิอันลุยจิ บุฟฟอน", pos: "GK", foot: "R" },
    { name: "อิเกร์ กาซียาส", pos: "GK", foot: "L" },
    { name: "มานูเอล นอยเออร์", pos: "GK", foot: "R" },
    { name: "ปีเตอร์ ชไมเคิล", pos: "GK", foot: "R" },
    { name: "เอ็ดวิน ฟาน เดอร์ ซาร์", pos: "GK", foot: "R" },
    { name: "เช็ค (Petr Cech)", pos: "GK", foot: "L" }
];

let roomPlayers = [];
let timerInterval = null;
let timeLeft = 180;
let spySocketId = null;
let currentSecretPlayer = null;
let currentDecoyPlayer = null;
let votes = {};

// 🎴 ระบบคลังการ์ดสุ่มเพื่อไม่ให้ชื่อซ้ำในแต่ละรอบ
let availablePlayersDeck = [];

function shuffleArray(array) {
    let shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// สุ่มจับการ์ดนักเตะจาก Deck แบบไม่ซ้ำ
function getNextUniquePlayer() {
    if (availablePlayersDeck.length === 0) {
        // หากเล่นจนครบทุกชื่อแล้ว ให้รีเซ็ตสับการ์ดใหม่ทั้งกอง
        availablePlayersDeck = shuffleArray(playersDatabase);
    }
    return availablePlayersDeck.pop(); // ดึงการ์ดใบใต้ออกมาใช้
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

        // 1. สุ่มนักเตะจริงแบบไม่ซ้ำจาก Deck
        currentSecretPlayer = getNextUniquePlayer();

        // 2. ค้นหานักเตะที่มีคุณสมบัติใกล้เคียงกันเพื่อทำเป็นตัวหลอกให้ SPY
        let matchingDecoys = playersDatabase.filter(p => 
            p.name !== currentSecretPlayer.name && 
            p.pos === currentSecretPlayer.pos && 
            p.foot === currentSecretPlayer.foot
        );

        if (matchingDecoys.length === 0) {
            matchingDecoys = playersDatabase.filter(p => 
                p.name !== currentSecretPlayer.name && 
                p.pos === currentSecretPlayer.pos
            );
        }

        currentDecoyPlayer = matchingDecoys[Math.floor(Math.random() * matchingDecoys.length)];

        // 3. สุ่ม SPY
        const spyIndex = Math.floor(Math.random() * roomPlayers.length);
        spySocketId = roomPlayers[spyIndex].id;

        const playOrder = shuffleArray(roomPlayers);

        roomPlayers.forEach((p, index) => {
            if (index === spyIndex) {
                io.to(p.id).emit('assignRole', { 
                    role: 'SPY', 
                    decoyName: currentDecoyPlayer.name,
                    position: currentDecoyPlayer.pos,
                    foot: currentDecoyPlayer.foot === 'R' ? 'ขวา' : 'ซ้าย'
                });
            } else {
                io.to(p.id).emit('assignRole', { 
                    role: 'PLAYER', 
                    name: currentSecretPlayer.name 
                });
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

    socket.on('spyGuess', (guessedName) => {
        if (socket.id !== spySocketId) return;

        clearInterval(timerInterval);
        const isCorrect = guessedName.trim().toLowerCase() === currentSecretPlayer.name.toLowerCase();
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
            secretFootballer: currentSecretPlayer.name,
            decoyFootballer: currentDecoyPlayer.name,
            spyGuess: guessedName,
            isCorrect: isCorrect,
            reason: 'spyGuessed'
        });
    });

    socket.on('kickPlayer', (targetId) => {
        const targetPlayer = roomPlayers.find(p => p.id === targetId);
        if (targetPlayer) {
            io.to(targetId).emit('kicked');
            const targetSocket = io.sockets.sockets.get(targetId);
            if (targetSocket) {
                targetSocket.disconnect();
            }

            roomPlayers = roomPlayers.filter(p => p.id !== targetId);
            delete votes[targetId];

            io.emit('newChatMessage', {
                sender: 'ระบบ',
                message: `🚫 ${targetPlayer.name} ถูกเตะออกจากห้องแล้ว`
            });

            io.emit('updatePlayers', roomPlayers);
        }
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
            secretFootballer: currentSecretPlayer.name,
            decoyFootballer: currentDecoyPlayer.name,
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
