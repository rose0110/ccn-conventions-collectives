/* =============================================================================
   COMPARATEUR.JS — Comparaison Convention Collective vs Code du travail
   Charge code_travail.json et affiche des panneaux de comparaison inline
   ============================================================================= */

let codeTravailData = null;
let compareStates = {};

// ===== CHARGEMENT DU REFERENCE LEGAL =====

async function loadCodeTravail() {
  try {
    const resp = await fetch('data/code_travail.json');
    if (!resp.ok) throw new Error('code_travail.json non trouve');
    codeTravailData = await resp.json();
    console.log('Comparateur: Code du travail charge');
  } catch (err) {
    console.warn('Comparateur: impossible de charger code_travail.json', err);
    codeTravailData = null;
  }
}

// ===== RENDU DU BOUTON COMPARER =====

function renderCompareButton(sectionKey) {
  if (!codeTravailData || !codeTravailData[sectionKey]) return '';
  const ref = codeTravailData[sectionKey];
  if (ref.comparable === false) return '';

  return `<button class="btn-compare" data-section="${sectionKey}"
            onclick="toggleComparePanel('${sectionKey}')"
            title="Comparer avec le Code du travail">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 3h5v5"></path><path d="M8 3H3v5"></path>
      <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"></path>
      <path d="m15 9 6-6"></path>
    </svg>
    ⚖️ Comparer au Code du travail
  </button>`;
}

// ===== RENDU DU PANNEAU DE COMPARAISON =====

function renderComparePanel(sectionKey, conventionSection) {
  if (!codeTravailData || !codeTravailData[sectionKey]) return '';
  const ref = codeTravailData[sectionKey];
  if (ref.comparable === false) return '';

  // --- Colonne gauche : Convention ---
  let conventionSummary = '';

  // Collecter les items : format contenu[] OU format imbrique (sous-cles)
  let items = [];
  const contenu = (conventionSection && conventionSection.contenu) || [];
  if (contenu.length > 0) {
    items = contenu.filter(function(item) { return item.texte && item.texte.trim().length > 0; });
  } else if (conventionSection) {
    // Format imbrique (ex: periode_essai.cdi, preavis.demission)
    for (const subKey of Object.keys(conventionSection)) {
      if (subKey === 'traite' || subKey === 'contenu' || subKey === 'articles' || subKey === 'specificites_regionales') continue;
      const sub = conventionSection[subKey];
      if (sub && typeof sub === 'object' && !Array.isArray(sub) && sub.texte && sub.texte.trim().length > 0) {
        items.push({ theme: subKey.replace(/_/g, ' '), texte: sub.texte });
      }
    }
  }

  for (const item of items) {
    if (item.theme) {
      conventionSummary += `<div class="compare-theme">${escapeHtml(item.theme)}</div>`;
    }
    if (item.texte) {
      // Tronquer le texte long pour la comparaison
      let texte = item.texte;
      if (texte.length > 1500) {
        let texteBrut = texte.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (texteBrut.length > 1500) {
          texteBrut = texteBrut.substring(0, 1500) + '...';
        }
        conventionSummary += `<div class="compare-text"><p>${escapeHtml(texteBrut)}</p></div>`;
      } else {
        conventionSummary += `<div class="compare-text">${parseMarkdown(texte)}</div>`;
      }
    }
  }
  if (!conventionSummary) {
    conventionSummary = '<div class="compare-empty">Aucune disposition conventionnelle sp\u00e9cifique</div>';
  }

  // --- Colonne droite : Code du travail ---
  let legalContent = `<div class="compare-text"><p>${escapeHtml(ref.resume)}</p></div>`;

  if (ref.details && ref.details.length > 0) {
    legalContent += '<table class="compare-table">';
    legalContent += '<thead><tr><th>Crit\u00e8re</th><th>Disposition l\u00e9gale</th><th>R\u00e9f.</th></tr></thead>';
    legalContent += '<tbody>';
    for (const d of ref.details) {
      legalContent += `<tr>
        <td>${escapeHtml(d.critere)}</td>
        <td><strong>${escapeHtml(d.valeur)}</strong></td>
        <td class="compare-ref">${escapeHtml(d.reference)}</td>
      </tr>`;
    }
    legalContent += '</tbody></table>';
  }

  // --- Bouton IA si calcul necessaire ---
  const calcButton = ref.needs_calculation
    ? `<button class="btn-calc" data-section="${sectionKey}"
         onclick="requestGeminiComparison('${sectionKey}')">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"></path>
           <path d="M12 6v6l4 2"></path>
         </svg>
         Analyser avec l'IA
       </button>`
    : '';

  const verdictId = `verdict-${sectionKey}`;

  return `
    <div class="compare-panel compare-panel--hidden" id="compare-${sectionKey}" data-section="${sectionKey}">
      <div class="compare-header">
        <div class="compare-header-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v18"></path>
            <path d="M3 12h18"></path>
            <rect x="3" y="3" width="7" height="7" rx="1"></rect>
            <rect x="14" y="14" width="7" height="7" rx="1"></rect>
          </svg>
          Comparaison avec le Code du travail
        </div>
        <div class="compare-verdict" id="${verdictId}"></div>
        ${calcButton}
        <button class="btn-compare-close" onclick="toggleComparePanel('${sectionKey}')" title="Fermer">&times;</button>
      </div>
      <div class="compare-columns">
        <div class="compare-col compare-col--convention">
          <div class="compare-col-title">Convention collective</div>
          <div class="compare-col-body">${conventionSummary}</div>
        </div>
        <div class="compare-col compare-col--legal">
          <div class="compare-col-title">Code du travail (d\u00e9faut l\u00e9gal)</div>
          <div class="compare-col-body">${legalContent}</div>
        </div>
      </div>
    </div>`;
}

