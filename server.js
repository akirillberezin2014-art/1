const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Увеличиваем лимит размера для передачи фото и файлов в виде Base64
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Создаём папку serv для хранения данных
const SERV_DIR = path.join(__dirname, 'serv');
if (!fs.existsSync(SERV_DIR)) {
  fs.mkdirSync(SERV_DIR, { recursive: true });
}

const USERS_FILE = path.join(SERV_DIR, 'users.json');
const MESSAGES_FILE = path.join(SERV_DIR, 'messages.json');

// Инициализация файлов данных
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));

// Вспомогательные функции для работы с базой данных
function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function writeUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}
function readMessages() {
  return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
}
function writeMessages(data) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2));
}

// Шифрование/Дешифрование методом Цезаря + Base64 (шифрует текст, фото и файлы)
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

// --- ЭНДПОИНТЫ API ---

// Регистрация
app.post('/api/register', (req, res) => {
  const { username, password, name } = req.body;
  const users = readUsers();

  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Заполните все обязательные поля.' });
  }

  // Проверка уникальности логина
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'Это имя пользователя уже занято. Использована уникальная латиница.' });
  }

  // Правила для пароля: минимум 8 символов и хотя бы 1 английская буква
  if (password.length < 8 || !/[a-zA-Z]/.test(password)) {
    return res.status(400).json({ 
      error: 'Пароль слишком простой! Требуется латинский алфавит (latin alphabet) минимум из 8 символов и хотя бы 1 латинская буква.' 
    });
  }

  const newUser = {
    id: 'id_' + Math.random().toString(36).substr(2, 9),
    username,
    password, // В реальных проектах хешируется
    name,
    avatar: '',
    isGuest: false,
    isBanned: false
  };

  users.push(newUser);
  writeUsers(users);
  res.json({ success: true, user: newUser });
});

// Вход в систему
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Неверное имя пользователя или пароль.' });
  }
  if (user.isBanned) {
    return res.status(403).json({ error: 'Ваш аккаунт заблокирован администратором.' });
  }

  res.json({ success: true, user });
});

// Вход как гость
app.post('/api/guest', (req, res) => {
  const guestUser = {
    id: 'guest_' + Math.random().toString(36).substr(2, 9),
    username: 'guest_' + Math.floor(Math.random() * 10000),
    name: 'Гость',
    avatar: '',
    isGuest: true,
    isBanned: false
  };
  res.json({ success: true, user: guestUser });
});

// Превращение гостя в полноценный аккаунт
app.post('/api/convert-guest', (req, res) => {
  const { username, password, name } = req.body;
  const users = readUsers();

  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'Имя пользователя уже занято.' });
  }

  if (password.length < 8 || !/[a-zA-Z]/.test(password)) {
    return res.status(400).json({ 
      error: 'Пароль должен содержать латинский алфавит (latin alphabet): от 8 символов и хотя бы 1 букву.' 
    });
  }

  const newUser = {
    id: 'id_' + Math.random().toString(36).substr(2, 9),
    username,
    password,
    name,
    avatar: '',
    isGuest: false,
    isBanned: false
  };

  users.push(newUser);
  writeUsers(users);
  res.json({ success: true, user: newUser });
});

// Обновление профиля
app.post('/api/profile/update', (req, res) => {
  const { userId, name, avatar } = req.body;
  const users = readUsers();
  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден.' });
  }

  if (name) user.name = name;
  if (avatar !== undefined) user.avatar = avatar;

  writeUsers(users);
  res.json({ success: true, user });
});

// Поиск пользователя по ID
app.get('/api/users/find/:id', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'Пользователь с таким ID не найден.' });
  }

  res.json({
    id: user.id,
    name: user.name,
    username: user.username,
    avatar: user.avatar,
    isGuest: user.isGuest
  });
});

// Отправка сообщения
app.post('/api/messages/send', (req, res) => {
  const { senderId, senderName, text, fileData, fileName, fileType } = req.body;
  const users = readUsers();
  const user = users.find(u => u.id === senderId);

  if (user && user.isBanned) {
    return res.status(403).json({ error: 'Вы заблокированы и не можете отправлять сообщения.' });
  }

  const messages = readMessages();
  const newMsg = {
    id: 'msg_' + Date.now(),
    senderId,
    senderName,
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

// Получение сообщений
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

// --- АДМИН-ПАНЕЛЬ С КОМПЬЮТЕРА (Пароль: 009k) ---

app.post('/api/admin/login', (req, res) => {
  const { pass } = req.body;
  if (pass === '009k') {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Неверный пароль администратора.' });
  }
});

app.get('/api/admin/users', (req, res) => {
  res.json(readUsers());
});

app.post('/api/admin/ban', (req, res) => {
  const { userId } = req.body;
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (user) {
    user.isBanned = !user.isBanned;
    writeUsers(users);
    res.json({ success: true, isBanned: user.isBanned });
  } else {
    res.status(404).json({ error: 'Пользователь не найден.' });
  }
});

app.post('/api/admin/delete-user', (req, res) => {
  const { userId } = req.body;
  let users = readUsers();
  users = users.filter(u => u.id !== userId);
  writeUsers(users);
  res.json({ success: true });
});

app.post('/api/admin/clear-messages', (req, res) => {
  writeMessages([]);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
