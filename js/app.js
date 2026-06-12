
// js/app.js
var myDiagram;
let lastScaledNode = null;

/* -------------------------------------------
   ContinuousForceDirectedLayout (custom)
   ------------------------------------------- */
function ContinuousForceDirectedLayout() {
  go.ForceDirectedLayout.call(this);
  this._isObserving = false;
}
go.Diagram.inherit(ContinuousForceDirectedLayout, go.ForceDirectedLayout);

ContinuousForceDirectedLayout.prototype.isFixed = function (v) {
  // Nó selecionado fica "fixo" durante o layout contínuo
  return v.node && v.node.isSelected;
};

ContinuousForceDirectedLayout.prototype.doLayout = function (coll) {
  if (!this._isObserving) {
    this._isObserving = true;
    const lay = this;
    this.diagram.addModelChangedListener(function (e) {
      if (
        e.modelChange !== "" ||
        (e.change === go.ChangedEvent.Transaction && e.propertyName === "StartingFirstTransaction")
      ) {
        lay.network = null; // invalida o cache quando a estrutura muda
      }
    });
  }

  let net = this.network;
  if (net === null) {
    this.network = net = this.makeNetwork(coll);
  } else {
    // atualiza bounds para nós selecionados
    this.diagram.nodes.each(function (n) {
      const v = net.findVertex(n);
      if (v !== null) v.bounds = n.actualBounds;
    });
  }

  go.ForceDirectedLayout.prototype.doLayout.call(this, coll);
  this.network = net; // mantém cache
};

/* ----------------
   Helpers de dados
   ---------------- */

// Corrige "MW Siea" -> "MW SIAE" e normaliza espaços
function normalizeLinkText(text) {
  if (!text) return text;
  let t = text.trim();
  if (/mw\s+siea/i.test(t)) t = t.replace(/siea/ig, "SIAE");
  t = t.replace(/\s+/g, " ");
  return t;
}

// Cor por fornecedor/provedor
function colorForTech(text) {
  const t = (text || "").toUpperCase();
  if (t.includes("ERICSSON")) return "#0B74DE";
  if (t.includes("HUAWEI"))   return "#D62D20";
  if (t.includes("NOKIA"))    return "#1572A1";
  if (t.includes("SIAE"))     return "#7A3E9D";
  if (t.includes("CERAGON"))  return "#F29F05";
  if (t.includes("V.TAL") || t.includes("VTAL")) return "#00A884";
  if (t.includes("SEA TELECOM") || t.includes("SEA")) return "#008080";
  if (t.includes("GGNET") || t.includes("CTE") || t.includes("LL")) return "#666666";
  return "#555555";
}

// Hash 32-bit determinístico
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// Deduplica nós e alinha text com a key (preserva sufixos, ex.: "Hub Gnex")
function sanitizeNodes(rawNodes) {
  const seen = new Set();
  const out = [];
  const issues = { duplicates: [], textMismatch: [] };

  for (const n of rawNodes) {
    if (!n || !n.key) continue;
    if (seen.has(n.key)) {
      issues.duplicates.push(n.key);
      continue; // ignora duplicatas
    }
    seen.add(n.key);

    const node = { key: n.key, text: n.text || n.key };

    if (!node.text.startsWith(node.key)) {
      const parts = node.text.split(/\s+/);
      let suffix = "";
      if (parts.length > 1) suffix = " " + parts.slice(1).join(" ");
      const oldText = node.text;
      node.text = node.key + suffix;
      issues.textMismatch.push({ key: node.key, from: oldText, to: node.text });
    }

    out.push(node);
  }

  return { nodes: out, issues };
}

// Normaliza links e sinaliza nós faltantes
function sanitizeLinks(rawLinks, nodeKeys) {
  const out = [];
  const missing = [];
  for (const l of rawLinks) {
    if (!l || !l.from || !l.to) continue;
    const normalized = {
      from: l.from,
      to: l.to,
      text: normalizeLinkText(l.text)
    };
    out.push(normalized);

    if (!nodeKeys.has(l.from) || !nodeKeys.has(l.to)) {
      missing.push({
        from: l.from,
        to: l.to,
        reason: `${!nodeKeys.has(l.from) ? "from" : ""}${!nodeKeys.has(l.from) && !nodeKeys.has(l.to) ? " & " : ""}${!nodeKeys.has(l.to) ? "to" : ""} não encontrado(s)`
      });
    }
  }
  return { links: out, missing };
}

/* ----------------------------
   Posicionamento de labels (links retos, anti-colisão)
   ---------------------------- */

// Calcula ângulo do link (de from para to), em radianos
function linkAngleRadians(link) {
  if (!link || !link.fromNode || !link.toNode) return 0;
  const dx = link.toNode.location.x - link.fromNode.location.x;
  const dy = link.toNode.location.y - link.fromNode.location.y;
  return Math.atan2(dy, dx); // [-PI, PI]
}

