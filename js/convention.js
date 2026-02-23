/* =============================================================================
   CONVENTION.JS — Page detail : affichage d'une convention collective
   ============================================================================= */

let conventionData = null;
let conventionMeta = null;
let activeSection = null;

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', function() {
  detectIframeMode();
  init();
});

// ===== DETECTION IFRAME =====
function detectIframeMode() {
  var inIframe = false;
  try {
    inIframe = (window.self !== window.top);
  } catch (e) {
    inIframe = true;
  }
  if (!inIframe) return;

  document.documentElement.classList.add('iframe-mode');
  console.log('Convention: mode iframe detecte');

  // En iframe, position:fixed et position:sticky ne fonctionnent pas
  // car l'iframe est dimensionnee a la hauteur du contenu et c'est le parent qui scrolle.
  // Solution : repositionner les elements flottants en position:absolute
  // en utilisant un IntersectionObserver sur un element sentinelle.
  setupIframeFloatingElements();
}

/**
 * Positionne les elements flottants (bouton menu, action-bar, sidebar) en mode iframe.
 *
 * Probleme : l'iframe est dimensionne a la hauteur du contenu (~30000px) par le parent.
 * Le parent scrolle la page, pas l'iframe. Donc :
 * - position:fixed se fixe sur le viewport de l'iframe = le contenu entier (inutile)
 * - window.innerHeight = hauteur iframe (~30000px), pas viewport visible (~900px)
 * - getBoundingClientRect().top toujours 0 (pas de scroll interne)
 * - IntersectionObserver avec sentinelle unique : rootBounds null en cross-origin
 *
 * Solution : MULTI-SENTINELLES IntersectionObserver.
 * On place une sentinelle invisible tous les 200px dans le document.
 * L'IntersectionObserver detecte lesquelles sont dans le viewport reel.
 * La premiere visible = haut du viewport, la derniere = bas du viewport.
 * Fonctionne meme en cross-origin car isIntersecting est toujours fiable.
 */
