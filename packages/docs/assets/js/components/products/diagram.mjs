// "How it all works together" architecture diagram: draws the SVG connectors between the diagram's
// HTML boxes, measured at runtime so they stay aligned across resizes and theme changes.
// Port of the connector logic in ProductsDiagram.tsx. port-landing.mjs tags each measured box with
// data-dg="<name>" (the React ref name) and the measuring container with data-dg-root.

const LINE = 'var(--oc-gray-5)';
const DOT_FILL = 'var(--dg-dot-fill)';
const DOT_STROKE = 'var(--oc-gray-5)';
const SVG_NS = 'http://www.w3.org/2000/svg';

export function initDiagram(root) {
  const container = root.querySelector('[data-dg-root]');
  const svg = container?.querySelector(':scope > svg');
  if (!container || !svg) {
    return undefined;
  }

  const nodes = {};
  container.querySelectorAll('[data-dg]').forEach((el) => {
    nodes[el.dataset.dg] = el;
  });
  // The right column (External IdP, Agent, Integrations) is shifted down so the External IdP
  // card's center lines up with the Auth API band, letting that connector be one straight line
  const rightColumn = nodes.byoIdp?.parentElement;

  function measure() {
    const c = container.getBoundingClientRect();
    const R = {};
    for (const [name, el] of Object.entries(nodes)) {
      const r = el.getBoundingClientRect();
      R[name] = { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
    }
    return R;
  }

  function draw() {
    let R = measure();
    if (rightColumn && R.medplumIdp && R.byoIdp) {
      const currentShift = parseFloat(rightColumn.style.marginTop) || 0;
      const delta = R.medplumIdp.y + R.medplumIdp.h / 2 - (R.byoIdp.y + R.byoIdp.h / 2 - currentShift);
      if (Math.abs(delta - currentShift) > 0.5) {
        rightColumn.style.marginTop = `${delta}px`;
        R = measure();
      }
    }
    svg.style.height = `${R.datastore ? R.datastore.y + R.datastore.h + 60 : 1000}px`;
    svg.replaceChildren(...connectors(R));
  }

  draw();
  const resizeObserver = new ResizeObserver(draw);
  resizeObserver.observe(container);
  const themeObserver = new MutationObserver(() => {
    if (rightColumn) {
      rightColumn.style.marginTop = '0px';
    }
    draw();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.fonts?.ready.then(draw);

  return () => {
    resizeObserver.disconnect();
    themeObserver.disconnect();
  };
}

function connectors(R) {
  const bottom = (r) => r && { x: r.x + r.w / 2, y: r.y + r.h };
  const right = (r) => r && { x: r.x + r.w, y: r.y + r.h / 2 };
  const left = (r) => r && { x: r.x, y: r.y + r.h / 2 };
  const out = [];

  // Both SDK cards → FHIR REST API: merge to a shared trunk, then into the API
  if (R.fhirApiRest && R.fhirApi) {
    const target = { x: R.fhirApiRest.x + R.fhirApiRest.w / 2, y: R.fhirApi.y };
    const boxes = [R.yourAppsBox, R.medplumAppsBox].filter(Boolean);
    if (boxes.length > 0) {
      const bottoms = boxes.map(bottom);
      const appsBottom = R.appsRow ? R.appsRow.y + R.appsRow.h : Math.max(...bottoms.map((p) => p.y));
      const platformTop = R.platformBox ? R.platformBox.y : R.fhirApi.y;
      const trunkY = (appsBottom + platformTop) / 2;
      for (const from of bottoms) {
        out.push(elbow([from, { x: from.x, y: trunkY }, { x: target.x, y: trunkY }, target]), dot(from));
      }
      out.push(dot(target));
    }
  }

  // External IdP ↔ Auth API: a single straight horizontal line
  if (R.byoIdp && R.medplumIdp) {
    const y = R.medplumIdp.y + R.medplumIdp.h / 2;
    const from = { x: R.medplumIdp.x + R.medplumIdp.w, y };
    const to = { x: R.byoIdp.x, y };
    out.push(straight(from, to), dot(from), dot(to));
  }

  // Subscriptions + Bots: merge to a trunk inside the platform, exit onto a vertical bus in the gap,
  // and feed both the Agent (above) and the Integrations box (below)
  if (R.subs && R.bot && R.intBox && R.intFirst && R.intThird && R.platformBox && R.bridge) {
    const subsR = right(R.subs);
    const botR = right(R.bot);
    const innerTrunkX = Math.max(subsR.x, botR.x) + 14;
    const trunkMidY = (subsR.y + botR.y) / 2;
    const platRightX = R.platformBox.x + R.platformBox.w;
    const rightColLeft = R.bridge?.x ?? R.intBox?.x ?? platRightX + 56;
    const laneX = (platRightX + rightColLeft) / 2;
    const bridgeP = left(R.bridge);
    const intEntryY = (R.intFirst.y + R.intFirst.h + R.intThird.y) / 2;
    const intP = { x: R.intBox.x, y: intEntryY };
    const busTopY = Math.min(bridgeP.y, trunkMidY);
    const busBotY = Math.max(intEntryY, trunkMidY);
    out.push(
      straight(subsR, { x: innerTrunkX, y: subsR.y }),
      straight(botR, { x: innerTrunkX, y: botR.y }),
      straight({ x: innerTrunkX, y: subsR.y }, { x: innerTrunkX, y: botR.y }),
      straight({ x: innerTrunkX, y: trunkMidY }, { x: laneX, y: trunkMidY }),
      straight({ x: laneX, y: busTopY }, { x: laneX, y: busBotY }),
      straight({ x: laneX, y: bridgeP.y }, bridgeP),
      straight({ x: laneX, y: intEntryY }, intP),
      dot(subsR),
      dot(botR),
      dot(bridgeP),
      dot(intP)
    );
  }

  return out;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function dot(p) {
  return svgEl('circle', { cx: p.x, cy: p.y, r: 4.5, fill: DOT_FILL, stroke: DOT_STROKE, 'stroke-width': 1.6 });
}

function elbow(points) {
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  return svgEl('path', { d, fill: 'none', stroke: LINE, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
}

function straight(from, to) {
  return svgEl('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: LINE, 'stroke-width': 2, 'stroke-linecap': 'round' });
}
