/* =============================================================================
   CHATBOT.JS — Modal chatbot IA + recherche plein texte
   Source des donnees : convention collective brute (JSON non nettoye)
   ============================================================================= */

// --- Cle API chargee dynamiquement depuis config.json (non versionne) ---
let GEMINI_API_KEY = "";
let GEMINI_MODEL = "gemini-2.5-flash";
let GEMINI_URL = "";
let geminiConfigLoaded = false;

async function loadGeminiConfig() {
  if (geminiConfigLoaded) return;

  // 1. Essayer config.json (local / dev)
  try {
    const resp = await fetch('config.json');
    if (!resp.ok) throw new Error('config.json non trouve');
    const cfg = await resp.json();
    GEMINI_API_KEY = cfg.GEMINI_API_KEY || "";
    GEMINI_MODEL = cfg.GEMINI_MODEL || "gemini-2.5-flash";
  } catch (err) {
    // 2. Fallback : cle stockee dans localStorage (GitHub Pages)
    const saved = localStorage.getItem('gemini_api_key');
    if (saved) {
      GEMINI_API_KEY = saved;
      console.log('Chatbot: cle API chargee depuis localStorage');
    } else {
      console.warn('Chatbot: config.json introuvable et pas de cle en cache.');
      GEMINI_API_KEY = "";
    }
  }

  if (GEMINI_API_KEY) {
    GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    geminiConfigLoaded = true;
    console.log('Chatbot: config Gemini chargee');
  } else {
    GEMINI_URL = "";
  }
}

/** Affiche un prompt pour saisir la cle API (si absente) */
function promptApiKey() {
  return new Promise(function(resolve) {
    // Overlay
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.18);font-family:inherit;';
    box.innerHTML = '<div style="font-size:16px;font-weight:700;margin-bottom:6px;color:#1e2028;">🔑 Clé API Gemini requise</div>' +
      '<div style="font-size:13px;color:#5a5e6a;margin-bottom:16px;">Pour utiliser l\'assistant IA et le comparateur, entrez votre clé API Google Gemini.<br><a href="https://aistudio.google.com/apikey" target="_blank" style="color:#42D80F;">Obtenir une clé gratuite →</a></div>' +
      '<input id="apikey-input" type="text" placeholder="AIzaSy..." style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;margin-bottom:14px;">' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
      '<button id="apikey-cancel" style="padding:8px 18px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;">Annuler</button>' +
      '<button id="apikey-ok" style="padding:8px 18px;border:none;border-radius:8px;background:#42D80F;color:#fff;cursor:pointer;font-weight:600;font-size:13px;">Valider</button>' +
      '</div>';

    ov.appendChild(box);
    document.body.appendChild(ov);

    var inp = document.getElementById('apikey-input');
    inp.focus();

    function close(val) {
      ov.remove();
      resolve(val || '');
    }

    document.getElementById('apikey-cancel').onclick = function() { close(''); };
    document.getElementById('apikey-ok').onclick = function() { close(inp.value.trim()); };
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') close(inp.value.trim());
      if (e.key === 'Escape') close('');
    });
  });
}

/** Demande la cle si absente, stocke dans localStorage */
async function ensureApiKey() {
  if (GEMINI_API_KEY) return true;
  var key = await promptApiKey();
  if (!key) return false;
  GEMINI_API_KEY = key;
  GEMINI_MODEL = GEMINI_MODEL || 'gemini-2.5-flash';
  GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  localStorage.setItem('gemini_api_key', key);
  geminiConfigLoaded = true;
  console.log('Chatbot: cle API enregistree dans localStorage');
  return true;
}

let chatOpen = false;
let chatHistory = [];
let chatConventionData = null;
let chatConventionMeta = null;
let chatBrutData = null;
let chatIsTyping = false;

// ===== RECHERCHE PLEIN TEXTE =====

let searchHighlights = [];
let searchCurrentIdx = -1;

