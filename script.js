// ===== 重要：修改这里的学号（与server.js保持一致） =====
const STUDENT_ID = '239210129'; // 请将这里改为你的实际学号
const BASE_PATH = `/${STUDENT_ID}`;
// =======================================================

// 全局状态
let isAdmin = false;

// ======== 获取DOM元素 ========
const getElement = (id) => {
  const el = document.getElementById(id);
  if (!el) console.error(`未找到ID为${id}的元素！`);
  return el;
};

// --- 全屏查看相关逻辑 ---
const fullscreenModal = document.getElementById('fullscreenModal');

// 打开全屏
const openFullscreen = (src, type) => {
  if (!fullscreenModal) return;
  
  // 清空现有内容
  fullscreenModal.innerHTML = '';
  
  let element;
  if (type === 'video') {
    element = document.createElement('video');
    element.src = src;
    element.controls = true;
    element.autoplay = true;
  } else {
    element = document.createElement('img');
    element.src = src;
  }
  
  fullscreenModal.appendChild(element);
  fullscreenModal.classList.add('active');
};

// 关闭全屏 (点击遮罩层)
if (fullscreenModal) {
  fullscreenModal.onclick = () => {
    const video = fullscreenModal.querySelector('video');
    if (video) video.pause();
    fullscreenModal.classList.remove('active');
    setTimeout(() => {
      fullscreenModal.innerHTML = '';
    }, 300);
  };
}

// 背景相关
const bgContainer = getElement('bgContainer');
const bgSettingBtn = getElement('bgSettingBtn');
const bgModal = getElement('bgModal');
const bgModalClose = getElement('bgModalClose');
const bgList = getElement('bgList');
const customBgInput = getElement('customBgInput');
const uploadCustomBgBtn = getElement('uploadCustomBgBtn');
const bgTip = getElement('bgTip');

// 管理员相关
const adminLoginBtn = getElement('adminLoginBtn');
const adminModal = getElement('adminModal');
const adminModalClose = getElement('adminModalClose');
const adminPwd = getElement('adminPwd');
const adminVerifyBtn = getElement('adminVerifyBtn');
const adminTip = getElement('adminTip');
const adminTag = getElement('adminTag');

// 留言相关
const textContent = getElement('textContent');
const mediaFile = getElement('mediaFile');
const mediaPreview = getElement('mediaPreview');
const submitBtn = getElement('submitBtn');
const submitTip = getElement('submitTip');
const messagesList = getElement('messagesList');

// ======== 工具函数 ========
const showTip = (el, text, isError = true) => {
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? '#f56c6c' : '#67c23a';
  el.className = isError ? 'tip' : 'tip success';
  setTimeout(() => el.textContent = '', 3000);
};

const hideAllModals = () => {
  if (adminModal) adminModal.style.display = 'none';
  if (bgModal) bgModal.style.display = 'none';
};

// ======== 背景功能 ========
const loadBackgrounds = async () => {
  if (!bgList) return;

  try {
    const res = await fetch(`${BASE_PATH}/api/backgrounds`);
    if (!res.ok) throw new Error(`接口返回错误：${res.status}`);
    const data = await res.json();

    bgList.innerHTML = '';
    if (data.success && data.data.list.length === 0) {
      bgList.innerHTML = '<div class="empty-tip">暂无背景图，可上传自定义背景</div>';
    } else if (data.success) {
      data.data.list.forEach(bgUrl => {
        const bgItem = document.createElement('div');
        bgItem.className = `bg-item ${bgUrl === data.data.current ? 'active' : ''}`;
        bgItem.innerHTML = `<img src="${bgUrl}" alt="背景预览">`;
        bgItem.onclick = () => setBackground(bgUrl);
        bgList.appendChild(bgItem);
      });
      
      if (data.data.current && bgContainer) {
        bgContainer.style.backgroundImage = `url(${data.data.current})`;
      }
    } else {
      throw new Error(data.msg || '获取背景失败');
    }
  } catch (err) {
    showTip(bgTip, `加载背景失败：${err.message}`);
    bgList.innerHTML = '<div class="empty-tip">加载背景失败</div>';
  }
};

