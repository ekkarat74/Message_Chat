import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import EmojiPicker from 'emoji-picker-react';
import SimplePeer from 'simple-peer';
import './App.css'; 

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
// ✅ สร้าง Socket ครั้งเดียวข้างนอก Component เพื่อป้องกัน connect ซ้ำ
const socket = io.connect(API_URL);

// --- Icons ---
const SendIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>;
const AttachIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>;
const EmojiIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>;
const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;
const UsersIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;
const LogoutIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>;

// --- Helper Component: Video ---
const Video = ({ peer }) => {
  const ref = useRef();
  useEffect(() => {
    // ฟัง event stream
    const handleStream = (stream) => {
      if (ref.current) ref.current.srcObject = stream;
    };
    peer.on("stream", handleStream);
    
    // ✅ แก้จอดำ: เช็คว่ามี Stream มารออยู่แล้วไหม
    if (peer._remoteStreams && peer._remoteStreams.length > 0) {
        handleStream(peer._remoteStreams[0]);
    }

    // Cleanup Listener
    return () => {
        peer.off("stream", handleStream);
    };
  }, [peer]);
  return <video playsInline autoPlay ref={ref} className="peer-video" />;
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || "");
  const [authMode, setAuthMode] = useState("login");
  const [username, setUsername] = useState(localStorage.getItem('username') || "");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState(localStorage.getItem('avatar') || "");
  
  const [viewMode, setViewMode] = useState("chat"); 
  const [roomMode, setRoomMode] = useState("join");
  const [isLoading, setIsLoading] = useState(false);

  // Chat States
  const [room, setRoom] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  
  // UI States
  const [typingStatus, setTypingStatus] = useState("");
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [usersInRoom, setUsersInRoom] = useState([]);
  const [showUserList, setShowUserList] = useState(false);

  // 🎥 Call States
  const [inCall, setInCall] = useState(false);
  const [peers, setPeers] = useState([]);
  const userVideo = useRef();
  const peersRef = useRef([]);
  const userStream = useRef();

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const profileInputRef = useRef(null);
  
  //const notificationAudio = new Audio('/notification.mp3'); 

  // --- Auth & Room Functions ---
  const handleAuth = async () => {
    if(!username || !password) return alert("กรอกข้อมูลให้ครบ");
    setIsLoading(true);
    const endpoint = authMode === "login" ? "/login" : "/register";
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if(res.ok) {
        if(authMode==="register") { 
            alert("สมัครสำเร็จ"); setAuthMode("login"); setPassword(""); 
        } else { 
            setToken(data.token); setUsername(data.username); setAvatar(data.avatar || "");
            localStorage.setItem('token', data.token); localStorage.setItem('username', data.username);
            if(data.avatar) localStorage.setItem('avatar', data.avatar);
        }
      } else alert(data.message);
    } catch(e) { console.error(e); alert("Error connecting to server"); }
    setIsLoading(false);
  };

  const handleUpdateProfile = (e) => {
    const file = e.target.files[0];
    if(file) {
        if(file.size > 2*1024*1024) return alert("รูปใหญ่เกิน 2MB");
        const reader = new FileReader();
        reader.onloadend = async () => {
            const newAvatar = reader.result;
            setAvatar(newAvatar);
            setIsLoading(true);
            try {
                await fetch(`${API_URL}/update-profile`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, avatar: newAvatar })
                });
                localStorage.setItem('avatar', newAvatar);
                alert("เปลี่ยนรูปสำเร็จ!");
            } catch(e) { alert("Error"); }
            setIsLoading(false);
        };
        reader.readAsDataURL(file);
    }
  };

  const logout = () => { 
      setToken(""); setUsername(""); setPassword(""); setAvatar(""); setRoom(""); setRoomPassword("");
      localStorage.clear(); setShowChat(false); setViewMode("chat");
  };

  const handleRoomAction = async () => {
    if(!room || !roomPassword) return alert("กรอกข้อมูลห้องให้ครบ");
    setIsLoading(true);
    const endpoint = roomMode === "create" ? "/create-room" : "/join-room-verify";
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: room, password: roomPassword })
      });
      const data = await res.json();
      if(res.ok) enterRoom();
      else alert(data.message);
    } catch(e) { alert("Error connecting to server"); }
    setIsLoading(false);
  };

  const enterRoom = async () => {
    socket.emit("join_room", { room, username, avatar });
    setShowChat(true);
    try {
        const res = await fetch(`${API_URL}/messages/${room}`);
        const data = await res.json();
        if (Array.isArray(data)) setMessageList(data);
        else setMessageList([]); 
    } catch(e) { console.error(e); }
  };

  const leaveRoom = () => { 
    if(inCall) leaveCall(); 
    setShowChat(false); setMessageList([]); setRoom(""); setRoomPassword(""); window.location.reload(); 
  };

  // --- Message Functions ---
  const sendMessage = async () => {
    if (currentMessage !== "") {
      const tempId = Date.now(); 
      const msg = { 
          room, author: username, avatar,
          message: currentMessage, type: "text", 
          time: new Date().getHours() + ":" + String(new Date().getMinutes()).padStart(2, '0') 
      };
      setMessageList((list) => [...list, { ...msg, _id: tempId }]);
      socket.emit("send_message", msg, (savedMsg) => {
          setMessageList((currentList) => currentList.map((m) => m._id === tempId ? savedMsg : m));
      });
      setCurrentMessage(""); setShowEmoji(false);
      socket.emit("typing", { room, author: username, isTyping: false });
    }
  };

  const selectImage = (e) => {
    const file = e.target.files[0];
    if(file){
        if(file.size > 2*1024*1024) return alert("ไฟล์ใหญ่เกิน 2MB");
        setIsLoading(true);
        const r = new FileReader();
        r.onloadend=()=>{ 
            const tempId = Date.now(); 
            const msg = {
                room, author: username, avatar,
                message: r.result, type: "image", 
                time: new Date().getHours() + ":" + String(new Date().getMinutes()).padStart(2, '0')
            };
            setMessageList((list) => [...list, { ...msg, _id: tempId }]);
            socket.emit("send_message", msg, (savedMsg) => {
                setMessageList((currentList) => currentList.map((m) => m._id === tempId ? savedMsg : m));
            });
            setIsLoading(false);
        };
        r.readAsDataURL(file);
    }
  };

  const deleteMessage = (id) => { if(confirm("ลบข้อความ?")) socket.emit("delete_message", id); };
  const handleTyping = (e) => { setCurrentMessage(e.target.value); socket.emit("typing", { room, author: username }); };
  const onEmojiClick = (e) => setCurrentMessage(prev => prev + e.emoji);

  // --- 📞 Call Functions (Cleanup & Fixes) ---
  const startCall = () => {
    setInCall(true);
    
    // ✅ 3. Cleanup Listener เก่าทิ้งก่อนเริ่มใหม่ เพื่อป้องกัน Ghost Peer
    socket.off("all_users_in_call");
    socket.off("user_joined_call");
    socket.off("receiving_returned_signal");
    socket.off("user_left_call");

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
      userStream.current = stream;
      if (userVideo.current) userVideo.current.srcObject = stream;

      socket.emit("join_voice_channel", room);

      socket.on("all_users_in_call", (users) => {
        const peersArr = [];
        users.forEach(userID => {
          const alreadyExists = peersRef.current.some(p => p.peerID === userID);
          if (alreadyExists) return;

          const peer = createPeer(userID, socket.id, stream);
          peersRef.current.push({ peerID: userID, peer });
          peersArr.push({ peerID: userID, peer });
        });
        setPeers(peersArr);
      });

      socket.on("user_joined_call", payload => {
        const item = peersRef.current.find(p => p.peerID === payload.callerID);
        if (item) {
            item.peer.signal(payload.signal);
            return;
        }

        const peer = addPeer(payload.signal, payload.callerID, stream);
        peersRef.current.push({ peerID: payload.callerID, peer });
        setPeers(users => [...users, { peerID: payload.callerID, peer }]);
      });

      socket.on("receiving_returned_signal", payload => {
        const item = peersRef.current.find(p => p.peerID === payload.id);
        if(item) item.peer.signal(payload.signal);
      });

      socket.on("user_left_call", id => {
        const peerObj = peersRef.current.find(p => p.peerID === id);
        if(peerObj) peerObj.peer.destroy();
        const newPeers = peersRef.current.filter(p => p.peerID !== id);
        peersRef.current = newPeers;
        setPeers(newPeers);
      });
    }).catch(err => {
        console.error(err);
        alert("ไม่สามารถเข้าถึงกล้อง/ไมค์ได้");
        setInCall(false);
    });
  };
  
  const iceConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };

  const createPeer = (userToSignal, callerID, stream) => {
    const peer = new SimplePeer({ 
        initiator: true, 
        trickle: false, 
        stream,
        config: iceConfig // ✅ เพิ่มบรรทัดนี้
    });
    peer.on("signal", signal => {
      socket.emit("sending_signal", { userToSignal, callerID, signal });
    });
    return peer;
  };

  const addPeer = (incomingSignal, callerID, stream) => {
    const peer = new SimplePeer({ 
        initiator: false, 
        trickle: false, 
        stream,
        config: iceConfig // ✅ เพิ่มบรรทัดนี้
    });
    peer.on("signal", signal => {
      socket.emit("returning_signal", { signal, callerID });
    });
    peer.signal(incomingSignal);
    return peer;
  };

  const leaveCall = () => {
    setInCall(false);
    socket.emit("leave_voice_channel");
    
    if (userStream.current) {
        userStream.current.getTracks().forEach(track => track.stop());
    }
    
    peersRef.current.forEach(p => p.peer.destroy());
    peersRef.current = [];
    setPeers([]);
    
    // 🧹 Cleanup Listeners
    socket.off("all_users_in_call");
    socket.off("user_joined_call");
    socket.off("receiving_returned_signal");
    socket.off("user_left_call");
  };

  // --- Listeners ---
  useEffect(() => {
    // Cleanup Global Socket Listeners on Unmount
    return () => {
       socket.off("all_users_in_call");
       socket.off("user_joined_call");
       socket.off("receiving_returned_signal");
       socket.off("user_left_call");
    };
  }, []);

  useEffect(() => {
    const handleReceiveMsg = (data) => {
        setMessageList((list) => [...list, data]);
        setTypingStatus("");
      };
    const handleMsgDeleted = (id) => setMessageList((list) => list.filter(m => m._id !== id));
    const handleRoomUsers = (users) => setUsersInRoom(users);

    socket.on("receive_message", handleReceiveMsg);
    socket.on("message_deleted", handleMsgDeleted);
    socket.on("room_users", handleRoomUsers);

    return () => {
        socket.off("receive_message", handleReceiveMsg);
        socket.off("message_deleted", handleMsgDeleted);
        socket.off("room_users", handleRoomUsers);
    };
  }, [username]);

  useEffect(() => {
    const handleDisplayTyping = (data) => {
        setTypingStatus(`${data.author} กำลังพิมพ์...`);
        if(typingTimeout) clearTimeout(typingTimeout);
        const newTimeout = setTimeout(() => setTypingStatus(""), 3000);
        setTypingTimeout(newTimeout);
    };
    socket.on("display_typing", handleDisplayTyping);
    return () => {
        socket.off("display_typing", handleDisplayTyping);
        if(typingTimeout) clearTimeout(typingTimeout);
    };
  }, [typingTimeout]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messageList, typingStatus]);

  // --- Render (เหมือนเดิม) ---
  return (
    <div className="App">
      {isLoading && <div className="loading-overlay"><div className="spinner"></div></div>}
      
      {!token ? (
        <div className="joinChatContainer card-animation">
          <div className="icon">💬</div><h3>{authMode==="login"?"เข้าสู่ระบบ":"สร้างบัญชี"}</h3>
          <input type="text" placeholder="ชื่อผู้ใช้" value={username} onChange={e=>setUsername(e.target.value)} onKeyPress={e=>e.key==='Enter'&&handleAuth()}/>
          <input type="password" placeholder="รหัสผ่าน" value={password} onChange={e=>setPassword(e.target.value)} onKeyPress={e=>e.key==='Enter'&&handleAuth()}/>
          <button onClick={handleAuth}>{authMode==="login"?"Login":"Sign Up"}</button>
          <p className="toggle-link" onClick={()=>setAuthMode(authMode==="login"?"register":"login")}>{authMode==="login"?"ยังไม่มีบัญชี? สมัครเลย":"มีบัญชีแล้ว? เข้าสู่ระบบ"}</p>
        </div>
      ) : (
        !showChat ? (
            <div className="joinChatContainer card-animation">
                {viewMode === "chat" ? (
                    <>
                        <div className="profile-header">
                            <div className="avatar-wrapper">
                                <img src={avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${username}`} className="main-avatar" onClick={()=>setViewMode("profile")}/>
                                <span className="edit-badge">✏️</span>
                            </div>
                            <h3>{username}</h3>
                        </div>
                        <div className="room-tabs">
                            <button className={roomMode==="join"?"tab active":"tab"} onClick={()=>setRoomMode("join")}>เข้าร่วม</button>
                            <button className={roomMode==="create"?"tab active":"tab"} onClick={()=>setRoomMode("create")}>สร้างห้อง</button>
                        </div>
                        <input type="text" placeholder="ชื่อห้อง" value={room} onChange={e=>setRoom(e.target.value)} />
                        <input type="password" placeholder="รหัสผ่านห้อง" value={roomPassword} onChange={e=>setRoomPassword(e.target.value)} />
                        <button className="primary-btn" onClick={handleRoomAction}>{roomMode==="join"?"Join Room":"Create Room"}</button>
                        <button onClick={logout} className="logout-btn">Log Out</button>
                    </>
                ) : (
                    <div className="profile-edit-section">
                        <h3>แก้ไขโปรไฟล์</h3>
                        <img src={avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${username}`} className="large-avatar" />
                        <button className="upload-btn" onClick={()=>profileInputRef.current.click()}>📷 อัปโหลดรูป</button>
                        <input type="file" style={{display:'none'}} ref={profileInputRef} accept="image/*" onChange={handleUpdateProfile}/>
                        <button onClick={()=>setViewMode("chat")} className="back-btn">กลับ</button>
                    </div>
                )}
            </div>
        ) : (
            <div className="chat-window card-animation">
                <div className="chat-header">
                    <div className="header-info">
                        <span className="live-dot">●</span>
                        <p className="room-title">{room}</p>
                    </div>
                    <div className="header-actions">
                        <button className={`call-btn ${inCall ? 'active' : ''}`} onClick={inCall ? leaveCall : startCall}>
                             {inCall ? "วางสาย" : "📞 โทรกลุ่ม"}
                        </button>
                        
                        <button className="users-toggle-btn" onClick={()=>setShowUserList(!showUserList)}>
                            <UsersIcon /> <span>{usersInRoom.length}</span>
                        </button>
                        <button className="leave-btn" onClick={leaveRoom} title="Leave Room"><LogoutIcon /></button>
                    </div>
                </div>
                
                <div className="chat-main-area">
                    <div className={`users-sidebar ${showUserList ? 'open' : ''}`}>
                        <h4>สมาชิกออนไลน์ ({usersInRoom.length})</h4>
                        <ul>
                            {usersInRoom.map((u, i) => (
                                <li key={i}>
                                    <img src={u.avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${u.username}`} />
                                    <span>{u.username}</span>
                                    {u.username === username && <span className="me-badge">(ฉัน)</span>}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="chat-body" onClick={() => setShowUserList(false)}>
                        {inCall && (
                            <div className="video-grid-overlay">
                                <div className="video-container me">
                                    <video muted ref={userVideo} autoPlay playsInline />
                                    <span>ฉัน</span>
                                </div>
                                {peers.map((peerObj, index) => (
                                    <div className="video-container" key={index}>
                                        <Video peer={peerObj.peer} />
                                    </div>
                                ))}
                            </div>
                        )}

                        {messageList.map((msg, i) => {
                            const isMe = username === msg.author; 
                            const isImg = msg.type === 'image' || (msg.message && msg.message.startsWith('data:image'));
                            const userAvatar = msg.avatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${msg.author}`;
                            return (
                                <div key={i} className={`message ${isMe ? "you" : "other"}`}>
                                    {!isMe && <img src={userAvatar} className="avatar-icon"/>}
                                    <div className="message-wrapper">
                                        {!isMe && <p className="msg-author">{msg.author}</p>}
                                        <div className={`message-content ${isImg ? 'image-type' : ''}`}>
                                            {isImg ? <img src={msg.message} className="chat-image"/> : <p>{msg.message}</p>}
                                            <div className="message-meta">
                                                <span>{msg.time}</span>
                                                {isMe && (
                                                    <span className="delete-msg-btn" onClick={() => deleteMessage(msg._id)} title="ลบข้อความ">
                                                        <TrashIcon />
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {isMe && <img src={userAvatar} className="avatar-icon"/>}
                                </div>
                            )
                        })}
                        {typingStatus && <div className="typing-indicator"><p>✍️ {typingStatus}</p></div>}
                        <div ref={messagesEndRef} />
                    </div>
                </div>
                
                <div className="chat-footer">
                    {/* ... (ส่วนแสดง Emoji Picker และ Input Message เหมือนเดิม) ... */}
                    {showEmoji && (
                        <>
                            <div className="emoji-backdrop" onClick={()=>setShowEmoji(false)}></div>
                            <div className="emoji-picker-container"><EmojiPicker onEmojiClick={onEmojiClick} width={300} height={400}/></div>
                        </>
                    )}
                    
                    <button className="emoji-btn" onClick={()=>setShowEmoji(!showEmoji)}><EmojiIcon /></button>
                    <button className="attach-btn" onClick={()=>fileInputRef.current.click()}><AttachIcon /></button>
                    <input type="file" style={{display:'none'}} ref={fileInputRef} accept="image/*" onChange={selectImage}/>
                    
                    <input 
                        type="text" 
                        value={currentMessage} 
                        placeholder="พิมพ์ข้อความ..." 
                        onChange={handleTyping} 
                        onKeyPress={e=>e.key==='Enter'&&sendMessage()}
                    />
                    <button className="send-btn" onClick={sendMessage}><SendIcon /></button>
                </div>
            </div>
        )
      )}
    </div>
  );
}

export default App;