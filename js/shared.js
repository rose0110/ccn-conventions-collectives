/* =============================================================================
   SHARED.JS — Constantes, parseur markdown et utilitaires
   Smart Data Pay — Conventions Collectives
   ============================================================================= */

// ===== LABELS (33 sections) =====
const LABELS = {
  informations_generales: "Informations g\u00e9n\u00e9rales",
  periode_essai: "P\u00e9riode d'essai",
  delai_prevenance: "D\u00e9lai de pr\u00e9venance",
  preavis: "Pr\u00e9avis",
  indemnite_licenciement: "Indemnit\u00e9 de licenciement",
  indemnite_depart_retraite: "D\u00e9part volontaire \u00e0 la retraite",
  indemnite_mise_retraite: "Mise \u00e0 la retraite",
  indemnite_precarite: "Indemnit\u00e9 de pr\u00e9carit\u00e9",
  indemnite_rupture_conventionnelle: "Rupture conventionnelle",
  conges_payes: "Cong\u00e9s pay\u00e9s",
  evenements_familiaux: "\u00c9v\u00e9nements familiaux",
  durees_travail: "Dur\u00e9e du travail",
  heures_supplementaires: "Heures suppl\u00e9mentaires",
  majoration_nuit: "Majoration de nuit",
  majoration_dimanche: "Majoration du dimanche",
  majoration_ferie: "Jours f\u00e9ri\u00e9s",
  forfait_jours: "Forfait jours",
  temps_partiel: "Temps partiel",
  amenagement_temps_travail: "Am\u00e9nagement du temps de travail",
  cet: "Compte \u00c9pargne Temps",
  maladie: "Maladie",
  accident_travail: "Accident du travail",
  maternite_paternite: "Maternit\u00e9 / Paternit\u00e9",
  cotisation_mutuelle: "Mutuelle",
  cotisation_prevoyance: "Pr\u00e9voyance",
  cotisation_retraite: "Retraite compl\u00e9mentaire",
  paritarisme_financement: "Paritarisme et financement",
  apprenti: "Apprentissage",
  contrat_professionnalisation: "Contrat de professionnalisation",
  stagiaire: "Stagiaire",
  classification: "Classification",
  grille_remuneration: "Grille de r\u00e9mun\u00e9ration",
  primes_indemnites_avantages: "Primes, indemnit\u00e9s et avantages",
};

// ===== MENU (11 groupes) =====
const MENU = [
  { label: "Informations g\u00e9n\u00e9rales", children: ["informations_generales"] },
  { label: "Embauche et rupture", children: ["periode_essai", "delai_prevenance", "preavis"] },
  { label: "Indemnit\u00e9s de rupture", children: [
    "indemnite_licenciement", "indemnite_depart_retraite",
    "indemnite_mise_retraite", "indemnite_precarite", "indemnite_rupture_conventionnelle"
  ]},
  { label: "Cong\u00e9s", children: ["conges_payes", "evenements_familiaux"] },
  { label: "Temps de travail", children: [
    "durees_travail", "heures_supplementaires", "majoration_nuit",
    "majoration_dimanche", "majoration_ferie", "forfait_jours"
  ]},
  { label: "Am\u00e9nagement du temps", children: ["temps_partiel", "amenagement_temps_travail", "cet"] },
  { label: "Maintien de salaire", children: ["maladie", "accident_travail", "maternite_paternite"] },
  { label: "Protection sociale", children: ["cotisation_mutuelle", "cotisation_prevoyance", "cotisation_retraite"] },
  { label: "Paritarisme", children: ["paritarisme_financement"] },
  { label: "Alternance et stages", children: ["apprenti", "contrat_professionnalisation", "stagiaire"] },
  { label: "Classification et r\u00e9mun\u00e9ration", children: ["classification", "grille_remuneration", "primes_indemnites_avantages"] },
];


// ===== IFRAME INTEGRATION =====

const IS_IFRAME = window.self !== window.top;
const EMBED_MODE = new URLSearchParams(window.location.search).has('embed');

/**
 * Notifie le parent iframe d'un changement de page/convention.
 * Le parent peut ecouter : window.addEventListener('message', handler)
 */
function notifyParent(type, data) {
  if (IS_IFRAME && window.parent) {
    window.parent.postMessage({
      source: 'ccn-app',
      type: type,
      ...data,
    }, '*');
  }
}

// Ecouter les messages du parent (navigation externe)
if (IS_IFRAME) {
  window.addEventListener('message', function(event) {
    if (event.data && event.data.target === 'ccn-app') {
      if (event.data.action === 'navigate' && event.data.id) {
        window.location.href = `convention.html?id=${encodeURIComponent(event.data.id)}${EMBED_MODE ? '&embed' : ''}`;
      }
      if (event.data.action === 'goHome') {
        window.location.href = `index.html${EMBED_MODE ? '?embed' : ''}`;
      }
    }
  });
}