function setupIframeFloatingElements() {
  setTimeout(function() {
    var tocBtn = document.getElementById('mobile-toc-toggle');
    var actionBar = document.querySelector('.action-bar');
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('toc-overlay');
    if (!tocBtn || !actionBar) return;

    // Preparer les elements flottants en position absolute
    tocBtn.style.position = 'absolute';
    tocBtn.style.display = 'flex';
    tocBtn.style.zIndex = '60';

    actionBar.style.position = 'absolute';
    actionBar.style.left = '0';
    actionBar.style.right = '0';
    actionBar.style.zIndex = '55';
    actionBar.style.borderTop = '1px solid var(--border-light)';
    actionBar.style.borderBottom = 'none';
    actionBar.style.boxShadow = '0 -2px 12px rgba(0,0,0,0.08)';

    var titleEl = actionBar.querySelector('.action-bar-title');
    if (titleEl) titleEl.style.display = 'none';
    var btnsEl = actionBar.querySelector('.action-btns');
    if (btnsEl) {
      btnsEl.style.width = '100%';
      btnsEl.style.justifyContent = 'center';
    }

    // --- MULTI-SENTINELLES ---
    // Placer une sentinelle tous les STEP pixels dans le document.
    // Chaque sentinelle est un div de 1x1px, invisible.
    var STEP = 200; // espacement en pixels
    var docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      1000
    );
    var sentinelCount = Math.ceil(docHeight / STEP) + 1;
    // Limiter le nombre de sentinelles pour la performance
    if (sentinelCount > 300) {
      STEP = Math.ceil(docHeight / 300);
      sentinelCount = Math.ceil(docHeight / STEP) + 1;
    }

    var sentinels = [];
    var sentinelContainer = document.createElement('div');
    sentinelContainer.style.cssText = 'position:absolute;top:0;left:0;width:1px;pointer-events:none;';
    sentinelContainer.setAttribute('aria-hidden', 'true');

    for (var i = 0; i < sentinelCount; i++) {
      var s = document.createElement('div');
      s.style.cssText = 'position:absolute;width:1px;height:1px;visibility:hidden;';
      s.style.top = (i * STEP) + 'px';
      s._yPos = i * STEP;
      s._visible = false;
      sentinelContainer.appendChild(s);
      sentinels.push(s);
    }
    document.body.appendChild(sentinelContainer);

    var visibleTop = 0;
    var visibleBottom = 800;

    // Observer toutes les sentinelles
    var observer = new IntersectionObserver(function(entries) {
      for (var e = 0; e < entries.length; e++) {
        entries[e].target._visible = entries[e].isIntersecting;
      }

      // Determiner la zone visible : premier et dernier sentinel visible
      var firstVisible = -1;
      var lastVisible = -1;
      for (var j = 0; j < sentinels.length; j++) {
        if (sentinels[j]._visible) {
          if (firstVisible === -1) firstVisible = j;
          lastVisible = j;
        }
      }

      if (firstVisible >= 0 && lastVisible >= 0) {
        visibleTop = sentinels[firstVisible]._yPos;
        visibleBottom = sentinels[lastVisible]._yPos + STEP;
      }
    }, { threshold: 0 });

    for (var k = 0; k < sentinels.length; k++) {
      observer.observe(sentinels[k]);
    }

    // Repositionner les elements flottants a chaque frame
    function updatePositions() {
      var viewH = visibleBottom - visibleTop;
      if (viewH < 100) viewH = 800;

      // Bouton hamburger : coin inferieur droit de la zone visible
      tocBtn.style.top = (visibleBottom - 80) + 'px';
      tocBtn.style.left = 'auto';
      tocBtn.style.right = '20px';
      tocBtn.style.bottom = 'auto';

      // Action bar : barre fixee en bas de la zone visible
      actionBar.style.top = (visibleBottom - actionBar.offsetHeight) + 'px';
      actionBar.style.bottom = 'auto';

      // Sidebar et overlay : seulement quand ouvert
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.style.top = visibleTop + 'px';
        sidebar.style.height = viewH + 'px';
      }
      if (overlay && overlay.classList.contains('visible')) {
        overlay.style.position = 'absolute';
        overlay.style.top = visibleTop + 'px';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.height = viewH + 'px';
      }

      requestAnimationFrame(updatePositions);
    }

    requestAnimationFrame(updatePositions);

    // Ecouter aussi les messages du parent pour la position de scroll (optionnel)
    window.addEventListener('message', function(evt) {
      if (evt.data && evt.data.kind === 'scroll-info') {
        visibleTop = Math.max(0, evt.data.scrollTop || 0);
        var vh = evt.data.viewportHeight || 800;
        visibleBottom = visibleTop + vh;
      }
    });

    console.log('Convention: iframe multi-sentinel (' + sentinelCount + ' sentinelles, step=' + STEP + 'px)');
  }, 500);
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    showError('Aucune convention sp\u00e9cifi\u00e9e. <a href="index.html">Retour \u00e0 la liste</a>');
    return;
  }

  try {
    const resp = await fetch(`data/${id}.json`);
    if (!resp.ok) throw new Error('Fichier non trouv\u00e9');
    conventionData = await resp.json();
    conventionMeta = conventionData._meta || {};

    // Titre de la page
    const nom = conventionMeta.nom || id;
    const idcc = conventionMeta.idcc || '';
    document.title = `CCN ${idcc ? 'IDCC ' + idcc + ' - ' : ''}${nom}`;

    // Sidebar info
    renderSidebarInfo(nom, idcc);

    // Sidebar navigation
    buildSidebar(conventionData);

    // Charger le Code du travail (reference legale) avant le rendu
    if (typeof loadCodeTravail === 'function') {
      await loadCodeTravail();
    }

    // Contenu principal
    renderSections(conventionData);

    // Action bar
    const titleEl = document.getElementById('action-bar-title');
    if (titleEl) titleEl.textContent = `IDCC ${idcc} \u2014 ${nom}`;

    // Print cover + table des matieres (visible seulement en print)
    renderPrintCover(nom, idcc);
    renderPrintToc(conventionData);

    // Setup interactions
    setupScrollSpy();
    setupSidebarSearch();
    setupMobileToc();
    setupPrint();

    // Chatbot IA
    if (typeof initChatbot === 'function') {
      initChatbot(conventionData, conventionMeta);
    }

    // Notifier le parent iframe
    if (typeof notifyParent === 'function') {
      notifyParent('conventionLoaded', { id, idcc, nom });
    }

    // Cacher le loading
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';

  } catch (err) {
    console.error('Erreur:', err);
    showError(`Convention "${id}" non trouv\u00e9e. <a href="index.html">Retour \u00e0 la liste</a>`);
  }
}

// ===== FILTRAGE CONTENU VIDE =====
/**
 * Verifie si une section a du contenu visible (texte non vide ou articles).
 * Gere 2 formats : contenu[] (array) et format imbrique (sous-cles avec texte/articles).
 */
