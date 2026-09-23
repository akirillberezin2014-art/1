const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '100mb' }));

// Папка serv для хранения данных
const SERV_DIR = path.join(__dirname, 'serv');
if (!fs.existsSync(SERV_DIR)) {
  fs.mkdirSync(SERV_DIR, { recursive: true });
}

const USERS_FILE = path.join(SERV_DIR, 'users.json');
const MESSAGES_FILE = path.join(SERV_DIR, 'messages.json');

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));

function readUsers() { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
function writeUsers(data) { fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2)); }
function readMessages() { return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8')); }
function writeMessages(data) { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2)); }

// Шифрование данных (Base64 + Цезарь)
const SECRET_SHIFT = 7;
function encryptData(text) {
  if (!text) return text;
  let base64 = Buffer.from(text, 'utf8').toString('base64');
  let result = '';
  for (let i = 0; i < base64.length; i++) {
    result += String.fromCharCode(base64.charCodeAt(i) + SECRET_SHIFT);
  }
  return result;
}

function decryptData(text) {
  if (!text) return text;
  let base64 = '';
  for (let i = 0; i < text.length; i++) {
    base64 += String.fromCharCode(text.charCodeAt(i) - SECRET_SHIFT);
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

// API Эндпоинты
app.post('/api/register', (req, res) => {
  const { username, password, name } = req.body;
  const users = readUsers();

  if (!username || !password || !name) return res.status(400).json({ error: 'Заполните все поля.' });
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'Это имя пользователя уже занято.' });
  }

  if (password.length < 8 || !/[a-zA-Z]/.test(password)) {
    return res.status(400).json({ 
      error: 'Пароль слишком простой! Нужен латинский алфавит (latin alphabet): минимум 8 символов и хотя бы 1 латинская буква.' 
    });
  }

  const newUser = {
    id: 'id_' + Math.random().toString(36).substr(2, 9),
    username, password, name, avatar: '', isGuest: false, isBanned: false
  };

  users.push(newUser);
  writeUsers(users);
  res.json({ success: true, user: newUser });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

  if (!user) return res.status(401).json({ error: 'Неверный логин или пароль.' });
  if (user.isBanned) return res.status(403).json({ error: 'Ваш аккаунт заблокирован.' });

  res.json({ success: true, user });
});

app.post('/api/guest', (req, res) => {
  const guestUser = {
    id: 'guest_' + Math.random().toString(36).substr(2, 9),
    username: 'guest_' + Math.floor(Math.random() * 10000),
    name: 'Гость', avatar: '', isGuest: true, isBanned: false
  };
  res.json({ success: true, user: guestUser });
});

app.post('/api/convert-guest', (req, res) => {
  const { username, password, name } = req.body;
  const users = readUsers();

  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'Логин уже занят.' });
  }

  if (password.length < 8 || !/[a-zA-Z]/.test(password)) {
    return res.status(400).json({ error: 'Пароль должен быть от 8 символов и иметь латинскую букву.' });
  }

  const newUser = {
    id: 'id_' + Math.random().toString(36).substr(2, 9),
    username, password, name, avatar: '', isGuest: false, isBanned: false
  };

  users.push(newUser);
  writeUsers(users);
  res.json({ success: true, user: newUser });
});

app.post('/api/profile/update', (req, res) => {
  const { userId, name, avatar } = req.body;
  const users = readUsers();
  const user = users.find(u => u.id === userId);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден.' });

  if (name) user.name = name;
  if (avatar !== undefined) user.avatar = avatar;

  writeUsers(users);
  res.json({ success: true, user });
});

app.get('/api/users/find/:id', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден.' });

  res.json({
    id: user.id, name: user.name, username: user.username, avatar: user.avatar, isGuest: user.isGuest
  });
});

app.post('/api/messages/send', (req, res) => {
  const { senderId, senderName, text, fileData, fileName, fileType } = req.body;
  const users = readUsers();
  const user = users.find(u => u.id === senderId);

  if (user && user.isBanned) return res.status(403).json({ error: 'Вы заблокированы.' });

  const messages = readMessages();
  const newMsg = {
    id: 'msg_' + Date.now(),
    senderId, senderName,
    text: encryptData(text || ''),
    fileData: encryptData(fileData || ''),
    fileName: encryptData(fileName || ''),
    fileType: fileType || '',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  messages.push(newMsg);
  writeMessages(messages);
  res.json({ success: true });
});

app.get('/api/messages', (req, res) => {
  const messages = readMessages();
  const decrypted = messages.map(m => ({
    ...m,
    text: decryptData(m.text),
    fileData: decryptData(m.fileData),
    fileName: decryptData(m.fileName)
  }));
  res.json(decrypted);
});

// Управление с ПК (пароль 009k)
app.post('/api/admin/login', (req, res) => {
  if (req.body.pass === '009k') res.json({ success: true });
  else res.status(401).json({ error: 'Неверный пароль.' });
});

app.get('/api/admin/users', (req, res) => res.json(readUsers()));

app.post('/api/admin/ban', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.body.userId);
  if (user) {
    user.isBanned = !user.isBanned;
    writeUsers(users);
    res.json({ success: true });
  } else res.status(404).json({ error: 'Не найден.' });
});

