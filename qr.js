/* Générateur de QR code autonome (mode octets, correction M ou L, versions 1 à 20).
   Écrit pour le Carnet de drainage : aucune dépendance, fonctionne hors connexion. */
(function (racine) {
  'use strict';

  // Blocs de correction : [codes de correction par bloc, nb blocs groupe 1, octets groupe 1, nb blocs groupe 2, octets groupe 2]
  const BLOCS = {
    M: [null,
      [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
      [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
      [30, 1, 50, 4, 51], [22, 6, 36, 2, 37], [22, 8, 37, 1, 38], [24, 4, 40, 5, 41], [24, 5, 41, 5, 42],
      [28, 7, 45, 3, 46], [28, 10, 46, 1, 47], [26, 9, 43, 4, 44], [26, 3, 44, 11, 45], [26, 3, 41, 13, 42]],
    L: [null,
      [7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0], [26, 1, 108, 0, 0],
      [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0], [30, 2, 116, 0, 0], [18, 2, 68, 2, 69],
      [20, 4, 81, 0, 0], [24, 2, 92, 2, 93], [26, 4, 107, 0, 0], [30, 3, 115, 1, 116], [22, 5, 87, 1, 88],
      [24, 5, 98, 1, 99], [28, 1, 107, 5, 108], [30, 5, 120, 1, 121], [28, 3, 113, 4, 114], [28, 3, 107, 5, 108]]
  };
  const BITS_FORMAT = { L: 1, M: 0 };
  const ALIGNEMENT = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
    [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90]];

  function mulGF(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 0xFF;
  }
  function diviseurRS(degre) {
    const r = new Array(degre).fill(0); r[degre - 1] = 1;
    let racineGF = 1;
    for (let i = 0; i < degre; i++) {
      for (let j = 0; j < r.length; j++) { r[j] = mulGF(r[j], racineGF); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      racineGF = mulGF(racineGF, 0x02);
    }
    return r;
  }
  function resteRS(donnees, diviseur) {
    const r = new Array(diviseur.length).fill(0);
    for (const b of donnees) {
      const f = b ^ r.shift(); r.push(0);
      for (let i = 0; i < diviseur.length; i++) r[i] ^= mulGF(diviseur[i], f);
    }
    return r;
  }
  function utf8(texte) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(texte));
    return Array.from(unescape(encodeURIComponent(texte)), c => c.charCodeAt(0));
  }
  const capaciteDonnees = (v, n) => { const b = BLOCS[n][v]; return b[1] * b[2] + b[3] * b[4]; };

  function creer(texte, niveau) {
    niveau = niveau === 'L' ? 'L' : 'M';
    const octets = utf8(texte);
    let version = 0;
    for (let v = 1; v <= 20; v++) {
      const bitsLongueur = v < 10 ? 8 : 16;
      if (4 + bitsLongueur + octets.length * 8 <= capaciteDonnees(v, niveau) * 8) { version = v; break; }
    }
    if (!version) throw new Error('Texte trop long pour le QR code');
    const taille = version * 4 + 17;
    const [ecParBloc, n1, d1, n2, d2] = BLOCS[niveau][version];
    const capacite = capaciteDonnees(version, niveau);

    // Flux de bits
    const bits = [];
    const ajouter = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    ajouter(0b0100, 4);
    ajouter(octets.length, version < 10 ? 8 : 16);
    octets.forEach(b => ajouter(b, 8));
    ajouter(0, Math.min(4, capacite * 8 - bits.length));
    ajouter(0, (8 - bits.length % 8) % 8);
    const donnees = [];
    for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; donnees.push(b); }
    for (let p = 0xEC; donnees.length < capacite; p ^= 0xEC ^ 0x11) donnees.push(p);

    // Blocs et correction d'erreurs, puis entrelacement
    const blocs = [], div = diviseurRS(ecParBloc);
    let k = 0;
    for (let i = 0; i < n1 + n2; i++) {
      const n = i < n1 ? d1 : d2;
      const d = donnees.slice(k, k + n); k += n;
      blocs.push({ d, ec: resteRS(d, div) });
    }
    const final = [];
    const maxD = Math.max(d1, d2);
    for (let i = 0; i < maxD; i++) blocs.forEach(b => { if (i < b.d.length) final.push(b.d[i]); });
    for (let i = 0; i < ecParBloc; i++) blocs.forEach(b => final.push(b.ec[i]));

    // Matrice
    const mod = Array.from({ length: taille }, () => new Array(taille).fill(false));
    const fonc = Array.from({ length: taille }, () => new Array(taille).fill(false));
    const poser = (x, y, noir) => { mod[y][x] = !!noir; fonc[y][x] = true; };

    for (let i = 0; i < taille; i++) { poser(6, i, i % 2 === 0); poser(i, 6, i % 2 === 0); }
    const reperes = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= taille || y >= taille) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        poser(x, y, d !== 2 && d !== 4);
      }
    };
    reperes(3, 3); reperes(taille - 4, 3); reperes(3, taille - 4);
    const al = ALIGNEMENT[version], na = al.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poser(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const dessinerFormat = masque => {
      const d = (BITS_FORMAT[niveau] << 3) | masque;
      let r = d;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412;
      const bit = i => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) poser(8, i, bit(i));
      poser(8, 7, bit(6)); poser(8, 8, bit(7)); poser(7, 8, bit(8));
      for (let i = 9; i < 15; i++) poser(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) poser(taille - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) poser(8, taille - 15 + i, bit(i));
      poser(8, taille - 8, true);
    };
    dessinerFormat(0);
    if (version >= 7) {
      let r = version;
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      const b = (version << 12) | r;
      for (let i = 0; i < 18; i++) {
        const noir = ((b >>> i) & 1) === 1, a = taille - 11 + i % 3, c = Math.floor(i / 3);
        poser(a, c, noir); poser(c, a, noir);
      }
    }

    // Placement des données en zigzag
    let i = 0;
    for (let droite = taille - 1; droite >= 1; droite -= 2) {
      if (droite === 6) droite = 5;
      for (let vert = 0; vert < taille; vert++) for (let j = 0; j < 2; j++) {
        const x = droite - j, monte = ((droite + 1) & 2) === 0, y = monte ? taille - 1 - vert : vert;
        if (!fonc[y][x] && i < final.length * 8) { mod[y][x] = ((final[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }

    // Masque : on garde celui qui pénalise le moins
    const TESTS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0
    ];
    const appliquer = m => { for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) if (!fonc[y][x] && TESTS[m](x, y)) mod[y][x] = !mod[y][x]; };
    let meilleur = 0, min = Infinity;
    for (let m = 0; m < 8; m++) {
      appliquer(m); dessinerFormat(m);
      const p = penalite(mod, taille);
      if (p < min) { min = p; meilleur = m; }
      appliquer(m);
    }
    appliquer(meilleur); dessinerFormat(meilleur);
    return { version, taille, masque: meilleur, modules: mod };
  }

  function penalite(m, n) {
    let p = 0;
    const ligne = get => {
      let couleur = null, long = 0, s = 0;
      const seq = [];
      for (let i = 0; i < n; i++) {
        const c = get(i);
        if (c === couleur) long++; else { if (long >= 5) s += long - 2; couleur = c; long = 1; }
        seq.push(c ? 1 : 0);
      }
      if (long >= 5) s += long - 2;
      const motif = [1, 0, 1, 1, 1, 0, 1];
      for (let i = 0; i + 7 <= n; i++) {
        let ok = true;
        for (let j = 0; j < 7; j++) if (seq[i + j] !== motif[j]) { ok = false; break; }
        if (!ok) continue;
        const avant = i >= 4 && seq.slice(i - 4, i).every(v => v === 0);
        const apres = i + 11 <= n && seq.slice(i + 7, i + 11).every(v => v === 0);
        const bordAvant = i < 4 && seq.slice(0, i).every(v => v === 0);
        const bordApres = i + 11 > n && seq.slice(i + 7).every(v => v === 0);
        if (avant || apres || bordAvant || bordApres) s += 40;
      }
      return s;
    };
    for (let y = 0; y < n; y++) p += ligne(x => m[y][x]);
    for (let x = 0; x < n; x++) p += ligne(y => m[y][x]);
    let noirs = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (m[y][x]) noirs++;
      if (x < n - 1 && y < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
    const total = n * n;
    p += Math.floor(Math.abs(noirs * 20 - total * 10) / total) * 10;
    return p;
  }

  // SVG prêt à afficher (modules sombres sur fond blanc, marge de 4 modules)
  function svg(texte, options) {
    const o = options || {};
    const q = creer(texte, o.niveau);
    const marge = 4, cote = q.taille + marge * 2;
    let d = '';
    for (let y = 0; y < q.taille; y++) for (let x = 0; x < q.taille; x++) if (q.modules[y][x]) d += `M${x + marge} ${y + marge}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cote} ${cote}" shape-rendering="crispEdges"${o.label ? ` role="img" aria-label="${String(o.label).replace(/"/g, '&quot;')}"` : ''}><rect width="${cote}" height="${cote}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  const QR = { creer, svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = QR; else racine.QR = QR;
})(typeof self !== 'undefined' ? self : this);
