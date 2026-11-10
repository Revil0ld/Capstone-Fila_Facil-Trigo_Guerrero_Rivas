import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { updateCustomerPresence } from '@/data/customer-presence';

export const CUSTOMER_PRESENCE_TASK = 'customer-presence-location';

type LocationTaskData = { locations: Location.LocationObject[] };

TaskManager.defineTask<LocationTaskData>(
  CUSTOMER_PRESENCE_TASK,
  async ({ data, error }) => {
    if (error) {
      console.error('Falló la tarea de ubicación para el aforo automático.', error);
      return;
    }

    const location = data?.locations.at(-1);
    if (!location) {
      return;
    }

    try {
      await updateCustomerPresence(location);
    } catch (presenceError) {
      console.error('No se pudo enviar la presencia para calcular el aforo.', presenceError);
    }
  }
);
