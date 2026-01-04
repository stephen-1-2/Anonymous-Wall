const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== 重要：修改这里的学号 =====
const STUDENT_ID = '239210129'; // 请将这里改为你的实际学号
const BASE_PATH = `/${STUDENT_ID}`;
// ================================

app.use(cors());
app.use(express.json());

// 静态文件服务 - 添加路径前缀
app.use(`${BASE_PATH}/assets`, express.static(path.join(__dirname, 'public/assets')));
app.use(BASE_PATH, express.static('public'));

const dataDir = path.join(__dirname, 'data');
const configPath = path.join(dataDir, 'config.json');
const uploadsDir = path.join(__dirname, 'public/assets/uploads');
const backgroundsDir = path.join(__dirname, 'public/assets/backgrounds');

let dbPool = null;

// 初始化数据库
async function initDBIfNeeded() {
  try {
    const config = fs.readJsonSync(configPath);
    if (!config.useMySQL) {
      console.log('ℹ️  MySQL未启用，将无法使用点赞和评论功能');
      return;
    }
    
    console.log('🔄 正在连接MySQL...');
    const mysqlCfg = {
      host: config.mysql.host || 'localhost',
      port: config.mysql.port || 3306,
      user: config.mysql.user || 'root',
      password: config.mysql.password || ''
    };

    console.log(`   连接信息: ${mysqlCfg.user}@${mysqlCfg.host}:${mysqlCfg.port}`);
    const tmpConn = await mysql.createConnection(mysqlCfg);
    try {
      const dbName = config.mysql.database || 'message_board';
      await tmpConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`);
      await tmpConn.end();

      dbPool = mysql.createPool({
        ...mysqlCfg,
        database: dbName,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });

      // 创建留言表（包含BLOB字段存储文件）
      await dbPool.query(`CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(64) PRIMARY KEY,
        content TEXT,
        mediaData LONGBLOB,
        mediaType VARCHAR(20),
        mediaFileName VARCHAR(255),
        mediaMimeType VARCHAR(100),
        createTime VARCHAR(64),
        isDeleted TINYINT(1) DEFAULT 0,
        likeCount INT DEFAULT 0,
        commentCount INT DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

      // 创建点赞表
      await dbPool.query(`CREATE TABLE IF NOT EXISTS likes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        messageId VARCHAR(64) NOT NULL,
        userId VARCHAR(64) NOT NULL,
        createTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_like (messageId, userId),
        FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

      // 创建评论表
      await dbPool.query(`CREATE TABLE IF NOT EXISTS comments (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        messageId VARCHAR(64) NOT NULL,
        userId VARCHAR(64) NOT NULL,
        content TEXT NOT NULL,
        createTime VARCHAR(64),
        isDeleted TINYINT(1) DEFAULT 0,
        FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

      console.log('✅ MySQL 已初始化');
    } catch (innerErr) {
      try { await tmpConn.end(); } catch (e) {}
      throw innerErr;
    }
  } catch (err) {
    console.error('❌ MySQL 初始化失败：');
    console.error('   错误类型:', err.code || 'Unknown');
    console.error('   错误信息:', err.message);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   👉 解决方法: 请检查 data/config.json 中的MySQL用户名和密码是否正确');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('   👉 解决方法: 请确保MySQL服务已启动');
    } else if (err.errno === -4078 || err.code === 'ENOTFOUND') {
      console.error('   👉 解决方法: 请检查MySQL主机地址是否正确');
    }
    console.error('   💡 提示: 如果不需要点赞和评论功能，可以在 data/config.json 中设置 useMySQL: false');
    dbPool = null;
  }
}

// 确保目录和文件存在
[dataDir, uploadsDir, backgroundsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!fs.existsSync(configPath)) {
  fs.writeJsonSync(configPath, {
    adminPwd: 'admin123',
    currentBg: '',
    useMySQL: false,
    mysql: { host: 'localhost', port: 3306, user: 'root', password: 'your_password_here', database: 'message_board' }
  }, { spaces: 2 });
  console.log('⚠️  已创建配置文件 data/config.json，请修改MySQL配置后重启服务器');
}

initDBIfNeeded();

// Multer 配置
const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `media_${Date.now()}_${Math.floor(Math.random()*10000)}${path.extname(file.originalname)}`)
});

const bgStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, backgroundsDir),
  filename: (req, file, cb) => cb(null, `bg_${Date.now()}_${Math.floor(Math.random()*10000)}${path.extname(file.originalname)}`)
});

const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg','image/png','image/gif','image/webp'];
  allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('仅支持jpg/png/gif/webp图片！'));
};

const mediaFilter = (req, file, cb) => {
  const allowed = ['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm'];
  allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('仅支持jpg/png/gif/webp图片和mp4/webm视频！'));
};

const uploadMedia = multer({ storage: mediaStorage, fileFilter: mediaFilter, limits: { fileSize: 50*1024*1024 } }).single('mediaFile');
const uploadBg = multer({ storage: bgStorage, fileFilter: imageFilter, limits: { fileSize: 5*1024*1024 } }).single('customBg');

// 生成用户ID（基于IP和User-Agent）
function getUserId(req) {
  const ip = req.ip || req.connection.remoteAddress;
  const ua = req.get('user-agent') || '';
  return crypto.createHash('md5').update(ip + ua).digest('hex');
}

// ========== 路由（添加BASE_PATH前缀） ==========

// 管理员验证
app.post(`${BASE_PATH}/api/admin/verify`, (req, res) => {
  try {
    const { pwd } = req.body;
    const config = fs.readJsonSync(configPath);
    res.json({ 
      success: pwd === config.adminPwd, 
      msg: pwd === config.adminPwd ? '验证通过' : '密码错误' 
    });
  } catch (err) { 
    res.status(500).json({ success: false, msg: '验证失败', error: err.message }); 
  }
});

// 获取留言列表（含点赞数和评论数）
app.get(`${BASE_PATH}/api/messages`, async (req, res) => {
  try {
    if (dbPool) {
      const userId = getUserId(req);
      const [messages] = await dbPool.query(
        'SELECT id, content, mediaType, mediaFileName, mediaMimeType, createTime, likeCount, commentCount FROM messages WHERE isDeleted=0 ORDER BY createTime DESC'
      );
      
      // 获取每条留言的用户点赞状态
      for (let msg of messages) {
        const [userLiked] = await dbPool.query(
          'SELECT COUNT(*) as count FROM likes WHERE messageId=? AND userId=?', 
          [msg.id, userId]
        );
        msg.isLiked = userLiked[0].count > 0;
      }
      
      res.json({ success: true, data: messages });
    } else {
      res.json({ success: false, msg: '请启用MySQL数据库' });
    }
  } catch (err) { 
    res.status(500).json({ success: false, msg: '获取留言失败', error: err.message }); 
  }
});