function sectionHasContent(section) {
  if (!section || !section.traite) return false;

  // Format contenu[] (ex: maladie, amenagement_temps_travail)
  const contenu = section.contenu || [];
  if (contenu.some(item => item.texte && item.texte.trim().length > 0)) return true;

  // Articles au niveau section
  if ((section.articles || []).length > 0) return true;

  // Format imbrique (ex: periode_essai.cdi, preavis.demission)
  // Verifier si une sous-cle contient du texte non vide
  for (const key of Object.keys(section)) {
    if (key === 'traite' || key === 'contenu' || key === 'articles' || key === 'specificites_regionales') continue;
    const sub = section[key];
    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
      if (sub.texte && sub.texte.trim().length > 0) return true;
      if ((sub.articles || []).length > 0) return true;
    }
  }

  return false;
}

/**
 * Filtre les sections d'un groupe pour ne garder que celles avec du contenu.
 */
function getVisibleSections(group, data) {
  return group.children.filter(k => data[k] && data[k].traite && sectionHasContent(data[k]));
}

// ===== SIDEBAR INFO =====
function renderSidebarInfo(nom, idcc) {
  const el = document.getElementById('sidebar-info');
  if (!el) return;
  el.innerHTML = `
    <div class="sidebar-ccn-name">${escapeHtml(nom)}</div>
    ${idcc ? `<span class="sidebar-idcc">IDCC ${escapeHtml(idcc)}</span>` : ''}
  `;
}

// ===== SIDEBAR NAVIGATION =====
function buildSidebar(data) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  let html = '';
  let groupIdx = 0;

  for (const group of MENU) {
    const groupSections = getVisibleSections(group, data);
    if (groupSections.length === 0) continue;

    groupIdx++;
    const groupId = `grp-${groupIdx}`;

    html += `<div class="nav-group" data-group="${groupId}">`;
    html += `<div class="nav-group-header" onclick="toggleGroup(this)">`;
    html += `<span class="num">${groupIdx}</span>`;
    html += `<span class="label">${escapeHtml(group.label)}</span>`;
    html += `<span class="chevron">\u25bc</span>`;
    html += `</div>`;
    html += `<div class="nav-children">`;

    let subIdx = 0;
    for (const key of groupSections) {
      subIdx++;
      const label = LABELS[key] || key;
      const secNum = `${groupIdx}.${subIdx}`;
      const secId = `sec-${key}`;

      html += `<div class="nav-item" data-section="${secId}" onclick="scrollToSection('${secId}')">`;
      html += `<span class="dot"></span>`;
      html += `<span class="nav-num">${secNum}</span>`;
      html += `<span class="nav-label">${escapeHtml(label)}</span>`;
      html += `</div>`;
    }

    html += `</div></div>`;
  }

  nav.innerHTML = html;
}

