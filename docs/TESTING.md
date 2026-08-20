# Pruebas

## Verificación automática

Desde la raíz del proyecto:

```bash
npm install
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run build
npm pack
```

Qué comprueba cada comando:

- `format:check`: formato de fuentes, tests y documentación.
- `typecheck`: TypeScript del paquete y de los tests.
- `lint`: reglas oficiales de community nodes de n8n.
- `test`: las 75 acciones, cuerpos y rutas de API, dropdowns, atributos tipados, merges seguros,
  normalización, firma, lifecycle, errores y credencial.
- `build`: genera `dist/` con el código que cargará n8n.
- `pack`: muestra y empaqueta exactamente los archivos publicables.

Los fixtures se modelaron a partir de controllers, presenters y del listener de Chatwoot. Cubren
las 75 acciones publicadas y los diez eventos, incluyendo cuerpos administrativos envueltos,
paginación, payload vacío, campos faltantes, evento futuro, inmutabilidad de `raw`, firmas válidas
e inválidas, credenciales, timeout, Base URL self-hosted, creación, reutilización, actualización,
eliminación, webhook ajeno y múltiples workflows.

## Prueba visual local

1. Abre Terminal.
2. Entra en la carpeta del proyecto.
3. Ejecuta:

   ```bash
   npm install
   npm run dev
   ```

4. Abre `http://localhost:5678` si el navegador no se abre solo.
5. Crea un workflow y pulsa **Add first step**.
6. Busca `Chatwoot`.
7. Debes ver dos nodos con el icono de burbuja: **Chatwoot** y **Chatwoot Trigger**.
8. Abre **Chatwoot**. Debes ver ocho recursos y sus operaciones.
9. Abre **Chatwoot Trigger**. Debes ver una credencial **Chatwoot API** y el dropdown con diez
   eventos.

Esto confirma que n8n descubre el paquete, pero todavía no confirma una entrega real.

## Prueba real desde un n8n local

Chatwoot necesita una URL HTTPS pública. Estos pasos usan un
[Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
únicamente para la prueba; la dirección cambia al reiniciar el túnel y no es una configuración de
producción.

### Terminal 1: iniciar n8n una primera vez

Desde la carpeta del proyecto:

```bash
npm run dev
```

Déjalo abierto.

### Terminal 2: crear la URL pública

En macOS con Homebrew:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:5678
```

Busca una línea que muestre una URL parecida a:

```text
https://palabras-aleatorias.trycloudflare.com
```

Cópiala y deja esta segunda Terminal abierta.

### Terminal 1: reiniciar n8n anunciando esa URL

1. Regresa a la Terminal 1.
2. Presiona `Control + C` una vez.
3. Sustituye la URL del ejemplo por la que copiaste y ejecuta:

   ```bash
   WEBHOOK_URL=https://palabras-aleatorias.trycloudflare.com npm run dev
   ```

4. Vuelve a abrir `http://localhost:5678`.

### Crear la credencial

1. En Chatwoot, abre tu avatar y después **Profile Settings**.
2. Copia el **Access Token** personal.
3. Identifica el número de cuenta en la URL del panel. Si ves `/app/accounts/1/`, usa `1`.
4. En n8n, abre **Credentials** y pulsa **Create Credential**.
5. Busca **Chatwoot API**.
6. Completa:
   - **Base URL**: `https://app.chatwoot.com` o la raíz HTTPS de tu servidor.
   - **API Access Token**: el token copiado.
   - **Account ID**: el número anterior.
   - **Verify Webhook Signatures**: activado.
   - **Ignore SSL Issues**: desactivado.
7. Guarda. La prueba debe finalizar correctamente.

### Prueba mínima de las acciones

Hazla primero con un contacto y una conversación descartables, no con datos importantes.

1. Agrega **Chatwoot → Contact (Lead) → Get**.
2. Elige la credencial e ingresa el ID del contacto descartable.
3. Ejecuta. Debes recibir el contacto sin configurar una URL, método o token dentro del nodo.
4. Agrega **Chatwoot → Contact (Lead) → Set Custom Attribute**.
5. Usa el mismo Contact ID, elige una definición del dropdown, asigna un valor y activa
   **Output → Include API Details**.
6. Ejecuta y comprueba en Chatwoot que cambió solo ese atributo. Los demás atributos deben seguir
   intactos. En la salida, `_chatwootApi.calls` debe mostrar la lectura de la definición y el
   `PATCH` del contacto, sin token.
7. Si el contacto ya tiene una etiqueta, ejecuta **Add Labels** con otra etiqueta. Deben quedar
   ambas; esta acción lee la lista actual antes de escribir.
8. En una conversación descartable, ejecuta **Conversation → Set Status → Pending** y después
   vuelve a **Open**. El cambio debe aparecer inmediatamente en Chatwoot.

Con este recorrido quedan probadas lectura, escritura tipada, merge seguro de etiquetas y una
acción de conversación. Las operaciones administrativas dependen de que el token pertenezca a un
usuario con permisos de administrador; un `403` en ellas no implica un fallo del paquete.

### Activar y disparar el evento

1. Crea un workflow nuevo.
2. Agrega **Chatwoot Trigger**.
3. Elige la credencial.
4. Selecciona **Message Created**.
5. Activa el workflow.
6. En Chatwoot, abre **Settings → Integrations → Webhooks**.
7. Debe aparecer un registro llamado `n8n Chatwoot Trigger [...]` con una sola suscripción:
   `message_created`.
8. Envía un mensaje nuevo dentro de Chatwoot.
9. En n8n, abre **Executions** y entra en la ejecución nueva.
10. Selecciona el trigger. La salida debe contener como mínimo:

    ```json
    {
      "event": "message_created",
      "deliveryId": "un UUID o null",
      "signatureVerified": true,
      "raw": {}
    }
    ```

11. Si el payload de tu versión contiene esas entidades, también verás
    `message.content`, `conversation.id` y `contact.id`.
12. Desactiva el workflow.
13. Refresca la lista de webhooks de Chatwoot. Solo el registro `n8n Chatwoot Trigger [...]` de
    ese workflow debe haber desaparecido.

## Prueba de aislamiento

1. Crea tres workflows, con `Message Created`, `Conversation Created` y `Contact Updated`.
2. Activa los tres.
3. Chatwoot debe mostrar tres webhooks n8n diferentes, cada uno con una suscripción.
4. Desactiva únicamente el segundo workflow.
5. Deben permanecer los webhooks del primero y del tercero.

## Qué copiar si algo falla

No envíes el token. Comparte solamente:

1. el texto completo del error de n8n;
2. si usas Chatwoot Cloud o self-hosted;
3. tu versión de Chatwoot y n8n;
4. la Base URL ocultando el subdominio si es privado;
5. el evento elegido;
6. el estado que aparece en **Settings → Integrations → Webhooks**;
7. los logs alrededor de `Chatwoot webhook`, comprobando primero que no contengan datos sensibles.

## Estado honesto de verificación

Las pruebas automáticas pueden certificar la lógica local. Los triggers ya fueron confirmados por
el usuario en una instalación real. Las acciones solo quedan aprobadas en esa instalación después
de completar la prueba mínima anterior. Una simulación de respuestas o HMAC no sustituye esa
verificación.