app.post('/api/admin/delete-user', (req, res) => {
  let users = readUsers();
  users = users.filter(u => u.id !== req.body.userId);
  writeUsers(users);
  res.json({ success: true });
});

app.post('/api/admin/clear-messages', (req, res) => {
  writeMessages([]);
  res.json({ success: true });
});

// Отдача единого клиентского веб-интерфейса
app.get('*', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Мессенджер</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
    html, body { height: 100%; width: 100%; background: #0e1621; color: #fff; overflow: hidden; position: fixed; }

    .screen { display: none; height: 100vh; width: 100vw; flex-direction: column; position: absolute; top: 0; left: 0; }
    .active { display: flex; }

    .auth-container { margin: auto; width: 90%; max-width: 400px; background: #17212b; padding: 25px; border-radius: 12px; }
    .auth-container h2 { margin-bottom: 20px; text-align: center; color: #5288c1; }
    .input-group { margin-bottom: 15px; }
    .input-group label { display: block; margin-bottom: 5px; font-size: 13px; color: #7f91a4; }
    .input-group input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #242f3d; background: #242f3d; color: #fff; outline: none; }
    .btn { width: 100%; padding: 12px; background: #5288c1; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 10px; }
    .btn-secondary { background: transparent; color: #5288c1; border: 1px solid #5288c1; }
    .error-msg { color: #e53935; font-size: 12px; margin-top: 8px; text-align: center; display: none; }

    header { background: #17212b; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; border-bottom: 1px solid #0e1621; }
    .user-info { display: flex; align-items: center; gap: 10px; cursor: pointer; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: #5288c1; display: flex; align-items: center; justify-content: center; font-weight: bold; overflow: hidden; object-fit: cover; }
    .guest-badge { font-size: 10px; color: #aaa; text-transform: lowercase; font-style: italic; }

    .chat-box { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; -webkit-overflow-scrolling: touch; }
    .msg { max-width: 80%; padding: 10px 14px; border-radius: 12px; background: #182533; align-self: flex-start; word-break: break-word; }
    .msg.my { background: #2b5278; align-self: flex-end; }
    .msg .author { font-size: 11px; color: #5288c1; margin-bottom: 4px; font-weight: bold; }
    .msg img, .msg video, .msg audio { max-width: 100%; border-radius: 8px; margin-top: 5px; display: block; }
    .msg .file-link { display: inline-block; padding: 8px; background: #242f3d; border-radius: 6px; color: #64b5f6; text-decoration: none; margin-top: 5px; }

    .input-bar { background: #17212b; padding: 10px; display: flex; gap: 10px; align-items: center; flex-shrink: 0; }
    .input-bar input[type="text"] { flex: 1; padding: 12px; border-radius: 20px; border: none; background: #242f3d; color: #fff; outline: none; }
    .icon-btn { cursor: pointer; font-size: 20px; user-select: none; }

    .modal { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.7); display: none; align-items: center; justify-content: center; z-index: 100; }
    .modal-content { background: #17212b; padding: 20px; border-radius: 12px; width: 90%; max-width: 400px; max-height: 85vh; overflow-y: auto; }
  </style>
</head>
<body>

  <div id="auth-screen" class="screen active">
    <div class="auth-container">
      <h2 id="auth-title">Вход в мессенджер</h2>
      <div id="auth-error" class="error-msg"></div>
      
      <div class="input-group" id="group-name" style="display:none;">
        <label>Имя</label>
        <input type="text" id="auth-name" placeholder="Введите имя">
      </div>
      <div class="input-group">
        <label>Имя пользователя (Login)</label>
        <input type="text" id="auth-username" placeholder="@username">
      </div>
      <div class="input-group">
        <label>Пароль (Latin alphabet: мин. 8 символов + 1 буква)</label>
        <input type="password" id="auth-password" placeholder="••••••••">
      </div>

      <button class="btn" id="btn-main-action" onclick="handleAuth()">Войти</button>
      <button class="btn btn-secondary" id="btn-toggle-mode" onclick="toggleAuthMode()">Нет аккаунта? Зарегистрироваться</button>
      <button class="btn btn-secondary" onclick="loginAsGuest()" style="margin-top:10px; border-color:#888; color:#888;">Зайти как гость</button>
    </div>
  </div>

  <div id="chat-screen" class="screen">
    <header>
      <div class="user-info" onclick="openProfile()">
        <img id="my-avatar" class="avatar" style="display:none;">
        <div id="my-avatar-placeholder" class="avatar">U</div>
        <div>
          <div style="font-weight:bold;"><span id="my-name">Имя</span> <span id="my-guest-label" class="guest-badge" style="display:none;">гость</span></div>
          <div style="font-size:11px; color:#7f91a4;" id="my-id-display">ID: ...</div>
        </div>
      </div>
      <button class="btn btn-secondary" style="width:auto; padding:6px 12px; font-size:12px;" onclick="openSearchModal()">Поиск по ID</button>
    </header>

    <div class="chat-box" id="chat-box"></div>

    <div class="input-bar">
      <label class="icon-btn">📎<input type="file" id="file-input" style="display:none;" onchange="handleFileSelect(event)"></label>
      <span class="icon-btn" id="mic-btn" onclick="toggleVoiceRecord()">🎙️</span>
      <input type="text" id="msg-input" placeholder="Напишите сообщение..." onkeydown="if(event.key==='Enter') sendMsg()">
      <button class="btn" style="width:auto; padding:10px 18px; border-radius:20px;" onclick="sendMsg()">➤</button>
    </div>
  </div>

  <div id="profile-modal" class="modal">
    <div class="modal-content">
      <h3 style="margin-bottom:15px;">Профиль</h3>
      <div class="input-group"><label>Мой ID:</label><input type="text" id="prof-id" readonly></div>
      <div class="input-group"><label>Имя:</label><input type="text" id="prof-name"></div>
      <div class="input-group"><label>Аватарка:</label><input type="file" id="prof-avatar-file" accept="image/*" onchange="uploadAvatar(event)"></div>

      <div id="guest-register-block" style="display:none; border-top:1px solid #333; padding-top:15px; margin-top:15px;">
        <h4 style="color:#5288c1; margin-bottom:10px;">Зарегистрировать аккаунт</h4>
        <div class="input-group"><label>Username</label><input type="text" id="reg-guest-user"></div>
        <div class="input-group"><label>Пароль</label><input type="password" id="reg-guest-pass"></div>
        <button class="btn" onclick="convertGuest()">Зарегистрировать</button>
      </div>

      <button class="btn" onclick="saveProfile()">Сохранить</button>
      <button class="btn btn-secondary" onclick="logout()" style="border-color:#e53935; color:#e53935; margin-top:10px;">Выйти</button>
      <button class="btn btn-secondary" onclick="closeModal('profile-modal')" style="margin-top:5px;">Закрыть</button>
    </div>
  </div>

  <div id="search-modal" class="modal">
    <div class="modal-content">
      <h3>Поиск по ID</h3>
      <div class="input-group" style="margin-top:15px;"><input type="text" id="search-id-input" placeholder="Введите ID"></div>
      <button class="btn" onclick="findUserById()">Найти</button>
      
      <div id="search-result" style="margin-top:15px; display:none; background:#242f3d; padding:10px; border-radius:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <img id="search-avatar" class="avatar" style="display:none;">
          <div id="search-avatar-ph" class="avatar">U</div>
          <div>
            <div id="search-name-res" style="font-weight:bold;"></div>
            <div id="search-user-res" style="font-size:12px; color:#aaa;"></div>
          </div>
        </div>
      </div>

      <button class="btn btn-secondary" onclick="closeModal('search-modal')" style="margin-top:15px;">Закрыть</button>
    </div>
  </div>

  <div id="admin-modal" class="modal">
    <div class="modal-content">
      <h3>Панель админа</h3>
      <div id="admin-login-block">
        <div class="input-group" style="margin-top:10px;"><label>Пароль:</label><input type="password" id="admin-pass-input" placeholder="009k"></div>
        <button class="btn" onclick="adminLogin()">Войти</button>
      </div>
      <div id="admin-panel-block" style="display:none; margin-top:15px;">
        <button class="btn btn-secondary" onclick="clearAllMessages()" style="border-color:#e53935; color:#e53935; margin-bottom:15px;">Очистить все сообщения</button>
        <h4>Пользователи:</h4>
        <div id="admin-users-list" style="max-height:200px; overflow-y:auto; margin-top:10px;"></div>
      </div>
      <button class="btn btn-secondary" onclick="closeModal('admin-modal')" style="margin-top:15px;">Закрыть</button>
    </div>
  </div>

  <script>
    let currentUser = null;
    let isRegisterMode = false;
    let selectedFile = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;

    function toggleAuthMode() {
      isRegisterMode = !isRegisterMode;
      document.getElementById('auth-title').innerText = isRegisterMode ? 'Регистрация' : 'Вход в мессенджер';
      document.getElementById('group-name').style.display = isRegisterMode ? 'block' : 'none';
      document.getElementById('btn-main-action').innerText = isRegisterMode ? 'Зарегистрироваться' : 'Войти';
      document.getElementById('btn-toggle-mode').innerText = isRegisterMode ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться';
      document.getElementById('auth-error').style.display = 'none';
    }

    async function handleAuth() {
      const username = document.getElementById('auth-username').value.trim();
      const password = document.getElementById('auth-password').value;
      const name = document.getElementById('auth-name').value.trim();
      const errBox = document.getElementById('auth-error');
      errBox.style.display = 'none';

      const endpoint = isRegisterMode ? '/api/register' : '/api/login';
      const body = isRegisterMode ? { username, password, name } : { username, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!data.success) {
        errBox.innerText = data.error;
        errBox.style.display = 'block';
      } else {
        currentUser = data.user;
        initChat();
      }
    }

    async function loginAsGuest() {
      const res = await fetch('/api/guest', { method: 'POST' });
      const data = await res.json();
      currentUser = data.user;
      initChat();
    }

    function initChat() {
      document.getElementById('auth-screen').classList.remove('active');
      document.getElementById('chat-screen').classList.add('active');

      document.getElementById('my-name').innerText = currentUser.name;
      document.getElementById('my-id-display').innerText = 'ID: ' + currentUser.id;

      if (currentUser.isGuest) {
        document.getElementById('my-guest-label').style.display = 'inline';
        document.getElementById('guest-register-block').style.display = 'block';
      } else {
        document.getElementById('my-guest-label').style.display = 'none';
        document.getElementById('guest-register-block').style.display = 'none';
      }

      updateAvatarDisplay(currentUser.avatar, 'my-avatar', 'my-avatar-placeholder', currentUser.name);
      setInterval(loadMessages, 1500);
      loadMessages();
    }

    function updateAvatarDisplay(avatarUrl, imgId, placeholderId, name) {
      const img = document.getElementById(imgId);
      const ph = document.getElementById(placeholderId);
      if (avatarUrl) {
        img.src = avatarUrl;
        img.style.display = 'block';
        ph.style.display = 'none';
      } else {
        img.style.display = 'none';
        ph.style.display = 'flex';
        ph.innerText = (name || 'U')[0].toUpperCase();
      }
    }

    async function loadMessages() {
      const res = await fetch('/api/messages');
      const messages = await res.json();
      const box = document.getElementById('chat-box');
      box.innerHTML = '';

      messages.forEach(m => {
        const div = document.createElement('div');
        div.className = 'msg ' + (m.senderId === currentUser.id ? 'my' : '');
        
        let contentHtml = \`<div class="author">\${m.senderName}</div>\`;
        if (m.text) contentHtml += \`<div>\${m.text}</div>\`;

        if (m.fileData) {
          if (m.fileType.startsWith('image/')) {
            contentHtml += \`<img src="\${m.fileData}">\`;
          } else if (m.fileType.startsWith('video/')) {
            contentHtml += \`<video src="\${m.fileData}" controls></video>\`;
          } else if (m.fileType.startsWith('audio/')) {
            contentHtml += \`<audio src="\${m.fileData}" controls></audio>\`;
          } else {
            contentHtml += \`<a class="file-link" href="\${m.fileData}" download="\${m.fileName}">📁 \${m.fileName}</a>\`;
          }
        }

        div.innerHTML = contentHtml;
        box.appendChild(div);
      });
    }

    function handleFileSelect(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        selectedFile = { data: evt.target.result, name: file.name, type: file.type };
        alert('Файл выбран: ' + file.name);
      };
      reader.readAsDataURL(file);
    }

    async function toggleVoiceRecord() {
      const micBtn = document.getElementById('mic-btn');
      if (!isRecording) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];
          mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
          mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onload = function(evt) {
              selectedFile = { data: evt.target.result, name: 'voice_message.webm', type: 'audio/webm' };
              sendMsg();
            };
            reader.readAsDataURL(audioBlob);
          };
          mediaRecorder.start();
          isRecording = true;
          micBtn.innerText = '🔴';
        } catch (e) { alert('Нет доступа к микрофону.'); }
      } else {
        mediaRecorder.stop();
        isRecording = false;
        micBtn.innerText = '🎙️';
      }
    }

    async function sendMsg() {
      const input = document.getElementById('msg-input');
      const text = input.value.trim();
      if (!text && !selectedFile) return;

      const body = {
        senderId: currentUser.id,
        senderName: currentUser.name + (currentUser.isGuest ? ' (гость)' : ''),
        text: text,
        fileData: selectedFile ? selectedFile.data : '',
        fileName: selectedFile ? selectedFile.name : '',
        fileType: selectedFile ? selectedFile.type : ''
      };

      await fetch('/api/messages/send', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
      });

      input.value = '';
      selectedFile = null;
      document.getElementById('file-input').value = '';
      loadMessages();
    }

    function openProfile() {
      document.getElementById('prof-id').value = currentUser.id;
      document.getElementById('prof-name').value = currentUser.name;
      document.getElementById('profile-modal').style.display = 'flex';
    }

    function uploadAvatar(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) { currentUser.avatar = evt.target.result; };
      reader.readAsDataURL(file);
    }

    async function saveProfile() {
      const name = document.getElementById('prof-name').value.trim();
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ userId: currentUser.id, name, avatar: currentUser.avatar })
      });
      const data = await res.json();
      if (data.success) {
        currentUser = data.user;
        document.getElementById('my-name').innerText = currentUser.name;
        updateAvatarDisplay(currentUser.avatar, 'my-avatar', 'my-avatar-placeholder', currentUser.name);
        closeModal('profile-modal');
      }
    }

    async function convertGuest() {
      const username = document.getElementById('reg-guest-user').value.trim();
      const password = document.getElementById('reg-guest-pass').value;

      const res = await fetch('/api/convert-guest', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username, password, name: currentUser.name })
      });
      const data = await res.json();
      if (!data.success) alert(data.error);
      else {
        currentUser = data.user;
        alert('Аккаунт зарегистрирован!');
        initChat();
        closeModal('profile-modal');
      }
    }

    function logout() { location.reload(); }

    function openSearchModal() { document.getElementById('search-modal').style.display = 'flex'; }

    async function findUserById() {
      const id = document.getElementById('search-id-input').value.trim();
      const res = await fetch('/api/users/find/' + id);
      const data = await res.json();
      const resBlock = document.getElementById('search-result');

      if (res.status !== 200) {
        alert(data.error);
        resBlock.style.display = 'none';
        return;
      }

      resBlock.style.display = 'block';
      document.getElementById('search-name-res').innerText = data.name + (data.isGuest ? ' (гость)' : '');
      document.getElementById('search-user-res').innerText = '@' + data.username;
      updateAvatarDisplay(data.avatar, 'search-avatar', 'search-avatar-ph', data.name);
    }

    function closeModal(id) { document.getElementById(id).style.display = 'none'; }

    // Горячая клавиша для вызова админки с ПК (Ctrl + Shift + A)
    window.addEventListener('keydown', e => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        document.getElementById('admin-modal').style.display = 'flex';
      }
    });

    async function adminLogin() {
      const pass = document.getElementById('admin-pass-input').value;
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ pass })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('admin-login-block').style.display = 'none';
        document.getElementById('admin-panel-block').style.display = 'block';
        loadAdminUsers();
      } else alert(data.error);
    }

    async function loadAdminUsers() {
      const res = await fetch('/api/admin/users');
      const users = await res.json();
      const list = document.getElementById('admin-users-list');
      list.innerHTML = '';

      users.forEach(u => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; background:#242f3d; padding:8px; border-radius:6px;';
        div.innerHTML = \`
          <div>
            <div><b>\${u.name}</b> (@\${u.username})</div>
            <div style="font-size:10px; color:#aaa;">\${u.id}</div>
          </div>
          <div>
            <button onclick="toggleBan('\${u.id}')" style="padding:4px 8px;">\${u.isBanned ? 'Разбанить' : 'Бан'}</button>
            <button onclick="deleteUser('\${u.id}')" style="padding:4px 8px; color:red;">Удалить</button>
          </div>
        \`;
        list.appendChild(div);
      });
    }

    async function toggleBan(userId) {
      await fetch('/api/admin/ban', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ userId })
      });
      loadAdminUsers();
    }

    async function deleteUser(userId) {
      await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ userId })
      });
      loadAdminUsers();
    }

    async function clearAllMessages() {
      if (confirm('Очистить все сообщения?')) {
        await fetch('/api/admin/clear-messages', { method: 'POST' });
        alert('Сообщения очищены.');
      }
    }
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
