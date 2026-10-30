import { getSupabaseClient } from '@/supabase/supabaseClient';

export type SupermarketChatMessage = {
  id: number;
  text: string;
  createdAt: string;
  author: string;
  isMine: boolean;
  isReportable: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseMessage(value: unknown): SupermarketChatMessage {
  if (
    !isRecord(value) ||
    typeof value.id_mensaje !== 'number' ||
    !Number.isSafeInteger(value.id_mensaje) ||
    typeof value.mensaje !== 'string' ||
    typeof value.creado_en !== 'string' ||
    typeof value.nombre_usuario !== 'string' ||
    typeof value.es_mio !== 'boolean' ||
    (typeof value.es_reportable !== 'boolean' && value.es_mio !== true)
  ) {
    throw new Error('El chat recibió un mensaje con formato no válido.');
  }

  return {
    id: value.id_mensaje,
    text: value.mensaje,
    createdAt: value.creado_en,
    author: value.nombre_usuario,
    isMine: value.es_mio,
    isReportable: value.es_reportable === true,
  };
}

export async function getSupermarketMessages(supermarketId: string, afterId = 0) {
  const { data, error } = await getSupabaseClient().rpc('obtener_mensajes_supermercado', {
    p_id_super: supermarketId,
    p_ultimo_id: afterId,
  });

  if (error) {
    throw new Error(
      `No se pudo cargar el chat. Verifica que estén aplicadas las migraciones 20261018000006_supermarket_group_chat.sql y 20261018000012_supermarket_chat_user_reports.sql. ${error.message}`
    );
  }
  if (!Array.isArray(data)) {
    throw new Error('Supabase devolvió una respuesta inesperada para el chat.');
  }

  return data.map(parseMessage);
}

export async function sendSupermarketMessage(supermarketId: string, text: string) {
  const { data, error } = await getSupabaseClient().rpc('enviar_mensaje_supermercado', {
    p_id_super: supermarketId,
    p_mensaje: text,
  });

  if (error) {
    throw new Error(`No se pudo enviar el mensaje. ${error.message}`);
  }
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('Supabase no devolvió el mensaje enviado.');
  }

  return parseMessage(data[0]);
}

export async function reportSupermarketChatMessage(messageId: number) {
  const { error } = await getSupabaseClient().rpc('reportar_mensaje_chat', {
    p_id_mensaje: messageId,
  });
  if (error) {
    throw new Error(`No se pudo reportar el mensaje. ${error.message}`);
  }
}