// Posição da legenda próxima da ponta conforme ângulo,
// com offset radial baseado no raio do nó para não encostar no nó/linha.
function labelPlacementBinding(data, obj) {
  const link = obj.part;
  const ang = linkAngleRadians(link);
  const key = `${link.data.from}->${link.data.to}|${link.data.text || ""}`;
  const h = hashStr(key);

  const nearToEnd = (h % 2) === 1;
  const jitter = ((h % 7) - 3) * 0.01; // ±0.03
  const baseFraction = nearToEnd ? 0.86 : 0.14; // perto das pontas
  const fraction = Math.max(0.08, Math.min(0.92, baseFraction + jitter));

  // raio (metade da largura/altura) do nó mais próximo
  const fromR = link.fromNode ? Math.max(link.fromNode.actualBounds.width, link.fromNode.actualBounds.height) / 2 : 16;
  const toR   = link.toNode   ? Math.max(link.toNode.actualBounds.width, link.toNode.actualBounds.height) / 2   : 16;
  const baseRadius = nearToEnd ? fromR : toR;

  // vetor perpendicular ao ângulo do link
  const perpX = -Math.sin(ang);
  const perpY =  Math.cos(ang);

  // offset = raio do nó + margem (6/8/10) com sinal alternado
  const mags = [6, 8, 10];
  const margin = mags[h % mags.length];
  const sign = (h % 2 === 0) ? 1 : -1;

  const offset = new go.Point(perpX * (baseRadius + margin) * sign,
                              perpY * (baseRadius + margin) * sign);

  return { fraction, offset };
}

// Retorna apenas o "prefixo/key" antes do primeiro espaço (ex.: "SFXU04 Hub SAT" -> "SFXU04")
function onlyKeyText(full) {
  if (!full) return "";
  const s = String(full);
  const idx = s.indexOf(" ");
  return idx === -1 ? s : s.slice(0, idx);
}

/* -------------
   init()
   ------------- */
