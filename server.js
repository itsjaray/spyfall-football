const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// รายชื่อนักเตะสำหรับสุ่ม
const playersList = [
    "ลิโอเนล เมสซี่", "คริสเตียโน โรนัลโด", "คีเลียน เอ็มบัปเป้", 
    "เออร์ลิง ฮาแลนด์", "เนย์มาร์", "โมฮาเหม็ด ซาลาห์", 
    "จู๊ด เบลลิงแฮม", "เควิน เดอ บรอยน์", "ซน ฮึง-มิน", "โรเบิร์ต เลวานดอฟสกี้",
    "วินิซิอุส จูเนียร์", "แฮร์รี่ เคน", "ลูก้า โมดริช", "บรูโน่ แฟร์นันเดส"
];

let roomPlayers = [];
let timerInterval = null;
let timeLeft = 180; // 3 นาที

io.on('connection', (socket) => {
    // เพิ่มผู้เล่นเข้าห้องชั่วคราว
    roomPlayers.push({ id: socket.id, name: `ผู้เล่น #${roomPlayers.length + 1}` });
    io.emit('updatePlayers', roomPlayers);

    // ระบบเปลี่ยนชื่อผู้เล่น
    socket.on('setName', (name) => {
        const player = roomPlayers.find(p => p.id === socket.id);
        if (player && name.trim() !== '') {
            player.name = name.trim();
            io.emit('updatePlayers', roomPlayers);
        }
    });

    // เริ่มเกม (รองรับผู้เล่นกี่คนก็ได้ ตั้งแต่ 3 คนขึ้นไป)
    socket.on('startGame', () => {
        if (roomPlayers.length < 3) {
            socket.emit('errorMsg', 'ต้องมีผู้เล่นอย่างน้อย 3 คนขึ้นไปถึงจะเริ่มได้!');
            return;
        }

        clearInterval(timerInterval);
        timeLeft = 180;

        const selectedFootballer = playersList[Math.floor(Math.random() * playersList.length)];
        const spyIndex = Math.floor(Math.random() * roomPlayers.length);

        // ส่งบทบาทให้ผู้เล่นทุกคนตาม ID เครื่อง
        roomPlayers.forEach((p, index) => {
            if (index === spyIndex) {
                io.to(p.id).emit('assignRole', { role: 'SPY', name: '' });
            } else {
                io.to(p.id).emit('assignRole', { role: 'PLAYER', name: selectedFootballer });
            }
        });

        // เริ่มนับถอยหลัง
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

    // ผู้เล่นออก/ปิดเบราว์เซอร์
    socket.on('disconnect', () => {
        roomPlayers = roomPlayers.filter(p => p.id !== socket.id);
        io.emit('updatePlayers', roomPlayers);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