function toggleGroup(header) {
  const group = header.parentElement;
  const wasOpen = group.classList.contains('open');
  group.classList.toggle('open');

  // Scroller vers le groupe dans le contenu principal
  const groupId = group.getAttribute('data-group');
  if (groupId) {
    const target = document.getElementById(groupId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function scrollToSection(secId) {
  const el = document.getElementById(secId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Fermer le menu mobile
    closeMobileToc();
  }
}

// ===== RENDU DES SECTIONS =====
function renderSections(data) {
  const container = document.getElementById('sections-container');
  if (!container) return;

  let html = '';
  let groupIdx = 0;

  for (const group of MENU) {
    const groupSections = getVisibleSections(group, data);
    if (groupSections.length === 0) continue;

    groupIdx++;
    const groupId = `grp-${groupIdx}`;

    html += `<div class="section-group" id="${groupId}">`;
    html += `<div class="group-title">`;
    html += `<span class="group-num">${groupIdx}</span>`;
    html += escapeHtml(group.label);
    html += `</div>`;

    let subIdx = 0;
    for (const key of groupSections) {
      subIdx++;
      const section = data[key];
      const label = LABELS[key] || key;
      const secNum = `${groupIdx}.${subIdx}`;
      const secId = `sec-${key}`;

      html += `<div class="section-block" id="${secId}">`;
      html += `<div class="section-title">`;
      html += `<span class="sec-num">${secNum}</span>`;
      html += escapeHtml(label);
      // Bouton Comparer avec le Code du travail
      if (typeof renderCompareButton === 'function') {
        html += renderCompareButton(key);
      }
      html += `</div>`;

      // Contenu (filtrer les items sans texte)
      const contenu = (section.contenu || []).filter(item => item.texte && item.texte.trim().length > 0);
      for (const item of contenu) {
        html += `<div class="content-card">`;
        if (item.theme) {
          html += `<div class="content-theme">${escapeHtml(item.theme)}</div>`;
        }
        html += `<div class="content-body">${parseMarkdown(item.texte)}</div>`;
        html += `</div>`;
      }

      // Format imbrique (10 conventions) : sous-cles avec texte/articles
      if (contenu.length === 0) {
        for (const subKey of Object.keys(section)) {
          if (subKey === 'traite' || subKey === 'contenu' || subKey === 'articles' || subKey === 'specificites_regionales') continue;
          const sub = section[subKey];
          if (sub && typeof sub === 'object' && !Array.isArray(sub) && sub.texte && sub.texte.trim().length > 0) {
            const subLabel = subKey.replace(/_/g, ' ');
            html += `<div class="content-card">`;
            html += `<div class="content-theme">${escapeHtml(subLabel)}</div>`;
            html += `<div class="content-body">${parseMarkdown(sub.texte)}</div>`;
            html += `</div>`;
          }
        }
      }

      // Articles
      const articles = section.articles || [];
      if (articles.length > 0) {
        html += `<div class="articles-block">`;
        html += `<div class="articles-title" onclick="toggleArticles(this)">`;
        html += `Articles de r\u00e9f\u00e9rence (${articles.length})`;
        html += `<span class="chevron">\u25bc</span>`;
        html += `</div>`;
        html += `<div class="articles-list">`;
        for (const art of articles) {
          html += `<div class="article-item">${escapeHtml(art)}</div>`;
        }
        html += `</div></div>`;
      }

      // Panneau de comparaison avec le Code du travail (cache par defaut)
      if (typeof renderComparePanel === 'function') {
        html += renderComparePanel(key, section);
      }

      html += `</div>`; // section-block
    }

    html += `</div>`; // section-group
  }

  container.innerHTML = html;
}

function toggleArticles(titleEl) {
  const block = titleEl.parentElement;
  const list = block.querySelector('.articles-list');
  const chevron = titleEl.querySelector('.chevron');

  if (list.style.display === 'none') {
    list.style.display = 'block';
    chevron.classList.add('open');
  } else {
    list.style.display = 'none';
    chevron.classList.remove('open');
  }
}

// ===== PAGE DE GARDE PRINT =====
function renderPrintCover(nom, idcc) {
  const container = document.getElementById('print-cover');
  if (!container) return;

  const date = new Date().toLocaleDateString('fr-FR');
  container.innerHTML = `
    <div style="width:80px;height:4px;background:linear-gradient(90deg,#42D80F,#2a8c06);border-radius:2px;margin-bottom:40px;"></div>
    <div style="display:inline-block;padding:6px 22px;border-radius:20px;background:#f0fde8;color:#2a8c06;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:30px;">Convention Collective Nationale</div>
    <div style="font-size:28px;font-weight:700;color:#1e2028;margin-bottom:12px;max-width:480px;line-height:1.25;">${escapeHtml(nom)}</div>
    ${idcc ? `<div style="font-size:18px;font-weight:500;color:#42D80F;margin-bottom:50px;">IDCC ${escapeHtml(idcc)}</div>` : ''}
    <div style="width:50px;height:3px;background:#42D80F;border-radius:2px;margin-bottom:35px;"></div>
    <div style="font-size:12px;color:#7a7e8a;margin-bottom:8px;">Synth\u00e8se g\u00e9n\u00e9r\u00e9e le ${date}</div>
    <div style="margin-top:60px;font-size:12px;font-weight:700;color:#42D80F;letter-spacing:0.12em;">SMART DATA PAY</div>
  `;
}

// ===== TABLE DES MATIERES PRINT =====
function renderPrintToc(data) {
  const container = document.getElementById('print-toc');
  if (!container) return;

  let html = '<div class="print-toc-title">Table des mati\u00e8res</div>';
  html += '<div class="print-toc-list">';

  let groupIdx = 0;
  for (const group of MENU) {
    const groupSections = getVisibleSections(group, data);
    if (groupSections.length === 0) continue;

    groupIdx++;
    html += `<div class="print-toc-group">`;
    html += `<a href="#grp-${groupIdx}" class="print-toc-group-link">`;
    html += `<span class="print-toc-num">${groupIdx}</span>`;
    html += `<span class="print-toc-label">${escapeHtml(group.label)}</span>`;
    html += `</a>`;

    let subIdx = 0;
    for (const key of groupSections) {
      subIdx++;
      const label = LABELS[key] || key;
      const secNum = `${groupIdx}.${subIdx}`;
      const secId = `sec-${key}`;
      html += `<a href="#${secId}" class="print-toc-item">`;
      html += `<span class="print-toc-sub-num">${secNum}</span>`;
      html += `<span class="print-toc-sub-label">${escapeHtml(label)}</span>`;
      html += `</a>`;
    }

    html += `</div>`;
  }

  html += '</div>';
  container.innerHTML = html;
}

// ===== SCROLL SPY =====
function setupScrollSpy() {
  const sections = document.querySelectorAll('.section-block');
  if (sections.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        setActiveNavItem(entry.target.id);
      }
    }
  }, {
    rootMargin: '-80px 0px -70% 0px',
    threshold: 0
  });

  sections.forEach(sec => observer.observe(sec));
}