function initFullTextSearch() {
  const actionBtns = document.querySelector('.action-btns');
  if (!actionBtns) return;

  // Inserer la barre de recherche avant les boutons
  const actionBar = document.querySelector('.action-bar');
  const titleEl = actionBar.querySelector('.action-bar-title');

  // Creer la barre de recherche
  const wrapper = document.createElement('div');
  wrapper.className = 'search-bar-wrapper';
  wrapper.innerHTML = `
    <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
    <input type="text" class="search-bar-input" id="fulltext-search" placeholder="Rechercher dans la convention..." autocomplete="off">
  `;

  // Compteur + navigation
  const nav = document.createElement('span');
  nav.className = 'search-results-count';
  nav.id = 'search-results-info';
  nav.style.display = 'none';
  nav.innerHTML = `
    <span id="search-count-text"></span>
    <span class="search-nav-btns">
      <button class="search-nav-btn" id="search-prev" title="Precedent">&#9650;</button>
      <button class="search-nav-btn" id="search-next" title="Suivant">&#9660;</button>
    </span>
  `;

  // Inserer entre le titre et les boutons
  actionBar.insertBefore(wrapper, actionBtns);
  actionBar.insertBefore(nav, actionBtns);

  // Events
  let searchTimeout;
  const input = document.getElementById('fulltext-search');
  input.addEventListener('input', function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performFullTextSearch(this.value), 250);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateSearchResult(e.shiftKey ? -1 : 1);
    }
    if (e.key === 'Escape') {
      this.value = '';
      clearSearchHighlights();
      this.blur();
    }
  });

  document.getElementById('search-prev').addEventListener('click', () => navigateSearchResult(-1));
  document.getElementById('search-next').addEventListener('click', () => navigateSearchResult(1));

  // Raccourci Ctrl+F override
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
}

function performFullTextSearch(query) {
  clearSearchHighlights();

  if (!query || query.trim().length < 2) {
    document.getElementById('search-results-info').style.display = 'none';
    return;
  }

  const q = query.trim();
  const container = document.getElementById('sections-container');
  if (!container) return;

  // Walk the text nodes
  const treeWalker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );

  const matches = [];
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

  while (treeWalker.nextNode()) {
    const node = treeWalker.currentNode;
    const text = node.textContent;
    if (!regex.test(text)) continue;

    // Split and wrap matches
    regex.lastIndex = 0;
    const parts = [];
    let lastIdx = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push({ text: text.substring(lastIdx, match.index), highlight: false });
      }
      parts.push({ text: match[0], highlight: true });
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < text.length) {
      parts.push({ text: text.substring(lastIdx), highlight: false });
    }

    if (parts.some(p => p.highlight)) {
      const frag = document.createDocumentFragment();
      for (const part of parts) {
        if (part.highlight) {
          const mark = document.createElement('mark');
          mark.className = 'search-highlight';
          mark.textContent = part.text;
          frag.appendChild(mark);
          matches.push(mark);
        } else {
          frag.appendChild(document.createTextNode(part.text));
        }
      }
      node.parentNode.replaceChild(frag, node);
    }
  }

  searchHighlights = matches;
  searchCurrentIdx = -1;

  const infoEl = document.getElementById('search-results-info');
  const countText = document.getElementById('search-count-text');
  if (matches.length > 0) {
    infoEl.style.display = '';
    countText.textContent = `${matches.length} r\u00e9sultat${matches.length > 1 ? 's' : ''}`;
    navigateSearchResult(1);
  } else {
    infoEl.style.display = '';
    countText.textContent = 'Aucun r\u00e9sultat';
  }
}

