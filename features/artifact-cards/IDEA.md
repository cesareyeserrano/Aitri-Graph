## Feature
Artifact detail cards — al hacer click en un nodo del grafo se abre una card flotante con todos los campos del artefacto y sus indicadores de estado.

## Problem / Why
El tooltip actual muestra información mínima (id, title, type, status). Para revisar un artefacto completo (description, acceptance_criteria, priority, implementation_level, etc.) el usuario tiene que abrir los archivos JSON manualmente. Esto elimina el valor principal de la herramienta: poder leer y navegar artefactos directamente en el grafo.

## Target Users
PMs y desarrolladores que usan Aitri Graph para revisar el estado de un proyecto. Necesitan leer artefactos completos sin salir de la vista del grafo.

## New Behavior
The system must abrir una card flotante al hacer click en cualquier nodo del grafo.
The system must mostrar en la card todos los campos disponibles del artefacto: id, title, description, priority, type, acceptance_criteria, implementation_level, status, y cualquier campo adicional presente en el JSON.
The system must mostrar iconografía o etiquetas de estado (pending, in_progress, approved, complete, drift) dentro de la card, consistentes con los colores del grafo.
The system must renderizar la card junto al nodo, dentro del viewport, sin salirse de los bordes de la pantalla.
The system must permitir cerrar la card con un botón X.
The system must permitir tener múltiples cards abiertas simultáneamente.
The system must permitir seguir navegando el grafo (pan, zoom, expand/collapse) con una o más cards abiertas.
The system must asegurar que las cards no se monten unas sobre otras al abrirse; cada card nueva aparece en una posición desplazada respecto a las anteriores.

## Success Criteria
Given un nodo en el grafo, when el usuario hace click en él, then una card aparece junto al nodo mostrando todos los campos del artefacto dentro de 300ms.
Given una card abierta, when el usuario hace click en el botón X, then la card se cierra y el grafo no cambia.
Given dos nodos distintos con clicks sucesivos, when ambas cards están abiertas, then no se superponen entre sí.
Given una card abierta, when el usuario hace pan o zoom en el grafo, then la card permanece visible y en su posición relativa a la pantalla.
Given un artefacto con acceptance_criteria (array), when se muestra en la card, then cada criterio aparece como ítem de lista legible.
Given un nodo con status "drift", when su card se muestra, then la etiqueta de estado usa el mismo color/icono que el grafo.

## Out of Scope
No edición de campos desde la card.
No persistencia de cards entre sesiones.
No cards en mobile (el proyecto es desktop-only).
No reemplaza el tooltip existente (hover sigue funcionando).
