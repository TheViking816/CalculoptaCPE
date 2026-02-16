# Puertas CPE movil

App para calcular puertas directamente desde movil en el portal CPE.

## Requisitos
- Node 18+
- Cuenta de Expo (gratis) para generar APK

## Desarrollo local (opcional)
```bash
cd mobile-app
npm install
npm start
```

## Generar APK (sin Expo Go para usuarios)
```bash
cd mobile-app
npm install
npx eas-cli login
npm run apk
```

Cuando termine el build, Expo te da una URL para descargar el APK.

## Uso de la app
1. Inicia sesion en el portal dentro de la app.
2. Pulsa `Ir Chapero`.
3. Introduce tu chapa y pulsa `Calcular`.

## Nota
En modo web (`npm run web`) no funciona el calculo real; usa Android/iOS.
