import { USER_ENV_KEYS } from "@/lib/desktop/envEntry";
import { apiKeyRouteHandlers } from "@/lib/desktop/apiKeyRoute";

export const { GET, POST } = apiKeyRouteHandlers(USER_ENV_KEYS.openRouter);
