/* ============================================================
   CYKELBØRSEN – js/support-chat.js
   Claude Haiku-baseret support chat widget.
   ============================================================ */

const CHAT_FUNCTION_URL = 'https://ktufgncydxhkhfttojkh.supabase.co/functions/v1/chat-support';

let chatHistory = [];
let chatOpen    = false;

function toggleChat() {
  chatOpen = !chatOpen;
  const win  = document.getElementById('chat-window');
  const iconOpen  = document.getElementById('chat-icon-open');
  const iconClose = document.getElementById('chat-icon-close');
  win.classList.toggle('open', chatOpen);
  iconOpen.style.display  = chatOpen ? 'none'  : '';
  iconClose.style.display = chatOpen ? ''      : 'none';
  if (chatOpen) {
    setTimeout(() => document.getElementById('chat-input')?.focus(), 250);
  }
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

function appendChatMsg(role, text) {
  const container = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = `chat-msg chat-msg--${role === 'user' ? 'user' : 'bot'}`;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return wrap;
}

function showTyping() {
  const container = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = 'chat-msg chat-msg--bot chat-typing';
  wrap.id = 'chat-typing-indicator';
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = 'Skriver…';
  wrap.appendChild(bubble);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

function removeTyping() {
  document.getElementById('chat-typing-indicator')?.remove();
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = '';
  appendChatMsg('user', text);

  chatHistory.push({ role: 'user', content: text });

  sendBtn.disabled = true;
  showTyping();

  try {
    const res = await fetch(CHAT_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory }),
    });

    const data = await res.json();

    removeTyping();

    if (!res.ok || data.error) {
      appendChatMsg('bot', 'Beklager, noget gik galt. Prøv igen om lidt.');
      chatHistory.pop();
    } else {
      appendChatMsg('bot', data.reply);
      chatHistory.push({ role: 'assistant', content: data.reply });
    }
  } catch {
    removeTyping();
    appendChatMsg('bot', 'Ingen forbindelse – tjek din internet-forbindelse og prøv igen.');
    chatHistory.pop();
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

window.toggleChat      = toggleChat;
window.sendChatMessage = sendChatMessage;
window.handleChatKey   = handleChatKey;
