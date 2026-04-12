/* ══════════════════════════════════════════════════════
   JERBI-CHAT.JS — Chatbot hybride Jerbi Explore
   Mode local  : faq.csv (~93 Q&R, offline-first)
   Mode en ligne : proxy Cloudflare → Groq (clé cachée)
   100% transparent pour l'utilisateur
   v3.0.0
══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── CONFIG ─────────────────────────────────────────── */
  const BASE = (window.APP_CONFIG && window.APP_CONFIG.GITHUB_REPO_PATH) || '/Explore';

  const WA_NUMBER = (window.APP_CONFIG && window.APP_CONFIG.CONTACT_WHATSAPP
    ? window.APP_CONFIG.CONTACT_WHATSAPP.replace(/\D/g, '')
    : '21600000000');
  const WA_LINK = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent("Bonjour Jerbi Explore ! J'ai une question sur le Cap Bon.");

  const FAQ_URL = (window.APP_CONFIG && window.APP_CONFIG.CSV_FAQ)
    ? window.APP_CONFIG.CSV_FAQ
    : (BASE + '/data/faq.csv');

  /* URL du proxy Cloudflare — à renseigner dans config.js après déploiement
     Format : https://jerbi-proxy.TON-COMPTE.workers.dev                    */
  const PROXY_URL = (window.APP_CONFIG && window.APP_CONFIG.CHAT_PROXY_URL)
    ? window.APP_CONFIG.CHAT_PROXY_URL
    : '';

  /* ── STATE ──────────────────────────────────────────── */
  var faqData  = [];
  var history  = [];
  var busy     = false;
  var chatOpen = false;

  /* ── LOAD FAQ CSV ───────────────────────────────────── */
  function loadFaq() {
    if (typeof Papa === 'undefined') { setTimeout(loadFaq, 600); return; }
    Papa.parse(FAQ_URL, {
      download: true, header: true, skipEmptyLines: true,
      complete: function(res) { faqData = res.data.filter(function(r){ return r.question && r.reponse; }); },
      error:    function()    { faqData = []; }
    });
  }

  /* ── LOCAL SEARCH ENGINE ────────────────────────────── */
  function normalize(str) {
    return (str || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[?!.,;:'"]/g, ' ');
  }

  function scoreEntry(entry, words) {
    var hay = normalize((entry.question || '') + ' ' + (entry.tags || ''));
    var s = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (w.length < 3) continue;
      if (hay.indexOf(w) !== -1) s += w.length;
    }
    return s;
  }

  function localSearch(query) {
    if (!faqData.length) return null;
    var words = normalize(query).split(/\s+/);
    var best = null, bestScore = 0;
    for (var i = 0; i < faqData.length; i++) {
      var s = scoreEntry(faqData[i], words);
      if (s > bestScore) { bestScore = s; best = faqData[i]; }
    }
    return bestScore >= 3 ? best : null;
  }

  /* ── PROXY CALL (clé côté serveur, invisible) ───────── */
  function callProxy(text) {
    var msgs = history.concat([{ role: 'user', content: text }]);
    return fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs })
    }).then(function(res) {
      if (!res.ok) {
        return res.json().catch(function(){ return {}; }).then(function(err){
          throw new Error(err.error || ('Proxy error ' + res.status));
        });
      }
      return res.json();
    }).then(function(data) {
      return data.reply || '';
    });
  }

  /* ── FORMAT TEXT ─────────────────────────────────────── */
  function fmt(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g,     '<em>$1</em>')
      .replace(/^- (.+)$/gm,    '<span class="jc-li">$1</span>')
      .replace(/\n/g,            '<br>');
  }

  /* ── DOM HELPERS ─────────────────────────────────────── */
  function addMsg(role, html, chip) {
    var msgs = document.getElementById('jc-msgs');
    var row  = document.createElement('div');
    row.className = 'jc-msg jc-' + role;

    var av  = document.createElement('div');
    av.className = 'jc-av jc-av-' + role;
    av.textContent = role === 'bot' ? '🌿' : 'Moi';

    var bub = document.createElement('div');
    bub.className = 'jc-bub';
    bub.innerHTML = html;

    if (chip) {
      var c = document.createElement('span');
      c.className = 'jc-chip jc-chip-' + chip.type;
      c.textContent = chip.label;
      bub.appendChild(c);
    }

    row.appendChild(av);
    row.appendChild(bub);
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function showTyping() {
    var msgs = document.getElementById('jc-msgs');
    var row  = document.createElement('div');
    row.className = 'jc-msg jc-bot';
    row.id = 'jc-typing';
    row.innerHTML = '<div class="jc-av jc-av-bot">🌿</div><div class="jc-bub"><div class="jc-dots"><span></span><span></span><span></span></div></div>';
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTyping() {
    var t = document.getElementById('jc-typing');
    if (t) t.remove();
  }

  function updateStatusBar() {
    var online   = navigator.onLine;
    var hasProxy = !!PROXY_URL;
    var full     = online && hasProxy;
    var dot      = document.getElementById('jc-status-dot');
    var lbl      = document.getElementById('jc-status-lbl');
    if (!dot) return;
    dot.style.background = full ? '#4ade80' : online ? '#f97316' : '#f87171';
    lbl.textContent = full
      ? 'Guide IA actif'
      : online
        ? 'Mode local (base Cap Bon)'
        : 'Hors ligne — base locale';
  }

  /* ── SEND ────────────────────────────────────────────── */
  function sendMsg(text) {
    text = (text || '').trim();
    if (!text || busy) return;

    busy = true;
    var btn = document.getElementById('jc-send');
    if (btn) btn.disabled = true;

    addMsg('user', fmt(text));
    showTyping();

    var sugg = document.getElementById('jc-sugg');
    if (sugg) sugg.style.display = 'none';

    var online   = navigator.onLine;
    var hasProxy = !!PROXY_URL;

    function finish(reply, chipType, chipLabel) {
      removeTyping();
      addMsg('bot', fmt(reply), { type: chipType, label: chipLabel });
      busy = false;
      var inp = document.getElementById('jc-inp');
      if (inp) { inp.value = ''; inp.style.height = 'auto'; }
      if (btn) btn.disabled = false;
      if (inp) inp.focus();
    }

    function tryLocal() {
      return new Promise(function(resolve) {
        setTimeout(function() {
          var hit = localSearch(text);
          if (hit) {
            resolve({ reply: hit.reponse, type: 'local', label: '📦 Base locale' });
          } else {
            resolve({
              reply: "Je n'ai pas cette information dans ma base hors ligne 😔<br><br>"
                + "<strong>2 solutions :</strong><br>"
                + '<span class="jc-li">🌐 Connecte-toi à internet — je deviens un guide IA complet</span>'
                + '<span class="jc-li"><a href="' + WA_LINK + '" target="_blank" rel="noopener" class="jc-wa-link">📱 Poser la question sur WhatsApp à Jerbi Explore</a></span>'
                + '<span class="jc-li"><a href="https://www.jerbievents.com" target="_blank" rel="noopener" class="jc-wa-link">🌿 Visiter jerbievents.com</a></span>',
              type: 'local', label: '📦 Hors ligne'
            });
          }
        }, 300 + Math.random() * 200);
      });
    }

    if (online && hasProxy) {
      callProxy(text).then(function(reply) {
        history.push({ role: 'user',      content: text  });
        history.push({ role: 'assistant', content: reply });
        if (history.length > 20) history = history.slice(-20);
        finish(reply, 'online', '✦ IA Jerbi');
      }).catch(function() {
        tryLocal().then(function(r) { finish(r.reply, 'local', '📦 Local (IA indispo.)'); });
      });
    } else {
      tryLocal().then(function(r) { finish(r.reply, r.type, r.label); });
    }
  }

  /* ── BUILD UI ────────────────────────────────────────── */
  function buildUI() {
    var css = document.createElement('style');
    css.textContent = [
      '#jc-fab{position:fixed;bottom:82px;right:16px;z-index:201;',
      'display:flex;align-items:center;gap:7px;',
      'padding:0 16px 0 12px;height:44px;border-radius:22px;border:none;cursor:pointer;',
      'background:linear-gradient(135deg,#C8A84B,#E8C96A);',
      'box-shadow:0 4px 18px rgba(200,168,75,.5);',
      'font-family:"DM Sans",system-ui,sans-serif;',
      'transition:transform .2s,box-shadow .2s;',
      '-webkit-tap-highlight-color:transparent;}',
      '#jc-fab:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(200,168,75,.65)}',
      '#jc-fab:active{transform:scale(.96)}',
      '#jc-fab .jc-fab-ico{width:20px;height:20px;fill:#0D0D0D;flex-shrink:0}',
      '#jc-fab .jc-fab-lbl{font-size:12px;font-weight:600;color:#0D0D0D;letter-spacing:.2px;white-space:nowrap}',
      '#jc-fab-badge{position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#e74c3c;border:2px solid var(--bg,#0a0500);font-size:10px;font-weight:700;color:#fff;display:none;align-items:center;justify-content:center;}',
      '#jc-modal{position:fixed;bottom:0;right:0;z-index:1001;width:min(380px,100vw);height:min(580px,calc(100vh - 70px));background:#0D0D0D;border:1px solid rgba(200,168,75,.22);border-bottom:none;border-radius:18px 18px 0 0;display:flex;flex-direction:column;transform:translateY(110%);transition:transform .32s cubic-bezier(.34,1.2,.64,1);box-shadow:0 -8px 40px rgba(0,0,0,.5);overflow:hidden;font-family:"DM Sans",system-ui,sans-serif;}',
      '#jc-modal.open{transform:translateY(0)}',
      '@media(min-width:520px){#jc-modal{bottom:136px;right:16px;border:1px solid rgba(200,168,75,.22);border-radius:18px;}}',
      '.jc-hdr{flex-shrink:0;padding:12px 14px 10px;background:linear-gradient(135deg,#111,#1a1500);border-bottom:1px solid rgba(200,168,75,.18);display:flex;align-items:center;gap:10px;}',
      '.jc-hdr-av{width:36px;height:36px;border-radius:10px;background:rgba(200,168,75,.13);border:1px solid rgba(200,168,75,.22);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}',
      '.jc-hdr-name{font-family:"Playfair Display",serif;font-size:14px;font-weight:700;color:#F5F2EB}',
      '.jc-hdr-sub{font-size:10px;color:#888;margin-top:1px;display:flex;align-items:center;gap:4px}',
      '#jc-status-dot{width:6px;height:6px;border-radius:50%;background:#f97316;transition:background .4s;flex-shrink:0}',
      '.jc-hdr-close{margin-left:auto;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.07);border:none;color:#F5F2EB;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
      '.jc-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:9px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent;}',
      '.jc-msgs::-webkit-scrollbar{width:3px}.jc-msgs::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}',
      '.jc-msg{display:flex;gap:8px;align-items:flex-end;max-width:90%}',
      '.jc-user{flex-direction:row-reverse;align-self:flex-end}',
      '.jc-bub{padding:9px 13px;border-radius:15px;font-size:13px;line-height:1.55;color:#F5F2EB;}',
      '.jc-bot .jc-bub{background:#1f1f1f;border:1px solid rgba(255,255,255,.09);border-bottom-left-radius:4px}',
      '.jc-user .jc-bub{background:linear-gradient(135deg,#C8A84B,#E8C96A);color:#0D0D0D;font-weight:500;border-bottom-right-radius:4px}',
      '.jc-bub strong{color:#E8C96A}.jc-user .jc-bub strong{color:#4a3000}',
      '.jc-li{display:block;padding:2px 0 2px 8px;border-left:2px solid rgba(200,168,75,.3);margin:2px 0;font-size:12px}',
      '.jc-av{width:26px;height:26px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px}',
      '.jc-av-bot{background:rgba(200,168,75,.13);border:1px solid rgba(200,168,75,.2)}',
      '.jc-av-user{background:rgba(255,255,255,.07);font-size:9px;font-weight:600;color:#888}',
      '.jc-chip{display:inline-block;margin-top:6px;font-size:9px;padding:1px 7px;border-radius:10px;border:1px solid rgba(255,255,255,.1);color:#666}',
      '.jc-chip-online{border-color:rgba(74,222,128,.25);color:#4ade80}.jc-chip-local{border-color:rgba(249,115,22,.25);color:#f97316}',
      '.jc-wa-link{color:#25D366;font-weight:600;text-decoration:none}.jc-wa-link:hover{text-decoration:underline}',
      '.jc-dots{display:flex;gap:4px;align-items:center;padding:2px 0}',
      '.jc-dots span{width:5px;height:5px;border-radius:50%;background:#666;animation:jcb .9s infinite}',
      '.jc-dots span:nth-child(2){animation-delay:.15s}.jc-dots span:nth-child(3){animation-delay:.3s}',
      '@keyframes jcb{0%,100%{transform:translateY(0);opacity:.4}50%{transform:translateY(-4px);opacity:1}}',
      '#jc-sugg{flex-shrink:0;padding:0 10px 7px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}',
      '#jc-sugg::-webkit-scrollbar{display:none}',
      '.jc-s{font-size:11px;padding:5px 11px;border-radius:16px;white-space:nowrap;border:1px solid rgba(200,168,75,.22);background:rgba(200,168,75,.09);color:#C8A84B;cursor:pointer;transition:background .18s;flex-shrink:0;font-family:inherit;}',
      '.jc-s:hover{background:rgba(200,168,75,.18)}',
      '.jc-inp-row{flex-shrink:0;padding:8px 10px 12px;display:flex;gap:7px;align-items:flex-end;border-top:1px solid rgba(255,255,255,.08);background:#181818;}',
      '#jc-inp{flex:1;background:#222;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:9px 13px;font-size:13px;color:#F5F2EB;font-family:inherit;resize:none;outline:none;transition:border-color .18s;max-height:80px;overflow-y:auto;line-height:1.4;}',
      '#jc-inp::placeholder{color:#555}#jc-inp:focus{border-color:rgba(200,168,75,.4)}',
      '#jc-send{width:38px;height:38px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#C8A84B,#E8C96A);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .18s,opacity .18s;}',
      '#jc-send:hover{transform:scale(1.07)}#jc-send:disabled{opacity:.35;cursor:default;transform:none}',
      '#jc-send svg{width:15px;height:15px;fill:#0D0D0D}',
      '.jc-welcome{background:#1a1500;border:1px solid rgba(200,168,75,.2);border-radius:12px;padding:14px;}',
      '.jc-welcome strong{font-family:"Playfair Display",serif;font-size:14px;color:#E8C96A;display:block;margin-bottom:5px}',
      '.jc-topics{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}',
      '.jc-topic{font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(200,168,75,.09);border:1px solid rgba(200,168,75,.2);color:#C8A84B}'
    ].join('');
    document.head.appendChild(css);

    /* FAB */
    var fab = document.createElement('button');
    fab.id = 'jc-fab';
    fab.setAttribute('aria-label', 'Ouvrir le guide IA Jerbi');
    fab.innerHTML = '<svg class="jc-fab-ico" viewBox="0 0 24 24"><path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg><span class="jc-fab-lbl">Chatbot</span><span id="jc-fab-badge">1</span>';
    fab.onclick = toggleChat;
    document.body.appendChild(fab);

    /* MODAL */
    var modal = document.createElement('div');
    modal.id = 'jc-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Demande à Jerbi — Guide IA Cap Bon');
    modal.innerHTML = '<div class="jc-hdr"><div class="jc-hdr-av">🌿</div><div style="flex:1;min-width:0"><div class="jc-hdr-name">Demande à Jerbi</div><div class="jc-hdr-sub"><span id="jc-status-dot"></span><span id="jc-status-lbl">Chargement…</span></div></div><button class="jc-hdr-close" onclick="window.__jerbiChat.close()" aria-label="Fermer">✕</button></div>'
      + '<div class="jc-msgs" id="jc-msgs"><div class="jc-msg jc-bot"><div class="jc-av jc-av-bot">🌿</div><div class="jc-bub"><div class="jc-welcome"><strong>Marhba bik au Cap Bon ! 👋</strong>Guide IA de Jerbi Explore — plages, restos, plongée, météo, événements… Pose-moi n\'importe quelle question sur le Cap Bon !<div class="jc-topics"><span class="jc-topic">🏖️ Plages</span><span class="jc-topic">🌊 Plongée</span><span class="jc-topic">🍽️ Restos</span><span class="jc-topic">🗺️ Itinéraires</span><span class="jc-topic">📅 Événements</span><span class="jc-topic">🚗 Transport</span></div></div></div></div></div>'
      + '<div id="jc-sugg"><button class="jc-s" onclick="window.__jerbiChat.pick(this)">Meilleures plages familles ?</button><button class="jc-s" onclick="window.__jerbiChat.pick(this)">Plonger à El Haouaria ?</button><button class="jc-s" onclick="window.__jerbiChat.pick(this)">Spécialités à goûter</button><button class="jc-s" onclick="window.__jerbiChat.pick(this)">Itinéraire 2 jours</button><button class="jc-s" onclick="window.__jerbiChat.pick(this)">Comment aller à Kélibia ?</button></div>'
      + '<div class="jc-inp-row"><textarea id="jc-inp" rows="1" placeholder="Pose ta question sur le Cap Bon…" oninput="window.__jerbiChat.grow(this)" onkeydown="window.__jerbiChat.kd(event)"></textarea><button id="jc-send" disabled onclick="window.__jerbiChat.send()" aria-label="Envoyer"><svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg></button></div>';
    document.body.appendChild(modal);

    updateStatusBar();
    window.addEventListener('online',  updateStatusBar);
    window.addEventListener('offline', updateStatusBar);
    loadFaq();
  }

  /* ── TOGGLE ── */
  function toggleChat() {
    chatOpen = !chatOpen;
    var modal = document.getElementById('jc-modal');
    var fab   = document.getElementById('jc-fab');
    if (!modal) return;
    if (chatOpen) {
      modal.classList.add('open');
      fab.setAttribute('aria-expanded', 'true');
      setTimeout(function() { var i = document.getElementById('jc-inp'); if (i) i.focus(); }, 350);
    } else {
      modal.classList.remove('open');
      fab.setAttribute('aria-expanded', 'false');
    }
  }

  /* ── PUBLIC API ── */
  window.__jerbiChat = {
    open:  function() { if (!chatOpen) toggleChat(); },
    close: function() { if (chatOpen)  toggleChat(); },
    send:  function() { var i = document.getElementById('jc-inp'); if (i) sendMsg(i.value); },
    pick:  function(el) { sendMsg(el.textContent); },
    grow:  function(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 80) + 'px';
      var btn = document.getElementById('jc-send');
      if (btn) btn.disabled = !el.value.trim() || busy;
    },
    kd: function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var btn = document.getElementById('jc-send');
        if (btn && !btn.disabled) window.__jerbiChat.send();
      }
    }
  };

  /* ── INIT ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }

})();