function setActiveNavItem(secId) {
  if (activeSection === secId) return;
  activeSection = secId;

  // Retirer l'ancien actif
  document.querySelectorAll('.nav-item.active').forEach(el => el.classList.remove('active'));

  // Activer le nouveau
  const item = document.querySelector(`.nav-item[data-section="${secId}"]`);
  if (item) {
    item.classList.add('active');
    // S'assurer que le groupe parent est ouvert
    const group = item.closest('.nav-group');
    if (group && !group.classList.contains('open')) {
      group.classList.add('open');
    }
    // Scroll le sidebar pour montrer l'item
    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// ===== RECHERCHE SIDEBAR =====
function setupSidebarSearch() {
  const input = document.getElementById('section-search');
  if (!input) return;

  input.addEventListener('input', function() {
    const q = stripDiacritics(this.value.toLowerCase().trim());
    const items = document.querySelectorAll('.nav-item');
    const groups = document.querySelectorAll('.nav-group');

    if (!q) {
      items.forEach(el => el.style.display = '');
      groups.forEach(g => g.style.display = '');
      return;
    }

    groups.forEach(group => {
      let hasVisible = false;
      const groupItems = group.querySelectorAll('.nav-item');
      groupItems.forEach(item => {
        const label = stripDiacritics(item.textContent.toLowerCase());
        if (label.includes(q)) {
          item.style.display = '';
          hasVisible = true;
        } else {
          item.style.display = 'none';
        }
      });
      group.style.display = hasVisible ? '' : 'none';
      if (hasVisible) group.classList.add('open');
    });
  });
}

// ===== MOBILE TOC =====
function setupMobileToc() {
  const toggle = document.getElementById('mobile-toc-toggle');
  const overlay = document.getElementById('toc-overlay');

  if (toggle) {
    toggle.addEventListener('click', function() {
      const sidebar = document.getElementById('sidebar');
      sidebar.classList.toggle('open');
      overlay.classList.toggle('visible');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeMobileToc);
  }
}

function closeMobileToc() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('toc-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('visible');
}

// ===== IMPRESSION =====
// Approche radicale : on extrait le contenu du flex container
// et on le place directement dans body pour l'impression.
// Cela contourne le bug Chrome qui tronque le contenu flex.

let _printWrapper = null;

function setupPrint() {
  const btn = document.getElementById('btn-print');
  if (btn) {
    btn.addEventListener('click', function() {
      preparePrint();
      window.print();
      setTimeout(restorePrint, 500);
    });
  }
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', restorePrint);
}

function preparePrint() {
  // Eviter double appel
  if (_printWrapper) return;

  const app = document.getElementById('app');
  const contentScroll = document.getElementById('content-scroll');
  if (!app || !contentScroll) return;

  // 1. Creer un wrapper temporaire directement dans body
  _printWrapper = document.createElement('div');
  _printWrapper.id = 'print-wrapper';
  _printWrapper.style.cssText = 'display:block;height:auto;overflow:visible;';

  // 2. Cloner tout le contenu imprimable (print-cover, print-toc, sections)
  const printCover = document.getElementById('print-cover');
  const printToc = document.getElementById('print-toc');
  const sectionsContainer = document.getElementById('sections-container');

  if (printCover) _printWrapper.appendChild(printCover.cloneNode(true));
  if (printToc) _printWrapper.appendChild(printToc.cloneNode(true));
  if (sectionsContainer) _printWrapper.appendChild(sectionsContainer.cloneNode(true));

  // 3. Cacher #app et afficher le wrapper
  app.style.display = 'none';
  document.body.appendChild(_printWrapper);
}

function restorePrint() {
  if (!_printWrapper) return;

  const app = document.getElementById('app');
  if (app) app.style.display = '';

  _printWrapper.remove();
  _printWrapper = null;
}

// ===== ERREUR =====
function showError(msg) {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.className = 'empty-state';
    loading.innerHTML = `<div class="icon">\u26a0\ufe0f</div><p>${msg}</p>`;
  }
}
