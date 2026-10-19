const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Временная папка для загруженных видео на сервере
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// База данных видео в памяти
let videos = [
    {
        id: "1",
        title: "Тестовое видео (Big Buck Bunny)",
        description: "Демонстрационный ролик",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
    }
];

app.use('/uploads', express.static(uploadDir));
app.use(express.json());

// API: Загрузка видео
app.post('/upload', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).send('Файл не выбран');
    
    const newVideo = {
        id: Date.now().toString(),
        title: req.body.title || req.file.originalname,
        description: "Загружено на сервер",
        url: `/uploads/${req.file.filename}`
    };

    videos.unshift(newVideo);
    res.redirect('/');
});

// API: Получение списка
app.get('/api/videos', (req, res) => {
    res.json(videos);
});

// Главная страница со встроенным HTML/CSS/JS
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub Node Tube</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0f0f0f;
            color: #fff;
            margin: 0;
            padding: 20px;
        }
        header {
            max-width: 1200px;
            margin: 0 auto 20px auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        }
        h1 { margin: 0; font-size: 24px; color: #ff0033; }
        input[type="text"] {
            width: 100%;
            max-width: 400px;
            padding: 10px 16px;
            border-radius: 20px;
            border: 1px solid #333;
            background: #222;
            color: #fff;
            font-size: 15px;
            outline: none;
        }
        .upload-section {
            max-width: 1200px;
            margin: 0 auto 30px auto;
            background: #1f1f1f;
            padding: 15px 20px;
            border-radius: 12px;
            border: 1px solid #282828;
        }
        .upload-form {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            align-items: center;
        }
        .file-label, .btn {
            background: #ff0033;
            color: #fff;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            border: none;
            font-size: 14px;
        }
        .file-label { background: #333; }
        .file-label:hover { background: #444; }
        .btn:hover { background: #cc0029; }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 20px;
        }
        .card {
            background: #1f1f1f;
            border-radius: 12px;
            overflow: hidden;
            cursor: pointer;
            transition: transform 0.2s;
            border: 1px solid #282828;
        }
        .card:hover { transform: scale(1.02); }
        .card video {
            width: 100%;
            height: 160px;
            object-fit: cover;
            background: #000;
        }
        .card-content { padding: 15px; }
        .card-title { font-size: 16px; font-weight: bold; margin-bottom: 6px; }
        .card-desc { font-size: 13px; color: #aaa; }

        #player-container {
            display: none;
            max-width: 900px;
            margin: 0 auto 30px auto;
            background: #1f1f1f;
            padding: 20px;
            border-radius: 12px;
            border: 1px solid #282828;
        }
        #player-container video {
            width: 100%;
            max-height: 500px;
            border-radius: 8px;
            background: #000;
        }
    </style>
</head>
<body>

    <header id="main-header">
        <h1>▶ Node Tube</h1>
        <input type="text" id="search" placeholder="Поиск видео..." oninput="filterVideos()">
    </header>

    <div class="upload-section" id="upload-box">
        <form class="upload-form" action="/upload" method="POST" enctype="multipart/form-data">
            <label class="file-label" for="video-file">📁 Выбрать файл</label>
            <input type="file" name="video" id="video-file" accept="video/*" style="display:none;" required onchange="updateFileName()">
            <span id="file-name" style="color: #aaa; font-size: 13px;">Файл не выбран</span>
            <input type="text" name="title" placeholder="Название видео" style="flex: 1; min-width: 150px;" required>
            <button type="submit" class="btn">Загрузить на сервер</button>
        </form>
    </div>

    <div id="player-container">
        <button class="btn" onclick="closePlayer()" style="margin-bottom: 15px;">← Назад</button>
        <video id="main-video" controls></video>
        <h2 id="video-title" style="margin: 15px 0 5px 0;"></h2>
        <p id="video-desc" style="color: #aaa; margin: 0;"></p>
    </div>

    <div class="container" id="video-grid"></div>

    <script>
        let allVideos = [];

        async function fetchVideos() {
            const res = await fetch('/api/videos');
            allVideos = await res.json();
            displayVideos(allVideos);
        }

        function displayVideos(videos) {
            const grid = document.getElementById('video-grid');
            grid.innerHTML = '';
            if (videos.length === 0) {
                grid.innerHTML = '<p style="color: #777;">Ничего не найдено</p>';
                return;
            }
            videos.forEach(v => {
                const card = document.createElement('div');
                card.className = 'card';
                card.onclick = () => openPlayer(v);
                card.innerHTML = \`
                    <video src="\${v.url}#t=0.5" preload="metadata" muted></video>
                    <div class="card-content">
                        <div class="card-title">\${v.title}</div>
                        <div class="card-desc">\${v.description}</div>
                    </div>
                \`;
                grid.appendChild(card);
            });
        }

        function filterVideos() {
            const q = document.getElementById('search').value.toLowerCase();
            const filtered = allVideos.filter(v => v.title.toLowerCase().includes(q));
            displayVideos(filtered);
        }

        function openPlayer(v) {
            document.getElementById('video-grid').style.display = 'none';
            document.getElementById('upload-box').style.display = 'none';
            document.getElementById('main-header').style.display = 'none';
            
            const p = document.getElementById('player-container');
            p.style.display = 'block';
            
            const vid = document.getElementById('main-video');
            vid.src = v.url;
            vid.play();
            
            document.getElementById('video-title').innerText = v.title;
            document.getElementById('video-desc').innerText = v.description;
        }

        function closePlayer() {
            const vid = document.getElementById('main-video');
            vid.pause();
            vid.src = '';
            
            document.getElementById('player-container').style.display = 'none';
            document.getElementById('video-grid').style.display = 'grid';
            document.getElementById('upload-box').style.display = 'block';
            document.getElementById('main-header').style.display = 'flex';
        }

        function updateFileName() {
            const file = document.getElementById('video-file').files[0];
            if (file) document.getElementById('file-name').innerText = file.name;
        }

        fetchVideos();
    </script>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