function navigateSearchResult(direction) {
  if (searchHighlights.length === 0) return;

  // Remove current highlight
  if (searchCurrentIdx >= 0 && searchHighlights[searchCurrentIdx]) {
    searchHighlights[searchCurrentIdx].style.background = 'rgba(66, 216, 15, 0.25)';
  }

  searchCurrentIdx += direction;
  if (searchCurrentIdx >= searchHighlights.length) searchCurrentIdx = 0;
  if (searchCurrentIdx < 0) searchCurrentIdx = searchHighlights.length - 1;

  const current = searchHighlights[searchCurrentIdx];
  if (current) {
    current.style.background = 'rgba(66, 216, 15, 0.55)';
    current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const countText = document.getElementById('search-count-text');
  countText.textContent = `${searchCurrentIdx + 1}/${searchHighlights.length}`;
}

function clearSearchHighlights() {
  // Replace marks back with text
  const marks = document.querySelectorAll('.search-highlight');
  marks.forEach(mark => {
    const text = document.createTextNode(mark.textContent);
    mark.parentNode.replaceChild(text, mark);
  });

  // Merge adjacent text nodes
  const container = document.getElementById('sections-container');
  if (container) container.normalize();

  searchHighlights = [];
  searchCurrentIdx = -1;
}


// ===== CHATBOT MODAL =====

async function initChatbot(conventionData, conventionMeta) {
  chatConventionData = conventionData;
  chatConventionMeta = conventionMeta;

  // Charger la config Gemini (cle API)
  await loadGeminiConfig();

  // Charger le fichier brut pour le chatbot (donnees plus completes)
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      const resp = await fetch(`data/${id}_brut.json`);
      if (resp.ok) {
        chatBrutData = await resp.json();
        console.log('Chatbot: donnees brutes chargees');
      } else {
        console.log('Chatbot: fichier brut non trouve, utilisation des donnees nettoyees');
        chatBrutData = null;
      }
    }
  } catch (err) {
    console.log('Chatbot: erreur chargement brut, fallback nettoye', err);
    chatBrutData = null;
  }

  createChatDOM();
  setupChatEvents();
  initFullTextSearch();
  injectActionBarButtons();
}

function injectActionBarButtons() {
  const actionBtns = document.querySelector('.action-btns');
  if (!actionBtns) return;

  // Bouton "Poser une question" AVANT le bouton Imprimer
  const askBtn = document.createElement('button');
  askBtn.className = 'btn btn-sm';
  askBtn.id = 'btn-ask';
  askBtn.title = 'Poser une question a l\'assistant IA';
  askBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
    Poser une question
  `;
  askBtn.addEventListener('click', openChat);

  // Inserer avant le premier bouton
  actionBtns.insertBefore(askBtn, actionBtns.firstChild);
}

function createChatDOM() {
  const nom = chatConventionMeta?.nom || 'Convention';
  const idcc = chatConventionMeta?.idcc || '';

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'chat-overlay';
  overlay.id = 'chat-overlay';

  // Modal
  const modal = document.createElement('div');
  modal.className = 'chat-modal';
  modal.id = 'chat-modal';
  modal.innerHTML = `
    <div class="chat-header">
      <div class="chat-header-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
      <div class="chat-header-text">
        <div class="chat-header-title">Assistant Convention Collective</div>
        <div class="chat-header-sub">${idcc ? 'IDCC ' + escapeHtml(idcc) + ' \u2014 ' : ''}${escapeHtml(nom)}</div>
        <div class="chat-header-source">Source : extraction brute de la convention</div>
      </div>
      <button class="chat-close" id="chat-close" title="Fermer (Echap)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <div class="chat-messages" id="chat-messages">
      <div class="chat-welcome">
        <div class="title">Posez vos questions</div>
        <div>Je peux vous renseigner sur cette convention collective : droits, obligations, indemnit\u00e9s, cong\u00e9s, temps de travail...</div>
      </div>
    </div>

    <div class="chat-suggestions" id="chat-suggestions">
      <button class="chat-suggestion" data-q="Quelle est la dur\u00e9e de la p\u00e9riode d'essai ?">P\u00e9riode d'essai</button>
      <button class="chat-suggestion" data-q="Quelles sont les indemnit\u00e9s de licenciement ?">Indemnit\u00e9s</button>
      <button class="chat-suggestion" data-q="Quels sont les cong\u00e9s pour \u00e9v\u00e9nements familiaux ?">Cong\u00e9s familiaux</button>
      <button class="chat-suggestion" data-q="Quelles sont les majorations pour heures suppl\u00e9mentaires ?">Heures sup</button>
    </div>

    <div class="chat-input-area">
      <textarea class="chat-input" id="chat-input" rows="1" placeholder="Votre question sur la convention..."></textarea>
      <button class="chat-send" id="chat-send" title="Envoyer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>

    <div class="chat-disclaimer">
      R\u00e9ponses g\u00e9n\u00e9r\u00e9es par IA \u00e0 partir de l'extraction brute de la convention \u2014 V\u00e9rifiez toujours les informations officielles
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(modal);
}

