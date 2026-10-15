import {withApiUser} from '@/features/auth/api';
import {getSettingsHandler,putSettingsHandler} from '@/features/settings/handlers';

// GET/PUT /api/settings: the organization's match strictness (src/features/settings/handlers.ts).
export const GET=withApiUser(getSettingsHandler);
export const PUT=withApiUser(putSettingsHandler);
