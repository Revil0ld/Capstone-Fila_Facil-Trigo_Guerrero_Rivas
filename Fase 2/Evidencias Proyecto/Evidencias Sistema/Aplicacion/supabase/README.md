# Catálogo de supermercados

El mapa consulta el catálogo guardado en Supabase dentro del área visible. Para poblarlo primero con supermercados de cadenas reconocidas en Pudahuel y Maipú:

1. Aplica `migrations/20261024000001_supermarkets_in_map_area.sql` desde el SQL Editor de Supabase.
2. Crea credenciales OAuth para Supabase:
   - En GitHub, abre tu foto de perfil → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**. Puedes crear una app nueva para este proyecto, sin modificar otras integraciones.
   - En **Application name**, escribe `Fila Fácil Supabase`; en **Homepage URL**, pega la URL de tu proyecto Supabase (la misma de `EXPO_PUBLIC_SUPABASE_URL`).
   - En **Authorization callback URL**, pega la URL de callback que aparece en Supabase en **Authentication → Sign In / Providers → GitHub**. Suele tener la forma `https://<project-ref>.supabase.co/auth/v1/callback`. **No uses aquí** `http://localhost:54321/callback`.
   - Pulsa **Register application** en GitHub, copia el **Client ID** y pulsa **Generate a new client secret** para crear y copiar el secreto.
   - Vuelve a Supabase → **Authentication → Sign In / Providers → GitHub**, habilita GitHub, pega el **Client ID** y el **Client Secret**, y guarda los cambios.
3. En Supabase, añade `http://localhost:54321/callback` a Authentication → URL Configuration → Redirect URLs.
4. Copia `.env.example` a `.env` en la raíz del proyecto y configura la URL y la clave pública (`anon`/publishable) del mismo proyecto Supabase.
5. Ejecuta `npm run import:santiago` desde la raíz. Se abrirá el navegador; selecciona “Continuar con GitHub” y autoriza el acceso.

El importador descarga una sola vez (y la reutiliza 3 días) el extracto de OpenStreetMap del Gran Santiago publicado por BBBike (~85 MB), sin usar Overpass. Lo lee localmente, se queda solo con las cadenas con logo reconocidas por la app (A Cuenta, Jumbo, Líder, Santa Isabel, Super 10/Mayorista 10, Tottus, Alvi, Unimarc y Montserrat) y las envía a Supabase en lotes de 50. Tarda menos de un minuto. Las referencias OSM hacen que volver a importar sea idempotente; los locales previamente excluidos por administración siguen excluidos. No configures ni compartas una clave `service_role`; el importador usa la clave pública y tu sesión OAuth autenticada.

Si recibes `Unsupported provider: provider is not enabled`, GitHub todavía no está habilitado en Authentication → Sign In / Providers del proyecto indicado por `EXPO_PUBLIC_SUPABASE_URL`; también confirma que configuraste el proveedor en ese mismo proyecto.
