const mysql = require('mysql2/promise');
const fs = require('fs-extra');
const path = require('path');

async function viewDatabase() {
  console.log('📊 留言板数据库内容查看器\n');
  
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
    
    console.log('✅ 成功连接到数据库\n');
    
    // ========== 1. 留言数据 ==========
    console.log('📝 留言列表：');
    console.log('─'.repeat(80));
    
    const [messages] = await connection.query(
      'SELECT id, content, mediaType, mediaFileName, mediaMimeType, createTime, likeCount, commentCount, LENGTH(mediaData) as mediaSize FROM messages WHERE isDeleted=0 ORDER BY createTime DESC'
    );
    
    if (messages.length === 0) {
      console.log('   暂无留言\n');
    } else {
      messages.forEach((msg, index) => {
        console.log(`\n${index + 1}. 留言ID: ${msg.id}`);
        console.log(`   发布时间: ${msg.createTime}`);
        console.log(`   文字内容: ${msg.content || '(无文字)'}`);
        
        if (msg.mediaType) {
          const sizeMB = msg.mediaSize ? (msg.mediaSize / 1024 / 1024).toFixed(2) : '0';
          const icon = msg.mediaType === 'image' ? '🖼️' : '🎬';
          console.log(`   媒体文件: ${icon} ${msg.mediaFileName || '未知文件'}`);
          console.log(`   文件类型: ${msg.mediaMimeType || '未知'}`);
          console.log(`   文件大小: ${sizeMB} MB`);
        } else {
          console.log(`   媒体文件: (无)`);
        }
        
        console.log(`   👍 点赞数: ${msg.likeCount}`);
        console.log(`   💬 评论数: ${msg.commentCount}`);
      });
      
      console.log('\n' + '─'.repeat(80));
      console.log(`总计: ${messages.length} 条留言`);
      
      // 计算总大小
      const totalSize = messages.reduce((sum, msg) => sum + (msg.mediaSize || 0), 0);
      console.log(`媒体文件总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`);
    }
    
    // ========== 2. 点赞数据 ==========
    console.log('\n❤️ 点赞统计：');
    console.log('─'.repeat(80));
    
    const [likes] = await connection.query('SELECT * FROM likes');
    console.log(`总点赞数: ${likes.length}`);
    
    if (likes.length > 0) {
      const [likeStats] = await connection.query(`
        SELECT messageId, COUNT(*) as count 
        FROM likes 
        GROUP BY messageId 
        ORDER BY count DESC 
        LIMIT 5
      `);
      
      console.log('\n热门留言（点赞最多）：');
      for (let i = 0; i < likeStats.length; i++) {
        const [msgInfo] = await connection.query(
          'SELECT content FROM messages WHERE id=?',
          [likeStats[i].messageId]
        );
        const content = msgInfo[0]?.content || '(仅媒体)';
        const preview = content.length > 30 ? content.substring(0, 30) + '...' : content;
        console.log(`   ${i + 1}. ${preview} - ${likeStats[i].count} 个赞`);
      }
    }
    console.log('\n' + '─'.repeat(80));
    
    // ========== 3. 评论数据 ==========
    console.log('\n💬 评论统计：');
    console.log('─'.repeat(80));
    
    const [comments] = await connection.query(
      'SELECT * FROM comments WHERE isDeleted=0 ORDER BY createTime DESC'
    );
    console.log(`总评论数: ${comments.length}`);
    
    if (comments.length > 0) {
      console.log('\n最新评论：');
      for (let i = 0; i < Math.min(5, comments.length); i++) {
        const comment = comments[i];
        const preview = comment.content.length > 50 
          ? comment.content.substring(0, 50) + '...' 
          : comment.content;
        console.log(`   ${i + 1}. ${preview}`);
        console.log(`      时间: ${comment.createTime}`);
      }
    }
    console.log('\n' + '─'.repeat(80));
    
    // ========== 4. 数据库统计 ==========
    console.log('\n📈 数据库统计：');
    console.log('─'.repeat(80));
    
    const [tableInfo] = await connection.query(`
      SELECT 
        table_name AS tableName,
        table_rows AS \`rows\`,
        ROUND(data_length / 1024 / 1024, 2) AS dataMB,
        ROUND(index_length / 1024 / 1024, 2) AS indexMB
      FROM information_schema.tables
      WHERE table_schema = ?
    `, [config.mysql.database]);
    
    console.log('\n表信息：');
    tableInfo.forEach(table => {
      console.log(`   ${table.tableName}:`);
      console.log(`      记录数: ${table.rows}`);
      console.log(`      数据大小: ${table.dataMB} MB`);
      console.log(`      索引大小: ${table.indexMB} MB`);
    });
    
    const totalData = tableInfo.reduce((sum, t) => sum + parseFloat(t.dataMB), 0);
    const totalIndex = tableInfo.reduce((sum, t) => sum + parseFloat(t.indexMB), 0);
    console.log(`\n   数据库总大小: ${(totalData + totalIndex).toFixed(2)} MB`);
    console.log('─'.repeat(80));
    
    await connection.end();
    
    console.log('\n✅ 查看完成！');
    console.log('\n💡 提示：');
    console.log('   - 所有文字、图片、视频都存储在MySQL数据库中');
    console.log('   - 点赞数和评论数直接存储在留言表中');
    console.log('   - 使用 MySQL Workbench 可以图形化查看数据');
    
  } catch (err) {
    console.error('❌ 错误:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('   MySQL服务未启动');
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   数据库连接密码错误');
    }
  }
}

viewDatabase().catch(console.error);