/*
 * Pocket Parrot artwork. Builds the parrot as an SVG string from the bird's
 * colors and accessories. Parts live in named groups (.p-head, .p-wing,
 * .p-beak-low, ...) so CSS can animate them independently.
 * Coordinates use a 240 x 260 viewBox with the bird facing right.
 */
(function (root) {
  'use strict';

  const HEX = /^#[0-9a-f]{6}$/i;
  const FEET = '#9A8C86';
  const INK = '#1C1714';

  const safe = (hex, fallback) => (typeof hex === 'string' && HEX.test(hex) ? hex : fallback);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(hex, target, amount) {
    const a = rgb(hex);
    const b = rgb(target);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('');
  }

  const shade = (hex) => mix(hex, '#000000', 0.22);

  const ACCESSORY_ART = {
    hibiscus() {
      let petals = '';
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        petals += `<ellipse cx="${(106 + Math.cos(a) * 7).toFixed(1)}" cy="${(56 + Math.sin(a) * 7).toFixed(1)}" rx="7.5" ry="6.5" transform="rotate(${(a * 180 / Math.PI).toFixed(0)} ${(106 + Math.cos(a) * 7).toFixed(1)} ${(56 + Math.sin(a) * 7).toFixed(1)})" fill="#EE4F7C" stroke="#C93460" stroke-width="1"/>`;
      }
      return `<g class="acc acc-hibiscus">${petals}<circle cx="106" cy="56" r="3.6" fill="#F6C945"/><path d="M106 56 l7 -9" stroke="#F6C945" stroke-width="1.6" stroke-linecap="round"/></g>`;
    },
    partyhat() {
      return '<g class="acc acc-partyhat">' +
        '<path d="M113 53 L125 4 L155 50 Z" fill="#F6C945" stroke="#C99A1E" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<circle cx="128" cy="40" r="3.4" fill="#D7262E"/><circle cx="140" cy="31" r="3" fill="#1E5BB8"/><circle cx="127" cy="24" r="2.6" fill="#2E9E4F"/><circle cx="143" cy="45" r="2.6" fill="#1E5BB8"/>' +
        '<circle cx="125" cy="5" r="6" fill="#D7262E"/></g>';
    },
    crown() {
      return '<g class="acc acc-crown">' +
        '<path d="M112 53 L111 27 L123 40 L133 20 L143 40 L155 27 L154 53 Z" fill="#F2B829" stroke="#B9851A" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<circle cx="111" cy="27" r="2.8" fill="#F2B829"/><circle cx="133" cy="20" r="2.8" fill="#F2B829"/><circle cx="155" cy="27" r="2.8" fill="#F2B829"/>' +
        '<circle cx="133" cy="44" r="3.8" fill="#D7262E"/><circle cx="121" cy="46" r="2.6" fill="#1E5BB8"/><circle cx="145" cy="46" r="2.6" fill="#2E9E4F"/></g>';
    },
    shades() {
      return '<g class="acc acc-shades">' +
        '<path d="M139 67 L103 61" stroke="#16181B" stroke-width="3.5" stroke-linecap="round"/>' +
        '<rect x="137" y="60" width="27" height="16" rx="6" fill="#16181B"/>' +
        '<path d="M142 64.5 h8" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/></g>';
    },
    bowtie() {
      return '<g class="acc acc-bowtie">' +
        '<path d="M150 114 L135 104 L135 124 Z" fill="#23262B"/><path d="M150 114 L165 104 L165 124 Z" fill="#23262B"/>' +
        '<circle cx="140" cy="111" r="1.5" fill="#F5F3EE"/><circle cx="141" cy="118" r="1.5" fill="#F5F3EE"/><circle cx="160" cy="111" r="1.5" fill="#F5F3EE"/><circle cx="159" cy="118" r="1.5" fill="#F5F3EE"/>' +
        '<circle cx="150" cy="114" r="4.6" fill="#3B3F45"/></g>';
    },
  };

  // Framing for accessory thumbnails in the Style tab.
  const THUMB_VIEW = {
    hibiscus: '90 40 32 32',
    partyhat: '104 -4 60 60',
    crown: '104 14 58 44',
    shades: '98 50 72 32',
    bowtie: '130 98 40 32',
  };

  function crest(style, color) {
    const line = shade(color);
    const attrs = `fill="${color}" stroke="${line}" stroke-width="1.5" stroke-linejoin="round"`;
    if (style === 'tall') {
      return `<g class="p-crest">` +
        `<path d="M114 54 C 98 34, 98 14, 108 2 C 112 18, 118 34, 128 46 Z" ${attrs}/>` +
        `<path d="M124 46 C 118 24, 124 8, 136 0 C 134 16, 136 32, 140 46 Z" ${attrs}/>` +
        `<path d="M136 48 C 140 28, 150 16, 162 12 C 156 26, 152 38, 150 54 Z" ${attrs}/></g>`;
    }
    if (style === 'tuft') {
      return `<g class="p-crest">` +
        `<path d="M122 50 C 116 36, 120 26, 130 20 C 130 30, 134 38, 140 46 Z" ${attrs}/>` +
        `<path d="M134 47 C 136 36, 142 30, 152 28 C 148 36, 148 42, 148 50 Z" ${attrs}/></g>`;
    }
    return '';
  }

  // Branch that reaches past the viewBox so it spans the whole stage.
  const PERCH = '<g class="perch-group">' +
    '<path class="perch" d="M-480 224 C -120 214, 360 214, 720 226" fill="none" stroke-width="14" stroke-linecap="round"/>' +
    '<path class="perch-grain" d="M-60 222 C 0 219, 40 219, 80 220 M170 221 C 200 220, 230 221, 262 223" fill="none" stroke-width="2" stroke-linecap="round"/>' +
    '<path class="perch" d="M206 222 C 214 208, 226 202, 242 200" fill="none" stroke-width="5" stroke-linecap="round"/>' +
    '<path class="perch-leaf" d="M242 200 C 252 188, 270 188, 280 194 C 270 204, 254 206, 242 200 Z"/>' +
    '<path class="perch-leaf" d="M226 206 C 228 192, 240 184, 252 182 C 250 194, 240 204, 226 206 Z"/>' +
    '</g>';

  function render(bird, wearing) {
    const c = bird.colors || {};
    const head = safe(c.head, '#D7262E');
    const body = safe(c.body, head);
    const wing = safe(c.wing, body);
    const wingTip = safe(c.wingTip, wing);
    const tail = safe(c.tail, body);
    const beak = safe(c.beak, '#E8D9B5');
    const crestColor = safe(c.crest, head);
    const cheek = c.cheek && HEX.test(c.cheek) ? c.cheek : null;
    const belly = mix(body, '#FFFFFF', 0.22);
    const wear = wearing || {};

    const facePatch = bird.facePatch
      ? '<ellipse cx="149" cy="77" rx="15.5" ry="15" fill="#F6F4EF"/>' +
        `<path d="M139 84 q 6 2.5 12 0 M140 90 q 6 2.5 11 0" fill="none" stroke="${shade(head)}" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round"/>`
      : '';
    const cheekPatch = cheek ? `<circle cx="151" cy="92" r="8" fill="${cheek}" fill-opacity=".95"/>` : '';
    const headAcc = wear.head && ACCESSORY_ART[wear.head] ? ACCESSORY_ART[wear.head]() : '';
    const faceAcc = wear.face && ACCESSORY_ART[wear.face] ? ACCESSORY_ART[wear.face]() : '';
    const neckAcc = wear.neck && ACCESSORY_ART[wear.neck] ? ACCESSORY_ART[wear.neck]() : '';

    return `<svg class="parrot" viewBox="0 0 240 260" role="img" aria-label="${esc(bird.name || 'Your parrot')}" focusable="false">` +
      PERCH +
      '<g class="p-bob"><g class="p-act">' +
        `<g class="p-tail"><path d="M104 196 C 96 222, 88 240, 80 258 L 98 260 C 106 242, 114 222, 124 204 Z" fill="${tail}" stroke="${shade(tail)}" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="M108 204 C 102 224, 96 242, 89 258" fill="none" stroke="${shade(tail)}" stroke-width="1.4" stroke-opacity=".6"/></g>` +
        `<g class="p-body"><path d="M126 104 C 158 108, 170 146, 162 180 C 156 206, 136 218, 116 214 C 94 210, 84 188, 88 160 C 92 130, 102 104, 126 104 Z" fill="${body}" stroke="${shade(body)}" stroke-width="2"/>` +
        `<path d="M150 124 C 166 146, 164 182, 148 204 C 138 214, 126 212, 130 196 C 136 176, 140 146, 150 124 Z" fill="${belly}"/></g>` +
        `<g class="p-feet" fill="none" stroke="${FEET}" stroke-width="4.5" stroke-linecap="round">` +
          '<path d="M112 212 q -3 7 2 11 M120 213 q -2 7 3 11"/><path d="M135 211 q -3 7 2 11 M143 212 q -2 7 3 11"/></g>' +
        `<g class="p-wing"><path d="M112 116 C 90 124, 82 156, 90 186 C 95 204, 104 220, 112 232 C 122 210, 132 184, 136 156 C 138 132, 130 114, 112 116 Z" fill="${wing}" stroke="${shade(wing)}" stroke-width="2" stroke-linejoin="round"/>` +
          `<path d="M92 190 C 97 206, 105 220, 112 232 C 117 220, 123 208, 127 196 C 115 200, 102 198, 92 190 Z" fill="${wingTip}" stroke="${shade(wingTip)}" stroke-width="1.5" stroke-linejoin="round"/>` +
          `<path d="M98 150 C 108 157, 120 157, 132 150 M95 170 C 106 177, 119 177, 131 170" fill="none" stroke="${shade(wing)}" stroke-width="1.8" stroke-linecap="round" stroke-opacity=".7"/></g>` +
        `<g class="p-neck">${neckAcc}</g>` +
        '<g class="p-head"><g class="p-head-idle">' +
          crest(bird.crest, crestColor) +
          `<circle cx="132" cy="78" r="34" fill="${head}" stroke="${shade(head)}" stroke-width="2"/>` +
          facePatch + cheekPatch +
          `<g class="p-eye-open"><circle cx="150" cy="70" r="7.5" fill="#FFFFFF"/><circle cx="151" cy="70" r="4.6" fill="${INK}"/><circle cx="153.2" cy="67.8" r="1.6" fill="#FFFFFF"/></g>` +
          `<path class="p-eye-closed" d="M142.5 71 Q 150 77 157.5 71" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` +
          '<g class="p-beak">' +
            `<path class="p-beak-low" d="M164 88 C 172 86, 180 90, 179 97 C 172 102, 165 99, 161 94 Z" fill="${mix(beak, '#000000', 0.3)}"/>` +
            `<path d="M160 64 C 176 60, 191 73, 186 97 C 182 90, 174 86, 164 88 C 167 80, 166 71, 160 64 Z" fill="${beak}" stroke="${shade(beak)}" stroke-width="1.5" stroke-linejoin="round"/>` +
            '<path d="M166 69 C 174 69, 181 76, 182 84" fill="none" stroke="#FFFFFF" stroke-opacity=".4" stroke-width="2.4" stroke-linecap="round"/>' +
          '</g>' +
          faceAcc + headAcc +
        '</g></g>' +
      '</g></g></svg>';
  }

  function accessoryThumb(id) {
    if (!ACCESSORY_ART[id]) return '';
    return `<svg viewBox="${THUMB_VIEW[id]}" aria-hidden="true" focusable="false">${ACCESSORY_ART[id]()}</svg>`;
  }

  root.ParrotArt = { render, accessoryThumb, mix };
})(window);