function init() {
  console.log("init() chamado");

  if (!window.go) {
    console.error("go.js não foi carregado.");
    return;
  }
  if (typeof dataBaseNe === "undefined" || typeof dataBaseLinkNe === "undefined") {
    console.error("dataBaseNe/dataBaseLinkNe não definidos. Verifique se BaseNe.json e BaseLink.json (com conteúdo JS) foram carregados após app.js.");
    return;
  }
  console.log("dataBaseNe:", Array.isArray(dataBaseNe), "tamanho:", dataBaseNe.length);
  console.log("dataBaseLinkNe:", Array.isArray(dataBaseLinkNe), "tamanho:", dataBaseLinkNe.length);

  // Saneia dados
  const { nodes: nodeDataArray, issues } = sanitizeNodes(dataBaseNe || []);
  const keySet = new Set(nodeDataArray.map(n => n.key));
  const { links: linkDataArray, missing } = sanitizeLinks(dataBaseLinkNe || [], keySet);

  if (issues.duplicates.length) {
    console.warn("[VALIDAÇÃO] Keys duplicadas removidas:", issues.duplicates);
  }
  if (issues.textMismatch.length) {
    console.warn("[VALIDAÇÃO] Text ajustado para começar pela key (sufixos preservados):");
    issues.textMismatch.forEach(i => console.warn(`  ${i.key}: "${i.from}" -> "${i.to}"`));
  }
  if (missing.length) {
    console.warn("[VALIDAÇÃO] Links com nós faltantes no dataBaseNe:");
    missing.forEach(m => console.warn(`  ${m.from} -> ${m.to} (${m.reason})`));
  }

  const $ = go.GraphObject.make;

  myDiagram = $(go.Diagram, "myDiagramDiv", {
    initialAutoScale: go.Diagram.Uniform,
    contentAlignment: go.Spot.Center,
    layout: $(ContinuousForceDirectedLayout, {
      // ➤ Aproximar nós: distância menor, mola mais rígida, repulsão menor
      defaultSpringLength: 45,      // mais curto (aproxima)
      defaultSpringStiffness: 0.05, // puxa mais
      defaultElectricalCharge: 95,  // menos repulsão
      maxIterations: 400
    }),
    "SelectionMoved": (e) => e.diagram.layout.invalidateLayout(),
  });

  // Re-layout contínuo durante arraste
  myDiagram.toolManager.draggingTool.doMouseMove = function () {
    go.DraggingTool.prototype.doMouseMove.call(this);
    if (this.isActive) this.diagram.layout.invalidateLayout();
  };

  /* -------------------------
     Templates de Nós e Links
     ------------------------- */

  // NÓ CIRCULAR com texto dentro (usando só o prefixo/“key”)
  myDiagram.nodeTemplate =
    $(go.Node, "Auto",
      $(go.Shape, "Circle",
        {
          name: "SHAPE",
          fill: "lightblue",
          stroke: "black",
          strokeWidth: 1,
          minSize: new go.Size(30, 30), // garante um mínimo
          portId: "",
          fromLinkable: true,
          toLinkable: true,
          cursor: "move"
        }),
      $(go.TextBlock,
        {
          font: "bold 10.5pt sans-serif",  // legível dentro do círculo
          stroke: "#222",
          margin: 2,
          overflow: go.TextBlock.OverflowEllipsis,
          wrap: go.TextBlock.None,
          textAlign: "center"
        },
        // mostra apenas o prefixo (antes do primeiro espaço)
        new go.Binding("text", "text", onlyKeyText))
    );

  // LINK RETO com label sempre visível e distribuído (anti-sobreposição)
  myDiagram.linkTemplate =
    $(go.Link,
      {
        routing: go.Link.Normal, // linha reta
        curve: go.Link.None
      },

      // Linha
      $(go.Shape,
        {
          strokeWidth: 1.1,
          opacity: 0.95
        },
        new go.Binding("stroke", "text", colorForTech)
      ),

      // Rótulo (posicionado perto das pontas com offset radial via raio do nó)
      $(go.Panel, "Auto",
        $(go.Shape, "RoundedRectangle",
          {
            fill: "rgba(255,255,255,0.85)",
            stroke: "rgba(0,0,0,0.12)"
          }),
        $(go.TextBlock,
          {
            name: "TEXT",
            margin: 1.5,
            stroke: "#333",
            font: "7.5pt sans-serif",
            segmentIndex: 0,
            segmentFraction: 0.5,
            segmentOffset: new go.Point(0, -5)
          },
          new go.Binding("text", "text"),
          new go.Binding("segmentFraction", "", (data, tb) => {
            const lp = labelPlacementBinding(data, tb);
            return lp.fraction;
          }),
          new go.Binding("segmentOffset", "", (data, tb) => {
            const lp = labelPlacementBinding(data, tb);
            return new go.Point(lp.offset.x, lp.offset.y);
          })
        )
      )
    );

  // Modelo
  myDiagram.model = new go.GraphLinksModel(
    JSON.parse(JSON.stringify(nodeDataArray)),
    JSON.parse(JSON.stringify(linkDataArray))
  );

  console.log("Diagrama criado. Nós:", myDiagram.model.nodeDataArray.length, "Links:", myDiagram.model.linkDataArray.length);

  // Ajusta visão para ver mais grafo
  myDiagram.zoomToFit();
  // Se quiser aproximar um pouquinho após o fit:
  // myDiagram.commandHandler.increaseZoom(0.05);

  /* -------------------
     UI: Busca e ZoomFit
     ------------------- */

  const input = document.querySelector("#fnome");
  const btnBuscar = document.querySelector("#button");
  const btnZoomFit = document.querySelector("#btnZoomFit");

  if (btnBuscar) btnBuscar.addEventListener("click", buscar);
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        buscar();
      }
    });
  }
  if (btnZoomFit) btnZoomFit.addEventListener("click", () => {
    myDiagram.startTransaction("zoom-fit");
    if (lastScaledNode && lastScaledNode.part) {
      lastScaledNode.scale = 1.0;
      lastScaledNode = null;
    }
    myDiagram.clearSelection();
    myDiagram.zoomToFit();
    myDiagram.commitTransaction("zoom-fit");
  });
}

/* -------------
   buscar()
   ------------- */
function buscar() {
  const input = document.querySelector("#fnome");
  if (!input) return;

  let key = (input.value || "").trim();
  if (!key) return;

  const node = myDiagram.findNodeForKey(key);
  if (!node) {
    console.warn("Nó não encontrado:", key);
    return;
  }

  myDiagram.startTransaction("buscar-node");

  if (lastScaledNode && lastScaledNode !== node && lastScaledNode.part) {
    lastScaledNode.scale = 1.0;
  }

  myDiagram.clearSelection();
  myDiagram.select(node);
  myDiagram.centerRect(node.actualBounds);
  node.scale = 1.5;
  lastScaledNode = node;

  const shape = node.findObject("SHAPE");
  if (shape) {
    const oldFill = shape.fill;
    shape.fill = "gold";
    setTimeout(() => {
      myDiagram.startTransaction("restore-fill");
      shape.fill = oldFill;
      myDiagram.commitTransaction("restore-fill");
    }, 250);
  }

  myDiagram.commitTransaction("buscar-node");
  myDiagram.layout.invalidateLayout();
}

// expõe init para o onload do body
window.init = init;