// Mode embed : cacher certains elements
if (EMBED_MODE) {
  document.documentElement.classList.add('embed-mode');
}

// ===== AUTO RESIZE IFRAME =====
// Envoie la hauteur reelle du document au parent pour ajuster l'iframe.
// Format : { kind: 'resize-height', height: number }

(function initIframeResize() {
  if (!IS_IFRAME) return;

  let lastHeight = 0;

  function sendHeight() {
    const h = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    );
    if (h !== lastHeight && h > 0) {
      lastHeight = h;
      window.parent.postMessage({ kind: 'resize-height', height: h }, '*');
    }
  }

  // Envois multiples au chargement pour capturer les mises en page tardives
  [0, 50, 150, 300, 500, 1000].forEach(function(delay) {
    setTimeout(sendHeight, delay);
  });

  // Polling toutes les 200ms pendant les 2 premieres secondes (contenus dynamiques)
  let pollCount = 0;
  const pollInterval = setInterval(function() {
    sendHeight();
    pollCount++;
    if (pollCount >= 10) clearInterval(pollInterval); // 10 x 200ms = 2s
  }, 200);

  // ResizeObserver pour detecter les changements en continu
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(function() {
      sendHeight();
    });
    ro.observe(document.documentElement);
  } else if (typeof MutationObserver !== 'undefined') {
    // Fallback MutationObserver
    const mo = new MutationObserver(function() {
      sendHeight();
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  // Ecouter aussi les evenements de redimensionnement et chargement complet
  window.addEventListener('resize', sendHeight);
  window.addEventListener('load', function() {
    [0, 100, 300, 600].forEach(function(delay) {
      setTimeout(sendHeight, delay);
    });
  });
})();


// ===== UTILITAIRES =====

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}


// ===== PARSEUR MARKDOWN =====

function parseMarkdownTables(text) {
  const tableRegex = /((?:\|[^\n]+\|\n?)+)/gm;

  return text.replace(tableRegex, function(match) {
    const block = match.trim();
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length < 2) return match;

    // Verifier la ligne separateur
    const sepLine = lines[1].trim();
    if (!/^\|[\s:]*-+/.test(sepLine)) return match;

    function parseCells(line) {
      return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    }

    const headers = parseCells(lines[0]);
    let html = '<table><thead><tr>';
    headers.forEach(h => {
      h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      html += '<th>' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    for (let i = 2; i < lines.length; i++) {
      const cells = parseCells(lines[i]);
      html += '<tr>';
      cells.forEach(c => {
        c = c.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html += '<td>' + c + '</td>';
      });
      html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
  });
}

function parseMarkdown(text) {
  if (!text) return '';

  text = text.replace(/\r\n/g, '\n');

  // Si le texte contient deja du HTML table, ne pas le re-parser
  if (!/<table[\s>]/.test(text)) {
    text = parseMarkdownTables(text);
  }

  // Gras
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Notes de bas de page (* explication)
  text = text.replace(/^\* (.+)$/gm, function(match, p1) {
    return '<div class="footnote">' + escapeHtml(p1) + '</div>';
  });

  // Listes
  text = text.replace(/^- (.+)$/gm, '<li>$1</li>');
  text = text.replace(/((?:<li>.*?<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Paragraphes
  const lines = text.split('\n');
  let result = '';
  let inBlock = false;

  for (const line of lines) {
    if (line.startsWith('<table') || line.startsWith('<ul') || line.startsWith('<div class="footnote')) {
      result += line + '\n';
      inBlock = true;
    } else if (line.startsWith('</table>') || line.startsWith('</ul>')) {
      result += line + '\n';
      inBlock = false;
    } else if (line.trim() === '') {
      if (!inBlock) {
        result += '</p><p>';
      }
    } else {
      if (inBlock) {
        result += line + '\n';
      } else {
        result += line + '<br>';
      }
    }
  }

  result = '<p>' + result + '</p>';

  // Nettoyer les paragraphes vides et imbrications incorrectes
  result = result.replace(/<p>\s*<\/p>/g, '');
  result = result.replace(/<p>\s*(<table)/g, '$1');
  result = result.replace(/(<\/table>)\s*<\/p>/g, '$1');
  result = result.replace(/<p>\s*(<ul)/g, '$1');
  result = result.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  result = result.replace(/<p>\s*(<div class="footnote)/g, '$1');
  result = result.replace(/(<\/div>)\s*<\/p>/g, '$1');

  return result;
}
