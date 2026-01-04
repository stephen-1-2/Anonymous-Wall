const mysql = require('mysql2/promise');
const fs = require('fs-extra');
const path = require('path');

async function exportDatabase() {
  console.log('📦 数据库导出工具\n');
  
  try {
    const config = fs.readJsonSync(path.join(__dirname, 'data', 'config.json'));
    
    if (!config.useMySQL) {
      console.log('❌ MySQL未启用');
      return;
    }
    
    const connection = await mysql.createConnection({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database
    });
    
    console.log('✅ 连接数据库成功\n');
    
    const exportDir = path.join(__dirname, 'exports');
    fs.ensureDirSync(exportDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const mediaDir = path.join(exportDir, `media_${timestamp}`);
    fs.ensureDirSync(mediaDir);
    
    // ========== 1. 导出留言数据 ==========
    console.log('📝 导出留言数据...');
    const [messages] = await connection.query('SELECT * FROM messages WHERE isDeleted=0');
    
    const messagesExport = [];
    let mediaCount = 0;
    
    for (const msg of messages) {
      const exportMsg = {
        id: msg.id,
        content: msg.content,
        mediaType: msg.mediaType,
        mediaFileName: msg.mediaFileName,
        mediaMimeType: msg.mediaMimeType,
        createTime: msg.createTime,
        likeCount: msg.likeCount,
        commentCount: msg.commentCount
      };
      
      // 导出媒体文件
      if (msg.mediaData) {
        const ext = msg.mediaFileName ? path.extname(msg.mediaFileName) : '.bin';
        const fileName = `${msg.id}${ext}`;
        const filePath = path.join(mediaDir, fileName);
        fs.writeFileSync(filePath, msg.mediaData);
        exportMsg.mediaFile = fileName;
        mediaCount++;
      }
      
      messagesExport.push(exportMsg);
    }
    
    fs.writeJsonSync(
      path.join(exportDir, `messages_${timestamp}.json`),
      messagesExport,
      { spaces: 2 }
    );
    console.log(`   ✅ 导出 ${messages.length} 条留言`);
    console.log(`   ✅ 导出 ${mediaCount} 个媒体文件`);
    
    // ========== 2. 导出点赞数据 ==========
    console.log('\n❤️ 导出点赞数据...');
    const [likes] = await connection.query('SELECT * FROM likes');
    fs.writeJsonSync(
      path.join(exportDir, `likes_${timestamp}.json`),
      likes,
      { spaces: 2 }
    );
    console.log(`   ✅ 导出 ${likes.length} 条点赞记录`);
    
    // ========== 3. 导出评论数据 ==========
    console.log('\n💬 导出评论数据...');
    const [comments] = await connection.query('SELECT * FROM comments WHERE isDeleted=0');
    fs.writeJsonSync(
      path.join(exportDir, `comments_${timestamp}.json`),
      comments,
      { spaces: 2 }
    );
    console.log(`   ✅ 导出 ${comments.length} 条评论`);
    
    // ========== 4. 生成统计报告 ==========
    const report = {
      exportTime: new Date().toLocaleString('zh-CN'),
      statistics: {
        messages: messages.length,
        likes: likes.length,
        comments: comments.length,
        mediaFiles: mediaCount
      },
      files: {
        messages: `messages_${timestamp}.json`,
        likes: `likes_${timestamp}.json`,
        comments: `comments_${timestamp}.json`,
        mediaFolder: `media_${timestamp}`
      }
    };
    
    fs.writeJsonSync(
      path.join(exportDir, `report_${timestamp}.json`),
      report,
      { spaces: 2 }
    );
    
    await connection.end();
    
    console.log('\n📊 导出统计：');
    console.log('─'.repeat(60));
    console.log(`   留言数: ${messages.length}`);
    console.log(`   点赞数: ${likes.length}`);
    console.log(`   评论数: ${comments.length}`);
    console.log(`   媒体文件: ${mediaCount}`);
    console.log('─'.repeat(60));
    
    console.log(`\n✅ 导出完成！文件保存在: ${exportDir}`);
    console.log('\n📁 导出文件：');
    console.log(`   - messages_${timestamp}.json (留言数据)`);
    console.log(`   - likes_${timestamp}.json (点赞数据)`);
    console.log(`   - comments_${timestamp}.json (评论数据)`);
    console.log(`   - media_${timestamp}/ (媒体文件文件夹)`);
    console.log(`   - report_${timestamp}.json (统计报告)`);
    
  } catch (err) {
    console.error('❌ 导出失败:', err.message);
  }
}

exportDatabase().catch(console.error);