// ===== EVENTS =====

function setupChatEvents() {
  const overlay = document.getElementById('chat-overlay');
  const closeBtn = document.getElementById('chat-close');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  // Fermer avec overlay ou bouton
  overlay.addEventListener('click', closeChat);
  closeBtn.addEventListener('click', closeChat);

  // Fermer avec Echap
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && chatOpen) {
      closeChat();
    }
  });

  // Send on click
  sendBtn.addEventListener('click', sendMessage);

  // Send on Enter (Shift+Enter for newline)
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // Suggestion buttons
  document.getElementById('chat-suggestions').addEventListener('click', function (e) {
    const btn = e.target.closest('.chat-suggestion');
    if (btn) {
      const q = btn.getAttribute('data-q');
      document.getElementById('chat-input').value = q;
      sendMessage();
    }
  });
}

function openChat() {
  chatOpen = true;
  document.getElementById('chat-overlay').classList.add('open');
  document.getElementById('chat-modal').classList.add('open');
  setTimeout(() => document.getElementById('chat-input').focus(), 100);
}

function closeChat() {
  chatOpen = false;
  document.getElementById('chat-overlay').classList.remove('open');
  document.getElementById('chat-modal').classList.remove('open');
}

// ===== MESSAGES =====

function addMessage(text, role) {
  const container = document.getElementById('chat-messages');

  // Remove welcome on first message
  const welcome = container.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  // Hide suggestions after first message
  const suggestions = document.getElementById('chat-suggestions');
  if (suggestions && role === 'user') {
    suggestions.style.display = 'none';
  }

  const msg = document.createElement('div');
  msg.className = `chat-msg ${role}`;

  if (role === 'bot') {
    msg.innerHTML = formatBotMessage(text);
  } else {
    msg.textContent = text;
  }

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;

  return msg;
}

function showTyping() {
  const container = document.getElementById('chat-messages');
  const typing = document.createElement('div');
  typing.className = 'chat-typing';
  typing.id = 'chat-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(typing);
  container.scrollTop = container.scrollHeight;
}

function hideTyping() {
  const typing = document.getElementById('chat-typing');
  if (typing) typing.remove();
}

function formatBotMessage(text) {
  if (!text) return '';
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Lists
  text = text.replace(/^[-\u2022] (.+)$/gm, '<li>$1</li>');
  text = text.replace(/((?:<li>.*?<\/li>\n?)+)/g, '<ul>$1</ul>');
  // Line breaks
  text = text.replace(/\n\n/g, '<br><br>');
  text = text.replace(/\n/g, '<br>');
  return text;
}

