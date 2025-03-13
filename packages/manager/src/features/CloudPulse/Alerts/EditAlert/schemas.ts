import { editAlertDefinitionSchema } from '@linode/validation';
import { array, mixed, object, string } from 'yup';

import type { AlertSeverityType } from '@linode/api-v4';

export const EditAlertDefinitionSchema = editAlertDefinitionSchema.concat(
  object({
    serviceType: string().oneOf(['linode', 'dbaas']).optional(),
    severity: mixed<AlertSeverityType>().optional(),
    tags: array().of(string().required()).optional(),
  })
);
