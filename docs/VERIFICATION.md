# Resultado de verificación

Ejecución local del 19 de agosto de 2026 para la versión `0.2.0`:

| Comprobación                                 | Resultado                                                     |
| -------------------------------------------- | ------------------------------------------------------------- |
| Instalación de dependencias con pnpm 11.19.0 | PASS                                                          |
| Formato con Prettier 3.8.3                   | PASS                                                          |
| TypeScript del paquete y los tests           | PASS                                                          |
| Lint oficial de n8n (`@n8n/node-cli` 0.44.3) | PASS                                                          |
| Tests con Vitest 4.1.11                      | PASS: 98 de 98 en 10 archivos                                 |
| Catálogo publicado                           | PASS: 75 acciones en 8 recursos                               |
| Build de producción                          | PASS                                                          |
| Carga de exports JavaScript compilados       | PASS: `Chatwoot` y `Chatwoot Trigger`                         |
| Creación del `.tgz`                          | PASS: 63 archivos, aproximadamente 125 kB                     |
| Instalación aislada del `.tgz` con npm       | PASS: versión y ambos nodos cargados desde `node_modules`     |
| Simulación completa de `npm publish`         | PASS: lifecycle `prepublishOnly`, tag `latest`, acceso public |
| Trigger contra Chatwoot/n8n reales           | PASS: confirmado por el usuario                               |
| Acciones contra Chatwoot/n8n reales          | PENDIENTE: ejecutar el smoke test reversible                  |

Artefacto generado:

```text
n8n-nodes-chatwoot-for-n8n-0.2.0.tgz
```

La instalación aislada se hizo desde ese tarball, no desde la carpeta del proyecto. Después se
importaron las dos clases compiladas y se verificó que el paquete instalado reportara la versión
`0.2.0`.

Las pruebas de acciones usan respuestas realistas y recorren las 75 operaciones, pero no afirman
que un token concreto tenga permisos administrativos ni que cada canal de una instancia real
admita las mismas capacidades. La validación real mínima y reversible está descrita en
[`TESTING.md`](TESTING.md).

La simulación de publicación ejecuta el mismo `prepublishOnly` que npm ejecutará al publicar y
comprueba el contenido final. La existencia de la versión en el registry debe confirmarse después
del release con `npm view n8n-nodes-chatwoot-for-n8n@0.2.0 version`.