// 提交留言
app.post(`${BASE_PATH}/api/messages`, (req, res) => {
  uploadMedia(req, res, async (err) => {
    try {
      if (err) throw err;
      const { content } = req.body;
      if (!content?.trim() && !req.file) {
        return res.json({ success: false, msg: '至少填写文字或上传媒体文件！' });
      }
      
      const newMsg = {
        id: `msg_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        content: content?.trim() || '',
        mediaData: req.file ? fs.readFileSync(req.file.path) : null,
        mediaType: req.file ? (req.file.mimetype.startsWith('image') ? 'image' : 'video') : '',
        mediaFileName: req.file ? req.file.filename : '',
        mediaMimeType: req.file ? req.file.mimetype : '',
        createTime: new Date().toLocaleString('zh-CN'),
        isDeleted: 0,
        likeCount: 0,
        commentCount: 0
      };
      
      if (dbPool) {
        await dbPool.query(
          'INSERT INTO messages (id, content, mediaData, mediaType, mediaFileName, mediaMimeType, createTime, isDeleted, likeCount, commentCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newMsg.id, newMsg.content, newMsg.mediaData, newMsg.mediaType, newMsg.mediaFileName, newMsg.mediaMimeType, newMsg.createTime, 0, 0, 0]
        );
        
        // 删除临时文件
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        
        // 返回不含BLOB数据的响应
        const response = { ...newMsg };
        delete response.mediaData;
        res.json({ success: true, msg: '提交成功', data: response });
      } else {
        res.json({ success: false, msg: '请启用MySQL数据库' });
      }
    } catch (err) { 
      res.status(500).json({ success: false, msg: '提交失败', error: err.message }); 
    }
  });
});

// 删除留言
app.delete(`${BASE_PATH}/api/messages/:id`, async (req, res) => {
  try {
    const { id } = req.params;
    if (dbPool) {
      const [rows] = await dbPool.query('SELECT * FROM messages WHERE id=?', [id]);
      if (!rows || rows.length === 0) {
        return res.json({ success: false, msg: '留言不存在' });
      }
      
      await dbPool.query('DELETE FROM messages WHERE id=?', [id]);
      res.json({ success: true, msg: '删除成功' });
    } else {
      res.json({ success: false, msg: '请启用MySQL数据库' });
    }
  } catch (err) { 
    res.status(500).json({ success: false, msg: '删除失败', error: err.message }); 
  }
});

// 点赞/取消点赞
app.post(`${BASE_PATH}/api/messages/:id/like`, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    
    if (dbPool) {
      // 检查是否已点赞
      const [exists] = await dbPool.query(
        'SELECT * FROM likes WHERE messageId=? AND userId=?',
        [id, userId]
      );
      
      if (exists.length > 0) {
        // 取消点赞
        await dbPool.query('DELETE FROM likes WHERE messageId=? AND userId=?', [id, userId]);
        await dbPool.query('UPDATE messages SET likeCount = likeCount - 1 WHERE id=?', [id]);
        const [result] = await dbPool.query('SELECT likeCount FROM messages WHERE id=?', [id]);
        res.json({ success: true, msg: '已取消点赞', isLiked: false, likeCount: result[0].likeCount });
      } else {
        // 添加点赞
        await dbPool.query('INSERT INTO likes (messageId, userId) VALUES (?, ?)', [id, userId]);
        await dbPool.query('UPDATE messages SET likeCount = likeCount + 1 WHERE id=?', [id]);
        const [result] = await dbPool.query('SELECT likeCount FROM messages WHERE id=?', [id]);
        res.json({ success: true, msg: '点赞成功', isLiked: true, likeCount: result[0].likeCount });
      }
    } else {
      res.json({ success: false, msg: '请启用MySQL数据库' });
    }
  } catch (err) {
    res.status(500).json({ success: false, msg: '操作失败', error: err.message });
  }
});

// 获取评论列表
app.get(`${BASE_PATH}/api/messages/:id/comments`, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    
    if (dbPool) {
      const [comments] = await dbPool.query(
        'SELECT * FROM comments WHERE messageId=? AND isDeleted=0 ORDER BY createTime DESC',
        [id]
      );
      
      // 标记用户自己的评论
      comments.forEach(comment => {
        comment.isMine = comment.userId === userId;
      });
      
      res.json({ success: true, data: comments });
    } else {
      res.json({ success: false, msg: '请启用MySQL数据库' });
    }
  } catch (err) {
    res.status(500).json({ success: false, msg: '获取评论失败', error: err.message });
  }
});

// 添加评论
app.post(`${BASE_PATH}/api/messages/:id/comments`, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = getUserId(req);
    
    if (!content?.trim()) {
      return res.json({ success: false, msg: '评论内容不能为空！' });
    }
    
    if (dbPool) {
      const newComment = {
        id: `comment_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        messageId: id,
        userId: userId,
        content: content.trim(),
        createTime: new Date().toLocaleString('zh-CN'),
        isDeleted: 0
      };
      
      await dbPool.query(
        'INSERT INTO comments (id, messageId, userId, content, createTime, isDeleted) VALUES (?, ?, ?, ?, ?, ?)',
        [newComment.id, newComment.messageId, newComment.userId, newComment.content, newComment.createTime, 0]
      );
      
      // 更新留言的评论数
      await dbPool.query('UPDATE messages SET commentCount = commentCount + 1 WHERE id=?', [id]);
      
      newComment.isMine = true;
      res.json({ success: true, msg: '评论成功', data: newComment });
    } else {
      res.json({ success: false, msg: '请启用MySQL数据库' });
    }
  } catch (err) {
    res.status(500).json({ success: false, msg: '评论失败', error: err.message });
  }
});

// 删除评论
app.delete(`${BASE_PATH}/api/comments/:commentId`, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = getUserId(req);
    
    if (dbPool) {
      const [comment] = await dbPool.query('SELECT * FROM comments WHERE id=?', [commentId]);
      if (!comment || comment.length === 0) {
        return res.json({ success: false, msg: '评论不存在' });
      }
      
      // 只能删除自己的评论（非管理员）
      if (comment[0].userId !== userId) {
        return res.json({ success: false, msg: '只能删除自己的评论' });
      }
      
      const messageId = comment[0].messageId;
      await dbPool.query('DELETE FROM comments WHERE id=?', [commentId]);
      
      // 更新留言的评论数
      await dbPool.query('UPDATE messages SET commentCount = commentCount - 1 WHERE id=?', [messageId]);
      
      res.json({ success: true, msg: '删除成功' });
    } else {
      res.json({ success: false, msg: '请启用MySQL数据库' });
    }
  } catch (err) {
    res.status(500).json({ success: false, msg: '删除失败', error: err.message });
  }
});

