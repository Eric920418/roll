import { cache } from "react";
import { getSetting } from "./content";
import { resolveRollonAsset, rollonSettingKey, type RollonCmsPage } from "./rollon-v10";
import { logSecurityError, publicErrorMessage } from "@/lib/security/log";

export const getRollonAssets = cache(async (page: RollonCmsPage) => {
  let values: Record<string, unknown> = {};
  let error = "";
  try { values = await getSetting(rollonSettingKey(page)); }
  catch (cause) { error = publicErrorMessage(logSecurityError(`rollon.assets.${page}`, cause)); }
  return { image: (src: string) => resolveRollonAsset(page, values, src), error };
});