// ===== SEND & AI =====

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const question = input.value.trim();
  if (!question || chatIsTyping) return;

  // Verifier que la cle API est configuree (demander si absente)
  if (!GEMINI_API_KEY) {
    var hasKey = await ensureApiKey();
    if (!hasKey) return;
  }

  // Add user message
  addMessage(question, 'user');
  input.value = '';
  input.style.height = 'auto';

  // Add to history
  chatHistory.push({ role: 'user', parts: [{ text: question }] });

  // Show typing
  chatIsTyping = true;
  showTyping();
  document.getElementById('chat-send').disabled = true;

  try {
    const answer = await callGemini(question);
    hideTyping();
    addMessage(answer, 'bot');
    chatHistory.push({ role: 'model', parts: [{ text: answer }] });
  } catch (err) {
    hideTyping();
    addMessage("Erreur : impossible d'obtenir une r\u00e9ponse. R\u00e9essayez dans quelques instants.", 'bot');
    console.error('Chatbot error:', err);
  }

  chatIsTyping = false;
  document.getElementById('chat-send').disabled = false;
}


function buildConventionContext() {
  // Utiliser les donnees brutes si disponibles (plus completes), sinon fallback nettoye
  const sourceData = chatBrutData || chatConventionData;
  if (!sourceData) return '';

  const nom = chatConventionMeta?.nom || 'Convention';
  const idcc = chatConventionMeta?.idcc || '';
  const sourceLabel = chatBrutData ? 'brute (extraction originale)' : 'nettoy\u00e9e';

  let context = `Convention Collective : ${nom}`;
  if (idcc) context += ` (IDCC ${idcc})`;
  context += `\nSource : version ${sourceLabel}\n\n`;

  // Build a summary of all treated sections
  for (const group of MENU) {
    let groupContent = '';
    for (const key of group.children) {
      const section = sourceData[key];
      if (!section || !section.traite) continue;

      const label = LABELS[key] || key;
      groupContent += `\n### ${label}\n`;

      const contenu = section.contenu || [];
      for (const item of contenu) {
        if (item.theme) groupContent += `**${item.theme}**\n`;
        if (item.texte) {
          let texte = item.texte;
          if (texte.length > 2000) {
            texte = texte.substring(0, 2000) + '... [tronqu\u00e9]';
          }
          groupContent += texte + '\n';
        }
      }
    }
    if (groupContent) {
      context += `## ${group.label}\n${groupContent}\n`;
    }
  }

  return context;
}


async function callGemini(question) {
  const conventionContext = buildConventionContext();

  const systemPrompt = `Tu es un assistant expert en droit du travail fran\u00e7ais, sp\u00e9cialis\u00e9 dans les conventions collectives.

Tu r\u00e9ponds aux questions des utilisateurs en te basant UNIQUEMENT sur les donn\u00e9es de la convention collective fournie ci-dessous.
Ces donn\u00e9es proviennent de l'extraction brute de la convention collective (version non nettoy\u00e9e, la plus compl\u00e8te possible).

## R\u00e8gles :
1. R\u00e9ponds toujours en fran\u00e7ais, de mani\u00e8re claire et p\u00e9dagogique
2. Cite les \u00e9l\u00e9ments pr\u00e9cis de la convention (montants, dur\u00e9es, conditions)
3. Si l'information n'est pas dans la convention, dis-le clairement
4. Structure ta r\u00e9ponse avec des listes \u00e0 puces quand c'est pertinent
5. Sois concis mais complet (3-8 phrases max)
6. Ne donne jamais de conseil juridique, pr\u00e9cise que les informations proviennent de la convention
7. Utilise le gras (**texte**) pour les \u00e9l\u00e9ments importants

## Donn\u00e9es de la convention :
${conventionContext}`;

  // Build messages for conversation history
  const contents = [];

  // System instruction via first user message
  contents.push({
    role: 'user',
    parts: [{ text: systemPrompt + '\n\nQuestion : ' + (chatHistory.length <= 1 ? question : chatHistory[0].parts[0].text) }]
  });

  if (chatHistory.length > 1) {
    contents.push({
      role: 'model',
      parts: [{ text: chatHistory[1]?.parts?.[0]?.text || 'Ok' }]
    });

    for (let i = 2; i < chatHistory.length; i++) {
      contents.push(chatHistory[i]);
    }
  }

  const body = {
    contents: contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
    }
  };

  const resp = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from Gemini');
  }

  return text;
}
