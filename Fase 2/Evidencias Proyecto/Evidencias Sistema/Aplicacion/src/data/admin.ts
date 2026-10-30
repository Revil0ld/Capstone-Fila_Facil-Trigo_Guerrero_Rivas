import { getSupabaseClient } from '@/supabase/supabaseClient';

export type AdminOverview = {
  totalUsers: number;
  totalSupermarkets: number;
  chatMessages: number;
};

export type AdminChatMessage = {
  id: number;
  supermarketId: string;
  supermarketName: string;
  author: string;
  text: string;
  createdAt: string;
};

export type AdminSupermarket = {
  id: string;
  name: string;
  chain: string;
  address: string;
  osmRef: string | null;
  isActive: boolean;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isBanned: boolean;
  isChatBanned: boolean;
};

export type AdminChatReport = {
  reportedUserId: string;
  reportedUserName: string;
  reportedUserEmail: string;
  reporterCount: number;
  id: number;
  reporterName: string;
  supermarketName: string;
  message: string;
  createdAt: string;
};

export type AdminReportedMessage = {
  id: number;
  supermarketName: string;
  message: string;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function getAdminStatus() {
  const { data, error } = await getSupabaseClient().rpc('es_superusuario');
  if (error) {
    throw new Error(`No se pudo verificar el rol administrador. ${error.message}`);
  }
  if (typeof data !== 'boolean') {
    throw new Error('Supabase devolvió un estado de administrador no válido.');
  }
  return data;
}

export type AccountAccessStatus = {
  isAdmin: boolean;
  isBanned: boolean;
  isChatBanned: boolean;
};

export async function getAccountAccessStatus(): Promise<AccountAccessStatus> {
  const { data, error } = await getSupabaseClient().rpc('obtener_estado_acceso');
  if (error) {
    throw new Error(`No se pudo verificar el estado de la cuenta. ${error.message}`);
  }
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
    throw new Error('Supabase devolvió un estado de cuenta no válido.');
  }

  const row = data[0];
  if (
    typeof row.es_admin !== 'boolean' ||
    typeof row.cuenta_baneada !== 'boolean' ||
    typeof row.chat_baneado !== 'boolean'
  ) {
    throw new Error('El estado de la cuenta llegó con datos no válidos.');
  }
  return {
    isAdmin: row.es_admin,
    isBanned: row.cuenta_baneada,
    isChatBanned: row.chat_baneado,
  };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const { data, error } = await getSupabaseClient().rpc('obtener_resumen_admin');
  if (error) {
    throw new Error(`No se pudo cargar el resumen de administración. ${error.message}`);
  }
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
    throw new Error('Supabase devolvió un resumen de administración no válido.');
  }

  const row = data[0];
  if (
    typeof row.total_usuarios !== 'number' ||
    typeof row.total_supermercados !== 'number' ||
    typeof row.mensajes_chat !== 'number'
  ) {
    throw new Error('El resumen de administración llegó con datos no válidos.');
  }

  return {
    totalUsers: row.total_usuarios,
    totalSupermarkets: row.total_supermercados,
    chatMessages: row.mensajes_chat,
  };
}