const setBackground = async (bgUrl) => {
  try {
    const res = await fetch(`${BASE_PATH}/api/backgrounds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bgUrl })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.msg);

    if (bgContainer) bgContainer.style.backgroundImage = `url(${bgUrl})`;
    
    if (bgList) {
      bgList.querySelectorAll('.bg-item').forEach(item => {
        item.classList.toggle('active', item.querySelector('img')?.src.includes(bgUrl));
      });
    }
    showTip(bgTip, '背景设置成功', false);
  } catch (err) {
    showTip(bgTip, `设置背景失败：${err.message}`);
  }
};

const uploadCustomBg = async () => {
  if (!customBgInput || !customBgInput.files[0]) {
    showTip(bgTip, '请选择要上传的背景图片！');
    return;
  }

  const formData = new FormData();
  formData.append('customBg', customBgInput.files[0]);

  try {
    const res = await fetch(`${BASE_PATH}/api/backgrounds`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.msg);

    if (bgContainer) bgContainer.style.backgroundImage = `url(${data.data})`;
    showTip(bgTip, '背景上传并设置成功', false);
    loadBackgrounds();
    customBgInput.value = '';
  } catch (err) {
    showTip(bgTip, `上传背景失败：${err.message}`);
  }
};

// ======== 管理员功能 ========
const verifyAdmin = async () => {
  if (!adminPwd) return;
  const pwd = adminPwd.value.trim();
  if (!pwd) {
    showTip(adminTip, '请输入管理员密码！');
    return;
  }

  try {
    const res = await fetch(`${BASE_PATH}/api/admin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pwd })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.msg);

    isAdmin = true;
    document.body.classList.add('admin-mode');
    hideAllModals();
    showTip(adminTip, '管理员验证通过', false);
    adminPwd.value = '';
    loadMessages();
  } catch (err) {
    showTip(adminTip, err.message);
  }
};

// ======== 留言功能 ========
const loadMessages = async () => {
  if (!messagesList) return;

  try {
    const res = await fetch(`${BASE_PATH}/api/messages`);
    if (!res.ok) throw new Error(`接口返回错误：${res.status}`);
    const data = await res.json();

    messagesList.innerHTML = '';
    if (data.success && data.data.length === 0) {
      messagesList.innerHTML = '<div class="empty-tip">暂无留言，快来发表第一条吧～</div>';
    } else if (data.success) {
      data.data.forEach(msg => {
        const msgItem = document.createElement('div');
        msgItem.className = 'message-item';
        
        let contentHtml = '';
        if (msg.content) {
          contentHtml += `<div class="content">${msg.content.replace(/\n/g, '<br>')}</div>`;
        }
        if (msg.mediaType) {
          const mediaUrl = `${BASE_PATH}/api/media/${msg.id}`;
          const isVideo = msg.mediaType === 'video';
          if (isVideo) {
            contentHtml += `
              <div class="message-media">
                <video src="${mediaUrl}" 
                       onclick="openFullscreen('${mediaUrl}', 'video')"
                       title="点击全屏观看"></video>
              </div>`;
          } else {
            contentHtml += `
              <div class="message-media">
                <img src="${mediaUrl}" 
                     onclick="openFullscreen('${mediaUrl}', 'image')" 
                     loading="lazy" 
                     alt="用户图片"
                     title="点击全屏查看">
              </div>`;
          }
        }

        msgItem.innerHTML = `
          <button class="delete-btn" data-id="${msg.id}">🗑️ 删除</button>
          <div class="meta">
            <span>🕒 ${msg.createTime}</span>
            <span class="meta-type">${msg.mediaType ? (msg.mediaType === 'image' ? '📷 图片' : '🎬 视频') + (msg.content ? ' + 文字' : '') : '📝 纯文字'}</span>
          </div>
          ${contentHtml}
          <div class="actions">
            <button class="like-btn ${msg.isLiked ? 'liked' : ''}" data-id="${msg.id}">
              <span class="like-icon">${msg.isLiked ? '❤️' : '🤍'}</span>
              <span class="like-count">${msg.likeCount || 0}</span>
            </button>
            <button class="comment-btn" data-id="${msg.id}">
              💬 评论 <span class="comment-count">(${msg.commentCount || 0})</span>
            </button>
          </div>
          <div class="comments-section" id="comments-${msg.id}" style="display: none;">
            <div class="comment-input-box">
              <input type="text" class="comment-input" placeholder="写下你的评论..." data-msg-id="${msg.id}">
              <button class="comment-submit-btn" data-msg-id="${msg.id}">发送</button>
            </div>
            <div class="comments-list" id="comments-list-${msg.id}">
              <div class="loading">加载中...</div>
            </div>
          </div>
        `;
        
        messagesList.appendChild(msgItem);
        
        // 绑定删除事件
        msgItem.querySelector('.delete-btn').onclick = () => deleteMessage(msg.id);
        
        // 绑定点赞事件
        msgItem.querySelector('.like-btn').onclick = (e) => toggleLike(msg.id, e.currentTarget);
        
        // 绑定评论按钮事件
        msgItem.querySelector('.comment-btn').onclick = () => toggleComments(msg.id);
        
        // 绑定评论提交事件
        msgItem.querySelector('.comment-submit-btn').onclick = () => submitComment(msg.id);
        
        // 评论输入框回车提交
        const commentInput = msgItem.querySelector('.comment-input');
        commentInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') submitComment(msg.id);
        });
      });
    } else {
      throw new Error(data.msg || '获取留言失败');
    }
  } catch (err) {
    showTip(submitTip, `加载留言失败：${err.message}`);
    messagesList.innerHTML = '<div class="empty-tip">加载留言失败，请刷新重试</div>';
  }
};

