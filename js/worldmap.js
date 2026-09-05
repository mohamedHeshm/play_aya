/* =====================================================================
   worldmap.js — خريطة اللعبة بين المراحل
   ===================================================================== */

const WorldMap = (() => {

  const NODES = [
    { id: 'level1', icon: '❤️', label: 'LEVEL 01', sub: 'البداية' },
    { id: 'level2', icon: '🌧️', label: 'LEVEL 02', sub: 'المطر' },
    { id: 'level3', icon: '⭐', label: 'LEVEL 03', sub: 'النجوم' },
    { id: 'level4', icon: '💌', label: 'LEVEL 04', sub: 'الذكريات' },
    { id: 'level5', icon: '🎁', label: 'LEVEL 05', sub: 'الهدية' },
  ];

  function render(container, state, onSelect) {
    container.innerHTML = '';

    const path = document.createElement('div');
    path.className = 'map-path';
    container.appendChild(path);

    NODES.forEach((node, i) => {
      const completed = state.levelsCompleted.includes(node.id);
      const currentIdx = NODES.findIndex(n => !state.levelsCompleted.includes(n.id));
      const isCurrent = i === currentIdx;
      const unlocked = completed || isCurrent;

      const el = document.createElement('button');
      el.className = 'map-node' +
        (completed ? ' is-complete' : '') +
        (isCurrent ? ' is-current' : '') +
        (!unlocked ? ' is-locked' : '');
      el.style.setProperty('--node-i', i);
      el.disabled = !unlocked;
      el.setAttribute('aria-label', node.label);

      el.innerHTML = `
        <span class="map-node__badge">${unlocked ? node.icon : '🔒'}</span>
        <span class="map-node__label">${node.label}</span>
        <span class="map-node__sub">${completed ? '✓ ' + node.sub : node.sub}</span>
      `;

      if (unlocked) {
        el.addEventListener('click', () => onSelect(node.id));
      }
      container.appendChild(el);
    });
  }

  function nextLevel(state) {
    return NODES.find(n => !state.levelsCompleted.includes(n.id))?.id || null;
  }

  return { render, NODES, nextLevel };
})();
