import { setGlobalOptions } from "firebase-functions";
import { REGION } from "./config";

setGlobalOptions({ region: REGION, maxInstances: 5 });

export {
  appInfo,
  checkServiceability,
  getRate,
  createShipment,
  createReturn,
  bulkCreateShipments,
  refreshShipment,
  updateShipment,
  ndrAction,
  cancelShipment,
  getLabel,
  getPod,
  getWebhookInfo,
  recountStats,
} from "./callables";
export { shadowfaxWebhook } from "./webhook";
export { syncActiveShipments } from "./sync";