// ===== TOGGLE VISIBILITE =====

function toggleComparePanel(sectionKey) {
  const panel = document.getElementById(`compare-${sectionKey}`);
  const btn = document.querySelector(`.btn-compare[data-section="${sectionKey}"]`);
  if (!panel) return;

  // Trouver le bloc section parent pour masquer/afficher le contenu classique
  const sectionBlock = panel.closest('.section-block');

  const isHidden = panel.classList.contains('compare-panel--hidden');
  if (isHidden) {
    // Ouvrir le panneau de comparaison
    panel.classList.remove('compare-panel--hidden');
    if (btn) {
      btn.classList.add('btn-compare--active');
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg> Masquer la comparaison`;
    }
    // Masquer le contenu classique (content-card + articles-block)
    if (sectionBlock) {
      sectionBlock.querySelectorAll('.content-card, .articles-block').forEach(el => {
        el.style.display = 'none';
      });
    }
    compareStates[sectionKey] = true;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    // Fermer le panneau de comparaison
    panel.classList.add('compare-panel--hidden');
    if (btn) {
      btn.classList.remove('btn-compare--active');
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M16 3h5v5"></path><path d="M8 3H3v5"></path><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"></path><path d="m15 9 6-6"></path></svg> ⚖️ Comparer au Code du travail`;
    }
    // Réafficher le contenu classique
    if (sectionBlock) {
      sectionBlock.querySelectorAll('.content-card, .articles-block').forEach(el => {
        el.style.display = '';
      });
    }
    compareStates[sectionKey] = false;
  }
}

// ===== ANALYSE IA (GEMINI) =====