// 获取媒体文件（从数据库BLOB字段）
app.get(`${BASE_PATH}/api/media/:messageId`, async (req, res) => {
  try {
    const { messageId } = req.params;
    
    if (dbPool) {
      const [rows] = await dbPool.query(
        'SELECT mediaData, mediaMimeType, mediaFileName FROM messages WHERE id=? AND isDeleted=0',
        [messageId]
      );
      
      if (!rows || rows.length === 0 || !rows[0].mediaData) {
        return res.status(404).json({ success: false, msg: '文件不存在' });
      }
      
      const media = rows[0];
      res.setHeader('Content-Type', media.mediaMimeType);
      res.setHeader('Content-Disposition', `inline; filename="${media.mediaFileName}"`);
      res.send(media.mediaData);
    } else {
      res.status(500).json({ success: false, msg: '请启用MySQL数据库' });
    }
  } catch (err) {
    res.status(500).json({ success: false, msg: '获取文件失败', error: err.message });
  }
});

// 获取背景列表
app.get(`${BASE_PATH}/api/backgrounds`, (req, res) => {
  try {
    const bgFiles = fs.readdirSync(backgroundsDir).filter(file => 
      ['.jpg','.png','.gif','.webp'].includes(path.extname(file).toLowerCase())
    );
    const bgList = bgFiles.map(f => `${BASE_PATH}/assets/backgrounds/${f}`);
    const config = fs.readJsonSync(configPath);
    res.json({ success: true, data: { list: bgList, current: config.currentBg } });
  } catch (err) {
    res.status(500).json({ success: false, msg: '获取背景失败', error: err.message });
  }
});

// 设置背景
app.post(`${BASE_PATH}/api/backgrounds`, uploadBg, (req, res) => {
  try {
    const { bgUrl } = req.body;
    const config = fs.readJsonSync(configPath);
    let newBg = '';
    
    if (bgUrl) {
      newBg = bgUrl;
    } else if (req.file) {
      newBg = `${BASE_PATH}/assets/backgrounds/${req.file.filename}`;
    } else {
      return res.json({ success: false, msg: '请选择/上传背景图！' });
    }
    
    config.currentBg = newBg;
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    res.json({ success: true, msg: '背景设置成功', data: newBg });
  } catch (err) {
    res.status(500).json({ success: false, msg: '设置背景失败', error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ 服务启动成功：http://localhost:${PORT}${BASE_PATH}`);
  console.log(`⚠️  默认管理员密码：admin123`);
  console.log(`📝 访问路径前缀：${BASE_PATH}`);
});