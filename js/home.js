/* =============================================================================
   HOME.JS — Page d'accueil : recherche et affichage des conventions
   ============================================================================= */

let allConventions = [];
let searchTimeout = null;

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const resp = await fetch('data/conventions_index.json');
    if (!resp.ok) throw new Error('Index non trouv\u00e9');
    allConventions = await resp.json();

    // Trier par IDCC numerique, puis par nom
    allConventions.sort((a, b) => {
      const na = parseInt(a.idcc) || 99999;
      const nb = parseInt(b.idcc) || 99999;
      if (na !== nb) return na - nb;
      return a.nom.localeCompare(b.nom, 'fr');
    });

    renderCards(allConventions);
    setupSearch();

    // Notifier le parent iframe
    if (typeof notifyParent === 'function') {
      notifyParent('homeLoaded', { count: allConventions.length });
    }
  } catch (err) {
    console.error('Erreur chargement index:', err);
    document.getElementById('cards-grid').innerHTML =
      '<div class="empty-state"><div class="icon">\u26a0\ufe0f</div><p>Impossible de charger les conventions.<br>V\u00e9rifiez que data/conventions_index.json existe.</p></div>';
  }
}

// ===== RENDU DES CARTES =====
function renderCards(conventions) {
  const grid = document.getElementById('cards-grid');
  const noResults = document.getElementById('no-results');

  if (conventions.length === 0) {
    grid.innerHTML = '';
    noResults.style.display = 'block';
    return;
  }

  noResults.style.display = 'none';

  grid.innerHTML = conventions.map(c => {
    const badgeHtml = c.idcc
      ? `<span class="card-badge"><span class="card-badge-idcc">IDCC : ${escapeHtml(c.idcc)}</span></span>`
      : '';

    const embedParam = (typeof EMBED_MODE !== 'undefined' && EMBED_MODE) ? '&embed' : '';
    return `
      <a href="convention.html?id=${encodeURIComponent(c.key)}${embedParam}" class="convention-card">
        ${badgeHtml}
        <span class="card-name">${escapeHtml(c.nom)}</span>
      </a>
    `;
  }).join('');

  // Mettre a jour le compteur dans la recherche
  const searchCount = document.getElementById('search-count');
  if (searchCount) {
    searchCount.textContent = conventions.length === allConventions.length
      ? ''
      : `${conventions.length} / ${allConventions.length}`;
  }
}

// ===== RECHERCHE =====
function setupSearch() {
  const input = document.getElementById('search');
  if (!input) return;

  input.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => onSearch(this.value), 150);
  });

  // Raccourci clavier / pour focus
  document.addEventListener('keydown', function(e) {
    if (e.key === '/' && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
    if (e.key === 'Escape' && document.activeElement === input) {
      input.value = '';
      onSearch('');
      input.blur();
    }
  });
}

function onSearch(query) {
  if (!query.trim()) {
    renderCards(allConventions);
    return;
  }

  const q = stripDiacritics(query.toLowerCase().trim());
  const terms = q.split(/\s+/);

  const filtered = allConventions.filter(c => {
    const searchStr = stripDiacritics(
      `${c.nom} ${c.idcc || ''} ${c.brochure || ''}`.toLowerCase()
    );
    return terms.every(term => searchStr.includes(term));
  });

  renderCards(filtered);
}
