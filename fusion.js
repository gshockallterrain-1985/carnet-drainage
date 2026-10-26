/* Fusion de deux carnets (synchronisation entre appareils).
   Règles :
   - chaque élément (fiche, questionnaire, séance, facture) est identifié par son id ;
   - si un élément existe des deux côtés, la version modifiée le plus récemment l'emporte ;
   - une suppression l'emporte toujours (elle est mémorisée pour que l'élément ne revienne pas) ;
   - le résultat est identique quel que soit l'appareil qui fait le calcul ;
   - deux factures portant le même numéro : celle qui n'a pas encore été transmise est renumérotée. */
(function (racine) {
  'use strict';
  const COLLECTIONS = ['clients', 'questionnaires', 'seances', 'factures'];
  // Réglages propres à chaque appareil, jamais échangés
  const REGLAGES_LOCAUX = ['derniereSauvegarde', 'derniereModif', 'derniereSynchro', 'synchroAvec'];

  // JSON canonique : clés triées, valeurs absentes ignorées (comme après un aller-retour JSON)
  function canon(x) {
    if (Array.isArray(x)) return '[' + x.map(v => v === undefined || typeof v === 'function' ? 'null' : canon(v)).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).filter(k => x[k] !== undefined && typeof x[k] !== 'function').sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
    const s = JSON.stringify(x);
    return s === undefined ? 'null' : s;
  }
  const copie = x => JSON.parse(JSON.stringify(x));

  // Partie du carnet échangée entre appareils
  function partage(etat) {
    const e = etat || {};
    const r = Object.assign({}, e.reglages || {});
    REGLAGES_LOCAUX.forEach(k => delete r[k]);
    const out = { reglages: r, supprimes: {} };
    for (const k of COLLECTIONS) {
      out[k] = Array.isArray(e[k]) ? e[k].filter(x => x && typeof x === 'object' && x.id) : [];
      const s = e.supprimes && e.supprimes[k];
      out.supprimes[k] = s && typeof s === 'object' ? Object.assign({}, s) : {};
    }
    return copie(out);
  }

  const tampon = r => String((r && (r.majLe || r.creeLe)) || '');
  function choisir(a, b) {
    if (!a) return b;
    if (!b) return a;
    const ta = tampon(a), tb = tampon(b);
    if (ta !== tb) return ta > tb ? a : b;
    return canon(a) >= canon(b) ? a : b;
  }

  function fusionner(local, distant) {
    const L = partage(local), D = partage(distant);
    const res = { supprimes: {} };
    // recus : arrivé de l'autre appareil ; envoyes : parti vers l'autre ;
    // retires : supprimé ici parce que supprimé là-bas ; effaces : supprimé là-bas parce que supprimé ici
    const bilan = { recus: {}, envoyes: {}, retires: {}, effaces: {}, renumerotees: [], doublons: [] };
    for (const k of COLLECTIONS) {
      const tl = L.supprimes[k], td = D.supprimes[k];
      const t = Object.assign({}, tl);
      for (const id of Object.keys(td)) if (!t[id] || String(td[id]) > String(t[id])) t[id] = td[id];
      res.supprimes[k] = t;
      const ml = new Map(L[k].map(r => [r.id, r])), md = new Map(D[k].map(r => [r.id, r]));
      const ids = Array.from(new Set([...ml.keys(), ...md.keys()])).sort();
      const liste = [];
      let recus = 0, envoyes = 0, retires = 0, effaces = 0;
      for (const id of ids) {
        const a = ml.get(id), b = md.get(id);
        if (t[id]) { if (a && !tl[id]) retires++; if (b && !td[id]) effaces++; continue; }
        const g = choisir(a, b);
        if (!a || !b || canon(a) !== canon(b)) { if (g === b) recus++; else envoyes++; }
        liste.push(copie(g));
      }
      res[k] = liste;
      if (recus) bilan.recus[k] = recus;
      if (envoyes) bilan.envoyes[k] = envoyes;
      if (retires) bilan.retires[k] = retires;
      if (effaces) bilan.effaces[k] = effaces;
    }
    const rl = L.reglages, rd = D.reglages;
    const vide = r => !r || !Object.keys(r).length;
    const rg = vide(rd) ? rl : vide(rl) ? rd : choisir(rl, rd);
    if (canon(rg) !== canon(rl)) bilan.recus.reglages = 1;
    else if (!vide(rd) && canon(rd) !== canon(rg)) bilan.envoyes.reglages = 1;
    res.reglages = copie(rg || {});
    dedoublonner(res.factures, bilan);
    return { resultat: res, bilan };
  }

  const transmise = f => !!((f.envois && f.envois.length) || f.pdfLe);
  const numero = (annee, rang) => `${annee}-${String(rang).padStart(3, '0')}`;
  function groupesDoublons(factures) {
    const g = new Map();
    for (const f of factures) { const c = `${f.annee}|${f.rang}`; if (!g.has(c)) g.set(c, []); g.get(c).push(f); }
    return Array.from(g.values()).filter(x => x.length > 1);
  }
  function dedoublonner(factures, bilan) {
    const max = {};
    const prochainRang = an => { if (max[an] == null) max[an] = Math.max(0, ...factures.filter(x => x.annee === an).map(x => Number(x.rang) || 0)); return ++max[an]; };
    for (const g of groupesDoublons(factures)) {
      g.sort((a, b) => (transmise(b) - transmise(a)) || String(a.creeLe || '').localeCompare(String(b.creeLe || '')) || String(a.id).localeCompare(String(b.id)));
      for (const f of g.slice(1)) {
        const nom = f.client && f.client.nom || '';
        if (transmise(f)) { bilan.doublons.push({ numero: f.numero, client: nom }); continue; }
        const ancien = f.numero, rang = prochainRang(f.annee);
        f.rang = rang; f.numero = numero(f.annee, rang); f.renumeroteDe = ancien;
        bilan.renumerotees.push({ ancien, nouveau: f.numero, client: nom });
      }
    }
  }
  // Doublons restants (factures déjà transmises des deux côtés), pour l'affichage
  function doublons(factures) { return groupesDoublons(factures || []); }

  const Fusion = { COLLECTIONS, REGLAGES_LOCAUX, canon, partage, fusionner, doublons, transmise };
  if (typeof module !== 'undefined' && module.exports) module.exports = Fusion; else racine.Fusion = Fusion;
})(typeof self !== 'undefined' ? self : this);