const submitMessage = async () => {
  if (!submitBtn || !textContent) return;

  submitBtn.disabled = true;
  submitBtn.textContent = '📤 提交中...';

  try {
    const formData = new FormData();
    formData.append('content', textContent.value);
    if (mediaFile && mediaFile.files[0]) {
      formData.append('mediaFile', mediaFile.files[0]);
    }

    const res = await fetch(`${BASE_PATH}/api/messages`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.msg);

    textContent.value = '';
    if (mediaFile) mediaFile.value = '';
    if (mediaPreview) mediaPreview.innerHTML = '';
    showTip(submitTip, '留言提交成功！', false);
    loadMessages();
  } catch (err) {
    showTip(submitTip, `提交失败：${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '📤 发布';
  }
};

const deleteMessage = async (msgId) => {
  if (!isAdmin) {
    showTip(submitTip, '非管理员无权删除！');
    return;
  }
  if (!confirm('确定删除这条留言吗？')) return;

  try {
    const res = await fetch(`${BASE_PATH}/api/messages/${msgId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.msg);

    showTip(submitTip, '留言删除成功！', false);
    loadMessages();
  } catch (err) {
    showTip(submitTip, `删除失败：${err.message}`);
  }
};

// ======== 点赞功能 ========
const toggleLike = async (msgId, btn) => {
  try {
    const res = await fetch(`${BASE_PATH}/api/messages/${msgId}/like`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.msg);

    // 更新UI
    const likeIcon = btn.querySelector('.like-icon');
    const likeCount = btn.querySelector('.like-count');
    
    if (data.isLiked) {
      btn.classList.add('liked');
      likeIcon.textContent = '❤️';
    } else {
      btn.classList.remove('liked');
      likeIcon.textContent = '🤍';
    }
    
    likeCount.textContent = data.likeCount;
  } catch (err) {
    showTip(submitTip, `操作失败：${err.message}`);
  }
};

// ======== 评论功能 ========
const toggleComments = async (msgId) => {
  const commentsSection = document.getElementById(`comments-${msgId}`);
  if (!commentsSection) return;

  if (commentsSection.style.display === 'none') {
    commentsSection.style.display = 'block';
    loadComments(msgId);
  } else {
    commentsSection.style.display = 'none';
  }
};

const loadComments = async (msgId) => {
  const commentsList = document.getElementById(`comments-list-${msgId}`);
  if (!commentsList) return;

  try {
    const res = await fetch(`${BASE_PATH}/api/messages/${msgId}/comments`);
    const data = await res.json();

    commentsList.innerHTML = '';
    if (data.success && data.data.length === 0) {
      commentsList.innerHTML = '<div class="empty-comment">暂无评论</div>';
    } else if (data.success) {
      data.data.forEach(comment => {
        const commentItem = document.createElement('div');
        commentItem.className = 'comment-item';
        commentItem.innerHTML = `
          <div class="comment-header">
            <span class="comment-user">👤 匿名用户</span>
            <span class="comment-time">${comment.createTime}</span>
            ${comment.isMine ? `<button class="comment-delete-btn" data-id="${comment.id}">删除</button>` : ''}
          </div>
          <div class="comment-content">${comment.content.replace(/\n/g, '<br>')}</div>
        `;
        
        commentsList.appendChild(commentItem);
        
        // 绑定删除评论事件
        if (comment.isMine) {
          commentItem.querySelector('.comment-delete-btn').onclick = () => deleteComment(comment.id, msgId);
        }
      });
    }
  } catch (err) {
    commentsList.innerHTML = '<div class="empty-comment">加载评论失败</div>';
  }
};

const submitComment = async (msgId) => {
  const input = document.querySelector(`.comment-input[data-msg-id="${msgId}"]`);
  if (!input) return;

  const content = input.value.trim();
  if (!content) {
    alert('评论内容不能为空！');
    return;
  }

  try {
    const res = await fetch(`${BASE_PATH}/api/messages/${msgId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.msg);

    input.value = '';
    loadComments(msgId);
    
    // 更新评论数
    const commentBtn = document.querySelector(`.comment-btn[data-id="${msgId}"]`);
    if (commentBtn) {
      const countSpan = commentBtn.querySelector('.comment-count');
      const currentCount = parseInt(countSpan.textContent.match(/\d+/)[0]) || 0;
      countSpan.textContent = `(${currentCount + 1})`;
    }
  } catch (err) {
    alert(`评论失败：${err.message}`);
  }
};

const deleteComment = async (commentId, msgId) => {
  if (!confirm('确定删除这条评论吗？')) return;

  try {
    const res = await fetch(`${BASE_PATH}/api/comments/${commentId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.msg);

    loadComments(msgId);
    
    // 更新评论数
    const commentBtn = document.querySelector(`.comment-btn[data-id="${msgId}"]`);
    if (commentBtn) {
      const countSpan = commentBtn.querySelector('.comment-count');
      const currentCount = parseInt(countSpan.textContent.match(/\d+/)[0]) || 0;
      countSpan.textContent = `(${Math.max(0, currentCount - 1)})`;
    }
  } catch (err) {
    alert(`删除失败：${err.message}`);
  }
};

// ======== 全屏观看功能 ========
const enableFullscreen = (element) => {
  if (!element) return;
  element.addEventListener('click', () => {
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    } else {
      console.warn('Fullscreen API 不支持');
    }
  });
};

// 修改 previewMedia 函数，添加全屏功能
const previewMedia = (file) => {
  if (!mediaPreview) return;
  mediaPreview.innerHTML = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    if (file.type.startsWith('image')) {
      mediaPreview.innerHTML = `<img src="${e.target.result}" alt="预览" class="media-item">`;
    } else if (file.type.startsWith('video')) {
      mediaPreview.innerHTML = `<video src="${e.target.result}" controls class="media-item"></video>`;
    }

    const mediaItem = mediaPreview.querySelector('.media-item');
    enableFullscreen(mediaItem);
  };
  reader.readAsDataURL(file);
};

