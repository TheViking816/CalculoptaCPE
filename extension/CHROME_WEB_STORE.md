# Publicacion en Chrome Web Store

Esta guia deja la extension lista para publicar.

## 1) Preparar paquete ZIP
Ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File .\extension\package-extension.ps1
```

Se genera:
- `extension\dist\cpe-distancia-puertas-v1.0.0.zip`

## 2) Crear ficha en Chrome Web Store Developer Dashboard
1. Entra en `https://chrome.google.com/webstore/devconsole`.
2. Crea un item nuevo y sube el ZIP generado.
3. Completa:
- Nombre: `CPE Distancia Puertas`
- Descripcion corta (ejemplo):
  `Calcula distancia por censo entre chapa usuario y puertas LAB/FES/NOC/NOC-FES en el chapero.`
- Descripcion completa (ejemplo):
  `Extension para personal de CPE Valencia. Lee el chapero por especialidades abierto en el portal y calcula la distancia circular entre la chapa del usuario y las puertas LAB/FES/NOC/NOC-FES, contando chapas no contratadas (grises).`
- Categoria: `Productividad` (o la que prefieras)
- Idioma principal: `es`

## 3) Privacidad y cumplimiento
1. Publica el contenido de `extension/PRIVACY_POLICY.md` en una URL publica (GitHub Pages o tu web).
2. Pega esa URL en el campo de politica de privacidad de la ficha.
3. En "Data usage", marca que:
- No vendes datos.
- No compartes datos con terceros.
- El procesamiento es local.

## 4) Capturas e imagenes
- Icono tienda recomendado: 128x128 (ya incluido en el paquete).
- Capturas recomendadas: popup abierto y resultado calculado en portal.

## 5) Revisar permisos
Permisos actuales:
- `activeTab`
- `scripting`
- Host: `https://portal.cpevalencia.com/*`

## 6) Enviar a revision
1. Guarda borrador.
2. Ejecuta pre-checks de la tienda.
3. Envia para revision.

## Nota importante
No puedo publicar yo directamente en tu cuenta de Chrome Web Store porque requiere login y aceptacion legal en tu panel.
Lo que si queda listo en este repo es: paquete ZIP, manifest, iconos y politica de privacidad.