async function requestGeminiComparison(sectionKey) {
  const verdictEl = document.getElementById(`verdict-${sectionKey}`);
  const calcBtn = document.querySelector(`.btn-calc[data-section="${sectionKey}"]`);
  if (!verdictEl || !codeTravailData || !conventionData) return;

  // Verifier que la cle API est configuree (demander si absente)
  if (!GEMINI_API_KEY || !GEMINI_URL) {
    if (typeof ensureApiKey === 'function') {
      var hasKey = await ensureApiKey();
      if (!hasKey) return;
    } else {
      verdictEl.innerHTML = '<span class="verdict-badge verdict--error">Cle API non configuree</span>';
      return;
    }
  }

  // Desactiver bouton + loading
  if (calcBtn) {
    calcBtn.disabled = true;
    calcBtn.innerHTML = '<span class="compare-spinner"></span> Analyse en cours...';
  }
  verdictEl.innerHTML = '<span class="verdict-badge verdict--unknown">Analyse en cours...</span>';

  const section = conventionData[sectionKey];
  const ref = codeTravailData[sectionKey];
  const label = LABELS[sectionKey] || sectionKey;

  // Texte de la convention (format contenu[] OU format imbrique)
  let conventionText = '';
  if (section) {
    let srcItems = [];
    if (section.contenu && section.contenu.length > 0) {
      srcItems = section.contenu;
    } else {
      for (const subKey of Object.keys(section)) {
        if (subKey === 'traite' || subKey === 'contenu' || subKey === 'articles' || subKey === 'specificites_regionales') continue;
        const sub = section[subKey];
        if (sub && typeof sub === 'object' && !Array.isArray(sub) && sub.texte && sub.texte.trim().length > 0) {
          srcItems.push({ theme: subKey.replace(/_/g, ' '), texte: sub.texte });
        }
      }
    }
    for (const item of srcItems) {
      if (item.theme) conventionText += `[${item.theme}] `;
      if (item.texte) {
        let texte = item.texte.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        if (texte.length > 3000) texte = texte.substring(0, 3000) + '...';
        conventionText += texte + '\n';
      }
    }
  }

  const prompt = `Tu es un expert en droit du travail francais. Compare la disposition conventionnelle suivante avec le droit legal (Code du travail).

## Section : ${label}

### Convention collective :
${conventionText || 'Absence de disposition conventionnelle specifique.'}

### Code du travail (defaut legal) :
${ref.resume}
${ref.details ? ref.details.map(d => `- ${d.critere} : ${d.valeur} (${d.reference})`).join('\n') : ''}

## Consigne :
1. Determine si la convention est PLUS FAVORABLE, IDENTIQUE, ou MOINS FAVORABLE que le minimum legal pour le salarie.
2. Prends en compte les montants, durees, conditions et exceptions.
3. Si la convention est plus favorable sur certains points et moins sur d'autres, donne un verdict global et explique les nuances.
4. Reponds avec un JSON strict :
{
  "verdict": "plus_favorable" | "identique" | "moins_favorable",
  "explication": "Explication courte (2-4 phrases max)"
}

IMPORTANT : Ne reponds QUE avec le JSON, sans aucun texte avant ou apres, sans bloc markdown.`;

  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 256 }
      }
    };

    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) throw new Error(`Erreur API ${resp.status}`);
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parser le JSON de la reponse
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      displayVerdict(sectionKey, result.verdict, result.explication);
    } else {
      throw new Error('Reponse JSON invalide');
    }
  } catch (err) {
    console.error('Comparaison IA erreur:', err);
    verdictEl.innerHTML = '<span class="verdict-badge verdict--error">Erreur d\'analyse</span>';
  }

  // Reactiver bouton
  if (calcBtn) {
    calcBtn.disabled = false;
    calcBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
           <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"></path>
           <path d="M12 6v6l4 2"></path>
         </svg>
         R\u00e9analyser`;
  }
}

// ===== AFFICHAGE DU VERDICT =====

function displayVerdict(sectionKey, verdict, explication) {
  const verdictEl = document.getElementById(`verdict-${sectionKey}`);
  if (!verdictEl) return;

  const VERDICTS = {
    'plus_favorable':  { label: 'Plus favorable',  css: 'verdict--plus' },
    'identique':       { label: 'Identique',       css: 'verdict--identique' },
    'moins_favorable': { label: 'Moins favorable',  css: 'verdict--moins' },
  };

  const v = VERDICTS[verdict] || { label: 'Non d\u00e9termin\u00e9', css: 'verdict--unknown' };

  verdictEl.innerHTML = `
    <span class="verdict-badge ${v.css}">${v.label}</span>
    ${explication ? `<span class="verdict-detail">${escapeHtml(explication)}</span>` : ''}
  `;
}
