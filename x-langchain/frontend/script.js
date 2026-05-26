const API_BASE_URL = 'http://localhost:8001';
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// 对话历史存储
let conversationHistory = [];

// 快捷功能模板
const quickActions = {
    write: {
        prompt: '请帮我写一篇关于人工智能发展趋势的文章，要求结构清晰，内容详实，大约500字左右。',
        title: '写文章'
    },
    code: {
        prompt: '请帮我写一个 Python 函数，用于计算斐波那契数列的第 n 项，并添加详细的注释说明。',
        title: '写代码'
    },
    sql: {
        prompt: '假设有一个名为 users 的表，包含 id、name、email、created_at 字段，请帮我写一个 SQL 查询，找出最近一周注册的用户。',
        title: 'SQL 查询'
    },
    search: {
        prompt: '请帮我搜索一下最近的人工智能新闻和技术动态。',
        title: '网络搜索'
    }
};

// 快捷功能点击
function quickAction(actionType) {
    const action = quickActions[actionType];
    if (action) {
        messageInput.value = action.prompt;
        sendMessage();
    }
}

// 滚动到底部
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 添加消息到聊天区域
function addMessage(content, isUser = false) {
    const messageBubble = document.createElement('div');
    messageBubble.className = `message-bubble ${isUser ? 'user-message' : 'bot-message'}`;
    
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    
    messageBubble.innerHTML = `
        <div class="avatar ${isUser ? 'user' : 'bot'}">
            ${isUser ? '👤' : '🤖'}
        </div>
        <div class="message-content">
            <p>${content}</p>
            <div class="message-time">${timestamp}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageBubble);
    scrollToBottom();
    
    // 保存到对话历史
    conversationHistory.push({
        role: isUser ? 'user' : 'assistant',
        content: content,
        time: timestamp
    });
}

// 添加打字指示器
function addTypingIndicator() {
    const typingBubble = document.createElement('div');
    typingBubble.className = 'message-bubble bot-message';
    typingBubble.id = 'typingIndicator';
    
    typingBubble.innerHTML = `
        <div class="avatar bot">🤖</div>
        <div class="message-content">
            <div class="typing-indicator">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(typingBubble);
    scrollToBottom();
}

// 移除打字指示器
function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// 发送消息
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    // 清空输入框
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // 添加用户消息
    addMessage(message, true);
    
    // 添加打字指示器
    addTypingIndicator();
    
    try {
        // 使用流式请求
        const response = await fetch(`${API_BASE_URL}/chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: message })
        });
        
        if (!response.ok) {
            throw new Error('请求失败');
        }
        
        // 移除打字指示器
        removeTypingIndicator();
        
        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let botResponse = '';
        let responseElement = null;
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    
                    if (data.done) {
                        if (botResponse.trim() === '') {
                            botResponse = '抱歉，我无法回答这个问题。';
                        }
                        break;
                    }
                    
                    if (data.token) {
                        botResponse += data.token;
                        
                        // 创建或更新响应元素
                        if (!responseElement) {
                            responseElement = document.createElement('div');
                            responseElement.className = 'message-bubble bot-message';
                            responseElement.innerHTML = `
                                <div class="avatar bot">🤖</div>
                                <div class="message-content">
                                    <p></p>
                                    <div class="message-time">${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
                                </div>
                            `;
                            messagesContainer.appendChild(responseElement);
                        }
                        
                        responseElement.querySelector('p').textContent = botResponse;
                        scrollToBottom();
                    }
                } catch (e) {
                    console.error('解析响应失败:', e);
                }
            }
        }
        
        if (!responseElement && botResponse) {
            addMessage(botResponse, false);
        }
        
    } catch (error) {
        removeTypingIndicator();
        console.error('发送消息失败:', error);
        addMessage('抱歉，服务器暂时无法响应，请稍后重试。', false);
    }
}

// 处理键盘事件
function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// 调整输入框高度
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
});

// 点击发送按钮
sendBtn.addEventListener('click', sendMessage);

// 点击菜单项目
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
    });
});

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    checkServiceStatus();
});

// 新建对话
function newConversation() {
    // 保存当前对话到历史
    if (conversationHistory.length > 0) {
        const existingHistories = JSON.parse(localStorage.getItem('conversationHistories') || '[]');
        existingHistories.push({
            id: Date.now(),
            time: new Date().toLocaleString('zh-CN'),
            messages: [...conversationHistory]
        });
        localStorage.setItem('conversationHistories', JSON.stringify(existingHistories));
    }
    
    // 清空消息容器
    messagesContainer.innerHTML = `
        <div class="message-bubble bot-message">
            <div class="avatar bot">🤖</div>
            <div class="message-content">
                <p>你好！我是你的智能助手，有什么可以帮你的吗？</p>
            </div>
        </div>
    `;
    
    // 重置对话历史
    conversationHistory = [];
    messageInput.focus();
}

// 保存对话
function saveConversation() {
    if (conversationHistory.length === 0) {
        alert('暂无对话内容可保存');
        return;
    }
    
    const conversationData = {
        id: Date.now(),
        time: new Date().toLocaleString('zh-CN'),
        messages: [...conversationHistory]
    };
    
    // 保存到 localStorage
    const existingHistories = JSON.parse(localStorage.getItem('conversationHistories') || '[]');
    existingHistories.push(conversationData);
    localStorage.setItem('conversationHistories', JSON.stringify(existingHistories));
    
    // 也可以下载为 JSON 文件
    const blob = new Blob([JSON.stringify(conversationData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation_${conversationData.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('对话已保存！');
}

// 检查服务状态
async function checkServiceStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        const data = await response.json();
        console.log('服务状态:', data);
    } catch (error) {
        console.warn('服务尚未启动:', error);
    }
}
