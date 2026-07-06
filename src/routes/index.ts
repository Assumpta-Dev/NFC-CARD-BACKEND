// ===========================================================
// ROUTE AGGREGATOR
// ===========================================================
// Feature modules own their controller + routes.
// Mount paths are defined in src/index.ts.

export { authRouter } from "../modules/auth/auth.routes";
export { cardRouter } from "../modules/card/card.routes";
export { publicCardRouter } from "../modules/card/public-card.routes";
export { profileRouter } from "../modules/profile/profile.routes";
export { userRouter } from "../modules/user/user.routes";
export { adminRouter } from "../modules/admin/admin.routes";
export { businessRouter } from "../modules/business/business.routes";
export { menuRouter } from "../modules/menu/menu.routes";
export { paymentRouter } from "../modules/payment/payment.routes";
export { orderRouter } from "../modules/order/order.routes";
