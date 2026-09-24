# Chatwoot for n8n

Community nodes para usar Chatwoot como bloques normales de n8n: sin pegar tokens en cada
workflow, sin armar HTTP Requests y sin escribir código para las operaciones comunes.

El paquete incluye:

- **Chatwoot Trigger**: recibe diez eventos y administra su webhook automáticamente.
- **Chatwoot**: caja de herramientas con 75 acciones sobre contactos, conversaciones, mensajes,
  atributos, etiquetas, agentes, equipos e inboxes.
- **Chatwoot API**: una credencial reutilizable para Chatwoot Cloud o self-hosted.

## Instalar o actualizar

En n8n abre **Settings → Community Nodes**.

- Instalación nueva: pulsa **Install** e ingresa `n8n-nodes-chatwoot-for-n8n`.
- Si ya usabas la versión del trigger: actualiza el paquete a `0.2.0` o superior y reinicia n8n si
  tu instalación no lo hace automáticamente.

Después busca `Chatwoot` al agregar un nodo. Deben aparecer **Chatwoot** y
**Chatwoot Trigger**.

## Crear la credencial una sola vez

En Chatwoot:

1. Abre tu avatar y entra en **Profile Settings**.
2. Copia el **Access Token** personal.
3. Mira la URL del panel. En `/app/accounts/1/`, el Account ID es `1`.

En n8n:

1. Abre **Credentials → Create Credential → Chatwoot API**.
2. En **Base URL** escribe `https://app.chatwoot.com` o la raíz de tu Chatwoot self-hosted, sin
   `/api` al final.
3. Pega el token y completa el **Account ID**.
4. Deja **Verify Webhook Signatures** activado e **Ignore SSL Issues** desactivado.
5. Guarda la credencial.

## Usar un bloque de acción

Ejemplo para cambiar el estado de una conversación:

1. Agrega **Chatwoot**.
2. Elige la credencial.
3. En **Resource**, selecciona **Conversation**.
4. En **Operation**, selecciona **Set Status**.
5. En **Conversation ID**, usa `{{$json.conversation.id}}` o un número fijo.
6. En **Status**, elige **Resolved**.
7. Ejecuta el nodo.

No hace falta conocer la ruta ni el verbo HTTP. De todos modos, el panel muestra una línea
**Under the Hood** con la operación real. En **Output → Include API Details** puedes incluir en la
salida todas las llamadas resueltas, sin Base URL ni token.

## Caja de herramientas

| Recurso          | Cantidad | Incluye                                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------------------ |
| Contact (Lead)   | 20       | crear, buscar exacto, upsert, actualizar, bloquear, atributos, labels, inbox, merge        |
| Conversation     | 22       | crear, listar, estado, prioridad, asignación, atributos, labels, mute, leído y eliminación |
| Message          | 7        | listar, enviar, nota privada, incoming, plantilla WhatsApp, estado y eliminación           |
| Custom Attribute | 5        | listar, obtener, crear, actualizar y eliminar definiciones                                 |
| Label            | 5        | listar, obtener, crear, actualizar y eliminar                                              |
| Agent            | 4        | listar, invitar, actualizar y remover                                                      |
| Team             | 9        | CRUD y administración de miembros                                                          |
| Inbox            | 3        | listar, obtener y actualizar ajustes comunes                                               |

El inventario exacto con método, ruta y comportamiento está en
[Acciones](docs/ACTIONS.md).

## Filtrar conversaciones por rango de actividad

La operación **Conversation → Get Many** incluye un filtro **Activity Date Range** que
selecciona conversaciones según su `last_activity_at`, sin nodos Code:

- **Relative (Days Ago)**: define un rango con "hace N días" (por ejemplo, 30 a 0 para
  "actividad en los últimos 30 días").
- **Absolute Dates**: define una fecha de inicio y fin exactas (cualquiera puede quedar
  vacía para no limitar ese extremo).

Combinado con **Message → Send WhatsApp Template**, el flujo "enviar plantilla a contactos
con conversaciones de fecha A a fecha B" queda en dos nodos y sin código. Para probar sin
riesgo, desactiva **Return All** y fija un **Limit** pequeño.

## Atributos pensados para leads

Los dropdowns de atributos se cargan desde las definiciones reales de tu cuenta. El nodo muestra
nombre, clave y tipo, y convierte el valor automáticamente:

- text, link y list se envían como texto;
- number, currency y percent se envían como número;
- checkbox entiende `true/false`, `1/0`, `sí/no`;
- date se envía como fecha ISO, igual que la interfaz de Chatwoot.

Las operaciones **Set Custom Attribute** conservan los demás atributos. Para conversaciones, el
nodo primero lee el objeto actual y hace el merge localmente, además de usar `merge=true` cuando
la versión de Chatwoot lo admite. **Remove Custom Attributes** elimina solo las claves elegidas.
La única acción destructiva para el objeto completo se llama explícitamente
**Replace Custom Attributes** y está marcada como avanzada.

**Add Labels** y **Remove Labels** también leen la lista actual antes de escribir porque la API de
Chatwoot reemplaza la lista completa. **Replace Labels** es la única operación que lo hace de
forma directa e intencional.

## Salida de las acciones

El modo predeterminado **Simplified** quita envelopes comunes como `payload` y `data.payload`.
Las listas generan un item de n8n por entidad. Para depurar, selecciona
**Raw Chatwoot Response** y/o activa **Include API Details**.

Los errores incluyen, cuando existe, el código HTTP, endpoint, mensaje de Chatwoot y una
sugerencia. Nunca incluyen el token.

## Chatwoot Trigger

Al activar el workflow, el trigger registra automáticamente una URL propia en Chatwoot. Al
desactivarlo, elimina únicamente ese webhook. Cada trigger queda aislado, por lo que varios
workflows pueden escuchar eventos distintos.

Eventos disponibles:

- `conversation_created`
- `conversation_status_changed`
- `conversation_updated`
- `message_created`
- `message_updated`
- `webwidget_triggered`
- `contact_created`
- `contact_updated`
- `conversation_typing_on`
- `conversation_typing_off`

La salida normalizada conserva siempre `raw` y expone `deliveryId` y `signatureVerified`.
Chatwoot necesita alcanzar una URL HTTPS pública de n8n; no puede entregar eventos a
`localhost`.

## Compatibilidad y verificación

- Node.js 22 o superior.
- n8n 2.x; compilado contra `n8n-workflow` 2.16.0 y `@n8n/node-cli` 0.44.3.
- TypeScript 5.9.3.
- Chatwoot 4.17.0 como referencia actual de API y código fuente.
- Chatwoot Cloud y self-hosted mediante Base URL configurable.

Los triggers fueron confirmados por el usuario en una instalación real. Las acciones tienen
tests automáticos con respuestas realistas y verificación de todas las rutas del catálogo; antes
de automatizar datos importantes conviene probar las operaciones elegidas contra la cuenta real,
porque permisos, canales y versión self-hosted pueden variar.

## Desarrollo

```bash
npm install
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run build
npm pack
```

`npm run dev` inicia el entorno de desarrollo oficial de community nodes de n8n.

Documentación adicional:

- [Acciones y semántica](docs/ACTIONS.md)
- [Investigación y decisiones](docs/RESEARCH.md)
- [Pruebas](docs/TESTING.md)
- [Resultado de verificación](docs/VERIFICATION.md)

Licencia: MIT. Los iconos son dibujos genéricos originales; consulta
[`icons/ASSET-NOTICE.md`](icons/ASSET-NOTICE.md).
