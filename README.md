# network-topology-map

Ferramenta de visualização interativa de topologia de rede móvel, desenvolvida com JavaScript e GoJS.

## O que é

Um mapa de grafo interativo que representa os elementos de rede (NEs) e os enlaces entre eles, com identificação visual por fornecedor/tecnologia. Permite navegar pela topologia, buscar elementos específicos e visualizar as conexões de forma clara.

## Funcionalidades

- **Visualização em grafo** com layout force-directed automático (ContinuousForceDirectedLayout)
- **Cores por fornecedor/tecnologia** dos enlaces:
  - 🔵 Ericsson — azul
  - 🔴 Huawei — vermelho
  - 🔷 Nokia — azul escuro
  - 🟣 SIAE — roxo
  - 🟠 Ceragon — laranja
  - 🟢 V.TAL — verde
- **Busca por elemento** com destaque visual e zoom automático
- **Zoom to Fit** para visualizar toda a topologia
- **Layout dinâmico** — nós se reorganizam durante o arraste
- **Validação de dados** — detecta nós duplicados e links com referências inválidas no console

## Tecnologias

- JavaScript (vanilla)
- [GoJS](https://gojs.net) — biblioteca de diagramas interativos
- HTML/CSS

## Como usar

1. Clone o repositório
2. Abra o arquivo `index.html` diretamente no navegador
3. Use o campo **Elemento** para buscar um nó pelo código (ex.: `HUB01`)
4. Clique em **Zoom to Fit** para reposicionar a visão completa
5. Arraste os nós para reorganizar o layout

## Estrutura de dados

Os dados são carregados de dois arquivos JSON:

**BaseNe.json** — lista de elementos de rede (nós):
```json
dataBaseNe = [
  {"key": "HUB01", "text": "HUB01 Hub Central"},
  {"key": "NE01",  "text": "NE01"}
]
```

**BaseLink.json** — lista de enlaces (arestas):
```json
dataBaseLinkNe = [
  {"from": "HUB01", "to": "NE01", "text": "MW Nokia"},
  {"from": "NE01",  "to": "NE02", "text": "MW Ericsson"}
]
```

## Estrutura do projeto

```
network-topology-map/
├── index.html
├── BaseNe.json       # Dados dos elementos de rede
├── BaseLink.json     # Dados dos enlaces
├── js/
│   ├── app.js        # Lógica principal (layout, templates, busca)
│   └── go.js         # Biblioteca GoJS
```

## Motivação

Desenvolvido para facilitar a visualização e análise da topologia de redes móveis em ambiente operacional, substituindo consultas manuais a planilhas e documentos estáticos.