export async function getAdminChatMessages(): Promise<AdminChatMessage[]> {
  const { data, error } = await getSupabaseClient().rpc('obtener_mensajes_admin');
  if (error) {
    throw new Error(`No se pudieron cargar los mensajes para moderación. ${error.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error('Supabase devolvió una lista de mensajes no válida.');
  }

  return data.map((value): AdminChatMessage => {
    if (
      !isRecord(value) ||
      typeof value.id_mensaje !== 'number' ||
      !Number.isSafeInteger(value.id_mensaje) ||
      typeof value.id_super !== 'string' ||
      typeof value.nombre_supermercado !== 'string' ||
      typeof value.nombre_usuario !== 'string' ||
      typeof value.mensaje !== 'string' ||
      typeof value.creado_en !== 'string'
    ) {
      throw new Error('Un mensaje para moderación llegó con datos no válidos.');
    }
    return {
      id: value.id_mensaje,
      supermarketId: value.id_super,
      supermarketName: value.nombre_supermercado,
      author: value.nombre_usuario,
      text: value.mensaje,
      createdAt: value.creado_en,
    };
  });
}

export async function deleteAdminChatMessage(messageId: number) {
  const { error } = await getSupabaseClient().rpc('eliminar_mensaje_admin', {
    p_id_mensaje: messageId,
  });
  if (error) {
    throw new Error(`No se pudo eliminar el mensaje. ${error.message}`);
  }
}

export async function getAdminSupermarkets(): Promise<AdminSupermarket[]> {
  const { data, error } = await getSupabaseClient().rpc('obtener_catalogo_admin');
  if (error) {
    throw new Error(`No se pudo cargar el catálogo de supermercados. ${error.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error('Supabase devolvió un catálogo no válido.');
  }

  return data.map((value): AdminSupermarket => {
    if (
      !isRecord(value) ||
      typeof value.id_super !== 'string' ||
      typeof value.nombre !== 'string' ||
      typeof value.cadena !== 'string' ||
      typeof value.activo !== 'boolean' ||
      (value.osm_ref !== null && typeof value.osm_ref !== 'string')
    ) {
      throw new Error('Un supermercado del catálogo llegó con datos no válidos.');
    }
    const address = [value.calle, value.comuna, value.region]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join(', ');
    return {
      id: value.id_super,
      name: value.nombre,
      chain: value.cadena,
      address,
      osmRef: value.osm_ref,
      isActive: value.activo,
    };
  });
}

export async function setAdminSupermarketVisibility(supermarketId: string, isActive: boolean) {
  const { error } = await getSupabaseClient().rpc('actualizar_estado_catalogo_admin', {
    p_id_super: supermarketId,
    p_activo: isActive,
  });
  if (error) {
    throw new Error(`No se pudo actualizar el supermercado. ${error.message}`);
  }
}

export async function permanentlyDeleteAdminSupermarket(supermarketId: string) {
  const { error } = await getSupabaseClient().rpc('eliminar_supermercado_admin', {
    p_id_super: supermarketId,
  });
  if (error) {
    throw new Error(`No se pudo eliminar definitivamente el supermercado. ${error.message}`);
  }
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await getSupabaseClient().rpc('obtener_usuarios_admin');
  if (error) {
    throw new Error(`No se pudieron cargar las cuentas de usuario. ${error.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error('Supabase devolvió una lista de usuarios no válida.');
  }

  return data.map((value): AdminUser => {
    if (
      !isRecord(value) ||
      typeof value.id_usuario !== 'string' ||
      typeof value.nombre !== 'string' ||
      typeof value.correo !== 'string' ||
      typeof value.rol !== 'string' ||
      typeof value.cuenta_baneada !== 'boolean' ||
      typeof value.chat_baneado !== 'boolean'
    ) {
      throw new Error('Una cuenta de usuario llegó con datos no válidos.');
    }
    return {
      id: value.id_usuario,
      name: value.nombre,
      email: value.correo,
      role: value.rol,
      isBanned: value.cuenta_baneada,
      isChatBanned: value.chat_baneado,
    };
  });
}

export async function updateAdminUserSanctions(
  userId: string,
  isBanned: boolean,
  isChatBanned: boolean
) {
  const { error } = await getSupabaseClient().rpc('actualizar_sancion_usuario_admin', {
    p_id_usuario: userId,
    p_cuenta_baneada: isBanned,
    p_chat_baneado: isChatBanned,
  });
  if (error) {
    throw new Error(`No se pudo actualizar la cuenta del usuario. ${error.message}`);
  }
}

export async function getAdminChatReports(): Promise<AdminChatReport[]> {
  const { data, error } = await getSupabaseClient().rpc('obtener_reportes_chat_admin');
  if (error) {
    throw new Error(`No se pudieron cargar los reportes del chat. ${error.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error('Supabase devolvió una lista de reportes no válida.');
  }

  return data.map((value): AdminChatReport => {
    if (
      !isRecord(value) ||
      typeof value.id_reportado !== 'string' ||
      typeof value.nombre_reportado !== 'string' ||
      typeof value.correo_reportado !== 'string' ||
      typeof value.cantidad_reportantes !== 'number' ||
      typeof value.id_reporte !== 'number' ||
      typeof value.nombre_reportante !== 'string' ||
      typeof value.nombre_supermercado !== 'string' ||
      typeof value.mensaje_reportado !== 'string' ||
      typeof value.reportado_en !== 'string'
    ) {
      throw new Error('Un reporte del chat llegó con datos no válidos.');
    }
    return {
      reportedUserId: value.id_reportado,
      reportedUserName: value.nombre_reportado,
      reportedUserEmail: value.correo_reportado,
      reporterCount: value.cantidad_reportantes,
      id: value.id_reporte,
      reporterName: value.nombre_reportante,
      supermarketName: value.nombre_supermercado,
      message: value.mensaje_reportado,
      createdAt: value.reportado_en,
    };
  });
}

export async function getAdminReportedUserMessages(
  userId: string
): Promise<AdminReportedMessage[]> {
  const { data, error } = await getSupabaseClient().rpc('obtener_mensajes_reportado_admin', {
    p_id_usuario: userId,
  });
  if (error) {
    throw new Error(`No se pudieron cargar los mensajes del usuario reportado. ${error.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error('Supabase devolvió una lista de mensajes reportados no válida.');
  }

  return data.map((value): AdminReportedMessage => {
    if (
      !isRecord(value) ||
      typeof value.id_mensaje !== 'number' ||
      typeof value.nombre_supermercado !== 'string' ||
      typeof value.mensaje !== 'string' ||
      typeof value.creado_en !== 'string'
    ) {
      throw new Error('Un mensaje del usuario reportado llegó con datos no válidos.');
    }
    return {
      id: value.id_mensaje,
      supermarketName: value.nombre_supermercado,
      message: value.mensaje,
      createdAt: value.creado_en,
    };
  });
}

export async function deleteAllAdminReportedUserMessages(userId: string): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc('eliminar_mensajes_reportado_admin', {
    p_id_usuario: userId,
  });
  if (error) {
    throw new Error(`No se pudieron eliminar los mensajes del usuario reportado. ${error.message}`);
  }
  if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) {
    throw new Error('Supabase devolvió una cantidad de mensajes eliminados no válida.');
  }
  return data;
}
