# Dashboard Tesorería Ingenia

Dashboard profesional para la gestión de tesorería de Ingenia, conectado en tiempo real a Google Sheets.

## 🚀 Características

- **KPIs en tiempo real**: Saldo actual, ingresos, egresos y transacciones
- **5 Gráficos interactivos**: Proyectos, tendencias, responsables, medios de pago
- **Tabla de transacciones**: Con filtros dinámicos
- **Exportar a PDF**: Genera reportes profesionales
- **Auto-actualización**: Cada 5 minutos
- **Diseño responsive**: Funciona en desktop y móvil
- **Tema oscuro profesional**: Con efectos glassmorphism

## 📊 Fuente de Datos

Los datos se obtienen automáticamente de Google Sheets:
- [Ver Hoja de Cálculo](https://docs.google.com/spreadsheets/d/1SK5OiU24RY1H0bwzLuffusz_2480bWtWods-koalfrU/edit)

## 🛠️ Instalación Local

### Opción 1: Abrir directamente
Simplemente abre `index.html` en tu navegador.

### Opción 2: Servidor local (recomendado)
```bash
# Con Node.js
npx serve .

# O con Python
python -m http.server 8000
```

## 🌐 Deploy en Vercel

1. Sube este proyecto a GitHub
2. Ve a [vercel.com](https://vercel.com)
3. Importa el repositorio
4. ¡Deploy automático!

## 📁 Estructura del Proyecto

```
DASHBOARD INGENIA/
├── index.html      # Estructura HTML
├── styles.css      # Estilos CSS (dark theme)
├── app.js          # Lógica JavaScript
├── package.json    # Configuración npm
└── README.md       # Este archivo
```

## 🎨 Personalización

Para cambiar el Google Sheet, edita en `app.js`:
```javascript
const CONFIG = {
    SHEET_ID: 'TU_NUEVO_SHEET_ID',
    // ...
};
```

## 📄 Licencia

MIT - Ingenia 2025