// ======== 事件绑定 ========
const bindEvents = () => {
  // 背景相关
  if (bgSettingBtn) {
    bgSettingBtn.onclick = () => {
      if (bgModal) bgModal.style.display = 'flex';
      loadBackgrounds();
    };
  }
  if (bgModalClose) bgModalClose.onclick = () => bgModal.style.display = 'none';
  if (uploadCustomBgBtn) uploadCustomBgBtn.onclick = uploadCustomBg;

  // 管理员相关
  if (adminLoginBtn) adminLoginBtn.onclick = () => adminModal.style.display = 'flex';
  if (adminModalClose) adminModalClose.onclick = () => adminModal.style.display = 'none';
  if (adminVerifyBtn) adminVerifyBtn.onclick = verifyAdmin;

  // 媒体预览
  if (mediaFile) mediaFile.onchange = () => previewMedia(mediaFile.files[0]);

  // 提交留言
  if (submitBtn) submitBtn.onclick = submitMessage;

  // Enter提交（Shift+Enter换行）
  if (textContent) {
    textContent.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitMessage();
      }
    });
  }

  // 点击空白处关闭模态框
  window.onclick = (e) => {
    if (e.target === adminModal || e.target === bgModal) hideAllModals();
  };
};

// ======== 初始化 ========
const init = () => {
  bindEvents();
  loadBackgrounds();
  loadMessages();
};

document.addEventListener('DOMContentLoaded', init);