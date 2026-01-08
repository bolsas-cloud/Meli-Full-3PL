# Paleta de Colores - Meli-Full-3PL

## Framework CSS

- **Framework**: Tailwind CSS
- **Enfoque**: Limpio, profesional, orientado a datos
- **Tipografía**: System fonts (Inter, -apple-system, system-ui)

---

## Colores Base

| Nombre | Hex | Tailwind | Uso |
|--------|-----|----------|-----|
| **Brand** | `#4eab87` | custom | Botones activos, acentos principales |
| **Background** | `#f9fafb` | gray-50 | Fondo general de la app |
| **Surface** | `#ffffff` | white | Cards, modals, tablas |
| **Text** | `#111827` | gray-900 | Texto principal |
| **Text Secondary** | `#6b7280` | gray-500 | Texto secundario, labels, placeholders |
| **Text Muted** | `#9ca3af` | gray-400 | Texto deshabilitado |
| **Border** | `#e5e7eb` | gray-200 | Bordes, separadores, dividers |
| **Input BG** | `#f3f4f6` | gray-100 | Fondo de inputs, botones inactivos |
| **Hover** | `#e5e7eb` | gray-200 | Estado hover en elementos |

---

## Estados Semánticos

### Success (Verde)

| Elemento | Hex | Tailwind |
|----------|-----|----------|
| Background | `#dcfce7` | green-100 |
| Text | `#166534` | green-800 |
| Border/Accent | `#22c55e` | green-500 |
| Dark Text | `#15803d` | green-700 |

### Warning (Amarillo/Naranja)

| Elemento | Hex | Tailwind |
|----------|-----|----------|
| Background | `#fef3c7` | yellow-100 |
| Text | `#92400e` | yellow-800 |
| Border/Accent | `#f59e0b` | amber-500 |
| Dark Text | `#b45309` | amber-700 |

### Error (Rojo)

| Elemento | Hex | Tailwind |
|----------|-----|----------|
| Background | `#fef2f2` | red-50 |
| Background Alt | `#fee2e2` | red-100 |
| Text | `#dc2626` | red-600 |
| Border | `#fecaca` | red-200 |
| Dark Text | `#991b1b` | red-800 |

### Info (Azul)

| Elemento | Hex | Tailwind |
|----------|-----|----------|
| Background | `#dbeafe` | blue-100 |
| Text | `#1e40af` | blue-800 |
| Border/Accent | `#3b82f6` | blue-500 |
| Link | `#2563eb` | blue-600 |

---

## Badges de Estado

| Estado | Background | Text |
|--------|------------|------|
| Activo | `#dcfce7` (green-100) | `#166534` (green-800) |
| Pausado | `#fef3c7` (yellow-100) | `#92400e` (yellow-800) |
| Error/Fallido | `#fee2e2` (red-100) | `#991b1b` (red-800) |
| Info/Nuevo | `#dbeafe` (blue-100) | `#1e40af` (blue-800) |
| Neutral | `#f3f4f6` (gray-100) | `#4b5563` (gray-600) |

---

## Componentes Específicos

### Botones

```css
/* Primario (Brand) */
.btn-primary {
    background: #4eab87;
    color: white;
}
.btn-primary:hover {
    background: #3d9070; /* Slightly darker */
}

/* Secundario */
.btn-secondary {
    background: #f3f4f6;
    color: #6b7280;
}
.btn-secondary:hover {
    background: #e5e7eb;
}

/* Danger */
.btn-danger {
    background: #dc2626;
    color: white;
}
```

### Filtros de Estado

```css
/* Filtro inactivo */
.btn-filtro {
    background: #f3f4f6;
    color: #6b7280;
}

/* Filtro activo */
.btn-filtro.active {
    background: #4eab87;
    color: white;
}

/* Filtro de fallos */
.btn-filtro-fallos {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
}
.btn-filtro-fallos.active {
    background: #dc2626;
    color: white;
}
```

### Filas de Tabla

```css
/* Fila normal */
tr { background: white; }
tr:hover { background: #f9fafb; }

/* Fila modificada (preview) */
tr.modificada { background: #fefce8; } /* yellow-50 */

/* Fila con error/fallo */
tr.row-con-fallo { background: #fef2f2; }
tr.row-con-fallo:hover { background: #fee2e2; }
```

---

## Iconos

- **Librería**: Font Awesome 6
- **Estilo**: Solid (fas) para acciones, Regular (far) para estados

### Iconos Comunes

| Acción | Icono |
|--------|-------|
| Guardar | `fa-save` |
| Editar | `fa-edit` |
| Eliminar | `fa-trash` |
| Buscar | `fa-search` |
| Filtrar | `fa-filter` |
| Sincronizar | `fa-sync` |
| Error | `fa-exclamation-triangle` |
| Info | `fa-info-circle` |
| Check | `fa-check` |
| Loading | `fa-spinner fa-spin` |

---

## Espaciado

| Nombre | Valor | Uso |
|--------|-------|-----|
| xs | 4px | Gap mínimo |
| sm | 8px | Padding interno pequeño |
| md | 12px | Gap estándar |
| lg | 16px | Padding de cards |
| xl | 24px | Secciones |
| 2xl | 32px | Márgenes grandes |

---

## Border Radius

| Nombre | Valor | Uso |
|--------|-------|-----|
| sm | 4px | Badges, chips |
| md | 8px | Inputs, botones |
| lg | 12px | Cards |
| xl | 16px | Modals |
| full | 9999px | Avatars, dots |

---

## Sombras

```css
/* Card shadow */
.shadow-card {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Modal shadow */
.shadow-modal {
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

/* Hover shadow */
.shadow-hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}
```

---

## Transiciones

```css
/* Transición estándar */
transition: all 150ms ease;

/* Transición de color */
transition: color 150ms ease, background-color 150ms ease;
```

---

*Última actualización: Enero 2026*
