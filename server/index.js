require('dotenv').config(); 
const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL ? [process.env.CLIENT_URL, "http://localhost:5173", "http://localhost:5174"] : "*",
    methods: ["GET", "POST"],
  },
});

// ** MongoDB Connection **
const mongoURI = process.env.MONGO_URI || 'mongodb+srv://admin:password1234@cluster0.xnybzrs.mongodb.net/?appName=Cluster0';

mongoose.connect(mongoURI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// --- Schemas ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: "" }
});
const UserModel = mongoose.model('User', UserSchema);

const RoomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const RoomModel = mongoose.model('Room', RoomSchema);

const MessageSchema = new mongoose.Schema({
  room: String,
  author: String,
  avatar: String,
  message: String,
  type: { type: String, default: "text" },
  time: String,
});
const MessageModel = mongoose.model('Message', MessageSchema);

// --- APIs ---
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (await UserModel.findOne({ username })) return res.status(400).json({ message: "ชื่อซ้ำ" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await UserModel.create({ username, password: hashedPassword });
    res.json({ message: "สมัครสำเร็จ" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await UserModel.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ message: "ชื่อหรือรหัสผิด" });
    
    const token = jwt.sign({ id: user._id, username }, process.env.JWT_SECRET || "SECRET");
    res.json({ token, username, avatar: user.avatar, message: "Login สำเร็จ" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/update-profile', async (req, res) => {
  try {
    const { username, avatar } = req.body;
    await UserModel.findOneAndUpdate({ username }, { avatar });
    res.json({ message: "อัปเดตโปรไฟล์สำเร็จ" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/create-room', async (req, res) => {
  try {
    const { roomName, password } = req.body;
    if (await RoomModel.findOne({ name: roomName })) return res.status(400).json({ message: "ชื่อห้องซ้ำ" });
    const hashed = await bcrypt.hash(password, 10);
    await RoomModel.create({ name: roomName, password: hashed });
    res.json({ message: "สร้างห้องสำเร็จ" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/join-room-verify', async (req, res) => {
  try {
    const { roomName, password } = req.body;
    const room = await RoomModel.findOne({ name: roomName });
    if (!room || !(await bcrypt.compare(password, room.password))) return res.status(400).json({ message: "ไม่พบห้อง หรือ รหัสผิด" });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/messages/:room', async (req, res) => {
  try {
    const messages = await MessageModel.find({ room: req.params.room });
    res.json(messages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Socket Logic ---
const usersInVoice = {}; // roomID -> [socketID]
const socketToRoom = {}; // socketID -> roomID

io.on("connection", (socket) => {
  
  // === Chat Logic ===
  const updateRoomUsers = async (room) => {
    if (!room) return;
    const sockets = await io.in(room).fetchSockets();
    const users = sockets.map(s => ({
       username: s.data.username,
       avatar: s.data.avatar
    })).filter(u => u.username);
    
    const uniqueUsers = [...new Map(users.map(v => [v.username, v])).values()];
    io.to(room).emit("room_users", uniqueUsers);
  };

  socket.on("join_room", async (data) => {
    const { room, username, avatar } = data;
    if (socket.data.room && socket.data.room !== room) {
        const oldRoom = socket.data.room;
        socket.leave(oldRoom);
        await updateRoomUsers(oldRoom); 
    }
    socket.join(room);
    socket.data.username = username;
    socket.data.avatar = avatar;
    socket.data.room = room;
    await updateRoomUsers(room);
  });

  socket.on("typing", (data) => {
    socket.to(data.room).emit("display_typing", data);
  });
  
  socket.on("send_message", async (data, callback) => {
    const newMessage = new MessageModel(data);
    socket.to(data.room).emit("receive_message", newMessage); 
    try { 
        await newMessage.save(); 
        if (callback) callback(newMessage); 
    } catch(e) { console.error(e); }
  });

  socket.on("delete_message", async (id) => {
    try {
      const msg = await MessageModel.findById(id);
      if (msg) {
          const room = msg.room;
          await MessageModel.findByIdAndDelete(id);
          io.to(room).emit("message_deleted", id);
      }
    } catch (e) { console.error(e); }
  });

  // === Video Call Logic (Mesh Topology) ===
  socket.on("join_voice_channel", (roomID) => {
    if (usersInVoice[roomID]) {
      // 1. เช็คว่าห้องเต็มไหม
      if (usersInVoice[roomID].length >= 4) { 
        socket.emit("room_full");
        return;
      }
      // ✅ 2. เช็ค Duplicate ก่อน Push
      if (!usersInVoice[roomID].includes(socket.id)) {
        usersInVoice[roomID].push(socket.id);
      }
    } else {
      usersInVoice[roomID] = [socket.id];
    }
    socketToRoom[socket.id] = roomID;
    
    // ส่งรายชื่อคนที่มีอยู่แล้วกลับไปหาคนที่เพิ่งเข้า
    const usersInThisRoom = usersInVoice[roomID].filter(id => id !== socket.id);
    socket.emit("all_users_in_call", usersInThisRoom);
  });

  socket.on("sending_signal", payload => {
    io.to(payload.userToSignal).emit('user_joined_call', { signal: payload.signal, callerID: payload.callerID });
  });

  socket.on("returning_signal", payload => {
    io.to(payload.callerID).emit('receiving_returned_signal', { signal: payload.signal, id: socket.id });
  });

  socket.on("leave_voice_channel", () => {
    const roomID = socketToRoom[socket.id];
    if (usersInVoice[roomID]) {
      usersInVoice[roomID] = usersInVoice[roomID].filter(id => id !== socket.id);
    }
    socket.broadcast.to(roomID).emit('user_left_call', socket.id);
  });

  // === Disconnect ===
  socket.on("disconnect", async () => {
    // Clear Chat User
    if (socket.data.room) {
        await updateRoomUsers(socket.data.room);
    }

    // Clear Voice User
    const roomID = socketToRoom[socket.id];
    if (usersInVoice[roomID]) {
      usersInVoice[roomID] = usersInVoice[roomID].filter(id => id !== socket.id);
      socket.broadcast.to(roomID).emit('user_left_call', socket.id);
    }
    delete socketToRoom[socket.id];
  });
});

server.listen(PORT, () => console.log(`✅ SERVER RUNNING on ${PORT}`));