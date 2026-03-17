# Project Idea

---

## Problem

Los equipos que usan Aitri gestionan sus artefactos (Epics, Features, User Stories, Test Cases) en archivos JSON y Markdown, pero no tienen una forma visual de entender la jerarquía del producto ni el estado de cada artefacto de un vistazo. Navegar entre archivos para entender dependencias y cobertura es lento y propenso a errores.

## Target Users

Product managers y desarrolladores que usan Aitri para gestionar el ciclo de vida de un producto. Son técnicos o semi-técnicos, cómodos con herramientas web modernas. Ejemplo: un PM que quiere revisar qué User Stories están pendientes o qué Test Cases cubren un Feature antes de una demo.

## Current Pain / Baseline

Hoy los artefactos se revisan abriendo archivos individuales en un editor. No hay forma de ver el grafo completo de un producto. Ver dependencias entre nodos requiere leer múltiples archivos manualmente. Estimar el tiempo perdido: ~15-30 min por revisión de estado de proyecto.

## Business Rules

The system must render un grafo jerárquico con nodos que representen Epics, Features, User Stories y Test Cases.
The system must conectar los nodos padre-hijo jerárquicamente (Epic → Feature → User Story → Test Case).
The system must mostrar el estado de cada nodo (e.g. pending, approved, complete, drift) con color o ícono.
The system must permitir hacer zoom in/out sobre el grafo.
The system must permitir pan (arrastrar) para navegar por el grafo.
The system must permitir expand/collapse de sub-árboles al hacer click en un nodo.
The system must renderizar dependencias entre nodos (edges no-jerárquicos) como líneas diferenciadas.
The system must cargar los artefactos de un proyecto Aitri desde una URL de repositorio GitHub (usando raw content de GitHub, estructura Aitri predecible: spec/01_REQUIREMENTS.json, spec/03_TEST_CASES.json, .aitri).
The system must cargar los artefactos de un proyecto Aitri desde un path local, a través de un servidor Node.js mínimo que corre en localhost y expone un endpoint GET /project?path=... que lee el filesystem.
The system must soportar múltiples proyectos registrados simultáneamente.
The system must mostrar un sidebar con la lista de proyectos registrados; al seleccionar uno, el grafo principal muestra ese proyecto.
The system must funcionar en localhost con un servidor Node.js mínimo (no cloud, no autenticación).
The system must cargar los artefactos desde archivos JSON de ejemplo (mock data) para el POC inicial.

## Success Criteria

Given un archivo JSON con Epics, Features, User Stories y Test Cases, when se carga la app, then el grafo se renderiza con todos los nodos y sus relaciones jerárquicas visibles.
Given el grafo renderizado, when el usuario hace scroll o usa controles, then puede hacer zoom in/out sin que el grafo se distorsione.
Given el grafo renderizado, when el usuario arrastra el canvas, then puede hacer pan libremente.
Given un nodo con hijos, when el usuario hace click en él, then los hijos se colapsan o expanden.
Given dos nodos con una dependencia explícita en el JSON, when se renderiza el grafo, then aparece una línea de dependencia diferenciada (distinta a la línea jerárquica).
Given cualquier nodo, when se observa su representación visual, then el estado del artefacto es identificable sin abrir ningún archivo.

## Hard Constraints

Corre en localhost. Requiere un servidor Node.js mínimo para leer proyectos locales del filesystem.
Para proyectos GitHub: fetch directo desde el frontend a raw.githubusercontent.com (no requiere server).
Sin autenticación, sin cloud, sin base de datos.
El servidor Node.js es mínimo (un solo archivo, sin frameworks pesados).

## Out of Scope

No autenticación ni multi-usuario.
No edición de artefactos desde la UI.
No persistencia ni base de datos (la lista de proyectos puede vivir en memoria o localStorage).
No mobile-first (desktop browser es suficiente para el POC).
No repos privados de GitHub (no OAuth, no GitHub token para el POC).

## Tech Stack

Vanilla JS o React (sin build step si es posible, o con Vite si es necesario).
Para el grafo: D3.js o Cytoscape.js (el Architect elige el más adecuado).
HTML/CSS para el layout base.

## Assets

Los artefactos de Aitri tienen esta estructura jerárquica:
- Epic: agrupación de alto nivel
- Feature (FR): funcionalidad concreta dentro de un Epic
- User Story: caso de uso desde la perspectiva del usuario, ligado a un FR
- Test Case: prueba que valida una User Story o FR

Estados posibles de un artefacto: pending, in_progress, approved, complete, drift

Dependencias: un nodo puede depender de otro nodo de cualquier nivel (e.g. una User Story depende de otra User Story).
