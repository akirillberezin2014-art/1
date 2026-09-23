const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DB_FILE = path.join(__dirname, 'messages.json');

// Создаем файл для хранения сообщений и пользователей, если его нет
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], messages: [] }));
}

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { users: [], messages: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const server = http.createServer((req, res) => {
  // Обработка API запросов
  if (req.method === 'POST' && req.url === '/api/register') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { username } = JSON.parse(body || '{}');
      const data = readData();
      if (username && !data.users.includes(username)) {
        data.users.push(username);
        saveData(data);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/users')) {
    const data = readData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data.users));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/send') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const msg = JSON.parse(body || '{}');
      if (msg.from && msg.to && msg.text) {
        const data = readData();
        data.messages.push({ ...msg, time: new Date().toLocaleTimeString() });
        saveData(data);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/messages')) {
    const data = readData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data.messages));
    return;
  }

  // Главная HTML страница
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Local Messenger</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: sans-serif; }
    body { background: #121212; color: #fff; display: flex; height: 100vh; }
    #auth-screen { position: fixed; inset: 0; background: #121212; display: flex; align-items: center; justify-content: center; z-index: 10; }
    .card { background: #1e1e1e; padding: 20px; border-radius: 8px; width: 90%; max-width: 320px; text-align: center; }
    input, button { width: 100%; padding: 10px; margin-top: 10px; border-radius: 5px; border: none; outline: none; }
    input { background: #2a2a2a; color: #fff; }
    button { background: #007bff; color: #fff; font-weight: bold; cursor: pointer; }
    #sidebar { width: 30%; background: #1e1e1e; border-right: 1px solid #333; display: flex; flex-direction: column; }
    #search { margin: 10px; }
    #user-list { flex: 1; overflow-y: auto; }
    .user-item { padding: 12px; border-bottom: 1px solid #2a2a2a; cursor: pointer; }
    .user-item:hover, .user-item.active { background: #2a2a2a; }
    #chat { flex: 1; display: flex; flex-direction: column; }
    #chat-header { padding: 15px; background: #1e1e1e; border-bottom: 1px solid #333; font-weight: bold; }
    #messages { flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .msg { max-width: 70%; padding: 8px 12px; border-radius: 8px; background: #2a2a2a; word-break: break-word; }
    .msg.my { align-self: flex-end; background: #007bff; }
    #input-area { display: flex; padding: 10px; background: #1e1e1e; }
    #input-area input { flex: 1; margin-top: 0; margin-right: 10px; }
    #input-area button { width: auto; margin-top: 0; padding: 0 20px; }
  </style>
</head>
<body>

  <div id="auth-screen">
    <div class="card">
      <h3>Введите ваш ник</h3>
      <input type="text" id="username-input" placeholder="Никнейм...">
      <button onclick="login()">Войти</button>
    </div>
  </div>

  <div id="sidebar">
    <input type="text" id="search" placeholder="Поиск по нику..." oninput="filterUsers()">
    <div id="user-list"></div>
  </div>

  <div id="chat">
    <div id="chat-header">Выберите чат</div>
    <div id="messages"></div>
    <div id="input-area">
      <input type="text" id="msg-input" placeholder="Сообщение..." onkeypress="if(event.key==='Enter') sendMsg()">
      <button onclick="sendMsg()">></button>
    </div>
  </div>

  <script>
    let currentUser = '';
    let activeChat = '';
    let allUsers = [];

    async function login() {
      const input = document.getElementById('username-input').value.trim();
      if (!input) return;
      currentUser = input;
      await fetch('/api/register', { method: 'POST', body: JSON.stringify({ username: currentUser }) });
      document.getElementById('auth-screen').style.display = 'none';
      startPolling();
    }

    async function loadUsers() {
      const res = await fetch('/api/users');
      allUsers = await res.json();
      filterUsers();
    }

    function filterUsers() {
      const q = document.getElementById('search').value.toLowerCase();
      const list = document.getElementById('user-list');
      list.innerHTML = '';
      allUsers.filter(u => u !== currentUser && u.toLowerCase().includes(q)).forEach(u => {
        const div = document.createElement('div');
        div.className = 'user-item' + (u === activeChat ? ' active' : '');
        div.innerText = u;
        div.onclick = () => { activeChat = u; document.getElementById('chat-header').innerText = u; filterUsers(); loadMessages(); };
        list.appendChild(div);
      });
    }

    async function loadMessages() {
      if (!activeChat) return;
      const res = await fetch('/api/messages');
      const msgs = await res.json();
      const chatBox = document.getElementById('messages');
      chatBox.innerHTML = '';
      msgs.filter(m => (m.from === currentUser && m.to === activeChat) || (m.from === activeChat && m.to === currentUser))
          .forEach(m => {
            const div = document.createElement('div');
            div.className = 'msg' + (m.from === currentUser ? ' my' : '');
            div.innerText = m.text;
            chatBox.appendChild(div);
          });
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function sendMsg() {
      const input = document.getElementById('msg-input');
      const text = input.value.trim();
      if (!text || !activeChat) return;
      await fetch('/api/send', {
        method: 'POST',
        body: JSON.stringify({ from: currentUser, to: activeChat, text })
      });
      input.value = '';
      loadMessages();
    }

    function startPolling() {
      setInterval(() => {
        loadUsers();
        loadMessages();
      }, 1000);
    }
  </script>
</body>
</html>
    `);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
